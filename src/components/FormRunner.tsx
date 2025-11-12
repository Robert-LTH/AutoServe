import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { Edge, Node } from 'reactflow';
import type { FormField, FormNodeData, SelectOption } from '../types';
import { buildAuthenticatedRequestInit, loadExternalData, processExternalData } from '../utils/externalData';

interface FormRunnerProps {
  nodes: Node<FormNodeData>[];
  edges: Edge[];
  submissionUrl: string;
}

type OutcomeSelection = Record<string, string>;

const createAuthSignature = (authentication: FormNodeData['authentication']) =>
  JSON.stringify(authentication);

type LoadingExternalFieldState = { status: 'loading'; url: string; authSignature: string };
type ErrorExternalFieldState = { status: 'error'; url: string; error: string; authSignature: string };
type SuccessExternalFieldState = {
  status: 'success';
  url: string;
  authSignature: string;
  raw: unknown;
  selectOptions: SelectOption[];
  initialValue: unknown;
  appliedInitialValue: boolean;
  isFallback: boolean;
};

type ExternalFieldState =
  | LoadingExternalFieldState
  | ErrorExternalFieldState
  | SuccessExternalFieldState;

type FieldStateEntry = { field: FormField; state?: ExternalFieldState };

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

const areSelectOptionArraysEqual = (a: SelectOption[], b: SelectOption[]) => {
  if (a.length !== b.length) return false;
  return a.every((option, index) => {
    const other = b[index];
    return other && option.value === other.value && option.label === other.label;
  });
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

const isLoadingState = (state?: ExternalFieldState): state is LoadingExternalFieldState =>
  state?.status === 'loading';

const isErrorState = (state?: ExternalFieldState): state is ErrorExternalFieldState =>
  state?.status === 'error';

const isSuccessState = (state?: ExternalFieldState): state is SuccessExternalFieldState =>
  state?.status === 'success';

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
  const [statusMessage, setStatusMessage] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [externalFieldStates, setExternalFieldStates] = useState<
    Record<string, ExternalFieldState>
  >({});

  useEffect(() => {
    if (startNodeId) {
      setTrail([startNodeId]);
      setOutcomeSelection({});
      setStatusMessage(null);
    } else {
      setTrail([]);
    }
    setFormState({});
    setExternalFieldStates({});
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

  const fieldStateEntries = useMemo<FieldStateEntry[]>(() => {
    if (!activeNode) return [];
    return activeNode.data.fields.map((field) => ({
      field,
      state: externalFieldStates[field.id],
    }));
  }, [activeNode, externalFieldStates]);

  useEffect(() => {
    if (!activeNode) {
      setExternalFieldStates({});
      return;
    }

    const activeFieldIds = new Set(activeNode.data.fields.map((field) => field.id));

    setExternalFieldStates((current) => {
      let changed = false;
      const next: Record<string, ExternalFieldState> = {};

      activeFieldIds.forEach((fieldId) => {
        const state = current[fieldId];
        if (state) {
          next[fieldId] = state;
        }
      });

      if (Object.keys(next).length !== Object.keys(current).length) {
        changed = true;
      } else {
        for (const key of Object.keys(next)) {
          if (next[key] !== current[key]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : current;
    });
  }, [activeNode?.id, activeNode?.data.fields]);

  useEffect(() => {
    if (!activeNode) return;

    const controllers: Record<string, AbortController> = {};
    const authentication = activeNode.data.authentication;
    const authSignature = createAuthSignature(authentication);

    activeNode.data.fields.forEach((field) => {
      const url = field.externalDataUrl?.trim();
      const fieldId = field.id;

      if (!url) {
        setExternalFieldStates((current) => {
          if (!(fieldId in current)) return current;
          const { [fieldId]: _removed, ...rest } = current;
          return rest;
        });
        return;
      }

      setExternalFieldStates((current) => {
        const existing = current[fieldId];
        if (
          existing &&
          existing.url === url &&
          'authSignature' in existing &&
          existing.authSignature === authSignature &&
          (existing.status === 'loading' || existing.status === 'success')
        ) {
          return current;
        }
        return {
          ...current,
          [fieldId]: { status: 'loading', url, authSignature },
        };
      });

      const controller = new AbortController();
      controllers[fieldId] = controller;

      (async () => {
        try {
          const { payload, isFallback } = await loadExternalData(url, controller.signal, authentication);
          const processed = processExternalData(payload, [field]);
          const options = processed.selectOptions[fieldId] ?? ([] as SelectOption[]);
          const initialValue = processed.initialValues[fieldId];

          setExternalFieldStates((current) => {
            const latest = current[fieldId];
            if (
              latest &&
              'url' in latest &&
              (latest.url !== url || ('authSignature' in latest && latest.authSignature !== authSignature))
            ) {
              return current;
            }

            return {
              ...current,
              [fieldId]: {
                status: 'success',
                url,
                authSignature,
                raw: payload,
                selectOptions: options,
                initialValue,
                appliedInitialValue: false,
                isFallback,
              },
            };
          });
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          setExternalFieldStates((current) => ({
            ...current,
            [fieldId]: {
              status: 'error',
              url,
              authSignature,
              error: error instanceof Error ? error.message : 'Kunde inte läsa extern data.',
            },
          }));
        }
      })();
    });

    return () => {
      Object.values(controllers).forEach((controller) => controller.abort());
    };
  }, [activeNode?.id, activeNode?.data.fields, activeNode?.data.authentication]);

  useEffect(() => {
    if (!activeNode) return;

    setExternalFieldStates((current) => {
      let changed = false;
      const next: Record<string, ExternalFieldState> = { ...current };

      activeNode.data.fields.forEach((field) => {
        const state = current[field.id];
        if (!state || state.status !== 'success') return;

        const processed = processExternalData(state.raw, [field]);
        const options = processed.selectOptions[field.id] ?? ([] as SelectOption[]);
        const initialValue = processed.initialValues[field.id];

        if (!areSelectOptionArraysEqual(state.selectOptions, options) || !Object.is(state.initialValue, initialValue)) {
          next[field.id] = {
            ...state,
            selectOptions: options,
            initialValue,
            appliedInitialValue: false,
          };
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [activeNode?.id, activeNode?.data.fields]);

  useEffect(() => {
    if (!activeNode) return;

    const fieldsToMark: string[] = [];

    setFormState((current) => {
      let changed = false;
      const next = { ...current };

      activeNode.data.fields.forEach((field) => {
        const state = externalFieldStates[field.id];
        if (!isSuccessState(state) || state.appliedInitialValue) return;

        fieldsToMark.push(field.id);

        if (state.initialValue === undefined) {
          return;
        }

        if (!hasFilledValue(field, current[field.id])) {
          next[field.id] = state.initialValue;
          changed = true;
        }
      });

      return changed ? next : current;
    });

    if (fieldsToMark.length > 0) {
      setExternalFieldStates((current) => {
        let changed = false;
        const next: Record<string, ExternalFieldState> = { ...current };

        fieldsToMark.forEach((fieldId) => {
          const state = current[fieldId];
          if (!isSuccessState(state) || state.appliedInitialValue) return;
          next[fieldId] = { ...state, appliedInitialValue: true };
          changed = true;
        });

        return changed ? next : current;
      });
    }
  }, [activeNode, externalFieldStates]);

  useEffect(() => {
    if (!activeNode) return;

    setFormState((current) => {
      let changed = false;
      const next = { ...current };

      activeNode.data.fields.forEach((field) => {
        if (field.type !== 'select') return;
        const state = externalFieldStates[field.id];
        if (!isSuccessState(state) || state.selectOptions.length === 0) return;

        const currentValue = current[field.id];
        if (currentValue === undefined || currentValue === null || currentValue === '') {
          return;
        }

        if (!state.selectOptions.some((option) => option.value === String(currentValue))) {
          next[field.id] = '';
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [activeNode, externalFieldStates]);

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
      const authInit = buildAuthenticatedRequestInit(activeNode.data.authentication);
      const headers: Record<string, string> = {
        ...(authInit.headers as Record<string, string> | undefined),
      };
      headers['Content-Type'] = 'application/json';

      const response = await fetch(submissionUrl, {
        ...authInit,
        method: 'POST',
        headers,
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

  const loadingFields = fieldStateEntries.filter(
    (entry): entry is { field: FormField; state: LoadingExternalFieldState } =>
      isLoadingState(entry.state)
  );
  const errorFields = fieldStateEntries.filter(
    (entry): entry is { field: FormField; state: ErrorExternalFieldState } =>
      isErrorState(entry.state)
  );
  const fallbackFields = fieldStateEntries.filter(
    (entry): entry is { field: FormField; state: SuccessExternalFieldState } =>
      isSuccessState(entry.state) && entry.state.isFallback
  );

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

        {loadingFields.length > 0 ? (
          <div className="external-data-banner info">
            Laddar extern data för{' '}
            {loadingFields.map((entry) => entry.field.label).join(', ')}...
          </div>
        ) : null}

        {errorFields.map(({ field, state }) => (
          <div key={`error-${field.id}`} className="external-data-banner error">
            {field.label}: kunde inte hämta data från {state.url}: {state.error}
          </div>
        ))}

        {fallbackFields.map(({ field, state }) => (
          <div key={`fallback-${field.id}`} className="external-data-banner info">
            {field.label}: använder demonstrationsdata från {state.url} eftersom källan inte svarade.
          </div>
        ))}

        <form onSubmit={handleSubmit}>
          {activeNode.data.fields.map((field) => {
            const storedValue = formState[field.id];
            const state = externalFieldStates[field.id];

            const fieldNotes: JSX.Element[] = [];
            if (isLoadingState(state)) {
              fieldNotes.push(
                <span key="loading" className="field-inline-note info">
                  Laddar data från {state.url}...
                </span>
              );
            }
            if (isErrorState(state)) {
              fieldNotes.push(
                <span key="error" className="field-inline-note error">
                  Kunde inte hämta data: {state.error}
                </span>
              );
            }
            if (isSuccessState(state) && state.isFallback) {
              fieldNotes.push(
                <span key="fallback" className="field-inline-note info">
                  Använder demonstrationsdata eftersom källan inte svarade.
                </span>
              );
            }

            if (field.externalDataUrl?.trim() && field.externalDataPath?.trim()) {
              fieldNotes.push(
                <span key="path" className="field-inline-note">
                  Datafält i svaret: <code>{field.externalDataPath}</code>
                </span>
              );
            }

            if (field.type === 'select') {
              const externalOptions = isSuccessState(state) ? state.selectOptions : undefined;
              const fallbackOptions = (field.options ?? []).map((option) => ({
                value: option,
                label: option,
              }));
              const options =
                externalOptions && externalOptions.length > 0
                  ? externalOptions
                  : fallbackOptions;
              const value =
                typeof storedValue === 'string'
                  ? storedValue
                  : storedValue != null
                  ? String(storedValue)
                  : '';

              return (
                <label key={field.id}>
                  <span className="field-label-text">{field.label}</span>
                  <select value={value} onChange={(event) => updateFieldValue(field.id, event.target.value)}>
                    <option value="">Välj...</option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {fieldNotes}
                </label>
              );
            }

            const value =
              typeof storedValue === 'number' || typeof storedValue === 'string' ? storedValue : '';

            return (
              <label key={field.id}>
                <span className="field-label-text">{field.label}</span>
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={value as number | string}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    updateFieldValue(
                      field.id,
                      field.type === 'number' ? (nextValue === '' ? '' : Number(nextValue)) : nextValue
                    );
                  }}
                />
                {fieldNotes}
              </label>
            );
          })}

          {activeNode.data.outcomes.length > 1 ? (
            <label>
              <span className="field-label-text">Nästa steg</span>
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
