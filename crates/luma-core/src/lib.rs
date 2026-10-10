//! Platform-independent logic for Luma.
//!
//! Everything in here is plain Rust with no OS or Tauri dependency, so it is
//! unit-tested on any machine. The Windows media bridge and the window glue
//! live in `src-tauri` and call into these modules.

pub mod artwork;
pub mod media;
pub mod placement;
pub mod settings;
