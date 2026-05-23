import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { visitorsService } from './visitors.service';
import {
  preRegisterVisitorSchema, scanQrSchema,
  walkinRequestSchema, walkinRespondSchema,
} from './visitors.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ═══════════════════════════════════════════════
// VISITORS ROUTER — /api/v1/visitors
// ═══════════════════════════════════════════════
export const visitorsRouter = Router();

/** POST /visitors/pre-register */
visitorsRouter.post('/pre-register', validateRequest(preRegisterVisitorSchema), asyncHandler(async (req, res) => {
  const data = await visitorsService.preRegister(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** GET /visitors/pass/:token — Public QR pass page */
visitorsRouter.get('/pass/:token', asyncHandler(async (req, res) => {
  const data = await visitorsService.getPassByToken(p(req, 'token'));
  res.json({ success: true, data });
}));

/** POST /visitors/scan — Security gate scan */
visitorsRouter.post('/scan', validateRequest(scanQrSchema), asyncHandler(async (req, res) => {
  const data = await visitorsService.scanQrCode(req.user!.companyId, req.user!.sub, req.body);
  res.json({ success: true, data });
}));

/** POST /visitors/walkin — Walk-in request */
visitorsRouter.post('/walkin', validateRequest(walkinRequestSchema), asyncHandler(async (req, res) => {
  const data = await visitorsService.requestWalkIn(req.user!.companyId, req.user!.sub, req.body);
  res.status(202).json({ success: true, data });
}));

/** POST /visitors/walkin/respond — Host responds */
visitorsRouter.post('/walkin/respond', validateRequest(walkinRespondSchema), asyncHandler(async (req, res) => {
  const data = await visitorsService.respondToWalkIn(req.user!.companyId, req.user!.sub, req.body);
  res.json({ success: true, data });
}));

/** POST /visitors/:id/cancel — Cancel a pass */
visitorsRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const data = await visitorsService.cancelVisitor(req.user!.companyId, req.user!.sub, p(req, 'id'));
  res.json({ success: true, data });
}));

/** GET /visitors/active — Security: active visitors */
visitorsRouter.get('/active', asyncHandler(async (req, res) => {
  const data = await visitorsService.getActiveVisitors(
    req.user!.companyId, req.query.propertyId as string,
  );
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════════════
// PORTAL VISITORS — registered on portalRouter
// ═══════════════════════════════════════════════
export const portalVisitorsRouter = Router();

/** GET /portal/visitors */
portalVisitorsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await visitorsService.getPortalVisitors(req.user!.companyId, req.user!.sub, {
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
  });
  res.json({ success: true, ...data });
}));
