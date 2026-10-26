# Luma — audit, decisions and known limitations

## 1. Scope

Luma is a personal-use Windows desktop companion: a dynamic island, an optional dock, system controls, music, calendar/focus, and an original pet (Lumi). It is built on a Tauri v2 + React front end with a Rust backend.

## 2. Architecture decisions

- **Pet is a separate module** (`src/pet/`). `brain.ts` is pure and unit-tested; `render.ts`/`engine.ts` draw; `floating.ts` owns the desktop window. The island and dock import the pet through a small hook (`useIslandPet`) and a bus (`bus.ts`), not the other way round.
- **One pet, two homes.** In the island Lumi is a canvas in a bubble beside the island; on the desktop it is a tiny always-on-top window created on demand and destroyed when it comes home. Only one is ever alive, so there's no cross-window animation sync and no polling while Lumi sleeps in the island.
- **Drag out of the window** needs the pointer after it leaves the window, so the drag loop reads the native left-button state and cursor position (`is_left_button_down`, `cursorPosition`) and moves the window with `setPosition`. Dropping on the island rectangle returns Lumi.
- **Settings** use the existing flat string map: `luma-pet-prefs`, `luma-pet-state`. Values are normalised on load, so bad or hand-edited input can't break the pet.
- **Performance:** requestAnimationFrame only while visible; the engine drops its frame rate when Lumi is idle or asleep and stops when the window is hidden; cursor polling for eye-follow runs only while a pet is subscribed and the page is visible, and stops otherwise.
- **Dock:** the existing overlay modes (fixed / smart / peek) already give a reliable overlay with running indicators, drag reorder, context menus and previews, so the AppBar taskbar replacement stays optional, as the spec asks.

## 3. Branding

- All user-visible names, identifiers (`app.luma.desktop`), icons, strings and settings keys are Luma's. The app icon is drawn by the same renderer as Lumi (`dev/icon.ts`).
- The updater and remote announcement feed were disabled: there is no Luma release server, so the app makes no update or announcement requests. Re-enabling the updater needs your own signing key and feed (see `UPDATES_ENABLED`).
- Unrecognised "Pico" pet files that arrived with the upload are not used and were set aside outside the repo.

## 4. Verification

| Area | How | Result |
| --- | --- | --- |
| Pet brain, geometry, prefs, mood | `bun test scripts` | pass (see CI output at release time) |
| Type safety | `tsc --noEmit` (strict) | clean |
| Island + pet bubble, panel, hand-off to desktop and back | Playwright against the built `dist` with `dev/tauri-mock.js` | pass |
| Floating pet window: right-click menu, drag, position persistence, drop on island | same | pass |
| Settings → Pet, Help, About | same | render and save through `save_setting` |
| **Rust backend** | — | **not compiled here** |
| **Real Windows behaviour** (WebView2 transparency, always-on-top, AppBar, click-through) | — | **not run here** |

## 5. Known limitations / things to check on the first Windows build

1. Rust: two commands were added (`is_left_button_down`, `foreground_fullscreen`) and the updater was gated. Run `cargo check` first.
2. Capabilities: the `pet` window label and its permissions (`core:window:allow-set-position`, `...-set-size`, `...-destroy`, `core:webview:allow-create-webview-window`, `core:event:*`) were written from the docs; a wrong identifier shows up as a build error in `tauri build`.
3. Transparent, shadowless window at 124 px: confirm there is no visible rectangle and that the shadow doesn't appear on Windows 10.
4. The pet window can take focus when clicked; check it doesn't steal focus from typing in other apps in your setup (`focus: false` is set).
5. Exclusive full-screen games bypass the foreground check.
6. Unsigned installer, Windows only.
