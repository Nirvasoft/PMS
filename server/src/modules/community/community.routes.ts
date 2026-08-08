import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { communityService } from './community.service';
import {
  createAnnouncementSchema, createPollSchema, votePollSchema,
  submitComplaintSchema, respondComplaintSchema, rateComplaintSchema,
  submitMoveRequestSchema, approveMoveRequestSchema,
} from './community.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ═══════════════════════════════════════════════
// PORTAL COMMUNITY — /api/v1/portal/community
// ═══════════════════════════════════════════════
export const portalCommunityRouter = Router();

// ── Announcements ────────────────────────────

/** GET /portal/announcements */
portalCommunityRouter.get('/announcements', asyncHandler(async (req, res) => {
  const data = await communityService.getPortalAnnouncements(req.user!.companyId, req.user!.sub, {
    category: req.query.category as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
  });
  res.json({ success: true, ...data });
}));

/** GET /portal/announcements/:id */
portalCommunityRouter.get('/announcements/:id', asyncHandler(async (req, res) => {
  const data = await communityService.getAnnouncementById(req.user!.companyId, req.user!.sub, p(req, 'id'));
  res.json({ success: true, data });
}));

/** POST /portal/announcements/:id/read */
portalCommunityRouter.post('/announcements/:id/read', asyncHandler(async (req, res) => {
  const data = await communityService.markAnnouncementRead(req.user!.companyId, req.user!.sub, p(req, 'id'));
  res.json({ success: true, data });
}));

// ── Polls ────────────────────────────────────

/** GET /portal/polls */
portalCommunityRouter.get('/polls', asyncHandler(async (req, res) => {
  const data = await communityService.getPortalPolls(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /portal/polls/:id/vote */
portalCommunityRouter.post('/polls/:id/vote', validateRequest(votePollSchema), asyncHandler(async (req, res) => {
  const data = await communityService.votePoll(req.user!.companyId, req.user!.sub, p(req, 'id'), req.body.optionIds);
  res.json({ success: true, data });
}));

/** GET /portal/polls/:id/results */
portalCommunityRouter.get('/polls/:id/results', asyncHandler(async (req, res) => {
  const data = await communityService.getPollResults(req.user!.companyId, req.user!.sub, p(req, 'id'));
  res.json({ success: true, data });
}));

// ── Complaints ───────────────────────────────

/** GET /portal/complaints */
portalCommunityRouter.get('/complaints', asyncHandler(async (req, res) => {
  const data = await communityService.getPortalComplaints(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /portal/complaints */
portalCommunityRouter.post('/complaints', validateRequest(submitComplaintSchema), asyncHandler(async (req, res) => {
  const data = await communityService.submitComplaint(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** POST /portal/complaints/:id/rate */
portalCommunityRouter.post('/complaints/:id/rate', validateRequest(rateComplaintSchema), asyncHandler(async (req, res) => {
  const data = await communityService.rateComplaint(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body.satisfactionScore,
  );
  res.json({ success: true, data });
}));

// ── Move Requests ────────────────────────────

/** GET /portal/move-requests */
portalCommunityRouter.get('/move-requests', asyncHandler(async (req, res) => {
  const data = await communityService.getPortalMoveRequests(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

/** POST /portal/move-requests */
portalCommunityRouter.post('/move-requests', validateRequest(submitMoveRequestSchema), asyncHandler(async (req, res) => {
  const data = await communityService.submitMoveRequest(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

// ═══════════════════════════════════════════════
// ADMIN COMMUNITY — /api/v1/admin/community
// ═══════════════════════════════════════════════
export const adminCommunityRouter = Router();

/** GET /admin/community/announcements */
adminCommunityRouter.get('/announcements', asyncHandler(async (req, res) => {
  const data = await communityService.getAdminAnnouncements(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
  });
  res.json({ success: true, ...data });
}));

/** POST /admin/community/announcements */
adminCommunityRouter.post('/announcements', validateRequest(createAnnouncementSchema), asyncHandler(async (req, res) => {
  const data = await communityService.createAnnouncement(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** GET /admin/community/polls */
adminCommunityRouter.get('/polls', asyncHandler(async (req, res) => {
  const data = await communityService.getAdminPolls(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
  });
  res.json({ success: true, ...data });
}));

/** GET /admin/community/complaints */
adminCommunityRouter.get('/complaints', asyncHandler(async (req, res) => {
  const data = await communityService.getAdminComplaints(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
  });
  res.json({ success: true, ...data });
}));

/** POST /admin/community/polls */
adminCommunityRouter.post('/polls', validateRequest(createPollSchema), asyncHandler(async (req, res) => {
  const data = await communityService.createPoll(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

/** POST /admin/community/complaints/:id/respond */
adminCommunityRouter.post('/complaints/:id/respond', validateRequest(respondComplaintSchema), asyncHandler(async (req, res) => {
  const data = await communityService.respondToComplaint(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body.response,
  );
  res.json({ success: true, data });
}));

/** GET /admin/community/move-requests */
adminCommunityRouter.get('/move-requests', asyncHandler(async (req, res) => {
  const data = await communityService.getAdminMoveRequests(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    requestType: req.query.type as string,
  });
  res.json({ success: true, data });
}));

/** POST /admin/community/move-requests/:id/approve */
adminCommunityRouter.post('/move-requests/:id/approve', validateRequest(approveMoveRequestSchema), asyncHandler(async (req, res) => {
  const data = await communityService.approveMoveRequest(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body,
  );
  res.json({ success: true, data });
}));
