//! Luma — a music-first desktop island.
//!
//! Layout of this crate:
//! - `media`      the platform media bridge (Windows SMTC), behind one small interface
//! - `window`     island placement, size, dragging, visibility
//! - `pet_window` companion pet window placement, dragging, visibility
//! - `platform`   the handful of OS calls Tauri doesn't wrap
//! - `tray`       notification-area icon
//! - `commands`   what the front end may call
//! - `state`      shared state
//!
//! Platform-independent logic (selection, settings, placement maths) lives in `luma-core`.

mod commands;
mod media;
mod pet_window;
mod platform;
mod state;
mod tray;
mod window;

use std::sync::atomic::Ordering;

use luma_core::media::MediaState;
use luma_core::settings::{self, LoadOutcome};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use crate::media::MediaHandle;
use crate::state::{lock, AppState};

/// Quits for real (as opposed to hiding).
pub fn quit(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.quitting.store(true, Ordering::SeqCst);
    }
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        // A second launch just brings the first one back.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| window::reveal(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("settings.json");
            let (mut loaded, outcome) = settings::load(&path);
            match outcome {
                LoadOutcome::Corrupt => eprintln!("luma: settings were unreadable; started with defaults"),
                LoadOutcome::Missing | LoadOutcome::Loaded => {}
            }
            // The OS's startup entry is the truth: the user may have removed it in Task Manager.
            if let Ok(enabled) = app.autolaunch().is_enabled() {
                loaded.launch_at_startup = enabled;
            }
            app.manage(AppState::new(loaded, path));

            tray::build(app.handle())?;

            // Island window.
            let win = window::island(app.handle()).ok_or("the island window is missing from tauri.conf.json")?;
            platform::make_non_activating(&win);
            window::refresh_visibility(app.handle());

            // Pet window (may be absent if pet.enabled is false; we still make it non-activating).
            if let Some(pet_win) = pet_window::pet(app.handle()) {
                platform::make_non_activating(&pet_win);
            }
            pet_window::refresh_visibility(app.handle());

            // Started last, so its first state finds everything it needs.
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            let media = MediaHandle::start(state.artwork.clone(), move |ms: MediaState| {
                if let Some(st) = handle.try_state::<AppState>() {
                    *lock(&st.last_media) = ms.clone();
                }
                window::on_media(&handle, !ms.players.is_empty());
                let _ = handle.emit("media-state", &ms);
            });
            let _ = state.media.set(media);
            Ok(())
        })
        .on_window_event(|window, event| {
            window::on_event(window, event);
            pet_window::on_event(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::get_media_state,
            commands::get_artwork,
            commands::media_command,
            commands::pin_player,
            commands::set_island_size,
            commands::hide_island,
            commands::quit_app,
            commands::publish_focus_state,
            commands::get_focus_state,
            commands::show_pet,
            commands::hide_pet,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Luma")
        .run(|_app, event| {
            // Hiding the only window must not end the app; only an explicit quit does.
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
