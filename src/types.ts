// Mirrors luma-core (crates/luma-core). Keep in sync: serde uses camelCase and lowercase enums.

export type PlaybackStatus = "playing" | "paused" | "stopped" | "loading";

export interface Controls {
  play: boolean;
  pause: boolean;
  next: boolean;
  previous: boolean;
  seek: boolean;
}

export interface Track {
  title: string;
  artist: string;
  album: string;
  artworkId: string | null;
}

/** `positionMs` is valid at `capturedAtMs` (unix ms); extrapolate from there. */
export interface Timeline {
  positionMs: number;
  durationMs: number;
  capturedAtMs: number;
  rate: number;
}

export interface ActiveMedia {
  id: string;
  appName: string;
  track: Track;
  status: PlaybackStatus;
  controls: Controls;
  timeline: Timeline | null;
}

export interface PlayerSummary {
  id: string;
  appName: string;
  status: PlaybackStatus;
  title: string;
}

export interface MediaState {
  available: boolean;
  error: string | null;
  active: ActiveMedia | null;
  players: PlayerSummary[];
  pinnedId: string | null;
}

export type ControlAction =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "toggle" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "seek"; positionMs: number };

export type Theme = "adaptive" | "midnight" | "graphite" | "luma";
export type Density = "comfortable" | "compact";
export type Animation = "off" | "subtle" | "full";
export type PositionPreset = "top-center" | "top-left" | "top-right" | "custom";
export type IdleBehavior = "off" | "dim" | "hide";
export type ClockFormat = "24h" | "12h";

export interface FocusSettings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  roundsBeforeLong: number;
  autoStartNext: boolean;
}

export interface Settings {
  version: number;
  theme: Theme;
  density: Density;
  animation: Animation;
  position: PositionPreset;
  customAnchor: unknown;
  openOnHover: boolean;
  autoCollapseSecs: number;
  peekOnTrackChange: boolean;
  idle: IdleBehavior;
  launchAtStartup: boolean;
  focus: FocusSettings;
  clockFormat: ClockFormat;
  showSeconds: boolean;
  pauseDelaySecs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: "adaptive",
  density: "comfortable",
  animation: "full",
  position: "top-center",
  customAnchor: null,
  openOnHover: false,
  autoCollapseSecs: 8,
  peekOnTrackChange: true,
  idle: "dim",
  launchAtStartup: false,
  focus: { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, roundsBeforeLong: 4, autoStartNext: false },
  clockFormat: "24h",
  showSeconds: false,
  pauseDelaySecs: 8,
};
