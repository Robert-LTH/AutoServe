import { useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import FormNode from './nodes/FormNode';
import type { FormNodeData } from '../types';
import { createId } from '../utils/ids';

type DesignerCanvasProps = {
  nodes: Node<FormNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (node: Node<FormNodeData>) => void;
  onSelectNode: (nodeId: string | null) => void;
};

const nodeTypes = { formNode: FormNode } as const;

type DraggableType = 'form-step' | 'decision-step';

const CanvasInner = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  addNode,
  onSelectNode,
}: DesignerCanvasProps) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { project } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const createNode = useCallback(
    (type: DraggableType, position: { x: number; y: number }): Node<FormNodeData> => {
      const base = {
        id: createId('node'),
        type: 'formNode' as const,
        position,
      };

      if (type === 'decision-step') {
        const outcomes = [
          { id: createId('outcome'), label: 'Ja' },
          { id: createId('outcome'), label: 'Nej' },
        ];
        return {
          ...base,
          data: {
            title: 'Beslut',
            description: 'Välj utfallet som ska följas.',
            variant: 'decision-step',
            fields: [],
            outcomes,
            defaultOutcomeId: outcomes[0]?.id ?? null,
          },
        };
      }

      const outcomes = [{ id: createId('outcome'), label: 'Nästa steg' }];
      return {
        ...base,
        data: {
          title: 'Formulärsteg',
          description: 'Beskriv vad användaren ska fylla i.',
          variant: 'form-step',
          fields: [
            {
              id: createId('field'),
              label: 'Nytt fält',
              type: 'text',
              required: true,
              placeholder: 'Ange värde',
            },
          ],
          outcomes,
          defaultOutcomeId: outcomes[0]?.id ?? null,
        },
      };
    },
    []
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as DraggableType | '';
      if (!type) return;

      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode = createNode(type, position);
      addNode(newNode);
      onSelectNode(newNode.id);
    },
    [project, createNode, addNode, onSelectNode]
  );

  return (
    <div className="designer-canvas" ref={wrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <MiniMap nodeColor={(node) => (node.data.variant === 'decision-step' ? '#f59e0b' : '#2563eb')} />
        <Controls showInteractive={false} position="bottom-right" />
        <Background gap={20} />
      </ReactFlow>
    </div>
  );
};

export default function DesignerCanvas(props: DesignerCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
