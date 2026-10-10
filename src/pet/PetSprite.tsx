import type { CSSProperties, Ref } from "react";
import { useEffect, useState } from "react";
import { rgbToHsl } from "../lib/color.ts";
import type { DanceVariant, Mood } from "../lib/pet.ts";
import { DANCE_FADE_OUT_MS, danceCycleSeconds, danceMoves } from "../lib/pet.ts";

/**
 * Luma's pet: a small flat sphere with the logo's ribbon wrapped round it as a thin
 * orbit. No mouth and no decoration; it speaks entirely with its eyes and its body.
 *
 * Everything is drawn in a 100 × 100 box and scaled, so one drawing serves every size.
 */
interface PetSpriteProps {
  mood: Mood;
  variant: DanceVariant;
  /** Theme accent, "#rrggbb". */
  accentHex: string;
  /** Sprite side in CSS px. */
  size: number;
  animation: "off" | "subtle" | "full";
  /** A blink is in progress. */
  blinking: boolean;
  /** The window sets --lx / --ly on this element to aim the eyes (no React renders per pointer move). */
  rootRef: Ref<HTMLDivElement>;
}

const INK = "#1b1626";
const LEFT = { x: 35, y: 49 };
const RIGHT = { x: 65, y: 49 };

function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255)[0];
}

type Eyes = "open" | "wide" | "joy" | "closed" | "lidded" | "cross" | "spiral";

function eyesFor(mood: Mood): Eyes {
  switch (mood) {
    case "sleeping": return "closed";
    case "grooving":
    case "break":
    case "celebrate": return "joy";
    case "perk":
    case "carried": return "wide";
    case "focused": return "lidded";
    case "annoyed": return "cross";
    case "dizzy": return "spiral";
    case "idle":
    case "hello": return "open";
  }
}

function spiralPath(cx: number, cy: number): string {
  let d = "";
  for (let i = 0; i <= 44; i++) {
    const a = i * 0.36;
    const r = 0.4 + a * 0.46;
    d += `${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)} `;
  }
  return d;
}

function Eye({ kind, at, side, blinking }: { kind: Eyes; at: { x: number; y: number }; side: -1 | 1; blinking: boolean }) {
  const { x, y } = at;
  const stroke = { stroke: INK, strokeWidth: 3, fill: "none", strokeLinecap: "round" } as const;
  const blink = blinking && (kind === "open" || kind === "wide" || kind === "lidded" || kind === "cross");
  switch (kind) {
    case "joy":
      return <path d={`M${x - 6.8} ${y + 2.6} Q${x} ${y - 7.8} ${x + 6.8} ${y + 2.6}`} {...stroke} />;
    case "closed":
      return <path d={`M${x - 6.8} ${y - 1} Q${x} ${y + 5.4} ${x + 6.8} ${y - 1}`} {...stroke} strokeWidth={2.8} />;
    case "spiral":
      return <path className="pet-spiral" d={spiralPath(x, y)} stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case "lidded":
      // Half a disc under a flat lid: calm, concentrating.
      return (
        <g className={blink ? "pet-eye is-blinking" : "pet-eye"}>
          <path d={`M${x - 6.9} ${y - 1.4} L${x + 6.9} ${y - 1.4} A6.9 7.6 0 0 1 ${x - 6.9} ${y - 1.4} Z`} fill={INK} />
        </g>
      );
    case "cross":
      // Open eyes under brows that slant down toward the middle.
      return (
        <g>
          <g className={blink ? "pet-eye is-blinking" : "pet-eye"}>
            <ellipse cx={x} cy={y + 1.5} rx={5.8} ry={6.6} fill={INK} />
            <circle cx={x + 1.7} cy={y - 0.6} r={1.6} fill="#fff" />
          </g>
          <path d={`M${x - side * 8} ${y - 11.5} L${x + side * 6} ${y - 6.4}`} {...stroke} strokeWidth={3.4} />
        </g>
      );
    case "wide":
    case "open": {
      const w = kind === "wide";
      return (
        <g className={blink ? "pet-eye is-blinking" : "pet-eye"}>
          <ellipse cx={x} cy={y} rx={w ? 7.6 : 6.6} ry={w ? 9.4 : 8} fill={INK} />
          <circle cx={x + 2.2} cy={y - 2.8} r={w ? 2.5 : 2.1} fill="#fff" />
        </g>
      );
    }
  }
}

export function PetSprite({ mood, variant, accentHex, size, animation, blinking, rootRef }: PetSpriteProps) {
  const h = hueOf(accentHex);
  const top = `hsl(${h} 72% 67%)`;
  const bottom = `hsl(${(h + 16) % 360} 60% 47%)`;
  const ribbon = `hsl(${(h + 28) % 360} 88% 87%)`;

  const grooving = mood === "grooving";
  // The dance keeps running a moment after the music stops so it can fade out.
  const [danceOn, setDanceOn] = useState(grooving);
  if (grooving && !danceOn) setDanceOn(true);
  useEffect(() => {
    if (grooving || !danceOn) return;
    const id = window.setTimeout(() => setDanceOn(false), DANCE_FADE_OUT_MS + 120);
    return () => window.clearTimeout(id);
  }, [grooving, danceOn]);

  const moves = danceMoves(variant);
  const style = {
    width: size,
    height: size,
    "--lift": `${(moves.lift * size).toFixed(1)}px`,
    "--sway": `${moves.sway}deg`,
    "--cycle": `${danceCycleSeconds().toFixed(4)}s`,
    "--dance-target": animation === "subtle" ? 0.5 : 1,
  } as CSSProperties;

  const kind = eyesFor(mood);
  const sleeping = mood === "sleeping";

  return (
    <div
      ref={rootRef}
      className="pet"
      style={style}
      data-mood={mood}
      data-motion={animation}
      data-groove={grooving}
      data-dance={danceOn}
    >
      <div className="pet-anim">
        <div className="pet-lean">
          <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="pet-body" x1="0.2" y1="0.05" x2="0.8" y2="1">
                <stop offset="0" stopColor={top} />
                <stop offset="1" stopColor={bottom} />
              </linearGradient>
            </defs>
            {/* The ribbon's far side, behind the body */}
            <g transform="translate(50 56) rotate(-16)">
              <path d="M-50 0 A50 13 0 0 1 50 0" stroke={ribbon} strokeWidth={3.2} fill="none" strokeLinecap="round" opacity={0.55} />
            </g>
            <circle cx={50} cy={52} r={40} fill="url(#pet-body)" />
            {/* ...and its near side, across the front */}
            <g transform="translate(50 56) rotate(-16)">
              <path d="M-50 0 A50 13 0 0 0 50 0" stroke={ribbon} strokeWidth={3.2} fill="none" strokeLinecap="round" opacity={0.92} />
            </g>
            <g className="pet-face">
              <Eye kind={kind} at={LEFT} side={-1} blinking={blinking} />
              <Eye kind={kind} at={RIGHT} side={1} blinking={blinking} />
            </g>
          </svg>
        </div>
      </div>
      {sleeping && animation !== "off" && (
        <>
          <span className="pet-z" style={{ color: ribbon }}>z</span>
          <span className="pet-z" style={{ color: ribbon, animationDelay: "1.4s" }}>z</span>
        </>
      )}
    </div>
  );
}
