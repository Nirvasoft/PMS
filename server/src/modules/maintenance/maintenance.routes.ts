import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { ticketsService } from './tickets.service';
import { workOrdersService } from './workOrders.service';
import { techniciansService } from './technicians.service';
import { slaService } from './sla.service';
import { categoriesService } from './categories.service';
import {
  createTicketSchema, updateTicketSchema, assignTicketSchema,
  escalateTicketSchema, cancelTicketSchema, rateTicketSchema,
  startWorkOrderSchema, completeWorkOrderSchema, onHoldWorkOrderSchema,
  updateWorkOrderSchema, upsertTechnicianProfileSchema,
  createSlaConfigSchema,
} from './maintenance.schema';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

const p = (req: Request, key: string) => req.params[key] as string;

// ── Routers ──────────────────────────────────

export const maintenanceTicketsRouter = Router();
export const maintenanceWorkOrdersRouter = Router();
export const maintenanceTechniciansRouter = Router();
export const maintenanceCategoriesRouter = Router();
export const maintenanceStatsRouter = Router();
export const maintenanceSlaConfigsRouter = Router();
export const maintenanceSlaReportRouter = Router();

// ────────────────────────────────────────────────
// TICKETS
// ────────────────────────────────────────────────

/** GET /maintenance/tickets */
maintenanceTicketsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await ticketsService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    unitId: req.query.unitId as string,
    status: req.query.status as string,
    priority: req.query.priority as string,
    categoryId: req.query.categoryId as string,
    assignedTo: req.query.assignedTo as string,
    source: req.query.source as string,
    search: req.query.search as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
    sort: (req.query.sort as string) || 'createdAt',
    order: (req.query.order as string) || 'desc',
  });
  res.json({ success: true, ...result });
}));

/** POST /maintenance/tickets */
maintenanceTicketsRouter.post('/', validateRequest(createTicketSchema), asyncHandler(async (req, res) => {
  const data = await ticketsService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** GET /maintenance/tickets/:id */
maintenanceTicketsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await ticketsService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** PUT /maintenance/tickets/:id */
maintenanceTicketsRouter.put('/:id', validateRequest(updateTicketSchema), asyncHandler(async (req, res) => {
  const data = await ticketsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** POST /maintenance/tickets/:id/assign */
maintenanceTicketsRouter.post('/:id/assign', validateRequest(assignTicketSchema), asyncHandler(async (req, res) => {
  const data = await ticketsService.assign(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/tickets/:id/auto-assign */
maintenanceTicketsRouter.post('/:id/auto-assign', asyncHandler(async (req, res) => {
  const data = await ticketsService.autoAssign(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/tickets/:id/escalate */
maintenanceTicketsRouter.post('/:id/escalate', validateRequest(escalateTicketSchema), asyncHandler(async (req, res) => {
  const data = await ticketsService.escalate(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/tickets/:id/cancel */
maintenanceTicketsRouter.post('/:id/cancel', validateRequest(cancelTicketSchema), asyncHandler(async (req, res) => {
  const data = await ticketsService.cancel(p(req, 'id'), req.user!.companyId, req.body.reason, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/tickets/:id/rate */
maintenanceTicketsRouter.post('/:id/rate', validateRequest(rateTicketSchema), asyncHandler(async (req, res) => {
  const data = await ticketsService.rate(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ── Photo Upload ─────────────────────────────

/**
 * Photo storage abstraction.
 *
 * FUTURE-READY: Currently uses local disk storage. To migrate to
 * DigitalOcean Spaces or Azure Blob Storage:
 *
 * 1. Replace `multer.diskStorage` with `multer-s3` (for DO Spaces/S3) or
 *    `multer-azure-blob-storage` (for Azure Blob).
 * 2. Update the `url` field to use the CDN/public URL from the cloud provider.
 * 3. The `storageKey` field already stores the logical path, making it
 *    portable across storage backends.
 */
const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'maintenance');
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

/** POST /maintenance/tickets/:id/photos */
maintenanceTicketsRouter.post('/:id/photos', upload.array('photos', 10), asyncHandler(async (req, res) => {
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: { id: p(req, 'id'), companyId: req.user!.companyId, deletedAt: null },
  });
  if (!ticket) throw AppError.notFound('Maintenance ticket');

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    throw AppError.validation('No photos uploaded');
  }

  const photoType = (req.body.photoType as string) || 'before';
  const caption = req.body.caption as string | undefined;

  const photoData = files.map((f) => ({
    companyId: req.user!.companyId,
    ticketId: ticket.id,
    storageKey: `maintenance/${f.filename}`,
    url: `/storage/maintenance/${f.filename}`,
    photoType,
    caption: caption || null,
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
// WORK ORDERS
// ────────────────────────────────────────────────

/** GET /maintenance/work-orders */
maintenanceWorkOrdersRouter.get('/', asyncHandler(async (req, res) => {
  const result = await workOrdersService.findAll(req.user!.companyId, {
    assignedTo: req.query.assignedTo as string,
    status: req.query.status as string,
    propertyId: req.query.propertyId as string,
    scheduledFrom: req.query.scheduledFrom as string,
    scheduledTo: req.query.scheduledTo as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** GET /maintenance/work-orders/:id */
maintenanceWorkOrdersRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await workOrdersService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** PUT /maintenance/work-orders/:id */
maintenanceWorkOrdersRouter.put('/:id', validateRequest(updateWorkOrderSchema), asyncHandler(async (req, res) => {
  const data = await workOrdersService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** POST /maintenance/work-orders/:id/start */
maintenanceWorkOrdersRouter.post('/:id/start', validateRequest(startWorkOrderSchema), asyncHandler(async (req, res) => {
  const data = await workOrdersService.start(p(req, 'id'), req.user!.companyId, req.body.notes, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/work-orders/:id/complete */
maintenanceWorkOrdersRouter.post('/:id/complete', validateRequest(completeWorkOrderSchema), asyncHandler(async (req, res) => {
  const data = await workOrdersService.complete(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/work-orders/:id/on-hold */
maintenanceWorkOrdersRouter.post('/:id/on-hold', validateRequest(onHoldWorkOrderSchema), asyncHandler(async (req, res) => {
  const data = await workOrdersService.onHold(p(req, 'id'), req.user!.companyId, req.body.reason, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /maintenance/work-orders/:id/resume */
maintenanceWorkOrdersRouter.post('/:id/resume', asyncHandler(async (req, res) => {
  const data = await workOrdersService.resume(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// TECHNICIANS
// ────────────────────────────────────────────────

/** GET /maintenance/technicians */
maintenanceTechniciansRouter.get('/', asyncHandler(async (req, res) => {
  const data = await techniciansService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    skill: req.query.skill as string,
    isAvailable: req.query.isAvailable as string,
  });
  res.json({ success: true, data });
}));

/** GET /maintenance/technicians/:userId/schedule */
maintenanceTechniciansRouter.get('/:userId/schedule', asyncHandler(async (req, res) => {
  const data = await techniciansService.getSchedule(
    p(req, 'userId'), req.user!.companyId,
    { from: req.query.from as string, to: req.query.to as string },
  );
  res.json({ success: true, data });
}));

/** PUT /maintenance/technicians/:userId/profile */
maintenanceTechniciansRouter.put('/:userId/profile', validateRequest(upsertTechnicianProfileSchema), asyncHandler(async (req, res) => {
  const data = await techniciansService.upsertProfile(p(req, 'userId'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// CATEGORIES
// ────────────────────────────────────────────────

/** GET /maintenance/categories */
maintenanceCategoriesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await categoriesService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// STATS
// ────────────────────────────────────────────────

/** GET /maintenance/stats */
maintenanceStatsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await ticketsService.getStats(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    from: req.query.from as string,
    to: req.query.to as string,
  });
  res.json({ success: true, data });
}));

/** GET /maintenance/sla-report */
maintenanceSlaReportRouter.get('/', asyncHandler(async (req, res) => {
  const data = await ticketsService.getSlaReport(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    from: req.query.from as string,
    to: req.query.to as string,
    groupBy: req.query.groupBy as any,
  });
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────────
// SLA CONFIGS
// ────────────────────────────────────────────────

/** GET /maintenance/sla-configs */
maintenanceSlaConfigsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await slaService.findAllConfigs(req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /maintenance/sla-configs */
maintenanceSlaConfigsRouter.post('/', validateRequest(createSlaConfigSchema), asyncHandler(async (req, res) => {
  const data = await slaService.createConfig(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));
