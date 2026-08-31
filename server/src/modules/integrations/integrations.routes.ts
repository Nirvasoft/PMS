import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { integrationsService, INTEGRATION_TYPES, WEBHOOK_EVENTS, API_KEY_SCOPES } from './integrations.service';

const getCompanyId = (req: any): string => req.user?.companyId;
const getUserId = (req: any): string => req.user?.userId;

// ═══════════════════════════════════════
// INTEGRATIONS ROUTES
// ═══════════════════════════════════════
export const integrationsRouter = Router();

// Registry / metadata
integrationsRouter.get('/types', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: INTEGRATION_TYPES });
}));

// CRUD
integrationsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await integrationsService.list(getCompanyId(req));
  res.json({ success: true, data });
}));

integrationsRouter.post('/', asyncHandler(async (req, res) => {
  const data = await integrationsService.create(getCompanyId(req), getUserId(req), req.body);
  res.status(201).json({ success: true, data });
}));

integrationsRouter.put('/:id', asyncHandler(async (req, res) => {
  const data = await integrationsService.update(String(req.params.id), getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

integrationsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await integrationsService.delete(String(req.params.id), getCompanyId(req));
  res.json({ success: true, message: 'Integration deleted' });
}));

// Test & Sync
integrationsRouter.post('/:id/test', asyncHandler(async (req, res) => {
  const data = await integrationsService.testConnection(String(req.params.id), getCompanyId(req));
  res.json({ success: true, data });
}));

integrationsRouter.post('/:id/sync', asyncHandler(async (req, res) => {
  const data = await integrationsService.triggerSync(String(req.params.id), getCompanyId(req), getUserId(req), req.body);
  res.json({ success: true, data });
}));

integrationsRouter.get('/:id/sync-logs', asyncHandler(async (req, res) => {
  const result = await integrationsService.getSyncLogs(
    String(req.params.id), getCompanyId(req),
    Number(req.query.page) || 1, Number(req.query.limit) || 20
  );
  res.json({ success: true, ...result });
}));

integrationsRouter.get('/entity-map', asyncHandler(async (req, res) => {
  const data = await integrationsService.getEntityMaps(
    getCompanyId(req),
    req.query.integrationId as string,
    req.query.entityType as string
  );
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════
// DEVELOPER ROUTES (Webhooks + API Keys)
// ═══════════════════════════════════════
export const developerRouter = Router();

// Metadata
developerRouter.get('/webhook-events', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: WEBHOOK_EVENTS });
}));

developerRouter.get('/api-key-scopes', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: API_KEY_SCOPES });
}));

// ── Webhooks ──

developerRouter.get('/webhooks', asyncHandler(async (req, res) => {
  const data = await integrationsService.listWebhooks(getCompanyId(req));
  res.json({ success: true, data });
}));

developerRouter.post('/webhooks', asyncHandler(async (req, res) => {
  const data = await integrationsService.createWebhook(getCompanyId(req), getUserId(req), req.body);
  res.status(201).json({ success: true, data });
}));

developerRouter.put('/webhooks/:id', asyncHandler(async (req, res) => {
  const data = await integrationsService.updateWebhook(String(req.params.id), getCompanyId(req), req.body);
  res.json({ success: true, data });
}));

developerRouter.delete('/webhooks/:id', asyncHandler(async (req, res) => {
  await integrationsService.deleteWebhook(String(req.params.id), getCompanyId(req));
  res.json({ success: true, message: 'Webhook deleted' });
}));

developerRouter.post('/webhooks/:id/test', asyncHandler(async (req, res) => {
  const data = await integrationsService.testWebhook(String(req.params.id), getCompanyId(req));
  res.json({ success: true, data });
}));

developerRouter.get('/webhooks/:id/deliveries', asyncHandler(async (req, res) => {
  const result = await integrationsService.getDeliveries(
    String(req.params.id), getCompanyId(req),
    Number(req.query.page) || 1, Number(req.query.limit) || 20
  );
  res.json({ success: true, ...result });
}));

developerRouter.post('/webhooks/deliveries/:id/retry', asyncHandler(async (req, res) => {
  const data = await integrationsService.retryDelivery(String(req.params.id), getCompanyId(req));
  res.json({ success: true, data });
}));

// ── API Keys ──

developerRouter.get('/api-keys', asyncHandler(async (req, res) => {
  const data = await integrationsService.listApiKeys(getCompanyId(req));
  res.json({ success: true, data });
}));

developerRouter.post('/api-keys', asyncHandler(async (req, res) => {
  const data = await integrationsService.createApiKey(getCompanyId(req), getUserId(req), req.body);
  res.status(201).json({ success: true, data });
}));

developerRouter.delete('/api-keys/:id', asyncHandler(async (req, res) => {
  await integrationsService.deleteApiKey(String(req.params.id), getCompanyId(req));
  res.json({ success: true, message: 'API key deleted' });
}));

developerRouter.post('/api-keys/:id/revoke', asyncHandler(async (req, res) => {
  const data = await integrationsService.revokeApiKey(String(req.params.id), getCompanyId(req));
  res.json({ success: true, data });
}));
