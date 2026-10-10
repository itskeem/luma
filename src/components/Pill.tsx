import orb from "../assets/luma-orb.png";
import type { MediaView } from "../state/useMedia.ts";
import type { Peek } from "../state/useIsland.ts";
import { Artwork } from "./Artwork.tsx";
import { Equalizer } from "./Equalizer.tsx";

interface PillProps {
  media: MediaView;
  timerLabel: string | null;
  clockTime?: string | null;
}

/** The collapsed island: a thumbnail, a tiny equalizer, a subtle clock and focus countdown. */
export function Pill({ media, timerLabel, clockTime }: PillProps) {
  const active = media.state.active;
  if (!active) {
    return (
      <div className="pill pill-idle">
        <img className="pill-orb" src={orb} alt="" draggable={false} />
        <span className="pill-name">{clockTime ?? timerLabel ?? "Luma"}</span>
      </div>
    );
  }
  const playing = active.status === "playing";
  return (
    <div className="pill" data-playing={playing}>
      <Artwork src={media.artworkUrl} size={24} brand />
      <Equalizer playing={playing} bars={4} />
      <span className="pill-spacer" />
      {clockTime && <span className="pill-clock">{clockTime}</span>}
      {timerLabel && <span className="pill-timer">{timerLabel}</span>}
      <span className="pill-dot" data-playing={playing} title={playing ? "Playing" : "Paused"} />
    </div>
  );
}

/** A short announcement above the pill: the new track, or a timer message. */
export function PeekBar({ media, peek }: { media: MediaView; peek: Peek }) {
  if (peek.kind === "message") {
    return (
      <div className="peek">
        <img className="pill-orb" src={orb} alt="" draggable={false} />
        <div className="peek-text">
          <strong>{peek.text}</strong>
        </div>
      </div>
    );
  }
  const a = media.state.active;
  if (!a) return null;
  return (
    <div className="peek">
      <Artwork src={media.artworkUrl} size={30} brand />
      <div className="peek-text">
        <strong>{a.track.title || "Unknown title"}</strong>
        {a.track.artist && <span>{a.track.artist}</span>}
      </div>
      <Equalizer playing={a.status === "playing"} bars={4} />
    </div>
  );
}

