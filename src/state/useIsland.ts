import { useEffect, useRef, useState } from "react";
import { useBackend } from "../lib/backend.ts";
import { isExpanded, PAD, TRANSITION_MS, windowSize, type Size, type View } from "../lib/layout.ts";
import type { PlaybackStatus, Settings } from "../types.ts";

export type BaseView = Exclude<View, "peek">;
export type Peek = { kind: "track" } | { kind: "message"; text: string };

const PEEK_MS = 3600;
const MESSAGE_MS = 6000;
const HOVER_OPEN_MS = 160;
/** With open-on-hover, the island folds this long after the pointer leaves it. */
const HOVER_CLOSE_MS = 350;
const DIM_AFTER_MS = 10_000;

interface Inputs {
  settings: Settings;
  /** Identity of the current track; a change while collapsed triggers a peek. */
  trackKey: string | null;
  playing: boolean;
  hasMedia: boolean;
  activeStatus: PlaybackStatus | null;
}

export interface IslandController {
  view: View;
  base: BaseView;
  peek: Peek | null;
  collapsedFace: "clock" | "collapsed";
  setBase: (v: BaseView) => void;
  toggleExpand: () => void;
  showMessage: (text: string) => void;
  dimmed: boolean;
  pointer: { onPointerEnter: () => void; onPointerLeave: () => void };
}

/**
 * State machine managing the adaptive island:
 * - State A (Idle Clock): default when no music is playing or pause delay expired
 * - State B (Music Mode): active when music is playing (or within pause delay)
 * - Peek overlay: brief track notifications or focus timer announcements
 * - Expanded panels: Companion panel (tools), full Music player, or Settings
 */
export function useIsland({ settings, trackKey, playing, hasMedia, activeStatus }: Inputs): IslandController {
  const backend = useBackend();
  const [base, setBase] = useState<BaseView>("clock");
  const [peek, setPeek] = useState<Peek | null>(null);
  const [inside, setInside] = useState(false);
  // True once the pointer has been over the island since it opened. Hover-close only
  // applies after that, so a panel opened from the tray doesn't vanish before you get to it.
  const [entered, setEntered] = useState(false);
  // Hover may open the island only after the pointer has left since the last time you
  // closed it by hand; otherwise folding it with the chevron would pop it straight open again.
  const [armed, setArmed] = useState(true);
  const [dimmed, setDimmed] = useState(false);

  // Pause delay: stay in music pill for pauseDelaySecs when paused before returning to clock.
  const [pauseTimedOut, setPauseTimedOut] = useState(!playing);
  const [prevPlaying, setPrevPlaying] = useState(playing);
  if (prevPlaying !== playing) {
    setPrevPlaying(playing);
    if (playing) {
      setPauseTimedOut(false);
    }
  }

  useEffect(() => {
    if (playing || !hasMedia || pauseTimedOut || settings.pauseDelaySecs <= 0) return;

    const timer = window.setTimeout(() => {
      setPauseTimedOut(true);
    }, settings.pauseDelaySecs * 1000);

    return () => window.clearTimeout(timer);
  }, [playing, hasMedia, pauseTimedOut, settings.pauseDelaySecs]);

  // Derived collapsed appearance: Idle Clock vs Music Pill
  // When activeStatus is "loading", avoid rapidly flashing back to clock
  const isClock =
    !hasMedia || (!playing && activeStatus !== "loading" && (settings.pauseDelaySecs <= 0 || pauseTimedOut));
  const collapsedFace: "clock" | "collapsed" = isClock ? "clock" : "collapsed";

  // When unexpanded, align base with collapsedFace
  const effectiveBase: BaseView = isExpanded(base) ? base : collapsedFace;

  // Track peek: when track changes while folded and music is playing
  const [seenTrack, setSeenTrack] = useState(trackKey);
  if (seenTrack !== trackKey) {
    setSeenTrack(trackKey);
    if (
      seenTrack !== null &&
      trackKey !== null &&
      playing &&
      settings.peekOnTrackChange &&
      !isExpanded(effectiveBase) &&
      !inside
    ) {
      setPeek({ kind: "track" });
    }
  }

  useEffect(() => {
    if (!peek) return;
    const id = window.setTimeout(() => setPeek(null), peek.kind === "track" ? PEEK_MS : MESSAGE_MS);
    return () => window.clearTimeout(id);
  }, [peek]);

  // Open on hover: the player if there is one (paused or not), the companion panel if not.
  useEffect(() => {
    if (!settings.openOnHover || !inside || !armed || isExpanded(base)) return;
    const targetView: BaseView = hasMedia ? "music" : "tools";
    const id = window.setTimeout(() => setBase(targetView), HOVER_OPEN_MS);
    return () => window.clearTimeout(id);
  }, [settings.openOnHover, inside, armed, base, hasMedia]);

  // Fold again once the pointer has left: right away with open-on-hover, otherwise
  // after the "fold after" delay (0 = never).
  useEffect(() => {
    if (!isExpanded(base) || inside) return;
    const delay = settings.openOnHover && entered ? HOVER_CLOSE_MS : settings.autoCollapseSecs * 1000;
    if (delay <= 0) return;
    const id = window.setTimeout(() => {
      setBase(collapsedFace);
      setEntered(false);
    }, delay);
    return () => window.clearTimeout(id);
  }, [base, inside, entered, settings.openOnHover, settings.autoCollapseSecs, collapsedFace]);

  // Dim when nothing is playing and nobody is interacting
  const wantDim = settings.idle === "dim" && !playing && !inside && !isExpanded(base) && !peek;
  useEffect(() => {
    const id = window.setTimeout(() => setDimmed(wantDim), wantDim ? DIM_AFTER_MS : 0);
    return () => window.clearTimeout(id);
  }, [wantDim]);

  // Handle external navigation requests (e.g. from system tray)
  useEffect(() => {
    let dead = false;
    let off: (() => void) | undefined;
    void backend
      .onNavigate((v) => {
        if (v === "settings" || v === "music" || v === "tools") setBase(v);
      })
      .then((u) => {
        if (dead) u();
        else off = u;
      });
    return () => {
      dead = true;
      off?.();
    };
  }, [backend]);

  const view: View = peek && !isExpanded(effectiveBase) ? "peek" : effectiveBase;

  const foldByHand = () => {
    setArmed(false);
    setEntered(false);
  };

  const toggleExpand = () => {
    if (isExpanded(effectiveBase)) {
      foldByHand();
      setBase(collapsedFace);
    } else if (effectiveBase === "clock") {
      setBase("tools");
    } else {
      setBase("music");
    }
  };

  return {
    view,
    base: effectiveBase,
    peek,
    collapsedFace,
    setBase: (v) => {
      setPeek(null);
      if (!isExpanded(v)) foldByHand();
      setBase(v);
    },
    toggleExpand,
    showMessage: (text) => setPeek({ kind: "message", text }),
    dimmed,
    pointer: {
      onPointerEnter: () => {
        setInside(true);
        setEntered(true);
      },
      onPointerLeave: () => {
        setInside(false);
        setArmed(true);
      },
    },
  };
}

/**
 * Keeps the native window in step with the island, and returns the size the
 * island should be drawn at.
 *
 * Sequenced resizing avoids clipping: window expands first, then island animates;
 * island shrinks first, then window snaps.
 */
export function useWindowFit(target: Size, animate: boolean): Size {
  const backend = useBackend();
  const [drawn, setDrawn] = useState<Size>(target);
  const windowNow = useRef<Size>({ w: 0, h: 0 });
  const { w, h } = target;

  useEffect(() => {
    let cancelled = false;
    let settle: number | undefined;
    const need = windowSize({ w, h });
    const cur = windowNow.current;
    const room = { w: Math.max(need.w, cur.w), h: Math.max(need.h, cur.h) };

    void (async () => {
      if (room.w !== cur.w || room.h !== cur.h) {
        windowNow.current = room;
        await backend.setIslandSize(room.w, room.h);
      }
      if (cancelled) return;
      setDrawn({ w, h });
      settle = window.setTimeout(
        () => {
          if (cancelled) return;
          windowNow.current = need;
          void backend.setIslandSize(need.w, need.h);
        },
        animate ? TRANSITION_MS + 60 : 0,
      );
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [w, h, animate, backend]);

  return drawn;
}

/** Click toggles; press-and-move drags the window natively. */
export function useDragOrClick(onClick: () => void) {
  const backend = useBackend();
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button === 0) start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (e.buttons !== 1) {
        start.current = null;
        return;
      }
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) {
        start.current = null;
        backend.startDragging();
      }
    },
    onPointerUp: () => {
      if (start.current) onClick();
      start.current = null;
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

export { PAD };
