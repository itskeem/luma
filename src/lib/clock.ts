// Time and date formatting for Luma's adaptive clock.
// Pure functions over Date objects; respects format settings and locales.

export type ClockFormat = "12h" | "24h";

export interface FormattedTime {
  /** The primary time string (e.g. "14:25" or "04:30"). */
  timeStr: string;
  /** Optional seconds (e.g. "45"). */
  seconds?: string;
  /** Optional AM/PM period for 12-hour time (e.g. "AM" or "PM"). */
  period?: string;
  /** Full formatted display string (e.g. "14:25", "14:25:45", or "04:30:45 PM"). */
  full: string;
}

export interface FormattedDate {
  /** Day of the week (e.g. "Saturday"). */
  weekday: string;
  /** Full day and month (e.g. "10 October"). */
  dayMonth: string;
  /** Full formatted date string (e.g. "Saturday, 10 October"). */
  fullDate: string;
  /** Uppercase badge label for the idle clock (e.g. "SATURDAY, 10 OCTOBER"). */
  badge: string;
}

/** Formats local time according to 12h/24h format and seconds preferences. */
export function formatClockTime(date: Date, format: ClockFormat, showSeconds: boolean = false): FormattedTime {
  const is12h = format === "12h";
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const secs = date.getSeconds();

  const minStr = String(minutes).padStart(2, "0");
  const secStr = String(secs).padStart(2, "0");

  if (is12h) {
    const period = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    const hourStr = String(h12).padStart(2, "0");
    const timeStr = `${hourStr}:${minStr}`;
    const full = showSeconds ? `${timeStr}:${secStr} ${period}` : `${timeStr} ${period}`;

    return {
      timeStr,
      seconds: showSeconds ? secStr : undefined,
      period,
      full,
    };
  }

  // 24-hour format
  const hourStr = String(hours).padStart(2, "0");
  const timeStr = `${hourStr}:${minStr}`;
  const full = showSeconds ? `${timeStr}:${secStr}` : timeStr;

  return {
    timeStr,
    seconds: showSeconds ? secStr : undefined,
    full,
  };
}

/** Formats the local date with day of the week and month name. */
export function formatClockDate(date: Date, locale?: string): FormattedDate {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date);
  const fullDate = `${weekday}, ${dayMonth}`;
  const badge = fullDate.toUpperCase();

  return {
    weekday,
    dayMonth,
    fullDate,
    badge,
  };
}

/** Short time string suitable for compact display in the music pill. */
export function formatCompactClock(date: Date, format: ClockFormat): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const minStr = String(minutes).padStart(2, "0");

  if (format === "12h") {
    const period = hours >= 12 ? "p" : "a";
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}:${minStr}${period}`;
  }

  const hourStr = String(hours).padStart(2, "0");
  return `${hourStr}:${minStr}`;
}
