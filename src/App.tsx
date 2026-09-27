import { WorkflowService } from "./components/WorkflowService";
import { RemoteTaskHost } from "./components/RemoteTaskHost";
import { DreamService } from "./components/DreamService";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import "./App.css";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { useStore } from "./store/store";
import { useMemoryFileSync } from "./store/memoryFile";

export default function App() {
  const { state, dispatch } = useStore();
  useMemoryFileSync();
  // O robô-mouse anda na velocidade escolhida no menu "+" (o Rust guarda para a próxima tarefa).
  useEffect(() => { invoke("robot_set_speed", { speed: state.robotSpeed }).catch(() => undefined); }, [state.robotSpeed]);
  useEffect(() => {
    invoke("app_ready").catch(() => undefined);
    const shortcuts = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "p") { event.preventDefault(); dispatch({ type: "palette", open: true }); }
      if (event.key === "Escape") { dispatch({ type: "palette", open: false }); dispatch({ type: "settings", open: false }); }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [dispatch]);
  return <div className="app-shell"><TitleBar /><div className="app-body"><Sidebar /><Workspace /></div><SettingsView /><CommandPalette /><WorkflowService /><RemoteTaskHost /><DreamService /></div>;
}
