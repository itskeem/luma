//! User preferences: the data model, validation and (atomic) persistence.

use std::fs;
use std::io::{self, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const SETTINGS_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    /// Accent colour taken from the album artwork.
    #[default]
    Adaptive,
    Midnight,
    Graphite,
    /// The violet-blue of the Luma logo.
    Luma,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Density {
    #[default]
    Comfortable,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Animation {
    Off,
    Subtle,
    #[default]
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Position {
    #[default]
    TopCenter,
    TopLeft,
    TopRight,
    /// Wherever the user dragged it; see [`Settings::custom_anchor`].
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum IdleBehavior {
    /// Always shown at full strength.
    Off,
    /// Fades after a while without playback or interaction.
    #[default]
    Dim,
    /// Hidden while no player is running; returns by itself with the next one.
    Hide,
}

/// Where a dragged island lives. Offsets are logical pixels from the monitor's
/// origin, so they survive a change of display scaling.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAnchor {
    pub monitor_name: String,
    /// Physical origin of that monitor when the anchor was saved (to tell apart identical monitors).
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub center_x: f64,
    pub top_y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusSettings {
    pub focus_min: u32,
    pub short_break_min: u32,
    pub long_break_min: u32,
    pub rounds_before_long: u32,
    pub auto_start_next: bool,
}

impl Default for FocusSettings {
    fn default() -> Self {
        Self { focus_min: 25, short_break_min: 5, long_break_min: 15, rounds_before_long: 4, auto_start_next: false }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum ClockFormat {
    #[default]
    #[serde(rename = "24h")]
    H24,
    #[serde(rename = "12h")]
    H12,
}

fn default_pause_delay() -> u32 {
    8
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PetSize {
    /// 72 logical px sprite
    Small,
    /// 96 logical px sprite
    #[default]
    Medium,
    /// 128 logical px sprite
    Large,
}

impl PetSize {
    pub fn logical_px(self) -> u32 {
        match self {
            PetSize::Small => 72,
            PetSize::Medium => 96,
            PetSize::Large => 128,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PetSettings {
    pub enabled: bool,
    pub size: PetSize,
    pub reacts_to_music: bool,
    pub reacts_to_focus: bool,
    /// Where the pet window was last dragged. None = default bottom-right.
    pub custom_anchor: Option<CustomAnchor>,
}

impl Default for PetSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            size: PetSize::default(),
            reacts_to_music: true,
            reacts_to_focus: true,
            custom_anchor: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub theme: Theme,
    pub density: Density,
    pub animation: Animation,
    pub position: Position,
    pub custom_anchor: Option<CustomAnchor>,
    /// Open the island when the pointer rests on it, without a click.
    pub open_on_hover: bool,
    /// Seconds after the pointer leaves before an open island folds. 0 = never.
    pub auto_collapse_secs: u32,
    /// Briefly show the title above the pill when the track changes.
    pub peek_on_track_change: bool,
    pub idle: IdleBehavior,
    pub launch_at_startup: bool,
    pub focus: FocusSettings,
    #[serde(default)]
    pub clock_format: ClockFormat,
    #[serde(default)]
    pub show_seconds: bool,
    #[serde(default = "default_pause_delay")]
    pub pause_delay_secs: u32,
    #[serde(default)]
    pub pet: PetSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            theme: Theme::default(),
            density: Density::default(),
            animation: Animation::default(),
            position: Position::default(),
            custom_anchor: None,
            open_on_hover: false,
            auto_collapse_secs: 8,
            peek_on_track_change: true,
            idle: IdleBehavior::default(),
            launch_at_startup: false,
            focus: FocusSettings::default(),
            clock_format: ClockFormat::default(),
            show_seconds: false,
            pause_delay_secs: 8,
            pet: PetSettings::default(),
        }
    }
}

impl Settings {
    /// Brings out-of-range values back into range. Called after every load and
    /// every update, so a hand-edited or buggy file can never wedge the app.
    pub fn sanitize(&mut self) {
        self.version = SETTINGS_VERSION;
        self.auto_collapse_secs = self.auto_collapse_secs.min(120);
        self.pause_delay_secs = self.pause_delay_secs.min(120);
        self.focus.focus_min = self.focus.focus_min.clamp(1, 180);
        self.focus.short_break_min = self.focus.short_break_min.clamp(1, 60);
        self.focus.long_break_min = self.focus.long_break_min.clamp(1, 120);
        self.focus.rounds_before_long = self.focus.rounds_before_long.clamp(2, 12);
        if let Some(a) = &self.custom_anchor {
            if !(a.center_x.is_finite() && a.top_y.is_finite()) {
                self.custom_anchor = None;
            }
        }
        if self.position == Position::Custom && self.custom_anchor.is_none() {
            self.position = Position::TopCenter;
        }
        if let Some(a) = &self.pet.custom_anchor {
            if !(a.center_x.is_finite() && a.top_y.is_finite()) {
                self.pet.custom_anchor = None;
            }
        }
    }
}

/// What happened when loading, so the caller can log it.
#[derive(Debug, PartialEq, Eq)]
pub enum LoadOutcome {
    Loaded,
    /// No file yet: first run.
    Missing,
    /// The file could not be parsed; it was moved aside as `<name>.bak`.
    Corrupt,
}

pub fn load(path: &Path) -> (Settings, LoadOutcome) {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return (Settings::default(), LoadOutcome::Missing),
        Err(_) => return (Settings::default(), LoadOutcome::Corrupt),
    };
    match serde_json::from_str::<Settings>(&text) {
        Ok(mut s) => {
            s.sanitize();
            (s, LoadOutcome::Loaded)
        }
        Err(_) => {
            let _ = fs::rename(path, path.with_extension("json.bak"));
            (Settings::default(), LoadOutcome::Corrupt)
        }
    }
}

/// Writes to a temporary file and renames it over the target, so a crash
/// mid-write leaves the previous settings intact.
pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(settings).map_err(io::Error::other)?;
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&json)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("luma-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    #[test]
    fn defaults_are_sane() {
        let s = Settings::default();
        assert_eq!(s.theme, Theme::Adaptive);
        assert_eq!(s.position, Position::TopCenter);
        assert!(!s.launch_at_startup);
        assert_eq!(s.focus.focus_min, 25);
        assert_eq!(s.clock_format, ClockFormat::H24);
        assert!(!s.show_seconds);
        assert_eq!(s.pause_delay_secs, 8);
        assert!(!s.pet.enabled);
        assert_eq!(s.pet.size, PetSize::Medium);
        assert!(s.pet.reacts_to_music);
        assert!(s.pet.reacts_to_focus);
        assert!(s.pet.custom_anchor.is_none());
    }

    #[test]
    fn a_missing_file_gives_defaults() {
        let (s, outcome) = load(&temp_path("missing"));
        assert_eq!(outcome, LoadOutcome::Missing);
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn settings_round_trip() {
        let path = temp_path("roundtrip");
        let mut s = Settings {
            theme: Theme::Luma,
            density: Density::Compact,
            clock_format: ClockFormat::H12,
            show_seconds: true,
            pause_delay_secs: 15,
            ..Settings::default()
        };
        s.custom_anchor = Some(CustomAnchor {
            monitor_name: "DELL".into(),
            monitor_x: -2560,
            monitor_y: 0,
            center_x: 640.0,
            top_y: 12.5,
        });
        s.position = Position::Custom;
        s.focus.focus_min = 50;
        s.pet.enabled = true;
        s.pet.size = PetSize::Large;
        s.pet.custom_anchor = Some(CustomAnchor {
            monitor_name: "DELL".into(),
            monitor_x: -2560,
            monitor_y: 0,
            center_x: 1400.0,
            top_y: 780.0,
        });
        save(&path, &s).unwrap();
        let (back, outcome) = load(&path);
        assert_eq!(outcome, LoadOutcome::Loaded);
        assert_eq!(back, s);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn an_older_file_with_missing_fields_still_loads() {
        let path = temp_path("partial");
        fs::write(&path, r#"{"theme":"graphite","focus":{"focusMin":40}}"#).unwrap();
        let (s, outcome) = load(&path);
        assert_eq!(outcome, LoadOutcome::Loaded);
        assert_eq!(s.theme, Theme::Graphite);
        assert_eq!(s.focus.focus_min, 40);
        assert_eq!(s.focus.short_break_min, 5);
        assert_eq!(s.animation, Animation::Full);
        assert_eq!(s.clock_format, ClockFormat::H24);
        assert!(!s.show_seconds);
        assert_eq!(s.pause_delay_secs, 8);
        // Old file had no pet field: defaults must apply.
        assert!(!s.pet.enabled);
        assert_eq!(s.pet.size, PetSize::Medium);
    }

    #[test]
    fn a_corrupt_file_is_moved_aside_and_defaults_used() {
        let path = temp_path("corrupt");
        fs::write(&path, "{ this is not json").unwrap();
        let (s, outcome) = load(&path);
        assert_eq!(outcome, LoadOutcome::Corrupt);
        assert_eq!(s, Settings::default());
        assert!(path.with_extension("json.bak").exists());
        assert!(!path.exists());
    }

    #[test]
    fn an_unknown_enum_value_counts_as_corrupt_not_a_crash() {
        let path = temp_path("unknown");
        fs::write(&path, r#"{"theme":"neon-rainbow"}"#).unwrap();
        let (s, outcome) = load(&path);
        assert_eq!(outcome, LoadOutcome::Corrupt);
        assert_eq!(s.theme, Theme::Adaptive);
    }

    #[test]
    fn sanitize_clamps_and_repairs() {
        let mut s = Settings::default();
        s.auto_collapse_secs = 99_999;
        s.pause_delay_secs = 999;
        s.focus.focus_min = 0;
        s.focus.short_break_min = 999;
        s.focus.rounds_before_long = 1;
        s.position = Position::Custom; // but no anchor
        s.sanitize();
        assert_eq!(s.auto_collapse_secs, 120);
        assert_eq!(s.pause_delay_secs, 120);
        assert_eq!(s.focus.focus_min, 1);
        assert_eq!(s.focus.short_break_min, 60);
        assert_eq!(s.focus.rounds_before_long, 2);
        assert_eq!(s.position, Position::TopCenter);
    }

    #[test]
    fn a_non_finite_anchor_is_discarded() {
        let mut s = Settings::default();
        s.position = Position::Custom;
        s.custom_anchor = Some(CustomAnchor {
            monitor_name: "x".into(),
            monitor_x: 0,
            monitor_y: 0,
            center_x: f64::NAN,
            top_y: 1.0,
        });
        s.sanitize();
        assert!(s.custom_anchor.is_none());
        assert_eq!(s.position, Position::TopCenter);
    }
}
