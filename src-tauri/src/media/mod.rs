//! Media integration entry point. The platform bridge is chosen at compile
//! time; everything it produces goes through `luma_core::media`.

use std::sync::{Arc, Mutex};

use luma_core::artwork::ArtworkCache;
use luma_core::media::{ControlAction, MediaState};

#[cfg(windows)]
mod smtc;
#[cfg(windows)]
use smtc as platform;

#[cfg(not(windows))]
mod unsupported;
#[cfg(not(windows))]
use unsupported as platform;

/// Handle to the running bridge. Dropping it stops the worker.
pub struct MediaHandle {
    bridge: platform::Bridge,
}

impl MediaHandle {
    /// Starts the bridge. `on_state` is called from the bridge's own thread,
    /// only when something the UI would notice has changed.
    pub fn start(artwork: Arc<Mutex<ArtworkCache>>, on_state: impl Fn(MediaState) + Send + 'static) -> Self {
        Self { bridge: platform::Bridge::start(artwork, Box::new(on_state)) }
    }

    pub fn control(&self, action: ControlAction) {
        self.bridge.control(action);
    }

    /// Pin a player (`Some(id)`) or go back to automatic selection (`None`).
    pub fn pin(&self, id: Option<String>) {
        self.bridge.pin(id);
    }

}
