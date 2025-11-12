import type { Edge, Node } from 'reactflow';

export type FieldType = 'text' | 'number' | 'select';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  externalDataUrl?: string;
  externalDataPath?: string;
  externalDataValuePath?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export type NodeAuthentication =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; header: string; value: string };

export interface NodeOutcome {
  id: string;
  label: string;
  description?: string;
}

export interface FormNodeData {
  title: string;
  description?: string;
  variant: 'form-step' | 'decision-step';
  fields: FormField[];
  outcomes: NodeOutcome[];
  authentication: NodeAuthentication;
}

export type DesignerNode = Node<FormNodeData>;
export type DesignerEdge = Edge;

export interface FormSubmissionResult {
  flowId: string;
  payload: Record<string, unknown>;
  completedSteps: string[];
}
