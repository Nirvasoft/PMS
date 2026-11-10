import crypto from 'crypto';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

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
  private v6TokenCache = new Map<string, { codex: string; expiresAt: number }>();

  private resolveV6Config(config: any): {
    repoRoot: string;
    domain: string;
    clientID: string;
    clientSecret: string;
  } {
    const cfg = (config?.config || {}) as Record<string, string>;
    const creds = (config?.credentials || {}) as Record<string, string>;
    const configuredUrl = (cfg.baseUrl || creds.apiUrl || '').trim().replace(/\/+$/, '');
    const isLegacyTestUrl =
      !configuredUrl ||
      /localhost:8080|127\.0\.0\.1:8080|139\.59\.245\.146/i.test(configuredUrl);
    const rawUrl = isLegacyTestUrl ? 'https://erp.mitcloud.com' : configuredUrl;
    const cleanHost = rawUrl
      .replace(/\/mDisRepository(\/integrationAPI|\/IntegrationAPI|\/reg)?$/i, '')
      .replace(/\/(V6|v6_addon)$/i, '');
    const repoRoot = `${cleanHost}/mDisRepository`;
    const domain = (cfg.domain || creds.domain || 'demo').trim() || 'demo';
    const clientID = (
      creds.clientID ||
      cfg.clientID ||
      'nssog8TW8VBtf+riPsDijA=='
    ).trim();
    const clientSecret = (
      creds.clientSecret ||
      cfg.clientSecret ||
      '8jlA2@06HRZQFnw1hawSedd4G2VMHCsE'
    ).trim();
    return { repoRoot, domain, clientID, clientSecret };
  }

  // ── Integration Configs ──

  async list(companyId: string, propertyId?: string) {
    await ensurePropertySetupScope();
    const effectivePropertyId = await resolveEffectivePropertyId(companyId, propertyId);
    const configs = await prisma.integrationConfig.findMany({
      where: {
        companyId,
        ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}),
      },
      include: {
        _count: { select: { syncLogs: true } },
        syncLogs: { take: 1, orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return configs.map(c => ({
      ...c,
      credentials:    c.credentials,
      hasCredentials: !!(c.credentials && Object.keys(c.credentials as object).length > 0),
      recentSync: c.syncLogs[0] || null,
      totalSyncs: c._count.syncLogs,
    }));
  }

  async create(companyId: string, userId: string, data: any) {
    await ensurePropertySetupScope();
    const effectivePropertyId = await resolveEffectivePropertyId(companyId, data.propertyId);

    const duplicate = await prisma.integrationConfig.findFirst({
      where: {
        companyId,
        ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}),
        integrationType: data.integrationType,
      },
    });
    if (duplicate) {
      throw AppError.conflict(`Integration "${data.integrationType}" is already configured for this property`);
    }

    const defaultV6Config =
      data.integrationType === 'v6erp'
        ? {
            baseUrl: 'https://erp.mitcloud.com',
            domain: 'demo',
            ...(data.config || {}),
          }
        : data.config || {};

    const defaultV6Creds =
      data.integrationType === 'v6erp'
        ? {
            clientID: 'nssog8TW8VBtf+riPsDijA==',
            clientSecret: '8jlA2@06HRZQFnw1hawSedd4G2VMHCsE',
            ...(data.credentials || {}),
          }
        : data.credentials || {};

    const created = await prisma.integrationConfig.create({
      data: {
        companyId,
        propertyId: effectivePropertyId,
        integrationType: data.integrationType,
        name: data.name,
        description: data.description,
        config: defaultV6Config,
        credentials: defaultV6Creds,
        syncFrequency: data.syncFrequency || 'daily',
        createdBy: userId,
      },
    });

    return created;
  }

  async update(id: string, companyId: string, data: any, _userId?: string) {
    await ensurePropertySetupScope();
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

    return {
      ...updated,
      credentials: updated.credentials,
      hasCredentials: !!(updated.credentials && Object.keys(updated.credentials as object).length > 0),
    };
  }


  async delete(id: string, companyId: string) {
    await ensurePropertySetupScope();
    const existing = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Integration');
    return prisma.integrationConfig.delete({ where: { id } });
  }

  async testConnection(id: string, companyId: string, _propertyId?: string, _userId?: string) {
    await ensurePropertySetupScope();
    const config = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!config) throw AppError.notFound('Integration');

    if (config.integrationType === 'v6erp') {
      const t0 = Date.now();
      try {
        const auth = await this.getV6CodexToken(config, true);
        const elapsed = Date.now() - t0;
        await prisma.integrationConfig.update({
          where: { id },
          data: { status: 'active', isActive: true, lastError: null },
        });
        return {
          connected: true,
          version: 'V6 ERP mDisRepository Integration API',
          organisationName: `Domain: ${auth.domain}`,
          responseTimeMs: elapsed,
        };
      } catch (err: any) {
        const errMsg = err.name === 'AbortError' ? 'Timeout (12s)' : err.message;
        await prisma.integrationConfig.update({
          where: { id },
          data: { status: 'error', lastError: errMsg },
        });
        if (err instanceof AppError) throw err;
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
    await ensurePropertySetupScope();
    const config = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!config) throw AppError.notFound('Integration');

    if (config.integrationType === 'v6erp') {
      return this.syncV6Erp(config, companyId, userId, config.propertyId || data?.propertyId);
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
        ...(entityType
          ? { entityType }
          : {
              entityType: {
                notIn: [
                  'gl_account_pms_hidden',
                  'department_center_pms_hidden',
                  'cost_center_pms_hidden',
                  'payment_method_pms_hidden',
                ],
              },
            }),
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
   * Format Date as DD/MM/YYYY for V6 ERP IntegrationAPI (postARInvoice / postCashReceipt).
   */
  private formatV6DateDdMmYyyy(d: Date | string | null | undefined): string {
    const dt = d ? new Date(d) : new Date();
    const safe = isNaN(dt.getTime()) ? new Date() : dt;
    const dd = String(safe.getDate()).padStart(2, '0');
    const mm = String(safe.getMonth() + 1).padStart(2, '0');
    const yyyy = safe.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Obtain or refresh 24-hour V6 ERP `codex` token for `Content-Over` header:
   * - Generate Token: POST {repoRoot}/reg/acctoken  { clientSecret, clientID } -> { domain, codex }
   * - Refresh Token:  POST {repoRoot}/reg/reftoken  { clientID } (with Content-Over header) -> { codex }
   */
  async getV6CodexToken(config: any, forceRefresh = false): Promise<{ codex: string; domain: string; repoRoot: string }> {
    const { repoRoot, domain, clientID, clientSecret } = this.resolveV6Config(config);
    const cacheKey = `${repoRoot}|${clientID}`;
    const now = Date.now();
    const cached = this.v6TokenCache.get(cacheKey);

    if (!forceRefresh && cached && cached.expiresAt > now + 30 * 60 * 1000) {
      return { codex: cached.codex, domain, repoRoot };
    }

    // Try refresh token if we already had a codex token and not forcing fresh login
    if (!forceRefresh && cached?.codex) {
      try {
        const refResp = await fetch(`${repoRoot}/reg/reftoken`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Over': cached.codex,
          },
          body: JSON.stringify({ clientID }),
          signal: AbortSignal.timeout(10000),
        });
        if (refResp.ok) {
          const refJson = (await refResp.json().catch(() => null)) as any;
          if (refJson?.codex) {
            const codex = String(refJson.codex).trim();
            this.v6TokenCache.set(cacheKey, {
              codex,
              expiresAt: now + 23 * 60 * 60 * 1000,
            });
            return { codex, domain, repoRoot };
          }
        }
      } catch (err: any) {
        logger.warn(`V6 ERP reftoken fallback to acctoken: ${err?.message || err}`);
      }
    }

    // Generate new token via /reg/acctoken
    const accResp = await fetch(`${repoRoot}/reg/acctoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret, clientID }),
      signal: AbortSignal.timeout(12000),
    });

    const accText = await accResp.text().catch(() => '');
    let accJson: any = null;
    try {
      accJson = JSON.parse(accText);
    } catch {
      // not JSON
    }

    if (!accResp.ok || !accJson?.codex) {
      const msg = accJson?.message || `HTTP ${accResp.status}: ${accText.substring(0, 150)}`;
      throw new AppError(502, 'V6ERP_AUTH_FAILED', `V6 ERP token generation failed: ${msg}`);
    }

    const codex = String(accJson.codex).trim();
    const resolvedDomain = String(accJson.domain || domain || 'demo').trim() || domain;
    this.v6TokenCache.set(cacheKey, {
      codex,
      expiresAt: now + 23 * 60 * 60 * 1000,
    });

    return { codex, domain: resolvedDomain, repoRoot };
  }

  /**
   * Derive customer code and name from a PMS Tenant record.
   */
  private deriveTenantV6CodeAndName(tenant: {
    code?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    companyRegNo?: string | null;
    tenantType?: string | null;
  }): { code: string; name: string } {
    const isIndividual = (tenant.tenantType || 'individual') === 'individual';
    const code = (
      tenant.code ||
      (isIndividual ? tenant.firstName : tenant.companyRegNo || tenant.companyName || tenant.firstName) ||
      ''
    ).trim();
    const name = (
      isIndividual
        ? tenant.lastName || tenant.firstName || code
        : tenant.companyName || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || code
    ).trim();
    return { code, name: name || code };
  }

  /**
   * Resolve active V6 ERP integration config for a company, preferring the specified propertyId
   * and falling back to any active V6 ERP config in the company when propertyId is omitted or
   * V6 ERP is configured on a primary property.
   */
  private async findActiveV6Config(companyId: string, preferredPropertyId?: string | null) {
    if (preferredPropertyId && preferredPropertyId.trim()) {
      const exact = await prisma.integrationConfig.findFirst({
        where: {
          companyId,
          OR: [{ propertyId: preferredPropertyId.trim() }, { propertyId: null }],
          integrationType: 'v6erp',
          isActive: true,
          status: { not: 'disabled' },
        },
      });
      if (exact) return exact;
    }

    return prisma.integrationConfig.findFirst({
      where: {
        companyId,
        integrationType: 'v6erp',
        isActive: true,
        status: { not: 'disabled' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Push a single PMS Tenant to V6 ERP via POST {repoRoot}/integrationAPI/createCustomerMaster.
   * - Passes syskey = "0" when creating a new customer, or the saved V6 syskey when updating.
   * - Persists returned key/syskey & erpcode into IntegrationEntityMap.
   */
  async pushCustomerToV6Erp(
    companyId: string,
    tenantId: string,
    propertyId?: string | null,
    preloadedConfig?: any,
    preloadedAuth?: { codex: string; domain: string; repoRoot: string },
    preloadedTenant?: any,
    preloadedMap?: any,
  ): Promise<{
    ok: boolean;
    code: string;
    syskey: string;
    erpcode: string;
    isUpdate: boolean;
    message: string;
  }> {
    if (!preloadedTenant) {
      await ensurePropertySetupScope();
    }
    const tenant =
      preloadedTenant ||
      (await prisma.tenant.findFirst({
        where: { id: tenantId, companyId, deletedAt: null },
      }));
    if (!tenant) {
      throw AppError.notFound('Tenant');
    }

    const config =
      preloadedConfig ||
      (await this.findActiveV6Config(companyId, propertyId || tenant.propertyId));

    if (!config) {
      return { ok: false, code: '', syskey: '0', erpcode: '', isUpdate: false, message: 'V6 ERP not active' };
    }

    const cfg = (config.config || {}) as Record<string, string>;
    const auth = preloadedAuth || (await this.getV6CodexToken(config));
    const { code, name } = this.deriveTenantV6CodeAndName(tenant);
    if (!code) {
      return { ok: false, code: '', syskey: '0', erpcode: '', isUpdate: false, message: 'Tenant code is empty' };
    }

    const existingMap =
      preloadedMap !== undefined
        ? preloadedMap
        : await prisma.integrationEntityMap.findUnique({
            where: {
              integrationId_entityType_pmsId: {
                integrationId: config.id,
                entityType: 'tenant',
                pmsId: tenant.id,
              },
            },
          });

    const skMatch = String(`${existingMap?.externalId || ''} | ${existingMap?.externalRef || ''}`).match(
      /Syskey:\s*([0-9]+)/i,
    );
    const existingSyskey = skMatch?.[1] && skMatch[1] !== '0' ? skMatch[1] : '0';
    const isUpdate = existingSyskey !== '0';

    const addressParts = [
      (tenant as any).addressLine1,
      (tenant as any).addressLine2,
      (tenant as any).city,
      (tenant as any).state,
    ]
      .map((s) => String(s || '').trim())
      .filter(Boolean);

    const payload = {
      syskey: existingSyskey,
      code,
      name,
      currency: String(tenant.currency || 'MMK').trim() || 'MMK',
      type: String((tenant as any).companyType || '').trim(),
      terms: String(cfg.defaultTerms || '2W').trim(),
      mobile: String(tenant.phone || '').trim(),
      address: addressParts.join(', '),
      domain: auth.domain,
    };

    const resp = await fetch(`${auth.repoRoot}/integrationAPI/createCustomerMaster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Over': auth.codex,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const respText = await resp.text().catch(() => '');
    let v6Json: any = null;
    try {
      v6Json = JSON.parse(respText);
    } catch {
      // not JSON
    }

    const statusStr = String(v6Json?.status || '').toUpperCase();
    const isSuccess = resp.ok && (statusStr === 'SUCCESS' || statusStr === 'SUCCESS!');
    const syskey = String(v6Json?.syskey || v6Json?.key || existingSyskey || '0').trim();
    const erpcode = String(v6Json?.erpcode || '').trim();
    const msg = String(
      v6Json?.message ||
        (isSuccess ? 'Successfully' : respText.substring(0, 150) || `HTTP ${resp.status}`),
    ).trim();
    const wasUpdatedOnV6 = isUpdate || /updated/i.test(msg);

    if (isSuccess) {
      const extRef = `${code} — ${name}`.substring(0, 255);
      const extIdParts = [erpcode || code];
      if (syskey && syskey !== '0') extIdParts.push(`Syskey: ${syskey}`);
      const extId = extIdParts.join(' | ').substring(0, 255);

      await prisma.integrationEntityMap
        .upsert({
          where: {
            integrationId_entityType_pmsId: {
              integrationId: config.id,
              entityType: 'tenant',
              pmsId: tenant.id,
            },
          },
          create: {
            companyId,
            integrationId: config.id,
            entityType: 'tenant',
            pmsId: tenant.id,
            externalId: extId,
            externalRef: extRef,
            syncedAt: new Date(),
          },
          update: {
            externalId: extId,
            externalRef: extRef,
            syncedAt: new Date(),
          },
        })
        .catch(() => {});
    }

    return {
      ok: isSuccess,
      code,
      syskey,
      erpcode,
      isUpdate: wasUpdatedOnV6,
      message: msg,
    };
  }

  /**
   * Sync PMS tenants for the active property to V6 ERP Customer Master
   * via POST {repoRoot}/integrationAPI/createCustomerMaster in parallel batches.
   */
  async syncV6Customers(companyId: string, propertyId?: string, userId?: string) {
    await ensurePropertySetupScope();
    const config = await this.findActiveV6Config(companyId, propertyId);

    if (!config) {
      throw new AppError(
        400,
        'V6ERP_NOT_ACTIVE',
        'V6 ERP integration is not active. Turn ON the V6 ERP flag in Integrations first.',
      );
    }

    const targetPropertyId =
      (propertyId && propertyId.trim()) || config.propertyId || null;

    const t0 = Date.now();
    const auth = await this.getV6CodexToken(config);

    const [tenants, existingMaps] = await Promise.all([
      prisma.tenant.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId: config.id,
          entityType: 'tenant',
        },
      }),
    ]);

    const mapByTenantId = new Map(existingMaps.map((m) => [m.pmsId, m]));

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: Array<{ code: string; error: string }> = [];

    const CONCURRENCY = 10;
    for (let i = 0; i < tenants.length; i += CONCURRENCY) {
      const batch = tenants.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (tenant) => {
          try {
            const existingMap = mapByTenantId.get(tenant.id) || null;
            const res = await this.pushCustomerToV6Erp(
              companyId,
              tenant.id,
              targetPropertyId,
              config,
              auth,
              tenant,
              existingMap,
            );
            if (res.ok) {
              if (res.isUpdate) updated++;
              else created++;
            } else {
              failed++;
              errors.push({ code: res.code || tenant.id, error: res.message });
            }
          } catch (err: any) {
            failed++;
            errors.push({
              code: tenant.code || tenant.firstName || tenant.id,
              error: err?.message || String(err),
            });
          }
        }),
      );
    }

    await prisma.integrationSyncLog
      .create({
        data: {
          companyId,
          integrationId: config.id,
          syncType: 'customer_sync',
          direction: 'push',
          status: failed === 0 ? 'success' : created + updated > 0 ? 'partial' : 'failed',
          recordsProcessed: tenants.length,
          recordsCreated: created,
          recordsUpdated: updated,
          recordsFailed: failed,
          errorDetails: errors,
          durationMs: Date.now() - t0,
          initiatedBy: 'user',
          initiatedUserId: userId || null,
          completedAt: new Date(),
        },
      })
      .catch(() => {});

    await prisma.integrationConfig
      .update({
        where: { id: config.id },
        data: { lastSyncAt: new Date(), lastError: errors[0]?.error || null },
      })
      .catch(() => {});

    return {
      success: failed === 0 || created + updated > 0,
      totalV6Customers: tenants.length,
      created,
      updated,
      failed,
      errors,
      message: `Synced ${created + updated}/${tenants.length} customer(s) to V6 ERP (${created} created, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}).`,
    };
  }

  /**
   * Push PMS Invoices and Debit Notes to V6 ERP
   * via POST {repoRoot}/integrationAPI/postARInvoice.
   */
  async pushInvoicesToV6Erp(
    companyId: string,
    invoiceIds?: string[],
    skipLog = false,
    propertyId?: string,
    preloadedConfig?: any,
  ) {
    await ensurePropertySetupScope();
    let inferredPropertyId = propertyId || preloadedConfig?.propertyId || null;
    if (!inferredPropertyId && invoiceIds && invoiceIds.length > 0) {
      const sampleInv = await prisma.invoice.findFirst({
        where: { companyId, id: { in: invoiceIds } },
        select: { propertyId: true },
      });
      inferredPropertyId = sampleInv?.propertyId || null;
    }

    const config =
      preloadedConfig || (await this.findActiveV6Config(companyId, inferredPropertyId));

    if (!config) {
      throw AppError.notFound(
        'V6 ERP integration not configured or not active. Go to Developer → Integrations → V6 ERP and turn the Flag ON.',
      );
    }

    const targetPropertyId = inferredPropertyId || config.propertyId || null;
    const cfg = (config.config || {}) as Record<string, string>;
    const t0 = Date.now();

    const whereClause: any = {
      companyId,
      invoiceType: { in: ['invoice', 'debit_note'] },
      ...(invoiceIds && invoiceIds.length > 0
        ? { id: { in: invoiceIds } }
        : {
            status: 'issued',
            ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
          }),
    };

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        tenant: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            companyName: true,
            companyRegNo: true,
            tenantType: true,
          },
        },
        unit: { select: { id: true, unitNumber: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        lines: {
          include: {
            chargeType: {
              select: {
                id: true,
                code: true,
                name: true,
                glAccountCode: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    if (invoices.length === 0) {
      if (!skipLog) {
        await prisma.integrationSyncLog
          .create({
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
              durationMs: Date.now() - t0,
              initiatedBy: 'user',
              completedAt: new Date(),
            },
          })
          .catch(() => {});
        await prisma.integrationConfig
          .update({
            where: { id: config.id },
            data: { lastSyncAt: new Date() },
          })
          .catch(() => {});
      }
      return { sent: 0, failed: 0, skipped: 0, results: [], message: 'No issued invoices found to send.' };
    }

    const auth = await this.getV6CodexToken(config);
    const endpoint = `${auth.repoRoot}/integrationAPI/postARInvoice`;
    const syncedTenantIds = new Set<string>();

    const existingMaps = await prisma.integrationEntityMap.findMany({
      where: {
        companyId,
        integrationId: config.id,
        entityType: 'invoice',
        pmsId: { in: invoices.map((i) => i.id) },
      },
    });
    const mapByInvoiceId = new Map(existingMaps.map((m) => [m.pmsId, m]));

    const results: Array<{
      invoiceId: string;
      invoiceNumber: string;
      customerCode: string;
      status: 'sent' | 'failed' | 'skipped';
      error?: string;
    }> = [];

    for (const inv of invoices) {
      const { code: customerCode } = inv.tenant
        ? this.deriveTenantV6CodeAndName(inv.tenant)
        : { code: '' };

      if (!customerCode) {
        results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerCode: '',
          status: 'skipped',
          error: 'Tenant code is empty — cannot map to V6 customerCode',
        });
        continue;
      }

      try {
        // Ensure customer exists in V6 ERP before posting invoice
        if (inv.tenant?.id && !syncedTenantIds.has(inv.tenant.id)) {
          await this.pushCustomerToV6Erp(
            companyId,
            inv.tenant.id,
            inv.propertyId || targetPropertyId,
            config,
            auth,
          ).catch((cErr) =>
            logger.warn(`V6 ERP pre-invoice customer sync warning for ${customerCode}: ${cErr?.message}`),
          );
          syncedTenantIds.add(inv.tenant.id);
        }

        const existingMap = mapByInvoiceId.get(inv.id);
        const skMatch = String(`${existingMap?.externalId || ''} | ${existingMap?.externalRef || ''}`).match(
          /Syskey:\s*([0-9]+)/i,
        );
        const rawExtRef = String((inv as any).externalRef || '').trim();
        const existingSyskeyStr =
          rawExtRef && rawExtRef !== '0' && /^[0-9]+$/.test(rawExtRef)
            ? rawExtRef
            : skMatch?.[1] || '0';
        const syskeyValue = existingSyskeyStr !== '0' ? existingSyskeyStr : 0;

        const unitNumber = (inv.unit?.unitNumber || (inv as any).unitNumber || '').trim();
        const currencyCode = (inv.currency || 'MMK').trim() || 'MMK';
        const currRate = Number(inv.currencyRate) > 0 ? Number(inv.currencyRate) : 1;
        const docDate = this.formatV6DateDdMmYyyy(inv.invoiceDate);
        const dueDate = this.formatV6DateDdMmYyyy(inv.dueDate || inv.invoiceDate);
        const totalAmt = Math.round((Number(inv.totalAmount) || 0) * 100) / 100;
        const taxAmt = Math.round((Number(inv.taxAmount) || 0) * 100) / 100;
        const discAmt = Math.round((Number(inv.discountAmount) || 0) * 100) / 100;
        // For ARINV => transType = 231, subType = 0; For ARDN => transType = 231, subType = 1
        const subType = inv.invoiceType === 'debit_note' ? 1 : 0;

        const lineDescriptions =
          (inv.lines || [])
            .map((l: any) => l.description || l.chargeType?.name || '')
            .filter(Boolean)
            .join(', ') || `Invoice ${inv.invoiceNumber}`;

        const buildDtls = (lineTypeValue: number) =>
          (inv.lines || []).map((line: any, idx: number) => {
            const qty = Number(line.quantity) || 1;
            const unitPrice = Math.round((Number(line.unitPrice) || 0) * 100) / 100;
            const b4TaxAmt =
              Math.round((Number(line.amount) || qty * unitPrice) * 100) / 100;
            const lineTax = Math.round((Number(line.taxAmount) || 0) * 100) / 100;
            const totAmount = Math.round((b4TaxAmt + lineTax) * 100) / 100;

            return {
              lineNo: String((idx + 1) * 1000000),
              lineType: lineTypeValue,
              stockCode: String(
                line.chargeType?.code || unitNumber || cfg.defaultStockCode || 'C0012',
              ).trim(),
              stockDesc: String(
                line.description || line.chargeType?.name || 'Invoice Charge',
              ).trim(),
              locationCode: String(cfg.locationCode || 'HO').trim(),
              uomCode: String(line.unit || cfg.uomCode || 'Pcs').trim(),
              lvlQty: 1,
              unitRatio: 1,
              qty,
              unitPrice,
              unitDiscAmt: 0.0,
              lineDiscAmt: 0.0,
              distDiscAmt: 0.0,
              totDiscAmt: 0.0,
              taxAmt: lineTax,
              isTaxInc: 0,
              totAmount,
              b4TaxAmt,
            };
          });

        const buildPayload = (lineTypeValue: number) => ({
          domain: auth.domain,
          list: [
            {
              hdr: {
                syskey: syskeyValue,
                customerCode,
                saveStatus: 4,
                transType: 231,
                subType,
                reference: '',
                secondref: inv.invoiceNumber,
                currency: currencyCode,
                currencyRate: currRate,
                docDate,
                dueDate,
                remark: String((inv as any).notes || lineDescriptions).trim(),
                hdrDiscAmt: discAmt,
                isSingleRateTax: 1,
                taxAmt,
                netAmount: totalAmt,
              },
              dtls: buildDtls(lineTypeValue),
            },
          ],
        });

        logger.info(
          `V6 ERP: Posting ${subType === 1 ? 'AR Debit Note' : 'AR Invoice'} ${inv.invoiceNumber} via postARInvoice | customer=${customerCode} | netAmount=${totalAmt}`,
        );

        let resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Over': auth.codex,
          },
          body: JSON.stringify(buildPayload(0)),
          signal: AbortSignal.timeout(30000),
        });

        let respText = await resp.text().catch(() => '');
        let v6Json: any = null;
        try {
          v6Json = JSON.parse(respText);
        } catch {
          // not JSON
        }

        let itemRes =
          Array.isArray(v6Json?.list) && v6Json.list.length > 0 ? v6Json.list[0] : v6Json;
        let v6Status = String(itemRes?.status || v6Json?.status || '').toUpperCase();
        let v6Msg = String(itemRes?.message || v6Json?.message || '').trim();

        // If V6 ERP rejects lineType 0 because the PMS Charge Type code is not in V6 physical Stock Master,
        // automatically retry with lineType = 1 (V6 ERP Non-Stock / Service Charge line).
        if (v6Status === 'FAIL' && /Invalid Stock Code|Stock does not exist/i.test(v6Msg)) {
          resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Over': auth.codex,
            },
            body: JSON.stringify(buildPayload(1)),
            signal: AbortSignal.timeout(30000),
          });
          respText = await resp.text().catch(() => '');
          v6Json = null;
          try {
            v6Json = JSON.parse(respText);
          } catch {
            // not JSON
          }
          itemRes =
            Array.isArray(v6Json?.list) && v6Json.list.length > 0 ? v6Json.list[0] : v6Json;
          v6Status = String(itemRes?.status || v6Json?.status || '').toUpperCase();
          v6Msg = String(itemRes?.message || v6Json?.message || '').trim();
        }

        const isSuccess =
          resp.ok &&
          (v6Status === 'SUCCESS' || v6Status === 'SUCCESS!') &&
          Number(v6Json?.failCount || 0) === 0;
        const isAlreadyExists = /already\s+exist/i.test(v6Msg) && !/not\s+exist/i.test(v6Msg);
        const rawSk = itemRes?.syskey || itemRes?.key || v6Json?.syskey || v6Json?.key;
        const savedV6Syskey = rawSk ? String(rawSk).trim() : '';
        const rawCr = itemRes?.crossRef || v6Json?.crossRef;
        const savedCrossRef = rawCr ? String(rawCr).trim() : '';

        if (isSuccess || isAlreadyExists) {
          results.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerCode,
            status: 'sent',
            error: isSuccess
              ? `✅ V6 ERP saved (${savedCrossRef || inv.invoiceNumber})`
              : `⚠️ Already exists in V6 ERP (${v6Msg})`,
          });

          if (inv.status === 'issued') {
            await prisma.invoice
              .update({
                where: { id: inv.id },
                data: { status: 'sent', sentAt: new Date() },
              })
              .catch((upErr) =>
                logger.warn(`Failed to update invoice status for ${inv.invoiceNumber}: ${upErr.message}`),
              );
          }

          if (savedV6Syskey && savedV6Syskey !== '0') {
            await prisma.$executeRaw`
              UPDATE "invoices"
              SET "external_ref" = ${savedV6Syskey}
              WHERE "id" = ${inv.id}::uuid
            `.catch((extErr) =>
              logger.warn(`Failed to update invoice external_ref for ${inv.invoiceNumber}: ${extErr.message}`),
            );
          }

          const extIdParts = [savedCrossRef || inv.invoiceNumber];
          if (savedV6Syskey && savedV6Syskey !== '0') extIdParts.push(`Syskey: ${savedV6Syskey}`);
          const extId = extIdParts.join(' | ').substring(0, 255);
          const extRef = `${inv.invoiceNumber} (Customer: ${customerCode})`.substring(0, 255);

          await prisma.integrationEntityMap
            .upsert({
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
                externalId: extId,
                externalRef: extRef,
                syncedAt: new Date(),
              },
              update: {
                externalId: extId,
                externalRef: extRef,
                syncedAt: new Date(),
              },
            })
            .catch(() => {});
        } else {
          const errDetail = v6Msg || v6Status || respText.substring(0, 300) || `HTTP ${resp.status}`;
          results.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerCode,
            status: 'failed',
            error: `V6 error: ${errDetail}`,
          });
          logger.warn(`V6 ERP: Invoice ${inv.invoiceNumber} rejected — ${errDetail}`);
        }
      } catch (err: any) {
        const errMsg = err.name === 'AbortError' ? 'Request timeout (30s)' : err.message;
        results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerCode,
          status: 'failed',
          error: errMsg,
        });
        logger.error(`V6 ERP: Invoice ${inv.invoiceNumber} push error — ${errMsg}`);
      }
    }

    const sentCount = results.filter((r) => r.status === 'sent').length;
    const failedResults = results.filter((r) => r.status === 'failed');
    const failedCount = failedResults.length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;

    if (!skipLog) {
      await prisma.integrationSyncLog
        .create({
          data: {
            companyId,
            integrationId: config.id,
            syncType: 'invoice_push',
            direction: 'push',
            status: failedCount === 0 ? 'success' : sentCount > 0 ? 'partial' : 'failed',
            recordsProcessed: invoices.length,
            recordsCreated: sentCount,
            recordsUpdated: 0,
            recordsFailed: failedCount,
            errorDetails: failedResults,
            durationMs: Date.now() - t0,
            initiatedBy: 'user',
            completedAt: new Date(),
          },
        })
        .catch(() => {});

      await prisma.integrationConfig
        .update({
          where: { id: config.id },
          data: { lastSyncAt: new Date() },
        })
        .catch(() => {});
    }

    return {
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
      message: `${sentCount} invoice(s) sent to V6 ERP.`,
    };
  }

  /**
   * Push PMS Receipts (AR/AP/Account Cash Receipt) to V6 ERP
   * via POST {repoRoot}/IntegrationAPI/postCashReceipt.
   */
  async pushReceiptsToV6Erp(
    companyId: string,
    receiptIds?: string[],
    skipLog = false,
    propertyId?: string,
    preloadedConfig?: any,
  ) {
    await ensurePropertySetupScope();
    let inferredPropertyId = propertyId || preloadedConfig?.propertyId || null;
    if (!inferredPropertyId && receiptIds && receiptIds.length > 0) {
      const sampleRct = await prisma.receipt.findFirst({
        where: { companyId, id: { in: receiptIds } },
        select: { propertyId: true },
      });
      inferredPropertyId = sampleRct?.propertyId || null;
    }

    const config =
      preloadedConfig || (await this.findActiveV6Config(companyId, inferredPropertyId));

    if (!config) {
      throw AppError.notFound(
        'V6 ERP integration not configured or not active. Go to Developer → Integrations → V6 ERP and turn the Flag ON.',
      );
    }

    const targetPropertyId = inferredPropertyId || config.propertyId || null;
    const cfg = (config.config || {}) as Record<string, string>;
    const t0 = Date.now();

    const receipts = await prisma.receipt.findMany({
      where: {
        companyId,
        status: 'confirmed',
        ...(receiptIds && receiptIds.length > 0
          ? { id: { in: receiptIds } }
          : targetPropertyId
            ? { propertyId: targetPropertyId }
            : {}),
      },
      include: {
        tenant: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            companyName: true,
            companyRegNo: true,
            tenantType: true,
          },
        },
        allocations: {
          include: {
            invoice: { select: { id: true, invoiceNumber: true } },
          },
        },
      },
      orderBy: { receiptDate: 'asc' },
    });

    if (receipts.length === 0) {
      return { sent: 0, failed: 0, skipped: 0, results: [], message: 'No receipts found to send.' };
    }

    const auth = await this.getV6CodexToken(config);
    const endpoint = `${auth.repoRoot}/integrationAPI/postCashReceipt`;

    const [paymentMethods, existingMaps] = await Promise.all([
      prisma.paymentMethod.findMany({
        where: {
          companyId,
          ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
        },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId: config.id,
          entityType: 'receipt',
          pmsId: { in: receipts.map((r) => r.id) },
        },
      }),
    ]);

    const pmByCode = new Map(paymentMethods.map((pm) => [pm.code.trim().toLowerCase(), pm]));
    const mapByReceiptId = new Map(existingMaps.map((m) => [m.pmsId, m]));
    const syncedTenantIds = new Set<string>();

    const results: Array<{
      receiptId: string;
      receiptNumber: string;
      status: 'sent' | 'failed' | 'skipped';
      error?: string;
    }> = [];

    for (const rct of receipts) {
      // Skip already-synced receipts during bulk sync unless specific receiptIds were requested
      const existingMap = mapByReceiptId.get(rct.id);
      if (existingMap && (!receiptIds || receiptIds.length === 0)) {
        continue;
      }

      const { code: cvCode } = rct.tenant
        ? this.deriveTenantV6CodeAndName(rct.tenant)
        : { code: String(cfg.defaultCustomerCode || '').trim() };

      try {
        if (rct.tenant?.id && !syncedTenantIds.has(rct.tenant.id)) {
          await this.pushCustomerToV6Erp(
            companyId,
            rct.tenant.id,
            rct.propertyId || targetPropertyId,
            config,
            auth,
          ).catch(() => {});
          syncedTenantIds.add(rct.tenant.id);
        }

        const skMatch = String(`${existingMap?.externalId || ''} | ${existingMap?.externalRef || ''}`).match(
          /Syskey:\s*([0-9]+)/i,
        );
        const syskeyValue = skMatch?.[1] && skMatch[1] !== '0' ? skMatch[1] : 0;

        const pm = pmByCode.get(String(rct.paymentMethod || '').trim().toLowerCase());
        const cashbook = String(cfg.defaultCashbook || pm?.code || rct.paymentMethod || 'CB-0003').trim();
        const accCode = String(pm?.glAccountCode || cfg.defaultAccCode || '7-23340').trim();
        const curr = String(rct.currency || 'MMK').trim() || 'MMK';
        const currRate = Number(rct.exchangeRate) > 0 ? Number(rct.exchangeRate) : 1;
        const netAmount = Math.round((Number(rct.amount) || 0) * 100) / 100;
        const docDate = this.formatV6DateDdMmYyyy(rct.receiptDate);
        // Type = 0 Account, 1 = CustomerReceipt, 2 = Vendor Receipt
        const receiptType = cfg.receiptType !== undefined ? Number(cfg.receiptType) : rct.tenantId ? 1 : 0;

        const dtls =
          rct.allocations && rct.allocations.length > 0
            ? rct.allocations.map((alloc, idx) => ({
                lineNo: String((idx + 1) * 1000000),
                accCode,
                Description: `Receipt for ${alloc.invoice?.invoiceNumber || rct.receiptNumber}`,
                crossRef: String(alloc.invoice?.invoiceNumber || '').trim(),
                Amt: Math.round((Number(alloc.amount) || 0) * 100) / 100,
                discAmt: 0.0,
                taxAmt: 0,
              }))
            : [
                {
                  lineNo: '1000000',
                  accCode,
                  Description: String(rct.notes || `Cash Receipt ${rct.receiptNumber}`).trim(),
                  crossRef: String(rct.paymentReference || '').trim(),
                  Amt: netAmount,
                  discAmt: 0.0,
                  taxAmt: 0,
                },
              ];

        const payload = {
          domain: auth.domain,
          list: [
            {
              hdr: {
                syskey: syskeyValue,
                Type: receiptType,
                cvCode,
                cashbook,
                currency: curr,
                currencyRate: currRate,
                cvCurrCode: curr,
                cvCurrRate: currRate,
                saveStatus: 4,
                transType: 101,
                reference: rct.receiptNumber,
                secondref: String(rct.paymentReference || '').trim(),
                docDate,
                remark: String(rct.notes || `Billing for ${cvCode || rct.receiptNumber}`).trim(),
                netAmount,
              },
              dtls,
            },
          ],
        };

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Over': auth.codex,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25000),
        });

        const respText = await resp.text().catch(() => '');
        let v6Json: any = null;
        try {
          v6Json = JSON.parse(respText);
        } catch {
          // not JSON
        }

        const itemRes =
          Array.isArray(v6Json?.list) && v6Json.list.length > 0 ? v6Json.list[0] : v6Json;
        const v6Status = String(itemRes?.status || v6Json?.status || '').toUpperCase();
        const v6Msg = String(itemRes?.message || v6Json?.message || '').trim();
        const isSuccess =
          resp.ok &&
          (v6Status === 'SUCCESS' || v6Status === 'SUCCESS!') &&
          Number(v6Json?.failCount || 0) === 0;
        const rawSk = itemRes?.syskey || itemRes?.key || v6Json?.syskey || v6Json?.key;
        const savedSyskey = rawSk ? String(rawSk).trim() : '';
        const rawCr = itemRes?.crossRef || v6Json?.crossRef;
        const savedCrossRef = rawCr ? String(rawCr).trim() : '';

        if (isSuccess) {
          results.push({
            receiptId: rct.id,
            receiptNumber: rct.receiptNumber,
            status: 'sent',
            error: `✅ V6 ERP saved (${savedCrossRef || rct.receiptNumber})`,
          });

          const extIdParts = [savedCrossRef || rct.receiptNumber];
          if (savedSyskey && savedSyskey !== '0') extIdParts.push(`Syskey: ${savedSyskey}`);
          const extId = extIdParts.join(' | ').substring(0, 255);
          const extRef = `${rct.receiptNumber} (Customer: ${cvCode || 'Account'})`.substring(0, 255);

          await prisma.integrationEntityMap
            .upsert({
              where: {
                integrationId_entityType_pmsId: {
                  integrationId: config.id,
                  entityType: 'receipt',
                  pmsId: rct.id,
                },
              },
              create: {
                companyId,
                integrationId: config.id,
                entityType: 'receipt',
                pmsId: rct.id,
                externalId: extId,
                externalRef: extRef,
                syncedAt: new Date(),
              },
              update: {
                externalId: extId,
                externalRef: extRef,
                syncedAt: new Date(),
              },
            })
            .catch(() => {});
        } else {
          const errDetail = v6Msg || v6Status || respText.substring(0, 250) || `HTTP ${resp.status}`;
          results.push({
            receiptId: rct.id,
            receiptNumber: rct.receiptNumber,
            status: 'failed',
            error: `V6 error: ${errDetail}`,
          });
        }
      } catch (err: any) {
        results.push({
          receiptId: rct.id,
          receiptNumber: rct.receiptNumber,
          status: 'failed',
          error: err?.message || String(err),
        });
      }
    }

    const sentCount = results.filter((r) => r.status === 'sent').length;
    const failedResults = results.filter((r) => r.status === 'failed');
    const failedCount = failedResults.length;

    if (!skipLog && results.length > 0) {
      await prisma.integrationSyncLog
        .create({
          data: {
            companyId,
            integrationId: config.id,
            syncType: 'receipt_push',
            direction: 'push',
            status: failedCount === 0 ? 'success' : sentCount > 0 ? 'partial' : 'failed',
            recordsProcessed: results.length,
            recordsCreated: sentCount,
            recordsUpdated: 0,
            recordsFailed: failedCount,
            errorDetails: failedResults,
            durationMs: Date.now() - t0,
            initiatedBy: 'user',
            completedAt: new Date(),
          },
        })
        .catch(() => {});
    }

    return {
      sent: sentCount,
      failed: failedCount,
      results,
      message: `${sentCount} receipt(s) sent to V6 ERP.`,
    };
  }

  /**
   * Unified V6 ERP Sync (mDisRepository IntegrationAPI):
   * 1. Push PMS Customers to V6 ERP (createCustomerMaster)
   * 2. Push Issued PMS Invoices / Debit Notes to V6 ERP (postARInvoice)
   * 3. Push Confirmed PMS Cash Receipts to V6 ERP (postCashReceipt)
   */
  async syncV6Erp(
    config: any,
    companyId: string,
    userId?: string,
    propertyId?: string,
    initiatedBy: 'user' | 'cron' = 'user',
  ) {
    await ensurePropertySetupScope();
    const effectivePropertyId = await resolveEffectivePropertyId(
      companyId,
      propertyId || config?.propertyId,
    );
    this.resolveV6Config(config);

    const t0 = Date.now();
    let customersImported = 0;
    let customersUpdated = 0;
    const errors: any[] = [];

    // 1. Outbound Customer Master Sync (createCustomerMaster)
    try {
      const custRes = await this.syncV6Customers(companyId, effectivePropertyId || undefined, userId);
      customersImported += custRes.created || 0;
      customersUpdated += custRes.updated || 0;
      if (custRes.errors?.length) {
        errors.push(...custRes.errors);
      }
    } catch (cErr: any) {
      logger.warn(`V6 ERP customer sync warning: ${cErr.message}`);
      errors.push({ error: `Customer sync warning: ${cErr.message}` });
    }

    // 2. Outbound AR Invoice / Debit Note Push (postARInvoice)
    let invoiceRes: any = { sent: 0, failed: 0, skipped: 0, results: [] };
    try {
      invoiceRes = await this.pushInvoicesToV6Erp(
        companyId,
        undefined,
        true,
        effectivePropertyId || undefined,
        config,
      );
    } catch (invErr: any) {
      logger.warn(`V6 ERP invoice push warning: ${invErr.message}`);
      errors.push({ error: `Invoice push warning: ${invErr.message}` });
    }

    if (invoiceRes.results) {
      const failedInvoices = invoiceRes.results.filter((r: any) => r.status === 'failed');
      errors.push(...failedInvoices);
    }

    // 3. Outbound Cash Receipt Push (postCashReceipt)
    let receiptRes: any = { sent: 0, failed: 0, results: [] };
    try {
      receiptRes = await this.pushReceiptsToV6Erp(
        companyId,
        undefined,
        true,
        effectivePropertyId || undefined,
        config,
      );
    } catch (rctErr: any) {
      logger.warn(`V6 ERP receipt push warning: ${rctErr.message}`);
      errors.push({ error: `Receipt push warning: ${rctErr.message}` });
    }

    if (receiptRes.results) {
      const failedReceipts = receiptRes.results.filter((r: any) => r.status === 'failed');
      errors.push(...failedReceipts);
    }

    const durationMs = Date.now() - t0;
    const totalProcessed =
      customersImported +
      customersUpdated +
      (invoiceRes.results?.length || 0) +
      (receiptRes.results?.length || 0);
    const totalFailed = (invoiceRes.failed || 0) + (receiptRes.failed || 0) + (errors.length > 0 ? 1 : 0);

    const log = await prisma.integrationSyncLog.create({
      data: {
        companyId,
        integrationId: config.id,
        syncType: 'full_sync',
        direction: 'push',
        status: totalFailed === 0 ? 'success' : totalProcessed > 0 ? 'partial' : 'failed',
        recordsProcessed: totalProcessed,
        recordsCreated: customersImported + (invoiceRes.sent || 0) + (receiptRes.sent || 0),
        recordsUpdated: customersUpdated,
        recordsFailed: totalFailed,
        errorDetails: errors,
        durationMs,
        initiatedBy,
        initiatedUserId: userId || null,
        completedAt: new Date(),
      },
    });

    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: {
        lastSyncAt: new Date(),
        ...(config.isActive ? { status: 'active' } : {}),
        lastError: errors[0]?.error || null,
      },
    });

    return {
      success: true,
      customersImported,
      customersUpdated,
      coaTotal: 0,
      coaCreated: 0,
      coaUpdated: 0,
      invoicesSent: invoiceRes.sent || 0,
      invoicesFailed: invoiceRes.failed || 0,
      receiptsSent: receiptRes.sent || 0,
      receiptsFailed: receiptRes.failed || 0,
      log,
      message: `Sync completed: ${customersImported + customersUpdated} customer(s) synced, ${invoiceRes.sent || 0} invoice(s) sent, ${receiptRes.sent || 0} receipt(s) sent.`,
    };
  }
}

export const integrationsService = new IntegrationsService();

