//! The pet companion window: placement, drag, visibility.
//!
//! Mirrors the island's window.rs pattern but for label "pet".
//! The island and pet windows are completely independent; dragging one can
//! never overwrite the other's saved position because every handler guards by label.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use luma_core::placement::{self, MonitorInfo, Rect};
use luma_core::settings::{self, CustomAnchor, Settings};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, Window, WindowEvent, WebviewWindow};

use crate::platform;
use crate::state::{lock, AppState};

pub const LABEL: &str = "pet";

/// A drag counts as finished after this long without the window moving.
const SETTLE_AFTER: Duration = Duration::from_millis(450);

pub fn pet(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

fn info_of(m: &Monitor) -> MonitorInfo {
    let p = m.position();
    let s = m.size();
    MonitorInfo {
        name: m.name().cloned().unwrap_or_default(),
        rect: Rect { x: p.x, y: p.y, w: s.width, h: s.height },
        scale: m.scale_factor(),
    }
}

fn monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    app.available_monitors().map(|v| v.iter().map(info_of).collect()).unwrap_or_default()
}

fn primary_monitor(app: &AppHandle) -> Option<MonitorInfo> {
    app.primary_monitor().ok().flatten().map(|m| info_of(&m))
        .or_else(|| monitors(app).into_iter().next())
}

/// The logical size of the pet window: the sprite plus a margin on each side,
/// room for the dance bounce and the "z"s so neither is clipped.
fn pet_logical_size(settings: &Settings) -> (f64, f64) {
    let sprite = settings.pet.size.logical_px() as f64;
    let margin = 14.0;
    (sprite + margin * 2.0, sprite + margin * 2.0)
}

/// Sizes and places the pet window. Safe to call any time.
pub fn apply_placement(app: &AppHandle) {
    let (Some(win), Some(state)) = (pet(app), app.try_state::<AppState>()) else { return };
    let settings = lock(&state.settings).clone();
    if !settings.pet.enabled { return; }

    let (lw, lh) = pet_logical_size(&settings);

    // Find the right monitor.
    let mon = if let Some(a) = &settings.pet.custom_anchor {
        let all = monitors(app);
        placement::pick_monitor(&a.monitor_name, (a.monitor_x, a.monitor_y), &all)
            .map(|i| all[i].clone())
            .or_else(|| primary_monitor(app))
    } else {
        primary_monitor(app)
    };
    let Some(mon) = mon else { return };

    let scale = mon.scale;
    let w = (lw * scale).round().max(1.0) as u32;
    let h = (lh * scale).round().max(1.0) as u32;

    let (x, y) = if let Some(a) = &settings.pet.custom_anchor {
        placement::pet_resolve_custom(&mon, a.center_x, a.top_y, w, h)
    } else {
        placement::pet_default_position(&mon, w, h)
    };

    lock(&state.pet_win).expected_pos = Some((x, y));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(w, h));
    if win.scale_factor().is_ok_and(|s| (s - scale).abs() > 0.01) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
        let _ = win.set_size(PhysicalSize::new(w, h));
    }
}

// ── Dragging ──────────────────────────────────────────────────────────────────

fn anchor_from_actual(app: &AppHandle, win: &Window) -> Option<CustomAnchor> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let all = monitors(app);
    let center = (pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2);
    let mon = placement::monitor_at(center, &all).map(|i| &all[i]).or(all.first())?;
    let (cx, cy) = placement::pet_anchor_from_window(mon, pos.x, pos.y, size.width, size.height);
    Some(CustomAnchor { monitor_name: mon.name.clone(), monitor_x: mon.rect.x, monitor_y: mon.rect.y, center_x: cx, top_y: cy })
}

fn user_moved(app: &AppHandle, win: &Window) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let Some(anchor) = anchor_from_actual(app, win) else { return };
    {
        lock(&state.settings).pet.custom_anchor = Some(anchor);
    }
    let spawn = {
        let mut ws = lock(&state.pet_win);
        ws.last_user_move = Some(Instant::now());
        !std::mem::replace(&mut ws.settling, true)
    };
    if spawn {
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(SETTLE_AFTER / 2);
            let Some(state) = app.try_state::<AppState>() else { return };
            let quiet = {
                let mut ws = lock(&state.pet_win);
                let quiet = ws.last_user_move.is_none_or(|t| t.elapsed() >= SETTLE_AFTER);
                if quiet {
                    ws.settling = false;
                    ws.last_user_move = None;
                }
                quiet
            };
            if quiet {
                settle_drag(&app);
                return;
            }
        });
    }
}

fn settle_drag(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else { return };
    apply_placement(app);
    if let Some(win) = pet(app) {
        if let Some(anchor) = anchor_from_actual(app, &win.as_ref().window()) {
            lock(&state.settings).pet.custom_anchor = Some(anchor);
        }
    }
    let snapshot = lock(&state.settings).clone();
    if let Err(e) = settings::save(&state.settings_path, &snapshot) {
        eprintln!("luma: could not save the pet position: {e}");
    }
}

pub fn on_event(window: &Window, event: &WindowEvent) {
    if window.label() != LABEL {
        return;
    }
    let app = window.app_handle();
    match event {
        WindowEvent::Moved(pos) => {
            let Some(state) = app.try_state::<AppState>() else { return };
            let (shown, expected) = {
                let ws = lock(&state.pet_win);
                (ws.shown, ws.expected_pos)
            };
            if !shown { return; }
            if expected.is_some_and(|(ex, ey)| (pos.x - ex).abs() <= 2 && (pos.y - ey).abs() <= 2) {
                return;
            }
            user_moved(app, window);
        }
        WindowEvent::ScaleFactorChanged { .. } => apply_placement(app),
        // The pet has no close button; Alt+F4 or a shell request puts it away (it stays off
        // until the tray or Settings brings it back).
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            set_enabled(app, false);
        }
        _ => {}
    }
}

// ── Visibility ────────────────────────────────────────────────────────────────

/// The pet is shown exactly when `pet.enabled` is on. There is one switch, so the
/// tray, the Settings toggle and the window's own close all agree.
pub fn refresh_visibility(app: &AppHandle) {
    let (Some(win), Some(state)) = (pet(app), app.try_state::<AppState>()) else { return };
    let want = lock(&state.settings).pet.enabled;
    if want == lock(&state.pet_win).shown {
        return;
    }
    if want {
        apply_placement(app);
        platform::show_no_activate(&win);
        let _ = win.set_always_on_top(true);
    } else {
        let _ = win.hide();
    }
    lock(&state.pet_win).shown = want;
}

/// Turns the pet on or off, remembers the choice and tells every window.
pub fn set_enabled(app: &AppHandle, enabled: bool) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let snapshot = {
        let mut s = lock(&state.settings);
        s.pet.enabled = enabled;
        s.clone()
    };
    if let Err(e) = settings::save(&state.settings_path, &snapshot) {
        eprintln!("luma: could not save the pet setting: {e}");
    }
    let _ = app.emit("settings-changed", &snapshot);
    refresh_visibility(app);
}

pub fn toggle(app: &AppHandle) {
    let on = app.try_state::<AppState>().is_some_and(|s| lock(&s.settings).pet.enabled);
    set_enabled(app, !on);
}

// ── Pointer feed ──────────────────────────────────────────────────────────────

/// Where the pointer is, in logical px from the centre of the pet window.
#[derive(Clone, Serialize)]
struct PetCursor {
    dx: i32,
    dy: i32,
}

/// Streams the pointer position to the pet window so its eyes can follow it
/// anywhere on screen (a web page only hears about the pointer over itself).
///
/// It asks the OS for the position ~30 times a second but only sends a message when
/// the pointer has really moved, relaxes to ~8 times a second once it has been still
/// for a couple of seconds, and sleeps while the pet is hidden.
pub fn start_cursor_feed(app: AppHandle) {
    let spawned = std::thread::Builder::new().name("luma-pet-cursor".into()).spawn(move || {
        let mut last: Option<(i32, i32)> = None;
        let mut still_ticks = 0u32;
        loop {
            let Some(state) = app.try_state::<AppState>() else { return };
            if state.quitting.load(Ordering::SeqCst) {
                return;
            }
            if !lock(&state.pet_win).shown {
                last = None;
                std::thread::sleep(Duration::from_millis(400));
                continue;
            }
            if let Some(win) = pet(&app) {
                if let (Ok(cur), Ok(pos), Ok(size), Ok(scale)) =
                    (win.cursor_position(), win.outer_position(), win.outer_size(), win.scale_factor())
                {
                    let dx = ((cur.x - (pos.x as f64 + size.width as f64 / 2.0)) / scale).round() as i32;
                    let dy = ((cur.y - (pos.y as f64 + size.height as f64 / 2.0)) / scale).round() as i32;
                    if last.is_none_or(|(lx, ly)| (lx - dx).abs() >= 2 || (ly - dy).abs() >= 2) {
                        last = Some((dx, dy));
                        still_ticks = 0;
                        let _ = app.emit_to(LABEL, "pet-cursor", PetCursor { dx, dy });
                    } else {
                        still_ticks = still_ticks.saturating_add(1);
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(if still_ticks > 60 { 120 } else { 33 }));
        }
    });
    if let Err(e) = spawned {
        eprintln!("luma: the pet will not follow the pointer: {e}");
    }
}
