import { useEffect, useMemo, useState } from 'react';
import type { Edge, Node } from 'reactflow';
import type { FormField, FormNodeData } from '../types';
import { loadExternalData, processExternalData } from '../utils/externalData';

interface FormRunnerProps {
  nodes: Node<FormNodeData>[];
  edges: Edge[];
  submissionUrl: string;
}

type OutcomeSelection = Record<string, string>;

type ExternalNodeState =
  | { status: 'idle' }
  | { status: 'loading'; url: string }
  | { status: 'error'; url: string; error: string }
  | {
      status: 'success';
      url: string;
      raw: unknown;
      selectOptions: Record<string, string[]>;
      initialValues: Record<string, unknown>;
      appliedInitialValues: boolean;
      isFallback: boolean;
    };

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

const areOptionRecordsEqual = (a: Record<string, string[]>, b: Record<string, string[]>) => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => {
    const optionsA = a[key];
    const optionsB = b[key];
    if (!optionsB || optionsA.length !== optionsB.length) return false;
    return optionsA.every((value, index) => value === optionsB[index]);
  });
};

const areInitialValueRecordsEqual = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => b[key] === a[key]);
};

const hasFilledValue = (field: FormField, value: unknown) => {
  if (value === undefined || value === null) {
    return false;
  }

  if (field.type === 'number') {
    return typeof value === 'number' && !Number.isNaN(value);
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return true;
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
  const [externalStates, setExternalStates] = useState<Record<string, ExternalNodeState>>({});

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
  const activeExternalState = activeNode ? externalStates[activeNode.id] : undefined;

  const edgesBySource = useMemo(() => {
    const map = new Map<string, Edge[]>();
    edges.forEach((edge) => {
      const list = map.get(edge.source) ?? [];
      list.push(edge);
      map.set(edge.source, list);
    });
    return map;
  }, [edges]);

  useEffect(() => {
    if (!activeNode) return;

    const url = activeNode.data.externalDataUrl?.trim();
    if (!url) {
      setExternalStates((current) => {
        if (!(activeNode.id in current)) return current;
        const { [activeNode.id]: _removed, ...rest } = current;
        return rest;
      });
      return;
    }

    setExternalStates((current) => {
      const existing = current[activeNode.id];
      if (existing && existing.status === 'success' && existing.url === url) {
        return current;
      }
      if (existing && existing.status === 'loading' && existing.url === url) {
        return current;
      }
      return {
        ...current,
        [activeNode.id]: { status: 'loading', url },
      };
    });

    const controller = new AbortController();

    (async () => {
      try {
        const { payload, isFallback } = await loadExternalData(url, controller.signal);
        const processed = processExternalData(payload, activeNode.data.fields);
        setExternalStates((current) => ({
          ...current,
          [activeNode.id]: {
            status: 'success',
            url,
            raw: payload,
            selectOptions: processed.selectOptions,
            initialValues: processed.initialValues,
            appliedInitialValues: false,
            isFallback,
          },
        }));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setExternalStates((current) => ({
          ...current,
          [activeNode.id]: {
            status: 'error',
            url,
            error: error instanceof Error ? error.message : 'Kunde inte läsa extern data.',
          },
        }));
      }
    })();

    return () => controller.abort();
  }, [activeNode?.id, activeNode?.data.externalDataUrl]);

  useEffect(() => {
    if (!activeNode) return;

    setExternalStates((current) => {
      const state = current[activeNode.id];
      if (!state || state.status !== 'success') return current;

      const processed = processExternalData(state.raw, activeNode.data.fields);
      const sameOptions = areOptionRecordsEqual(state.selectOptions, processed.selectOptions);
      const sameInitials = areInitialValueRecordsEqual(state.initialValues, processed.initialValues);

      if (sameOptions && sameInitials) {
        return current;
      }

      return {
        ...current,
        [activeNode.id]: {
          ...state,
          selectOptions: processed.selectOptions,
          initialValues: processed.initialValues,
          appliedInitialValues: false,
        },
      };
    });
  }, [activeNode?.id, activeNode?.data.fields]);

  useEffect(() => {
    if (!activeNode) return;
    if (!activeExternalState || activeExternalState.status !== 'success' || activeExternalState.appliedInitialValues) {
      return;
    }

    const fieldIds = Object.keys(activeExternalState.initialValues);
    if (fieldIds.length === 0) {
      setExternalStates((current) => {
        const state = current[activeNode.id];
        if (!state || state.status !== 'success' || state.appliedInitialValues) return current;
        return {
          ...current,
          [activeNode.id]: { ...state, appliedInitialValues: true },
        };
      });
      return;
    }

    setFormState((current) => {
      let changed = false;
      const next = { ...current };
      activeNode.data.fields.forEach((field) => {
        const initial = activeExternalState.initialValues[field.id];
        if (initial === undefined) return;
        if (!hasFilledValue(field, current[field.id])) {
          next[field.id] = initial;
          changed = true;
        }
      });
      return changed ? next : current;
    });

    setExternalStates((current) => {
      const state = current[activeNode.id];
      if (!state || state.status !== 'success' || state.appliedInitialValues) return current;
      return {
        ...current,
        [activeNode.id]: { ...state, appliedInitialValues: true },
      };
    });
  }, [activeNode, activeExternalState, setFormState]);

  useEffect(() => {
    if (!activeNode) return;
    if (!activeExternalState || activeExternalState.status !== 'success') return;

    const optionsByField = activeExternalState.selectOptions;
    const hasOptions = Object.keys(optionsByField).length > 0;
    if (!hasOptions) return;

    setFormState((current) => {
      let changed = false;
      const next = { ...current };
      activeNode.data.fields.forEach((field) => {
        if (field.type !== 'select') return;
        const options = optionsByField[field.id];
        if (!options || options.length === 0) return;
        const currentValue = current[field.id];
        if (currentValue === undefined || currentValue === null || currentValue === '') {
          return;
        }
        if (!options.includes(String(currentValue))) {
          next[field.id] = '';
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [activeNode, activeExternalState, setFormState]);

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

    const missingField = activeNode.data.fields.find(
      (field) => field.required && !hasFilledValue(field, formState[field.id])
    );
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

        {activeExternalState?.status === 'loading' ? (
          <div className="external-data-banner info">
            Laddar extern data från {activeExternalState.url}...
          </div>
        ) : null}

        {activeExternalState?.status === 'error' ? (
          <div className="external-data-banner error">
            Kunde inte hämta data från {activeExternalState.url}: {activeExternalState.error}
          </div>
        ) : null}

        {activeExternalState?.status === 'success' && activeExternalState.isFallback ? (
          <div className="external-data-banner info">
            Använder demonstrationsdata från {activeExternalState.url} eftersom källan inte svarade.
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          {activeNode.data.fields.map((field) => {
            const storedValue = formState[field.id];

            if (field.type === 'select') {
              const externalOptions =
                activeExternalState?.status === 'success' ? activeExternalState.selectOptions[field.id] : undefined;
              const options = externalOptions && externalOptions.length > 0 ? externalOptions : field.options ?? [];
              const value = typeof storedValue === 'string' ? storedValue : storedValue != null ? String(storedValue) : '';

              return (
                <label key={field.id}>
                  {field.label}
                  <select value={value} onChange={(event) => updateFieldValue(field.id, event.target.value)}>
                    <option value="">Välj...</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            const value =
              typeof storedValue === 'number' || typeof storedValue === 'string' ? storedValue : '';

            return (
              <label key={field.id}>
                {field.label}
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={value as number | string}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    updateFieldValue(field.id, field.type === 'number' ? (nextValue === '' ? '' : Number(nextValue)) : nextValue);
                  }}
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
          <div
            className="status-message"
            style={{ background: statusMessage.type === 'error' ? '#fee2e2' : '#dcfce7', borderColor: statusMessage.type === 'error' ? '#ef4444' : '#16a34a' }}
          >
            {statusMessage.message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
