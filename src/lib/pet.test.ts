import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { petMood, danceVariant, SLEEP_AFTER_MS } from "./pet.ts";
import type { PetInput } from "./pet.ts";

const base: PetInput = {
  hasMedia: false,
  playing: false,
  msSinceStopped: -1,
  focusPhase: false,
  breakPhase: false,
  focusRunning: false,
  celebrating: false,
  perking: false,
  happy: false,
  dragging: false,
  trackKey: "Song|Artist",
  reactsToMusic: true,
  reactsToFocus: true,
  energy: 1.0,
};

function inp(patch: Partial<PetInput>): PetInput {
  return { ...base, ...patch };
}

describe("petMood", () => {
  it("sleeping when no player and never played", () => {
    const { mood } = petMood(inp({}));
    assert.equal(mood, "sleeping");
  });

  it("sleeping when stopped for > 30 s", () => {
    const { mood } = petMood(inp({ hasMedia: true, msSinceStopped: SLEEP_AFTER_MS + 1 }));
    assert.equal(mood, "sleeping");
  });

  it("idle when paused less than 30 s", () => {
    const { mood } = petMood(inp({ hasMedia: true, msSinceStopped: 5_000 }));
    assert.equal(mood, "idle");
  });

  it("grooving when playing", () => {
    const { mood } = petMood(inp({ hasMedia: true, playing: true }));
    assert.equal(mood, "grooving");
  });

  it("perk overrides grooving immediately after track change", () => {
    const { mood } = petMood(inp({ hasMedia: true, playing: true, perking: true }));
    assert.equal(mood, "perk");
  });

  it("focused when focus phase running, even while music plays", () => {
    const { mood } = petMood(inp({ hasMedia: true, playing: true, focusRunning: true, focusPhase: true }));
    assert.equal(mood, "focused");
  });

  it("break when break phase running", () => {
    const { mood } = petMood(inp({ focusRunning: true, breakPhase: true }));
    assert.equal(mood, "break");
  });

  it("celebrate overrides focus", () => {
    const { mood } = petMood(inp({ celebrating: true, focusRunning: true, focusPhase: true }));
    assert.equal(mood, "celebrate");
  });

  it("happy overrides everything except dragging", () => {
    const { mood } = petMood(inp({ happy: true, playing: true }));
    assert.equal(mood, "happy");
  });

  it("carried (dragging) has highest priority", () => {
    const { mood } = petMood(inp({ dragging: true, happy: true, celebrating: true }));
    assert.equal(mood, "carried");
  });

  it("reactsToMusic false → always sleeping when no focus", () => {
    const { mood } = petMood(inp({ hasMedia: true, playing: true, reactsToMusic: false }));
    assert.equal(mood, "sleeping");
  });

  it("reactsToFocus false → focus state ignored", () => {
    const { mood } = petMood(inp({ hasMedia: true, playing: true, focusRunning: true, focusPhase: true, reactsToFocus: false }));
    assert.equal(mood, "grooving");
  });

  it("variant is deterministic from trackKey", () => {
    const v1 = danceVariant("Midnight Drive|Neon Harbor");
    const v2 = danceVariant("Midnight Drive|Neon Harbor");
    assert.equal(v1, v2);
    assert.ok(v1 >= 0 && v1 <= 3, `variant out of range: ${v1}`);
  });

  it("different tracks produce at least two distinct variants across realistic inputs", () => {
    const keys = [
      "Midnight Drive|Neon Harbor",
      "Slow Tides|Marlow Quay",
      "Paper Lanterns, Long Walk Home Through the Old Town|Orchard & Vale",
      "Blinding Lights|The Weeknd",
      "As It Was|Harry Styles",
      "Anti-Hero|Taylor Swift",
      "Heat Waves|Glass Animals",
      "Levitating|Dua Lipa",
      "Stay|The Kid LAROI",
      "good 4 u|Olivia Rodrigo",
    ];
    const variants = new Set(keys.map(danceVariant));
    assert.ok(variants.size > 1, `all ${keys.length} realistic track keys returned the same variant — hash may be broken`);
  });

  it("energy passthrough", () => {
    const { energy } = petMood(inp({ energy: 0.42 }));
    assert.equal(energy, 0.42);
  });
});
