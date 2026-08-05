/**
 * Phase 2 Notification Templates — seeds leasing, tenant, KYC, and parking
 * notification templates if they don't already exist.
 *
 * Called at server startup alongside billing notification templates.
 */
import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

export async function seedPhase2NotificationTemplates() {
  const templates = [
    // ── Lease lifecycle ──
    {
      code: 'lease_activated',
      name: 'Lease Activated',
      description: 'Sent when a lease transitions to active status',
      channels: ['email', 'in_app'],
      subject: 'Lease {{leaseNumber}} Activated — {{propertyName}}',
      bodyText: 'Lease {{leaseNumber}} for unit {{unitCode}} at {{propertyName}} has been activated. Effective from {{startDate}} to {{endDate}}. Monthly rent: {{currency}} {{monthlyRent}}.',
      bodyHtml: null,
      bodyPush: 'Lease {{leaseNumber}} is now active',
      isCritical: false,
    },
    {
      code: 'lease_terminated',
      name: 'Lease Terminated',
      description: 'Sent when a lease is terminated early',
      channels: ['email', 'in_app'],
      subject: 'Lease {{leaseNumber}} Terminated — {{propertyName}}',
      bodyText: 'Lease {{leaseNumber}} for {{tenantName}} at {{propertyName}} has been terminated effective {{terminationDate}}. Reason: {{reason}}.',
      bodyHtml: null,
      bodyPush: 'Lease {{leaseNumber}} terminated',
      isCritical: true,
    },
    {
      code: 'lease_expiring_soon',
      name: 'Lease Expiring Soon',
      description: 'Reminder sent at 90/60/30/14/7 days before lease expiry',
      channels: ['email', 'in_app'],
      subject: 'Lease {{leaseNumber}} Expiring in {{daysRemaining}} Days',
      bodyText: 'Lease {{leaseNumber}} for unit {{unitCode}} at {{propertyName}} (tenant: {{tenantName}}) will expire on {{endDate}} — {{daysRemaining}} days remaining. Please contact the tenant about renewal.',
      bodyHtml: null,
      bodyPush: 'Lease {{leaseNumber}} expires in {{daysRemaining}} days',
      isCritical: false,
    },
    {
      code: 'lease_renewal_offer',
      name: 'Lease Renewal Offer',
      description: 'Sent when a renewal offer is generated for an expiring lease',
      channels: ['email', 'in_app'],
      subject: 'Renewal Offer for Lease {{leaseNumber}} — {{propertyName}}',
      bodyText: 'Dear {{tenantName}}, a renewal offer has been prepared for your lease {{leaseNumber}} at {{propertyName}}. New term: {{newStartDate}} to {{newEndDate}}. Proposed rent: {{currency}} {{newMonthlyRent}}. Please respond by {{responseDeadline}}.',
      bodyHtml: null,
      bodyPush: 'Renewal offer for lease {{leaseNumber}}',
      isCritical: false,
    },
    {
      code: 'lease_approved',
      name: 'Lease Approved',
      description: 'Sent when a lease draft is approved by a manager',
      channels: ['email', 'in_app'],
      subject: 'Lease {{leaseNumber}} Approved — Ready for Activation',
      bodyText: 'Lease {{leaseNumber}} for {{tenantName}} at {{propertyName}} has been approved by {{approverName}}. The lease is now ready to be activated.',
      bodyHtml: null,
      bodyPush: 'Lease {{leaseNumber}} approved',
      isCritical: false,
    },
    {
      code: 'lease_rejected',
      name: 'Lease Rejected',
      description: 'Sent when a lease draft is rejected during approval',
      channels: ['email', 'in_app'],
      subject: 'Lease {{leaseNumber}} Rejected — Action Required',
      bodyText: 'Lease {{leaseNumber}} for {{tenantName}} at {{propertyName}} has been rejected by {{reviewerName}}. Reason: {{rejectionReason}}. Please revise and resubmit.',
      bodyHtml: null,
      bodyPush: 'Lease {{leaseNumber}} rejected: {{rejectionReason}}',
      isCritical: true,
    },

    // ── KYC / Tenant ──
    {
      code: 'kyc_document_approved',
      name: 'KYC Document Approved',
      description: 'Sent when a tenant KYC document passes verification',
      channels: ['in_app'],
      subject: 'KYC Document Approved — {{documentType}}',
      bodyText: 'KYC document "{{documentType}}" for tenant {{tenantName}} has been approved by {{reviewerName}}.',
      bodyHtml: null,
      bodyPush: null,
      isCritical: false,
    },
    {
      code: 'kyc_document_rejected',
      name: 'KYC Document Rejected',
      description: 'Sent when a tenant KYC document fails verification',
      channels: ['email', 'in_app'],
      subject: 'KYC Document Rejected — {{documentType}}',
      bodyText: 'KYC document "{{documentType}}" for tenant {{tenantName}} has been rejected. Reason: {{rejectionReason}}. Please resubmit with a valid document.',
      bodyHtml: null,
      bodyPush: 'KYC document {{documentType}} rejected',
      isCritical: true,
    },
    {
      code: 'kyc_expiring',
      name: 'KYC Expiring Soon',
      description: 'Alert when a tenant KYC document is about to expire',
      channels: ['email', 'in_app'],
      subject: 'KYC Document Expiring — {{tenantName}}',
      bodyText: 'KYC document "{{documentType}}" for tenant {{tenantName}} will expire on {{expiryDate}} ({{daysRemaining}} days remaining). Please request an updated document.',
      bodyHtml: null,
      bodyPush: 'KYC for {{tenantName}} expires in {{daysRemaining}} days',
      isCritical: false,
    },
    {
      code: 'tenant_blacklisted',
      name: 'Tenant Blacklisted',
      description: 'Internal alert when a tenant is added to the blacklist',
      channels: ['in_app'],
      subject: 'Tenant Blacklisted — {{tenantName}}',
      bodyText: 'Tenant {{tenantName}} has been blacklisted by {{actionBy}}. Reason: {{reason}}. This tenant cannot be assigned to new leases.',
      bodyHtml: null,
      bodyPush: null,
      isCritical: true,
    },

    // ── CRM / Viewing ──
    {
      code: 'viewing_reminder',
      name: 'Viewing Appointment Reminder',
      description: 'Reminder sent to prospect before a scheduled property viewing',
      channels: ['email', 'sms'],
      subject: 'Reminder: Viewing at {{propertyName}} — {{viewingDate}}',
      bodyText: 'Hi {{contactName}}, this is a reminder of your viewing appointment at {{propertyName}}, unit {{unitCode}}, scheduled for {{viewingDate}} at {{viewingTime}}. Address: {{propertyAddress}}. Contact: {{agentName}} ({{agentPhone}}).',
      bodyHtml: null,
      bodyPush: 'Viewing reminder: {{propertyName}} at {{viewingTime}}',
      isCritical: false,
    },

    // ── Parking ──
    {
      code: 'parking_pass_issued',
      name: 'Visitor Parking Pass Issued',
      description: 'Sent to visitor/tenant when a visitor parking pass is generated',
      channels: ['email', 'sms'],
      subject: 'Visitor Parking Pass — {{propertyName}}',
      bodyText: 'A visitor parking pass has been issued for {{visitorName}} at {{propertyName}}. Valid from {{validFrom}} to {{validTo}}. Pass code: {{passCode}}. Please present this code at the gate.',
      bodyHtml: null,
      bodyPush: 'Parking pass {{passCode}} issued for {{propertyName}}',
      isCritical: false,
    },
  ];

  let seeded = 0;
  for (const t of templates) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { code: t.code, companyId: null },
    });
    if (!existing) {
      await prisma.notificationTemplate.create({ data: t as any });
      seeded++;
    }
  }

  if (seeded > 0) {
    logger.info(`Seeded ${seeded} Phase 2 notification templates`);
  }
}
