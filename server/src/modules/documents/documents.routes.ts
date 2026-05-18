import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { asyncHandler } from '../../middleware';
import { documentsService } from './services/documents.service';
import { foldersService } from './services/folders.service';

// Multer setup — store in memory for processing before saving
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// ═══════════════════════════════════════════════════
// DOCUMENTS ROUTES
// ═══════════════════════════════════════════════════

export const documentsRouter = Router();

/** POST /documents — Upload a document */
documentsRouter.post('/', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, errors: [{ message: 'No file provided' }] });
    return;
  }

  const result = await documentsService.uploadDocument(
    req.file,
    {
      companyId: req.user!.companyId,
      propertyId: req.body.propertyId,
      folderId: req.body.folderId,
      entityType: req.body.entityType,
      entityId: req.body.entityId,
      name: req.body.name,
      category: req.body.category,
      description: req.body.description,
      tags: req.body.tags ? JSON.parse(req.body.tags) : undefined,
      expiryDate: req.body.expiryDate,
      isConfidential: req.body.isConfidential === 'true',
    },
    req.user!.sub,
  );

  res.status(201).json({ success: true, data: result });
}));

/** GET /documents — List documents with filters */
documentsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await documentsService.listDocuments(req.user!.companyId, {
    entityType: req.query.entityType as string,
    entityId: req.query.entityId as string,
    folderId: req.query.folderId as string,
    category: req.query.category as string,
    tags: req.query.tags as string,
    status: req.query.status as string,
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
    sort: req.query.sort as string,
    order: req.query.order as string,
  });

  res.json({ success: true, ...result });
}));

/** GET /documents/expiring — Get expiring documents */
documentsRouter.get('/expiring', asyncHandler(async (req: Request, res: Response) => {
  const result = await documentsService.getExpiringDocuments(
    req.user!.companyId,
    parseInt(req.query.days as string) || 30,
    parseInt(req.query.page as string) || 1,
    parseInt(req.query.limit as string) || 20,
  );
  res.json({ success: true, ...result });
}));

/** GET /documents/:id — Get document detail */
documentsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const doc = await documentsService.getDocument(req.params.id as string, req.user!.companyId);
  res.json({ success: true, data: doc });
}));

/** PUT /documents/:id — Update document metadata */
documentsRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const doc = await documentsService.updateDocument(req.params.id as string, req.user!.companyId, req.body);
  res.json({ success: true, data: doc });
}));

/** DELETE /documents/:id — Soft delete */
documentsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await documentsService.deleteDocument(req.params.id as string, req.user!.companyId);
  res.status(204).send();
}));

/** POST /documents/:id/versions — Upload new version */
documentsRouter.post('/:id/versions', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, errors: [{ message: 'No file provided' }] });
    return;
  }

  const doc = await documentsService.uploadNewVersion(
    req.params.id as string,
    req.user!.companyId,
    req.file,
    req.body.changeNotes,
    req.user!.sub,
  );

  res.json({ success: true, data: doc });
}));

/** GET /documents/:id/versions — Get version history */
documentsRouter.get('/:id/versions', asyncHandler(async (req: Request, res: Response) => {
  const versions = await documentsService.getVersions(req.params.id as string, req.user!.companyId);
  res.json({ success: true, data: versions });
}));

/** GET /documents/:id/download — Get download URL / stream file */
documentsRouter.get('/:id/download', asyncHandler(async (req: Request, res: Response) => {
  const info = await documentsService.getDownloadInfo(
    req.params.id as string, req.user!.companyId, req.user!.sub,
  );

  // Stream the file directly
  res.download(info.filePath, info.filename);
}));

/** GET /documents/:id/preview — Get preview info */
documentsRouter.get('/:id/preview', asyncHandler(async (req: Request, res: Response) => {
  const info = await documentsService.getPreviewInfo(
    req.params.id as string, req.user!.companyId, req.user!.sub,
  );
  res.json({ success: true, data: info });
}));

/** POST /documents/:id/share — Create share link */
documentsRouter.post('/:id/share', asyncHandler(async (req: Request, res: Response) => {
  const result = await documentsService.createShareLink(
    req.params.id as string,
    req.user!.companyId,
    req.body,
    req.user!.sub,
  );
  res.json({ success: true, data: result });
}));

// ═══════════════════════════════════════════════════
// DOCUMENT FOLDERS ROUTES
// ═══════════════════════════════════════════════════

export const documentFoldersRouter = Router();

/** GET /document-folders — List/tree folders */
documentFoldersRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await foldersService.listFolders(req.user!.companyId, {
    parentId: req.query.parentId as string,
    propertyId: req.query.propertyId as string,
    entityType: req.query.entityType as string,
    entityId: req.query.entityId as string,
    tree: req.query.tree === 'true',
  });
  res.json({ success: true, data: result });
}));

/** POST /document-folders — Create folder */
documentFoldersRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const folder = await foldersService.createFolder(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data: folder });
}));

/** PUT /document-folders/:id — Update folder */
documentFoldersRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const folder = await foldersService.updateFolder(req.params.id as string, req.user!.companyId, req.body);
  res.json({ success: true, data: folder });
}));

/** DELETE /document-folders/:id — Delete folder */
documentFoldersRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await foldersService.deleteFolder(req.params.id as string, req.user!.companyId);
  res.status(204).send();
}));
