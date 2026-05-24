import { Router, Request } from 'express';
import { condoService } from './condo.service';
import { validateRequest } from '../../middleware/validateRequest';
import {
  addMeterReadingSchema, upsertSmartDeviceSchema,
  createFundAccountSchema, addFundTransactionSchema,
  createMeetingSchema, addResolutionSchema, castVoteSchema, submitProxySchema, updateMeetingStatusSchema,
  createBylawSchema, createViolationSchema, fineViolationSchema, appealViolationSchema, resolveViolationSchema,
} from './condo.schema';

const router = Router();
const getCompanyId = (req: Request) => (req as any).user.companyId;
const getUserId = (req: Request) => (req as any).user.id;

// ═══════ Smart Meters ═══════

// IMPORTANT: static path "/meters/devices" must come before parameterized "/meters/:meterId/*"
router.get('/meters/devices', async (req, res, next) => {
  try {
    const data = await condoService.listSmartDevices(getCompanyId(req), req.query.propertyId as string);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/meters/:meterId/readings', async (req, res, next) => {
  try {
    const data = await condoService.listMeterReadings(
      getCompanyId(req), req.params.meterId,
      { from: req.query.from as string, to: req.query.to as string, limit: Number(req.query.limit) || 100 },
    );
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/meters/:meterId/readings', validateRequest(addMeterReadingSchema), async (req, res, next) => {
  try {
    const data = await condoService.addMeterReading(getCompanyId(req), req.params.meterId, req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/meters/:meterId/device', validateRequest(upsertSmartDeviceSchema), async (req, res, next) => {
  try {
    const data = await condoService.upsertSmartDevice(getCompanyId(req), req.params.meterId, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Funds ═══════

router.get('/funds', async (req, res, next) => {
  try {
    const data = await condoService.listFunds(
      getCompanyId(req), req.query.propertyId as string, Number(req.query.year) || undefined,
    );
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/funds', validateRequest(createFundAccountSchema), async (req, res, next) => {
  try {
    const data = await condoService.createFund(getCompanyId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/funds/:id/transactions', async (req, res, next) => {
  try {
    const result = await condoService.listFundTransactions(
      getCompanyId(req), req.params.id,
      { from: req.query.from as string, to: req.query.to as string, type: req.query.type as string,
        page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50 },
    );
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

router.post('/funds/:id/transactions', validateRequest(addFundTransactionSchema), async (req, res, next) => {
  try {
    const data = await condoService.addFundTransaction(getCompanyId(req), req.params.id, getUserId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Meetings (AGM/EGM) ═══════

router.get('/meetings', async (req, res, next) => {
  try {
    const data = await condoService.listMeetings(getCompanyId(req), {
      propertyId: req.query.propertyId as string,
      year: Number(req.query.year) || undefined,
      meetingType: req.query.meetingType as string,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/meetings', validateRequest(createMeetingSchema), async (req, res, next) => {
  try {
    const data = await condoService.createMeeting(getCompanyId(req), getUserId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/meetings/:id', async (req, res, next) => {
  try {
    const data = await condoService.getMeetingDetail(req.params.id, getCompanyId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.patch('/meetings/:id/status', validateRequest(updateMeetingStatusSchema), async (req, res, next) => {
  try {
    const data = await condoService.updateMeetingStatus(req.params.id, getCompanyId(req), req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/meetings/:id/results', async (req, res, next) => {
  try {
    const data = await condoService.getMeetingResults(req.params.id, getCompanyId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/meetings/:id/resolutions', validateRequest(addResolutionSchema), async (req, res, next) => {
  try {
    const data = await condoService.addResolution(getCompanyId(req), req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/meetings/:meetingId/resolutions/:resolutionId/vote', validateRequest(castVoteSchema), async (req, res, next) => {
  try {
    const data = await condoService.castVote(
      getCompanyId(req), req.params.meetingId, req.params.resolutionId, getUserId(req), req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/meetings/:id/proxies', validateRequest(submitProxySchema), async (req, res, next) => {
  try {
    const data = await condoService.submitProxy(getCompanyId(req), req.params.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Bylaws ═══════

router.get('/bylaws', async (req, res, next) => {
  try {
    const data = await condoService.listBylaws(getCompanyId(req), {
      propertyId: req.query.propertyId as string,
      category: req.query.category as string,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/bylaws', validateRequest(createBylawSchema), async (req, res, next) => {
  try {
    const data = await condoService.createBylaw(getCompanyId(req), getUserId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.patch('/bylaws/:id', async (req, res, next) => {
  try {
    const data = await condoService.updateBylaw(req.params.id, getCompanyId(req), req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Violations ═══════

router.get('/violations', async (req, res, next) => {
  try {
    const result = await condoService.listViolations(getCompanyId(req), {
      propertyId: req.query.propertyId as string,
      bylawId: req.query.bylawId as string,
      unitId: req.query.unitId as string,
      status: req.query.status as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

router.post('/violations', validateRequest(createViolationSchema), async (req, res, next) => {
  try {
    const data = await condoService.createViolation(getCompanyId(req), getUserId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/violations/:id/fine', validateRequest(fineViolationSchema), async (req, res, next) => {
  try {
    const data = await condoService.fineViolation(req.params.id, getCompanyId(req), req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/violations/:id/appeal', validateRequest(appealViolationSchema), async (req, res, next) => {
  try {
    const data = await condoService.appealViolation(req.params.id, getCompanyId(req), req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/violations/:id/resolve', validateRequest(resolveViolationSchema), async (req, res, next) => {
  try {
    const data = await condoService.resolveViolation(req.params.id, getCompanyId(req), req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export const condoRouter = router;
