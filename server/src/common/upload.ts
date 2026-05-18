import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload subdirs exist
['avatars', 'logos'].forEach(dir => {
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

export const avatarUpload = multer({
  storage: buildStorage('avatars'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const logoUpload = multer({
  storage: buildStorage('logos'),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

export function getFileUrl(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}
