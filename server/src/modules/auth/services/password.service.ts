import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../../common/database';
import { config } from '../../../common/config';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';

const BCRYPT_ROUNDS = 12;

export class PasswordService {
  /**
   * Hash a password with bcrypt (work factor 12)
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Compare a plain text password against a hash
   */
  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate a new password against the company's password policy.
   * Throws AppError with specific violation codes.
   */
  async validateNewPassword(
    password: string,
    userId: string,
    companyId: string,
  ): Promise<void> {
    const policy = await prisma.passwordPolicy.findUnique({
      where: { companyId },
    });

    if (!policy) return; // no policy = no restrictions

    const errors: string[] = [];

    // Length check
    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    // Complexity checks
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    if (errors.length > 0) {
      throw new AppError(422, 'PASSWORD_POLICY_VIOLATION', errors.join('. '));
    }

    // Password history check
    if (policy.historyCount > 0) {
      const history = await prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: policy.historyCount,
      });

      for (const entry of history) {
        const isReused = await this.compare(password, entry.passwordHash);
        if (isReused) {
          throw new AppError(
            422,
            'PASSWORD_IN_HISTORY',
            `Cannot reuse your last ${policy.historyCount} passwords`,
          );
        }
      }
    }

    // HaveIBeenPwned check
    if (config.hibp.enabled) {
      const breached = await this.checkBreachDatabase(password);
      if (breached) {
        throw new AppError(
          422,
          'PASSWORD_BREACHED',
          'This password has been found in a data breach. Please choose a different password.',
        );
      }
    }
  }

  /**
   * Check password against HaveIBeenPwned using k-Anonymity
   */
  async checkBreachDatabase(password: string): Promise<boolean> {
    try {
      const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const response = await fetch(`${config.hibp.apiUrl}/range/${prefix}`);
      if (!response.ok) return false;

      const text = await response.text();
      return text.split('\n').some((line) => line.startsWith(suffix));
    } catch (err) {
      logger.warn('HIBP check failed, skipping', { error: (err as Error).message });
      return false;
    }
  }

  /**
   * Add a password hash to the user's history
   */
  async addToHistory(userId: string, passwordHash: string): Promise<void> {
    await prisma.passwordHistory.create({
      data: { userId, passwordHash },
    });
  }

  /**
   * Perform a dummy comparison to prevent timing attacks
   * when user doesn't exist
   */
  async dummyCompare(): Promise<void> {
    const dummyHash = '$2b$12$LJ3m4ys3Lg3JJc0vDlW2/eBz5xMGb5GqJH/mGKwHGaWfH/JFW3qW2';
    await bcrypt.compare('dummy-password', dummyHash);
  }
}

export const passwordService = new PasswordService();
