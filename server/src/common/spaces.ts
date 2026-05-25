/**
 * DigitalOcean Spaces (S3-compatible) Storage Provider
 *
 * Uses the AWS SDK v3 — DigitalOcean Spaces is fully S3-compatible.
 * In production, set STORAGE_PROVIDER=spaces and configure DO_SPACES_* env vars.
 * In development, defaults to local filesystem (STORAGE_PROVIDER=local).
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { logger } from './logger';

// ─── Configuration ──────────────────────────────────────
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

const spacesConfig = {
  key: process.env.DO_SPACES_KEY || '',
  secret: process.env.DO_SPACES_SECRET || '',
  endpoint: process.env.DO_SPACES_ENDPOINT || 'https://sgp1.digitaloceanspaces.com',
  bucket: process.env.DO_SPACES_BUCKET || 'pms-uploads',
  cdnUrl: process.env.DO_SPACES_CDN_URL || '',
};

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = spacesConfig.endpoint.match(/\/\/(\w+)\./)?.[1] || 'sgp1';
    s3Client = new S3Client({
      endpoint: spacesConfig.endpoint,
      forcePathStyle: false,
      region,
      credentials: {
        accessKeyId: spacesConfig.key,
        secretAccessKey: spacesConfig.secret,
      },
    });
    logger.info(`S3 client initialized for ${spacesConfig.endpoint}`);
  }
  return s3Client;
}

// ─── Public API ─────────────────────────────────────────

export function isSpacesEnabled(): boolean {
  return STORAGE_PROVIDER === 'spaces' && !!spacesConfig.key;
}

/**
 * Upload a buffer to DigitalOcean Spaces.
 * Returns the public URL (via CDN if configured).
 */
export async function uploadToSpaces(
  storageKey: string,
  buffer: Buffer,
  contentType: string,
  options?: { isPublic?: boolean },
): Promise<{ url: string; checksum: string }> {
  const client = getS3Client();
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  await client.send(new PutObjectCommand({
    Bucket: spacesConfig.bucket,
    Key: storageKey,
    Body: buffer,
    ContentType: contentType,
    ACL: options?.isPublic ? 'public-read' : 'private',
    Metadata: {
      checksum,
    },
  }));

  const url = options?.isPublic && spacesConfig.cdnUrl
    ? `${spacesConfig.cdnUrl}/${storageKey}`
    : `${spacesConfig.endpoint}/${spacesConfig.bucket}/${storageKey}`;

  logger.info(`Uploaded to Spaces: ${storageKey} (${buffer.length} bytes)`);
  return { url, checksum };
}

/**
 * Get a pre-signed URL for downloading a private file.
 * Expires in 1 hour by default.
 */
export async function getSpacesSignedUrl(storageKey: string, expiresIn = 3600): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: spacesConfig.bucket,
    Key: storageKey,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Download a file from Spaces as a Buffer.
 */
export async function downloadFromSpaces(storageKey: string): Promise<Buffer> {
  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: spacesConfig.bucket,
    Key: storageKey,
  }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Delete a file from Spaces.
 */
export async function deleteFromSpaces(storageKey: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({
    Bucket: spacesConfig.bucket,
    Key: storageKey,
  }));
  logger.info(`Deleted from Spaces: ${storageKey}`);
}

/**
 * Check if a file exists in Spaces.
 */
export async function existsInSpaces(storageKey: string): Promise<boolean> {
  const client = getS3Client();
  try {
    await client.send(new HeadObjectCommand({
      Bucket: spacesConfig.bucket,
      Key: storageKey,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the public CDN URL for a file.
 * For public files served via CDN (avatars, logos, etc.)
 */
export function getSpacesCdnUrl(storageKey: string): string {
  if (spacesConfig.cdnUrl) {
    return `${spacesConfig.cdnUrl}/${storageKey}`;
  }
  return `${spacesConfig.endpoint}/${spacesConfig.bucket}/${storageKey}`;
}
