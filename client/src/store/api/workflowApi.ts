import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number; pending?: number };
}

interface UserProfile { firstName: string; lastName: string; }
interface UserRef { id: string; profile: UserProfile | null; }

// ─── Types ──────────────────────────────────

export interface WorkflowDefinition {
  id: string; name: string; description: string | null;
  entityType: string; version: number; status: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  settings: Record<string, unknown>;
  publishedAt: string | null;
  creator: UserRef | null;
  _count: { instances: number };
  createdAt: string; updatedAt: string;
}

export interface GraphNode {
  id: string; type: string;
  data?: {
    name?: string; assignTo?: string; parallel?: boolean;
    sla?: { hours: number; escalateTo?: string };
    allowDelegate?: boolean; expression?: string;
    trueEdge?: string; falseEdge?: string;
    template?: string; channels?: string[];
    recipients?: string[]; delayHours?: number;
  };
}

export interface GraphEdge {
  id: string; source: string; target: string; label?: string;
}

export interface WorkflowTask {
  id: string; nodeId: string; taskType: string; title: string;
  assignedTo: string | null; assignedRole: string | null;
  delegatedTo: string | null; status: string; decision: string | null;
  comments: string | null; slaDueAt: string | null;
  slaBreached: boolean; completedAt: string | null;
  createdAt: string; minutesUntilSla: number | null;
  assignee: UserRef | null; delegatee: UserRef | null;
  completer: UserRef | null;
  instance?: {
    id: string; entityType: string; entityId: string; status: string;
    context: Record<string, unknown>;
    initiator: UserRef;
    definition: { name: string };
  };
}

export interface WorkflowInstance {
  id: string; entityType: string; entityId: string;
  status: string; currentNodeIds: string[];
  startedAt: string; completedAt: string | null;
  cancelReason: string | null;
  context: Record<string, unknown>;
  definition: { name: string; entityType: string; graph: { nodes: GraphNode[]; edges: GraphEdge[] } };
  initiator: UserRef;
  tasks: WorkflowTask[];
  history: {
    id: string; action: string; comments: string | null; createdAt: string;
    performer: UserRef | null;
  }[];
  _count?: { tasks: number };
}

// ─── API ────────────────────────────────────

export const workflowApi = createApi({
  reducerPath: 'workflowApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Definitions', 'Instances', 'Tasks'],
  endpoints: (builder) => ({
    // Definitions
    getDefinitions: builder.query<ApiResponse<WorkflowDefinition[]>, Record<string, string> | void>({
      query: (params) => ({ url: '/workflow-definitions', params: params ?? {} }),
      providesTags: ['Definitions'],
    }),
    getDefinition: builder.query<ApiResponse<WorkflowDefinition>, string>({
      query: (id) => `/workflow-definitions/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Definitions', id }],
    }),
    createDefinition: builder.mutation<ApiResponse<WorkflowDefinition>, Record<string, unknown>>({
      query: (body) => ({ url: '/workflow-definitions', method: 'POST', body }),
      invalidatesTags: ['Definitions'],
    }),
    updateDefinition: builder.mutation<void, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/workflow-definitions/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Definitions'],
    }),
    publishDefinition: builder.mutation<void, string>({
      query: (id) => ({ url: `/workflow-definitions/${id}/publish`, method: 'POST' }),
      invalidatesTags: ['Definitions'],
    }),
    deprecateDefinition: builder.mutation<void, string>({
      query: (id) => ({ url: `/workflow-definitions/${id}/deprecate`, method: 'POST' }),
      invalidatesTags: ['Definitions'],
    }),
    deleteDefinition: builder.mutation<void, string>({
      query: (id) => ({ url: `/workflow-definitions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Definitions'],
    }),

    // Instances
    getInstances: builder.query<PaginatedResponse<WorkflowInstance>, Record<string, string>>({
      query: (params) => ({ url: '/workflow-instances', params }),
      providesTags: ['Instances'],
    }),
    getInstance: builder.query<ApiResponse<WorkflowInstance>, string>({
      query: (id) => `/workflow-instances/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Instances', id }],
    }),
    startInstance: builder.mutation<ApiResponse<WorkflowInstance>, Record<string, unknown>>({
      query: (body) => ({ url: '/workflow-instances', method: 'POST', body }),
      invalidatesTags: ['Instances', 'Tasks', 'Definitions'],
    }),
    cancelInstance: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/workflow-instances/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Instances', 'Tasks'],
    }),

    // Tasks
    getMyTasks: builder.query<PaginatedResponse<WorkflowTask>, Record<string, string>>({
      query: (params) => ({ url: '/workflow-tasks/my-tasks', params }),
      providesTags: ['Tasks'],
    }),
    approveTask: builder.mutation<ApiResponse<WorkflowInstance>, { taskId: string; comments: string }>({
      query: ({ taskId, comments }) => ({ url: `/workflow-tasks/${taskId}/approve`, method: 'POST', body: { comments } }),
      invalidatesTags: ['Tasks', 'Instances'],
    }),
    rejectTask: builder.mutation<ApiResponse<WorkflowInstance>, { taskId: string; comments: string }>({
      query: ({ taskId, comments }) => ({ url: `/workflow-tasks/${taskId}/reject`, method: 'POST', body: { comments } }),
      invalidatesTags: ['Tasks', 'Instances'],
    }),
    delegateTask: builder.mutation<void, { taskId: string; delegateTo: string; reason: string }>({
      query: ({ taskId, ...body }) => ({ url: `/workflow-tasks/${taskId}/delegate`, method: 'POST', body }),
      invalidatesTags: ['Tasks'],
    }),
  }),
});

export const {
  useGetDefinitionsQuery,
  useGetDefinitionQuery,
  useCreateDefinitionMutation,
  useUpdateDefinitionMutation,
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
