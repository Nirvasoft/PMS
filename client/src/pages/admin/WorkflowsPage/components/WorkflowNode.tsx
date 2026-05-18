import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const NODE_COLORS: Record<string, string> = {
  start:        '#22c55e',
  end:          '#ef4444',
  approval:     '#3b82f6',
  condition:    '#f59e0b',
  notification: '#8b5cf6',
  delay:        '#6b7280',
};

const NODE_ICONS: Record<string, string> = {
  start: '▶', end: '⏹',
  approval: '✅', condition: '🔀',
  notification: '🔔', delay: '⏱',
};

export const WorkflowNode = memo(({ data, selected }: NodeProps) => {
  const d = data as { nodeType: string; label: string; config: Record<string, unknown> };
  const color = NODE_COLORS[d.nodeType] ?? '#64748b';
  const icon  = NODE_ICONS[d.nodeType]  ?? '?';
  const isStart = d.nodeType === 'start';
  const isEnd   = d.nodeType === 'end';
  const isCondition = d.nodeType === 'condition';

  return (
    <div
      style={{
        background: 'var(--surface-elevated)',
        border: `2px solid ${selected ? color : 'var(--border)'}`,
        borderRadius: isCondition ? '50%' : 12,
        padding: isCondition ? 0 : '10px 16px',
        width: isCondition ? 90 : 160,
        height: isCondition ? 90 : 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        boxShadow: selected
          ? `0 0 0 3px ${color}40, 0 8px 24px rgba(0,0,0,0.3)`
          : '0 4px 12px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        transform: isCondition ? 'rotate(45deg)' : undefined,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        minWidth: isCondition ? undefined : 160,
        position: 'relative',
      }}
    >
      {/* Inner content — counter-rotate for diamond */}
      <div style={{ transform: isCondition ? 'rotate(-45deg)' : undefined, textAlign: 'center', width: '100%' }}>
        {/* Colored circle/badge */}
        <div style={{
          width: isStart || isEnd ? 48 : 36,
          height: isStart || isEnd ? 48 : 36,
          borderRadius: '50%',
          background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 4px',
          fontSize: isStart || isEnd ? 20 : 16,
          boxShadow: `0 0 0 4px ${color}25`,
        }}>
          {icon}
        </div>

        {!isStart && !isEnd && (
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: 'var(--text-primary)',
            maxWidth: 130, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}>
            {d.label || d.nodeType}
          </div>
        )}

        {/* Type badge */}
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
          color: color, textTransform: 'uppercase',
          marginTop: 2,
        }}>
          {d.nodeType}
        </div>

        {/* SLA badge for approval */}
        {d.nodeType === 'approval' && d.config?.sla && (
          <div style={{
            fontSize: 9, background: `${color}20`, color: color,
            borderRadius: 4, padding: '1px 6px', marginTop: 4, display: 'inline-block',
          }}>
            ⏱ {(d.config.sla as { hours: number }).hours}h SLA
          </div>
        )}
      </div>

      {/* Handles */}
      {!isStart && (
        <Handle type="target" position={isCondition ? Position.Left : Position.Left}
          style={{ background: color, width: 10, height: 10, border: '2px solid var(--surface-elevated)' }} />
      )}
      {!isEnd && (
        <Handle type="source" position={isCondition ? Position.Right : Position.Right}
          style={{ background: color, width: 10, height: 10, border: '2px solid var(--surface-elevated)' }} />
      )}
      {/* Condition gets top/bottom handles for true/false */}
      {isCondition && (
        <>
          <Handle id="true" type="source" position={Position.Bottom}
            style={{ background: '#22c55e', width: 10, height: 10, border: '2px solid var(--surface-elevated)' }} />
          <Handle id="false" type="source" position={Position.Top}
            style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid var(--surface-elevated)' }} />
        </>
      )}
    </div>
  );
});
WorkflowNode.displayName = 'WorkflowNode';
