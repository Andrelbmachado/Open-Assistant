import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge, Position, } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './AgentNodeEditor.css';
import { BlenderNode } from './BlenderNode';
const nodeTypes = {
    blender: BlenderNode
};
const defaultNode = {
    id: '1',
    type: 'blender',
    data: {
        title: 'Start',
        type: 'start',
        inputs: [{ id: 'in', label: 'In' }],
        outputs: [{ id: 'out', label: 'Trigger' }]
    },
    position: { x: 50, y: 150 },
    className: 'custom-node'
};
export function AgentNodeEditor({ agent, onBack }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([defaultNode]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const chatEndRef = useRef(null);
    const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, style: { stroke: '#888', strokeWidth: 2 } }, eds)), [setEdges]);
    const [menuState, setMenuState] = useState({ isOpen: false, x: 0, y: 0, sourceId: null });
    const onConnectEnd = useCallback((event, connectionState) => {
        if (connectionState.isValid || !connectionState.fromNode)
            return;
        const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
        // Always show menu on drop (as requested by user "soltar em qualquer lugar")
        setMenuState({
            isOpen: true,
            x: clientX,
            y: clientY,
            sourceId: connectionState.fromNode.id
        });
    }, []);
    const handleAddAction = (type, label) => {
        if (!menuState.sourceId)
            return;
        const sourceNode = nodes.find(n => n.id === menuState.sourceId);
        if (!sourceNode)
            return;
        const newId = `node-${Date.now()}`;
        let nodeData = { title: label, type, prompt: '' };
        // All nodes now use the uniform dashboard card style
        switch (type) {
            case 'ia':
                nodeData.headerColor = '#3d8a57';
                nodeData.inputs = [{ id: 'in', label: 'Contexto', color: '#ffb300' }];
                nodeData.outputs = [{ id: 'out', label: 'Resposta', color: '#ffb300' }];
                break;
            default:
                nodeData.headerColor = '#555';
                nodeData.inputs = [{ id: 'in', label: 'In', color: '#aaa' }];
                nodeData.outputs = [{ id: 'out', label: 'Out', color: '#aaa' }];
        }
        const newNode = {
            id: newId,
            type: 'blender',
            position: { x: sourceNode.position.x + 250, y: sourceNode.position.y },
            data: nodeData,
            className: 'custom-node'
        };
        const newEdge = {
            id: `e${sourceNode.id}-${newId}`,
            source: sourceNode.id,
            sourceHandle: 'out',
            target: newId,
            targetHandle: 'in',
            animated: false,
            style: { stroke: '#888', strokeWidth: 2 }
        };
        setNodes(nds => [...nds, newNode]);
        setEdges(eds => [...eds, newEdge]);
        setMenuState(prev => ({ ...prev, isOpen: false }));
    };
    return (_jsxs("div", { className: "agent-editor-container", children: [_jsxs("div", { className: "editor-toolbar glass-panel", children: [_jsxs("div", { className: "toolbar-left", children: [_jsx("button", { className: "back-btn", onClick: onBack, title: "Back to Agents", children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "15 18 9 12 15 6" }) }) }), _jsxs("div", { className: "agent-header-info", children: [_jsx("h3", { children: agent.name }), _jsx("span", { className: "status-badge", children: "Editing" })] })] }), _jsxs("div", { className: "toolbar-actions", children: [_jsxs("button", { className: "btn-outline play-btn", children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polygon", { points: "5 3 19 12 5 21 5 3" }) }), "Play"] }), _jsx("button", { className: "btn-primary", children: "Save Workflow" })] })] }), _jsxs("div", { className: "react-flow-wrapper", children: [_jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: nodeTypes, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onConnect: onConnect, onConnectEnd: onConnectEnd, connectionLineStyle: { stroke: '#888', strokeWidth: 3 }, fitView: true, colorMode: "dark", children: [_jsx(Controls, { className: "custom-controls" }), _jsx(Background, { color: "#555", gap: 16 })] }), menuState.isOpen && (_jsxs(_Fragment, { children: [_jsx("div", { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }, onClick: () => setMenuState(prev => ({ ...prev, isOpen: false })) }), _jsxs("div", { className: "node-context-menu", style: { top: menuState.y, left: menuState.x }, children: [_jsx("h4", { children: "Adicionar A\u00E7\u00E3o" }), _jsxs("button", { className: "node-context-btn", onClick: () => handleAddAction('mensageiro', 'Mensageiro'), children: [_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }), "Mensageiro"] }), _jsxs("button", { className: "node-context-btn", onClick: () => handleAddAction('conexao', 'Conexão'), children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), _jsx("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })] }), "Conex\u00E3o"] }), _jsxs("button", { className: "node-context-btn", onClick: () => handleAddAction('armazenamento', 'Armazenamento'), children: [_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }) }), "Armazenamento"] }), _jsxs("button", { className: "node-context-btn", onClick: () => handleAddAction('acao_local', 'Ação Local'), children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("polyline", { points: "4 17 10 11 4 5" }), _jsx("line", { x1: "12", y1: "19", x2: "20", y2: "19" })] }), "A\u00E7\u00E3o Local"] }), _jsxs("button", { className: "node-context-btn", onClick: () => handleAddAction('ia', 'Agente IA'), children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 16v-4" }), _jsx("path", { d: "M12 8h.01" })] }), "Agente IA"] })] })] }))] })] }));
}
