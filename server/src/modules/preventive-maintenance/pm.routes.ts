import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { pmService } from './pm.service';
import {
  createPmScheduleSchema, updatePmScheduleSchema, completePmWorkOrderSchema,
} from './pm.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ── Routers ──────────────────────────────

export const pmSchedulesRouter = Router();
export const pmWorkOrdersRouter = Router();
export const pmUpcomingRouter = Router();

// ────────────────────────────────────────────
// PM SCHEDULES
// ────────────────────────────────────────────

/** GET /pm/schedules */
pmSchedulesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await pmService.findAllSchedules(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    frequencyType: req.query.frequencyType as string,
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** GET /pm/schedules/:id */
pmSchedulesRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await pmService.findScheduleById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /pm/schedules */
pmSchedulesRouter.post('/', validateRequest(createPmScheduleSchema), asyncHandler(async (req, res) => {
  const data = await pmService.createSchedule(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** PUT /pm/schedules/:id */
pmSchedulesRouter.put('/:id', validateRequest(updatePmScheduleSchema), asyncHandler(async (req, res) => {
  const data = await pmService.updateSchedule(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** POST /pm/schedules/:id/pause */
pmSchedulesRouter.post('/:id/pause', asyncHandler(async (req, res) => {
  const data = await pmService.pauseSchedule(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /pm/schedules/:id/resume */
pmSchedulesRouter.post('/:id/resume', asyncHandler(async (req, res) => {
  const data = await pmService.resumeSchedule(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /pm/schedules/:id/generate — manual WO generation */
pmSchedulesRouter.post('/:id/generate', asyncHandler(async (req, res) => {
  const data = await pmService.generateWorkOrder(p(req, 'id'), req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

/** GET /pm/schedules/:id/history */
pmSchedulesRouter.get('/:id/history', asyncHandler(async (req, res) => {
  const data = await pmService.getScheduleHistory(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────
// PM WORK ORDERS
// ────────────────────────────────────────────

/** GET /pm/work-orders */
pmWorkOrdersRouter.get('/', asyncHandler(async (req, res) => {
  const result = await pmService.findAllWorkOrders(req.user!.companyId, {
    scheduleId: req.query.scheduleId as string,
    status: req.query.status as string,
    propertyId: req.query.propertyId as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** GET /pm/work-orders/:id */
pmWorkOrdersRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await pmService.findWorkOrderById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /pm/work-orders/:id/complete */
pmWorkOrdersRouter.post('/:id/complete', validateRequest(completePmWorkOrderSchema), asyncHandler(async (req, res) => {
  const data = await pmService.completePmWorkOrder(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /pm/work-orders/:id/skip */
pmWorkOrdersRouter.post('/:id/skip', asyncHandler(async (req, res) => {
  const data = await pmService.skipPmWorkOrder(p(req, 'id'), req.user!.companyId, req.body.reason || '', req.user!.sub);
  res.json({ success: true, data });
}));

/** GET /pm/asset-history/:assetId — service history for a specific asset */
pmWorkOrdersRouter.get('/asset-history/:assetId', asyncHandler(async (req, res) => {
  const data = await pmService.getAssetServiceHistory(p(req, 'assetId'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────
// UPCOMING PM
// ────────────────────────────────────────────

/** GET /pm/upcoming */
pmUpcomingRouter.get('/', asyncHandler(async (req, res) => {
  const data = await pmService.getUpcoming(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    days: parseInt(req.query.days as string) || 30,
  });
  res.json({ success: true, data });
}));
