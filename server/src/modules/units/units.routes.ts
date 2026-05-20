import { Router, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../middleware';
import { towersService, unitsService, metersService } from './units.service';

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

/** GET /properties/:propertyId/towers */
towersRouter.get('/', asyncHandler(async (req, res) => {
  const data = await towersService.findAll(p(req, 'propertyId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/towers */
towersRouter.post('/', asyncHandler(async (req, res) => {
  const data = await towersService.create(p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/towers/:towerId */
towersRouter.put('/:towerId', asyncHandler(async (req, res) => {
  const data = await towersService.update(p(req, 'towerId'), p(req, 'propertyId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/towers/:towerId */
towersRouter.delete('/:towerId', asyncHandler(async (req, res) => {
  await towersService.delete(p(req, 'towerId'), p(req, 'propertyId'));
  res.status(204).send();
}));

/** POST /properties/:propertyId/towers/:towerId/sections */
towersRouter.post('/:towerId/sections', asyncHandler(async (req, res) => {
  const data = await towersService.addSection(p(req, 'towerId'), req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/towers/:towerId/sections/:sectionId */
towersRouter.put('/:towerId/sections/:sectionId', asyncHandler(async (req, res) => {
  const data = await towersService.updateSection(p(req, 'towerId'), p(req, 'sectionId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/towers/:towerId/sections/:sectionId */
towersRouter.delete('/:towerId/sections/:sectionId', asyncHandler(async (req, res) => {
  await towersService.deleteSection(p(req, 'towerId'), p(req, 'sectionId'));
  res.status(204).send();
}));

// ═══════════════════════════════════════════════════
// UNITS — nested under /properties/:propertyId/units
// ═══════════════════════════════════════════════════
export const unitsRouter = Router({ mergeParams: true });

/** GET /properties/:propertyId/units */
unitsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await unitsService.findAll(p(req, 'propertyId'), {
    towerId:   req.query.towerId as string,
    sectionId: req.query.sectionId as string,
    status:    req.query.status as string,
    unitType:  req.query.unitType as string,
    floor:     req.query.floor ? parseInt(req.query.floor as string) : undefined,
    search:    req.query.search as string,
    page:      parseInt(req.query.page as string) || 1,
    limit:     Math.min(parseInt(req.query.limit as string) || 50, 200),
  });
  res.json({ success: true, ...result });
}));

/** GET /properties/:propertyId/floor-plan */
unitsRouter.get('/floor-plan', asyncHandler(async (req, res) => {
  const data = await unitsService.getFloorPlan(p(req, 'propertyId'), req.query.towerId as string);
  res.json({ success: true, data });
}));

/** GET /properties/:propertyId/unit-stats */
unitsRouter.get('/stats', asyncHandler(async (req, res) => {
  const data = await unitsService.getStats(p(req, 'propertyId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/units/bulk */
unitsRouter.post('/bulk', asyncHandler(async (req, res) => {
  const data = await unitsService.bulkCreate(p(req, 'propertyId'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** POST /properties/:propertyId/units/check-conflicts — lightweight conflict pre-check */
unitsRouter.post('/check-conflicts', asyncHandler(async (req, res) => {
  const { unitNumbers } = req.body as { unitNumbers: string[] };
  if (!Array.isArray(unitNumbers) || unitNumbers.length === 0) {
    res.json({ success: true, data: { conflicts: [] } });
    return;
  }
  const conflicts = await unitsService.checkConflicts(p(req, 'propertyId'), unitNumbers);
  res.json({ success: true, data: { conflicts } });
}));

/** POST /properties/:propertyId/units */
unitsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await unitsService.create(p(req, 'propertyId'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** GET /properties/:propertyId/units/:unitId */
unitsRouter.get('/:unitId', asyncHandler(async (req, res) => {
  const data = await unitsService.findById(p(req, 'propertyId'), p(req, 'unitId'));
  res.json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId */
unitsRouter.put('/:unitId', asyncHandler(async (req, res) => {
  const data = await unitsService.update(p(req, 'propertyId'), p(req, 'unitId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/units/:unitId */
unitsRouter.delete('/:unitId', asyncHandler(async (req, res) => {
  await unitsService.delete(p(req, 'propertyId'), p(req, 'unitId'));
  res.status(204).send();
}));

/** POST /properties/:propertyId/units/:unitId/status */
unitsRouter.post('/:unitId/status', asyncHandler(async (req, res) => {
  const data = await unitsService.updateStatus(p(req, 'propertyId'), p(req, 'unitId'), req.body, req.user!.sub);
  res.json({ success: true, data });
}));

/** GET /properties/:propertyId/units/:unitId/status-history */
unitsRouter.get('/:unitId/status-history', asyncHandler(async (req, res) => {
  const data = await unitsService.findById(p(req, 'propertyId'), p(req, 'unitId'));
  res.json({ success: true, data: data.statusHistory });
}));

/** POST /properties/:propertyId/units/:unitId/floor-plan */
unitsRouter.post('/:unitId/floor-plan', upload.single('floorPlan'), asyncHandler(async (req, res) => {
  if (!req.file) throw new Error('No file uploaded');
  const data = await unitsService.uploadFloorPlan(p(req, 'propertyId'), p(req, 'unitId'), req.file);
  res.json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId/amenities */
unitsRouter.put('/:unitId/amenities', asyncHandler(async (req, res) => {
  const data = await unitsService.setAmenities(p(req, 'unitId'), req.body.amenities || []);
  res.json({ success: true, data });
}));

// ── Meters ──────────────────────────────────────────

/** GET /properties/:propertyId/units/:unitId/meters */
unitsRouter.get('/:unitId/meters', asyncHandler(async (req, res) => {
  const data = await metersService.findAll(p(req, 'unitId'));
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/units/:unitId/meters */
unitsRouter.post('/:unitId/meters', asyncHandler(async (req, res) => {
  const data = await metersService.create(p(req, 'unitId'), p(req, 'propertyId'), req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /properties/:propertyId/units/:unitId/meters/:meterId */
unitsRouter.put('/:unitId/meters/:meterId', asyncHandler(async (req, res) => {
  const data = await metersService.update(p(req, 'meterId'), p(req, 'unitId'), req.body);
  res.json({ success: true, data });
}));

/** DELETE /properties/:propertyId/units/:unitId/meters/:meterId */
unitsRouter.delete('/:unitId/meters/:meterId', asyncHandler(async (req, res) => {
  await metersService.delete(p(req, 'meterId'), p(req, 'unitId'));
  res.status(204).send();
}));
