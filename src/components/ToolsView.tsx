import { useEffect, useState } from "react";
import { formatTime } from "../lib/format.ts";
import type { BaseView } from "../state/useIsland.ts";
import type { FocusTimer } from "../state/useFocusTimer.ts";
import { PauseIcon, PlayIcon, ResetIcon, SkipIcon } from "./icons.tsx";
import { Nav } from "./MusicView.tsx";

const PHASE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" } as const;

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Align to the minute: the clock shows no seconds, so it never needs to wake more often.
    let id: number;
    const schedule = () => {
      const n = new Date();
      id = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (n.getSeconds() * 1000 + n.getMilliseconds()) + 50);
    };
    schedule();
    return () => window.clearTimeout(id);
  }, []);
  return now;
}

const RING = 2 * Math.PI * 34;

export function ToolsView({ timer, roundsBeforeLong, go }: { timer: FocusTimer; roundsBeforeLong: number; go: (v: BaseView) => void }) {
  const now = useClock();
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const done = timer.completedFocus % roundsBeforeLong;
  const progress = timer.totalMs > 0 ? 1 - timer.remainingMs / timer.totalMs : 0;

  return (
    <div className="panel tools">
      <div className="tools-head">
        <div>
          <div className="clock-time">{time}</div>
          <div className="clock-date">{date}</div>
        </div>
        <Nav go={go} current="tools" />
      </div>

      <div className="focus" data-phase={timer.phase} data-running={timer.running}>
        <div className="ring" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle className="ring-track" cx="40" cy="40" r="34" />
            <circle className="ring-fill" cx="40" cy="40" r="34" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
          </svg>
        </div>
        <div className="focus-main">
          <div className="focus-phase">{PHASE_LABEL[timer.phase]}</div>
          <div className="focus-time" role="timer" aria-live="off">
            {formatTime(timer.remainingMs)}
          </div>
          <div className="rounds" aria-label={`${done} of ${roundsBeforeLong} focus sessions done`}>
            {Array.from({ length: roundsBeforeLong }, (_, i) => (
              <i key={i} data-done={i < done} />
            ))}
          </div>
        </div>
        <div className="focus-actions">
          <button type="button" className="btn-round btn-primary" aria-label={timer.running ? "Pause timer" : "Start timer"} onClick={timer.toggle}>
            {timer.running ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="btn-icon" aria-label="Skip to next phase" onClick={timer.skip}>
            <SkipIcon />
          </button>
          <button type="button" className="btn-icon" aria-label="Reset this phase" onClick={timer.reset}>
            <ResetIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
