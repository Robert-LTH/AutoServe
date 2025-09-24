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
          type: 'text',
          required: true,
          placeholder: 'Organisationens namn',
        },
        {
          id: 'field-quantity',
          label: 'Antal licenser',
          type: 'number',
          required: true,
          placeholder: '0',
        },
      ],
      outcomes: [{ id: 'outcome-to-decision', label: 'Fortsätt till val' }],
      externalDataUrl: 'https://api.example.com/customers',
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
            </div>
          </div>
        </div>
      ) : (
        <FormRunner nodes={nodes} edges={edges} submissionUrl={submissionUrl} />
      )}
    </div>
  );
}
