import crypto from 'crypto';
import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { tokenService } from './token.service';
import { auditService, AuthEventType } from './audit.service';
import { permissionResolver } from '../../users/helpers/permission-resolver';
import type { AuthTokens, RequestContext } from '../interfaces/auth.interfaces';

/**
 * SSO Service — Future-ready scaffolding for OIDC/SAML SSO.
 *
 * Supports:
 *  - OIDC providers: Azure AD, Okta, Google Workspace, generic OIDC
 *  - SAML providers: placeholder for future
 *  - JIT (Just-In-Time) user provisioning
 *  - IdP identity linking to PMS users
 *
 * To activate:
 *  1. Create an SsoConfig via the admin API
 *  2. Frontend redirects to GET /auth/sso/initiate?provider=azure_ad
 *  3. After IdP login, browser comes back to GET /auth/sso/callback?code=...&state=...
 *  4. This service exchanges the code for tokens, finds/creates a user, issues PMS JWTs
 */
export class SsoService {
  /**
   * Generate the authorization URL to redirect the user to the IdP.
   * Returns a URL and a state token (CSRF protection).
   */
  async initiateLogin(
    companyId: string,
    provider: string,
    redirectUri: string,
  ): Promise<{ authorizationUrl: string; state: string }> {
    const config = await this.getEnabledConfig(companyId, provider);

    if (config.protocol !== 'oidc') {
      throw new AppError(501, 'SSO_SAML_NOT_IMPLEMENTED', 'SAML SSO is not yet implemented');
    }

    if (!config.clientId || !config.authorizationUrl) {
      throw new AppError(400, 'SSO_NOT_CONFIGURED', `SSO provider "${provider}" is not fully configured`);
    }

    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Build OIDC authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: config.scopes || 'openid profile email',
      state,
      // Optionally: nonce, prompt, etc.
    });

    const authUrl = `${config.authorizationUrl}?${params.toString()}`;

    logger.info(`SSO initiate: provider=${provider} company=${companyId}`);
    return { authorizationUrl: authUrl, state };
  }

  /**
   * Handle the IdP callback after successful authentication.
   * Exchanges authorization code for tokens, resolves or creates a user.
   */
  async handleCallback(
    companyId: string,
    provider: string,
    code: string,
    _state: string,
    redirectUri: string,
    context: RequestContext,
  ): Promise<{ tokens: AuthTokens; user: Record<string, unknown>; isNewUser: boolean }> {
    const config = await this.getEnabledConfig(companyId, provider);

    if (config.protocol !== 'oidc') {
      throw new AppError(501, 'SSO_SAML_NOT_IMPLEMENTED', 'SAML SSO is not yet implemented');
    }

    // Step 1: Exchange authorization code for tokens
    const idpTokens = await this.exchangeCodeForTokens(config, code, redirectUri);

    // Step 2: Fetch user info from IdP
    const idpUser = await this.fetchUserInfo(config, idpTokens.accessToken);

    // Step 3: Check domain restriction
    if (config.domainRestriction && idpUser.email) {
      const domain = idpUser.email.split('@')[1];
      if (domain !== config.domainRestriction) {
        throw new AppError(403, 'SSO_DOMAIN_MISMATCH', `Email domain "${domain}" is not allowed for this SSO provider`);
      }
    }

    // Step 4: Find or create the PMS user
    const { user, isNewUser } = await this.resolveUser(config, idpUser, companyId);

    // Step 5: Update the SSO identity record
    await this.upsertSsoIdentity(config.id, user.id, idpUser);

    // Step 6: Issue PMS tokens
    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { name: true } } },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const permissions = await permissionResolver.getEffectivePermissions(user.id);

    const tokens = await tokenService.issueTokens(
      { id: user.id, email: user.email, companyId: user.companyId },
      { roles, permissions },
    );

    // Step 7: Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Step 8: Audit log
    await auditService.log({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
      eventType: AuthEventType.SSO_LOGIN,
      status: 'success',
      context,
      metadata: { provider, isNewUser, externalId: idpUser.sub },
    });

    logger.info(`SSO login success: user=${user.id} provider=${provider} new=${isNewUser}`);

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        companyId: user.companyId,
        roles,
        permissions,
        mustChangePassword: false,
      },
      isNewUser,
    };
  }

  // ─── Admin CRUD for SSO Configs ───────────────

  async getConfigs(companyId: string) {
    return prisma.ssoConfig.findMany({
      where: { companyId },
      select: {
        id: true, name: true, provider: true, protocol: true,
        isEnabled: true, isDefault: true, domainRestriction: true,
        autoProvision: true, scopes: true,
        createdAt: true, updatedAt: true,
        // Exclude secrets
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConfig(id: string, companyId: string) {
    const config = await prisma.ssoConfig.findFirst({
      where: { id, companyId },
    });
    if (!config) throw new AppError(404, 'SSO_CONFIG_NOT_FOUND', 'SSO config not found');

    // Mask the client secret
    return {
      ...config,
      clientSecret: config.clientSecret ? '••••••••' : null,
    };
  }

  async createConfig(companyId: string, data: {
    name: string;
    provider: string;
    protocol?: string;
    clientId?: string;
    clientSecret?: string;
    issuerUrl?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    scopes?: string;
    autoProvision?: boolean;
    defaultRoleId?: string;
    domainRestriction?: string;
    attributeMapping?: Record<string, string>;
  }) {
    return prisma.ssoConfig.create({
      data: {
        companyId,
        name: data.name,
        provider: data.provider,
        protocol: data.protocol || 'oidc',
        clientId: data.clientId,
        clientSecret: data.clientSecret, // TODO: encrypt at rest
        issuerUrl: data.issuerUrl,
        authorizationUrl: data.authorizationUrl,
        tokenUrl: data.tokenUrl,
        userInfoUrl: data.userInfoUrl,
        scopes: data.scopes || 'openid profile email',
        autoProvision: data.autoProvision ?? false,
        defaultRoleId: data.defaultRoleId,
        domainRestriction: data.domainRestriction,
        attributeMapping: data.attributeMapping || {},
      },
    });
  }

  async updateConfig(id: string, companyId: string, data: Record<string, unknown>) {
    const existing = await prisma.ssoConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw new AppError(404, 'SSO_CONFIG_NOT_FOUND', 'SSO config not found');

    // Don't overwrite secret if masked value is sent
    if (data.clientSecret === '••••••••') delete data.clientSecret;

    return prisma.ssoConfig.update({ where: { id }, data });
  }

  async deleteConfig(id: string, companyId: string) {
    const existing = await prisma.ssoConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw new AppError(404, 'SSO_CONFIG_NOT_FOUND', 'SSO config not found');

    await prisma.ssoConfig.delete({ where: { id } });
  }

  async toggleConfig(id: string, companyId: string, enabled: boolean) {
    const existing = await prisma.ssoConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw new AppError(404, 'SSO_CONFIG_NOT_FOUND', 'SSO config not found');

    return prisma.ssoConfig.update({ where: { id }, data: { isEnabled: enabled } });
  }

  // ─── Private Helpers ──────────────────────────

  private async getEnabledConfig(companyId: string, provider: string) {
    const config = await prisma.ssoConfig.findFirst({
      where: { companyId, provider, isEnabled: true },
    });
    if (!config) {
      throw new AppError(404, 'SSO_PROVIDER_NOT_FOUND', `No enabled SSO provider "${provider}" found`);
    }
    return config;
  }

  /**
   * Exchange an OIDC authorization code for access/id tokens.
   * This is the standard OIDC token endpoint call.
   */
  private async exchangeCodeForTokens(
    config: { clientId: string | null; clientSecret: string | null; tokenUrl: string | null },
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; idToken?: string }> {
    if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
      throw new AppError(400, 'SSO_NOT_CONFIGURED', 'SSO token endpoint not configured');
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`SSO token exchange failed: ${response.status} ${body}`);
      throw new AppError(502, 'SSO_TOKEN_EXCHANGE_FAILED', 'Failed to exchange SSO code for tokens');
    }

    const data = await response.json() as { access_token: string; id_token?: string };
    return { accessToken: data.access_token, idToken: data.id_token };
  }

  /**
   * Fetch user profile from the IdP's userinfo endpoint.
   */
  private async fetchUserInfo(
    config: { userInfoUrl: string | null },
    accessToken: string,
  ): Promise<{ sub: string; email?: string; name?: string; given_name?: string; family_name?: string }> {
    if (!config.userInfoUrl) {
      throw new AppError(400, 'SSO_NOT_CONFIGURED', 'SSO userinfo endpoint not configured');
    }

    const response = await fetch(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new AppError(502, 'SSO_USERINFO_FAILED', 'Failed to fetch user info from IdP');
    }

    return response.json() as Promise<{ sub: string; email?: string; name?: string; given_name?: string; family_name?: string }>;
  }

  /**
   * Find an existing PMS user or JIT-provision a new one.
   */
  private async resolveUser(
    config: { id: string; companyId: string; autoProvision: boolean; defaultRoleId: string | null; attributeMapping: unknown },
    idpUser: { sub: string; email?: string; name?: string; given_name?: string; family_name?: string },
    companyId: string,
  ): Promise<{ user: { id: string; email: string; companyId: string }; isNewUser: boolean }> {
    // Try to find by SSO identity first
    const existing = await prisma.ssoIdentity.findUnique({
      where: { uq_sso_identity: { ssoConfigId: config.id, externalId: idpUser.sub } },
      include: { user: true },
    });

    if (existing) {
      if (!existing.user.isActive) {
        throw new AppError(403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
      }
      return { user: existing.user, isNewUser: false };
    }

    // Try to match by email
    if (idpUser.email) {
      const userByEmail = await prisma.user.findFirst({
        where: { email: idpUser.email.toLowerCase(), companyId, deletedAt: null },
      });
      if (userByEmail) {
        return { user: userByEmail, isNewUser: false };
      }
    }

    // JIT provisioning
    if (!config.autoProvision) {
      throw new AppError(403, 'SSO_NO_ACCOUNT', 'No PMS account linked. Contact your administrator.');
    }

    if (!idpUser.email) {
      throw new AppError(400, 'SSO_NO_EMAIL', 'IdP did not return an email address');
    }

    logger.info(`SSO JIT provisioning: email=${idpUser.email} provider=${config.id}`);

    const newUser = await prisma.user.create({
      data: {
        companyId,
        email: idpUser.email.toLowerCase(),
        emailVerified: true, // Verified by IdP
        isActive: true,
        passwordHash: null, // SSO-only user, no local password
      },
    });

    // Create profile
    await prisma.userProfile.create({
      data: {
        userId: newUser.id,
        firstName: idpUser.given_name || idpUser.name?.split(' ')[0] || 'User',
        lastName: idpUser.family_name || idpUser.name?.split(' ').slice(1).join(' ') || '',
      },
    });

    // Assign default role if configured
    if (config.defaultRoleId) {
      await prisma.userRole.create({
        data: { userId: newUser.id, roleId: config.defaultRoleId },
      });
    }

    return { user: newUser, isNewUser: true };
  }

  /**
   * Create or update the SSO identity link.
   */
  private async upsertSsoIdentity(
    ssoConfigId: string,
    userId: string,
    idpUser: { sub: string; email?: string; name?: string; [key: string]: unknown },
  ) {
    await prisma.ssoIdentity.upsert({
      where: { uq_sso_identity: { ssoConfigId, externalId: idpUser.sub } },
      create: {
        userId,
        ssoConfigId,
        externalId: idpUser.sub,
        externalEmail: idpUser.email,
        externalUsername: idpUser.name,
        rawAttributes: JSON.parse(JSON.stringify(idpUser)),
        lastLoginAt: new Date(),
      },
      update: {
        externalEmail: idpUser.email,
        externalUsername: idpUser.name,
        rawAttributes: JSON.parse(JSON.stringify(idpUser)),
        lastLoginAt: new Date(),
      },
    });
  }
}

export const ssoService = new SsoService();
