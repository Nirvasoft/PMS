import crypto from 'crypto';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

// ═════════════════════════════════════════
// INTEGRATION TYPES REGISTRY
// ═════════════════════════════════════════
export const INTEGRATION_TYPES = {
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
      credentials: undefined, // Never expose credentials
      recentSync: c.syncLogs[0] || null,
      totalSyncs: c._count.syncLogs,
    }));
  }

  async create(companyId: string, userId: string, data: any) {
    return prisma.integrationConfig.create({
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
  }

  async update(id: string, companyId: string, data: any) {
    const existing = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Integration');

    return prisma.integrationConfig.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        config: data.config,
        syncFrequency: data.syncFrequency,
        status: data.status,
        isActive: data.isActive,
      },
    });
  }

  async delete(id: string, companyId: string) {
    const existing = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Integration');
    return prisma.integrationConfig.delete({ where: { id } });
  }

  async testConnection(id: string, companyId: string) {
    const config = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!config) throw AppError.notFound('Integration');

    // Stub: simulate connection test
    const typeMeta = INTEGRATION_TYPES[config.integrationType as keyof typeof INTEGRATION_TYPES];
    await prisma.integrationConfig.update({
      where: { id },
      data: { status: 'active', lastError: null },
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
      where: { companyId, ...(integrationId && { integrationId }), ...(entityType && { entityType }) },
      orderBy: { syncedAt: 'desc' },
      take: 100,
    });
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
    const rawKey = `pms_sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        companyId,
        name: data.name,
        keyHash,
        keyPrefix,
        scopes: data.scopes || [],
        rateLimitRpm: data.rateLimitRpm || 100,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
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
}

export const integrationsService = new IntegrationsService();
