import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store/store";
import "./neutral.css";
import "./blender.css";
import "./workspace-fixes.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StoreProvider><App /></StoreProvider>,
);
