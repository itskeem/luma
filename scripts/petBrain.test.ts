import { describe, expect, test } from "bun:test";
import { PetBrain } from "../src/pet/brain";
import { DEFAULT_PREFS, type PetPrefs } from "../src/pet/types";

function make(overrides: Partial<PetPrefs> = {}, rolls: number[] = []) {
	let t = 1_000_000;
	let i = 0;
	const prefs = { ...DEFAULT_PREFS, ...overrides };
	const brain = new PetBrain(prefs, {
		now: () => t,
		rand: () => (rolls.length ? rolls[i++ % rolls.length] : 0.5)
	});
	return {
		brain,
		advance: (ms: number) => {
			t += ms;
		}
	};
}

describe("pokes", () => {
	test("a single poke makes Lumi happy and hop", () => {
		const { brain } = make();
		brain.dispatch({ type: "poke" });
		const v = brain.update();
		expect(v.expression).toBe("happy");
		expect(v.activity).toBe("jump");
	});

	test("reaction ends on its own", () => {
		const { brain, advance } = make();
		brain.dispatch({ type: "poke" });
		advance(1200);
		const v = brain.update();
		expect(v.expression).toBe("neutral");
		expect(v.activity).toBe("idle");
	});

	test("three quick pokes annoy, six make dizzy", () => {
		const { brain, advance } = make();
		for (let i = 0; i < 3; i++) {
			brain.dispatch({ type: "poke" });
			advance(200);
		}
		expect(brain.update().expression).toBe("annoyed");
		for (let i = 0; i < 3; i++) {
			brain.dispatch({ type: "poke" });
			advance(200);
		}
		const v = brain.update();
		expect(v.expression).toBe("dizzy");
	});

	test("slow pokes never annoy", () => {
		const { brain, advance } = make();
		for (let i = 0; i < 6; i++) {
			brain.dispatch({ type: "poke" });
			advance(3000);
		}
		brain.dispatch({ type: "poke" });
		expect(brain.update().expression).toBe("happy");
	});
});

describe("priorities", () => {
	test("a poke cannot interrupt a celebration", () => {
		const { brain, advance } = make();
		brain.dispatch({ type: "focus", phase: "complete" });
		advance(500);
		brain.dispatch({ type: "poke" });
		const v = brain.update();
		expect(v.activity).toBe("celebrate");
	});

	test("celebration spawns confetti once and raises affection", () => {
		const { brain } = make();
		const before = brain.update().affection;
		brain.dispatch({ type: "focus", phase: "complete" });
		const first = brain.update();
		expect(first.effects).toContain("confetti");
		expect(first.affection).toBeGreaterThan(before);
		expect(brain.update().effects).toEqual([]);
	});

	test("dragging holds until released", () => {
		const { brain, advance } = make();
		brain.dispatch({ type: "drag-start" });
		advance(60_000);
		expect(brain.update().activity).toBe("drag");
		brain.dispatch({ type: "drag-end" });
		expect(brain.update().activity).toBe("jump");
	});
});

describe("sleep", () => {
	test("naps after the configured inactivity and wakes on a poke", () => {
		const { brain, advance } = make({ sleepAfter: 2 });
		advance(119_000);
		expect(brain.update().asleep).toBe(false);
		advance(2000);
		expect(brain.update().asleep).toBe(true);
		brain.dispatch({ type: "poke" });
		const v = brain.update();
		expect(v.asleep).toBe(false);
		expect(v.expression).toBe("surprised");
	});

	test("never sleeps when sleepAfter is 0", () => {
		const { brain, advance } = make({ sleepAfter: 0 });
		advance(10 * 3_600_000);
		expect(brain.update().asleep).toBe(false);
	});

	test("does not nap while music plays", () => {
		const { brain, advance } = make({ sleepAfter: 1 });
		brain.dispatch({ type: "music", playing: true });
		advance(10 * 60_000);
		expect(brain.update().asleep).toBe(false);
	});

	test("explicit sleep sticks until woken", () => {
		const { brain, advance } = make();
		brain.dispatch({ type: "sleep" });
		advance(3_600_000);
		expect(brain.update().asleep).toBe(true);
		brain.dispatch({ type: "wake" });
		expect(brain.update().asleep).toBe(false);
	});
});

describe("music", () => {
	test("dances while music plays and stops afterwards", () => {
		const { brain } = make();
		brain.dispatch({ type: "music", playing: true });
		expect(brain.update().activity).toBe("dance");
		brain.dispatch({ type: "music", playing: false });
		expect(brain.update().activity).toBe("idle");
	});

	test("does not dance when the preference is off", () => {
		const { brain } = make({ danceToMusic: false });
		brain.dispatch({ type: "music", playing: true });
		expect(brain.update().activity).toBe("idle");
	});
});

describe("spontaneous behaviour", () => {
	test("none when intensity is 0", () => {
		const { brain, advance } = make({ intensity: 0, sleepAfter: 0 });
		for (let i = 0; i < 100; i++) {
			advance(10_000);
			const v = brain.update();
			expect(v.activity).toBe("idle");
			expect(v.expression).toBe("neutral");
		}
	});

	test("none during a focus session when quiet mode is on", () => {
		const { brain, advance } = make({ quietDuringFocus: true, sleepAfter: 0, intensity: 1 });
		brain.dispatch({ type: "focus", phase: "start" });
		advance(2000);
		for (let i = 0; i < 100; i++) {
			advance(10_000);
			expect(brain.update().activity).toBe("idle");
		}
	});

	test("happens eventually when idle and lively", () => {
		const { brain, advance } = make({ intensity: 1, sleepAfter: 0 }, [0.2]);
		let seen = false;
		for (let i = 0; i < 40 && !seen; i++) {
			advance(5000);
			seen = brain.update().activity !== "idle";
		}
		expect(seen).toBe(true);
	});
});

describe("alerts", () => {
	test("low battery worries, notification surprises and flashes the bulb", () => {
		const { brain, advance } = make();
		brain.dispatch({ type: "alert", kind: "low-battery" });
		expect(brain.update().expression).toBe("worried");
		advance(5000);
		brain.dispatch({ type: "alert", kind: "notification" });
		const v = brain.update();
		expect(v.expression).toBe("surprised");
		expect(v.flash).toBeGreaterThan(0.9);
	});
});
