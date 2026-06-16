import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
import "./SettingsModal.css";
// ----------------------------------------------------------------------
// FileManagerTab (used for Artifacts and Skills)
// ----------------------------------------------------------------------
function FileManagerTab({ title, description, emptyText }) {
    const [items, setItems] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDragActive, setIsDragActive] = useState(false);
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragActive(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragActive(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newItems = Array.from(e.dataTransfer.files).map(file => ({
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                size: (file.size / 1024).toFixed(1) + " KB"
            }));
            setItems(prev => [...prev, ...newItems]);
        }
    };
    const handleAddManual = () => {
        const name = prompt("Enter file name:");
        if (name) {
            setItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name, size: "0 KB" }]);
        }
    };
    const toggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id))
            newSet.delete(id);
        else
            newSet.add(id);
        setSelectedIds(newSet);
    };
    const handleSelectAll = () => {
        if (selectedIds.size === items.length) {
            setSelectedIds(newSet => new Set());
        }
        else {
            setSelectedIds(new Set(items.map(i => i.id)));
        }
    };
    const handleDelete = () => {
        setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
        setSelectedIds(new Set());
    };
    return (_jsxs("div", { className: "tab-pane", children: [_jsxs("div", { className: "file-manager-header", children: [_jsxs("div", { children: [_jsx("h3", { children: title }), _jsx("p", { children: description })] }), _jsx("button", { className: "btn-outline", onClick: handleAddManual, children: "+ Add" })] }), selectedIds.size > 0 && (_jsxs("div", { className: "selection-bar", children: [_jsxs("span", { children: [selectedIds.size, " selected"] }), _jsxs("div", { className: "selection-actions", children: [_jsx("button", { onClick: handleSelectAll, children: selectedIds.size === items.length ? "Deselect All" : "Select All" }), _jsx("button", { onClick: handleDelete, style: { background: '#ff453a' }, children: selectedIds.size === items.length ? "Delete All" : "Delete Artifact" })] })] })), items.length === 0 ? (_jsx("div", { className: `empty-state ${isDragActive ? 'drag-active' : ''}`, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, children: emptyText })) : (_jsx("div", { className: `file-list ${isDragActive ? 'drag-active' : ''}`, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, style: { minHeight: '200px', border: isDragActive ? '2px dashed var(--accent-color)' : 'none' }, children: items.map(item => (_jsxs("div", { className: `file-item ${selectedIds.has(item.id) ? 'selected' : ''}`, onClick: () => toggleSelect(item.id), children: [_jsx("input", { type: "checkbox", checked: selectedIds.has(item.id), readOnly: true }), _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" }), _jsx("line", { x1: "16", y1: "13", x2: "8", y2: "13" }), _jsx("line", { x1: "16", y1: "17", x2: "8", y2: "17" }), _jsx("polyline", { points: "10 9 9 9 8 9" })] }), _jsxs("div", { className: "file-item-info", children: [_jsx("span", { className: "file-item-name", children: item.name }), _jsx("span", { className: "file-item-meta", children: item.size })] })] }, item.id))) }))] }));
}
// ----------------------------------------------------------------------
// SettingsModal
// ----------------------------------------------------------------------
export function SettingsModal({ onClose }) {
    const [activeTab, setActiveTab] = useState("api-keys");
    // API Keys State
    const [openAiKey, setOpenAiKey] = useState("");
    const [anthropicKey, setAnthropicKey] = useState("");
    const [localUrl, setLocalUrl] = useState("");
    // Validation States
    const [openAiStatus, setOpenAiStatus] = useState("idle");
    const [anthropicStatus, setAnthropicStatus] = useState("idle");
    // MCP State
    const [mcps, setMcps] = useState([{ name: "Brave Search API", url: "global" }]);
    const [isAddingMcp, setIsAddingMcp] = useState(false);
    const [newMcpName, setNewMcpName] = useState("");
    useEffect(() => {
        const savedKey = localStorage.getItem("openai_api_key");
        if (savedKey) {
            setOpenAiKey(savedKey);
            setOpenAiStatus("valid"); // Assume valid if saved previously
        }
    }, []);
    const handleSaveApiKeys = async () => {
        localStorage.setItem("openai_api_key", openAiKey);
        // Validate OpenAI
        if (openAiKey) {
            setOpenAiStatus("validating");
            try {
                const res = await fetch("https://api.openai.com/v1/models", {
                    headers: { "Authorization": `Bearer ${openAiKey}` }
                });
                if (res.ok)
                    setOpenAiStatus("valid");
                else
                    setOpenAiStatus("invalid");
            }
            catch (e) {
                setOpenAiStatus("invalid");
            }
        }
        else {
            setOpenAiStatus("idle");
        }
        // Mock Anthropic Validation
        if (anthropicKey) {
            setAnthropicStatus("validating");
            setTimeout(() => setAnthropicStatus("invalid"), 600);
        }
        else {
            setAnthropicStatus("idle");
        }
    };
    const handleSaveMcp = () => {
        if (newMcpName) {
            setMcps(prev => [...prev, { name: newMcpName, url: "local" }]);
            setNewMcpName("");
            setIsAddingMcp(false);
        }
    };
    return (_jsx("div", { className: "modal-overlay", children: _jsxs("div", { className: "modal-content glass-panel", children: [_jsxs("div", { className: "modal-header", children: [_jsx("h2", { children: "Settings" }), _jsx("button", { className: "close-btn icon-btn", onClick: onClose, title: "Close", children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }), _jsxs("div", { className: "modal-body", children: [_jsxs("div", { className: "settings-sidebar", children: [_jsxs("button", { className: `tab-btn ${activeTab === 'api-keys' ? 'active' : ''}`, onClick: () => setActiveTab('api-keys'), children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" }) }), "API Keys"] }), _jsxs("button", { className: `tab-btn ${activeTab === 'mcp' ? 'active' : ''}`, onClick: () => setActiveTab('mcp'), children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "2", width: "20", height: "8", rx: "2", ry: "2" }), _jsx("rect", { x: "2", y: "14", width: "20", height: "8", rx: "2", ry: "2" }), _jsx("line", { x1: "6", y1: "6", x2: "6.01", y2: "6" }), _jsx("line", { x1: "6", y1: "18", x2: "6.01", y2: "18" })] }), "MCP Connections"] }), _jsxs("button", { className: `tab-btn ${activeTab === 'artifacts' ? 'active' : ''}`, onClick: () => setActiveTab('artifacts'), children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" }), _jsx("line", { x1: "16", y1: "13", x2: "8", y2: "13" }), _jsx("line", { x1: "16", y1: "17", x2: "8", y2: "17" }), _jsx("polyline", { points: "10 9 9 9 8 9" })] }), "Global Artifacts"] }), _jsxs("button", { className: `tab-btn ${activeTab === 'skills' ? 'active' : ''}`, onClick: () => setActiveTab('skills'), children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" }) }), "Global Skills"] })] }), _jsxs("div", { className: "settings-content", children: [activeTab === 'api-keys' && (_jsxs("div", { className: "tab-pane", children: [_jsx("h3", { children: "API Keys" }), _jsx("p", { children: "Connect your external AI models to Jarvis. Keys are validated when you save." }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "OpenAI API Key" }), _jsxs("div", { className: "input-with-icon", children: [_jsx("input", { type: "password", placeholder: "sk-...", className: "text-input", value: openAiKey, onChange: e => { setOpenAiKey(e.target.value); setOpenAiStatus("idle"); } }), openAiStatus === "valid" && _jsx("div", { className: "status-icon valid", children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }) }), openAiStatus === "invalid" && _jsx("div", { className: "status-icon invalid", children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Anthropic API Key" }), _jsxs("div", { className: "input-with-icon", children: [_jsx("input", { type: "password", placeholder: "sk-ant-...", className: "text-input", value: anthropicKey, onChange: e => { setAnthropicKey(e.target.value); setAnthropicStatus("idle"); } }), anthropicStatus === "valid" && _jsx("div", { className: "status-icon valid", children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }) }), anthropicStatus === "invalid" && _jsx("div", { className: "status-icon invalid", children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Local Provider URL (e.g. LMStudio, Ollama)" }), _jsx("input", { type: "text", placeholder: "http://localhost:11434/v1", className: "text-input", value: localUrl, onChange: e => setLocalUrl(e.target.value) })] }), _jsx("div", { className: "settings-footer", children: _jsx("button", { className: "btn-primary", onClick: handleSaveApiKeys, children: openAiStatus === "validating" || anthropicStatus === "validating" ? "Validating..." : "Save API Keys" }) })] })), activeTab === 'mcp' && (_jsxs("div", { className: "tab-pane", children: [_jsx("h3", { children: "Model Context Protocol (MCP)" }), _jsx("p", { children: "Import external tools and contextual connections like Claude Desktop does." }), _jsxs("div", { className: "mcp-list", children: [mcps.map((mcp, idx) => (_jsxs("div", { className: "mcp-card", children: [_jsxs("div", { className: "mcp-info", children: [_jsx("h4", { children: mcp.name }), _jsxs("span", { children: ["Active \u2022 ", mcp.url] })] }), _jsx("button", { className: "btn-outline", children: "Configure" })] }, idx))), isAddingMcp ? (_jsxs("div", { className: "mcp-form", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Server Name" }), _jsx("input", { type: "text", className: "text-input", value: newMcpName, onChange: e => setNewMcpName(e.target.value), autoFocus: true })] }), _jsxs("div", { className: "form-actions", children: [_jsx("button", { className: "btn-outline", onClick: () => setIsAddingMcp(false), children: "Cancel" }), _jsx("button", { className: "btn-primary", onClick: handleSaveMcp, children: "Save" })] })] })) : (_jsx("button", { className: "add-mcp-btn", onClick: () => setIsAddingMcp(true), children: "+ Add New MCP Server" }))] })] })), activeTab === 'artifacts' && (_jsx(FileManagerTab, { title: "Global Artifacts", description: "Manage code snippets, markdown files, and data. Drag and drop files here to import.", emptyText: "Drop files here to upload, or click + Add" })), activeTab === 'skills' && (_jsx(FileManagerTab, { title: "Global Skills", description: "Manage custom functions and Python scripts. Drag and drop files here to import.", emptyText: "Drop python scripts here, or click + Add" }))] })] })] }) }));
}
