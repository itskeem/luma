// Focus timer as pure functions over timestamps (not tick counts), so a throttled
// or hidden webview never makes it drift: the end time is fixed when it starts.

export type Phase = "focus" | "short" | "long";

export interface TimerConfig {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  roundsBeforeLong: number;
  autoStartNext: boolean;
}

export interface TimerState {
  phase: Phase;
  running: boolean;
  /** Epoch ms the phase ends, while running. */
  endsAt: number | null;
  /** Time left when not running. */
  remainingMs: number;
  /** True while `remainingMs` is a whole, untouched phase (so it may follow settings changes). */
  fresh: boolean;
  /** Focus sessions finished so far. */
  completedFocus: number;
}

export function phaseMs(phase: Phase, cfg: TimerConfig): number {
  const min = phase === "focus" ? cfg.focusMin : phase === "short" ? cfg.shortBreakMin : cfg.longBreakMin;
  return min * 60_000;
}

function stopped(phase: Phase, completedFocus: number, cfg: TimerConfig): TimerState {
  return { phase, running: false, endsAt: null, remainingMs: phaseMs(phase, cfg), fresh: true, completedFocus };
}

export function initialTimer(cfg: TimerConfig): TimerState {
  return stopped("focus", 0, cfg);
}

export function remaining(s: TimerState, now: number): number {
  return s.running && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs;
}

export function start(s: TimerState, now: number): TimerState {
  if (s.running) return s;
  return { ...s, running: true, endsAt: now + s.remainingMs };
}

export function pause(s: TimerState, now: number): TimerState {
  if (!s.running) return s;
  return { ...s, running: false, endsAt: null, remainingMs: remaining(s, now), fresh: false };
}

export function resetPhase(s: TimerState, cfg: TimerConfig): TimerState {
  return stopped(s.phase, s.completedFocus, cfg);
}

function nextPhase(s: TimerState, cfg: TimerConfig): { phase: Phase; completedFocus: number } {
  if (s.phase === "focus") {
    const completedFocus = s.completedFocus + 1;
    return { phase: completedFocus % cfg.roundsBeforeLong === 0 ? "long" : "short", completedFocus };
  }
  return { phase: "focus", completedFocus: s.completedFocus };
}

/** Moves to the next phase without waiting for the clock (the "skip" button). */
export function skip(s: TimerState, cfg: TimerConfig, now: number): TimerState {
  const { phase, completedFocus } = nextPhase(s, cfg);
  const next = stopped(phase, completedFocus, cfg);
  return s.running ? start(next, now) : next;
}

/**
 * Advances the timer if its time is up. `finished` names the phase that just
 * ended so the UI can announce it. With auto-start the next phase begins where
 * the last one ended (not at `now`), so a late tick adds no drift.
 */
export function tick(s: TimerState, cfg: TimerConfig, now: number): { state: TimerState; finished: Phase | null } {
  if (!s.running || s.endsAt === null || now < s.endsAt) return { state: s, finished: null };
  const finished = s.phase;
  const { phase, completedFocus } = nextPhase(s, cfg);
  const next = stopped(phase, completedFocus, cfg);
  if (!cfg.autoStartNext) return { state: next, finished };
  const endsAt = s.endsAt + next.remainingMs;
  // Far behind (the machine slept)? Start the next phase from now rather than racing through phases.
  return { state: { ...next, running: true, endsAt: endsAt > now ? endsAt : now + next.remainingMs }, finished };
}

/** A stopped, untouched timer follows duration changes made in settings. */
export function followConfig(s: TimerState, cfg: TimerConfig): TimerState {
  if (s.running || !s.fresh) return s;
  const ms = phaseMs(s.phase, cfg);
  return ms === s.remainingMs ? s : { ...s, remainingMs: ms };
}
