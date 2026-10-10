//! Media-session model, active-player selection and change detection.
//!
//! The platform bridge (Windows SMTC) produces [`SessionSnapshot`]s. Everything
//! after that — which player is "active", what the UI is told, whether a new
//! state is worth emitting — is decided here, in testable code.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
    /// Opening / changing track: the player is busy, controls may be unreliable.
    Loading,
}

/// What the player says it can do right now. The UI disables anything false.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Controls {
    pub play: bool,
    pub pause: bool,
    pub next: bool,
    pub previous: bool,
    pub seek: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Key into the artwork cache; `None` when the player supplies no image.
    pub artwork_id: Option<String>,
}

/// Position is valid at `captured_at_ms` (unix ms); the UI extrapolates from there.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub captured_at_ms: u64,
    pub rate: f64,
}

/// One media session as the platform reported it.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionSnapshot {
    pub id: String,
    pub track: Track,
    pub status: PlaybackStatus,
    pub controls: Controls,
    pub timeline: Option<Timeline>,
    /// The OS's own notion of "the current session" (what the volume flyout shows).
    pub is_system_current: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveMedia {
    pub id: String,
    pub app_name: String,
    pub track: Track,
    pub status: PlaybackStatus,
    pub controls: Controls,
    pub timeline: Option<Timeline>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSummary {
    pub id: String,
    pub app_name: String,
    pub status: PlaybackStatus,
    pub title: String,
}

/// Everything the front end needs, in one message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    /// False when the OS integration is missing or failed; `error` says why.
    pub available: bool,
    pub error: Option<String>,
    pub active: Option<ActiveMedia>,
    pub players: Vec<PlayerSummary>,
    /// The player the user pinned, if any. `None` means automatic selection.
    pub pinned_id: Option<String>,
}

impl MediaState {
    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self { available: false, error: Some(reason.into()), ..Self::default() }
    }

    pub fn empty() -> Self {
        Self { available: true, ..Self::default() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ControlAction {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    #[serde(rename_all = "camelCase")]
    Seek { position_ms: u64 },
}

// ── Player names ──────────────────────────────────────────────────────────────

/// A readable name for an AppUserModelId such as `Spotify.exe`, `chrome.exe`
/// or `Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic`.
pub fn player_label(app_id: &str) -> String {
    let lower = app_id.to_lowercase();
    const KNOWN: &[(&str, &str)] = &[
        ("spotify", "Spotify"),
        ("msedge", "Edge"),
        ("chrome", "Chrome"),
        ("firefox", "Firefox"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("vivaldi", "Vivaldi"),
        ("zunemusic", "Media Player"),
        ("windowsmediaplayer", "Media Player"),
        ("applemusic", "Apple Music"),
        ("itunes", "iTunes"),
        ("vlc", "VLC"),
        ("musicbee", "MusicBee"),
        ("foobar", "foobar2000"),
        ("tidal", "TIDAL"),
        ("deezer", "Deezer"),
        ("amazonmusic", "Amazon Music"),
    ];
    for (needle, name) in KNOWN {
        if lower.contains(needle) {
            return (*name).to_string();
        }
    }
    let tail = app_id.rsplit(['!', '.']).find(|s| !s.is_empty() && *s != "exe").unwrap_or(app_id);
    let tail = tail.split('_').next().unwrap_or(tail);
    let mut chars = tail.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => "Player".to_string(),
    }
}

/// Short id for artwork; not persisted, only used inside one run.
pub fn hash_id(parts: &[&[u8]]) -> String {
    let mut h = DefaultHasher::new();
    for p in parts {
        p.hash(&mut h);
    }
    format!("{:016x}", h.finish())
}

// ── Which player is "the" player ──────────────────────────────────────────────

/// Remembers when each player last changed between playing and not playing, so
/// the choice between several candidates is stable instead of flapping.
#[derive(Debug, Default)]
pub struct ActivityTracker {
    seen: HashMap<String, (PlaybackStatus, u64)>,
}

impl ActivityTracker {
    pub fn observe(&mut self, snaps: &[SessionSnapshot], now_ms: u64) {
        for s in snaps {
            match self.seen.get_mut(&s.id) {
                Some((status, at)) => {
                    let was = *status == PlaybackStatus::Playing;
                    let is = s.status == PlaybackStatus::Playing;
                    if was != is {
                        *at = now_ms;
                    }
                    *status = s.status;
                }
                None => {
                    self.seen.insert(s.id.clone(), (s.status, now_ms));
                }
            }
        }
        self.seen.retain(|id, _| snaps.iter().any(|s| &s.id == id));
    }

    pub fn last_change(&self, id: &str) -> u64 {
        self.seen.get(id).map(|(_, at)| *at).unwrap_or(0)
    }
}

/// Picks the session to show.
///
/// 1. The player the user pinned, while it exists.
/// 2. A playing player. With several: the OS's current one if it plays,
///    otherwise the one that started playing most recently.
/// 3. Nothing plays: the OS's current session, else the one that played last.
pub fn choose_active(snaps: &[SessionSnapshot], pinned: Option<&str>, activity: &ActivityTracker) -> Option<usize> {
    if snaps.is_empty() {
        return None;
    }
    if let Some(p) = pinned {
        if let Some(i) = snaps.iter().position(|s| s.id == p) {
            return Some(i);
        }
    }
    let playing: Vec<usize> =
        snaps.iter().enumerate().filter(|(_, s)| s.status == PlaybackStatus::Playing).map(|(i, _)| i).collect();
    match playing.len() {
        0 => {}
        1 => return Some(playing[0]),
        _ => {
            if let Some(&i) = playing.iter().find(|&&i| snaps[i].is_system_current) {
                return Some(i);
            }
            return playing.iter().copied().max_by_key(|&i| activity.last_change(&snaps[i].id));
        }
    }
    if let Some(i) = snaps.iter().position(|s| s.is_system_current) {
        return Some(i);
    }
    snaps.iter().enumerate().max_by_key(|(_, s)| activity.last_change(&s.id)).map(|(i, _)| i)
}

pub fn build_state(snaps: &[SessionSnapshot], pinned: Option<&str>, activity: &ActivityTracker) -> MediaState {
    let active = choose_active(snaps, pinned, activity).map(|i| {
        let s = &snaps[i];
        ActiveMedia {
            id: s.id.clone(),
            app_name: player_label(&s.id),
            track: s.track.clone(),
            status: s.status,
            controls: s.controls,
            timeline: s.timeline.clone(),
        }
    });
    let players = snaps
        .iter()
        .map(|s| PlayerSummary {
            id: s.id.clone(),
            app_name: player_label(&s.id),
            status: s.status,
            title: s.track.title.clone(),
        })
        .collect();
    // A pin that points at a vanished player is dropped from what the UI sees.
    let pinned_id = pinned.filter(|p| snaps.iter().any(|s| s.id == *p)).map(str::to_string);
    MediaState { available: true, error: None, active, players, pinned_id }
}

// ── Timeline maths ────────────────────────────────────────────────────────────

/// Offset between the Windows FILETIME epoch (1601) and the unix epoch, in 100 ns ticks.
pub const FILETIME_UNIX_OFFSET: i64 = 116_444_736_000_000_000;

/// Raw SMTC timeline (100 ns ticks) → [`Timeline`] valid *now*.
///
/// SMTC reports the position as it was at `LastUpdatedTime`. While playing, the
/// position is advanced by the elapsed time (times the rate) so the UI starts
/// from the right place. A player that reports no end time (live streams,
/// some browsers) gets no timeline at all rather than a bar stuck at zero.
pub fn timeline_from_raw(
    start: i64,
    end: i64,
    position: i64,
    last_updated_filetime: i64,
    now_ms: u64,
    playing: bool,
    rate: f64,
) -> Option<Timeline> {
    const TICKS_PER_MS: i64 = 10_000;
    if end <= start {
        return None;
    }
    let duration_ms = ((end - start) / TICKS_PER_MS) as u64;
    if duration_ms == 0 {
        return None;
    }
    let mut position_ms = (position - start).max(0) / TICKS_PER_MS;
    let rate = if rate.is_finite() && rate > 0.0 { rate } else { 1.0 };
    if playing && last_updated_filetime > FILETIME_UNIX_OFFSET {
        let updated_unix_ms = (last_updated_filetime - FILETIME_UNIX_OFFSET) / TICKS_PER_MS;
        let elapsed = (now_ms as i64 - updated_unix_ms).max(0);
        // A stale or wrong LastUpdatedTime must not fling the bar to the end.
        if elapsed < 6 * 60 * 60 * 1000 {
            position_ms += (elapsed as f64 * rate) as i64;
        }
    }
    let position_ms = (position_ms as u64).min(duration_ms);
    Some(Timeline { position_ms, duration_ms, captured_at_ms: now_ms, rate })
}

/// Where the position is at `now_ms`, given a timeline and the playback status.
pub fn position_at(t: &Timeline, status: PlaybackStatus, now_ms: u64) -> u64 {
    if status != PlaybackStatus::Playing {
        return t.position_ms.min(t.duration_ms);
    }
    let elapsed = now_ms.saturating_sub(t.captured_at_ms) as f64 * t.rate;
    (t.position_ms + elapsed as u64).min(t.duration_ms)
}

// ── Change detection ──────────────────────────────────────────────────────────

/// Position drift the UI can absorb on its own by extrapolating.
const POSITION_TOLERANCE_MS: u64 = 1500;

/// True when `new` is worth sending to the UI: anything but a clock tick.
///
/// A playing track's position moves every second without any event; the UI
/// extrapolates it. Only a jump (seek, restart, track change) or a change in
/// any other field needs a message.
pub fn materially_differs(old: &MediaState, new: &MediaState) -> bool {
    if old.available != new.available
        || old.error != new.error
        || old.players != new.players
        || old.pinned_id != new.pinned_id
    {
        return true;
    }
    match (&old.active, &new.active) {
        (None, None) => false,
        (Some(a), Some(b)) => {
            if a.id != b.id || a.track != b.track || a.status != b.status || a.controls != b.controls {
                return true;
            }
            match (&a.timeline, &b.timeline) {
                (None, None) => false,
                (Some(ta), Some(tb)) => {
                    if ta.duration_ms != tb.duration_ms || (ta.rate - tb.rate).abs() > f64::EPSILON {
                        return true;
                    }
                    let expected = position_at(ta, a.status, tb.captured_at_ms);
                    expected.abs_diff(tb.position_ms) > POSITION_TOLERANCE_MS
                }
                _ => true,
            }
        }
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(id: &str, status: PlaybackStatus, current: bool) -> SessionSnapshot {
        SessionSnapshot {
            id: id.into(),
            track: Track { title: format!("{id} track"), ..Track::default() },
            status,
            controls: Controls { play: true, pause: true, next: true, previous: true, seek: true },
            timeline: None,
            is_system_current: current,
        }
    }

    fn tracker(snaps: &[SessionSnapshot], at: u64) -> ActivityTracker {
        let mut t = ActivityTracker::default();
        t.observe(snaps, at);
        t
    }

    #[test]
    fn no_sessions_means_no_active_player() {
        assert_eq!(choose_active(&[], None, &ActivityTracker::default()), None);
        let st = build_state(&[], None, &ActivityTracker::default());
        assert!(st.available && st.active.is_none() && st.players.is_empty());
    }

    #[test]
    fn the_only_playing_session_wins_over_the_system_current_one() {
        let s = [snap("a", PlaybackStatus::Paused, true), snap("b", PlaybackStatus::Playing, false)];
        assert_eq!(choose_active(&s, None, &tracker(&s, 1)), Some(1));
    }

    #[test]
    fn with_two_playing_the_system_current_wins() {
        let s = [snap("a", PlaybackStatus::Playing, false), snap("b", PlaybackStatus::Playing, true)];
        assert_eq!(choose_active(&s, None, &tracker(&s, 1)), Some(1));
    }

    #[test]
    fn with_two_playing_and_no_current_the_latest_starter_wins() {
        let a = [snap("a", PlaybackStatus::Playing, false), snap("b", PlaybackStatus::Paused, false)];
        let mut t = tracker(&a, 100);
        let b = [snap("a", PlaybackStatus::Playing, false), snap("b", PlaybackStatus::Playing, false)];
        t.observe(&b, 200);
        assert_eq!(choose_active(&b, None, &t), Some(1));
        // A later poll with the same statuses must not reshuffle the choice.
        t.observe(&b, 900);
        assert_eq!(choose_active(&b, None, &t), Some(1));
    }

    #[test]
    fn a_pin_beats_everything_while_the_player_exists() {
        let s = [snap("a", PlaybackStatus::Paused, false), snap("b", PlaybackStatus::Playing, true)];
        let t = tracker(&s, 1);
        assert_eq!(choose_active(&s, Some("a"), &t), Some(0));
        let st = build_state(&s, Some("a"), &t);
        assert_eq!(st.pinned_id.as_deref(), Some("a"));
        // The pinned player closed: automatic selection again, pin not reported.
        let only_b = [s[1].clone()];
        let st = build_state(&only_b, Some("a"), &tracker(&only_b, 1));
        assert_eq!(st.pinned_id, None);
        assert_eq!(st.active.unwrap().id, "b");
    }

    #[test]
    fn when_nothing_plays_the_system_current_then_the_last_player_is_shown() {
        let s = [snap("a", PlaybackStatus::Paused, false), snap("b", PlaybackStatus::Paused, true)];
        assert_eq!(choose_active(&s, None, &tracker(&s, 1)), Some(1));

        let s1 = [snap("a", PlaybackStatus::Playing, false), snap("b", PlaybackStatus::Paused, false)];
        let mut t = tracker(&s1, 10);
        let s2 = [snap("a", PlaybackStatus::Paused, false), snap("b", PlaybackStatus::Paused, false)];
        t.observe(&s2, 50); // a stopped playing most recently
        assert_eq!(choose_active(&s2, None, &t), Some(0));
    }

    #[test]
    fn the_tracker_forgets_closed_players() {
        let s = [snap("a", PlaybackStatus::Playing, false)];
        let mut t = tracker(&s, 5);
        assert_eq!(t.last_change("a"), 5);
        t.observe(&[], 6);
        assert_eq!(t.last_change("a"), 0);
    }

    #[test]
    fn player_names_are_readable() {
        assert_eq!(player_label("Spotify.exe"), "Spotify");
        assert_eq!(player_label("chrome.exe"), "Chrome");
        assert_eq!(player_label("MSEdge"), "Edge");
        assert_eq!(player_label("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "Media Player");
        assert_eq!(player_label("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"), "Apple Music");
        assert_eq!(player_label("SomeVendor.Cool_Player_1.0!CoolApp"), "CoolApp");
        assert_eq!(player_label("foo.exe"), "Foo");
        assert_eq!(player_label(""), "Player");
    }

    #[test]
    fn a_playing_timeline_is_advanced_to_now() {
        // Position 10 s, last updated 4 s ago, 3-minute track.
        let now = 1_700_000_000_000u64;
        let updated = FILETIME_UNIX_OFFSET + (now as i64 - 4_000) * 10_000;
        let t = timeline_from_raw(0, 180 * 10_000_000, 10 * 10_000_000, updated, now, true, 1.0).unwrap();
        assert_eq!(t.duration_ms, 180_000);
        assert_eq!(t.position_ms, 14_000);
        assert_eq!(t.captured_at_ms, now);
        // Paused: no advance.
        let t = timeline_from_raw(0, 180 * 10_000_000, 10 * 10_000_000, updated, now, false, 1.0).unwrap();
        assert_eq!(t.position_ms, 10_000);
    }

    #[test]
    fn missing_or_nonsense_timelines_are_handled() {
        let now = 1_700_000_000_000u64;
        // No end time (live stream): no timeline.
        assert!(timeline_from_raw(0, 0, 0, 0, now, true, 1.0).is_none());
        // LastUpdatedTime unset (1601): no extrapolation, no panic.
        let t = timeline_from_raw(0, 60 * 10_000_000, 5 * 10_000_000, 0, now, true, 1.0).unwrap();
        assert_eq!(t.position_ms, 5_000);
        // Position past the end is clamped.
        let t = timeline_from_raw(0, 60 * 10_000_000, 90 * 10_000_000, 0, now, false, 1.0).unwrap();
        assert_eq!(t.position_ms, 60_000);
        // Absurd rate falls back to 1.
        let t = timeline_from_raw(0, 60 * 10_000_000, 0, 0, now, true, f64::NAN).unwrap();
        assert_eq!(t.rate, 1.0);
    }

    #[test]
    fn position_extrapolation_stops_when_paused_and_at_the_end() {
        let t = Timeline { position_ms: 10_000, duration_ms: 30_000, captured_at_ms: 1_000, rate: 1.0 };
        assert_eq!(position_at(&t, PlaybackStatus::Playing, 6_000), 15_000);
        assert_eq!(position_at(&t, PlaybackStatus::Paused, 6_000), 10_000);
        assert_eq!(position_at(&t, PlaybackStatus::Playing, 999_000), 30_000);
    }

    fn state_with(pos: u64, at: u64, status: PlaybackStatus) -> MediaState {
        let mut s = snap("a", status, true);
        s.timeline = Some(Timeline { position_ms: pos, duration_ms: 200_000, captured_at_ms: at, rate: 1.0 });
        build_state(&[s], None, &ActivityTracker::default())
    }

    #[test]
    fn a_clock_tick_is_not_a_change_but_a_seek_is() {
        let old = state_with(10_000, 1_000, PlaybackStatus::Playing);
        let tick = state_with(15_200, 6_000, PlaybackStatus::Playing); // 5 s later, 5.2 s in
        assert!(!materially_differs(&old, &tick));
        let seek = state_with(90_000, 6_000, PlaybackStatus::Playing);
        assert!(materially_differs(&old, &seek));
        let paused = state_with(15_000, 6_000, PlaybackStatus::Paused);
        assert!(materially_differs(&old, &paused));
    }

    #[test]
    fn track_and_player_changes_are_changes() {
        let a = build_state(&[snap("a", PlaybackStatus::Playing, true)], None, &ActivityTracker::default());
        let mut other = snap("a", PlaybackStatus::Playing, true);
        other.track.title = "Different".into();
        let b = build_state(&[other], None, &ActivityTracker::default());
        assert!(materially_differs(&a, &b));
        assert!(materially_differs(&a, &MediaState::empty()));
        assert!(!materially_differs(&a, &a.clone()));
        assert!(materially_differs(&MediaState::empty(), &MediaState::unavailable("x")));
    }

    #[test]
    fn control_actions_use_the_documented_json_shape() {
        let a: ControlAction = serde_json::from_str(r#"{"kind":"seek","positionMs":42}"#).unwrap();
        assert_eq!(a, ControlAction::Seek { position_ms: 42 });
        let a: ControlAction = serde_json::from_str(r#"{"kind":"toggle"}"#).unwrap();
        assert_eq!(a, ControlAction::Toggle);
    }

    #[test]
    fn state_serialises_with_camel_case_keys() {
        let st = state_with(1, 1, PlaybackStatus::Playing);
        let v = serde_json::to_value(&st).unwrap();
        assert!(v["active"]["appName"].is_string());
        assert_eq!(v["active"]["status"], "playing");
        assert!(v["active"]["timeline"]["capturedAtMs"].is_number());
        assert!(v["pinnedId"].is_null());
    }
}
