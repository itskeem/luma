import { useEffect, useState } from "react";
import {
  formatClockDate,
  formatClockTime,
  type ClockFormat,
  type FormattedDate,
  type FormattedTime,
} from "./clock.ts";

export interface LiveClock {
  now: Date;
  time: FormattedTime;
  date: FormattedDate;
}

/**
 * Live system clock that updates automatically without requiring page refresh.
 *
 * Aligns strictly to clock boundaries (seconds or minutes), avoiding unnecessary
 * interval wakes while idle. Responds immediately to visibility and wake events.
 */
export function useLiveClock(format: ClockFormat = "24h", showSeconds: boolean = false): LiveClock {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timerId: number;

    const schedule = () => {
      const d = new Date();
      setNow(d);

      if (showSeconds) {
        // Align to the next whole second boundary
        const delay = Math.max(20, 1000 - d.getMilliseconds() + 5);
        timerId = window.setTimeout(schedule, delay);
      } else {
        // Align to the next whole minute boundary
        const delay = Math.max(50, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
        timerId = window.setTimeout(schedule, delay);
      }
    };

    schedule();

    // Re-sync immediately on visibility or focus return (e.g. machine woke from sleep)
    const onSync = () => {
      if (!document.hidden) {
        setNow(new Date());
      }
    };

    document.addEventListener("visibilitychange", onSync);
    window.addEventListener("focus", onSync);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onSync);
      window.removeEventListener("focus", onSync);
    };
  }, [showSeconds]);

  const time = formatClockTime(now, format, showSeconds);
  const date = formatClockDate(now);

  return { now, time, date };
}
