import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../common/logger';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'documents');

/**
 * Storage Service — Local filesystem implementation.
 * Interface is designed to be S3-compatible for easy migration.
 *
 * Future: swap with S3Client for pre-signed URL flow.
 */
export class StorageService {
  /**
   * Generates the storage key with a structure that mirrors S3 conventions.
   * Pattern: {companyId}/{entityType}/{year}/{uuid}/{filename}
   */
  generateStorageKey(companyId: string, entityType: string, filename: string): string {
    const year = new Date().getFullYear();
    const uid = uuidv4();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${companyId}/${entityType || 'general'}/${year}/${uid}/${safeFilename}`;
  }

  /**
   * Save a file buffer to local storage.
   */
  async saveFile(storageKey: string, buffer: Buffer): Promise<{ path: string; checksum: string }> {
    const filePath = path.join(UPLOAD_ROOT, storageKey);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    logger.info(`File saved: ${storageKey} (${buffer.length} bytes)`);
    return { path: filePath, checksum };
  }

  /**
   * Read a file from local storage.
   */
  async readFile(storageKey: string): Promise<Buffer> {
    const filePath = path.join(UPLOAD_ROOT, storageKey);
    return fs.readFile(filePath);
  }

  /**
   * Get the absolute path for serving/streaming a file.
   */
  getFilePath(storageKey: string): string {
    return path.join(UPLOAD_ROOT, storageKey);
  }

  /**
   * Get a URL path for accessing the file.
   */
  getFileUrl(storageKey: string): string {
    return `/uploads/documents/${storageKey}`;
  }

  /**
   * Delete a file from storage.
   */
  async deleteFile(storageKey: string): Promise<void> {
    try {
      const filePath = path.join(UPLOAD_ROOT, storageKey);
      await fs.unlink(filePath);
      logger.info(`File deleted: ${storageKey}`);
    } catch (err) {
      // File might not exist — that's okay for soft-deleted records
      logger.warn(`Failed to delete file: ${storageKey}`, err);
    }
  }

  /**
   * Check if a file exists.
   */
  async fileExists(storageKey: string): Promise<boolean> {
    try {
      await fs.access(path.join(UPLOAD_ROOT, storageKey));
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();
