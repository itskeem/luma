import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { DevBar } from "./components/DevBar.tsx";
import { MusicView } from "./components/MusicView.tsx";
import { PeekBar, Pill } from "./components/Pill.tsx";
import { SettingsView } from "./components/SettingsView.tsx";
import { ToolsView } from "./components/ToolsView.tsx";
import { useBackend } from "./lib/backend.ts";
import { formatTime } from "./lib/format.ts";
import { islandSize, isExpanded } from "./lib/layout.ts";
import type { Phase } from "./lib/pomodoro.ts";
import { useFocusTimer } from "./state/useFocusTimer.ts";
import { useDragOrClick, useIsland, useWindowFit } from "./state/useIsland.ts";
import { useMedia, usePosition } from "./state/useMedia.ts";
import { useSettings } from "./state/useSettings.ts";
import type { ControlAction } from "./types.ts";

const FINISHED_TEXT: Record<Phase, string> = {
  focus: "Focus complete. Take a break",
  short: "Break over. Back to focus",
  long: "Long break over. Back to focus",
};

export default function App() {
  const backend = useBackend();
  const settingsApi = useSettings();
  const { settings } = settingsApi;
  const media = useMedia();
  const active = media.state.active;

  const trackKey = active ? `${active.id}|${active.track.title}|${active.track.artist}` : null;
  const island = useIsland({ settings, trackKey, playing: active?.status === "playing" });
  const timer = useFocusTimer(settings.focus, (phase) => island.showMessage(FINISHED_TEXT[phase]));

  const expanded = isExpanded(island.view);
  const position = usePosition(active, island.view === "music");
  const timerInPill = timer.running && island.view === "collapsed";

  const target = islandSize({
    view: island.view,
    density: settings.density,
    hasMedia: active !== null,
    multiPlayer: media.state.players.length > 1,
    timerInPill,
  });
  const motionOn = settings.animation !== "off" && !prefersReducedMotion();
  const drawn = useWindowFit(target, motionOn);

  const command = (a: ControlAction) => backend.mediaCommand(a);
  const dragOrClick = useDragOrClick(() => island.setBase(island.base === "collapsed" ? "music" : "collapsed"));

  const accent = settings.theme === "adaptive" ? media.accent?.hex : undefined;
  const style = useMemo(
    () => ({ width: drawn.w, height: drawn.h, ...(accent ? { "--accent": accent } : {}) }) as CSSProperties,
    [drawn.w, drawn.h, accent],
  );
  const align = settings.position === "top-left" ? "start" : settings.position === "top-right" ? "end" : "center";

  // Quiet the page itself when the window is not visible: nothing animates for nobody.
  useEffect(() => {
    const onVis = () => document.documentElement.toggleAttribute("data-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const timerLabel = timerInPill ? formatTime(timer.remainingMs) : null;

  return (
    <div
      className="stage"
      data-align={align}
      data-theme={settings.theme}
      data-motion={settings.animation}
      data-dim={island.dimmed}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="island"
        data-view={island.view}
        data-expanded={expanded}
        style={style}
        {...island.pointer}
      >
        <div className="island-glow" aria-hidden="true" />
        {island.view === "collapsed" && (
          <div className="face face-pill" {...dragOrClick}>
            <Pill media={media} timerLabel={timerLabel} />
          </div>
        )}
        {island.view === "peek" && island.peek && (
          <div className="face face-pill" {...dragOrClick}>
            <PeekBar media={media} peek={island.peek} />
          </div>
        )}
        {island.view === "music" && (
          <Face>
            <MusicView media={media} position={position} density={settings.density} command={command} pin={(id) => backend.pinPlayer(id)} go={island.setBase} />
          </Face>
        )}
        {island.view === "tools" && (
          <Face>
            <ToolsView timer={timer} roundsBeforeLong={settings.focus.roundsBeforeLong} go={island.setBase} />
          </Face>
        )}
        {island.view === "settings" && (
          <Face>
            <SettingsView api={settingsApi} go={island.setBase} />
          </Face>
        )}
      </div>
      {backend.preview && <DevBar controls={backend.preview} />}
    </div>
  );
}

/**
 * Expanded views are dragged by their background: anything that is not a
 * button, slider or scroll area starts a window drag.
 */
function Face({ children }: { children: React.ReactNode }) {
  const backend = useBackend();
  return (
    <div
      className="face face-open"
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (e.button !== 0 || t.closest("button, [role=slider], [role=radio], .settings-body, input, a")) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const move = (m: PointerEvent) => {
          if (m.buttons !== 1) return cleanup();
          if (Math.hypot(m.clientX - startX, m.clientY - startY) > 5) {
            cleanup();
            backend.startDragging();
          }
        };
        const cleanup = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", cleanup);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", cleanup);
      }}
    >
      {children}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
