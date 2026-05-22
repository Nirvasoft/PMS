import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { validateRequest } from '../../middleware/validateRequest';
import { createSecurityService } from './security.service';
import {
  createIncidentSchema, updateIncidentSchema, resolveIncidentSchema,
  createCheckpointSchema, scanCheckpointSchema, createPatrolScheduleSchema,
} from './security.schema';

export function securityRoutes(prisma: PrismaClient) {
  const svc = createSecurityService({ prisma });

  // ── Incidents ──────────────────────────
  const incidentsRouter = Router();
  incidentsRouter.get('/', async (req, res, next) => {
    try {
      const result = await svc.listIncidents(req.user!.companyId, {
        propertyId: req.query.propertyId, severity: req.query.severity,
        status: req.query.status, incidentType: req.query.incidentType,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      });
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });
  incidentsRouter.get('/:id', async (req, res, next) => {
    try {
      const data = await svc.getIncidentById(req.user!.companyId, req.params.id as string);
      if (!data) return res.status(404).json({ success: false, error: 'Incident not found' });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });
  incidentsRouter.post('/', validateRequest(createIncidentSchema), async (req, res, next) => {
    try {
      const data = await svc.createIncident(req.user!.companyId, req.user!.sub, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });
  incidentsRouter.put('/:id', validateRequest(updateIncidentSchema), async (req, res, next) => {
    try {
      const data = await svc.updateIncident(req.user!.companyId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });
  incidentsRouter.post('/:id/resolve', validateRequest(resolveIncidentSchema), async (req, res, next) => {
    try {
      const data = await svc.resolveIncident(req.user!.companyId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  // ── Checkpoints ────────────────────────
  const checkpointsRouter = Router();
  checkpointsRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.listCheckpoints(req.user!.companyId, req.query.propertyId as string) }); } catch (e) { next(e); }
  });
  checkpointsRouter.post('/', validateRequest(createCheckpointSchema), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await svc.createCheckpoint(req.user!.companyId, req.body) }); } catch (e) { next(e); }
  });

  // ── Patrol Schedules ───────────────────
  const patrolSchedulesRouter = Router();
  patrolSchedulesRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.listPatrolSchedules(req.user!.companyId, req.query.propertyId as string) }); } catch (e) { next(e); }
  });
  patrolSchedulesRouter.post('/', validateRequest(createPatrolScheduleSchema), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await svc.createPatrolSchedule(req.user!.companyId, req.body) }); } catch (e) { next(e); }
  });

  // ── Patrol Logs ────────────────────────
  const patrolLogsRouter = Router();
  patrolLogsRouter.get('/', async (req, res, next) => {
    try {
      const result = await svc.listPatrolLogs(req.user!.companyId, {
        propertyId: req.query.propertyId, guardId: req.query.guardId,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      });
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });

  // ── Scan ───────────────────────────────
  const scanRouter = Router();
  scanRouter.post('/', validateRequest(scanCheckpointSchema), async (req, res, next) => {
    try {
      const data = await svc.scanCheckpoint(req.user!.companyId, req.user!.sub, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  });

  // ── Stats ──────────────────────────────
  const statsRouter = Router();
  statsRouter.get('/', async (req, res, next) => {
    try { res.json({ success: true, data: await svc.getStats(req.user!.companyId, req.query) }); } catch (e) { next(e); }
  });

  return { incidentsRouter, checkpointsRouter, patrolSchedulesRouter, patrolLogsRouter, scanRouter, statsRouter };
}
