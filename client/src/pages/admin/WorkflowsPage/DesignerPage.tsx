import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
  type NodeTypes, MarkerType, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetDefinitionQuery, useUpdateDefinitionMutation } from '../../../store/api/workflowApi';
import type { GraphNode, GraphEdge } from '../../../store/api/workflowApi';
import toast from 'react-hot-toast';
import { Save, X, Plus, ChevronRight, Settings } from 'lucide-react';
import { WorkflowNode } from './components/WorkflowNode';
import { NodeConfigPanel } from './components/NodeConfigPanel';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './designer.css';

const RF_NODE_TYPES: NodeTypes = { workflowNode: WorkflowNode };

const NODE_PALETTE = [
  { type: 'approval',     label: 'Approval',     icon: '✅', color: '#3b82f6' },
  { type: 'condition',    label: 'Condition',     icon: '🔀', color: '#f59e0b' },
  { type: 'notification', label: 'Notification',  icon: '🔔', color: '#8b5cf6' },
  { type: 'delay',        label: 'Delay',         icon: '⏱',  color: '#6b7280' },
];

const NODE_COLORS: Record<string, string> = {
  start: '#22c55e', end: '#ef4444',
  approval: '#3b82f6', condition: '#f59e0b',
  notification: '#8b5cf6', delay: '#6b7280',
};

function graphToFlow(nodes: GraphNode[], edges: GraphEdge[]): { nodes: Node[]; edges: Edge[] } {
  const mapped: Node[] = nodes.map((n, i) => {
    // Preserve stored position if it exists (cast to extended type)
    const storedPos = (n as GraphNode & { position?: { x: number; y: number } }).position;
    return {
      id: n.id,
      type: 'workflowNode',
      position: storedPos ?? { x: i * 230 + 60, y: 200 },
      data: {
        nodeType: n.type,
        config: n.data ?? {},
        label: n.data?.name ?? n.type,
        color: NODE_COLORS[n.type] ?? '#64748b',
      },
    };
  });

  const mappedEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6b9a80' },
    style: { stroke: '#6b9a80', strokeWidth: 2 },
    labelStyle: { fill: '#8fb5a2', fontSize: 11 },
  }));

  return { nodes: mapped, edges: mappedEdges };
}

function flowToGraph(nodes: Node[], edges: Edge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const gNodes: GraphNode[] = nodes.map(n => {
    const d = n.data as { nodeType: string; config: GraphNode['data'] };
    return {
      id: n.id,
      type: d.nodeType,
      data: d.config,
      // store position so it's preserved on save
      position: n.position,
    } as GraphNode & { position: { x: number; y: number } };
  });

  const gEdges: GraphEdge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : undefined,
  }));

  return { nodes: gNodes, edges: gEdges };
}

export default function DesignerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGetDefinitionQuery(id!, { skip: !id });
  const [updateDef, { isLoading: saving }] = useUpdateDefinitionMutation();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Initialize from API data once it loads
  useEffect(() => {
    if (data?.data) {
      const { nodes: n, edges: e } = graphToFlow(data.data.graph.nodes, data.data.graph.edges);
      setNodes(n);
      setEdges(e);
      setDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.data]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({
      ...connection,
      id: `e_${connection.source}_${connection.target}_${Date.now()}`,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b9a80' },
      style: { stroke: '#6b9a80', strokeWidth: 2 },
    }, eds));
    setDirty(true);
  }, [setEdges]);

  const addNode = (type: string) => {
    const palette = NODE_PALETTE.find(p => p.type === type)!;
    const id = `${type}_${Date.now()}`;
    const defaultData: Record<string, unknown> =
      type === 'approval'     ? { name: 'New Approval', assignTo: 'manager', sla: { hours: 24 }, allowDelegate: true }
      : type === 'condition'  ? { name: 'New Condition', expression: 'context.amount > 10000' }
      : type === 'notification' ? { name: 'New Notification', template: 'default', channels: ['in_app'] }
      : { name: 'New Delay', delayHours: 1 };

    const newNode: Node = {
      id,
      type: 'workflowNode',
      position: { x: 200 + Math.random() * 250, y: 80 + Math.random() * 200 },
      data: {
        nodeType: type,
        config: defaultData,
        label: defaultData['name'] as string,
        color: palette.color,
        icon: palette.icon,
      },
    };
    setNodes(nds => [...nds, newNode]);
    setSelectedNodeId(id);
    setDirty(true);
  };

  const updateNodeConfig = (nodeId: string, config: Record<string, unknown>) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, config, label: (config['name'] as string) ?? (n.data as Record<string, unknown>)['label'] } }
        : n
    ));
    setDirty(true);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!data?.data) return;
    const def = data.data;
    const graph = flowToGraph(nodes, edges);
    try {
      await updateDef({ id: def.id, data: { name: def.name, description: def.description, graph } }).unwrap();
      toast.success('Workflow saved!');
      setDirty(false);
    } catch {
      toast.error('Save failed');
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const def = data?.data;
  const isReadOnly = def ? def.status !== 'draft' : false;

  if (isLoading) {
    return (
      <div className="designer-loading">
        <div className="loading-spinner" style={{ width: 40, height: 40, border: '3px solid rgba(16,185,129,0.3)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p>Loading workflow…</p>
      </div>
    );
  }

  if (isError || !def) {
    return (
      <div className="designer-loading">
        <p style={{ color: 'var(--error)' }}>Workflow not found or failed to load.</p>
        <button className="designer-btn" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>← Go Back</button>
      </div>
    );
  }

  return (
    <div className="designer-root">
      {/* ── Top Bar ─────────────────────────────── */}
      <div className="designer-topbar">
        <button className="designer-back" onClick={() => navigate('/admin/workflows')}>
          <X size={16} /> Close
        </button>

        <div className="designer-title">
          <span className="designer-title-name">{def.name}</span>
          <span className={`status-badge ${def.status === 'draft' ? 'pending' : def.status === 'active' ? 'active' : 'inactive'}`}>
            {def.status}
          </span>
          {isReadOnly && <span className="designer-readonly-badge">👁 Read-only</span>}
        </div>

        <div className="designer-topbar-actions">
          {dirty && !isReadOnly && <span className="designer-unsaved">● Unsaved changes</span>}
          <button className="designer-btn" onClick={() => setSidebarOpen(o => !o)}>
            <Settings size={15} /> {sidebarOpen ? 'Hide' : 'Show'} Panel
          </button>
          {!isReadOnly && (
            <PermissionGuard permission="workflows-engine.write">
              <button
                className="designer-btn designer-btn-primary"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                <Save size={15} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </PermissionGuard>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────── */}
      <div className="designer-body">

        {/* Left Palette */}
        {!isReadOnly && (
          <div className="designer-palette">
            <div className="designer-palette-title">Add Node</div>
            {NODE_PALETTE.map(p => (
              <button
                key={p.type}
                className="designer-palette-item"
                style={{ '--node-color': p.color } as React.CSSProperties}
                onClick={() => addNode(p.type)}
              >
                <span className="designer-palette-icon">{p.icon}</span>
                <span>{p.label}</span>
                <Plus size={12} className="designer-palette-plus" />
              </button>
            ))}
            <div className="designer-palette-hint">
              <span><ChevronRight size={12} /> Drag nodes to reposition</span>
              <span><ChevronRight size={12} /> Connect handles to link</span>
              <span><ChevronRight size={12} /> Click node to configure</span>
            </div>
          </div>
        )}

        {/* React Flow Canvas */}
        <div className="designer-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={changes => { onNodesChange(changes); }}
            onEdgesChange={changes => { onEdgesChange(changes); }}
            onConnect={isReadOnly ? undefined : onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={RF_NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            deleteKeyCode={isReadOnly ? null : 'Backspace'}
            nodesDraggable={!isReadOnly}
            nodesConnectable={!isReadOnly}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.5}
              color="var(--border)"
            />
            <Controls showInteractive={!isReadOnly} />
            <MiniMap
              nodeColor={n => {
                const t = (n.data as Record<string, unknown>)['nodeType'] as string;
                return NODE_COLORS[t] ?? '#64748b';
              }}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="designer-empty-hint">
                  ← Click a node type in the palette to add it
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Right Config Panel */}
        {sidebarOpen && (
          <div className="designer-sidebar">
            <NodeConfigPanel
              node={selectedNode}
              readOnly={isReadOnly}
              onUpdate={updateNodeConfig}
              onDelete={deleteNode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
