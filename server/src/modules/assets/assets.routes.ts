import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { budgetsService } from './budgets.service';
import { assetsService } from './assets.service';

const p = (req: Request, key: string) => req.params[key] as string;
const q = (req: Request, key: string) => (req.query[key] as string) || '';

// ════════════════════════════════════════════════
// BUDGETS — /api/v1/budgets
// ════════════════════════════════════════════════
export const budgetsRouter = Router();

budgetsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await budgetsService.findAll(req.user!.companyId, req.query);
  res.json({ success: true, data });
}));

budgetsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await budgetsService.create(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

budgetsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await budgetsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

budgetsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await budgetsService.delete(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data: { deleted: true } });
}));

budgetsRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const data = await budgetsService.approve(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

budgetsRouter.get('/variance', asyncHandler(async (req, res) => {
  const fiscalYear = parseInt(q(req, 'fiscalYear')) || new Date().getFullYear();
  const month = q(req, 'month') ? parseInt(q(req, 'month')) : undefined;
  const propertyId = q(req, 'propertyId') || undefined;
  const data = await budgetsService.getVariance(req.user!.companyId, { fiscalYear, month, propertyId });
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// FIXED ASSETS — /api/v1/assets
// ════════════════════════════════════════════════
export const assetsRouter = Router();

assetsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await assetsService.findAll(req.user!.companyId, req.query);
  res.json({ success: true, ...result });
}));

assetsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await assetsService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

assetsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await assetsService.create(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

assetsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await assetsService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

assetsRouter.post('/:id/transfer', asyncHandler(async (req, res) => {
  const data = await assetsService.transfer(p(req, 'id'), req.user!.companyId, req.user!.sub, req.body);
  res.json({ success: true, data });
}));

assetsRouter.post('/:id/dispose', asyncHandler(async (req, res) => {
  const data = await assetsService.dispose(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

assetsRouter.get('/:id/depreciation-schedule', asyncHandler(async (req, res) => {
  const data = await assetsService.getDepreciationSchedule(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

assetsRouter.post('/depreciation/run', asyncHandler(async (req, res) => {
  const data = await assetsService.runDepreciation(req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));
