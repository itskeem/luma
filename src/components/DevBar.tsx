import { useState } from "react";
import type { PreviewControls } from "../lib/backend.ts";

/** Shown only in the browser preview. Never rendered inside the desktop app. */
export function DevBar({ controls }: { controls: PreviewControls }) {
  const [current, setCurrent] = useState(controls.scenario());
  return (
    <div className="devbar">
      <strong>Preview, simulated playback. Not a real media session.</strong>
      <div>
        {controls.scenarios.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === current}
            onClick={() => {
              controls.setScenario(s);
              setCurrent(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
