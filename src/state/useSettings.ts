import { useCallback, useEffect, useRef, useState } from "react";
import { useBackend } from "../lib/backend.ts";
import type { Settings } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

export interface SettingsApi {
  settings: Settings;
  /** True once the saved settings have arrived (before that, defaults are shown). */
  loaded: boolean;
  error: string | null;
  update: (patch: Partial<Settings>) => void;
}

export function useSettings(): SettingsApi {
  const backend = useBackend();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(settings);

  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  useEffect(() => {
    let dead = false;
    let off: (() => void) | undefined;
    void backend.getSettings().then((s) => {
      if (dead) return;
      latest.current = s;
      setSettings(s);
      setLoaded(true);
    });
    void backend.onSettings((s) => {
      if (!dead) setSettings(s);
    }).then((u) => {
      if (dead) u();
      else off = u;
    });
    return () => {
      dead = true;
      off?.();
    };
  }, [backend]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setSettings(next); // optimistic: the control reacts at once
      backend
        .updateSettings(next)
        .then((saved) => {
          setError(null);
          setSettings(saved);
        })
        .catch((e: unknown) => {
          setError(typeof e === "string" ? e : "Could not save settings.");
          // The backend refused part of it (e.g. the startup entry); show what is really in force.
          void backend.getSettings().then(setSettings);
        });
    },
    [backend],
  );

  return { settings, loaded, error, update };
}
