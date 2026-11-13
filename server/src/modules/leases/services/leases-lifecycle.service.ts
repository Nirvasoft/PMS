import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { sequenceService } from '../../../common/sequence.service';
import { calcLeaseTermMonths, resolveTerminationPolicy, computeTerminationPenalty } from './helpers';
import { escalationService } from './escalation.service';
import { workflowEngine } from '../../workflow/services/engine.service';
import { billingSchedulesService } from '../../billing/billingSchedules.service';
import { invoicesService } from '../../billing/invoices.service';
import { webhookLeaseActivated, webhookLeaseTerminated, webhookLeaseRenewed } from '../../../common/webhookHooks';
import { unitsService } from '../../units/units.service';
import { clearShopIdentityOp } from '../../mall/shopProfileReset';

export class LeasesLifecycleService {
  // ── Submit for approval ───────────────────
  async submit(id: string, companyId: string, submittedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'draft') throw new AppError(400, 'NOT_DRAFT', 'Only draft leases can be submitted');
    if (!lease.tenantId) throw new AppError(400, 'MISSING_TENANT', 'Tenant is required');
    if (Number(lease.rentAmount) <= 0) throw new AppError(400, 'INVALID_RENT', 'Rent amount must be greater than 0');

    // Check if there is a workflow definition for lease approval
    const def = await prisma.workflowDefinition.findFirst({
      where: { companyId, entityType: 'lease', status: 'active' },
    });

    if (def) {
      // Start workflow instance
      const instance = await workflowEngine.startInstance(
        def.id,
        'lease',
        lease.id,
        {
          leaseId: lease.id,
          leaseNumber: lease.leaseNumber,
          rentAmount: Number(lease.rentAmount),
          tenantId: lease.tenantId,
          propertyId: lease.propertyId,
        },
        submittedBy
      );

      if (!instance) throw new AppError(500, 'WORKFLOW_ERROR', 'Failed to start workflow instance');

      await prisma.lease.update({
        where: { id },
        data: { status: 'pending_approval', workflowInstanceId: instance.id },
      });

      return { leaseId: id, status: 'pending_approval', workflowInstanceId: instance.id };
    } else {
      // No workflow configured → approve directly
      await prisma.lease.update({
        where: { id },
        data: { status: 'approved', approvedBy: submittedBy, approvedAt: new Date() },
      });
      return { leaseId: id, status: 'approved', workflowInstanceId: null };
    }
  }

  // ── Activate ─────────────────────────────
  async activate(id: string, companyId: string, activatedBy: string) {
    const lease = await prisma.lease.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        unit: {
          include: {
            property: true,
            unitCharges: {
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
            },
          },
        },
        // Load charge schedules (created at lease-creation time, promoted to active on activation).
        // These are what invoicesService.createFromLease iterates to issue per-charge invoices.
        billingSchedules: {
          where: { status: { in: ['draft', 'active'] } },
          select: {
            id: true,
            chargeTypeId: true,
            amount: true,
            description: true,
            billingCycle: true,
            departmentCenterId: true,
            costCenterId: true,
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
        },
      },
    });
    if (!lease) throw AppError.notFound('Lease');
    if (!['approved', 'pending_approval', 'draft'].includes(lease.status)) throw new AppError(400, 'INVALID_STATUS', 'Only approved or draft leases can be activated');


    const handoverDate = lease.handoverDate ? new Date(lease.handoverDate) : new Date(lease.startDate);
    const unitStatus   = handoverDate <= new Date() ? 'occupied' : 'reserved';

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'active', activatedAt: new Date(), approvedBy: activatedBy, approvedAt: new Date() } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: unitStatus } }),
    ]);
    await unitsService.invalidateStatsCache(lease.propertyId);

    await escalationService.generateEscalationSchedule(id);

    // ── Billing branch ────────────────────────────────────────────────────────
    // Query payment_type and partial_amount via raw SQL so they work even if
    // the Prisma client was generated before the migration ran.
    try {
      const extraRows = await prisma.$queryRaw<Array<{ payment_type: string | null; partial_amount: any }>>`
        SELECT "payment_type", "partial_amount" FROM "leases" WHERE "id" = ${id}::uuid
      `;
      if (extraRows && extraRows.length > 0) {
        (lease as any).paymentType = extraRows[0].payment_type || 'fully';
        (lease as any).partialAmount = extraRows[0].partial_amount != null ? Number(extraRows[0].partial_amount) : null;
      }
    } catch (_e) {}

    // paymentType = 'fully':
    //   • Create direct invoice for Base Rent (+ Security Deposit if configured)
    //   • Promote draft charge schedules → active starting from Period 1 (startDate)
    //
    // paymentType = 'partially' (or any other):
    //   • Create direct invoice for partial rent (+ Security Deposit if configured)
    //   • Create remaining Rent billing schedule + promote draft charge schedules → active
    const paymentType = (lease as any).paymentType || 'fully';

    try {
      if (paymentType === 'fully') {
        // 1. Direct invoice — Base Rent (+ Security Deposit if configured)
        const invoices = await invoicesService.createFromLease(lease, activatedBy);
        logger.info(`Direct invoices created for lease ${lease.leaseNumber}: ${invoices.length} invoice(s) — ${invoices.map((i: any) => i.invoiceNumber).join(', ')}`);

        // 2. Promote draft charge schedules → active, set correct cycle + nextBillingDate = startDate
        await billingSchedulesService.updateChargeSchedulesFromLease(lease);
        logger.info(`Billing schedules activated for lease ${lease.leaseNumber} (fully paid, starting from period 1)`);
      } else {
        // Partial payment:
        // 1. Direct invoice for partial rent (+ security deposit if configured)
        const invoices = await invoicesService.createFromLease(lease, activatedBy);
        logger.info(`Direct invoice created for partially paid lease ${lease.leaseNumber}: ${invoices.length} invoice(s) — ${invoices.map((i: any) => i.invoiceNumber).join(', ')}`);

        // 2. Create Rent billing schedule for remaining lease balance distributed across remaining cycles
        await billingSchedulesService.createFromLease(lease);
        logger.info(`Billing schedules created for lease ${lease.leaseNumber} (paymentType=${paymentType})`);

        // 3. Promote draft leaseCharge schedules (created at lease-creation time) → active
        await billingSchedulesService.updateChargeSchedulesFromLease(lease);
        logger.info(`Charge schedules activated for lease ${lease.leaseNumber} (partial payment)`);
      }
    } catch (err: any) {
      // Don't fail activation if billing setup fails — log and continue
      logger.error(`Billing setup failed for lease ${lease.leaseNumber}: ${err.message}`);
    }

    logger.info(`Lease ${lease.leaseNumber} activated, unit → ${unitStatus}`);
    const result = await prisma.lease.findUniqueOrThrow({ where: { id } });
    webhookLeaseActivated(result);
    return result;
  }

  // ── Cancel ───────────────────────────────
  async cancel(id: string, companyId: string, reason?: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (!['draft', 'pending_approval'].includes(lease.status)) throw new AppError(400, 'INVALID_STATUS', 'Only draft or pending leases can be cancelled');

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'cancelled', terminationReason: reason ?? null } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: 'available' } }),
      clearShopIdentityOp([lease.unitId]),
    ]);
    await unitsService.invalidateStatsCache(lease.propertyId);
    return { leaseId: id, status: 'cancelled' };
  }

  private canAdjustPenalty(actor?: { roles?: string[]; permissions?: string[] }): boolean {
    const isAdmin = (actor?.roles || []).some((r) => ['admin', 'super_admin'].includes(r.toLowerCase().replace(/\s+/g, '_')));
    return isAdmin || (actor?.permissions || []).includes('leases.approve');
  }

  // ── Terminate preview (server-side penalty using the property's policy) ──
  async terminationPreview(id: string, companyId: string, terminationDate: string, actor?: { roles?: string[]; permissions?: string[] }) {
    const lease = await prisma.lease.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { unit: { include: { property: { select: { settings: true } } } } },
    });
    if (!lease) throw AppError.notFound('Lease');
    const policy = resolveTerminationPolicy((lease as any).unit?.property?.settings);
    const calc = computeTerminationPenalty(Number(lease.rentAmount), new Date(terminationDate), new Date(lease.endDate), policy);
    return { ...calc, policy, canAdjust: this.canAdjustPenalty(actor) };
  }

  // ── Terminate ────────────────────────────
  async terminate(
    id: string, companyId: string,
    dto: { terminationDate: string; reason: string; terminateSchedules?: boolean; waivePenalty?: boolean; penaltyOverride?: number; penaltyAdjustReason?: string },
    _terminatedBy: string,
    actor?: { roles?: string[]; permissions?: string[] },
  ) {
    const lease = await prisma.lease.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { unit: { include: { property: { select: { settings: true } } } } },
    });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Only active leases can be terminated');

    const termDate = new Date(dto.terminationDate);
    const endDate  = new Date(lease.endDate);
    const policy   = resolveTerminationPolicy((lease as any).unit?.property?.settings);
    const calc     = computeTerminationPenalty(Number(lease.rentAmount), termDate, endDate, policy);
    const isEarly  = calc.isEarly;

    let penalty = calc.penalty;
    let penaltyBreakdown = calc.breakdown;
    let reasonText = dto.reason;
    const wantsAdjust = isEarly && (dto.waivePenalty || dto.penaltyOverride !== undefined);
    if (wantsAdjust) {
      if (!this.canAdjustPenalty(actor)) throw AppError.forbidden('You do not have permission to waive or change the termination penalty');
      if (!dto.penaltyAdjustReason?.trim()) throw new AppError(400, 'REASON_REQUIRED', 'A reason is required to waive or change the penalty');
      const original = calc.penalty;
      if (dto.waivePenalty) { penalty = 0; penaltyBreakdown = `Waived (original ${original})`; }
      else { penalty = Math.round((dto.penaltyOverride as number) * 100) / 100; penaltyBreakdown = `Manual override (original ${original})`; }
      reasonText = `${dto.reason} | Penalty ${dto.waivePenalty ? 'waived' : `changed to ${penalty}`} (calculated ${original}): ${dto.penaltyAdjustReason.trim()}`;
    }

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'terminated', terminationDate: termDate, terminationReason: reasonText, terminationType: isEarly ? 'early' : 'normal', earlyTerminationPenalty: penalty } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: 'available' } }),
      clearShopIdentityOp([lease.unitId]),
      ...(dto.terminateSchedules
        ? [prisma.billingSchedule.updateMany({
            where: { leaseId: id, status: 'active', billingCycle: { not: 'monthly' } },
            data: { status: 'cancelled' },
          })]
        : []),
    ]);
    await unitsService.invalidateStatsCache(lease.propertyId);

    const result = { leaseId: id, status: 'terminated', terminationDate: dto.terminationDate, terminationType: isEarly ? 'early' : 'normal', earlyTerminationPenalty: penalty, penaltyBreakdown };
    webhookLeaseTerminated(result, companyId);
    return result;
  }


  // ── Create renewal ───────────────────────
  async createRenewal(id: string, companyId: string, dto: { startDate: string; endDate: string; rentAmount?: number; securityDeposit?: number; offerExpiresAt?: string }, createdBy: string) {
    const original = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!original) throw AppError.notFound('Lease');
    if (original.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Can only renew active leases');

    // If startDate is omitted, default to original lease end date + 1 day (natural renewal start)
    const start = dto.startDate ? new Date(dto.startDate) : new Date(original.endDate.getTime() + 86_400_000);
    const end   = new Date(dto.endDate);
    const leaseNumber = await sequenceService.next(companyId, 'lease', { propertyId: original.propertyId });

    const renewal = await prisma.lease.create({
      data: {
        companyId, propertyId: original.propertyId, unitId: original.unitId,
        tenantId: original.tenantId, parentLeaseId: id,
        leaseNumber, status: 'draft',
        startDate: start, endDate: end, leaseTermMonths: calcLeaseTermMonths(start, end),
        rentAmount: dto.rentAmount ?? original.rentAmount,
        securityDeposit: dto.securityDeposit ?? original.securityDeposit,
        currency: original.currency, billingCycle: original.billingCycle,
        billingDay: original.billingDay, paymentDueDays: original.paymentDueDays,
        escalationType: original.escalationType, escalationValue: original.escalationValue,
        renewalOfferedAt: new Date(),
        renewalOfferExpiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null,
        createdBy,
      },
    });

    await prisma.lease.update({ where: { id }, data: { renewalOfferedAt: new Date() } });
    webhookLeaseRenewed(renewal);
    return renewal;
  }

  async acceptRenewal(id: string, companyId: string) {
    const renewal = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!renewal) throw AppError.notFound('Lease');
    if (renewal.status !== 'draft' || !renewal.parentLeaseId) throw new AppError(400, 'INVALID_STATE', 'This lease is not a renewal offer');

    // Mark original lease as 'renewed'
    await prisma.lease.update({ where: { id: renewal.parentLeaseId }, data: { isRenewed: true, status: 'renewed' } });

    // Mark renewal as accepted (ready for approval/activation)
    const updated = await prisma.lease.update({
      where: { id },
      data: { renewalAcceptedAt: new Date() },
    });

    return updated;
  }

  async declineRenewal(id: string, companyId: string) {
    const renewal = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!renewal) throw AppError.notFound('Lease');
    if (renewal.status !== 'draft' || !renewal.parentLeaseId) throw new AppError(400, 'INVALID_STATE', 'This lease is not a renewal offer');

    // Cancel the renewal draft
    const updated = await prisma.lease.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Mark the parent lease so the audit trail reflects the offer was declined
    await prisma.lease.update({
      where: { id: renewal.parentLeaseId },
      data: { isRenewed: false },
    });

    return updated;
  }
}

export const leasesLifecycleService = new LeasesLifecycleService();
