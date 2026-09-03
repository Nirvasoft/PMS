import { Router, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler, propertyAccessGuard, getUserFloorScope } from '../../middleware';
import { requirePermission } from '../auth/guards/roleGuard';
import { towersService, unitsService, metersService, unitChargesService } from './units.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const p = (req: Request, key: string) => req.params[key] as string;

// ═══════════════════════════════════════════════════
// UNIT TYPES CATALOG
// ═══════════════════════════════════════════════════
export const unitTypesRouter = Router();
unitTypesRouter.get('/', asyncHandler(async (_req, res) => {
  const data = await unitsService.getUnitTypes();
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════════════════
// TOWERS — nested under /properties/:propertyId/towers
// ═══════════════════════════════════════════════════
export const towersRouter = Router({ mergeParams: true });
towersRouter.use(propertyAccessGuard);

/** GET /properties/:propertyId/towers */
towersRouter.get('/', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const data = await towersService.findAll(p(req, 'propertyId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/towers */
towersRouter.post('/', requirePermission('unit.create'), asyncHandler(async (req, res) => {
  const data = await towersService.create(p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/towers/:towerId */
towersRouter.put('/:towerId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await towersService.update(p(req, 'towerId'), p(req, 'propertyId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/towers/:towerId */
towersRouter.delete('/:towerId', requirePermission('unit.delete'), asyncHandler(async (req, res) => {
  await towersService.delete(p(req, 'towerId'), p(req, 'propertyId'));
  res.status(204).send();
}));

/** POST /properties/:propertyId/towers/:towerId/sections */
towersRouter.post('/:towerId/sections', requirePermission('unit.create'), asyncHandler(async (req, res) => {
  const data = await towersService.addSection(p(req, 'towerId'), req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/towers/:towerId/sections/:sectionId */
towersRouter.put('/:towerId/sections/:sectionId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await towersService.updateSection(p(req, 'towerId'), p(req, 'sectionId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/towers/:towerId/sections/:sectionId */
towersRouter.delete('/:towerId/sections/:sectionId', requirePermission('unit.delete'), asyncHandler(async (req, res) => {
  await towersService.deleteSection(p(req, 'towerId'), p(req, 'sectionId'));
  res.status(204).send();
}));

// ═══════════════════════════════════════════════════
// UNITS — nested under /properties/:propertyId/units
// ═══════════════════════════════════════════════════
export const unitsRouter = Router({ mergeParams: true });
unitsRouter.use(propertyAccessGuard);

/** GET /properties/:propertyId/units */
unitsRouter.get('/', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  const result = await unitsService.findAll(p(req, 'propertyId'), {
    towerId:   req.query.towerId as string,
    sectionId: req.query.sectionId as string,
    status:    req.query.status as string,
    unitType:  req.query.unitType as string,
    floor:     req.query.floor ? parseInt(req.query.floor as string) : undefined,
    search:    req.query.search as string,
    page:      parseInt(req.query.page as string) || 1,
    limit:     Math.min(parseInt(req.query.limit as string) || 50, 200),
    floorScope: floorScope ?? undefined,
  });
  res.json({ success: true, ...result });
}));

/** GET /properties/:propertyId/floor-plan */
unitsRouter.get('/floor-plan', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  const data = await unitsService.getFloorPlan(p(req, 'propertyId'), req.query.towerId as string, floorScope);
  res.json({ success: true, data });
}));

/** GET /properties/:propertyId/unit-stats */
unitsRouter.get('/stats', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const data = await unitsService.getStats(p(req, 'propertyId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/units/bulk */
unitsRouter.post('/bulk', requirePermission('unit.create'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  const data = await unitsService.bulkCreate(p(req, 'propertyId'), req.user!.companyId, req.body, req.user!.sub, floorScope);
  res.status(201).json({ success: true, data });
}));

/** POST /properties/:propertyId/units/check-conflicts — lightweight conflict pre-check */
unitsRouter.post('/check-conflicts', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const { unitNumbers } = req.body as { unitNumbers: string[] };
  if (!Array.isArray(unitNumbers) || unitNumbers.length === 0) {
    res.json({ success: true, data: { conflicts: [] } });
    return;
  }
  const conflicts = await unitsService.checkConflicts(p(req, 'propertyId'), unitNumbers);
  res.json({ success: true, data: { conflicts } });
}));

/** POST /properties/:propertyId/units */
unitsRouter.post('/', requirePermission('unit.create'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  const data = await unitsService.create(p(req, 'propertyId'), req.user!.companyId, req.body, req.user!.sub, floorScope);
  res.status(201).json({ success: true, data });
}));

/** GET /properties/:propertyId/units/:unitId */
unitsRouter.get('/:unitId', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  const data = await unitsService.findById(p(req, 'propertyId'), p(req, 'unitId'), floorScope);
  res.json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId */
unitsRouter.put('/:unitId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  const data = await unitsService.update(p(req, 'propertyId'), p(req, 'unitId'), req.body, floorScope);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/units/:unitId */
unitsRouter.delete('/:unitId', requirePermission('unit.delete'), asyncHandler(async (req, res) => {
  const floorScope = await getUserFloorScope(req.user!.sub);
  await unitsService.delete(p(req, 'propertyId'), p(req, 'unitId'), floorScope);
  res.status(204).send();
}));

/** POST /properties/:propertyId/units/:unitId/status */
unitsRouter.post('/:unitId/status', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await unitsService.updateStatus(p(req, 'propertyId'), p(req, 'unitId'), req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** GET /properties/:propertyId/units/:unitId/status-history */
unitsRouter.get('/:unitId/status-history', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const data = await unitsService.findById(p(req, 'propertyId'), p(req, 'unitId'));
  res.json({ success: true, data: data.statusHistory });
}));

/** POST /properties/:propertyId/units/:unitId/floor-plan */
unitsRouter.post('/:unitId/floor-plan', requirePermission('unit.update'), upload.single('floorPlan'), asyncHandler(async (req, res) => {
  if (!req.file) throw new Error('No file uploaded');
  const floorScope = await getUserFloorScope(req.user!.sub);
  const data = await unitsService.uploadFloorPlan(p(req, 'propertyId'), p(req, 'unitId'), req.file, floorScope);
  res.json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId/amenities */
unitsRouter.put('/:unitId/amenities', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await unitsService.setAmenities(p(req, 'unitId'), req.body.amenities || []);
  res.json({ success: true, data });
}));

// ── Meters ──────────────────────────────────────────

/** GET /properties/:propertyId/units/:unitId/meters */
unitsRouter.get('/:unitId/meters', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const data = await metersService.findAll(p(req, 'unitId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/units/:unitId/meters */
unitsRouter.post('/:unitId/meters', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await metersService.create(p(req, 'unitId'), p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId/meters/:meterId */
unitsRouter.put('/:unitId/meters/:meterId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await metersService.update(p(req, 'meterId'), p(req, 'unitId'), req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/units/:unitId/meters/:meterId */
unitsRouter.delete('/:unitId/meters/:meterId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  await metersService.delete(p(req, 'meterId'), p(req, 'unitId'));
  res.status(204).send();
}));

// ── Unit Charges ─────────────────────────────────────

/** GET /properties/:propertyId/units/:unitId/charges */
unitsRouter.get('/:unitId/charges', requirePermission('unit.read'), asyncHandler(async (req, res) => {
  const data = await unitChargesService.findAll(p(req, 'unitId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/units/:unitId/charges */
unitsRouter.post('/:unitId/charges', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await unitChargesService.create(p(req, 'unitId'), req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId/charges/:chargeId */
unitsRouter.put('/:unitId/charges/:chargeId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  const data = await unitChargesService.update(p(req, 'unitId'), p(req, 'chargeId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/units/:unitId/charges/:chargeId */
unitsRouter.delete('/:unitId/charges/:chargeId', requirePermission('unit.update'), asyncHandler(async (req, res) => {
  await unitChargesService.delete(p(req, 'unitId'), p(req, 'chargeId'));
  res.status(204).send();
}));
