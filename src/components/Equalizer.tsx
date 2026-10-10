import type { CSSProperties } from "react";

// Pure CSS transforms: they run on the compositor, cost next to nothing, and
// stop completely (animation: none) when the music does.
const DURATIONS = [0.92, 1.18, 0.78, 1.06, 0.86];

export function Equalizer({ playing, bars = 4 }: { playing: boolean; bars?: number }) {
  return (
    <span className="eq" data-playing={playing} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--eq-dur": `${DURATIONS[i % DURATIONS.length]}s`,
              "--eq-delay": `${-i * 0.21}s`,
              "--eq-rest": 0.2 + (i % 3) * 0.07,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
