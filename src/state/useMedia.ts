import { useEffect, useState } from "react";
import { useBackend } from "../lib/backend.ts";
import { accentFromImage, type Accent } from "../lib/color.ts";
import { positionNow } from "../lib/format.ts";
import type { ActiveMedia, MediaState } from "../types.ts";

const EMPTY: MediaState = { available: true, error: null, active: null, players: [], pinnedId: null };

export interface MediaView {
  state: MediaState;
  /** False until the first state has arrived, so "nothing playing" doesn't flash at launch. */
  ready: boolean;
  artworkUrl: string | null;
  accent: Accent | null;
}

export function useMedia(): MediaView {
  const backend = useBackend();
  const [state, setState] = useState<MediaState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [art, setArt] = useState<{ id: string; url: string } | null>(null);
  const [accentFor, setAccentFor] = useState<{ url: string; accent: Accent | null } | null>(null);

  useEffect(() => {
    let dead = false;
    let off: (() => void) | undefined;
    // Subscribe first, then read: an event between the two can only make the state newer.
    void backend.onMediaState((s) => {
      if (dead) return;
      setState(s);
      setReady(true);
    }).then((u) => {
      if (dead) u();
      else off = u;
    });
    void backend.getMediaState().then((s) => {
      if (dead) return;
      setState((cur) => (cur === EMPTY ? s : cur));
      setReady(true);
    });
    return () => {
      dead = true;
      off?.();
    };
  }, [backend]);

  const artworkId = state.active?.track.artworkId ?? null;
  useEffect(() => {
    if (!artworkId) return;
    let dead = false;
    void backend.getArtwork(artworkId).then((url) => {
      if (!dead && url) setArt({ id: artworkId, url });
    });
    return () => {
      dead = true;
    };
  }, [backend, artworkId]);

  // While a new image loads, the previous one stays; with no artwork id there is none.
  const artworkUrl = artworkId ? (art?.url ?? null) : null;

  useEffect(() => {
    if (!artworkUrl) return;
    let dead = false;
    void accentFromImage(artworkUrl).then((accent) => {
      if (!dead) setAccentFor({ url: artworkUrl, accent });
    });
    return () => {
      dead = true;
    };
  }, [artworkUrl]);

  const accent = artworkUrl && accentFor?.url === artworkUrl ? accentFor.accent : null;
  return { state, ready, artworkUrl, accent };
}

/** The playback position, advancing while the track plays. Idle (no timer) when not `enabled`. */
export function usePosition(active: ActiveMedia | null, enabled: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  const playing = active?.status === "playing";
  const timeline = active?.timeline ?? null;

  useEffect(() => {
    if (!enabled || !playing || !timeline) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [enabled, playing, timeline]);

  return timeline ? positionNow(timeline, playing, now) : null;
}
