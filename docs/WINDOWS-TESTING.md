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
- [ ] Tray: left-click toggles; menu has Show/Hide, Show/hide pet, Settings…, Quit
- [ ] Alt+F4 while hovering does nothing harmful; *Quit* really exits (no leftover process)
- [ ] Launch with Windows on → sign out/in → Luma starts; off → it doesn't; removing it in Task Manager is reflected in Settings
- [ ] Starting a second copy brings the first one back instead of opening another
- [ ] Idle CPU ≈ 0 % with nothing playing; < 1–2 % while playing (Task Manager → WebView2 processes)

## Desktop pet (needs Windows)
- [ ] First launch: the pet appears (bottom-right of the work area) and waves hello; no taskbar button, not in Alt-Tab
- [ ] Clicking it while typing in another app does **not** take keyboard focus
- [ ] Its eyes follow the pointer **across the whole screen**, not just over the pet; they stop following while it sleeps
- [ ] One click: annoyed (brows, small shake). Three clicks inside ~1.7 s: dizzy (spiral eyes, wobble)
- [ ] Play music: it dances; pause: the dance fades out over about half a second
- [ ] Change song while playing: it perks up briefly
- [ ] Start a focus session: it concentrates; let it finish: it cheers. Pausing or skipping the timer must **not** make it cheer
- [ ] Leave everything idle for two minutes with the pointer away: it falls asleep; moving the mouse near it or any media/timer change wakes it
- [ ] Drag it: dangles while carried, saves its position, same spot after restart; recovers if its monitor is unplugged
- [ ] Tray → Show / hide pet works **even when the pet was off in Settings** (it turns it on), and the Settings toggle agrees
- [ ] Settings → Pet size: the visible pet resizes immediately (small/medium/large are 56/76/100 px)
- [ ] 125 / 150 / 200 % scaling and mixed-DPI monitors: correct size and position
- [ ] Idle CPU of the pet window stays near 0 % (the pointer feed sends only when the pointer moves)

## Island: covers, hover, size (needs Windows)
- [ ] Album art appears for **every** source you use: Spotify, YouTube Music, plain YouTube, Apple Music, a local player. If one still shows none, note which app and whether its title shows
- [ ] Skipping tracks quickly never shows the previous song's cover against the new title
- [ ] A track whose cover arrives late (browsers) gets it within a few seconds without touching anything
- [ ] Hover over the pill: it opens after a beat. Move away: it folds about a third of a second later
- [ ] Fold it with the chevron while the pointer is still over it: it stays folded until you leave and come back
- [ ] Tray → Settings… opens Settings and it does **not** vanish before you reach it
- [ ] Overall size feels right at 100 % and 150 % scaling (the island is drawn at 90 % of its design size)
