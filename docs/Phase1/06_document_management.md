# Module 1.6 — Document Management

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · AWS S3/MinIO · Elasticsearch · React 18 · Redux Toolkit  
**Status:** 📋 Specified (not yet implemented — Phase 2+)  
**Depends On:** Module 1.1, 1.2, 1.3

---

## Table of Contents
1. [Overview](#overview)
2. [DB Schema](#db-schema)
3. [Server-Side Architecture](#server-side-architecture)
4. [API Contract](#api-contract)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [UI Screens & Component Breakdown](#ui-screens--component-breakdown)
7. [State Management](#state-management)

---

## Overview

Centralized document vault for all files in the system — lease contracts, KYC documents, vendor agreements, inspection photos, maintenance records, and more. Every module links its documents here rather than storing files independently.

**Key capabilities:**
- Multi-file upload with virus scanning (ClamAV)
- S3/MinIO storage with pre-signed URL access (no file proxying through app server)
- OCR via AWS Textract (async) with Elasticsearch full-text indexing
- Version history — every re-upload creates a new version; previous versions retained
- Folder hierarchy per property/entity with access control
- PDF.js browser preview (no server-side render required)
- Document expiry tracking with automated alerts
- Approval workflow integration (documents can be submitted for review)

---

## DB Schema

```sql
-- Folders (virtual hierarchy — documents can exist without a folder)
CREATE TABLE document_folders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES properties(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  path          TEXT NOT NULL,              -- materialized path: /root/contracts/2025/
  entity_type   VARCHAR(100),              -- optional: 'tenant' | 'lease' | 'vendor' | ...
  entity_id     UUID,                      -- optional: link folder to specific entity
  access_policy VARCHAR(20) DEFAULT 'inherit',
                                           -- 'private' | 'company' | 'property' | 'inherit'
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_folder_path_company UNIQUE (path, company_id)
);

CREATE INDEX idx_folders_company ON document_folders(company_id);
CREATE INDEX idx_folders_parent ON document_folders(parent_id);
CREATE INDEX idx_folders_entity ON document_folders(entity_type, entity_id);

-- Documents (metadata record — actual file in S3)
CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID REFERENCES properties(id) ON DELETE SET NULL,
  folder_id         UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  entity_type       VARCHAR(100),          -- 'lease' | 'tenant' | 'vendor' | 'maintenance' | ...
  entity_id         UUID,
  name              VARCHAR(500) NOT NULL, -- display name (may differ from filename)
  original_filename VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  extension         VARCHAR(20),
  file_size         BIGINT NOT NULL,       -- bytes
  storage_key       VARCHAR(1000) NOT NULL,-- S3 object key
  storage_bucket    VARCHAR(255) NOT NULL,
  checksum_sha256   VARCHAR(64),           -- for integrity verification
  category          VARCHAR(100),         -- 'contract' | 'kyc' | 'invoice' | 'photo' | 'report' | ...
  description       TEXT,
  tags              TEXT[] DEFAULT '{}',
  status            VARCHAR(30) NOT NULL DEFAULT 'active',
                    -- 'active' | 'pending_review' | 'approved' | 'rejected' | 'archived'
  approval_instance_id UUID,             -- linked workflow instance
  expiry_date       DATE,
  expiry_reminder_days SMALLINT[],       -- e.g. [90, 60, 30, 7] days before expiry
  is_confidential   BOOLEAN NOT NULL DEFAULT FALSE,
  current_version   SMALLINT NOT NULL DEFAULT 1,
  ocr_status        VARCHAR(20) DEFAULT 'pending',
                    -- 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  ocr_text          TEXT,               -- extracted text (stored in ES, this is a cache)
  virus_scan_status VARCHAR(20) DEFAULT 'pending',
                    -- 'pending' | 'clean' | 'infected' | 'error'
  virus_scan_at     TIMESTAMPTZ,
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_expiry ON documents(expiry_date) WHERE expiry_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);

-- Document versions
CREATE TABLE document_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number  SMALLINT NOT NULL,
  storage_key     VARCHAR(1000) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  file_size       BIGINT NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  checksum_sha256 VARCHAR(64),
  change_notes    TEXT,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_doc_version UNIQUE (document_id, version_number)
);

-- Document access log
CREATE TABLE document_access_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(30) NOT NULL, -- 'view' | 'download' | 'preview' | 'share'
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_access_document ON document_access_logs(document_id, created_at DESC);

-- Document shares (expiring share links)
CREATE TABLE document_shares (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
  share_type   VARCHAR(20) DEFAULT 'view', -- 'view' | 'download'
  password_hash VARCHAR(255),              -- optional password protection
  expires_at   TIMESTAMPTZ,
  max_accesses SMALLINT,                  -- null = unlimited
  access_count SMALLINT DEFAULT 0,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Server-Side Architecture

```
src/modules/documents/
├── documents.module.ts
├── documents.controller.ts
├── documents.service.ts
├── folders.controller.ts
├── folders.service.ts
├── versions.service.ts
├── ocr.service.ts                    # Textract integration + ES indexing
├── virus-scan.service.ts             # ClamAV integration
├── storage.service.ts                # S3/MinIO abstraction
├── shares.service.ts
├── expiry.service.ts                 # expiry reminder cron
├── queues/
│   ├── ocr.processor.ts
│   └── virus-scan.processor.ts
├── dto/
│   ├── upload-document.dto.ts
│   ├── update-document.dto.ts
│   ├── create-folder.dto.ts
│   ├── search-documents.dto.ts
│   └── create-share.dto.ts
└── entities/ (as above)
```

### Storage Service

```typescript
// src/modules/documents/storage.service.ts
@Injectable()
export class StorageService {
  private s3: S3Client;

  constructor(private config: ConfigService) {
    this.s3 = new S3Client({
      region: config.get('AWS_REGION'),
      endpoint: config.get('S3_ENDPOINT'),     // MinIO endpoint if self-hosted
      credentials: {
        accessKeyId: config.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE') === 'true', // MinIO requires this
    });
  }

  /**
   * Generates a pre-signed PUT URL for direct browser-to-S3 upload.
   * Avoids routing large files through the app server.
   */
  async getUploadPresignedUrl(key: string, mimeType: string, maxBytes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.get('S3_BUCKET'),
      Key: key,
      ContentType: mimeType,
      ContentLength: maxBytes,
      ServerSideEncryption: 'AES256',
    });
    return getSignedUrl(this.s3, command, { expiresIn: 300 }); // 5 min
  }

  /**
   * Generates a pre-signed GET URL for secure file access.
   * TTL varies by use case: preview=1h, download=5min, share=24h
   */
  async getDownloadPresignedUrl(key: string, filename: string, ttlSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.get('S3_BUCKET'),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
    return getSignedUrl(this.s3, command, { expiresIn: ttlSeconds });
  }

  async getPreviewPresignedUrl(key: string, mimeType: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.get('S3_BUCKET'),
      Key: key,
      ResponseContentType: mimeType,
      ResponseContentDisposition: 'inline',
    });
    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.config.get('S3_BUCKET'),
      Key: key,
    }));
  }

  /**
   * Generates the S3 storage key with a structure that enables lifecycle policies.
   * Pattern: {companyId}/{entityType}/{entityId}/{year}/{uuid}/{filename}
   */
  generateStorageKey(companyId: string, entityType: string, entityId: string, filename: string): string {
    const year = new Date().getFullYear();
    const uid = uuidv4();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${companyId}/${entityType}/${entityId}/${year}/${uid}/${safeFilename}`;
  }
}
```

### Documents Service

```typescript
// src/modules/documents/documents.service.ts
@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion) private versionRepo: Repository<DocumentVersion>,
    private storageService: StorageService,
    private ocrService: OcrService,
    private virusScanService: VirusScanService,
    @InjectQueue('ocr') private ocrQueue: Queue,
    @InjectQueue('virus-scan') private scanQueue: Queue,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Step 1: Client requests an upload slot.
   * Returns a pre-signed S3 URL + a pending document record.
   * Client uploads directly to S3, then calls confirmUpload().
   */
  async requestUpload(dto: RequestUploadDto, uploadedBy: string): Promise<UploadSlotResponse> {
    const storageKey = this.storageService.generateStorageKey(
      dto.companyId,
      dto.entityType ?? 'general',
      dto.entityId ?? 'misc',
      dto.filename,
    );

    const presignedUrl = await this.storageService.getUploadPresignedUrl(
      storageKey,
      dto.mimeType,
      dto.fileSize,
    );

    const doc = await this.docRepo.save({
      companyId: dto.companyId,
      propertyId: dto.propertyId,
      folderId: dto.folderId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      name: dto.name ?? dto.filename,
      originalFilename: dto.filename,
      mimeType: dto.mimeType,
      extension: dto.filename.split('.').pop()?.toLowerCase(),
      fileSize: dto.fileSize,
      storageKey,
      storageBucket: this.config.get('S3_BUCKET'),
      category: dto.category,
      description: dto.description,
      tags: dto.tags ?? [],
      expiryDate: dto.expiryDate,
      expiryReminderDays: dto.expiryReminderDays ?? [90, 30, 7],
      isConfidential: dto.isConfidential ?? false,
      status: 'pending_upload',  // temporary status until confirmed
      ocrStatus: this.isOcrSupported(dto.mimeType) ? 'pending' : 'skipped',
      virusScanStatus: 'pending',
      uploadedBy,
    });

    return { documentId: doc.id, presignedUrl, storageKey, expiresIn: 300 };
  }

  /**
   * Step 2: Called after client successfully uploads to S3.
   * Triggers virus scan and OCR queue jobs.
   */
  async confirmUpload(documentId: string, checksumSha256?: string): Promise<Document> {
    const doc = await this.docRepo.findOneOrFail({ where: { id: documentId } });

    await this.docRepo.update(documentId, {
      status: 'active',
      checksumSha256,
    });

    // Queue virus scan (high priority)
    await this.scanQueue.add('scan', { documentId }, { priority: 1 });

    // Queue OCR (lower priority, can run after scan clears)
    if (doc.ocrStatus === 'pending') {
      await this.ocrQueue.add('ocr', { documentId }, { priority: 5, delay: 5000 });
    }

    return this.docRepo.findOneOrFail({ where: { id: documentId } });
  }

  /**
   * Upload new version of an existing document.
   * Saves current version to document_versions, increments current_version.
   */
  async uploadNewVersion(
    documentId: string,
    dto: UploadNewVersionDto,
    uploadedBy: string,
  ): Promise<UploadSlotResponse> {
    const doc = await this.docRepo.findOneOrFail({ where: { id: documentId } });

    // Archive current version
    await this.versionRepo.save({
      documentId: doc.id,
      versionNumber: doc.currentVersion,
      storageKey: doc.storageKey,
      originalFilename: doc.originalFilename,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      checksumSha256: doc.checksumSha256,
      changeNotes: dto.changeNotes,
      uploadedBy: doc.uploadedBy,
    });

    // Generate new storage key for the new version
    const newKey = this.storageService.generateStorageKey(
      doc.companyId, doc.entityType ?? 'general', doc.entityId ?? 'misc', dto.filename,
    );

    const presignedUrl = await this.storageService.getUploadPresignedUrl(newKey, dto.mimeType, dto.fileSize);

    await this.docRepo.update(documentId, {
      storageKey: newKey,
      originalFilename: dto.filename,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      currentVersion: doc.currentVersion + 1,
      ocrStatus: this.isOcrSupported(dto.mimeType) ? 'pending' : 'skipped',
      virusScanStatus: 'pending',
    });

    return { documentId: doc.id, presignedUrl, storageKey: newKey, expiresIn: 300 };
  }

  async getPreviewUrl(documentId: string, userId: string): Promise<string> {
    const doc = await this.docRepo.findOneOrFail({ where: { id: documentId } });
    await this.checkAccess(doc, userId);
    await this.logAccess(documentId, userId, 'preview');
    return this.storageService.getPreviewPresignedUrl(doc.storageKey, doc.mimeType);
  }

  async getDownloadUrl(documentId: string, userId: string): Promise<string> {
    const doc = await this.docRepo.findOneOrFail({ where: { id: documentId } });
    await this.checkAccess(doc, userId);
    await this.logAccess(documentId, userId, 'download');
    return this.storageService.getDownloadPresignedUrl(doc.storageKey, doc.originalFilename, 300);
  }

  async search(dto: SearchDocumentsDto, companyId: string): Promise<SearchResult[]> {
    // Full-text search via Elasticsearch, filters applied as ES filters
    return this.ocrService.search(dto.query, companyId, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      category: dto.category,
      tags: dto.tags,
    });
  }

  private isOcrSupported(mimeType: string): boolean {
    return ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'].includes(mimeType);
  }
}
```

### OCR Service

```typescript
// src/modules/documents/ocr.service.ts
@Injectable()
export class OcrService {
  private textractClient: TextractClient;
  private esClient: Client;  // Elasticsearch client

  async processDocument(documentId: string): Promise<void> {
    const doc = await this.docRepo.findOneOrFail({ where: { id: documentId } });
    await this.docRepo.update(documentId, { ocrStatus: 'processing' });

    try {
      let extractedText: string;

      if (doc.mimeType === 'application/pdf') {
        extractedText = await this.extractPdfText(doc.storageKey, doc.storageBucket);
      } else {
        extractedText = await this.extractImageText(doc.storageKey, doc.storageBucket);
      }

      await this.docRepo.update(documentId, { ocrText: extractedText, ocrStatus: 'done' });
      await this.indexDocument(doc, extractedText);
    } catch (err) {
      await this.docRepo.update(documentId, { ocrStatus: 'failed' });
      throw err;
    }
  }

  private async extractPdfText(key: string, bucket: string): Promise<string> {
    // AWS Textract async for multi-page PDFs
    const startResponse = await this.textractClient.send(new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    }));

    // Poll for completion (or use SNS callback in production)
    return this.pollTextractJob(startResponse.JobId!);
  }

  async indexDocument(doc: Document, ocrText: string): Promise<void> {
    await this.esClient.index({
      index: `pms-documents-${doc.companyId}`,
      id: doc.id,
      document: {
        id: doc.id,
        name: doc.name,
        originalFilename: doc.originalFilename,
        category: doc.category,
        tags: doc.tags,
        entityType: doc.entityType,
        entityId: doc.entityId,
        propertyId: doc.propertyId,
        ocrText,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
        expiryDate: doc.expiryDate,
      },
    });
  }

  async search(query: string, companyId: string, filters: SearchFilters): Promise<SearchResult[]> {
    const must: any[] = [{ multi_match: { query, fields: ['name^3', 'originalFilename^2', 'tags^2', 'ocrText'], fuzziness: 'AUTO' } }];
    const filter: any[] = [];

    if (filters.entityType) filter.push({ term: { entityType: filters.entityType } });
    if (filters.entityId) filter.push({ term: { entityId: filters.entityId } });
    if (filters.category) filter.push({ term: { category: filters.category } });
    if (filters.tags?.length) filter.push({ terms: { tags: filters.tags } });

    const result = await this.esClient.search({
      index: `pms-documents-${companyId}`,
      body: {
        query: { bool: { must, filter } },
        highlight: { fields: { ocrText: { fragment_size: 200, number_of_fragments: 2 } } },
        _source: ['id', 'name', 'category', 'entityType', 'entityId', 'createdAt'],
        size: 20,
      },
    });

    return result.hits.hits.map(hit => ({
      ...hit._source,
      score: hit._score,
      highlights: hit.highlight?.ocrText ?? [],
    }));
  }
}
```

### Expiry Service

```typescript
// src/modules/documents/expiry.service.ts
@Injectable()
export class ExpiryService {
  @Cron('0 8 * * *')  // 8 AM daily
  async checkExpiringDocuments(): Promise<void> {
    const today = new Date();

    // Find documents where today is within any configured reminder window
    const documents = await this.docRepo
      .createQueryBuilder('d')
      .where('d.expiry_date IS NOT NULL')
      .andWhere('d.deleted_at IS NULL')
      .andWhere('d.status NOT IN (:...excluded)', { excluded: ['archived'] })
      .getMany();

    for (const doc of documents) {
      const daysUntilExpiry = Math.ceil((doc.expiryDate.getTime() - today.getTime()) / 86400000);

      if (doc.expiryReminderDays.includes(daysUntilExpiry)) {
        await this.notificationsService.send({
          templateCode: 'document_expiring',
          companyId: doc.companyId,
          recipientIds: [doc.uploadedBy],
          channels: ['email', 'in_app'],
          variables: {
            documentName: doc.name,
            entityType: doc.entityType,
            entityId: doc.entityId,
            daysUntilExpiry,
            expiryDate: doc.expiryDate.toISOString().split('T')[0],
          },
          entityType: 'document',
          entityId: doc.id,
        });
      }
    }
  }
}
```

---

## API Contract

### `POST /documents/upload-request`
**Access:** `documents.upload`

**Request Body:**
```json
{
  "filename": "lease_agreement_unit12A.pdf",
  "mimeType": "application/pdf",
  "fileSize": 2048576,
  "entityType": "lease",
  "entityId": "uuid",
  "folderId": "uuid",
  "name": "Lease Agreement — Unit 12A",
  "category": "contract",
  "description": "Signed lease agreement for Unit 12A",
  "tags": ["signed", "2025", "residential"],
  "expiryDate": "2026-01-31",
  "expiryReminderDays": [90, 30, 7],
  "isConfidential": false
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "documentId": "uuid",
    "presignedUrl": "https://s3.amazonaws.com/bucket/key?X-Amz-Signature=...",
    "storageKey": "company-id/lease/uuid/2025/uuid/lease_agreement.pdf",
    "expiresIn": 300
  }
}
```

---

### `POST /documents/:id/confirm-upload`
**Access:** `documents.upload`

**Request Body:**
```json
{ "checksumSha256": "abc123..." }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Lease Agreement — Unit 12A",
    "status": "active",
    "virusScanStatus": "pending",
    "ocrStatus": "pending"
  }
}
```

---

### `GET /documents/:id`
**Access:** `documents.read` or entity owner

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Lease Agreement — Unit 12A",
    "originalFilename": "lease_agreement_unit12A.pdf",
    "mimeType": "application/pdf",
    "fileSize": 2048576,
    "fileSizeFormatted": "2.0 MB",
    "category": "contract",
    "description": "Signed lease agreement for Unit 12A",
    "tags": ["signed", "2025", "residential"],
    "status": "active",
    "currentVersion": 2,
    "expiryDate": "2026-01-31",
    "daysUntilExpiry": 351,
    "isConfidential": false,
    "virusScanStatus": "clean",
    "ocrStatus": "done",
    "entityType": "lease",
    "entityId": "uuid",
    "uploadedBy": { "id": "uuid", "fullName": "John Agent" },
    "folder": { "id": "uuid", "name": "Contracts", "path": "/root/contracts/2025/" },
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:05:00Z"
  }
}
```

---

### `GET /documents/:id/preview-url`
**Access:** `documents.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "url": "https://s3.amazonaws.com/...",
    "expiresIn": 3600,
    "mimeType": "application/pdf"
  }
}
```

---

### `GET /documents/:id/download-url`
**Access:** `documents.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "url": "https://s3.amazonaws.com/...",
    "expiresIn": 300,
    "filename": "lease_agreement_unit12A.pdf"
  }
}
```

---

### `PUT /documents/:id`
**Access:** `documents.update` or uploader

```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "tags": ["signed", "2025", "updated"],
  "expiryDate": "2026-06-30",
  "category": "contract"
}
```

---

### `DELETE /documents/:id`
**Access:** `documents.delete`  
Soft delete only. Sets `deleted_at`. S3 object kept for 90 days via lifecycle policy.

---

### `POST /documents/:id/new-version`
**Access:** `documents.upload`

**Request Body:**
```json
{
  "filename": "lease_agreement_unit12A_v2.pdf",
  "mimeType": "application/pdf",
  "fileSize": 2150000,
  "changeNotes": "Updated rent amount per amendment"
}
```

**Response 200:** Same as upload-request (presignedUrl + storageKey)

---

### `GET /documents/:id/versions`
**Access:** `documents.read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "versionNumber": 2,
      "isCurrent": true,
      "originalFilename": "lease_agreement_unit12A_v2.pdf",
      "fileSize": 2150000,
      "changeNotes": "Updated rent amount per amendment",
      "uploadedBy": { "id": "uuid", "fullName": "John Agent" },
      "createdAt": "2025-01-20T09:00:00Z"
    },
    {
      "versionNumber": 1,
      "isCurrent": false,
      "originalFilename": "lease_agreement_unit12A.pdf",
      "fileSize": 2048576,
      "changeNotes": null,
      "uploadedBy": { "id": "uuid", "fullName": "John Agent" },
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

### `GET /documents/:id/versions/:versionNumber/download-url`
**Access:** `documents.read`

---

### `GET /documents`
**Access:** `documents.read`  
**Query:** `?entityType=lease&entityId=&folderId=&category=&tags=signed,2025&status=active&page=1&limit=20&sort=createdAt&order=desc`

---

### `GET /documents/search`
**Access:** `documents.read`  
**Query:** `?q=lease+unit+12A&entityType=lease&category=contract`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Lease Agreement — Unit 12A",
      "category": "contract",
      "score": 4.82,
      "highlights": [
        "...the <em>lease</em> for <em>Unit 12A</em> commencing February 2025..."
      ],
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

### `GET /documents/expiring`
**Access:** `documents.read`  
**Query:** `?days=30&entityType=&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Trade License — ABC Corp",
      "expiryDate": "2025-02-14",
      "daysUntilExpiry": 7,
      "entityType": "tenant",
      "entityId": "uuid",
      "uploadedBy": { "fullName": "John Agent" }
    }
  ]
}
```

---

### Folders

### `GET /document-folders`
**Query:** `?tree=true&propertyId=&entityType=&entityId=`

### `POST /document-folders`
```json
{
  "name": "Contracts 2025",
  "parentId": "uuid",
  "propertyId": "uuid",
  "entityType": "property",
  "entityId": "uuid",
  "accessPolicy": "property"
}
```

### `PUT /document-folders/:id`
### `DELETE /document-folders/:id`

---

### `POST /documents/:id/share`
**Access:** `documents.share`

```json
{
  "shareType": "view",
  "expiresAt": "2025-01-22T23:59:59Z",
  "maxAccesses": 5,
  "password": "optional-password"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "shareId": "uuid",
    "shareUrl": "https://app.pms.com/shared/documents/token123",
    "expiresAt": "2025-01-22T23:59:59Z"
  }
}
```

### `GET /shared/documents/:token`
**Access:** Public (token-based)

---

### `POST /documents/:id/submit-for-approval`
**Access:** `documents.submit`

```json
{
  "workflowDefinitionId": "uuid",
  "notes": "Please review and approve this contract."
}
```

---

## Business Logic & Validation Rules

### Upload Validation
```
Pre-upload (server-side, before presigned URL issued):
1. File size: max 500 MB per file (configurable per company plan)
2. Mime type whitelist:
   Allowed: PDF, DOCX, XLSX, PPTX, PNG, JPG, JPEG, WEBP, TIFF, MP4, ZIP
   Blocked: .exe, .sh, .bat, .js, .php, and all executables
3. Filename sanitization: strip path traversal characters (../, ..\)
4. Rate limit: 50 uploads per user per hour

Post-upload (async, after S3 upload confirmed):
1. Virus scan (ClamAV via clamav-scanner NPM or ClamAV REST API)
   - If infected: status='quarantined', delete S3 object, notify admin + uploader
   - If error: retry 3x, then mark virus_scan_status='error', manual review required
2. Checksum verification: SHA-256 computed from S3 object metadata vs client-provided
3. OCR queued for PDF/image types
```

### Access Control
```
Document access check order:
1. User has company_id match (always required)
2. If is_confidential: must have 'documents.read_confidential' permission
3. If document linked to entity: user must have read access to that entity
   (e.g., linked to lease → must have leases.read permission for that property)
4. If folder has access_policy='private': only uploader + admin can access
5. Admin (system role) bypasses all entity-level checks
```

### Version Retention
```
- Keep all versions indefinitely (by default)
- Company-level setting: maxVersionsToKeep (default: unlimited)
- Archived versions: S3 object moved to Glacier storage class after 90 days
- Deleted document: S3 object retained 90 days then auto-deleted via S3 lifecycle rule
```

---

## UI Screens & Component Breakdown

```
documents/
├── DocumentManagerPage/
│   ├── DocumentManagerPage.tsx          # split: FolderTree (left) + DocumentList (right)
│   └── components/
│       ├── FolderTree/
│       │   ├── FolderTree.tsx
│       │   ├── FolderNode.tsx           # folder icon + name + context menu
│       │   └── NewFolderModal.tsx
│       ├── DocumentList/
│       │   ├── DocumentList.tsx         # grid or list toggle
│       │   ├── DocumentCard.tsx         # thumbnail + name + size + badges
│       │   │   ├── FileTypeIcon.tsx     # icon by mime type
│       │   │   ├── VirusBadge.tsx       # clean/scanning/infected
│       │   │   └── ExpiryBadge.tsx      # green/orange/red by days remaining
│       │   └── DocumentListRow.tsx      # table row variant
│       ├── DocumentFilters.tsx          # search + category + tags + expiry filter
│       └── UploadButton.tsx

├── DocumentUploadModal/
│   ├── DocumentUploadModal.tsx
│   └── components/
│       ├── DropZone.tsx                 # react-dropzone, multi-file
│       ├── FileQueueItem.tsx            # individual file: name + size + upload progress
│       ├── UploadProgress.tsx           # progress bar per file (S3 direct upload with XMLHttpRequest)
│       └── DocumentMetadataForm.tsx     # category, tags, expiry, description

├── DocumentDetailDrawer/
│   ├── DocumentDetailDrawer.tsx         # slide-in from right
│   └── components/
│       ├── DocumentPreview.tsx          # PDF.js viewer for PDFs; image preview for images
│       ├── DocumentMetaPanel.tsx        # all metadata
│       ├── VersionHistoryList.tsx       # version cards with download buttons
│       ├── AccessLogTable.tsx           # who viewed/downloaded + when
│       └── DocumentActions.tsx          # download, share, new version, delete, submit for approval

├── DocumentSearchPage/
│   └── components/
│       ├── SearchBar.tsx                # large search input
│       ├── SearchResults.tsx
│       └── SearchResultCard.tsx         # with highlighted OCR text snippet

└── ExpiringDocumentsWidget/             # used in dashboards
    └── ExpiryRow.tsx
```

### Key UI Behaviors

```
DropZone upload flow:
1. User drops files onto DropZone
2. Frontend validates: size, mime type (client-side pre-check)
3. For each file: POST /documents/upload-request → get presignedUrl
4. Upload directly to presignedUrl via XMLHttpRequest (tracks progress via XHR.upload.onprogress)
5. On XHR complete: POST /documents/:id/confirm-upload
6. Show per-file status: Uploading → Scanning → Ready

DocumentPreview (PDF.js):
- Renders inside DocumentDetailDrawer via react-pdf library
- Page navigation, zoom in/out, full-screen mode
- "Download" button fetches fresh download presigned URL on click
- For non-PDF files: image lightbox (react-image-lightbox), or "Preview not available" for other types

ExpiryBadge color rules:
- > 90 days: no badge
- 31–90 days: yellow badge "Expires in N days"
- 8–30 days: orange badge "Expires in N days"
- 1–7 days: red badge "Expires in N days" (pulsing animation)
- Expired: red solid badge "Expired"
```

---

## State Management

```typescript
// src/store/api/documentsApi.ts
export const documentsApi = createApi({
  reducerPath: 'documentsApi',
  tagTypes: ['Documents', 'Folders', 'Versions'],
  endpoints: (builder) => ({
    requestUpload: builder.mutation<UploadSlotResponse, RequestUploadDto>({
      query: (body) => ({ url: '/documents/upload-request', method: 'POST', body }),
    }),
    confirmUpload: builder.mutation<Document, { id: string; checksumSha256?: string }>({
      query: ({ id, ...body }) => ({ url: `/documents/${id}/confirm-upload`, method: 'POST', body }),
      invalidatesTags: ['Documents'],
    }),
    getDocument: builder.query<Document, string>({
      query: (id) => `/documents/${id}`,
      providesTags: (_, __, id) => [{ type: 'Documents', id }],
    }),
    getDocuments: builder.query<PaginatedResponse<Document>, DocumentQueryParams>({
      query: (params) => ({ url: '/documents', params }),
      providesTags: ['Documents'],
    }),
    getPreviewUrl: builder.query<{ url: string; expiresIn: number }, string>({
      query: (id) => `/documents/${id}/preview-url`,
    }),
    getDownloadUrl: builder.query<{ url: string; filename: string }, string>({
      query: (id) => `/documents/${id}/download-url`,
    }),
    updateDocument: builder.mutation<Document, { id: string; data: UpdateDocumentDto }>({
      query: ({ id, data }) => ({ url: `/documents/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Documents', id }],
    }),
    deleteDocument: builder.mutation<void, string>({
      query: (id) => ({ url: `/documents/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Documents'],
    }),
    getVersions: builder.query<DocumentVersion[], string>({
      query: (id) => `/documents/${id}/versions`,
      providesTags: (_, __, id) => [{ type: 'Versions', id }],
    }),
    searchDocuments: builder.query<SearchResult[], SearchDocumentsParams>({
      query: (params) => ({ url: '/documents/search', params }),
    }),
    getExpiringDocuments: builder.query<Document[], { days: number }>({
      query: (params) => ({ url: '/documents/expiring', params }),
      providesTags: ['Documents'],
    }),
    getFolderTree: builder.query<FolderNode[], FolderQueryParams>({
      query: (params) => ({ url: '/document-folders', params: { ...params, tree: true } }),
      providesTags: ['Folders'],
    }),
    createFolder: builder.mutation<Folder, CreateFolderDto>({
      query: (body) => ({ url: '/document-folders', method: 'POST', body }),
      invalidatesTags: ['Folders'],
    }),
    shareDocument: builder.mutation<ShareResponse, { id: string; data: CreateShareDto }>({
      query: ({ id, data }) => ({ url: `/documents/${id}/share`, method: 'POST', body: data }),
    }),
  }),
});

// Upload helper (handles direct-to-S3 with progress)
// src/hooks/useDocumentUpload.ts
export const useDocumentUpload = () => {
  const [requestUpload] = documentsApi.useRequestUploadMutation();
  const [confirmUpload] = documentsApi.useConfirmUploadMutation();

  const upload = async (
    file: File,
    metadata: RequestUploadDto,
    onProgress: (pct: number) => void,
  ): Promise<Document> => {
    // Step 1: Get presigned URL
    const slot = await requestUpload({ ...metadata, filename: file.name, fileSize: file.size, mimeType: file.type }).unwrap();

    // Step 2: Upload to S3 directly with progress tracking
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', slot.presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });

    // Step 3: Compute SHA-256 checksum
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const checksumSha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Step 4: Confirm upload
    return confirmUpload({ id: slot.documentId, checksumSha256 }).unwrap();
  };

  return { upload };
};
```

---

## Environment Variables

```env
# S3 / MinIO
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=pms-documents
S3_ENDPOINT=                         # Leave blank for AWS S3; set for MinIO e.g. http://minio:9000
S3_FORCE_PATH_STYLE=false            # true for MinIO

# OCR
AWS_TEXTRACT_REGION=us-east-1        # Textract only available in certain regions

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=

# Virus Scanning
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# File Limits
MAX_UPLOAD_SIZE_MB=500
MAX_UPLOADS_PER_HOUR=50
```
