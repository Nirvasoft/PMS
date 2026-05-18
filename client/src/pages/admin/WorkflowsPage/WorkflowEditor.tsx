import { useState } from 'react';
import {
  useUpdateDefinitionMutation,
  type WorkflowDefinition, type GraphNode, type GraphEdge,
} from '../../../store/api/workflowApi';
import toast from 'react-hot-toast';

const NODE_TYPES = [
  { type: 'approval', label: '✅ Approval', color: '#3b82f6' },
  { type: 'condition', label: '🔀 Condition', color: '#f59e0b' },
  { type: 'notification', label: '🔔 Notification', color: '#8b5cf6' },
  { type: 'delay', label: '⏱ Delay', color: '#6b7280' },
];

const NODE_SHAPES: Record<string, { icon: string; color: string }> = {
  start: { icon: '▶', color: '#22c55e' },
  end: { icon: '⏹', color: '#ef4444' },
  approval: { icon: '✅', color: '#3b82f6' },
  condition: { icon: '🔀', color: '#f59e0b' },
  notification: { icon: '🔔', color: '#8b5cf6' },
  delay: { icon: '⏱', color: '#6b7280' },
};

interface Props {
  definition: WorkflowDefinition;
  onClose: () => void;
}

export default function WorkflowEditor({ definition, onClose }: Props) {
  const [updateDef, { isLoading }] = useUpdateDefinitionMutation();
  const [name, setName] = useState(definition.name);
  const [description, setDescription] = useState(definition.description || '');
  const [nodes, setNodes] = useState<GraphNode[]>(definition.graph.nodes);
  const [edges, setEdges] = useState<GraphEdge[]>(definition.graph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const isReadOnly = definition.status !== 'draft';

  const mark = () => setDirty(true);

  /* ── Node operations ── */
  const addNode = (type: string) => {
    const id = `${type}_${Date.now()}`;
    const newNode: GraphNode = {
      id, type,
      data: type === 'approval' ? { name: 'New Approval', assignTo: 'initiator', sla: { hours: 24 }, allowDelegate: true }
        : type === 'condition' ? { name: 'New Condition', expression: 'context.amount > 10000' }
        : type === 'notification' ? { name: 'New Notification', template: 'default', channels: ['in_app'] }
        : type === 'delay' ? { name: 'New Delay', delayHours: 1 }
        : {},
    };
    // Insert before end node
    const endIdx = nodes.findIndex(n => n.type === 'end');
    const updated = [...nodes];
    if (endIdx >= 0) updated.splice(endIdx, 0, newNode);
    else updated.push(newNode);
    setNodes(updated);

    // Auto-wire: find the node before this one and the end node, insert edges
    if (endIdx >= 1) {
      const prevNode = updated[endIdx - 1]; // node before the newly inserted one
      // Remove old edge from prevNode -> end
      const newEdges = edges.filter(e => !(e.source === prevNode.id && e.target === 'end'));
      // Add prevNode -> newNode -> end
      newEdges.push({ id: `e_${prevNode.id}_${id}`, source: prevNode.id, target: id });
      newEdges.push({ id: `e_${id}_end`, source: id, target: 'end' });
      setEdges(newEdges);
    }
    setSelectedNodeId(id);
    mark();
  };

  const removeNode = (nodeId: string) => {
    if (nodeId === 'start' || nodeId === 'end') return;
    // Find incoming and outgoing edges
    const incoming = edges.filter(e => e.target === nodeId);
    const outgoing = edges.filter(e => e.source === nodeId);
    // Remove edges connected to this node
    let newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    // Re-wire: connect each incoming source to each outgoing target
    for (const inc of incoming) {
      for (const out of outgoing) {
        newEdges.push({ id: `e_${inc.source}_${out.target}`, source: inc.source, target: out.target });
      }
    }
    setEdges(newEdges);
    setNodes(nodes.filter(n => n.id !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    mark();
  };

  const updateNodeData = (nodeId: string, updates: Record<string, unknown>) => {
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
    mark();
  };

  /* ── Edge operations ── */
  const removeEdge = (edgeId: string) => {
    setEdges(edges.filter(e => e.id !== edgeId));
    mark();
  };

  const addEdge = (source: string, target: string) => {
    if (edges.some(e => e.source === source && e.target === target)) return;
    setEdges([...edges, { id: `e_${source}_${target}`, source, target }]);
    mark();
  };

  /* ── Save ── */
  const handleSave = async () => {
    try {
      await updateDef({
        id: definition.id,
        data: { name, description, graph: { nodes, edges } },
      }).unwrap();
      toast.success('Workflow saved!');
      setDirty(false);
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Save failed');
    }
  };

  /* ── Build flow chain for preview ── */
  const buildChain = (): GraphNode[] => {
    const chain: GraphNode[] = [];
    const visited = new Set<string>();
    let current = 'start';
    while (current && !visited.has(current)) {
      visited.add(current);
      const node = nodes.find(n => n.id === current);
      if (node) chain.push(node);
      const next = edges.find(e => e.source === current);
      current = next?.target || '';
    }
    return chain;
  };

  const flowChain = buildChain();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 960, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header">
          <h2>
            {isReadOnly ? '👁 View' : '✏️ Edit'} Workflow
            <span className={`status-badge ${definition.status === 'draft' ? 'pending' : definition.status === 'active' ? 'active' : 'inactive'}`}
              style={{ marginLeft: 12, fontSize: 12 }}>{definition.status}</span>
          </h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
          {/* Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div className="form-group">
              <label>Name *</label>
              <input className="input-full" value={name} disabled={isReadOnly}
                onChange={e => { setName(e.target.value); mark(); }} />
            </div>
            <div className="form-group">
              <label>Entity Type</label>
              <input className="input-full" value={definition.entityType} disabled />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input className="input-full" value={description} disabled={isReadOnly}
                onChange={e => { setDescription(e.target.value); mark(); }} />
            </div>
          </div>

          {/* Visual Flow Preview */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Flow Preview</label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0, padding: 16,
              background: 'var(--surface-elevated)', borderRadius: 12, overflowX: 'auto',
            }}>
              {flowChain.map((node, i) => {
                const shape = NODE_SHAPES[node.type] || { icon: '?', color: '#888' };
                const isSelected = selectedNodeId === node.id;
                return (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${isSelected ? shape.color : 'transparent'}`,
                        background: isSelected ? `${shape.color}15` : 'transparent',
                        transition: 'all 0.15s',
                        minWidth: 80,
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: node.type === 'condition' ? 8 : '50%',
                        background: shape.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: '#fff', transform: node.type === 'condition' ? 'rotate(45deg)' : undefined,
                      }}>
                        <span style={{ transform: node.type === 'condition' ? 'rotate(-45deg)' : undefined }}>{shape.icon}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.data?.name || node.type}
                      </span>
                    </div>
                    {i < flowChain.length - 1 && (
                      <div style={{ width: 32, height: 2, background: 'var(--border)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', position: 'absolute', top: -12 }}>→</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Node Buttons */}
          {!isReadOnly && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Add Node</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {NODE_TYPES.map(nt => (
                  <button key={nt.type} className="btn btn-sm"
                    style={{ borderColor: nt.color, color: nt.color }}
                    onClick={() => addNode(nt.type)}>
                    + {nt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Node List + Config Panel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Left: Node list */}
            <div>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Nodes ({nodes.length})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {nodes.map(node => {
                  const shape = NODE_SHAPES[node.type] || { icon: '?', color: '#888' };
                  const isSelected = selectedNodeId === node.id;
                  return (
                    <div key={node.id}
                      onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8, cursor: 'pointer',
                        background: isSelected ? `${shape.color}18` : 'var(--surface-elevated)',
                        border: `1px solid ${isSelected ? shape.color : 'var(--border-subtle)'}`,
                      }}>
                      <span style={{ fontSize: 16 }}>{shape.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{node.data?.name || node.type}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{node.type} · {node.id.slice(0, 16)}</div>
                      </div>
                      {!isReadOnly && node.type !== 'start' && node.type !== 'end' && (
                        <button className="btn-icon" style={{ fontSize: 14 }}
                          onClick={e => { e.stopPropagation(); removeNode(node.id); }}>🗑</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Edges */}
              <label style={{ fontWeight: 600, marginTop: 16, marginBottom: 8, display: 'block' }}>Edges ({edges.length})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {edges.map(edge => {
                  const srcNode = nodes.find(n => n.id === edge.source);
                  const tgtNode = nodes.find(n => n.id === edge.target);
                  return (
                    <div key={edge.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                      borderRadius: 8, background: 'var(--surface-elevated)', fontSize: 12,
                    }}>
                      <span style={{ flex: 1 }}>
                        {srcNode?.data?.name || edge.source} → {tgtNode?.data?.name || edge.target}
                      </span>
                      {edge.label && <span className="role-chip" style={{ fontSize: 10 }}>{edge.label}</span>}
                      {!isReadOnly && (
                        <button className="btn-icon" style={{ fontSize: 12 }}
                          onClick={() => removeEdge(edge.id)}>✕</button>
                      )}
                    </div>
                  );
                })}
                {/* Add Edge */}
                {!isReadOnly && <AddEdgeRow nodes={nodes} edges={edges} onAdd={addEdge} />}
              </div>
            </div>

            {/* Right: Node Config Panel */}
            <div>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>
                {selectedNode ? `Configure: ${selectedNode.data?.name || selectedNode.type}` : 'Select a node'}
              </label>
              {selectedNode ? (
                <NodeConfigPanel node={selectedNode} readOnly={isReadOnly} onChange={(updates) => updateNodeData(selectedNode.id, updates)} />
              ) : (
                <div className="info-card" style={{ padding: 24, textAlign: 'center' }}>
                  <p className="text-muted">Click on a node in the flow preview or list to configure it.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-actions" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn" onClick={onClose}>Close</button>
          {!isReadOnly && (
            <button className="btn btn-primary" onClick={handleSave} disabled={isLoading || !dirty}>
              {isLoading ? '💾 Saving...' : dirty ? '💾 Save Changes' : '✓ Saved'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Node Config Panel ── */
function NodeConfigPanel({ node, readOnly, onChange }: { node: GraphNode; readOnly: boolean; onChange: (u: Record<string, unknown>) => void }) {
  const d = node.data || {};

  if (node.type === 'start' || node.type === 'end') {
    return (
      <div className="info-card" style={{ padding: 20 }}>
        <p className="text-muted">{node.type === 'start' ? 'Start node — workflow begins here.' : 'End node — workflow completes here.'}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface-elevated)', padding: 16, borderRadius: 12 }}>
      <div className="form-group">
        <label>Name</label>
        <input className="input-full" value={d.name || ''} disabled={readOnly}
          onChange={e => onChange({ name: e.target.value })} />
      </div>

      {node.type === 'approval' && (
        <>
          <div className="form-group">
            <label>Assign To</label>
            <select className="input-full" value={d.assignTo || 'initiator'} disabled={readOnly}
              onChange={e => onChange({ assignTo: e.target.value })}>
              <option value="initiator">Initiator (self)</option>
              <option value="manager">Manager</option>
              <option value="role">By Role</option>
              <option value="specific">Specific User</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label>SLA (hours)</label>
              <input type="number" className="input-full" value={d.sla?.hours ?? 24} disabled={readOnly}
                onChange={e => onChange({ sla: { ...d.sla, hours: +e.target.value } })} />
            </div>
            <div className="form-group">
              <label>Escalate To</label>
              <input className="input-full" value={d.sla?.escalateTo || ''} disabled={readOnly}
                placeholder="Role or user ID"
                onChange={e => onChange({ sla: { ...d.sla, escalateTo: e.target.value } })} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={d.allowDelegate ?? false} disabled={readOnly}
              onChange={e => onChange({ allowDelegate: e.target.checked })} />
            Allow delegation
          </label>
        </>
      )}

      {node.type === 'condition' && (
        <div className="form-group">
          <label>Expression (JS)</label>
          <textarea className="input-full" rows={3} value={d.expression || ''} disabled={readOnly}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
            placeholder="e.g. context.amount > 50000"
            onChange={e => onChange({ expression: e.target.value })} />
          <p className="text-small text-muted" style={{ marginTop: 4 }}>
            Use <code>context.*</code> to reference entity data. Must return boolean.
          </p>
        </div>
      )}

      {node.type === 'notification' && (
        <>
          <div className="form-group">
            <label>Template</label>
            <input className="input-full" value={d.template || ''} disabled={readOnly}
              onChange={e => onChange({ template: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Channels</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['in_app', 'email', 'sms', 'push'].map(ch => (
                <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: readOnly ? 'default' : 'pointer' }}>
                  <input type="checkbox" disabled={readOnly}
                    checked={(d.channels || []).includes(ch)}
                    onChange={e => {
                      const cur = d.channels || [];
                      onChange({ channels: e.target.checked ? [...cur, ch] : cur.filter((c: string) => c !== ch) });
                    }} />
                  {ch}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {node.type === 'delay' && (
        <div className="form-group">
          <label>Delay (hours)</label>
          <input type="number" className="input-full" value={d.delayHours ?? 1} disabled={readOnly}
            onChange={e => onChange({ delayHours: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

/* ── Add Edge Row ── */
function AddEdgeRow({ nodes, edges, onAdd }: { nodes: GraphNode[]; edges: GraphEdge[]; onAdd: (s: string, t: string) => void }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
      <select className="input-full" style={{ fontSize: 12 }} value={source} onChange={e => setSource(e.target.value)}>
        <option value="">From...</option>
        {nodes.filter(n => n.type !== 'end').map(n => (
          <option key={n.id} value={n.id}>{n.data?.name || n.id}</option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
      <select className="input-full" style={{ fontSize: 12 }} value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">To...</option>
        {nodes.filter(n => n.type !== 'start').map(n => (
          <option key={n.id} value={n.id}>{n.data?.name || n.id}</option>
        ))}
      </select>
      <button className="btn btn-sm btn-primary" disabled={!source || !target || source === target}
        onClick={() => { onAdd(source, target); setSource(''); setTarget(''); }}>+</button>
    </div>
  );
}
