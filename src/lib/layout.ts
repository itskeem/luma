// Island sizes per view, in logical px. The window is the island plus PAD on
// every side (room for the shadow), and the backend keeps it that size.

import type { Density } from "../types.ts";

export const PAD = 14;
/** Matches --dur in tokens.css. */
export const TRANSITION_MS = 380;

export type View = "clock" | "collapsed" | "peek" | "music" | "tools" | "settings";

export interface Size {
  w: number;
  h: number;
}

export interface LayoutInput {
  view: View;
  density: Density;
  hasMedia: boolean;
  /** More than one player: the music view gets a row to choose between them. */
  multiPlayer: boolean;
  /** The collapsed pill or idle clock shows the focus countdown. */
  timerInPill: boolean;
  /** Whether seconds are shown on the idle clock. */
  showSeconds?: boolean;
}

export function islandSize({ view, density, hasMedia, multiPlayer, timerInPill, showSeconds = false }: LayoutInput): Size {
  const compact = density === "compact";
  switch (view) {
    case "clock":
      return compact
        ? { w: (showSeconds ? 204 : 184) + (timerInPill ? 50 : 0), h: 52 }
        : { w: (showSeconds ? 228 : 208) + (timerInPill ? 54 : 0), h: 60 };
    case "collapsed":
      return compact
        ? { w: (hasMedia ? 198 : 116) + (timerInPill ? 50 : 0), h: 38 }
        : { w: (hasMedia ? 212 : 124) + (timerInPill ? 54 : 0), h: 38 };
    case "peek":
      return { w: 312, h: 46 };
    case "music":
      // Nothing to show (no player, or no media service): a short card, not a full player.
      if (!hasMedia) return { w: compact ? 344 : 392, h: 150 };
      return compact
        ? { w: 344, h: 174 + (multiPlayer ? 32 : 0) }
        : { w: 392, h: 222 + (multiPlayer ? 34 : 0) };
    case "tools":
      return compact
        ? { w: 352, h: hasMedia ? 300 : 246 }
        : { w: 392, h: hasMedia ? 332 : 272 };
    case "settings":
      return compact ? { w: 360, h: 436 } : { w: 392, h: 468 };
  }
}

export function windowSize(island: Size): Size {
  return { w: island.w + PAD * 2, h: island.h + PAD * 2 };
}

export const isExpanded = (v: View): boolean => v === "music" || v === "tools" || v === "settings";
