//! The few OS calls Tauri does not cover. Everything else in the crate is
//! platform-neutral; this is the only place with window-style hacks.

use tauri::WebviewWindow;

#[cfg(windows)]
mod imp {
    use super::WebviewWindow;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW,
    };

    fn hwnd_of(win: &WebviewWindow) -> Option<HWND> {
        let raw = win.hwnd().ok()?.0 as isize;
        if raw == 0 {
            return None;
        }
        Some(HWND(raw as *mut _))
    }

    /// WS_EX_NOACTIVATE: clicking the island never steals keyboard focus from
    /// the app the user is typing in. WS_EX_TOOLWINDOW: no taskbar button, no Alt-Tab entry.
    pub fn make_non_activating(win: &WebviewWindow) {
        let Some(hwnd) = hwnd_of(win) else { return };
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize);
        }
    }

    /// Shows the window without activating it.
    pub fn show_no_activate(win: &WebviewWindow) {
        match hwnd_of(win) {
            Some(hwnd) => unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            },
            None => {
                let _ = win.show();
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::WebviewWindow;

    pub fn make_non_activating(_win: &WebviewWindow) {}

    pub fn show_no_activate(win: &WebviewWindow) {
        let _ = win.show();
    }
}

pub use imp::{make_non_activating, show_no_activate};
