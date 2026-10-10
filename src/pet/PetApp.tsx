import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "../lib/backend.ts";
import type { Backend, FocusStatePayload } from "../lib/backend.ts";
import type { MediaState, Settings } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import { petMood, SLEEP_AFTER_MS } from "../lib/pet.ts";
import type { Mood, DanceVariant } from "../lib/pet.ts";
import { PetSprite } from "./PetSprite.tsx";

/** How long the "perk" window lasts after a track change (ms). */
const PERK_MS = 1500;
/** How long the "celebrate" window lasts after a timer phase completes (ms). */
const CELEBRATE_MS = 3000;
/** How long the "happy" window lasts after a click (ms). */
const HAPPY_MS = 1200;

/** URL params for preview/shots override. */
const URL_PARAMS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const PREVIEW_MOOD = URL_PARAMS.get("mood") as Mood | null;
const PREVIEW_SIZE = URL_PARAMS.get("size") as "small" | "medium" | "large" | null;

interface PetAppProps {
  backend: Backend;
}

export default function PetApp({ backend }: PetAppProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [media, setMedia] = useState<MediaState>({ available: true, error: null, active: null, players: [], pinnedId: null });
  const [focus, setFocus] = useState<FocusStatePayload>({ phase: "focus", running: false, endsAtMs: 0 });

  // Transient flags
  const [perking, setPerking] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [happy, setHappy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Sleep state: sleep after 30 s of music being paused/stopped
  const [isAsleep, setIsAsleep] = useState(true);
  const sleepTimer = useRef<number | undefined>(undefined);

  // Pointer position for eye tracking
  const [pointerOffset, setPointerOffset] = useState<{ x: number; y: number } | null>(null);

  // Refs to avoid stale closures in timers
  const prevTrackKeyRef = useRef<string | null>(null);
  const prevFocusPhaseRef = useRef<string | null>(null);
  const prevFocusRunningRef = useRef(false);
  const perkTimer = useRef<number | undefined>(undefined);
  const celebrateTimer = useRef<number | undefined>(undefined);
  const happyTimer = useRef<number | undefined>(undefined);

  // Track key for perk detection and dance variant
  const active = media.active;
  const trackKey = active ? `${active.track.title}|${active.track.artist}` : "";
  const playing = active?.status === "playing";
  const hasMedia = active !== null;

  // Load initial state on mount
  useEffect(() => {
    let alive = true;
    void Promise.all([
      backend.getSettings(),
      backend.getMediaState(),
      backend.getFocusState(),
    ]).then(([s, m, f]) => {
      if (!alive) return;
      setSettings(s);
      setMedia(m);
      setFocus(f);
      if (m.active?.status === "playing") {
        setIsAsleep(false);
      }
    });
    return () => { alive = false; };
  }, [backend]);

  // Subscribe to all events
  useEffect(() => {
    const off: (() => void)[] = [];
    let alive = true;
    const setup = async () => {
      off.push(await backend.onSettings((s) => { if (alive) setSettings(s); }));
      off.push(await backend.onMediaState((m) => {
        if (alive) {
          setMedia(m);
          if (m.active?.status === "playing") {
            setIsAsleep(false);
          }
        }
      }));
      off.push(await backend.onFocusState((f) => { if (alive) setFocus(f); }));
    };
    void setup();
    return () => { alive = false; off.forEach((u) => u()); };
  }, [backend]);

  // Enter sleep mood after 30 seconds of stopped/paused playback
  useEffect(() => {
    if (!playing && hasMedia) {
      window.clearTimeout(sleepTimer.current);
      sleepTimer.current = window.setTimeout(() => {
        setIsAsleep(true);
      }, SLEEP_AFTER_MS);
      return () => window.clearTimeout(sleepTimer.current);
    }
  }, [playing, hasMedia]);

  // Perk detection: track change while playing
  useEffect(() => {
    if (!trackKey || !playing) { prevTrackKeyRef.current = trackKey; return; }
    if (prevTrackKeyRef.current !== null && prevTrackKeyRef.current !== trackKey) {
      setPerking(true);
      window.clearTimeout(perkTimer.current);
      perkTimer.current = window.setTimeout(() => setPerking(false), PERK_MS);
    }
    prevTrackKeyRef.current = trackKey;
  }, [trackKey, playing]);

  // Celebrate detection: focus timer just finished a phase
  useEffect(() => {
    const wasRunning = prevFocusRunningRef.current;
    const wasPhase = prevFocusPhaseRef.current;
    prevFocusRunningRef.current = focus.running;
    prevFocusPhaseRef.current = focus.phase;
    // Phase transition (was running, now not running, or phase changed while running)
    if (wasRunning && !focus.running && wasPhase !== null) {
      setCelebrating(true);
      window.clearTimeout(celebrateTimer.current);
      celebrateTimer.current = window.setTimeout(() => setCelebrating(false), CELEBRATE_MS);
    }
  }, [focus.running, focus.phase]);

  // Stop all animation when document is hidden
  const [docVisible, setDocVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setDocVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const focusPhase = focus.phase === "focus";
  const breakPhase = focus.phase === "short" || focus.phase === "long";

  const { mood, variant, energy } = petMood({
    hasMedia,
    playing: hasMedia && playing,
    msSinceStopped: hasMedia && !isAsleep ? 0 : SLEEP_AFTER_MS,
    focusPhase,
    breakPhase,
    focusRunning: focus.running,
    celebrating,
    perking,
    happy,
    dragging,
    trackKey,
    reactsToMusic: settings.pet.reactsToMusic,
    reactsToFocus: settings.pet.reactsToFocus,
    energy: 1.0, // seam for future audio-reactive source
  });

  // Mood derived from current state
  const effectiveMood: Mood = mood;

  // Preview / shots.py: override mood and size from URL params.
  const renderedMood: Mood = PREVIEW_MOOD ?? effectiveMood;
  const sizePx = (PREVIEW_SIZE ?? settings.pet.size) === "small" ? 72 : (PREVIEW_SIZE ?? settings.pet.size) === "large" ? 128 : 96;
  const accentHex = settings.theme === "adaptive"
    ? "#8f7bff"
    : settings.theme === "midnight" ? "#6b7aff"
    : settings.theme === "graphite" ? "#aaaacc"
    : "#8f7bff";

  // Click → happy
  const handleClick = useCallback(() => {
    setHappy(true);
    window.clearTimeout(happyTimer.current);
    happyTimer.current = window.setTimeout(() => setHappy(false), HAPPY_MS);
  }, []);

  // Drag via Tauri native drag (drag-vs-click pattern matching useDragOrClick)
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) dragStart.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const s = dragStart.current;
    if (!s || e.buttons !== 1) { dragStart.current = null; return; }
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) {
      dragStart.current = null;
      setDragging(true);
      if (inTauri) {
        void getCurrentWindow().startDragging().finally(() => setDragging(false));
      } else {
        setDragging(false);
      }
    }
  };
  const handlePointerUp = () => {
    if (dragStart.current) handleClick();
    dragStart.current = null;
  };

  // Eye tracking: pointer inside the pet window only
  const stageRef = useRef<HTMLDivElement>(null);
  const handlePointerEnter = (e: React.PointerEvent) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    setPointerOffset({ x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) });
  };
  const handlePointerMoveStage = (e: React.PointerEvent) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    setPointerOffset({ x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) });
  };
  const handlePointerLeave = () => setPointerOffset(null);

  if (!settings.pet.enabled && !PREVIEW_MOOD) return null;

  return (
    <div
      ref={stageRef}
      className="pet-stage"
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMoveStage}
      onPointerLeave={handlePointerLeave}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragStart.current = null; }}
      >
        <PetSprite
          mood={renderedMood}
          variant={variant as DanceVariant}
          energy={energy}
          accentHex={accentHex}
          size={sizePx}
          pointerOffset={pointerOffset}
          animation={!docVisible ? "off" : settings.animation}
        />
      </div>
    </div>
  );
}
