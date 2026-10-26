// Pure screen maths for the floating pet (physical pixels throughout), kept
// free of Tauri so it can be unit-tested.

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Edge of the floating window at size 1, in logical pixels. */
export const PET_WINDOW_BASE = 124;
/** How much of the screen edge to keep clear so Lumi can't hide under the taskbar. */
export const EDGE_MARGIN = 8;

export const petWindowSize = (sizeMultiplier: number) => Math.round(PET_WINDOW_BASE * sizeMultiplier);

const contains = (r: Rect, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

function nearest(areas: Rect[], p: Point): Rect {
	let best = areas[0];
	let bestD = Infinity;
	for (const a of areas) {
		const cx = Math.max(a.x, Math.min(p.x, a.x + a.w));
		const cy = Math.max(a.y, Math.min(p.y, a.y + a.h));
		const d = (cx - p.x) ** 2 + (cy - p.y) ** 2;
		if (d < bestD) {
			bestD = d;
			best = a;
		}
	}
	return best;
}

/**
 * Keeps a window of `size` physical px (top-left at `pos`) inside the work
 * area under its centre, or the nearest one when the centre is on no screen
 * (a monitor was unplugged). With no screens at all the position is returned
 * unchanged.
 */
export function clampToWorkAreas(pos: Point, size: number, areas: Rect[], margin = EDGE_MARGIN): Point {
	if (areas.length === 0) return pos;
	const centre = { x: pos.x + size / 2, y: pos.y + size / 2 };
	const area = areas.find((a) => contains(a, centre)) ?? nearest(areas, centre);
	return {
		x: Math.round(Math.max(area.x + margin, Math.min(pos.x, area.x + area.w - size - margin))),
		y: Math.round(Math.max(area.y + margin, Math.min(pos.y, area.y + area.h - size - margin)))
	};
}

/** True when a saved position still lies on a connected screen. */
export function isOnScreen(pos: Point, size: number, areas: Rect[]): boolean {
	const centre = { x: pos.x + size / 2, y: pos.y + size / 2 };
	return areas.some((a) => contains(a, centre));
}

/** Where Lumi first appears: just below-right of the island's centre. */
export function defaultSpot(areas: Rect[], size: number, scale: number): Point {
	const a = areas[0] ?? { x: 0, y: 0, w: 1920, h: 1080 };
	return clampToWorkAreas({ x: a.x + a.w / 2 + 240 * scale, y: a.y + 120 * scale }, size, areas.length ? areas : [a]);
}

/**
 * The part of the screen that counts as "the island" when Lumi is dropped on
 * it: a band centred on the island window's top edge.
 */
export function islandZone(islandWindow: Rect, scale: number): Rect {
	const w = 460 * scale;
	return { x: islandWindow.x + islandWindow.w / 2 - w / 2, y: islandWindow.y, w, h: 150 * scale };
}

/** Whether the pet's centre sits in the island zone. */
export function droppedOnIsland(windowTopLeft: Point, size: number, zone: Rect): boolean {
	return contains(zone, { x: windowTopLeft.x + size / 2, y: windowTopLeft.y + size / 2 });
}
