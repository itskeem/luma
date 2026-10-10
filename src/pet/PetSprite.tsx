import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { DanceVariant, Mood } from "../lib/pet.ts";

interface PetSpriteProps {
  mood: Mood;
  variant: DanceVariant;
  energy: number;
  /** Accent hex colour from the island theme (e.g. "#8f7bff"). */
  accentHex: string;
  /** Sprite diameter in CSS px. */
  size: number;
  /** Pointer position relative to sprite centre (null when outside window). */
  pointerOffset: { x: number; y: number } | null;
  /** Animation level: "off" | "subtle" | "full" */
  animation: "off" | "subtle" | "full";
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

// ── Eye shapes per mood ───────────────────────────────────────────────────────

type EyeShape = "open" | "happy" | "squint" | "sleepy" | "wide" | "star";

function moodEyes(mood: Mood): EyeShape {
  switch (mood) {
    case "sleeping":  return "sleepy";
    case "idle":      return "open";
    case "grooving":  return "happy";
    case "perk":      return "wide";
    case "focused":   return "squint";
    case "break":     return "happy";
    case "celebrate": return "star";
    case "happy":     return "star";
    case "carried":   return "wide";
  }
}

function Eye({ shape, cx, cy, r, accentHex }: { shape: EyeShape; cx: number; cy: number; r: number; accentHex: string }) {
  const [h] = hexToHsl(accentHex);
  const pupilColor = `hsl(${h} 80% 25%)`;

  switch (shape) {
    case "sleepy":
      return <path d={`M${cx - r} ${cy} Q${cx} ${cy - r * 0.3} ${cx + r} ${cy}`} stroke="white" strokeWidth={r * 0.35} fill="none" strokeLinecap="round" opacity={0.9} />;
    case "squint":
      return (
        <g>
          <line x1={cx - r * 0.9} y1={cy} x2={cx + r * 0.9} y2={cy} stroke="white" strokeWidth={r * 0.3} strokeLinecap="round" opacity={0.9} />
        </g>
      );
    case "wide":
      return (
        <g>
          <circle cx={cx} cy={cy} r={r * 1.1} fill="white" opacity={0.95} />
          <circle cx={cx} cy={cy} r={r * 0.55} fill={pupilColor} />
        </g>
      );
    case "star":
      // Sparkle-style eye: 4-point star
      return (
        <g>
          <polygon
            points={`${cx},${cy - r} ${cx + r * 0.3},${cy - r * 0.3} ${cx + r},${cy} ${cx + r * 0.3},${cy + r * 0.3} ${cx},${cy + r} ${cx - r * 0.3},${cy + r * 0.3} ${cx - r},${cy} ${cx - r * 0.3},${cy - r * 0.3}`}
            fill="white"
            opacity={0.95}
          />
        </g>
      );
    case "happy":
      return <path d={`M${cx - r} ${cy - r * 0.2} Q${cx} ${cy + r * 0.9} ${cx + r} ${cy - r * 0.2}`} stroke="white" strokeWidth={r * 0.35} fill="none" strokeLinecap="round" opacity={0.95} />;
    case "open":
    default:
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="white" opacity={0.92} />
          <circle cx={cx + r * 0.18} cy={cy - r * 0.18} r={r * 0.48} fill={pupilColor} />
          <circle cx={cx + r * 0.1} cy={cy - r * 0.35} r={r * 0.14} fill="white" opacity={0.7} />
        </g>
      );
  }
}

// ── Ribbon tail ───────────────────────────────────────────────────────────────

function Ribbon({ accentHex, size, mood }: { accentHex: string; size: number; mood: Mood }) {
  const [h, s] = hexToHsl(accentHex);
  const col1 = `hsl(${h} ${s * 0.8}% 70%)`;
  const col2 = `hsl(${(h + 20) % 360} ${s * 0.6}% 55%)`;
  const w = size * 0.22;
  const len = size * 0.38;
  const sway = mood === "grooving" || mood === "celebrate" ? size * 0.08 : 0;
  return (
    <svg width={w * 3} height={len} style={{ position: "absolute", bottom: `-${len * 0.55}px`, left: "50%", transform: "translateX(-50%)", overflow: "visible" }}>
      <defs>
        <linearGradient id="rib" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col1} stopOpacity={0.9} />
          <stop offset="1" stopColor={col2} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      {/* Left ribbon strand */}
      <path d={`M${w * 1.5} 0 Q${w * 1.5 - sway} ${len * 0.5} ${w * 0.6} ${len}`} stroke="url(#rib)" strokeWidth={w * 0.55} fill="none" strokeLinecap="round" />
      {/* Right ribbon strand */}
      <path d={`M${w * 1.5} 0 Q${w * 1.5 + sway} ${len * 0.5} ${w * 2.4} ${len}`} stroke="url(#rib)" strokeWidth={w * 0.55} fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ── Sparkles (happy/celebrate) ────────────────────────────────────────────────

function Sparkles({ accentHex, size }: { accentHex: string; size: number }) {
  const [h] = hexToHsl(accentHex);
  const sparks = [
    { angle: 30,  dist: 0.72, color: `hsl(${h} 90% 75%)`, delay: 0 },
    { angle: 110, dist: 0.68, color: `hsl(${(h + 40) % 360} 90% 78%)`, delay: 80 },
    { angle: 210, dist: 0.75, color: `hsl(${(h + 20) % 360} 85% 72%)`, delay: 160 },
    { angle: 300, dist: 0.65, color: `hsl(${(h + 60) % 360} 90% 80%)`, delay: 240 },
    { angle: 160, dist: 0.80, color: `hsl(${(h + 80) % 360} 80% 74%)`, delay: 60 },
  ];
  return (
    <>
      {sparks.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        const dx = Math.cos(rad) * size * s.dist * 0.5;
        const dy = Math.sin(rad) * size * s.dist * 0.5;
        return (
          <div
            key={i}
            className="pet-sparkle"
            style={{
              left: "50%",
              top: "50%",
              background: s.color,
              "--dx": `${dx}px`,
              "--dy": `${dy}px`,
              animationDelay: `${s.delay}ms`,
            } as CSSProperties}
          />
        );
      })}
    </>
  );
}

// ── Main sprite ───────────────────────────────────────────────────────────────

const DANCE_ANIMS: Record<DanceVariant, string> = {
  0: "pet-bob 0.65s ease-in-out infinite",
  1: "pet-sway 0.8s ease-in-out infinite",
  2: "pet-bounce 0.55s ease-in-out infinite",
  3: "pet-spin-sway 0.9s ease-in-out infinite",
};

function orbAnimation(mood: Mood, variant: DanceVariant, animation: string, energy: number): string | undefined {
  if (animation === "off") return undefined;
  const dur = (base: number) => `${(base / Math.max(0.4, energy)).toFixed(2)}s`;
  switch (mood) {
    case "sleeping":  return `pet-breathe ${dur(3.5)} ease-in-out infinite`;
    case "idle":      return animation === "full" ? `pet-breathe ${dur(2.8)} ease-in-out infinite` : undefined;
    case "grooving":  return animation === "full" ? DANCE_ANIMS[variant] : `pet-breathe ${dur(2.4)} ease-in-out infinite`;
    case "perk":      return `pet-perk 600ms ease both`;
    case "focused":   return `pet-focus-breathe ${dur(4)} ease-in-out infinite`;
    case "break":     return `pet-stretch ${dur(2.2)} ease-in-out infinite`;
    case "celebrate": return `pet-hop 600ms ease infinite`;
    case "happy":     return `pet-squish 500ms ease both`;
    case "carried":   return `pet-dangle 1.2s ease-in-out infinite`;
  }
}

export function PetSprite({ mood, variant, energy, accentHex, size, pointerOffset, animation }: PetSpriteProps) {
  const [h, s, l] = hexToHsl(accentHex);
  const orbColor = `hsl(${h} ${Math.round(s * 0.85)}% ${Math.round(l * 0.55 + 12)}%)`;
  const highColor = `hsl(${(h + 30) % 360} ${Math.round(s * 0.6)}% ${Math.round(l * 0.75 + 15)}%)`;
  const glowColor = `hsl(${h} ${Math.round(s)}% ${Math.round(l * 0.8 + 10)}%)`;
  const glowOpacity = mood === "sleeping" ? 0.18 : mood === "grooving" || mood === "celebrate" ? 0.55 : 0.38;

  // Eye position: follows pointer when inside window
  const eyeAngle = pointerOffset
    ? Math.atan2(pointerOffset.y, pointerOffset.x)
    : 0;
  const eyeDist = pointerOffset ? Math.min(Math.hypot(pointerOffset.x, pointerOffset.y) / (size * 0.8), 1) : 0;
  const eyeOffX = Math.cos(eyeAngle) * eyeDist * 2.5;
  const eyeOffY = Math.sin(eyeAngle) * eyeDist * 2.5;

  const eyeShape = moodEyes(mood);
  const eyeR = size * 0.084;
  const leftCx = size * 0.36 + eyeOffX;
  const leftCy = size * 0.42 + eyeOffY;
  const rightCx = size * 0.64 + eyeOffX;
  const rightCy = size * 0.42 + eyeOffY;

  const anim = orbAnimation(mood, variant, animation, energy);

  const isSleeping = mood === "sleeping";
  const isHappy = mood === "happy" || mood === "celebrate";

  // Mouth shape
  const mouthY = size * 0.60;
  const mouthCx = size * 0.5;
  const mouthW = size * 0.18;
  const mouthPath = useMemo(() => {
    if (mood === "focused") return `M${mouthCx - mouthW} ${mouthY} L${mouthCx + mouthW} ${mouthY}`;
    if (mood === "sleeping") return `M${mouthCx - mouthW * 0.7} ${mouthY} Q${mouthCx} ${mouthY + mouthW * 0.5} ${mouthCx + mouthW * 0.7} ${mouthY}`;
    if (isHappy || mood === "break") return `M${mouthCx - mouthW} ${mouthY - mouthW * 0.2} Q${mouthCx} ${mouthY + mouthW * 0.9} ${mouthCx + mouthW} ${mouthY - mouthW * 0.2}`;
    // default: small smile
    return `M${mouthCx - mouthW * 0.7} ${mouthY} Q${mouthCx} ${mouthY + mouthW * 0.55} ${mouthCx + mouthW * 0.7} ${mouthY}`;
  }, [mood, mouthCx, mouthY, mouthW, isHappy]);

  return (
    <div
      className="pet-orb"
      style={{
        width: size,
        height: size,
        animation: anim,
      }}
      data-mood={mood}
    >
      {/* Glow ring */}
      <div
        className="pet-glow"
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          opacity: glowOpacity,
          transition: "opacity 600ms ease",
        }}
      />

      {/* SVG orb body + face */}
      <svg
        className="pet-body"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="orb-grad" cx="38%" cy="32%" r="62%">
            <stop offset="0%" stopColor={highColor} stopOpacity={0.95} />
            <stop offset="45%" stopColor={orbColor} stopOpacity={1} />
            <stop offset="100%" stopColor={`hsl(${h} ${Math.round(s * 0.9)}% ${Math.round(l * 0.28)}%)`} stopOpacity={1} />
          </radialGradient>
          <radialGradient id="orb-sheen" cx="30%" cy="25%" r="45%">
            <stop offset="0%" stopColor="white" stopOpacity={0.28} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Main sphere */}
        <circle cx={size / 2} cy={size / 2} r={size * 0.46} fill="url(#orb-grad)" />
        {/* Sheen highlight */}
        <ellipse cx={size * 0.40} cy={size * 0.33} rx={size * 0.22} ry={size * 0.14} fill="url(#orb-sheen)" />

        {/* Eyes — blink animation on the group when idle */}
        <g style={mood === "idle" && animation !== "off" ? { animation: "pet-blink 4s ease-in-out infinite" } : {}}>
          <Eye shape={eyeShape} cx={leftCx} cy={leftCy} r={eyeR} accentHex={accentHex} />
          <Eye shape={eyeShape} cx={rightCx} cy={rightCy} r={eyeR} accentHex={accentHex} />
        </g>

        {/* Mouth */}
        <path d={mouthPath} stroke="white" strokeWidth={size * 0.028} fill="none" strokeLinecap="round" opacity={0.88} />

        {/* Cheek blush (grooving/celebrate/happy) */}
        {(mood === "grooving" || mood === "celebrate" || mood === "happy" || mood === "break") && (
          <>
            <ellipse cx={size * 0.28} cy={size * 0.55} rx={size * 0.09} ry={size * 0.055} fill={`hsl(${h} 90% 75%)`} opacity={0.38} />
            <ellipse cx={size * 0.72} cy={size * 0.55} rx={size * 0.09} ry={size * 0.055} fill={`hsl(${h} 90% 75%)`} opacity={0.38} />
          </>
        )}
      </svg>

      {/* Z floaters for sleeping */}
      {isSleeping && animation !== "off" && (
        <>
          <span className="pet-z" style={{ color: `hsl(${h} 70% 80%)` }}>z</span>
          <span className="pet-z" style={{ color: `hsl(${h} 65% 75%)`, animationDelay: "1s" }}>z</span>
          <span className="pet-z" style={{ color: `hsl(${h} 60% 72%)`, animationDelay: "2s" }}>z</span>
        </>
      )}

      {/* Sparkles for happy/celebrate */}
      {isHappy && <Sparkles accentHex={accentHex} size={size} />}

      {/* Ribbon tail */}
      <Ribbon accentHex={accentHex} size={size} mood={mood} />
    </div>
  );
}
