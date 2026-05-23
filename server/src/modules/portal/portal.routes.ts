import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { portalService } from './portal.service';
import { residentsService } from './residents.service';
import {
  submitMaintenanceSchema, rateTicketSchema,
  createResidentSchema, updateResidentSchema,
  updateProfileSchema,
} from './portal.schema';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

const p = (req: Request, key: string) => req.params[key] as string;

// ═══════════════════════════════════════════════
// PORTAL ROUTER — /api/v1/portal
// ═══════════════════════════════════════════════
export const portalRouter = Router();

// ────────────────────────────────────────────────
// DASHBOARD
// ────────────────────────────────────────────────

/** GET /portal/dashboard */
portalRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const data = await portalService.getDashboardData(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// INVOICES
// ────────────────────────────────────────────────

/** GET /portal/invoices */
portalRouter.get('/invoices', asyncHandler(async (req, res) => {
  const result = await portalService.getInvoices(req.user!.companyId, req.user!.sub, {
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 10, 50),
  });
  res.json({ success: true, ...result });
}));

/** GET /portal/invoices/:id/download */
portalRouter.get('/invoices/:id/download', asyncHandler(async (req, res) => {
  // Placeholder: In production, generate or fetch a pre-signed PDF URL
  res.json({
    success: true,
    data: { downloadUrl: `/api/v1/invoices/${p(req, 'id')}/pdf` },
  });
}));

// ────────────────────────────────────────────────
// PAYMENTS
// ────────────────────────────────────────────────

/** GET /portal/payments/history */
portalRouter.get('/payments/history', asyncHandler(async (req, res) => {
  const data = await portalService.getPaymentHistory(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// LEASE
// ────────────────────────────────────────────────

/** GET /portal/lease */
portalRouter.get('/lease', asyncHandler(async (req, res) => {
  const data = await portalService.getLeaseDetail(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** GET /portal/lease/documents */
portalRouter.get('/lease/documents', asyncHandler(async (req, res) => {
  const data = await portalService.getLeaseDocuments(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// MAINTENANCE
// ────────────────────────────────────────────────

/** GET /portal/maintenance */
portalRouter.get('/maintenance', asyncHandler(async (req, res) => {
  const data = await portalService.getMaintenanceTickets(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** GET /portal/maintenance/:id */
portalRouter.get('/maintenance/:id', asyncHandler(async (req, res) => {
  const data = await portalService.getMaintenanceTicketById(
    req.user!.companyId, req.user!.sub, p(req, 'id'),
  );
  res.json({ success: true, data });
}));

/** POST /portal/maintenance */
portalRouter.post('/maintenance', validateRequest(submitMaintenanceSchema), asyncHandler(async (req, res) => {
  const data = await portalService.submitMaintenanceRequest(
    req.user!.companyId, req.user!.sub, req.body,
  );
  res.status(201).json({ success: true, data });
}));

/** POST /portal/maintenance/:id/rate */
portalRouter.post('/maintenance/:id/rate', validateRequest(rateTicketSchema), asyncHandler(async (req, res) => {
  const data = await portalService.rateTicket(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body,
  );
  res.json({ success: true, data });
}));

// ── Photo Upload ─────────────────────────────
const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'portal');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/** POST /portal/maintenance/:id/photos */
portalRouter.post('/maintenance/:id/photos', upload.array('photos', 5), asyncHandler(async (req, res) => {
  // Verify ticket belongs to user's unit
  const ticket = await portalService.getMaintenanceTicketById(
    req.user!.companyId, req.user!.sub, p(req, 'id'),
  );

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    throw AppError.validation('No photos uploaded');
  }

  const photoData = files.map((f) => ({
    companyId: req.user!.companyId,
    ticketId: ticket.id,
    storageKey: `portal/${f.filename}`,
    url: `/storage/portal/${f.filename}`,
    photoType: 'before',
    caption: null,
    uploadedById: req.user!.sub,
  }));

  await prisma.ticketPhoto.createMany({ data: photoData });
  const photos = await prisma.ticketPhoto.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'desc' },
    take: files.length,
  });

  res.status(201).json({ success: true, data: photos });
}));

// ────────────────────────────────────────────────
// RESIDENTS
// ────────────────────────────────────────────────

/** GET /portal/residents */
portalRouter.get('/residents', asyncHandler(async (req, res) => {
  const data = await residentsService.findAll(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /portal/residents */
portalRouter.post('/residents', validateRequest(createResidentSchema), asyncHandler(async (req, res) => {
  const data = await residentsService.create(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /portal/residents/:id */
portalRouter.put('/residents/:id', validateRequest(updateResidentSchema), asyncHandler(async (req, res) => {
  const data = await residentsService.update(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body,
  );
  res.json({ success: true, data });
}));

/** DELETE /portal/residents/:id */
portalRouter.delete('/residents/:id', asyncHandler(async (req, res) => {
  await residentsService.remove(req.user!.companyId, req.user!.sub, p(req, 'id'));
  res.json({ success: true, data: { message: 'Resident removed' } });
}));

// ────────────────────────────────────────────────
// PROFILE
// ────────────────────────────────────────────────

/** GET /portal/profile */
portalRouter.get('/profile', asyncHandler(async (req, res) => {
  const data = await portalService.getProfile(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** PUT /portal/profile */
portalRouter.put('/profile', validateRequest(updateProfileSchema), asyncHandler(async (req, res) => {
  const data = await portalService.updateProfile(req.user!.companyId, req.user!.sub, req.body);
  res.json({ success: true, data });
}));
