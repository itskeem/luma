import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MediaState, Settings } from "../types.ts";
import type { Backend, FocusStatePayload } from "./backend.ts";

// Fire-and-forget commands must not leave unhandled rejections behind.
const quiet = (p: Promise<unknown>) => void p.catch((e) => console.error("luma:", e));

export const tauriBackend: Backend = {
  kind: "tauri",
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings) => invoke<Settings>("update_settings", { settings }),
  getMediaState: () => invoke<MediaState>("get_media_state"),
  getArtwork: (id) => invoke<string | null>("get_artwork", { id }),
  mediaCommand: (action) => quiet(invoke("media_command", { action })),
  pinPlayer: (id) => quiet(invoke("pin_player", { id })),
  setIslandSize: (width, height) => invoke<void>("set_island_size", { width, height }),
  startDragging: () => quiet(getCurrentWindow().startDragging()),
  hideIsland: () => quiet(invoke("hide_island")),
  quitApp: () => quiet(invoke("quit_app")),
  publishFocusState: (payload) => quiet(invoke("publish_focus_state", { payload })),
  getFocusState: () => invoke<FocusStatePayload>("get_focus_state"),
  showPet: () => quiet(invoke("show_pet")),
  hidePet: () => quiet(invoke("hide_pet")),
  onMediaState: (cb) => listen<MediaState>("media-state", (e) => cb(e.payload)),
  onSettings: (cb) => listen<Settings>("settings-changed", (e) => cb(e.payload)),
  onNavigate: (cb) => listen<string>("navigate", (e) => cb(e.payload)),
  onFocusState: (cb) => listen<FocusStatePayload>("focus-state", (e) => cb(e.payload)),
};
