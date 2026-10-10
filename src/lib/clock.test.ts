import assert from "node:assert/strict";
import test from "node:test";
import { formatClockDate, formatClockTime, formatCompactClock } from "./clock.ts";

test("formatClockTime handles 24h format with and without seconds", () => {
  const d = new Date(2026, 9, 10, 14, 30, 45); // 14:30:45
  const resNoSec = formatClockTime(d, "24h", false);
  assert.equal(resNoSec.timeStr, "14:30");
  assert.equal(resNoSec.seconds, undefined);
  assert.equal(resNoSec.period, undefined);
  assert.equal(resNoSec.full, "14:30");

  const resSec = formatClockTime(d, "24h", true);
  assert.equal(resSec.timeStr, "14:30");
  assert.equal(resSec.seconds, "45");
  assert.equal(resSec.full, "14:30:45");
});

test("formatClockTime handles 12h format morning and afternoon", () => {
  const morning = new Date(2026, 9, 10, 4, 5, 9); // 04:05:09 AM
  const mRes = formatClockTime(morning, "12h", false);
  assert.equal(mRes.timeStr, "04:05");
  assert.equal(mRes.period, "AM");
  assert.equal(mRes.full, "04:05 AM");

  const noon = new Date(2026, 9, 10, 12, 0, 0); // 12:00:00 PM
  const nRes = formatClockTime(noon, "12h", false);
  assert.equal(nRes.timeStr, "12:00");
  assert.equal(nRes.period, "PM");

  const midnight = new Date(2026, 9, 10, 0, 0, 0); // 12:00:00 AM
  const midRes = formatClockTime(midnight, "12h", true);
  assert.equal(midRes.timeStr, "12:00");
  assert.equal(midRes.period, "AM");
  assert.equal(midRes.seconds, "00");
  assert.equal(midRes.full, "12:00:00 AM");

  const evening = new Date(2026, 9, 10, 23, 59, 59); // 11:59:59 PM
  const eveRes = formatClockTime(evening, "12h", true);
  assert.equal(eveRes.timeStr, "11:59");
  assert.equal(eveRes.period, "PM");
  assert.equal(eveRes.seconds, "59");
  assert.equal(eveRes.full, "11:59:59 PM");
});

test("formatClockDate formats weekday and full date", () => {
  const d = new Date(2026, 9, 10, 14, 30); // 10 October 2026 is Saturday
  const res = formatClockDate(d, "en-US");
  assert.equal(res.weekday, "Saturday");
  assert.equal(res.dayMonth, "October 10");
  assert.ok(res.fullDate.includes("Saturday"));
  assert.ok(res.fullDate.includes("10"));
  assert.ok(res.badge.includes("SATURDAY"));
});

test("formatCompactClock formats clean short string for pills", () => {
  const d1 = new Date(2026, 9, 10, 14, 5);
  assert.equal(formatCompactClock(d1, "24h"), "14:05");
  assert.equal(formatCompactClock(d1, "12h"), "2:05p");

  const d2 = new Date(2026, 9, 10, 9, 30);
  assert.equal(formatCompactClock(d2, "24h"), "09:30");
  assert.equal(formatCompactClock(d2, "12h"), "9:30a");
});
