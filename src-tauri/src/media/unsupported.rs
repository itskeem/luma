//! Stand-in for platforms without a media bridge yet (macOS, Linux).
//!
//! It reports honestly that integration is unavailable; it never invents
//! playback. A future macOS (MediaRemote) or Linux (MPRIS) bridge replaces
//! this file with the same `Bridge` surface.

use std::sync::{Arc, Mutex};

use luma_core::artwork::ArtworkCache;
use luma_core::media::{ControlAction, MediaState};

pub struct Bridge;

impl Bridge {
    pub fn start(_artwork: Arc<Mutex<ArtworkCache>>, on_state: Box<dyn Fn(MediaState) + Send>) -> Self {
        on_state(MediaState::unavailable("System media sessions are only implemented on Windows so far."));
        Bridge
    }

    pub fn control(&self, _action: ControlAction) {}
    pub fn pin(&self, _id: Option<String>) {}
}
