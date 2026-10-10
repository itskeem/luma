import { useLiveClock } from "../lib/useLiveClock.ts";
import { formatTime } from "../lib/format.ts";
import type { BaseView } from "../state/useIsland.ts";
import type { FocusTimer } from "../state/useFocusTimer.ts";
import type { MediaView } from "../state/useMedia.ts";
import type { ClockFormat, ControlAction, Settings } from "../types.ts";
import { Artwork } from "./Artwork.tsx";
import {
  ChevronUpIcon,
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  SkipIcon,
  SlidersIcon,
} from "./icons.tsx";

const PHASE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" } as const;
const RING = 2 * Math.PI * 34;

interface ToolsViewProps {
  timer: FocusTimer;
  roundsBeforeLong: number;
  media: MediaView;
  clockFormat: ClockFormat;
  showSeconds: boolean;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onMediaCommand: (a: ControlAction) => void;
  go: (v: BaseView) => void;
}

/**
 * Section 5: The Companion Panel.
 *
 * Revealed by clicking or expanding the island:
 * - Prominent clock and date with quick 12h/24h toggle
 * - Music shortcut card with resume/pause and jump to player
 * - Accurate drift-free focus timer
 * - Quick shortcuts to full music view and settings
 */
export function ToolsView({
  timer,
  roundsBeforeLong,
  media,
  clockFormat,
  showSeconds,
  onUpdateSettings,
  onMediaCommand,
  go,
}: ToolsViewProps) {
  const { time, date } = useLiveClock(clockFormat, showSeconds);

  const done = timer.completedFocus % roundsBeforeLong;
  const progress = timer.totalMs > 0 ? 1 - timer.remainingMs / timer.totalMs : 0;

  const active = media.state.active;
  const isPlaying = active?.status === "playing";

  const toggleFormat = () => {
    onUpdateSettings({ clockFormat: clockFormat === "24h" ? "12h" : "24h" });
  };

  return (
    <div className="panel tools">
      {/* Header with large clock, date, 12h/24h toggle, and nav */}
      <div className="tools-head">
        <div className="tools-clock-group">
          <div className="tools-time-row">
            <span className="clock-time">{time.timeStr}</span>
            {time.seconds && <span className="clock-time-sec">:{time.seconds}</span>}
            {time.period && <span className="clock-time-period">{time.period}</span>}
            <button
              type="button"
              className="btn-format-pill"
              title={`Switch to ${clockFormat === "24h" ? "12-hour" : "24-hour"} format`}
              onClick={toggleFormat}
            >
              {clockFormat.toUpperCase()}
            </button>
          </div>
          <div className="clock-date" title={date.fullDate}>
            {date.fullDate}
          </div>
        </div>

        <div className="nav">
          <button
            type="button"
            className="btn-icon"
            aria-label="Open Music player"
            title="Music Player"
            onClick={() => go("music")}
          >
            <MusicIcon />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="Settings"
            title="Settings"
            onClick={() => go("settings")}
          >
            <SlidersIcon />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="Collapse island"
            title="Collapse"
            onClick={() => go("clock")}
          >
            <ChevronUpIcon />
          </button>
        </div>
      </div>

      {/* Music quick shortcut card (Section 5 requirement) */}
      {active && (
        <div className="companion-music-card" data-playing={isPlaying}>
          <div className="companion-music-art" onClick={() => go("music")} title="Open music player">
            <Artwork src={media.artworkUrl} size={36} brand />
          </div>
          <div className="companion-music-meta" onClick={() => go("music")} title="Open music player">
            <div className="companion-music-title">{active.track.title || "Unknown Track"}</div>
            <div className="companion-music-artist">
              {active.track.artist ? `${active.track.artist} · ` : ""}
              <span className="status-label">{isPlaying ? "Playing" : "Paused"}</span>
            </div>
          </div>
          <div className="companion-music-actions">
            <button
              type="button"
              className="btn-round-mini btn-primary"
              aria-label={isPlaying ? "Pause music" : "Resume music"}
              title={isPlaying ? "Pause" : "Resume"}
              disabled={isPlaying ? !active.controls.pause : !active.controls.play}
              onClick={() => onMediaCommand({ kind: "toggle" })}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="btn-round-mini"
              aria-label="Next track"
              title="Next track"
              disabled={!active.controls.next}
              onClick={() => onMediaCommand({ kind: "next" })}
            >
              <NextIcon />
            </button>
          </div>
        </div>
      )}

      {/* Focus Timer Section */}
      <div className="focus" data-phase={timer.phase} data-running={timer.running}>
        <div className="ring" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle className="ring-track" cx="40" cy="40" r="34" />
            <circle
              className="ring-fill"
              cx="40"
              cy="40"
              r="34"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - progress)}
            />
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
          <button
            type="button"
            className="btn-round btn-primary"
            aria-label={timer.running ? "Pause timer" : "Start timer"}
            onClick={timer.toggle}
          >
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
