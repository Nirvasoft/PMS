import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware';
import { prisma } from '../../common/database';
import { notificationService } from './services/notification.service';
import { templateService } from './services/template.service';
import { AppError } from '../../common/errors';

const param = (req: Request, name: string): string => req.params[name] as string;

export const notificationsRouter = Router();

// ─── Send Notification (admin / internal) ──────

notificationsRouter.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationService.send({
    ...req.body,
    companyId: req.body.companyId || req.user!.companyId,
  });
  res.status(202).json({ success: true, data: result });
}));

// ─── In-App Notifications (user's own) ─────────

notificationsRouter.get('/in-app', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { isRead, page = '1', limit = '20' } = req.query;

  const where: Record<string, unknown> = { userId };
  if (isRead !== undefined) where.isRead = isRead === 'true';

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  const [data, total, unreadCount] = await Promise.all([
    prisma.inAppNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.inAppNotification.count({ where }),
    prisma.inAppNotification.count({ where: { userId, isRead: false } }),
  ]);

  res.json({
    success: true,
    data,
    meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum), unreadCount },
  });
}));

notificationsRouter.put('/in-app/:id/read', asyncHandler(async (req: Request, res: Response) => {
  const notif = await prisma.inAppNotification.findFirst({
    where: { id: param(req, 'id'), userId: req.user!.sub },
  });
  if (!notif) throw AppError.notFound('Notification');

  await prisma.inAppNotification.update({
    where: { id: notif.id },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ success: true });
}));

notificationsRouter.post('/in-app/read-all', asyncHandler(async (req: Request, res: Response) => {
  await prisma.inAppNotification.updateMany({
    where: { userId: req.user!.sub, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ success: true });
}));

notificationsRouter.delete('/in-app/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.inAppNotification.deleteMany({
    where: { id: param(req, 'id'), userId: req.user!.sub },
  });
  res.status(204).send();
}));

// ─── Notification Preferences ──────────────────

notificationsRouter.get('/preferences', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  // Get all templates
  const templates = await templateService.findAll(req.user!.companyId);

  // Get user prefs
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId },
  });
  const prefMap = new Map(prefs.map(p => [p.templateCode, p]));

  // Merge: template list with user prefs (defaults if no pref exists)
  const merged = templates.map(t => {
    const p = prefMap.get(t.code);
    return {
      templateCode: t.code,
      name: t.name,
      channels: t.channels,
      emailEnabled: p?.emailEnabled ?? true,
      smsEnabled: p?.smsEnabled ?? false,
      pushEnabled: p?.pushEnabled ?? true,
      inAppEnabled: p?.inAppEnabled ?? true,
    };
  });

  const anyPref = prefs[0];
  res.json({
    success: true,
    data: {
      preferences: merged,
      quietHoursStart: anyPref?.quietHoursStart || null,
      quietHoursEnd: anyPref?.quietHoursEnd || null,
    },
  });
}));

notificationsRouter.put('/preferences', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { preferences, quietHoursStart, quietHoursEnd } = req.body;

  if (Array.isArray(preferences)) {
    for (const p of preferences) {
      await prisma.notificationPreference.upsert({
        where: { userId_templateCode: { userId, templateCode: p.templateCode } },
        create: {
          userId,
          templateCode: p.templateCode,
          emailEnabled: p.emailEnabled ?? true,
          smsEnabled: p.smsEnabled ?? false,
          pushEnabled: p.pushEnabled ?? true,
          inAppEnabled: p.inAppEnabled ?? true,
          quietHoursStart: quietHoursStart || null,
          quietHoursEnd: quietHoursEnd || null,
        },
        update: {
          emailEnabled: p.emailEnabled,
          smsEnabled: p.smsEnabled,
          pushEnabled: p.pushEnabled,
          inAppEnabled: p.inAppEnabled,
          quietHoursStart: quietHoursStart || null,
          quietHoursEnd: quietHoursEnd || null,
        },
      });
    }
  }

  res.json({ success: true });
}));

// ─── Notification Logs (admin) ─────────────────

notificationsRouter.get('/logs', asyncHandler(async (req: Request, res: Response) => {
  const { recipientId, channel, status, page = '1', limit = '50' } = req.query;
  const companyId = req.user!.companyId;

  const where: Record<string, unknown> = { companyId };
  if (recipientId) where.recipientId = recipientId;
  if (channel) where.channel = channel;
  if (status) where.status = status;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  const [data, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      include: {
        recipient: {
          select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.notificationLog.count({ where }),
  ]);

  res.json({
    success: true,
    data,
    meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
}));

notificationsRouter.post('/logs/:id/retry', asyncHandler(async (req: Request, res: Response) => {
  const log = await prisma.notificationLog.findUnique({ where: { id: param(req, 'id') } });
  if (!log) throw AppError.notFound('Notification log');

  // Re-send via the main service
  await notificationService.send({
    templateCode: log.templateCode || '',
    companyId: log.companyId || req.user!.companyId,
    recipientIds: log.recipientId ? [log.recipientId] : [],
    channels: [log.channel],
    entityType: log.entityType || undefined,
    entityId: log.entityId || undefined,
  });

  // Mark original as retried
  await prisma.notificationLog.update({
    where: { id: log.id },
    data: { retryCount: { increment: 1 } },
  });

  res.json({ success: true });
}));

// ─── Templates (admin CRUD) ───────────────────

export const templatesRouter = Router();

templatesRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await templateService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

templatesRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = await templateService.create({
    ...req.body,
    companyId: req.body.companyId || req.user!.companyId,
  });
  res.status(201).json({ success: true, data });
}));

templatesRouter.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = await templateService.update(param(req, 'id'), req.body);
  res.json({ success: true, data });
}));

templatesRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const template = await prisma.notificationTemplate.findUnique({ where: { id: param(req, 'id') } });
  if (!template) throw AppError.notFound('Template');
  await prisma.notificationTemplate.delete({ where: { id: template.id } });
  res.status(204).send();
}));

// ─── Scheduled Notifications ──────────────────

notificationsRouter.post('/schedule', asyncHandler(async (req: Request, res: Response) => {
  const { templateCode, recipientIds, variables, channels, scheduledAt, recurrenceCron, entityType, entityId } = req.body;

  if (!templateCode || !recipientIds?.length || !scheduledAt) {
    throw AppError.validation('templateCode, recipientIds, and scheduledAt are required');
  }

  const scheduled = await prisma.scheduledNotification.create({
    data: {
      companyId: req.user!.companyId,
      templateCode,
      recipientIds,
      variables: variables || {},
      channels: channels || [],
      scheduledAt: new Date(scheduledAt),
      recurrenceCron: recurrenceCron || null,
      entityType,
      entityId,
      createdBy: req.user!.sub,
    },
  });

  res.status(201).json({ success: true, data: scheduled });
}));

notificationsRouter.get('/schedule', asyncHandler(async (req: Request, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query;
  const companyId = req.user!.companyId;

  const where: Record<string, unknown> = { companyId };
  if (status) where.status = status;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  const [data, total] = await Promise.all([
    prisma.scheduledNotification.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        creator: {
          select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.scheduledNotification.count({ where }),
  ]);

  res.json({
    success: true,
    data,
    meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
}));

notificationsRouter.delete('/schedule/:id', asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.scheduledNotification.findFirst({
    where: { id: param(req, 'id'), companyId: req.user!.companyId },
  });
  if (!item) throw AppError.notFound('Scheduled notification');
  if (item.status === 'sent') throw AppError.validation('Cannot cancel an already-sent notification');

  await prisma.scheduledNotification.update({
    where: { id: item.id },
    data: { status: 'cancelled' },
  });

  res.json({ success: true });
}));

// ─── Push Device Tokens ───────────────────────

notificationsRouter.post('/push-tokens', asyncHandler(async (req: Request, res: Response) => {
  const { token, platform, deviceName } = req.body;
  const userId = req.user!.sub;

  if (!token || !platform) {
    throw AppError.validation('token and platform are required');
  }

  if (!['ios', 'android', 'web'].includes(platform)) {
    throw AppError.validation('platform must be ios, android, or web');
  }

  const deviceToken = await prisma.pushDeviceToken.upsert({
    where: { userId_token: { userId, token } },
    create: { userId, token, platform, deviceName: deviceName || null },
    update: { platform, deviceName: deviceName || null, lastUsedAt: new Date() },
  });

  res.status(201).json({ success: true, data: deviceToken });
}));

notificationsRouter.get('/push-tokens', asyncHandler(async (req: Request, res: Response) => {
  const tokens = await prisma.pushDeviceToken.findMany({
    where: { userId: req.user!.sub },
    orderBy: { lastUsedAt: 'desc' },
  });

  res.json({ success: true, data: tokens });
}));

notificationsRouter.delete('/push-tokens/:token', asyncHandler(async (req: Request, res: Response) => {
  const token = decodeURIComponent(param(req, 'token'));
  const userId = req.user!.sub;

  await prisma.pushDeviceToken.deleteMany({
    where: { userId, token },
  });

  res.status(204).send();
}));
