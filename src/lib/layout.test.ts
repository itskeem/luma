import assert from "node:assert/strict";
import { test } from "node:test";
import { isExpanded, islandSize, PAD, windowSize } from "./layout.ts";

const base = { density: "comfortable", hasMedia: true, multiPlayer: false, timerInPill: false } as const;

test("collapsed is a small pill, wider with media or a visible timer", () => {
  const idle = islandSize({ ...base, view: "collapsed", hasMedia: false });
  const media = islandSize({ ...base, view: "collapsed" });
  const timer = islandSize({ ...base, view: "collapsed", timerInPill: true });
  assert.ok(idle.w < media.w && media.w < timer.w);
  assert.equal(media.h, 38);
});

test("every expanded view is larger than the pill, and compact is smaller than comfortable", () => {
  for (const view of ["music", "tools", "settings"] as const) {
    const pill = islandSize({ ...base, view: "collapsed" });
    const full = islandSize({ ...base, view });
    const compact = islandSize({ ...base, view, density: "compact" });
    assert.ok(full.w > pill.w && full.h > pill.h);
    assert.ok(compact.h <= full.h && compact.w <= full.w);
  }
});

test("the multi-player row adds height only to the music view", () => {
  const one = islandSize({ ...base, view: "music" });
  const many = islandSize({ ...base, view: "music", multiPlayer: true });
  assert.ok(many.h > one.h);
  assert.equal(islandSize({ ...base, view: "tools" }).h, islandSize({ ...base, view: "tools", multiPlayer: true }).h);
});

test("the window is the island plus the shadow margin on each side", () => {
  assert.deepEqual(windowSize({ w: 100, h: 40 }), { w: 100 + PAD * 2, h: 40 + PAD * 2 });
});

test("expanded views are identified", () => {
  assert.equal(isExpanded("music"), true);
  assert.equal(isExpanded("peek"), false);
  assert.equal(isExpanded("collapsed"), false);
});

test("the music view is a short card when there is nothing to show", () => {
  const empty = islandSize({ ...base, view: "music", hasMedia: false });
  const full = islandSize({ ...base, view: "music" });
  assert.ok(empty.h < full.h && empty.w === full.w);
});
