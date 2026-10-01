import { randomBytes } from 'crypto';
import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { pdfService } from './pdf.service';

export class EsignService {
  async send(leaseId: string, companyId: string, dto: { recipients: { recipientType: string; name: string; email: string }[]; emailSubject?: string }) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');

    // 1. Generate PDF document for the lease
    const documentUrl = await pdfService.generateLeasePdf(leaseId, companyId);

    // 2. Prepare envelope stub with a cryptographically secure ID
    const envelopeId = `env-${randomBytes(16).toString('hex')}`;

    await prisma.$transaction([
      prisma.esignRecipient.deleteMany({ where: { leaseId } }),
      prisma.esignRecipient.createMany({
        data: dto.recipients.map((r) => ({ leaseId, envelopeId, documentUrl, ...r, status: 'sent' })),
      }),
      prisma.lease.update({ where: { id: leaseId }, data: { esignStatus: 'sent', esignEnvelopeId: envelopeId } }),
    ]);

    return { envelopeId, status: 'sent', message: 'Signing requests sent (stub — integrate DocuSign/HelloSign for production)' };
  }

  async getStatus(leaseId: string, companyId: string) {
    // Merged into a single query with include to avoid N+1 (was 2 separate queries)
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, companyId },
      select: {
        esignStatus: true,
        esignEnvelopeId: true,
        esignCompletedAt: true,
        esignRecipients: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!lease) throw AppError.notFound('Lease');
    return {
      status: lease.esignStatus,
      envelopeId: lease.esignEnvelopeId,
      completedAt: lease.esignCompletedAt,
      recipients: lease.esignRecipients,
    };
  }

  async webhook(payload: Record<string, unknown>) {
    // DocuSign/HelloSign webhook stub — mark envelope complete
    const envelopeId = payload.envelopeId as string;
    if (!envelopeId) return;

    await prisma.$transaction([
      prisma.esignRecipient.updateMany({ where: { envelopeId }, data: { status: 'signed', signedAt: new Date() } }),
      prisma.lease.updateMany({ where: { esignEnvelopeId: envelopeId }, data: { esignStatus: 'completed', esignCompletedAt: new Date() } }),
    ]);

    logger.info(`E-sign envelope ${envelopeId} marked completed via webhook`);
  }
}

export const esignService = new EsignService();
