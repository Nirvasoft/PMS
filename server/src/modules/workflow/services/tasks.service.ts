import { prisma } from '../../../common/database';

/**
 * Task queries — my-tasks inbox, instance tasks, etc.
 */
export class TasksService {
  /** Get tasks assigned to a user (their inbox) */
  async getMyTasks(userId: string, query: { status?: string; entityType?: string; page?: number; limit?: number }) {
    const { status, entityType, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = {
      OR: [{ assignedTo: userId }, { delegatedTo: userId }],
    };
    if (status) where.status = status;
    if (entityType) {
      where.instance = { entityType };
    }

    const [data, total] = await Promise.all([
      prisma.workflowTask.findMany({
        where,
        include: {
          instance: {
            select: {
              id: true, entityType: true, entityId: true, status: true, context: true,
              initiator: { include: { profile: { select: { firstName: true, lastName: true } } } },
              definition: { select: { name: true } },
            },
          },
          assignee: { include: { profile: { select: { firstName: true, lastName: true } } } },
          delegatee: { include: { profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workflowTask.count({ where }),
    ]);

    const pending = await prisma.workflowTask.count({
      where: { OR: [{ assignedTo: userId }, { delegatedTo: userId }], status: 'pending' },
    });

    return {
      data: data.map((t) => ({
        ...t,
        minutesUntilSla: t.slaDueAt ? Math.round((t.slaDueAt.getTime() - Date.now()) / 60000) : null,
      })),
      meta: { total, pending, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** List instances with filtering */
  async getInstances(companyId: string, query: { entityType?: string; status?: string; page?: number; limit?: number }) {
    const { entityType, status, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId };
    if (entityType) where.entityType = entityType;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.workflowInstance.findMany({
        where,
        include: {
          definition: { select: { name: true, entityType: true } },
          initiator: { include: { profile: { select: { firstName: true, lastName: true } } } },
          _count: { select: { tasks: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workflowInstance.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

export const tasksService = new TasksService();
