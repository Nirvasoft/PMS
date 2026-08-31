import { Prisma } from '@prisma/client';
import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { billingNotifications } from './billingNotifications.service';

export class PenaltyService {
  async findConfigs(companyId: string) {
    return prisma.penaltyConfiguration.findMany({
      where: { companyId, isActive: true },
      include: {
        property: { select: { id: true, name: true } },
        chargeType: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createConfig(companyId: string, dto: Record<string, unknown>) {
    return prisma.penaltyConfiguration.create({
      data: {
        companyId,
        propertyId: (dto.propertyId as string) || null,
        chargeTypeId: (dto.chargeTypeId as string) || null,
        gracePeriodDays: dto.gracePeriodDays as number,
        penaltyType: dto.penaltyType as string,
        penaltyValue: dto.penaltyValue as number,
        maxPenaltyPct: (dto.maxPenaltyPct as number) || null,
        compound: (dto.compound as boolean) || false,
        tieredConfig: (dto.tieredConfig as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Daily job: find overdue invoices past grace period, calculate and apply penalty.
   */
  async checkAndApplyPenalties() {
    const today = new Date();
    let applied = 0;

    // Find ALL overdue invoices (both first-time and already-penalized for recalc)
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['issued', 'sent', 'partially_paid', 'overdue'] },
        invoiceType: 'invoice',
      },
    });

    for (const invoice of overdueInvoices) {
      const dueDate = new Date(invoice.dueDate);
      const graceDays = invoice.gracePeriodDays || 0;
      const graceEnd = new Date(dueDate);
      graceEnd.setDate(graceEnd.getDate() + graceDays);

      if (today <= graceEnd) continue; // Still within grace period

      const config = await this.getPenaltyConfig(invoice.companyId, invoice.propertyId);
      if (!config) continue;

      const daysOverdue = Math.ceil((today.getTime() - graceEnd.getTime()) / 86400000);
      const isFirstTime = !invoice.penaltyAppliedAt;
      const isRecalcType = ['percentage_per_day', 'tiered'].includes(config.penaltyType);

      // Skip already-penalized invoices unless they use a daily-recalc type
      if (!isFirstTime && !isRecalcType) continue;

      let penaltyAmount = 0;
      const base = Number(invoice.subtotal);

      switch (config.penaltyType) {
        case 'fixed_amount':
          penaltyAmount = Number(config.penaltyValue);
          break;
        case 'percentage':
          penaltyAmount = base * (Number(config.penaltyValue) / 100);
          break;
        case 'percentage_per_day':
          penaltyAmount = config.compound
            ? base * (Math.pow(1 + Number(config.penaltyValue) / 100, daysOverdue) - 1)
            : base * (Number(config.penaltyValue) / 100) * daysOverdue;
          break;
        case 'tiered':
          penaltyAmount = this.calculateTieredPenalty(base, daysOverdue, config.tieredConfig);
          break;
      }

      // Apply cap
      if (config.maxPenaltyPct) {
        const maxPenalty = base * (Number(config.maxPenaltyPct) / 100);
        penaltyAmount = Math.min(penaltyAmount, maxPenalty);
      }

      penaltyAmount = Math.round(penaltyAmount * 100) / 100;
      if (penaltyAmount <= 0) continue;

      // Skip if penalty hasn't changed (avoid unnecessary updates)
      if (!isFirstTime && penaltyAmount === Number(invoice.penaltyAmount)) continue;

      // Get penalty charge type
      const penaltyChargeType = await prisma.chargeType.findFirst({
        where: { code: 'LATE_PAYMENT_PENALTY', OR: [{ companyId: null }, { companyId: invoice.companyId }] },
      });
      if (!penaltyChargeType) continue;

      const previousPenalty = Number(invoice.penaltyAmount) || 0;
      const penaltyDelta = penaltyAmount - previousPenalty;

      if (isFirstTime) {
        // First time: create penalty line + update invoice
        await prisma.$transaction([
          prisma.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              chargeTypeId: penaltyChargeType.id,
              description: `Late payment penalty (${daysOverdue} days overdue)`,
              quantity: 1,
              unitPrice: penaltyAmount,
              amount: penaltyAmount,
              taxRate: 0,
              taxAmount: 0,
              lineTotal: penaltyAmount,
              sortOrder: 99,
            },
          }),
          prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              penaltyAmount,
              penaltyAppliedAt: new Date(),
              totalAmount: { increment: penaltyAmount },
              status: 'overdue',
            },
          }),
        ]);
      } else {
        // Recalculation: update existing penalty line + adjust invoice total
        const existingLine = await prisma.invoiceLine.findFirst({
          where: { invoiceId: invoice.id, chargeTypeId: penaltyChargeType.id },
          orderBy: { sortOrder: 'desc' },
        });

        if (existingLine) {
          await prisma.$transaction([
            prisma.invoiceLine.update({
              where: { id: existingLine.id },
              data: {
                description: `Late payment penalty (${daysOverdue} days overdue)`,
                unitPrice: penaltyAmount,
                amount: penaltyAmount,
                lineTotal: penaltyAmount,
              },
            }),
            prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                penaltyAmount,
                totalAmount: { increment: penaltyDelta },
              },
            }),
          ]);
        }
      }

      applied++;
      logger.info(`${isFirstTime ? 'Applied' : 'Recalculated'} penalty of ${penaltyAmount} to invoice ${invoice.invoiceNumber} (${daysOverdue} days overdue)`);

      // Send notification at milestone days: 1, 7, 14, 30 (or first time)
      const notifyDays = [1, 7, 14, 30];
      if (isFirstTime || notifyDays.includes(daysOverdue)) {
        const tenant = await prisma.tenant.findUnique({ where: { id: invoice.tenantId }, select: { firstName: true, lastName: true, companyName: true, tenantType: true } });
        const tenantName = tenant?.tenantType === 'company'
          ? tenant.companyName || ''
          : `${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim();
        billingNotifications.invoiceOverduePenalty(
          invoice, penaltyAmount, daysOverdue, tenantName,
        );
      }
    }

    if (applied > 0) {
      logger.info(`Penalty check: applied/recalculated penalties on ${applied} invoices`);
    }
    return applied;
  }

  private async getPenaltyConfig(companyId: string, propertyId: string) {
    // Try property-specific first, then company-wide
    const specific = await prisma.penaltyConfiguration.findFirst({
      where: { companyId, propertyId, isActive: true },
    });
    if (specific) return specific;

    return prisma.penaltyConfiguration.findFirst({
      where: { companyId, propertyId: null, isActive: true },
    });
  }

  /**
   * Tiered penalty: different rates for different overdue day ranges.
   * tieredConfig shape: [{ dayFrom: 1, dayTo: 30, rate: 0.01 }, { dayFrom: 31, dayTo: 60, rate: 0.02 }, ...]
   */
  private calculateTieredPenalty(base: number, daysOverdue: number, tieredConfig: any): number {
    if (!tieredConfig || !Array.isArray(tieredConfig)) return 0;
    let total = 0;
    for (const tier of tieredConfig) {
      const from = tier.dayFrom || 0;
      const to = tier.dayTo || Infinity;
      const rate = Number(tier.rate) || 0;
      const daysInTier = Math.min(daysOverdue, to) - from + 1;
      if (daysInTier > 0 && daysOverdue >= from) {
        total += base * (rate / 100) * daysInTier;
      }
    }
    return total;
  }
}

export const penaltyService = new PenaltyService();
