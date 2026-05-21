import { prisma } from '../../../common/database';
import { setTenantContext } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { passwordService } from './password.service';
import { tokenService } from './token.service';
import { mfaService } from './mfa.service';
import { ipPolicyService } from './ip-policy.service';
import { auditService, AuthEventType } from './audit.service';
import { deviceService } from './device.service';
import { permissionResolver } from '../../users/helpers/permission-resolver';
import type { AuthTokens, MfaChallengeResponse, RequestContext } from '../interfaces/auth.interfaces';
import crypto from 'crypto';

export class AuthService {
  /**
   * Full login flow:
   * IP check → credential validation → lockout check → MFA challenge or token issuance
   */
  async login(
    dto: { companyCode: string; email: string; password: string; rememberMe?: boolean; deviceFingerprint?: string; deviceName?: string },
    context: RequestContext,
  ): Promise<{ tokens?: AuthTokens; mfa?: MfaChallengeResponse; user?: Record<string, unknown> }> {
    const email = dto.email.toLowerCase().trim();
    const companyCode = dto.companyCode.toUpperCase().trim();

    // Resolve company by code (companies table is NOT RLS-protected)
    const company = await prisma.company.findUnique({
      where: { code: companyCode },
    });
    if (!company || !company.isActive) {
      await passwordService.dummyCompare();
      await auditService.log({
        email,
        eventType: AuthEventType.LOGIN_FAILURE,
        status: 'failure',
        context,
        metadata: { reason: 'invalid_company_code' },
      });
      throw AppError.invalidCredentials();
    }

    // Set tenant context so RLS allows the user query
    await setTenantContext(company.id);

    // Find user scoped to this company
    const user = await prisma.user.findFirst({
      where: { email, companyId: company.id, deletedAt: null },
      include: { company: true },
    });

    if (!user) {
      // Timing attack prevention
      await passwordService.dummyCompare();
      await auditService.log({
        email,
        companyId: company.id,
        eventType: AuthEventType.LOGIN_FAILURE,
        status: 'failure',
        context,
        metadata: { reason: 'user_not_found' },
      });
      throw AppError.invalidCredentials();
    }

    // Check IP policy
    const ipAllowed = await ipPolicyService.checkIp(user.companyId, user.id, context.ipAddress);
    if (!ipAllowed) {
      await auditService.log({
        userId: user.id,
        email,
        companyId: user.companyId,
        eventType: AuthEventType.IP_BLOCKED,
        status: 'failure',
        context,
      });
      throw AppError.ipBlocked();
    }

    // Check if account is active
    if (!user.isActive) {
      await auditService.log({
        userId: user.id,
        email,
        companyId: user.companyId,
        eventType: AuthEventType.LOGIN_FAILURE,
        status: 'failure',
        context,
        metadata: { reason: 'account_inactive' },
      });
      throw AppError.accountInactive();
    }

    // Check account lockout
    if (user.isLocked) {
      const policy = await prisma.passwordPolicy.findUnique({
        where: { companyId: user.companyId },
      });
      const lockoutMins = policy?.lockoutDurationMins ?? 30;
      const unlockAt = new Date((user.lockedAt?.getTime() ?? 0) + lockoutMins * 60 * 1000);

      if (new Date() < unlockAt) {
        throw AppError.accountLocked(unlockAt);
      }

      // Auto-unlock: lockout period has expired
      await prisma.user.update({
        where: { id: user.id },
        data: { isLocked: false, lockedAt: null, lockedReason: null, failedAttempts: 0 },
      });
      await auditService.log({
        userId: user.id,
        email,
        companyId: user.companyId,
        eventType: AuthEventType.ACCOUNT_UNLOCKED,
        status: 'success',
        context,
        metadata: { reason: 'lockout_expired' },
      });
    }

    // Verify password
    if (!user.passwordHash) {
      throw AppError.invalidCredentials();
    }

    const passwordValid = await passwordService.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      const newAttempts = user.failedAttempts + 1;
      const policy = await prisma.passwordPolicy.findUnique({
        where: { companyId: user.companyId },
      });
      const maxAttempts = policy?.maxFailedAttempts ?? 5;

      if (newAttempts >= maxAttempts) {
        // Lock account
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: newAttempts,
            isLocked: true,
            lockedAt: new Date(),
            lockedReason: 'Too many failed login attempts',
          },
        });
        await auditService.log({
          userId: user.id,
          email,
          companyId: user.companyId,
          eventType: AuthEventType.ACCOUNT_LOCKED,
          status: 'failure',
          context,
        });
        const lockoutMins = policy?.lockoutDurationMins ?? 30;
        throw AppError.accountLocked(new Date(Date.now() + lockoutMins * 60 * 1000));
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: newAttempts },
        });
      }

      await auditService.log({
        userId: user.id,
        email,
        companyId: user.companyId,
        eventType: AuthEventType.LOGIN_FAILURE,
        status: 'failure',
        context,
        metadata: { failedAttempts: newAttempts, maxAttempts },
      });
      throw AppError.invalidCredentials();
    }

    // Reset failed attempts on successful password check
    if (user.failedAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0 },
      });
    }

    // Check MFA
    if (user.mfaEnabled) {
      const mfa = tokenService.issueMfaToken(user.id, user.email, user.companyId);
      return { mfa };
    }

    // Register/update device
    let deviceId: string | undefined;
    if (dto.deviceFingerprint) {
      const device = await deviceService.upsertDevice(user.id, {
        fingerprint: dto.deviceFingerprint,
        deviceName: dto.deviceName,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      });
      deviceId = device.id;
    }

    // Resolve roles and permissions
    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { name: true } } },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const permissions = await permissionResolver.getEffectivePermissions(user.id);

    // Issue tokens
    const tokens = await tokenService.issueTokens(
      { id: user.id, email: user.email, companyId: user.companyId },
      { deviceId, rememberMe: dto.rememberMe, roles, permissions },
    );

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await auditService.log({
      userId: user.id,
      email,
      companyId: user.companyId,
      eventType: AuthEventType.LOGIN_SUCCESS,
      status: 'success',
      context,
      deviceId,
    });

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        companyId: user.companyId,
        companyCode: company.code,
        companyName: company.name,
        roles,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Complete MFA login step
   */
  async completeMfaLogin(
    mfaToken: string,
    code: string,
    context: RequestContext,
  ): Promise<{ tokens: AuthTokens; user: Record<string, unknown> }> {
    const { sub: userId, companyId: mfaCompanyId } = tokenService.verifyMfaToken(mfaToken);

    // Set tenant context so RLS allows user lookup
    await setTenantContext(mfaCompanyId);

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
    if (!user) throw AppError.invalidMfaCode();

    const valid = await mfaService.verifyCode(
      { id: user.id, mfaSecret: user.mfaSecret, mfaBackupCodes: user.mfaBackupCodes },
      code,
    );

    if (!valid) {
      await auditService.log({
        userId: user.id,
        email: user.email,
        companyId: user.companyId,
        eventType: AuthEventType.MFA_VERIFY_FAILURE,
        status: 'failure',
        context,
      });
      throw AppError.invalidMfaCode();
    }

    await auditService.log({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
      eventType: AuthEventType.MFA_VERIFY_SUCCESS,
      status: 'success',
      context,
    });

    // Resolve roles and permissions
    const userRoles2 = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { name: true } } },
    });
    const roles = userRoles2.map((ur) => ur.role.name);
    const permissions = await permissionResolver.getEffectivePermissions(user.id);

    const tokens = await tokenService.issueTokens(
      { id: user.id, email: user.email, companyId: user.companyId },
      { roles, permissions },
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        companyId: user.companyId,
        companyCode: user.company.code,
        companyName: user.company.name,
        roles,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Refresh token rotation
   */
  async refreshTokens(
    refreshToken: string,
    userId: string,
    companyId: string,
    context: RequestContext,
  ): Promise<AuthTokens> {
    const { family, deviceId } = await tokenService.validateRefreshToken(refreshToken, userId);

    // Revoke old token
    await tokenService.revokeRefreshToken(refreshToken, userId, 'rotated');

    // Set tenant context so RLS allows user lookup
    await setTenantContext(companyId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw AppError.tokenInvalid();

    // Resolve roles and permissions
    const userRoles3 = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { name: true } } },
    });
    const roles = userRoles3.map((ur) => ur.role.name);
    const permissions = await permissionResolver.getEffectivePermissions(user.id);

    // Issue new pair
    const tokens = await tokenService.issueTokens(
      { id: user.id, email: user.email, companyId: user.companyId },
      { deviceId: deviceId ?? undefined, roles, permissions },
    );

    await auditService.log({
      userId: user.id,
      companyId: user.companyId,
      eventType: AuthEventType.TOKEN_REFRESH,
      status: 'success',
      context,
    });

    return tokens;
  }

  /**
   * Logout — revoke refresh token, optionally all sessions
   */
  async logout(
    userId: string,
    refreshToken: string | undefined,
    allDevices: boolean,
    context: RequestContext,
  ): Promise<void> {
    if (allDevices) {
      await tokenService.revokeAllUserTokens(userId);
    } else if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken, userId, 'logout');
    }

    await auditService.log({
      userId,
      eventType: AuthEventType.LOGOUT,
      status: 'success',
      context,
      metadata: { allDevices },
    });
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw AppError.invalidCredentials();

    const valid = await passwordService.compare(currentPassword, user.passwordHash);
    if (!valid) throw AppError.invalidCredentials();

    await passwordService.validateNewPassword(newPassword, userId, user.companyId);

    const hash = await passwordService.hash(newPassword);
    await passwordService.addToHistory(userId, user.passwordHash);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    // Revoke all sessions except current
    await tokenService.revokeAllUserTokens(userId);

    await auditService.log({
      userId,
      companyId: user.companyId,
      eventType: AuthEventType.PASSWORD_CHANGE,
      status: 'success',
      context,
    });
  }

  /**
   * Request password reset (always returns success to prevent email enumeration)
   */
  async requestPasswordReset(email: string, context: RequestContext): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
          ipAddress: context.ipAddress,
        },
      });

      // TODO: Send email with reset link containing rawToken
      logger.info(`Password reset token for ${email}: ${rawToken}`);

      await auditService.log({
        userId: user.id,
        email,
        companyId: user.companyId,
        eventType: AuthEventType.PASSWORD_RESET_REQUEST,
        status: 'success',
        context,
      });
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string, context: RequestContext): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Invalid or expired reset token');
    }

    await passwordService.validateNewPassword(newPassword, resetToken.userId, resetToken.user.companyId);

    const hash = await passwordService.hash(newPassword);
    if (resetToken.user.passwordHash) {
      await passwordService.addToHistory(resetToken.userId, resetToken.user.passwordHash);
    }

    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false },
    });

    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    await tokenService.revokeAllUserTokens(resetToken.userId);

    await auditService.log({
      userId: resetToken.userId,
      companyId: resetToken.user.companyId,
      eventType: AuthEventType.PASSWORD_RESET_COMPLETE,
      status: 'success',
      context,
    });
  }
}

export const authService = new AuthService();
