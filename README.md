# Luma

A music-first desktop island for Windows: part mini-player, part visualizer, part desktop companion.

Luma floats at the top of the screen as a small pill. It shows what's playing in **Spotify, YouTube
Music, your browser, Apple Music, Media Player** and anything else that publishes to Windows' media
controls, and expands for artwork, progress and controls. It is deliberately *not* a music player: it
complements the one you already use.

![Luma](docs/logo.png)

## Features (MVP)

- Floating, transparent, always-on-top island that never steals keyboard focus; click or hover to expand, smooth expand/collapse
- Real system media sessions (no login, no per-service plugin): title, artist, album, artwork, progress, active-player name
- Play/pause, previous, next, seek, enabled only where the player supports them
- Several players: picks the right one automatically, lets you pin another
- Equalizer that animates only while music plays; artwork cross-fade; accent colour taken from the artwork
- Clock, date and a focus timer (Pomodoro) in a compact second view
- Settings: theme, size, animation, home position (and drag anywhere), open on hover, idle behaviour, launch with Windows
- Tray icon (show/hide, settings, quit), single instance, remembers position and preferences, multi-monitor and DPI aware
- Desktop companion pet: lightweight, quiet floating orb that grooves to music, naps when idle, celebrates focus timer completions, follows cursor, and can be positioned anywhere
- Graceful states: paused, stopped, no player, missing metadata/artwork/timeline, media service unavailable

After the MVP is solid: more focus tools, music history, custom animations. See *Roadmap*.

## Layout

```
crates/luma-core/   Pure Rust, tested anywhere: media model, player selection, change detection,
                    timeline maths, settings, window placement, artwork cache
src-tauri/          Tauri 2 glue: window, tray, commands, startup
  src/media/smtc.rs   Windows media-session bridge (the only Windows-specific media code)
  src/platform.rs     the few OS calls Tauri doesn't wrap (non-activating window)
src/                React + TypeScript UI. Talks to Rust only via src/lib/backend.ts
  pet/              desktop companion window bundle (standalone entry point and SVG sprite)
  dev/preview.ts    browser-only simulator (clearly labelled on screen, never used in the app)
docs/               ASSESSMENT.md (reference review), WINDOWS-TESTING.md (manual checklist)
```

How it works: a worker thread subscribes to the OS's SMTC events (sessions added/removed, metadata,
playback state, timeline) and wakes only when something changes (plus a 5 s heartbeat as a safety
net). Bursts are coalesced; the UI is told only about changes it would notice, because the progress
position is extrapolated in the UI instead of streamed. Artwork is cached in Rust and fetched by id,
so it crosses IPC once per image.

## Setup

Requirements (Windows 10/11): **Node 22+**, **Rust stable**, **Visual Studio Build Tools** (C++ workload),
and the WebView2 runtime (already present on Windows 10/11).

```powershell
npm install
npm run tauri dev        # the real app
npm run dev              # UI only, in a browser, with the labelled preview simulator
                         # add ?scenario=paused | multi | no-metadata | nothing-playing | unavailable
```

Checks:

```powershell
npm run check            # typecheck + eslint + front-end unit tests
cargo test --workspace   # core logic tests
cargo clippy --workspace --all-targets -- -D warnings
```

## Build & package (Windows)

```powershell
npm run tauri build
```

Installers land in `target\release\bundle\nsis\*.exe` (per-user installer, no admin needed) and
`target\release\bundle\msi\*.msi`. `.github/workflows/ci.yml` does all of the above on `windows-latest`
and uploads the installers.

Settings are stored in `%APPDATA%\app.luma.desktop\settings.json`. A damaged file is moved aside to
`settings.json.bak` and defaults are used.

## What each service provides

Luma shows what the player publishes; players differ, and Luma doesn't pretend otherwise.
(Behaviour below is typical and varies with app/browser versions: verify with your own setup.)

| Source | Typically available | Limits |
|---|---|---|
| Spotify (desktop) | title, artist, album, artwork, position/duration, seek, next/previous | During ads the metadata is generic and skip is disabled; Luma greys the button out. |
| YouTube Music (Chrome/Edge) | title, artist, album, artwork, position/duration, next/previous | Comes from the page's Media Session; one session per browser, which tab it represents is the browser's choice. |
| YouTube / other sites | title, channel (as artist), artwork | Album usually empty; next/previous only if the page offers them; live streams have no timeline. |
| Firefox | metadata and play/pause | Seeking and timeline support vary. |
| Apple Music, Media Player, others | metadata, artwork, controls | Whatever the app registers. |
| Apps that don't use media controls | nothing | Luma can't see them. |

"Previous" is the player's own previous-track action; many players restart the current song first.
Artwork over 4 MB is ignored.

## What has and hasn't been verified

Built and checked in a Linux sandbox without a Windows machine:

| Check | Result |
|---|---|
| `cargo test -p luma-core` (media selection, timeline maths, settings round-trip/corruption, placement on multi-monitor/DPI, artwork cache) | 37 passed |
| Front-end unit tests (accent colour, formatting, focus timer, layout) | 24 passed |
| `tsc --noEmit`, `eslint`, `vite build` | clean |
| `cargo check -p luma`: all Tauri glue (commands, window management, tray, state), Windows-only code excluded | clean, no warnings |
| UI rendered in headless WebKit for: playing, paused, multiple players, missing metadata, nothing playing, unavailable, tools, settings, idle pill | reviewed visually (`scripts/shots.py`) |
| `src-tauri/src/media/smtc.rs` API usage | **read against the `windows` 0.61.3 source** (event signatures, token types, enum variants, async `get()`); this caught one wrong variant name. **Not compiled.** |

**Not verified: needs a Windows machine** (see `docs/WINDOWS-TESTING.md`, and CI's Windows job):

- that `smtc.rs` compiles (cannot be built off Windows) and talks to real Spotify / browsers
- that playback controls reach real players
- transparent-window look, shadow, rounded corners, non-activating behaviour, hit-testing
- dragging, multi-monitor/DPI in practice, tray, launch-at-startup, installer
- CPU use while idle and while animating

## Known limitations

- **No desktop blur.** CSS can't blur the desktop behind a transparent window, so the surface is a
  restrained dark glass rather than true acrylic. A native backdrop (e.g. the `window-vibrancy` crate) is a later option.
- A taskbar docked at the top edge can overlap the island (drag it down).
- Exclusive-fullscreen games cover it, like any overlay.
- The equalizer is a lightweight animation, not audio-reactive. Real audio-reactivity needs WASAPI loopback capture (future).
- The focus timer isn't restored after a restart and only announces completion visually (a peek), with no sound.
- Windows only for media. macOS/Linux build and run, but report "media unavailable" (a stub with the same interface; MediaRemote / MPRIS bridges would replace it).
- Packaged installers are unsigned, so SmartScreen will warn.

## Roadmap (after the MVP is reliable)

1. Desktop pet that reacts to playback and focus (Completed)
2. Music history (SQLite, only now that there is data worth keeping)
3. Focus tools: session log, ambient presets
4. Custom animations / themes
5. Audio-reactive visualizer, native backdrop blur, macOS/Linux media bridges
