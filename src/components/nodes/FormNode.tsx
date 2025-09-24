import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FormNodeData } from '../../types';

const handleStyle = { width: 12, height: 12, borderRadius: 999, border: '2px solid white' } as const;

function FormNodeComponent({ data, selected }: NodeProps<FormNodeData>) {
  const fieldsWithExternalData = data.fields.filter((field) => field.externalDataUrl?.trim());
  const hasExternalData = fieldsWithExternalData.length > 0;

  return (
    <div className={`form-node ${selected ? 'selected' : ''} ${data.variant === 'decision-step' ? 'decision' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#0f172a' }} />
      {hasExternalData ? (
        <>
          <Handle
            type="target"
            id="external-data"
            position={Position.Left}
            style={{ ...handleStyle, background: '#475569', top: '50%' }}
          />
          <span className="data-handle-label">Extern data</span>
        </>
      ) : null}
      <h3>{data.title}</h3>
      {data.description ? <p>{data.description}</p> : null}
      {hasExternalData ? (
        <div className="form-node-external">
          <strong>Extern data</strong>
          <ul>
            {fieldsWithExternalData.map((field) => (
              <li key={field.id}>
                {field.label}: <span>{field.externalDataUrl}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.fields.length > 0 ? (
        <div className="fields">
          <strong>Fält:</strong>
          <ul style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
            {data.fields.map((field) => (
              <li key={field.id}>
                {field.label} ({field.type}){field.required ? ' *' : ''}
                {field.externalDataUrl ? <span className="field-chip">Extern</span> : null}
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
