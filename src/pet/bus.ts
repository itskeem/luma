// Messages between Luma's windows about the pet.
//
// The island window owns the facts (music, focus timer, battery) and the
// floating window's lifecycle; every window that shows Lumi listens. Tauri's
// emit() reaches all windows including the sender, so one path serves both.
// Outside Tauri (the dev gallery) the same API runs on a DOM event target.

import { emit, listen } from "@tauri-apps/api/event";
import type { PetEvent } from "./types";

export const PET_EVENT = "luma-pet-event";
export const PET_COMMAND = "luma-pet-command";

/** Requests handled by the island window, which owns the floating window. */
export type PetCommand =
	| { cmd: "go-desktop" }
	| { cmd: "go-home"; wave?: boolean }
	| { cmd: "wake" }
	| { cmd: "sleep" }
	| { cmd: "wave" }
	/** A window that just opened asks the island to resend the current music/focus state. */
	| { cmd: "sync" };

export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const local = new EventTarget();

function send(name: string, payload: unknown) {
	if (inTauri()) emit(name, payload).catch(() => {});
	else local.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

function on<T>(name: string, handler: (p: T) => void): () => void {
	if (!inTauri()) {
		const fn = (e: Event) => handler((e as CustomEvent<T>).detail);
		local.addEventListener(name, fn);
		return () => local.removeEventListener(name, fn);
	}
	let un: (() => void) | null = null;
	let stopped = false;
	listen<T>(name, (e) => handler(e.payload))
		.then((f) => {
			if (stopped) f();
			else un = f;
		})
		.catch(() => {});
	return () => {
		stopped = true;
		un?.();
	};
}

export const sendPetEvent = (event: PetEvent) => send(PET_EVENT, event);
export const onPetEvent = (handler: (event: PetEvent) => void) => on<PetEvent>(PET_EVENT, handler);
export const sendPetCommand = (command: PetCommand) => send(PET_COMMAND, command);
export const onPetCommand = (handler: (command: PetCommand) => void) => on<PetCommand>(PET_COMMAND, handler);
