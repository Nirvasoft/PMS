import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Daily cron (7:00 AM): Check for warranty and service contract expiry alerts.
 * Alert thresholds: 90 days (info), 30 days (warning), 7 days (urgent)
 * Notifies property manager + responsible person.
 */
export function startFacilityAlertJob() {
  cron.schedule('0 7 * * *', async () => {
    try {
      const today = new Date();
      const thresholds = [
        { days: 7, level: 'urgent' },
        { days: 30, level: 'warning' },
        { days: 90, level: 'info' },
      ];

      for (const { days, level } of thresholds) {
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() + days);
        const prevCutoff = new Date(today);
        prevCutoff.setDate(prevCutoff.getDate() + days - 1);

        // Warranty expiring at exactly N days from now (to avoid duplicate alerts)
        const warrantyAssets = await prisma.facilityAsset.findMany({
          where: {
            warrantyExpiry: { gte: prevCutoff, lte: cutoff },
            status: { not: 'decommissioned' },
          },
          select: {
            id: true, assetNumber: true, name: true, companyId: true,
            warrantyExpiry: true,
            responsiblePersonId: true,
            property: { select: { name: true } },
          },
        });

        // Service contract expiring at exactly N days
        const contractAssets = await prisma.facilityAsset.findMany({
          where: {
            serviceContractExpiry: { gte: prevCutoff, lte: cutoff },
            status: { not: 'decommissioned' },
          },
          select: {
            id: true, assetNumber: true, name: true, companyId: true,
            serviceContractExpiry: true,
            responsiblePersonId: true,
            property: { select: { name: true } },
          },
        });

        const allAlerts = [
          ...warrantyAssets.map(a => ({ ...a, alertType: 'warranty' as const })),
          ...contractAssets.map(a => ({ ...a, alertType: 'service_contract' as const })),
        ];

        if (allAlerts.length > 0) {
          logger.info(`[Facility Alert] ${allAlerts.length} asset(s) with ${level} expiry alert (${days} days)`);

          // Send notifications grouped by company
          const byCompany = new Map<string, typeof allAlerts>();
          for (const alert of allAlerts) {
            if (!byCompany.has(alert.companyId)) byCompany.set(alert.companyId, []);
            byCompany.get(alert.companyId)!.push(alert);
          }

          for (const [companyId, alerts] of byCompany) {
            try {
              // Find recipients: admins + responsible persons
              const recipientIds = new Set<string>();
              const admins = await prisma.user.findMany({
                where: { companyId, isActive: true, userRoles: { some: { role: { name: { in: ['Admin', 'Super Admin', 'Property Manager'] } } } } },
                select: { id: true },
              });
              admins.forEach(a => recipientIds.add(a.id));
              alerts.forEach(a => { if (a.responsiblePersonId) recipientIds.add(a.responsiblePersonId); });

              if (recipientIds.size === 0) continue;

              const { notificationService } = await import('../../notifications/services/notification.service');
              const assetNames = alerts.slice(0, 3).map(a => `${a.name} (${a.assetNumber})`).join(', ');
              const alertTypes = [...new Set(alerts.map(a => a.alertType))].join('/');

              await notificationService.send({
                templateCode: 'facility_expiry_alert',
                companyId,
                recipientIds: Array.from(recipientIds),
                channels: level === 'urgent' ? ['in_app', 'email', 'push'] : ['in_app'],
                variables: {
                  level,
                  days,
                  count: alerts.length,
                  alertType: alertTypes,
                  assetNames,
                },
                entityType: 'maintenance_ticket',
                entityId: alerts[0]?.id || '',
              }).catch((err: any) => logger.warn(`Facility expiry notification failed: ${err.message}`));
            } catch (err: any) {
              logger.warn(`[Facility Alert] Notification error: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[Facility Alert] Cron error: ${err}`);
    }
  });

  logger.info('🏢 Facility alert cron started (daily at 7:00 AM)');
}
