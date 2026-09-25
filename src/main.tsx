import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store/store";
import "./neutral.css";
import "./blender.css";
import "./workspace-fixes.css";
import "./refined.css";
import "./refresh.css";

import { AgentCursor } from "./components/AgentCursor";

// A mesma página serve a janela do cursor próprio do agente (`index.html#agent-cursor`, criada por computer.rs).
const isCursorWindow = window.location.hash === "#agent-cursor";
if (isCursorWindow) document.documentElement.classList.add("agent-cursor-page");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isCursorWindow ? <AgentCursor /> : <StoreProvider><App /></StoreProvider>,
);
