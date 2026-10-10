# Phase 1 — assessment of the Coucou reference

Coucou is a **macOS** notch companion written in Swift (SwiftUI/AppKit), with a Linux build and a
Tauri 2 port for Windows under `windows/`. Luma takes the *interaction model* from it — a floating,
non-activating island that expands on demand — and none of its agent features.

## What Luma reuses (as patterns, re-implemented)

| Coucou pattern | In Luma |
|---|---|
| Tauri 2, transparent borderless always-on-top window, `skipTaskbar`, `focus: false`, CSS-drawn shadow (`shadow: false`) | `tauri.conf.json` |
| `WS_EX_NOACTIVATE \| WS_EX_TOOLWINDOW` so clicking the island never steals focus | `src-tauri/src/platform.rs` |
| Remembering the monitor by name + origin, not index; clamping to the screen; DPI-aware placement | `luma-core/placement.rs` (pure and unit-tested) |
| Tray icon with show/hide + quit; single-instance plugin; autostart plugin | `tray.rs`, `lib.rs` |

## What Luma deliberately does differently

* **No full-screen transparent window with a cursor-poll loop.** Coucou keeps a large window and flips
  click-through by polling the cursor. Luma sizes the native window to the island (plus a 14 px shadow
  margin) and grows it *before* animating open / shrinks it *after* animating closed
  (`useWindowFit` in `src/state/useIsland.ts`). There is no transparent area to swallow clicks, so no
  click-through is needed.
* **Real media integration is new work.** Coucou's Windows port has no system media-session code
  (its Spotify support is AppleScript on macOS and MPRIS on Linux). Luma's SMTC bridge
  (`src-tauri/src/media/smtc.rs`) is written from scratch.

## What was left behind

Everything agent-specific: hooks and sockets, session/terminal tracking, the chat and relay code, the
pet and notification systems, the iOS app. The post-MVP "desktop pet" is a fresh design, not a port.

## Architecture

```
crates/luma-core     pure Rust, unit-tested anywhere: media model + player selection + change
                     detection, settings, window placement, artwork cache
src-tauri/           Tauri glue: window, tray, commands, startup  +  media/smtc.rs (Windows only)
src/                 React + TypeScript UI; talks to Rust only through lib/backend.ts
```

## Licensing note: the pet

Coucou's source is MIT; its Mochi character (design, look, expressions, animations, name, icon and sounds)
is reserved by the author (`LICENSE-ASSETS.md`). Luma's pet therefore borrows only *behaviour ideas*
(pointer-following eyes, poke then dizzy, blinking, a greeting, a beat-locked dance, sleep) and uses an
original character derived from Luma's own logo.
