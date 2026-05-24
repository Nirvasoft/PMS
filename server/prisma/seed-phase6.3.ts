import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  console.log('\n🔌 Seeding Module 6.3 — Enterprise Integrations...\n');

  const admin = await prisma.user.findFirst({ where: { email: 'admin@acmeproperty.com', companyId: COMPANY_ID } });
  if (!admin) { console.log('  ⚠️ Admin not found, skipping...'); return; }

  // ── Integration Configs ──
  const integrations = [
    {
      integrationType: 'xero', name: 'Xero — Acme Holdings',
      description: 'Primary accounting integration for AP/AR sync',
      config: { tenantId: 'xero-tenant-001', defaultAccountMappings: { '1100': '200', '4100': '400' } },
      credentials: { clientId: 'xero-client-demo', clientSecret: '***encrypted***' },
      status: 'active', syncFrequency: 'daily', lastSyncAt: new Date(Date.now() - 86400000),
    },
    {
      integrationType: 'quickbooks', name: 'QuickBooks — Acme Finance',
      description: 'Secondary accounting for US operations',
      config: { companyId: 'qb-company-001' },
      credentials: { accessToken: '***encrypted***', refreshToken: '***encrypted***' },
      status: 'configured', syncFrequency: 'hourly',
    },
    {
      integrationType: 'sap', name: 'SAP S/4HANA — Group ERP',
      description: 'Enterprise resource planning integration',
      config: { hostname: 'sap.acme.internal', client: '100', mandant: 'ACME' },
      credentials: { username: '***encrypted***', password: '***encrypted***' },
      status: 'active', syncFrequency: 'daily', lastSyncAt: new Date(Date.now() - 172800000),
    },
    {
      integrationType: 'docusign', name: 'DocuSign — Lease Signing',
      description: 'E-signature for lease agreements',
      config: { accountId: 'ds-account-001' },
      credentials: { integrationKey: '***encrypted***', secretKey: '***encrypted***' },
      status: 'active', syncFrequency: 'realtime',
    },
    {
      integrationType: 'stripe', name: 'Stripe — Online Payments',
      description: 'Payment processing for tenant portal',
      config: { webhookEndpoint: '/webhooks/stripe' },
      credentials: { secretKey: '***encrypted***', publishableKey: 'pk_test_demo' },
      status: 'error', syncFrequency: 'realtime',
      lastError: 'API key expired. Please update credentials.',
    },
  ];

  const createdIntgs: any[] = [];
  for (const intg of integrations) {
    const created = await prisma.integrationConfig.upsert({
      where: { companyId_integrationType: { companyId: COMPANY_ID, integrationType: intg.integrationType } },
      update: {},
      create: { companyId: COMPANY_ID, createdBy: admin.id, ...intg },
    });
    createdIntgs.push(created);
    console.log(`  ✅ Integration: ${created.name} [${created.status}]`);
  }

  // ── Sync Logs ──
  const syncTypes = ['gl_journal', 'ap_invoice', 'vendor', 'full_sync'];
  const statuses = ['success', 'success', 'success', 'partial', 'failed'];
  for (const intg of createdIntgs.filter(i => i.lastSyncAt)) {
    for (let i = 0; i < 8; i++) {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const processed = Math.floor(Math.random() * 100) + 5;
      const failed = status === 'failed' ? processed : status === 'partial' ? Math.floor(Math.random() * 5) + 1 : 0;
      await prisma.integrationSyncLog.create({
        data: {
          companyId: COMPANY_ID,
          integrationId: intg.id,
          syncType: syncTypes[Math.floor(Math.random() * syncTypes.length)],
          direction: Math.random() > 0.3 ? 'push' : 'pull',
          status,
          recordsProcessed: processed,
          recordsCreated: processed - failed,
          recordsUpdated: Math.floor(Math.random() * 10),
          recordsFailed: failed,
          errorDetails: failed > 0 ? [{ error: 'Account code mapping missing for code 9999' }] : [],
          durationMs: Math.floor(Math.random() * 8000) + 200,
          initiatedBy: Math.random() > 0.5 ? 'cron' : 'user',
          initiatedUserId: admin.id,
          startedAt: new Date(Date.now() - (i * 86400000 + Math.random() * 43200000)),
          completedAt: new Date(Date.now() - (i * 86400000 + Math.random() * 43200000) + 3000),
        },
      });
    }
  }
  console.log('  ✅ Sync logs seeded');

  // ── Webhook Endpoints ──
  const webhooks = [
    {
      url: 'https://myapp.acme.com/webhooks/pms',
      description: 'Main application webhook',
      events: ['lease.activated', 'lease.terminated', 'invoice.issued', 'invoice.paid', 'payment.received', 'ticket.created'],
      failureCount: 0, lastSuccessAt: new Date(Date.now() - 3600000),
    },
    {
      url: 'https://analytics.acme.com/events',
      description: 'BI analytics event stream',
      events: ['invoice.issued', 'invoice.paid', 'payment.received', 'tenant.created', 'booking.confirmed'],
      failureCount: 0, lastSuccessAt: new Date(Date.now() - 7200000),
    },
    {
      url: 'https://staging.partner.io/hooks/acme',
      description: 'Partner system (staging)',
      events: ['lease.created', 'visitor.checked_in', 'incident.created'],
      failureCount: 3, lastFailureAt: new Date(Date.now() - 1800000),
    },
  ];

  const createdWebhooks: any[] = [];
  for (const wh of webhooks) {
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const created = await prisma.webhookEndpoint.create({
      data: { companyId: COMPANY_ID, createdBy: admin.id, secret, ...wh },
    });
    createdWebhooks.push(created);
    console.log(`  ✅ Webhook: ${created.url}`);
  }

  // ── Webhook Deliveries ──
  for (const wh of createdWebhooks) {
    const deliveryStatuses = ['delivered', 'delivered', 'delivered', 'failed', 'delivered'];
    for (let i = 0; i < 6; i++) {
      const evt = wh.events[Math.floor(Math.random() * wh.events.length)];
      const st = deliveryStatuses[Math.floor(Math.random() * deliveryStatuses.length)];
      await prisma.webhookDelivery.create({
        data: {
          companyId: COMPANY_ID,
          endpointId: wh.id,
          eventType: evt,
          payload: { event: evt, timestamp: new Date().toISOString(), data: { id: crypto.randomUUID() } },
          status: st,
          httpStatus: st === 'delivered' ? 200 : 500,
          responseBody: st === 'delivered' ? '{"ok":true}' : 'Internal Server Error',
          attemptCount: st === 'failed' ? 3 : 1,
          deliveredAt: st === 'delivered' ? new Date(Date.now() - i * 3600000) : null,
          createdAt: new Date(Date.now() - i * 3600000),
        },
      });
    }
  }
  console.log('  ✅ Webhook deliveries seeded');

  // ── API Keys ──
  const apiKeys = [
    { name: 'Production API Key', scopes: ['leases:read', 'invoices:read', 'tenants:read', 'payments:read'], rateLimitRpm: 200 },
    { name: 'Analytics Read-Only', scopes: ['leases:read', 'invoices:read', 'units:read', 'properties:read'], rateLimitRpm: 500 },
    { name: 'Webhook Manager', scopes: ['webhooks:read', 'webhooks:write'], rateLimitRpm: 50 },
  ];

  for (const ak of apiKeys) {
    const rawKey = `pms_sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    await prisma.apiKey.create({
      data: {
        companyId: COMPANY_ID,
        name: ak.name,
        keyHash,
        keyPrefix: rawKey.substring(0, 10),
        scopes: ak.scopes,
        rateLimitRpm: ak.rateLimitRpm,
        createdBy: admin.id,
        lastUsedAt: new Date(Date.now() - Math.floor(Math.random() * 604800000)),
      },
    });
    console.log(`  ✅ API Key: ${ak.name}`);
  }

  console.log('\n🎉 Module 6.3 seed complete!\n');
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
