import { prisma } from '../../common/database';
import { config } from '../../common/config';
import { logger } from '../../common/logger';

/**
 * Google Calendar Service
 *
 * Handles OAuth 2.0 token flow and Calendar event CRUD for viewings.
 * Uses Google's REST API directly (no googleapis npm dependency needed).
 *
 * Requires env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const PROVIDER = 'google_calendar';

export class GoogleCalendarService {

  /** Check if Google Calendar integration is configured */
  isConfigured(): boolean {
    return !!(config.google.clientId && config.google.clientSecret && config.google.calendarRedirectUri);
  }

  /**
   * Generate OAuth 2.0 authorization URL for a user.
   */
  getAuthUrl(userId: string): string {
    if (!this.isConfigured()) {
      throw new Error('Google Calendar integration is not configured');
    }

    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.calendarRedirectUri,
      response_type: 'code',
      scope: CALENDAR_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens and store them.
   */
  async handleCallback(code: string, userId: string): Promise<void> {
    const tokenData = await this.exchangeCode(code);

    await prisma.userIntegration.upsert({
      where: { uq_user_integration: { userId, provider: PROVIDER } },
      create: {
        userId,
        provider: PROVIDER,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenExpiry: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scope: tokenData.scope || CALENDAR_SCOPE,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || undefined,
        tokenExpiry: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scope: tokenData.scope || CALENDAR_SCOPE,
      },
    });

    logger.info(`Google Calendar connected for user ${userId}`);
  }

  /**
   * Check if a user has Google Calendar connected.
   */
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    email?: string;
    connectedAt?: string;
  }> {
    const integration = await prisma.userIntegration.findUnique({
      where: { uq_user_integration: { userId, provider: PROVIDER } },
    });

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      connectedAt: integration.createdAt.toISOString(),
    };
  }

  /**
   * Disconnect (remove stored tokens).
   */
  async disconnect(userId: string): Promise<void> {
    await prisma.userIntegration.deleteMany({
      where: { userId, provider: PROVIDER },
    });

    logger.info(`Google Calendar disconnected for user ${userId}`);
  }

  /**
   * Create a Google Calendar event for a viewing.
   * Returns the event ID or null if not connected.
   */
  async createViewingEvent(agentUserId: string, viewing: ViewingEventData): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const accessToken = await this.getValidAccessToken(agentUserId);
    if (!accessToken) return null;

    try {
      const startTime = new Date(viewing.scheduledAt);
      const endTime = new Date(startTime.getTime() + viewing.durationMinutes * 60 * 1000);

      const event = {
        summary: `🏠 Viewing: ${viewing.leadName}`,
        description: [
          `Lead: ${viewing.leadName}`,
          viewing.unitInfo ? `Unit: ${viewing.unitInfo}` : null,
          viewing.propertyName ? `Property: ${viewing.propertyName}` : null,
          `Duration: ${viewing.durationMinutes} minutes`,
          '',
          'Created by PMS — Property Management System',
        ].filter(Boolean).join('\n'),
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
        colorId: '9', // Blueberry blue
      };

      const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Google Calendar create event failed:', error);
        return null;
      }

      const data = await response.json() as { id: string };
      logger.info(`Google Calendar event created: ${data.id}`);
      return data.id;
    } catch (err: any) {
      logger.error('Google Calendar create event error:', err.message);
      return null;
    }
  }

  /**
   * Update an existing Google Calendar event (e.g., reschedule).
   */
  async updateViewingEvent(
    agentUserId: string,
    calendarEventId: string,
    viewing: Partial<ViewingEventData>,
  ): Promise<boolean> {
    if (!this.isConfigured() || !calendarEventId) return false;

    const accessToken = await this.getValidAccessToken(agentUserId);
    if (!accessToken) return false;

    try {
      const updates: Record<string, unknown> = {};

      if (viewing.scheduledAt) {
        const startTime = new Date(viewing.scheduledAt);
        const endTime = new Date(startTime.getTime() + (viewing.durationMinutes || 30) * 60 * 1000);
        updates.start = { dateTime: startTime.toISOString(), timeZone: 'UTC' };
        updates.end = { dateTime: endTime.toISOString(), timeZone: 'UTC' };
      }

      if (viewing.leadName) {
        updates.summary = `🏠 Viewing: ${viewing.leadName}`;
      }

      const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${calendarEventId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Google Calendar update event failed:', error);
        return false;
      }

      logger.info(`Google Calendar event updated: ${calendarEventId}`);
      return true;
    } catch (err: any) {
      logger.error('Google Calendar update event error:', err.message);
      return false;
    }
  }

  /**
   * Delete/cancel a Google Calendar event.
   */
  async deleteViewingEvent(agentUserId: string, calendarEventId: string): Promise<boolean> {
    if (!this.isConfigured() || !calendarEventId) return false;

    const accessToken = await this.getValidAccessToken(agentUserId);
    if (!accessToken) return false;

    try {
      const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${calendarEventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!response.ok && response.status !== 410) {
        // 410 = already deleted
        logger.error('Google Calendar delete event failed:', response.status);
        return false;
      }

      logger.info(`Google Calendar event deleted: ${calendarEventId}`);
      return true;
    } catch (err: any) {
      logger.error('Google Calendar delete event error:', err.message);
      return false;
    }
  }

  // ─── Private Helpers ────────────────────────────

  /**
   * Exchange authorization code for access + refresh tokens.
   */
  private async exchangeCode(code: string): Promise<TokenResponse> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.calendarRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token exchange failed: ${error}`);
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Get a valid access token for a user, refreshing if expired.
   */
  private async getValidAccessToken(userId: string): Promise<string | null> {
    const integration = await prisma.userIntegration.findUnique({
      where: { uq_user_integration: { userId, provider: PROVIDER } },
    });

    if (!integration) return null;

    // Check if token is still valid (with 5-min buffer)
    if (integration.tokenExpiry && integration.tokenExpiry.getTime() > Date.now() + 5 * 60 * 1000) {
      return integration.accessToken;
    }

    // Token expired — try to refresh
    if (!integration.refreshToken) {
      logger.warn(`No refresh token for user ${userId} — Google Calendar disconnected`);
      return null;
    }

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          refresh_token: integration.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        logger.error(`Google token refresh failed for user ${userId}`);
        return null;
      }

      const data = await response.json() as TokenResponse;

      await prisma.userIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: data.access_token,
          tokenExpiry: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null,
        },
      });

      return data.access_token;
    } catch (err: any) {
      logger.error('Google token refresh error:', err.message);
      return null;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();

// ─── Types ──────────────────────────────────

export interface ViewingEventData {
  scheduledAt: string;
  durationMinutes: number;
  leadName: string;
  unitInfo?: string;
  propertyName?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type: string;
}
