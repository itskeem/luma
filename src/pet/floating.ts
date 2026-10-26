// The floating desktop pet window, as seen from the island (which owns it).
// The pet window is created on demand and destroyed when Lumi goes home, so a
// pet living in the island costs no extra webview process.

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
	availableMonitors,
	cursorPosition,
	getAllWindows,
	PhysicalPosition,
	PhysicalSize,
	primaryMonitor,
	type Monitor
} from "@tauri-apps/api/window";
import { dragWindowWithCursor } from "./dragWindow";
import {
	clampToWorkAreas,
	defaultSpot,
	droppedOnIsland,
	isOnScreen,
	islandZone,
	petWindowSize,
	type Point,
	type Rect
} from "./geometry";
import { getPrefs, getState, updatePrefs, updateState } from "./prefs";
import { sendPetEvent } from "./bus";

export const PET_LABEL = "pet";

const workAreaOf = (m: Monitor): Rect => ({
	x: m.workArea.position.x,
	y: m.workArea.position.y,
	w: m.workArea.size.width,
	h: m.workArea.size.height
});

async function workAreas(): Promise<Rect[]> {
	try {
		return (await availableMonitors()).map(workAreaOf);
	} catch {
		return [];
	}
}

/** Physical edge of the pet window on the primary display. */
async function physicalSize(): Promise<number> {
	const scale = (await primaryMonitor())?.scaleFactor ?? 1;
	return Math.round(petWindowSize(getPrefs().size) * scale);
}

export const getPetWindow = () => WebviewWindow.getByLabel(PET_LABEL);

/**
 * Opens the pet window (or returns the open one). `at` is a physical top-left;
 * without it the saved spot is used if its screen still exists.
 */
let opening: Promise<WebviewWindow> | null = null;

export function openPetWindow(at?: Point): Promise<WebviewWindow> {
	// Concurrent callers share one creation (a second would fail on the label).
	return (opening ??= createPetWindow(at).finally(() => {
		opening = null;
	}));
}

async function createPetWindow(at?: Point): Promise<WebviewWindow> {
	const existing = await getPetWindow();
	if (existing) return existing;

	const prefs = getPrefs();
	const areas = await workAreas();
	const size = await physicalSize();
	const scale = (await primaryMonitor())?.scaleFactor ?? 1;
	const saved = getState();

	let spot = at;
	if (!spot && saved.x !== null && saved.y !== null && isOnScreen({ x: saved.x, y: saved.y }, size, areas)) {
		spot = { x: saved.x, y: saved.y };
	}
	spot = clampToWorkAreas(spot ?? defaultSpot(areas, size, scale), size, areas);

	const logical = petWindowSize(prefs.size);
	// Created parked off-screen and moved into place afterwards: creating it
	// at the target would flash it at the wrong DPI on mixed-scale setups.
	const win = new WebviewWindow(PET_LABEL, {
		url: "pet.html",
		x: -3000,
		y: -3000,
		width: logical,
		height: logical,
		decorations: false,
		transparent: true,
		resizable: false,
		maximizable: false,
		minimizable: false,
		shadow: false,
		skipTaskbar: true,
		alwaysOnTop: prefs.floatOnTop,
		focus: false,
		visibleOnAllWorkspaces: true,
		title: "Luma Pet"
	});
	await new Promise<void>((resolve, reject) => {
		win.once("tauri://created", () => resolve());
		win.once("tauri://error", (e) => reject(new Error(String(e.payload))));
	});
	await win.setSize(new PhysicalSize(size, size));
	await win.setPosition(new PhysicalPosition(spot.x, spot.y));
	return win;
}

export async function closePetWindow() {
	const win = await getPetWindow();
	if (win) await win.destroy().catch(() => {});
}

/** Moves Lumi out of the island onto the desktop at its saved (or default) spot. */
export async function sendToDesktop(at?: Point) {
	updatePrefs({ home: "desktop" });
	try {
		await openPetWindow(at);
		sendPetEvent({ type: "arrive" });
	} catch (err) {
		console.error("Could not open the pet window:", err);
		updatePrefs({ home: "island" });
	}
}

/** Brings Lumi back into the island. */
export async function goHome(wave = true) {
	await closePetWindow();
	updatePrefs({ home: "island" });
	sendPetEvent(wave ? { type: "wave" } : { type: "arrive" });
}

/**
 * Called by the island when the user drags the in-island pet out: opens the
 * pet window under the cursor and carries it until the button is released.
 */
export async function dragOutOfIsland() {
	const size = await physicalSize();
	const c = await cursorPosition();
	const start = { x: Math.round(c.x - size / 2), y: Math.round(c.y - size / 2) };
	updatePrefs({ home: "desktop" });
	let win: WebviewWindow;
	try {
		win = await openPetWindow(start);
	} catch (err) {
		console.error("Could not open the pet window:", err);
		updatePrefs({ home: "island" });
		return;
	}
	sendPetEvent({ type: "drag-start" });
	const result = await dragWindowWithCursor(win, { x: size / 2, y: size / 2 });
	if ((await finishDrop(win, result.position, size)) === "home") await goHome(true);
}

/**
 * Shared by both drags: settles the pet where it was dropped, or reports that
 * it landed on the island and should go home (the caller does that, because
 * only the island window may close the pet window safely).
 */
export async function finishDrop(win: WebviewWindow, pos: Point, size: number): Promise<"home" | "settled"> {
	const areas = await workAreas();
	const main = (await getAllWindows()).find((w) => w.label === "main");
	if (main) {
		const [p, s, scale] = await Promise.all([main.outerPosition(), main.outerSize(), main.scaleFactor()]);
		const zone = islandZone({ x: p.x, y: p.y, w: s.width, h: s.height }, scale);
		if (droppedOnIsland(pos, size, zone)) return "home";
	}
	const settled = clampToWorkAreas(pos, size, areas);
	await win.setPosition(new PhysicalPosition(settled.x, settled.y));
	updateState({ x: settled.x, y: settled.y });
	sendPetEvent({ type: "drag-end" });
	return "settled";
}
