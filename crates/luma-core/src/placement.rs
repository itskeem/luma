//! Where the island window goes: presets, dragged positions, multi-monitor
//! matching, DPI scaling and keeping it on screen.
//!
//! All inputs and outputs are physical pixels unless a name says "logical".
//! The window is the island plus a transparent margin ([`SHADOW_PAD`]) that
//! holds its shadow; the margin may hang off the screen edge, the island may not.

use crate::settings::Position;

/// Transparent margin around the island inside the window, in logical px.
pub const SHADOW_PAD: f64 = 14.0;
/// Gap between the screen's top edge and the island for the presets, logical px.
pub const TOP_GAP: f64 = 8.0;
/// Gap between the screen's side edges and the island for left/right presets.
pub const SIDE_GAP: f64 = 16.0;
/// The island is kept at least this far inside any screen edge, logical px.
pub const EDGE_MARGIN: f64 = 4.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MonitorInfo {
    pub name: String,
    pub rect: Rect,
    pub scale: f64,
}

fn px(logical: f64, scale: f64) -> i32 {
    (logical * scale).round() as i32
}

/// Top-left of the window for a preset or a dragged position.
///
/// `custom` is (island centre x, island top y) in logical px from the monitor origin.
pub fn resolve(
    mon: &MonitorInfo,
    position: Position,
    custom: Option<(f64, f64)>,
    win_w: u32,
    win_h: u32,
) -> (i32, i32) {
    let pad = px(SHADOW_PAD, mon.scale);
    let top = mon.rect.y + px(TOP_GAP, mon.scale) - pad;
    let (x, y) = match (position, custom) {
        (Position::Custom, Some((cx, ty))) => {
            (mon.rect.x + px(cx, mon.scale) - win_w as i32 / 2, mon.rect.y + px(ty, mon.scale) - pad)
        }
        (Position::TopLeft, _) => (mon.rect.x + px(SIDE_GAP, mon.scale) - pad, top),
        (Position::TopRight, _) => {
            (mon.rect.x + mon.rect.w as i32 - win_w as i32 - px(SIDE_GAP, mon.scale) + pad, top)
        }
        _ => (mon.rect.x + (mon.rect.w as i32 - win_w as i32) / 2, top),
    };
    clamp_to_monitor(x, y, win_w, win_h, mon)
}

/// Moves the window just enough that the island (window minus its margin)
/// lies inside the monitor. A window larger than the monitor is pinned top-left.
pub fn clamp_to_monitor(x: i32, y: i32, w: u32, h: u32, mon: &MonitorInfo) -> (i32, i32) {
    let pad = px(SHADOW_PAD, mon.scale);
    let edge = px(EDGE_MARGIN, mon.scale);
    let min_x = mon.rect.x + edge - pad;
    let min_y = mon.rect.y + edge - pad;
    let max_x = (mon.rect.x + mon.rect.w as i32 - w as i32 - edge + pad).max(min_x);
    let max_y = (mon.rect.y + mon.rect.h as i32 - h as i32 - edge + pad).max(min_y);
    (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
}

/// The (centre x, island top y) pair, in logical px from the monitor origin,
/// that reproduces a window currently at `x`,`y` with width `w`.
pub fn custom_from_window(mon: &MonitorInfo, x: i32, y: i32, w: u32) -> (f64, f64) {
    let pad = SHADOW_PAD;
    let cx = (x - mon.rect.x) as f64 / mon.scale + (w as f64 / mon.scale) / 2.0;
    let ty = (y - mon.rect.y) as f64 / mon.scale + pad;
    (cx, ty)
}

fn contains(r: &Rect, x: i32, y: i32) -> bool {
    x >= r.x && x < r.x + r.w as i32 && y >= r.y && y < r.y + r.h as i32
}

/// The monitor under a point (e.g. the window's centre after a drag).
pub fn monitor_at(point: (i32, i32), monitors: &[MonitorInfo]) -> Option<usize> {
    monitors.iter().position(|m| contains(&m.rect, point.0, point.1))
}

/// Finds a remembered monitor again: same name at the same place, then the
/// same name alone if it is unambiguous (layout rearranged). `None` means it
/// was unplugged and the caller falls back to the primary monitor.
pub fn pick_monitor(name: &str, origin: (i32, i32), monitors: &[MonitorInfo]) -> Option<usize> {
    if let Some(i) = monitors.iter().position(|m| m.name == name && (m.rect.x, m.rect.y) == origin) {
        return Some(i);
    }
    let mut same = monitors.iter().enumerate().filter(|(_, m)| m.name == name);
    match (same.next(), same.next()) {
        (Some((i, _)), None) => Some(i),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(name: &str, x: i32, y: i32, w: u32, h: u32, scale: f64) -> MonitorInfo {
        MonitorInfo { name: name.into(), rect: Rect { x, y, w, h }, scale }
    }

    #[test]
    fn top_center_is_centred_with_the_island_8px_from_the_top() {
        let m = mon("A", 0, 0, 1920, 1080, 1.0);
        // Window 420 x 70: island is 28 px narrower/shorter than the window.
        let (x, y) = resolve(&m, Position::TopCenter, None, 420, 70, );
        assert_eq!(x, (1920 - 420) / 2);
        assert_eq!(y, 8 - 14); // island top at 8, window starts 14 above it
    }

    #[test]
    fn scaling_is_applied_to_gaps() {
        let m = mon("A", 0, 0, 3840, 2160, 2.0);
        let (_, y) = resolve(&m, Position::TopCenter, None, 840, 140);
        assert_eq!(y, 16 - 28);
    }

    #[test]
    fn left_and_right_presets_keep_the_island_16px_from_the_side() {
        let m = mon("A", 0, 0, 1920, 1080, 1.0);
        let (lx, _) = resolve(&m, Position::TopLeft, None, 420, 70);
        assert_eq!(lx, 16 - 14);
        let (rx, _) = resolve(&m, Position::TopRight, None, 420, 70);
        assert_eq!(rx + 420 - 14, 1920 - 16);
    }

    #[test]
    fn a_second_monitor_with_a_negative_origin_works() {
        let m = mon("Left", -2560, 0, 2560, 1440, 1.0);
        let (x, _) = resolve(&m, Position::TopCenter, None, 400, 70);
        assert_eq!(x, -2560 + (2560 - 400) / 2);
    }

    #[test]
    fn a_custom_position_round_trips_through_a_window_position() {
        let m = mon("A", 1920, 0, 2560, 1440, 1.5);
        let (w, h) = (630, 105); // 420 x 70 logical at 1.5
        let (x, y) = resolve(&m, Position::Custom, Some((800.0, 120.0)), w, h);
        let (cx, ty) = custom_from_window(&m, x, y, w);
        assert!((cx - 800.0).abs() < 1.0, "{cx}");
        assert!((ty - 120.0).abs() < 1.0, "{ty}");
    }

    #[test]
    fn a_custom_position_is_stable_when_the_window_grows() {
        // Expanding keeps the island's centre fixed: same anchor, wider window.
        let m = mon("A", 0, 0, 1920, 1080, 1.0);
        let (x1, y1) = resolve(&m, Position::Custom, Some((900.0, 200.0)), 200, 40);
        let (x2, y2) = resolve(&m, Position::Custom, Some((900.0, 200.0)), 420, 240);
        assert_eq!(x1 + 100, x2 + 210);
        assert_eq!(y1, y2);
    }

    #[test]
    fn dragging_off_screen_is_pulled_back_in() {
        let m = mon("A", 0, 0, 1920, 1080, 1.0);
        let (x, y) = clamp_to_monitor(5000, 5000, 420, 240, &m);
        // Island's right/bottom edge ends 4 px inside the monitor.
        assert_eq!(x + 420 - 14, 1920 - 4);
        assert_eq!(y + 240 - 14, 1080 - 4);
        let (x, y) = clamp_to_monitor(-5000, -5000, 420, 240, &m);
        assert_eq!(x + 14, 4);
        assert_eq!(y + 14, 4);
    }

    #[test]
    fn a_window_bigger_than_the_monitor_does_not_panic() {
        let m = mon("Tiny", 0, 0, 300, 200, 1.0);
        let (x, y) = clamp_to_monitor(100, 100, 900, 700, &m);
        assert_eq!((x, y), (4 - 14, 4 - 14));
    }

    #[test]
    fn monitors_are_found_again_after_changes() {
        let dell = mon("DELL", 1920, 0, 2560, 1440, 1.0);
        let lap = mon("eDP-1", 0, 0, 1920, 1200, 1.0);
        assert_eq!(pick_monitor("DELL", (1920, 0), &[lap.clone(), dell.clone()]), Some(1));
        // Rearranged: still the only DELL.
        let moved = [mon("eDP-1", 2560, 0, 1920, 1200, 1.0), mon("DELL", 0, 0, 2560, 1440, 1.0)];
        assert_eq!(pick_monitor("DELL", (1920, 0), &moved), Some(1));
        // Unplugged.
        assert_eq!(pick_monitor("DELL", (1920, 0), &[lap]), None);
    }

    #[test]
    fn identical_monitors_are_told_apart_by_place_and_never_guessed() {
        let a = mon("LG", 0, 0, 1920, 1080, 1.0);
        let b = mon("LG", 1920, 0, 1920, 1080, 1.0);
        assert_eq!(pick_monitor("LG", (1920, 0), &[a.clone(), b.clone()]), Some(1));
        // Ambiguous after a rearrangement: do not pick one at random.
        let moved = [mon("LG", 0, 0, 1920, 1080, 1.0), mon("LG", 1920, 0, 1920, 1080, 1.0)];
        assert_eq!(pick_monitor("LG", (500, 500), &moved), None);
    }

    #[test]
    fn the_monitor_under_a_point_is_found() {
        let ms = [mon("A", 0, 0, 1920, 1080, 1.0), mon("B", 1920, 0, 1920, 1080, 1.0)];
        assert_eq!(monitor_at((100, 100), &ms), Some(0));
        assert_eq!(monitor_at((2000, 10), &ms), Some(1));
        assert_eq!(monitor_at((-5, 10), &ms), None);
    }
}
