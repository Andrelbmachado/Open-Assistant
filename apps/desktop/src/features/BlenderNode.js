import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
export function BlenderNode({ id, data }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { setNodes } = useReactFlow();
    const handlePromptChange = (e) => {
        setNodes((nds) => nds.map((n) => {
            if (n.id === id) {
                return { ...n, data: { ...n.data, prompt: e.target.value } };
            }
            return n;
        }));
    };
    return (_jsxs("div", { className: "blender-node", children: [_jsx("div", { className: "blender-header", style: { backgroundColor: data.headerColor }, onClick: () => setIsCollapsed(!isCollapsed), children: _jsxs("div", { className: "blender-title", children: [_jsx("span", { className: "blender-chevron", children: isCollapsed ? '▼' : '▶' }), data.title] }) }), !isCollapsed && (_jsxs("div", { className: "blender-body", children: [_jsxs("div", { className: "blender-ports", children: [_jsx("div", { className: "blender-inputs", children: data.inputs.map((inp, idx) => (_jsxs("div", { className: "blender-row", children: [_jsx(Handle, { type: "target", position: Position.Left, id: inp.id, className: "blender-handle", style: { background: inp.color || '#a9a9a9' } }), _jsx("span", { children: inp.label })] }, inp.id))) }), _jsx("div", { className: "blender-outputs", children: data.outputs.map((out, idx) => (_jsxs("div", { className: "blender-row right", children: [_jsx("span", { children: out.label }), _jsx(Handle, { type: "source", position: Position.Right, id: out.id, className: "blender-handle", style: { background: out.color || '#a9a9a9' } })] }, out.id))) })] }), data.type === 'ia' && (_jsxs("div", { className: "blender-prop-row", children: [_jsx("label", { children: "Prompt" }), _jsx("input", { type: "text", value: data.prompt || '', onChange: handlePromptChange, className: "blender-input", placeholder: "Ex: Responda como pirata..." })] }))] }))] }));
}
