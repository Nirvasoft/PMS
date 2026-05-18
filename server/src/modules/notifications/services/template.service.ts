import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import Handlebars from 'handlebars';

/**
 * Template rendering engine using Handlebars.
 * Manages CRUD for notification templates and renders them with variables.
 */
export class TemplateService {
  /** List templates, optionally filtered by company */
  async findAll(companyId: string) {
    return prisma.notificationTemplate.findMany({
      where: {
        OR: [
          { companyId },       // company-specific
          { companyId: null }, // system templates
        ],
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  /** Get template by code (company-specific first, then system) */
  async findByCode(code: string, companyId?: string): Promise<{
    id: string; code: string; name: string; channels: string[];
    subject: string | null; bodyText: string; bodyHtml: string | null;
    bodyPush: string | null; isCritical: boolean;
  }> {
    // Company-specific template takes priority
    const template = await prisma.notificationTemplate.findFirst({
      where: {
        code,
        OR: companyId
          ? [{ companyId }, { companyId: null }]
          : [{ companyId: null }],
        isActive: true,
      },
      orderBy: { companyId: { sort: 'desc', nulls: 'last' } },
    });
    if (!template) throw AppError.notFound(`Notification template '${code}'`);
    return template;
  }

  /** Render a template with variables */
  render(template: string, variables: Record<string, unknown>): string {
    try {
      const compiled = Handlebars.compile(template, { noEscape: true });
      return compiled(variables);
    } catch (err) {
      logger.error('Template render error', { template: template.substring(0, 80), err });
      return template;
    }
  }

  /** Create a new template */
  async create(data: {
    companyId?: string; code: string; name: string; description?: string;
    channels: string[]; subject?: string; bodyText: string;
    bodyHtml?: string; bodyPush?: string; variables?: unknown[];
    isCritical?: boolean;
  }) {
    return prisma.notificationTemplate.create({ data: data as Record<string, unknown> as never });
  }

  /** Update a template */
  async update(id: string, data: Record<string, unknown>) {
    const template = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!template) throw AppError.notFound('Template');
    return prisma.notificationTemplate.update({ where: { id }, data: data as never });
  }
}

export const templateService = new TemplateService();
