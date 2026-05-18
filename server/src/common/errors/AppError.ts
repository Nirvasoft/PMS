/**
 * Centralized application error class.
 * All thrown errors should use this for consistent API responses.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly meta?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    meta?: Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.meta = meta;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // Common auth errors
  static invalidCredentials() {
    return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  static accountLocked(unlockAt: Date) {
    const minutesLeft = Math.ceil((unlockAt.getTime() - Date.now()) / 60000);
    return new AppError(
      423,
      'ACCOUNT_LOCKED',
      `Account locked after too many failed attempts. Try again in ${minutesLeft} minutes.`,
      { unlockAt: unlockAt.toISOString() },
    );
  }

  static accountInactive() {
    return new AppError(401, 'ACCOUNT_INACTIVE', 'This account has been deactivated');
  }

  static tokenExpired() {
    return new AppError(401, 'TOKEN_EXPIRED', 'Token has expired');
  }

  static tokenInvalid() {
    return new AppError(401, 'TOKEN_INVALID', 'Invalid token');
  }

  static tokenReuseDetected() {
    return new AppError(401, 'TOKEN_REUSE_DETECTED', 'Security violation. All sessions terminated.');
  }

  static invalidMfaCode() {
    return new AppError(401, 'INVALID_MFA_CODE', 'Invalid or expired MFA code');
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  static validation(message: string, code = 'VALIDATION_ERROR') {
    return new AppError(422, code, message);
  }

  static ipBlocked() {
    return new AppError(403, 'IP_BLOCKED', 'Access from your IP address is not allowed');
  }

  static rateLimited() {
    return new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }
}
