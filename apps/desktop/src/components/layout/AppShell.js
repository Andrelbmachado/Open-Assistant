import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Command } from '@tauri-apps/plugin-shell';
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
    const [aiTerminalPosition, setAiTerminalPosition] = useState('right');
    const [isAiTerminalOpen, setIsAiTerminalOpen] = useState(true);
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
                return _jsx(TerminalPane, { onOpenAiTerminal: () => setIsAiTerminalOpen(true), isAiTerminalOpen: isAiTerminalOpen });
            case "chat":
                return _jsx(ChatPane, {});
            default:
                return null;
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "screen-noise" }), _jsxs("main", { className: "jarvis-shell", style: { gridTemplateColumns: `${isLeftCollapsed ? '0px' : '190px'} 1fr` }, children: [_jsxs("header", { className: "topbar", style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }, children: [_jsx("div", { className: "brand-block", style: { justifySelf: 'start' }, children: _jsx("span", { className: "brand", children: "OPEN ASSISTANT" }) }), _jsxs("nav", { className: "top-icons", "aria-label": "atalhos superiores", style: { display: 'flex', gap: '15px', justifySelf: 'center' }, children: [_jsx("button", { className: "hex-btn", onClick: () => Command.create('powershell', ['Start-Process', 'chrome.exe']).execute(), title: "Launch Chrome", children: _jsxs("svg", { viewBox: "0 0 24 24", width: "20", height: "20", fill: "var(--cyan)", children: [_jsx("path", { d: "M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10 5.52 0 10-4.48 10-10 0-5.52-4.48-10-10-10zm0 18c-4.41 0-8-3.59-8-8 0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z" }), _jsx("path", { d: "M12 7c-2.76 0-5 2.24-5 5 0 .65.13 1.26.36 1.83l2.92-5.06c.53-.47 1.23-.77 1.72-.77h6.63c-1.39-1.84-3.8-3-6.63-3zm5.72 2.37l-3.32 5.75c-.38.65-.91 1.18-1.56 1.55l-2.45-4.25c.34-.14.73-.24 1.13-.24 1.73 0 3.23 1.07 3.84 2.62h6.14c-.65-2.27-2.14-4.21-3.78-5.43zM5.33 11c0 1.25.35 2.41.95 3.42l3.32-5.75c.42-.72 1.05-1.31 1.81-1.67L8.96 2.76C6.18 4.25 4.19 6.88 5.33 11zm6.67 6c-1.52 0-2.88-.67-3.8-1.72l-2.92 5.06c1.86.82 4.09 1.03 6.32.66h.01l-2.93-5.08c-.46.12-.95.18-1.46.18z" })] }) }), _jsx("button", { className: "hex-btn", onClick: () => Command.create('powershell', ['Start-Process', 'spotify.exe']).execute(), title: "Launch Spotify", children: _jsx("svg", { viewBox: "0 0 24 24", width: "20", height: "20", fill: "var(--cyan)", children: _jsx("path", { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.6 14.4c-.18.3-.57.4-.87.22-2.36-1.44-5.35-1.77-8.86-.97-.33.08-.66-.13-.74-.45-.08-.33.13-.66.45-.74 3.81-.86 7.12-.48 9.8 1.15.3.18.4.57.22.87zm1.2-2.7c-.23.36-.7.48-1.07.25-2.7-1.66-6.84-2.16-9.98-1.18-.4.12-.82-.1-.95-.5-.12-.4.1-.82.5-.95 3.6-1.12 8.24-.57 11.35 1.34.37.23.49.7.25 1.07zm.1-2.8c-3.23-1.92-8.56-2.1-11.66-1.16-.48.15-1-.12-1.15-.6-.15-.48.12-1 .6-1.15 3.55-1.08 9.47-.88 13.2 1.34.43.26.57.84.3 1.28-.27.42-.84.56-1.28.29z" }) }) }), _jsx("button", { className: "hex-btn", onClick: () => Command.create('powershell', ['Start-Process', 'blender.exe']).execute(), title: "Launch Blender", children: _jsx("svg", { viewBox: "0 0 24 24", width: "20", height: "20", fill: "var(--cyan)", children: _jsx("path", { d: "M16.29 9.61a5.61 5.61 0 1 0 0 11.23 5.61 5.61 0 0 0 0-11.23zm0 8.7a3.09 3.09 0 1 1 0-6.18 3.09 3.09 0 0 1 0 6.18zm-2.03-9.52c-.68.68-1.37 1.36-2.06 2.05-1.3-1.57-2.7-3.1-4.08-4.64.9-.76 1.84-1.48 2.82-2.15 1.13 1.55 2.22 3.14 3.32 4.74zM8.32 3.7c1.32-.82 2.72-1.55 4.16-2.18l3.6 4.96c-.66.6-1.32 1.2-1.98 1.8-1.9-2.6-3.8-5.2-5.78-4.58zm-1.07.6c1.68-.42 3.36-.6 5.08-.52 1.55.08 3.07.38 4.54.88L15 6.64c-.45-.25-.92-.47-1.4-.64-1.23-.44-2.5-.66-3.8-.66-1.2 0-2.38.16-3.52.48l1.97 2.68zM5.56 5.37C4.1 6.8 2.88 8.44 1.94 10.23c-1.3 2.5-1.95 5.2-1.94 7.95 0 2.22.42 4.4 1.22 6.42l6.23-8.8c.22 1.12.63 2.18 1.2 3.14.7 1.18 1.63 2.18 2.73 2.94-1.1-1.45-2.04-3.03-2.8-4.66L5.56 5.37z" }) }) }), _jsx("button", { className: "hex-btn", onClick: () => Command.create('powershell', ['Start-Process', 'code']).execute(), title: "Launch VS Code", children: _jsx("svg", { viewBox: "0 0 24 24", width: "20", height: "20", fill: "var(--cyan)", children: _jsx("path", { d: "M17.48 1.98l-6.4 5.2-4.14-3.66L0 6.62l16.14 11.53V1.98zm-9.33 11.66l-4.14 3.66 6.94 3.1v-6.76l-2.8-2.5 4.25-3.47 5.12-4.16L1.37 14.28z" }) }) })] }), _jsxs("div", { className: "time-block", style: { justifySelf: 'end' }, children: [_jsx("span", { children: time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() }), _jsx("strong", { children: time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) })] })] }), _jsx(Sidebar, { currentView: currentView, isCollapsed: isLeftCollapsed, onToggle: () => setIsLeftCollapsed(!isLeftCollapsed), onNavigate: (view) => {
                            if (view === 'settings') {
                                setIsSettingsOpen(true);
                            }
                            else {
                                setCurrentView(view);
                            }
                        } }), currentView === 'dashboard' ? (_jsx(JarvisDashboard, {})) : (_jsxs("div", { className: "panel", style: { gridArea: 'core', display: 'flex', flexDirection: (currentView === 'terminal' && aiTerminalPosition === 'bottom') ? 'column' : 'row', gap: '14px', height: '100%' }, children: [_jsx("div", { style: { flex: 1, position: 'relative', overflow: 'hidden' }, children: renderMainContent() }), currentView === 'terminal' && isAiTerminalOpen && (_jsx("div", { style: {
                                    width: aiTerminalPosition === 'right' ? '320px' : '100%',
                                    height: aiTerminalPosition === 'bottom' ? '280px' : '100%',
                                    borderLeft: aiTerminalPosition === 'right' ? '1px solid var(--cyan-soft)' : 'none',
                                    borderTop: aiTerminalPosition === 'bottom' ? '1px solid var(--cyan-soft)' : 'none',
                                    paddingLeft: aiTerminalPosition === 'right' ? '14px' : '0',
                                    paddingTop: aiTerminalPosition === 'bottom' ? '14px' : '0',
                                    position: 'relative',
                                    transition: 'all 0.3s'
                                }, children: _jsx(ContextPane, { isCollapsed: false, onToggle: () => { }, currentView: currentView, position: aiTerminalPosition, onPositionChange: setAiTerminalPosition, onClose: () => setIsAiTerminalOpen(false) }) }))] }))] }), isSettingsOpen && _jsx(SettingsModal, { onClose: () => setIsSettingsOpen(false) })] }));
}
