//! The pet companion window: placement, drag, visibility.
//!
//! Mirrors the island's window.rs pattern but for label "pet".
//! The island and pet windows are completely independent; dragging one can
//! never overwrite the other's saved position because every handler guards by label.

use std::time::{Duration, Instant};

use luma_core::placement::{self, MonitorInfo, Rect};
use luma_core::settings::{self, CustomAnchor, Settings};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Window, WindowEvent, WebviewWindow};

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

/// The logical size of the pet window: sprite + 8 px margin on each side.
fn pet_logical_size(settings: &Settings) -> (f64, f64) {
    let sprite = settings.pet.size.logical_px() as f64;
    let margin = 8.0;
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
        // Pet window has no close button; Alt+F4 or shell request → hide.
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            set_hidden(app, true);
        }
        _ => {}
    }
}

// ── Visibility ────────────────────────────────────────────────────────────────

pub fn refresh_visibility(app: &AppHandle) {
    let (Some(win), Some(state)) = (pet(app), app.try_state::<AppState>()) else { return };
    let want = {
        let s = lock(&state.settings);
        s.pet.enabled && !lock(&state.pet_win).user_hidden
    };
    if want == lock(&state.pet_win).shown { return; }
    if want {
        apply_placement(app);
        platform::show_no_activate(&win);
        let _ = win.set_always_on_top(true);
    } else {
        let _ = win.hide();
    }
    lock(&state.pet_win).shown = want;
}

pub fn set_hidden(app: &AppHandle, hidden: bool) {
    let Some(state) = app.try_state::<AppState>() else { return };
    lock(&state.pet_win).user_hidden = hidden;
    refresh_visibility(app);
}

pub fn toggle_hidden(app: &AppHandle) {
    let hidden = app.try_state::<AppState>()
        .is_some_and(|s| lock(&s.pet_win).user_hidden || !lock(&s.pet_win).shown);
    set_hidden(app, !hidden);
}
