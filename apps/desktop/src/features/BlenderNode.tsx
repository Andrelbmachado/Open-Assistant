import React, { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';

export interface BlenderNodeData {
  title: string;
  headerColor: string;
  type: string;
  inputs: { id: string; label: string; color?: string }[];
  outputs: { id: string; label: string; color?: string }[];
  prompt?: string;
}

export function BlenderNode({ id, data }: { id: string; data: BlenderNodeData }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { setNodes } = useReactFlow();

  const handlePromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, prompt: e.target.value } };
        }
        return n;
      })
    );
  };

  return (
    <div className="blender-node">
      <div 
        className="blender-header" 
        style={{ backgroundColor: data.headerColor }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="blender-title">
          <span className="blender-chevron">{isCollapsed ? '▼' : '▶'}</span>
          {data.title}
        </div>
      </div>
      
      {!isCollapsed && (
        <div className="blender-body">
          <div className="blender-ports">
            <div className="blender-inputs">
              {data.inputs.map((inp, idx) => (
                <div className="blender-row" key={inp.id}>
                  <Handle 
                    type="target" 
                    position={Position.Left} 
                    id={inp.id} 
                    className="blender-handle"
                    style={{ background: inp.color || '#a9a9a9' }} 
                  />
                  <span>{inp.label}</span>
                </div>
              ))}
            </div>
            
            <div className="blender-outputs">
              {data.outputs.map((out, idx) => (
                <div className="blender-row right" key={out.id}>
                  <span>{out.label}</span>
                  <Handle 
                    type="source" 
                    position={Position.Right} 
                    id={out.id} 
                    className="blender-handle"
                    style={{ background: out.color || '#a9a9a9' }} 
                  />
                </div>
              ))}
            </div>
          </div>

          {data.type === 'ia' && (
            <div className="blender-prop-row">
              <label>Prompt</label>
              <input 
                type="text" 
                value={data.prompt || ''} 
                onChange={handlePromptChange} 
                className="blender-input" 
                placeholder="Ex: Responda como pirata..."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
