import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { leasesService } from './services/leases.service';
import { leasesLifecycleService } from './services/leases-lifecycle.service';
import { amendmentsService } from './services/amendments.service';
import { esignService } from './services/esign.service';
import { templatesService } from './services/templates.service';
import { clausesService } from './services/clauses.service';
import { validateRequest } from '../../middleware/validateRequest';
import {
  createLeaseSchema, updateLeaseSchema, createAmendmentSchema,
  createRenewalSchema, terminateLeaseSchema, esignSendSchema,
  createLeaseTemplateSchema, updateLeaseTemplateSchema, createLeaseClauseSchema,
} from './leases.schema';

const p = (req: Request, key: string) => req.params[key] as string;

export const leasesRouter    = Router();
export const leaseTemplatesRouter = Router();
export const leaseClausesRouter   = Router();

// ════════════════════════════════════════════
// LEASES
// ════════════════════════════════════════════

/** GET /leases */
leasesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await leasesService.findAll(req.user!.companyId, {
    search:             req.query.search as string,
    propertyId:         req.query.propertyId as string,
    unitId:             req.query.unitId as string,
    tenantId:           req.query.tenantId as string,
    status:             req.query.status as string,
    expiringWithinDays: req.query.expiringWithinDays ? parseInt(req.query.expiringWithinDays as string) : undefined,
    page:               parseInt(req.query.page as string) || 1,
    limit:              Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** POST /leases */
leasesRouter.post('/', validateRequest(createLeaseSchema), asyncHandler(async (req, res) => {
  const data = await leasesService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** GET /leases/:id */
leasesRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await leasesService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** PUT /leases/:id */
leasesRouter.put('/:id', validateRequest(updateLeaseSchema), asyncHandler(async (req, res) => {
  const data = await leasesService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** DELETE /leases/:id */
leasesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await leasesService.delete(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

/** POST /leases/:id/submit */
leasesRouter.post('/:id/submit', asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.submit(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /leases/:id/activate */
leasesRouter.post('/:id/activate', asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.activate(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /leases/:id/cancel */
leasesRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.cancel(p(req, 'id'), req.user!.companyId, req.body.reason);
  res.json({ success: true, data });
}));

/** POST /leases/:id/terminate */
leasesRouter.post('/:id/terminate', validateRequest(terminateLeaseSchema), asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.terminate(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /leases/:id/renewal */
leasesRouter.post('/:id/renewal', validateRequest(createRenewalSchema), asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.createRenewal(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** POST /leases/:id/renewal/accept */
leasesRouter.post('/:id/renewal/accept', asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.acceptRenewal(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /leases/:id/renewal/decline */
leasesRouter.post('/:id/renewal/decline', asyncHandler(async (req, res) => {
  const data = await leasesLifecycleService.declineRenewal(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ── Amendments ──────────────────────────────

/** GET /leases/:id/amendments */
leasesRouter.get('/:id/amendments', asyncHandler(async (req, res) => {
  const data = await amendmentsService.findAll(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /leases/:id/amendments */
leasesRouter.post('/:id/amendments', validateRequest(createAmendmentSchema), asyncHandler(async (req, res) => {
  const data = await amendmentsService.create(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** POST /leases/:id/amendments/:amendmentId/approve */
leasesRouter.post('/:id/amendments/:amendmentId/approve', asyncHandler(async (req, res) => {
  const data = await amendmentsService.approve(p(req, 'id'), p(req, 'amendmentId'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ── E-Sign ──────────────────────────────────

/** POST /leases/:id/esign/send */
leasesRouter.post('/:id/esign/send', validateRequest(esignSendSchema), asyncHandler(async (req, res) => {
  const data = await esignService.send(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** GET /leases/:id/esign/status */
leasesRouter.get('/:id/esign/status', asyncHandler(async (req, res) => {
  const data = await esignService.getStatus(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /leases/esign/webhook — public, no auth */
leasesRouter.post('/esign/webhook', asyncHandler(async (req, res) => {
  await esignService.webhook(req.body);
  res.json({ success: true });
}));

// ════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════

leaseTemplatesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await templatesService.getTemplates(req.user!.companyId);
  res.json({ success: true, data });
}));

leaseTemplatesRouter.post('/', validateRequest(createLeaseTemplateSchema), asyncHandler(async (req, res) => {
  const data = await templatesService.createTemplate(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

leaseTemplatesRouter.put('/:id', validateRequest(updateLeaseTemplateSchema), asyncHandler(async (req, res) => {
  const data = await templatesService.updateTemplate(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════
// CLAUSES
// ════════════════════════════════════════════

leaseClausesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await clausesService.getClauses(req.user!.companyId);
  res.json({ success: true, data });
}));

leaseClausesRouter.post('/', validateRequest(createLeaseClauseSchema), asyncHandler(async (req, res) => {
  const data = await clausesService.createClause(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

leaseClausesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await clausesService.deleteClause(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));
