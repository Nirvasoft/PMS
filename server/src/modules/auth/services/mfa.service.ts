import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../common/database';
import { config } from '../../../common/config';
import { AppError } from '../../../common/errors';

const BACKUP_CODE_COUNT = 10;
const APP_NAME = 'PMS';

export class MfaService {
  async generateMfaSetup(user: { id: string; email: string }) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, APP_NAME, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    const backupCodes = this.generateBackupCodes();
    return { secret, qrCodeUrl: otpauthUrl, qrCodeDataUrl, backupCodes };
  }

  async enableMfa(userId: string, secret: string, code: string, backupCodes: string[]) {
    if (!authenticator.verify({ token: code, secret })) throw AppError.invalidMfaCode();
    const encryptedSecret = this.encryptSecret(secret);
    const hashedCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaBackupCodes: hashedCodes },
    });
  }

  async verifyCode(
    user: { id: string; mfaSecret: string | null; mfaBackupCodes: string[] },
    code: string,
  ): Promise<boolean> {
    if (!user.mfaSecret) return false;
    const secret = this.decryptSecret(user.mfaSecret);
    if (code.length === 6 && /^\d+$/.test(code)) {
      return authenticator.verify({ token: code, secret });
    }
    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      if (await bcrypt.compare(code, user.mfaBackupCodes[i])) {
        const updatedCodes = [...user.mfaBackupCodes];
        updatedCodes.splice(i, 1);
        await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: updatedCodes } });
        return true;
      }
    }
    return false;
  }

  async disableMfa(userId: string, mfaSecret: string | null, code: string) {
    if (!mfaSecret) throw new AppError(400, 'MFA_NOT_ENABLED', 'MFA is not enabled');
    const secret = this.decryptSecret(mfaSecret);
    if (!authenticator.verify({ token: code, secret })) throw AppError.invalidMfaCode();
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });
  }

  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const codes = this.generateBackupCodes();
    const hashed = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
    await prisma.user.update({ where: { id: userId }, data: { mfaBackupCodes: hashed } });
    return codes;
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      return `${p1}-${p2}`;
    });
  }

  private encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(config.encryption.ivLength);
    const key = Buffer.from(config.encryption.key, 'hex');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return `${iv.toString('hex')}:${cipher.update(secret, 'utf8', 'hex')}${cipher.final('hex')}`;
  }

  private decryptSecret(encrypted: string): string {
    const [ivHex, data] = encrypted.split(':');
    const key = Buffer.from(config.encryption.key, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return `${decipher.update(data, 'hex', 'utf8')}${decipher.final('utf8')}`;
  }
}

export const mfaService = new MfaService();
