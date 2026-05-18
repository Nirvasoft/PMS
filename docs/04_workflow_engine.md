# Module 1.4 — Workflow Engine

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit · @xyflow/react  
**Status:** ✅ Implemented (P1 core engine + P2 Visual Designer)  
**Depends On:** Module 1.1, 1.2, 1.3

---

## Overview

A generic, configurable approval and process automation engine used by every module that requires human-in-the-loop approvals (leases, invoices, purchase orders, maintenance escalations, move-in/out, etc.).

Workflows are defined visually in a BPMN-style designer and stored as a JSON graph. At runtime, an engine traverses the graph, evaluates conditions, assigns tasks to users, tracks SLAs, and auto-escalates on breach.

**Key concepts:**
- **Workflow Definition** — the static template (graph of steps)
- **Workflow Instance** — a live execution of a definition against a specific entity
- **Step** — a node in the graph (approval | notification | condition | delay | script)
- **Task** — an actionable item assigned to a user from a step
- **Token** — the "current position" in a workflow instance (inspired by BPMN token semantics)

---

## DB Schema

```sql
-- Workflow definitions (templates)
CREATE TABLE workflow_definitions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  entity_type   VARCHAR(100) NOT NULL,
                -- 'lease' | 'invoice' | 'purchase_order' | 'maintenance_ticket' | 'move_in' | ...
  version       SMALLINT NOT NULL DEFAULT 1,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',
                -- 'draft' | 'active' | 'deprecated'
  graph         JSONB NOT NULL,             -- serialized node/edge graph (see below)
  settings      JSONB DEFAULT '{}',         -- sla_enabled, parallel_allowed, etc.
  created_by    UUID REFERENCES users(id),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- graph JSONB structure:
-- {
--   "nodes": [
--     { "id": "start", "type": "start" },
--     { "id": "step1", "type": "approval", "data": {
--         "name": "Manager Approval",
--         "assignTo": "role:manager",       -- 'role:<roleName>' | 'user:<userId>' | 'position:<level>'
--         "parallel": false,
--         "sla": { "hours": 24, "escalateTo": "role:senior_manager" },
--         "allowDelegate": true
--     }},
--     { "id": "cond1", "type": "condition", "data": {
--         "expression": "entity.amount > 50000",
--         "trueEdge": "step2", "falseEdge": "step3"
--     }},
--     { "id": "step2", "type": "approval", "data": { "name": "CFO Approval", "assignTo": "role:cfo" }},
--     { "id": "step3", "type": "notification", "data": {
--         "template": "lease_approved",
--         "channels": ["email", "in_app"],
--         "recipients": ["entity.tenant.email", "entity.createdBy.email"]
--     }},
--     { "id": "end", "type": "end" }
--   ],
--   "edges": [
--     { "id": "e1", "source": "start", "target": "step1" },
--     { "id": "e2", "source": "step1", "target": "cond1" },
--     ...
--   ]
-- }

-- Workflow instances (one per entity submission)
CREATE TABLE workflow_instances (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  definition_id       UUID NOT NULL REFERENCES workflow_definitions(id),
  definition_version  SMALLINT NOT NULL,
  entity_type         VARCHAR(100) NOT NULL,
  entity_id           UUID NOT NULL,
  company_id          UUID NOT NULL REFERENCES companies(id),
  current_node_ids    TEXT[] NOT NULL DEFAULT '{}',  -- multiple for parallel branches
  status              VARCHAR(20) NOT NULL DEFAULT 'running',
                      -- 'running' | 'approved' | 'rejected' | 'cancelled' | 'error'
  initiated_by        UUID NOT NULL REFERENCES users(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancel_reason       TEXT,
  context             JSONB DEFAULT '{}',             -- entity snapshot at initiation
  metadata            JSONB DEFAULT '{}'
);

CREATE INDEX idx_wf_instances_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX idx_wf_instances_status ON workflow_instances(status) WHERE status = 'running';

-- Workflow tasks (human approval/action items)
CREATE TABLE workflow_tasks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id      UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id          VARCHAR(100) NOT NULL,
  task_type        VARCHAR(30) NOT NULL DEFAULT 'approval',
                   -- 'approval' | 'review' | 'acknowledgement'
  title            VARCHAR(255) NOT NULL,
  assigned_to      UUID REFERENCES users(id),        -- NULL = unassigned (pool task)
  assigned_role    VARCHAR(100),
  delegated_to     UUID REFERENCES users(id),
  delegated_at     TIMESTAMPTZ,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
                   -- 'pending' | 'approved' | 'rejected' | 'delegated' | 'expired' | 'skipped'
  decision         VARCHAR(20),                       -- 'approved' | 'rejected'
  comments         TEXT,
  attachments      JSONB DEFAULT '[]',
  sla_due_at       TIMESTAMPTZ,
  sla_breached     BOOLEAN NOT NULL DEFAULT FALSE,
  reminded_at      TIMESTAMPTZ,
  escalated_at     TIMESTAMPTZ,
  escalated_to     UUID REFERENCES users(id),
  completed_at     TIMESTAMPTZ,
  completed_by     UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wf_tasks_assigned ON workflow_tasks(assigned_to) WHERE status = 'pending';
CREATE INDEX idx_wf_tasks_instance ON workflow_tasks(instance_id);
CREATE INDEX idx_wf_tasks_sla ON workflow_tasks(sla_due_at) WHERE status = 'pending';

-- Workflow instance history (audit trail of every step transition)
CREATE TABLE workflow_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id   UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  task_id       UUID REFERENCES workflow_tasks(id),
  from_node_id  VARCHAR(100),
  to_node_id    VARCHAR(100),
  action        VARCHAR(50) NOT NULL,
               -- 'started' | 'approved' | 'rejected' | 'escalated' | 'delegated' | 'sla_breach' | 'completed' | 'cancelled'
  performed_by  UUID REFERENCES users(id),
  comments      TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wf_history_instance ON workflow_history(instance_id, created_at);

-- SLA breach job tracking (processed by Bull queue)
CREATE TABLE workflow_sla_jobs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  job_type    VARCHAR(20) NOT NULL,  -- 'reminder' | 'escalate'
  scheduled_at TIMESTAMPTZ NOT NULL,
  bull_job_id VARCHAR(100),
  processed_at TIMESTAMPTZ,
  UNIQUE (task_id, job_type)
);
```

---

## Server-Side Architecture

```
src/modules/workflow/
├── workflow.routes.ts                 # Express routers: definitions, instances, tasks
├── services/
│   ├── definitions.service.ts         # CRUD + graph validation + publish
│   ├── engine.service.ts              # core runtime: start, advance, complete, cancel
│   └── tasks.service.ts               # my-tasks inbox, instance queries

src/common/
├── socket.ts                          # Socket.IO server (JWT auth, user rooms)
└── slaEscalation.ts                   # node-cron (every 5 min) — SLA breach detection
```

### Core Engine

```typescript
// src/modules/workflow/services/engine.service.ts
// Plain class — no NestJS decorators; uses Prisma client directly
import { prisma } from '../../../common/database';
import { emitNotification } from '../../../common/socket';
import { notificationService } from '../../notifications/services/notification.service';

class WorkflowEngineService {

  /**
   * Creates a new workflow instance and advances to first actionable step.
   * Called by any module that requires approval (e.g. LeaseService.submitForApproval)
   */
  async startInstance(
    definitionId: string,
    entityType: string,
    entityId: string,
    entitySnapshot: Record<string, unknown>,
    initiatedBy: string,
  ): Promise<WorkflowInstance> {
    const def = await this.loadActiveDefinition(definitionId);
    
    const instance = await this.instanceRepo.save({
      definitionId: def.id,
      definitionVersion: def.version,
      entityType,
      entityId,
      companyId: def.companyId,
      currentNodeIds: ['start'],
      status: 'running',
      initiatedBy,
      context: entitySnapshot,
    });

    await this.recordHistory(instance.id, null, 'start', 'started', initiatedBy);
    await this.advance(instance, 'start', entitySnapshot);
    return instance;
  }

  /**
   * Advances the workflow from a given node.
   * Called after task completion or condition evaluation.
   */
  private async advance(
    instance: WorkflowInstance,
    fromNodeId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const graph = instance.definition.graph;
    const outEdges = graph.edges.filter(e => e.source === fromNodeId);

    for (const edge of outEdges) {
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (!targetNode) continue;

      await this.processNode(instance, targetNode, context);
    }
  }

  private async processNode(
    instance: WorkflowInstance,
    node: GraphNode,
    context: Record<string, unknown>,
  ): Promise<void> {
    switch (node.type) {
      case 'approval':
        await this.handleApprovalNode(instance, node, context);
        break;
      case 'condition':
        await this.handleConditionNode(instance, node, context);
        break;
      case 'notification':
        await this.handleNotificationNode(instance, node, context);
        await this.advance(instance, node.id, context);
        break;
      case 'delay':
        await this.handleDelayNode(instance, node, context);
        break;
      case 'end':
        await this.completeInstance(instance, 'approved');
        break;
    }
  }

  private async handleApprovalNode(instance: WorkflowInstance, node: GraphNode, context: Record<string, unknown>): Promise<void> {
    const { assignTo, sla, parallel, name } = node.data;
    const assignees = await this.resolveAssignees(assignTo, instance.companyId, context);

    if (parallel && assignees.length > 1) {
      // Create one task per assignee; all must approve
      for (const userId of assignees) {
        const task = await this.taskService.createTask(instance, node, userId, sla);
        await this.slaService.scheduleReminder(task);
        await this.slaService.scheduleEscalation(task, node.data.sla?.escalateTo);
      }
    } else {
      // Single assignee (or first available from role)
      const task = await this.taskService.createTask(instance, node, assignees[0], sla);
      await this.slaService.scheduleReminder(task);
      await this.slaService.scheduleEscalation(task, node.data.sla?.escalateTo);
    }

    // Update instance current node
    await this.instanceRepo.update(instance.id, {
      currentNodeIds: [...instance.currentNodeIds.filter(n => n !== 'start'), node.id],
    });
  }

  private async handleConditionNode(instance: WorkflowInstance, node: GraphNode, context: Record<string, unknown>): Promise<void> {
    const result = await this.conditionEvaluator.evaluate(node.data.expression, context);
    const nextEdgeTarget = result ? node.data.trueEdge : node.data.falseEdge;
    const nextNode = instance.definition.graph.nodes.find(n => n.id === nextEdgeTarget);
    if (nextNode) await this.processNode(instance, nextNode, context);
  }

  /**
   * Called when a user approves or rejects a task.
   */
  async completeTask(
    taskId: string,
    decision: 'approved' | 'rejected',
    comments: string,
    completedBy: string,
  ): Promise<void> {
    const task = await this.taskRepo.findOneOrFail({ where: { id: taskId }, relations: ['instance'] });
    
    if (task.status !== 'pending') throw new BadRequestException('Task is not pending');
    if (task.assignedTo !== completedBy && task.delegatedTo !== completedBy) {
      throw new ForbiddenException('Not authorized to complete this task');
    }

    await this.taskRepo.update(taskId, {
      status: decision,
      decision,
      comments,
      completedAt: new Date(),
      completedBy,
    });

    await this.slaService.cancelJobsForTask(taskId);
    await this.recordHistory(task.instanceId, taskId, task.nodeId, decision, completedBy, comments);

    const instance = task.instance;

    if (decision === 'rejected') {
      await this.completeInstance(instance, 'rejected');
      return;
    }

    // Check if parallel tasks all approved
    const siblingTasks = await this.taskRepo.find({
      where: { instanceId: instance.id, nodeId: task.nodeId },
    });
    const allApproved = siblingTasks.every(t => t.status === 'approved');
    if (!allApproved) return;  // waiting for other parallel approvers

    // Advance to next node
    await this.advance(instance, task.nodeId, instance.context);
  }

  async cancelInstance(instanceId: string, reason: string, cancelledBy: string): Promise<void> {
    await this.instanceRepo.update(instanceId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason,
    });
    // Cancel all pending tasks + scheduled SLA jobs
    const tasks = await this.taskRepo.find({ where: { instanceId, status: 'pending' } });
    for (const t of tasks) {
      await this.taskRepo.update(t.id, { status: 'skipped' });
      await this.slaService.cancelJobsForTask(t.id);
    }
    await this.recordHistory(instanceId, null, null, 'cancelled', cancelledBy, reason);
  }

  private async completeInstance(instance: WorkflowInstance, status: 'approved' | 'rejected'): Promise<void> {
    await this.instanceRepo.update(instance.id, { status, completedAt: new Date() });
    // Emit event for consuming module (e.g. LeaseService listens to 'workflow.completed')
    this.eventEmitter.emit(`workflow.${status}`, {
      instanceId: instance.id,
      entityType: instance.entityType,
      entityId: instance.entityId,
    });
  }
}

// Condition evaluation — inline in engine.service.ts
// Uses safe regex-based comparisons (no eval, no expr-eval library)
// Supports: context.field > value, context.field == value, etc.
private evaluateCondition(expression: string, context: Record<string, unknown>): boolean {
  // Replace context.x references with actual values
  const resolved = expression.replace(/context\.([\w.]+)/g, (_m, path) => {
    const val = path.split('.').reduce((o: unknown, k: string) => (o as Record<string, unknown>)?.[k], context);
    return typeof val === 'string' ? `"${val}"` : String(val ?? 'null');
  });
  // Match simple comparisons: number > number, string == string
  const match = resolved.match(/^\s*([\d.]+|"[^"]*")\s*(>|<|>=|<=|==|!=)\s*([\d.]+|"[^"]*")\s*$/);
  if (!match) return false;
  const [, left, op, right] = match;
  const l = parseFloat(left) || left;
  const r = parseFloat(right) || right;
  switch (op) {
    case '>':  return l > r;
    case '<':  return l < r;
    case '>=': return l >= r;
    case '<=': return l <= r;
    case '==': return l == r;
    case '!=': return l != r;
    default: return false;
  }
}

// src/common/slaEscalation.ts — node-cron, runs every 5 min
// Replaces Bull queue approach with a polling cron that scans for overdue tasks.
import cron from 'node-cron';
import { prisma } from './database';
import { emitNotification } from './socket';

export function startSlaEscalationJob() {
  cron.schedule('*/5 * * * *', async () => {
    // Find tasks: status IN ('pending','in_progress'), sla_deadline < NOW(), escalated_at IS NULL
    const overdueTasksRaw = await prisma.$queryRaw`
      SELECT wt.id, wt.assigned_to, wt.step_key
      FROM workflow_tasks wt
      WHERE wt.status IN ('pending', 'in_progress')
        AND wt.sla_deadline IS NOT NULL
        AND wt.sla_deadline < ${new Date()}
        AND wt.escalated_at IS NULL
      LIMIT 50
    `;

    for (const task of overdueTasksRaw) {
      // Mark escalated
      await prisma.$executeRaw`UPDATE workflow_tasks SET escalated_at = NOW() WHERE id = ${task.id}::uuid`;
      // Notify assignee via Socket.IO + create in-app notification record
      if (task.assigned_to) {
        emitNotification(task.assigned_to, {
          id: `sla_${task.id}`,
          title: '⚠️ SLA Breach — Task Overdue',
          body: 'A workflow task has exceeded its SLA deadline.',
          icon: 'warning',
          actionUrl: '/tasks',
        });
        // Also persist InAppNotification via Prisma
      }
    }
  });
}
```

---

## API Contract

### `GET /workflow-definitions`
**Access:** `workflows.read`  
**Query:** `?entityType=lease&status=active`

### `POST /workflow-definitions`
**Access:** `workflows.create`

```json
{
  "name": "Lease Approval Workflow",
  "entityType": "lease",
  "graph": {
    "nodes": [
      { "id": "start", "type": "start" },
      { "id": "mgr_approval", "type": "approval", "data": {
          "name": "Property Manager Approval",
          "assignTo": "role:property_manager",
          "sla": { "hours": 24, "escalateTo": "role:regional_manager" },
          "allowDelegate": true
      }},
      { "id": "amount_check", "type": "condition", "data": {
          "expression": "entity.rentAmount > 50000",
          "trueEdge": "cfo_approval",
          "falseEdge": "notify_approved"
      }},
      { "id": "cfo_approval", "type": "approval", "data": {
          "name": "CFO Approval",
          "assignTo": "role:cfo",
          "sla": { "hours": 48 }
      }},
      { "id": "notify_approved", "type": "notification", "data": {
          "template": "lease_approved",
          "channels": ["email", "in_app"],
          "recipients": ["entity.createdBy"]
      }},
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "id": "e1", "source": "start", "target": "mgr_approval" },
      { "id": "e2", "source": "mgr_approval", "target": "amount_check" },
      { "id": "e3", "source": "amount_check", "target": "cfo_approval", "label": "Amount > 50,000" },
      { "id": "e4", "source": "amount_check", "target": "notify_approved", "label": "Amount ≤ 50,000" },
      { "id": "e5", "source": "cfo_approval", "target": "notify_approved" },
      { "id": "e6", "source": "notify_approved", "target": "end" }
    ]
  }
}
```

### `POST /workflow-definitions/:id/publish`
**Access:** `workflows.publish`

### `POST /workflow-definitions/:id/deprecate`

---

### `POST /workflow-instances`
**Access:** Called internally by consuming modules (service-to-service)

```json
{
  "definitionId": "uuid",
  "entityType": "lease",
  "entityId": "uuid",
  "entitySnapshot": {
    "entity": {
      "id": "uuid",
      "unitId": "uuid",
      "tenantId": "uuid",
      "rentAmount": 75000,
      "startDate": "2025-02-01",
      "createdBy": { "id": "uuid", "email": "agent@acme.com" }
    }
  }
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "instanceId": "uuid",
    "status": "running",
    "currentStep": "Property Manager Approval",
    "pendingTasks": [{
      "taskId": "uuid",
      "assignedTo": { "id": "uuid", "fullName": "Alice Manager" },
      "slaDueAt": "2025-01-16T08:00:00Z"
    }]
  }
}
```

---

### `GET /workflow-instances/:id`
**Access:** `workflows.read` or task assignee

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "running",
    "entityType": "lease",
    "entityId": "uuid",
    "currentNodeIds": ["mgr_approval"],
    "startedAt": "2025-01-15T10:00:00Z",
    "initiatedBy": { "id": "uuid", "fullName": "John Agent" },
    "tasks": [
      {
        "id": "uuid",
        "nodeId": "mgr_approval",
        "title": "Property Manager Approval",
        "status": "pending",
        "assignedTo": { "id": "uuid", "fullName": "Alice Manager" },
        "slaDueAt": "2025-01-16T10:00:00Z",
        "slaBreached": false,
        "createdAt": "2025-01-15T10:00:00Z"
      }
    ],
    "history": [
      {
        "action": "started",
        "performedBy": { "id": "uuid", "fullName": "John Agent" },
        "createdAt": "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

---

### `POST /workflow-tasks/:id/approve`
**Access:** Task assignee or delegatee

```json
{
  "comments": "Reviewed and approved. Tenant KYC verified."
}
```

### `POST /workflow-tasks/:id/reject`

```json
{
  "comments": "Rent amount below market rate. Please renegotiate."
}
```

### `POST /workflow-tasks/:id/delegate`

```json
{
  "delegateTo": "uuid",
  "reason": "On leave until Jan 20"
}
```

---

### `GET /workflow-tasks/my-tasks`
**Access:** Authenticated (returns tasks assigned to current user)

**Query:** `?status=pending&entityType=&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Property Manager Approval",
      "entityType": "lease",
      "entityId": "uuid",
      "entitySummary": "Unit 12A, ACME Tower — Tenant: ABC Corp",
      "status": "pending",
      "slaDueAt": "2025-01-16T10:00:00Z",
      "slaBreached": false,
      "minutesUntilSla": 480,
      "initiatedBy": "John Agent",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "meta": { "total": 3, "pending": 3 }
}
```

---

### `GET /workflow-instances`
**Access:** `workflows.read`  
**Query:** `?entityType=lease&status=running&entityId=`

---

### `POST /workflow-instances/:id/cancel`
**Access:** `workflows.cancel` or instance initiator

```json
{ "reason": "Duplicate submission" }
```

---

## Business Logic & Validation Rules

### Definition Validation (on publish)
```
1. Graph must have exactly one 'start' node and at least one 'end' node
2. Every node (except 'end') must have at least one outgoing edge
3. Every node (except 'start') must have at least one incoming edge
4. No unreachable nodes (graph traversal from 'start' must visit all nodes)
5. Condition nodes must have both trueEdge and falseEdge defined
6. Approval nodes must have assignTo defined
7. No circular paths without a condition/end escape (detect with DFS cycle check)
8. If existing instances are running against version N, publishing version N+1 
   does NOT affect running instances (they continue on their version's graph)
```

### Task Assignment Resolution
```
assignTo formats:
  'role:<roleName>'      → find all users in company with that role, pick the least-loaded
  'user:<userId>'        → assign directly to that user
  'position:<level>'     → find users with position.level >= N, prefer direct manager
  'department:<code>'    → find manager of that department
  'initiator'            → assign to instance.initiatedBy
  'initiator.manager'    → find direct manager of initiator via position hierarchy
```

### SLA Calculation
```
SLA hours → slaDueAt:
  Working hours mode (if enabled): skip weekends/holidays
  Calendar hours mode (default): slaDueAt = task.createdAt + sla.hours * 60 * 60 * 1000

Reminder: 2 hours before slaDueAt
Escalation: at slaDueAt → mark slaBreached=true, reassign task to escalateTo, send notifications
```

---

## UI Screens & Component Breakdown

```
admin/workflows/
├── WorkflowsPage/
│   ├── WorkflowsPage.tsx              # tabs: Definitions | Instances
│   ├── WorkflowEditor.tsx             # legacy modal editor (JSON-based, kept for quick edits)
│   └── DesignerPage.tsx               # ✅ Full-screen React Flow visual designer
│       ├── components/
│       │   ├── WorkflowNode.tsx        # custom RF node: colored shapes, SLA badge, handles per type
│       │   └── NodeConfigPanel.tsx     # right sidebar: edit all node properties
│       └── designer.css               # dark-mode canvas, palette, config panel styles
│
│   WorkflowsPage Definitions tab features:
│   ├── 🎨 Design button → navigates to /admin/workflows/:id/design (DesignerPage)
│   ├── ✏️ Edit / 👁 View button → opens WorkflowEditor modal
│   ├── Publish / Deprecate / Delete / ▶ Run actions
│   └── Create new workflow modal
│
│   DesignerPage features:
│   ├── Left palette: click to add Approval | Condition | Notification | Delay nodes
│   ├── React Flow canvas: drag-to-reposition, zoom/pan, animated edges with arrows
│   ├── Connect mode: drag from node handle to create edges
│   ├── Node types: Start (green circle) | End (red circle) | Approval (blue rect)
│   │              Condition (amber diamond, true/false handles) | Notification (purple)
│   │              Delay (grey, hours badge)
│   ├── Right config panel: full property editing for selected node
│   │   ├── Approval: name, assignTo (initiator/manager/role/specific), SLA hours,
│   │   │             escalateTo, allowDelegate, parallel
│   │   ├── Condition: JS expression, true/false edge labels
│   │   ├── Notification: template code, channels (in_app/email/sms/push), recipients
│   │   └── Delay: duration in hours
│   ├── MiniMap: color-coded by node type
│   ├── Toolbar: Save (persists positions + graph), Close
│   ├── Read-only mode for published/deprecated definitions
│   └── Route: /admin/workflows/:id/design (full-screen, outside DashboardLayout)
│
├── MyTasksPage/                        # approval inbox
│   └── components/
│       ├── TaskCard.tsx                # entity summary + approve/reject/delegate buttons
│       └── DelegateModal.tsx           # user picker
│
└── WorkflowInstancePage/               # live instance view (via Instances tab)
    └── HistoryTimeline + TasksList
```

---

## State Management

```typescript
// client/src/store/api/workflowApi.ts — actual implemented exports
export const {
  useGetDefinitionsQuery,
  useGetDefinitionQuery,           // DesignerPage: load graph by ID
  useCreateDefinitionMutation,
  useUpdateDefinitionMutation,     // DesignerPage Save + WorkflowEditor Save
  usePublishDefinitionMutation,
  useDeprecateDefinitionMutation,
  useDeleteDefinitionMutation,
  useGetInstancesQuery,
  useGetInstanceQuery,
  useStartInstanceMutation,
  useCancelInstanceMutation,
  useGetMyTasksQuery,
  useApproveTaskMutation,
  useRejectTaskMutation,
  useDelegateTaskMutation,
} = workflowApi;
```

### Real-time WebSocket Integration (P2 ✅ implemented)

```typescript
// server/src/common/socket.ts — Socket.IO server
// JWT-authenticated; users join room `user:<userId>` on connect
// emitNotification(userId, payload) helper used by SLA escalation cron

// client/src/hooks/useRealtimeNotifications.ts
// Connects on login, listens for 'notification:new',
// shows react-hot-toast + invalidates RTK Query notifications cache

// Workflow-specific events (planned extension):
// 'workflow:task:assigned'  → workflowApi.util.invalidateTags(['Tasks'])
// 'workflow:task:completed' → workflowApi.util.invalidateTags(['Tasks','Instances'])
```

### SLA Escalation Cron (P2 ✅ implemented)

```typescript
// server/src/common/slaEscalation.ts — node-cron, runs every 5 min
// Finds: workflow_tasks WHERE status='pending' AND sla_due_at < NOW() AND escalated_at IS NULL
// On breach per task:
//   1. escalated_at = NOW()
//   2. Creates InAppNotification for assignee (companyId resolved from user)
//   3. Emits Socket.IO 'notification:new' to assignee room
//   4. Logs breach via server logger
```

### Graph Position Persistence

Node positions from the React Flow canvas are stored inside each graph node alongside logical config:

```json
{
  "nodes": [
    {
      "id": "approval_1",
      "type": "approval",
      "position": { "x": 320, "y": 200 },
      "data": { "name": "Manager Approval", "assignTo": "manager", "sla": { "hours": 24 } }
    }
  ]
}
```

The runtime engine ignores `position`; it is used only by DesignerPage to restore node layout.
