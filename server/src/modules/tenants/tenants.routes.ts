import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import {
  tenantsService, kycService, blacklistService,
  emergencyContactsService, tenantNotesService,
} from './tenants.service';
import { memoryUpload, processAvatar } from '../../common/upload';

const p = (req: Request, key: string) => req.params[key] as string;

export const tenantsRouter = Router();
export const kycRequirementsRouter = Router();

// ════════════════════════════════════════════════
// TENANTS CRUD
// ════════════════════════════════════════════════

/** GET /tenants/blacklisted */
tenantsRouter.get('/blacklisted', asyncHandler(async (req, res) => {
  const data = await blacklistService.getBlacklisted(
    req.user!.companyId,
    parseInt(req.query.page as string) || 1,
    Math.min(parseInt(req.query.limit as string) || 20, 100),
  );
  res.json({ success: true, ...data });
}));

/** POST /tenants/merge */
tenantsRouter.post('/merge', asyncHandler(async (req, res) => {
  const { primaryTenantId, duplicateTenantId, confirmActiveLeasesTransfer } = req.body;
  const data = await tenantsService.merge(primaryTenantId, duplicateTenantId, req.user!.companyId, req.user!.sub, confirmActiveLeasesTransfer);
  res.json({ success: true, data });
}));

/** GET /tenants */
tenantsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await tenantsService.findAll(req.user!.companyId, {
    search:       req.query.search as string,
    tenantType:   req.query.tenantType as string,
    kycStatus:    req.query.kycStatus as string,
    isBlacklisted: req.query.isBlacklisted !== undefined ? req.query.isBlacklisted === 'true' : undefined,
    tags:         req.query.tags ? (req.query.tags as string).split(',') : undefined,
    page:         parseInt(req.query.page as string) || 1,
    limit:        Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** POST /tenants */
tenantsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await tenantsService.create(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** GET /tenants/:id */
tenantsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await tenantsService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** PUT /tenants/:id */
tenantsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await tenantsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** DELETE /tenants/:id */
tenantsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await tenantsService.delete(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

/** GET /tenants/:id/lease-history */
tenantsRouter.get('/:id/lease-history', asyncHandler(async (req, res) => {
  const data = await tenantsService.getLeaseHistory(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// KYC
// ════════════════════════════════════════════════

/** GET /tenants/:id/kyc */
tenantsRouter.get('/:id/kyc', asyncHandler(async (req, res) => {
  const data = await kycService.getKyc(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /tenants/:id/kyc/documents */
tenantsRouter.post('/:id/kyc/documents', asyncHandler(async (req, res) => {
  const data = await kycService.submitDocument(p(req, 'id'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /tenants/:id/kyc/documents/:kycDocId/review */
tenantsRouter.put('/:id/kyc/documents/:kycDocId/review', asyncHandler(async (req, res) => {
  const data = await kycService.reviewDocument(p(req, 'id'), p(req, 'kycDocId'), req.body, req.user!.sub);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// BLACKLIST
// ════════════════════════════════════════════════

/** POST /tenants/:id/blacklist */
tenantsRouter.post('/:id/blacklist', asyncHandler(async (req, res) => {
  await blacklistService.blacklist(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true });
}));

/** POST /tenants/:id/whitelist */
tenantsRouter.post('/:id/whitelist', asyncHandler(async (req, res) => {
  await blacklistService.whitelist(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.json({ success: true });
}));

/** GET /tenants/:id/blacklist-history */
tenantsRouter.get('/:id/blacklist-history', asyncHandler(async (req, res) => {
  const data = await blacklistService.getBlacklistHistory(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// EMERGENCY CONTACTS
// ════════════════════════════════════════════════

/** GET /tenants/:id/emergency-contacts */
tenantsRouter.get('/:id/emergency-contacts', asyncHandler(async (req, res) => {
  const data = await emergencyContactsService.findAll(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /tenants/:id/emergency-contacts */
tenantsRouter.post('/:id/emergency-contacts', asyncHandler(async (req, res) => {
  const data = await emergencyContactsService.create(p(req, 'id'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /tenants/:id/emergency-contacts/:contactId */
tenantsRouter.put('/:id/emergency-contacts/:contactId', asyncHandler(async (req, res) => {
  const data = await emergencyContactsService.update(p(req, 'id'), p(req, 'contactId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /tenants/:id/emergency-contacts/:contactId */
tenantsRouter.delete('/:id/emergency-contacts/:contactId', asyncHandler(async (req, res) => {
  await emergencyContactsService.delete(p(req, 'id'), p(req, 'contactId'));
  res.status(204).send();
}));

// ════════════════════════════════════════════════
// NOTES
// ════════════════════════════════════════════════

/** GET /tenants/:id/notes */
tenantsRouter.get('/:id/notes', asyncHandler(async (req, res) => {
  const data = await tenantNotesService.findAll(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** POST /tenants/:id/notes */
tenantsRouter.post('/:id/notes', asyncHandler(async (req, res) => {
  const data = await tenantNotesService.create(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** PUT /tenants/:id/notes/:noteId */
tenantsRouter.put('/:id/notes/:noteId', asyncHandler(async (req, res) => {
  const data = await tenantNotesService.update(p(req, 'id'), p(req, 'noteId'), req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** DELETE /tenants/:id/notes/:noteId */
tenantsRouter.delete('/:id/notes/:noteId', asyncHandler(async (req, res) => {
  await tenantNotesService.delete(p(req, 'id'), p(req, 'noteId'), req.user!.sub);
  res.status(204).send();
}));

/** POST /tenants/:id/avatar */
tenantsRouter.post('/:id/avatar', memoryUpload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) throw new Error('No file uploaded');
  const avatarUrl = await processAvatar(req.file.buffer);
  const data = await tenantsService.update(p(req, 'id'), req.user!.companyId, { avatarUrl });
  res.json({ success: true, data: { avatarUrl: data.avatarUrl } });
}));

// ════════════════════════════════════════════════
// KYC REQUIREMENTS (admin config)
// ════════════════════════════════════════════════

/** GET /kyc-requirements */
kycRequirementsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await kycService.getRequirements(req.user!.companyId, req.query.tenantType as string);
  res.json({ success: true, data });
}));

/** POST /kyc-requirements */
kycRequirementsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await kycService.createRequirement(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /kyc-requirements/:id */
kycRequirementsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await kycService.updateRequirement(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** DELETE /kyc-requirements/:id */
kycRequirementsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await kycService.deleteRequirement(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));
