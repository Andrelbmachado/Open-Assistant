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
        return <AgentsView />;
      case "projects":
        return <ProjectsView />;
      case "terminal":
        return <TerminalPane />;
      case "chat":
        return <ChatPane />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="screen-noise"></div>
      <div className="scanline"></div>
      
      <main className="jarvis-shell" style={{ gridTemplateColumns: `${isLeftCollapsed ? '64px' : '190px'} 1fr` }}>
        <header className="topbar">
          <div className="brand-block">
            <span className="brand">STARK INDUSTRIES</span>
            <span className="system-online">SYSTEM ONLINE</span>
          </div>

          <nav className="top-icons" aria-label="atalhos superiores">
            <span></span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span></span>
          </nav>

          <div className="time-block">
            <span>{time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
            <strong>{time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
        </header>

        <Sidebar 
          currentView={currentView}
          isCollapsed={isLeftCollapsed}
          onToggle={() => setIsLeftCollapsed(!isLeftCollapsed)}
          onNavigate={(view) => {
            if (view === 'settings') {
              setIsSettingsOpen(true);
            } else {
              setCurrentView(view);
            }
          }}
        />

        {currentView === 'dashboard' ? (
          <JarvisDashboard />
        ) : (
          <div className="panel" style={{ gridArea: 'core', display: 'flex', gap: '14px', height: '100%' }}>
             <div style={{ flex: 1, position: 'relative' }}>
                {renderMainContent()}
             </div>
             
             {/* Always show context pane when in terminal view */}
             {currentView === 'terminal' && (
                <div style={{ width: isRightCollapsed ? '64px' : '320px', borderLeft: '1px solid var(--cyan-soft)', paddingLeft: isRightCollapsed ? '0' : '14px', position: 'relative', transition: 'width 0.3s' }}>
                  <ContextPane isCollapsed={isRightCollapsed} onToggle={() => setIsRightCollapsed(!isRightCollapsed)} currentView={currentView} />
                </div>
             )}
          </div>
        )}
      </main>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
}
