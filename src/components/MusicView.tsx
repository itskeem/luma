import type { MediaView } from "../state/useMedia.ts";
import type { BaseView } from "../state/useIsland.ts";
import type { ControlAction, Density } from "../types.ts";
import { Artwork } from "./Artwork.tsx";
import { Equalizer } from "./Equalizer.tsx";
import { ChevronUpIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, SlidersIcon, TimerIcon } from "./icons.tsx";
import { Progress } from "./Progress.tsx";

interface Props {
  media: MediaView;
  position: number | null;
  density: Density;
  command: (a: ControlAction) => void;
  pin: (id: string | null) => void;
  go: (v: BaseView) => void;
}

export function MusicView({ media, position, density, command, pin, go }: Props) {
  const { state } = media;
  const a = state.active;

  if (!state.available) {
    return (
      <div className="panel panel-empty">
        <Nav go={go} current="music" />
        <p className="empty-title">Media controls aren’t available here</p>
        <p className="empty-text">{state.error ?? "This system doesn’t expose media sessions."}</p>
      </div>
    );
  }
  if (!a) {
    return (
      <div className="panel panel-empty">
        <Nav go={go} current="music" />
        <p className="empty-title">Nothing is playing</p>
        <p className="empty-text">Start music in Spotify, YouTube Music or your browser. Luma follows along.</p>
      </div>
    );
  }

  const playing = a.status === "playing";
  const canToggle = playing ? a.controls.pause : a.controls.play;
  const status = a.status === "playing" ? null : a.status === "loading" ? "Loading" : a.status === "paused" ? "Paused" : "Stopped";
  const compact = density === "compact";

  return (
    <div className="panel music" data-compact={compact}>
      <div className="music-top">
        <Artwork src={media.artworkUrl} size={compact ? 64 : 92} brand />
        <div className="meta">
          <div className="meta-source">
            <span>{a.appName}</span>
            {status && <span className="status-chip">{status}</span>}
          </div>
          <div className="meta-title" title={a.track.title}>
            {a.track.title || "Unknown title"}
          </div>
          {a.track.artist && <div className="meta-artist">{a.track.artist}</div>}
          {!compact && a.track.album && <div className="meta-album">{a.track.album}</div>}
        </div>
      </div>

      <Progress
        positionMs={position}
        durationMs={a.timeline?.durationMs ?? null}
        canSeek={a.controls.seek}
        onSeek={(ms) => command({ kind: "seek", positionMs: ms })}
      />

      <div className="controls-row">
        <div className="controls-left">
          <Equalizer playing={playing} bars={5} />
        </div>
        <div className="transport">
          <button type="button" className="btn-round" aria-label="Previous track" disabled={!a.controls.previous} onClick={() => command({ kind: "previous" })}>
            <PrevIcon />
          </button>
          <button
            type="button"
            className="btn-round btn-primary"
            aria-label={playing ? "Pause" : "Play"}
            disabled={!canToggle}
            onClick={() => command({ kind: "toggle" })}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="btn-round" aria-label="Next track" disabled={!a.controls.next} onClick={() => command({ kind: "next" })}>
            <NextIcon />
          </button>
        </div>
        <Nav go={go} current="music" />
      </div>

      {state.players.length > 1 && (
        <div className="players" role="radiogroup" aria-label="Active player">
          <button type="button" role="radio" aria-checked={state.pinnedId === null} onClick={() => pin(null)}>
            Auto
          </button>
          {state.players.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={state.pinnedId === p.id} data-playing={p.status === "playing"} onClick={() => pin(p.id)}>
              {p.appName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Switch between views; the last button folds the island. */
export function Nav({ go, current }: { go: (v: BaseView) => void; current: BaseView }) {
  return (
    <div className="nav">
      {current !== "tools" && (
        <button type="button" className="btn-icon" aria-label="Focus timer and clock" onClick={() => go("tools")}>
          <TimerIcon />
        </button>
      )}
      {current !== "settings" && (
        <button type="button" className="btn-icon" aria-label="Settings" onClick={() => go("settings")}>
          <SlidersIcon />
        </button>
      )}
      <button type="button" className="btn-icon" aria-label="Collapse" onClick={() => go("collapsed")}>
        <ChevronUpIcon />
      </button>
    </div>
  );
}
