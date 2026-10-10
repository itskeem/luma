// Accent colour from album artwork: the most colourful hue, tuned to read on a dark surface.

export interface Accent {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
  hex: string;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const BUCKETS = 24;

/**
 * Picks the dominant *colourful* hue from RGBA pixels. Near-black, near-white
 * and grey pixels are ignored; if nothing colourful is left (greyscale art)
 * the result is null and the caller keeps the theme's own accent.
 */
export function accentFromPixels(data: ArrayLike<number>): Accent | null {
  const weight = new Float64Array(BUCKETS);
  const sumS = new Float64Array(BUCKETS);
  const sumL = new Float64Array(BUCKETS);
  const sumX = new Float64Array(BUCKETS);
  const sumY = new Float64Array(BUCKETS);
  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 200) continue;
    const [h, s, l] = rgbToHsl(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    if (s < 0.2 || l < 0.1 || l > 0.93) continue;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (w <= 0) continue;
    const b = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS));
    weight[b]! += w;
    sumS[b]! += s * w;
    sumL[b]! += l * w;
    const rad = (h * Math.PI) / 180;
    sumX[b]! += Math.cos(rad) * w;
    sumY[b]! += Math.sin(rad) * w;
  }
  let best = -1;
  let bestW = 0;
  let total = 0;
  for (let b = 0; b < BUCKETS; b++) {
    total += weight[b]!;
    if (weight[b]! > bestW) {
      bestW = weight[b]!;
      best = b;
    }
  }
  // Too little colour overall (a few stray pixels in a grey cover) is not a signal.
  const pixels = data.length / 4;
  if (best < 0 || total < pixels * 0.02) return null;
  let h = (Math.atan2(sumY[best]!, sumX[best]!) * 180) / Math.PI;
  if (h < 0) h += 360;
  const s = Math.min(0.85, Math.max(0.5, sumS[best]! / bestW));
  const l = Math.min(0.68, Math.max(0.56, sumL[best]! / bestW));
  return { h, s, l, hex: hslToHex(h, s, l) };
}

/** Decodes an image URL (data: URLs only in practice) and extracts its accent. */
export async function accentFromImage(url: string): Promise<Accent | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const size = 32; // plenty for a dominant hue, cheap to scan
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    return accentFromPixels(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return null;
  }
}
