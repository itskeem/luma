//! The island window: placement, size, dragging, visibility.
//!
//! The window is only as big as the island plus a small transparent margin for
//! its shadow, and the UI resizes it as the island expands and collapses. That
//! is why Luma needs no click-through trickery: there is no large transparent
//! area to swallow clicks meant for the app underneath.

use std::time::{Duration, Instant};

use luma_core::placement::{self, MonitorInfo, Rect};
use luma_core::settings::{self, CustomAnchor, IdleBehavior, Position, Settings};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, Window, WindowEvent, WebviewWindow};

use crate::platform;
use crate::state::{lock, AppState};

pub const LABEL: &str = "island";
/// A drag counts as finished after this long without the window moving.
const SETTLE_AFTER: Duration = Duration::from_millis(450);

pub fn island(app: &AppHandle) -> Option<WebviewWindow> {
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

/// The monitor the island belongs on: the one it was dragged to if that is
/// still connected, otherwise the primary one.
fn target_monitor(app: &AppHandle, settings: &Settings) -> Option<MonitorInfo> {
    if settings.position == Position::Custom {
        if let Some(a) = &settings.custom_anchor {
            let all = monitors(app);
            if let Some(i) = placement::pick_monitor(&a.monitor_name, (a.monitor_x, a.monitor_y), &all) {
                return Some(all[i].clone());
            }
        }
    }
    app.primary_monitor().ok().flatten().map(|m| info_of(&m)).or_else(|| monitors(app).into_iter().next())
}

/// Sizes and places the window from the settings, the requested size and the
/// monitor's scale. Safe to call at any time; it is the only place that moves
/// the window on purpose.
pub fn apply_placement(app: &AppHandle) {
    let (Some(win), Some(state)) = (island(app), app.try_state::<AppState>()) else { return };
    let settings = lock(&state.settings).clone();
    let Some(mon) = target_monitor(app, &settings) else { return };
    let (lw, lh) = lock(&state.win).logical_size;
    let w = (lw * mon.scale).round().max(1.0) as u32;
    let h = (lh * mon.scale).round().max(1.0) as u32;
    let custom = settings.custom_anchor.as_ref().map(|a| (a.center_x, a.top_y));
    let (x, y) = placement::resolve(&mon, settings.position, custom, w, h);

    lock(&state.win).expected_pos = Some((x, y));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(w, h));
    // Moving between displays with different scaling can make the OS rescale the
    // window on arrival; say again where it should be.
    if win.scale_factor().is_ok_and(|s| (s - mon.scale).abs() > 0.01) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
        let _ = win.set_size(PhysicalSize::new(w, h));
    }
}

/// The UI's request for a new window size (logical px). While the user is
/// dragging, the size is remembered and applied when the drag settles.
pub fn set_logical_size(app: &AppHandle, w: f64, h: f64) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let dragging = {
        let mut ws = lock(&state.win);
        ws.logical_size = (w.clamp(40.0, 2000.0), h.clamp(24.0, 2000.0));
        ws.last_user_move.is_some_and(|t| t.elapsed() < SETTLE_AFTER)
    };
    if !dragging {
        apply_placement(app);
    }
}

// ── Dragging ──────────────────────────────────────────────────────────────────

/// An anchor describing where the window really is right now.
fn anchor_from_actual(app: &AppHandle, win: &Window) -> Option<CustomAnchor> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let all = monitors(app);
    let center = (pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2);
    let mon = placement::monitor_at(center, &all).map(|i| &all[i]).or(all.first())?;
    let (center_x, top_y) = placement::custom_from_window(mon, pos.x, pos.y, size.width);
    Some(CustomAnchor { monitor_name: mon.name.clone(), monitor_x: mon.rect.x, monitor_y: mon.rect.y, center_x, top_y })
}

fn user_moved(app: &AppHandle, win: &Window) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let Some(anchor) = anchor_from_actual(app, win) else { return };
    {
        let mut s = lock(&state.settings);
        s.position = Position::Custom;
        s.custom_anchor = Some(anchor);
    }
    let spawn = {
        let mut ws = lock(&state.win);
        ws.last_user_move = Some(Instant::now());
        !std::mem::replace(&mut ws.settling, true)
    };
    if spawn {
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(SETTLE_AFTER / 2);
            let Some(state) = app.try_state::<AppState>() else { return };
            let quiet = {
                let mut ws = lock(&state.win);
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

/// The drag is over: pull the island back on screen if it was dropped half off,
/// remember where it really ended up, and persist.
fn settle_drag(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else { return };
    apply_placement(app);
    if let Some(win) = island(app) {
        if let Some(anchor) = anchor_from_actual(app, &win.as_ref().window()) {
            lock(&state.settings).custom_anchor = Some(anchor);
        }
    }
    let snapshot = lock(&state.settings).clone();
    if let Err(e) = settings::save(&state.settings_path, &snapshot) {
        eprintln!("luma: could not save the island position: {e}");
    }
    let _ = app.emit("settings-changed", &snapshot);
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
                let ws = lock(&state.win);
                (ws.shown, ws.expected_pos)
            };
            if !shown {
                return;
            }
            // Our own move arrives as an event too; only a different spot is the user's.
            if expected.is_some_and(|(ex, ey)| (pos.x - ex).abs() <= 2 && (pos.y - ey).abs() <= 2) {
                return;
            }
            user_moved(app, window);
        }
        WindowEvent::ScaleFactorChanged { .. } => apply_placement(app),
        // The island has no close button; this is Alt+F4 or a shell request. Hide, don't quit.
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            set_user_hidden(app, true);
        }
        _ => {}
    }
}

// ── Visibility ────────────────────────────────────────────────────────────────

/// Shows or hides the window to match: the tray's choice, the idle setting and
/// whether any player exists.
pub fn refresh_visibility(app: &AppHandle) {
    let (Some(win), Some(state)) = (island(app), app.try_state::<AppState>()) else { return };
    let idle = lock(&state.settings).idle;
    let want = {
        let v = lock(&state.vis);
        !v.user_hidden && (idle != IdleBehavior::Hide || v.has_player || v.force_visible)
    };
    if want == lock(&state.win).shown {
        return;
    }
    if want {
        apply_placement(app);
        platform::show_no_activate(&win);
        let _ = win.set_always_on_top(true);
    } else {
        let _ = win.hide();
    }
    lock(&state.win).shown = want;
}

/// Called by the media thread whenever the set of players may have changed.
pub fn on_media(app: &AppHandle, has_player: bool) {
    let Some(state) = app.try_state::<AppState>() else { return };
    {
        let mut v = lock(&state.vis);
        if v.has_player != has_player {
            v.has_player = has_player;
            v.force_visible = false;
        }
    }
    refresh_visibility(app);
}

pub fn set_user_hidden(app: &AppHandle, hidden: bool) {
    let Some(state) = app.try_state::<AppState>() else { return };
    {
        let mut v = lock(&state.vis);
        v.user_hidden = hidden;
        // Showing by hand must work even when "hide when idle" would hide it again.
        v.force_visible = !hidden;
    }
    refresh_visibility(app);
}

pub fn toggle_user_hidden(app: &AppHandle) {
    let hidden = app.try_state::<AppState>().is_some_and(|s| lock(&s.vis).user_hidden || !lock(&s.win).shown);
    set_user_hidden(app, !hidden);
}

/// Brings the island back (single-instance relaunch, tray "Settings…").
pub fn reveal(app: &AppHandle) {
    set_user_hidden(app, false);
}
