import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { leadsService } from './leads.service';
import { viewingsService } from './viewings.service';
import { campaignsService } from './campaigns.service';
import { googleCalendarService } from './googleCalendar.service';
import {
  createLeadSchema, updateLeadSchema, updateStageSchema, convertLeadSchema,
  createViewingSchema, updateViewingSchema, completeViewingSchema,
  createActivitySchema,
  createCampaignSchema, updateCampaignSchema,
} from './crm.schema';

const p = (req: Request, key: string) => req.params[key] as string;

export const leadsRouter     = Router();
export const campaignsRouter = Router();
export const calendarRouter  = Router();

// ════════════════════════════════════════════════
// LEADS
// ════════════════════════════════════════════════

/** GET /leads */
leadsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await leadsService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    stage:      req.query.stage as string,
    assignedTo: req.query.assignedTo as string,
    source:     req.query.source as string,
    search:     req.query.search as string,
    page:       parseInt(req.query.page as string) || 1,
    limit:      Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** GET /leads/pipeline */
leadsRouter.get('/pipeline', asyncHandler(async (req, res) => {
  const data = await leadsService.getPipeline(
    req.user!.companyId,
    req.query.propertyId as string | undefined,
  );
  res.json({ success: true, data });
}));

/** GET /leads/stats */
leadsRouter.get('/stats', asyncHandler(async (req, res) => {
  const data = await leadsService.getStats(
    req.user!.companyId,
    req.query.propertyId as string | undefined,
  );
  res.json({ success: true, data });
}));

/** POST /leads */
leadsRouter.post('/', validateRequest(createLeadSchema), asyncHandler(async (req, res) => {
  const data = await leadsService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** GET /leads/check-blacklist?email=... */
leadsRouter.get('/check-blacklist', asyncHandler(async (req, res) => {
  const email = req.query.email as string;
  const data = await leadsService.checkEmailBlacklist(email || '', req.user!.companyId);
  res.json({ success: true, data });
}));

/** GET /leads/:id */
leadsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await leadsService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** PUT /leads/:id */
leadsRouter.put('/:id', validateRequest(updateLeadSchema), asyncHandler(async (req, res) => {
  const data = await leadsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** DELETE /leads/:id */
leadsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await leadsService.delete(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

/** PUT /leads/:id/stage */
leadsRouter.put('/:id/stage', validateRequest(updateStageSchema), asyncHandler(async (req, res) => {
  const data = await leadsService.updateStage(
    p(req, 'id'), req.user!.companyId, req.body.stage, req.body.reason, req.user!.sub,
  );
  res.json({ success: true, data });
}));

/** POST /leads/:id/convert */
leadsRouter.post('/:id/convert', validateRequest(convertLeadSchema), asyncHandler(async (req, res) => {
  const data = await leadsService.convert(
    p(req, 'id'), req.user!.companyId, req.body.leaseId, req.body.tenantId, req.user!.sub,
  );
  res.json({ success: true, data });
}));

/** POST /leads/:id/blacklist */
leadsRouter.post('/:id/blacklist', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    res.status(400).json({ success: false, message: 'Blacklist reason is required' });
    return;
  }
  const data = await leadsService.blacklist(p(req, 'id'), req.user!.companyId, reason.trim(), req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /leads/:id/unblacklist */
leadsRouter.post('/:id/unblacklist', asyncHandler(async (req, res) => {
  const data = await leadsService.unblacklist(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));


// ── Activities ─────────────────────────────

/** GET /leads/:id/activities */
leadsRouter.get('/:id/activities', asyncHandler(async (req, res) => {
  const data = await leadsService.getActivities(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /leads/:id/activities */
leadsRouter.post('/:id/activities', validateRequest(createActivitySchema), asyncHandler(async (req, res) => {
  const data = await leadsService.createActivity(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

// ── Viewings ───────────────────────────────

/** GET /leads/:id/viewings */
leadsRouter.get('/:id/viewings', asyncHandler(async (req, res) => {
  const data = await viewingsService.findByLead(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /leads/:id/viewings */
leadsRouter.post('/:id/viewings', validateRequest(createViewingSchema), asyncHandler(async (req, res) => {
  const data = await viewingsService.create(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** PUT /leads/:id/viewings/:vid */
leadsRouter.put('/:id/viewings/:vid', validateRequest(updateViewingSchema), asyncHandler(async (req, res) => {
  const data = await viewingsService.update(p(req, 'id'), p(req, 'vid'), req.body);
  res.json({ success: true, data });
}));

/** POST /leads/:id/viewings/:vid/complete */
leadsRouter.post('/:id/viewings/:vid/complete', validateRequest(completeViewingSchema), asyncHandler(async (req, res) => {
  const data = await viewingsService.complete(p(req, 'id'), p(req, 'vid'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// CAMPAIGNS
// ════════════════════════════════════════════════

/** GET /marketing-campaigns */
campaignsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await campaignsService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    status:     req.query.status as string,
    page:       parseInt(req.query.page as string) || 1,
    limit:      Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** POST /marketing-campaigns */
campaignsRouter.post('/', validateRequest(createCampaignSchema), asyncHandler(async (req, res) => {
  const data = await campaignsService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** GET /marketing-campaigns/:id */
campaignsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await campaignsService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** PUT /marketing-campaigns/:id */
campaignsRouter.put('/:id', validateRequest(updateCampaignSchema), asyncHandler(async (req, res) => {
  const data = await campaignsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** GET /marketing-campaigns/:id/roi */
campaignsRouter.get('/:id/roi', asyncHandler(async (req, res) => {
  const data = await campaignsService.getROI(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** DELETE /marketing-campaigns/:id */
campaignsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await campaignsService.delete(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, message: 'Campaign deleted' });
}));

// ════════════════════════════════════════════════
// GOOGLE CALENDAR INTEGRATION
// ════════════════════════════════════════════════

/** GET /crm/google-calendar/status — Check connection status */
calendarRouter.get('/status', asyncHandler(async (req, res) => {
  const data = await googleCalendarService.getConnectionStatus(req.user!.sub);
  res.json({ success: true, data: { ...data, configured: googleCalendarService.isConfigured() } });
}));

/** GET /crm/google-calendar/auth-url — Get OAuth authorization URL */
calendarRouter.get('/auth-url', asyncHandler(async (req, res) => {
  if (!googleCalendarService.isConfigured()) {
    res.status(501).json({ success: false, message: 'Google Calendar integration is not configured' });
    return;
  }
  const url = googleCalendarService.getAuthUrl(req.user!.sub);
  res.json({ success: true, data: { url } });
}));

/** GET /crm/google-calendar/callback — Handle OAuth callback */
calendarRouter.get('/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    res.status(400).json({ success: false, message: 'Missing code or state' });
    return;
  }

  await googleCalendarService.handleCallback(code, state);

  // Redirect back to the frontend settings page
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/admin/settings?calendar=connected`);
}));

/** DELETE /crm/google-calendar/disconnect — Remove connection */
calendarRouter.delete('/disconnect', asyncHandler(async (req, res) => {
  await googleCalendarService.disconnect(req.user!.sub);
  res.json({ success: true, message: 'Google Calendar disconnected' });
}));
