import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialTimer,
  pause as pauseTimer,
  phaseMs,
  remaining,
  resetPhase,
  skip as skipTimer,
  start as startTimer,
  followConfig,
  tick,
  type Phase,
  type TimerConfig,
  type TimerState,
} from "../lib/pomodoro.ts";

export interface FocusTimer {
  phase: Phase;
  running: boolean;
  remainingMs: number;
  totalMs: number;
  completedFocus: number;
  toggle: () => void;
  skip: () => void;
  reset: () => void;
}

/**
 * The focus timer. State lives here, above the views, so it keeps counting
 * while the island is collapsed. It only wakes up once a second while running.
 */
export function useFocusTimer(cfg: TimerConfig, onFinished: (phase: Phase) => void): FocusTimer {
  const [timer, setTimer] = useState<TimerState>(() => initialTimer(cfg));
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef(timer);
  const cfgRef = useRef(cfg);
  const finishedRef = useRef(onFinished);

  useEffect(() => {
    cfgRef.current = cfg;
    finishedRef.current = onFinished;
  });

  const commit = useCallback((next: TimerState) => {
    timerRef.current = next;
    setTimer(next);
  }, []);

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const res = tick(timerRef.current, cfgRef.current, t);
      if (res.finished) {
        commit(res.state);
        finishedRef.current(res.finished);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer.running, commit]);

  const toggle = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const cur = followConfig(timerRef.current, cfgRef.current);
    commit(cur.running ? pauseTimer(cur, t) : startTimer(cur, t));
  }, [commit]);

  const skip = useCallback(() => {
    const t = Date.now();
    setNow(t);
    commit(skipTimer(timerRef.current, cfgRef.current, t));
  }, [commit]);

  const reset = useCallback(() => commit(resetPhase(timerRef.current, cfgRef.current)), [commit]);

  // A stopped, untouched timer shows the durations currently in settings.
  const shown = followConfig(timer, cfg);
  return {
    phase: shown.phase,
    running: shown.running,
    remainingMs: remaining(shown, now),
    totalMs: phaseMs(shown.phase, cfg),
    completedFocus: shown.completedFocus,
    toggle,
    skip,
    reset,
  };
}
