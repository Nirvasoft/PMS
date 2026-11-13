import fs from 'fs/promises';
import path from 'path';
import { prisma } from './database';
import { logger } from './logger';

let tableInitPromise: Promise<void> | null = null;

function inferMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.avif':
      return 'image/avif';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export async function ensureUnitPhotoBlobsTable(): Promise<void> {
  if (!tableInitPromise) {
    tableInitPromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "unit_photo_blobs" (
          "unit_id" TEXT NOT NULL,
          "property_id" TEXT NOT NULL,
          "filename" VARCHAR(255) NOT NULL,
          "mime_type" VARCHAR(100) NOT NULL,
          "data" BYTEA NOT NULL,
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "unit_photo_blobs_pkey" PRIMARY KEY ("unit_id")
        )
      `)
      .then(() => undefined)
      .catch((err) => {
        logger.warn('Failed to initialize unit_photo_blobs table', err);
        tableInitPromise = null;
      });
  }
  return tableInitPromise;
}

export async function saveUnitPhotoBlob(
  propertyId: string,
  unitId: string,
  filename: string,
  mimeType: string | undefined,
  buffer: Buffer,
): Promise<void> {
  try {
    await ensureUnitPhotoBlobsTable();
    const resolvedMime = mimeType && mimeType.trim() ? mimeType.trim() : inferMimeType(filename);
    await prisma.$executeRaw`
      INSERT INTO "unit_photo_blobs" ("unit_id", "property_id", "filename", "mime_type", "data", "updated_at")
      VALUES (${unitId}, ${propertyId}, ${filename}, ${resolvedMime}, ${buffer}, CURRENT_TIMESTAMP)
      ON CONFLICT ("unit_id") DO UPDATE SET
        "property_id" = EXCLUDED."property_id",
        "filename" = EXCLUDED."filename",
        "mime_type" = EXCLUDED."mime_type",
        "data" = EXCLUDED."data",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    logger.warn('Failed to persist unit photo blob in database', err);
  }
}

export async function deleteUnitPhotoBlob(unitId: string): Promise<void> {
  try {
    await ensureUnitPhotoBlobsTable();
    await prisma.$executeRaw`
      DELETE FROM "unit_photo_blobs" WHERE "unit_id" = ${unitId}
    `;
  } catch (err) {
    logger.warn('Failed to delete unit photo blob from database', err);
  }
}

export async function getUnitPhotoBlob(
  unitId: string,
  filename?: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  try {
    await ensureUnitPhotoBlobsTable();
    const rows = await prisma.$queryRaw<
      Array<{ filename: string; mime_type: string; data: Buffer | Uint8Array }>
    >`
      SELECT "filename", "mime_type", "data"
      FROM "unit_photo_blobs"
      WHERE "unit_id" = ${unitId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.data) return null;
    const buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    const resolvedFilename = row.filename || filename || 'floor-plan.jpg';
    const mimeType = row.mime_type || inferMimeType(resolvedFilename);
    return { buffer, mimeType, filename: resolvedFilename };
  } catch (err) {
    logger.warn('Failed to read unit photo blob from database', err);
    return null;
  }
}

/**
 * Backfills any existing local disk files under `uploads/units/<propertyId>/<unitId>/*`
 * into `unit_photo_blobs` and restores any DB-backed blobs missing from local disk.
 */
export async function syncUnitPhotoBlobsOnStartup(): Promise<void> {
  try {
    await ensureUnitPhotoBlobsTable();
    const unitsRoot = path.join(process.cwd(), 'uploads', 'units');
    const propDirs = await fs.readdir(unitsRoot, { withFileTypes: true }).catch(() => []);

    for (const propEntry of propDirs) {
      if (!propEntry.isDirectory()) continue;
      const propertyId = propEntry.name;
      const propPath = path.join(unitsRoot, propertyId);
      const unitDirs = await fs.readdir(propPath, { withFileTypes: true }).catch(() => []);

      for (const unitEntry of unitDirs) {
        if (!unitEntry.isDirectory()) continue;
        const unitId = unitEntry.name;
        const unitPath = path.join(propPath, unitId);
        const files = await fs.readdir(unitPath, { withFileTypes: true }).catch(() => []);
        const photoFile = files.find((f) => f.isFile() && f.name.startsWith('floor-plan'));
        if (!photoFile) continue;

        const filePath = path.join(unitPath, photoFile.name);
        const buf = await fs.readFile(filePath).catch(() => null);
        if (!buf || buf.length === 0) continue;

        const mimeType = inferMimeType(photoFile.name);
        await prisma.$executeRaw`
          INSERT INTO "unit_photo_blobs" ("unit_id", "property_id", "filename", "mime_type", "data", "updated_at")
          VALUES (${unitId}, ${propertyId}, ${photoFile.name}, ${mimeType}, ${buf}, CURRENT_TIMESTAMP)
          ON CONFLICT ("unit_id") DO NOTHING
        `;
      }
    }
  } catch (err) {
    logger.warn('Failed to backfill unit photo blobs on startup', err);
  }
}
