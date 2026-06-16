import React from "react";
import "./ProjectsView.css";

export function ProjectsView() {
  return (
    <main className="projects-view">
      <div className="view-header">
        <h2>My Projects</h2>
        <button className="btn-primary">+ New Project</button>
      </div>
      
      <div className="projects-grid">
        <div className="project-card">
          <div className="project-header">
            <h3>Website Redesign</h3>
            <span className="project-status active">Active</span>
          </div>
          <p>Jarvis is managing the frontend and backend agents for this project.</p>
          <div className="project-stats">
            <span>3 Agents</span>
            <span>12 Artifacts</span>
            <span>2 Skills</span>
          </div>
        </div>
        
        <div className="project-card">
          <div className="project-header">
            <h3>Data Analysis Report</h3>
            <span className="project-status idle">Idle</span>
          </div>
          <p>Automated market analysis and CSV parsing.</p>
          <div className="project-stats">
            <span>1 Agent</span>
            <span>4 Artifacts</span>
            <span>1 Skill</span>
          </div>
        </div>
      </div>
    </main>
  );
}
