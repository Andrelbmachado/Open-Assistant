import React from "react";

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ currentView, onNavigate, isCollapsed, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar panel" style={{ width: isCollapsed ? '64px' : 'auto', transition: 'width 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', marginBottom: '15px' }}>
        {!isCollapsed && <div className="side-heading" style={{ padding: 0, border: 'none' }}>› JARVIS</div>}
        <button onClick={onToggle} style={{ background: 'transparent', border: 'none', color: 'var(--cyan)', cursor: 'pointer', padding: '4px', margin: isCollapsed ? '0 auto' : '0' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
        </button>
      </div>
      
      <a 
        className={currentView === 'dashboard' ? 'active' : ''} 
        onClick={() => onNavigate('dashboard')}
      >
        <i></i>DASHBOARD
      </a>
      
      <a 
        className={currentView === 'terminal' ? 'active' : ''} 
        onClick={() => onNavigate('terminal')}
      >
        <i></i>TERMINAL
      </a>
      
      <a 
        className={currentView === 'agents' ? 'active' : ''} 
        onClick={() => onNavigate('agents')}
      >
        <i></i>AGENTS
      </a>
      
      <a 
        className={currentView === 'settings' ? 'active' : ''} 
        onClick={() => onNavigate('settings')}
      >
        <i></i>SETTINGS
      </a>
      
      <div className="user-card">
        <small>USER</small>
        <span>T. STARK</span>
      </div>
    </aside>
  );
}
