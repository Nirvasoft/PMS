import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { mallService } from './mall.service';
import {
  upsertMallPropertySchema, upsertShopProfileSchema,
  upsertCommercialLeaseSchema,
  submitGtoSchema, verifyGtoSchema,
  createCamPoolSchema, updateCamPoolSchema, generateCamBillingSchema, runReconciliationSchema,
  createEventSchema, updateEventSchema, createBoothSchema,
  createSensorSchema,
} from './mall.schema';

const router = Router();

// Helper
const getCompanyId = (req: Request) => (req as any).user.companyId;
const getUserId = (req: Request) => (req as any).user.id;

// ═══════════════════════════════════════
//  MALL PROPERTY CONFIG
// ═══════════════════════════════════════

router.get('/properties/:propertyId/config', asyncHandler(async (req, res) => {
  const data = await mallService.getMallProperty(req.params.propertyId, getCompanyId(req));
  res.json({ success: true, data });
}));

router.put('/properties/:propertyId/config', validateRequest(upsertMallPropertySchema), asyncHandler(async (req, res) => {
  const data = await mallService.upsertMallProperty(req.params.propertyId, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  SHOP PROFILES
// ═══════════════════════════════════════
// Static path must come before parameterized /shops/:unitId
router.get('/shops/available-units', asyncHandler(async (req, res) => {
  const data = await mallService.listAvailableUnits(getCompanyId(req), req.query.propertyId as string);
  res.json({ success: true, data });
}));

router.get('/shops', asyncHandler(async (req, res) => {
  const result = await mallService.listShops(getCompanyId(req), {
    propertyId: req.query.propertyId as string,
    tradeCategory: req.query.tradeCategory as string,
    shopZone: req.query.shopZone as string,
    isAnchor: req.query.isAnchor === 'true' ? true : req.query.isAnchor === 'false' ? false : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
  });
  res.json({ success: true, ...result });
}));

router.get('/shops/:unitId', asyncHandler(async (req, res) => {
  const data = await mallService.getShopProfile(req.params.unitId, getCompanyId(req));
  res.json({ success: true, data });
}));

router.put('/shops/:unitId/profile', validateRequest(upsertShopProfileSchema), asyncHandler(async (req, res) => {
  const data = await mallService.upsertShopProfile(req.params.unitId, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

router.get('/tenant-mix', asyncHandler(async (req, res) => {
  const data = await mallService.getTenantMix(req.query.propertyId as string, getCompanyId(req));
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  COMMERCIAL LEASES
// ═══════════════════════════════════════

router.get('/commercial-leases/:leaseId', asyncHandler(async (req, res) => {
  const data = await mallService.getCommercialLease(req.params.leaseId, getCompanyId(req));
  res.json({ success: true, data });
}));

router.put('/commercial-leases/:leaseId', validateRequest(upsertCommercialLeaseSchema), asyncHandler(async (req, res) => {
  const data = await mallService.upsertCommercialLease(req.params.leaseId, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  GTO SUBMISSIONS
// ═══════════════════════════════════════

router.get('/gto', asyncHandler(async (req, res) => {
  const result = await mallService.listGtoSubmissions(getCompanyId(req), {
    propertyId: req.query.propertyId as string,
    leaseId: req.query.leaseId as string,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
  });
  res.json({ success: true, ...result });
}));

router.post('/gto', validateRequest(submitGtoSchema), asyncHandler(async (req, res) => {
  const data = await mallService.submitGto(getCompanyId(req), getUserId(req), req.body);
  res.status(201).json({ success: true, data });
}));

router.post('/gto/:id/verify', validateRequest(verifyGtoSchema), asyncHandler(async (req, res) => {
  const data = await mallService.verifyGto(req.params.id, getCompanyId(req), getUserId(req), req.body);
  res.json({ success: true, data });
}));

router.get('/gto/summary', asyncHandler(async (req, res) => {
  const data = await mallService.getGtoSummary(
    req.query.propertyId as string, getCompanyId(req),
    Number(req.query.month), Number(req.query.year),
  );
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  CAM MANAGEMENT
// ═══════════════════════════════════════

router.get('/cam/pools', asyncHandler(async (req, res) => {
  const data = await mallService.listCamPools(
    getCompanyId(req), req.query.propertyId as string, Number(req.query.year),
  );
  res.json({ success: true, data });
}));

router.post('/cam/pools', validateRequest(createCamPoolSchema), asyncHandler(async (req, res) => {
  const data = await mallService.createCamPool(getCompanyId(req), req.body);
  res.status(201).json({ success: true, data });
}));

router.put('/cam/pools/:id', validateRequest(updateCamPoolSchema), asyncHandler(async (req, res) => {
  const data = await mallService.updateCamPool(req.params.id, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

router.get('/cam/billing', asyncHandler(async (req, res) => {
  const data = await mallService.listCamBillings(getCompanyId(req), {
    propertyId: req.query.propertyId as string,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    unitId: req.query.unitId as string,
  });
  res.json({ success: true, data });
}));

router.get('/cam/reconciliations', asyncHandler(async (req, res) => {
  const data = await mallService.listCamReconciliations(
    getCompanyId(req), req.query.propertyId as string, Number(req.query.year),
  );
  res.json({ success: true, data });
}));

router.post('/cam/billing/generate', validateRequest(generateCamBillingSchema), asyncHandler(async (req, res) => {
  const data = await mallService.generateCamBillings(
    getCompanyId(req), req.body.propertyId, req.body.month, req.body.year,
  );
  res.status(201).json({ success: true, data });
}));

router.post('/cam/reconciliation/run', validateRequest(runReconciliationSchema), asyncHandler(async (req, res) => {
  const data = await mallService.runCamReconciliation(
    getCompanyId(req), req.body.propertyId, req.body.year,
  );
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  EVENTS & BOOTHS
// ═══════════════════════════════════════

router.get('/events', asyncHandler(async (req, res) => {
  const result = await mallService.listEvents(getCompanyId(req), {
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
  });
  res.json({ success: true, ...result });
}));

router.post('/events', validateRequest(createEventSchema), asyncHandler(async (req, res) => {
  const data = await mallService.createEvent(getCompanyId(req), getUserId(req), req.body);
  res.status(201).json({ success: true, data });
}));

router.put('/events/:id', validateRequest(updateEventSchema), asyncHandler(async (req, res) => {
  const data = await mallService.updateEvent(req.params.id, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

router.get('/events/:id', asyncHandler(async (req, res) => {
  const data = await mallService.getEventDetail(req.params.id, getCompanyId(req));
  res.json({ success: true, data });
}));

router.post('/events/:eventId/booths', validateRequest(createBoothSchema), asyncHandler(async (req, res) => {
  const data = await mallService.createBooth(req.params.eventId, getCompanyId(req), req.body);
  res.status(201).json({ success: true, data });
}));

router.put('/booths/:id', asyncHandler(async (req, res) => {
  const data = await mallService.updateBooth(req.params.id, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  FOOTFALL SENSORS
// ═══════════════════════════════════════

router.get('/footfall/sensors', asyncHandler(async (req, res) => {
  const data = await mallService.listSensors(getCompanyId(req), req.query.propertyId as string);
  res.json({ success: true, data });
}));

router.post('/footfall/sensors', validateRequest(createSensorSchema), asyncHandler(async (req, res) => {
  const data = await mallService.createSensor(getCompanyId(req), req.body);
  res.status(201).json({ success: true, data });
}));

router.put('/footfall/sensors/:id', asyncHandler(async (req, res) => {
  const data = await mallService.updateSensor(req.params.id, getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════

router.get('/dashboard', asyncHandler(async (req, res) => {
  const data = await mallService.getDashboardStats(getCompanyId(req), req.query.propertyId as string);
  res.json({ success: true, data });
}));

export const mallRouter = router;
