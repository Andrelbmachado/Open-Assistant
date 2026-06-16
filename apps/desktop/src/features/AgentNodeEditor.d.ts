import React from 'react';
import '@xyflow/react/dist/style.css';
import './AgentNodeEditor.css';
import type { Agent } from './AgentsView';
interface AgentNodeEditorProps {
    agent: Agent;
    onBack: () => void;
}
export declare function AgentNodeEditor({ agent, onBack }: AgentNodeEditorProps): React.JSX.Element;
export {};
