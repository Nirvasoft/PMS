import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { storageService } from './storage.service';
import crypto from 'crypto';

// Allowed MIME types
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif',
  'video/mp4', 'video/quicktime',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export class DocumentsService {
  /**
   * Upload a document (server-side upload via multipart).
   * In Phase 2, this becomes a pre-signed URL flow.
   */
  async uploadDocument(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    dto: {
      companyId: string;
      propertyId?: string;
      folderId?: string;
      entityType?: string;
      entityId?: string;
      name?: string;
      category?: string;
      description?: string;
      tags?: string[];
      expiryDate?: string;
      isConfidential?: boolean;
    },
    uploadedBy: string,
  ) {
    // Validate
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new AppError(400, 'INVALID_FILE_TYPE', `File type "${file.mimetype}" is not allowed`);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(400, 'FILE_TOO_LARGE', `File exceeds maximum size of 500 MB`);
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
    const storageKey = storageService.generateStorageKey(
      dto.companyId,
      dto.entityType || 'general',
      file.originalname,
    );

    // Save to storage
    const { checksum } = await storageService.saveFile(storageKey, file.buffer);

    // Create DB record
    const doc = await prisma.document.create({
      data: {
        companyId: dto.companyId,
        propertyId: dto.propertyId,
        folderId: dto.folderId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        name: dto.name || file.originalname,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        extension,
        fileSize: BigInt(file.size),
        storageKey,
        storageBucket: 'local',
        checksumSha256: checksum,
        category: dto.category,
        description: dto.description,
        tags: dto.tags || [],
        status: 'active',
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        isConfidential: dto.isConfidential || false,
        uploadedBy,
      },
    });

    logger.info(`Document uploaded: ${doc.id} (${file.originalname})`);
    return this.serializeDocument(doc);
  }

  /**
   * Get a single document by ID.
   */
  async getDocument(id: string, companyId: string) {
    const doc = await prisma.document.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        folder: { select: { id: true, name: true, path: true } },
        uploader: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    return this.serializeDocument(doc);
  }

  /**
   * List documents with filters and pagination.
   */
  async listDocuments(companyId: string, query: {
    entityType?: string;
    entityId?: string;
    folderId?: string;
    category?: string;
    tags?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.folderId) where.folderId = query.folderId;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.tags) {
      where.tags = { hasSome: query.tags.split(',') };
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { originalFilename: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortField = query.sort || 'createdAt';
    const sortOrder = query.order === 'asc' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          folder: { select: { id: true, name: true, path: true } },
          uploader: {
            select: {
              id: true, email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    return {
      data: data.map((d) => this.serializeDocument(d)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Update document metadata (not the file itself).
   */
  async updateDocument(id: string, companyId: string, data: {
    name?: string;
    description?: string;
    tags?: string[];
    category?: string;
    expiryDate?: string | null;
    folderId?: string | null;
  }) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const updated = await prisma.document.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.expiryDate !== undefined && { expiryDate: data.expiryDate ? new Date(data.expiryDate) : null }),
        ...(data.folderId !== undefined && { folderId: data.folderId }),
      },
    });

    return this.serializeDocument(updated);
  }

  /**
   * Soft-delete a document.
   */
  async deleteDocument(id: string, companyId: string) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Upload a new version of an existing document.
   */
  async uploadNewVersion(
    id: string,
    companyId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    changeNotes: string | undefined,
    uploadedBy: string,
  ) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    // Archive current version
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: doc.currentVersion,
        storageKey: doc.storageKey,
        originalFilename: doc.originalFilename,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        checksumSha256: doc.checksumSha256,
        changeNotes,
        uploadedBy: doc.uploadedBy,
      },
    });

    // Save new file
    const newKey = storageService.generateStorageKey(companyId, doc.entityType || 'general', file.originalname);
    const { checksum } = await storageService.saveFile(newKey, file.buffer);

    // Update document
    const updated = await prisma.document.update({
      where: { id },
      data: {
        storageKey: newKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        extension: file.originalname.split('.').pop()?.toLowerCase(),
        fileSize: BigInt(file.size),
        checksumSha256: checksum,
        currentVersion: doc.currentVersion + 1,
      },
    });

    logger.info(`Document version ${updated.currentVersion} uploaded: ${id}`);
    return this.serializeDocument(updated);
  }

  /**
   * Get version history for a document.
   */
  async getVersions(id: string, companyId: string) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      include: {
        uploader: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });

    // Include current version at the top
    return [
      {
        versionNumber: doc.currentVersion,
        isCurrent: true,
        originalFilename: doc.originalFilename,
        fileSize: Number(doc.fileSize),
        mimeType: doc.mimeType,
        changeNotes: null,
        createdAt: doc.updatedAt,
      },
      ...versions.map((v) => ({
        versionNumber: v.versionNumber,
        isCurrent: false,
        originalFilename: v.originalFilename,
        fileSize: Number(v.fileSize),
        mimeType: v.mimeType,
        changeNotes: v.changeNotes,
        uploadedBy: v.uploader,
        createdAt: v.createdAt,
      })),
    ];
  }

  /**
   * Get download URL / file path for a document.
   */
  async getDownloadInfo(id: string, companyId: string, userId: string) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    // Log access
    await prisma.documentAccessLog.create({
      data: { documentId: id, userId, action: 'download' },
    });

    return {
      url: storageService.getFileUrl(doc.storageKey),
      filePath: storageService.getFilePath(doc.storageKey),
      filename: doc.originalFilename,
      mimeType: doc.mimeType,
    };
  }

  /**
   * Get preview URL for a document.
   */
  async getPreviewInfo(id: string, companyId: string, userId: string) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    await prisma.documentAccessLog.create({
      data: { documentId: id, userId, action: 'preview' },
    });

    return {
      url: storageService.getFileUrl(doc.storageKey),
      mimeType: doc.mimeType,
      name: doc.name,
    };
  }

  /**
   * Get expiring documents.
   */
  async getExpiringDocuments(companyId: string, days: number = 30, page = 1, limit = 20) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const where = {
      companyId,
      deletedAt: null,
      expiryDate: { not: null, lte: futureDate },
      status: { not: 'archived' },
    };

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          uploader: {
            select: {
              id: true, email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    return {
      data: data.map((d) => {
        const daysUntilExpiry = d.expiryDate
          ? Math.ceil((d.expiryDate.getTime() - Date.now()) / 86400000)
          : null;
        return { ...this.serializeDocument(d), daysUntilExpiry };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Create a share link for a document.
   */
  async createShareLink(id: string, companyId: string, dto: {
    shareType?: string;
    expiresAt?: string;
    maxAccesses?: number;
    password?: string;
  }, userId: string) {
    const doc = await prisma.document.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    let passwordHash: string | null = null;
    if (dto.password) {
      const bcrypt = await import('bcryptjs');
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const share = await prisma.documentShare.create({
      data: {
        documentId: id,
        tokenHash,
        shareType: dto.shareType || 'view',
        passwordHash,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        maxAccesses: dto.maxAccesses,
        createdBy: userId,
      },
    });

    await prisma.documentAccessLog.create({
      data: { documentId: id, userId, action: 'share' },
    });

    const baseUrl = process.env['FRONTEND_URL'] || 'http://localhost:5173';
    return {
      shareId: share.id,
      shareUrl: `${baseUrl}/shared/documents/${rawToken}`,
      expiresAt: share.expiresAt,
    };
  }

  // ─── Helpers ──────────────────────────────────

  private serializeDocument(doc: Record<string, unknown>) {
    return {
      ...doc,
      fileSize: doc.fileSize ? Number(doc.fileSize) : 0,
      fileSizeFormatted: this.formatFileSize(Number(doc.fileSize || 0)),
    };
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}

export const documentsService = new DocumentsService();
