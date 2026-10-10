//! Shared application state, managed by Tauri and reached from commands,
//! window events and the media thread.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use luma_core::artwork::ArtworkCache;
use luma_core::media::MediaState;
use luma_core::settings::Settings;

use crate::media::MediaHandle;

/// Window bookkeeping that must not be mixed up with user intent.
pub struct WinState {
    /// Size the UI asked for, in logical px (island plus its shadow margin).
    pub logical_size: (f64, f64),
    /// Where we last put the window ourselves. A `Moved` event at that spot is
    /// our own doing, not the user dragging.
    pub expected_pos: Option<(i32, i32)>,
    pub last_user_move: Option<Instant>,
    /// True while the debounce thread that settles a drag is alive.
    pub settling: bool,
    /// Whether the window is currently shown.
    pub shown: bool,
}

pub struct Visibility {
    /// The user hid Luma from the tray.
    pub user_hidden: bool,
    pub has_player: bool,
    /// The user asked to see Luma although "hide when idle" would hide it.
    /// Cleared the next time a player appears or disappears.
    pub force_visible: bool,
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    pub artwork: Arc<Mutex<ArtworkCache>>,
    pub last_media: Mutex<MediaState>,
    pub win: Mutex<WinState>,
    pub vis: Mutex<Visibility>,
    /// Set once, after the state is managed, so the first media event can find it.
    pub media: OnceLock<MediaHandle>,
    pub quitting: AtomicBool,
}

impl AppState {
    pub fn new(settings: Settings, settings_path: PathBuf) -> Self {
        Self {
            settings: Mutex::new(settings),
            settings_path,
            artwork: Arc::new(Mutex::new(ArtworkCache::new(8))),
            last_media: Mutex::new(MediaState::empty()),
            win: Mutex::new(WinState {
                logical_size: (240.0, 80.0),
                expected_pos: None,
                last_user_move: None,
                settling: false,
                shown: false,
            }),
            vis: Mutex::new(Visibility { user_hidden: false, has_player: false, force_visible: false }),
            media: OnceLock::new(),
            quitting: AtomicBool::new(false),
        }
    }
}

/// Locks a mutex and carries on if another thread panicked while holding it:
/// for this app's state a stale value is better than a dead island.
pub fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
