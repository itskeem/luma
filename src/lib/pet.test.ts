import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PetInput } from "./pet.ts";
import {
  danceCycleSeconds,
  danceMoves,
  danceVariant,
  DIZZY_WINDOW_MS,
  focusJustFinished,
  isDoubleBlink,
  lookVector,
  nextBlinkDelayMs,
  petMood,
  pointerIsNear,
  registerPoke,
  SLEEP_POINTER_DISTANCE,
} from "./pet.ts";

const base: PetInput = {
  playing: false,
  focusPhase: false,
  breakPhase: false,
  focusRunning: false,
  celebrating: false,
  perking: false,
  hello: false,
  annoyed: false,
  dizzy: false,
  dragging: false,
  asleep: false,
  trackKey: "Song|Artist",
  reactsToMusic: true,
  reactsToFocus: true,
  energy: 1,
};
const mood = (patch: Partial<PetInput>) => petMood({ ...base, ...patch }).mood;

describe("petMood", () => {
  it("is awake and idle by default, and sleeps only when told it has been quiet", () => {
    assert.equal(mood({}), "idle");
    assert.equal(mood({ asleep: true }), "sleeping");
  });

  it("grooves while music plays, even if it was asleep", () => {
    assert.equal(mood({ playing: true }), "grooving");
    assert.equal(mood({ playing: true, asleep: true }), "grooving");
  });

  it("perks up on a track change, but only while playing", () => {
    assert.equal(mood({ playing: true, perking: true }), "perk");
    assert.equal(mood({ perking: true }), "idle");
  });

  it("focus beats music; a break is relaxed", () => {
    assert.equal(mood({ playing: true, focusRunning: true, focusPhase: true }), "focused");
    assert.equal(mood({ playing: true, focusRunning: true, breakPhase: true }), "break");
    assert.equal(mood({ focusPhase: true }), "idle", "a phase that isn't running means nothing");
  });

  it("celebrates a finished phase over everything calm", () => {
    assert.equal(mood({ celebrating: true, playing: true, focusRunning: true, focusPhase: true }), "celebrate");
  });

  it("things done to it win: carried > dizzy > annoyed > hello", () => {
    const all = { playing: true, celebrating: true, hello: true, annoyed: true, dizzy: true, dragging: true };
    assert.equal(mood(all), "carried");
    assert.equal(mood({ ...all, dragging: false }), "dizzy");
    assert.equal(mood({ ...all, dragging: false, dizzy: false }), "annoyed");
    assert.equal(mood({ ...all, dragging: false, dizzy: false, annoyed: false }), "hello");
  });

  it("ignores music and the timer when told to", () => {
    assert.equal(mood({ playing: true, reactsToMusic: false }), "idle");
    assert.equal(mood({ focusRunning: true, focusPhase: true, reactsToFocus: false }), "idle");
    assert.equal(mood({ playing: true, reactsToMusic: false, asleep: true }), "sleeping");
  });

  it("passes the energy seam through", () => {
    assert.equal(petMood({ ...base, energy: 0.5 }).energy, 0.5);
  });
});

describe("dance", () => {
  it("picks the same variant for the same song and covers all four", () => {
    assert.equal(danceVariant("A|B"), danceVariant("A|B"));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => danceVariant(`t${i}|a`)));
    assert.equal(seen.size, 4);
  });

  it("is locked to 112 BPM: a two-beat sway takes 1.07 s", () => {
    assert.ok(Math.abs(danceCycleSeconds() - 1.0714) < 0.001);
  });

  it("every variant moves a little but never far", () => {
    for (const v of [0, 1, 2, 3] as const) {
      const m = danceMoves(v);
      assert.ok(m.lift > 0 && m.lift <= 0.12);
      assert.ok(m.sway > 0 && m.sway <= 10);
    }
  });
});

describe("poking", () => {
  it("one or two pokes annoy it, the third inside the window makes it dizzy", () => {
    let r = registerPoke([], 0);
    assert.equal(r.dizzy, false);
    r = registerPoke(r.history, 500);
    assert.equal(r.dizzy, false);
    r = registerPoke(r.history, 1000);
    assert.equal(r.dizzy, true);
    assert.deepEqual(r.history, [], "it starts counting afresh afterwards");
  });

  it("slow pokes never add up", () => {
    let h: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = registerPoke(h, i * (DIZZY_WINDOW_MS + 100));
      assert.equal(r.dizzy, false);
      h = r.history;
    }
  });

  it("only pokes inside the window count", () => {
    let r = registerPoke([], 0);
    r = registerPoke(r.history, 1000);
    r = registerPoke(r.history, 2100); // the first one has aged out
    assert.equal(r.dizzy, false);
  });
});

describe("blinking", () => {
  it("waits 2.2 to 5.4 s, never the same twice", () => {
    assert.equal(nextBlinkDelayMs(0), 2200);
    assert.equal(nextBlinkDelayMs(1), 5400);
    assert.ok(nextBlinkDelayMs(0.3) !== nextBlinkDelayMs(0.6));
    assert.equal(nextBlinkDelayMs(-4), 2200);
    assert.equal(nextBlinkDelayMs(9), 5400);
  });

  it("doubles up about one time in five", () => {
    assert.equal(isDoubleBlink(0.1), true);
    assert.equal(isDoubleBlink(0.5), false);
  });
});

describe("looking at the pointer", () => {
  it("looks straight at a pointer to the right and ignores one on top of it", () => {
    const right = lookVector(200, 0);
    assert.ok(right.x > 0.5 && Math.abs(right.y) < 1e-9);
    assert.deepEqual(lookVector(0, 0), { x: 0, y: 0 });
    assert.deepEqual(lookVector(1, 1), { x: 0, y: 0 });
  });

  it("looks harder at a far pointer, but never past 1", () => {
    assert.ok(lookVector(60, 0).x < lookVector(300, 0).x);
    const far = lookVector(100_000, 100_000);
    assert.ok(Math.hypot(far.x, far.y) <= 1.0000001);
  });

  it("copes with junk", () => {
    assert.deepEqual(lookVector(Number.NaN, 5), { x: 0, y: 0 });
  });

  it("knows when the pointer is near enough to keep it awake", () => {
    assert.equal(pointerIsNear(SLEEP_POINTER_DISTANCE - 1, 0), true);
    assert.equal(pointerIsNear(SLEEP_POINTER_DISTANCE + 1, 0), false);
  });
});

describe("focus events", () => {
  const running = { phase: "focus", running: true, endsAtMs: 100_000 };
  it("cheers when a running phase runs out", () => {
    assert.equal(focusJustFinished(running, { phase: "short", running: false, endsAtMs: 0 }, 100_400), true);
    // Auto-start: straight into the next phase.
    assert.equal(focusJustFinished(running, { phase: "short", running: true, endsAtMs: 400_000 }, 100_400), true);
  });
  it("does not cheer for pausing, resetting or skipping part-way", () => {
    assert.equal(focusJustFinished(running, { phase: "focus", running: false, endsAtMs: 0 }, 40_000), false);
    assert.equal(focusJustFinished(running, { phase: "short", running: true, endsAtMs: 340_000 }, 40_000), false);
  });
  it("does not cheer when nothing was running or nothing changed", () => {
    assert.equal(focusJustFinished(null, running, 100_000), false);
    assert.equal(focusJustFinished({ ...running, running: false, endsAtMs: 0 }, running, 100_000), false);
    assert.equal(focusJustFinished(running, running, 100_500), false);
  });
});
