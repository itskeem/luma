// The one seam between the UI and the outside world. In the desktop app it is
// Tauri's IPC. In a plain browser (design and UI work with `npm run dev`) it is
// a clearly labelled preview simulator, never used inside the real app.

import { createContext, useContext } from "react";
import type { ControlAction, MediaState, Settings } from "../types.ts";

export type Unlisten = () => void;

export interface PreviewControls {
  scenarios: readonly string[];
  scenario: () => string;
  setScenario: (name: string) => void;
}

export interface Backend {
  kind: "tauri" | "preview";
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<Settings>;
  getMediaState(): Promise<MediaState>;
  getArtwork(id: string): Promise<string | null>;
  mediaCommand(action: ControlAction): void;
  pinPlayer(id: string | null): void;
  /** Window size in logical px, shadow margin included. */
  setIslandSize(width: number, height: number): Promise<void>;
  startDragging(): void;
  hideIsland(): void;
  quitApp(): void;
  onMediaState(cb: (s: MediaState) => void): Promise<Unlisten>;
  onSettings(cb: (s: Settings) => void): Promise<Unlisten>;
  onNavigate(cb: (view: string) => void): Promise<Unlisten>;
  preview?: PreviewControls;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function loadBackend(): Promise<Backend> {
  if (inTauri) return (await import("./tauriBackend.ts")).tauriBackend;
  return (await import("../dev/preview.ts")).createPreviewBackend();
}

export const BackendContext = createContext<Backend | null>(null);

export function useBackend(): Backend {
  const b = useContext(BackendContext);
  if (!b) throw new Error("BackendContext is missing");
  return b;
}
