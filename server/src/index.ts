import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './common/config';
import { logger } from './common/logger';
import { prisma, connectDatabase, disconnectDatabase } from './common/database';
import { disconnectRedis } from './common/redis';
import { authMiddleware, requestContextMiddleware, errorHandler, tenantContextMiddleware } from './middleware';
import { initSocketIO } from './common/socket';
import { startSlaEscalationJob } from './common/slaEscalation';
import { authRouter } from './modules/auth/auth.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { usersRouter, rolesRouter, roleTemplatesRouter, permissionsRouter, departmentsRouter, positionsRouter } from './modules/users/users.routes';
import { invitationsRouter } from './modules/users/invitations.routes';
import { companyRouter, branchesRouter, regionsRouter, businessUnitsRouter } from './modules/organization/organization.routes';
import { propertiesRouter, facilityTypesRouter } from './modules/properties/properties.routes';
import { propertiesService, seedPropertyTypes } from './modules/properties/properties.service';
import { towersRouter, unitsRouter, unitTypesRouter } from './modules/units/units.routes';
import { seedUnitTypes } from './modules/units/units.service';
import { tenantsRouter, kycRequirementsRouter } from './modules/tenants/tenants.routes';
import { leasesRouter, leaseTemplatesRouter, leaseClausesRouter } from './modules/leases/leases.routes';
import { startEscalationJob } from './modules/leases/cron/escalation.job';
import { startRenewalJob } from './modules/leases/cron/renewal.job';
import { workflowDefinitionsRouter, workflowInstancesRouter, workflowTasksRouter } from './modules/workflow/workflow.routes';
import { notificationsRouter, templatesRouter } from './modules/notifications/notifications.routes';
import { documentsRouter, documentFoldersRouter } from './modules/documents/documents.routes';
import { startDocumentExpiryJob } from './modules/documents/documentExpiry';
import { dashboardRouter, reportsRouter } from './modules/dashboard/dashboard.routes';
import { startKycExpiryJob } from './modules/tenants/kycExpiry';
import { dashboardService } from './modules/dashboard/dashboard.service';
import { leadsRouter, campaignsRouter } from './modules/crm/crm.routes';
import {
  parkingZonesRouter, parkingSlotsRouter, parkingAllocationsRouter,
  tenantVehiclesRouter, visitorPassesRouter, parkingRfidRouter
} from './modules/parking/parking.routes';
import { requireFeature } from './common/featureFlags';
import {
  chargeTypesRouter, billingSchedulesRouter, invoicesRouter,
  billingRunRouter, penaltyConfigsRouter, taxConfigsRouter,
} from './modules/billing/billing.routes';
import { chargeTypesService } from './modules/billing/chargeTypes.service';
import { startDailyBillingJob } from './modules/billing/cron/dailyBilling.job';
import { startPenaltyCheckJob } from './modules/billing/cron/penaltyCheck.job';
import { startOverdueTransitionJob } from './modules/billing/cron/overdueTransition.job';
import {
  receiptsRouter, arReportsRouter, refundsRouter,
  tenantCreditsRouter, tenantStatementRouter,
} from './modules/ar/ar.routes';
import { glRouter } from './modules/gl/gl.routes';
import { budgetsRouter, assetsRouter } from './modules/assets/assets.routes';
import { bankingRouter } from './modules/banking/banking.routes';
import {
  maintenanceTicketsRouter, maintenanceWorkOrdersRouter,
  maintenanceTechniciansRouter, maintenanceCategoriesRouter,
  maintenanceStatsRouter, maintenanceSlaConfigsRouter, maintenanceSlaReportRouter,
} from './modules/maintenance/maintenance.routes';
import { categoriesService as maintenanceCategoriesService } from './modules/maintenance/categories.service';
import { startSlaMonitorJob } from './modules/maintenance/cron/slaMonitor.job';
import { startTicketLifecycleJobs } from './modules/maintenance/cron/ticketLifecycle.job';
import { pmSchedulesRouter, pmWorkOrdersRouter, pmUpcomingRouter } from './modules/preventive-maintenance/pm.routes';
import { startPmGeneratorJob } from './modules/preventive-maintenance/cron/pmGenerator.job';
import { facilityAssetsRouter, facilityCamRouter, facilityStatsRouter, facilityUtilityRouter } from './modules/facility/facility.routes';
import { startFacilityAlertJob } from './modules/facility/cron/facilityAlert.job';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { housekeepingRoutes } from './modules/housekeeping/housekeeping.routes';
import { startHousekeepingTaskCron } from './modules/housekeeping/cron/taskGenerator.job';
import { securityRoutes } from './modules/security/security.routes';
import { portalRouter } from './modules/portal/portal.routes';
import { visitorsRouter, portalVisitorsRouter } from './modules/visitors/visitors.routes';
import { facilitiesRouter, bookingRulesRouter, portalBookingsRouter } from './modules/facility-booking/booking.routes';
import { portalCommunityRouter, adminCommunityRouter } from './modules/community/community.routes';
import { mallRouter } from './modules/mall/mall.routes';
import { condoRouter } from './modules/condo/condo.routes';
import { integrationsRouter, developerRouter } from './modules/integrations/integrations.routes';

async function bootstrap() {
  const app = express();
  const httpServer = http.createServer(app);

  // Global middleware
  app.use(helmet());
  app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Property-Id'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(requestContextMiddleware);

  // Serve static files BEFORE auth middleware (public access)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  app.use('/seed-photos', express.static(path.join(process.cwd(), 'public/seed-photos')));
  app.use('/storage', express.static(path.join(process.cwd(), 'storage')));

  app.use(authMiddleware);
  app.use(tenantContextMiddleware);

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  // Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);

  // Module 1.2 — User & Role Management
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/roles', rolesRouter);
  app.use('/api/v1/role-templates', roleTemplatesRouter);
  app.use('/api/v1/permissions', permissionsRouter);
  app.use('/api/v1/departments', departmentsRouter);
  app.use('/api/v1/positions', positionsRouter);
  app.use('/api/v1/invitations', invitationsRouter);

  // Module 1.3 — Organization Management
  app.use('/api/v1/company', companyRouter);
  app.use('/api/v1/branches', branchesRouter);
  app.use('/api/v1/regions', regionsRouter);
  app.use('/api/v1/business-units', businessUnitsRouter);

  // Module 2.1 — Property Management (Phase 2)
  app.use('/api/v1/properties', propertiesRouter);
  app.use('/api/v1/facility-types', facilityTypesRouter);

  // Module 2.2 — Tower, Block & Unit Management (Phase 2)
  app.use('/api/v1/properties/:propertyId/towers', towersRouter);
  app.use('/api/v1/properties/:propertyId/units',  unitsRouter);
  app.use('/api/v1/unit-types', unitTypesRouter);

  // Module 2.3 — Tenant Management (Phase 2)
  app.use('/api/v1/tenants', tenantsRouter);
  app.use('/api/v1/kyc-requirements', kycRequirementsRouter);

  // Module 2.4 — Lease Management (Phase 2)
  app.use('/api/v1/leases', requireFeature('leasingEnabled'), leasesRouter);
  app.use('/api/v1/lease-templates', requireFeature('leasingEnabled'), leaseTemplatesRouter);
  app.use('/api/v1/lease-clauses', requireFeature('leasingEnabled'), leaseClausesRouter);

  // Module 1.4 — Workflow Engine
  app.use('/api/v1/workflow-definitions', requireFeature('workflowEnabled'), workflowDefinitionsRouter);
  app.use('/api/v1/workflow-instances', requireFeature('workflowEnabled'), workflowInstancesRouter);
  app.use('/api/v1/workflow-tasks', requireFeature('workflowEnabled'), workflowTasksRouter);

  // Module 1.5 — Notification Center
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/notification-templates', templatesRouter);

  // Module 1.6 — Document Management
  app.use('/api/v1/documents', requireFeature('documentVaultEnabled'), documentsRouter);
  app.use('/api/v1/document-folders', requireFeature('documentVaultEnabled'), documentFoldersRouter);

  // Module 1.7 — Dashboard & Analytics
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/reports', reportsRouter);

  // Module 2.5 — CRM & Leasing
  app.use('/api/v1/leads', requireFeature('crmEnabled'), leadsRouter);
  app.use('/api/v1/marketing-campaigns', requireFeature('crmEnabled'), campaignsRouter);

  // Module 2.6 — Parking Management
  app.use('/api/v1/properties/:propertyId/parking/zones', requireFeature('parkingEnabled'), parkingZonesRouter);
  app.use('/api/v1/properties/:propertyId/parking/slots', requireFeature('parkingEnabled'), parkingSlotsRouter);
  app.use('/api/v1/parking/allocations', requireFeature('parkingEnabled'), parkingAllocationsRouter);
  app.use('/api/v1/tenants/:tenantId/vehicles', requireFeature('parkingEnabled'), tenantVehiclesRouter);
  app.use('/api/v1/parking/visitor-passes', requireFeature('parkingEnabled'), visitorPassesRouter);
  app.use('/api/v1/properties/:propertyId/parking/rfid/events', requireFeature('parkingEnabled'), parkingRfidRouter);

  // Module 3.1 — Billing Engine
  app.use('/api/v1/billing/charge-types', chargeTypesRouter);
  app.use('/api/v1/billing/schedules', billingSchedulesRouter);
  app.use('/api/v1/invoices', invoicesRouter);
  app.use('/api/v1/billing/run', billingRunRouter);
  app.use('/api/v1/billing/penalty-configs', penaltyConfigsRouter);
  app.use('/api/v1/billing/tax-configs', taxConfigsRouter);

  // Module 3.2 — Accounts Receivable
  app.use('/api/v1/receipts', receiptsRouter);
  app.use('/api/v1/ar', arReportsRouter);
  app.use('/api/v1/refunds', refundsRouter);
  app.use('/api/v1/tenants', tenantCreditsRouter);
  app.use('/api/v1/tenants', tenantStatementRouter);

  // Module 3.4 — General Ledger
  app.use('/api/v1/gl', glRouter);

  // Module 3.5 — Budgets & Assets
  app.use('/api/v1/budgets', budgetsRouter);
  app.use('/api/v1/assets', assetsRouter);

  // Module 3.6 — Banking & Reconciliation
  app.use('/api/v1/banking', bankingRouter);

  // Module 4.1 — Maintenance Management
  app.use('/api/v1/maintenance/tickets', requireFeature('maintenanceEnabled'), maintenanceTicketsRouter);
  app.use('/api/v1/maintenance/work-orders', requireFeature('maintenanceEnabled'), maintenanceWorkOrdersRouter);
  app.use('/api/v1/maintenance/technicians', requireFeature('maintenanceEnabled'), maintenanceTechniciansRouter);
  app.use('/api/v1/maintenance/categories', requireFeature('maintenanceEnabled'), maintenanceCategoriesRouter);
  app.use('/api/v1/maintenance/stats', requireFeature('maintenanceEnabled'), maintenanceStatsRouter);
  app.use('/api/v1/maintenance/sla-configs', requireFeature('maintenanceEnabled'), maintenanceSlaConfigsRouter);
  app.use('/api/v1/maintenance/sla-report', requireFeature('maintenanceEnabled'), maintenanceSlaReportRouter);

  // Module 4.2 — Preventive Maintenance
  app.use('/api/v1/pm/schedules', requireFeature('maintenanceEnabled'), pmSchedulesRouter);
  app.use('/api/v1/pm/work-orders', requireFeature('maintenanceEnabled'), pmWorkOrdersRouter);
  app.use('/api/v1/pm/upcoming', requireFeature('maintenanceEnabled'), pmUpcomingRouter);

  // Module 4.3 — Facility Management
  app.use('/api/v1/facility/assets', requireFeature('maintenanceEnabled'), facilityAssetsRouter);
  app.use('/api/v1/facility/cam-costs', requireFeature('maintenanceEnabled'), facilityCamRouter);
  app.use('/api/v1/facility/stats', requireFeature('maintenanceEnabled'), facilityStatsRouter);
  app.use('/api/v1/facility/utility-systems', requireFeature('maintenanceEnabled'), facilityUtilityRouter);

  // Module 4.4 — Inventory & Store Management
  const inv = inventoryRoutes(prisma);
  app.use('/api/v1/inventory/stores', requireFeature('maintenanceEnabled'), inv.storesRouter);
  app.use('/api/v1/inventory/items', requireFeature('maintenanceEnabled'), inv.itemsRouter);
  app.use('/api/v1/inventory/stock-levels', requireFeature('maintenanceEnabled'), inv.stockRouter);
  app.use('/api/v1/inventory/movements', requireFeature('maintenanceEnabled'), inv.movementsRouter);
  app.use('/api/v1/inventory/stats', requireFeature('maintenanceEnabled'), inv.statsRouter);
  app.use('/api/v1/inventory/purchase-requisitions', requireFeature('maintenanceEnabled'), inv.prRouter);

  // Module 4.5 — Housekeeping Management
  const hk = housekeepingRoutes(prisma);
  app.use('/api/v1/housekeeping/zones', requireFeature('maintenanceEnabled'), hk.zonesRouter);
  app.use('/api/v1/housekeeping/schedules', requireFeature('maintenanceEnabled'), hk.schedulesRouter);
  app.use('/api/v1/housekeeping/tasks', requireFeature('maintenanceEnabled'), hk.tasksRouter);
  app.use('/api/v1/housekeeping/inspections', requireFeature('maintenanceEnabled'), hk.inspectionsRouter);
  app.use('/api/v1/housekeeping/stats', requireFeature('maintenanceEnabled'), hk.statsRouter);

  // Module 4.6 — Security Management
  const sec = securityRoutes(prisma);
  app.use('/api/v1/security/incidents', requireFeature('maintenanceEnabled'), sec.incidentsRouter);
  app.use('/api/v1/security/patrol/checkpoints', requireFeature('maintenanceEnabled'), sec.checkpointsRouter);
  app.use('/api/v1/security/patrol/schedules', requireFeature('maintenanceEnabled'), sec.patrolSchedulesRouter);
  app.use('/api/v1/security/patrol/logs', requireFeature('maintenanceEnabled'), sec.patrolLogsRouter);
  app.use('/api/v1/security/patrol/scan', requireFeature('maintenanceEnabled'), sec.scanRouter);
  app.use('/api/v1/security/stats', requireFeature('maintenanceEnabled'), sec.statsRouter);
  app.use('/api/v1/security/access-events', requireFeature('maintenanceEnabled'), sec.accessEventsRouter);

  // Module 5.1 — Tenant & Resident Portal
  app.use('/api/v1/portal', portalRouter);

  // Module 5.2 — Visitor Management
  app.use('/api/v1/visitors', visitorsRouter);
  app.use('/api/v1/portal/visitors', portalVisitorsRouter);

  // Module 5.3 — Facility Booking
  app.use('/api/v1/facilities', facilitiesRouter);
  app.use('/api/v1/facility-booking-rules', bookingRulesRouter);
  app.use('/api/v1/portal/bookings', portalBookingsRouter);

  // Module 5.4 — Community Management
  app.use('/api/v1/portal/community', portalCommunityRouter);
  app.use('/api/v1/admin/community', adminCommunityRouter);

  // Module 6.1 — Shopping Mall
  app.use('/api/v1/mall', requireFeature('mallModuleEnabled'), mallRouter);
  app.use('/api/v1/condo', requireFeature('condoModuleEnabled'), condoRouter);

  // Module 6.3 — Enterprise Integrations
  app.use('/api/v1/integrations', integrationsRouter);
  app.use('/api/v1/developer', developerRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  // Connect database
  await connectDatabase();

  // Seed reference data
  await dashboardService.seedWidgetDefinitions();
  await seedPropertyTypes();
  await seedUnitTypes();
  await chargeTypesService.seedDefaults();
  try { await maintenanceCategoriesService.seedDefaults(); } catch (e) { logger.warn('Maintenance tables not ready — skipping seed'); }
  const { seedBillingNotificationTemplates } = await import('./modules/billing/billingNotifications.service');
  await seedBillingNotificationTemplates();

  // Start Socket.IO
  initSocketIO(httpServer, config.frontendUrl);

  // Start SLA escalation cron job
  startSlaEscalationJob();

  // Start document expiry cron job
  startDocumentExpiryJob();
  startKycExpiryJob();

  // Start lease cron jobs
  startEscalationJob();
  startRenewalJob();

  // Start billing cron jobs
  startDailyBillingJob();
  startPenaltyCheckJob();
  startOverdueTransitionJob();

  // Start maintenance cron jobs
  try { startSlaMonitorJob(); } catch (e) { logger.warn('Maintenance SLA monitor skipped — tables not ready'); }
  try { startTicketLifecycleJobs(); } catch (e) { logger.warn('Ticket lifecycle crons skipped — tables not ready'); }
  try { startPmGeneratorJob(); } catch (e) { logger.warn('PM generator cron skipped — tables not ready'); }
  try { startFacilityAlertJob(); } catch (e) { logger.warn('Facility alert cron skipped — tables not ready'); }
  try { startHousekeepingTaskCron(); } catch (e) { logger.warn('Housekeeping task cron skipped — tables not ready'); }

  // Start server
  httpServer.listen(config.port, () => {
    logger.info(`🚀 PMS API running on http://localhost:${config.port}`);
    logger.info(`   Environment: ${config.env}`);
    logger.info(`   Frontend URL: ${config.frontendUrl}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
