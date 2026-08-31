import { Prisma } from '@prisma/client';
import { prisma } from '../../../common/database';
import type { RequestContext } from '../interfaces/auth.interfaces';

export enum AuthEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  MFA_VERIFY_SUCCESS = 'mfa_verify_success',
  MFA_VERIFY_FAILURE = 'mfa_verify_failure',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET_COMPLETE = 'password_reset_complete',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  DEVICE_TRUSTED = 'device_trusted',
  DEVICE_REVOKED = 'device_revoked',
  SSO_LOGIN = 'sso_login',
  IP_BLOCKED = 'ip_blocked',
  TOKEN_REUSE = 'token_reuse',
  PERMISSION_OVERRIDE_EXPIRED = 'permission_override_expired',
}

export class AuditService {
  /**
   * Log an auth event to the audit trail
   */
  async log(params: {
    userId?: string | null;
    email?: string | null;
    companyId?: string | null;
    eventType: AuthEventType;
    status: 'success' | 'failure';
    context?: RequestContext;
    deviceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.authAuditLog.create({
      data: {
        userId: params.userId || undefined,
        email: params.email,
        companyId: params.companyId || undefined,
        eventType: params.eventType,
        status: params.status,
        ipAddress: params.context?.ipAddress,
        userAgent: params.context?.userAgent,
        deviceId: params.deviceId,
        metadata: (params.metadata as Prisma.InputJsonValue) || undefined,
      },
    });
  }

  /**
   * Get paginated audit logs with filters
   */
  async getLogs(params: {
    userId?: string;
    companyId?: string;
    eventType?: string;
    status?: string;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};

    if (params.userId) where.userId = params.userId;
    if (params.companyId) where.companyId = params.companyId;
    if (params.eventType) where.eventType = params.eventType;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from && { gte: params.from }),
        ...(params.to && { lte: params.to }),
      };
    }

    const [data, total] = await Promise.all([
      prisma.authAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.authAuditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}

export const auditService = new AuditService();
