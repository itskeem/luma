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

## Desktop Pet (⚠ UNVERIFIED — needs Windows)
These items require a real Windows desktop and are **not** covered by automated checks.

- [ ] Enable the pet in Settings → Pet → Show pet; it appears in the bottom-right of the work area
- [ ] Pet window has no taskbar button and is not in Alt-Tab
- [ ] Clicking the pet while typing in another app does **not** steal keyboard focus
- [ ] Click pet: happy squish animation; no media command is sent
- [ ] Drag pet: moves smoothly; position is saved; survives restart
- [ ] Pet never hides under the taskbar (48 px bottom margin fallback; verify with both top and bottom taskbar positions)
- [ ] **Multi-monitor**: drag pet to a secondary monitor; position is remembered per monitor; unplug the monitor → pet moves to primary
- [ ] **DPI**: at 125 %/150 %/200 % scaling the pet is correctly sized and positioned; drag between monitors of different DPI
- [ ] **Mood transitions**: play music → pet grooves; pause → goes idle after a few seconds; stop and wait 30 s → pet sleeps; start focus timer → calm focused pose; timer ends → celebrate hop; track changes → brief perk snap
- [ ] **Four dance variants**: different songs visually bob/sway/bounce differently; same song always uses the same variant
- [ ] **Animation off**: static poses with no movement; cross-fades still work
- [ ] **Tray toggle**: "Show/hide pet" from tray shows or hides without quitting the app
- [ ] **Settings pet section**: size toggle (Small/Medium/Large) resizes the window; disable re-hides the pet
- [ ] **CPU – sleeping**: with no player running and no music, pet CPU ≈ 0 % (no timers firing)
- [ ] **CPU – grooving**: while music plays, pet CPU < 1 % (CSS animation, no JS loop)
- [ ] **Fullscreen apps**: pet behaviour is acceptable under exclusive-fullscreen apps (known limit: may be covered)
- [ ] Quit Luma: both the island and the pet window close; no leftover WebView2 process
