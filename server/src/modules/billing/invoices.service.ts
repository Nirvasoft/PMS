import { prisma } from '../../common/database';
import { sequenceService } from '../../common/sequence.service';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { cacheGetOrSet, invalidateCacheByPrefix } from '../../common/redis';
import { billingNotifications } from './billingNotifications.service';
import { workflowEngine } from '../workflow/services/engine.service';
import { glService } from '../gl/gl.service';
import { webhookInvoiceIssued } from '../../common/webhookHooks';
import { calcLeaseTermMonths, getBillingCycleMonths } from '../leases/services/helpers';
import { isAccountingIntegrationActive } from '../integrations/v6Status.helper';
import {
  resolveChargeCategoryMap,
  isCategoryMonthly,
  getCategoryDisplayName,
  findLeaseRentChargeType,
  findLeaseDepositChargeType,
} from './chargeCategory.helper';

/** Adds computed `outstandingAmount` to an invoice object */
function withOutstanding<T extends { totalAmount: any; paidAmount: any }>(inv: T): T & { outstandingAmount: number } {
  return { ...inv, outstandingAmount: Number(inv.totalAmount) - Number(inv.paidAmount) };
}

export class InvoicesService {
  // ── Cache Invalidation ──────────────────────

  async invalidateCompanyCache(companyId: string) {
    await invalidateCacheByPrefix(`invoices:${companyId}:`);
  }

  // ── Query ───────────────────────────────────

  async getReportFilterOptions(companyId: string, propertyId?: string) {
    const cacheKey = `invoices:${companyId}:report-filters:v2:${propertyId || 'all'}`;
    return cacheGetOrSet(cacheKey, 300, async () => {
      const [unitRows, tenantRows] = await Promise.all([
        prisma.unit.findMany({
          where: {
            companyId,
            deletedAt: null,
            ...(propertyId ? { propertyId } : {}),
          },
          select: {
            id: true,
            unitNumber: true,
            floorNumber: true,
            floorLabel: true,
            unitType: true,
            areaSqft: true,
            status: true,
            rate: true,
            currency: true,
            property: { select: { id: true, name: true } },
            shopProfile: { select: { brandName: true } },
          },
        }),
        prisma.tenant.findMany({
          where: {
            companyId,
            deletedAt: null,
          },
          select: { id: true, firstName: true, lastName: true, companyName: true },
        }),
      ]);

      const formatFloor = (u: { floorNumber: number | null; floorLabel: string | null }) => {
        if (u.floorLabel && String(u.floorLabel).trim()) return String(u.floorLabel).trim();
        if (u.floorNumber != null) return `Floor ${u.floorNumber}`;
        return '';
      };

      const floorSet = new Set<string>();
      const units: Array<{
        id: string;
        unitNumber: string;
        floor: string;
        unitType?: string | null;
        areaSqft?: number | null;
        status?: string | null;
        baseRent?: number | null;
        currency?: string | null;
        propertyName?: string | null;
        shopName?: string | null;
      }> = [];
      for (const u of unitRows) {
        const fl = formatFloor(u);
        if (fl) floorSet.add(fl);
        if (u.unitNumber) {
          units.push({
            id: u.id,
            unitNumber: u.unitNumber,
            floor: fl,
            unitType: u.unitType,
            areaSqft: u.areaSqft != null ? Number(u.areaSqft) : null,
            status: u.status,
            baseRent: u.rate != null ? Number(u.rate) : null,
            currency: u.currency,
            propertyName: u.property?.name || null,
            shopName: u.shopProfile?.brandName || null,
          });
        }
      }

      const tenantItems: Array<{ id: string; firstName: string; lastName: string }> = [];
      for (const t of tenantRows) {
        const fn = (t.firstName || '').trim();
        const ln = (t.lastName || t.companyName || '').trim();
        if (fn || ln) {
          tenantItems.push({ id: t.id, firstName: fn, lastName: ln });
        }
      }
      tenantItems.sort((a, b) =>
        (a.firstName || a.lastName).localeCompare(b.firstName || b.lastName, undefined, { numeric: true }),
      );

      const statuses = ['draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'disputed'];

      return {
        floors: Array.from(floorSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        units: units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })),
        tenantItems,
        statuses,
      };
    });
  }

  async findAll(companyId: string, filters: {
    tenantId?: string; leaseId?: string; propertyId?: string; status?: string;
    currency?: string; billType?: string;
    startInvoice?: string; endInvoice?: string;
    search?: string; from?: string; to?: string; floor?: string; unitNumber?: string;
    includeLines?: boolean; includeTotals?: boolean;
    sortBy?: string; sortOrder?: 'asc' | 'desc';
    page?: number; limit?: number; all?: boolean;
  }) {
    const cacheKey = `invoices:${companyId}:list:${JSON.stringify(filters)}`;
    return cacheGetOrSet(cacheKey, 60, async () => {
    const {
      tenantId, leaseId, propertyId, status, currency, billType,
      startInvoice, endInvoice, search, from, to,
      floor, unitNumber, includeLines = true, includeTotals = false,
      sortBy, sortOrder = 'asc',
      page = 1, limit = 20, all = false,
    } = filters;
    const where: any = { companyId };
    if (tenantId) where.tenantId = tenantId;
    if (leaseId) where.leaseId = leaseId;
    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (startInvoice || endInvoice) {
      where.invoiceNumber = {};
      if (startInvoice) where.invoiceNumber.gte = startInvoice.trim();
      if (endInvoice) where.invoiceNumber.lte = endInvoice.trim();
    }

    if (billType === 'rental') {
      const rentChargeTypes = await prisma.chargeType.findMany({
        where: {
          OR: [
            { category: { equals: 'rent', mode: 'insensitive' } },
            { code: { in: ['RENT', 'rent'] } },
          ],
          AND: [{ OR: [{ companyId: null }, { companyId }] }],
        },
        select: { id: true },
      });
      const rentChargeTypeIds = rentChargeTypes.map((ct) => ct.id);
      where.lines = { some: { chargeTypeId: { in: rentChargeTypeIds } } };
    } else if (billType === 'monthly') {
      const monthlyCategories = await prisma.chargeCategory.findMany({
        where: {
          isActive: true,
          monthly: true,
          OR: [{ companyId: null }, { companyId }],
        },
        select: { code: true },
      });
      const monthlyCategoryCodes = monthlyCategories.map((c) => c.code);
      let monthlyChargeTypeIds: string[] = [];
      if (monthlyCategoryCodes.length > 0) {
        const monthlyChargeTypes = await prisma.chargeType.findMany({
          where: {
            OR: monthlyCategoryCodes.map((code) => ({
              category: { equals: code, mode: 'insensitive' as const },
            })),
            AND: [{ OR: [{ companyId: null }, { companyId }] }],
          },
          select: { id: true },
        });
        monthlyChargeTypeIds = monthlyChargeTypes.map((ct) => ct.id);
      }
      where.lines = { some: { chargeTypeId: { in: monthlyChargeTypeIds } } };
    }

    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to) {
        const toStr = to.trim();
        where.invoiceDate.lte = toStr.length === 10 ? new Date(`${toStr}T23:59:59.999Z`) : new Date(toStr);
      }
    }

    if (floor || unitNumber) {
      const unitWhere: any = {};
      if (unitNumber) unitWhere.unitNumber = unitNumber;
      if (floor) {
        const floorMatch = /^Floor\s+(-?\d+)$/i.exec(floor.trim());
        if (floorMatch) {
          const flNum = parseInt(floorMatch[1], 10);
          unitWhere.OR = [
            { floorLabel: floor.trim() },
            { floorNumber: flNum },
          ];
        } else {
          unitWhere.floorLabel = floor.trim();
        }
      }
      where.unit = unitWhere;
    }

    // Matches the invoice number, or an individual tenant's first/last name, or a company
    // tenant's name — searched server-side so it covers every matching invoice, not just
    // whichever page is loaded.
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { secondRef: { contains: q, mode: 'insensitive' } },
        { tenant: { firstName: { contains: q, mode: 'insensitive' } } },
        { tenant: { lastName: { contains: q, mode: 'insensitive' } } },
        { tenant: { companyName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    let orderByClause: any = { createdAt: 'desc' };
    if (sortBy) {
      const dir: 'asc' | 'desc' = sortOrder === 'desc' ? 'desc' : 'asc';
      switch (sortBy) {
        case 'issueDate':
          orderByClause = [{ invoiceDate: dir }, { invoiceNumber: dir }];
          break;
        case 'dueDate':
          orderByClause = [{ dueDate: dir }, { invoiceNumber: dir }];
          break;
        case 'floor':
          orderByClause = [{ unit: { floorNumber: dir } }, { unit: { floorLabel: dir } }, { invoiceNumber: dir }];
          break;
        case 'unit':
          orderByClause = [{ unit: { unitNumber: dir } }, { invoiceNumber: dir }];
          break;
        case 'tenant':
          orderByClause = [{ tenant: { companyName: dir } }, { tenant: { firstName: dir } }, { tenant: { lastName: dir } }];
          break;
        case 'totalAmount':
          orderByClause = [{ totalAmount: dir }, { invoiceNumber: dir }];
          break;
        case 'invoiceNumber':
        default:
          orderByClause = { invoiceNumber: dir };
          break;
      }
    }

    // Avoid PostgreSQL's 32,767 bind-parameter limit on `WHERE invoice_id IN (...)` when fetching large sets
    const includeLinesDirectly = includeLines && !all && limit <= 2000;

    const countCacheKey = `invoices:${companyId}:count:${JSON.stringify(where)}`;

    const [data, total, currencyGroupTotals] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          ...(includeLinesDirectly
            ? {
                lines: {
                  include: { chargeType: { select: { id: true, code: true, name: true, category: true } } },
                  orderBy: { sortOrder: 'asc' as const },
                },
                departmentCenter: { select: { id: true, code: true, name: true } },
                costCenter: { select: { id: true, code: true, name: true } },
                _count: { select: { lines: true } },
              }
            : {}),
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true, currency: true } },
          unit: { select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true } },
          property: { select: { id: true, name: true, coverImageUrl: true, imageUrl: true } },
        },
        orderBy: orderByClause,
        ...(all ? {} : { skip: (page - 1) * limit, take: limit }),
      }),
      cacheGetOrSet(countCacheKey, 120, () => prisma.invoice.count({ where })),
      includeTotals
        ? prisma.invoice.groupBy({
            by: ['currency'],
            where,
            _sum: {
              subtotal: true,
              taxAmount: true,
              totalAmount: true,
              paidAmount: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!includeLinesDirectly && includeLines && data.length > 0) {
      const CHUNK_SIZE = 5000;
      const linesByInvoiceId = new Map<string, any[]>();
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunkIds = data.slice(i, i + CHUNK_SIZE).map((inv) => inv.id);
        const chunkLines = await prisma.invoiceLine.findMany({
          where: { invoiceId: { in: chunkIds } },
          include: { chargeType: { select: { id: true, code: true, name: true, category: true } } },
          orderBy: { sortOrder: 'asc' },
        });
        for (const line of chunkLines) {
          const arr = linesByInvoiceId.get(line.invoiceId) || [];
          arr.push(line);
          linesByInvoiceId.set(line.invoiceId, arr);
        }
      }
      for (const inv of data as any[]) {
        inv.lines = linesByInvoiceId.get(inv.id) || [];
      }
    }

    let totalsByCurrency: Record<string, { subtotal: number; tax: number; total: number; paid: number; outstanding: number }> | undefined;
    if (currencyGroupTotals) {
      totalsByCurrency = {};
      for (const row of currencyGroupTotals) {
        const cur = row.currency || 'USD';
        const subtotal = Number(row._sum.subtotal || 0);
        const tax = Number(row._sum.taxAmount || 0);
        const totalAmt = Number(row._sum.totalAmount || 0);
        const paid = Number(row._sum.paidAmount || 0);
        totalsByCurrency[cur] = {
          subtotal,
          tax,
          total: totalAmt,
          paid,
          outstanding: Math.max(0, totalAmt - paid),
        };
      }
    }

    const effectiveLimit = all ? (total || 1) : limit;
    return {
      data: data.map(withOutstanding),
      meta: {
        total,
        page: all ? 1 : page,
        limit: effectiveLimit,
        totalPages: all ? 1 : Math.ceil(total / limit),
        ...(totalsByCurrency ? { totalsByCurrency } : {}),
      },
    };
    });
  }

  async findById(id: string, companyId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        lines: {
          include: {
            chargeType: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
                glAccountCode: true,
                departmentCenterId: true,
                costCenterId: true,
                departmentCenter: { select: { id: true, code: true, name: true } },
                costCenter: { select: { id: true, code: true, name: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        tenant: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            companyName: true,
            tenantType: true,
            email: true,
            currency: true,
            glAccountCode: true,
          },
        },
        unit: { select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true } },
        property: { select: { id: true, name: true, coverImageUrl: true, imageUrl: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        creditNotes: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
        receiptAllocations: {
          include: {
            receipt: {
              select: {
                id: true, receiptNumber: true, receiptDate: true,
                paymentMethod: true, paymentReference: true,
                amount: true, currency: true, status: true,
              },
            },
          },
          orderBy: { allocatedAt: 'desc' },
        },
      },
    });
    if (!invoice) throw AppError.notFound('Invoice');
    return withOutstanding(invoice);
  }

  // ── Dashboard Summary ───────────────────────

  async getDashboardSummary(companyId: string, propertyId?: string) {
    const cacheKey = `invoices:${companyId}:dashboard-summary:${propertyId || 'all'}`;
    return cacheGetOrSet(cacheKey, 120, async () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);

    const baseWhere: any = { companyId };
    if (propertyId) baseWhere.propertyId = propertyId;

    // 1. Issued Today: Invoices generated or dated today
    const issuedTodayPromise = prisma.invoice.count({
      where: {
        ...baseWhere,
        invoiceType: 'invoice',
        status: { not: 'void' },
        OR: [
          { invoiceDate: { gte: startOfDay, lte: endOfDay } },
          { createdAt: { gte: startOfDay, lte: endOfDay } },
        ],
      },
    });

    // 2. Overdue: Invoices past due date that haven't been fully paid
    const overdueWhere: any = {
      ...baseWhere,
      invoiceType: 'invoice',
      status: { in: ['overdue', 'issued', 'sent', 'partially_paid'] },
      OR: [
        { status: 'overdue' },
        { dueDate: { lt: startOfDay } },
      ],
    };
    const overduePromise = prisma.invoice.aggregate({
      where: overdueWhere,
      _count: true,
      _sum: { totalAmount: true, paidAmount: true },
    });

    // 3. Due This Week: Upcoming invoices due in next 7 days
    const dueThisWeekPromise = prisma.invoice.count({
      where: {
        ...baseWhere,
        invoiceType: 'invoice',
        status: { in: ['issued', 'sent', 'partially_paid'] },
        dueDate: { gte: startOfDay, lte: endOfWeek },
      },
    });

    // 4. MTD Revenue: Cash collected via receipts or paid invoices this month
    const receiptWhere: any = {
      companyId,
      receiptDate: { gte: startOfMonth, lte: endOfDay },
      status: { in: ['confirmed', 'posted'] },
    };
    if (propertyId) receiptWhere.propertyId = propertyId;

    const receiptPromise = prisma.receipt.aggregate({
      where: receiptWhere,
      _sum: { amount: true },
    });

    const invoicePaidPromise = prisma.invoice.aggregate({
      where: {
        ...baseWhere,
        status: { in: ['paid', 'partially_paid'] },
        OR: [
          { invoiceDate: { gte: startOfMonth, lte: endOfDay } },
          { updatedAt: { gte: startOfMonth, lte: endOfDay } },
        ],
      },
      _sum: { paidAmount: true },
    });

    // 5. Currency resolution
    const currencyPromise = propertyId
      ? prisma.property.findFirst({
          where: { id: propertyId, companyId },
          select: { currency: true },
        })
      : prisma.company.findFirst({
          where: { id: companyId },
          select: { currency: true },
        });

    const [issuedToday, overdueAgg, dueThisWeek, receiptAgg, invoicePaidAgg, entityWithCurrency] = await Promise.all([
      issuedTodayPromise,
      overduePromise,
      dueThisWeekPromise,
      receiptPromise,
      invoicePaidPromise,
      currencyPromise,
    ]);

    const totalOverdue = Math.max(0, Number(overdueAgg._sum.totalAmount || 0) - Number(overdueAgg._sum.paidAmount || 0));
    const receiptCollected = Number(receiptAgg._sum.amount || 0);
    const invoicePaidCollected = Number(invoicePaidAgg._sum.paidAmount || 0);
    const mtdRevenue = Math.max(receiptCollected, invoicePaidCollected);

    return {
      issuedToday,
      overdueCount: overdueAgg._count || 0,
      totalOverdue,
      dueThisWeek,
      mtdRevenue,
      currency: entityWithCurrency?.currency || 'USD',
    };
    });
  }

  // ── Invoice Number ──────────────────────────

  async generateInvoiceNumber(companyId: string, propertyId?: string | null): Promise<string> {
    return sequenceService.next(companyId, 'invoice', { propertyId });
  }

  async generateTempInvoiceNumber(companyId: string, propertyId?: string | null): Promise<string> {
    return sequenceService.next(companyId, 'tmp_invoice', { propertyId, prefix: 'TMPINV' });
  }

  // ── Manual Invoice Creation ─────────────────

  async createManual(companyId: string, dto: Record<string, unknown>, userId: string) {
    const invoiceNumber = await this.generateInvoiceNumber(companyId, dto.propertyId as string | undefined);
    const lines = dto.lines as Array<{
      chargeTypeId: string; description: string; quantity?: number; unitPrice: number; taxRate?: number; discountPct?: number;
    }>;

    let subtotal = 0;
    let totalTax = 0;
    const lineData = lines.map((line, idx) => {
      const qty = line.quantity || 1;
      const discountMultiplier = 1 - ((line.discountPct || 0) / 100);
      const amount = Math.round(qty * line.unitPrice * discountMultiplier * 100) / 100;
      const taxRate = line.taxRate || 0;
      const taxAmount = Math.round(amount * taxRate * 100) / 100;
      const lineTotal = amount + taxAmount;
      subtotal += amount;
      totalTax += taxAmount;

      return {
        chargeTypeId: line.chargeTypeId,
        description: line.description,
        quantity: qty,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct || 0,
        amount,
        taxRate,
        taxAmount,
        lineTotal,
        sortOrder: idx,
      };
    });

    const totalAmount = subtotal + totalTax;

    const propertyId = dto.propertyId as string;
    const currency = (dto.currency as string) || 'USD';

    if (await isAccountingIntegrationActive(companyId, propertyId)) {
      if (
        !((dto.departmentCenterId as string) || '').trim() ||
        !((dto.costCenterId as string) || '').trim()
      ) {
        throw AppError.validation('Department and Cost Center are required');
      }
      const lineChargeIds = Array.from(
        new Set(lines.map((l) => l.chargeTypeId).filter((id): id is string => Boolean(id))),
      );
      if (lineChargeIds.length > 0) {
        const cts = await prisma.chargeType.findMany({
          where: { id: { in: lineChargeIds }, companyId },
          select: { id: true, name: true, glAccountCode: true },
        });
        const ctMap = new Map(cts.map((ct) => [ct.id, ct]));
        for (const l of lines) {
          const ct = ctMap.get(l.chargeTypeId);
          if (!ct?.glAccountCode?.trim()) {
            throw AppError.validation(
              `Charge "${ct?.name || 'selected'}" must have GL Account Code configured`,
            );
          }
        }
      }
    }

    let currencyRate: number | null = dto.currencyRate != null ? Number(dto.currencyRate) : null;
    if (currencyRate == null && propertyId && currency) {
      const rateRow = await prisma.currencyRate.findFirst({
        where: { companyId, propertyId, currency, isActive: true },
        orderBy: { effectiveDate: 'desc' },
      });
      if (rateRow) {
        currencyRate = Number(rateRow.rate);
      } else {
        const baseRow = await prisma.currencyRate.findFirst({
          where: { companyId, propertyId, isBaseCurrency: true, isActive: true },
        });
        if (baseRow && baseRow.currency === currency) {
          currencyRate = 1;
        }
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        propertyId,
        unitId: (dto.unitId as string) || null,
        tenantId: dto.tenantId as string,
        leaseId: (dto.leaseId as string) || null,
        departmentCenterId: (dto.departmentCenterId as string) || null,
        costCenterId: (dto.costCenterId as string) || null,
        invoiceNumber,
        invoiceType: 'invoice',
        status: 'issued',
        invoiceDate: new Date(dto.invoiceDate as string),
        dueDate: new Date(dto.dueDate as string),
        periodFrom: dto.periodFrom ? new Date(dto.periodFrom as string) : null,
        periodTo: dto.periodTo ? new Date(dto.periodTo as string) : null,
        subtotal,
        taxAmount: totalTax,
        totalAmount,
        paidAmount: 0,
        currency,
        currencyRate,
        secondRef: (dto.secondRef as string)?.trim() || null,
        notes: (dto.notes as string) || null,
        createdBy: userId,
        lines: { create: lineData },
      },
      include: {
        lines: {
          include: {
            chargeType: {
              select: {
                code: true,
                name: true,
                glAccountCode: true,
                departmentCenterId: true,
                costCenterId: true,
              },
            },
          },
        },
        tenant: { select: { id: true, firstName: true, lastName: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });

    const invDeptId =
      invoice.departmentCenterId ||
      invoice.lines.find((l) => l.chargeType?.departmentCenterId)?.chargeType?.departmentCenterId ||
      null;
    const invCcId =
      invoice.costCenterId ||
      invoice.lines.find((l) => l.chargeType?.costCenterId)?.chargeType?.costCenterId ||
      null;

    // GL auto-posting: Dr Accounts Receivable (linked to Invoice Dept/CC) / Cr per ChargeType GL Account / Cr Tax Payable
    if (await isAccountingIntegrationActive(companyId, invoice.propertyId)) {
      const glLines: Array<{
        accountCode: string;
        debit: number;
        credit: number;
        description?: string;
        departmentCenterId?: string | null;
        costCenterId?: string | null;
      }> = [
        {
          accountCode: '1-2210',
          debit: Number(invoice.totalAmount),
          credit: 0,
          description: `AR — ${invoiceNumber}`,
          departmentCenterId: invDeptId,
          costCenterId: invCcId,
        },
      ];
      // Credit each charge line using its linked ChargeType GL account (fallback to 4100)
      const activeLines = invoice.lines.filter((l) => Number(l.amount) > 0);
      if (activeLines.length > 0) {
        for (const invLine of activeLines) {
          const creditAccountCode = invLine.chargeType?.glAccountCode?.trim() || '4100';
          const lineDesc = invLine.description || invLine.chargeType?.name || 'Revenue';
          glLines.push({
            accountCode: creditAccountCode,
            debit: 0,
            credit: Number(invLine.amount),
            description: `${lineDesc} — ${invoiceNumber}`,
            departmentCenterId: invLine.chargeType?.departmentCenterId || invDeptId,
            costCenterId: invLine.chargeType?.costCenterId || invCcId,
          });
        }
      } else if (subtotal > 0) {
        glLines.push({
          accountCode: '4100',
          debit: 0,
          credit: subtotal,
          description: `Revenue — ${invoiceNumber}`,
          departmentCenterId: invDeptId,
          costCenterId: invCcId,
        });
      }
      // Credit tax payable if tax exists
      if (totalTax > 0) {
        glLines.push({
          accountCode: '2200',
          debit: 0,
          credit: totalTax,
          description: `Tax Payable — ${invoiceNumber}`,
          departmentCenterId: invDeptId,
          costCenterId: invCcId,
        });
      }
      await glService.postAutoJournal({
        companyId,
        entryDate: dto.invoiceDate as string,
        entryType: 'ar_invoice',
        description: `AR Invoice ${invoiceNumber}`,
        referenceType: 'invoice',
        referenceId: invoice.id,
        propertyId: dto.propertyId as string,
        departmentCenterId: invDeptId,
        costCenterId: invCcId,
        lines: glLines,
      });
    }

    // Send notification
    const tenantName = invoice.tenant
      ? `${invoice.tenant.firstName || ''} ${invoice.tenant.lastName || ''}`.trim()
      : '';
    billingNotifications.invoiceIssued({
      ...invoice, totalAmount: invoice.totalAmount, currency: (dto.currency as string) || 'USD',
      companyId, tenantId: dto.tenantId as string,
    }, tenantName);

    webhookInvoiceIssued(invoice);
    await this.invalidateCompanyCache(companyId);
    return invoice;
  }

  // ── Direct Invoices from Lease Activation ──

  /**
   * Auto-creates direct invoices on lease activation for all non-monthly
   * (ChargeCategory.monthly === false) charges, grouped into one invoice per Charge Category:
   *  - Base Rent (affected by paymentType 'fully' vs 'partially' only)
   *  - Security Deposit (always 100%, separate invoice from Rent)
   *  - Additional non-monthly leaseCharges (qty = 1 x amount, grouped by their category)
   *  - Monthly charges (ChargeCategory.monthly === true) are NEVER direct-invoiced here;
   *    they are handled via active Billing Schedules.
   */
  async createFromLease(lease: any, userId: string): Promise<any[]> {
    const created: any[] = [];
    const invoiceDate  = new Date();
    const startDate    = new Date(lease.startDate);
    const dueDate      = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + (lease.paymentDueDays || 7));
    const periodTo     = lease.endDate ? new Date(lease.endDate) : null;
    const currency     = lease.currency || 'USD';

    let currencyRate: number | null = lease.currencyRate ? Number(lease.currencyRate) : null;
    if ((currencyRate == null || currencyRate <= 1) && lease.companyId && currency) {
      const rateRow =
        (lease.propertyId
          ? await prisma.currencyRate.findFirst({
              where: { companyId: lease.companyId, propertyId: lease.propertyId, currency, isActive: true },
              orderBy: { effectiveDate: 'desc' },
            })
          : null) ||
        (await prisma.currencyRate.findFirst({
          where: { companyId: lease.companyId, currency, isActive: true },
          orderBy: { effectiveDate: 'desc' },
        }));
      if (rateRow) {
        currencyRate = Number(rateRow.rate);
      }
    }

    const unitLabel = lease.unit?.unitNumber || '';
    const categoryMap = await resolveChargeCategoryMap(lease.companyId, lease.propertyId);

    const rentChargeType = await findLeaseRentChargeType(lease.companyId, lease.propertyId);
    const deposit = Number(lease.securityDeposit ?? 0);
    const depositChargeType = deposit > 0
      ? await findLeaseDepositChargeType(lease.companyId, lease.propertyId)
      : null;

    const termMonths = lease.leaseTermMonths || (
      lease.startDate && lease.endDate
        ? calcLeaseTermMonths(lease.startDate, lease.endDate)
        : 1
    ) || 1;
    const monthlyRent = Number(lease.rentAmount ?? 0);
    const totalRent = Math.round(monthlyRent * termMonths * 100) / 100;
    const partialAmount = lease.partialAmount != null ? Number(lease.partialAmount) : null;
    // Partially/Fully affects Rent ONLY
    const isRentPartial =
      lease.paymentType === 'partially' &&
      partialAmount != null &&
      partialAmount > 0 &&
      partialAmount < totalRent;

    type PendingLine = {
      chargeTypeId: string;
      chargeType: any;
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
      lineTotal: number;
      departmentCenterId?: string | null;
      costCenterId?: string | null;
      isPartialRent?: boolean;
    };
    type CategoryBucket = {
      categoryKey: string;
      categoryName: string;
      lines: PendingLine[];
    };

    const buckets = new Map<string, CategoryBucket>();
    const addToBucket = (categoryCode: string | null | undefined, line: PendingLine) => {
      const key = (categoryCode || 'other').trim().toLowerCase();
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          categoryKey: key,
          categoryName: getCategoryDisplayName(categoryMap, categoryCode),
          lines: [],
        };
        buckets.set(key, bucket);
      }
      bucket.lines.push(line);
    };

    // 1. Base Rent (only when Rent category has monthly = false)
    if (monthlyRent > 0 && !isCategoryMonthly(categoryMap, rentChargeType.category)) {
      const rentLineTotal = isRentPartial ? Math.round(partialAmount! * 100) / 100 : totalRent;
      const rentQty = isRentPartial ? 1 : termMonths;
      const rentUnitPrice = isRentPartial ? rentLineTotal : monthlyRent;
      addToBucket(rentChargeType.category || 'rent', {
        chargeTypeId: rentChargeType.id,
        chargeType: rentChargeType,
        description: isRentPartial
          ? `Rent (Partial Payment) — Unit ${unitLabel}`
          : `Rent (${termMonths} ${termMonths === 1 ? 'month' : 'months'}) — Unit ${unitLabel}`,
        quantity: rentQty,
        unitPrice: rentUnitPrice,
        amount: rentLineTotal,
        lineTotal: rentLineTotal,
        isPartialRent: isRentPartial,
      });
    }

    // 2. Security Deposit (only when Deposit category has monthly = false — always 100%, never partial)
    if (deposit > 0 && depositChargeType && !isCategoryMonthly(categoryMap, depositChargeType.category)) {
      const depTotal = Math.round(deposit * 100) / 100;
      addToBucket(depositChargeType.category || 'deposit', {
        chargeTypeId: depositChargeType.id,
        chargeType: depositChargeType,
        description: `Security Deposit — Unit ${unitLabel}`,
        quantity: 1,
        unitPrice: depTotal,
        amount: depTotal,
        lineTotal: depTotal,
      });
    }

    // 3. Additional non-monthly leaseCharges (qty = 1 x amount, grouped by Charge Category)
    const scheduleCharges: any[] = Array.isArray(lease.billingSchedules) ? lease.billingSchedules : [];
    const seenScheduleCtIds = new Set<string>();
    for (const s of scheduleCharges) {
      const ct = s.chargeType;
      if (!ct) continue;
      const codeUpper = (ct.code || '').trim().toUpperCase();
      if (codeUpper === 'RENT' || codeUpper === 'SECURITY_DEPOSIT') continue;
      seenScheduleCtIds.add(s.chargeTypeId);
      if (isCategoryMonthly(categoryMap, ct.category)) continue;

      const amt = Math.round(Number(s.amount ?? 0) * 100) / 100;
      if (amt <= 0) continue;
      addToBucket(ct.category || 'other', {
        chargeTypeId: s.chargeTypeId,
        chargeType: ct,
        description: s.description || (unitLabel ? `${ct.name} — Unit ${unitLabel}` : ct.name),
        quantity: 1,
        unitPrice: amt,
        amount: amt,
        lineTotal: amt,
        departmentCenterId: s.departmentCenterId ?? null,
        costCenterId: s.costCenterId ?? null,
      });
    }

    // 4. Property defaultServiceCharge (only when its category has monthly = false and not already in leaseCharges)
    const defaultServiceCharge = Number(lease.unit?.property?.settings?.defaultServiceCharge ?? 0);
    if (defaultServiceCharge > 0) {
      const scChargeType = await prisma.chargeType.findFirst({
        where: {
          code: { equals: 'SERVICE_CHARGE', mode: 'insensitive' },
          OR: [{ companyId: null }, { companyId: lease.companyId }],
          ...(lease.propertyId ? { AND: [{ OR: [{ propertyId: lease.propertyId }, { propertyId: null }] }] } : {}),
        },
        orderBy: { propertyId: 'desc' },
      });
      if (
        scChargeType &&
        !seenScheduleCtIds.has(scChargeType.id) &&
        !isCategoryMonthly(categoryMap, scChargeType.category)
      ) {
        const scTotal = Math.round(defaultServiceCharge * 100) / 100;
        addToBucket(scChargeType.category || 'service', {
          chargeTypeId: scChargeType.id,
          chargeType: scChargeType,
          description: `Service Charge — Unit ${unitLabel}`,
          quantity: 1,
          unitPrice: scTotal,
          amount: scTotal,
          lineTotal: scTotal,
        });
      }
    }

    if (buckets.size === 0) {
      return created;
    }

    const fallbackCenters = await this.resolveLeaseUnitCenters(lease, rentChargeType, depositChargeType);

    // Pre-fetch GL accounts for any pending line chargeType that needs center resolution via glAccountCode
    const glCodes = new Set<string>();
    for (const bucket of buckets.values()) {
      for (const line of bucket.lines) {
        if (!line.departmentCenterId && !line.costCenterId && !line.chargeType?.departmentCenterId && !line.chargeType?.costCenterId) {
          const code = line.chargeType?.glAccountCode?.trim();
          if (code) glCodes.add(code);
        }
      }
    }
    const glAccounts = glCodes.size > 0
      ? await prisma.glAccount.findMany({
          where: {
            companyId: lease.companyId,
            code: { in: Array.from(glCodes) },
            isActive: true,
            ...(lease.propertyId ? { OR: [{ propertyId: lease.propertyId }, { propertyId: null }] } : {}),
          },
          select: { code: true, propertyId: true, departmentCenterId: true, costCenterId: true },
        })
      : [];

    const resolveBucketCenters = (lines: PendingLine[]): { departmentCenterId: string | null; costCenterId: string | null } => {
      if (lease.departmentCenterId || lease.costCenterId) {
        return {
          departmentCenterId: lease.departmentCenterId ?? null,
          costCenterId: lease.costCenterId ?? null,
        };
      }
      for (const line of lines) {
        if (line.departmentCenterId || line.costCenterId) {
          return {
            departmentCenterId: line.departmentCenterId ?? null,
            costCenterId: line.costCenterId ?? null,
          };
        }
        if (line.chargeType?.departmentCenterId || line.chargeType?.costCenterId) {
          return {
            departmentCenterId: line.chargeType.departmentCenterId ?? null,
            costCenterId: line.chargeType.costCenterId ?? null,
          };
        }
        const glCode = line.chargeType?.glAccountCode?.trim();
        if (glCode) {
          const matches = glAccounts.filter((a) => a.code === glCode);
          const propMatch = lease.propertyId ? matches.find((a) => a.propertyId === lease.propertyId) : undefined;
          const chosen = propMatch || matches[0];
          if (chosen && (chosen.departmentCenterId || chosen.costCenterId)) {
            return {
              departmentCenterId: chosen.departmentCenterId ?? null,
              costCenterId: chosen.costCenterId ?? null,
            };
          }
        }
      }
      return fallbackCenters;
    };

    // Idempotency: check existing non-void invoices already linked to this lease
    const existingInvoices = await prisma.invoice.findMany({
      where: { leaseId: lease.id, status: { not: 'void' } },
      include: { lines: { select: { chargeTypeId: true } } },
    });
    const existingChargeTypeIds = new Set<string>();
    for (const inv of existingInvoices) {
      for (const l of inv.lines) existingChargeTypeIds.add(l.chargeTypeId);
      const patchData: Record<string, any> = {};
      if (inv.status === 'draft') patchData.status = 'issued';
      if (inv.departmentCenterId == null && inv.costCenterId == null && (fallbackCenters.departmentCenterId || fallbackCenters.costCenterId)) {
        patchData.departmentCenterId = fallbackCenters.departmentCenterId;
        patchData.costCenterId = fallbackCenters.costCenterId;
      }
      if (Object.keys(patchData).length > 0) {
        await prisma.invoice.update({ where: { id: inv.id }, data: patchData });
      }
    }

    // Create one direct invoice per non-monthly Charge Category (Rent first, Deposit second, then A-Z)
    const bucketOrder = (key: string) => (key === 'rent' ? 0 : key === 'deposit' ? 1 : 2);
    const sortedBuckets = [...buckets.values()].sort(
      (a, b) => bucketOrder(a.categoryKey) - bucketOrder(b.categoryKey) || a.categoryName.localeCompare(b.categoryName),
    );

    for (const bucket of sortedBuckets) {
      const pendingLines = bucket.lines.filter((l) => !existingChargeTypeIds.has(l.chargeTypeId));
      if (pendingLines.length === 0) continue;

      const subtotal = Math.round(pendingLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
      const centers = resolveBucketCenters(pendingLines);
      const invoiceNumber = await this.generateInvoiceNumber(lease.companyId, lease.propertyId);

      const hasPartialRent = pendingLines.some((l) => l.isPartialRent);
      const notes = bucket.categoryKey === 'rent'
        ? hasPartialRent
          ? `Base Rent (Partial Payment) — lease ${lease.leaseNumber}`
          : `Base Rent (${termMonths} ${termMonths === 1 ? 'month' : 'months'}) — lease ${lease.leaseNumber}`
        : `${bucket.categoryName} — lease ${lease.leaseNumber}`;

      const inv = await prisma.invoice.create({
        data: {
          companyId: lease.companyId,
          propertyId: lease.propertyId,
          unitId: lease.unitId || null,
          tenantId: lease.tenantId,
          leaseId: lease.id,
          departmentCenterId: centers.departmentCenterId,
          costCenterId: centers.costCenterId,
          invoiceNumber,
          invoiceType: 'invoice',
          status: 'issued',
          invoiceDate,
          dueDate,
          periodFrom: startDate,
          periodTo,
          subtotal,
          taxAmount: 0,
          totalAmount: subtotal,
          paidAmount: 0,
          currency,
          currencyRate,
          notes,
          createdBy: userId,
          lines: {
            create: pendingLines.map((line, idx) => ({
              chargeTypeId: line.chargeTypeId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountPct: 0,
              amount: line.amount,
              taxRate: 0,
              taxAmount: 0,
              lineTotal: line.lineTotal,
              sortOrder: idx,
            })),
          },
        },
        include: {
          lines: {
            include: {
              chargeType: {
                select: {
                  code: true,
                  name: true,
                  glAccountCode: true,
                  departmentCenterId: true,
                  costCenterId: true,
                },
              },
            },
          },
          tenant: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await this._postInvoiceGlAndNotify(inv, lease.companyId, invoiceDate, currency);
      created.push(inv);
      logger.info(`[createFromLease] ${bucket.categoryName} invoice ${invoiceNumber} (${subtotal} ${currency}, ${pendingLines.length} line(s)) for lease ${lease.leaseNumber}`);
    }

    if (created.length > 0) {
      await this.invalidateCompanyCache(lease.companyId);
    }
    return created;
  }

  private async resolveLeaseUnitCenters(
    lease: any,
    rentChargeType?: any,
    depositChargeType?: any,
  ): Promise<{ departmentCenterId: string | null; costCenterId: string | null }> {
    if (lease.departmentCenterId || lease.costCenterId) {
      return {
        departmentCenterId: lease.departmentCenterId ?? null,
        costCenterId: lease.costCenterId ?? null,
      };
    }

    const unitCharges: Array<{ chargeType?: any }> = Array.isArray(lease.unit?.unitCharges)
      ? lease.unit.unitCharges
      : lease.unitId
      ? await prisma.unitCharge.findMany({
          where: { unitId: lease.unitId },
          include: {
            chargeType: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
                glAccountCode: true,
                departmentCenterId: true,
                costCenterId: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const scheduleCharges: Array<{ chargeType?: any }> = Array.isArray(lease.billingSchedules)
      ? lease.billingSchedules
      : [];

    const unitAndScheduleCts = [...unitCharges, ...scheduleCharges]
      .map((u) => u.chargeType)
      .filter((ct): ct is NonNullable<typeof ct> => Boolean(ct));

    const codesToLookup = new Set<string>();
    for (const ct of unitAndScheduleCts) {
      if (!ct.departmentCenterId && !ct.costCenterId && ct.glAccountCode?.trim()) {
        codesToLookup.add(ct.glAccountCode.trim());
      }
    }

    const glAccounts =
      codesToLookup.size > 0
        ? await prisma.glAccount.findMany({
            where: {
              companyId: lease.companyId,
              code: { in: Array.from(codesToLookup) },
              isActive: true,
              ...(lease.propertyId
                ? { OR: [{ propertyId: lease.propertyId }, { propertyId: null }] }
                : {}),
            },
            select: {
              code: true,
              propertyId: true,
              departmentCenterId: true,
              costCenterId: true,
            },
          })
        : [];

    const getCtCenters = (ct: any): { departmentCenterId: string | null; costCenterId: string | null } => {
      if (!ct) return { departmentCenterId: null, costCenterId: null };
      if (ct.departmentCenterId || ct.costCenterId) {
        return {
          departmentCenterId: ct.departmentCenterId ?? null,
          costCenterId: ct.costCenterId ?? null,
        };
      }
      const code = ct.glAccountCode?.trim();
      if (code) {
        const matches = glAccounts.filter((a) => a.code === code);
        const propMatch = lease.propertyId ? matches.find((a) => a.propertyId === lease.propertyId) : undefined;
        const chosen = propMatch || matches[0];
        if (chosen && (chosen.departmentCenterId || chosen.costCenterId)) {
          return {
            departmentCenterId: chosen.departmentCenterId ?? null,
            costCenterId: chosen.costCenterId ?? null,
          };
        }
      }
      return { departmentCenterId: null, costCenterId: null };
    };

    const isRentLike = (ct: any) => {
      const code = (ct.code || '').toUpperCase();
      const cat = (ct.category || '').toLowerCase();
      const name = (ct.name || '').toLowerCase();
      return code === 'RENT' || cat === 'rent' || /^U\d{4}/i.test(code) || name === 'base rent' || name.includes('unit fee');
    };

    for (const ct of unitAndScheduleCts.filter(isRentLike)) {
      const c = getCtCenters(ct);
      if (c.departmentCenterId || c.costCenterId) return c;
    }

    for (const ct of unitAndScheduleCts) {
      const c = getCtCenters(ct);
      if (c.departmentCenterId || c.costCenterId) return c;
    }

    if (rentChargeType?.departmentCenterId || rentChargeType?.costCenterId) {
      return {
        departmentCenterId: rentChargeType.departmentCenterId ?? null,
        costCenterId: rentChargeType.costCenterId ?? null,
      };
    }

    if (depositChargeType?.departmentCenterId || depositChargeType?.costCenterId) {
      return {
        departmentCenterId: depositChargeType.departmentCenterId ?? null,
        costCenterId: depositChargeType.costCenterId ?? null,
      };
    }

    return { departmentCenterId: null, costCenterId: null };
  }

  /**
   * Shared helper: post GL journal + notification + webhook for a directly-created invoice.
   */
  private async _postInvoiceGlAndNotify(invoice: any, companyId: string, invoiceDate: Date, currency: string): Promise<void> {
    try {
      if (await isAccountingIntegrationActive(companyId, invoice.propertyId)) {
        const subtotal    = Number(invoice.subtotal);
        const totalAmount = Number(invoice.totalAmount);
        const taxAmount   = Number(invoice.taxAmount);

        const invDeptId =
          invoice.departmentCenterId ||
          (Array.isArray(invoice.lines)
            ? invoice.lines.find((l: any) => l.chargeType?.departmentCenterId)?.chargeType?.departmentCenterId
            : null) ||
          null;
        const invCcId =
          invoice.costCenterId ||
          (Array.isArray(invoice.lines)
            ? invoice.lines.find((l: any) => l.chargeType?.costCenterId)?.chargeType?.costCenterId
            : null) ||
          null;

        const glLines: Array<{
          accountCode: string;
          debit: number;
          credit: number;
          description?: string;
          departmentCenterId?: string | null;
          costCenterId?: string | null;
        }> = [
          {
            accountCode: '1-2210',
            debit: totalAmount,
            credit: 0,
            description: `AR — ${invoice.invoiceNumber}`,
            departmentCenterId: invDeptId,
            costCenterId: invCcId,
          },
        ];
        const activeLines = Array.isArray(invoice.lines)
          ? invoice.lines.filter((l: any) => Number(l.amount) > 0)
          : [];
        if (activeLines.length > 0) {
          for (const invLine of activeLines) {
            const creditAccountCode = invLine.chargeType?.glAccountCode?.trim() || '4100';
            const lineDesc = invLine.description || invLine.chargeType?.name || 'Revenue';
            glLines.push({
              accountCode: creditAccountCode,
              debit: 0,
              credit: Number(invLine.amount),
              description: `${lineDesc} — ${invoice.invoiceNumber}`,
              departmentCenterId: invLine.chargeType?.departmentCenterId || invDeptId,
              costCenterId: invLine.chargeType?.costCenterId || invCcId,
            });
          }
        } else if (subtotal > 0) {
          glLines.push({
            accountCode: '4100',
            debit: 0,
            credit: subtotal,
            description: `Revenue — ${invoice.invoiceNumber}`,
            departmentCenterId: invDeptId,
            costCenterId: invCcId,
          });
        }
        if (taxAmount > 0) {
          glLines.push({
            accountCode: '2200',
            debit: 0,
            credit: taxAmount,
            description: `Tax Payable — ${invoice.invoiceNumber}`,
            departmentCenterId: invDeptId,
            costCenterId: invCcId,
          });
        }
        await glService.postAutoJournal({
          companyId,
          entryDate: invoiceDate,
          entryType: 'ar_invoice',
          description: `AR Invoice ${invoice.invoiceNumber}`,
          referenceType: 'invoice',
          referenceId: invoice.id,
          propertyId: invoice.propertyId,
          departmentCenterId: invDeptId,
          costCenterId: invCcId,
          lines: glLines,
        });
      }
    } catch (err: any) {
      logger.warn(`[createFromLease] GL auto-journal skipped: ${err.message}`);
    }

    try {
      const tenantName = invoice.tenant
        ? `${invoice.tenant.firstName || ''} ${invoice.tenant.lastName || ''}`.trim()
        : '';
      billingNotifications.invoiceIssued(
        { ...invoice, totalAmount: invoice.totalAmount, currency, companyId, tenantId: invoice.tenantId },
        tenantName,
      );
    } catch (err: any) {
      logger.warn(`[createFromLease] Notification skipped: ${err.message}`);
    }

    try {
      webhookInvoiceIssued(invoice);
    } catch (err: any) {
      logger.warn(`[createFromLease] Webhook skipped: ${err.message}`);
    }
  }

  // ── Auto-Generate from Billing Schedule(s) ──

  /** Single-schedule convenience wrapper around {@link generateFromSchedules}. */
  async generateFromSchedule(scheduleId: string) {
    return this.generateFromSchedules([scheduleId]);
  }

  /**
   * Generates ONE invoice covering every given schedule as its own line item.
   * Callers group schedules that share property + tenant + unit (a unit implies its
   * floor, so matching on unit already covers "same floor, same unit") before calling
   * this — see {@link runBilling}. A schedule that already has an invoice for its
   * current period is skipped; if every schedule in the batch is already invoiced,
   * no invoice is created and this returns null.
   */
  async generateFromSchedules(scheduleIds: string[], asOfDate?: Date) {
    const schedules = await prisma.billingSchedule.findMany({
      where: { id: { in: scheduleIds } },
      include: { chargeType: true, lease: true, tenant: true },
    });
    if (schedules.length === 0) throw AppError.notFound('Billing schedule');

    type LineInput = {
      schedule: (typeof schedules)[number];
      periodFrom: Date; periodTo: Date; nextBillingDate: Date; amount: number; taxRate: number; taxAmount: number; lineTotal: number;
    };
    type SkippedScheduleUpdate = {
      scheduleId: string;
      nextBillingDate: Date;
      endDate: Date | null;
    };
    const lineInputs: LineInput[] = [];
    const skippedUpdates: SkippedScheduleUpdate[] = [];

    // Pre-fetch all active tax configs for this company once before the loop
    // so getApplicableRate() is resolved in-memory instead of hitting the DB per schedule
    const allTaxConfigs = await prisma.taxConfiguration.findMany({
      where: { companyId: schedules[0].companyId, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const resolveRate = (chargeTypeCode: string, invoiceDate: Date): number => {
      const specific = allTaxConfigs.find(c =>
        c.effectiveFrom <= invoiceDate &&
        (!c.effectiveTo || c.effectiveTo >= invoiceDate) &&
        c.appliesTo.length > 0 && c.appliesTo.includes(chargeTypeCode)
      );
      if (specific) return Number(specific.taxRate);
      const general = allTaxConfigs.find(c =>
        c.effectiveFrom <= invoiceDate &&
        (!c.effectiveTo || c.effectiveTo >= invoiceDate) &&
        c.appliesTo.length === 0
      );
      return general ? Number(general.taxRate) : 0;
    };

    for (const schedule of schedules) {
      const periodFrom = schedule.nextBillingDate!;
      const nextBillingDate = this.computeNextBillingDate(periodFrom, schedule.billingDay, schedule.billingCycle);
      const periodTo = new Date(nextBillingDate);
      periodTo.setUTCDate(periodTo.getUTCDate() - 1);

      // Idempotency: check if this schedule already has an invoice for this period.
      // Scoped to tenant/property/unit/charge type (not just leaseId) — multiple ad-hoc
      // schedules commonly share a null leaseId and the same period, and must not be
      // mistaken for each other's invoices. Also require periodFrom on the line itself
      // so upfront direct invoices (where line.periodFrom is null) never block schedules.
      const existing = await prisma.invoice.findFirst({
        where: {
          tenantId: schedule.tenantId,
          propertyId: schedule.propertyId,
          unitId: schedule.unitId,
          periodFrom,
          invoiceType: 'invoice',
          status: { not: 'void' },
          lines: { some: { chargeTypeId: schedule.chargeTypeId, periodFrom } },
        },
      });
      if (existing) {
        logger.warn(
          `Invoice already exists for schedule ${schedule.id} period ${periodFrom.toISOString()}, skipping invoice creation and advancing nextBillingDate to ${nextBillingDate.toISOString().split('T')[0]}`,
        );
        skippedUpdates.push({
          scheduleId: schedule.id,
          nextBillingDate,
          endDate: schedule.endDate,
        });
        continue;
      }

      const scheduleQty = Number(schedule.quantity) || 1;
      let amount = Number(schedule.amount) * scheduleQty;

      if (schedule.isProrated && schedule.invoiceCount === 0 && schedule.prorateStart) {
        amount = this.calculateProratedAmount(amount, schedule.prorateStart, periodTo, schedule.billingCycle);
      }

      // Resolve tax rate from pre-fetched configs (no DB call)
      const taxRate = resolveRate(schedule.chargeType.code, periodFrom);
      const taxAmount = Math.round(amount * taxRate * 100) / 100;
      lineInputs.push({ schedule, periodFrom, periodTo, nextBillingDate, amount, taxRate, taxAmount, lineTotal: amount + taxAmount });
    }

    const buildSkippedScheduleUpdate = (s: SkippedScheduleUpdate) => {
      const isCompleted = Boolean(s.endDate && s.nextBillingDate > s.endDate);
      return prisma.billingSchedule.update({
        where: { id: s.scheduleId },
        data: {
          nextBillingDate: isCompleted ? null : s.nextBillingDate,
          isProrated: false,
          status: isCompleted ? 'completed' : 'active',
        },
      });
    };

    if (lineInputs.length === 0) {
      if (skippedUpdates.length > 0) {
        await prisma.$transaction(skippedUpdates.map(buildSkippedScheduleUpdate));
      }
      return null;
    }

    const first = lineInputs[0].schedule;
    const periodFrom = lineInputs.reduce((min, l) => (l.periodFrom < min ? l.periodFrom : min), lineInputs[0].periodFrom);
    // Invoice date is when billing was actually run, not the schedule's period start —
    // those diverge whenever Run Billing catches up a schedule that fell overdue.
    const invoiceDate = asOfDate ?? periodFrom;
    const periodTo = lineInputs.reduce((max, l) => (l.periodTo > max ? l.periodTo : max), lineInputs[0].periodTo);
    const dueDate = lineInputs.reduce((min, l) => {
      const d = new Date(l.periodFrom);
      d.setUTCDate(d.getUTCDate() + l.schedule.paymentDueDays);
      return d < min ? d : min;
    }, (() => {
      const d = new Date(lineInputs[0].periodFrom);
      d.setUTCDate(d.getUTCDate() + lineInputs[0].schedule.paymentDueDays);
      return d;
    })());
    const leaseId = lineInputs.every(l => l.schedule.leaseId === first.leaseId) ? first.leaseId : null;

    const subtotal = lineInputs.reduce((sum, l) => sum + l.amount, 0);
    const taxAmount = lineInputs.reduce((sum, l) => sum + l.taxAmount, 0);
    const totalAmount = subtotal + taxAmount;

    let isTemporary = lineInputs.some(l => Boolean((l.schedule as any).isTemporary));
    if (!isTemporary) {
      try {
        const schedIds = lineInputs.map(l => l.schedule.id);
        const tempRows = await prisma.$queryRaw<Array<{ is_temporary: boolean }>>`
          SELECT "is_temporary" FROM "billing_schedules" WHERE "id"::text = ANY(${schedIds})
        `;
        isTemporary = tempRows.some(r => Boolean(r.is_temporary));
      } catch (_e) {}
    }
    const invoiceNumber = isTemporary
      ? await this.generateTempInvoiceNumber(first.companyId, first.propertyId)
      : await this.generateInvoiceNumber(first.companyId, first.propertyId);

    // Get grace period (prefer property-scoped penalty configuration)
    const penaltyConfig =
      (first.propertyId
        ? await prisma.penaltyConfiguration.findFirst({
            where: { companyId: first.companyId, propertyId: first.propertyId, isActive: true },
            orderBy: { createdAt: 'desc' },
          })
        : null) ??
      (await prisma.penaltyConfiguration.findFirst({
        where: { companyId: first.companyId, propertyId: null, isActive: true },
        orderBy: { createdAt: 'desc' },
      }));

    const departmentCenterId =
      lineInputs.find((l) => l.schedule.departmentCenterId)?.schedule.departmentCenterId ||
      first.departmentCenterId ||
      lineInputs.find((l) => l.schedule.chargeType?.departmentCenterId)?.schedule.chargeType?.departmentCenterId ||
      null;
    const costCenterId =
      lineInputs.find((l) => l.schedule.costCenterId)?.schedule.costCenterId ||
      first.costCenterId ||
      lineInputs.find((l) => l.schedule.chargeType?.costCenterId)?.schedule.chargeType?.costCenterId ||
      null;

    let scheduleCurrencyRate: number | null = null;
    if (first.companyId && first.currency) {
      const rateRow =
        (first.propertyId
          ? await prisma.currencyRate.findFirst({
              where: { companyId: first.companyId, propertyId: first.propertyId, currency: first.currency, isActive: true },
              orderBy: { effectiveDate: 'desc' },
            })
          : null) ||
        (await prisma.currencyRate.findFirst({
          where: { companyId: first.companyId, currency: first.currency, isActive: true },
          orderBy: { effectiveDate: 'desc' },
        }));
      if (rateRow) {
        scheduleCurrencyRate = Number(rateRow.rate);
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId: first.companyId,
        propertyId: first.propertyId,
        unitId: first.unitId,
        tenantId: first.tenantId,
        leaseId,
        departmentCenterId,
        costCenterId,
        invoiceNumber,
        invoiceType: 'invoice',
        status: 'issued',
        invoiceDate,
        dueDate,
        periodFrom,
        periodTo,
        subtotal,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        currency: first.currency,
        currencyRate: scheduleCurrencyRate,
        gracePeriodDays: penaltyConfig?.gracePeriodDays || 0,
        lines: {
          create: lineInputs.map((l, idx) => {
            const quantity = Number(l.schedule.quantity) || 1;
            return {
              chargeTypeId: l.schedule.chargeTypeId,
              description: l.schedule.description || l.schedule.chargeType.name,
              quantity,
              unitPrice: quantity ? l.amount / quantity : l.amount,
              amount: l.amount,
              taxRate: l.taxRate,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
              periodFrom: l.periodFrom,
              periodTo: l.periodTo,
              sortOrder: idx,
            };
          }),
        },
      },
    });

    // Advance all included and already-invoiced (skipped) schedules in a single transaction
    await prisma.$transaction([
      ...lineInputs.map((l) => {
        const nextDate = l.nextBillingDate;
        const scheduleEndDate = l.schedule.endDate;
        const isCompleted = Boolean(scheduleEndDate && nextDate > scheduleEndDate);
        return prisma.billingSchedule.update({
          where: { id: l.schedule.id },
          data: {
            nextBillingDate: isCompleted ? null : nextDate,
            lastInvoicedAt: new Date(),
            invoiceCount: { increment: 1 },
            isProrated: false,
            status: isCompleted ? 'completed' : 'active',
          },
        });
      }),
      ...skippedUpdates.map(buildSkippedScheduleUpdate),
    ]);

    // GL auto-posting: Dr AR (linked to Invoice Dept/CC) / Cr per ChargeType GL Account / Cr Tax Payable
    if (await isAccountingIntegrationActive(first.companyId, first.propertyId)) {
      const glLines: Array<{
        accountCode: string;
        debit: number;
        credit: number;
        description?: string;
        departmentCenterId?: string | null;
        costCenterId?: string | null;
      }> = [
        {
          accountCode: '1-2210',
          debit: totalAmount,
          credit: 0,
          description: `AR — ${invoiceNumber}`,
          departmentCenterId,
          costCenterId,
        },
      ];
      const activeScheduleLines = lineInputs.filter((l) => l.amount > 0);
      if (activeScheduleLines.length > 0) {
        for (const l of activeScheduleLines) {
          const creditAccountCode = l.schedule.chargeType?.glAccountCode?.trim() || '4100';
          const lineDesc = l.schedule.description || l.schedule.chargeType?.name || 'Revenue';
          glLines.push({
            accountCode: creditAccountCode,
            debit: 0,
            credit: l.amount,
            description: `${lineDesc} — ${invoiceNumber}`,
            departmentCenterId:
              l.schedule.departmentCenterId ||
              l.schedule.chargeType?.departmentCenterId ||
              departmentCenterId,
            costCenterId:
              l.schedule.costCenterId ||
              l.schedule.chargeType?.costCenterId ||
              costCenterId,
          });
        }
      } else if (subtotal > 0) {
        glLines.push({
          accountCode: '4100',
          debit: 0,
          credit: subtotal,
          description: `Revenue — ${invoiceNumber}`,
          departmentCenterId,
          costCenterId,
        });
      }
      if (taxAmount > 0) {
        glLines.push({
          accountCode: '2200',
          debit: 0,
          credit: taxAmount,
          description: `Tax Payable — ${invoiceNumber}`,
          departmentCenterId,
          costCenterId,
        });
      }
      await glService.postAutoJournal({
        companyId: first.companyId,
        entryDate: invoiceDate,
        entryType: 'ar_invoice',
        description: `AR Invoice ${invoiceNumber}`,
        referenceType: 'invoice',
        referenceId: invoice.id,
        propertyId: first.propertyId,
        departmentCenterId,
        costCenterId,
        lines: glLines,
      });
    }

    // Send notification
    const tenantName = first.tenant
      ? `${first.tenant.firstName || ''} ${first.tenant.lastName || ''}`.trim()
      : '';
    billingNotifications.invoiceIssued({
      ...invoice, companyId: first.companyId, tenantId: first.tenantId,
      totalAmount: invoice.totalAmount, currency: first.currency,
    }, tenantName);

    logger.info(`Generated invoice ${invoiceNumber} for ${lineInputs.length} schedule(s) [${lineInputs.map(l => l.schedule.id).join(', ')}] (${totalAmount} ${first.currency})`);
    webhookInvoiceIssued({ ...invoice, companyId: first.companyId, tenantId: first.tenantId, currency: first.currency });
    await this.invalidateCompanyCache(first.companyId);
    return invoice;
  }

  /**
   * Groups due schedules by property + tenant + unit (unit implies floor) and generates
   * one consolidated invoice per group. Used by both the manual "Run Billing" endpoint
   * and the daily billing cron so their behavior stays identical.
   */
  async runBilling(dueSchedules: Array<{ id: string; propertyId: string; tenantId: string; unitId: string | null; isTemporary?: boolean }>, asOfDate?: Date) {
    const groups = new Map<string, string[]>();
    for (const s of dueSchedules) {
      const key = `${s.propertyId}|${s.tenantId}|${s.unitId ?? 'none'}|${s.isTemporary ? 'tmp' : 'reg'}`;
      const ids = groups.get(key);
      if (ids) ids.push(s.id); else groups.set(key, [s.id]);
    }

    let generated = 0;
    const errors: string[] = [];

    for (const scheduleIds of groups.values()) {
      try {
        const invoice = await this.generateFromSchedules(scheduleIds, asOfDate);
        if (invoice) generated++;
      } catch (err: any) {
        errors.push(`Schedules ${scheduleIds.join(', ')}: ${err.message}`);
      }
    }

    return { processed: dueSchedules.length, generated, errors };
  }

  // ── Void ────────────────────────────────────

  async void(id: string, companyId: string, reason: string, userId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: { lines: true },
    });
    if (!invoice) throw AppError.notFound('Invoice');
    if (Number(invoice.paidAmount) > 0 || !['draft', 'issued', 'sent', 'overdue'].includes(invoice.status)) {
      throw AppError.validation('Can only void unpaid draft, issued, sent, or overdue invoices. Use credit note for paid invoices.');
    }

    const voidedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'void',
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: reason,
      },
    });

    // 1. Reverse posted GL journal entry(s) for this invoice
    if (Boolean(true)) {
      try {
        const postedJournals = await prisma.journalEntry.findMany({
          where: {
            companyId,
            referenceType: 'invoice',
            referenceId: invoice.id,
            status: 'posted',
            isReversal: false,
          },
        });
        for (const je of postedJournals) {
          await glService.reverseJournalEntry(je.id, companyId, userId);
          logger.info(`Reversed GL journal ${je.journalNumber} for voided invoice ${invoice.invoiceNumber}`);
        }
      } catch (err: any) {
        logger.error(`Failed to reverse GL journal for voided invoice ${invoice.invoiceNumber}: ${err.message}`);
      }
    }

    // 2. If this invoice was generated from Billing Schedule(s), restore each schedule's nextBillingDate
    //    back to the date before the invoice was generated (stored on line.periodFrom).
    try {
      const scheduleLines = invoice.lines.filter((l) => l.periodFrom != null);
      if (scheduleLines.length > 0) {
        const candidateSchedules = await prisma.billingSchedule.findMany({
          where: {
            companyId,
            propertyId: invoice.propertyId,
            tenantId: invoice.tenantId,
            unitId: invoice.unitId,
            status: { not: 'cancelled' },
            chargeTypeId: { in: scheduleLines.map((l) => l.chargeTypeId) },
          },
        });

        const updatedScheduleIds = new Set<string>();
        for (const line of scheduleLines) {
          const linePeriodFrom = line.periodFrom!;
          const matches = candidateSchedules.filter(
            (s) => s.chargeTypeId === line.chargeTypeId && !updatedScheduleIds.has(s.id),
          );
          if (matches.length === 0) continue;

          const matched =
            matches.find((s) => invoice.leaseId && s.leaseId === invoice.leaseId && s.description === line.description) ||
            matches.find((s) => invoice.leaseId && s.leaseId === invoice.leaseId) ||
            matches.find((s) => s.description === line.description) ||
            matches[0];

          if (matched.nextBillingDate == null || linePeriodFrom < matched.nextBillingDate) {
            const newInvoiceCount = Math.max(0, (matched.invoiceCount || 0) - 1);
            await prisma.billingSchedule.update({
              where: { id: matched.id },
              data: {
                nextBillingDate: linePeriodFrom,
                invoiceCount: newInvoiceCount,
                isProrated: newInvoiceCount === 0 && matched.prorateStart != null ? true : matched.isProrated,
                status: matched.status === 'completed' ? 'active' : matched.status,
              },
            });
            updatedScheduleIds.add(matched.id);
            logger.info(
              `Restored schedule ${matched.id} nextBillingDate to ${linePeriodFrom.toISOString().split('T')[0]} after voiding invoice ${invoice.invoiceNumber}`,
            );
          }
        }
      }
    } catch (err: any) {
      logger.error(`Failed to restore billing schedule nextBillingDate for voided invoice ${invoice.invoiceNumber}: ${err.message}`);
    }

    await this.invalidateCompanyCache(companyId);
    return voidedInvoice;
  }

  // ── Credit Note ─────────────────────────────

  async createCreditNote(originalId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const original = await prisma.invoice.findFirst({ where: { id: originalId, companyId } });
    if (!original) throw AppError.notFound('Original invoice');

    const lines = dto.lines as Array<{
      chargeTypeId: string; description: string; quantity?: number; unitPrice: number; taxRate?: number;
    }>;

    let subtotal = 0;
    let totalTax = 0;
    const lineData = lines.map((line, idx) => {
      const qty = line.quantity || 1;
      const amount = Math.round(qty * line.unitPrice * 100) / 100;
      const taxRate = line.taxRate || 0;
      const taxAmount = Math.round(amount * taxRate * 100) / 100;
      subtotal += amount;
      totalTax += taxAmount;

      return {
        chargeTypeId: line.chargeTypeId,
        description: line.description,
        quantity: qty,
        unitPrice: line.unitPrice,
        amount,
        taxRate,
        taxAmount,
        lineTotal: amount + taxAmount,
        sortOrder: idx,
      };
    });

    const totalAmount = subtotal + totalTax;

    // Credit note total must not exceed original invoice total
    if (totalAmount > Number(original.totalAmount)) {
      throw AppError.validation('Credit note amount cannot exceed original invoice total');
    }

    // Check if credit note requires workflow approval (threshold check)
    const workflowDef = await prisma.workflowDefinition.findFirst({
      where: { companyId, entityType: 'credit_note', status: 'active' },
    });

    // Determine if amount exceeds threshold (default: always approve if workflow exists)
    const needsApproval = workflowDef != null;
    const creditNoteStatus = needsApproval ? 'draft' : 'issued';

    const invoiceNumber = await this.generateInvoiceNumber(companyId, original.propertyId);

    const creditNote = await prisma.invoice.create({
      data: {
        companyId,
        propertyId: original.propertyId,
        unitId: original.unitId,
        tenantId: original.tenantId,
        leaseId: original.leaseId,
        invoiceNumber,
        invoiceType: 'credit_note',
        status: creditNoteStatus,
        invoiceDate: new Date(),
        dueDate: new Date(),
        subtotal,
        taxAmount: totalTax,
        totalAmount,
        paidAmount: 0,
        currency: original.currency,
        originalInvoiceId: originalId,
        creditReason: dto.creditReason as string,
        createdBy: userId,
        lines: { create: lineData },
      },
    });

    // Start workflow if approval is needed
    if (needsApproval && workflowDef) {
      try {
        const instance = await workflowEngine.startInstance(
          workflowDef.id,
          'credit_note',
          creditNote.id,
          {
            creditNoteId: creditNote.id,
            invoiceNumber: creditNote.invoiceNumber,
            originalInvoiceId: originalId,
            amount: totalAmount,
            creditReason: dto.creditReason,
          },
          userId,
        );
        if (instance) {
          await prisma.invoice.update({
            where: { id: creditNote.id },
            data: { workflowInstanceId: instance.id },
          });
        }
      } catch (err: any) {
        logger.error(`Failed to start credit note workflow: ${err.message}`);
      }
    }

    // Only apply credit immediately if no approval workflow
    if (!needsApproval) {
      // Apply credit to original invoice's paid amount
      await prisma.invoice.update({
        where: { id: originalId },
        data: { paidAmount: { increment: totalAmount } },
      });

      // Check if original is now fully paid
      const updated = await prisma.invoice.findUnique({ where: { id: originalId } });
      if (updated && Number(updated.paidAmount) >= Number(updated.totalAmount)) {
        await prisma.invoice.update({ where: { id: originalId }, data: { status: 'paid' } });
      }
    }

    // TODO: GL posting hook

    // Send credit note notification
    const tenantObj = await prisma.tenant.findUnique({ where: { id: original.tenantId }, select: { firstName: true, lastName: true, companyName: true, tenantType: true } });
    const tenantName = tenantObj?.tenantType === 'company'
      ? tenantObj.companyName || ''
      : `${tenantObj?.firstName || ''} ${tenantObj?.lastName || ''}`.trim();
    billingNotifications.creditNoteIssued({
      ...creditNote, companyId, tenantId: original.tenantId, currency: original.currency,
    }, original.invoiceNumber || '', tenantName);

    await this.invalidateCompanyCache(companyId);
    return creditNote;
  }

  // ── Overdue Transition ──────────────────────

  async transitionOverdue() {
    const today = new Date();
    const result = await prisma.$executeRaw`
      UPDATE invoices
      SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('issued', 'sent')
        AND invoice_type = 'invoice'
        AND (due_date + grace_period_days * INTERVAL '1 day') < ${today}
    `;
    if (result > 0) {
      logger.info(`Transitioned ${result} invoices to overdue`);
    }
    return result;
  }

  // ── Helpers ─────────────────────────────────

  private calculateProratedAmount(monthlyAmount: number, prorateFrom: Date, periodEnd: Date, billingCycle: string): number {
    if (billingCycle !== 'monthly') return monthlyAmount;
    const daysInMonth = new Date(Date.UTC(prorateFrom.getUTCFullYear(), prorateFrom.getUTCMonth() + 1, 0)).getUTCDate();
    const daysInPeriod = Math.ceil((periodEnd.getTime() - prorateFrom.getTime()) / 86400000) + 1;
    return Math.round((monthlyAmount / daysInMonth) * daysInPeriod * 100) / 100;
  }

  private getCycleMonths(billingCycle: string): number {
    return getBillingCycleMonths(billingCycle);
  }

  /**
   * Computes the next billing date by advancing `billingCycle` months from `periodFrom`,
   * clamping to the target month's maximum days (e.g. Feb 28/29, Apr 30), and snapping back
   * to the contract's original `billingDay` (e.g. 31st) when the month has enough days.
   */
  private computeNextBillingDate(periodFrom: Date, billingDay: number, billingCycle: string): Date {
    const d = new Date(periodFrom);
    const startYear = d.getUTCFullYear();
    const startMonth = d.getUTCMonth();
    const monthsToAdd = this.getCycleMonths(billingCycle);

    const totalMonths = startMonth + monthsToAdd;
    const targetYear = startYear + Math.floor(totalMonths / 12);
    const targetMonth = totalMonths % 12;
    const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const day = Math.min(billingDay, maxDay);

    return new Date(Date.UTC(targetYear, targetMonth, day));
  }
}

export const invoicesService = new InvoicesService();
