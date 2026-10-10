// The pet window's link to the outside: the shared backend, plus the pointer feed.
// Self-contained and tiny, since this window loads its own page.

import { inTauri } from "../lib/backend.ts";
import type { Backend } from "../lib/backend.ts";

let _backend: Backend | null = null;

export async function loadPetBackend(): Promise<Backend> {
  if (_backend) return _backend;
  if (inTauri) {
    _backend = (await import("../lib/tauriBackend.ts")).tauriBackend;
  } else {
    _backend = (await import("../dev/preview.ts")).createPreviewBackend();
  }
  return _backend;
}

/**
 * Pointer position relative to the centre of the pet window, in logical px.
 * In the app the Rust side reports the pointer wherever it is on screen; a page can
 * only see it over itself, so in the browser preview the page's own pointer stands in.
 */
export async function subscribeCursor(cb: (dx: number, dy: number) => void): Promise<() => void> {
  if (inTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<{ dx: number; dy: number }>("pet-cursor", (e) => cb(e.payload.dx, e.payload.dy));
  }
  const onMove = (e: PointerEvent) => cb(e.clientX - window.innerWidth / 2, e.clientY - window.innerHeight / 2);
  window.addEventListener("pointermove", onMove);
  return () => window.removeEventListener("pointermove", onMove);
}
