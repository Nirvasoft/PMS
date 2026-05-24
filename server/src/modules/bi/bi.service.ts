import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

class BiService {
  // ═══════════════════════════════════════
  //  EXECUTIVE SUMMARY
  // ═══════════════════════════════════════

  async getExecutiveSummary(companyId: string, params: {
    propertyIds?: string[]; dateRange?: string;
  }) {
    const { propertyIds, dateRange = 'ytd' } = params;

    // Calculate date range
    const now = new Date();
    let fromDate: Date;
    switch (dateRange) {
      case 'mtd': fromDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'qtd': fromDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
      case 'ytd': default: fromDate = new Date(now.getFullYear(), 0, 1); break;
      case '12m': fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    }

    const propertyWhere: any = { companyId };
    if (propertyIds?.length) propertyWhere.id = { in: propertyIds };

    // ── Portfolio-level KPIs ──
    const properties = await prisma.property.findMany({
      where: propertyWhere,
      select: { id: true, name: true, propertyType: true },
    });
    const propIds = properties.map(p => p.id);

    const [totalUnits, occupiedUnits, invoicesAgg, paidAgg, openTickets, criticalTickets] = await Promise.all([
      prisma.unit.count({ where: { companyId, propertyId: { in: propIds } } }),
      prisma.unit.count({ where: { companyId, propertyId: { in: propIds }, status: 'occupied' } }),
      prisma.invoice.aggregate({
        where: { companyId, propertyId: { in: propIds }, invoiceDate: { gte: fromDate }, status: { not: 'cancelled' } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { companyId, propertyId: { in: propIds }, invoiceDate: { gte: fromDate }, status: 'paid' },
        _sum: { totalAmount: true },
      }),
      prisma.maintenanceTicket.count({
        where: { companyId, propertyId: { in: propIds }, status: { in: ['open', 'in_progress', 'assigned'] } },
      }),
      prisma.maintenanceTicket.count({
        where: { companyId, propertyId: { in: propIds }, status: { in: ['open', 'in_progress'] }, priority: 'critical' },
      }),
    ]);

    const totalRevenue = Number(invoicesAgg._sum.totalAmount || 0);
    const totalPaid = Number(paidAgg._sum.totalAmount || 0);
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    const collectionRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;

    // Previous period comparison for trends
    const prevFromDate = new Date(fromDate);
    const periodLength = now.getTime() - fromDate.getTime();
    prevFromDate.setTime(fromDate.getTime() - periodLength);

    const [prevOccupied, prevRevenue] = await Promise.all([
      prisma.unit.count({
        where: { companyId, propertyId: { in: propIds }, status: 'occupied' },
      }),
      prisma.invoice.aggregate({
        where: { companyId, propertyId: { in: propIds }, invoiceDate: { gte: prevFromDate, lt: fromDate }, status: { not: 'cancelled' } },
        _sum: { totalAmount: true },
      }),
    ]);

    const prevRevenueTotal = Number(prevRevenue._sum.totalAmount || 0);
    const revenueTrendPct = prevRevenueTotal > 0 ? ((totalRevenue - prevRevenueTotal) / prevRevenueTotal * 100) : 0;

    // ── Per-property breakdown ──
    const propertyStats = await Promise.all(properties.map(async (prop) => {
      const [units, occUnits, propRevenue, propPaid, propTickets] = await Promise.all([
        prisma.unit.count({ where: { propertyId: prop.id, companyId } }),
        prisma.unit.count({ where: { propertyId: prop.id, companyId, status: 'occupied' } }),
        prisma.invoice.aggregate({
          where: { propertyId: prop.id, companyId, invoiceDate: { gte: fromDate }, status: { not: 'cancelled' } },
          _sum: { totalAmount: true },
        }),
        prisma.invoice.aggregate({
          where: { propertyId: prop.id, companyId, invoiceDate: { gte: fromDate }, status: 'paid' },
          _sum: { totalAmount: true },
        }),
        prisma.maintenanceTicket.count({
          where: { propertyId: prop.id, companyId, status: { in: ['open', 'in_progress', 'assigned'] } },
        }),
      ]);

      const propRevenueTotal = Number(propRevenue._sum.totalAmount || 0);
      const propPaidTotal = Number(propPaid._sum.totalAmount || 0);

      return {
        propertyId: prop.id,
        name: prop.name,
        propertyType: prop.propertyType,
        totalUnits: units,
        occupancyRate: units > 0 ? Math.round((occUnits / units) * 1000) / 10 : 0,
        revenueYtd: propRevenueTotal,
        collectionRate: propRevenueTotal > 0 ? Math.round((propPaidTotal / propRevenueTotal) * 1000) / 10 : 0,
        openTickets: propTickets,
      };
    }));

    // ── Top alerts ──
    const alerts = await this.generateAlerts(companyId, propIds, fromDate);

    return {
      portfolio: {
        totalProperties: properties.length,
        totalUnits,
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        occupancyTrend: `${occupancyRate >= 0 ? '+' : ''}${occupancyRate.toFixed(1)}%`,
        totalRevenueYtd: totalRevenue,
        revenueTrend: `${revenueTrendPct >= 0 ? '+' : ''}${revenueTrendPct.toFixed(1)}% vs prev period`,
        collectionRate: Math.round(collectionRate * 10) / 10,
        openMaintenanceTickets: openTickets,
        criticalTickets,
      },
      properties: propertyStats,
      topAlerts: alerts,
      dateRange,
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateAlerts(companyId: string, propIds: string[], fromDate: Date) {
    const alerts: any[] = [];
    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 86400000);

    // Expiring leases
    const expiringLeases = await prisma.lease.count({
      where: { companyId, propertyId: { in: propIds }, status: 'active', endDate: { lte: sixtyDaysFromNow, gte: now } },
    });
    if (expiringLeases > 0) {
      alerts.push({ type: 'lease_expiring', count: expiringLeases, severity: 'warning', message: `${expiringLeases} leases expiring within 60 days` });
    }

    // Overdue invoices
    const overdueInvoices = await prisma.invoice.findMany({
      where: { companyId, propertyId: { in: propIds }, status: 'overdue', dueDate: { lt: now } },
      select: { totalAmount: true },
    });
    if (overdueInvoices.length > 0) {
      const overdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.totalAmount), 0);
      alerts.push({ type: 'overdue_invoices', count: overdueInvoices.length, severity: 'high', message: `$${overdueTotal.toLocaleString()} overdue across ${overdueInvoices.length} invoices` });
    }

    // Vacant units
    const vacantUnits = await prisma.unit.count({
      where: { companyId, propertyId: { in: propIds }, status: 'vacant' },
    });
    if (vacantUnits > 5) {
      alerts.push({ type: 'vacant_units', count: vacantUnits, severity: 'medium', message: `${vacantUnits} vacant units across portfolio` });
    }

    // Unresolved critical tickets
    const critTickets = await prisma.maintenanceTicket.count({
      where: { companyId, propertyId: { in: propIds }, priority: 'critical', status: { in: ['open', 'in_progress'] } },
    });
    if (critTickets > 0) {
      alerts.push({ type: 'critical_tickets', count: critTickets, severity: 'critical', message: `${critTickets} critical maintenance tickets unresolved` });
    }

    return alerts.sort((a, b) => {
      const sevOrder: Record<string, number> = { critical: 0, high: 1, warning: 2, medium: 3 };
      return (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9);
    });
  }

  // ═══════════════════════════════════════
  //  FORECASTING (Statistical — Node.js)
  // ═══════════════════════════════════════

  async getOccupancyForecast(companyId: string, params: {
    propertyId?: string; period?: string;
  }) {
    const { propertyId, period = '6m' } = params;
    const months = period === '12m' ? 12 : 6;

    // Check cache
    const cached = await prisma.biForecast.findFirst({
      where: { companyId, propertyId: propertyId || null, forecastType: 'occupancy', forecastPeriod: period, expiresAt: { gt: new Date() } },
    });
    if (cached) return cached;

    // Get historical monthly occupancy (last 24 months)
    const history = await this.getMonthlyOccupancy(companyId, propertyId, 24);
    if (history.length < 6) {
      return { error: 'Insufficient historical data (need at least 6 months)', data: [] };
    }

    const currentRate = history[history.length - 1]?.value || 0;
    const forecastData = this.linearForecast(history, months);

    // Cache the forecast
    const forecast = await prisma.biForecast.upsert({
      where: { uq_forecast: { companyId, propertyId: propertyId || null as any, forecastType: 'occupancy', forecastPeriod: period } },
      create: {
        companyId, propertyId, forecastType: 'occupancy', forecastPeriod: period,
        forecastData, expiresAt: new Date(Date.now() + 7 * 86400000), // 7-day cache
      },
      update: { forecastData, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });

    return { ...forecast, currentRate };
  }

  async getRevenueForecast(companyId: string, params: {
    propertyId?: string; period?: string;
  }) {
    const { propertyId, period = '6m' } = params;
    const months = period === '12m' ? 12 : 6;

    const cached = await prisma.biForecast.findFirst({
      where: { companyId, propertyId: propertyId || null, forecastType: 'revenue', forecastPeriod: period, expiresAt: { gt: new Date() } },
    });
    if (cached) return cached;

    const history = await this.getMonthlyRevenue(companyId, propertyId, 24);
    if (history.length < 6) {
      return { error: 'Insufficient historical data (need at least 6 months)', data: [] };
    }

    const forecastData = this.linearForecast(history, months);

    const forecast = await prisma.biForecast.upsert({
      where: { uq_forecast: { companyId, propertyId: propertyId || null as any, forecastType: 'revenue', forecastPeriod: period } },
      create: {
        companyId, propertyId, forecastType: 'revenue', forecastPeriod: period,
        forecastData, expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      update: { forecastData, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });

    return forecast;
  }

  private async getMonthlyOccupancy(companyId: string, propertyId: string | undefined, months: number) {
    const result: { date: string; value: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const where: any = { companyId };
      if (propertyId) where.propertyId = propertyId;

      const [total, occupied] = await Promise.all([
        prisma.unit.count({ where }),
        prisma.unit.count({ where: { ...where, status: 'occupied' } }),
      ]);

      result.push({
        date: d.toISOString().split('T')[0],
        value: total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0,
      });
    }
    return result;
  }

  private async getMonthlyRevenue(companyId: string, propertyId: string | undefined, months: number) {
    const result: { date: string; value: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const where: any = { companyId, invoiceDate: { gte: start, lte: end }, status: { not: 'cancelled' } };
      if (propertyId) where.propertyId = propertyId;

      const agg = await prisma.invoice.aggregate({ where, _sum: { totalAmount: true } });
      result.push({ date: start.toISOString().split('T')[0], value: Number(agg._sum.totalAmount || 0) });
    }
    return result;
  }

  /**
   * Simple linear regression forecast with confidence intervals.
   * Uses least-squares fit on the last N data points to project forward.
   */
  private linearForecast(history: { date: string; value: number }[], forwardMonths: number) {
    const n = history.length;
    const xs = history.map((_, i) => i);
    const ys = history.map(h => h.value);

    // Least squares: y = mx + b
    const sumX = xs.reduce((s, x) => s + x, 0);
    const sumY = ys.reduce((s, y) => s + y, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);

    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const b = (sumY - m * sumX) / n;

    // Calculate residual std dev for confidence intervals
    const residuals = ys.map((y, i) => y - (m * i + b));
    const residStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - 2 || 1));

    const lastDate = new Date(history[n - 1].date);
    const result: any[] = [];

    for (let i = 1; i <= forwardMonths; i++) {
      const futureDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
      const xVal = n - 1 + i;
      const predicted = m * xVal + b;
      const uncertainty = residStd * Math.sqrt(1 + 1 / n + Math.pow(xVal - sumX / n, 2) / (sumX2 - sumX * sumX / n || 1));

      result.push({
        date: futureDate.toISOString().split('T')[0],
        value: Math.round(predicted * 100) / 100,
        lowerBound: Math.round((predicted - 1.96 * uncertainty) * 100) / 100,
        upperBound: Math.round((predicted + 1.96 * uncertainty) * 100) / 100,
      });
    }
    return result;
  }

  // ═══════════════════════════════════════
  //  ANOMALY DETECTION (Z-score / IQR)
  // ═══════════════════════════════════════

  async detectAnomalies(companyId: string) {
    const anomalies: any[] = [];

    // 1. Billing spikes — invoices > 3 std devs from tenant average
    await this.detectBillingAnomalies(companyId, anomalies);

    // 2. Occupancy drops
    await this.detectOccupancyAnomalies(companyId, anomalies);

    // 3. Late payment patterns
    await this.detectLatePaymentAnomalies(companyId, anomalies);

    // Save anomalies to DB
    for (const a of anomalies) {
      // Check if similar anomaly already exists (same type + entity in last 7 days)
      const existing = await prisma.biAnomaly.findFirst({
        where: {
          companyId, anomalyType: a.anomalyType, entityType: a.entityType, entityId: a.entityId,
          detectedAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
      });
      if (!existing) {
        await prisma.biAnomaly.create({ data: { companyId, ...a } });
      }
    }

    logger.info(`BI anomaly detection: ${anomalies.length} new anomalies found for company ${companyId}`);
    return { detected: anomalies.length, anomalies };
  }

  private async detectBillingAnomalies(companyId: string, anomalies: any[]) {
    // Get monthly invoice totals per tenant for last 12 months
    const tenants = await prisma.tenant.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    for (const tenant of tenants) {
      const invoices = await prisma.invoice.findMany({
        where: { companyId, tenantId: tenant.id, invoiceDate: { gte: twelveMonthsAgo }, status: { not: 'cancelled' } },
        select: { totalAmount: true, invoiceDate: true, propertyId: true },
        orderBy: { invoiceDate: 'asc' },
      });

      if (invoices.length < 3) continue;

      const amounts = invoices.map(i => Number(i.totalAmount));
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const std = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length);

      if (std === 0) continue;

      // Check latest 3 months
      const recent = invoices.slice(-3);
      for (const inv of recent) {
        const amt = Number(inv.totalAmount);
        const zScore = Math.abs(amt - mean) / std;
        if (zScore > 3) {
          anomalies.push({
            anomalyType: 'billing_spike',
            propertyId: inv.propertyId,
            entityType: 'tenant',
            entityId: tenant.id,
            description: `${tenant.name}: Invoice of $${amt.toLocaleString()} is ${zScore.toFixed(1)}σ from average ($${mean.toFixed(0)})`,
            severity: zScore > 5 ? 'high' : 'medium',
            metricValue: amt,
            expectedValue: mean,
            deviationPct: ((amt - mean) / mean * 100),
          });
        }
      }
    }
  }

  private async detectOccupancyAnomalies(companyId: string, anomalies: any[]) {
    const properties = await prisma.property.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    for (const prop of properties) {
      const totalUnits = await prisma.unit.count({ where: { propertyId: prop.id, companyId } });
      const vacant = await prisma.unit.count({ where: { propertyId: prop.id, companyId, status: 'vacant' } });

      if (totalUnits === 0) continue;
      const vacancyRate = (vacant / totalUnits) * 100;

      if (vacancyRate > 20) {
        anomalies.push({
          anomalyType: 'occupancy_drop',
          propertyId: prop.id,
          entityType: 'property',
          entityId: prop.id,
          description: `${prop.name}: ${vacancyRate.toFixed(1)}% vacancy (${vacant}/${totalUnits} units)`,
          severity: vacancyRate > 40 ? 'high' : 'medium',
          metricValue: vacancyRate,
          expectedValue: 10, // benchmark
          deviationPct: vacancyRate - 10,
        });
      }
    }
  }

  private async detectLatePaymentAnomalies(companyId: string, anomalies: any[]) {
    // Find tenants with >50% late payments in last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tenants = await prisma.tenant.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    for (const tenant of tenants) {
      const [total, late] = await Promise.all([
        prisma.invoice.count({
          where: { companyId, tenantId: tenant.id, invoiceDate: { gte: sixMonthsAgo }, status: { not: 'cancelled' } },
        }),
        prisma.invoice.count({
          where: { companyId, tenantId: tenant.id, invoiceDate: { gte: sixMonthsAgo }, status: { in: ['overdue', 'partially_paid'] } },
        }),
      ]);

      if (total < 3) continue;
      const lateRate = (late / total) * 100;

      if (lateRate > 50) {
        anomalies.push({
          anomalyType: 'late_payment_risk',
          entityType: 'tenant',
          entityId: tenant.id,
          description: `${tenant.name}: ${lateRate.toFixed(0)}% late payment rate (${late}/${total} invoices in 6 months)`,
          severity: lateRate > 75 ? 'high' : 'medium',
          metricValue: lateRate,
          expectedValue: 10,
          deviationPct: lateRate - 10,
        });
      }
    }
  }

  async listAnomalies(companyId: string, params: {
    propertyId?: string; acknowledged?: string; page?: number; limit?: number;
  }) {
    const { propertyId, acknowledged, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (acknowledged === 'true') where.acknowledgedAt = { not: null };
    if (acknowledged === 'false') where.acknowledgedAt = null;

    const [data, total] = await Promise.all([
      prisma.biAnomaly.findMany({
        where,
        skip: (page - 1) * limit, take: limit,
        orderBy: { detectedAt: 'desc' },
        include: { property: { select: { name: true } } },
      }),
      prisma.biAnomaly.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async acknowledgeAnomaly(id: string, companyId: string, userId: string) {
    const anomaly = await prisma.biAnomaly.findFirst({ where: { id, companyId } });
    if (!anomaly) throw new Error('Anomaly not found');

    return prisma.biAnomaly.update({
      where: { id },
      data: { acknowledgedAt: new Date(), acknowledgedBy: userId },
    });
  }

  async markFalsePositive(id: string, companyId: string, userId: string) {
    const anomaly = await prisma.biAnomaly.findFirst({ where: { id, companyId } });
    if (!anomaly) throw new Error('Anomaly not found');

    return prisma.biAnomaly.update({
      where: { id },
      data: { isFalsePositive: true, acknowledgedAt: new Date(), acknowledgedBy: userId },
    });
  }

  // ═══════════════════════════════════════
  //  SAVED REPORTS
  // ═══════════════════════════════════════

  async listReports(companyId: string, params: { reportType?: string; page?: number; limit?: number }) {
    const { reportType, page = 1, limit = 20 } = params;
    const where: any = { companyId };
    if (reportType) where.reportType = reportType;

    const [data, total] = await Promise.all([
      prisma.biReport.findMany({
        where,
        skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
      }),
      prisma.biReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async createReport(companyId: string, userId: string, data: any) {
    return prisma.biReport.create({
      data: {
        companyId, createdBy: userId,
        name: data.name,
        description: data.description,
        reportType: data.reportType,
        config: data.config || {},
        isShared: data.isShared || false,
      },
    });
  }

  async runReport(id: string, companyId: string) {
    const report = await prisma.biReport.findFirst({ where: { id, companyId } });
    if (!report) throw new Error('Report not found');

    const config = report.config as any;
    let result: any = null;

    // Execute report based on type
    switch (report.reportType) {
      case 'occupancy':
        result = await this.runOccupancyReport(companyId, config);
        break;
      case 'revenue':
        result = await this.runRevenueReport(companyId, config);
        break;
      case 'maintenance':
        result = await this.runMaintenanceReport(companyId, config);
        break;
      case 'portfolio':
        result = await this.getExecutiveSummary(companyId, { dateRange: config.dateRange || 'ytd' });
        break;
      default:
        result = { message: 'Custom report type — configure manually' };
    }

    // Update last run timestamp
    await prisma.biReport.update({ where: { id }, data: { lastRunAt: new Date() } });

    return { report, result, runAt: new Date().toISOString() };
  }

  private async runOccupancyReport(companyId: string, config: any) {
    const properties = await prisma.property.findMany({
      where: { companyId, ...(config.propertyId ? { id: config.propertyId } : {}) },
      select: { id: true, name: true },
    });

    const result = await Promise.all(properties.map(async (prop) => {
      const [total, occupied, vacant, underReno] = await Promise.all([
        prisma.unit.count({ where: { propertyId: prop.id, companyId } }),
        prisma.unit.count({ where: { propertyId: prop.id, companyId, status: 'occupied' } }),
        prisma.unit.count({ where: { propertyId: prop.id, companyId, status: 'vacant' } }),
        prisma.unit.count({ where: { propertyId: prop.id, companyId, status: 'under_renovation' } }),
      ]);

      return {
        propertyId: prop.id,
        propertyName: prop.name,
        totalUnits: total,
        occupied,
        vacant,
        underRenovation: underReno,
        occupancyRate: total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0,
      };
    }));

    return { type: 'occupancy', data: result };
  }

  private async runRevenueReport(companyId: string, config: any) {
    const fromDate = config.fromDate ? new Date(config.fromDate) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = config.toDate ? new Date(config.toDate) : new Date();

    // Monthly revenue breakdown
    const months: any[] = [];
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

      const where: any = { companyId, invoiceDate: { gte: start, lte: end }, status: { not: 'cancelled' } };
      if (config.propertyId) where.propertyId = config.propertyId;

      const [invoiced, collected] = await Promise.all([
        prisma.invoice.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
        prisma.invoice.aggregate({ where: { ...where, status: 'paid' }, _sum: { totalAmount: true } }),
      ]);

      months.push({
        month: start.toISOString().split('T')[0],
        invoiced: Number(invoiced._sum.totalAmount || 0),
        collected: Number(collected._sum.totalAmount || 0),
        invoiceCount: invoiced._count,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { type: 'revenue', data: months };
  }

  private async runMaintenanceReport(companyId: string, config: any) {
    const where: any = { companyId };
    if (config.propertyId) where.propertyId = config.propertyId;

    const [byStatus, byPriority, avgResolution] = await Promise.all([
      prisma.maintenanceTicket.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      prisma.maintenanceTicket.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
      prisma.maintenanceTicket.findMany({
        where: { ...where, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 100,
        orderBy: { resolvedAt: 'desc' },
      }),
    ]);

    // Calculate avg resolution time
    const resolutionTimes = avgResolution
      .filter(t => t.resolvedAt)
      .map(t => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000); // hours

    const avgHours = resolutionTimes.length > 0
      ? resolutionTimes.reduce((s, h) => s + h, 0) / resolutionTimes.length
      : 0;

    return {
      type: 'maintenance',
      data: {
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
        byPriority: byPriority.map(p => ({ priority: p.priority, count: p._count })),
        avgResolutionHours: Math.round(avgHours * 10) / 10,
        totalResolved: resolutionTimes.length,
      },
    };
  }

  async deleteReport(id: string, companyId: string) {
    const report = await prisma.biReport.findFirst({ where: { id, companyId } });
    if (!report) throw new Error('Report not found');
    await prisma.biReport.delete({ where: { id } });
    return { deleted: true };
  }
}

export const biService = new BiService();
