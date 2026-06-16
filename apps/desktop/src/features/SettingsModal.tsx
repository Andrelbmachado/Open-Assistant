import React, { useState, useEffect } from "react";
import "./SettingsModal.css";

interface SettingsModalProps {
  onClose: () => void;
}

// ----------------------------------------------------------------------
// FileManagerTab (used for Artifacts and Skills)
// ----------------------------------------------------------------------
function FileManagerTab({ title, description, emptyText }: { title: string, description: string, emptyText: string }) {
  const [items, setItems] = useState<{id: string, name: string, size: string}[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
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

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(newSet => new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handleDelete = () => {
    setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
  };

  return (
    <div className="tab-pane">
      <div className="file-manager-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button className="btn-outline" onClick={handleAddManual}>+ Add</button>
      </div>

      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span>{selectedIds.size} selected</span>
          <div className="selection-actions">
            <button onClick={handleSelectAll}>
              {selectedIds.size === items.length ? "Deselect All" : "Select All"}
            </button>
            <button onClick={handleDelete} style={{ background: '#ff453a' }}>
              {selectedIds.size === items.length ? "Delete All" : "Delete Artifact"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div 
          className={`empty-state ${isDragActive ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {emptyText}
        </div>
      ) : (
        <div 
          className={`file-list ${isDragActive ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ minHeight: '200px', border: isDragActive ? '2px dashed var(--accent-color)' : 'none' }}
        >
          {items.map(item => (
            <div 
              key={item.id} 
              className={`file-item ${selectedIds.has(item.id) ? 'selected' : ''}`}
              onClick={() => toggleSelect(item.id)}
            >
              <input type="checkbox" checked={selectedIds.has(item.id)} readOnly />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <div className="file-item-info">
                <span className="file-item-name">{item.name}</span>
                <span className="file-item-meta">{item.size}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// SettingsModal
// ----------------------------------------------------------------------
export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState("api-keys");
  
  // API Keys State
  const [openAiKey, setOpenAiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  
  // Validation States
  const [openAiStatus, setOpenAiStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [anthropicStatus, setAnthropicStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle");

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
        if (res.ok) setOpenAiStatus("valid");
        else setOpenAiStatus("invalid");
      } catch (e) {
        setOpenAiStatus("invalid");
      }
    } else {
      setOpenAiStatus("idle");
    }

    // Mock Anthropic Validation
    if (anthropicKey) {
      setAnthropicStatus("validating");
      setTimeout(() => setAnthropicStatus("invalid"), 600);
    } else {
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

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn icon-btn" onClick={onClose} title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-sidebar">
            <button className={`tab-btn ${activeTab === 'api-keys' ? 'active' : ''}`} onClick={() => setActiveTab('api-keys')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
              API Keys
            </button>
            <button className={`tab-btn ${activeTab === 'mcp' ? 'active' : ''}`} onClick={() => setActiveTab('mcp')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
              MCP Connections
            </button>
            <button className={`tab-btn ${activeTab === 'artifacts' ? 'active' : ''}`} onClick={() => setActiveTab('artifacts')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Global Artifacts
            </button>
            <button className={`tab-btn ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
              Global Skills
            </button>
          </div>

          <div className="settings-content">
            {activeTab === 'api-keys' && (
              <div className="tab-pane">
                <h3>API Keys</h3>
                <p>Connect your external AI models to Jarvis. Keys are validated when you save.</p>
                
                <div className="form-group">
                  <label>OpenAI API Key</label>
                  <div className="input-with-icon">
                    <input 
                      type="password" 
                      placeholder="sk-..." 
                      className="text-input" 
                      value={openAiKey}
                      onChange={e => { setOpenAiKey(e.target.value); setOpenAiStatus("idle"); }}
                    />
                    {openAiStatus === "valid" && <div className="status-icon valid"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>}
                    {openAiStatus === "invalid" && <div className="status-icon invalid"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>}
                  </div>
                </div>

                <div className="form-group">
                  <label>Anthropic API Key</label>
                  <div className="input-with-icon">
                    <input 
                      type="password" 
                      placeholder="sk-ant-..." 
                      className="text-input" 
                      value={anthropicKey}
                      onChange={e => { setAnthropicKey(e.target.value); setAnthropicStatus("idle"); }}
                    />
                    {anthropicStatus === "valid" && <div className="status-icon valid"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>}
                    {anthropicStatus === "invalid" && <div className="status-icon invalid"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>}
                  </div>
                </div>

                <div className="form-group">
                  <label>Local Provider URL (e.g. LMStudio, Ollama)</label>
                  <input 
                    type="text" 
                    placeholder="http://localhost:11434/v1" 
                    className="text-input" 
                    value={localUrl}
                    onChange={e => setLocalUrl(e.target.value)}
                  />
                </div>

                <div className="settings-footer">
                  <button className="btn-primary" onClick={handleSaveApiKeys}>
                    {openAiStatus === "validating" || anthropicStatus === "validating" ? "Validating..." : "Save API Keys"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'mcp' && (
              <div className="tab-pane">
                <h3>Model Context Protocol (MCP)</h3>
                <p>Import external tools and contextual connections like Claude Desktop does.</p>
                <div className="mcp-list">
                  {mcps.map((mcp, idx) => (
                    <div className="mcp-card" key={idx}>
                      <div className="mcp-info">
                        <h4>{mcp.name}</h4>
                        <span>Active • {mcp.url}</span>
                      </div>
                      <button className="btn-outline">Configure</button>
                    </div>
                  ))}
                  
                  {isAddingMcp ? (
                    <div className="mcp-form">
                      <div className="form-group">
                        <label>Server Name</label>
                        <input type="text" className="text-input" value={newMcpName} onChange={e => setNewMcpName(e.target.value)} autoFocus />
                      </div>
                      <div className="form-actions">
                        <button className="btn-outline" onClick={() => setIsAddingMcp(false)}>Cancel</button>
                        <button className="btn-primary" onClick={handleSaveMcp}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <button className="add-mcp-btn" onClick={() => setIsAddingMcp(true)}>+ Add New MCP Server</button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'artifacts' && (
              <FileManagerTab 
                title="Global Artifacts" 
                description="Manage code snippets, markdown files, and data. Drag and drop files here to import." 
                emptyText="Drop files here to upload, or click + Add" 
              />
            )}

            {activeTab === 'skills' && (
              <FileManagerTab 
                title="Global Skills" 
                description="Manage custom functions and Python scripts. Drag and drop files here to import." 
                emptyText="Drop python scripts here, or click + Add" 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
