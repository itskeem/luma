import assert from "node:assert/strict";
import { test } from "node:test";
import { accentFromPixels, hslToHex, rgbToHsl } from "./color.ts";

function solid(r: number, g: number, b: number, n = 100): number[] {
  return Array.from({ length: n }).flatMap(() => [r, g, b, 255]);
}

test("rgb/hsl round trip for primaries", () => {
  const [h] = rgbToHsl(255, 0, 0);
  assert.equal(Math.round(h), 0);
  assert.equal(Math.round(rgbToHsl(0, 255, 0)[0]), 120);
  assert.equal(Math.round(rgbToHsl(0, 0, 255)[0]), 240);
  assert.equal(hslToHex(0, 1, 0.5), "#ff0000");
  assert.equal(hslToHex(240, 1, 0.5), "#0000ff");
});

test("a red cover gives a red accent, tuned for a dark surface", () => {
  const a = accentFromPixels(solid(200, 30, 40));
  assert.ok(a);
  assert.ok(a.h < 10 || a.h > 350, `hue ${a.h}`);
  assert.ok(a.l >= 0.56 && a.l <= 0.68);
  assert.ok(a.s >= 0.5);
});

test("the dominant colour wins over a minority", () => {
  const px = [...solid(20, 160, 60, 80), ...solid(200, 40, 40, 20)];
  const a = accentFromPixels(px);
  assert.ok(a);
  assert.ok(a.h > 100 && a.h < 160, `hue ${a.h}`);
});

test("greyscale, black and white covers give no accent", () => {
  assert.equal(accentFromPixels(solid(128, 128, 128)), null);
  assert.equal(accentFromPixels(solid(0, 0, 0)), null);
  assert.equal(accentFromPixels(solid(255, 255, 255)), null);
  assert.equal(accentFromPixels([]), null);
});

test("transparent pixels are ignored", () => {
  const px = Array.from({ length: 100 }).flatMap(() => [200, 30, 40, 0]);
  assert.equal(accentFromPixels(px), null);
});

test("a few stray coloured pixels in a grey cover are not enough", () => {
  const px = [...solid(120, 120, 120, 500), ...solid(250, 20, 20, 2)];
  assert.equal(accentFromPixels(px), null);
});
