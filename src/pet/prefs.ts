// Pet preferences and persisted state.
//
// Everything is one JSON string under `luma-pet-prefs` (and `luma-pet-state`
// for things Lumi changes itself), stored through the same save_setting /
// settings-changed path as the rest of Luma, so every window agrees and the
// values survive restarts. localStorage mirrors them so a window can paint
// before settings.json has loaded.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_PREFS, PET_COLORS, PET_OUTFITS, type PetPrefs } from "./types";

export const PREFS_KEY = "luma-pet-prefs";
export const STATE_KEY = "luma-pet-state";

export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.6;
export const SLEEP_AFTER_CHOICES = [0, 2, 5, 10, 30] as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
	typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d;

/**
 * Turns anything (hand-edited settings.json, an older version, null) into a
 * complete, in-range PetPrefs. Unknown fields are dropped and bad values fall
 * back to defaults, so a corrupt file can never break the pet.
 */
export function normalizePrefs(raw: unknown): PetPrefs {
	const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const d = DEFAULT_PREFS;
	const name = typeof r.name === "string" ? r.name.trim().slice(0, 16) : "";
	return {
		enabled: bool(r.enabled, d.enabled),
		name: name || d.name,
		color: oneOf(r.color, PET_COLORS, d.color),
		outfit: oneOf(r.outfit, PET_OUTFITS, d.outfit),
		size: clamp(num(r.size, d.size), SIZE_MIN, SIZE_MAX),
		intensity: clamp(num(r.intensity, d.intensity), 0, 1),
		followCursor: bool(r.followCursor, d.followCursor),
		danceToMusic: bool(r.danceToMusic, d.danceToMusic),
		sleepAfter: clamp(Math.round(num(r.sleepAfter, d.sleepAfter)), 0, 120),
		quietDuringFocus: bool(r.quietDuringFocus, d.quietDuringFocus),
		floatOnTop: bool(r.floatOnTop, d.floatOnTop),
		hideInFullscreen: bool(r.hideInFullscreen, d.hideInFullscreen),
		home: oneOf(r.home, ["island", "desktop"] as const, d.home)
	};
}

/** What Lumi remembers on its own: how fond it is of you, and where it sits. */
export interface PetState {
	affection: number;
	lastSeen: number;
	/** Last floating position in physical desktop pixels (top-left of the window). */
	x: number | null;
	y: number | null;
	/** Running count of meaningful interactions (pokes, strokes, feeds). */
	totalInteractions: number;
	/** Bitmask of which bond milestones have already been celebrated. */
	milestonesReached: number;
}

export const DEFAULT_STATE: PetState = { affection: 0.3, lastSeen: 0, x: null, y: null, totalInteractions: 0, milestonesReached: 0 };

export function normalizeState(raw: unknown): PetState {
	const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
	return {
		affection: clamp(num(r.affection, DEFAULT_STATE.affection), 0, 1),
		lastSeen: Math.max(0, num(r.lastSeen, 0)),
		x: coord(r.x),
		y: coord(r.y),
		totalInteractions: Math.max(0, Math.round(num(r.totalInteractions, 0))),
		milestonesReached: Math.max(0, Math.round(num(r.milestonesReached, 0)))
	};
}

function parse(value: unknown): unknown {
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value;
}

function readLocal(key: string): unknown {
	try {
		return parse(localStorage.getItem(key));
	} catch {
		return null;
	}
}

let prefsCache: PetPrefs | null = null;
let stateCache: PetState | null = null;
const prefListeners = new Set<(p: PetPrefs) => void>();

export function getPrefs(): PetPrefs {
	return (prefsCache ??= normalizePrefs(readLocal(PREFS_KEY)));
}

export function getState(): PetState {
	return (stateCache ??= normalizeState(readLocal(STATE_KEY)));
}

function applyPrefs(p: PetPrefs) {
	prefsCache = p;
	prefListeners.forEach((fn) => fn(p));
}

/** Persists a change to the preferences and tells every window. */
export function updatePrefs(patch: Partial<PetPrefs>) {
	const next = normalizePrefs({ ...getPrefs(), ...patch });
	applyPrefs(next);
	persist(PREFS_KEY, next);
}

export function updateState(patch: Partial<PetState>) {
	stateCache = normalizeState({ ...getState(), ...patch });
	persist(STATE_KEY, stateCache);
}

function persist(key: string, value: unknown) {
	const json = JSON.stringify(value);
	try {
		localStorage.setItem(key, json);
	} catch {
		/* storage unavailable: the settings file below is the real copy */
	}
	invoke("save_setting", { key, value: json }).catch(() => {});
}

let wired = false;
/** Listens (once per window) for changes other windows or the file make. */
export function wirePrefsSync() {
	if (wired) return;
	wired = true;
	const apply = (key: string, value: unknown) => {
		if (key === PREFS_KEY) applyPrefs(normalizePrefs(parse(value)));
		else if (key === STATE_KEY) stateCache = normalizeState(parse(value));
	};
	listen<{ key: string; value: unknown }>("settings-changed", (e) => apply(e.payload.key, e.payload.value)).catch(() => {});
	listen<{ key: string; value: unknown }>("settings-external-changed", (e) => {
		if (e.payload.value != null) {
			try {
				localStorage.setItem(e.payload.key, String(e.payload.value));
			} catch {
				/* ignore */
			}
		}
		apply(e.payload.key, e.payload.value);
	}).catch(() => {});
	// First paint used the localStorage mirror; settings.json is authoritative.
	invoke<Record<string, unknown>>("load_settings")
		.then((all) => {
			if (all?.[PREFS_KEY] != null) applyPrefs(normalizePrefs(parse(all[PREFS_KEY])));
			if (all?.[STATE_KEY] != null) stateCache = normalizeState(parse(all[STATE_KEY]));
		})
		.catch(() => {});
}

export function subscribePrefs(fn: (p: PetPrefs) => void): () => void {
	prefListeners.add(fn);
	return () => prefListeners.delete(fn);
}

export function usePetPrefs(): PetPrefs {
	const [prefs, setPrefs] = useState(getPrefs);
	useEffect(() => {
		wirePrefsSync();
		setPrefs(getPrefs());
		return subscribePrefs(setPrefs);
	}, []);
	return prefs;
}
