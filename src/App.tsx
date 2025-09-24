import { useCallback, useMemo, useState } from 'react';
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
              <button type="button" className="save-form-button" onClick={handleSaveForm}>
                Spara formulär
              </button>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Hämtar en JSON-fil med alla steg, fält och kopplingar så att flödet kan arkiveras eller delas.
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
