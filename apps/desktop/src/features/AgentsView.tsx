import React, { useState } from "react";
import { AgentNodeEditor } from "./AgentNodeEditor";
import "./AgentsView.css";

export interface Agent {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: "1", name: "Data Analyst Agent", description: "Processes raw data and outputs JSON.", updatedAt: "2 hours ago" },
    { id: "2", name: "Web Scraper", description: "Extracts information from specific URLs.", updatedAt: "1 day ago" }
  ]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);

  const handleCreateAgent = () => {
    const newAgent: Agent = {
      id: Math.random().toString(36).substr(2, 9),
      name: "New Agent",
      description: "A newly created agent.",
      updatedAt: "Just now"
    };
    setAgents([newAgent, ...agents]);
    setCurrentAgent(newAgent);
  };

  if (currentAgent) {
    return <AgentNodeEditor agent={currentAgent} onBack={() => setCurrentAgent(null)} />;
  }

  return (
    <div className="agents-overview">
      <div className="overview-header">
        <h2>Your Agents</h2>
        <button className="btn-primary" onClick={handleCreateAgent}>+ Create Agent</button>
      </div>

      {agents.length === 0 ? (
        <div className="empty-agents glass-panel">
          <h3>No agents yet</h3>
          <p>Create your first AI agent to automate workflows.</p>
          <button className="btn-primary" onClick={handleCreateAgent}>Create Agent</button>
        </div>
      ) : (
        <div className="agents-grid">
          {agents.map(agent => (
            <div key={agent.id} className="agent-card glass-panel" onClick={() => setCurrentAgent(agent)}>
              <div className="agent-card-header">
                <div className="agent-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                </div>
                <h4>{agent.name}</h4>
              </div>
              <p>{agent.description}</p>
              <div className="agent-card-footer">
                <span>Updated {agent.updatedAt}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
