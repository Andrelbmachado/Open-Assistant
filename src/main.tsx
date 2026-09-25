import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store/store";
import "./neutral.css";
import "./blender.css";
import "./workspace-fixes.css";
import "./refined.css";
import "./refresh.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StoreProvider><App /></StoreProvider>,
);
