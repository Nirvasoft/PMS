import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { isSpacesEnabled, uploadToSpaces, getSpacesCdnUrl } from './spaces';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload subdirs exist (for local storage)
['avatars', 'logos', 'workflow-attachments'].forEach(dir => {
  const p = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

function buildStorage(subdir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, subdir)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
      cb(null, name);
    },
  });
}

function imageFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, WEBP images are allowed'));
  }
}

function csvFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const okMime = /^(text\/csv|text\/plain|application\/csv|application\/vnd\.ms-excel|application\/octet-stream)$/i;
  const okExt = /\.csv$/i.test(file.originalname);
  if (okMime.test(file.mimetype) || okExt) {
    cb(null, true);
  } else {
    cb(new Error('Only .csv files are allowed'));
  }
}

// In production with Spaces, use memory storage so we can upload the buffer to S3.
// In local dev, use disk storage as before.
export const avatarUpload = multer({
  storage: isSpacesEnabled() ? multer.memoryStorage() : buildStorage('avatars'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const logoUpload = multer({
  storage: isSpacesEnabled() ? multer.memoryStorage() : buildStorage('logos'),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/**
 * Get the URL for a file in a subdirectory.
 * In Spaces mode, constructs the CDN URL.
 * In local mode, returns the relative /uploads/ path.
 */
export function getFileUrl(subdir: string, filename: string): string {
  if (isSpacesEnabled()) {
    return getSpacesCdnUrl(`${subdir}/${filename}`);
  }
  return `/uploads/${subdir}/${filename}`;
}

export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/** General file upload (no image filter) for attachments etc. */
export const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

/**
 * Persist an uploaded file buffer to local disk or Spaces.
 * Returns the public URL.
 */
export async function persistUploadedFile(
  file: Express.Multer.File,
  subdir: string,
): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;

  if (isSpacesEnabled()) {
    await uploadToSpaces(`${subdir}/${filename}`, file.buffer, file.mimetype, { isPublic: true });
    return getSpacesCdnUrl(`${subdir}/${filename}`);
  }

  // Local storage
  const dirPath = path.join(UPLOAD_DIR, subdir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, filename), file.buffer);
  return `/uploads/${subdir}/${filename}`;
}

/**
 * Process an avatar image (resize + convert to webp), save to storage.
 * Supports both local filesystem and DigitalOcean Spaces.
 */
export async function processAvatar(buffer: Buffer): Promise<string> {
  const filename = `${crypto.randomBytes(16).toString('hex')}.webp`;
  const processed = await sharp(buffer)
    .resize(300, 300, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();

  if (isSpacesEnabled()) {
    await uploadToSpaces(`avatars/${filename}`, processed, 'image/webp', { isPublic: true });
    return getSpacesCdnUrl(`avatars/${filename}`);
  }

  // Local filesystem
  const p = path.join(UPLOAD_DIR, 'avatars', filename);
  await sharp(buffer)
    .resize(300, 300, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(p);
  return getFileUrl('avatars', filename);
}

/**
 * Save an uploaded file to Spaces (for routes using disk storage that need Spaces support).
 * Call this after multer processes the file when in Spaces mode.
 */
export async function saveUploadedFileToSpaces(
  file: Express.Multer.File,
  subdir: string,
): Promise<string> {
  if (!isSpacesEnabled()) {
    // Already saved to disk by multer
    return getFileUrl(subdir, file.filename);
  }

  const filename = file.filename || `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;
  const buffer = file.buffer || fs.readFileSync(file.path);
  await uploadToSpaces(`${subdir}/${filename}`, buffer, file.mimetype, { isPublic: true });
  return getSpacesCdnUrl(`${subdir}/${filename}`);
}
