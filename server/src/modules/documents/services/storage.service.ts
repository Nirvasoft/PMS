import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../common/logger';
import {
  isSpacesEnabled,
  uploadToSpaces,
  downloadFromSpaces,
  deleteFromSpaces,
  existsInSpaces,
  getSpacesCdnUrl,
  getSpacesSignedUrl,
} from '../../../common/spaces';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'documents');

/**
 * Storage Service — Supports both local filesystem and DigitalOcean Spaces.
 *
 * When STORAGE_PROVIDER=spaces, files are stored in DO Spaces (S3-compatible).
 * When STORAGE_PROVIDER=local (default), files are stored on local filesystem.
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
   * Save a file buffer to storage (Spaces or local filesystem).
   */
  async saveFile(
    storageKey: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<{ path: string; checksum: string }> {
    if (isSpacesEnabled()) {
      const result = await uploadToSpaces(
        `documents/${storageKey}`,
        buffer,
        contentType || 'application/octet-stream',
      );
      return { path: `documents/${storageKey}`, checksum: result.checksum };
    }

    // Local filesystem fallback
    const filePath = path.join(UPLOAD_ROOT, storageKey);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    logger.info(`File saved: ${storageKey} (${buffer.length} bytes)`);
    return { path: filePath, checksum };
  }

  /**
   * Read a file from storage.
   */
  async readFile(storageKey: string): Promise<Buffer> {
    if (isSpacesEnabled()) {
      return downloadFromSpaces(`documents/${storageKey}`);
    }
    const filePath = path.join(UPLOAD_ROOT, storageKey);
    return fs.readFile(filePath);
  }

  /**
   * Get the absolute path for serving/streaming a file.
   * For Spaces, returns the Spaces key (use getFileUrl for URL).
   */
  getFilePath(storageKey: string): string {
    if (isSpacesEnabled()) {
      return `documents/${storageKey}`;
    }
    return path.join(UPLOAD_ROOT, storageKey);
  }

  /**
   * Get a URL path for accessing the file.
   * For Spaces: returns a CDN or pre-signed URL.
   * For local: returns a relative path served by Express static.
   */
  getFileUrl(storageKey: string): string {
    if (isSpacesEnabled()) {
      return getSpacesCdnUrl(`documents/${storageKey}`);
    }
    return `/uploads/documents/${storageKey}`;
  }

  /**
   * Get a pre-signed download URL (only for Spaces).
   * Falls back to the local URL for local storage.
   */
  async getDownloadUrl(storageKey: string, expiresIn = 3600): Promise<string> {
    if (isSpacesEnabled()) {
      return getSpacesSignedUrl(`documents/${storageKey}`, expiresIn);
    }
    return `/uploads/documents/${storageKey}`;
  }

  /**
   * Delete a file from storage.
   */
  async deleteFile(storageKey: string): Promise<void> {
    try {
      if (isSpacesEnabled()) {
        await deleteFromSpaces(`documents/${storageKey}`);
        return;
      }
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
    if (isSpacesEnabled()) {
      return existsInSpaces(`documents/${storageKey}`);
    }
    try {
      await fs.access(path.join(UPLOAD_ROOT, storageKey));
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();
