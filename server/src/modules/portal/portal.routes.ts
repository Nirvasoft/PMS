import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { portalService } from './portal.service';
import { residentsService } from './residents.service';
import {
  submitMaintenanceSchema, rateTicketSchema,
  createResidentSchema, updateResidentSchema,
  updateProfileSchema, payInvoiceSchema, inviteResidentSchema,
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

/** POST /portal/invoices/:id/pay — Initiate Stripe Checkout */
portalRouter.post('/invoices/:id/pay', validateRequest(payInvoiceSchema), asyncHandler(async (req, res) => {
  const data = await portalService.payInvoice(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body.returnUrl,
  );
  res.json({ success: true, data });
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

/** POST /portal/residents/:id/invite-portal — Send portal invitation */
portalRouter.post('/residents/:id/invite-portal', validateRequest(inviteResidentSchema), asyncHandler(async (req, res) => {
  const data = await residentsService.inviteToPortal(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body.email,
  );
  res.json({ success: true, data });
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

// ────────────────────────────────────────────────
// KYC SELF-UPLOAD
// ────────────────────────────────────────────────

/** GET /portal/kyc — Get KYC status and document checklist */
portalRouter.get('/kyc', asyncHandler(async (req, res) => {
  const data = await portalService.getKycStatus(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /portal/kyc/documents — Submit/upload a KYC document */
portalRouter.post('/kyc/documents', asyncHandler(async (req, res) => {
  const data = await portalService.submitKycDocument(req.user!.companyId, req.user!.sub, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// ADMIN PORTAL BRANDING — /api/v1/admin/portal/branding
// ════════════════════════════════════════════════
export const adminPortalBrandingRouter = Router();

/** GET /admin/portal/branding?propertyId=xxx */
adminPortalBrandingRouter.get('/', asyncHandler(async (req, res) => {
  const propertyId = req.query.propertyId as string;
  if (!propertyId) throw new Error('propertyId is required');
  const data = await portalService.getPortalBranding(req.user!.companyId, propertyId);
  res.json({ success: true, data });
}));

/** PUT /admin/portal/branding?propertyId=xxx */
adminPortalBrandingRouter.put('/', asyncHandler(async (req, res) => {
  const propertyId = req.query.propertyId as string;
  if (!propertyId) throw new Error('propertyId is required');
  const data = await portalService.updatePortalBranding(req.user!.companyId, propertyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// ADMIN ACCESS CARDS — /api/v1/admin/access-cards
// ════════════════════════════════════════════════
export const adminAccessCardsRouter = Router();

/** GET /admin/access-cards — List with filters */
adminAccessCardsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await portalService.getAccessCards(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    residentId: req.query.residentId as string,
    status: req.query.status as string,
    cardType: req.query.cardType as string,
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 25, 50),
  });
  res.json({ success: true, ...data });
}));

/** GET /admin/access-cards/stats — Summary stats */
adminAccessCardsRouter.get('/stats', asyncHandler(async (req, res) => {
  const data = await portalService.getAccessCardStats(req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /admin/access-cards — Issue new card */
adminAccessCardsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await portalService.issueAccessCard(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /admin/access-cards/:id — Update card (status/notes/expiry) */
adminAccessCardsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await portalService.updateAccessCard(req.user!.companyId, req.params.id as string, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// ADMIN QUICK ACTIONS — /api/v1/admin/portal/quick-actions
// ════════════════════════════════════════════════
export const adminQuickActionsRouter = Router();

/** GET /admin/portal/quick-actions */
adminQuickActionsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await portalService.getQuickActions(
    req.user!.companyId,
    req.query.propertyId as string | undefined,
  );
  res.json({ success: true, data });
}));

/** POST /admin/portal/quick-actions */
adminQuickActionsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await portalService.createQuickAction(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /admin/portal/quick-actions/:id */
adminQuickActionsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await portalService.updateQuickAction(req.user!.companyId, req.params.id as string, req.body);
  res.json({ success: true, data });
}));

/** DELETE /admin/portal/quick-actions/:id */
adminQuickActionsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await portalService.deleteQuickAction(req.user!.companyId, req.params.id as string);
  res.json({ success: true });
}));

// ════════════════════════════════════════════════
// PORTAL SESSION TRACKING — on portalRouter
// ════════════════════════════════════════════════

/** POST /portal/session/start — Track portal session start */
portalRouter.post('/session/start', asyncHandler(async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const ua = req.headers['user-agent'] || '';
  const data = await portalService.startSession(req.user!.companyId, req.user!.sub, {
    ipAddress: ip,
    userAgent: ua,
  });
  res.status(201).json({ success: true, data: { sessionId: data.id } });
}));

/** POST /portal/session/:id/heartbeat — Increment page count */
portalRouter.post('/session/:id/heartbeat', asyncHandler(async (req, res) => {
  await portalService.heartbeatSession(req.params.id as string);
  res.json({ success: true });
}));

/** POST /portal/session/:id/end — End session */
portalRouter.post('/session/:id/end', asyncHandler(async (req, res) => {
  await portalService.endSession(req.params.id as string);
  res.json({ success: true });
}));

// ════════════════════════════════════════════════
// ADMIN SESSION ANALYTICS — /api/v1/admin/portal/analytics
// ════════════════════════════════════════════════
export const adminPortalAnalyticsRouter = Router();

/** GET /admin/portal/analytics */
adminPortalAnalyticsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await portalService.getSessionAnalytics(req.user!.companyId, {
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    propertyId: req.query.propertyId as string,
  });
  res.json({ success: true, data });
}));
