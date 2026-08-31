import { Router, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler, propertyAccessGuard, getUserPropertyScope } from '../../middleware';
import { requirePermission } from '../auth/guards/roleGuard';
import { propertiesService } from './properties.service';
import { floorSetupService } from './floorSetup.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 20 } });

const p = (req: Request, key: string) => req.params[key] as string;

// ═══════════════════════════════════════════════════
// PROPERTIES ROUTES
// ═══════════════════════════════════════════════════

export const propertiesRouter = Router();

/** GET /properties — list with filters & pagination */
propertiesRouter.get('/', requirePermission('properties.read'), asyncHandler(async (req: Request, res: Response) => {
  const propertyScope = await getUserPropertyScope(req.user!.sub);
  const result = await propertiesService.findAll(req.user!.companyId, {
    search: req.query.search as string,
    branchId: req.query.branchId as string,
    propertyType: req.query.propertyType as string,
    status: req.query.status as string,
    regionId: req.query.regionId as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
    sort: req.query.sort as string,
    order: req.query.order as string,
    propertyIds: propertyScope ?? undefined,
  });
  res.json({ success: true, ...result });
}));

/** GET /properties/types — property type catalog */
propertiesRouter.get('/types', asyncHandler(async (_req: Request, res: Response) => {
  const data = await propertiesService.getPropertyTypes();
  res.json({ success: true, data });
}));

/** GET /properties/nearby — find properties near a lat/lng point */
propertiesRouter.get('/nearby', requirePermission('properties.read'), asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ success: false, message: 'lat and lng are required as numbers' });
    return;
  }
  const radiusKm = req.query.radiusKm ? parseFloat(req.query.radiusKm as string) : undefined;
  const excludePropertyId = req.query.excludePropertyId as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const data = await propertiesService.findNearby(req.user!.companyId, {
    lat, lng, radiusKm, excludePropertyId, limit,
  });
  res.json({ success: true, data });
}));

/** GET /properties/stats — company-level stats */
propertiesRouter.get('/stats', requirePermission('properties.read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getStats(req.user!.companyId);
  res.json({ success: true, data });
}));

/** GET /properties/:id */
propertiesRouter.get('/:id', requirePermission('properties.read'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.findById(p(req, 'id'));
  res.json({ success: true, data });
}));

/** POST /properties */
propertiesRouter.post('/', requirePermission('properties.create'), asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.create(req.body, req.user!.companyId, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:id */
propertiesRouter.put('/:id', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.update(p(req, 'id'), req.body, req.user!.companyId);
  res.json({ success: true, data });
}));

/** DELETE /properties/:id */
propertiesRouter.delete('/:id', requirePermission('properties.delete'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  await propertiesService.delete(p(req, 'id'), req.user!.companyId);
  res.status(204).send();
}));

/** POST /properties/:id/status */
propertiesRouter.post('/:id/status', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.updateStatus(p(req, 'id'), req.body, req.user!.sub, req.user!.companyId);
  res.json({ success: true, data });
}));

/** GET /properties/:id/status-history */
propertiesRouter.get('/:id/status-history', requirePermission('properties.read'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getStatusHistory(p(req, 'id'));
  res.json({ success: true, data });
}));

/** GET /properties/:id/stats */
propertiesRouter.get('/:id/stats', requirePermission('properties.read'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getPropertyStats(p(req, 'id'));
  res.json({ success: true, data });
}));

// ── Photos ─────────────────────────────────────

/** GET /properties/:id/photos */
propertiesRouter.get('/:id/photos', requirePermission('properties.read'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getPhotos(p(req, 'id'));
  res.json({ success: true, data });
}));

/** POST /properties/:id/photos — multipart upload */
propertiesRouter.post('/:id/photos', requirePermission('properties.update'), propertyAccessGuard, upload.array('photos', 20), asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) throw new Error('No photos uploaded');
  const data = await propertiesService.uploadPhotos(p(req, 'id'), files, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:id/photos/order */
propertiesRouter.put('/:id/photos/order', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  await propertiesService.reorderPhotos(p(req, 'id'), req.body.order);
  res.json({ success: true });
}));

/** PUT /properties/:id/photos/:photoId/cover */
propertiesRouter.put('/:id/photos/:photoId/cover', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.setCoverPhoto(p(req, 'id'), p(req, 'photoId'));
  res.json({ success: true, data });
}));

/** DELETE /properties/:id/photos/:photoId */
propertiesRouter.delete('/:id/photos/:photoId', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  await propertiesService.deletePhoto(p(req, 'id'), p(req, 'photoId'));
  res.status(204).send();
}));

// ── Facilities ─────────────────────────────────

/** GET /facility-types */
export const facilityTypesRouter = Router();
facilityTypesRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const data = await propertiesService.getFacilityTypes();
  res.json({ success: true, data });
}));

/** GET /properties/:id/facilities */
propertiesRouter.get('/:id/facilities', requirePermission('properties.read'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getFacilities(p(req, 'id'));
  res.json({ success: true, data });
}));

/** POST /properties/:id/facilities */
propertiesRouter.post('/:id/facilities', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.addFacility(p(req, 'id'), req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:id/facilities/:facilityId */
propertiesRouter.put('/:id/facilities/:facilityId', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.updateFacility(p(req, 'id'), p(req, 'facilityId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:id/facilities/:facilityId */
propertiesRouter.delete('/:id/facilities/:facilityId', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  await propertiesService.removeFacility(p(req, 'id'), p(req, 'facilityId'));
  res.status(204).send();
}));

// ── Contacts ───────────────────────────────────

/** GET /properties/:id/contacts */
propertiesRouter.get('/:id/contacts', requirePermission('properties.read'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.getContacts(p(req, 'id'));
  res.json({ success: true, data });
}));

/** POST /properties/:id/contacts */
propertiesRouter.post('/:id/contacts', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.addContact(p(req, 'id'), req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:id/contacts/:contactId */
propertiesRouter.put('/:id/contacts/:contactId', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  const data = await propertiesService.updateContact(p(req, 'id'), p(req, 'contactId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:id/contacts/:contactId */
propertiesRouter.delete('/:id/contacts/:contactId', requirePermission('properties.update'), propertyAccessGuard, asyncHandler(async (req: Request, res: Response) => {
  await propertiesService.removeContact(p(req, 'id'), p(req, 'contactId'));
  res.status(204).send();
}));

// ═══════════════════════════════════════════════════
// FLOOR SETUP — /api/v1/floor-setup
// ═══════════════════════════════════════════════════
export const floorSetupRouter = Router();

floorSetupRouter.get('/', requirePermission('floor.read'), asyncHandler(async (req: Request, res: Response) => {
  const data = await floorSetupService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    floorNumber: req.query.floorNumber ? parseInt(req.query.floorNumber as string) : undefined,
  });
  res.json({ success: true, data });
}));

floorSetupRouter.post('/', requirePermission('floor.create'), asyncHandler(async (req: Request, res: Response) => {
  const data = await floorSetupService.create(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

floorSetupRouter.put('/:id', requirePermission('floor.update'), asyncHandler(async (req: Request, res: Response) => {
  const data = await floorSetupService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

floorSetupRouter.delete('/:id', requirePermission('floor.delete'), asyncHandler(async (req: Request, res: Response) => {
  await floorSetupService.delete(p(req, 'id'), req.user!.companyId);
  res.json({ success: true });
}));
