import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';

interface Props {
  node: Node | undefined;
  readOnly: boolean;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
}

const CHANNELS = ['in_app', 'email', 'sms', 'push'];
const ASSIGN_OPTIONS = [
  { value: 'initiator', label: 'Initiator (self)' },
  { value: 'manager',   label: 'Manager' },
  { value: 'role',      label: 'By Role' },
  { value: 'specific',  label: 'Specific User' },
];

export function NodeConfigPanel({ node, readOnly, onUpdate, onDelete }: Props) {
  if (!node) {
    return (
      <div className="config-empty">
        <div className="config-empty-icon">⚙️</div>
        <p>Select a node to configure it</p>
        <p className="config-hint">Click any node on the canvas</p>
      </div>
    );
  }

  const d = node.data as { nodeType: string; label: string; config: Record<string, unknown> };
  const config = d.config ?? {};
  const nodeType = d.nodeType;
  const isFixed = nodeType === 'start' || nodeType === 'end';

  const set = (partial: Record<string, unknown>) => {
    onUpdate(node.id, { ...config, ...partial });
  };

  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <span className="config-panel-title">
          {nodeType === 'start' ? '▶ Start' : nodeType === 'end' ? '⏹ End'
            : nodeType === 'approval' ? '✅ Approval' : nodeType === 'condition' ? '🔀 Condition'
            : nodeType === 'notification' ? '🔔 Notification' : '⏱ Delay'}
        </span>
        {!isFixed && !readOnly && (
          <button className="config-delete-btn" onClick={() => onDelete(node.id)} title="Delete node">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {isFixed ? (
        <div className="config-fixed-note">
          {nodeType === 'start' ? 'Workflow entry point — cannot be removed.' : 'Workflow termination point — cannot be removed.'}
        </div>
      ) : (
        <div className="config-fields">
          {/* Common: Name */}
          <div className="config-field">
            <label>Name</label>
            <input
              className="config-input"
              value={(config.name as string) ?? ''}
              disabled={readOnly}
              placeholder="Node name"
              onChange={e => set({ name: e.target.value })}
            />
          </div>

          {/* Approval */}
          {nodeType === 'approval' && (
            <>
              <div className="config-field">
                <label>Assign To</label>
                <select className="config-input" value={(config.assignTo as string) ?? 'manager'}
                  disabled={readOnly} onChange={e => set({ assignTo: e.target.value })}>
                  {ASSIGN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="config-row">
                <div className="config-field">
                  <label>SLA (hours)</label>
                  <input type="number" className="config-input" min={1}
                    value={(config.sla as { hours: number })?.hours ?? 24}
                    disabled={readOnly}
                    onChange={e => set({ sla: { ...(config.sla as object ?? {}), hours: +e.target.value } })}
                  />
                </div>
                <div className="config-field">
                  <label>Escalate To</label>
                  <input className="config-input"
                    value={(config.sla as { escalateTo?: string })?.escalateTo ?? ''}
                    disabled={readOnly} placeholder="Role / user ID"
                    onChange={e => set({ sla: { ...(config.sla as object ?? {}), escalateTo: e.target.value } })}
                  />
                </div>
              </div>
              <label className="config-checkbox">
                <input type="checkbox" disabled={readOnly}
                  checked={Boolean(config.allowDelegate)}
                  onChange={e => set({ allowDelegate: e.target.checked })}
                />
                Allow delegation
              </label>
              <label className="config-checkbox">
                <input type="checkbox" disabled={readOnly}
                  checked={Boolean(config.parallel)}
                  onChange={e => set({ parallel: e.target.checked })}
                />
                Parallel (multi-approver)
              </label>
            </>
          )}

          {/* Condition */}
          {nodeType === 'condition' && (
            <>
              <div className="config-field">
                <label>Expression (JS)</label>
                <textarea className="config-input config-textarea" rows={4}
                  value={(config.expression as string) ?? ''}
                  disabled={readOnly}
                  placeholder="e.g. context.amount > 50000"
                  onChange={e => set({ expression: e.target.value })}
                />
                <span className="config-hint">Use <code>context.*</code> fields. Must return boolean.</span>
              </div>
              <div className="config-row">
                <div className="config-field">
                  <label style={{ color: '#22c55e' }}>True → Edge label</label>
                  <input className="config-input" value={(config.trueEdge as string) ?? 'Yes'}
                    disabled={readOnly} onChange={e => set({ trueEdge: e.target.value })} />
                </div>
                <div className="config-field">
                  <label style={{ color: '#ef4444' }}>False → Edge label</label>
                  <input className="config-input" value={(config.falseEdge as string) ?? 'No'}
                    disabled={readOnly} onChange={e => set({ falseEdge: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {/* Notification */}
          {nodeType === 'notification' && (
            <>
              <div className="config-field">
                <label>Template Code</label>
                <input className="config-input" value={(config.template as string) ?? ''}
                  disabled={readOnly} placeholder="e.g. task_approved"
                  onChange={e => set({ template: e.target.value })} />
              </div>
              <div className="config-field">
                <label>Channels</label>
                <div className="config-channels">
                  {CHANNELS.map(ch => (
                    <label key={ch} className="config-checkbox">
                      <input type="checkbox" disabled={readOnly}
                        checked={((config.channels as string[]) ?? []).includes(ch)}
                        onChange={e => {
                          const cur = (config.channels as string[]) ?? [];
                          set({ channels: e.target.checked ? [...cur, ch] : cur.filter(c => c !== ch) });
                        }} />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>
              <div className="config-field">
                <label>Recipients</label>
                <input className="config-input" placeholder="e.g. initiator, manager"
                  disabled={readOnly}
                  value={((config.recipients as string[]) ?? []).join(', ')}
                  onChange={e => set({ recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
              </div>
            </>
          )}

          {/* Delay */}
          {nodeType === 'delay' && (
            <div className="config-field">
              <label>Delay Duration (hours)</label>
              <input type="number" className="config-input" min={0.5} step={0.5}
                value={(config.delayHours as number) ?? 1}
                disabled={readOnly}
                onChange={e => set({ delayHours: +e.target.value })} />
            </div>
          )}
        </div>
      )}

      {/* Node ID footer */}
      <div className="config-footer">
        ID: <code>{node.id}</code>
      </div>
    </div>
  );
}
