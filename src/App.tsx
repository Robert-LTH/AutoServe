import { useCallback, useMemo, useRef, useState } from 'react';
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
        },
        {
          id: 'field-quantity',
          label: 'Antal licenser',
          type: 'number',
          required: true,
          placeholder: '0',
          externalDataUrl: 'https://api.example.com/customers',
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

        if (!Array.isArray(nodesCandidate) || !Array.isArray(edgesCandidate)) {
          throw new Error('Filen saknar noder eller kopplingar.');
        }

        const parseCoordinate = (value: unknown) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === 'string' && value.trim() !== '') {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : 0;
          }
          return 0;
        };

        const sanitizedNodes = nodesCandidate.map((candidate) => {
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
            data: {
              ...typedData,
              fields: [...typedData.fields],
              outcomes: [...typedData.outcomes],
            },
            position,
          } satisfies Node<FormNodeData>;
        });

        const sanitizedEdges = edgesCandidate.map((candidate) => {
          if (!candidate || typeof candidate !== 'object') {
            throw new Error('Filen innehåller en koppling med ogiltigt format.');
          }

          const edge = candidate as Edge;
          if (typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
            throw new Error('En koppling saknar id, källa eller mål.');
          }

          return { ...edge } satisfies Edge;
        });

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
  }, [edges, nodes, submissionUrl]);

  return (
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
                När en användare färdigställer flödet skickas alla insamlade fält tillsammans med fullständig steghistorik
                som JSON till angiven adress.
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
                Exporterar flödet till JSON så att det kan arkiveras eller delas. Importera en sparad fil för att återuppta
                arbetet.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <FormRunner nodes={nodes} edges={edges} submissionUrl={submissionUrl} />
      )}
    </div>
  );
}
