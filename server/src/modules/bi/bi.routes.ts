import { Router, Request } from 'express';
import { biService } from './bi.service';

const router = Router();
const getCompanyId = (req: Request) => (req as any).user.companyId;
const getUserId = (req: Request) => (req as any).user.id;

// ═══════ Executive Summary ═══════

router.get('/executive-summary', async (req, res, next) => {
  try {
    const propertyIds = req.query.propertyIds
      ? (req.query.propertyIds as string).split(',')
      : undefined;
    const data = await biService.getExecutiveSummary(getCompanyId(req), {
      propertyIds,
      dateRange: req.query.dateRange as string,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Forecasts ═══════

router.get('/forecasts/occupancy', async (req, res, next) => {
  try {
    const data = await biService.getOccupancyForecast(getCompanyId(req), {
      propertyId: req.query.propertyId as string,
      period: req.query.period as string,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/forecasts/revenue', async (req, res, next) => {
  try {
    const data = await biService.getRevenueForecast(getCompanyId(req), {
      propertyId: req.query.propertyId as string,
      period: req.query.period as string,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Anomalies ═══════

router.get('/anomalies', async (req, res, next) => {
  try {
    const result = await biService.listAnomalies(getCompanyId(req), {
      propertyId: req.query.propertyId as string,
      acknowledged: req.query.acknowledged as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

router.post('/anomalies/detect', async (req, res, next) => {
  try {
    const data = await biService.detectAnomalies(getCompanyId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/anomalies/:id/acknowledge', async (req, res, next) => {
  try {
    const data = await biService.acknowledgeAnomaly(req.params.id, getCompanyId(req), getUserId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/anomalies/:id/false-positive', async (req, res, next) => {
  try {
    const data = await biService.markFalsePositive(req.params.id, getCompanyId(req), getUserId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ═══════ Saved Reports ═══════

router.get('/reports', async (req, res, next) => {
  try {
    const result = await biService.listReports(getCompanyId(req), {
      reportType: req.query.reportType as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

router.post('/reports', async (req, res, next) => {
  try {
    const data = await biService.createReport(getCompanyId(req), getUserId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/reports/:id/run', async (req, res, next) => {
  try {
    const data = await biService.runReport(req.params.id, getCompanyId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.delete('/reports/:id', async (req, res, next) => {
  try {
    const data = await biService.deleteReport(req.params.id, getCompanyId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export const biRouter = router;
