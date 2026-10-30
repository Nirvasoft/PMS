import crypto from 'crypto';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

function mapV6AccountClassification(
  code: string,
  description: string,
): {
  accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  accountSubtype: string;
  normalBalance: 'debit' | 'credit';
} {
  const c = code.trim();
  const d = description.trim();
  const major = c.charAt(0);

  switch (major) {
    case '1': {
      if (c.startsWith('1-1102') || /accumulated\s+depreciation/i.test(d)) {
        return { accountType: 'asset', accountSubtype: 'Accumulated Depreciation', normalBalance: 'credit' };
      }
      if (c.startsWith('1-11') || /property,\s*plant|non-current\s+asset|fixed\s+asset/i.test(d)) {
        return { accountType: 'asset', accountSubtype: 'Non-Current Assets', normalBalance: 'debit' };
      }
      if (c.startsWith('1-2411') || /other\s+receivable/i.test(d)) {
        return { accountType: 'asset', accountSubtype: 'Other Accounts Receivable', normalBalance: 'debit' };
      }
      return { accountType: 'asset', accountSubtype: 'Current Assets', normalBalance: 'debit' };
    }
    case '2': {
      if (c.startsWith('2-11') || c.startsWith('2-12') || /long\s+term|non-current\s+liabilit/i.test(d)) {
        return { accountType: 'liability', accountSubtype: 'Non-Current Liabilities', normalBalance: 'credit' };
      }
      if (c.startsWith('2-214') || /other\s+payable/i.test(d)) {
        return { accountType: 'liability', accountSubtype: 'Other Accounts Payable', normalBalance: 'credit' };
      }
      return { accountType: 'liability', accountSubtype: 'Current Liabilities', normalBalance: 'credit' };
    }
    case '3': {
      if (c.startsWith('3-1102') || /retained\s+earning/i.test(d)) {
        return { accountType: 'equity', accountSubtype: 'Retained Earnings', normalBalance: 'credit' };
      }
      if (c.startsWith('3-1103') || /reserve/i.test(d)) {
        return { accountType: 'equity', accountSubtype: 'Reserve', normalBalance: 'credit' };
      }
      if (/net\s+profit/i.test(d)) {
        return { accountType: 'equity', accountSubtype: 'Net Profit', normalBalance: 'credit' };
      }
      return { accountType: 'equity', accountSubtype: 'Capital', normalBalance: 'credit' };
    }
    case '4': {
      if (/other\s+revenue|other\s+income/i.test(d)) {
        return { accountType: 'income', accountSubtype: 'Other Revenue', normalBalance: 'credit' };
      }
      return { accountType: 'income', accountSubtype: 'Sales', normalBalance: 'credit' };
    }
    case '5': {
      if (c.startsWith('5-10') || /opening\s+stock/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Opening Stocks', normalBalance: 'debit' };
      }
      if (c.startsWith('5-20') || /closing\s+stock/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Closing Stocks', normalBalance: 'credit' };
      }
      if (c.startsWith('5-60') || c.startsWith('5-7000') || /purchase/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Purchase', normalBalance: 'debit' };
      }
      if (c.startsWith('5-7001') || /freight|carriage\s+inward/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Carriage Inwards', normalBalance: 'debit' };
      }
      return { accountType: 'expense', accountSubtype: 'Cost of Sales', normalBalance: 'debit' };
    }
    case '6': {
      if (/income\s+tax|\btax\b/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Income Tax', normalBalance: 'debit' };
      }
      return { accountType: 'income', accountSubtype: 'Income & Expenses', normalBalance: 'credit' };
    }
    case '7':
    case '8': {
      if (c.startsWith('7-1100') || /selling|direct\s+expense/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Direct Expenses', normalBalance: 'debit' };
      }
      if (c.startsWith('7-1101') || c.startsWith('7-1102') || /operating|admin|overhead/i.test(d)) {
        return { accountType: 'expense', accountSubtype: 'Overheads', normalBalance: 'debit' };
      }
      return { accountType: 'expense', accountSubtype: 'Cost & Expenses', normalBalance: 'debit' };
    }
    default:
      return { accountType: 'asset', accountSubtype: 'Current Assets', normalBalance: 'debit' };
  }
}

function resolveV6ParentCode(code: string, codeLowerSet: Set<string>): string | null {
  const c = code.trim();
  const lower = c.toLowerCase();
  if (c.endsWith('00') || c.length < 6) {
    return null;
  }
  const candidates = [
    `${c.slice(0, -2)}00`,
    c.length >= 7 ? `${c.slice(0, -3)}000` : '',
    c.length >= 8 ? `${c.slice(0, -4)}0000` : '',
  ].filter(Boolean);

  for (const cand of candidates) {
    const candLower = cand.toLowerCase();
    if (candLower !== lower && codeLowerSet.has(candLower)) {
      return candLower;
    }
  }
  return null;
}

// ═════════════════════════════════════════
// INTEGRATION TYPES REGISTRY
// ═════════════════════════════════════════
export const INTEGRATION_TYPES = {
  v6erp:        { name: 'V6 ERP',                 category: 'erp',        icon: '🔗' },
  sap:          { name: 'SAP S/4HANA',           category: 'erp',        icon: '🏢' },
  netsuite:     { name: 'Oracle NetSuite',        category: 'erp',        icon: '☁️' },
  dynamics365:  { name: 'Microsoft Dynamics 365', category: 'erp',        icon: '🔷' },
  quickbooks:   { name: 'QuickBooks Online',      category: 'accounting', icon: '📗' },
  xero:         { name: 'Xero',                   category: 'accounting', icon: '💙' },
  docusign:     { name: 'DocuSign',               category: 'esign',      icon: '✍️' },
  adobesign:    { name: 'Adobe Acrobat Sign',     category: 'esign',      icon: '📄' },
  stripe:       { name: 'Stripe',                 category: 'payment',    icon: '💳' },
  paytabs:      { name: 'PayTabs',                category: 'payment',    icon: '💰' },
  bacnet_bms:   { name: 'BACnet BMS',             category: 'bms',        icon: '🏗️' },
} as const;

export const WEBHOOK_EVENTS: Record<string, string> = {
  'lease.created':          'Lease draft created',
  'lease.activated':        'Lease activated (live)',
  'lease.amended':          'Lease amendment approved',
  'lease.renewed':          'Lease renewed',
  'lease.terminated':       'Lease terminated',
  'lease.expiring':         'Lease expiring within 30 days',
  'invoice.issued':         'Invoice generated',
  'invoice.sent':           'Invoice emailed to tenant',
  'invoice.paid':           'Invoice fully paid',
  'invoice.overdue':        'Invoice became overdue',
  'payment.received':       'Payment receipt created',
  'refund.processed':       'Refund marked as paid',
  'ticket.created':         'Maintenance ticket created',
  'ticket.assigned':        'Ticket assigned to technician',
  'ticket.completed':       'Ticket completed',
  'ticket.sla_breach':      'SLA breach detected',
  'ticket.rated':           'Tenant rating submitted',
  'tenant.created':         'New tenant profile created',
  'tenant.kyc_verified':    'KYC verification completed',
  'tenant.blacklisted':     'Tenant added to blacklist',
  'visitor.pre_registered': 'Visitor pass created',
  'visitor.checked_in':     'Visitor gate check-in',
  'visitor.checked_out':    'Visitor gate check-out',
  'visitor.overstay':       'Visitor overstay detected',
  'booking.confirmed':      'Facility booking confirmed',
  'booking.cancelled':      'Facility booking cancelled',
  'incident.created':       'Security incident reported',
  'incident.resolved':      'Security incident resolved',
  'unit.status_changed':    'Unit status changed',
  'property.status_changed':'Property status changed',
};

export const API_KEY_SCOPES = [
  'leases:read', 'leases:write',
  'invoices:read', 'invoices:write',
  'tenants:read', 'tenants:write',
  'units:read', 'units:write',
  'payments:read',
  'tickets:read', 'tickets:write',
  'visitors:read', 'visitors:write',
  'webhooks:read', 'webhooks:write',
  'properties:read',
];

class IntegrationsService {
  private activeCoaSyncs = new Map<string, Promise<any>>();

  // ── Integration Configs ──

  async list(companyId: string) {
    const configs = await prisma.integrationConfig.findMany({
      where: { companyId },
      include: {
        _count: { select: { syncLogs: true } },
        syncLogs: { take: 1, orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return configs.map(c => ({
      ...c,
      credentials:    undefined,   // Never expose raw credentials to client
      hasCredentials: !!(c.credentials && Object.keys(c.credentials as object).length > 0),
      recentSync: c.syncLogs[0] || null,
      totalSyncs: c._count.syncLogs,
    }));
  }

  async create(companyId: string, userId: string, data: any) {
    const created = await prisma.integrationConfig.create({
      data: {
        companyId,
        integrationType: data.integrationType,
        name: data.name,
        description: data.description,
        config: data.config || {},
        credentials: data.credentials || {},
        syncFrequency: data.syncFrequency || 'daily',
        createdBy: userId,
      },
    });

    if (created.integrationType === 'v6erp' && created.isActive && created.status !== 'disabled') {
      await this.syncV6ChartOfAccounts(companyId, data.propertyId, userId, false, created).catch((err) => {
        logger.warn(`Initial V6 ERP COA auto-sync skipped on create: ${err.message}`);
      });
    }

    return created;
  }

  async update(id: string, companyId: string, data: any, userId?: string) {
    const existing = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Integration');

    let status = data.status;
    let isActive = data.isActive;
    if (status !== undefined) {
      if (isActive === undefined) {
        isActive = status === 'active';
      }
    } else if (isActive !== undefined) {
      status = isActive ? 'active' : 'disabled';
    }

    const updated = await prisma.integrationConfig.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() }),
        ...(data.syncFrequency !== undefined && { syncFrequency: data.syncFrequency }),
        ...(status !== undefined && { status }),
        ...(isActive !== undefined && { isActive }),
        // Only overwrite config/credentials when explicitly sent (undefined = keep existing)
        ...(data.config      !== undefined && { config:      data.config }),
        ...(data.credentials !== undefined && { credentials: data.credentials }),
      },
    });

    if (updated.integrationType === 'v6erp') {
      if (updated.isActive && updated.status !== 'disabled') {
        await this.syncV6ChartOfAccounts(companyId, data.propertyId, userId, false, updated).catch((err) => {
          logger.warn(`V6 ERP COA auto-sync warning on update: ${err.message}`);
        });
      } else {
        await this.restorePmsChartOfAccountsOnV6Disable(updated.id, companyId).catch((err) => {
          logger.warn(`V6 ERP COA restore warning on disable: ${err.message}`);
        });
      }
    }

    return {
      ...updated,
      credentials: undefined,
      hasCredentials: !!(updated.credentials && Object.keys(updated.credentials as object).length > 0),
    };
  }


  async delete(id: string, companyId: string) {
    const existing = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Integration');
    if (existing.integrationType === 'v6erp') {
      await this.restorePmsChartOfAccountsOnV6Disable(existing.id, companyId).catch((err) => {
        logger.warn(`V6 ERP COA restore warning on delete: ${err.message}`);
      });
    }
    return prisma.integrationConfig.delete({ where: { id } });
  }

  async testConnection(id: string, companyId: string, propertyId?: string, userId?: string) {
    const config = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!config) throw AppError.notFound('Integration');

    if (config.integrationType === 'v6erp') {
      const cfg = (config.config || {}) as Record<string, string>;
      const creds = (config.credentials || {}) as Record<string, string>;
      const rawBase = (cfg.baseUrl || creds.apiUrl || '').replace(/\/+$/, '');
      if (!rawBase) {
        throw new AppError(400, 'V6ERP_NOT_CONFIGURED', 'baseUrl is required in configuration (e.g. https://v6gold.mitcloud.com/v6_addon)');
      }
      let cleanRoot = rawBase;
      if (!/\/V6$/i.test(cleanRoot) && !/\/v6_addon$/i.test(cleanRoot)) {
        cleanRoot = `${cleanRoot}/V6`;
      }
      const customerEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/getCustomer`;
      const domain = cfg.domain || 'demo';
      const t0 = Date.now();
      try {
        const resp = await fetch(customerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain, code: '', date: '' }),
          signal: AbortSignal.timeout(10000),
        });
        const elapsed = Date.now() - t0;
        const text = await resp.text().catch(() => '');
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        if (resp.ok && json?.status === 'SUCCESS') {
          const activated = await prisma.integrationConfig.update({
            where: { id },
            data: { status: 'active', isActive: true, lastError: null },
          });
          await this.syncV6ChartOfAccounts(companyId, propertyId, userId, false, activated).catch((err) => {
            logger.warn(`V6 ERP COA auto-sync warning after testConnection: ${err.message}`);
          });
          return {
            connected: true,
            version: 'V6 ERP Integration API',
            organisationName: `Domain: ${domain}`,
            responseTimeMs: elapsed,
          };
        } else {
          const errMsg = json?.message || `HTTP ${resp.status}: ${text.substring(0, 150)}`;
          await prisma.integrationConfig.update({
            where: { id },
            data: { status: 'error', lastError: errMsg },
          });
          throw new AppError(400, 'V6ERP_CONNECTION_FAILED', `V6 ERP error: ${errMsg}`);
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        const errMsg = err.name === 'AbortError' ? 'Timeout (10s)' : err.message;
        await prisma.integrationConfig.update({
          where: { id },
          data: { status: 'error', lastError: errMsg },
        });
        throw new AppError(400, 'V6ERP_CONNECTION_FAILED', `Cannot reach V6 ERP: ${errMsg}`);
      }
    }

    // Default stub: simulate connection test
    const typeMeta = INTEGRATION_TYPES[config.integrationType as keyof typeof INTEGRATION_TYPES];
    await prisma.integrationConfig.update({
      where: { id },
      data: { status: 'active', isActive: true, lastError: null },
    });

    return {
      connected: true,
      version: `${typeMeta?.name || config.integrationType} API v2.0`,
      organisationName: config.name,
      responseTimeMs: Math.floor(Math.random() * 200) + 50,
    };
  }

  async triggerSync(id: string, companyId: string, userId: string, data: any) {
    const config = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!config) throw AppError.notFound('Integration');

    if (config.integrationType === 'v6erp') {
      return this.syncV6Erp(config, companyId, userId, data?.propertyId);
    }

    // Stub: simulate sync result
    const processed = Math.floor(Math.random() * 50) + 10;
    const failed = Math.floor(Math.random() * 3);

    const log = await prisma.integrationSyncLog.create({
      data: {
        companyId,
        integrationId: id,
        syncType: data.syncType || 'full_sync',
        direction: data.direction || 'push',
        status: failed > 0 ? 'partial' : 'success',
        recordsProcessed: processed,
        recordsCreated: processed - failed,
        recordsUpdated: 0,
        recordsFailed: failed,
        errorDetails: failed > 0 ? [{ error: 'Sample error: Account code mapping missing' }] : [],
        durationMs: Math.floor(Math.random() * 5000) + 500,
        initiatedBy: 'user',
        initiatedUserId: userId,
        completedAt: new Date(),
      },
    });

    await prisma.integrationConfig.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });

    return log;
  }

  async getSyncLogs(integrationId: string, companyId: string, page = 1, limit = 20) {
    const where = { integrationId, companyId };
    const [data, total] = await Promise.all([
      prisma.integrationSyncLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.integrationSyncLog.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getEntityMaps(companyId: string, integrationId?: string, entityType?: string) {
    return prisma.integrationEntityMap.findMany({
      where: {
        companyId,
        ...(integrationId && { integrationId }),
        ...(entityType ? { entityType } : { entityType: { not: 'gl_account_pms_hidden' } }),
      },
      orderBy: { syncedAt: 'desc' },
      take: 100,
    });
  }

  async deleteEntityMap(id: string, companyId: string) {
    const existing = await prisma.integrationEntityMap.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Entity map');
    return prisma.integrationEntityMap.delete({ where: { id } });
  }

  // ── Webhooks ──

  async listWebhooks(companyId: string) {
    return prisma.webhookEndpoint.findMany({
      where: { companyId },
      include: { _count: { select: { deliveries: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWebhook(companyId: string, userId: string, data: any) {
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        companyId,
        url: data.url,
        description: data.description,
        events: data.events || [],
        secret,
        createdBy: userId,
      },
    });

    return { ...endpoint, secret }; // Return secret only on creation
  }

  async updateWebhook(id: string, companyId: string, data: any) {
    const existing = await prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Webhook');
    return prisma.webhookEndpoint.update({
      where: { id },
      data: { url: data.url, description: data.description, events: data.events, isActive: data.isActive },
    });
  }

  async deleteWebhook(id: string, companyId: string) {
    const existing = await prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Webhook');
    return prisma.webhookEndpoint.delete({ where: { id } });
  }

  async testWebhook(id: string, companyId: string) {
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!endpoint) throw AppError.notFound('Webhook');

    const payload = {
      event: 'test.ping',
      timestamp: new Date().toISOString(),
      companyId,
      data: { message: 'Test webhook delivery from PMS' },
    };

    // Create delivery record
    const delivery = await prisma.webhookDelivery.create({
      data: {
        companyId,
        endpointId: id,
        eventType: 'test.ping',
        payload: payload as any,
        status: 'pending',
      },
    });

    // Actually deliver
    const result = await this.deliverWebhook(delivery.id, endpoint.url, endpoint.secret, payload);
    return result;
  }

  /**
   * Core webhook delivery — real HTTP POST with HMAC-SHA256 signature.
   * Used by testWebhook, retryDelivery, and emitWebhookEvent.
   */
  private async deliverWebhook(
    deliveryId: string,
    url: string,
    secret: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify(payload);
    const signature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PMS-Signature': signature,
          'X-PMS-Event': (payload.event as string) || 'unknown',
          'X-PMS-Delivery': deliveryId,
          'User-Agent': 'PMS-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseBody = await response.text().catch(() => '');

      const updated = await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok ? 'delivered' : 'failed',
          httpStatus: response.status,
          responseBody: responseBody.substring(0, 1000),
          deliveredAt: response.ok ? new Date() : undefined,
        },
      });

      // Update endpoint stats
      if (response.ok) {
        await prisma.webhookEndpoint.update({
          where: { id: updated.endpointId },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        });
      } else {
        await prisma.webhookEndpoint.update({
          where: { id: updated.endpointId },
          data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
        });
      }

      logger.info(`Webhook delivered to ${url} — status ${response.status}`, { deliveryId });
      return updated;

    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' ? 'Request timeout (30s)' : err.message;
      logger.warn(`Webhook delivery failed to ${url}: ${errorMsg}`, { deliveryId });

      // Compute next retry with exponential backoff: 10s, 30s, 90s, 270s, 810s
      const MAX_ATTEMPTS = 5;
      const current = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
      const attemptNum = (current?.attemptCount ?? 0) + 1;
      const backoffMs = Math.min(10_000 * Math.pow(3, attemptNum - 1), 900_000); // Cap at 15min
      const nextRetryAt = attemptNum < MAX_ATTEMPTS ? new Date(Date.now() + backoffMs) : null;

      const updated = await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: attemptNum >= MAX_ATTEMPTS ? 'failed' : 'retrying',
          responseBody: errorMsg.substring(0, 1000),
          attemptCount: attemptNum,
          nextRetryAt,
        },
      });

      await prisma.webhookEndpoint.update({
        where: { id: updated.endpointId },
        data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
      });

      // Auto-disable endpoint after 100 consecutive failures
      const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: updated.endpointId } });
      if (endpoint && endpoint.failureCount >= 100) {
        await prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { isActive: false },
        });
        logger.warn(`Webhook endpoint ${endpoint.url} auto-disabled after 100 failures`);
      }

      if (nextRetryAt) {
        logger.info(`Webhook delivery ${deliveryId} scheduled retry #${attemptNum} at ${nextRetryAt.toISOString()}`);
      }

      return updated;
    }
  }

  /**
   * Process pending retries — called by the retry cron job every 30 seconds.
   * Picks up deliveries with status='retrying' and nextRetryAt <= now.
   */
  async processRetries() {
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: 'retrying',
        nextRetryAt: { lte: new Date() },
      },
      include: { endpoint: true },
      take: 20, // Process in batches
      orderBy: { nextRetryAt: 'asc' },
    });

    if (pending.length === 0) return;

    logger.info(`Webhook retry processor: ${pending.length} delivery(ies) to retry`);

    for (const delivery of pending) {
      if (!delivery.endpoint || !delivery.endpoint.isActive) {
        // Endpoint deleted or disabled — mark failed
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'failed', nextRetryAt: null },
        });
        continue;
      }

      // Clear nextRetryAt before attempting (deliverWebhook will set it again on failure)
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { nextRetryAt: null },
      });

      this.deliverWebhook(
        delivery.id,
        delivery.endpoint.url,
        delivery.endpoint.secret,
        delivery.payload as Record<string, unknown>,
      ).catch(err => {
        logger.error(`Webhook retry error for ${delivery.id}:`, err);
      });
    }
  }

  /**
   * Emit a webhook event — called by domain services (lease, invoice, etc.).
   * Finds all matching active endpoints and delivers asynchronously.
   */
  async emitWebhookEvent(eventType: string, data: Record<string, unknown>, companyId: string) {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        companyId,
        isActive: true,
        events: { has: eventType },
      },
    });

    if (endpoints.length === 0) return;

    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      companyId,
      data,
    };

    // Deliver to all matching endpoints (fire-and-forget, don't block caller)
    for (const ep of endpoints) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          companyId,
          endpointId: ep.id,
          eventType,
          payload: payload as any,
          status: 'pending',
        },
      });

      // Deliver async — don't await to avoid blocking the domain service
      this.deliverWebhook(delivery.id, ep.url, ep.secret, payload).catch(err => {
        logger.error(`Webhook async delivery error for ${eventType}:`, err);
      });
    }

    logger.info(`Webhook event ${eventType} dispatched to ${endpoints.length} endpoint(s)`);
  }

  async getDeliveries(endpointId: string, companyId: string, page = 1, limit = 20) {
    const where = { endpointId, companyId };
    const [data, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async retryDelivery(deliveryId: string, companyId: string) {
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, companyId },
      include: { endpoint: true },
    });
    if (!delivery) throw AppError.notFound('Delivery');
    if (!delivery.endpoint) throw AppError.notFound('Webhook endpoint');

    // Reset status and re-deliver
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'pending' },
    });

    return this.deliverWebhook(
      deliveryId,
      delivery.endpoint.url,
      delivery.endpoint.secret,
      delivery.payload as Record<string, unknown>,
    );
  }

  // ── API Keys ──

  async listApiKeys(companyId: string) {
    return prisma.apiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiKey(companyId: string, userId: string, data: any) {
    if (!companyId) throw new AppError(401, 'UNAUTHORIZED', 'Company ID missing');
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'User ID missing');
    if (!data.name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', 'Key name is required');
    if (!data.scopes || !Array.isArray(data.scopes) || data.scopes.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'At least one scope must be selected');
    }

    const rawKey = `pms_sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 10);

    let expiresAt: Date | null = null;
    if (data.expiresAt) {
      const d = new Date(data.expiresAt);
      if (!isNaN(d.getTime())) {
        expiresAt = d;
      }
    }

    const rateLimitRpm = Math.min(Math.max(Number(data.rateLimitRpm) || 100, 1), 10000);

    const apiKey = await prisma.apiKey.create({
      data: {
        companyId,
        name: data.name.trim(),
        keyHash,
        keyPrefix,
        scopes: data.scopes || [],
        rateLimitRpm,
        expiresAt,
        createdBy: userId,
      },
    });

    return { ...apiKey, key: rawKey }; // Only returned once
  }

  async revokeApiKey(id: string, companyId: string) {
    const existing = await prisma.apiKey.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('API Key');
    return prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  }

  async deleteApiKey(id: string, companyId: string) {
    const existing = await prisma.apiKey.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('API Key');
    return prisma.apiKey.delete({ where: { id } });
  }

  /**
   * Pull General Ledger -> Chart of Accounts from V6 ERP (/v6IntegrationAPIlogin/getCOA)
   * scoped to the active propertyId:
   * - Upserts V6 ERP COA accounts with mapped accountType, accountSubtype, normalBalance, parentId, isControl.
   * - Marks non-V6 PMS accounts for that property as isActive: false (preserving them in IntegrationEntityMap
   *   under 'gl_account_pms_hidden' so turning V6 Flag OFF restores original PMS accounts with zero data loss).
   */
  async syncV6ChartOfAccounts(
    companyId: string,
    propertyId?: string,
    userId?: string,
    skipLog = false,
    preloadedConfig?: any,
    initiatedBy: 'user' | 'cron' = 'user',
  ) {
    const config =
      preloadedConfig ||
      (await prisma.integrationConfig.findFirst({
        where: {
          companyId,
          integrationType: 'v6erp',
          isActive: true,
          status: { not: 'disabled' },
        },
      }));

    if (!config || !config.isActive || config.status === 'disabled') {
      throw new AppError(
        400,
        'V6ERP_NOT_ACTIVE',
        'V6 ERP integration is not active. Turn ON the V6 ERP flag in Integrations first.',
      );
    }

    await ensurePropertySetupScope();
    const targetPropertyId = await resolveEffectivePropertyId(companyId, propertyId);
    const lockKey = `${companyId}:${targetPropertyId || 'default'}`;

    const inflight = this.activeCoaSyncs.get(lockKey);
    if (inflight) {
      return inflight;
    }

    const runner = (async () => {
      const cfg = (config.config || {}) as Record<string, string>;
      const creds = (config.credentials || {}) as Record<string, string>;
      const baseUrl = (cfg.baseUrl || creds.apiUrl || '').replace(/\/+$/, '');
      if (!baseUrl) {
        throw new AppError(
          400,
          'V6ERP_NOT_CONFIGURED',
          '🔶 V6 ERP API URL is not configured. Edit the integration and set config.baseUrl.',
        );
      }

      const domain = cfg.domain || 'demo';
      let cleanRoot = baseUrl;
      if (!/\/V6$/i.test(cleanRoot) && !/\/v6_addon$/i.test(cleanRoot)) {
        cleanRoot = `${cleanRoot}/V6`;
      }

      const t0 = Date.now();
      const coaEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/getCOA`;
      const resp = await fetch(coaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, code: '', date: '' }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new AppError(
          502,
          'V6ERP_COA_FETCH_FAILED',
          `V6 ERP getCOA failed with HTTP ${resp.status}: ${errBody.substring(0, 150)}`,
        );
      }

      const coaJson = (await resp.json().catch(() => null)) as any;
      const rawList: any[] | null = Array.isArray(coaJson?.coalist)
        ? coaJson.coalist
        : Array.isArray(coaJson?.list)
          ? coaJson.list
          : null;

      if (!rawList) {
        throw new AppError(
          502,
          'V6ERP_COA_INVALID_RESPONSE',
          'V6 ERP getCOA returned an unexpected payload without coalist.',
        );
      }

      // Deduplicate by account code (case-insensitive), keeping latest syskey
      const dedupedByLower = new Map<
        string,
        { code: string; name: string; syskey: string }
      >();

      for (const item of rawList) {
        const rawCode = String(item.code || item.accountCode || item.t1 || '').trim();
        if (!rawCode) continue;
        const rawDesc = String(item.description || item.name || item.t2 || rawCode).trim() || rawCode;
        const rawSyskey = String(item.syskey || '').trim();
        const lower = rawCode.toLowerCase();

        const prev = dedupedByLower.get(lower);
        if (!prev || rawSyskey > prev.syskey) {
          dedupedByLower.set(lower, {
            code: rawCode,
            name: rawDesc.substring(0, 255),
            syskey: rawSyskey,
          });
        }
      }

      const v6Items = [...dedupedByLower.values()].sort((a, b) => a.code.localeCompare(b.code));
      if (v6Items.length === 0) {
        return {
          success: true,
          propertyId: targetPropertyId,
          totalV6Accounts: 0,
          created: 0,
          updated: 0,
          deactivated: 0,
          message: 'V6 ERP returned 0 Chart of Accounts records.',
        };
      }

      const codeLowerSet = new Set(dedupedByLower.keys());
      const parentLowerByCodeLower = new Map<string, string | null>();
      const parentCodeSet = new Set<string>();

      for (const item of v6Items) {
        const lower = item.code.toLowerCase();
        const pLower = resolveV6ParentCode(item.code, codeLowerSet);
        parentLowerByCodeLower.set(lower, pLower);
        if (pLower) parentCodeSet.add(pLower);
      }

      // Load existing GL accounts for this property + existing entity mappings
      const [existingAccounts, existingMaps] = await Promise.all([
        prisma.glAccount.findMany({
          where: { companyId, propertyId: targetPropertyId },
        }),
        prisma.integrationEntityMap.findMany({
          where: {
            companyId,
            integrationId: config.id,
            entityType: { in: ['gl_account', 'gl_account_pms_hidden'] },
          },
        }),
      ]);

      const glEntityMapByPmsId = new Map<string, (typeof existingMaps)[number]>();
      for (const m of existingMaps) {
        if (m.entityType === 'gl_account') {
          glEntityMapByPmsId.set(m.pmsId, m);
        }
      }

      // Prefer matching account without department/cost center for standard COA codes
      const existingByCodeLower = new Map<string, (typeof existingAccounts)[number]>();
      for (const acc of existingAccounts) {
        const lower = acc.code.trim().toLowerCase();
        const current = existingByCodeLower.get(lower);
        if (!current || (!acc.departmentCenterId && !acc.costCenterId)) {
          existingByCodeLower.set(lower, acc);
        }
      }

      const toCreate: Array<{
        companyId: string;
        propertyId: string | null;
        code: string;
        name: string;
        accountType: string;
        accountSubtype: string;
        normalBalance: string;
        isControl: boolean;
        isActive: boolean;
        sortOrder: number;
      }> = [];

      const newlyCreatedCodeLowers = new Set<string>();
      const toUpdateRows: Array<{
        id: string;
        data: {
          name: string;
          accountType: string;
          accountSubtype: string;
          normalBalance: string;
          isControl: boolean;
          isActive: boolean;
        };
      }> = [];

      let createdCount = 0;
      let updatedCount = 0;

      v6Items.forEach((item, idx) => {
        const lower = item.code.toLowerCase();
        const cls = mapV6AccountClassification(item.code, item.name);
        const isControl = parentCodeSet.has(lower);
        const existing = existingByCodeLower.get(lower);

        if (!existing) {
          newlyCreatedCodeLowers.add(lower);
          toCreate.push({
            companyId,
            propertyId: targetPropertyId,
            code: item.code,
            name: item.name,
            accountType: cls.accountType,
            accountSubtype: cls.accountSubtype,
            normalBalance: cls.normalBalance,
            isControl,
            isActive: true,
            sortOrder: idx,
          });
        } else {
          const needsUpdate =
            existing.name !== item.name ||
            existing.accountType !== cls.accountType ||
            existing.accountSubtype !== cls.accountSubtype ||
            existing.normalBalance !== cls.normalBalance ||
            existing.isControl !== isControl ||
            !existing.isActive;

          if (needsUpdate) {
            toUpdateRows.push({
              id: existing.id,
              data: {
                name: item.name,
                accountType: cls.accountType,
                accountSubtype: cls.accountSubtype,
                normalBalance: cls.normalBalance,
                isControl,
                isActive: true,
              },
            });
          }
        }
      });

      if (toCreate.length > 0) {
        const res = await prisma.glAccount.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        createdCount = res.count;
      }

      // Keep parallelism well below the Prisma pool size so a COA sync never starves
      // interactive requests (e.g. login) of database connections.
      const CHUNK = 5;
      for (let i = 0; i < toUpdateRows.length; i += CHUNK) {
        const batch = toUpdateRows.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((u) =>
            prisma.glAccount.update({
              where: { id: u.id },
              data: u.data,
            }),
          ),
        );
        updatedCount += batch.length;
      }

      // Reload property GL accounts so we have IDs for newly created rows & parent tree linking
      const allPropertyAccounts =
        toCreate.length > 0
          ? await prisma.glAccount.findMany({
              where: { companyId, propertyId: targetPropertyId },
            })
          : existingAccounts;

      const syncedByCodeLower = new Map<string, (typeof allPropertyAccounts)[number]>();
      for (const acc of allPropertyAccounts) {
        const lower = acc.code.trim().toLowerCase();
        if (!codeLowerSet.has(lower)) continue;
        const current = syncedByCodeLower.get(lower);
        if (!current || (!acc.departmentCenterId && !acc.costCenterId)) {
          syncedByCodeLower.set(lower, acc);
        }
      }

      // Link parentId hierarchy where changed
      const parentUpdates: Array<{ id: string; parentId: string | null }> = [];
      for (const item of v6Items) {
        const lower = item.code.toLowerCase();
        const acc = syncedByCodeLower.get(lower);
        if (!acc) continue;
        const parentLower = parentLowerByCodeLower.get(lower) || null;
        const desiredParentId = parentLower ? syncedByCodeLower.get(parentLower)?.id || null : null;
        const safeParentId = desiredParentId && desiredParentId !== acc.id ? desiredParentId : null;
        if (acc.parentId !== safeParentId) {
          parentUpdates.push({ id: acc.id, parentId: safeParentId });
        }
      }

      for (let i = 0; i < parentUpdates.length; i += CHUNK) {
        const batch = parentUpdates.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((p) =>
            prisma.glAccount.update({
              where: { id: p.id },
              data: { parentId: p.parentId },
            }),
          ),
        );
      }

      const syncedIds = new Set<string>([...syncedByCodeLower.values()].map((a) => a.id));

      // Record original active PMS accounts that are being hidden so Flag OFF can restore them
      const accountsToHide = allPropertyAccounts.filter(
        (acc) => acc.isActive && !syncedIds.has(acc.id),
      );
      const genuinePmsAccountsToRemember = accountsToHide.filter((acc) => {
        const existingMap = glEntityMapByPmsId.get(acc.id);
        return !existingMap || !String(existingMap.externalRef || '').startsWith('V6 |');
      });

      if (genuinePmsAccountsToRemember.length > 0) {
        await prisma.integrationEntityMap.createMany({
          data: genuinePmsAccountsToRemember.map((acc) => ({
            companyId,
            integrationId: config.id,
            entityType: 'gl_account_pms_hidden',
            pmsId: acc.id,
            externalId: acc.code,
            externalRef: targetPropertyId || 'default',
            syncedAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }

      let deactivatedCount = 0;
      if (accountsToHide.length > 0) {
        const deactRes = await prisma.glAccount.updateMany({
          where: {
            companyId,
            propertyId: targetPropertyId,
            id: { in: accountsToHide.map((a) => a.id) },
            isActive: true,
          },
          data: { isActive: false },
        });
        deactivatedCount = deactRes.count;
      }

      // Clean up any stale hidden markers for accounts that are currently active in V6
      if (syncedIds.size > 0) {
        await prisma.integrationEntityMap.deleteMany({
          where: {
            companyId,
            integrationId: config.id,
            entityType: 'gl_account_pms_hidden',
            pmsId: { in: [...syncedIds] },
          },
        }).catch(() => {});
      }

      // Persist IntegrationEntityMap entries for synced V6 GL accounts
      const newGlMaps: Array<{
        companyId: string;
        integrationId: string;
        entityType: string;
        pmsId: string;
        externalId: string;
        externalRef: string;
        syncedAt: Date;
      }> = [];

      const now = new Date();
      for (const item of v6Items) {
        const lower = item.code.toLowerCase();
        const acc = syncedByCodeLower.get(lower);
        if (!acc) continue;
        const prevMap = glEntityMapByPmsId.get(acc.id);
        if (!prevMap) {
          const originPrefix = newlyCreatedCodeLowers.has(lower) ? 'V6' : 'PMS';
          const refLabel = `${originPrefix} | ${item.syskey ? `Syskey: ${item.syskey}` : item.name}`.substring(0, 255);
          newGlMaps.push({
            companyId,
            integrationId: config.id,
            entityType: 'gl_account',
            pmsId: acc.id,
            externalId: item.code,
            externalRef: refLabel,
            syncedAt: now,
          });
        }
      }

      if (newGlMaps.length > 0) {
        await prisma.integrationEntityMap.createMany({
          data: newGlMaps,
          skipDuplicates: true,
        }).catch(() => {});
      }

      if (syncedIds.size > 0) {
        await prisma.integrationEntityMap.updateMany({
          where: {
            companyId,
            integrationId: config.id,
            entityType: 'gl_account',
            pmsId: { in: [...syncedIds] },
          },
          data: { syncedAt: now },
        }).catch(() => {});
      }

      const durationMs = Date.now() - t0;

      if (!skipLog) {
        await prisma.integrationSyncLog.create({
          data: {
            companyId,
            integrationId: config.id,
            syncType: 'coa_sync',
            direction: 'pull',
            status: 'success',
            recordsProcessed: v6Items.length,
            recordsCreated: createdCount,
            recordsUpdated: updatedCount,
            recordsFailed: 0,
            errorDetails: [],
            durationMs,
            initiatedBy,
            initiatedUserId: userId || null,
            completedAt: new Date(),
          },
        }).catch((err) => logger.warn(`Failed to persist V6 COA sync log: ${err.message}`));

        await prisma.integrationConfig.update({
          where: { id: config.id },
          data: { lastSyncAt: new Date(), lastError: null },
        }).catch(() => {});
      }

      logger.info(
        `V6 ERP COA sync completed for property ${targetPropertyId}: total=${v6Items.length}, created=${createdCount}, updated=${updatedCount}, hidden=${deactivatedCount}`,
      );

      return {
        success: true,
        propertyId: targetPropertyId,
        totalV6Accounts: v6Items.length,
        created: createdCount,
        updated: updatedCount,
        deactivated: deactivatedCount,
        durationMs,
        message: `Synced ${v6Items.length} Chart of Accounts from V6 ERP (${createdCount} created, ${updatedCount} updated).`,
      };
    })();

    this.activeCoaSyncs.set(lockKey, runner);
    try {
      return await runner;
    } finally {
      this.activeCoaSyncs.delete(lockKey);
    }
  }

  /**
   * Restores original PMS Chart of Accounts when V6 ERP Flag is turned OFF or integration is deleted:
   * - Hides accounts that were created solely by V6 sync ('V6 | ...').
   * - Re-activates pre-existing PMS accounts that were hidden during V6 sync ('gl_account_pms_hidden').
   */
  async restorePmsChartOfAccountsOnV6Disable(integrationId: string, companyId: string) {
    const [v6CreatedMaps, hiddenPmsMaps] = await Promise.all([
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'gl_account',
          externalRef: { startsWith: 'V6 |' },
        },
        select: { pmsId: true },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'gl_account_pms_hidden',
        },
        select: { id: true, pmsId: true },
      }),
    ]);

    const v6CreatedIds = v6CreatedMaps.map((m) => m.pmsId);
    const hiddenPmsIds = hiddenPmsMaps.map((m) => m.pmsId);

    if (v6CreatedIds.length > 0) {
      await prisma.glAccount.updateMany({
        where: { companyId, id: { in: v6CreatedIds } },
        data: { isActive: false },
      });
    }

    if (hiddenPmsIds.length > 0) {
      await prisma.glAccount.updateMany({
        where: { companyId, id: { in: hiddenPmsIds } },
        data: { isActive: true },
      });
      await prisma.integrationEntityMap.deleteMany({
        where: {
          companyId,
          integrationId,
          entityType: 'gl_account_pms_hidden',
        },
      });
    }

    logger.info(
      `Restored PMS Chart of Accounts after V6 ERP disable: ${hiddenPmsIds.length} PMS account(s) re-activated, ${v6CreatedIds.length} V6-only account(s) hidden.`,
    );

    return {
      restoredPmsAccounts: hiddenPmsIds.length,
      hiddenV6Accounts: v6CreatedIds.length,
    };
  }

  /**
   * Bidirectional sync for V6 ERP:
   * 1. Inbound: Pull customers from V6 ERP and sync to PMS tenants & entity map.
   * 2. Inbound: Pull General Ledger Chart of Accounts from V6 ERP for active property (when V6 flag is ON).
   * 3. Outbound: Push issued invoices to V6 ERP and record entity map.
   * 4. Record unified sync log and update lastSyncAt.
   */
  async syncV6Erp(
    config: any,
    companyId: string,
    userId?: string,
    propertyId?: string,
    initiatedBy: 'user' | 'cron' = 'user',
  ) {
    const cfg   = (config.config      || {}) as Record<string, string>;
    const creds = (config.credentials || {}) as Record<string, string>;
    const baseUrl = (cfg.baseUrl || creds.apiUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      throw new AppError(
        400, 'V6ERP_NOT_CONFIGURED',
        '🔶 V6 ERP API URL is not configured. Edit the integration and set config.baseUrl (e.g. http://localhost:8080).',
      );
    }
    const domain = cfg.domain || 'demo';
    let cleanRoot = baseUrl;
    if (!/\/V6$/i.test(cleanRoot) && !/\/v6_addon$/i.test(cleanRoot)) {
      cleanRoot = `${cleanRoot}/V6`;
    }

    const t0 = Date.now();
    let customersImported = 0;
    let customersUpdated = 0;
    let coaCreated = 0;
    let coaUpdated = 0;
    let coaTotal = 0;
    const errors: any[] = [];

    // 1. Inbound Customer Sync from V6 ERP
    try {
      const customerEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/getCustomer`;
      const custResp = await fetch(customerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, code: '', date: '' }),
        signal: AbortSignal.timeout(10000),
      });

      if (custResp.ok) {
        const custJson = (await custResp.json().catch(() => null)) as any;
        const list: any[] = custJson?.list || [];
        for (const item of list) {
          const cuscode = (item.code || item.customerCode || item.t1 || '').trim();
          const cusname = (item.name || item.customerName || item.t2 || '').trim();
          const syskey = String(item.syskey || item.customerSyskey || '').trim();

          if (!cuscode) continue;

          const existingTenant = await prisma.tenant.findFirst({
            where: {
              companyId,
              OR: [
                { code: cuscode },
                { firstName: cuscode },
              ],
            },
          });

          let tenantId = existingTenant?.id;

          if (existingTenant) {
            await prisma.tenant.update({
              where: { id: existingTenant.id },
              data: {
                code: cuscode,
                lastName: cusname || existingTenant.lastName,
              },
            });
            customersUpdated++;
          } else {
            const newTenant = await prisma.tenant.create({
              data: {
                companyId,
                tenantType: 'individual',
                code: cuscode,
                firstName: cuscode,
                lastName: cusname || cuscode,
                email: item.email || null,
                phone: item.phone || item.mobile || null,
              },
            });
            tenantId = newTenant.id;
            customersImported++;
          }

          if (tenantId) {
            await prisma.integrationEntityMap.upsert({
              where: {
                integrationId_entityType_pmsId: {
                  integrationId: config.id,
                  entityType: 'tenant',
                  pmsId: tenantId,
                },
              },
              create: {
                companyId,
                integrationId: config.id,
                entityType: 'tenant',
                pmsId: tenantId,
                externalId: cuscode,
                externalRef: syskey ? `Syskey: ${syskey}` : cusname,
                syncedAt: new Date(),
              },
              update: {
                externalId: cuscode,
                externalRef: syskey ? `Syskey: ${syskey}` : cusname,
                syncedAt: new Date(),
              },
            }).catch(() => {});
          }
        }
      }
    } catch (cErr: any) {
      logger.warn(`V6 ERP customer sync warning: ${cErr.message}`);
      errors.push({ error: `Customer sync warning: ${cErr.message}` });
    }

    // 2. Inbound Chart of Accounts Sync from V6 ERP (when V6 Flag is ON)
    if (config.isActive && config.status !== 'disabled') {
      try {
        if (propertyId) {
          const coaRes = await this.syncV6ChartOfAccounts(companyId, propertyId, userId, true, config, initiatedBy);
          coaCreated += coaRes.created || 0;
          coaUpdated += coaRes.updated || 0;
          coaTotal += coaRes.totalV6Accounts || 0;
        } else {
          // For scheduled/company sync without explicit propertyId, refresh any properties already using V6 COA (or default property)
          const mappedGl = await prisma.integrationEntityMap.findMany({
            where: { companyId, integrationId: config.id, entityType: 'gl_account' },
            select: { pmsId: true },
            take: 500,
          });
          let targetPropIds: string[] = [];
          if (mappedGl.length > 0) {
            const propRows = await prisma.glAccount.findMany({
              where: { companyId, id: { in: mappedGl.map((m) => m.pmsId) }, propertyId: { not: null } },
              select: { propertyId: true },
              distinct: ['propertyId'],
            });
            targetPropIds = propRows.map((r) => r.propertyId!).filter(Boolean);
          }
          if (targetPropIds.length === 0) {
            const defProp = await resolveEffectivePropertyId(companyId);
            if (defProp) targetPropIds = [defProp];
          }
          for (const pid of targetPropIds) {
            const coaRes = await this.syncV6ChartOfAccounts(companyId, pid, userId, true, config, initiatedBy);
            coaCreated += coaRes.created || 0;
            coaUpdated += coaRes.updated || 0;
            coaTotal = Math.max(coaTotal, coaRes.totalV6Accounts || 0);
          }
        }
      } catch (coaErr: any) {
        logger.warn(`V6 ERP COA sync warning: ${coaErr.message}`);
        errors.push({ error: `COA sync warning: ${coaErr.message}` });
      }
    }

    // 3. Outbound Invoice Push to V6 ERP
    let invoiceRes: any = { sent: 0, failed: 0, skipped: 0, results: [] };
    try {
      invoiceRes = await this.pushInvoicesToV6Erp(companyId, undefined, true);
    } catch (invErr: any) {
      logger.warn(`V6 ERP invoice sync warning: ${invErr.message}`);
      errors.push({ error: `Invoice push warning: ${invErr.message}` });
    }

    if (invoiceRes.results) {
      const failedInvoices = invoiceRes.results.filter((r: any) => r.status === 'failed');
      errors.push(...failedInvoices);
    }

    const durationMs = Date.now() - t0;
    const totalProcessed = customersImported + customersUpdated + coaTotal + (invoiceRes.results?.length || 0);
    const totalFailed = (invoiceRes.failed || 0) + (errors.length > (invoiceRes.failed || 0) ? 1 : 0);

    // 4. Record Unified Sync Log
    const log = await prisma.integrationSyncLog.create({
      data: {
        companyId,
        integrationId: config.id,
        syncType: 'full_sync',
        direction: 'bidirectional',
        status: totalFailed === 0 ? 'success' : (totalProcessed > totalFailed ? 'partial' : 'failed'),
        recordsProcessed: totalProcessed,
        recordsCreated: customersImported + coaCreated + (invoiceRes.sent || 0),
        recordsUpdated: customersUpdated + coaUpdated,
        recordsFailed: totalFailed,
        errorDetails: errors,
        durationMs,
        initiatedBy,
        initiatedUserId: userId || null,
        completedAt: new Date(),
      },
    });

    // 5. Update lastSyncAt
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: {
        lastSyncAt: new Date(),
        ...(config.isActive ? { status: 'active' } : {}),
        lastError: null,
      },
    });

    return {
      success: true,
      customersImported,
      customersUpdated,
      coaTotal,
      coaCreated,
      coaUpdated,
      invoicesSent: invoiceRes.sent || 0,
      invoicesFailed: invoiceRes.failed || 0,
      log,
      message: `Sync completed: ${coaTotal} COA account(s) synced, ${customersImported} customer(s) imported, ${customersUpdated} updated, ${invoiceRes.sent || 0} invoice(s) sent.`,
    };
  }

  /**
   * Push PMS "issued" invoices to V6 ERP.
   *
   * V6 ERP Integration API:
   *   POST {baseUrl}/V6/v6IntegrationAPIlogin/saveInvoice
   *
   * PMS → V6 ERP field mapping:
   *   tenant.firstName     → hdr.customerCode   (must match V6 Customer Code)
   *   tenant name          → hdr.customerName
   *   invoiceNumber        → hdr.t1
   *   invoiceDate          → hdr.t3  (DD/MM/YYYY)
   *   dueDate              → hdr.t4  (DD/MM/YYYY)
   *   currency             → hdr.t8
   *   totalAmount          → hdr.n5, hdr.n10, hdr.subTotal
   *   lines[].chargeType   → dtls[].t2 (code), dtls[].t3 (name)
   *   lines[].quantity     → dtls[].n6, dtls[].n44
   *   lines[].unitPrice    → dtls[].n34
   *   lines[].lineTotal    → dtls[].n38, dtls[].n49, dtls[].n14
   *
   * Config (stored in IntegrationConfig for type = 'v6erp'):
   *   config.baseUrl          — e.g. http://localhost:8080
   *   config.domain           — V6 ERP domain name  e.g. "demo"  (default: "demo")
   */
  async pushInvoicesToV6Erp(companyId: string, invoiceIds?: string[], skipLog = false) {
    // ── 1. Load V6 ERP integration config ──────────────────────────────────
    const config = await prisma.integrationConfig.findFirst({
      where: { companyId, integrationType: 'v6erp', status: { not: 'disabled' } },
    });

    if (!config) {
      throw AppError.notFound(
        'V6 ERP integration not configured. Go to Developer → Integrations → Add Integration (V6 ERP).',
      );
    }

    const cfg   = (config.config      || {}) as Record<string, string>;
    const creds = (config.credentials || {}) as Record<string, string>;

    // Accept base URL from either config.baseUrl OR credentials.apiUrl
    const baseUrl = (cfg.baseUrl || creds.apiUrl || '').replace(/\/$/, '');
    if (!baseUrl) {
      throw new AppError(
        400, 'V6ERP_NOT_CONFIGURED',
        '🔶 V6 ERP API URL is not configured. Edit the integration and set config.baseUrl (e.g. http://localhost:8080).',
      );
    }

    const domain = cfg.domain || 'demo';

    // ── 2. Fetch issued invoices WITH line items ────────────────────────────
    const whereClause: any = { companyId, status: 'issued' };
    if (invoiceIds && invoiceIds.length > 0) {
      whereClause.id = { in: invoiceIds };
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        tenant:   { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        unit:     { select: { id: true, unitNumber: true } },
        lines: {
          include: { chargeType: { select: { id: true, code: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    if (invoices.length === 0) {
      if (!skipLog) {
        await prisma.integrationSyncLog.create({
          data: {
            companyId,
            integrationId: config.id,
            syncType: 'invoice_push',
            direction: 'push',
            status: 'success',
            recordsProcessed: 0,
            recordsCreated: 0,
            recordsUpdated: 0,
            recordsFailed: 0,
            errorDetails: [],
            durationMs: 50,
            initiatedBy: 'user',
            completedAt: new Date(),
          },
        }).catch(() => {});
        await prisma.integrationConfig.update({
          where: { id: config.id },
          data: { lastSyncAt: new Date() },
        }).catch(() => {});
      }
      return { sent: 0, failed: 0, skipped: 0, results: [], message: 'No issued invoices found to send.' };
    }

    // ── 3. V6 ERP Endpoints & Helpers ─────────────────────────────────────
    let cleanRoot = baseUrl.replace(/\/+$/, '');
    if (!/\/V6$/i.test(cleanRoot) && !/\/v6_addon$/i.test(cleanRoot)) {
      cleanRoot = `${cleanRoot}/V6`;
    }
    const integrationEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/saveInvoice`;
    const customerEndpoint    = `${cleanRoot}/v6IntegrationAPIlogin/getCustomer`;
    const headers = { 'Content-Type': 'application/json' };

    // Customer syskey cache (avoid repeated lookups for same customer in one batch)
    const customerSyskeyCache: Record<string, string> = {};

    // Date formatter: YYYYMMDD (Integration API format)
    const fmtV6Date = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    const results: Array<{
      invoiceId: string; invoiceNumber: string; customerCode: string;
      status: 'sent' | 'failed' | 'skipped'; error?: string;
    }> = [];

    for (const inv of invoices) {
      // Derive V6 customer code from tenant
      const customerCode = inv.tenant
        ? (inv.tenant.tenantType === 'individual'
            ? inv.tenant.firstName || ''
            : inv.tenant.companyName || '')
        : '';

      const customerName = inv.tenant
        ? (inv.tenant.tenantType === 'individual'
            ? `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim()
            : inv.tenant.companyName || '')
        : '';

      if (!customerCode) {
        results.push({
          invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerCode: '',
          status: 'skipped',
          error: 'Tenant firstName is empty — cannot map to V6 CustomerCode',
        });
        continue;
      }

      try {
        // ── Look up customer syskey by customer code via V6 Integration API ──
        let cuskey = customerSyskeyCache[customerCode] || '';

        if (!cuskey) {
          try {
            const intCustResp = await fetch(customerEndpoint, {
              method:  'POST',
              headers,
              body:    JSON.stringify({ domain, code: customerCode, date: '' }),
              signal:  AbortSignal.timeout(5000),
            });
            if (intCustResp.ok) {
              const intCustJson = await intCustResp.json() as any;
              const custList: any[] = intCustJson?.list || [];
              const match = custList.find((c: any) =>
                (c.code || c.customerCode || c.t1 || '').trim().toLowerCase() === customerCode.trim().toLowerCase()
              ) || custList[0];
              const sk = match?.syskey || match?.customerSyskey || '';
              if (sk && sk !== '0') {
                cuskey = String(sk);
                customerSyskeyCache[customerCode] = cuskey;
                logger.info(`V6 ERP: Customer ${customerCode} syskey = ${cuskey}`);
              }
            }
          } catch { /* getCustomer API failed */ }
        }

        if (!cuskey) {
          results.push({
            invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerCode,
            status: 'failed',
            error: `Customer "${customerCode}" not found in V6 ERP. Please create this customer in V6 ERP first.`,
          });
          continue;
        }

        const unitNumber = (inv.unit?.unitNumber || (inv as any).unitNumber || '').trim();

        // ── Build Integration API payload (simple!) ───────────────────────
        // V6 ERP handles all GL accounts, UOM, ref number auto-generation
        const integrationPayload = {
          cuskey,
          cuscode:    customerCode,
          date:       fmtV6Date(inv.invoiceDate),
          refno:      'TBA',             // V6 ERP auto-generates (e.g. INV-000012)
          secref:     inv.invoiceNumber, // PMS Invoice No as Second Ref
          amount:     Number(inv.totalAmount),
          savestatus: 4,                 // 4 = Posted
          domain,
          remark:     `PMS: ${inv.invoiceNumber}`,
          remark1:    customerName,
          remark2:    (inv as any).lines.map((l: any) => l.description || l.chargeType?.name || '').filter(Boolean).join(', ') || 'PMS Invoice',
          intime:     unitNumber,        // Maps to SOP002.t2 (Unit/Stock Code) via trigger
          details: (inv as any).lines.map((line: any) => {
            const lineDesc = line.description || line.chargeType?.name || '';
            return {
              qty:          Number(line.quantity)  || 1,
              price:        Number(line.unitPrice) || 0,
              amount:       Number(line.lineTotal) || Number(line.amount) || 0,
              desc:         lineDesc,
              actualweight: lineDesc,          // Transferred via V6 Java API into SOP002.t13 -> SOP002.t3
              uom:          line.unit || 'Each',
            };
          }),
        };

        logger.info(`V6 ERP: Pushing invoice ${inv.invoiceNumber} | customer=${customerCode} | amt=${inv.totalAmount}`);

        const abortCtrl = new AbortController();
        const timer = setTimeout(() => abortCtrl.abort(), 30000);
        const resp = await fetch(integrationEndpoint, {
          method:  'POST',
          headers,
          body:    JSON.stringify(integrationPayload),
          signal:  abortCtrl.signal,
        });
        clearTimeout(timer);

        const respText = await resp.text().catch(() => '');
        let v6Json: any = null;
        try { v6Json = JSON.parse(respText); } catch { /* not JSON */ }

        // Integration API response: {status: "SUCCESS"} or {status: "FAIL", message: "..."}
        const v6Status        = v6Json?.status  || '';
        const v6Msg           = v6Json?.message || '';
        const isSuccess       = v6Status === 'SUCCESS';
        const isAlreadyExists = v6Msg   === 'ManualRefExist';

        if (isSuccess || isAlreadyExists) {
          results.push({
            invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerCode, status: 'sent',
            error: isSuccess ? '✅ V6 ERP saved successfully' : '⚠️ Already exists in V6 ERP (ManualRefExist)',
          });
          logger.info(`V6 ERP: Invoice ${inv.invoiceNumber} → ${isSuccess ? '✅ SUCCESS' : '⚠️ Already exists'}`);

          // Update Invoice status to 'sent' in PMS
          await prisma.invoice.update({
            where: { id: inv.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
            },
          }).catch(upErr => logger.warn(`Failed to update invoice status for ${inv.invoiceNumber}: ${upErr.message}`));

          // Persist to IntegrationEntityMap
          await prisma.integrationEntityMap.upsert({
            where: {
              integrationId_entityType_pmsId: {
                integrationId: config.id,
                entityType: 'invoice',
                pmsId: inv.id,
              },
            },
            create: {
              companyId,
              integrationId: config.id,
              entityType: 'invoice',
              pmsId: inv.id,
              externalId: inv.invoiceNumber,
              externalRef: `Customer: ${customerCode}`,
              syncedAt: new Date(),
            },
            update: {
              externalId: inv.invoiceNumber,
              externalRef: `Customer: ${customerCode}`,
              syncedAt: new Date(),
            },
          }).catch(mapErr => logger.warn(`Failed to update entity map for ${inv.invoiceNumber}: ${mapErr.message}`));

        } else {
          const errDetail = v6Msg || v6Status || respText.substring(0, 300);
          results.push({
            invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerCode, status: 'failed',
            error: `V6 error: ${errDetail}`,
          });
          logger.warn(`V6 ERP: Invoice ${inv.invoiceNumber} rejected — ${errDetail}`);
        }

      } catch (err: any) {
        const errMsg = err.name === 'AbortError' ? 'Request timeout (30s)' : err.message;
        results.push({
          invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerCode, status: 'failed',
          error: errMsg,
        });
        logger.error(`V6 ERP: Invoice ${inv.invoiceNumber} push error — ${errMsg}`);
      }
    }

    // ── 7. Record sync log & update last sync timestamp ───────────────────
    const sentCount = results.filter(r => r.status === 'sent').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    if (!skipLog) {
      await prisma.integrationSyncLog.create({
        data: {
          companyId,
          integrationId: config.id,
          syncType: 'invoice_push',
          direction: 'push',
          status: failedCount === 0 ? 'success' : (sentCount > 0 ? 'partial' : 'failed'),
          recordsProcessed: invoices.length,
          recordsCreated: sentCount,
          recordsUpdated: 0,
          recordsFailed: failedCount,
          errorDetails: results.filter(r => r.status === 'failed'),
          durationMs: 1200,
          initiatedBy: 'user',
          completedAt: new Date(),
        },
      }).catch(logErr => logger.warn(`Failed to record sync log: ${logErr.message}`));

      await prisma.integrationConfig.update({
        where: { id: config.id },
        data: { lastSyncAt: new Date() },
      });
    }

    logger.info(`V6 ERP push complete: ${sentCount}/${invoices.length} invoices sent`, { companyId });

    return {
      sent:    sentCount,
      failed:  results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
      message: `${sentCount} invoice(s) sent to V6 ERP.`,
    };
  }
}

export const integrationsService = new IntegrationsService();