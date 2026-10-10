export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 83_000 → "1:23", 3_725_000 → "1:02:05". Negative or NaN → "0:00". */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Where the position is now, given a timeline captured earlier. */
export function positionNow(
  t: { positionMs: number; durationMs: number; capturedAtMs: number; rate: number },
  playing: boolean,
  now: number,
): number {
  if (!playing) return clamp(t.positionMs, 0, t.durationMs);
  const elapsed = Math.max(0, now - t.capturedAtMs) * t.rate;
  return clamp(t.positionMs + elapsed, 0, t.durationMs);
}
