import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware';
import { dashboardService } from './dashboard.service';
import { getDrillDownData } from './widgets/drillDownProvider';

// ═══════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════

export const dashboardRouter = Router();

/** GET /dashboard/widgets — Widget catalog (grouped by category) */
dashboardRouter.get('/widgets', asyncHandler(async (req: Request, res: Response) => {
  const catalog = await dashboardService.getWidgetCatalog(req.user?.companyId);
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
      userId: req.user!.sub,
    },
  );
  res.json({ success: true, data });
}));

/** GET /dashboard/widget-data/:code/drilldown — Drill-down detail data */
dashboardRouter.get('/widget-data/:code/drilldown', asyncHandler(async (req: Request, res: Response) => {
  const data = await getDrillDownData(req.params.code as string, {
    companyId: req.user!.companyId,
    userId: req.user!.sub,
    drillKey: req.query.drillKey as string,
    dateFrom: req.query.dateFrom as string,
    dateTo: req.query.dateTo as string,
  });
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
 * POST /reports/:type/export — Generate and download a report export.
 * Body: { format: 'xlsx' | 'csv', parameters?: { propertyId?, dateRange? } }
 */
reportsRouter.post('/:type/export', asyncHandler(async (req: Request, res: Response) => {
  const { exportToExcel, exportToCsv } = await import('./export.service');
  const widgetCode = req.params.type as string;
  const format = (req.body.format || 'xlsx') as string;
  const parameters = (req.body.parameters || {}) as Record<string, string>;

  const exportParams = {
    companyId: req.user!.companyId,
    propertyId: parameters.propertyId,
    dateFrom: parameters.dateFrom || parameters.dateRange?.split(',')[0],
    dateTo: parameters.dateTo || parameters.dateRange?.split(',')[1],
    userId: req.user!.sub,
  };

  if (format === 'csv') {
    const { content, filename } = await exportToCsv(widgetCode, exportParams);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } else {
    const { buffer, filename } = await exportToExcel(widgetCode, exportParams);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}));

