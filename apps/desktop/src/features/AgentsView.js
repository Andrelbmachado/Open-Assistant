import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
import { AgentNodeEditor } from "./AgentNodeEditor";
import "./AgentsView.css";
export function AgentsView() {
    const [agents, setAgents] = useState([
        { id: "1", name: "Data Analyst Agent", description: "Processes raw data and outputs JSON.", updatedAt: "2 hours ago" },
        { id: "2", name: "Web Scraper", description: "Extracts information from specific URLs.", updatedAt: "1 day ago" }
    ]);
    const [currentAgent, setCurrentAgent] = useState(null);
    const handleCreateAgent = () => {
        const newAgent = {
            id: Math.random().toString(36).substr(2, 9),
            name: "New Agent",
            description: "A newly created agent.",
            updatedAt: "Just now"
        };
        setAgents([newAgent, ...agents]);
        setCurrentAgent(newAgent);
    };
    if (currentAgent) {
        return _jsx(AgentNodeEditor, { agent: currentAgent, onBack: () => setCurrentAgent(null) });
    }
    return (_jsxs("div", { className: "agents-overview", children: [_jsxs("div", { className: "overview-header", children: [_jsx("h2", { children: "Your Agents" }), _jsx("button", { className: "btn-primary", onClick: handleCreateAgent, children: "+ Create Agent" })] }), agents.length === 0 ? (_jsxs("div", { className: "empty-agents glass-panel", children: [_jsx("h3", { children: "No agents yet" }), _jsx("p", { children: "Create your first AI agent to automate workflows." }), _jsx("button", { className: "btn-primary", onClick: handleCreateAgent, children: "Create Agent" })] })) : (_jsx("div", { className: "agents-grid", children: agents.map(agent => (_jsxs("div", { className: "agent-card glass-panel", onClick: () => setCurrentAgent(agent), children: [_jsxs("div", { className: "agent-card-header", children: [_jsx("div", { className: "agent-icon", children: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 16v-4" }), _jsx("path", { d: "M12 8h.01" })] }) }), _jsx("h4", { children: agent.name })] }), _jsx("p", { children: agent.description }), _jsxs("div", { className: "agent-card-footer", children: [_jsxs("span", { children: ["Updated ", agent.updatedAt] }), _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "9 18 15 12 9 6" }) })] })] }, agent.id))) }))] }));
}
