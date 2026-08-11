import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { WIDGET_DEFINITIONS, DEFAULT_LAYOUT, getDefaultLayoutForRole } from './widgets/widgetDefinitions';
import type { WidgetDef } from './widgets/widgetDefinitions';
import { getRealWidgetData } from './widgets/realProvider';
import { redis } from '../../common/redis';

/** Cache TTL (seconds) per widget category */
const CACHE_TTL: Record<string, number> = {
  property: 300,     // 5 min — occupancy changes infrequently
  finance: 900,      // 15 min — invoices/revenue
  maintenance: 60,   // 1 min — tickets change often
  crm: 300,          // 5 min
  facility: 120,     // 2 min
  parking: 30,       // 30s — real-time occupancy
  security: 60,      // 1 min
  visitors: 30,      // 30s — real-time counts
  housekeeping: 120, // 2 min
  preventive: 300,   // 5 min
  inventory: 300,    // 5 min
  activity: 60,      // 1 min — recent events
};

/** Read company settings and return feature flag checker */
async function getFeatureChecker(companyId: string): Promise<(flag?: string) => boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { settings: true },
  });
  const settings = (company?.settings ?? {}) as Record<string, unknown>;
  return (flag?: string) => {
    if (!flag) return true; // no flag required → always show
    const val = settings[flag];
    return val === undefined || val === null ? true : Boolean(val);
  };
}

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
   * Filters out widgets whose requiredFeature is disabled for the company.
   */
  async getWidgetCatalog(companyId?: string) {
    const widgets = await prisma.widgetDefinition.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    });

    // Build feature checker
    const isEnabled = companyId ? await getFeatureChecker(companyId) : () => true;

    // Build a map of code → requiredFeature from definitions
    const featureMap = new Map<string, string | undefined>();
    for (const def of WIDGET_DEFINITIONS) {
      featureMap.set(def.code, def.requiredFeature);
    }

    // Group by category, filtering by feature flag
    const catalog: Record<string, unknown[]> = {};
    for (const w of widgets) {
      const flag = featureMap.get(w.code);
      if (!isEnabled(flag)) continue; // skip disabled modules

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

    // Check feature flag
    const featureMap = new Map<string, string | undefined>();
    for (const def of WIDGET_DEFINITIONS) featureMap.set(def.code, def.requiredFeature);
    const flag = featureMap.get(code);
    if (flag) {
      const isEnabled = await getFeatureChecker(companyId);
      if (!isEnabled(flag)) {
        return { type: widget.widgetType, label: widget.name, value: 0, unit: '', disabled: true };
      }
    }

    // Parse date range
    const [dateFrom, dateTo] = (query.dateRange || '').split(',');
    const propertyKey = query.propertyId || 'all';

    // ─── Redis cache ────────────────────────────
    const widgetDef = WIDGET_DEFINITIONS.find((w) => w.code === code);
    const ttl = CACHE_TTL[widgetDef?.category || ''] || 120;
    const cacheKey = `widget:${companyId}:${code}:${propertyKey}:${dateFrom || ''}:${dateTo || ''}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      // Cache miss or Redis error — fall through to compute
      logger.debug(`Widget cache miss for ${cacheKey}`);
    }

    // Compute fresh data
    const data = await getRealWidgetData(code, {
      companyId,
      propertyId: query.propertyId,
      dateFrom,
      dateTo,
      userId: query.userId,
    });

    // Store in cache (non-blocking)
    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
    } catch { /* ignore cache write errors */ }

    return data;
  }

  /**
   * Get user's dashboard layout.
   */
  async getLayout(userId: string, dashboardKey: string = 'main') {
    const layout = await prisma.dashboardLayout.findUnique({
      where: { uq_user_dashboard: { userId, dashboardKey } },
    });

    if (layout) {
      const items = Array.isArray(layout.layout) ? (layout.layout as any[]) : [];

      // 1. Deduplicate by widgetCode (keep first occurrence)
      const seen = new Set<string>();
      const deduped = items.filter((item: any) => {
        if (!item.widgetCode || seen.has(item.widgetCode)) return false;
        seen.add(item.widgetCode);
        return true;
      });

      // 2. Check if any items had h < 2 (legacy layout needing y-recalculation)
      const needsReflow = deduped.some((item: any) => (item.h || 1) < 2);

      let sanitized: any[];
      if (needsReflow) {
        // Recalculate grid positions: place items in rows based on 12-col grid.
        // Items keep their original x, w, but get new y values that don't overlap.
        sanitized = this.reflowLayout(deduped);
      } else {
        sanitized = deduped.map((item: any) => ({ ...item, h: Math.max(item.h || 2, 2) }));
      }

      return {
        dashboardKey: layout.dashboardKey,
        layout: sanitized,
        updatedAt: layout.updatedAt,
      };
    }

    // Return default layout for new users — based on their role
    const roleName = await this.getUserPrimaryRoleName(userId);
    return {
      dashboardKey,
      layout: getDefaultLayoutForRole(roleName),
      updatedAt: new Date(),
    };
  }

  /**
   * Reflow a layout: place items top-to-bottom respecting the 12-column grid.
   * Items keep their width but get new x/y positions in row order.
   */
  private reflowLayout(items: any[]): any[] {
    const COLS = 12;
    // Enforce minimum h=2 and sort by original y then x
    const sorted = items
      .map((item: any) => ({ ...item, h: Math.max(item.h || 2, 2), w: Math.min(item.w || 3, COLS) }))
      .sort((a: any, b: any) => (a.y - b.y) || (a.x - b.x));

    // Place items using a simple row-packing algorithm
    const result: any[] = [];
    // Track the bottom edge of each column
    const colBottoms = new Array(COLS).fill(0);

    for (const item of sorted) {
      const w = item.w;
      const h = item.h;

      // Find the first row where 'w' consecutive columns are free
      let bestY = Infinity;
      let bestX = 0;
      for (let x = 0; x <= COLS - w; x++) {
        // The earliest y we can place at column x..x+w-1
        let maxBottom = 0;
        for (let c = x; c < x + w; c++) {
          maxBottom = Math.max(maxBottom, colBottoms[c]);
        }
        if (maxBottom < bestY) {
          bestY = maxBottom;
          bestX = x;
        }
      }

      // Place the item
      result.push({ ...item, x: bestX, y: bestY });

      // Update column bottoms
      for (let c = bestX; c < bestX + w; c++) {
        colBottoms[c] = bestY + h;
      }
    }

    return result;
  }

  /**
   * Look up the user's primary role name (first role alphabetically).
   */
  private async getUserPrimaryRoleName(userId: string): Promise<string | undefined> {
    const userRole = await prisma.userRole.findFirst({
      where: { userId },
      include: { role: { select: { name: true } } },
      orderBy: { grantedAt: 'asc' }, // earliest assigned role = primary
    });
    return userRole?.role?.name;
  }

  /**
   * Save user's dashboard layout.
   */
  async saveLayout(userId: string, dashboardKey: string, layout: unknown[]) {
    // Validate layout
    if (!Array.isArray(layout)) {
      throw new AppError(400, 'INVALID_LAYOUT', 'Layout must be an array');
    }
    if (layout.length > 35) {
      throw new AppError(400, 'TOO_MANY_WIDGETS', 'Maximum 35 widgets per layout');
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

    // Enforce minimum h=2 for all items before saving
    const sanitized = (layout as any[]).map((item: any) => ({
      ...item,
      h: Math.max(item.h || 2, 2),
    }));

    await prisma.dashboardLayout.upsert({
      where: { uq_user_dashboard: { userId, dashboardKey } },
      create: { userId, dashboardKey, layout: sanitized as any },
      update: { layout: sanitized as any },
    });
  }

  /**
   * Reset layout to role-appropriate default.
   */
  async resetLayout(userId: string, dashboardKey: string = 'main') {
    const roleName = await this.getUserPrimaryRoleName(userId);
    const layout = getDefaultLayoutForRole(roleName);

    await prisma.dashboardLayout.upsert({
      where: { uq_user_dashboard: { userId, dashboardKey } },
      create: { userId, dashboardKey, layout: layout as any },
      update: { layout: layout as any },
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
