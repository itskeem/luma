//! The commands the front end may call. Each is small: validate, delegate, return.

use luma_core::media::{ControlAction, MediaState};
use luma_core::settings::{self, Settings};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;

use crate::state::{lock, AppState};
use crate::window;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    lock(&state.settings).clone()
}

/// Replaces the settings. The island's dragged position is owned by the
/// backend, so whatever anchor the UI sends back is ignored.
#[tauri::command]
pub fn update_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> Result<Settings, String> {
    let mut next = settings;
    let prev = lock(&state.settings).clone();
    next.custom_anchor = prev.custom_anchor.clone();
    next.sanitize();

    let mut startup_error = None;
    if next.launch_at_startup != prev.launch_at_startup {
        let launcher = app.autolaunch();
        let result = if next.launch_at_startup { launcher.enable() } else { launcher.disable() };
        if let Err(e) = result {
            next.launch_at_startup = prev.launch_at_startup;
            startup_error = Some(format!("Could not change launch at startup: {e}"));
        }
    }

    *lock(&state.settings) = next.clone();
    if let Err(e) = settings::save(&state.settings_path, &next) {
        eprintln!("luma: could not save settings: {e}");
    }
    let _ = app.emit("settings-changed", &next);

    if next.position != prev.position {
        window::apply_placement(&app);
    }
    if next.idle != prev.idle {
        window::refresh_visibility(&app);
    }
    match startup_error {
        Some(e) => Err(e),
        None => Ok(next),
    }
}

#[tauri::command]
pub fn get_media_state(state: State<'_, AppState>) -> MediaState {
    lock(&state.last_media).clone()
}

#[tauri::command]
pub fn get_artwork(state: State<'_, AppState>, id: String) -> Option<String> {
    lock(&state.artwork).get(&id)
}

#[tauri::command]
pub fn media_command(state: State<'_, AppState>, action: ControlAction) {
    if let Some(media) = state.media.get() {
        media.control(action);
    }
}

#[tauri::command]
pub fn pin_player(state: State<'_, AppState>, id: Option<String>) {
    if let Some(media) = state.media.get() {
        media.pin(id);
    }
}

/// Window size in logical px, margin included. The UI calls this when the
/// island changes shape.
#[tauri::command]
pub fn set_island_size(app: AppHandle, width: f64, height: f64) {
    if width.is_finite() && height.is_finite() {
        window::set_logical_size(&app, width, height);
    }
}

#[tauri::command]
pub fn hide_island(app: AppHandle) {
    window::set_user_hidden(&app, true);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::quit(&app);
}
