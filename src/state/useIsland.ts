import { useEffect, useRef, useState } from "react";
import { useBackend } from "../lib/backend.ts";
import { isExpanded, PAD, TRANSITION_MS, windowSize, type Size, type View } from "../lib/layout.ts";
import type { Settings } from "../types.ts";

export type BaseView = Exclude<View, "peek">;
export type Peek = { kind: "track" } | { kind: "message"; text: string };

const PEEK_MS = 3600;
const MESSAGE_MS = 6000;
const HOVER_OPEN_MS = 220;
const DIM_AFTER_MS = 10_000;

interface Inputs {
  settings: Settings;
  /** Identity of the current track; a change while collapsed triggers a peek. */
  trackKey: string | null;
  playing: boolean;
}

export interface IslandController {
  view: View;
  base: BaseView;
  peek: Peek | null;
  setBase: (v: BaseView) => void;
  showMessage: (text: string) => void;
  dimmed: boolean;
  pointer: { onPointerEnter: () => void; onPointerLeave: () => void };
}

/**
 * Which face the island shows (collapsed, a short peek, or one of three
 * expanded views) and the timers behind it: open on hover, fold after the
 * pointer leaves, peek on track change, dim when idle.
 */
export function useIsland({ settings, trackKey, playing }: Inputs): IslandController {
  const backend = useBackend();
  const [base, setBase] = useState<BaseView>("collapsed");
  const [peek, setPeek] = useState<Peek | null>(null);
  const [inside, setInside] = useState(false);
  const [dimmed, setDimmed] = useState(false);

  // Peek when the track changes while the island is folded. Derived during render
  // (not in an effect) so it shows on the same frame as the new track.
  const [seenTrack, setSeenTrack] = useState(trackKey);
  if (seenTrack !== trackKey) {
    setSeenTrack(trackKey);
    if (seenTrack !== null && trackKey !== null && playing && settings.peekOnTrackChange && base === "collapsed" && !inside) {
      setPeek({ kind: "track" });
    }
  }

  useEffect(() => {
    if (!peek) return;
    const id = window.setTimeout(() => setPeek(null), peek.kind === "track" ? PEEK_MS : MESSAGE_MS);
    return () => window.clearTimeout(id);
  }, [peek]);

  // Open on hover.
  useEffect(() => {
    if (!settings.openOnHover || !inside || base !== "collapsed") return;
    const id = window.setTimeout(() => setBase("music"), HOVER_OPEN_MS);
    return () => window.clearTimeout(id);
  }, [settings.openOnHover, inside, base]);

  // Fold again after the pointer has been away for a while.
  useEffect(() => {
    if (!isExpanded(base) || inside || settings.autoCollapseSecs <= 0) return;
    const id = window.setTimeout(() => setBase("collapsed"), settings.autoCollapseSecs * 1000);
    return () => window.clearTimeout(id);
  }, [base, inside, settings.autoCollapseSecs]);

  // Dim when nothing is playing and nobody is interacting.
  const wantDim = settings.idle === "dim" && !playing && !inside && base === "collapsed" && !peek;
  useEffect(() => {
    const id = window.setTimeout(() => setDimmed(wantDim), wantDim ? DIM_AFTER_MS : 0);
    return () => window.clearTimeout(id);
  }, [wantDim]);

  // The tray's "Settings…" and similar requests from the backend.
  useEffect(() => {
    let dead = false;
    let off: (() => void) | undefined;
    void backend.onNavigate((v) => {
      if (v === "settings" || v === "music" || v === "tools") setBase(v);
    }).then((u) => {
      if (dead) u();
      else off = u;
    });
    return () => {
      dead = true;
      off?.();
    };
  }, [backend]);

  return {
    view: peek && base === "collapsed" ? "peek" : base,
    base,
    peek,
    setBase: (v) => {
      setPeek(null);
      setBase(v);
    },
    showMessage: (text) => setPeek({ kind: "message", text }),
    dimmed,
    pointer: { onPointerEnter: () => setInside(true), onPointerLeave: () => setInside(false) },
  };
}

/**
 * Keeps the native window in step with the island, and returns the size the
 * island should be drawn at.
 *
 * A window cannot animate, so the two are sequenced: to grow, the window grows
 * first (it is transparent, so nobody sees it) and then the island animates
 * into the room; to shrink, the island animates first and the window follows.
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

/** Click toggles; press-and-move drags the window (native drag, so edges and snapping behave). */
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
