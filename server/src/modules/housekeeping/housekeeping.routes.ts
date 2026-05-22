import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { validateRequest } from '../../middleware/validateRequest';
import { createHousekeepingService } from './housekeeping.service';
import { createZoneSchema, createScheduleSchema, completeTaskSchema, createInspectionSchema } from './housekeeping.schema';

export function housekeepingRoutes(prisma: PrismaClient) {
  const svc = createHousekeepingService({ prisma });

  const zonesRouter = Router();
  zonesRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.listZones(req.user!.companyId, req.query.propertyId as string) }); } catch (e) { next(e); }
  });
  zonesRouter.post('/', validateRequest(createZoneSchema), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await svc.createZone(req.user!.companyId, req.body) }); } catch (e) { next(e); }
  });

  const schedulesRouter = Router();
  schedulesRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.listSchedules(req.user!.companyId, req.query) }); } catch (e) { next(e); }
  });
  schedulesRouter.post('/', validateRequest(createScheduleSchema), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await svc.createSchedule(req.user!.companyId, req.body) }); } catch (e) { next(e); }
  });

  const tasksRouter = Router();
  tasksRouter.get('/', async (req, res, next) => {
    try {
      const result = await svc.listTasks(req.user!.companyId, {
        propertyId: req.query.propertyId, date: req.query.date,
        assignedTo: req.query.assignedTo, status: req.query.status,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      });
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });
  tasksRouter.post('/:id/start', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.startTask(req.user!.companyId, req.params.id as string) }); } catch (e) { next(e); }
  });
  tasksRouter.post('/:id/complete', validateRequest(completeTaskSchema), async (req, res, next) => {
    try { res.json({ success: true, data: await svc.completeTask(req.user!.companyId, req.params.id as string, req.body) }); } catch (e) { next(e); }
  });

  const inspectionsRouter = Router();
  inspectionsRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.listInspections(req.user!.companyId, req.query) }); } catch (e) { next(e); }
  });
  inspectionsRouter.post('/', validateRequest(createInspectionSchema), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await svc.createInspection(req.user!.companyId, req.user!.sub, req.body) }); } catch (e) { next(e); }
  });

  const statsRouter = Router();
  statsRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.getStats(req.user!.companyId, req.query) }); } catch (e) { next(e); }
  });

  return { zonesRouter, schedulesRouter, tasksRouter, inspectionsRouter, statsRouter };
}
