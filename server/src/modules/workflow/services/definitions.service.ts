import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

// ─── Graph types ──────────────────────────────
export interface GraphNode {
  id: string;
  type: 'start' | 'end' | 'approval' | 'condition' | 'notification' | 'delay';
  data?: {
    name?: string;
    assignTo?: string;
    parallel?: boolean;
    sla?: { hours: number; escalateTo?: string };
    allowDelegate?: boolean;
    expression?: string;
    trueEdge?: string;
    falseEdge?: string;
    template?: string;
    channels?: string[];
    recipients?: string[];
    delayHours?: number;
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

    const startNodes = nodes.filter((n) => n.type === 'start');
    const endNodes = nodes.filter((n) => n.type === 'end');
    if (startNodes.length !== 1) throw AppError.validation('Graph must have exactly one start node');
    if (endNodes.length < 1) throw AppError.validation('Graph must have at least one end node');

    // Every non-end node must have outgoing edge
    for (const node of nodes) {
      if (node.type === 'end') continue;
      const outEdges = edges.filter((e) => e.source === node.id);
      if (outEdges.length === 0) {
        throw AppError.validation(`Node "${node.id}" has no outgoing edges`);
      }
    }

    // Every non-start node must have incoming edge
    for (const node of nodes) {
      if (node.type === 'start') continue;
      const inEdges = edges.filter((e) => e.target === node.id);
      if (inEdges.length === 0) {
        throw AppError.validation(`Node "${node.id}" has no incoming edges`);
      }
    }

    // Approval nodes must have assignTo
    for (const node of nodes) {
      if (node.type === 'approval' && !node.data?.assignTo) {
        throw AppError.validation(`Approval node "${node.id}" must have assignTo`);
      }
    }

    // Condition nodes must have trueEdge and falseEdge
    for (const node of nodes) {
      if (node.type === 'condition') {
        if (!node.data?.trueEdge || !node.data?.falseEdge) {
          throw AppError.validation(`Condition node "${node.id}" must have trueEdge and falseEdge`);
        }
      }
    }
  }
}

export const definitionsService = new DefinitionsService();
