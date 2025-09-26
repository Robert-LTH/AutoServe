import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  addEdge,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import DesignerCanvas from './components/DesignerCanvas';
import FormRunner from './components/FormRunner';
import NodeInspector from './components/NodeInspector';
import NodePalette from './components/NodePalette';
import type { FormNodeData } from './types';

type StoredForm = {
  id: string;
  name: string;
  nodes: Node<FormNodeData>[];
  edges: Edge[];
  submissionUrl: string;
  selectedNodeId: string | null;
  updatedAt?: string;
};

const STORAGE_KEY = 'autoserve.forms';
const ACTIVE_FORM_STORAGE_KEY = 'autoserve.activeFormId';

const ensureId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `form-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseCoordinate = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
};

const cloneNodes = (nodes: Node<FormNodeData>[]): Node<FormNodeData>[] =>
  nodes.map((node) => ({
    ...node,
    position: node.position ? { ...node.position } : { x: 0, y: 0 },
    data: {
      ...node.data,
      fields: node.data.fields.map((field) => ({
        ...field,
        options: Array.isArray(field.options) ? [...field.options] : undefined,
      })),
      outcomes: node.data.outcomes.map((outcome) => ({ ...outcome })),
    },
  }));

const cloneEdges = (edges: Edge[]): Edge[] => edges.map((edge) => ({ ...edge }));

const sanitizeNodes = (nodesCandidate: unknown): Node<FormNodeData>[] => {
  if (!Array.isArray(nodesCandidate)) {
    throw new Error('Filen saknar noder eller kopplingar.');
  }

  return nodesCandidate.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Filen innehåller en nod med ogiltigt format.');
    }

    const node = candidate as Node<FormNodeData>;
    const data = (node as { data?: unknown }).data;

    if (!data || typeof data !== 'object') {
      throw new Error('En nod saknar data.');
    }

    const typedData = data as FormNodeData;
    if (typeof typedData.title !== 'string') {
      throw new Error('En nod saknar titel.');
    }
    if (!Array.isArray(typedData.fields) || !Array.isArray(typedData.outcomes)) {
      throw new Error('En nod saknar fält eller utgångar.');
    }

    if (typeof node.id !== 'string') {
      throw new Error('En nod saknar id.');
    }

    const rawPosition = (node as { position?: unknown }).position;
    const position =
      rawPosition && typeof rawPosition === 'object'
        ? {
            x: parseCoordinate((rawPosition as { x?: unknown }).x),
            y: parseCoordinate((rawPosition as { y?: unknown }).y),
          }
        : { x: 0, y: 0 };

    return {
      ...node,
      position,
      data: {
        ...typedData,
        fields: typedData.fields.map((field) => ({
          ...field,
          options: Array.isArray(field.options) ? [...field.options] : undefined,
        })),
        outcomes: typedData.outcomes.map((outcome) => ({ ...outcome })),
      },
    } satisfies Node<FormNodeData>;
  });
};

const sanitizeEdges = (edgesCandidate: unknown): Edge[] => {
  if (!Array.isArray(edgesCandidate)) {
    throw new Error('Filen saknar noder eller kopplingar.');
  }

  return edgesCandidate.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Filen innehåller en koppling med ogiltigt format.');
    }

    const edge = candidate as Edge;
    if (typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      throw new Error('En koppling saknar id, källa eller mål.');
    }

    return { ...edge } satisfies Edge;
  });
};

const createStoredForm = (input: {
  id?: string;
  name: string;
  nodes: Node<FormNodeData>[];
  edges: Edge[];
  submissionUrl: string;
  selectedNodeId?: string | null;
  updatedAt?: string;
}): StoredForm => {
  const sanitizedNodes = cloneNodes(input.nodes);
  const sanitizedEdges = cloneEdges(input.edges);
  const nodeIds = new Set(sanitizedNodes.map((node) => node.id));
  const startNodeId =
    input.selectedNodeId && nodeIds.has(input.selectedNodeId)
      ? input.selectedNodeId
      : sanitizedNodes[0]?.id ?? null;

  return {
    id: input.id ?? ensureId(),
    name: input.name.trim() || 'Namnlöst formulär',
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    submissionUrl: input.submissionUrl,
    selectedNodeId: startNodeId,
    updatedAt: input.updatedAt,
  } satisfies StoredForm;
};

const sanitizeStoredForm = (candidate: unknown): StoredForm | null => {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const typed = candidate as {
    id?: unknown;
    name?: unknown;
    nodes?: unknown;
    edges?: unknown;
    submissionUrl?: unknown;
    selectedNodeId?: unknown;
    updatedAt?: unknown;
  };

  if (typeof typed.id !== 'string' || typed.id.trim() === '') {
    return null;
  }

  try {
    const nodes = sanitizeNodes(typed.nodes);
    const edges = sanitizeEdges(typed.edges);
    const submissionUrl =
      typeof typed.submissionUrl === 'string' && typed.submissionUrl.trim() !== ''
        ? typed.submissionUrl
        : 'https://httpbin.org/post';
    const selectedNodeId = typeof typed.selectedNodeId === 'string' ? typed.selectedNodeId : null;

    return createStoredForm({
      id: typed.id,
      name: typeof typed.name === 'string' && typed.name.trim() ? typed.name : 'Namnlöst formulär',
      nodes,
      edges,
      submissionUrl,
      selectedNodeId,
      updatedAt: typeof typed.updatedAt === 'string' ? typed.updatedAt : undefined,
    });
  } catch (error) {
    return null;
  }
};

const initialNodes: Node<FormNodeData>[] = [
  {
    id: 'node-start',
    type: 'formNode',
    position: { x: 0, y: 0 },
    data: {
      title: 'Beställningsdetaljer',
      description: 'Samla in grundinformation om beställningen.',
      variant: 'form-step',
      fields: [
        {
          id: 'field-company',
          label: 'Företag',
          type: 'select',
          required: true,
          options: ['Aurora Industries', 'Nordic Solutions', 'Helio Labs', 'Svea Partners'],
          externalDataUrl: 'https://api.example.com/customers',
          externalDataPath: 'options',
        },
        {
          id: 'field-quantity',
          label: 'Antal licenser',
          type: 'number',
          required: true,
          placeholder: '0',
          externalDataUrl: 'https://api.example.com/customers',
          externalDataPath: 'field-quantity',
        },
      ],
      outcomes: [{ id: 'outcome-to-decision', label: 'Fortsätt till val' }],
    },
  },
  {
    id: 'node-decision',
    type: 'formNode',
    position: { x: 320, y: 160 },
    data: {
      title: 'Välj leveransnivå',
      description: 'Avgör hur beställningen ska hanteras.',
      variant: 'decision-step',
      fields: [],
      outcomes: [
        { id: 'outcome-standard', label: 'Standardhantering' },
        { id: 'outcome-express', label: 'Expresshantering' },
      ],
    },
  },
  {
    id: 'node-summary',
    type: 'formNode',
    position: { x: 640, y: 0 },
    data: {
      title: 'Sammanställning',
      description: 'Verifiera uppgifterna och lämna en kommentar till operativt team.',
      variant: 'form-step',
      fields: [
        {
          id: 'field-comment',
          label: 'Intern kommentar',
          type: 'text',
          required: false,
          placeholder: 'Eventuell ytterligare information',
        },
      ],
      outcomes: [{ id: 'outcome-submit', label: 'Skicka beställningen' }],
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'edge-start-decision',
    source: 'node-start',
    target: 'node-decision',
    sourceHandle: 'outcome-to-decision',
  },
  {
    id: 'edge-decision-standard',
    source: 'node-decision',
    target: 'node-summary',
    sourceHandle: 'outcome-standard',
  },
  {
    id: 'edge-decision-express',
    source: 'node-decision',
    target: 'node-summary',
    sourceHandle: 'outcome-express',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'designer' | 'runner'>('designer');
  const [submissionUrl, setSubmissionUrl] = useState('https://httpbin.org/post');
  const [nodes, setNodes, onNodesChange] = useNodesState<FormNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [isFormsHydrated, setIsFormsHydrated] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);

  const activeForm = useMemo(
    () => forms.find((form) => form.id === activeFormId) ?? null,
    [forms, activeFormId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const fallbackForm = createStoredForm({
      id: 'form-initial',
      name: 'Standardflöde',
      nodes: initialNodes,
      edges: initialEdges,
      submissionUrl: 'https://httpbin.org/post',
      selectedNodeId: initialNodes[0]?.id ?? null,
    });

    let loadedForms: StoredForm[] | null = null;
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .map((candidate) => sanitizeStoredForm(candidate))
            .filter((form): form is StoredForm => form !== null);
          if (sanitized.length > 0) {
            loadedForms = sanitized;
          }
        }
        if (!loadedForms) {
          setLibraryStatus({
            type: 'error',
            message: 'Formulären kunde inte laddas från webbläsaren. Standardflödet används.',
          });
        }
      } catch (error) {
        setLibraryStatus({
          type: 'error',
          message: 'Formulären kunde inte läsas från webbläsaren. Standardflödet används.',
        });
      }
    }

    const formsToUse = loadedForms ?? [fallbackForm];
    setForms(formsToUse);

    const storedActiveId = window.localStorage.getItem(ACTIVE_FORM_STORAGE_KEY);
    const desiredActiveId =
      storedActiveId && formsToUse.some((form) => form.id === storedActiveId)
        ? storedActiveId
        : formsToUse[0]?.id ?? null;

    setActiveFormId(desiredActiveId);

    const formToLoad =
      formsToUse.find((form) => form.id === desiredActiveId) ?? formsToUse[0] ?? fallbackForm;
    setNodes(cloneNodes(formToLoad.nodes));
    setEdges(cloneEdges(formToLoad.edges));
    setSubmissionUrl(formToLoad.submissionUrl);

    const nodeIds = new Set(formToLoad.nodes.map((node) => node.id));
    const startNodeId =
      formToLoad.selectedNodeId && nodeIds.has(formToLoad.selectedNodeId)
        ? formToLoad.selectedNodeId
        : formToLoad.nodes[0]?.id ?? null;
    setSelectedNodeId(startNodeId);

    setIsFormsHydrated(true);
  }, [setEdges, setNodes, setSelectedNodeId, setSubmissionUrl]);

  useEffect(() => {
    if (!libraryStatus || typeof window === 'undefined') {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLibraryStatus(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [libraryStatus]);

  useEffect(() => {
    if (!isFormsHydrated || !activeFormId) {
      return;
    }

    setForms((current) =>
      current.map((form) =>
        form.id === activeFormId
          ? {
              ...form,
              nodes: cloneNodes(nodes),
              edges: cloneEdges(edges),
              submissionUrl,
              selectedNodeId,
            }
          : form
      )
    );
  }, [activeFormId, edges, isFormsHydrated, nodes, selectedNodeId, setForms, submissionUrl]);

  useEffect(() => {
    if (!isFormsHydrated || typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
    } catch (error) {
      setLibraryStatus({
        type: 'error',
        message: 'Formulären kunde inte sparas i webbläsaren.',
      });
    }
  }, [forms, isFormsHydrated]);

  useEffect(() => {
    if (!isFormsHydrated || typeof window === 'undefined') {
      return;
    }

    if (activeFormId) {
      window.localStorage.setItem(ACTIVE_FORM_STORAGE_KEY, activeFormId);
    } else {
      window.localStorage.removeItem(ACTIVE_FORM_STORAGE_KEY);
    }
  }, [activeFormId, isFormsHydrated]);

  const handleTriggerImport = useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, []);

  const handleImportForm = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      setImportStatus(null);

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Filen innehåller inget formulär.');
        }

        const {
          nodes: nodesCandidate,
          edges: edgesCandidate,
          submissionUrl: importedSubmissionUrl,
          startNodeId,
        } = parsed as {
          nodes?: unknown;
          edges?: unknown;
          submissionUrl?: unknown;
          startNodeId?: unknown;
        };

        const sanitizedNodes = sanitizeNodes(nodesCandidate);
        const sanitizedEdges = sanitizeEdges(edgesCandidate);

        setNodes(sanitizedNodes);
        setEdges(sanitizedEdges);

        const nextSubmissionUrl =
          typeof importedSubmissionUrl === 'string' ? importedSubmissionUrl : submissionUrl;
        setSubmissionUrl(nextSubmissionUrl);

        const nodeIds = new Set(sanitizedNodes.map((node) => node.id));
        const desiredStartId =
          typeof startNodeId === 'string' && nodeIds.has(startNodeId)
            ? startNodeId
            : sanitizedNodes[0]?.id ?? null;
        setSelectedNodeId(desiredStartId ?? null);

        setImportStatus({ type: 'success', message: 'Formuläret importerades.' });
      } catch (error) {
        setImportStatus({
          type: 'error',
          message:
            error instanceof Error
              ? `Formuläret kunde inte importeras: ${error.message}`
              : 'Formuläret kunde inte importeras.',
        });
      }
    },
    [setEdges, setNodes, setSelectedNodeId, setSubmissionUrl, submissionUrl]
  );

  const handleSelectStoredForm = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextId = event.target.value;
      if (!nextId || nextId === activeFormId) {
        return;
      }

      const formToLoad = forms.find((form) => form.id === nextId);
      if (!formToLoad) {
        return;
      }

      setActiveFormId(formToLoad.id);
      setNodes(cloneNodes(formToLoad.nodes));
      setEdges(cloneEdges(formToLoad.edges));
      setSubmissionUrl(formToLoad.submissionUrl);

      const nodeIds = new Set(formToLoad.nodes.map((node) => node.id));
      const nextSelectedId =
        formToLoad.selectedNodeId && nodeIds.has(formToLoad.selectedNodeId)
          ? formToLoad.selectedNodeId
          : formToLoad.nodes[0]?.id ?? null;
      setSelectedNodeId(nextSelectedId);

      setLibraryStatus({ type: 'success', message: `Bytte till "${formToLoad.name}".` });
    },
    [activeFormId, forms, setEdges, setNodes, setSelectedNodeId, setSubmissionUrl]
  );

  const handleFormNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextName = event.target.value;
      if (!activeFormId) {
        return;
      }

      setForms((current) =>
        current.map((form) => (form.id === activeFormId ? { ...form, name: nextName } : form))
      );
    },
    [activeFormId]
  );

  const handleFormNameBlur = useCallback(() => {
    if (!activeFormId) {
      return;
    }

    setForms((current) =>
      current.map((form) => {
        if (form.id !== activeFormId) {
          return form;
        }
        const trimmed = form.name.trim();
        return trimmed ? form : { ...form, name: 'Namnlöst formulär' };
      })
    );
  }, [activeFormId]);

  const handleCreateForm = useCallback(() => {
    if (!isFormsHydrated) {
      return;
    }

    const defaultName = `Nytt formulär ${forms.length + 1}`;
    const name = typeof window !== 'undefined'
      ? window.prompt('Ange ett namn för det nya formuläret', defaultName)
      : defaultName;

    if (!name) {
      return;
    }

    const newForm = createStoredForm({
      name,
      nodes: initialNodes,
      edges: initialEdges,
      submissionUrl: 'https://httpbin.org/post',
      selectedNodeId: initialNodes[0]?.id ?? null,
    });

    setForms((current) => [...current, newForm]);
    setActiveFormId(newForm.id);
    setNodes(cloneNodes(newForm.nodes));
    setEdges(cloneEdges(newForm.edges));
    setSubmissionUrl(newForm.submissionUrl);
    setSelectedNodeId(newForm.selectedNodeId);
    setLibraryStatus({ type: 'success', message: 'Ett nytt formulär skapades.' });
  }, [forms.length, isFormsHydrated, setEdges, setNodes, setSelectedNodeId, setSubmissionUrl]);

  const handleDeleteForm = useCallback(() => {
    if (!isFormsHydrated || !activeFormId) {
      return;
    }

    if (forms.length <= 1) {
      setLibraryStatus({ type: 'error', message: 'Det måste finnas minst ett formulär.' });
      return;
    }

    const confirmed =
      typeof window === 'undefined' ? true : window.confirm('Ta bort det aktuella formuläret?');
    if (!confirmed) {
      return;
    }

    const index = forms.findIndex((form) => form.id === activeFormId);
    const nextForms = forms.filter((form) => form.id !== activeFormId);
    const nextActive = nextForms[index] ?? nextForms[index - 1] ?? nextForms[0] ?? null;

    setForms(nextForms);

    if (nextActive) {
      setActiveFormId(nextActive.id);
      setNodes(cloneNodes(nextActive.nodes));
      setEdges(cloneEdges(nextActive.edges));
      setSubmissionUrl(nextActive.submissionUrl);

      const nodeIds = new Set(nextActive.nodes.map((node) => node.id));
      const nextSelectedId =
        nextActive.selectedNodeId && nodeIds.has(nextActive.selectedNodeId)
          ? nextActive.selectedNodeId
          : nextActive.nodes[0]?.id ?? null;
      setSelectedNodeId(nextSelectedId);
    } else {
      setActiveFormId(null);
      setSelectedNodeId(null);
    }

    setLibraryStatus({ type: 'success', message: 'Formuläret togs bort.' });
  }, [activeFormId, forms, isFormsHydrated, setEdges, setNodes, setSelectedNodeId, setSubmissionUrl]);

  const handlePersistActiveForm = useCallback(() => {
    if (!activeFormId || !activeForm) {
      return;
    }

    const timestamp = new Date().toISOString();
    setForms((current) =>
      current.map((form) => (form.id === activeFormId ? { ...form, updatedAt: timestamp } : form))
    );
    setLibraryStatus({ type: 'success', message: 'Formuläret sparades i webbläsaren.' });
  }, [activeForm, activeFormId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge({ ...connection, animated: false }, current));
    },
    [setEdges]
  );

  const addNode = useCallback(
    (node: Node<FormNodeData>) => {
      setNodes((current) => [...current, node]);
    },
    [setNodes]
  );

  const updateNodeData = useCallback(
    (nodeId: string, updater: (data: FormNodeData) => FormNodeData) => {
      setNodes((current) =>
        current.map((node) => (node.id === nodeId ? { ...node, data: updater(node.data) } : node))
      );
    },
    [setNodes]
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const handleNodeChange = useCallback(
    (updater: (data: FormNodeData) => FormNodeData) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, updater);
    },
    [selectedNodeId, updateNodeData]
  );

  const handleSaveForm = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const targeted = new Set(edges.map((edge) => edge.target));
    const startNode = nodes.find((node) => !targeted.has(node.id)) ?? nodes[0] ?? null;

    const exportNodes = nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position,
      data,
    }));

    const exportEdges = edges.map(({ id, type, source, target, sourceHandle, targetHandle, data, label }) => ({
      id,
      type,
      source,
      target,
      sourceHandle,
      targetHandle,
      data,
      label,
    }));

    const timestamp = new Date().toISOString();
    const payload = {
      savedAt: timestamp,
      formName: activeForm?.name ?? 'Namnlöst formulär',
      submissionUrl,
      startNodeId: startNode?.id ?? null,
      nodes: exportNodes,
      edges: exportEdges,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `autoserve-form-${timestamp.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [activeForm?.name, edges, nodes, submissionUrl]);

  return (
    <div className="app-wrapper">
      <div className="app">
        <header>
          <h1>AutoServe självserviceportal</h1>
          <p>
            Bygg automatiserade beställningsflöden med drag-and-drop, koppla externa datakällor och låt dina användare
            skapa ordrar i ett guidat formulär.
          </p>
        </header>

        <nav className="tab-switcher">
          <button
            type="button"
            className={activeTab === 'designer' ? 'active' : ''}
            onClick={() => setActiveTab('designer')}
          >
            Designer
          </button>
          <button
            type="button"
            className={activeTab === 'runner' ? 'active' : ''}
            onClick={() => setActiveTab('runner')}
          >
            Formulär
          </button>
        </nav>

        {activeTab === 'designer' ? (
          <div className="designer-view">
            <NodePalette />
            <DesignerCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              addNode={addNode}
              onSelectNode={setSelectedNodeId}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-library">
                <h2>Formulär i webbläsaren</h2>
                <label>
                  Aktuellt formulär
                  <select value={activeFormId ?? ''} onChange={handleSelectStoredForm}>
                    {forms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Namn
                  <input
                    value={activeForm?.name ?? ''}
                    onChange={handleFormNameChange}
                    onBlur={handleFormNameBlur}
                    placeholder="Namnlöst formulär"
                  />
                </label>
                <div className="form-library-actions">
                  <button type="button" onClick={handlePersistActiveForm} disabled={!activeFormId}>
                    Spara i webbläsaren
                  </button>
                  <button type="button" className="secondary" onClick={handleCreateForm}>
                    Nytt formulär
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleDeleteForm}
                    disabled={!activeFormId || forms.length <= 1}
                  >
                    Ta bort formulär
                  </button>
                </div>
                {libraryStatus ? (
                  <p className={`library-feedback ${libraryStatus.type}`}>{libraryStatus.message}</p>
                ) : null}
                <p className="library-hint">
                  Formulären sparas i webbläsaren så att du kan byta mellan olika flöden och fortsätta arbetet
                  senare.
                </p>
              </div>
              <NodeInspector node={selectedNode} onChange={handleNodeChange} />
              <div className="submission-settings">
                <h2>Inlämning</h2>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={handleImportForm}
                />
                <label style={{ display: 'block', fontWeight: 600 }}>
                  URL för beställningsmottagning
                  <input
                    style={{ marginTop: '0.5rem' }}
                    value={submissionUrl}
                    placeholder="https://..."
                    onChange={(event) => setSubmissionUrl(event.target.value)}
                  />
                </label>
                <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.75rem' }}>
                  När en användare färdigställer flödet skickas alla insamlade fält tillsammans med fullständig
                  steghistorik som JSON till angiven adress.
                </p>
                <div className="submission-actions">
                  <button type="button" className="secondary" onClick={handleTriggerImport}>
                    Importera formulär
                  </button>
                  <button type="button" className="save-form-button" onClick={handleSaveForm}>
                    Spara formulär
                  </button>
                </div>
                {importStatus ? (
                  <p className={`submission-feedback ${importStatus.type}`}>
                    {importStatus.message}
                  </p>
                ) : null}
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Exporterar flödet till JSON så att det kan arkiveras eller delas. Importera en sparad fil för att
                  återuppta arbetet.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <FormRunner nodes={nodes} edges={edges} submissionUrl={submissionUrl} />
        )}
      </div>
    </div>
  );
}
