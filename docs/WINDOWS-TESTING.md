# Manual test checklist (Windows 10/11)

Everything below needs a real Windows desktop. Tick these off after `npm run tauri dev` or an installer build.
(The automated checks cover logic and UI only; see README → "What has and hasn't been verified".)

## Media
- [ ] Spotify desktop: play → title, artist, album, artwork, progress appear within ~1 s
- [ ] Play/pause, next, previous from the island act on Spotify; Spotify's own UI follows
- [ ] Seek by clicking the progress bar (Spotify)
- [ ] YouTube Music in Chrome/Edge: metadata and artwork appear; play/pause, next work
- [ ] Plain YouTube video in a browser: title shows, no album, previous/next disabled when the page offers none
- [ ] Start a second player: island keeps showing the one that plays; "Auto / player" row appears; pinning works; closing the pinned player returns to Auto
- [ ] Skip tracks quickly: artwork cross-fades, no stale art after the new track settles
- [ ] Pause: equalizer goes quiet, "Paused" chip shows, progress stops
- [ ] Close every player: island shows "Nothing is playing" (or hides, with *When idle → Hide*)
- [ ] Spotify ad (free tier): controls grey out instead of failing

## Window
- [ ] Appears top-centre of the primary monitor, no taskbar button, not in Alt-Tab
- [ ] Clicking it while typing in another app does **not** take keyboard focus
- [ ] Expand / collapse animates smoothly; no flash or clipped corners; shadow not cut off
- [ ] Click-through: the screen area just outside the pill (beyond the 14 px shadow margin) still clicks the app underneath
- [ ] Drag by the pill and by an expanded view's background; it stays on screen; position survives restart
- [ ] Left / Center / Right presets in Settings snap it back
- [ ] 125 % / 150 % / 200 % scaling; moving it between monitors of different scaling
- [ ] Unplug the monitor it was on: it returns to the primary monitor
- [ ] Full-screen video in a browser: behaviour is acceptable (known limit: exclusive-fullscreen games cover it)
- [ ] Windows *Reduce animations* setting on: transitions and equalizer stop

## Shell
- [ ] Tray: left-click toggles; menu has Show/Hide, Settings…, Quit
- [ ] Alt+F4 while hovering does nothing harmful; *Quit* really exits (no leftover process)
- [ ] Launch with Windows on → sign out/in → Luma starts; off → it doesn't; removing it in Task Manager is reflected in Settings
- [ ] Starting a second copy brings the first one back instead of opening another
- [ ] Idle CPU ≈ 0 % with nothing playing; < 1–2 % while playing (Task Manager → WebView2 processes)
