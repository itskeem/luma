import { describe, expect, test } from "bun:test";
import { normalizePrefs, normalizeState, SIZE_MAX, SIZE_MIN } from "../src/pet/prefs";
import { DEFAULT_PREFS } from "../src/pet/types";

describe("normalizePrefs", () => {
	test("null and junk give defaults", () => {
		expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
		expect(normalizePrefs("nope")).toEqual(DEFAULT_PREFS);
		expect(normalizePrefs([])).toEqual(DEFAULT_PREFS);
	});
	test("keeps valid values", () => {
		const p = normalizePrefs({ color: "mint", outfit: "bow", size: 1.2, home: "desktop", name: "Bean" });
		expect(p.color).toBe("mint");
		expect(p.outfit).toBe("bow");
		expect(p.size).toBe(1.2);
		expect(p.home).toBe("desktop");
		expect(p.name).toBe("Bean");
	});
	test("clamps and falls back on bad values", () => {
		const p = normalizePrefs({ color: "plaid", size: 9, intensity: -3, sleepAfter: 9999, home: "moon", name: "   " });
		expect(p.color).toBe(DEFAULT_PREFS.color);
		expect(p.size).toBe(SIZE_MAX);
		expect(normalizePrefs({ size: 0 }).size).toBe(SIZE_MIN);
		expect(p.intensity).toBe(0);
		expect(p.sleepAfter).toBe(120);
		expect(p.home).toBe("island");
		expect(p.name).toBe(DEFAULT_PREFS.name);
	});
	test("trims long names", () => {
		expect(normalizePrefs({ name: "A".repeat(40) }).name.length).toBe(16);
	});
	test("ignores unknown fields", () => {
		expect("evil" in normalizePrefs({ evil: 1 })).toBe(false);
	});
});

describe("normalizeState", () => {
	test("bounds affection and rounds positions", () => {
		const s = normalizeState({ affection: 4, x: 10.6, y: "no" });
		expect(s.affection).toBe(1);
		expect(s.x).toBe(11);
		expect(s.y).toBeNull();
	});
});
