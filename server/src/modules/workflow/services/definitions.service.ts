import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

// ─── Graph types ──────────────────────────────
export interface GraphNode {
  id: string;
  type: 'start' | 'end' | 'approval' | 'condition' | 'notification' | 'delay' | 'script';
  data?: {
    name?: string;
    assignTo?: string;
    parallel?: boolean;
    sla?: { hours: number; escalateTo?: string; mode?: 'calendar' | 'business' };
    allowDelegate?: boolean;
    expression?: string;
    trueEdge?: string;
    falseEdge?: string;
    template?: string;
    channels?: string[];
    recipients?: string[];
    recipientType?: string;
    message?: string;
    delayHours?: number;
    scriptAction?: string;   // 'update_entity_status' | 'send_email' | 'set_context' | 'webhook'
    scriptConfig?: Record<string, unknown>;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Definitions Service ──────────────────────
export class DefinitionsService {
  async findAll(companyId: string, query: { entityType?: string; status?: string }) {
    const where: Record<string, unknown> = { companyId };
    if (query.entityType) where.entityType = query.entityType;
    if (query.status) where.status = query.status;

    return prisma.workflowDefinition.findMany({
      where,
      include: {
        creator: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { instances: true } },
      },
      orderBy: [{ entityType: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const def = await prisma.workflowDefinition.findUnique({
      where: { id },
      include: {
        creator: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { instances: true } },
      },
    });
    if (!def) throw AppError.notFound('Workflow definition');
    return def;
  }

  async create(dto: {
    name: string; description?: string; entityType: string;
    graph: WorkflowGraph; settings?: Record<string, unknown>;
  }, companyId: string, createdBy: string) {
    return prisma.workflowDefinition.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        entityType: dto.entityType,
        graph: dto.graph as unknown as Record<string, unknown>,
        settings: (dto.settings ?? {}) as unknown as Record<string, unknown>,
        createdBy,
      },
    });
  }

  async update(id: string, dto: Record<string, unknown>) {
    const def = await prisma.workflowDefinition.findUnique({ where: { id } });
    if (!def) throw AppError.notFound('Workflow definition');
    if (def.status !== 'draft') {
      throw AppError.conflict('Only draft definitions can be edited. Create a new version instead.');
    }
    return prisma.workflowDefinition.update({ where: { id }, data: dto });
  }

  async publish(id: string) {
    const def = await prisma.workflowDefinition.findUnique({ where: { id } });
    if (!def) throw AppError.notFound('Workflow definition');
    if (def.status === 'active') throw AppError.conflict('Already published');

    // Validate graph
    const graph = def.graph as unknown as WorkflowGraph;
    this.validateGraph(graph);

    // Deprecate previous active version of same entity type
    await prisma.workflowDefinition.updateMany({
      where: { companyId: def.companyId, entityType: def.entityType, status: 'active' },
      data: { status: 'deprecated' },
    });

    return prisma.workflowDefinition.update({
      where: { id },
      data: { status: 'active', publishedAt: new Date() },
    });
  }

  async deprecate(id: string) {
    return prisma.workflowDefinition.update({
      where: { id },
      data: { status: 'deprecated' },
    });
  }

  async delete(id: string) {
    const def = await prisma.workflowDefinition.findUnique({
      where: { id },
      include: { _count: { select: { instances: true } } },
    });
    if (!def) throw AppError.notFound('Workflow definition');
    if (def._count.instances > 0) {
      throw AppError.conflict('Cannot delete definition with existing instances');
    }
    await prisma.workflowDefinition.delete({ where: { id } });
  }

  // ─── Graph Validation ─────────────────────
  private validateGraph(graph: WorkflowGraph) {
    const { nodes, edges } = graph;
    if (!nodes?.length || !edges?.length) {
      throw AppError.validation('Graph must have nodes and edges');
    }

    const nodeIds = new Set(nodes.map((n) => n.id));

    // ── 1. Structural checks ─────────────────
    const startNodes = nodes.filter((n) => n.type === 'start');
    const endNodes = nodes.filter((n) => n.type === 'end');
    if (startNodes.length !== 1) throw AppError.validation('Graph must have exactly one start node');
    if (endNodes.length < 1) throw AppError.validation('Graph must have at least one end node');

    // Every non-end node must have outgoing edge
    for (const node of nodes) {
      if (node.type === 'end') continue;
      const outEdges = edges.filter((e) => e.source === node.id);
      if (outEdges.length === 0) {
        throw AppError.validation(`Node "${node.data?.name || node.id}" has no outgoing edges`);
      }
    }

    // Every non-start node must have incoming edge
    for (const node of nodes) {
      if (node.type === 'start') continue;
      const inEdges = edges.filter((e) => e.target === node.id);
      if (inEdges.length === 0) {
        throw AppError.validation(`Node "${node.data?.name || node.id}" has no incoming edges`);
      }
    }

    // Edges must reference valid nodes
    for (const edge of edges) {
      if (!nodeIds.has(edge.source)) {
        throw AppError.validation(`Edge "${edge.id}" references non-existent source node "${edge.source}"`);
      }
      if (!nodeIds.has(edge.target)) {
        throw AppError.validation(`Edge "${edge.id}" references non-existent target node "${edge.target}"`);
      }
    }

    // ── 2. Node-type-specific validation ─────
    for (const node of nodes) {
      if (node.type === 'approval' && !node.data?.assignTo) {
        throw AppError.validation(`Approval node "${node.data?.name || node.id}" must have assignTo`);
      }
      if (node.type === 'condition') {
        if (!node.data?.trueEdge || !node.data?.falseEdge) {
          throw AppError.validation(`Condition node "${node.data?.name || node.id}" must have trueEdge and falseEdge`);
        }
      }
      if (node.type === 'delay') {
        const h = node.data?.delayHours;
        if (h == null || h <= 0) {
          throw AppError.validation(`Delay node "${node.data?.name || node.id}" must have delayHours > 0`);
        }
      }
      if (node.type === 'script') {
        const validActions = ['update_entity_status', 'send_email', 'set_context', 'webhook'];
        if (!node.data?.scriptAction || !validActions.includes(node.data.scriptAction)) {
          throw AppError.validation(
            `Script node "${node.data?.name || node.id}" must have scriptAction (${validActions.join(', ')})`
          );
        }
      }
    }

    // ── 3. Cycle detection (DFS) ─────────────
    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) adj.get(e.source)?.push(e.target);

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of nodes) color.set(n.id, WHITE);

    const cyclePath: string[] = [];

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      cyclePath.push(nodeId);

      for (const neighbor of (adj.get(nodeId) ?? [])) {
        if (color.get(neighbor) === GRAY) {
          // Found a back edge → cycle
          cyclePath.push(neighbor);
          return true;
        }
        if (color.get(neighbor) === WHITE && dfs(neighbor)) {
          return true;
        }
      }

      cyclePath.pop();
      color.set(nodeId, BLACK);
      return false;
    };

    for (const n of nodes) {
      if (color.get(n.id) === WHITE && dfs(n.id)) {
        // Extract the cycle from the path
        const cycleStart = cyclePath[cyclePath.length - 1];
        const cycleStartIdx = cyclePath.indexOf(cycleStart);
        const cycle = cyclePath.slice(cycleStartIdx);
        const nodeLabels = cycle.map((id) => {
          const nd = nodes.find((n) => n.id === id);
          return nd?.data?.name || id;
        });
        throw AppError.validation(
          `Cycle detected: ${nodeLabels.join(' → ')}. Workflows must not contain loops.`
        );
      }
    }

    // ── 4. Reachability from start ───────────
    const reachableFromStart = new Set<string>();
    const bfs = (startId: string, adjacency: Map<string, string[]>) => {
      const visited = new Set<string>();
      const queue = [startId];
      visited.add(startId);
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of (adjacency.get(current) ?? [])) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return visited;
    };

    const forwardReachable = bfs('start', adj);
    for (const node of nodes) {
      if (!forwardReachable.has(node.id)) {
        throw AppError.validation(
          `Node "${node.data?.name || node.id}" is unreachable from start. Remove it or connect it to the workflow.`
        );
      }
    }

    // ── 5. Reachability to end ───────────────
    // Build reverse adjacency
    const reverseAdj = new Map<string, string[]>();
    for (const n of nodes) reverseAdj.set(n.id, []);
    for (const e of edges) reverseAdj.get(e.target)?.push(e.source);

    // BFS backward from each end node
    const reachableToEnd = new Set<string>();
    for (const endNode of endNodes) {
      const reached = bfs(endNode.id, reverseAdj);
      for (const id of reached) reachableToEnd.add(id);
    }

    if (!reachableToEnd.has('start')) {
      throw AppError.validation(
        'No path from start to any end node. The workflow can never complete.'
      );
    }
  }
}

export const definitionsService = new DefinitionsService();
