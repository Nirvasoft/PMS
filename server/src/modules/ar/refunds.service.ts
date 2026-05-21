import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

export class RefundsService {
  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const refund = await prisma.refundRequest.create({
      data: {
        companyId,
        tenantId: dto.tenantId as string,
        receiptId: (dto.receiptId as string) || null,
        refundType: dto.refundType as string,
        amount: dto.amount as number,
        currency: dto.currency as string,
        reason: dto.reason as string,
        bankName: (dto.bankName as string) || null,
        bankAccountNo: (dto.bankAccountNo as string) || null,
        bankAccountName: (dto.bankAccountName as string) || null,
        status: 'pending',
        createdBy: userId,
      },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
      },
    });

    logger.info(`Created refund request ${refund.id} for ${dto.amount} ${dto.currency}`);
    return refund;
  }

  async findAll(companyId: string, filters: {
    tenantId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { tenantId, status, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.refundRequest.findMany({
        where,
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.refundRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async approve(id: string, companyId: string, userId: string) {
    const refund = await prisma.refundRequest.findFirst({ where: { id, companyId } });
    if (!refund) throw AppError.notFound('Refund request');
    if (refund.status !== 'pending') throw AppError.validation('Only pending refunds can be approved');

    const updated = await prisma.refundRequest.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
    });

    logger.info(`Approved refund ${id}`);
    return updated;
  }

  async reject(id: string, companyId: string, reason: string, userId: string) {
    const refund = await prisma.refundRequest.findFirst({ where: { id, companyId } });
    if (!refund) throw AppError.notFound('Refund request');
    if (refund.status !== 'pending') throw AppError.validation('Only pending refunds can be rejected');

    const updated = await prisma.refundRequest.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: reason, approvedBy: userId, approvedAt: new Date() },
    });

    logger.info(`Rejected refund ${id}: ${reason}`);
    return updated;
  }

  async markPaid(id: string, companyId: string, dto: { paymentReference: string; paidAt?: string }) {
    const refund = await prisma.refundRequest.findFirst({ where: { id, companyId } });
    if (!refund) throw AppError.notFound('Refund request');
    if (refund.status !== 'approved') throw AppError.validation('Only approved refunds can be marked as paid');

    const updated = await prisma.refundRequest.update({
      where: { id },
      data: {
        status: 'paid',
        paymentReference: dto.paymentReference,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      },
    });

    logger.info(`Marked refund ${id} as paid: ${dto.paymentReference}`);
    return updated;
  }
}

export const refundsService = new RefundsService();
