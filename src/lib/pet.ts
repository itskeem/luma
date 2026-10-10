// The pet's behaviour as pure functions: no React, no DOM, no timers.
// The window (src/pet/PetApp.tsx) owns the clocks and feeds the results in.
//
// The mechanics follow what makes Coucou's companion feel alive: eyes that follow
// the pointer anywhere, a poke that annoys it (and three quick ones that make it
// dizzy), irregular blinking, a greeting, a dance locked to a beat, and sleep after
// a long quiet spell. The character itself is Luma's own.

export type Mood =
  | "sleeping"  // quiet for a long while, pointer far away
  | "idle"      // awake, nothing going on
  | "grooving"  // music is playing
  | "perk"      // the track just changed
  | "focused"   // focus phase running
  | "break"     // break phase running
  | "celebrate" // a timer phase just finished
  | "hello"     // appearing / greeting
  | "annoyed"   // poked
  | "dizzy"     // poked too much
  | "carried";  // being dragged

/** Picked from the track, so different songs get a slightly different dance. */
export type DanceVariant = 0 | 1 | 2 | 3;

export interface PetOutput {
  mood: Mood;
  /** Only meaningful when mood === "grooving". */
  variant: DanceVariant;
  /** 0..1 seam for a future audio-reactive source. Always 1 for now. */
  energy: number;
}

export interface PetInput {
  /** Music is playing right now. */
  playing: boolean;
  focusPhase: boolean;
  breakPhase: boolean;
  focusRunning: boolean;
  /** Brief windows opened by events (the window times them). */
  celebrating: boolean;
  perking: boolean;
  hello: boolean;
  annoyed: boolean;
  dizzy: boolean;
  dragging: boolean;
  /** Quiet for SLEEP_AFTER_MS with the pointer away. */
  asleep: boolean;
  /** Title + artist, used to pick a stable dance variant. */
  trackKey: string;
  reactsToMusic: boolean;
  reactsToFocus: boolean;
  energy: number;
}

// ── Timings (ms) ──────────────────────────────────────────────────────────────

/** No activity for this long (and the pointer away) and it dozes off. */
export const SLEEP_AFTER_MS = 120_000;
/** It only dozes off while the pointer is at least this far away (logical px). */
export const SLEEP_POINTER_DISTANCE = 150;
export const HELLO_MS = 1_700;
export const PERK_MS = 1_500;
export const CELEBRATE_MS = 3_000;
export const ANNOYED_MS = 1_100;
export const DIZZY_MS = 2_600;
/** This many pokes inside DIZZY_WINDOW_MS make it dizzy. */
export const DIZZY_POKES = 3;
export const DIZZY_WINDOW_MS = 1_700;

// ── Mood ──────────────────────────────────────────────────────────────────────

/** djb2: stable across runs, so a song always gets the same dance. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function danceVariant(trackKey: string): DanceVariant {
  return (hash(trackKey) % 4) as DanceVariant;
}

/**
 * What the pet is doing. Things the user does to it come first, then the focus
 * timer (it outranks music: working matters more than the beat), then music,
 * then rest.
 */
export function petMood(i: PetInput): PetOutput {
  const out = (mood: Mood): PetOutput => ({ mood, variant: danceVariant(i.trackKey), energy: i.energy });

  if (i.dragging) return out("carried");
  if (i.dizzy) return out("dizzy");
  if (i.annoyed) return out("annoyed");
  if (i.hello) return out("hello");
  if (i.celebrating) return out("celebrate");

  if (i.reactsToFocus && i.focusRunning) {
    if (i.focusPhase) return out("focused");
    if (i.breakPhase) return out("break");
  }
  if (i.reactsToMusic) {
    if (i.perking && i.playing) return out("perk");
    if (i.playing) return out("grooving");
  }
  return out(i.asleep ? "sleeping" : "idle");
}

// ── Poking ────────────────────────────────────────────────────────────────────

export interface PokeResult {
  /** Timestamps still inside the window, to pass back next time. */
  history: number[];
  /** True when this poke tipped it over. */
  dizzy: boolean;
}

/** Records a poke at `now`; the third inside the window makes it dizzy and starts over. */
export function registerPoke(history: readonly number[], now: number): PokeResult {
  const recent = [...history.filter((t) => now - t <= DIZZY_WINDOW_MS), now];
  if (recent.length >= DIZZY_POKES) return { history: [], dizzy: true };
  return { history: recent, dizzy: false };
}

// ── Blinking ──────────────────────────────────────────────────────────────────

/** Time to the next blink for a random `r` in [0, 1): 2.2 to 5.4 s, never metronomic. */
export function nextBlinkDelayMs(r: number): number {
  return 2_200 + clamp01(r) * 3_200;
}

/** Roughly one blink in five is a quick double. */
export function isDoubleBlink(r: number): boolean {
  return r < 0.22;
}

// ── Looking ───────────────────────────────────────────────────────────────────

/**
 * Where to look, from the pointer's offset to the pet's centre (logical px).
 * Returns -1..1 on each axis: the direction, scaled by how far away the pointer is
 * (so it glances at a pointer beside it and looks hard at one far away).
 */
export function lookVector(dx: number, dy: number, reach = 360): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 2) return { x: 0, y: 0 };
  const k = Math.min(1, d / reach);
  return { x: (dx / d) * k, y: (dy / d) * k };
}

export function pointerIsNear(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) < SLEEP_POINTER_DISTANCE;
}

// ── Dancing ───────────────────────────────────────────────────────────────────

/** The dance is locked to a steady 112 BPM; it does not read the audio. */
export const DANCE_BPM = 112;
export const DANCE_FADE_IN_MS = 300;
export const DANCE_FADE_OUT_MS = 500;

/** One full left-right sway is two beats. */
export function danceCycleSeconds(): number {
  return (60 / DANCE_BPM) * 2;
}

/** How high it bounces (fraction of its size) and how far it sways (degrees). */
export function danceMoves(variant: DanceVariant): { lift: number; sway: number } {
  switch (variant) {
    case 0: return { lift: 0.07, sway: 4 };
    case 1: return { lift: 0.04, sway: 8 };
    case 2: return { lift: 0.1, sway: 2 };
    case 3: return { lift: 0.06, sway: 6 };
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ── Timer events ──────────────────────────────────────────────────────────────

export interface FocusSnapshot {
  phase: string;
  running: boolean;
  /** Unix ms when the running phase ends; 0 when stopped. */
  endsAtMs: number;
}

/**
 * Did a focus/break phase just run out? A phase that ended on its own was running
 * and (within a couple of seconds of) due. Pausing, resetting or skipping part-way
 * changes the state too, but those are the user's doing, not a reason to cheer.
 */
export function focusJustFinished(prev: FocusSnapshot | null, next: FocusSnapshot, now: number): boolean {
  if (!prev || !prev.running || prev.endsAtMs <= 0) return false;
  const moved = !next.running || next.phase !== prev.phase || next.endsAtMs !== prev.endsAtMs;
  return moved && now >= prev.endsAtMs - 2_000;
}
