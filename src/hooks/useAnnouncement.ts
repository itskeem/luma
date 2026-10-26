import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsSync } from "./useSettingsSync";

export interface Announcement {
	id: string;
	severity: "info" | "warning";
	title: string;
	body: string;
	url?: string;
}

const CACHE_KEY = "luma-announcement-cache";
const CACHE_AT_KEY = "luma-announcement-cache-at";
const DISMISSED_KEY = "luma-announcement-dismissed";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function normalize(data: unknown): Announcement | null {
	if (!data || typeof data !== "object") return null;
	const raw = data as Record<string, unknown>;
	const id = typeof raw.id === "string" ? raw.id.trim() : "";
	const title = typeof raw.title === "string" ? raw.title.trim() : "";
	if (!id || !title) return null;
	return {
		id,
		title,
		severity: raw.severity === "warning" ? "warning" : "info",
		body: typeof raw.body === "string" ? raw.body.trim() : "",
		url: typeof raw.url === "string" && raw.url.startsWith("https://") ? raw.url : undefined
	};
}

function readCached(): Announcement | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		return raw ? normalize(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

// Luma has no announcement server and makes no network request here. The hook
// and the notch card stay in place so a feed can be wired up later.
function fetchAnnouncement(): Promise<Announcement | null> {
	return Promise.resolve(null);
}

/**
 * Reads an announcement feed (currently none: see fetchAnnouncement), keeps the last payload cached so the card survives restarts until
 * dismissed. Dismissal is stored as the `luma-announcement-dismissed` setting
 * so every window hides the same announcement.
 */
export function useAnnouncement() {
	const [announcement, setAnnouncement] = useState<Announcement | null>(() => readCached());
	const [dismissed, setDismissed] = useState(
		() => readCached()?.id === localStorage.getItem(DISMISSED_KEY)
	);

	useEffect(() => {
		let disposed = false;

		const refresh = () => {
			const last = Number(localStorage.getItem(CACHE_AT_KEY) || 0);
			if (last > 0 && Math.abs(Date.now() - last) < CHECK_INTERVAL_MS) return;
			fetchAnnouncement()
				.then((next) => {
					if (disposed) return;
					localStorage.setItem(CACHE_AT_KEY, String(Date.now()));
					if (next) localStorage.setItem(CACHE_KEY, JSON.stringify(next));
					else localStorage.removeItem(CACHE_KEY);
					setAnnouncement(next);
					setDismissed(next?.id === localStorage.getItem(DISMISSED_KEY));
				})
				.catch(() => {}); // offline or not deployed yet — retry on the next tick/mount
		};

		// Fetch on mount, then re-check hourly so long-running windows still
		// pick up newly published announcements without a restart.
		refresh();
		const timer = setInterval(refresh, CHECK_INTERVAL_MS);
		return () => {
			disposed = true;
			clearInterval(timer);
		};
	}, []);

	// Dismissal from any window (notch close button or settings banner).
	useSettingsSync({
		"luma-announcement-dismissed": (value) => setDismissed(announcement?.id === value)
	});

	const dismiss = useCallback(() => {
		if (!announcement) return;
		localStorage.setItem(DISMISSED_KEY, announcement.id);
		invoke("save_setting", { key: "luma-announcement-dismissed", value: announcement.id }).catch(
			() => {}
		);
		setDismissed(true);
	}, [announcement]);

	// A new announcement id replaces an older, already-dismissed one.
	useEffect(() => {
		setDismissed(announcement?.id === localStorage.getItem(DISMISSED_KEY));
	}, [announcement]);

	return { announcement, dismissed, dismiss };
}
