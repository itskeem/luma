import { useEffect, useState } from "react";
import orb from "../assets/luma-orb.png";
import { NoteIcon } from "./icons.tsx";

interface Layer {
  key: number;
  src: string;
}

/**
 * Album art with a cross-fade when the image changes: the new image fades in
 * over the old one, which is removed once covered.
 */
export function Artwork({ src, size, brand = false }: { src: string | null; size: number; brand?: boolean }) {
  const [layers, setLayers] = useState<Layer[]>(src ? [{ key: 0, src }] : []);
  const [shown, setShown] = useState(src);
  // An image the webview can't decode must not leave a blank square behind.
  const [broken, setBroken] = useState<string | null>(null);

  if (src !== shown) {
    setShown(src);
    setLayers((prev) => (src ? [...prev.slice(-1), { key: (prev.at(-1)?.key ?? 0) + 1, src }] : []));
  }

  useEffect(() => {
    if (layers.length < 2) return;
    const id = window.setTimeout(() => setLayers((l) => l.slice(-1)), 460);
    return () => window.clearTimeout(id);
  }, [layers]);

  return (
    <div className="art" style={{ width: size, height: size }}>
      {layers.length === 0 || (broken !== null && layers.at(-1)?.src === broken) ? (
        <div className="art-empty">
          {brand ? <img src={orb} alt="" draggable={false} /> : <NoteIcon />}
        </div>
      ) : (
        layers.map((l) => (
          <img key={l.key} className="art-img" src={l.src} alt="" draggable={false} onError={() => setBroken(l.src)} />
        ))
      )}
    </div>
  );
}
