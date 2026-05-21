import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { calcLeaseTermMonths, nextLeaseNumber, calcEarlyTermPenalty } from './helpers';
import { escalationService } from './escalation.service';
import { workflowEngine } from '../../workflow/services/engine.service';
import { billingSchedulesService } from '../../billing/billingSchedules.service';

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
      include: { unit: { include: { property: true } } },
    });
    if (!lease) throw AppError.notFound('Lease');
    if (!['approved', 'pending_approval'].includes(lease.status)) throw new AppError(400, 'INVALID_STATUS', 'Only approved leases can be activated');

    const handoverDate = lease.handoverDate ? new Date(lease.handoverDate) : new Date(lease.startDate);
    const unitStatus   = handoverDate <= new Date() ? 'occupied' : 'reserved';

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'active', activatedAt: new Date(), approvedBy: activatedBy, approvedAt: new Date() } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: unitStatus } }),
    ]);

    await escalationService.generateEscalationSchedule(id);

    // Create billing schedules (RENT + SERVICE_CHARGE) for the activated lease
    try {
      await billingSchedulesService.createFromLease(lease);
      logger.info(`Billing schedules created for lease ${lease.leaseNumber}`);
    } catch (err: any) {
      // Don't fail activation if billing schedule creation fails — log and continue
      logger.error(`Failed to create billing schedules for lease ${lease.leaseNumber}: ${err.message}`);
    }

    logger.info(`Lease ${lease.leaseNumber} activated, unit → ${unitStatus}`);
    return prisma.lease.findUniqueOrThrow({ where: { id } });
  }

  // ── Cancel ───────────────────────────────
  async cancel(id: string, companyId: string, reason?: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (!['draft', 'pending_approval'].includes(lease.status)) throw new AppError(400, 'INVALID_STATUS', 'Only draft or pending leases can be cancelled');

    await prisma.lease.update({ where: { id }, data: { status: 'cancelled', terminationReason: reason ?? null } });
    return { leaseId: id, status: 'cancelled' };
  }

  // ── Terminate ────────────────────────────
  async terminate(id: string, companyId: string, dto: { terminationDate: string; reason: string }, terminatedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Only active leases can be terminated');

    const termDate = new Date(dto.terminationDate);
    const endDate  = new Date(lease.endDate);
    const isEarly  = termDate < endDate;

    let penalty = 0;
    let penaltyBreakdown = '';
    if (isEarly) {
      const remainingMonths = Math.max(0, calcLeaseTermMonths(termDate, endDate));
      penalty = calcEarlyTermPenalty(Number(lease.rentAmount), remainingMonths);
      penaltyBreakdown = `Min(3 months rent, ${remainingMonths} remaining months × 50%)`;
    }

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'terminated', terminationDate: termDate, terminationReason: dto.reason, terminationType: isEarly ? 'early' : 'normal', earlyTerminationPenalty: penalty } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: 'available' } }),
    ]);

    return { leaseId: id, status: 'terminated', terminationDate: dto.terminationDate, terminationType: isEarly ? 'early' : 'normal', earlyTerminationPenalty: penalty, penaltyBreakdown };
  }

  // ── Create renewal ───────────────────────
  async createRenewal(id: string, companyId: string, dto: { startDate: string; endDate: string; rentAmount?: number; offerExpiresAt?: string }, createdBy: string) {
    const original = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!original) throw AppError.notFound('Lease');
    if (original.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Can only renew active leases');

    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);

    const renewal = await prisma.lease.create({
      data: {
        companyId, propertyId: original.propertyId, unitId: original.unitId,
        tenantId: original.tenantId, parentLeaseId: id,
        leaseNumber: nextLeaseNumber(), status: 'draft',
        startDate: start, endDate: end, leaseTermMonths: calcLeaseTermMonths(start, end),
        rentAmount: dto.rentAmount ?? original.rentAmount,
        currency: original.currency, billingCycle: original.billingCycle,
        billingDay: original.billingDay, paymentDueDays: original.paymentDueDays,
        escalationType: original.escalationType, escalationValue: original.escalationValue,
        renewalOfferedAt: new Date(),
        renewalOfferExpiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null,
        createdBy,
      },
    });

    await prisma.lease.update({ where: { id }, data: { renewalOfferedAt: new Date() } });
    return renewal;
  }
}

export const leasesLifecycleService = new LeasesLifecycleService();
