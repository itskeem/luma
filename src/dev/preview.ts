// DEVELOPMENT PREVIEW ONLY.
//
// Used when the UI runs in an ordinary browser (`npm run dev`), where there is
// no Windows media session to read. It simulates the *contract* of the real
// backend so layouts and states can be designed and checked. It is never
// loaded inside the desktop app, and the UI labels it on screen.

import type { Backend, Unlisten } from "../lib/backend.ts";
import type { ActiveMedia, ControlAction, MediaState, PlayerSummary, Settings } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

const SCENARIOS = ["playing", "paused", "multi", "no-metadata", "nothing-playing", "unavailable"] as const;

const TRACKS = [
  { title: "Midnight Drive", artist: "Neon Harbor", album: "After Hours", durationMs: 214_000, hue: 268 },
  { title: "Slow Tides", artist: "Marlow Quay", album: "Low Season", durationMs: 188_000, hue: 190 },
  { title: "Paper Lanterns, Long Walk Home Through the Old Town", artist: "Orchard & Vale", album: "Small Hours", durationMs: 247_000, hue: 18 },
];

function artwork(hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 55%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 50) % 360} 65% 28%)"/></linearGradient></defs>` +
    `<rect width="120" height="120" fill="url(#g)"/><circle cx="82" cy="40" r="26" fill="hsl(${(hue + 20) % 360} 80% 70%)" opacity=".55"/>` +
    `<circle cx="40" cy="86" r="34" fill="hsl(${hue} 60% 20%)" opacity=".45"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createPreviewBackend(): Backend {
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem("luma-preview-settings") ?? "null") as Settings | null;
    } catch {
      return null;
    }
  })();
  let settings: Settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  let scenario: string = new URLSearchParams(location.search).get("scenario") ?? "playing";
  if (!(SCENARIOS as readonly string[]).includes(scenario)) scenario = "playing";

  let index = 0;
  let playing = scenario !== "paused";
  let positionMs = 41_000;
  let capturedAt = Date.now();
  let pinned: string | null = null;

  const mediaCbs = new Set<(s: MediaState) => void>();
  const settingsCbs = new Set<(s: Settings) => void>();
  const navCbs = new Set<(v: string) => void>();

  const position = () => (playing ? positionMs + (Date.now() - capturedAt) : positionMs);
  const freeze = () => {
    positionMs = Math.min(position(), TRACKS[index]!.durationMs);
    capturedAt = Date.now();
  };

  function build(): MediaState {
    if (scenario === "unavailable") {
      return { available: false, error: "Preview: simulating a platform without media sessions.", active: null, players: [], pinnedId: null };
    }
    if (scenario === "nothing-playing") return { available: true, error: null, active: null, players: [], pinnedId: null };
    const t = TRACKS[index]!;
    const bare = scenario === "no-metadata";
    const status = playing ? "playing" : "paused";
    const main: ActiveMedia = {
      id: "Spotify.exe",
      appName: "Spotify",
      track: bare
        ? { title: "", artist: "", album: "", artworkId: null }
        : { title: t.title, artist: t.artist, album: t.album, artworkId: `art-${index}` },
      status,
      controls: { play: true, pause: true, next: !bare, previous: !bare, seek: !bare },
      timeline: bare ? null : { positionMs: positionMs, durationMs: t.durationMs, capturedAtMs: capturedAt, rate: 1 },
    };
    const players: PlayerSummary[] = [{ id: main.id, appName: "Spotify", status, title: main.track.title }];
    let active = main;
    if (scenario === "multi") {
      players.push({ id: "chrome.exe", appName: "Chrome", status: "paused", title: "Lo-fi beats to focus to" });
      if (pinned === "chrome.exe") {
        active = {
          id: "chrome.exe",
          appName: "Chrome",
          track: { title: "Lo-fi beats to focus to", artist: "Chill Collective", album: "", artworkId: "art-1" },
          status: "paused",
          controls: { play: true, pause: true, next: false, previous: false, seek: false },
          timeline: null,
        };
      }
    }
    return { available: true, error: null, active, players, pinnedId: pinned };
  }

  const emit = () => {
    const s = build();
    mediaCbs.forEach((cb) => cb(s));
  };

  // A track that runs out moves on, like a real player would.
  setInterval(() => {
    if (playing && position() >= TRACKS[index]!.durationMs) {
      index = (index + 1) % TRACKS.length;
      positionMs = 0;
      capturedAt = Date.now();
      emit();
    }
  }, 1000);

  const subscribe = <T,>(set: Set<(v: T) => void>, cb: (v: T) => void): Promise<Unlisten> => {
    set.add(cb);
    return Promise.resolve(() => void set.delete(cb));
  };

  return {
    kind: "preview",
    getSettings: () => Promise.resolve(settings),
    updateSettings: (next) => {
      settings = next;
      try {
        localStorage.setItem("luma-preview-settings", JSON.stringify(next));
      } catch {
        /* private mode: fine */
      }
      return Promise.resolve(next);
    },
    getMediaState: () => Promise.resolve(build()),
    getArtwork: (id) => Promise.resolve(id.startsWith("art-") ? artwork(TRACKS[Number(id.slice(4))]?.hue ?? 200) : null),
    mediaCommand: (a: ControlAction) => {
      freeze();
      if (a.kind === "toggle") playing = !playing;
      else if (a.kind === "play") playing = true;
      else if (a.kind === "pause") playing = false;
      else if (a.kind === "next") {
        index = (index + 1) % TRACKS.length;
        positionMs = 0;
      } else if (a.kind === "previous") {
        index = (index + TRACKS.length - 1) % TRACKS.length;
        positionMs = 0;
      } else positionMs = a.positionMs;
      capturedAt = Date.now();
      emit();
    },
    pinPlayer: (id) => {
      pinned = id;
      emit();
    },
    setIslandSize: () => Promise.resolve(),
    startDragging: () => undefined,
    hideIsland: () => undefined,
    quitApp: () => undefined,
    onMediaState: (cb) => subscribe(mediaCbs, cb),
    onSettings: (cb) => subscribe(settingsCbs, cb),
    onNavigate: (cb) => subscribe(navCbs, cb),
    preview: {
      scenarios: SCENARIOS,
      scenario: () => scenario,
      setScenario: (name) => {
        scenario = name;
        pinned = null;
        playing = name !== "paused";
        positionMs = 41_000;
        capturedAt = Date.now();
        emit();
      },
    },
  };
}
