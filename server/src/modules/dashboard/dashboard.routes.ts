import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { dashboardService } from './dashboard.service';

// ═══════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════

export const dashboardRouter = Router();

/** GET /dashboard/widgets — Widget catalog (grouped by category) */
dashboardRouter.get('/widgets', asyncHandler(async (_req: Request, res: Response) => {
  const catalog = await dashboardService.getWidgetCatalog();
  res.json({ success: true, data: catalog });
}));

/** GET /dashboard/widget-data/:code — Get data for a specific widget */
dashboardRouter.get('/widget-data/:code', asyncHandler(async (req: Request, res: Response) => {
  const data = await dashboardService.getWidgetData(
    req.params.code as string,
    req.user!.companyId,
    {
      propertyId: req.query.propertyId as string,
      dateRange: req.query.dateRange as string,
    },
  );
  res.json({ success: true, data });
}));

/** GET /dashboard/layout — Get user's dashboard layout */
dashboardRouter.get('/layout', asyncHandler(async (req: Request, res: Response) => {
  const layout = await dashboardService.getLayout(
    req.user!.sub,
    (req.query.dashboardKey as string) || 'main',
  );
  res.json({ success: true, data: layout });
}));

/** PUT /dashboard/layout — Save user's dashboard layout */
dashboardRouter.put('/layout', asyncHandler(async (req: Request, res: Response) => {
  await dashboardService.saveLayout(
    req.user!.sub,
    req.body.dashboardKey || 'main',
    req.body.layout,
  );
  res.json({ success: true });
}));

/** POST /dashboard/layout/reset — Reset to default layout */
dashboardRouter.post('/layout/reset', asyncHandler(async (req: Request, res: Response) => {
  await dashboardService.resetLayout(req.user!.sub);
  res.json({ success: true });
}));

// ═══════════════════════════════════════════════════
// REPORTS ROUTES
// ═══════════════════════════════════════════════════

export const reportsRouter = Router();

/** GET /reports — List saved reports */
reportsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await dashboardService.listReports(req.user!.companyId, {
    reportType: req.query.reportType as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
  });
  res.json({ success: true, ...result });
}));

/** POST /reports — Save a report configuration */
reportsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const report = await dashboardService.createReport(
    req.user!.companyId,
    req.user!.sub,
    req.body,
  );
  res.status(201).json({ success: true, data: report });
}));

/** DELETE /reports/:id — Delete a saved report */
reportsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await dashboardService.deleteReport(req.params.id as string, req.user!.companyId);
  res.status(204).send();
}));

/**
 * POST /reports/:type/export — Queue a report export (Phase 1: returns mock)
 * In Phase 2, this would queue a Bull job for Excel/PDF generation.
 */
reportsRouter.post('/:type/export', asyncHandler(async (req: Request, res: Response) => {
  // Phase 1 — stub response (no actual export generation)
  res.status(202).json({
    success: true,
    data: {
      exportId: `export_${Date.now()}`,
      status: 'queued',
      estimatedSeconds: 30,
      message: 'Export generation is not yet implemented — coming in Phase 2',
    },
  });
}));
