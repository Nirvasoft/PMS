import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { WIDGET_DEFINITIONS, DEFAULT_LAYOUT } from './widgets/widgetDefinitions';
import { getRealWidgetData } from './widgets/realProvider';

export class DashboardService {
  /**
   * Seed widget definitions — idempotent (skips existing).
   */
  async seedWidgetDefinitions() {
    let created = 0;
    for (const def of WIDGET_DEFINITIONS) {
      const existing = await prisma.widgetDefinition.findUnique({ where: { code: def.code } });
      if (!existing) {
        await prisma.widgetDefinition.create({
          data: {
            code: def.code,
            name: def.name,
            category: def.category,
            widgetType: def.widgetType,
            dataProvider: def.dataProvider,
            defaultWidth: def.defaultWidth,
            defaultHeight: def.defaultHeight,
            requiredPermissions: def.requiredPermissions,
          },
        });
        created++;
      }
    }
    if (created > 0) logger.info(`Seeded ${created} widget definitions`);
  }

  /**
   * Get widget catalog grouped by category.
   * Filters by user's permissions (Phase 1: return all since permissions not enforced yet).
   */
  async getWidgetCatalog() {
    const widgets = await prisma.widgetDefinition.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    });

    // Group by category
    const catalog: Record<string, unknown[]> = {};
    for (const w of widgets) {
      if (!catalog[w.category]) catalog[w.category] = [];
      catalog[w.category].push({
        code: w.code,
        name: w.name,
        description: w.description,
        widgetType: w.widgetType,
        defaultWidth: w.defaultWidth,
        defaultHeight: w.defaultHeight,
        minWidth: w.minWidth,
        minHeight: w.minHeight,
      });
    }

    return catalog;
  }

  /**
   * Get widget data (delegated to providers — Phase 1 uses stubs).
   */
  async getWidgetData(code: string, companyId: string, query: {
    propertyId?: string;
    dateRange?: string;
    userId?: string;
  }) {
    // Verify widget exists
    const widget = await prisma.widgetDefinition.findUnique({ where: { code } });
    if (!widget || !widget.isActive) {
      throw new AppError(404, 'WIDGET_NOT_FOUND', `Widget "${code}" not found`);
    }

    // Parse date range
    const [dateFrom, dateTo] = (query.dateRange || '').split(',');

    // Use real data provider
    return getRealWidgetData(code, {
      companyId,
      propertyId: query.propertyId,
      dateFrom,
      dateTo,
      userId: query.userId,
    });
  }

  /**
   * Get user's dashboard layout.
   */
  async getLayout(userId: string, dashboardKey: string = 'main') {
    const layout = await prisma.dashboardLayout.findUnique({
      where: { uq_user_dashboard: { userId, dashboardKey } },
    });

    if (layout) {
      return {
        dashboardKey: layout.dashboardKey,
        layout: layout.layout,
        updatedAt: layout.updatedAt,
      };
    }

    // Return default layout for new users
    return {
      dashboardKey,
      layout: DEFAULT_LAYOUT,
      updatedAt: new Date(),
    };
  }

  /**
   * Save user's dashboard layout.
   */
  async saveLayout(userId: string, dashboardKey: string, layout: unknown[]) {
    // Validate layout
    if (!Array.isArray(layout)) {
      throw new AppError(400, 'INVALID_LAYOUT', 'Layout must be an array');
    }
    if (layout.length > 20) {
      throw new AppError(400, 'TOO_MANY_WIDGETS', 'Maximum 20 widgets per layout');
    }

    // Validate each widget
    for (const item of layout as Array<{ widgetCode?: string; x?: number; y?: number; w?: number; h?: number }>) {
      if (!item.widgetCode || typeof item.x !== 'number' || typeof item.y !== 'number') {
        throw new AppError(400, 'INVALID_LAYOUT_ITEM', 'Each widget must have widgetCode, x, y, w, h');
      }
      if ((item.x ?? 0) + (item.w ?? 1) > 12) {
        throw new AppError(400, 'LAYOUT_OVERFLOW', 'Widget exceeds 12-column grid');
      }
    }

    await prisma.dashboardLayout.upsert({
      where: { uq_user_dashboard: { userId, dashboardKey } },
      create: { userId, dashboardKey, layout: layout as any },
      update: { layout: layout as any },
    });
  }

  /**
   * Reset layout to default.
   */
  async resetLayout(userId: string, dashboardKey: string = 'main') {
    await prisma.dashboardLayout.upsert({
      where: { uq_user_dashboard: { userId, dashboardKey } },
      create: { userId, dashboardKey, layout: DEFAULT_LAYOUT as any },
      update: { layout: DEFAULT_LAYOUT as any },
    });
  }

  // ─── Saved Reports ──────────────────────────

  /**
   * List saved reports.
   */
  async listReports(companyId: string, query: { reportType?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const where: Record<string, unknown> = { companyId };
    if (query.reportType) where.reportType = query.reportType;

    const [data, total] = await Promise.all([
      prisma.savedReport.findMany({
        where,
        include: {
          creator: {
            select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.savedReport.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Create/save a report configuration.
   */
  async createReport(companyId: string, userId: string, dto: {
    name: string;
    reportType: string;
    parameters?: Record<string, unknown>;
  }) {
    return prisma.savedReport.create({
      data: {
        companyId,
        createdBy: userId,
        name: dto.name,
        reportType: dto.reportType,
        parameters: (dto.parameters || {}) as any,
      },
    });
  }

  /**
   * Delete a saved report.
   */
  async deleteReport(id: string, companyId: string) {
    const report = await prisma.savedReport.findFirst({ where: { id, companyId } });
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
    await prisma.savedReport.delete({ where: { id } });
  }
}

export const dashboardService = new DashboardService();
