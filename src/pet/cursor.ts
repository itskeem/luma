// Where the mouse is on the desktop, shared by every pet canvas in a window.
//
// Inside Tauri the webview only hears the mouse while it is over the window,
// so Lumi asks the OS for the global cursor position. To stay cheap it polls
// quickly only while the cursor is moving, slows to ~1 Hz when it rests, and
// stops entirely with no subscribers or while the page is hidden.

import { getCurrentWindow, cursorPosition } from "@tauri-apps/api/window";
import { inTauri } from "./bus";

export interface ScreenPoint {
	/** Physical screen pixels. */
	x: number;
	y: number;
}

type Listener = (p: ScreenPoint) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let last: ScreenPoint | null = null;
let restingSince = 0;
let outer: ScreenPoint = { x: 0, y: 0 };
let outerAt = 0;

const FAST_MS = 50;
const SLOW_MS = 700;

async function refreshOuter(now: number) {
	if (now - outerAt < 1500) return;
	outerAt = now;
	try {
		const p = await getCurrentWindow().outerPosition();
		outer = { x: p.x, y: p.y };
	} catch {
		/* keep the previous value */
	}
}

/** Screen position of this window's top-left, physical pixels (cached ~1.5 s). */
export const windowOrigin = () => outer;

async function tick() {
	timer = null;
	if (listeners.size === 0 || document.hidden) return;
	const now = performance.now();
	let next = SLOW_MS;
	try {
		const [pos] = await Promise.all([cursorPosition(), refreshOuter(now)]);
		const p = { x: pos.x, y: pos.y };
		const moved = !last || Math.abs(p.x - last.x) > 1 || Math.abs(p.y - last.y) > 1;
		if (moved) {
			restingSince = now;
			last = p;
			listeners.forEach((fn) => fn(p));
		}
		next = now - restingSince < 2500 ? FAST_MS : SLOW_MS;
	} catch {
		next = 2000;
	}
	if (listeners.size > 0 && !timer) timer = setTimeout(tick, next);
}

function onMouse(e: MouseEvent) {
	// Browser fallback: window-relative coordinates stand in for screen ones.
	const p = { x: e.clientX * devicePixelRatio, y: e.clientY * devicePixelRatio };
	last = p;
	listeners.forEach((fn) => fn(p));
}

export function subscribeCursor(fn: Listener): () => void {
	listeners.add(fn);
	if (listeners.size === 1) {
		if (inTauri()) {
			restingSince = performance.now();
			if (!timer) timer = setTimeout(tick, 0);
			document.addEventListener("visibilitychange", onVisible);
		} else {
			window.addEventListener("mousemove", onMouse);
		}
	}
	if (last) fn(last);
	return () => {
		listeners.delete(fn);
		if (listeners.size === 0) {
			if (timer) clearTimeout(timer);
			timer = null;
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("mousemove", onMouse);
		}
	};
}

function onVisible() {
	if (!document.hidden && listeners.size > 0 && !timer) timer = setTimeout(tick, 0);
}

/** Gaze vector (each axis -1..1) from a point on screen toward the cursor. */
export function gazeToward(cursor: ScreenPoint, centerX: number, centerY: number): { x: number; y: number } {
	const dx = cursor.x - centerX;
	const dy = cursor.y - centerY;
	const dist = Math.hypot(dx, dy) || 1;
	// Full attention beyond ~180 px; subtler when the cursor is right on top.
	const strength = Math.min(1, dist / (180 * (window.devicePixelRatio || 1)));
	return { x: (dx / dist) * strength, y: (dy / dist) * strength };
}
