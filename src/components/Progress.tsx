import { useRef, useState } from "react";
import { clamp, formatTime } from "../lib/format.ts";

interface Props {
  positionMs: number | null;
  durationMs: number | null;
  canSeek: boolean;
  onSeek: (ms: number) => void;
}

export function Progress({ positionMs, durationMs, canSeek, onSeek }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  // After a seek the player takes a moment to report the new position; hold the
  // clicked spot so the bar doesn't snap back in between.
  const [held, setHeld] = useState<number | null>(null);
  const known = positionMs !== null && durationMs !== null && durationMs > 0;
  const pos = held ?? positionMs ?? 0;
  const frac = known ? clamp(pos / durationMs, 0, 1) : 0;

  const seek = (clientX: number) => {
    if (!canSeek || !known || !bar.current) return;
    const r = bar.current.getBoundingClientRect();
    const ms = Math.round(clamp((clientX - r.left) / r.width, 0, 1) * durationMs);
    setHeld(ms);
    onSeek(ms);
    window.setTimeout(() => setHeld(null), 900);
  };

  return (
    <div className="progress" data-seekable={canSeek && known} data-known={known}>
      <div
        ref={bar}
        className="progress-bar"
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={known ? Math.round(durationMs / 1000) : 0}
        aria-valuenow={Math.round(pos / 1000)}
        aria-disabled={!canSeek || !known}
        onPointerDown={(e) => seek(e.clientX)}
      >
        <div className="progress-fill" style={{ transform: `scaleX(${frac})` }} />
      </div>
      <div className="progress-times">
        <span>{known ? formatTime(pos) : ""}</span>
        <span>{known ? formatTime(durationMs) : "No timeline"}</span>
      </div>
    </div>
  );
}
