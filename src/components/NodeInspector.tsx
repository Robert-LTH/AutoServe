import type { Node } from 'reactflow';
import type { FormField, FormNodeData } from '../types';
import { createId } from '../utils/ids';

interface NodeInspectorProps {
  node: Node<FormNodeData> | null;
  onChange: (updater: (data: FormNodeData) => FormNodeData) => void;
}

const joinOptions = (options?: string[]) => (options && options.length > 0 ? options.join('\n') : '');

const sanitizeOptions = (value: string) =>
  value
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);

export default function NodeInspector({ node, onChange }: NodeInspectorProps) {
  if (!node) {
    return (
      <aside className="node-inspector">
        <h2>Inget steg valt</h2>
        <p>Markera ett steg i flödet för att konfigurera fält, datakopplingar och utfall.</p>
      </aside>
    );
  }

  const { data } = node;

  const setAuthentication = (
    updater: (authentication: FormNodeData['authentication']) => FormNodeData['authentication']
  ) => {
    onChange((current) => ({
      ...current,
      authentication: updater(current.authentication),
    }));
  };

  const updateField = (fieldId: string, partial: Partial<FormField>) => {
    onChange((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...partial } : field)),
    }));
  };

  const removeField = (fieldId: string) => {
    onChange((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  };

  const addField = () => {
    const id = createId('field');
    onChange((current) => ({
      ...current,
      fields: [
        ...current.fields,
        { id, label: 'Nytt fält', type: 'text', required: false, placeholder: 'Ange värde' },
      ],
    }));
  };

  const addOutcome = () => {
    onChange((current) => ({
      ...current,
      outcomes: [...current.outcomes, { id: createId('outcome'), label: 'Nytt utfall' }],
    }));
  };

  const removeOutcome = (outcomeId: string) => {
    onChange((current) => ({
      ...current,
      outcomes: current.outcomes.filter((outcome) => outcome.id !== outcomeId),
    }));
  };

  return (
    <aside className="node-inspector">
      <h2>Konfiguration</h2>
      <label>
        Namn på steg
        <input
          value={data.title}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Beskrivning
        <textarea
          value={data.description ?? ''}
          placeholder="Förklara syftet med steget"
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </label>
      <section className="inspector-section">
        <h3 style={{ margin: 0 }}>Autentisering</h3>
        <label>
          Metod
          <select
            value={data.authentication.type}
            onChange={(event) => {
              const nextType = event.target.value as FormNodeData['authentication']['type'];
              setAuthentication(() => {
                switch (nextType) {
                  case 'basic':
                    return { type: 'basic', username: '', password: '' };
                  case 'bearer':
                    return { type: 'bearer', token: '' };
                  case 'api-key':
                    return { type: 'api-key', header: 'X-API-Key', value: '' };
                  default:
                    return { type: 'none' };
                }
              });
            }}
          >
            <option value="none">Ingen autentisering</option>
            <option value="bearer">Bearer-token</option>
            <option value="basic">Basic (användarnamn/lösenord)</option>
            <option value="api-key">API-nyckel i header</option>
          </select>
        </label>
        {data.authentication.type === 'bearer' ? (
          <label>
            Token
            <input
              value={data.authentication.token}
              onChange={(event) =>
                setAuthentication((current) =>
                  current.type === 'bearer'
                    ? { ...current, token: event.target.value }
                    : current
                )
              }
              placeholder="t.ex. eyJhbGciOi..."
            />
          </label>
        ) : null}
        {data.authentication.type === 'basic' ? (
          <div className="field-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <label>
              Användarnamn
              <input
                value={data.authentication.username}
                onChange={(event) =>
                  setAuthentication((current) =>
                    current.type === 'basic'
                      ? { ...current, username: event.target.value }
                      : current
                  )
                }
                placeholder="exempelvis servicekonto"
              />
            </label>
            <label>
              Lösenord eller token
              <input
                value={data.authentication.password}
                onChange={(event) =>
                  setAuthentication((current) =>
                    current.type === 'basic'
                      ? { ...current, password: event.target.value }
                      : current
                  )
                }
                placeholder="ange hemligt värde"
              />
            </label>
          </div>
        ) : null}
        {data.authentication.type === 'api-key' ? (
          <div className="field-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <label>
              Header-namn
              <input
                value={data.authentication.header}
                onChange={(event) =>
                  setAuthentication((current) =>
                    current.type === 'api-key'
                      ? { ...current, header: event.target.value }
                      : current
                  )
                }
                placeholder="t.ex. X-API-Key"
              />
            </label>
            <label>
              Värde
              <input
                value={data.authentication.value}
                onChange={(event) =>
                  setAuthentication((current) =>
                    current.type === 'api-key'
                      ? { ...current, value: event.target.value }
                      : current
                  )
                }
                placeholder="ange nyckel"
              />
            </label>
          </div>
        ) : null}
        <p style={{ fontSize: '0.75rem', color: '#475569' }}>
          Inställningen används för både externa datakällor och formulärets slutliga skickade beställning.
        </p>
      </section>
      <section className="inspector-section">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Formulärfält</h3>
          <button className="add-button" onClick={addField} type="button">
            Lägg till fält
          </button>
        </header>
        {data.fields.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#475569' }}>Steget har inga fält ännu.</p>
        ) : (
          data.fields.map((field, index) => (
            <div key={field.id} className="field-item">
              <header>
                <span>Fält {index + 1}</span>
                <div className="field-actions">
                  <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) => updateField(field.id, { required: event.target.checked })}
                    />
                    Obligatoriskt
                  </label>
                  <button className="danger" type="button" onClick={() => removeField(field.id)}>
                    Ta bort
                  </button>
                </div>
              </header>
              <div className="field-grid">
                <label>
                  Etikett
                  <input
                    value={field.label}
                    onChange={(event) => updateField(field.id, { label: event.target.value })}
                  />
                </label>
                <label>
                  Typ
                  <select
                    value={field.type}
                    onChange={(event) => {
                      const nextType = event.target.value as FormField['type'];
                      updateField(field.id, {
                        type: nextType,
                        options:
                          nextType === 'select'
                            ? field.options ?? ['Alternativ 1', 'Alternativ 2']
                            : undefined,
                      });
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Nummer</option>
                    <option value="select">Lista</option>
                  </select>
                </label>
                <label>
                  Hjälptext
                  <input
                    value={field.placeholder ?? ''}
                    onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Extern datakälla (URL)
                  <input
                    value={field.externalDataUrl ?? ''}
                    placeholder="https://..."
                    onChange={(event) => updateField(field.id, { externalDataUrl: event.target.value })}
                  />
                  <span className="field-hint">
                    Använd en extern källa för att hämta initialvärden och eventuella listalternativ.
                  </span>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  JSON-sökväg till fältets data
                  <input
                    value={field.externalDataPath ?? ''}
                    placeholder="t.ex. data.items[0].value"
                    onChange={(event) => updateField(field.id, { externalDataPath: event.target.value })}
                    disabled={!field.externalDataUrl?.trim()}
                  />
                  <span className="field-hint">
                    Beskriv var i JSON-svaret värdet eller alternativen finns, med punktnotation och hakparenteser
                    för listor.
                  </span>
                </label>
                {field.type === 'select' ? (
                  <label style={{ gridColumn: '1 / -1' }}>
                    JSON-sökväg till alternativens värde (value)
                    <input
                      value={field.externalDataValuePath ?? ''}
                      placeholder="t.ex. data.items[].id"
                      onChange={(event) => updateField(field.id, { externalDataValuePath: event.target.value })}
                      disabled={!field.externalDataUrl?.trim()}
                    />
                    <span className="field-hint">
                      Använd en separat sökväg för tekniska värden om listalternativen kräver ett annat värde än den
                      synliga texten.
                    </span>
                  </label>
                ) : null}
                {field.type === 'select' ? (
                  <label>
                    Alternativ (ett per rad)
                    <textarea
                      value={joinOptions(field.options)}
                      onChange={(event) => updateField(field.id, { options: sanitizeOptions(event.target.value) })}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="inspector-section">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Utfall</h3>
          <button className="add-button" onClick={addOutcome} type="button">
            Lägg till utfall
          </button>
        </header>
        {data.outcomes.map((outcome) => (
          <div key={outcome.id} className="outcome-item">
            <header>
              <span>{outcome.label}</span>
              <div className="outcome-actions">
                <button className="danger" type="button" onClick={() => removeOutcome(outcome.id)}>
                  Ta bort
                </button>
              </div>
            </header>
            <label>
              Namn
              <input
                value={outcome.label}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    outcomes: current.outcomes.map((item) =>
                      item.id === outcome.id ? { ...item, label: event.target.value } : item
                    ),
                  }))
                }
              />
            </label>
            <label>
              Beskrivning
              <textarea
                value={outcome.description ?? ''}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    outcomes: current.outcomes.map((item) =>
                      item.id === outcome.id ? { ...item, description: event.target.value } : item
                    ),
                  }))
                }
              />
            </label>
            <p style={{ fontSize: '0.75rem', color: '#475569' }}>
              Koppla handtaget till nästa steg för att definiera flödet.
            </p>
          </div>
        ))}
      </section>
    </aside>
  );
}
