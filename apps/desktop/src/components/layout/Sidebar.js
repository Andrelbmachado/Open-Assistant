import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
export function Sidebar({ currentView, onNavigate, isCollapsed, onToggle }) {
    if (isCollapsed) {
        return (_jsx("button", { onClick: onToggle, style: {
                position: 'fixed',
                left: '10px',
                top: '70px',
                zIndex: 1000,
                background: 'transparent',
                border: 'none',
                color: 'var(--cyan)',
                cursor: 'pointer',
                padding: '6px'
            }, title: "Open Sidebar", children: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }), _jsx("line", { x1: "9", y1: "3", x2: "9", y2: "21" })] }) }));
    }
    return (_jsxs("aside", { className: "sidebar panel", children: [_jsxs("div", { className: "side-heading", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px', marginBottom: '15px' }, children: [_jsx("span", { children: "\u203A JARVIS" }), _jsx("button", { onClick: onToggle, style: { background: 'transparent', border: 'none', color: 'var(--cyan)', cursor: 'pointer' }, title: "Collapse Sidebar", children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }), _jsx("line", { x1: "9", y1: "3", x2: "9", y2: "21" })] }) })] }), _jsxs("a", { className: currentView === 'dashboard' ? 'active' : '', onClick: () => onNavigate('dashboard'), children: [_jsx("i", {}), "DASHBOARD"] }), _jsxs("a", { className: currentView === 'terminal' ? 'active' : '', onClick: () => onNavigate('terminal'), children: [_jsx("i", {}), "TERMINAL"] }), _jsxs("a", { className: currentView === 'agents' ? 'active' : '', onClick: () => onNavigate('agents'), children: [_jsx("i", {}), "AGENTS"] }), _jsx("div", { style: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }, children: _jsxs("a", { className: currentView === 'settings' ? 'active' : '', onClick: () => onNavigate('settings'), style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderTop: '1px solid rgba(33,231,255,0.2)' }, children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" })] }), "CONFIGURA\u00C7\u00D5ES"] }) })] }));
}
