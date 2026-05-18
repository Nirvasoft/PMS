import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
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

      case 'end':
        await this.completeInstance(instanceId, 'approved');
        break;

      default:
        // start, delay — just advance
        await this.advance(instanceId, graph, node.id, context);
    }
  }

  private async handleApproval(instanceId: string, node: GraphNode, _context: Record<string, unknown>) {
    const { assignTo, sla, name } = node.data ?? {};

    // Calculate SLA due date
    let slaDueAt: Date | null = null;
    if (sla?.hours) {
      slaDueAt = new Date(Date.now() + sla.hours * 60 * 60 * 1000);
    }

    // Resolve assignee
    const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    const assigneeId = await this.resolveAssignee(assignTo || '', instance!.companyId, instance!.initiatedBy);

    // Create task
    await prisma.workflowTask.create({
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

    // Update instance current node
    const inst = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
    const currentNodes = (inst?.currentNodeIds ?? []).filter((n) => n !== 'start');
    if (!currentNodes.includes(node.id)) currentNodes.push(node.id);
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { currentNodeIds: currentNodes },
    });
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
      // Find first user with this role in the company
      const userRole = await prisma.userRole.findFirst({
        where: {
          role: { name: { equals: roleName, mode: 'insensitive' }, companyId },
          user: { isActive: true },
        },
        select: { userId: true },
      });
      // Fall back to initiator if no user found with that role
      return userRole?.userId ?? initiatedBy;
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
