export interface JwtPayload {
  sub: string;         // user UUID
  email: string;
  companyId: string;
  sessionId: string;   // refresh token family ID
  roles: string[];
  permissions: string[];
  jti: string;         // unique token ID for blacklisting
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
  mfaTokenExpiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  companyId: string;
  roles: string[];
  mustChangePassword: boolean;
}

export interface RequestContext {
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
  deviceName?: string;
}

export interface LoginResponse {
  success: true;
  data: (AuthTokens & { user: AuthUser }) | MfaChallengeResponse;
}
