import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateCheckResult } from "../updater";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { reloadIfMirrorWasStale } from "../hooks/settingsMirror";
import { hexToHsl } from "../theme";
import {
	addCustomFolder,
	removeCustomFolder,
	toggleEnabledFolder,
	toggleHiddenDrive,
	DEFAULT_ENABLED_FOLDERS
} from "../dockExtras";
import type { WidgetConfig } from "./types";

function readBool(val: string | null): boolean {
	return val === "true";
}

export function useSettings() {
	const [saveError, setSaveError] = useState(
		() => sessionStorage.getItem("luma-settings-save-error") !== null
	);
	const saveQueue = useRef<Promise<void>>(Promise.resolve());
	const saveFailed = useRef(false);
	const [autostart, setAutostart] = useState(false);
	const [weatherEnabled, setWeatherEnabled] = useState(true);
	const [calendarEnabled, setCalendarEnabled] = useState(true);
	const [timerSoundEnabled, setTimerSoundEnabled] = useState(
		() => localStorage.getItem("luma-timer-sound-enabled") !== "false"
	);
	const [musicModeEnabled, setMusicModeEnabled] = useState(true);
	const [notchRememberPanel, setNotchRememberPanel] = useState(
		() => (localStorage.getItem("luma-notch-remember-panel") ??
			localStorage.getItem("luma-notch-click-to-open")) !== "false"
	);
	const [notchOverFullscreen, setNotchOverFullscreen] = useState(false);
	const [notchDefaultPanel, setNotchDefaultPanel] = useState<"calendar" | "command-center">(
		() => localStorage.getItem("luma-notch-default-panel") === "command-center"
			? "command-center" : "calendar"
	);
	const [musicCompactNotch, setMusicCompactNotch] = useState(true);
	const [shelfPersist, setShelfPersist] = useState(
		() => localStorage.getItem("luma-shelf-persist") === "true"
	);
	const [volumeOverlayEnabled, setVolumeOverlayEnabled] = useState(true);
	const [volumeEdgeEnabled, setVolumeEdgeEnabled] = useState(
		() => localStorage.getItem("luma-volume-edge-enabled") !== "false"
	);
	const [brightnessOverlayEnabled, setBrightnessOverlayEnabled] = useState(
		() => localStorage.getItem("luma-brightness-overlay-enabled") !== "false"
	);
	const [brightnessEdgeEnabled, setBrightnessEdgeEnabled] = useState(
		() => localStorage.getItem("luma-brightness-edge-enabled") !== "false"
	);
	const [mediaAmbienceEnabled, setMediaAmbienceEnabled] = useState(true);
	const [mediaCompactGlowEnabled, setMediaCompactGlowEnabled] = useState(true);
	const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(
		() => (localStorage.getItem("luma-media-layout") as "classic" | "compact") || "classic"
	);
	const [cornersEnabled, setCornersEnabled] = useState(
		() => localStorage.getItem("luma-corners-enabled") === "true"
	);
	const [showUpdateIndicator, setShowUpdateIndicator] = useState(
		() => localStorage.getItem("luma-show-update-indicator") !== "false"
	);
	const [timeFormat24h, setTimeFormat24h] = useState(
		() => localStorage.getItem("luma-time-format-24h") === "true"
	);
	const [tempUnitFahrenheit, setTempUnitFahrenheit] = useState(false);
	const [cityName, setCityName] = useState("");
	const [citySearchResults, setCitySearchResults] = useState<
		Array<{ name: string; country: string; latitude: number; longitude: number }>
	>([]);
	const [showCityDropdown, setShowCityDropdown] = useState(false);
	const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
		left: ["weather"],
		right: ["battery"]
	});
	const [dockEnabled, setDockEnabled] = useState(true);
	const [dockPreviewEnabled, setDockPreviewEnabled] = useState(true);
	const [dockIconOnly, setDockIconOnly] = useState(
		() => localStorage.getItem("luma-dock-icon-only") === "true"
	);
	const [dockSeparatorEnabled, setDockSeparatorEnabled] = useState(
		() => localStorage.getItem("luma-dock-separator-enabled") !== "false"
	);
	const [startIcon, setStartIcon] = useState(
		() => localStorage.getItem("luma-start-icon") || "default"
	);
	const [dockAdaptive, setDockAdaptive] = useState(
		() => localStorage.getItem("luma-dock-adaptive") === "true"
	);
	const [dockWinNumberEnabled, setDockWinNumberEnabled] = useState(
		() => localStorage.getItem("luma-dock-win-number-enabled") !== "false"
	);
	const [dockExtrasPosition, setDockExtrasPosition] = useState(
		() => localStorage.getItem("luma-dock-extras-position") || "off"
	);
	const [dockExtrasDrives, setDockExtrasDrives] = useState(
		() => localStorage.getItem("luma-dock-extras-drives") !== "false"
	);
	const [dockExtrasHiddenDrives, setDockExtrasHiddenDrives] = useState(
		() => localStorage.getItem("luma-dock-extras-hidden-drives") || ""
	);
	const [dockExtrasRecycleBin, setDockExtrasRecycleBin] = useState(
		() => localStorage.getItem("luma-dock-extras-recycle-bin") !== "false"
	);
	// Off unless turned on, so existing docks don't change.
	const [dockTaskView, setDockTaskView] = useState(
		() => localStorage.getItem("luma-dock-task-view") === "true"
	);
	const [dockExtrasFolders, setDockExtrasFolders] = useState(
		() => localStorage.getItem("luma-dock-extras-folders") ?? DEFAULT_ENABLED_FOLDERS
	);
	const [dockExtrasCustomFolders, setDockExtrasCustomFolders] = useState(
		() => localStorage.getItem("luma-dock-extras-custom-folders") || "[]"
	);
	const [dockMode, setDockMode] = useState(() => {
		// "smart" is the fresh-install default — keep in step with App.tsx,
		// Dock.tsx, and the backend fallback in commands.rs.
		const raw = localStorage.getItem("luma-dock-mode") || "smart";
		return raw === "auto-hide" ? "smart" : raw;
	});
	const [dockEdgeDelay, setDockEdgeDelay] = useState(() => {
		const val = localStorage.getItem("luma-dock-edge-delay");
		return val !== null ? parseInt(val) : 200;
	});
	const [notchMode, setNotchMode] = useState("fixed");
	const [notchEdgeDelay, setNotchEdgeDelay] = useState(() => {
		const val = localStorage.getItem("luma-notch-edge-delay");
		return val !== null ? parseInt(val) : 200;
	});
	const [lowBatteryThreshold, setLowBatteryThreshold] = useState(20);
	const [updateStatus, setUpdateStatus] = useState<
		"idle" | "checking" | "available" | "uptodate" | "error" | "downloading" | "installing"
	>("idle");
	const [updateVersion, setUpdateVersion] = useState("");
	const [appVersion, setAppVersion] = useState("");
	const [autoUpdate, setAutoUpdate] = useState(
		() => localStorage.getItem("luma-auto-update") === "true"
	);
	const [scale, setScale] = useState(() =>
		parseFloat(localStorage.getItem("luma-scale") || "1.0")
	);
	const [themeMode, setThemeMode] = useState(
		() => localStorage.getItem("luma-theme-mode") || "dark"
	);
	const [themeColor, setThemeColor] = useState(
		() => localStorage.getItem("luma-theme-color") || "#007aff"
	);
	const [themeOpacity, setThemeOpacity] = useState(() => {
		const val = localStorage.getItem("luma-theme-opacity");
		return val !== null ? parseFloat(val) : 0.8;
	});
	const [themeSaturation, setThemeSaturation] = useState(() => {
		const val = localStorage.getItem("luma-theme-saturation");
		return val !== null ? parseFloat(val) : 0.5;
	});
	const [themeBrightness, setThemeBrightness] = useState(() => {
		const val = localStorage.getItem("luma-theme-brightness");
		return val !== null ? parseFloat(val) : 0.15;
	});
	const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "error">(
		"idle"
	);
	const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">(
		"idle"
	);

	// ── Load all settings from backend + localStorage ──
	const loadAllSettings = useCallback(async () => {
		try {
			const settings: Record<string, string> = await invoke("load_settings");
			if (await reloadIfMirrorWasStale(settings)) return;
			const getVal = (key: string) => {
				const val = settings[key];
				if (val !== undefined && val !== null) return String(val);
				return localStorage.getItem(key);
			};

			const apply = <T>(
				val: string | null,
				setter: (v: T) => void,
				transform: (v: string) => T
			) => {
				if (val !== null) setter(transform(val));
			};

			apply(getVal("luma-weather-enabled"), setWeatherEnabled, readBool);
			apply(getVal("luma-calendar-enabled"), setCalendarEnabled, readBool);
			apply(getVal("luma-timer-sound-enabled"), setTimerSoundEnabled, readBool);
			apply(getVal("luma-music-mode-enabled"), setMusicModeEnabled, readBool);
			apply(getVal("luma-notch-remember-panel") ?? getVal("luma-notch-click-to-open"),
				setNotchRememberPanel, readBool);
			apply(getVal("luma-notch-over-fullscreen"), setNotchOverFullscreen, (v) => v === "true");
			apply(getVal("luma-notch-default-panel"), setNotchDefaultPanel,
				(v) => v === "command-center" ? "command-center" : "calendar");
			apply(getVal("luma-music-compact-notch"), setMusicCompactNotch, readBool);
			apply(getVal("luma-shelf-persist"), setShelfPersist, readBool);
			apply(getVal("luma-volume-overlay-enabled"), setVolumeOverlayEnabled, readBool);
			apply(getVal("luma-brightness-overlay-enabled"), setBrightnessOverlayEnabled, readBool);
			apply(getVal("luma-media-ambience-enabled"), setMediaAmbienceEnabled, readBool);
			apply(getVal("luma-media-compact-glow-enabled"), setMediaCompactGlowEnabled, readBool);
			apply(getVal("luma-corners-enabled"), setCornersEnabled, readBool);
			apply(getVal("luma-time-format-24h"), setTimeFormat24h, readBool);
			apply(getVal("luma-show-update-indicator"), setShowUpdateIndicator, readBool);
			apply(getVal("luma-auto-update"), setAutoUpdate, readBool);
			apply(getVal("luma-volume-edge-enabled"), setVolumeEdgeEnabled, readBool);
			apply(getVal("luma-brightness-edge-enabled"), setBrightnessEdgeEnabled, readBool);
			apply(getVal("luma-dock-enabled"), setDockEnabled, readBool);
			apply(getVal("luma-dock-preview-enabled"), setDockPreviewEnabled, readBool);
			apply(getVal("luma-dock-icon-only"), setDockIconOnly, readBool);
			apply(getVal("luma-dock-separator-enabled"), setDockSeparatorEnabled, readBool);
			apply(getVal("luma-start-icon"), setStartIcon, (v) => v);
			apply(getVal("luma-dock-adaptive"), setDockAdaptive, readBool);
			apply(getVal("luma-dock-win-number-enabled"), setDockWinNumberEnabled, readBool);
			apply(getVal("luma-dock-extras-position"), setDockExtrasPosition, (v) => v);
			apply(getVal("luma-dock-extras-drives"), setDockExtrasDrives, readBool);
			apply(getVal("luma-dock-extras-recycle-bin"), setDockExtrasRecycleBin, readBool);
			apply(getVal("luma-dock-task-view"), setDockTaskView, readBool);
			apply(getVal("luma-dock-extras-hidden-drives"), setDockExtrasHiddenDrives, (v) => v);
			apply(getVal("luma-dock-extras-folders"), setDockExtrasFolders, (v) => v);
			apply(getVal("luma-dock-extras-custom-folders"), setDockExtrasCustomFolders, (v) => v);

			apply(getVal("luma-temp-unit"), setTempUnitFahrenheit, (v) => v === "fahrenheit");
			apply(getVal("luma-scale"), setScale, parseFloat);
			apply(getVal("luma-low-battery-threshold"), setLowBatteryThreshold, parseInt);

			apply(getVal("luma-notch-mode"), setNotchMode, (v) => (v === "auto-hide" ? "smart" : v));
			apply(getVal("luma-notch-edge-delay"), setNotchEdgeDelay, parseInt);
			apply(getVal("luma-dock-mode"), setDockMode, (v) => (v === "auto-hide" ? "smart" : v));
			apply(getVal("luma-dock-edge-delay"), setDockEdgeDelay, parseInt);

			const savedCity = getVal("luma-weather-city");
			if (savedCity) setCityName(savedCity);

			apply(getVal("luma-theme-mode"), setThemeMode, (v) => v);
			apply(getVal("luma-theme-color"), setThemeColor, (v) => v);
			apply(getVal("luma-theme-opacity"), setThemeOpacity, parseFloat);
			apply(getVal("luma-theme-saturation"), setThemeSaturation, parseFloat);
			apply(getVal("luma-theme-brightness"), setThemeBrightness, parseFloat);

			const widgetsVal = getVal("luma-status-widgets");
			if (widgetsVal) {
				try {
					const parsed = JSON.parse(widgetsVal);
					if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
						setStatusWidgets(parsed);
					}
				} catch {}
			}
		} catch (e) {
			console.error("Failed to load settings:", e);
		}
	}, []);

	// The file write is authoritative. Serialize controls that change several
	// settings, and update the local mirror only after the backend confirms the
	// write. A failed save reloads the page from persisted values and leaves a
	// visible error instead of keeping an optimistic control value on screen.
	const saveSetting = (key: string, value: string | null): Promise<boolean> => {
		const operation = saveQueue.current.then(async () => {
			if (saveFailed.current) return false;
			try {
				await invoke<void>("save_setting", { key, value });
			} catch (error) {
				console.error(`Failed to save ${key}:`, error);
				saveFailed.current = true;
				sessionStorage.setItem("luma-settings-save-error", "true");
				setSaveError(true);
				window.setTimeout(() => window.location.reload(), 0);
				return false;
			}
			try {
				if (value === null) localStorage.removeItem(key);
				else localStorage.setItem(key, value);
				sessionStorage.removeItem("luma-settings-save-error");
			} catch (error) {
				// The file is saved; a mirror failure must not be reported as a failed write.
				console.warn("Settings mirror update failed:", error);
			}
			setSaveError(false);
			return true;
		});
		saveQueue.current = operation.then(() => {});
		return operation;
	};

	// Coordinates only need the backend settings file. Keep them out of the
	// browser's localStorage mirror while preserving the same queued/error path.
	const saveLocation = (key: "luma-weather-lat" | "luma-weather-lon", value: string | null): Promise<boolean> => {
		const operation = saveQueue.current.then(async () => {
			if (saveFailed.current) return false;
			try {
				await invoke<void>("save_setting", { key, value });
			} catch (error) {
				console.error(`Failed to save ${key}:`, error);
				saveFailed.current = true;
				sessionStorage.setItem("luma-settings-save-error", "true");
				setSaveError(true);
				window.setTimeout(() => window.location.reload(), 0);
				return false;
			}
			try {
				localStorage.removeItem(key);
				sessionStorage.removeItem("luma-settings-save-error");
			} catch (error) {
				console.warn("Settings mirror cleanup failed:", error);
			}
			setSaveError(false);
			return true;
		});
		saveQueue.current = operation.then(() => {});
		return operation;
	};

	const dismissSaveError = () => {
		sessionStorage.removeItem("luma-settings-save-error");
		setSaveError(false);
	};

	// ── Initialize on mount ──
	useEffect(() => {
		loadAllSettings();

		isEnabled()
			.then(setAutostart)
			.catch(() => {});

		getVersion()
			.then((ver) => setAppVersion(ver || "3.1.2"))
			.catch(() => setAppVersion("3.1.2"));

	}, []);

	// ── Sync settings from other windows ──
	useSettingsSync({
		"luma-dock-mode": setDockMode,
		"luma-dock-edge-delay": setDockEdgeDelay,
		"luma-notch-mode": setNotchMode,
		"luma-notch-edge-delay": setNotchEdgeDelay,
		"luma-dock-enabled": setDockEnabled,
		"luma-dock-icon-only": setDockIconOnly,
		"luma-dock-separator-enabled": setDockSeparatorEnabled,
		"luma-start-icon": setStartIcon,
		"luma-dock-preview-enabled": setDockPreviewEnabled,
		"luma-dock-adaptive": setDockAdaptive,
		"luma-dock-win-number-enabled": setDockWinNumberEnabled,
		"luma-dock-extras-position": setDockExtrasPosition,
		"luma-dock-extras-drives": setDockExtrasDrives,
		"luma-dock-extras-recycle-bin": setDockExtrasRecycleBin,
		"luma-dock-task-view": setDockTaskView,
		"luma-dock-extras-hidden-drives": setDockExtrasHiddenDrives,
		"luma-dock-extras-folders": setDockExtrasFolders,
		"luma-dock-extras-custom-folders": setDockExtrasCustomFolders,
		"luma-weather-enabled": setWeatherEnabled,
		"luma-calendar-enabled": setCalendarEnabled,
		"luma-timer-sound-enabled": setTimerSoundEnabled,
		"luma-music-mode-enabled": setMusicModeEnabled,
		"luma-notch-remember-panel": setNotchRememberPanel,
		"luma-notch-over-fullscreen": (v: unknown) => setNotchOverFullscreen(v === "true"),
		"luma-notch-default-panel": (v: unknown) =>
			setNotchDefaultPanel(v === "command-center" ? "command-center" : "calendar"),
		"luma-music-compact-notch": setMusicCompactNotch,
		"luma-media-ambience-enabled": setMediaAmbienceEnabled,
		"luma-media-compact-glow-enabled": setMediaCompactGlowEnabled,
		"luma-media-layout": setMediaLayout,
		"luma-corners-enabled": setCornersEnabled,
		"luma-show-update-indicator": setShowUpdateIndicator,
		"luma-time-format-24h": setTimeFormat24h,
		"luma-low-battery-threshold": setLowBatteryThreshold,
		"luma-scale": setScale,
		"luma-temp-unit": (v) => setTempUnitFahrenheit(v === "fahrenheit"),
		"luma-auto-update": setAutoUpdate,
		"luma-volume-overlay-enabled": setVolumeOverlayEnabled,
		"luma-volume-edge-enabled": setVolumeEdgeEnabled,
		"luma-brightness-overlay-enabled": setBrightnessOverlayEnabled,
		"luma-brightness-edge-enabled": setBrightnessEdgeEnabled,
		"luma-theme-mode": setThemeMode,
		"luma-theme-color": setThemeColor,
		"luma-theme-opacity": setThemeOpacity,
		"luma-theme-saturation": setThemeSaturation,
		"luma-theme-brightness": setThemeBrightness,
		"luma-weather-city": (v) => setCityName(v || "")
	});

	// ── Listen for system accent changes (adaptive theme) ──
	useEffect(() => {
		const unlisten = listen<string>("system-accent-changed", (event) => {
			const mode = localStorage.getItem("luma-theme-mode") || "dark";
			if (mode === "adaptive") {
				try {
					const hsl = hexToHsl(event.payload);
					setThemeSaturation(hsl.s / 100);
					setThemeBrightness(hsl.l / 100);
				} catch (e) {
					console.error("Failed to parse system accent color change HSL:", e);
				}
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// ── City search debounce ──
	useEffect(() => {
		if (cityName.trim().length < 2) {
			setCitySearchResults([]);
			setShowCityDropdown(false);
			return;
		}

		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(
					`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`
				);
				const data = await res.json();
				if (data.results && data.results.length > 0) {
					setCitySearchResults(
						data.results.map((r: any) => ({
							name: r.name,
							country: r.country || "",
							latitude: r.latitude,
							longitude: r.longitude
						}))
					);
					setShowCityDropdown(true);
				} else {
					setCitySearchResults([]);
				}
			} catch {
				setCitySearchResults([]);
			}
		}, 300);

		return () => clearTimeout(timeout);
	}, [cityName]);

	// ── Update checker ──
	const checkForUpdates = async (manual = true) => {
		setUpdateStatus("checking");
		try {
			const result = await invoke<UpdateCheckResult>("check_for_updates", { force: manual });
			if (result?.available) {
				setUpdateStatus("available");
				setUpdateVersion(result?.version ?? "");
			} else {
				setUpdateStatus("uptodate");
			}
		} catch (e) {
			console.error("Updater error:", e);
			setUpdateStatus("error");
		}
	};

	const installUpdate = async () => {
		try {
			setUpdateStatus("downloading");
			await invoke("install_update");
			setUpdateStatus("idle");
		} catch (e) {
			console.error(e);
			setUpdateStatus("error");
		}
	};

	// Reflect install progress triggered from any window (including auto-update).
	useEffect(() => {
		const unlisten = listen<{ status: string; progress?: number }>(
			"auto-update-status",
			(event) => {
				switch (event.payload.status) {
					case "downloading":
						setUpdateStatus("downloading");
						break;
					case "installing":
						setUpdateStatus("installing");
						break;
					case "done":
						setUpdateStatus((prev) =>
							prev === "downloading" || prev === "installing" ? "idle" : prev
						);
						break;
				}
			}
		);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// ── Autostart ──
	const toggleAutostart = async () => {
		try {
			const currentlyEnabled = await isEnabled();
			if (currentlyEnabled) {
				await disable();
				setAutostart(false);
			} else {
				await enable();
				setAutostart(true);
			}
		} catch (err) {}
	};

	// ── Simple boolean toggles ──
	const toggleWeather = () => {
		const next = !weatherEnabled;
		setWeatherEnabled(next);
		saveSetting("luma-weather-enabled", String(next));
	};

	const toggleCalendar = () => {
		const next = !calendarEnabled;
		setCalendarEnabled(next);
		saveSetting("luma-calendar-enabled", String(next));
	};

	const toggleTimerSound = () => {
		const next = !timerSoundEnabled;
		setTimerSoundEnabled(next);
		saveSetting("luma-timer-sound-enabled", String(next));
	};

	const toggleMusicMode = () => {
		const next = !musicModeEnabled;
		setMusicModeEnabled(next);
		saveSetting("luma-music-mode-enabled", String(next));
	};

	const toggleNotchRememberPanel = () => {
		const next = !notchRememberPanel;
		setNotchRememberPanel(next);
		saveSetting("luma-notch-remember-panel", String(next));
	};

	const toggleNotchOverFullscreen = () => {
		const next = !notchOverFullscreen;
		setNotchOverFullscreen(next);
		saveSetting("luma-notch-over-fullscreen", String(next));
	};

	const changeNotchDefaultPanel = (panel: "calendar" | "command-center") => {
		setNotchDefaultPanel(panel);
		saveSetting("luma-notch-default-panel", panel);
	};

	const toggleMusicCompactNotch = () => {
		const next = !musicCompactNotch;
		setMusicCompactNotch(next);
		saveSetting("luma-music-compact-notch", String(next));
	};

	const toggleShelfPersist = () => {
		const next = !shelfPersist;
		setShelfPersist(next);
		saveSetting("luma-shelf-persist", String(next));
	};

	const toggleMediaLayout = (layout: "classic" | "compact") => {
		setMediaLayout(layout);
		saveSetting("luma-media-layout", layout);
	};

	const toggleVolumeOverlay = () => {
		const next = !volumeOverlayEnabled;
		setVolumeOverlayEnabled(next);
		saveSetting("luma-volume-overlay-enabled", String(next));
	};

	const toggleVolumeEdge = () => {
		const next = !volumeEdgeEnabled;
		setVolumeEdgeEnabled(next);
		saveSetting("luma-volume-edge-enabled", String(next));
	};

	const toggleBrightnessOverlay = () => {
		const next = !brightnessOverlayEnabled;
		setBrightnessOverlayEnabled(next);
		saveSetting("luma-brightness-overlay-enabled", String(next));
	};

	const toggleBrightnessEdge = () => {
		const next = !brightnessEdgeEnabled;
		setBrightnessEdgeEnabled(next);
		saveSetting("luma-brightness-edge-enabled", String(next));
	};

	const toggleAmbience = () => {
		const next = !mediaAmbienceEnabled;
		setMediaAmbienceEnabled(next);
		saveSetting("luma-media-ambience-enabled", String(next));
	};

	const toggleCompactGlow = () => {
		const next = !mediaCompactGlowEnabled;
		setMediaCompactGlowEnabled(next);
		saveSetting("luma-media-compact-glow-enabled", String(next));
	};

	const toggleCorners = () => {
		const next = !cornersEnabled;
		setCornersEnabled(next);
		saveSetting("luma-corners-enabled", String(next));
	};

	const toggleUpdateIndicator = () => {
		const next = !showUpdateIndicator;
		setShowUpdateIndicator(next);
		saveSetting("luma-show-update-indicator", String(next));
	};

	const toggleTimeFormat24h = () => {
		const next = !timeFormat24h;
		setTimeFormat24h(next);
		saveSetting("luma-time-format-24h", String(next));
	};

	const toggleTempUnit = () => {
		const next = !tempUnitFahrenheit;
		setTempUnitFahrenheit(next);
		saveSetting("luma-temp-unit", next ? "fahrenheit" : "celsius");
	};

	const toggleDock = () => {
		const next = !dockEnabled;
		setDockEnabled(next);
		saveSetting("luma-dock-enabled", String(next));
	};

	const toggleDockPreview = () => {
		const next = !dockPreviewEnabled;
		setDockPreviewEnabled(next);
		saveSetting("luma-dock-preview-enabled", String(next));
	};

	const toggleDockIconOnly = () => {
		const next = !dockIconOnly;
		setDockIconOnly(next);
		saveSetting("luma-dock-icon-only", String(next));
	};

	const toggleDockSeparator = () => {
		const next = !dockSeparatorEnabled;
		setDockSeparatorEnabled(next);
		saveSetting("luma-dock-separator-enabled", String(next));
	};

	const handleStartIconChange = (icon: string) => {
		setStartIcon(icon);
		saveSetting("luma-start-icon", icon);
	};

	const toggleDockAdaptive = () => {
		const next = !dockAdaptive;
		setDockAdaptive(next);
		saveSetting("luma-dock-adaptive", String(next));
	};

	const toggleDockWinNumber = () => {
		const next = !dockWinNumberEnabled;
		setDockWinNumberEnabled(next);
		saveSetting("luma-dock-win-number-enabled", String(next));
	};

	const handleDockExtrasPositionChange = (position: string) => {
		setDockExtrasPosition(position);
		saveSetting("luma-dock-extras-position", position);
	};

	const toggleDockExtrasDrives = () => {
		const next = !dockExtrasDrives;
		setDockExtrasDrives(next);
		saveSetting("luma-dock-extras-drives", String(next));
	};

	const toggleDockExtrasDrive = (letter: string) => {
		const next = toggleHiddenDrive(dockExtrasHiddenDrives, letter);
		setDockExtrasHiddenDrives(next);
		saveSetting("luma-dock-extras-hidden-drives", next);
	};

	const toggleDockExtrasRecycleBin = () => {
		const next = !dockExtrasRecycleBin;
		setDockExtrasRecycleBin(next);
		saveSetting("luma-dock-extras-recycle-bin", String(next));
	};

	const toggleDockTaskView = () => {
		const next = !dockTaskView;
		setDockTaskView(next);
		saveSetting("luma-dock-task-view", String(next));
	};

	const toggleDockExtraFolder = (id: string) => {
		const next = toggleEnabledFolder(dockExtrasFolders, id);
		setDockExtrasFolders(next);
		saveSetting("luma-dock-extras-folders", next);
	};

	const handleAddDockExtraFolder = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: "Add a folder to the dock",
				directory: true,
				multiple: false
			});
			if (typeof selected === "string") {
				const next = addCustomFolder(dockExtrasCustomFolders, selected);
				setDockExtrasCustomFolders(next);
				saveSetting("luma-dock-extras-custom-folders", next);
			}
		} catch (e) {
			console.error("Folder picker failed:", e);
		}
	};

	const handleRemoveDockExtraFolder = (path: string) => {
		const next = removeCustomFolder(dockExtrasCustomFolders, path);
		setDockExtrasCustomFolders(next);
		saveSetting("luma-dock-extras-custom-folders", next);
	};

	const toggleAutoUpdate = () => {
		const next = !autoUpdate;
		setAutoUpdate(next);
		saveSetting("luma-auto-update", String(next));
	};

	// ── Value setters ──
	const setDockModeValue = (newMode: string) => {
		setDockMode(newMode);
		saveSetting("luma-dock-mode", newMode);
	};

	const setNotchModeValue = (newMode: string) => {
		setNotchMode(newMode);
		saveSetting("luma-notch-mode", newMode);
	};

	const handleDockEdgeDelayChange = (val: number) => {
		setDockEdgeDelay(val);
		saveSetting("luma-dock-edge-delay", val.toString());
	};

	const handleNotchEdgeDelayChange = (val: number) => {
		setNotchEdgeDelay(val);
		saveSetting("luma-notch-edge-delay", val.toString());
	};

	const handleThresholdChange = (val: number) => {
		setLowBatteryThreshold(val);
		saveSetting("luma-low-battery-threshold", val.toString());
	};

	const handleScaleChange = (val: number) => {
		setScale(val);
		saveSetting("luma-scale", val.toString());
	};

	const handleWidgetsChange = (config: WidgetConfig) => {
		setStatusWidgets(config);
		saveSetting("luma-status-widgets", JSON.stringify(config));
	};

	// ── Theme handlers ──
	const handleThemeModeChange = async (mode: string) => {
		setThemeMode(mode);
		saveSetting("luma-theme-mode", mode);

		if (mode === "adaptive") {
			try {
				const accentHex = await invoke<string>("get_system_accent_color");
				const hsl = hexToHsl(accentHex);
				setThemeSaturation(hsl.s / 100);
				saveSetting("luma-theme-saturation", String(hsl.s / 100));
				setThemeBrightness(hsl.l / 100);
				saveSetting("luma-theme-brightness", String(hsl.l / 100));
			} catch (e) {
				console.error("Failed to parse adaptive accent HSL:", e);
			}
		}
	};

	const handleThemeColorChange = (color: string) => {
		setThemeColor(color);
		saveSetting("luma-theme-color", color);

		try {
			const hsl = hexToHsl(color);
			setThemeSaturation(hsl.s / 100);
			saveSetting("luma-theme-saturation", String(hsl.s / 100));
			setThemeBrightness(hsl.l / 100);
			saveSetting("luma-theme-brightness", String(hsl.l / 100));
		} catch (e) {
			console.error("Failed to parse custom color HSL:", e);
		}
	};

	const handleOpacityChange = (value: number) => {
		setThemeOpacity(value);
		saveSetting("luma-theme-opacity", String(value));
	};

	const handleSaturationChange = (value: number) => {
		setThemeSaturation(value);
		saveSetting("luma-theme-saturation", String(value));
	};

	const handleBrightnessChange = (value: number) => {
		setThemeBrightness(value);
		saveSetting("luma-theme-brightness", String(value));
	};

	// ── City search ──
	const selectCity = async (city: {
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}) => {
		setCityName(city.name);
		setShowCityDropdown(false);
		setCitySearchResults([]);
		const saved =
			(await saveLocation("luma-weather-lat", city.latitude.toString())) &&
			(await saveLocation("luma-weather-lon", city.longitude.toString())) &&
			(await saveSetting("luma-weather-city", city.name));
		if (saved) emit("weather-refresh", { lat: city.latitude, lon: city.longitude });
	};

	const handleCityClear = async () => {
		setCityName("");
		setShowCityDropdown(false);
		setCitySearchResults([]);
		const saved =
			(await saveLocation("luma-weather-lat", null)) &&
			(await saveLocation("luma-weather-lon", null)) &&
			(await saveSetting("luma-weather-city", null));
		if (saved) emit("weather-refresh", true);
	};

	// ── Reset to defaults ──
	const resetToDefaults = async () => {
		try {
			const { ask } = await import("@tauri-apps/plugin-dialog");
			const confirmed = await ask(
				"All settings return to their defaults and Luma restarts. Pinned apps and custom icons are kept.",
				{
					title: "Reset Luma to Defaults",
					kind: "warning",
					okLabel: "Reset and Restart",
					cancelLabel: "Cancel"
				}
			);
			if (!confirmed) return;

			await invoke("reset_settings");

			// settings.json is cleared, but every window also caches luma keys
			// in localStorage; drop them so the restart can't resurrect values.
			// The first-run/version sentinels are lifecycle markers, not
			// preferences — keeping them avoids replaying the splash, which
			// would also re-trigger the first-run autostart enable.
			const keep = new Set(["luma-first-run", "luma-app-version"]);
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith("luma-") && !keep.has(key)) localStorage.removeItem(key);
			}

			await invoke("restart_luma").catch(console.error);
		} catch (e) {
			console.error("Reset failed:", e);
		}
	};

	// ── Export / Import ──
	// The backend opens the native dialog and owns the file path, so these
	// cannot be used to read or write arbitrary files from a webview.
	const handleExportSettings = async () => {
		setExportStatus("exporting");
		try {
			const filePath = await invoke<string | null>("export_settings_to_file");
			if (filePath) {
				setExportStatus("success");
				setTimeout(() => setExportStatus("idle"), 2000);
			} else {
				setExportStatus("idle");
			}
		} catch (e) {
			console.error("Export failed:", e);
			setExportStatus("error");
			setTimeout(() => setExportStatus("idle"), 3000);
		}
	};

	const handleImportSettings = async () => {
		setImportStatus("importing");
		try {
			const filePath = await invoke<string | null>("import_settings_from_file");
			if (filePath) {
				await loadAllSettings();
				setImportStatus("success");
				setTimeout(() => setImportStatus("idle"), 2000);
			} else {
				setImportStatus("idle");
			}
		} catch (e) {
			console.error("Import failed:", e);
			setImportStatus("error");
			setTimeout(() => setImportStatus("idle"), 3000);
		}
	};

	return {
		saveError,
		dismissSaveError,
		// System
		autostart,
		toggleAutostart,
		autoUpdate,
		toggleAutoUpdate,
		lowBatteryThreshold,
		handleThresholdChange,
		timeFormat24h,
		toggleTimeFormat24h,
		showUpdateIndicator,
		toggleUpdateIndicator,
		scale,
		handleScaleChange,
		cornersEnabled,
		toggleCorners,

		// Theme
		themeMode,
		handleThemeModeChange,
		themeColor,
		handleThemeColorChange,
		themeOpacity,
		handleOpacityChange,
		themeSaturation,
		handleSaturationChange,
		themeBrightness,
		handleBrightnessChange,

		// Notch
		notchMode,
		setNotchModeValue,
		notchEdgeDelay,
		handleNotchEdgeDelayChange,
		calendarEnabled,
		toggleCalendar,
		timerSoundEnabled,
		toggleTimerSound,
		musicModeEnabled,
		toggleMusicMode,
		notchRememberPanel,
		notchOverFullscreen,
		toggleNotchOverFullscreen,
		toggleNotchRememberPanel,
		notchDefaultPanel,
		changeNotchDefaultPanel,
		musicCompactNotch,
		toggleMusicCompactNotch,
		shelfPersist,
		toggleShelfPersist,
		mediaLayout,
		toggleMediaLayout,
		mediaAmbienceEnabled,
		toggleAmbience,
		mediaCompactGlowEnabled,
		toggleCompactGlow,

		// Weather
		weatherEnabled,
		toggleWeather,
		tempUnitFahrenheit,
		toggleTempUnit,
		cityName,
		setCityName,
		citySearchResults,
		showCityDropdown,
		setShowCityDropdown,
		selectCity,
		handleCityClear,

		// Widgets
		statusWidgets,
		handleWidgetsChange,

		// Dock
		dockEnabled,
		toggleDock,
		dockMode,
		setDockModeValue,
		dockEdgeDelay,
		handleDockEdgeDelayChange,
		dockPreviewEnabled,
		toggleDockPreview,
		dockIconOnly,
		toggleDockIconOnly,
		dockSeparatorEnabled,
		toggleDockSeparator,
		startIcon,
		handleStartIconChange,
		dockAdaptive,
		toggleDockAdaptive,
		dockWinNumberEnabled,
		toggleDockWinNumber,
		dockExtrasPosition,
		handleDockExtrasPositionChange,
		dockExtrasDrives,
		toggleDockExtrasDrives,
		dockExtrasHiddenDrives,
		toggleDockExtrasDrive,
		dockExtrasRecycleBin,
		toggleDockExtrasRecycleBin,
		dockTaskView,
		toggleDockTaskView,
		dockExtrasFolders,
		toggleDockExtraFolder,
		dockExtrasCustomFolders,
		handleAddDockExtraFolder,
		handleRemoveDockExtraFolder,

		// Overlays
		volumeOverlayEnabled,
		toggleVolumeOverlay,
		volumeEdgeEnabled,
		toggleVolumeEdge,
		brightnessOverlayEnabled,
		toggleBrightnessOverlay,
		brightnessEdgeEnabled,
		toggleBrightnessEdge,

		// Updates
		updateStatus,
		updateVersion,
		appVersion,
		checkForUpdates,
		installUpdate,

		// Import / Export
		exportStatus,
		importStatus,
		handleExportSettings,
		handleImportSettings,

		// Utilities
		restartLuma: () => invoke("restart_luma"),
		resetToDefaults,
		quitLuma: () => invoke("quit_luma")
	};
}
