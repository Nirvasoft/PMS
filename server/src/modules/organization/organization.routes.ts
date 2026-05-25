import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware';
import { companiesService } from './services/companies.service';
import { branchesService } from './services/branches.service';
import { regionsService } from './services/regions.service';
import { businessUnitsService } from './services/business-units.service';
import { propertiesService } from './services/properties.service';
import { logoUpload, saveUploadedFileToSpaces } from '../../common/upload';
import { prisma } from '../../common/database';
import { invalidateFeatureFlagCache } from '../../common/featureFlags';

const param = (req: Request, name: string): string => req.params[name] as string;

// ─── Company ───────────────────────────────────

export const companyRouter = Router();

companyRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await companiesService.findById(req.user!.companyId);
  res.json({ success: true, data });
}));

companyRouter.put('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await companiesService.update(req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

companyRouter.get('/hierarchy', asyncHandler(async (req: Request, res: Response) => {
  const data = await companiesService.getHierarchy(req.user!.companyId);
  res.json({ success: true, data });
}));

companyRouter.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  const data = await companiesService.updateSettings(req.user!.companyId, req.body);
  // Invalidate feature flag cache when settings change
  invalidateFeatureFlagCache(req.user!.companyId);
  res.json({ success: true, data });
}));

// Logo upload
companyRouter.post('/logo', logoUpload.single('logo'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, errors: [{ message: 'No file uploaded' }] }); return; }
  const logoUrl = await saveUploadedFileToSpaces(req.file, 'logos');
  await prisma.company.update({ where: { id: req.user!.companyId }, data: { logoUrl } });
  res.json({ success: true, data: { logoUrl } });
}));

// ─── Branches ──────────────────────────────────

export const branchesRouter = Router();

branchesRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

branchesRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.findById(param(req, 'id'));
  res.json({ success: true, data });
}));

branchesRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

branchesRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await branchesService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

branchesRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await branchesService.delete(param(req, 'id'));
  res.status(204).send();
}));

// ─── Regions ───────────────────────────────────

export const regionsRouter = Router();

regionsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await regionsService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

regionsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await regionsService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

regionsRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await regionsService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

regionsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await regionsService.delete(param(req, 'id'));
  res.status(204).send();
}));

regionsRouter.get('/:id/properties', asyncHandler(async (req: Request, res: Response) => {
  const data = await regionsService.getProperties(param(req, 'id'));
  res.json({ success: true, data });
}));

regionsRouter.post('/:id/properties', asyncHandler(async (req: Request, res: Response) => {
  await regionsService.addProperty(param(req, 'id'), req.body.propertyId);
  res.status(201).json({ success: true });
}));

regionsRouter.delete('/:id/properties/:propertyId', asyncHandler(async (req: Request, res: Response) => {
  await regionsService.removeProperty(param(req, 'id'), param(req, 'propertyId'));
  res.status(204).send();
}));

// ─── Business Units ────────────────────────────

export const businessUnitsRouter = Router();

businessUnitsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await businessUnitsService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

businessUnitsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await businessUnitsService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

businessUnitsRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await businessUnitsService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

businessUnitsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await businessUnitsService.delete(param(req, 'id'));
  res.status(204).send();
}));

// ─── Properties ────────────────────────────────

export const propertiesRouter = Router();

propertiesRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { search, branchId, propertyType, status, page, limit } = req.query;
  const result = await propertiesService.findAll(req.user!.companyId, {
    search: search as string,
    branchId: branchId as string,
    propertyType: propertyType as string,
    status: status as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });
  res.json({ success: true, ...result });
}));

propertiesRouter.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getStats(req.user!.companyId);
  res.json({ success: true, data });
}));

propertiesRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.findById(param(req, 'id'));
  res.json({ success: true, data });
}));

propertiesRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.create(req.body, req.user!.companyId);
  res.status(201).json({ success: true, data });
}));

propertiesRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

propertiesRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await propertiesService.delete(param(req, 'id'));
  res.json({ success: true });
}));
