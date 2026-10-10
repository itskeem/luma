// Pure pet mood logic — no React, no DOM, no side effects.
// A pure function of observable state → { mood, variant }.
//
// Leave an `energy` seam (0..1, constant for now) so a future audio-reactive
// source can drive the dance intensity without redesigning the interface.

export type Mood =
  | "sleeping"  // no player, or stopped 30 s+
  | "idle"      // paused
  | "grooving"  // playing
  | "perk"      // track just changed (~1.5 s)
  | "focused"   // focus phase running
  | "break"     // break phase running
  | "celebrate" // timer just finished (~3 s)
  | "happy"     // clicked
  | "carried";  // being dragged

/** Chosen deterministically from a hash of title+artist so songs feel different. */
export type DanceVariant = 0 | 1 | 2 | 3;

export interface PetOutput {
  mood: Mood;
  /** Only meaningful when mood === "grooving". */
  variant: DanceVariant;
  /** 0..1 placeholder for audio-reactive energy. Always 1 for now. */
  energy: number;
}

export interface PetInput {
  /** Is there a player active (not null)? */
  hasMedia: boolean;
  /** Is music playing right now? */
  playing: boolean;
  /** How long (ms) since music last stopped. -1 if it never played. */
  msSinceStopped: number;
  /** Is the focus timer's current phase a focus phase? */
  focusPhase: boolean;
  /** Is the break phase running? */
  breakPhase: boolean;
  /** Is the focus timer running at all? */
  focusRunning: boolean;
  /** True during a brief window after the timer finishes a phase. */
  celebrating: boolean;
  /** True during the brief perk window after a track change. */
  perking: boolean;
  /** User clicked / tapped the pet sprite. */
  happy: boolean;
  /** User is dragging the pet window. */
  dragging: boolean;
  /** Title + artist of the current track (used to pick a stable variant). */
  trackKey: string;
  /** reacts_to_music setting. If false, pet ignores playback state. */
  reactsToMusic: boolean;
  /** reacts_to_focus setting. If false, pet ignores timer state. */
  reactsToFocus: boolean;
  /** Audio-reactive energy seam. 0..1, default 1.0. */
  energy: number;
}

/** Threshold for sleeping after stopping (ms). */
export const SLEEP_AFTER_MS = 30_000;

/** djb2 hash for deterministic dance variant. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function danceVariant(trackKey: string): DanceVariant {
  return (hash(trackKey) % 4) as DanceVariant;
}

export function petMood(input: PetInput): PetOutput {
  const {
    hasMedia, playing, msSinceStopped,
    focusPhase, breakPhase, focusRunning,
    celebrating, perking, happy, dragging,
    trackKey, reactsToMusic, reactsToFocus, energy,
  } = input;

  const variant = danceVariant(trackKey);

  if (dragging) return { mood: "carried", variant, energy };
  if (happy)    return { mood: "happy",   variant, energy };
  if (celebrating) return { mood: "celebrate", variant, energy };

  // Focus timer overrides music reactions.
  if (reactsToFocus && focusRunning) {
    if (focusPhase) return { mood: "focused", variant, energy };
    if (breakPhase) return { mood: "break",   variant, energy };
  }

  if (reactsToMusic) {
    if (perking) return { mood: "perk", variant, energy };
    if (playing) return { mood: "grooving", variant, energy };
    // Paused: stay "idle" briefly; after SLEEP_AFTER_MS become sleeping.
    if (hasMedia && msSinceStopped >= 0 && msSinceStopped < SLEEP_AFTER_MS) {
      return { mood: "idle", variant, energy };
    }
  }

  return { mood: "sleeping", variant, energy };
}
