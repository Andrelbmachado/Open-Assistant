import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  type Connection,
  type Edge,
  type Node
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './AgentNodeEditor.css';
import type { Agent } from './AgentsView';

interface AgentNodeEditorProps {
  agent: Agent;
  onBack: () => void;
}

const defaultNode: Node = {
  id: '1',
  type: 'input',
  data: { label: 'Start' },
  position: { x: 50, y: 150 },
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  className: 'custom-node input-node',
};

export function AgentNodeEditor({ agent, onBack }: AgentNodeEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([defaultNode]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#007aff' } } as any, eds)),
    [setEdges],
  );

  const generateNodesFromPrompt = async () => {
    if (!prompt.trim() || isGenerating) return;
    
    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Please configure your OpenAI API Key in Settings first.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an AI architect. The user will give you a task. Convert it into a sequence of functional steps (nodes) for a visual workflow editor. Output ONLY a JSON object with a single "nodes" array. Each object in the array must have "id" (string starting from "2"), "label" (short title), and "type" (one of: 'process', 'web_search', 'file_write', 'api_call', 'output'). Output JSON only.`
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) throw new Error("Failed to generate workflow.");
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      
      const newNodes: Node[] = [defaultNode];
      const newEdges: Edge[] = [];
      let currentX = 350;
      let lastId = "1";

      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        parsed.nodes.forEach((n: any, idx: number) => {
          const isOutput = idx === parsed.nodes.length - 1 || n.type === 'output';
          const nodeClass = isOutput ? 'custom-node output-node' : 'custom-node agent-node';
          const nodeType = isOutput ? 'output' : 'default';

          newNodes.push({
            id: n.id,
            type: nodeType,
            data: { label: n.label },
            position: { x: currentX, y: 150 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            className: nodeClass,
          });

          newEdges.push({
            id: `e${lastId}-${n.id}`,
            source: lastId,
            target: n.id,
            animated: true,
            style: { stroke: '#007aff' }
          });

          lastId = n.id;
          currentX += 300;
        });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      setPrompt("");

    } catch (err) {
      console.error(err);
      alert("Error generating nodes. See console.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') generateNodesFromPrompt();
  };

  return (
    <div className="agent-editor-container">
      <div className="editor-toolbar glass-panel">
        <div className="toolbar-left">
          <button className="icon-btn" onClick={onBack} title="Back to Agents">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <div className="agent-header-info">
            <h3>{agent.name}</h3>
            <span className="status-badge">Editing</span>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="btn-outline play-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Play
          </button>
          <button className="btn-primary">Save Workflow</button>
        </div>
      </div>
      
      <div className="react-flow-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          colorMode="dark"
        >
          <Controls className="custom-controls" />
          <MiniMap nodeStrokeWidth={3} className="custom-minimap" />
          <Background color="#555" gap={16} />
        </ReactFlow>

        <div className="agent-chatbot glass-panel">
          <div className="chatbot-header">
            <h4>Prompt to Nodes</h4>
            <span className="ai-badge">AI</span>
          </div>
          <div className="chatbot-body">
            <p className="chatbot-instructions">Describe what this agent should do. I will generate the workflow nodes automatically.</p>
            <div className="input-group">
              <input 
                type="text" 
                placeholder="E.g., Read file -> extract emails -> save as CSV" 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating}
              />
              <button 
                className="icon-btn" 
                onClick={generateNodesFromPrompt} 
                disabled={!prompt.trim() || isGenerating}
              >
                {isGenerating ? (
                   <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
