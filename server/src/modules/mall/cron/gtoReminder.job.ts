import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';

/**
 * GTO Reminder — Runs on the 15th of every month at 9:00 AM.
 *
 * For each company with active commercial leases requiring turnover reporting:
 *  1. Find leases where GTO has NOT been submitted for the current month
 *  2. Create in-app notification reminders for each tenant
 */
export function startGtoReminderJob() {
  cron.schedule('0 9 15 * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalReminders = 0;
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          // Find commercial leases requiring turnover reporting
          const leases = await prisma.commercialLease.findMany({
            where: {
              companyId: company.id,
              turnoverReportingRequired: true,
              lease: { status: 'active' },
            },
            include: {
              lease: {
                select: {
                  id: true, leaseNumber: true, tenantId: true, propertyId: true,
                  tenant: { select: { companyName: true, firstName: true, lastName: true } },
                  unit: { select: { unitNumber: true } },
                },
              },
            },
          });

          for (const cl of leases) {
            // Check if GTO already submitted for this month
            const existing = await prisma.gtoSubmission.findFirst({
              where: {
                leaseId: cl.leaseId,
                submissionMonth: currentMonth,
                submissionYear: currentYear,
              },
            });

            if (!existing) {
              const tenantName = cl.lease.tenant?.companyName ||
                `${cl.lease.tenant?.firstName || ''} ${cl.lease.tenant?.lastName || ''}`.trim();
              const unit = cl.lease.unit?.unitNumber || 'Unknown';

              // Create in-app notification for all admin users
              const admins = await prisma.user.findMany({
                where: { companyId: company.id, isActive: true, userRoles: { some: { role: { name: { in: ['Super Admin', 'Admin', 'Agent'] } } } } },
                select: { id: true },
              });

              for (const admin of admins) {
                await prisma.inAppNotification.create({
                  data: {
                    companyId: company.id,
                    userId: admin.id,
                    title: `GTO Reminder: ${tenantName}`,
                    body: `Monthly GTO submission pending for ${tenantName} (Unit ${unit}, Lease ${cl.lease.leaseNumber || ''}). Due by day ${cl.gtoReportingDay}.`,
                    icon: 'bar-chart-2',
                    actionType: 'navigate',
                    actionUrl: '/admin/mall/gto',
                    entityType: 'gto',
                    entityId: cl.leaseId,
                  },
                });
              }

              totalReminders++;
            }
          }
        } catch (err: any) {
          logger.error(`GTO reminder error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalReminders > 0) {
        logger.info(`GTO reminder: ${totalReminders} pending submissions flagged`);
      }
    } catch (err) {
      logger.error('GTO reminder job error:', err);
    }
  });

  logger.info('GTO reminder cron started (15th of each month at 9:00 AM)');
}
