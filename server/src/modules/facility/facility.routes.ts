import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { facilityService } from './facility.service';
import {
  createFacilityAssetSchema, updateFacilityAssetSchema, createCamCostSchema,
} from './facility.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ── Routers ──────────────────────────────

export const facilityAssetsRouter = Router();
export const facilityCamRouter = Router();
export const facilityStatsRouter = Router();
export const facilityUtilityRouter = Router();

// ────────────────────────────────────────────
// FACILITY ASSETS
// ────────────────────────────────────────────

/** GET /facility/assets */
facilityAssetsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await facilityService.findAllAssets(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    assetType: req.query.assetType as string,
    status: req.query.status as string,
    serviceOverdue: req.query.serviceOverdue === 'true',
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** GET /facility/assets/service-due */
facilityAssetsRouter.get('/service-due', asyncHandler(async (req, res) => {
  const data = await facilityService.getServiceDue(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    days: parseInt(req.query.days as string) || 30,
  });
  res.json({ success: true, data });
}));

/** GET /facility/assets/warranty-expiring */
facilityAssetsRouter.get('/warranty-expiring', asyncHandler(async (req, res) => {
  const data = await facilityService.getWarrantyExpiring(req.user!.companyId, {
    days: parseInt(req.query.days as string) || 90,
  });
  res.json({ success: true, data });
}));

/** GET /facility/assets/:id */
facilityAssetsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await facilityService.findAssetById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

/** GET /facility/assets/:id/scan — QR code landing page */
facilityAssetsRouter.get('/:id/scan', asyncHandler(async (req, res) => {
  const data = await facilityService.scanAsset(p(req, 'id'));
  res.json({ success: true, data });
}));

/** POST /facility/assets */
facilityAssetsRouter.post('/', validateRequest(createFacilityAssetSchema), asyncHandler(async (req, res) => {
  const data = await facilityService.createAsset(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /facility/assets/:id */
facilityAssetsRouter.put('/:id', validateRequest(updateFacilityAssetSchema), asyncHandler(async (req, res) => {
  const data = await facilityService.updateAsset(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** DELETE /facility/assets/:id */
facilityAssetsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await facilityService.deleteAsset(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, message: 'Asset deleted' });
}));

// ────────────────────────────────────────────
// CAM COSTS
// ────────────────────────────────────────────

/** GET /facility/cam-costs */
facilityCamRouter.get('/', asyncHandler(async (req, res) => {
  const result = await facilityService.getCamCosts(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    year: req.query.year ? parseInt(req.query.year as string) : undefined,
    month: req.query.month ? parseInt(req.query.month as string) : undefined,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

/** POST /facility/cam-costs */
facilityCamRouter.post('/', validateRequest(createCamCostSchema), asyncHandler(async (req, res) => {
  const data = await facilityService.createCamCost(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

/** GET /facility/cam-costs/summary */
facilityCamRouter.get('/summary', asyncHandler(async (req, res) => {
  const data = await facilityService.getCamCostSummary(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    year: parseInt(req.query.year as string),
    month: parseInt(req.query.month as string),
  });
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────
// STATS
// ────────────────────────────────────────────

/** GET /facility/stats */
facilityStatsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await facilityService.getAssetStats(
    req.user!.companyId,
    req.query.propertyId as string,
  );
  res.json({ success: true, data });
}));

// ────────────────────────────────────────────
// UTILITY SYSTEMS
// ────────────────────────────────────────────

/** GET /facility/utility-systems */
facilityUtilityRouter.get('/', asyncHandler(async (req, res) => {
  const data = await facilityService.findAllUtilitySystems(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
  });
  res.json({ success: true, data });
}));

/** POST /facility/utility-systems */
facilityUtilityRouter.post('/', asyncHandler(async (req, res) => {
  const data = await facilityService.createUtilitySystem(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

/** PUT /facility/utility-systems/:id */
facilityUtilityRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await facilityService.updateUtilitySystem(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

/** DELETE /facility/utility-systems/:id */
facilityUtilityRouter.delete('/:id', asyncHandler(async (req, res) => {
  await facilityService.deleteUtilitySystem(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, message: 'Utility system deleted' });
}));
