import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { ChatPane } from "./ChatPane";
import { ContextPane } from "./ContextPane";
import { SettingsModal } from "../../features/SettingsModal";
import { AgentsView } from "../../features/AgentsView";
import { ProjectsView } from "../../features/ProjectsView";
import { TerminalPane } from "../../features/TerminalPane";
import { JarvisDashboard } from "./JarvisDashboard";
export function AppShell() {
    const [currentView, setCurrentView] = useState("dashboard");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
    const [isRightCollapsed, setIsRightCollapsed] = useState(false);
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    const renderMainContent = () => {
        switch (currentView) {
            case "agents":
                return _jsx(AgentsView, {});
            case "projects":
                return _jsx(ProjectsView, {});
            case "terminal":
                return _jsx(TerminalPane, {});
            case "chat":
                return _jsx(ChatPane, {});
            default:
                return null;
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "screen-noise" }), _jsx("div", { className: "scanline" }), _jsxs("main", { className: "jarvis-shell", style: { gridTemplateColumns: `${isLeftCollapsed ? '64px' : '190px'} 1fr` }, children: [_jsxs("header", { className: "topbar", children: [_jsxs("div", { className: "brand-block", children: [_jsx("span", { className: "brand", children: "STARK INDUSTRIES" }), _jsx("span", { className: "system-online", children: "SYSTEM ONLINE" })] }), _jsxs("nav", { className: "top-icons", "aria-label": "atalhos superiores", children: [_jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {}), _jsx("span", {})] }), _jsxs("div", { className: "time-block", children: [_jsx("span", { children: time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() }), _jsx("strong", { children: time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) })] })] }), _jsx(Sidebar, { currentView: currentView, isCollapsed: isLeftCollapsed, onToggle: () => setIsLeftCollapsed(!isLeftCollapsed), onNavigate: (view) => {
                            if (view === 'settings') {
                                setIsSettingsOpen(true);
                            }
                            else {
                                setCurrentView(view);
                            }
                        } }), currentView === 'dashboard' ? (_jsx(JarvisDashboard, {})) : (_jsxs("div", { className: "panel", style: { gridArea: 'core', display: 'flex', gap: '14px', height: '100%' }, children: [_jsx("div", { style: { flex: 1, position: 'relative' }, children: renderMainContent() }), currentView === 'terminal' && (_jsx("div", { style: { width: isRightCollapsed ? '64px' : '320px', borderLeft: '1px solid var(--cyan-soft)', paddingLeft: isRightCollapsed ? '0' : '14px', position: 'relative', transition: 'width 0.3s' }, children: _jsx(ContextPane, { isCollapsed: isRightCollapsed, onToggle: () => setIsRightCollapsed(!isRightCollapsed), currentView: currentView }) }))] }))] }), isSettingsOpen && _jsx(SettingsModal, { onClose: () => setIsSettingsOpen(false) })] }));
}
