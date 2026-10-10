import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { ClockFace } from "./components/ClockFace.tsx";
import { DevBar } from "./components/DevBar.tsx";
import { MusicView } from "./components/MusicView.tsx";
import { PeekBar, Pill } from "./components/Pill.tsx";
import { SettingsView } from "./components/SettingsView.tsx";
import { ToolsView } from "./components/ToolsView.tsx";
import { useBackend } from "./lib/backend.ts";
import { formatCompactClock } from "./lib/clock.ts";
import { formatTime } from "./lib/format.ts";
import { islandSize, isExpanded } from "./lib/layout.ts";
import type { Phase } from "./lib/pomodoro.ts";
import { useLiveClock } from "./lib/useLiveClock.ts";
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
  const island = useIsland({
    settings,
    trackKey,
    playing: active?.status === "playing",
    hasMedia: active !== null,
    activeStatus: active?.status ?? null,
  });
  const timer = useFocusTimer(settings.focus, (phase) => island.showMessage(FINISHED_TEXT[phase]));
  const liveClock = useLiveClock(settings.clockFormat, settings.showSeconds);

  // Publish focus state to the pet window whenever phase/running/endsAtMs changes.
  useEffect(() => {
    const endsAtMs = timer.running ? Date.now() + timer.remainingMs : 0;
    backend.publishFocusState({ phase: timer.phase, running: timer.running, endsAtMs });
  }, [backend, timer.phase, timer.running, timer.remainingMs]);

  const expanded = isExpanded(island.view);
  const position = usePosition(active, island.view === "music");
  const timerInPill = timer.running && island.view === "collapsed";
  const timerInClock = timer.running && island.view === "clock";

  const target = islandSize({
    view: island.view,
    density: settings.density,
    hasMedia: active !== null,
    multiPlayer: media.state.players.length > 1,
    timerInPill: timerInPill || timerInClock,
    showSeconds: settings.showSeconds,
  });
  const motionOn = settings.animation !== "off" && !prefersReducedMotion();
  const drawn = useWindowFit(target, motionOn);

  const command = (a: ControlAction) => backend.mediaCommand(a);
  const dragOrClick = useDragOrClick(() => island.toggleExpand());

  // Default subtle lavender glow for idle clock state
  const idleAccent = "#8f7bff";
  const accent =
    settings.theme === "adaptive"
      ? island.view === "clock"
        ? idleAccent
        : (media.accent?.hex ?? idleAccent)
      : undefined;

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

  const timerLabel = timerInPill || timerInClock ? formatTime(timer.remainingMs) : null;
  const compactClock = formatCompactClock(liveClock.now, settings.clockFormat);

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

        {/* State A: Idle Clock - Nothing Playing */}
        {island.view === "clock" && (
          <div className="face face-clock" {...dragOrClick}>
            <ClockFace
              clockFormat={settings.clockFormat}
              showSeconds={settings.showSeconds}
              timerLabel={timerInClock ? timerLabel : null}
              compact={settings.density === "compact"}
            />
          </div>
        )}

        {/* State B: Music Mode - Collapsed Pill */}
        {island.view === "collapsed" && (
          <div className="face face-pill" {...dragOrClick}>
            <Pill media={media} timerLabel={timerInPill ? timerLabel : null} clockTime={compactClock} />
          </div>
        )}

        {/* Notification peek */}
        {island.view === "peek" && island.peek && (
          <div className="face face-pill" {...dragOrClick}>
            <PeekBar media={media} peek={island.peek} />
          </div>
        )}

        {/* Expanded View: Full Music Player */}
        {island.view === "music" && (
          <Face>
            <MusicView
              media={media}
              position={position}
              density={settings.density}
              command={command}
              pin={(id) => backend.pinPlayer(id)}
              go={island.setBase}
            />
          </Face>
        )}

        {/* Expanded View: Companion Panel */}
        {island.view === "tools" && (
          <Face>
            <ToolsView
              timer={timer}
              roundsBeforeLong={settings.focus.roundsBeforeLong}
              media={media}
              clockFormat={settings.clockFormat}
              showSeconds={settings.showSeconds}
              onUpdateSettings={settingsApi.update}
              onMediaCommand={command}
              go={island.setBase}
            />
          </Face>
        )}

        {/* Expanded View: Settings */}
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
