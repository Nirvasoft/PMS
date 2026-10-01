import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';

const MAX_ESCALATIONS = 100;

export class EscalationService {
  async generateEscalationSchedule(leaseId: string): Promise<void> {
    const lease = await prisma.lease.findUniqueOrThrow({ where: { id: leaseId } });
    if (!lease.escalationType) return;

    // CPI and stepped escalation are not yet implemented — skip gracefully
    if (!['fixed_percent', 'fixed_amount'].includes(lease.escalationType)) {
      logger.warn(`Escalation type '${lease.escalationType}' not yet implemented for lease ${leaseId} — skipping schedule generation`);
      return;
    }

    await prisma.leaseEscalationSchedule.deleteMany({ where: { leaseId } });

    const entries: { leaseId: string; effectiveDate: Date; newRent: number }[] = [];
    let currentRent = Number(lease.rentAmount);
    const freqMonths = lease.escalationFrequency === 'biennial' ? 24 : 12;
    const startDate = new Date(lease.startDate);
    const endDate = new Date(lease.endDate);

    // Compute first escalation date correctly:
    // Add freqMonths to startDate first, then apply escalationMonth/Day override
    // while keeping the year from the advanced date so we never go backwards.
    let effDate = new Date(startDate);
    effDate.setMonth(effDate.getMonth() + freqMonths);

    if (lease.escalationMonth) {
      // Override month but preserve the already-advanced year to avoid going backwards
      const advancedYear = effDate.getFullYear();
      effDate = new Date(Date.UTC(
        advancedYear,
        lease.escalationMonth - 1,
        lease.escalationDay ?? 1,
      ));
      // If override caused the date to move before startDate, push to next cycle year
      if (effDate <= startDate) {
        effDate = new Date(Date.UTC(
          advancedYear + (freqMonths >= 12 ? 1 : 0),
          lease.escalationMonth - 1,
          lease.escalationDay ?? 1,
        ));
      }
    } else if (lease.escalationDay) {
      effDate.setDate(lease.escalationDay);
    }

    let iterations = 0;
    while (effDate <= endDate && iterations < MAX_ESCALATIONS) {
      iterations++;

      let newRent = currentRent;
      if (lease.escalationType === 'fixed_percent' && lease.escalationValue) {
        newRent = Math.round(currentRent * (1 + Number(lease.escalationValue) / 100) * 100) / 100;
      } else if (lease.escalationType === 'fixed_amount' && lease.escalationValue) {
        newRent = Math.round((currentRent + Number(lease.escalationValue)) * 100) / 100;
      }

      entries.push({ leaseId, effectiveDate: new Date(effDate), newRent });
      currentRent = newRent;

      // Advance to next period (mutate in-place — no pointless copy needed)
      effDate.setMonth(effDate.getMonth() + freqMonths);
    }

    if (entries.length > 0) {
      await prisma.leaseEscalationSchedule.createMany({ data: entries, skipDuplicates: true });
    }
  }
}

export const escalationService = new EscalationService();
