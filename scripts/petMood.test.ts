import { describe, expect, test } from "bun:test";
import { heartsFor, moodText } from "../src/pet/mood";
import type { PetView } from "../src/pet/types";

const view = (o: Partial<PetView>): PetView => ({
	expression: "neutral",
	activity: "idle",
	asleep: false,
	affection: 0.3,
	effects: [],
	flash: 0,
	seq: 0,
	...o
});

describe("moodText", () => {
	test("sleep wins", () => {
		expect(moodText(view({ asleep: true, activity: "sleep" }), false)).toContain("Napping");
	});
	test("dancing and focusing are described", () => {
		expect(moodText(view({ activity: "dance" }), false)).toContain("music");
		expect(moodText(view({}), true)).toContain("focus");
		expect(moodText(view({}), false)).toBe("Relaxed");
	});
});

describe("heartsFor", () => {
	test("rounds into 0..5", () => {
		expect(heartsFor(0)).toBe(0);
		expect(heartsFor(0.5)).toBe(3);
		expect(heartsFor(1)).toBe(5);
		expect(heartsFor(7)).toBe(5);
	});
});
