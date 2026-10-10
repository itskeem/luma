import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadPetBackend } from "./petBackend.ts";
import PetApp from "./PetApp.tsx";
import "./pet.css";

const backend = await loadPetBackend();
if (backend.kind === "preview") document.documentElement.dataset.preview = "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PetApp backend={backend} />
  </StrictMode>,
);
