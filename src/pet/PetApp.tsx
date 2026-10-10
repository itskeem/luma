import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "../lib/backend.ts";
import type { Backend, FocusStatePayload } from "../lib/backend.ts";
import type { Mood } from "../lib/pet.ts";
import {
  ANNOYED_MS,
  CELEBRATE_MS,
  DIZZY_MS,
  HELLO_MS,
  PERK_MS,
  SLEEP_AFTER_MS,
  focusJustFinished,
  isDoubleBlink,
  lookVector,
  nextBlinkDelayMs,
  petMood,
  pointerIsNear,
  registerPoke,
} from "../lib/pet.ts";
import type { MediaState, Settings } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import { subscribeCursor } from "./petBackend.ts";
import { PetSprite } from "./PetSprite.tsx";

/** Preview / screenshot overrides: ?mood=dizzy&size=large&look=1,0 */
const URL_PARAMS = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const PREVIEW_MOOD = URL_PARAMS.get("mood") as Mood | null;
const PREVIEW_SIZE = URL_PARAMS.get("size") as "small" | "medium" | "large" | null;
const PREVIEW_LOOK = URL_PARAMS.get("look")?.split(",").map(Number) ?? null;

const SIZE_PX = { small: 56, medium: 76, large: 100 } as const;
const ACCENT: Record<string, string> = { adaptive: "#8f7bff", luma: "#8f7bff", midnight: "#6b8bff", graphite: "#9a9fb4" };

/** A flag that switches on for `ms` after `trigger()`, optionally starting on. */
function useTimedFlag(ms: number, startOn = false): [boolean, () => void] {
  const [on, setOn] = useState(startOn);
  const timer = useRef<number | undefined>(undefined);
  const trigger = useCallback(() => {
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);
  useEffect(() => {
    if (startOn) timer.current = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(timer.current);
  }, [ms, startOn]);
  return [on, trigger];
}

export default function PetApp({ backend }: { backend: Backend }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [media, setMedia] = useState<MediaState>({ available: true, error: null, active: null, players: [], pinnedId: null });
  const [focus, setFocus] = useState<FocusStatePayload>({ phase: "focus", running: false, endsAtMs: 0 });

  // Things that happen to it, each lasting a moment.
  const [hello, greet] = useTimedFlag(HELLO_MS, true); // it greets you as it appears
  const [perking, perk] = useTimedFlag(PERK_MS);
  const [celebrating, celebrate] = useTimedFlag(CELEBRATE_MS);
  const [annoyed, annoy] = useTimedFlag(ANNOYED_MS);
  const [dizzy, makeDizzy] = useTimedFlag(DIZZY_MS);
  const [dragging, setDragging] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [docVisible, setDocVisible] = useState(!document.hidden);

  const spriteRef = useRef<HTMLDivElement>(null);
  const pointerNear = useRef(false);
  const pokes = useRef<number[]>([]);
  const lastTrack = useRef<string | null>(null);
  const lastFocus = useRef<FocusStatePayload | null>(null);
  const sleepTimer = useRef<number | undefined>(undefined);

  const active = media.active;
  const playing = active?.status === "playing";
  const trackKey = active ? `${active.track.title}|${active.track.artist}` : "";

  // ── Sleep: after two quiet minutes with the pointer away; anything at all wakes it ──
  const armSleep = useCallback(() => {
    window.clearTimeout(sleepTimer.current);
    const check = () => {
      if (pointerNear.current) sleepTimer.current = window.setTimeout(check, 10_000);
      else setAsleep(true);
    };
    sleepTimer.current = window.setTimeout(check, SLEEP_AFTER_MS);
  }, []);
  const wake = useCallback(() => {
    setAsleep(false);
    armSleep();
  }, [armSleep]);
  useEffect(() => {
    armSleep();
    return () => window.clearTimeout(sleepTimer.current);
  }, [armSleep]);

  // ── State from the app ──
  useEffect(() => {
    let alive = true;
    const off: (() => void)[] = [];
    void Promise.all([backend.getSettings(), backend.getMediaState(), backend.getFocusState()]).then(([s, m, f]) => {
      if (!alive) return;
      setSettings(s);
      setMedia(m);
      setFocus(f);
      lastFocus.current = f;
      lastTrack.current = m.active ? `${m.active.track.title}|${m.active.track.artist}` : null;
    });
    void (async () => {
      const subs = [
        await backend.onSettings((s) => alive && setSettings(s)),
        await backend.onMediaState((m) => {
          if (!alive) return;
          setMedia(m);
          wake();
          const key = m.active ? `${m.active.track.title}|${m.active.track.artist}` : null;
          // A new song while one was already going: look up.
          if (m.active?.status === "playing" && lastTrack.current && key && key !== lastTrack.current) perk();
          lastTrack.current = key;
        }),
        await backend.onFocusState((f) => {
          if (!alive) return;
          setFocus(f);
          wake();
          if (focusJustFinished(lastFocus.current, f, Date.now())) celebrate();
          lastFocus.current = f;
        }),
      ];
      if (alive) off.push(...subs);
      else subs.forEach((u) => u());
    })();
    return () => {
      alive = false;
      off.forEach((u) => u());
    };
  }, [backend, wake, perk, celebrate]);

  // ── Eyes follow the pointer, wherever it is ──
  const aim = useCallback((dx: number, dy: number) => {
    pointerNear.current = pointerIsNear(dx, dy);
    const el = spriteRef.current;
    if (!el) return;
    const v = lookVector(dx, dy);
    el.style.setProperty("--lx", v.x.toFixed(3));
    el.style.setProperty("--ly", v.y.toFixed(3));
  }, []);
  useEffect(() => {
    if (PREVIEW_LOOK && PREVIEW_LOOK.length === 2) {
      aim(PREVIEW_LOOK[0] ?? 0, PREVIEW_LOOK[1] ?? 0);
      return;
    }
    let off: (() => void) | undefined;
    let alive = true;
    void subscribeCursor(aim).then((u) => {
      if (alive) off = u;
      else u();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [aim]);

  // ── Blinking: irregular, sometimes twice in a row ──
  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const loop = () =>
      later(() => {
        setBlinking(true);
        later(() => setBlinking(false), 130);
        if (isDoubleBlink(Math.random())) {
          later(() => setBlinking(true), 260);
          later(() => setBlinking(false), 390);
        }
        loop();
      }, nextBlinkDelayMs(Math.random()));
    loop();
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // ── Appearing again after being hidden: pop out and say hello ──
  useEffect(() => {
    const onVis = () => {
      setDocVisible(!document.hidden);
      document.documentElement.toggleAttribute("data-hidden", document.hidden);
      if (!document.hidden) greet();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [greet]);

  // ── Poke or drag ──
  const press = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button === 0) press.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    // The first movement after a drag ends: the pet was put down.
    if (dragging && e.buttons === 0) setDragging(false);
    const p = press.current;
    if (!p) return;
    if (e.buttons !== 1) {
      press.current = null;
      return;
    }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) {
      press.current = null;
      wake();
      setDragging(true);
      if (inTauri) void getCurrentWindow().startDragging();
      else window.setTimeout(() => setDragging(false), 1500);
    }
  };
  const onUp = () => {
    if (!press.current) return;
    press.current = null;
    wake();
    const r = registerPoke(pokes.current, Date.now());
    pokes.current = r.history;
    if (r.dizzy) makeDizzy();
    else annoy();
  };

  const { mood, variant, energy } = petMood({
    playing,
    focusPhase: focus.phase === "focus",
    breakPhase: focus.phase === "short" || focus.phase === "long",
    focusRunning: focus.running,
    celebrating,
    perking,
    hello,
    annoyed,
    dizzy,
    dragging,
    asleep,
    trackKey,
    reactsToMusic: settings.pet.reactsToMusic,
    reactsToFocus: settings.pet.reactsToFocus,
    energy: 1, // seam for a future audio-reactive source
  });

  if (!settings.pet.enabled && !PREVIEW_MOOD) return null;

  const size = SIZE_PX[PREVIEW_SIZE ?? settings.pet.size];
  return (
    <div className="pet-stage" onContextMenu={(e) => e.preventDefault()}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (press.current = null)}>
        <PetSprite
          mood={PREVIEW_MOOD ?? mood}
          variant={variant}
          accentHex={ACCENT[settings.theme] ?? "#8f7bff"}
          size={size}
          animation={docVisible ? settings.animation : "off"}
          blinking={blinking}
          rootRef={spriteRef}
        />
      </div>
      <span hidden data-energy={energy} />
    </div>
  );
}
