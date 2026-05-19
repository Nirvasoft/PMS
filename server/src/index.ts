import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './common/config';
import { logger } from './common/logger';
import { connectDatabase, disconnectDatabase } from './common/database';
import { disconnectRedis } from './common/redis';
import { authMiddleware, requestContextMiddleware, errorHandler } from './middleware';
import { initSocketIO } from './common/socket';
import { startSlaEscalationJob } from './common/slaEscalation';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter, rolesRouter, roleTemplatesRouter, permissionsRouter, departmentsRouter, positionsRouter } from './modules/users/users.routes';
import { invitationsRouter } from './modules/users/invitations.routes';
import { companyRouter, branchesRouter, regionsRouter, businessUnitsRouter } from './modules/organization/organization.routes';
import { propertiesRouter, facilityTypesRouter } from './modules/properties/properties.routes';
import { propertiesService, seedPropertyTypes } from './modules/properties/properties.service';
import { towersRouter, unitsRouter, unitTypesRouter } from './modules/units/units.routes';
import { seedUnitTypes } from './modules/units/units.service';
import { tenantsRouter, kycRequirementsRouter } from './modules/tenants/tenants.routes';
import { leasesRouter, leaseTemplatesRouter, leaseClausesRouter } from './modules/leases/leases.routes';
import { workflowDefinitionsRouter, workflowInstancesRouter, workflowTasksRouter } from './modules/workflow/workflow.routes';
import { notificationsRouter, templatesRouter } from './modules/notifications/notifications.routes';
import { documentsRouter, documentFoldersRouter } from './modules/documents/documents.routes';
import { startDocumentExpiryJob } from './modules/documents/documentExpiry';
import { dashboardRouter, reportsRouter } from './modules/dashboard/dashboard.routes';
import { dashboardService } from './modules/dashboard/dashboard.service';

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

  app.use(authMiddleware);

  // Health check
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  // Routes
  app.use('/api/v1/auth', authRouter);

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
  app.use('/api/v1/leases', leasesRouter);
  app.use('/api/v1/lease-templates', leaseTemplatesRouter);
  app.use('/api/v1/lease-clauses', leaseClausesRouter);

  // Module 1.4 — Workflow Engine
  app.use('/api/v1/workflow-definitions', workflowDefinitionsRouter);
  app.use('/api/v1/workflow-instances', workflowInstancesRouter);
  app.use('/api/v1/workflow-tasks', workflowTasksRouter);

  // Module 1.5 — Notification Center
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/notification-templates', templatesRouter);

  // Module 1.6 — Document Management
  app.use('/api/v1/documents', documentsRouter);
  app.use('/api/v1/document-folders', documentFoldersRouter);

  // Module 1.7 — Dashboard & Analytics
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/reports', reportsRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  // Connect database
  await connectDatabase();

  // Seed reference data
  await dashboardService.seedWidgetDefinitions();
  await seedPropertyTypes();
  await seedUnitTypes();

  // Start Socket.IO
  initSocketIO(httpServer, config.frontendUrl);

  // Start SLA escalation cron job
  startSlaEscalationJob();

  // Start document expiry cron job
  startDocumentExpiryJob();

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
