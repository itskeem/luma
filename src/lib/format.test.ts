import assert from "node:assert/strict";
import { test } from "node:test";
import { clamp, formatTime, positionNow } from "./format.ts";

test("formatTime", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(83_000), "1:23");
  assert.equal(formatTime(3_725_000), "1:02:05");
  assert.equal(formatTime(-5), "0:00");
  assert.equal(formatTime(Number.NaN), "0:00");
  assert.equal(formatTime(59_999), "0:59");
});

test("clamp", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
});

test("positionNow extrapolates while playing and holds when paused", () => {
  const t = { positionMs: 10_000, durationMs: 30_000, capturedAtMs: 1_000, rate: 1 };
  assert.equal(positionNow(t, true, 6_000), 15_000);
  assert.equal(positionNow(t, false, 6_000), 10_000);
  assert.equal(positionNow(t, true, 900_000), 30_000);
  assert.equal(positionNow({ ...t, rate: 2 }, true, 6_000), 20_000);
  assert.equal(positionNow(t, true, 0), 10_000); // clock skew never goes backwards
});
