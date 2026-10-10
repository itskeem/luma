import orb from "../assets/luma-orb.png";
import { useLiveClock } from "../lib/useLiveClock.ts";
import type { ClockFormat } from "../types.ts";

interface ClockFaceProps {
  clockFormat: ClockFormat;
  showSeconds: boolean;
  timerLabel: string | null;
  compact?: boolean;
}

/**
 * State A: The Idle Clock Island.
 *
 * Prominently presents the current local time in refined typography,
 * accompanied by the full weekday and date, with a subtle atmospheric glow.
 */
export function ClockFace({ clockFormat, showSeconds, timerLabel, compact = false }: ClockFaceProps) {
  const { time, date } = useLiveClock(clockFormat, showSeconds);

  return (
    <div className="clock-island" data-compact={compact}>
      <div className="clock-left">
        <div className="clock-orb-wrap" title="Luma">
          <img className="clock-orb" src={orb} alt="Luma" draggable={false} />
          <span className="clock-orb-glow" aria-hidden="true" />
        </div>
      </div>

      <div className="clock-body">
        <div className="clock-primary-time">
          <span className="time-digits">{time.timeStr}</span>
          {time.seconds && <span className="time-seconds">:{time.seconds}</span>}
          {time.period && <span className="time-period">{time.period}</span>}
        </div>
        <div className="clock-subtitle" title={date.fullDate}>
          <span className="date-badge">{date.badge}</span>
        </div>
      </div>

      {timerLabel && (
        <div className="clock-timer-chip" title="Focus session in progress">
          <span className="chip-dot" />
          <span className="chip-text">{timerLabel}</span>
        </div>
      )}
    </div>
  );
}
