// Pet-window backend: thin shim that loads the shared backend and re-exports
// what the pet needs. It does NOT use the BackendContext React approach —
// the pet entry is fully self-contained and tiny.

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
