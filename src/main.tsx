import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { BackendContext, loadBackend } from "./lib/backend.ts";
import "./styles/tokens.css";
import "./styles/island.css";

const backend = await loadBackend();
// Only the browser preview gets a stand-in wallpaper; the real window is transparent.
if (backend.kind === "preview") document.documentElement.dataset.preview = "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BackendContext.Provider value={backend}>
      <App />
    </BackendContext.Provider>
  </StrictMode>,
);
