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

    // 2. Prepare envelope stub
    const envelopeId = `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await prisma.$transaction([
      prisma.esignRecipient.deleteMany({ where: { leaseId } }),
      prisma.esignRecipient.createMany({
        data: dto.recipients.map((r) => ({ leaseId, envelopeId, ...r, status: 'sent' })),
      }),
      prisma.lease.update({ where: { id: leaseId }, data: { esignStatus: 'sent', esignEnvelopeId: envelopeId } }),
    ]);

    return { envelopeId, status: 'sent', message: 'Signing requests sent (stub — integrate DocuSign/HelloSign for production)' };
  }

  async getStatus(leaseId: string, companyId: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId }, select: { esignStatus: true, esignEnvelopeId: true, esignCompletedAt: true } });
    if (!lease) throw AppError.notFound('Lease');
    const recipients = await prisma.esignRecipient.findMany({ where: { leaseId } });
    return { status: lease.esignStatus, envelopeId: lease.esignEnvelopeId, completedAt: lease.esignCompletedAt, recipients };
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
