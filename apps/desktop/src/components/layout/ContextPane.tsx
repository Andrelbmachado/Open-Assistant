import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import "./ContextPane.css";

interface ContextPaneProps {
  isCollapsed: boolean;
  onToggle: () => void;
  currentView?: string;
  position?: 'right' | 'bottom' | 'floating';
  onPositionChange?: (pos: 'right' | 'bottom' | 'floating') => void;
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  command?: string;
}

export function ContextPane({ isCollapsed, onToggle, currentView, position = 'right', onPositionChange, onClose }: ContextPaneProps) {
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'msg-0',
    role: 'assistant',
    content: 'Hello! I can help you run commands in the terminal, install packages, or automate shell tasks. What do you need?'
  }]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleTerminalAI = async () => {
    if (!chatInput.trim() || isGenerating) return;
    
    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Please configure your OpenAI API Key in Settings first.");
      return;
    }

    const userPrompt = chatInput.trim();
    setChatInput("");
    setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'user', content: userPrompt }]);
    setIsGenerating(true);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert Terminal Assistant operating on a Windows PowerShell environment. 
The user will ask you to perform OS tasks.
You MUST output a JSON object with exactly two keys:
1. "message": A short, friendly, natural language explanation of what you are doing (e.g., "Criando a pasta de testes...").
2. "command": The exact, valid PowerShell/CMD command string to execute the requested action. Use standard Windows commands (like 'mkdir', 'cd', 'ls', 'echo', etc.). If the user is just chatting and doesn't need a command, send an empty string "" for command.`
            },
            ...messages.filter(m => m.id !== 'msg-0').map(m => ({ role: m.role, content: m.content })),
            {
              role: "user",
              content: userPrompt
            }
          ]
        })
      });

      if (!response.ok) throw new Error("API Request Failed");

      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);

      setMessages(prev => [...prev, { 
        id: `msg-${Date.now()}-ai`, 
        role: 'assistant', 
        content: parsed.message || "Executando comando.",
        command: parsed.command 
      }]);

      if (parsed.command && parsed.command.trim() !== "") {
        // Dispatch event to TerminalPane
        window.dispatchEvent(new CustomEvent('terminal-execute', {
          detail: { command: parsed.command }
        }));
      }

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: `msg-${Date.now()}-err`, role: 'assistant', content: '❌ Error connecting to OpenAI. See console.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  if (currentView === 'terminal') {
    const paneContent = (
      <aside className={`context-pane ${position === 'floating' ? 'floating-panel' : ''}`} style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
        <div className="pane-header pane-handle" style={{ paddingBottom: '14px', borderBottom: '1px solid rgba(33, 231, 255, 0.2)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: position === 'floating' ? 'move' : 'default' }}>
          <h3 style={{ color: 'var(--cyan)', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
            Terminal AI
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onPositionChange && (
              <>
                <button 
                  onClick={() => onPositionChange('floating')} 
                  style={{ background: position === 'floating' ? 'var(--cyan-soft)' : 'transparent', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }} 
                  title="Flutuar Tela"
                >
                  🪟
                </button>
                <button 
                  onClick={() => onPositionChange(position === 'right' ? 'bottom' : 'right')} 
                  style={{ background: 'transparent', border: '1px solid var(--cyan-soft)', color: 'var(--cyan)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }} 
                  title={`Acoplar em ${position === 'right' ? 'Baixo' : 'Direita'}`}
                >
                  {position === 'right' ? '⬇️' : '➡️'}
                </button>
              </>
            )}
            {onClose && (
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#ff4c6a', cursor: 'pointer', padding: '4px' }} title="Fechar Terminal AI">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
          </div>
        </div>
        
        {!isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 60px)' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map(msg => (
                <div key={msg.id} className={msg.role === 'assistant' ? 'system-msg' : 'user-msg'}>
                  {msg.role === 'assistant' && <span className="ai-badge" style={{marginBottom: '6px'}}>AI</span>}
                  <p>{msg.content}</p>
                  {msg.command && (
                    <div style={{marginTop: '8px', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#ffd60a'}}>
                      &gt; {msg.command}
                    </div>
                  )}
                </div>
              ))}
              {isGenerating && (
                <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                   <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>
                   <span style={{marginLeft: '8px', fontSize: '12px'}}>Pensando...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <div style={{ 
              display: 'grid', gridTemplateColumns: '1fr 50px', alignItems: 'center', 
              padding: '0 22px', background: 'linear-gradient(90deg, transparent, rgba(33, 231, 255, 0.09), transparent)', 
              borderTop: '1px solid rgba(33, 231, 255, 0.22)', borderBottom: '1px solid rgba(33, 231, 255, 0.22)', 
              clipPath: 'polygon(20px 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 20px 100%, 0 50%)',
              height: '64px',
              marginTop: '10px'
            }}>
              <input 
                type="text" 
                placeholder="ASK J.A.R.V.I.S..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTerminalAI();
                }}
                disabled={isGenerating}
                style={{
                  background: 'transparent', border: '1px solid rgba(33, 231, 255, 0.15)',
                  height: '34px', color: 'rgba(203, 247, 255, 0.72)', fontSize: '16px', 
                  outline: 'none', paddingLeft: '18px', width: '100%', fontFamily: 'inherit'
                }}
              />
              <button 
                onClick={handleTerminalAI}
                disabled={!chatInput.trim() || isGenerating}
                style={{
                  background: 'transparent', color: 'var(--cyan)', border: 'none',
                  cursor: 'pointer', opacity: (!chatInput.trim() || isGenerating) ? 0.5 : 1,
                  display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        )}
      </aside>
    );

    if (position === 'floating') {
      return (
        <Rnd
          default={{
            x: window.innerWidth / 2 - 175,
            y: window.innerHeight / 2 - 250,
            width: 350,
            height: 500,
          }}
          minWidth={280}
          minHeight={300}
          bounds="window"
          dragHandleClassName="pane-handle"
          style={{ zIndex: 1000 }}
        >
          {paneContent}
        </Rnd>
      );
    }

    return paneContent;
  }

  return (
    <aside className={`context-pane glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="pane-header">
        {!isCollapsed && <h3>System Context</h3>}
        <button onClick={onToggle} style={{ background: 'transparent', border: 'none', color: 'var(--cyan)', cursor: 'pointer', padding: '4px', margin: isCollapsed ? '0 auto' : '0' }} title="Toggle Sidebar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
        </button>
      </div>

      {!isCollapsed && (
        <div className="context-sections">
          <div className="section">
            <div className="section-header">
              <h4>Active Agents</h4>
              <span className="badge">1</span>
            </div>
            <div className="agent-card running">
              <div className="agent-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              </div>
              <div className="agent-info">
                <span className="agent-name">System Monitor</span>
                <span className="agent-status">Running idle</span>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h4>Recent Artifacts</h4>
            </div>
            <div className="artifact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>implementation_plan.md</span>
            </div>
            <div className="artifact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>task.md</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
