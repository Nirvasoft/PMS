import cron from 'node-cron';
import { integrationsService } from '../modules/integrations/integrations.service';
import { logger } from './logger';

/**
 * Webhook retry processor — runs every 30 seconds.
 * Picks up failed deliveries with status='retrying' and nextRetryAt <= now,
 * then re-delivers with exponential backoff (10s, 30s, 90s, 270s, 810s).
 */
export function startWebhookRetryJob() {
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await integrationsService.processRetries();
    } catch (err) {
      logger.error('Webhook retry cron error:', err);
    }
  });

  logger.info('Webhook retry cron started (every 30 seconds)');
}
