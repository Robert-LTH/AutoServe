import { useEffect, useMemo, useState } from 'react';
import type { Edge, Node } from 'reactflow';
import type { FormNodeData } from '../types';

interface FormRunnerProps {
  nodes: Node<FormNodeData>[];
  edges: Edge[];
  submissionUrl: string;
}

type OutcomeSelection = Record<string, string>;

const mapPayload = (nodes: Node<FormNodeData>[], formState: Record<string, unknown>) => {
  const payload: Record<string, unknown> = {};
  nodes.forEach((node) => {
    node.data.fields.forEach((field) => {
      if (field.label in payload) {
        payload[`${field.label} (${field.id})`] = formState[field.id] ?? null;
      } else {
        payload[field.label] = formState[field.id] ?? null;
      }
    });
  });
  return payload;
};

export default function FormRunner({ nodes, edges, submissionUrl }: FormRunnerProps) {
  const startNodeId = useMemo(() => {
    if (nodes.length === 0) return null;
    const targeted = new Set(edges.map((edge) => edge.target));
    const candidate = nodes.find((node) => !targeted.has(node.id));
    return (candidate ?? nodes[0])?.id ?? null;
  }, [nodes, edges]);

  const [trail, setTrail] = useState<string[]>(startNodeId ? [startNodeId] : []);
  const [formState, setFormState] = useState<Record<string, unknown>>({});
  const [outcomeSelection, setOutcomeSelection] = useState<OutcomeSelection>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (startNodeId) {
      setTrail([startNodeId]);
      setOutcomeSelection({});
      setStatusMessage(null);
    } else {
      setTrail([]);
    }
    setFormState({});
  }, [startNodeId, nodes.length]);

  const activeNodeId = trail[trail.length - 1] ?? null;
  const activeNode = nodes.find((node) => node.id === activeNodeId) ?? null;

  const edgesBySource = useMemo(() => {
    const map = new Map<string, Edge[]>();
    edges.forEach((edge) => {
      const list = map.get(edge.source) ?? [];
      list.push(edge);
      map.set(edge.source, list);
    });
    return map;
  }, [edges]);

  const updateFieldValue = (fieldId: string, value: unknown) => {
    setFormState((current) => ({ ...current, [fieldId]: value }));
  };

  const goBack = () => {
    if (trail.length <= 1) return;
    setTrail((current) => current.slice(0, -1));
    setStatusMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    if (!activeNode) return;

    const missingField = activeNode.data.fields.find((field) => field.required && !formState[field.id]);
    if (missingField) {
      setStatusMessage({ type: 'error', message: `Fältet "${missingField.label}" måste fyllas i.` });
      return;
    }

    const selectedOutcome = outcomeSelection[activeNode.id] ?? activeNode.data.outcomes[0]?.id;
    const nextEdge = selectedOutcome
      ? edgesBySource.get(activeNode.id)?.find((edge) => edge.sourceHandle === selectedOutcome)
      : undefined;

    if (nextEdge) {
      setTrail((current) => [...current, nextEdge.target]);
      return;
    }

    // No next step, send payload
    if (!submissionUrl) {
      setStatusMessage({ type: 'error', message: 'Ingen URL för mottagning av beställningen är definierad.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = mapPayload(nodes, formState);
      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flowId: startNodeId ?? 'flow',
          payload,
          completedSteps: trail,
        }),
      });

      if (!response.ok) {
        throw new Error(`Servern svarade med status ${response.status}`);
      }

      setStatusMessage({ type: 'success', message: 'Beställningen skickades iväg utan problem!' });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Kunde inte skicka beställningen.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeNode) {
    return (
      <section className="form-runner">
        <div className="panel">
          <h2>Ingen aktivt formulär</h2>
          <p>
            Skapa ett flöde i designern och se till att minst en nod saknar inkommande anslutningar för att markeras
            som start.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="form-runner">
      <div className="panel">
        <h2>{activeNode.data.title}</h2>
        {activeNode.data.description ? <p>{activeNode.data.description}</p> : null}
        <form onSubmit={handleSubmit}>
          {activeNode.data.fields.map((field) => {
            const value = formState[field.id] ?? '';
            if (field.type === 'select') {
              return (
                <label key={field.id}>
                  {field.label}
                  <select value={value as string} onChange={(event) => updateFieldValue(field.id, event.target.value)}>
                    <option value="">Välj...</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            return (
              <label key={field.id}>
                {field.label}
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={value as string | number}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    updateFieldValue(field.id, field.type === 'number' ? Number(event.target.value) : event.target.value)
                  }
                />
              </label>
            );
          })}

          {activeNode.data.outcomes.length > 1 ? (
            <label>
              Nästa steg
              <select
                value={outcomeSelection[activeNode.id] ?? activeNode.data.outcomes[0]?.id ?? ''}
                onChange={(event) =>
                  setOutcomeSelection((current) => ({ ...current, [activeNode.id]: event.target.value }))
                }
              >
                {activeNode.data.outcomes.map((outcome) => (
                  <option key={outcome.id} value={outcome.id}>
                    {outcome.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="runner-actions">
            <button className="secondary" type="button" onClick={goBack} disabled={trail.length <= 1}>
              Tillbaka
            </button>
            <button className="primary" type="submit" disabled={isSubmitting}>
              {edgesBySource.get(activeNode.id)?.length ? 'Fortsätt' : 'Skicka beställning'}
            </button>
          </div>
        </form>
        {statusMessage ? (
          <div className="status-message" style={{ background: statusMessage.type === 'error' ? '#fee2e2' : '#dcfce7', borderColor: statusMessage.type === 'error' ? '#ef4444' : '#16a34a' }}>
            {statusMessage.message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
