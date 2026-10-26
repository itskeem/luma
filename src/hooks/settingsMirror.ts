import { invoke } from "@tauri-apps/api/core";

// Keys that live only in localStorage by design and never in settings.json.
const LOCAL_ONLY_KEYS = new Set([
	"luma-first-run",
	"luma-app-version",
	"luma-timer-last-duration",
	"luma-announcement-cache",
	"luma-announcement-cache-at",
	// Notch shelf contents; persisted only when luma-shelf-persist is on.
	"luma-shelf-items",
	// Legacy name, only read as a fallback for luma-media-visualizer-enabled.
	"luma-visualizer-enabled"
]);

// What this window's first render saw: useState initializers read localStorage.
const mirroredAtStartup = Object.keys(localStorage).filter((key) => key.startsWith("luma-"));

/**
 * localStorage mirrors settings.json so windows can paint before settings
 * load. A key that settings.json no longer has (edited while Luma was closed,
 * or dropped by an import) would otherwise keep coming back from the mirror.
 * If this window started from such a stale value, the stale keys are removed
 * and the window reloads once, so it starts from the defaults. Resolves to
 * true when a reload was triggered.
 */
export async function reloadIfMirrorWasStale(settings: Record<string, unknown> | null | undefined) {
	const fileKeys = Object.keys(settings ?? {}).filter((key) => key.startsWith("luma-"));
	const stale = mirroredAtStartup.filter(
		(key) => !fileKeys.includes(key) && !LOCAL_ONLY_KEYS.has(key)
	);
	if (stale.length === 0) return false;
	// A missing or unreadable settings.json also loads as {}. Then localStorage
	// is still the only copy (installs from before settings.json), so keep it.
	if (
		fileKeys.length === 0 &&
		!(await invoke<boolean>("settings_file_readable").catch(() => false))
	) {
		return false;
	}
	stale.forEach((key) => localStorage.removeItem(key));
	location.reload();
	return true;
}
