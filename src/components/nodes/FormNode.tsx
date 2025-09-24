import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FormNodeData } from '../../types';

const handleStyle = { width: 12, height: 12, borderRadius: 999, border: '2px solid white' } as const;

function FormNodeComponent({ data, selected }: NodeProps<FormNodeData>) {
  return (
    <div className={`form-node ${selected ? 'selected' : ''} ${data.variant === 'decision-step' ? 'decision' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#0f172a' }} />
      <Handle
        type="target"
        id="external-data"
        position={Position.Left}
        style={{ ...handleStyle, background: '#475569', top: '50%' }}
      />
      <span className="data-handle-label">Extern data</span>
      <h3>{data.title}</h3>
      {data.description ? <p>{data.description}</p> : null}
      {data.externalDataUrl ? (
        <p style={{ fontSize: '0.75rem', color: '#0f172a', marginTop: '0.35rem' }}>
          Kopplad mot <strong>{data.externalDataUrl}</strong>
        </p>
      ) : null}
      {data.fields.length > 0 ? (
        <div className="fields">
          <strong>Fält:</strong>
          <ul style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
            {data.fields.map((field) => (
              <li key={field.id}>
                {field.label} ({field.type}){field.required ? ' *' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#475569' }}>
          Lägg till fält via konfigurationspanelen.
        </p>
      )}
      {data.outcomes.map((outcome, index) => {
        const top = 80 + index * 30;
        return (
          <div key={outcome.id} style={{ position: 'relative', height: 0 }}>
            <Handle
              type="source"
              id={outcome.id}
              position={Position.Right}
              style={{ ...handleStyle, background: '#2563eb', top }}
            />
            <span className="outcome-label" style={{ top }}>{outcome.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default memo(FormNodeComponent);
