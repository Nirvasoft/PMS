import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { logger } from '../../../common/logger';
import { notificationService } from '../../notifications/services/notification.service';
import type { WorkflowGraph, GraphNode } from './definitions.service';

/**
 * Core workflow engine — starts instances, processes nodes, advances tokens.
 */
export class WorkflowEngine {
  /** Start a new workflow instance */
  async startInstance(
    definitionId: string,
    entityType: string,
    entityId: string,
    entitySnapshot: Record<string, unknown>,
    initiatedBy: string,
  ) {
    const def = await prisma.workflowDefinition.findFirst({
      where: { id: definitionId, status: 'active' },
    });
    if (!def) throw AppError.notFound('No active workflow definition found');

    const graph = def.graph as unknown as WorkflowGraph;

    const instance = await prisma.workflowInstance.create({
      data: {
        definitionId: def.id,
        definitionVersion: def.version,
        entityType,
        entityId,
        companyId: def.companyId,
        currentNodeIds: ['start'],
        status: 'running',
        initiatedBy,
        context: entitySnapshot as unknown as Record<string, string>,
      },
    });

    // Record history
    await this.recordHistory(instance.id, null, null, 'start', 'started', initiatedBy);

    // Advance from start node
    await this.advance(instance.id, graph, 'start', entitySnapshot);

    // Return with tasks
    return this.getInstanceDetail(instance.id);
  }

  /** Complete a task (approve or reject) */
  async completeTask(
    taskId: string,
    decision: 'approved' | 'rejected',
    comments: string,
    completedBy: string,
  ) {
    const task = await prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { definition: true } } },
    });
    if (!task) throw AppError.notFound('Task');
    if (task.status !== 'pending') throw AppError.validation('Task is not pending');
    // Allow: assignee, delegatee, or pool tasks (null assignedTo)
    const isAuthorized = !task.assignedTo || task.assignedTo === completedBy || task.delegatedTo === completedBy;
    if (!isAuthorized) {
      throw AppError.forbidden('Not authorized to complete this task');
    }

    // Update task
    await prisma.workflowTask.update({
      where: { id: taskId },
      data: {
        status: decision,
        decision,
        comments,
        completedAt: new Date(),
        completedBy,
      },
    });

    // Cancel any pending SLA jobs for this task
    await prisma.workflowSlaJob.updateMany({
      where: { taskId, status: 'pending' },
      data: { status: 'cancelled', executedAt: new Date() },
    });

    await this.recordHistory(task.instanceId, taskId, task.nodeId, task.nodeId, decision, completedBy, comments);

    if (decision === 'rejected') {
      await this.completeInstance(task.instanceId, 'rejected');
      return this.getInstanceDetail(task.instanceId);
    }

    // Check if all parallel tasks for this node are approved
    const siblingTasks = await prisma.workflowTask.findMany({
      where: { instanceId: task.instanceId, nodeId: task.nodeId },
    });
    const allApproved = siblingTasks.every((t) => t.status === 'approved');
    if (!allApproved) return this.getInstanceDetail(task.instanceId); // Wait for others

    // Advance from this node
    const graph = task.instance.definition.graph as unknown as WorkflowGraph;
    const context = task.instance.context as Record<string, unknown>;
    await this.advance(task.instanceId, graph, task.nodeId, context);

    return this.getInstanceDetail(task.instanceId);
  }

  /** Delegate a task to another user */
  async delegateTask(taskId: string, delegateTo: string, reason: string, delegatedBy: string) {
    const task = await prisma.workflowTask.findUnique({ where: { id: taskId } });
    if (!task) throw AppError.notFound('Task');
    if (task.status !== 'pending') throw AppError.validation('Task is not pending');

    await prisma.workflowTask.update({
      where: { id: taskId },
      data: { delegatedTo: delegateTo, delegatedAt: new Date() },
    });

    await this.recordHistory(task.instanceId, taskId, task.nodeId, task.nodeId, 'delegated', delegatedBy, reason);
  }

  /** Cancel a running instance */
  async cancelInstance(instanceId: string, reason: string, cancelledBy: string) {
    const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    if (!instance) throw AppError.notFound('Instance');
    if (instance.status !== 'running') throw AppError.validation('Instance is not running');

    // Cancel all pending tasks
    await prisma.workflowTask.updateMany({
      where: { instanceId, status: 'pending' },
      data: { status: 'skipped' },
    });

    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
    });

    await this.recordHistory(instanceId, null, null, null, 'cancelled', cancelledBy, reason);
  }

  // ─── Internal Methods ─────────────────────

  private async advance(
    instanceId: string,
    graph: WorkflowGraph,
    fromNodeId: string,
    context: Record<string, unknown>,
  ) {
    const outEdges = graph.edges.filter((e) => e.source === fromNodeId);

    for (const edge of outEdges) {
      const targetNode = graph.nodes.find((n) => n.id === edge.target);
      if (!targetNode) continue;
      await this.processNode(instanceId, graph, targetNode, context);
    }
  }

  private async processNode(
    instanceId: string,
    graph: WorkflowGraph,
    node: GraphNode,
    context: Record<string, unknown>,
  ) {
    switch (node.type) {
      case 'approval':
        await this.handleApproval(instanceId, node, context);
        break;

      case 'condition':
        await this.handleCondition(instanceId, graph, node, context);
        break;

      case 'notification':
        await this.handleNotification(instanceId, graph, node, context);
        break;

      case 'delay':
        await this.handleDelay(instanceId, node);
        break;

      case 'script':
        await this.handleScript(instanceId, graph, node, context);
        break;

      case 'end':
        await this.completeInstance(instanceId, 'approved');
        break;

      default:
        // start — just advance
        await this.advance(instanceId, graph, node.id, context);
    }
  }

  private async handleApproval(instanceId: string, node: GraphNode, _context: Record<string, unknown>) {
    const { assignTo, sla, name } = node.data ?? {};

    // Calculate SLA due date
    let slaDueAt: Date | null = null;
    if (sla?.hours) {
      slaDueAt = sla.mode === 'business'
        ? calculateBusinessHourDeadline(sla.hours)
        : new Date(Date.now() + sla.hours * 60 * 60 * 1000);
    }

    // Resolve assignee
    const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    const assigneeId = await this.resolveAssignee(assignTo || '', instance!.companyId, instance!.initiatedBy);

    // Create task
    const task = await prisma.workflowTask.create({
      data: {
        instanceId,
        nodeId: node.id,
        taskType: 'approval',
        title: name || `Approval: ${node.id}`,
        assignedTo: assigneeId,
        assignedRole: assignTo?.startsWith('role:') ? assignTo.slice(5) : undefined,
        slaDueAt,
      },
    });

    // Create SLA jobs if SLA configured
    if (slaDueAt && instance) {
      const jobs: { taskId: string; instanceId: string; companyId: string; type: string; scheduledAt: Date; metadata?: object }[] = [];

      // Reminder: 2 hours before deadline
      const reminderAt = new Date(slaDueAt.getTime() - 2 * 60 * 60 * 1000);
      if (reminderAt > new Date()) {
        jobs.push({
          taskId: task.id, instanceId, companyId: instance.companyId,
          type: 'reminder', scheduledAt: reminderAt,
        });
      }

      // Breach: at deadline
      jobs.push({
        taskId: task.id, instanceId, companyId: instance.companyId,
        type: 'breach', scheduledAt: slaDueAt,
      });

      // Escalation: at deadline (processed together with breach)
      if (sla?.escalateTo) {
        jobs.push({
          taskId: task.id, instanceId, companyId: instance.companyId,
          type: 'escalation', scheduledAt: slaDueAt,
          metadata: { escalateTo: sla.escalateTo },
        });
      }

      if (jobs.length > 0) {
        await prisma.workflowSlaJob.createMany({ data: jobs as any });
      }
    }

    // Update instance current node
    const inst = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    const currentNodes = (inst?.currentNodeIds ?? []).filter((n) => n !== 'start');
    if (!currentNodes.includes(node.id)) currentNodes.push(node.id);
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { currentNodeIds: currentNodes },
    });
  }

  /**
   * Handle delay node — pause the workflow for N hours.
   * Stores delayedUntil and delayNodeId on the instance.
   * A cron job (workflowDelayResume) picks it up when the time arrives.
   */
  private async handleDelay(instanceId: string, node: GraphNode) {
    const delayHours = node.data?.delayHours ?? 1;
    const delayedUntil = new Date(Date.now() + delayHours * 60 * 60 * 1000);

    // Update instance with delay info + set current node to the delay node
    const inst = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    const currentNodes = (inst?.currentNodeIds ?? []).filter((n) => n !== 'start');
    if (!currentNodes.includes(node.id)) currentNodes.push(node.id);

    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: {
        currentNodeIds: currentNodes,
        delayedUntil,
        delayNodeId: node.id,
      },
    });

    // Record history
    await this.recordHistory(
      instanceId, null, null, node.id, 'delayed',
      null,
      `Workflow paused for ${delayHours}h. Resumes at ${delayedUntil.toISOString()}`,
    );
  }

  /**
   * Resume a delayed instance — called by the delay cron job.
   * Clears the delay fields and advances past the delay node.
   */
  async resumeDelayedInstance(instanceId: string) {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { definition: { select: { graph: true } } },
    });
    if (!instance || !instance.delayNodeId) return;

    const graph = instance.definition.graph as unknown as WorkflowGraph;
    const delayNodeId = instance.delayNodeId;
    const context = instance.context as Record<string, unknown>;

    // Clear delay fields
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { delayedUntil: null, delayNodeId: null },
    });

    // Record history
    await this.recordHistory(instanceId, null, delayNodeId, null, 'delay_resumed', null, 'Delay completed, workflow resumed.');

    // Advance past the delay node
    await this.advance(instanceId, graph, delayNodeId, context);
  }

  /**
   * Handle script node — execute a predefined action and auto-advance.
   */
  private async handleScript(
    instanceId: string,
    graph: WorkflowGraph,
    node: GraphNode,
    context: Record<string, unknown>,
  ) {
    const { scriptAction, scriptConfig, name } = node.data ?? {};
    const config = scriptConfig ?? {};
    let resultMessage = '';

    try {
      switch (scriptAction) {
        case 'update_entity_status': {
          // Update a status field in the context
          const field = (config.field as string) || 'status';
          const value = config.value as string;
          if (value) {
            context[field] = value;
            await prisma.workflowInstance.update({
              where: { id: instanceId },
              data: { context: context as any },
            });
            resultMessage = `Set context.${field} = "${value}"`;
          }
          break;
        }

        case 'send_email': {
          // Send email via notification service
          const instance = await prisma.workflowInstance.findUnique({
            where: { id: instanceId },
            select: { companyId: true, initiatedBy: true },
          });
          if (instance) {
            const recipients = (config.recipients as string[]) || [instance.initiatedBy];
            const template = (config.template as string) || 'workflow_script_notification';
            try {
              await notificationService.send({
                templateCode: template,
                companyId: instance.companyId,
                recipientIds: recipients,
                channels: ['in_app'],
                variables: {
                  workflowName: (context.workflowName as string) || 'Workflow',
                  message: (config.message as string) || `Script node "${name || node.id}" executed.`,
                },
              });
              resultMessage = `Notification sent to ${recipients.length} recipient(s)`;
            } catch {
              resultMessage = 'Notification send attempted (template may not exist)';
            }
          }
          break;
        }

        case 'set_context': {
          // Merge key-value pairs into context
          const values = config.values as Record<string, unknown>;
          if (values && typeof values === 'object') {
            Object.assign(context, values);
            await prisma.workflowInstance.update({
              where: { id: instanceId },
              data: { context: context as any },
            });
            resultMessage = `Set ${Object.keys(values).length} context value(s)`;
          }
          break;
        }

        case 'webhook': {
          // Call external URL with context data
          const url = config.url as string;
          const method = (config.method as string) || 'POST';
          if (url) {
            try {
              const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method !== 'GET' ? JSON.stringify({
                  instanceId,
                  nodeId: node.id,
                  context,
                  timestamp: new Date().toISOString(),
                }) : undefined,
              });
              resultMessage = `Webhook ${method} ${url} → ${response.status}`;
            } catch (err: any) {
              resultMessage = `Webhook failed: ${err.message}`;
              logger.error(`Script webhook failed for instance ${instanceId}:`, err);
            }
          }
          break;
        }

        default:
          resultMessage = `Unknown script action: ${scriptAction}`;
      }
    } catch (err: any) {
      resultMessage = `Script error: ${err.message}`;
      logger.error(`Script node ${node.id} error for instance ${instanceId}:`, err);
    }

    // Record history
    await this.recordHistory(
      instanceId, null, null, node.id, 'script_executed',
      null, `${name || node.id}: ${resultMessage}`,
    );

    // Auto-advance
    await this.advance(instanceId, graph, node.id, context);
  }

  private async handleCondition(
    instanceId: string,
    graph: WorkflowGraph,
    node: GraphNode,
    context: Record<string, unknown>,
  ) {
    const { expression, trueEdge, falseEdge } = node.data ?? {};
    const result = this.evaluateCondition(expression || '', context);
    const nextNodeId = result ? trueEdge : falseEdge;

    if (nextNodeId) {
      const nextNode = graph.nodes.find((n) => n.id === nextNodeId);
      if (nextNode) await this.processNode(instanceId, graph, nextNode, context);
    }
  }

  private async handleNotification(
    instanceId: string,
    graph: WorkflowGraph,
    node: GraphNode,
    context: Record<string, unknown>,
  ) {
    const { template, recipientType, message } = node.data ?? {};
    const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    if (!instance) return;

    // Resolve recipients
    let recipientIds: string[] = [];
    if (recipientType === 'initiator' && instance.initiatedBy) {
      recipientIds = [instance.initiatedBy];
    } else if (recipientType === 'all_admins') {
      // Find users with Super Admin role
      const admins = await prisma.userRole.findMany({
        where: { role: { name: 'Super Admin', companyId: instance.companyId } },
        select: { userId: true },
      });
      recipientIds = admins.map(a => a.userId);
    } else if (instance.initiatedBy) {
      recipientIds = [instance.initiatedBy];
    }

    if (recipientIds.length > 0) {
      const templateCode = template || 'workflow_completed';
      await notificationService.send({
        templateCode,
        companyId: instance.companyId,
        recipientIds,
        channels: ['in_app', 'email'],
        variables: {
          workflowName: (context as Record<string, unknown>).workflowName || 'Workflow',
          entityType: instance.entityType,
          status: instance.status,
          message: message || '',
          ...(typeof context === 'object' ? context : {}),
        },
        entityType: 'workflow',
        entityId: instance.id,
      });
    }

    await this.recordHistory(instanceId, null, node.id, node.id, 'notification_sent', null);
    await this.advance(instanceId, graph, node.id, context);
  }

  private evaluateCondition(expression: string, context: Record<string, unknown>): boolean {
    // Simple safe condition evaluator — supports basic comparisons
    // e.g., "entity.amount > 50000"
    try {
      const flat = this.flattenContext(context);
      // Parse simple expressions like "entity.amount > 50000"
      const match = expression.match(/^(\S+)\s*(>|<|>=|<=|==|!=)\s*(.+)$/);
      if (!match) return false;

      const [, key, op, rawValue] = match;
      const left = flat[key];
      const right = isNaN(Number(rawValue)) ? rawValue.replace(/['"]/g, '') : Number(rawValue);

      switch (op) {
        case '>': return Number(left) > Number(right);
        case '<': return Number(left) < Number(right);
        case '>=': return Number(left) >= Number(right);
        case '<=': return Number(left) <= Number(right);
        case '==': return String(left) === String(right);
        case '!=': return String(left) !== String(right);
        default: return false;
      }
    } catch {
      return false;
    }
  }

  private flattenContext(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    return Object.entries(obj).reduce((acc, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(acc, this.flattenContext(v as Record<string, unknown>, key));
      } else {
        acc[key] = v;
      }
      return acc;
    }, {} as Record<string, unknown>);
  }

  private async resolveAssignee(assignTo: string, companyId: string, initiatedBy: string): Promise<string> {
    if (!assignTo) return initiatedBy;

    if (assignTo === 'initiator') return initiatedBy;

    if (assignTo.startsWith('user:')) return assignTo.slice(5);

    if (assignTo.startsWith('role:')) {
      const roleName = assignTo.slice(5);
      // Find first active user with this role in the company
      const userRole = await prisma.userRole.findFirst({
        where: {
          role: { name: { equals: roleName, mode: 'insensitive' }, companyId },
          user: { isActive: true },
        },
        select: { userId: true },
      });
      return userRole?.userId ?? initiatedBy;
    }

    // position:<level> — find an active user whose position.level >= N
    if (assignTo.startsWith('position:')) {
      const level = parseInt(assignTo.slice(9), 10);
      if (isNaN(level)) return initiatedBy;

      const profile = await prisma.userProfile.findFirst({
        where: {
          position: {
            companyId,
            level: { gte: level },
            isActive: true,
          },
          user: { isActive: true },
        },
        orderBy: { position: { level: 'asc' } },  // lowest qualifying level first
        select: { userId: true },
      });
      return profile?.userId ?? initiatedBy;
    }

    // department:<code> — find the manager of the department with that code
    if (assignTo.startsWith('department:')) {
      const deptCode = assignTo.slice(11);
      const dept = await prisma.department.findFirst({
        where: {
          code: { equals: deptCode, mode: 'insensitive' },
          companyId,
          isActive: true,
        },
        select: { managerId: true },
      });
      return dept?.managerId ?? initiatedBy;
    }

    // initiator.manager — find the direct manager via position hierarchy
    // Logic: get the initiator's department, find the department's manager
    if (assignTo === 'initiator.manager') {
      const initiatorProfile = await prisma.userProfile.findUnique({
        where: { userId: initiatedBy },
        select: {
          departmentId: true,
          position: { select: { level: true, departmentId: true } },
        },
      });

      if (initiatorProfile?.departmentId) {
        // Option 1: Use department manager
        const dept = await prisma.department.findUnique({
          where: { id: initiatorProfile.departmentId },
          select: { managerId: true },
        });
        if (dept?.managerId && dept.managerId !== initiatedBy) {
          return dept.managerId;
        }
      }

      // Option 2: Find a user with a higher position level in the same department
      if (initiatorProfile?.position?.level != null) {
        const deptId = initiatorProfile.departmentId || initiatorProfile.position.departmentId;
        if (deptId) {
          const higherPosition = await prisma.userProfile.findFirst({
            where: {
              departmentId: deptId,
              position: {
                level: { gt: initiatorProfile.position.level },
                isActive: true,
              },
              user: { isActive: true },
              userId: { not: initiatedBy },
            },
            orderBy: { position: { level: 'asc' } },
            select: { userId: true },
          });
          if (higherPosition) return higherPosition.userId;
        }
      }

      return initiatedBy;
    }

    return initiatedBy;
  }

  private async completeInstance(instanceId: string, status: 'approved' | 'rejected') {
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { status, completedAt: new Date(), currentNodeIds: ['end'] },
    });
    await this.recordHistory(instanceId, null, null, 'end', status === 'approved' ? 'completed' : 'rejected', null);
  }

  private async recordHistory(
    instanceId: string,
    taskId: string | null,
    fromNodeId: string | null,
    toNodeId: string | null,
    action: string,
    performedBy: string | null,
    comments?: string,
  ) {
    await prisma.workflowHistory.create({
      data: { instanceId, taskId, fromNodeId, toNodeId, action, performedBy, comments },
    });
  }

  /** Get full instance with tasks and history */
  async getInstanceDetail(instanceId: string) {
    return prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: {
        definition: { select: { name: true, entityType: true, graph: true } },
        initiator: { include: { profile: { select: { firstName: true, lastName: true } } } },
        tasks: {
          include: {
            assignee: { include: { profile: { select: { firstName: true, lastName: true } } } },
            delegatee: { include: { profile: { select: { firstName: true, lastName: true } } } },
            completer: { include: { profile: { select: { firstName: true, lastName: true } } } },
            escalator: { include: { profile: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: {
            performer: { include: { profile: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}

export const workflowEngine = new WorkflowEngine();

// ─── Business Hours Utility ──────────────────

const WORK_START_HOUR = 9;   // 9:00 AM
const WORK_END_HOUR = 18;    // 6:00 PM
const WORK_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR; // 9 hours

/**
 * Calculate a deadline counting only business hours (Mon-Fri 9:00-18:00).
 * For example, 4 business hours starting at 4:00 PM Friday would
 * resolve to 1:00 PM Monday.
 */
function calculateBusinessHourDeadline(hours: number): Date {
  const now = new Date();
  let remaining = hours * 60; // convert to minutes for precision

  const cursor = new Date(now);

  // If we're before work hours, jump to work start
  if (cursor.getHours() < WORK_START_HOUR) {
    cursor.setHours(WORK_START_HOUR, 0, 0, 0);
  }
  // If we're after work hours, jump to next business day start
  if (cursor.getHours() >= WORK_END_HOUR) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(WORK_START_HOUR, 0, 0, 0);
  }
  // Skip weekends
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  while (remaining > 0) {
    // Calculate remaining work minutes today
    const endOfDayMinutes = WORK_END_HOUR * 60;
    const currentMinutes = cursor.getHours() * 60 + cursor.getMinutes();
    const availableToday = endOfDayMinutes - currentMinutes;

    if (remaining <= availableToday) {
      cursor.setMinutes(cursor.getMinutes() + remaining);
      remaining = 0;
    } else {
      remaining -= availableToday;
      // Move to next day
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      // Skip weekends
      while (cursor.getDay() === 0 || cursor.getDay() === 6) {
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  return cursor;
}
