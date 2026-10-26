import { describe, expect, test } from "bun:test";
import { clampToWorkAreas, defaultSpot, droppedOnIsland, isOnScreen, islandZone, petWindowSize } from "../src/pet/geometry";

const main = { x: 0, y: 0, w: 1920, h: 1040 };
const second = { x: 1920, y: 0, w: 1280, h: 1000 };

describe("clampToWorkAreas", () => {
	test("leaves a position that is already inside alone", () => {
		expect(clampToWorkAreas({ x: 500, y: 400 }, 124, [main])).toEqual({ x: 500, y: 400 });
	});
	test("pulls a window back from the bottom-right edge", () => {
		expect(clampToWorkAreas({ x: 1900, y: 1030 }, 124, [main])).toEqual({ x: 1920 - 124 - 8, y: 1040 - 124 - 8 });
	});
	test("a window centred on the second screen stays there", () => {
		expect(clampToWorkAreas({ x: 2500, y: 300 }, 124, [main, second])).toEqual({ x: 2500, y: 300 });
	});
	test("a position on an unplugged monitor lands on the nearest screen", () => {
		const p = clampToWorkAreas({ x: 4000, y: 300 }, 124, [main, second]);
		expect(p.x).toBe(1920 + 1280 - 124 - 8);
	});
	test("no screens: unchanged", () => {
		expect(clampToWorkAreas({ x: 5, y: 6 }, 124, [])).toEqual({ x: 5, y: 6 });
	});
});

describe("isOnScreen", () => {
	test("detects a saved spot that no longer exists", () => {
		expect(isOnScreen({ x: 4000, y: 100 }, 124, [main, second])).toBe(false);
		expect(isOnScreen({ x: 100, y: 100 }, 124, [main, second])).toBe(true);
	});
});

describe("island drop zone", () => {
	const zone = islandZone({ x: 0, y: 0, w: 1920, h: 420 }, 1);
	test("dropping at top centre returns home", () => {
		expect(droppedOnIsland({ x: 960 - 62, y: 20 }, 124, zone)).toBe(true);
	});
	test("dropping elsewhere does not", () => {
		expect(droppedOnIsland({ x: 200, y: 20 }, 124, zone)).toBe(false);
		expect(droppedOnIsland({ x: 960 - 62, y: 600 }, 124, zone)).toBe(false);
	});
	test("scales with the display", () => {
		const z2 = islandZone({ x: 0, y: 0, w: 3840, h: 840 }, 2);
		expect(z2.w).toBe(920);
	});
});

describe("misc", () => {
	test("window size scales with the size preference", () => {
		expect(petWindowSize(1)).toBe(124);
		expect(petWindowSize(1.5)).toBe(186);
	});
	test("default spot is on screen", () => {
		const p = defaultSpot([main], 124, 1);
		expect(isOnScreen(p, 124, [main])).toBe(true);
	});
});
