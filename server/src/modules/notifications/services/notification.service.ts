import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';
import { templateService } from './template.service';

export interface SendNotificationDto {
  templateCode: string;
  companyId: string;
  recipientIds: string[];
  channels?: string[];
  variables?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
}

/**
 * Main notification dispatch service.
 * All modules call this to send notifications — never call channels directly.
 */
export class NotificationService {

  /**
   * Primary entry point: resolve template, check preferences, dispatch per channel.
   * For Phase 1, we only implement in_app and email (console log) channels.
   */
  async send(dto: SendNotificationDto): Promise<{ queued: number }> {
    const { templateCode, companyId, recipientIds, variables = {}, entityType, entityId } = dto;

    // Resolve template
    let template;
    try {
      template = await templateService.findByCode(templateCode, companyId);
    } catch {
      logger.warn(`Notification template '${templateCode}' not found — skipping`, { dto });
      return { queued: 0 };
    }

    const requestedChannels = dto.channels ?? template.channels;
    let queued = 0;

    for (const recipientId of recipientIds) {
      // Check user preferences
      const prefs = await this.getPreferences(recipientId, templateCode);
      const channels = this.resolveChannels(requestedChannels, prefs);

      for (const channel of channels) {
        try {
          await this.dispatchToChannel(
            channel, recipientId, template, variables, companyId, entityType, entityId,
          );
          queued++;
        } catch (err) {
          logger.error(`Notification dispatch failed`, { channel, recipientId, templateCode, err });
        }
      }
    }

    return { queued };
  }

  /** Dispatch to a specific channel */
  private async dispatchToChannel(
    channel: string,
    recipientId: string,
    template: Awaited<ReturnType<typeof templateService.findByCode>>,
    variables: Record<string, unknown>,
    companyId: string,
    entityType?: string,
    entityId?: string,
  ) {
    const renderedSubject = template.subject
      ? templateService.render(template.subject, variables)
      : template.name;
    const renderedBody = templateService.render(template.bodyText, variables);

    // Log the notification
    const log = await prisma.notificationLog.create({
      data: {
        companyId,
        templateId: template.id,
        templateCode: template.code,
        channel,
        recipientId,
        subject: renderedSubject,
        body: renderedBody,
        status: 'sent',
        provider: channel === 'in_app' ? 'in_app' : 'console',
        sentAt: new Date(),
        entityType,
        entityId,
      },
    });

    // Channel dispatch
    switch (channel) {
      case 'in_app':
        await this.sendInApp(recipientId, companyId, renderedSubject, renderedBody, entityType, entityId);
        break;
      case 'email':
        // Phase 1: log to console (no SendGrid integration yet)
        const user = await prisma.user.findUnique({
          where: { id: recipientId },
          select: { email: true },
        });
        logger.info(`📧 [EMAIL] To: ${user?.email} | Subject: ${renderedSubject} | Body: ${renderedBody.substring(0, 100)}`);
        break;
      case 'sms':
        logger.info(`📱 [SMS] To: ${recipientId} | Body: ${renderedBody.substring(0, 160)}`);
        break;
      case 'push':
        const pushBody = template.bodyPush
          ? templateService.render(template.bodyPush, variables)
          : renderedBody.substring(0, 240);
        logger.info(`🔔 [PUSH] To: ${recipientId} | ${pushBody}`);
        break;
      default:
        logger.warn(`Unknown channel: ${channel}`);
    }

    return log;
  }

  /** Send an in-app notification (bell icon item) */
  private async sendInApp(
    userId: string, companyId: string,
    title: string, body: string,
    entityType?: string, entityId?: string,
  ) {
    await prisma.inAppNotification.create({
      data: {
        companyId,
        userId,
        title,
        body,
        icon: this.getIconForEntity(entityType),
        actionType: entityType ? 'navigate' : null,
        actionUrl: this.getActionUrl(entityType, entityId),
        entityType,
        entityId,
      },
    });
  }

  /** Get user preferences for a template */
  private async getPreferences(userId: string, templateCode: string) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_templateCode: { userId, templateCode } },
    });
    return pref ?? {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      inAppEnabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    };
  }

  /** Filter channels by user preferences */
  private resolveChannels(
    requested: string[],
    prefs: { emailEnabled: boolean; smsEnabled: boolean; pushEnabled: boolean; inAppEnabled: boolean },
  ): string[] {
    return requested.filter(ch => {
      switch (ch) {
        case 'email': return prefs.emailEnabled;
        case 'sms': return prefs.smsEnabled;
        case 'push': return prefs.pushEnabled;
        case 'in_app': return prefs.inAppEnabled;
        default: return true;
      }
    });
  }

  /** Map entity type to icon */
  private getIconForEntity(entityType?: string): string {
    const map: Record<string, string> = {
      lease: 'file-text',
      workflow: 'git-branch',
      maintenance: 'tool',
      invoice: 'dollar-sign',
      user: 'user',
    };
    return entityType ? (map[entityType] || 'bell') : 'bell';
  }

  /** Generate action URL for entity */
  private getActionUrl(entityType?: string, entityId?: string): string | null {
    if (!entityType || !entityId) return null;
    const map: Record<string, string> = {
      workflow_task: '/tasks',
      workflow: '/admin/workflows',
      user: `/admin/users/${entityId}`,
      property: `/admin/properties`,
    };
    return map[entityType] || null;
  }
}

export const notificationService = new NotificationService();
