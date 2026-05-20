import { prisma } from '../../../common/database';

export class EscalationService {
  async generateEscalationSchedule(leaseId: string): Promise<void> {
    const lease = await prisma.lease.findUniqueOrThrow({ where: { id: leaseId } });
    if (!lease.escalationType) return;

    await prisma.leaseEscalationSchedule.deleteMany({ where: { leaseId } });

    const entries: { leaseId: string; effectiveDate: Date; newRent: number }[] = [];
    let currentRent = Number(lease.rentAmount);
    const freqMonths = lease.escalationFrequency === 'biennial' ? 24 : 12;
    const startDate = new Date(lease.startDate);

    // First escalation date
    let effDate = new Date(startDate);
    effDate.setMonth(effDate.getMonth() + freqMonths);
    if (lease.escalationMonth) effDate.setMonth(lease.escalationMonth - 1);
    if (lease.escalationDay)   effDate.setDate(lease.escalationDay);

    const endDate = new Date(lease.endDate);
    while (effDate <= endDate) {
      let newRent = currentRent;
      if (lease.escalationType === 'fixed_percent' && lease.escalationValue) {
        newRent = Math.round(currentRent * (1 + Number(lease.escalationValue) / 100) * 100) / 100;
      } else if (lease.escalationType === 'fixed_amount' && lease.escalationValue) {
        newRent = Math.round((currentRent + Number(lease.escalationValue)) * 100) / 100;
      }
      entries.push({ leaseId, effectiveDate: new Date(effDate), newRent });
      currentRent = newRent;
      effDate = new Date(effDate);
      effDate.setMonth(effDate.getMonth() + freqMonths);
    }

    if (entries.length > 0) {
      await prisma.leaseEscalationSchedule.createMany({ data: entries, skipDuplicates: true });
    }
  }
}

export const escalationService = new EscalationService();
