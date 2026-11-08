import crypto from 'crypto';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

const V6_GLM004_CATEGORY_MAP: Record<
  string,
  {
    accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
    accountSubtype: string;
    normalBalance: 'debit' | 'credit';
  }
> = {
  'non-current assets': { accountType: 'asset', accountSubtype: 'Non-Current Assets', normalBalance: 'debit' },
  'accumulated depreciation': { accountType: 'asset', accountSubtype: 'Accumulated Depreciation', normalBalance: 'credit' },
  'current assets': { accountType: 'asset', accountSubtype: 'Current Assets', normalBalance: 'debit' },
  'other accounts receivable': { accountType: 'asset', accountSubtype: 'Other Accounts Receivable', normalBalance: 'debit' },
  'other assets': { accountType: 'asset', accountSubtype: 'Other Assets', normalBalance: 'debit' },
  'non-current liabilities': { accountType: 'liability', accountSubtype: 'Non-Current Liabilities', normalBalance: 'credit' },
  'current liabilities': { accountType: 'liability', accountSubtype: 'Current Liabilities', normalBalance: 'credit' },
  'other accounts payable': { accountType: 'liability', accountSubtype: 'Other Accounts Payable', normalBalance: 'credit' },
  capital: { accountType: 'equity', accountSubtype: 'Capital', normalBalance: 'credit' },
  reserve: { accountType: 'equity', accountSubtype: 'Reserve', normalBalance: 'credit' },
  'retained earnings': { accountType: 'equity', accountSubtype: 'Retained Earnings', normalBalance: 'credit' },
  'net profit': { accountType: 'equity', accountSubtype: 'Net Profit', normalBalance: 'credit' },
  sales: { accountType: 'income', accountSubtype: 'Sales', normalBalance: 'credit' },
  'other revenue': { accountType: 'income', accountSubtype: 'Other Revenue', normalBalance: 'credit' },
  'opening stocks': { accountType: 'expense', accountSubtype: 'Opening Stocks', normalBalance: 'debit' },
  purchase: { accountType: 'expense', accountSubtype: 'Purchase', normalBalance: 'debit' },
  'carriage inwards': { accountType: 'expense', accountSubtype: 'Carriage Inwards', normalBalance: 'debit' },
  'closing stocks': { accountType: 'expense', accountSubtype: 'Closing Stocks', normalBalance: 'credit' },
  'cost of sales': { accountType: 'expense', accountSubtype: 'Cost of Sales', normalBalance: 'debit' },
  'income & expenses': { accountType: 'income', accountSubtype: 'Income & Expenses', normalBalance: 'credit' },
  'income tax': { accountType: 'expense', accountSubtype: 'Income Tax', normalBalance: 'debit' },
  'other comprehensive income': { accountType: 'income', accountSubtype: 'Other Comprehensive Income', normalBalance: 'credit' },
  'cost & expenses': { accountType: 'expense', accountSubtype: 'Cost & Expenses', normalBalance: 'debit' },
  'direct expenses': { accountType: 'expense', accountSubtype: 'Direct Expenses', normalBalance: 'debit' },
  overheads: { accountType: 'expense', accountSubtype: 'Overheads', normalBalance: 'debit' },
};

function mapV6AccountClassification(
  code: string,
  description: string,
  v6CategoryName?: string,
): {
  accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  accountSubtype: string;
  normalBalance: 'debit' | 'credit';
} {
  if (v6CategoryName) {
    const matchedCat = V6_GLM004_CATEGORY_MAP[v6CategoryName.trim().toLowerCase()];
    if (matchedCat) {
      return matchedCat;
    }
  }

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
  private activeCashbookSyncs = new Map<string, Promise<any>>();

  private resolveV6Config(config: any): { cleanRoot: string; domain: string } {
    const cfg = (config?.config || {}) as Record<string, string>;
    const creds = (config?.credentials || {}) as Record<string, string>;
    const baseUrl = (cfg.baseUrl || creds.apiUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      throw new AppError(
        400,
        'V6ERP_NOT_CONFIGURED',
        '🔶 V6 ERP API URL is not configured. Edit the integration and set config.baseUrl (e.g. http://localhost:8080).',
      );
    }
    const domain = cfg.domain || 'demo';
    const cleanRoot = /\/(V6|v6_addon)$/i.test(baseUrl) ? baseUrl : `${baseUrl}/V6`;
    return { cleanRoot, domain };
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
      credentials:    undefined,   // Never expose raw credentials to client
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

    const created = await prisma.integrationConfig.create({
      data: {
        companyId,
        propertyId: effectivePropertyId,
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
      await this.syncV6ChartOfAccounts(companyId, effectivePropertyId || undefined, userId, false, created).catch((err) => {
        logger.warn(`Initial V6 ERP COA auto-sync skipped on create: ${err.message}`);
      });
    }

    return created;
  }

  async update(id: string, companyId: string, data: any, userId?: string) {
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

    const targetPropertyId = existing.propertyId || data.propertyId;
    if (updated.integrationType === 'v6erp') {
      if (updated.isActive && updated.status !== 'disabled') {
        await this.syncV6ChartOfAccounts(companyId, targetPropertyId || undefined, userId, false, updated).catch((err) => {
          logger.warn(`V6 ERP COA auto-sync warning on update: ${err.message}`);
        });
      } else {
        await this.restorePmsChartOfAccountsOnV6Disable(updated.id, companyId, targetPropertyId).catch((err) => {
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
    await ensurePropertySetupScope();
    const existing = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Integration');
    if (existing.integrationType === 'v6erp') {
      await this.restorePmsChartOfAccountsOnV6Disable(existing.id, companyId, existing.propertyId).catch((err) => {
        logger.warn(`V6 ERP COA restore warning on delete: ${err.message}`);
      });
    }
    return prisma.integrationConfig.delete({ where: { id } });
  }

  async testConnection(id: string, companyId: string, propertyId?: string, userId?: string) {
    await ensurePropertySetupScope();
    const config = await prisma.integrationConfig.findFirst({ where: { id, companyId } });
    if (!config) throw AppError.notFound('Integration');
    const targetPropertyId = config.propertyId || propertyId;

    if (config.integrationType === 'v6erp') {
      const { cleanRoot, domain } = this.resolveV6Config(config);
      const customerEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/getCustomer`;
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
          await this.syncV6ChartOfAccounts(companyId, targetPropertyId || undefined, userId, false, activated).catch((err) => {
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
   * Fetch Chart of Accounts bundle from V6 ERP:
   * - Authenticates via /lkn/getotkenlogin (or /main/loginRefreshToken) and pulls:
   *   1. COA list (/chartofaccount/searchChartOfAccountListByRoleAllowed/{usk} with n1=1, n2=1)
   *      containing Account Category (n3/n1), Acc Type (categorySK: "1"=Header, "0"=Posting),
   *      Department (deptCode/t2/n12), and Cost Center (ccCode/t3/n11).
   *   2. Department list (/department/searchDepartmentListByRoleAllowed/{usk}).
   *   3. Cost Center list (/costcentre/searchCostCentreListByRoleAllowed/{usk}).
   *   4. Account Category list (/accountcategory/getAccountCategory).
   * - Falls back to /v6IntegrationAPIlogin/getCOA if token endpoints are unavailable.
   */
  private async fetchV6CoaBundle(
    cleanRoot: string,
    domain: string,
  ): Promise<{
    coaRows: any[];
    departments: any[];
    costCenters: any[];
    categories: any[];
  }> {
    let token = '';
    try {
      const tokenResp = await fetch(`${cleanRoot}/lkn/getotkenlogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
        signal: AbortSignal.timeout(10000),
      });
      if (tokenResp.ok) {
        const tokenJson = (await tokenResp.json().catch(() => null)) as any;
        if (tokenJson?.token) {
          token = String(tokenJson.token);
        }
      }
    } catch {
      // try loginRefreshToken fallback below
    }

    if (!token) {
      try {
        const refreshResp = await fetch(`${cleanRoot}/main/loginRefreshToken`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain, userId: 'admin', oid: '001' }),
          signal: AbortSignal.timeout(10000),
        });
        if (refreshResp.ok) {
          const refreshJson = (await refreshResp.json().catch(() => null)) as any;
          if (refreshJson?.token) {
            token = String(refreshJson.token);
          }
        }
      } catch {
        // handled below
      }
    }

    if (token) {
      let usk = '10150000188';
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload?.usk) {
            usk = String(payload.usk);
          }
        }
      } catch {
        // keep default usk
      }

      const authHeaders = {
        'Content-Type': 'application/json',
        'Content-Over': token,
        'APP-CALLER': '1',
      };

      const encodedUsk = encodeURIComponent(usk);

      const [coaResp, deptResp, ccResp, catResp] = await Promise.all([
        fetch(`${cleanRoot}/chartofaccount/searchChartOfAccountListByRoleAllowed/${encodedUsk}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            currentPage: 1,
            totalPageSize: 10000,
            searchStr: '',
            searchCcDept: '',
            sortBy: 'code',
            sort: 1,
            isCOAList: 1,
            n1: 1,
            n2: 1,
            filters: [],
          }),
          signal: AbortSignal.timeout(20000),
        }).catch(() => null),
        fetch(`${cleanRoot}/department/searchDepartmentListByRoleAllowed/${encodedUsk}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            code: '',
            description: '',
            groupCode: '',
            currentPage: 1,
            pageSize: 5000,
            sortBy: 'code',
            sort: 1,
          }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
        fetch(`${cleanRoot}/costcentre/searchCostCentreListByRoleAllowed/${encodedUsk}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            code: '',
            description: '',
            groupCode: '',
            currentPage: 1,
            pageSize: 5000,
            sortBy: 'code',
            sort: 1,
          }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
        fetch(`${cleanRoot}/accountcategory/getAccountCategory`, {
          method: 'GET',
          headers: authHeaders,
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
      ]);

      if (coaResp && coaResp.ok) {
        const searchJson = (await coaResp.json().catch(() => null)) as any;
        const coaRows: any[] | null = Array.isArray(searchJson?.chartOfAccountlistdata)
          ? searchJson.chartOfAccountlistdata
          : null;

        if (coaRows) {
          const deptJson = deptResp && deptResp.ok ? ((await deptResp.json().catch(() => null)) as any) : null;
          const ccJson = ccResp && ccResp.ok ? ((await ccResp.json().catch(() => null)) as any) : null;
          const catJson = catResp && catResp.ok ? ((await catResp.json().catch(() => null)) as any) : null;

          return {
            coaRows,
            departments: Array.isArray(deptJson?.departmentdata) ? deptJson.departmentdata : [],
            costCenters: Array.isArray(ccJson?.costcentredata) ? ccJson.costcentredata : [],
            categories: Array.isArray(catJson) ? catJson : [],
          };
        }
      }
    }

    // Fallback: /v6IntegrationAPIlogin/getCOA
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
    const primaryList: any[] | null = Array.isArray(coaJson?.coalist)
      ? coaJson.coalist
      : Array.isArray(coaJson?.list)
        ? coaJson.list
        : null;

    if (!primaryList) {
      throw new AppError(
        502,
        'V6ERP_COA_INVALID_RESPONSE',
        'V6 ERP returned an unexpected payload without Chart of Accounts list.',
      );
    }

    return {
      coaRows: primaryList,
      departments: [],
      costCenters: [],
      categories: [],
    };
  }

  /**
   * Pull General Ledger -> Chart of Accounts, Account Category, Acc Type (Header/Posting),
   * Department, and Cost Center from V6 ERP scoped to the active propertyId:
   * - Upserts V6 ERP DepartmentCenter and CostCenter records for that property.
   * - Upserts V6 ERP COA accounts with mapped accountType, accountSubtype (Account Category),
   *   normalBalance, parentId, isControl (Acc Type: Header vs Posting), departmentCenterId, and costCenterId.
   * - Marks non-V6 PMS accounts/departments/cost-centers for that property as isActive: false
   *   (preserving them in IntegrationEntityMap so turning V6 Flag OFF restores original PMS records with zero data loss).
   */
  async syncV6ChartOfAccounts(
    companyId: string,
    propertyId?: string,
    userId?: string,
    skipLog = false,
    preloadedConfig?: any,
    initiatedBy: 'user' | 'cron' = 'user',
  ) {
    await ensurePropertySetupScope();
    const targetPropertyId = await resolveEffectivePropertyId(
      companyId,
      propertyId || preloadedConfig?.propertyId,
    );

    const config =
      preloadedConfig ||
      (await prisma.integrationConfig.findFirst({
        where: {
          companyId,
          ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
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

    const lockKey = `${companyId}:${targetPropertyId || 'default'}`;

    const inflight = this.activeCoaSyncs.get(lockKey);
    if (inflight) {
      return inflight;
    }

    const runner = (async () => {
      const { cleanRoot, domain } = this.resolveV6Config(config);

      const t0 = Date.now();
      const {
        coaRows: rawList,
        departments: rawDepts,
        costCenters: rawCcs,
        categories: rawCats,
      } = await this.fetchV6CoaBundle(cleanRoot, domain);

      const CHUNK = 5;
      const now = new Date();

      // Build GLM004 category syskey -> category name lookup
      const catNameBySyskey = new Map<string, string>();
      for (const cat of rawCats) {
        const sk = String(cat?.syskey || '').trim();
        const name = String(cat?.t1 || '').trim();
        if (sk && name) {
          catNameBySyskey.set(sk, name);
        }
      }

      // Filter active COA rows (n13 === 0 in GLM001)
      const activeRawList = rawList.filter(
        (item) => item.n13 === undefined || Number(item.n13) === 0,
      );

      // ── 1. Collect & Sync Departments (GLM003 -> DepartmentCenter) ──────────
      const v6DeptMap = new Map<string, { code: string; name: string; syskey: string }>();
      for (const d of rawDepts) {
        const code = String(d?.t1 || d?.code || '').trim();
        if (!code) continue;
        const name = String(d?.t2 || d?.description || d?.name || code).trim() || code;
        const syskey = String(d?.syskey || '').trim();
        v6DeptMap.set(code.toLowerCase(), {
          code: code.substring(0, 50),
          name: name.substring(0, 255),
          syskey,
        });
      }
      for (const item of activeRawList) {
        const deptCode = String(item?.deptCode || '').trim();
        if (!deptCode) continue;
        const lower = deptCode.toLowerCase();
        if (!v6DeptMap.has(lower)) {
          const deptName = String(item?.t2 || deptCode).trim() || deptCode;
          const deptSk = String(item?.n12 || '').trim();
          v6DeptMap.set(lower, {
            code: deptCode.substring(0, 50),
            name: deptName.substring(0, 255),
            syskey: deptSk !== '0' ? deptSk : '',
          });
        }
      }

      // ── 2. Collect & Sync Cost Centers (GLM002 -> CostCenter) ───────────────
      const v6CcMap = new Map<string, { code: string; name: string; syskey: string }>();
      for (const cc of rawCcs) {
        const code = String(cc?.t1 || cc?.code || '').trim();
        if (!code) continue;
        const name = String(cc?.t2 || cc?.description || cc?.name || code).trim() || code;
        const syskey = String(cc?.syskey || '').trim();
        v6CcMap.set(code.toLowerCase(), {
          code: code.substring(0, 50),
          name: name.substring(0, 255),
          syskey,
        });
      }
      for (const item of activeRawList) {
        const ccCode = String(item?.ccCode || '').trim();
        if (!ccCode) continue;
        const lower = ccCode.toLowerCase();
        if (!v6CcMap.has(lower)) {
          const ccName = String(item?.t3 || ccCode).trim() || ccCode;
          const ccSk = String(item?.n11 || '').trim();
          v6CcMap.set(lower, {
            code: ccCode.substring(0, 50),
            name: ccName.substring(0, 255),
            syskey: ccSk !== '0' ? ccSk : '',
          });
        }
      }

      // Load existing property GL accounts, departments, cost centers, and entity maps
      const [existingAccounts, existingDepts, existingCcs, existingMaps] = await Promise.all([
        prisma.glAccount.findMany({
          where: { companyId, propertyId: targetPropertyId },
        }),
        prisma.departmentCenter.findMany({
          where: { companyId, propertyId: targetPropertyId },
        }),
        prisma.costCenter.findMany({
          where: { companyId, propertyId: targetPropertyId },
        }),
        prisma.integrationEntityMap.findMany({
          where: {
            companyId,
            integrationId: config.id,
            entityType: {
              in: [
                'gl_account',
                'gl_account_pms_hidden',
                'department_center',
                'department_center_pms_hidden',
                'cost_center',
                'cost_center_pms_hidden',
              ],
            },
          },
        }),
      ]);

      const deptEntityMapByPmsId = new Map<string, (typeof existingMaps)[number]>();
      const ccEntityMapByPmsId = new Map<string, (typeof existingMaps)[number]>();
      const glEntityMapByPmsId = new Map<string, (typeof existingMaps)[number]>();
      for (const m of existingMaps) {
        if (m.entityType === 'department_center') deptEntityMapByPmsId.set(m.pmsId, m);
        else if (m.entityType === 'cost_center') ccEntityMapByPmsId.set(m.pmsId, m);
        else if (m.entityType === 'gl_account') glEntityMapByPmsId.set(m.pmsId, m);
      }

      // Upsert Departments
      const existingDeptByLower = new Map<string, (typeof existingDepts)[number]>();
      for (const d of existingDepts) {
        existingDeptByLower.set(d.code.trim().toLowerCase(), d);
      }
      const v6DeptList = [...v6DeptMap.values()].sort((a, b) => a.code.localeCompare(b.code));
      const deptsToCreate: Array<{
        companyId: string;
        propertyId: string | null;
        code: string;
        name: string;
        isActive: boolean;
        sortOrder: number;
      }> = [];
      const deptsToUpdate: Array<{ id: string; data: { name: string; isActive: boolean; sortOrder: number } }> = [];
      const newlyCreatedDeptLowers = new Set<string>();

      v6DeptList.forEach((d, idx) => {
        const lower = d.code.toLowerCase();
        const existing = existingDeptByLower.get(lower);
        if (!existing) {
          newlyCreatedDeptLowers.add(lower);
          deptsToCreate.push({
            companyId,
            propertyId: targetPropertyId,
            code: d.code,
            name: d.name,
            isActive: true,
            sortOrder: idx,
          });
        } else if (existing.name !== d.name || !existing.isActive || existing.sortOrder !== idx) {
          deptsToUpdate.push({
            id: existing.id,
            data: { name: d.name, isActive: true, sortOrder: idx },
          });
        }
      });

      if (deptsToCreate.length > 0) {
        await prisma.departmentCenter.createMany({ data: deptsToCreate, skipDuplicates: true });
      }
      for (let i = 0; i < deptsToUpdate.length; i += CHUNK) {
        const batch = deptsToUpdate.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((u) => prisma.departmentCenter.update({ where: { id: u.id }, data: u.data })),
        );
      }

      const allPropertyDepts =
        deptsToCreate.length > 0 || deptsToUpdate.length > 0
          ? await prisma.departmentCenter.findMany({
              where: { companyId, propertyId: targetPropertyId },
            })
          : existingDepts;

      const deptIdByCodeLower = new Map<string, string>();
      const deptIdBySyskey = new Map<string, string>();
      const syncedDeptIds = new Set<string>();
      for (const d of allPropertyDepts) {
        const lower = d.code.trim().toLowerCase();
        const v6D = v6DeptMap.get(lower);
        if (v6D) {
          deptIdByCodeLower.set(lower, d.id);
          if (v6D.syskey) deptIdBySyskey.set(v6D.syskey, d.id);
          syncedDeptIds.add(d.id);
        }
      }

      if (v6DeptList.length > 0) {
        for (const [deptSk, deptId] of deptIdBySyskey.entries()) {
          if (!deptSk || deptSk === '0') continue;
          await prisma.$executeRaw`
            UPDATE "department_centers"
            SET "external_ref" = ${deptSk}
            WHERE "id" = ${deptId}::uuid
              AND ("external_ref" IS DISTINCT FROM ${deptSk})
          `.catch(() => {});
        }
        const deptsToHide = allPropertyDepts.filter((d) => d.isActive && !syncedDeptIds.has(d.id));
        const genuinePmsDepts = deptsToHide.filter((d) => {
          const m = deptEntityMapByPmsId.get(d.id);
          return !m || !String(m.externalRef || '').startsWith('V6 |');
        });
        if (genuinePmsDepts.length > 0) {
          await prisma.integrationEntityMap.createMany({
            data: genuinePmsDepts.map((d) => ({
              companyId,
              integrationId: config.id,
              entityType: 'department_center_pms_hidden',
              pmsId: d.id,
              externalId: d.code,
              externalRef: targetPropertyId || 'default',
              syncedAt: now,
            })),
            skipDuplicates: true,
          });
        }
        if (deptsToHide.length > 0) {
          await prisma.departmentCenter.updateMany({
            where: {
              companyId,
              propertyId: targetPropertyId,
              id: { in: deptsToHide.map((d) => d.id) },
              isActive: true,
            },
            data: { isActive: false },
          });
        }
        const newDeptMaps = v6DeptList
          .map((d) => {
            const lower = d.code.toLowerCase();
            const pmsId = deptIdByCodeLower.get(lower);
            if (!pmsId || deptEntityMapByPmsId.has(pmsId)) return null;
            const originPrefix = newlyCreatedDeptLowers.has(lower) ? 'V6' : 'PMS';
            return {
              companyId,
              integrationId: config.id,
              entityType: 'department_center',
              pmsId,
              externalId: d.code,
              externalRef: `${originPrefix} | ${d.syskey ? `Syskey: ${d.syskey}` : d.name}`.substring(0, 255),
              syncedAt: now,
            };
          })
          .filter(Boolean) as Array<{
          companyId: string;
          integrationId: string;
          entityType: string;
          pmsId: string;
          externalId: string;
          externalRef: string;
          syncedAt: Date;
        }>;
        if (newDeptMaps.length > 0) {
          await prisma.integrationEntityMap.createMany({ data: newDeptMaps, skipDuplicates: true }).catch(() => {});
        }
      }

      // Upsert Cost Centers
      const existingCcByLower = new Map<string, (typeof existingCcs)[number]>();
      for (const cc of existingCcs) {
        existingCcByLower.set(cc.code.trim().toLowerCase(), cc);
      }
      const v6CcList = [...v6CcMap.values()].sort((a, b) => a.code.localeCompare(b.code));
      const ccsToCreate: Array<{
        companyId: string;
        propertyId: string | null;
        code: string;
        name: string;
        isActive: boolean;
        sortOrder: number;
      }> = [];
      const ccsToUpdate: Array<{ id: string; data: { name: string; isActive: boolean; sortOrder: number } }> = [];
      const newlyCreatedCcLowers = new Set<string>();

      v6CcList.forEach((cc, idx) => {
        const lower = cc.code.toLowerCase();
        const existing = existingCcByLower.get(lower);
        if (!existing) {
          newlyCreatedCcLowers.add(lower);
          ccsToCreate.push({
            companyId,
            propertyId: targetPropertyId,
            code: cc.code,
            name: cc.name,
            isActive: true,
            sortOrder: idx,
          });
        } else if (existing.name !== cc.name || !existing.isActive || existing.sortOrder !== idx) {
          ccsToUpdate.push({
            id: existing.id,
            data: { name: cc.name, isActive: true, sortOrder: idx },
          });
        }
      });

      if (ccsToCreate.length > 0) {
        await prisma.costCenter.createMany({ data: ccsToCreate, skipDuplicates: true });
      }
      for (let i = 0; i < ccsToUpdate.length; i += CHUNK) {
        const batch = ccsToUpdate.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((u) => prisma.costCenter.update({ where: { id: u.id }, data: u.data })),
        );
      }

      const allPropertyCcs =
        ccsToCreate.length > 0 || ccsToUpdate.length > 0
          ? await prisma.costCenter.findMany({
              where: { companyId, propertyId: targetPropertyId },
            })
          : existingCcs;

      const ccIdByCodeLower = new Map<string, string>();
      const ccIdBySyskey = new Map<string, string>();
      const syncedCcIds = new Set<string>();
      for (const cc of allPropertyCcs) {
        const lower = cc.code.trim().toLowerCase();
        const v6Cc = v6CcMap.get(lower);
        if (v6Cc) {
          ccIdByCodeLower.set(lower, cc.id);
          if (v6Cc.syskey) ccIdBySyskey.set(v6Cc.syskey, cc.id);
          syncedCcIds.add(cc.id);
        }
      }

      if (v6CcList.length > 0) {
        for (const [ccSk, ccId] of ccIdBySyskey.entries()) {
          if (!ccSk || ccSk === '0') continue;
          await prisma.$executeRaw`
            UPDATE "cost_centers"
            SET "external_ref" = ${ccSk}
            WHERE "id" = ${ccId}::uuid
              AND ("external_ref" IS DISTINCT FROM ${ccSk})
          `.catch(() => {});
        }
        const ccsToHide = allPropertyCcs.filter((cc) => cc.isActive && !syncedCcIds.has(cc.id));
        const genuinePmsCcs = ccsToHide.filter((cc) => {
          const m = ccEntityMapByPmsId.get(cc.id);
          return !m || !String(m.externalRef || '').startsWith('V6 |');
        });
        if (genuinePmsCcs.length > 0) {
          await prisma.integrationEntityMap.createMany({
            data: genuinePmsCcs.map((cc) => ({
              companyId,
              integrationId: config.id,
              entityType: 'cost_center_pms_hidden',
              pmsId: cc.id,
              externalId: cc.code,
              externalRef: targetPropertyId || 'default',
              syncedAt: now,
            })),
            skipDuplicates: true,
          });
        }
        if (ccsToHide.length > 0) {
          await prisma.costCenter.updateMany({
            where: {
              companyId,
              propertyId: targetPropertyId,
              id: { in: ccsToHide.map((cc) => cc.id) },
              isActive: true,
            },
            data: { isActive: false },
          });
        }
        const newCcMaps = v6CcList
          .map((cc) => {
            const lower = cc.code.toLowerCase();
            const pmsId = ccIdByCodeLower.get(lower);
            if (!pmsId || ccEntityMapByPmsId.has(pmsId)) return null;
            const originPrefix = newlyCreatedCcLowers.has(lower) ? 'V6' : 'PMS';
            return {
              companyId,
              integrationId: config.id,
              entityType: 'cost_center',
              pmsId,
              externalId: cc.code,
              externalRef: `${originPrefix} | ${cc.syskey ? `Syskey: ${cc.syskey}` : cc.name}`.substring(0, 255),
              syncedAt: now,
            };
          })
          .filter(Boolean) as Array<{
          companyId: string;
          integrationId: string;
          entityType: string;
          pmsId: string;
          externalId: string;
          externalRef: string;
          syncedAt: Date;
        }>;
        if (newCcMaps.length > 0) {
          await prisma.integrationEntityMap.createMany({ data: newCcMaps, skipDuplicates: true }).catch(() => {});
        }
      }

      // ── 3. Deduplicate & Sync COA Accounts (with Category, Acc Type, Dept, CC) ──
      // Identify codes that have at least one non-orphan department row so we can skip deleted-department rows
      const codesWithValidOrEmptyDept = new Set<string>();
      for (const item of activeRawList) {
        const rawCode = String(item.code || item.accountCode || item.t1 || '').trim().toLowerCase();
        if (!rawCode) continue;
        const n12 = String(item.n12 || '0').trim();
        const deptCode = String(item.deptCode || '').trim();
        if (!n12 || n12 === '0' || deptCode) {
          codesWithValidOrEmptyDept.add(rawCode);
        }
      }

      const dedupedByCombo = new Map<
        string,
        {
          comboKey: string;
          code: string;
          name: string;
          syskey: string;
          v6CategoryName?: string;
          isHeader?: boolean;
          departmentCenterId: string | null;
          costCenterId: string | null;
        }
      >();

      for (const item of activeRawList) {
        const rawCode = String(item.code || item.accountCode || item.t1 || '').trim();
        if (!rawCode) continue;
        const lower = rawCode.toLowerCase();

        const n12 = String(item.n12 || '0').trim();
        const rawDeptCode = String(item.deptCode || '').trim();
        // Skip rows pointing to a deleted GLM003 department if this account code has valid rows
        if (n12 && n12 !== '0' && !rawDeptCode && codesWithValidOrEmptyDept.has(lower)) {
          continue;
        }

        const rawDesc =
          String(item.description || item.name || item.t4 || rawCode).trim() || rawCode;
        const rawSyskey = String(item.syskey || '').trim();
        const rawCatSk = String(item.n1 || '').trim();
        const v6CategoryName =
          (typeof item.n3 === 'string' && item.n3.trim() ? item.n3.trim() : undefined) ||
          (rawCatSk ? catNameBySyskey.get(rawCatSk) : undefined);
        const isHeader = String(item.categorySK || '') === '1' || Number(item.isHdr || 0) === 1;

        const rawCcCode = String(item.ccCode || '').trim();
        const n11 = String(item.n11 || '0').trim();

        const departmentCenterId =
          (rawDeptCode ? deptIdByCodeLower.get(rawDeptCode.toLowerCase()) : undefined) ||
          (n12 && n12 !== '0' ? deptIdBySyskey.get(n12) : undefined) ||
          null;

        const costCenterId =
          (rawCcCode ? ccIdByCodeLower.get(rawCcCode.toLowerCase()) : undefined) ||
          (n11 && n11 !== '0' ? ccIdBySyskey.get(n11) : undefined) ||
          null;

        const comboKey = `${lower}|${departmentCenterId || ''}|${costCenterId || ''}`;
        const prev = dedupedByCombo.get(comboKey);
        if (!prev || rawSyskey > prev.syskey) {
          dedupedByCombo.set(comboKey, {
            comboKey,
            code: rawCode,
            name: rawDesc.substring(0, 255),
            syskey: rawSyskey,
            v6CategoryName: v6CategoryName || prev?.v6CategoryName,
            isHeader: isHeader || prev?.isHeader,
            departmentCenterId,
            costCenterId,
          });
        }
      }

      const v6Items = [...dedupedByCombo.values()].sort((a, b) =>
        a.code.localeCompare(b.code) || a.comboKey.localeCompare(b.comboKey),
      );
      if (v6Items.length === 0) {
        return {
          success: true,
          propertyId: targetPropertyId,
          totalV6Accounts: 0,
          created: 0,
          updated: 0,
          deactivated: 0,
          departmentsSynced: v6DeptList.length,
          costCentersSynced: v6CcList.length,
          message: 'V6 ERP returned 0 Chart of Accounts records.',
        };
      }

      const codeLowerSet = new Set(v6Items.map((i) => i.code.toLowerCase()));
      const parentLowerByCodeLower = new Map<string, string | null>();
      const parentCodeSet = new Set<string>();

      for (const codeLower of codeLowerSet) {
        const pLower = resolveV6ParentCode(codeLower, codeLowerSet);
        parentLowerByCodeLower.set(codeLower, pLower);
        if (pLower) parentCodeSet.add(pLower);
      }

      // Match existing GL accounts by (codeLower|deptId|ccId), falling back to unclaimed rows of the same codeLower
      const existingByComboKey = new Map<string, (typeof existingAccounts)[number]>();
      const unclaimedByCodeLower = new Map<string, Array<(typeof existingAccounts)[number]>>();

      for (const acc of existingAccounts) {
        const lower = acc.code.trim().toLowerCase();
        const cKey = `${lower}|${acc.departmentCenterId || ''}|${acc.costCenterId || ''}`;
        if (dedupedByCombo.has(cKey) && !existingByComboKey.has(cKey)) {
          existingByComboKey.set(cKey, acc);
        } else {
          const list = unclaimedByCodeLower.get(lower) || [];
          list.push(acc);
          unclaimedByCodeLower.set(lower, list);
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
        departmentCenterId: string | null;
        costCenterId: string | null;
        isActive: boolean;
        sortOrder: number;
      }> = [];

      const newlyCreatedComboKeys = new Set<string>();
      const toUpdateRows: Array<{
        id: string;
        data: {
          name: string;
          accountType: string;
          accountSubtype: string;
          normalBalance: string;
          isControl: boolean;
          departmentCenterId: string | null;
          costCenterId: string | null;
          isActive: boolean;
          sortOrder: number;
        };
      }> = [];

      let createdCount = 0;
      let updatedCount = 0;

      v6Items.forEach((item, idx) => {
        const lower = item.code.toLowerCase();
        const cls = mapV6AccountClassification(item.code, item.name, item.v6CategoryName);
        const isControl = parentCodeSet.has(lower) || Boolean(item.isHeader);

        let existing = existingByComboKey.get(item.comboKey);
        if (!existing) {
          const fallbackPool = unclaimedByCodeLower.get(lower);
          if (fallbackPool && fallbackPool.length > 0) {
            existing = fallbackPool.shift();
          }
        }

        if (!existing) {
          newlyCreatedComboKeys.add(item.comboKey);
          toCreate.push({
            companyId,
            propertyId: targetPropertyId,
            code: item.code,
            name: item.name,
            accountType: cls.accountType,
            accountSubtype: cls.accountSubtype,
            normalBalance: cls.normalBalance,
            isControl,
            departmentCenterId: item.departmentCenterId,
            costCenterId: item.costCenterId,
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
            existing.departmentCenterId !== item.departmentCenterId ||
            existing.costCenterId !== item.costCenterId ||
            !existing.isActive ||
            existing.sortOrder !== idx;

          if (needsUpdate) {
            toUpdateRows.push({
              id: existing.id,
              data: {
                name: item.name,
                accountType: cls.accountType,
                accountSubtype: cls.accountSubtype,
                normalBalance: cls.normalBalance,
                isControl,
                departmentCenterId: item.departmentCenterId,
                costCenterId: item.costCenterId,
                isActive: true,
                sortOrder: idx,
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
        toCreate.length > 0 || toUpdateRows.length > 0
          ? await prisma.glAccount.findMany({
              where: { companyId, propertyId: targetPropertyId },
            })
          : existingAccounts;

      const syncedByComboKey = new Map<string, (typeof allPropertyAccounts)[number]>();
      const primaryAccountByCodeLower = new Map<string, (typeof allPropertyAccounts)[number]>();
      for (const acc of allPropertyAccounts) {
        const lower = acc.code.trim().toLowerCase();
        const cKey = `${lower}|${acc.departmentCenterId || ''}|${acc.costCenterId || ''}`;
        if (!dedupedByCombo.has(cKey)) continue;
        syncedByComboKey.set(cKey, acc);
        const currentPrimary = primaryAccountByCodeLower.get(lower);
        if (!currentPrimary || (!acc.departmentCenterId && !acc.costCenterId)) {
          primaryAccountByCodeLower.set(lower, acc);
        }
      }

      // Link parentId hierarchy where changed
      const parentUpdates: Array<{ id: string; parentId: string | null }> = [];
      for (const item of v6Items) {
        const lower = item.code.toLowerCase();
        const acc = syncedByComboKey.get(item.comboKey);
        if (!acc) continue;
        const parentLower = parentLowerByCodeLower.get(lower) || null;
        let desiredParentId: string | null = null;
        if (parentLower) {
          const sameScopeParentKey = `${parentLower}|${item.departmentCenterId || ''}|${item.costCenterId || ''}`;
          desiredParentId =
            syncedByComboKey.get(sameScopeParentKey)?.id ||
            primaryAccountByCodeLower.get(parentLower)?.id ||
            null;
        }
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

      const syncedIds = new Set<string>([...syncedByComboKey.values()].map((a) => a.id));

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
            syncedAt: now,
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

      for (const item of v6Items) {
        const acc = syncedByComboKey.get(item.comboKey);
        if (!acc) continue;
        const prevMap = glEntityMapByPmsId.get(acc.id);
        if (!prevMap) {
          const originPrefix = newlyCreatedComboKeys.has(item.comboKey) ? 'V6' : 'PMS';
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

      const glExtRefUpdates = v6Items
        .map((item) => {
          const acc = syncedByComboKey.get(item.comboKey);
          if (!acc || !item.syskey || item.syskey === '0') return null;
          if ((acc as any).externalRef === item.syskey) return null;
          return { id: acc.id, syskey: item.syskey };
        })
        .filter(Boolean) as Array<{ id: string; syskey: string }>;

      for (let i = 0; i < glExtRefUpdates.length; i += CHUNK) {
        const batch = glExtRefUpdates.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((u) =>
            prisma.$executeRaw`
              UPDATE "gl_accounts"
              SET "external_ref" = ${u.syskey}
              WHERE "id" = ${u.id}::uuid
                AND ("external_ref" IS DISTINCT FROM ${u.syskey})
            `.catch(() => {}),
          ),
        );
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
            recordsProcessed: v6Items.length + v6DeptList.length + v6CcList.length,
            recordsCreated: createdCount + deptsToCreate.length + ccsToCreate.length,
            recordsUpdated: updatedCount + deptsToUpdate.length + ccsToUpdate.length,
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
        `V6 ERP COA sync completed for property ${targetPropertyId}: accounts=${v6Items.length} (created=${createdCount}, updated=${updatedCount}), departments=${v6DeptList.length}, costCenters=${v6CcList.length}, hidden=${deactivatedCount}`,
      );

      return {
        success: true,
        propertyId: targetPropertyId,
        totalV6Accounts: v6Items.length,
        created: createdCount,
        updated: updatedCount,
        deactivated: deactivatedCount,
        departmentsSynced: v6DeptList.length,
        costCentersSynced: v6CcList.length,
        durationMs,
        message: `Synced ${v6Items.length} Chart of Accounts, ${v6DeptList.length} Department(s), and ${v6CcList.length} Cost Center(s) from V6 ERP.`,
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
   * Restores original PMS Chart of Accounts, Departments, and Cost Centers when V6 ERP Flag is turned OFF
   * or integration is deleted:
   * - Hides records that were created solely by V6 sync ('V6 | ...').
   * - Re-activates pre-existing PMS records that were hidden during V6 sync ('*_pms_hidden').
   */
  async restorePmsChartOfAccountsOnV6Disable(
    integrationId: string,
    companyId: string,
    propertyId?: string | null,
  ) {
    const [
      v6CreatedMaps,
      hiddenPmsMaps,
      v6DeptMaps,
      hiddenDeptMaps,
      v6CcMaps,
      hiddenCcMaps,
    ] = await Promise.all([
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
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
        select: { id: true, pmsId: true },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'department_center',
          externalRef: { startsWith: 'V6 |' },
        },
        select: { pmsId: true },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'department_center_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
        select: { id: true, pmsId: true },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'cost_center',
          externalRef: { startsWith: 'V6 |' },
        },
        select: { pmsId: true },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'cost_center_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
        select: { id: true, pmsId: true },
      }),
    ]);

    const v6CreatedIds = v6CreatedMaps.map((m) => m.pmsId);
    const hiddenPmsIds = hiddenPmsMaps.map((m) => m.pmsId);
    const v6DeptIds = v6DeptMaps.map((m) => m.pmsId);
    const hiddenDeptIds = hiddenDeptMaps.map((m) => m.pmsId);
    const v6CcIds = v6CcMaps.map((m) => m.pmsId);
    const hiddenCcIds = hiddenCcMaps.map((m) => m.pmsId);

    const [v6PmMaps, hiddenPmMaps] = await Promise.all([
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'payment_method',
          externalRef: { startsWith: 'V6 |' },
        },
        select: { pmsId: true },
      }),
      prisma.integrationEntityMap.findMany({
        where: {
          companyId,
          integrationId,
          entityType: 'payment_method_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
        select: { id: true, pmsId: true },
      }),
    ]);
    const v6PmIds = v6PmMaps.map((m) => m.pmsId);
    const hiddenPmIds = hiddenPmMaps.map((m) => m.pmsId);

    if (v6PmIds.length > 0) {
      await prisma.paymentMethod.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: v6PmIds },
        },
        data: { isActive: false },
      });
    }

    if (hiddenPmIds.length > 0) {
      await prisma.paymentMethod.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: hiddenPmIds },
        },
        data: { isActive: true },
      });
      await prisma.integrationEntityMap.deleteMany({
        where: {
          companyId,
          integrationId,
          entityType: 'payment_method_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
      });
    }

    if (v6CreatedIds.length > 0) {
      await prisma.glAccount.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: v6CreatedIds },
        },
        data: { isActive: false },
      });
    }

    if (hiddenPmsIds.length > 0) {
      await prisma.glAccount.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: hiddenPmsIds },
        },
        data: { isActive: true },
      });
      await prisma.integrationEntityMap.deleteMany({
        where: {
          companyId,
          integrationId,
          entityType: 'gl_account_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
      });
    }

    if (v6DeptIds.length > 0) {
      await prisma.departmentCenter.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: v6DeptIds },
        },
        data: { isActive: false },
      });
    }

    if (hiddenDeptIds.length > 0) {
      await prisma.departmentCenter.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: hiddenDeptIds },
        },
        data: { isActive: true },
      });
      await prisma.integrationEntityMap.deleteMany({
        where: {
          companyId,
          integrationId,
          entityType: 'department_center_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
      });
    }

    if (v6CcIds.length > 0) {
      await prisma.costCenter.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: v6CcIds },
        },
        data: { isActive: false },
      });
    }

    if (hiddenCcIds.length > 0) {
      await prisma.costCenter.updateMany({
        where: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
          id: { in: hiddenCcIds },
        },
        data: { isActive: true },
      });
      await prisma.integrationEntityMap.deleteMany({
        where: {
          companyId,
          integrationId,
          entityType: 'cost_center_pms_hidden',
          ...(propertyId ? { externalRef: propertyId } : {}),
        },
      });
    }

    logger.info(
      `Restored PMS COA/Dept/CC after V6 ERP disable: ${hiddenPmsIds.length} account(s), ${hiddenDeptIds.length} dept(s), ${hiddenCcIds.length} cost center(s) re-activated.`,
    );

    return {
      restoredPmsAccounts: hiddenPmsIds.length,
      hiddenV6Accounts: v6CreatedIds.length,
      restoredDepartments: hiddenDeptIds.length,
      restoredCostCenters: hiddenCcIds.length,
    };
  }

  /**
   * Pull customers from V6 ERP (/v6IntegrationAPIlogin/getCustomer) and upsert them as PMS tenants:
   * - Matches an existing tenant by code / firstName, otherwise creates a new tenant for the property.
   * - Records the V6 customer code (and syskey) in IntegrationEntityMap.
   * Returns ok=false (without throwing) when V6 answers with a non-2xx HTTP status.
   */
  /**
   * Pull Cashbook from V6 ERP (/v6IntegrationAPIlogin/getCashbook) into PMS PaymentMethod setup
   * for the active property (when V6 ERP flag is ON).
   * - Triggered manually or when browsing Payment Method Setup (no cron job).
   * - Saves V6 Cashbook syskey into payment_methods.external_ref.
   * - Auto-links GL Account (and Dept/CC) if a GL Account with matching name exists for the property.
   */
  async syncV6Cashbook(
    companyId: string,
    propertyId?: string,
    userId?: string,
    skipLog = false,
    preloadedConfig?: any,
    initiatedBy: 'user' | 'cron' = 'user',
  ) {
    await ensurePropertySetupScope();
    const targetPropertyId = await resolveEffectivePropertyId(
      companyId,
      propertyId || preloadedConfig?.propertyId,
    );

    const config =
      preloadedConfig ||
      (await prisma.integrationConfig.findFirst({
        where: {
          companyId,
          ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
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

    const lockKey = `${companyId}:${targetPropertyId || 'default'}`;
    const inflight = this.activeCashbookSyncs.get(lockKey);
    if (inflight) {
      return inflight;
    }

    const runner = (async () => {
      const { cleanRoot, domain } = this.resolveV6Config(config);
      const t0 = Date.now();
      const now = new Date();

      const cbEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/getCashbook`;
      const resp = await fetch(cbEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, code: '', date: '' }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new AppError(
          502,
          'V6ERP_CASHBOOK_FETCH_FAILED',
          `V6 ERP getCashbook failed with HTTP ${resp.status}: ${errBody.substring(0, 150)}`,
        );
      }

      const cbJson = (await resp.json().catch(() => null)) as any;
      const rawList: any[] | null = Array.isArray(cbJson?.cashbooklist)
        ? cbJson.cashbooklist
        : Array.isArray(cbJson?.list)
          ? cbJson.list
          : null;

      if (!rawList) {
        throw new AppError(
          502,
          'V6ERP_CASHBOOK_INVALID_RESPONSE',
          'V6 ERP returned an unexpected payload without Cashbook list.',
        );
      }

      const normalizeName = (s: string) =>
        s
          .trim()
          .toLowerCase()
          .replace(/\s*\(\s*/g, '(')
          .replace(/\s*\)\s*/g, ')')
          .replace(/\s+/g, ' ');

      const v6CbMap = new Map<string, { code: string; name: string; syskey: string }>();
      for (const item of rawList) {
        const code = String(item?.code || item?.t1 || '').trim();
        if (!code) continue;
        const name = String(item?.description || item?.name || item?.t2 || code).trim() || code;
        const syskey = String(item?.syskey || '0').trim() || '0';
        const lower = code.toLowerCase();
        const prev = v6CbMap.get(lower);
        if (!prev || syskey > prev.syskey) {
          v6CbMap.set(lower, {
            code: code.substring(0, 50),
            name: name.substring(0, 150),
            syskey,
          });
        }
      }

      const v6CbList = [...v6CbMap.values()].sort((a, b) => a.code.localeCompare(b.code));
      if (v6CbList.length === 0) {
        return {
          success: true,
          propertyId: targetPropertyId,
          totalV6Cashbooks: 0,
          created: 0,
          updated: 0,
          deactivated: 0,
          message: 'V6 ERP returned 0 Cashbook records.',
        };
      }

      const [existingPms, existingAccounts, existingMaps] = await Promise.all([
        prisma.paymentMethod.findMany({
          where: { companyId, propertyId: targetPropertyId },
        }),
        prisma.glAccount.findMany({
          where: { companyId, propertyId: targetPropertyId, isActive: true, isControl: false },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        }),
        prisma.integrationEntityMap.findMany({
          where: {
            companyId,
            integrationId: config.id,
            entityType: { in: ['payment_method', 'payment_method_pms_hidden'] },
          },
        }),
      ]);

      const glByNormalizedName = new Map<
        string,
        { code: string; departmentCenterId: string | null; costCenterId: string | null }
      >();
      for (const acc of existingAccounts) {
        const key = normalizeName(acc.name);
        if (key && !glByNormalizedName.has(key)) {
          glByNormalizedName.set(key, {
            code: acc.code,
            departmentCenterId: acc.departmentCenterId,
            costCenterId: acc.costCenterId,
          });
        }
      }

      const pmEntityMapByPmsId = new Map<string, (typeof existingMaps)[number]>();
      for (const m of existingMaps) {
        if (m.entityType === 'payment_method') {
          pmEntityMapByPmsId.set(m.pmsId, m);
        }
      }

      const existingByLower = new Map<string, (typeof existingPms)[number]>();
      for (const pm of existingPms) {
        existingByLower.set(pm.code.trim().toLowerCase(), pm);
      }

      const toCreate: Array<{
        companyId: string;
        propertyId: string | null;
        code: string;
        name: string;
        glAccountCode: string | null;
        departmentCenterId: string | null;
        costCenterId: string | null;
        isActive: boolean;
        isSystem: boolean;
      }> = [];
      const toUpdate: Array<{
        id: string;
        data: {
          name: string;
          glAccountCode?: string | null;
          departmentCenterId?: string | null;
          costCenterId?: string | null;
          isActive: boolean;
        };
      }> = [];
      const newlyCreatedLowers = new Set<string>();

      for (const cb of v6CbList) {
        const lower = cb.code.toLowerCase();
        const existing = existingByLower.get(lower);
        const matchedGl = glByNormalizedName.get(normalizeName(cb.name)) || null;

        if (!existing) {
          newlyCreatedLowers.add(lower);
          toCreate.push({
            companyId,
            propertyId: targetPropertyId,
            code: cb.code,
            name: cb.name,
            glAccountCode: matchedGl?.code || null,
            departmentCenterId: matchedGl?.departmentCenterId || null,
            costCenterId: matchedGl?.costCenterId || null,
            isActive: true,
            isSystem: false,
          });
        } else {
          const nextGlCode = existing.glAccountCode || matchedGl?.code || null;
          const nextDeptId =
            existing.departmentCenterId ||
            (existing.glAccountCode ? null : matchedGl?.departmentCenterId || null);
          const nextCcId =
            existing.costCenterId ||
            (existing.glAccountCode ? null : matchedGl?.costCenterId || null);

          if (
            existing.name !== cb.name ||
            !existing.isActive ||
            existing.glAccountCode !== nextGlCode ||
            existing.departmentCenterId !== nextDeptId ||
            existing.costCenterId !== nextCcId
          ) {
            toUpdate.push({
              id: existing.id,
              data: {
                name: cb.name,
                glAccountCode: nextGlCode,
                departmentCenterId: nextDeptId,
                costCenterId: nextCcId,
                isActive: true,
              },
            });
          }
        }
      }

      let createdCount = 0;
      let updatedCount = 0;
      const CHUNK = 5;

      if (toCreate.length > 0) {
        const res = await prisma.paymentMethod.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        createdCount = res.count;
      }

      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const batch = toUpdate.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((u) =>
            prisma.paymentMethod.update({
              where: { id: u.id },
              data: u.data,
            }),
          ),
        );
        updatedCount += batch.length;
      }

      const allPropertyPms =
        toCreate.length > 0 || toUpdate.length > 0
          ? await prisma.paymentMethod.findMany({
              where: { companyId, propertyId: targetPropertyId },
            })
          : existingPms;

      const pmIdByLower = new Map<string, string>();
      const syncedPmIds = new Set<string>();
      for (const pm of allPropertyPms) {
        const lower = pm.code.trim().toLowerCase();
        const v6Cb = v6CbMap.get(lower);
        if (v6Cb) {
          pmIdByLower.set(lower, pm.id);
          syncedPmIds.add(pm.id);
          const sk = v6Cb.syskey && v6Cb.syskey !== '0' ? v6Cb.syskey : '0';
          await prisma.$executeRaw`
            UPDATE "payment_methods"
            SET "external_ref" = ${sk}
            WHERE "id" = ${pm.id}::uuid
              AND ("external_ref" IS DISTINCT FROM ${sk})
          `.catch(() => {});
        }
      }

      const pmsToHide = allPropertyPms.filter((pm) => pm.isActive && !syncedPmIds.has(pm.id));
      const genuinePms = pmsToHide.filter((pm) => {
        const m = pmEntityMapByPmsId.get(pm.id);
        return !m || !String(m.externalRef || '').startsWith('V6 |');
      });

      if (genuinePms.length > 0) {
        await prisma.integrationEntityMap.createMany({
          data: genuinePms.map((pm) => ({
            companyId,
            integrationId: config.id,
            entityType: 'payment_method_pms_hidden',
            pmsId: pm.id,
            externalId: pm.code,
            externalRef: targetPropertyId || 'default',
            syncedAt: now,
          })),
          skipDuplicates: true,
        });
      }

      let deactivatedCount = 0;
      if (pmsToHide.length > 0) {
        const res = await prisma.paymentMethod.updateMany({
          where: {
            companyId,
            propertyId: targetPropertyId,
            id: { in: pmsToHide.map((pm) => pm.id) },
            isActive: true,
          },
          data: { isActive: false },
        });
        deactivatedCount = res.count;
      }

      const newEntityMaps: Array<{
        companyId: string;
        integrationId: string;
        entityType: string;
        pmsId: string;
        externalId: string;
        externalRef: string;
        syncedAt: Date;
      }> = [];
      const updateEntityMaps: Array<{ id: string; externalId: string; externalRef: string }> = [];

      for (const cb of v6CbList) {
        const lower = cb.code.toLowerCase();
        const pmsId = pmIdByLower.get(lower);
        if (!pmsId) continue;

        const existingMap = pmEntityMapByPmsId.get(pmsId);
        const existingOrigin = existingMap?.externalRef?.startsWith('V6 |')
          ? 'V6'
          : existingMap?.externalRef?.startsWith('PMS |')
            ? 'PMS'
            : null;
        const originPrefix =
          existingOrigin || (newlyCreatedLowers.has(lower) ? 'V6' : 'PMS');
        const extRef = `${originPrefix} | ${cb.syskey && cb.syskey !== '0' ? `Syskey: ${cb.syskey}` : cb.name}`.substring(0, 255);

        if (!existingMap) {
          newEntityMaps.push({
            companyId,
            integrationId: config.id,
            entityType: 'payment_method',
            pmsId,
            externalId: cb.code,
            externalRef: extRef,
            syncedAt: now,
          });
        } else if (existingMap.externalId !== cb.code || existingMap.externalRef !== extRef) {
          updateEntityMaps.push({
            id: existingMap.id,
            externalId: cb.code,
            externalRef: extRef,
          });
        }
      }

      if (newEntityMaps.length > 0) {
        await prisma.integrationEntityMap
          .createMany({
            data: newEntityMaps,
            skipDuplicates: true,
          })
          .catch(() => {});
      }

      for (let i = 0; i < updateEntityMaps.length; i += CHUNK) {
        const batch = updateEntityMaps.slice(i, i + CHUNK);
        await Promise.all(
          batch.map((m) =>
            prisma.integrationEntityMap.update({
              where: { id: m.id },
              data: {
                externalId: m.externalId,
                externalRef: m.externalRef,
                syncedAt: now,
              },
            }),
          ),
        );
      }

      const durationMs = Date.now() - t0;

      if (!skipLog) {
        await prisma.integrationSyncLog
          .create({
            data: {
              companyId,
              integrationId: config.id,
              syncType: 'cashbook_sync',
              direction: 'pull',
              status: 'success',
              recordsProcessed: v6CbList.length,
              recordsCreated: createdCount,
              recordsUpdated: updatedCount,
              recordsFailed: 0,
              errorDetails: [],
              durationMs,
              initiatedBy,
              initiatedUserId: userId || null,
              completedAt: new Date(),
            },
          })
          .catch((err) => logger.warn(`Failed to persist V6 Cashbook sync log: ${err.message}`));

        await prisma.integrationConfig
          .update({
            where: { id: config.id },
            data: { lastSyncAt: new Date(), lastError: null },
          })
          .catch(() => {});
      }

      logger.info(
        `V6 ERP Cashbook sync completed for property ${targetPropertyId}: cashbooks=${v6CbList.length} (created=${createdCount}, updated=${updatedCount}, hidden=${deactivatedCount})`,
      );

      return {
        success: true,
        propertyId: targetPropertyId,
        totalV6Cashbooks: v6CbList.length,
        created: createdCount,
        updated: updatedCount,
        deactivated: deactivatedCount,
        durationMs,
        message: `Synced ${v6CbList.length} Payment Method(s) from V6 ERP Cashbook.`,
      };
    })();

    this.activeCashbookSyncs.set(lockKey, runner);
    try {
      return await runner;
    } finally {
      this.activeCashbookSyncs.delete(lockKey);
    }
  }

  private async importV6Customers(config: any, companyId: string, effectivePropertyId?: string) {
    const { cleanRoot, domain } = this.resolveV6Config(config);
    const customerEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/getCustomer`;
    const custResp = await fetch(customerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, code: '', date: '' }),
      signal: AbortSignal.timeout(10000),
    });

    let imported = 0;
    let updated = 0;
    let total = 0;

    if (!custResp.ok) {
      return { ok: false, status: custResp.status, imported, updated, total };
    }

    const custJson = (await custResp.json().catch(() => null)) as any;
    const list: any[] = custJson?.list || [];
    total = list.length;
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
            // Every tenant synced from V6 is treated as already verified
            kycStatus: 'verified',
            kycVerifiedAt: existingTenant.kycVerifiedAt ?? new Date(),
          },
        });
        updated++;
      } else {
        const newTenant = await prisma.tenant.create({
          data: {
            companyId,
            ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}),
            tenantType: 'individual',
            code: cuscode,
            firstName: cuscode,
            lastName: cusname || cuscode,
            email: item.email || null,
            phone: item.phone || item.mobile || null,
            // Every tenant synced from V6 is treated as already verified
            kycStatus: 'verified',
            kycVerifiedAt: new Date(),
          },
        });
        tenantId = newTenant.id;
        imported++;
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

    return { ok: true, status: custResp.status, imported, updated, total };
  }

  /**
   * Pull customers from V6 ERP into PMS tenants for the active property (when the V6 ERP flag is ON).
   * Standalone counterpart of the customer step in syncV6Erp, used by the Tenants page
   * "Sync V6 Customers" button.
   */
  async syncV6Customers(companyId: string, propertyId?: string, userId?: string) {
    await ensurePropertySetupScope();
    const targetPropertyId = await resolveEffectivePropertyId(companyId, propertyId);

    const config = await prisma.integrationConfig.findFirst({
      where: {
        companyId,
        ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
        integrationType: 'v6erp',
        isActive: true,
        status: { not: 'disabled' },
      },
    });

    if (!config) {
      throw new AppError(
        400,
        'V6ERP_NOT_ACTIVE',
        'V6 ERP integration is not active. Turn ON the V6 ERP flag in Integrations first.',
      );
    }

    const t0 = Date.now();
    let result = { ok: true, status: 200, imported: 0, updated: 0, total: 0 };
    let failure: AppError | null = null;

    try {
      result = await this.importV6Customers(config, companyId, targetPropertyId || undefined);
      if (!result.ok) {
        failure = new AppError(
          502,
          'V6ERP_CUSTOMER_FETCH_FAILED',
          `V6 ERP getCustomer failed with HTTP ${result.status}`,
        );
      }
    } catch (err: any) {
      failure =
        err instanceof AppError
          ? err
          : new AppError(502, 'V6ERP_CUSTOMER_FETCH_FAILED', `Cannot reach V6 ERP: ${err?.message || err}`);
    }

    await prisma.integrationSyncLog.create({
      data: {
        companyId,
        integrationId: config.id,
        syncType: 'customer_sync',
        direction: 'pull',
        status: failure ? 'failed' : 'success',
        recordsProcessed: result.total,
        recordsCreated: result.imported,
        recordsUpdated: result.updated,
        recordsFailed: failure ? 1 : 0,
        errorDetails: failure ? [{ error: failure.message }] : [],
        durationMs: Date.now() - t0,
        initiatedBy: 'user',
        initiatedUserId: userId || null,
        completedAt: new Date(),
      },
    });

    if (failure) throw failure;

    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });

    return {
      success: true,
      totalV6Customers: result.total,
      created: result.imported,
      updated: result.updated,
      message: `Synced ${result.total} customer(s) from V6 ERP (${result.imported} imported, ${result.updated} updated).`,
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
    await ensurePropertySetupScope();
    const effectivePropertyId = await resolveEffectivePropertyId(
      companyId,
      propertyId || config?.propertyId,
    );
    // Validate V6 ERP connection settings up-front (throws when baseUrl is not configured)
    this.resolveV6Config(config);

    const t0 = Date.now();
    let customersImported = 0;
    let customersUpdated = 0;
    let coaCreated = 0;
    let coaUpdated = 0;
    let coaTotal = 0;
    const errors: any[] = [];

    // 1. Inbound Customer Sync from V6 ERP
    try {
      const custRes = await this.importV6Customers(config, companyId, effectivePropertyId || undefined);
      customersImported += custRes.imported;
      customersUpdated += custRes.updated;
    } catch (cErr: any) {
      logger.warn(`V6 ERP customer sync warning: ${cErr.message}`);
      errors.push({ error: `Customer sync warning: ${cErr.message}` });
    }

    // 2. Inbound Chart of Accounts Sync from V6 ERP (when V6 Flag is ON)
    if (config.isActive && config.status !== 'disabled') {
      try {
        if (effectivePropertyId) {
          const coaRes = await this.syncV6ChartOfAccounts(companyId, effectivePropertyId, userId, true, config, initiatedBy);
          coaCreated += coaRes.created || 0;
          coaUpdated += coaRes.updated || 0;
          coaTotal += coaRes.totalV6Accounts || 0;
        }
      } catch (coaErr: any) {
        logger.warn(`V6 ERP COA sync warning: ${coaErr.message}`);
        errors.push({ error: `COA sync warning: ${coaErr.message}` });
      }
    }

    // 3. Outbound Invoice Push to V6 ERP
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
   * Push PMS "issued" invoices for the active property to V6 ERP
   * via POST {cleanRoot}/v6IntegrationAPIlogin/saveInvoice.
   */
  async pushInvoicesToV6Erp(
    companyId: string,
    invoiceIds?: string[],
    skipLog = false,
    propertyId?: string,
    preloadedConfig?: any,
  ) {
    // ── 1. Load V6 ERP integration config ──────────────────────────────────
    await ensurePropertySetupScope();
    const targetPropertyId = await resolveEffectivePropertyId(
      companyId,
      propertyId || preloadedConfig?.propertyId,
    );
    const config =
      preloadedConfig ||
      (await prisma.integrationConfig.findFirst({
        where: {
          companyId,
          ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
          integrationType: 'v6erp',
          status: { not: 'disabled' },
        },
      }));

    if (!config) {
      throw AppError.notFound(
        'V6 ERP integration not configured for this property. Go to Developer → Integrations → Add Integration (V6 ERP).',
      );
    }

    const { cleanRoot, domain } = this.resolveV6Config(config);
    const t0 = Date.now();

    // ── 2. Fetch issued invoices WITH line items ────────────────────────────
    const whereClause: any = {
      companyId,
      status: 'issued',
      ...(targetPropertyId ? { propertyId: targetPropertyId } : {}),
    };
    if (invoiceIds && invoiceIds.length > 0) {
      whereClause.id = { in: invoiceIds };
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        tenant:           { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        unit:             { select: { id: true, unitNumber: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter:       { select: { id: true, code: true, name: true } },
        lines: {
          include: {
            chargeType: {
              select: {
                id: true,
                code: true,
                name: true,
                glAccountCode: true,
                departmentCenter: { select: { id: true, code: true, name: true } },
                costCenter:       { select: { id: true, code: true, name: true } },
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
            durationMs: Date.now() - t0,
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

    // ── 3. V6 ERP Endpoints, Auth & Dept/CC Syskey Lookup ─────────────────
    const integrationEndpoint = `${cleanRoot}/v6IntegrationAPIlogin/saveInvoice`;
    const saleInvoiceEndpoint = `${cleanRoot}/saleInvoice/saveInvoice`;
    const customerEndpoint    = `${cleanRoot}/v6IntegrationAPIlogin/getCustomer`;
    const headers = { 'Content-Type': 'application/json' };

    // Obtain V6 JWT token & user syskey for native saleInvoice/saveInvoice (supports n56 Dept & n57 CC syskeys)
    let v6Token = '';
    let v6Usk = '10150000188';
    let v6UserId = 'admin';
    let v6UserName = 'Admin';
    try {
      const tokenResp = await fetch(`${cleanRoot}/lkn/getotkenlogin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ domain }),
        signal: AbortSignal.timeout(8000),
      });
      if (tokenResp.ok) {
        const tokenJson = (await tokenResp.json().catch(() => null)) as any;
        if (tokenJson?.token) v6Token = String(tokenJson.token);
      }
    } catch { /* fallback below */ }

    if (!v6Token) {
      try {
        const refreshResp = await fetch(`${cleanRoot}/main/loginRefreshToken`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ domain, userId: 'admin', oid: '001' }),
          signal: AbortSignal.timeout(8000),
        });
        if (refreshResp.ok) {
          const refreshJson = (await refreshResp.json().catch(() => null)) as any;
          if (refreshJson?.token) v6Token = String(refreshJson.token);
        }
      } catch { /* ignore */ }
    }

    if (v6Token) {
      try {
        const parts = v6Token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload?.usk) v6Usk = String(payload.usk);
          if (payload?.uid) v6UserId = String(payload.uid);
          if (payload?.uname) v6UserName = String(payload.uname);
        }
      } catch { /* keep defaults */ }
    }

    const authHeaders = v6Token
      ? { 'Content-Type': 'application/json', 'Content-Over': v6Token, 'APP-CALLER': '1' }
      : headers;

    // Load V6 Departments, Cost Centers, and COA to map Invoice Dept/CC -> V6 Syskey (n56, n57)
    const v6DeptByCode = new Map<string, { code: string; name: string; syskey: string }>();
    const v6DeptByName = new Map<string, { code: string; name: string; syskey: string }>();
    const v6CcByCode   = new Map<string, { code: string; name: string; syskey: string }>();
    const v6CcByName   = new Map<string, { code: string; name: string; syskey: string }>();
    let activeCoaRows: any[] = [];
    let defaultSalePersonSk = '0';
    let v6WhskStr = '0';
    let v6CusTypesArr: string[] = ['0'];
    let v6DefAccList: any = null;
    let v6TaxList: any[] = [];

    try {
      const [bundle, entityMaps, spResp, locResp, bpResp, defAccResp, taxResp] = await Promise.all([
        this.fetchV6CoaBundle(cleanRoot, domain).catch(() => ({
          coaRows: [],
          departments: [],
          costCenters: [],
          categories: [],
        })),
        prisma.integrationEntityMap.findMany({
          where: {
            companyId,
            integrationId: config.id,
            entityType: { in: ['department_center', 'cost_center'] },
          },
        }).catch(() => []),
        v6Token
          ? fetch(`${cleanRoot}/main/saleperson/`, { method: 'GET', headers: authHeaders, signal: AbortSignal.timeout(6000) }).catch(() => null)
          : Promise.resolve(null),
        v6Token
          ? fetch(`${cleanRoot}/main/locations/${encodeURIComponent(v6Usk)}`, { method: 'GET', headers: authHeaders, signal: AbortSignal.timeout(6000) }).catch(() => null)
          : Promise.resolve(null),
        v6Token
          ? fetch(`${cleanRoot}/bptype/getBPTypes/1`, { method: 'GET', headers: authHeaders, signal: AbortSignal.timeout(6000) }).catch(() => null)
          : Promise.resolve(null),
        v6Token
          ? fetch(`${cleanRoot}/saleInvoice/getDefAccountList`, { method: 'POST', headers: authHeaders, body: JSON.stringify({}), signal: AbortSignal.timeout(6000) }).catch(() => null)
          : Promise.resolve(null),
        v6Token
          ? fetch(`${cleanRoot}/tax/taxList/`, { method: 'GET', headers: authHeaders, signal: AbortSignal.timeout(6000) }).catch(() => null)
          : Promise.resolve(null),
      ]);

      activeCoaRows = (bundle.coaRows || []).filter((item: any) => item?.recordStatus !== 4);

      for (const d of bundle.departments || []) {
        if (d?.recordStatus === 4) continue;
        const code = String(d?.t1 || d?.code || '').trim();
        const name = String(d?.t2 || d?.description || d?.name || code).trim();
        const syskey = String(d?.syskey || '').trim();
        if (code && syskey && syskey !== '0') {
          const entry = { code, name, syskey };
          v6DeptByCode.set(code.toLowerCase(), entry);
          if (name) v6DeptByName.set(name.toLowerCase(), entry);
        }
      }
      for (const item of activeCoaRows) {
        const code = String(item?.deptCode || '').trim();
        const name = String(item?.t5 || code).trim();
        const syskey = String(item?.n12 || '').trim();
        if (code && syskey && syskey !== '0' && !v6DeptByCode.has(code.toLowerCase())) {
          const entry = { code, name, syskey };
          v6DeptByCode.set(code.toLowerCase(), entry);
          if (name) v6DeptByName.set(name.toLowerCase(), entry);
        }
      }

      for (const cc of bundle.costCenters || []) {
        if (cc?.recordStatus === 4) continue;
        const code = String(cc?.t1 || cc?.code || '').trim();
        const name = String(cc?.t2 || cc?.description || cc?.name || code).trim();
        const syskey = String(cc?.syskey || '').trim();
        if (code && syskey && syskey !== '0') {
          const entry = { code, name, syskey };
          v6CcByCode.set(code.toLowerCase(), entry);
          if (name) v6CcByName.set(name.toLowerCase(), entry);
        }
      }
      for (const item of activeCoaRows) {
        const code = String(item?.ccCode || '').trim();
        const name = String(item?.t3 || code).trim();
        const syskey = String(item?.n11 || '').trim();
        if (code && syskey && syskey !== '0' && !v6CcByCode.has(code.toLowerCase())) {
          const entry = { code, name, syskey };
          v6CcByCode.set(code.toLowerCase(), entry);
          if (name) v6CcByName.set(name.toLowerCase(), entry);
        }
      }

      // Fallback from IntegrationEntityMap if any syskey is stored in externalRef ("Syskey: 12345")
      for (const m of entityMaps) {
        const skMatch = String(m.externalRef || '').match(/Syskey:\s*([0-9]+)/i);
        const syskey = skMatch?.[1] || '';
        const code = String(m.externalId || '').trim();
        if (!code || !syskey) continue;
        if (m.entityType === 'department_center' && !v6DeptByCode.has(code.toLowerCase())) {
          v6DeptByCode.set(code.toLowerCase(), { code, name: code, syskey });
        } else if (m.entityType === 'cost_center' && !v6CcByCode.has(code.toLowerCase())) {
          v6CcByCode.set(code.toLowerCase(), { code, name: code, syskey });
        }
      }

      if (spResp && spResp.ok) {
        const spList = (await spResp.json().catch(() => null)) as any[];
        if (Array.isArray(spList) && spList.length > 0) {
          // Default Sale Person = V6 user "v6admin"; fall back to "admin" when it is not set up.
          const findSpByCode = (code: string) =>
            spList.find((s: any) => String(s?.t1 || '').trim().toLowerCase() === code);
          const defaultSp = findSpByCode('v6admin') || findSpByCode('admin');
          if (defaultSp?.code && defaultSp.code !== '0') {
            defaultSalePersonSk = String(defaultSp.code);
          } else {
            logger.warn('V6 ERP: Default Sale Person "v6admin"/"admin" not found in /main/saleperson/ — n21 will be 0');
          }
        }
      }
      if (locResp && locResp.ok) {
        const locList = (await locResp.json().catch(() => null)) as any[];
        if (Array.isArray(locList) && locList.length > 0) {
          v6WhskStr = locList.map((l: any) => String(l.code)).join(',');
        }
      }
      if (bpResp && bpResp.ok) {
        const bpList = (await bpResp.json().catch(() => null)) as any[];
        if (Array.isArray(bpList) && bpList.length > 0) {
          v6CusTypesArr = bpList.map((b: any) => String(b.code));
        }
      }
      if (defAccResp && defAccResp.ok) {
        v6DefAccList = await defAccResp.json().catch(() => null);
      }
      if (taxResp && taxResp.ok) {
        const tList = (await taxResp.json().catch(() => null)) as any[];
        if (Array.isArray(tList)) {
          v6TaxList = tList.filter((t: any) => Number(t?.n8 ?? 0) === 0 || Number(t?.n8 ?? 0) === 2);
        }
      }
    } catch (bundleErr: any) {
      logger.warn(`V6 ERP: Failed to preload Dept/CC/COA bundle: ${bundleErr?.message}`);
    }

    const resolveV6Tax = (
      taxPercent: number,
      hasTax: boolean,
    ): { syskey: string; rate: number; isInclusive: number } => {
      const cleanRate = hasTax && taxPercent > 0 ? Math.round(taxPercent * 100) / 100 : 0;
      if (v6TaxList.length > 0) {
        if (cleanRate > 0) {
          // Match exact rate in V6 tax setup (prefer exclusive tax n4 === '0' since PMS tax is exclusive)
          const exactExcl = v6TaxList.find(
            (t: any) => Math.abs(Number(t?.n3 || 0) - cleanRate) < 0.01 && String(t?.n4 ?? '0') === '0',
          );
          const exactAny = v6TaxList.find(
            (t: any) => Math.abs(Number(t?.n3 || 0) - cleanRate) < 0.01,
          );
          const defaultTax = v6TaxList.find(
            (t: any) => String(t?.n6 || '0') === '1' && Number(t?.n3 || 0) > 0,
          );
          const chosen = exactExcl || exactAny || defaultTax;
          if (chosen?.syskey) {
            return {
              syskey: String(chosen.syskey),
              rate: cleanRate,
              isInclusive: 0,
            };
          }
        } else {
          // 0% tax -> match 0% tax code (e.g. T0)
          const zeroTax =
            v6TaxList.find((t: any) => Number(t?.n3 || 0) === 0 && String(t?.n4 ?? '0') === '0') ||
            v6TaxList.find((t: any) => Number(t?.n3 || 0) === 0);
          if (zeroTax?.syskey) {
            return {
              syskey: String(zeroTax.syskey),
              rate: 0,
              isInclusive: 0,
            };
          }
        }
      }
      return { syskey: '0', rate: cleanRate, isInclusive: 0 };
    };

    const resolveV6DeptSyskey = (dept?: { code?: string | null; name?: string | null } | null) => {
      if (!dept) return { syskey: '0', name: '', code: '' };
      const code = String(dept.code || '').trim();
      const name = String(dept.name || '').trim();
      const found =
        (code ? v6DeptByCode.get(code.toLowerCase()) : undefined) ||
        (name ? v6DeptByName.get(name.toLowerCase()) : undefined) ||
        (code ? v6DeptByName.get(code.toLowerCase()) : undefined);
      return found
        ? { syskey: found.syskey, name: found.name, code: found.code }
        : { syskey: '0', name, code };
    };

    const resolveV6CcSyskey = (cc?: { code?: string | null; name?: string | null } | null) => {
      if (!cc) return { syskey: '0', name: '', code: '' };
      const code = String(cc.code || '').trim();
      const name = String(cc.name || '').trim();
      const found =
        (code ? v6CcByCode.get(code.toLowerCase()) : undefined) ||
        (name ? v6CcByName.get(name.toLowerCase()) : undefined) ||
        (code ? v6CcByName.get(code.toLowerCase()) : undefined);
      return found
        ? { syskey: found.syskey, name: found.name, code: found.code }
        : { syskey: '0', name, code };
    };

    const resolveV6GlAccountForDeptCc = (
      preferredCode: string | undefined | null,
      deptSk: string,
      ccSk: string,
      fallbackCodePrefix?: string,
      defaultEntry?: { code?: string; t1?: string },
    ): { syskey: string; code: string } => {
      const cleanCode = String(preferredCode || '').trim().toLowerCase();
      if (cleanCode) {
        const codeMatches = activeCoaRows.filter(
          (r: any) => String(r?.t1 || r?.code || '').trim().toLowerCase() === cleanCode,
        );
        const exact =
          codeMatches.find((r: any) => String(r?.n12 || '0') === deptSk && String(r?.n11 || '0') === ccSk) ||
          codeMatches.find((r: any) => String(r?.n11 || '0') === ccSk && (String(r?.n12 || '0') === '0' || !r?.n12)) ||
          codeMatches.find((r: any) => String(r?.n12 || '0') === deptSk && (String(r?.n11 || '0') === '0' || !r?.n11)) ||
          codeMatches[0];
        if (exact?.syskey) {
          return { syskey: String(exact.syskey), code: String(exact.t1 || exact.code || preferredCode) };
        }
      }

      if (fallbackCodePrefix) {
        const prefixLower = fallbackCodePrefix.toLowerCase();
        const comboMatch =
          activeCoaRows.find(
            (r: any) =>
              String(r?.n12 || '0') === deptSk &&
              String(r?.n11 || '0') === ccSk &&
              String(r?.t1 || r?.code || '').trim().toLowerCase().startsWith(prefixLower),
          ) ||
          activeCoaRows.find(
            (r: any) =>
              String(r?.n11 || '0') === ccSk &&
              String(r?.t1 || r?.code || '').trim().toLowerCase().startsWith(prefixLower),
          );
        if (comboMatch?.syskey) {
          return { syskey: String(comboMatch.syskey), code: String(comboMatch.t1 || comboMatch.code || '') };
        }
      }

      if (defaultEntry?.t1 && defaultEntry.t1 !== '0') {
        return { syskey: String(defaultEntry.t1), code: String(defaultEntry.code || '') };
      }
      return { syskey: '0', code: cleanCode || '' };
    };

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
        const docDateStr = fmtV6Date(inv.invoiceDate);
        const dueDateStr = fmtV6Date(inv.dueDate || inv.invoiceDate);
        const currencyCode = (inv.currency || 'MMK').trim() || 'MMK';
        const currRate = Number(inv.currencyRate) > 0 ? Number(inv.currencyRate) : 1;

        // ── Resolve V6 Department (n56) & Cost Center (n57) Syskeys from Invoice / Line ChargeType ──
        const pmsDept =
          (inv as any).departmentCenter ||
          (inv as any).lines?.find((l: any) => l.chargeType?.departmentCenter)?.chargeType?.departmentCenter ||
          null;
        const pmsCc =
          (inv as any).costCenter ||
          (inv as any).lines?.find((l: any) => l.chargeType?.costCenter)?.chargeType?.costCenter ||
          null;

        const v6Dept = resolveV6DeptSyskey(pmsDept);
        const v6Cc   = resolveV6CcSyskey(pmsCc);
        const n56    = v6Dept.syskey;
        const n57    = v6Cc.syskey;

        const lineDescriptions =
          (inv as any).lines
            .map((l: any) => l.description || l.chargeType?.name || '')
            .filter(Boolean)
            .join(', ') || 'PMS Invoice';

        // Resolve header & detail GL accounts for (n56, n57)
        const firstLineGlCode = (inv as any).lines?.[0]?.chargeType?.glAccountCode || '';
        const hdrSalesAcc = resolveV6GlAccountForDeptCc(
          firstLineGlCode || v6DefAccList?.salesInvAccount?.code,
          n56,
          n57,
          '4-',
          v6DefAccList?.salesInvAccount,
        );
        const hdrTaxAcc = resolveV6GlAccountForDeptCc(
          v6DefAccList?.salesTaxAccount?.code,
          n56,
          n57,
          '2-CT',
          v6DefAccList?.salesTaxAccount,
        );
        const hdrDiscAcc = resolveV6GlAccountForDeptCc(
          v6DefAccList?.discAccount?.code,
          n56,
          n57,
          '7-',
          v6DefAccList?.discAccount,
        );
        const hdrStkAcc = resolveV6GlAccountForDeptCc(
          v6DefAccList?.stkAccount?.code,
          n56,
          n57,
          undefined,
          v6DefAccList?.stkAccount,
        );
        const hdrCosAcc = resolveV6GlAccountForDeptCc(
          v6DefAccList?.cosAccount?.code,
          n56,
          n57,
          undefined,
          v6DefAccList?.cosAccount,
        );

        let isSuccess = false;
        let isAlreadyExists = false;
        let v6Status = '';
        let v6Msg = '';
        let respText = '';
        let savedV6InvoiceNo = '';
        let savedV6Syskey = '';

        // ── Check if invoice already exists in V6 by Second Ref (inv.invoiceNumber) ──
        if (v6Token) {
          try {
            const existResp = await fetch(`${cleanRoot}/saleInvoice/searchsalelistSIByRoleAllowed`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                showAmount: 1,
                referenceno: '',
                secondrefno: inv.invoiceNumber,
                crossrefno: '',
                remark: '',
                customerCodeOpt: 'c',
                customerNameOpt: 'c',
                customerCode: '',
                customerName: '',
                fromDate: docDateStr,
                toDate: docDateStr,
                docdateoptr: 'all',
                status: '0',
                CurCode: '-1',
                whsk: v6WhskStr,
                deptSK: '-1',
                ccSK: '-1',
                PONo: '',
                salePersonOpt: 'c',
                salesPerson: '',
                amountOpt: 'all',
                amount: '0.0',
                _amountOption: '0',
                balanceOpt: 'all',
                balance: '0.0',
                currentPage: 1,
                pageSize: 10,
                userId: '',
                subTransType: 0,
                locSyskey: '-1',
                locGrpSyskey: '-1',
                isMultiLoc: '0',
                cusTypes: v6CusTypesArr,
                saleType: '',
                deliTime: '',
                sortBy: 't1',
                sort: 1,
                cuscurcode: '',
              }),
              signal: AbortSignal.timeout(8000),
            });
            if (existResp.ok) {
              const existJson = (await existResp.json().catch(() => null)) as any;
              const matchExisting = (existJson?.saleInvListData || []).find(
                (row: any) =>
                  String(row?.secondRef || '').trim().toLowerCase() === inv.invoiceNumber.trim().toLowerCase() &&
                  Number(row?.saveStatus) !== 6,
              );
              if (matchExisting) {
                isAlreadyExists = true;
                savedV6InvoiceNo = String(matchExisting.manualRef || inv.invoiceNumber);
                savedV6Syskey = String(matchExisting.syskey || '');
              }
            }
          } catch { /* ignore duplicate check failure */ }
        }

        // ── Push via native V6 saleInvoice/saveInvoice (sets n56 = Dept Syskey & n57 = CC Syskey) ──
        if (!isAlreadyExists && v6Token) {
          const totalAmt    = Number(inv.totalAmount) || 0;
          const taxAmt      = Number(inv.taxAmount) || 0;
          const discAmt     = Number(inv.discountAmount) || 0;
          const subTotalAmt = Number((inv as any).subtotal) || Math.round((totalAmt - taxAmt) * 100) / 100;

          const lineTaxRates = ((inv as any).lines || []).map((line: any) => {
            const qty = Number(line.quantity) || 1;
            const unitPrice = Number(line.unitPrice) || 0;
            const lineSubTotal = Number(line.amount) || Math.round(qty * unitPrice * 100) / 100 || 0;
            const lineTax = Number(line.taxAmount) || 0;
            const rawRate = Number(line.taxRate) || 0;
            const pct =
              rawRate > 0
                ? rawRate < 1
                  ? Math.round(rawRate * 10000) / 100
                  : rawRate
                : lineTax > 0 && lineSubTotal > 0
                  ? Math.round((lineTax / lineSubTotal) * 10000) / 100
                  : 0;
            return lineTax > 0 ? pct : 0;
          });
          const distinctLineRates = Array.from(new Set<number>(lineTaxRates));
          const isSingleTaxRate = distinctLineRates.length <= 1 ? 1 : 0;
          const hdrTaxPercent =
            distinctLineRates.find((r) => r > 0) ??
            (taxAmt > 0 && subTotalAmt > 0 ? Math.round((taxAmt / subTotalAmt) * 10000) / 100 : 0);
          const hdrTaxInfo = resolveV6Tax(hdrTaxPercent, taxAmt > 0);

          const saleInvoicePayload = {
            syskey: '0',
            autokey: '0',
            createddate: '',
            modifieddate: '',
            userid: v6UserId,
            username: v6UserName,
            voidReason: '',
            territorycode: '0',
            salescode: '0',
            salesSK: hdrSalesAcc.syskey,
            discode: '',
            disSK: hdrDiscAcc.syskey,
            discAcc: hdrDiscAcc.code,
            salesAcc: hdrSalesAcc.code,
            projectcode: '0',
            ref1: '0',
            ref2: '0',
            ref3: '0',
            ref4: '0',
            ref5: '0',
            ref6: '0',
            saveStatus: 4,
            recordStatus: 1,
            syncStatus: 0,
            syncBatch: '0',
            transType: 231,
            t1: 'TBA',
            t2: inv.invoiceNumber,
            t3: docDateStr,
            t4: dueDateStr,
            t5: docDateStr,
            t6: dueDateStr,
            t7: '',
            t8: currencyCode,
            t9: `PMS: ${inv.invoiceNumber}`,
            t10: customerName,
            t11: lineDescriptions,
            n1: cuskey,
            n2: '0',
            n3: '0',
            n4: currRate,
            n5: totalAmt,
            n6: 0,
            n7: discAmt,
            n8: 0,
            n9: discAmt,
            n10: subTotalAmt,
            n11: hdrTaxInfo.syskey,
            n12: hdrTaxInfo.rate,
            n13: hdrTaxInfo.isInclusive,
            n14: taxAmt,
            n15: 0,
            n16: '0',
            n17: 0,
            n18: 0,
            n19: 0,
            n20: 0,
            n21: defaultSalePersonSk,
            n22: '0',
            n23: '0',
            n24: '0',
            n25: '0',
            convertamount: 0,
            n26: '0',
            n27: '0',
            n28: '0',
            n29: '0',
            t12: '',
            t13: '',
            t14: '',
            t15: '',
            t16: '',
            t17: '',
            t18: unitNumber,
            n30: 0,
            userSysKey: v6Usk,
            n31: 0,
            n32: 0,
            n33: 0,
            n34: 0,
            n35: 0,
            n36: 0,
            n37: 0,
            n38: 0,
            n39: 0,
            n40: 0,
            n41: 0,
            n42: 0,
            n43: 0,
            n44: 0,
            n45: 0,
            n46: 0,
            n47: 0,
            t19: '',
            t20: '',
            t21: '',
            t22: '',
            t23: '',
            t24: dueDateStr,
            t25: customerName,
            t26: '',
            t27: '',
            t28: '',
            t29: '',
            t30: '',
            t31: '',
            t32: '',
            t33: '',
            n48: 0,
            n49: isSingleTaxRate,
            n50: 0,
            n51: 0,
            n52: 1,
            n53: '0',
            n54: hdrTaxAcc.syskey,
            n55: '0',
            n56, // V6 Department Syskey
            n57, // V6 Cost Center Syskey
            n58: 0,
            t34: '',
            t35: '',
            t36: '',
            t37: '',
            t38: '',
            t39: '',
            t40: '',
            t41: '',
            t42: String(Date.now()),
            t43: dueDateStr,
            t44: dueDateStr,
            t45: '',
            customerCode,
            customerName,
            refCustomerCode: '',
            refCustomerName: '',
            createdtime: '',
            modifiedtime: '',
            transactionID: '0',
            glTransID: '0',
            crossJunParent: '',
            crossJunChild: '',
            checkYearCode: 0,
            checkMinMaxQty: 0,
            checkReOrderLvl: 0,
            isChangeCustomer: 0,
            isRenewRefno: 0,
            customer: customerName,
            location: '-',
            department: v6Dept.name,
            costcentre: v6Cc.name,
            priceband: '',
            subtranType: 0,
            discpercent: 0,
            transDetailsData: (inv as any).lines.map((line: any, idx: number) => {
              const lineDesc = line.description || line.chargeType?.name || '';
              const qty = Number(line.quantity) || 1;
              const unitPrice = Number(line.unitPrice) || 0;
              // SOP002 n34 & n38 must be Before-Tax line amount (line.amount), while n23 is lineTax
              const lineSubTotal = Number(line.amount) || Math.round(qty * unitPrice * 100) / 100 || 0;
              const lineTax = Number(line.taxAmount) || 0;
              const lineTaxInfo = resolveV6Tax(lineTaxRates[idx] || 0, lineTax > 0);
              const lineGl = resolveV6GlAccountForDeptCc(
                line.chargeType?.glAccountCode || hdrSalesAcc.code,
                n56,
                n57,
                '4-',
                v6DefAccList?.salesInvAccount,
              );

              return {
                syskey: '0',
                autokey: '0',
                createddate: '',
                modifieddate: '',
                userid: v6UserId,
                username: v6UserName,
                territorycode: '0',
                salescode: '0',
                salesAcc: lineGl.code,
                discode: '',
                discAcc: hdrDiscAcc.code,
                projectcode: '0',
                ref1: '0',
                ref2: '0',
                ref3: '0',
                ref4: '0',
                ref5: '0',
                ref6: '0',
                parentid: '0',
                recordStatus: 1,
                syncStatus: 0,
                syncBatch: '0',
                t1: String(1000000 + idx),
                t2: unitNumber || line.chargeType?.code || '',
                t3: lineDesc,
                t4: currencyCode,
                t5: currencyCode,
                t6: currencyCode,
                n1: '0',
                n2: '0',
                n3: 0,
                n4: '0',
                n5: 0,
                n6: qty,
                n7: '0',
                n8: qty,
                n9: 0,
                n10: 0,
                n11: 0,
                n12: 0,
                n13: 0,
                n14: unitPrice,
                n15: 1,
                n16: currRate,
                n17: currRate,
                n18: 0,
                n19: 0,
                n20: 0,
                n21: 0,
                n22: 0,
                n23: lineTax,
                n24: lineGl.syskey,
                n25: '0',
                n26: hdrStkAcc.syskey,
                n27: '0',
                n28: hdrCosAcc.syskey,
                n29: hdrDiscAcc.syskey,
                n30: hdrTaxAcc.syskey,
                n31: '0',
                n32: 0,
                n33: '0',
                n34: lineSubTotal,
                n35: lineTaxInfo.syskey,
                n36: lineTaxInfo.isInclusive,
                n37: lineTaxInfo.rate,
                n38: lineSubTotal,
                n39: 0,
                n40: 231,
                n41: 0,
                n42: 0,
                n43: '0',
                n44: 1,
                t7: '*',
                n45: '0',
                n46: 1,
                t8: '*',
                n47: 1,
                t9: '*',
                n48: 0,
                n49: unitPrice,
                t10: line.unit || 'Each',
                t11: '',
                n50: 0,
                n51: 0,
                n52: 0,
                n53: 0,
                n54: 0,
                n55: 0,
                n56: 0,
                n57: 0,
                n58: 0,
                n59: 0,
                n60: '0',
                n61: '0',
                n62: '0',
                t12: lineDesc,
                t13: lineDesc,
                t14: '',
                t15: '',
                t16: '',
                t17: '',
                uomsk: '0',
                parenthdrsk: '0',
                parenttype: 0,
                parentdtlsk: '0',
                parentrefno: '',
                retrieveRefNo: '',
                batchSerialOutData: [],
                stockUomData: [],
                checkOnhand: 0,
              };
            }),
            giftCardList: [],
            deletedTransDetails: [],
            discountGroupSK: '',
            transAddrData: {
              syskey: '0',
              createddate: '',
              modifieddate: '',
              userid: '',
              username: '',
              recordStatus: 1,
              syncStatus: 0,
              syncBatch: '0',
              t1: '',
              t2: '',
              t3: '',
              t4: '',
              t5: '',
              t6: '',
              t7: '',
              t8: '',
              t9: '',
              t10: '',
              t11: '',
              t12: '',
              t13: '',
              t14: '',
              t15: '',
              t16: '',
              n1: '0',
              n2: 0,
              n3: 0,
              n4: '0',
              userSysKey: '0',
              n5: '0',
              n6: '0',
              n7: 0,
            },
            crossJunParentList: {},
            crossJunChildList: {},
            domain,
          };

          logger.info(
            `V6 ERP: Pushing invoice ${inv.invoiceNumber} via saleInvoice/saveInvoice | customer=${customerCode} | amt=${inv.totalAmount} | n56(Dept)=${n56}(${v6Dept.code}) | n57(CC)=${n57}(${v6Cc.code})`,
          );

          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), 30000);
          const siResp = await fetch(saleInvoiceEndpoint, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(saleInvoicePayload),
            signal: abortCtrl.signal,
          });
          clearTimeout(timer);

          respText = await siResp.text().catch(() => '');
          let siJson: any = null;
          try { siJson = JSON.parse(respText); } catch { /* not JSON */ }

          v6Status = siJson?.status || '';
          v6Msg    = siJson?.message || '';
          isSuccess = v6Msg === 'SUCCESS' || v6Status === 'SUCCESS';
          isAlreadyExists = v6Msg === 'ManualRefExist';
          if (isSuccess) {
            savedV6InvoiceNo = String(siJson?.saleInvoiceNo || inv.invoiceNumber);
            savedV6Syskey    = String(siJson?.syskey || '');
          }
        }

        // ── Fallback to /v6IntegrationAPIlogin/saveInvoice if token was unavailable ──
        if (!isSuccess && !isAlreadyExists && !v6Token) {
          const integrationPayload = {
            cuskey,
            cuscode:    customerCode,
            date:       docDateStr,
            refno:      'TBA',             // V6 ERP auto-generates (e.g. INV-000012)
            secref:     inv.invoiceNumber, // PMS Invoice No as Second Ref
            amount:     Number(inv.totalAmount),
            savestatus: 4,                 // 4 = Saved/Posted
            domain,
            n56,                           // V6 Department Syskey
            n57,                           // V6 Cost Center Syskey
            remark:     `PMS: ${inv.invoiceNumber}`,
            remark1:    customerName,
            remark2:    lineDescriptions,
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

          logger.info(`V6 ERP: Pushing invoice ${inv.invoiceNumber} via integration API | customer=${customerCode} | amt=${inv.totalAmount} | n56=${n56} | n57=${n57}`);

          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), 30000);
          const resp = await fetch(integrationEndpoint, {
            method:  'POST',
            headers,
            body:    JSON.stringify(integrationPayload),
            signal:  abortCtrl.signal,
          });
          clearTimeout(timer);

          respText = await resp.text().catch(() => '');
          let v6Json: any = null;
          try { v6Json = JSON.parse(respText); } catch { /* not JSON */ }

          v6Status        = v6Json?.status  || '';
          v6Msg           = v6Json?.message || '';
          isSuccess       = v6Status === 'SUCCESS' || v6Msg === 'SUCCESS';
          isAlreadyExists = v6Msg   === 'ManualRefExist';
          if (v6Json?.syskey) savedV6Syskey = String(v6Json.syskey);
        }

        if (isSuccess || isAlreadyExists) {
          results.push({
            invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerCode, status: 'sent',
            error: isSuccess
              ? `✅ V6 ERP saved successfully${savedV6InvoiceNo ? ` (${savedV6InvoiceNo})` : ''}`
              : '⚠️ Already exists in V6 ERP (ManualRefExist)',
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

          if (savedV6Syskey && savedV6Syskey !== '0') {
            await prisma.$executeRaw`
              UPDATE "invoices"
              SET "external_ref" = ${savedV6Syskey}
              WHERE "id" = ${inv.id}::uuid
            `.catch(extErr => logger.warn(`Failed to update invoice external_ref for ${inv.invoiceNumber}: ${extErr.message}`));
          }

          const extId = savedV6InvoiceNo || inv.invoiceNumber;
          const extRefParts = [`Customer: ${customerCode}`];
          if (savedV6Syskey) extRefParts.push(`Syskey: ${savedV6Syskey}`);
          if (n56 !== '0') extRefParts.push(`Dept(n56): ${v6Dept.code || n56}`);
          if (n57 !== '0') extRefParts.push(`CC(n57): ${v6Cc.code || n57}`);
          const extRef = extRefParts.join(' | ').substring(0, 255);

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
              externalId: extId,
              externalRef: extRef,
              syncedAt: new Date(),
            },
            update: {
              externalId: extId,
              externalRef: extRef,
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

    // ── 4. Record sync log & update last sync timestamp ───────────────────
    const sentCount = results.filter(r => r.status === 'sent').length;
    const failedResults = results.filter(r => r.status === 'failed');
    const failedCount = failedResults.length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

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
          errorDetails: failedResults,
          durationMs: Date.now() - t0,
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
      failed:  failedCount,
      skipped: skippedCount,
      results,
      message: `${sentCount} invoice(s) sent to V6 ERP.`,
    };
  }
}

export const integrationsService = new IntegrationsService();
