import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { escalationService } from './escalation.service';

export class AmendmentsService {
  async findAll(leaseId: string, companyId: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');
    return prisma.leaseAmendment.findMany({
      where: { leaseId },
      include: { approver: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { amendmentNumber: 'desc' },
    });
  }

  async create(leaseId: string, companyId: string, dto: Record<string, unknown>, createdBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Can only amend active leases');

    const lastAmendment = await prisma.leaseAmendment.findFirst({ where: { leaseId }, orderBy: { amendmentNumber: 'desc' } });
    const amendmentNumber = (lastAmendment?.amendmentNumber ?? 0) + 1;

    // Snapshot old values
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    if (dto.newRentAmount) { oldValues.rentAmount = lease.rentAmount; newValues.rentAmount = dto.newRentAmount; }
    if (dto.newEndDate)    { oldValues.endDate = lease.endDate;       newValues.endDate = dto.newEndDate; }

    return prisma.leaseAmendment.create({
      data: { leaseId, amendmentNumber, createdBy, oldValues, newValues, ...dto as any },
    });
  }

  async approve(leaseId: string, amendmentId: string, companyId: string, approvedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');

    const amendment = await prisma.leaseAmendment.findFirst({ where: { id: amendmentId, leaseId } });
    if (!amendment) throw AppError.notFound('Amendment');

    const updates: Record<string, unknown> = {};
    if (amendment.newRentAmount) updates.rentAmount = amendment.newRentAmount;
    if (amendment.newEndDate)    updates.endDate = amendment.newEndDate;

    await prisma.$transaction([
      prisma.leaseAmendment.update({ where: { id: amendmentId }, data: { status: 'approved', approvedBy, approvedAt: new Date() } }),
      ...(Object.keys(updates).length ? [prisma.lease.update({ where: { id: leaseId }, data: updates })] : []),
    ]);

    if (amendment.newRentAmount || amendment.newEndDate) {
      await escalationService.generateEscalationSchedule(leaseId);
    }

    return prisma.leaseAmendment.findUniqueOrThrow({ where: { id: amendmentId } });
  }
}

export const amendmentsService = new AmendmentsService();
