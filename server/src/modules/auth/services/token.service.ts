import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../../common/database';
import { redis } from '../../../common/redis';
import { config } from '../../../common/config';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import type { JwtPayload, AuthTokens, MfaChallengeResponse } from '../interfaces/auth.interfaces';
import { config } from '../../../common/config';

const KEY_PREFIX = config.redis.prefix || '';

export class TokenService {
  /**
   * Issue access + refresh token pair.
   */
  async issueTokens(
    user: { id: string; email: string; companyId: string },
    options: {
      deviceId?: string;
      rememberMe?: boolean;
      roles?: string[];
      permissions?: string[];
    } = {},
  ): Promise<AuthTokens> {
    const { deviceId, rememberMe = false, roles = [], permissions = [] } = options;
    const family = uuidv4();
    const jti = uuidv4();

    // Access token
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      sessionId: family,
      roles,
      permissions,
      jti,
    };

    const accessToken = jwt.sign(accessPayload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiry,
    });

    // Refresh token (raw random bytes, stored as hash)
    const rawRefreshToken = crypto.randomBytes(64).toString('base64url');
    const tokenHash = this.hashToken(rawRefreshToken);
    const ttl = rememberMe ? config.jwt.refreshExpiryLong : config.jwt.refreshExpiry;

    // Store in DB (audit record)
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        family,
        deviceId,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });

    // Store in Redis (primary lookup for speed)
    await redis.set(
      `refresh:${user.id}:${family}`,
      JSON.stringify({ tokenHash, deviceId }),
      'EX',
      ttl,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: config.jwt.accessExpiry,
      tokenType: 'Bearer',
    };
  }

  /**
   * Issue a short-lived MFA challenge token
   */
  issueMfaToken(userId: string, email: string, companyId: string): MfaChallengeResponse {
    const token = jwt.sign(
      { sub: userId, email, companyId, type: 'mfa' },
      config.jwt.mfaSecret,
      { expiresIn: config.jwt.mfaExpiry },
    );

    return {
      mfaRequired: true,
      mfaToken: token,
      mfaTokenExpiresIn: config.jwt.mfaExpiry,
    };
  }

  /**
   * Verify and decode an MFA token
   */
  verifyMfaToken(token: string): { sub: string; email: string; companyId: string } {
    try {
      const payload = jwt.verify(token, config.jwt.mfaSecret) as jwt.JwtPayload & {
        sub: string;
        email: string;
        companyId: string;
        type: string;
      };
      if (payload.type !== 'mfa') {
        throw AppError.invalidMfaCode();
      }
      return { sub: payload.sub, email: payload.email, companyId: payload.companyId };
    } catch {
      throw AppError.invalidMfaCode();
    }
  }

  /**
   * Validate a refresh token. Implements token rotation with reuse detection.
   */
  async validateRefreshToken(
    rawToken: string,
    userId: string,
  ): Promise<{ family: string; deviceId: string | null }> {
    const tokenHash = this.hashToken(rawToken);

    // Check Redis first (fast path)
    // Note: redis.keys() does NOT auto-prefix like get/set/del, so we prepend manually
    const keys = await redis.keys(`${KEY_PREFIX}refresh:${userId}:*`);
    for (const rawKey of keys) {
      // Strip prefix for redis.get() which auto-prefixes
      const key = rawKey.startsWith(KEY_PREFIX) ? rawKey.slice(KEY_PREFIX.length) : rawKey;
      const stored = await redis.get(key);
      if (!stored) continue;
      const data = JSON.parse(stored);
      if (data.tokenHash === tokenHash) {
        const family = key.split(':').pop()!;
        return { family, deviceId: data.deviceId };
      }
    }

    // Not in Redis — check DB for token reuse attack
    const dbToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (dbToken) {
      if (dbToken.revokedAt) {
        // TOKEN REUSE DETECTED — revoke entire family
        logger.warn('Refresh token reuse detected!', {
          userId,
          family: dbToken.family,
        });
        await this.revokeTokenFamily(dbToken.family, userId);
        throw AppError.tokenReuseDetected();
      }
      // Token exists in DB but not Redis = expired
      throw AppError.tokenExpired();
    }

    throw AppError.tokenInvalid();
  }

  /**
   * Revoke a single refresh token (on logout)
   */
  async revokeRefreshToken(
    rawToken: string,
    userId: string,
    reason = 'logout',
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);

    // Remove from Redis
    const keys = await redis.keys(`${KEY_PREFIX}refresh:${userId}:*`);
    for (const rawKey of keys) {
      const key = rawKey.startsWith(KEY_PREFIX) ? rawKey.slice(KEY_PREFIX.length) : rawKey;
      const stored = await redis.get(key);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.tokenHash === tokenHash) {
          await redis.del(key);
          break;
        }
      }
    }

    // Mark as revoked in DB
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  /**
   * Revoke all tokens in a family (on reuse detection)
   */
  async revokeTokenFamily(family: string, userId: string): Promise<void> {
    // Remove from Redis
    await redis.del(`refresh:${userId}:${family}`);

    // Revoke in DB
    await prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'token_reuse_detected' },
    });
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    // Clear Redis
    const keys = await redis.keys(`${KEY_PREFIX}refresh:${userId}:*`);
    if (keys.length > 0) {
      // Strip prefix for del() which auto-prefixes
      const stripped = keys.map(k => k.startsWith(KEY_PREFIX) ? k.slice(KEY_PREFIX.length) : k);
      await redis.del(...stripped);
    }

    // Revoke in DB
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'all_sessions_revoked' },
    });
  }

  /**
   * Blacklist an access token in Redis until its natural expiry
   */
  async blacklistAccessToken(jti: string, expiresIn: number): Promise<void> {
    await redis.set(`blacklist:at:${jti}`, '1', 'EX', expiresIn);
  }

  /**
   * Check if an access token is blacklisted
   */
  async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await redis.get(`blacklist:at:${jti}`);
    return result !== null;
  }

  /**
   * Verify and decode an access token
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch (err) {
      if ((err as jwt.JsonWebTokenError).name === 'TokenExpiredError') {
        throw AppError.tokenExpired();
      }
      throw AppError.tokenInvalid();
    }
  }

  /**
   * SHA-256 hash of a token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const tokenService = new TokenService();
