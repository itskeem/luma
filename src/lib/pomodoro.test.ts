import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimerConfig } from "./pomodoro.ts";
import { followConfig, initialTimer, pause, remaining, resetPhase, skip, start, tick } from "./pomodoro.ts";

const cfg: TimerConfig = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, roundsBeforeLong: 4, autoStartNext: false };
const MIN = 60_000;

test("starts stopped with a full focus phase", () => {
  const s = initialTimer(cfg);
  assert.equal(s.phase, "focus");
  assert.equal(s.running, false);
  assert.equal(remaining(s, 123), 25 * MIN);
});

test("counts down from the moment it starts, and pausing keeps what is left", () => {
  let s = start(initialTimer(cfg), 1_000);
  assert.equal(remaining(s, 1_000 + 5 * MIN), 20 * MIN);
  s = pause(s, 1_000 + 5 * MIN);
  assert.equal(s.running, false);
  assert.equal(remaining(s, 1_000 + 99 * MIN), 20 * MIN);
  s = start(s, 50_000);
  assert.equal(s.endsAt, 50_000 + 20 * MIN);
});

test("a finished focus session moves to a short break and stops", () => {
  const s = start(initialTimer(cfg), 0);
  const early = tick(s, cfg, 24 * MIN);
  assert.equal(early.finished, null);
  const done = tick(s, cfg, 25 * MIN + 10);
  assert.equal(done.finished, "focus");
  assert.equal(done.state.phase, "short");
  assert.equal(done.state.running, false);
  assert.equal(done.state.completedFocus, 1);
  assert.equal(remaining(done.state, 0), 5 * MIN);
});

test("every fourth focus session earns a long break", () => {
  let s = initialTimer(cfg);
  const phases: string[] = [];
  for (let i = 0; i < 8; i++) {
    s = skip(s, cfg, 0);
    phases.push(s.phase);
  }
  assert.deepEqual(phases, ["short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
});

test("auto-start chains phases from the end time, not from the late tick", () => {
  const auto = { ...cfg, autoStartNext: true };
  const s = start(initialTimer(auto), 0);
  const { state, finished } = tick(s, auto, 25 * MIN + 3_000);
  assert.equal(finished, "focus");
  assert.equal(state.running, true);
  assert.equal(state.endsAt, 30 * MIN);
});

test("auto-start after a long sleep restarts from now instead of racing through phases", () => {
  const auto = { ...cfg, autoStartNext: true };
  const s = start(initialTimer(auto), 0);
  const now = 10 * 60 * MIN;
  const { state } = tick(s, auto, now);
  assert.equal(state.endsAt, now + 5 * MIN);
});

test("skip keeps running if it was running", () => {
  const s = skip(start(initialTimer(cfg), 0), cfg, 7_000);
  assert.equal(s.running, true);
  assert.equal(s.endsAt, 7_000 + 5 * MIN);
});

test("reset returns the current phase to full", () => {
  const s = resetPhase(pause(start(initialTimer(cfg), 0), 10 * MIN), cfg);
  assert.equal(remaining(s, 0), 25 * MIN);
  assert.equal(s.phase, "focus");
});

test("settings changes reach an untouched timer but not one paused part-way", () => {
  const longer = { ...cfg, focusMin: 50 };
  assert.equal(remaining(followConfig(initialTimer(cfg), longer), 0), 50 * MIN);
  const paused = pause(start(initialTimer(cfg), 0), 10 * MIN);
  assert.equal(remaining(followConfig(paused, longer), 0), 15 * MIN);
  const running = start(initialTimer(cfg), 0);
  assert.equal(followConfig(running, longer), running);
});
