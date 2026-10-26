// Drags a window with the cursor across the whole desktop.
//
// Webview pointer events stop once the cursor leaves the window, and a window
// that moves under the cursor confuses them further. So the drag is driven
// from outside: poll the OS cursor and the left button (native command) and
// move the window, which also lets the pet follow the cursor over other apps.

import { invoke } from "@tauri-apps/api/core";
import { cursorPosition, PhysicalPosition, type Window } from "@tauri-apps/api/window";
import type { Point } from "./geometry";

const STEP_MS = 10;
const MAX_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Position the window had when the button went up. */
export interface DragResult {
	position: Point;
	/** False when the button state could not be read and the drag was cut short. */
	completed: boolean;
}

/**
 * Follows the cursor until the left button is released.
 * `grab` is where inside the window (physical px) it is being held.
 * `onMove` gets the new top-left and the horizontal velocity in px/s.
 */
export async function dragWindowWithCursor(
	win: Window,
	grab: Point,
	onMove?: (pos: Point, vx: number) => void
): Promise<DragResult> {
	const started = performance.now();
	let lastPos: Point | null = null;
	let lastAt = started;
	let vx = 0;
	let completed = true;

	while (performance.now() - started < MAX_MS) {
		let down: boolean;
		try {
			down = await invoke<boolean>("is_left_button_down");
		} catch {
			completed = false;
			break;
		}
		const c = await cursorPosition();
		const pos = { x: Math.round(c.x - grab.x), y: Math.round(c.y - grab.y) };
		if (!down) {
			lastPos = lastPos ?? pos;
			break;
		}
		const now = performance.now();
		if (lastPos) vx = vx * 0.7 + ((pos.x - lastPos.x) / Math.max(1, now - lastAt)) * 1000 * 0.3;
		lastAt = now;
		lastPos = pos;
		await win.setPosition(new PhysicalPosition(pos.x, pos.y));
		onMove?.(pos, vx);
		await sleep(STEP_MS);
	}
	return { position: lastPos ?? { x: 0, y: 0 }, completed };
}
