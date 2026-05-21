import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { authService } from './services/auth.service';
import { mfaService } from './services/mfa.service';
import { deviceService } from './services/device.service';
import { auditService, AuthEventType } from './services/audit.service';
import { ipPolicyService } from './services/ip-policy.service';
import { prisma } from '../../common/database';
import { setTenantContext } from '../../common/database';
import type { RequestContext } from './interfaces/auth.interfaces';

export const authRouter = Router();

function getContext(req: Request): RequestContext {
  return {
    ipAddress: req.requestContext?.ipAddress || '0.0.0.0',
    userAgent: req.requestContext?.userAgent || 'unknown',
  };
}

// ─── Public Routes ─────────────────────────────

// Company info for login page — returns count and auto-fills if single company
authRouter.get('/company/info', asyncHandler(async (req: Request, res: Response) => {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { code: true, name: true, logoUrl: true },
    orderBy: { name: 'asc' },
  });
  res.json({
    success: true,
    data: {
      count: companies.length,
      // If single company, auto-fill for the user
      singleCompany: companies.length === 1 ? companies[0] : null,
    },
  });
}));

// Validate company code (pre-login check, public)
authRouter.get('/company/validate', asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    res.json({ success: true, data: null });
    return;
  }
  const company = await prisma.company.findUnique({
    where: { code: code.toUpperCase().trim() },
    select: { name: true, logoUrl: true },
  });
  res.json({ success: true, data: company ? { name: company.name, logoUrl: company.logoUrl } : null });
}));

authRouter.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, getContext(req));

  if (result.mfa) {
    res.json({ success: true, data: result.mfa });
    return;
  }

  // Set refresh token as httpOnly cookie
  if (result.tokens) {
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: (req.body.rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.json({
      success: true,
      data: {
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
        tokenType: result.tokens.tokenType,
        user: result.user,
      },
    });
  }
}));

authRouter.post('/mfa/verify', asyncHandler(async (req: Request, res: Response) => {
  const { mfaToken, code } = req.body;
  const result = await authService.completeMfaLogin(mfaToken, code, getContext(req));

  res.cookie('refreshToken', result.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });

  res.json({
    success: true,
    data: {
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
      tokenType: result.tokens.tokenType,
      user: result.user,
    },
  });
}));

authRouter.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  if (!refreshToken) {
    res.status(401).json({ success: false, errors: [{ code: 'NO_REFRESH_TOKEN', message: 'No refresh token' }] });
    return;
  }

  // We need to decode the token to get userId and companyId — peek at any existing access token
  // or decode from the refresh token family
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  let companyId: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.decode(authHeader.slice(7)) as { sub?: string; companyId?: string } | null;
      userId = decoded?.sub;
      companyId = decoded?.companyId;
    } catch { /* ignore */ }
  }

  if (!userId) {
    // Try to find user from refresh token hash (refresh_tokens is NOT RLS-protected)
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const dbToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, companyId: true } } },
    });
    userId = dbToken?.userId;
    companyId = dbToken?.user?.companyId;
  }

  if (!userId || !companyId) {
    res.status(401).json({ success: false, errors: [{ code: 'TOKEN_INVALID', message: 'Invalid token' }] });
    return;
  }

  const tokens = await authService.refreshTokens(refreshToken, userId, companyId, getContext(req));

  // Set tenant context so RLS allows user/role queries below
  await setTenantContext(companyId);

  // Fetch user data to include in response (needed by frontend to restore auth state)
  const { permissionResolver } = await import('../users/helpers/permission-resolver');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: { select: { code: true, name: true } } },
  });
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { name: true } } },
  });
  const roles = userRoles.map((ur) => ur.role.name);
  const permissions = await permissionResolver.getEffectivePermissions(userId);

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });

  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType,
      user: user ? {
        id: user.id,
        email: user.email,
        companyId: user.companyId,
        companyCode: user.company.code,
        companyName: user.company.name,
        roles,
        permissions,
        mustChangePassword: user.mustChangePassword,
      } : undefined,
    },
  });
}));

authRouter.post('/password/reset-request', asyncHandler(async (req: Request, res: Response) => {
  await authService.requestPasswordReset(req.body.email, getContext(req));
  // Always return success to prevent email enumeration
  res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent.' } });
}));

authRouter.post('/password/reset', asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) {
    res.status(422).json({ success: false, errors: [{ code: 'PASSWORD_MISMATCH', message: 'Passwords do not match' }] });
    return;
  }
  await authService.resetPassword(token, newPassword, getContext(req));
  res.json({ success: true });
}));

// ─── Authenticated Routes ──────────────────────

authRouter.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;
  await authService.logout(req.user!.sub, refreshToken, req.body.allDevices || false, getContext(req));
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  res.status(204).send();
}));

authRouter.post('/password/change', asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) {
    res.status(422).json({ success: false, errors: [{ code: 'PASSWORD_MISMATCH', message: 'Passwords do not match' }] });
    return;
  }
  await authService.changePassword(req.user!.sub, currentPassword, newPassword, getContext(req));
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  res.json({ success: true });
}));

// ─── MFA Management ────────────────────────────

authRouter.post('/mfa/setup', asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) { res.status(404).json({ success: false }); return; }
  const setup = await mfaService.generateMfaSetup({ id: user.id, email: user.email });
  res.json({ success: true, data: setup });
}));

authRouter.post('/mfa/enable', asyncHandler(async (req: Request, res: Response) => {
  const { secret, code, backupCodes } = req.body;
  await mfaService.enableMfa(req.user!.sub, secret, code, backupCodes);
  await auditService.log({
    userId: req.user!.sub,
    companyId: req.user!.companyId,
    eventType: AuthEventType.MFA_ENABLED,
    status: 'success',
    context: getContext(req),
  });
  res.json({ success: true, data: { mfaEnabled: true } });
}));

authRouter.post('/mfa/disable', asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) { res.status(404).json({ success: false }); return; }
  await mfaService.disableMfa(req.user!.sub, user.mfaSecret, req.body.code);
  await auditService.log({
    userId: req.user!.sub,
    companyId: req.user!.companyId,
    eventType: AuthEventType.MFA_DISABLED,
    status: 'success',
    context: getContext(req),
  });
  res.json({ success: true, data: { mfaEnabled: false } });
}));

// ─── Devices ───────────────────────────────────

authRouter.get('/devices', asyncHandler(async (req: Request, res: Response) => {
  const devices = await deviceService.getUserDevices(req.user!.sub);
  res.json({ success: true, data: devices });
}));

authRouter.delete('/devices/:deviceId', asyncHandler(async (req: Request, res: Response) => {
  await deviceService.revokeDevice(req.params.deviceId, req.user!.sub);
  await auditService.log({
    userId: req.user!.sub,
    companyId: req.user!.companyId,
    eventType: AuthEventType.DEVICE_REVOKED,
    status: 'success',
    context: getContext(req),
  });
  res.status(204).send();
}));

// ─── Audit Logs ────────────────────────────────

authRouter.get('/audit-logs', asyncHandler(async (req: Request, res: Response) => {
  const { userId, eventType, status, from, to, page = '1', limit = '20' } = req.query;
  const result = await auditService.getLogs({
    userId: (userId as string) || req.user!.sub,
    companyId: req.user!.companyId,
    eventType: eventType as string,
    status: status as string,
    from: from ? new Date(from as string) : undefined,
    to: to ? new Date(to as string) : undefined,
    page: parseInt(page as string),
    limit: parseInt(limit as string),
  });
  res.json({ success: true, ...result });
}));

// ─── IP Policies (Admin) ──────────────────────

authRouter.get('/ip-policies', asyncHandler(async (req: Request, res: Response) => {
  const policies = await ipPolicyService.getPolicies(req.user!.companyId);
  res.json({ success: true, data: policies });
}));

authRouter.post('/ip-policies', asyncHandler(async (req: Request, res: Response) => {
  const policy = await ipPolicyService.createPolicy({
    ...req.body,
    companyId: req.user!.companyId,
    createdBy: req.user!.sub,
  });
  res.status(201).json({ success: true, data: policy });
}));

authRouter.delete('/ip-policies/:id', asyncHandler(async (req: Request, res: Response) => {
  await ipPolicyService.deletePolicy(req.params.id, req.user!.companyId);
  res.status(204).send();
}));

// ─── Password Policy (Admin) ──────────────────

authRouter.get('/password-policy', asyncHandler(async (req: Request, res: Response) => {
  const policy = await prisma.passwordPolicy.findUnique({
    where: { companyId: req.user!.companyId },
  });
  res.json({ success: true, data: policy });
}));

authRouter.put('/password-policy', asyncHandler(async (req: Request, res: Response) => {
  const policy = await prisma.passwordPolicy.upsert({
    where: { companyId: req.user!.companyId },
    create: { companyId: req.user!.companyId, ...req.body },
    update: req.body,
  });
  res.json({ success: true, data: policy });
}));

// ─── Current User (Me) ────────────────────────

authRouter.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: {
      id: true, email: true, companyId: true, emailVerified: true,
      isActive: true, mfaEnabled: true, lastLoginAt: true,
      mustChangePassword: true, createdAt: true,
    },
  });
  if (!user) { res.status(404).json({ success: false }); return; }
  res.json({ success: true, data: { ...user, roles: req.user!.roles } });
}));

// ─── Email Verification ────────────────────────

authRouter.post('/send-verification', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ success: false }); return; }
  if (user.emailVerified) { res.json({ success: true, data: { message: 'Email already verified' } }); return; }

  const crypto = await import('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Invalidate old tokens
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  const verifyUrl = `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/verify-email?token=${token}`;
  // In production this would send an email; for now log it
  console.info(`[EMAIL VERIFICATION] To: ${user.email} URL: ${verifyUrl}`);

  res.json({ success: true, data: { message: 'Verification email sent', verifyUrl } });
}));

authRouter.post('/verify-email', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) { res.status(400).json({ success: false, errors: [{ message: 'Token required' }] }); return; }

  const crypto = await import('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash, usedAt: null },
    include: { user: true },
  });

  if (!record) { res.status(400).json({ success: false, errors: [{ message: 'Invalid or expired token' }] }); return; }
  if (record.expiresAt < new Date()) { res.status(400).json({ success: false, errors: [{ message: 'Token expired' }] }); return; }

  await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
  await prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  res.json({ success: true, data: { message: 'Email verified successfully' } });
}));

// ═══════════════════════════════════════════════════
// SSO — SINGLE SIGN-ON (FUTURE-READY)
// ═══════════════════════════════════════════════════

import { ssoService } from './services/sso.service';

/**
 * GET /auth/sso/initiate?provider=azure_ad
 * Public — Generates the IdP authorization URL and redirects the browser.
 */
authRouter.get('/sso/initiate', asyncHandler(async (req: Request, res: Response) => {
  const { provider, companyId } = req.query;
  if (!provider || !companyId) {
    res.status(400).json({ success: false, errors: [{ message: 'provider and companyId are required' }] });
    return;
  }

  const redirectUri = `${process.env['BACKEND_URL'] || 'http://localhost:4000'}/api/v1/auth/sso/callback`;

  const result = await ssoService.initiateLogin(
    companyId as string,
    provider as string,
    redirectUri,
  );

  // Store state in a short-lived cookie for CSRF validation on callback
  res.cookie('sso_state', result.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/api/v1/auth/sso',
  });

  res.json({ success: true, data: { authorizationUrl: result.authorizationUrl } });
}));

/**
 * GET /auth/sso/callback?code=...&state=...
 * Public — Called by the IdP after user authenticates.
 */
authRouter.get('/sso/callback', asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent(error_description as string || error as string)}`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ success: false, errors: [{ message: 'Missing code or state parameter' }] });
    return;
  }

  // Validate CSRF state
  const savedState = req.cookies?.sso_state;
  if (!savedState || savedState !== state) {
    res.status(400).json({ success: false, errors: [{ message: 'Invalid SSO state — possible CSRF attack' }] });
    return;
  }
  res.clearCookie('sso_state', { path: '/api/v1/auth/sso' });

  // Determine companyId from state or a cookie (in a real impl, encode in state)
  // For now, look up which SSO config matches
  const configs = await prisma.ssoConfig.findMany({ where: { isEnabled: true } });
  if (configs.length === 0) {
    res.status(404).json({ success: false, errors: [{ message: 'No SSO provider configured' }] });
    return;
  }

  const config = configs[0]; // In production: decode companyId from the state token
  const redirectUri = `${process.env['BACKEND_URL'] || 'http://localhost:4000'}/api/v1/auth/sso/callback`;

  const result = await ssoService.handleCallback(
    config.companyId,
    config.provider,
    code as string,
    state as string,
    redirectUri,
    getContext(req),
  );

  // Set refresh token cookie
  res.cookie('refreshToken', result.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });

  // Redirect to frontend with access token in URL fragment (SPA pattern)
  const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/sso/complete#token=${result.tokens.accessToken}&new=${result.isNewUser}`);
}));

// ─── SSO Admin Config CRUD ─────────────────────

authRouter.get('/sso/configs', asyncHandler(async (req: Request, res: Response) => {
  const configs = await ssoService.getConfigs(req.user!.companyId);
  res.json({ success: true, data: configs });
}));

authRouter.get('/sso/configs/:id', asyncHandler(async (req: Request, res: Response) => {
  const config = await ssoService.getConfig(req.params.id as string, req.user!.companyId);
  res.json({ success: true, data: config });
}));

authRouter.post('/sso/configs', asyncHandler(async (req: Request, res: Response) => {
  const config = await ssoService.createConfig(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data: config });
}));

authRouter.put('/sso/configs/:id', asyncHandler(async (req: Request, res: Response) => {
  const config = await ssoService.updateConfig(req.params.id as string, req.user!.companyId, req.body);
  res.json({ success: true, data: config });
}));

authRouter.delete('/sso/configs/:id', asyncHandler(async (req: Request, res: Response) => {
  await ssoService.deleteConfig(req.params.id as string, req.user!.companyId);
  res.status(204).send();
}));

authRouter.patch('/sso/configs/:id/toggle', asyncHandler(async (req: Request, res: Response) => {
  const config = await ssoService.toggleConfig(req.params.id as string, req.user!.companyId, req.body.enabled);
  res.json({ success: true, data: config });
}));
