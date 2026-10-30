// Draws Lumi: a soft jelly-bean body with a glowing bulb on a bendy stalk. Pure
// canvas code, no images, so the character scales cleanly from a 28 px island
// bubble to a large panel portrait and can be recoloured and dressed at will.
//
// The drawing space is 100 x 100 "units" with the body resting around (50, 57).
// Everything is expressed relative to that, then scaled to the canvas.

import { BULB_CORE, EYE_COLOR, PALETTES, type PetPalette } from "./palette";
import type { PetColor, PetOutfit } from "./types";

/** Continuous face parameters; the engine eases these toward each expression. */
export interface FaceParams {
	/** 0 closed .. 1 normal .. 1.3 wide. */
	eyeOpen: number;
	/** 0 round eyes .. 1 happy "^" arcs. */
	eyeArc: number;
	/** -1 worried (outer lids low) .. 0 flat .. 1 annoyed (inner lids low). */
	lidTilt: number;
	/** 0 awake .. 1 heavy lids. */
	lidDroop: number;
	/** Highlight size multiplier. */
	pupil: number;
	/** 0 closed mouth .. 1 wide open. */
	mouthOpen: number;
	/** -1 frown .. 1 smile. */
	mouthCurve: number;
	cheek: number;
	/** 0..1 raised eyebrow on the left eye. */
	brow: number;
	/** 0..1 spiral eyes (dizzy). */
	spiral: number;
	/** 0..1 eyes closed as peaceful downward arcs (asleep). */
	closedArc: number;
}

export interface Pose {
	squashX: number;
	squashY: number;
	/** Vertical offset in units; negative is up. */
	offsetY: number;
	/** Whole-body tilt in radians. */
	tilt: number;
	/** -1..1 breathing phase. */
	breath: number;
	gazeX: number;
	gazeY: number;
	/** 0 open .. 1 shut, from the blink timer. */
	blink: number;
	face: FaceParams;
	/** -1..1 lateral sway of the bulb stalk. */
	bulbSway: number;
	/** 0..1.5; how brightly the bulb and aura glow. */
	glow: number;
	armL: number;
	armR: number;
	footL: number;
	footR: number;
}

export type ParticleKind = "heart" | "confetti" | "sparkle" | "note" | "zzz" | "anger" | "star";

export interface Particle {
	kind: ParticleKind;
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	max: number;
	size: number;
	rot: number;
	vr: number;
	color: string;
	/** Orbiting stars circle (cx, cy) instead of drifting. */
	orbit?: { r: number; speed: number; phase: number };
}

export interface DrawOptions {
	size: number;
	pose: Pose;
	color: PetColor;
	outfit: PetOutfit;
	particles: Particle[];
	/** Ground shadow under the feet (off inside the island). */
	shadow?: boolean;
	/** Time in seconds, for shimmer effects. */
	time: number;
}

export const NEUTRAL_FACE: FaceParams = {
	eyeOpen: 1,
	eyeArc: 0,
	lidTilt: 0,
	lidDroop: 0,
	pupil: 1,
	mouthOpen: 0,
	mouthCurve: 0.35,
	cheek: 0.35,
	brow: 0,
	spiral: 0,
	closedArc: 0
};

export const NEUTRAL_POSE: Pose = {
	squashX: 1,
	squashY: 1,
	offsetY: 0,
	tilt: 0,
	breath: 0,
	gazeX: 0,
	gazeY: 0,
	blink: 0,
	face: { ...NEUTRAL_FACE },
	bulbSway: 0,
	glow: 0.6,
	armL: 0.5,
	armR: 0.5,
	footL: 0,
	footR: 0
};

const BODY_W = 58;
const BODY_H = 52;
const BODY_CY = 62;
const FOOT_Y = BODY_H / 2;

export function drawLumi(ctx: CanvasRenderingContext2D, o: DrawOptions) {
	const { size, pose } = o;
	const palette = PALETTES[o.color];
	const k = size / 100;

	ctx.save();
	ctx.clearRect(0, 0, size, size);
	ctx.scale(k, k);
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	const lift = Math.max(0, -pose.offsetY);
	if (o.shadow) drawShadow(ctx, lift);
	drawAura(ctx, palette, pose.glow, o.time);

	// Body space: origin at the body centre, squashed about the feet so the
	// character stays planted when it compresses or stretches.
	ctx.save();
	ctx.translate(50, BODY_CY + pose.offsetY);
	ctx.rotate(pose.tilt);
	const breath = 1 + pose.breath * 0.012;
	ctx.translate(0, FOOT_Y);
	ctx.scale(pose.squashX * breath, pose.squashY / breath);
	ctx.translate(0, -FOOT_Y);

	drawBulb(ctx, palette, pose);
	drawFeet(ctx, palette, pose);
	drawArms(ctx, palette, pose);
	drawBody(ctx, palette);
	drawFace(ctx, palette, pose);
	drawOutfit(ctx, palette, o.outfit, pose);
	ctx.restore();

	drawParticles(ctx, o.particles);
	ctx.restore();
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function drawShadow(ctx: CanvasRenderingContext2D, lift: number) {
	const s = Math.max(0.55, 1 - lift / 40);
	ctx.save();
	ctx.fillStyle = `rgba(20, 10, 40, ${0.16 * s})`;
	ctx.beginPath();
	ctx.ellipse(50, BODY_CY + FOOT_Y + 3, 22 * s, 4.2 * s, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawAura(ctx: CanvasRenderingContext2D, p: PetPalette, glow: number, time: number) {
	// Two-sine shimmer for a more organic breathing feel.
	const pulse = 0.5 + 0.5 * Math.sin(time * 1.6) * (0.75 + 0.25 * Math.sin(time * 2.7));
	const alpha = Math.min(0.58, 0.12 + glow * 0.18 + pulse * 0.05);
	const g = ctx.createRadialGradient(50, BODY_CY - 4, 6, 50, BODY_CY - 4, 42);
	g.addColorStop(0, withAlpha(p.glow, alpha));
	g.addColorStop(0.6, withAlpha(p.glow, alpha * 0.4));
	g.addColorStop(1, withAlpha(p.glow, 0));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 100, 100);
}

function bodyPath(ctx: CanvasRenderingContext2D) {
	const w = BODY_W / 2;
	const h = BODY_H / 2;
	ctx.beginPath();
	ctx.moveTo(0, -h);
	ctx.bezierCurveTo(w * 0.72, -h, w, -h * 0.44, w, h * 0.12);
	ctx.bezierCurveTo(w, h * 0.76, w * 0.68, h, 0, h);
	ctx.bezierCurveTo(-w * 0.68, h, -w, h * 0.76, -w, h * 0.12);
	ctx.bezierCurveTo(-w, -h * 0.44, -w * 0.72, -h, 0, -h);
	ctx.closePath();
}

function drawBody(ctx: CanvasRenderingContext2D, p: PetPalette) {
	bodyPath(ctx);
	const g = ctx.createRadialGradient(-10, -14, 4, 0, 4, 40);
	g.addColorStop(0, p.light);
	g.addColorStop(0.45, p.base);
	g.addColorStop(1, p.dark);
	ctx.fillStyle = g;
	ctx.fill();

	// Soft top-left sheen.
	ctx.save();
	bodyPath(ctx);
	ctx.clip();
	ctx.fillStyle = "rgba(255,255,255,0.22)";
	ctx.beginPath();
	ctx.ellipse(-10, -17, 14, 6.5, -0.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	// Rim light: a thin arc on the opposite side of the highlight for depth.
	ctx.save();
	bodyPath(ctx);
	ctx.clip();
	ctx.strokeStyle = "rgba(255,255,255,0.16)";
	ctx.lineWidth = 2.2;
	ctx.beginPath();
	ctx.arc(13, 8, 26, 0.6, 2.1);
	ctx.stroke();
	ctx.restore();
}

function drawBulb(ctx: CanvasRenderingContext2D, p: PetPalette, pose: Pose) {
	const top = -BODY_H / 2 + 3;
	const tipX = pose.bulbSway * 9 + 1;
	const tipY = top - 15 + Math.abs(pose.bulbSway) * 1.5;
	ctx.strokeStyle = p.dark;
	ctx.lineWidth = 2.4;
	ctx.beginPath();
	ctx.moveTo(0, top);
	ctx.quadraticCurveTo(-3 + pose.bulbSway * 3, top - 9, tipX, tipY);
	ctx.stroke();

	// Rounded tail-nub at the base of the stalk — subtle tail-wag feel.
	const nubX = pose.bulbSway * -2.5;
	const nubY = top + 2.5;
	ctx.fillStyle = p.dark;
	ctx.beginPath();
	ctx.ellipse(nubX, nubY, 3.2, 2.2, pose.bulbSway * 0.5, 0, Math.PI * 2);
	ctx.fill();

	const glow = Math.max(0, pose.glow);
	const gr = 7 + glow * 9;
	const g = ctx.createRadialGradient(tipX, tipY, 1, tipX, tipY, gr);
	g.addColorStop(0, withAlpha(BULB_CORE, 0.95));
	g.addColorStop(0.35, withAlpha(p.glow, 0.55 * Math.min(1, glow + 0.2)));
	g.addColorStop(1, withAlpha(p.glow, 0));
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(tipX, tipY, gr, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = BULB_CORE;
	ctx.beginPath();
	ctx.arc(tipX, tipY, 4.1, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = withAlpha(p.dark, 0.5);
	ctx.lineWidth = 0.9;
	ctx.stroke();
}

function drawFeet(ctx: CanvasRenderingContext2D, p: PetPalette, pose: Pose) {
	ctx.fillStyle = p.dark;
	for (const [x, lift] of [
		[-11, pose.footL],
		[11, pose.footR]
	] as const) {
		ctx.beginPath();
		ctx.ellipse(x, FOOT_Y - 0.5 - lift, 6.2, 3.6, 0, 0, Math.PI * 2);
		ctx.fill();
	}
}

function drawArms(ctx: CanvasRenderingContext2D, p: PetPalette, pose: Pose) {
	ctx.fillStyle = p.base;
	ctx.strokeStyle = p.dark;
	ctx.lineWidth = 0.9;
	for (const [side, angle] of [
		[-1, pose.armL],
		[1, pose.armR]
	] as const) {
		ctx.save();
		ctx.translate(side * (BODY_W / 2 - 3), 5);
		// angle 0 = hanging down, positive raises the arm outward and up.
		ctx.rotate(side * -angle);
		ctx.beginPath();
		ctx.ellipse(side * 3.6, 1.2, 4.6, 3, side * 0.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
}

function drawFace(ctx: CanvasRenderingContext2D, p: PetPalette, pose: Pose) {
	const f = pose.face;
	const fx = pose.gazeX * 1.8;
	const fy = pose.gazeY * 1.2;
	ctx.save();
	ctx.translate(fx, fy - 2);

	// Cheeks first so they sit under the eyes.
	if (f.cheek > 0.02) {
		ctx.fillStyle = withAlpha(p.cheek, 0.12 + f.cheek * 0.5);
		for (const x of [-19.5, 19.5]) {
			ctx.beginPath();
			ctx.ellipse(x, 8.5, 4.6, 2.9, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	drawEye(ctx, p, pose, -11.5, 0, -1);
	drawEye(ctx, p, pose, 11.5, 0, 1);
	drawMouth(ctx, pose);
	ctx.restore();
}

function drawEye(ctx: CanvasRenderingContext2D, p: PetPalette, pose: Pose, cx0: number, cy0: number, side: -1 | 1) {
	const f = pose.face;
	const rx = 4.7;
	const ryBase = 6.5;
	const cx = cx0 + pose.gazeX * 2.6;
	const cy = cy0 + pose.gazeY * 2;
	const open = Math.max(0.06, f.eyeOpen * (1 - pose.blink));
	const ry = ryBase * open;

	// Dizzy: little spirals.
	if (f.spiral > 0.5) {
		ctx.save();
		ctx.strokeStyle = EYE_COLOR;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		const spin = performance.now() / 260;
		for (let t = 0; t < 14; t += 0.35) {
			const r = 0.34 * t + 0.4;
			const a = t + spin * side;
			const x = cx + Math.cos(a) * r;
			const y = cy + Math.sin(a) * r;
			if (t === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		ctx.restore();
		return;
	}

	// Asleep: calm downward arcs.
	if (f.closedArc > 0.5) {
		ctx.strokeStyle = EYE_COLOR;
		ctx.lineWidth = 2.2;
		ctx.beginPath();
		ctx.moveTo(cx - rx, cy + 0.5);
		ctx.quadraticCurveTo(cx, cy + 4.5, cx + rx, cy + 0.5);
		ctx.stroke();
		return;
	}

	const arcT = clamp01((f.eyeArc - 0.15) / 0.7);

	if (arcT < 1) {
		ctx.save();
		ctx.globalAlpha = 1 - arcT;
		ctx.beginPath();
		ctx.ellipse(cx, cy, rx * (0.9 + 0.1 * f.eyeOpen), ry, 0, 0, Math.PI * 2);
		ctx.clip();

		// Eyelid: everything above the lid line is cut away.
		const inner = (x: number) => ((x - cx) / rx) * -side;
		const lidY = (x: number) => cy - ryBase + ryBase * 2 * f.lidDroop * 0.55 + ryBase * f.lidTilt * 0.9 * inner(x);
		if (f.lidDroop > 0.01 || Math.abs(f.lidTilt) > 0.01) {
			ctx.beginPath();
			ctx.moveTo(cx - rx - 2, lidY(cx - rx - 2));
			ctx.lineTo(cx + rx + 2, lidY(cx + rx + 2));
			ctx.lineTo(cx + rx + 2, cy + ryBase + 3);
			ctx.lineTo(cx - rx - 2, cy + ryBase + 3);
			ctx.closePath();
			ctx.clip();
		}

		ctx.fillStyle = EYE_COLOR;
		ctx.fillRect(cx - rx - 3, cy - ryBase - 3, rx * 2 + 6, ryBase * 2 + 6);

		// Highlights follow the gaze a touch so the eyes feel glossy.
		const hs = f.pupil;
		ctx.fillStyle = "rgba(255,255,255,0.95)";
		ctx.beginPath();
		ctx.arc(cx - 1.4 + pose.gazeX * 0.9, cy - ry * 0.38, 1.9 * hs, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "rgba(255,255,255,0.65)";
		ctx.beginPath();
		ctx.arc(cx + 1.7 + pose.gazeX * 0.5, cy + ry * 0.4, 0.95 * hs, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	if (arcT > 0) {
		ctx.save();
		ctx.globalAlpha = arcT;
		ctx.strokeStyle = EYE_COLOR;
		ctx.lineWidth = 2.4;
		ctx.beginPath();
		ctx.moveTo(cx - rx - 0.3, cy + 2);
		ctx.quadraticCurveTo(cx, cy - 6, cx + rx + 0.3, cy + 2);
		ctx.stroke();
		ctx.restore();
	}

	// A raised eyebrow on the left eye reads as "curious".
	if (f.brow > 0.05 && side === -1) {
		ctx.strokeStyle = p.dark;
		ctx.lineWidth = 1.7;
		ctx.beginPath();
		const by = cy - ryBase - 3.2 - f.brow * 2.6;
		ctx.moveTo(cx - 4, by + 1.2);
		ctx.quadraticCurveTo(cx, by - 1.6, cx + 4, by + 0.6);
		ctx.stroke();
	}

	// Pupil glint: a tiny white dot that tracks gaze and adds glossiness.
	if (arcT < 1 && f.closedArc < 0.4 && f.spiral < 0.5) {
		const gx = cx + pose.gazeX * 1.2;
		const gy = cy + pose.gazeY * 0.8 + ry * 0.25;
		ctx.fillStyle = "rgba(255,255,255,0.70)";
		ctx.beginPath();
		ctx.arc(gx + 1.2, gy - 0.8, 0.7, 0, Math.PI * 2);
		ctx.fill();
	}
}

function drawMouth(ctx: CanvasRenderingContext2D, pose: Pose) {
	const f = pose.face;
	const y = 9;
	const w = 4.2 + f.mouthOpen * 1.2;
	const open = f.mouthOpen;

	if (open > 0.7 && Math.abs(f.mouthCurve) < 0.25) {
		// Surprised "o".
		ctx.fillStyle = "#4a2436";
		ctx.beginPath();
		ctx.ellipse(0, y + 1.5, 2.6, 3.3 * open, 0, 0, Math.PI * 2);
		ctx.fill();
		return;
	}

	const c = f.mouthCurve * 4.5;
	if (open > 0.12) {
		const depth = 1.5 + open * 6.5;
		ctx.fillStyle = "#4a2436";
		ctx.beginPath();
		ctx.moveTo(-w, y);
		ctx.quadraticCurveTo(0, y + c, w, y);
		ctx.quadraticCurveTo(0, y + c + depth, -w, y);
		ctx.closePath();
		ctx.fill();
		// Little tongue.
		if (open > 0.4) {
			ctx.save();
			ctx.clip();
			ctx.fillStyle = "#ff8aa0";
			ctx.beginPath();
			ctx.ellipse(0.4, y + c * 0.5 + depth * 0.85, 2.8, 2, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		return;
	}

	ctx.strokeStyle = EYE_COLOR;
	ctx.lineWidth = 1.7;
	ctx.beginPath();
	ctx.moveTo(-w, y);
	ctx.quadraticCurveTo(0, y + c, w, y);
	ctx.stroke();
}

// ── Outfits ──────────────────────────────────────────────────────────────────

function drawOutfit(ctx: CanvasRenderingContext2D, p: PetPalette, outfit: PetOutfit, pose: Pose) {
	switch (outfit) {
		case "bow":
			return drawBow(ctx);
		case "partyHat":
			return drawPartyHat(ctx);
		case "glasses":
			return drawGlasses(ctx, pose);
		case "headphones":
			return drawHeadphones(ctx, p);
		case "scarf":
			return drawScarf(ctx);
		case "crown":
			return drawCrown(ctx);
		case "cape":
			return drawCape(ctx, p, pose);
		case "sunglasses":
			return drawSunglasses(ctx, pose);
		default:
			return;
	}
}

function drawBow(ctx: CanvasRenderingContext2D) {
	ctx.save();
	ctx.translate(15, -BODY_H / 2 + 5);
	ctx.rotate(0.35);
	ctx.fillStyle = "#ff5f86";
	ctx.strokeStyle = "#c93463";
	ctx.lineWidth = 0.9;
	for (const s of [-1, 1]) {
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.quadraticCurveTo(s * 8, -7, s * 10, 0);
		ctx.quadraticCurveTo(s * 8, 7, 0, 0);
		ctx.fill();
		ctx.stroke();
	}
	ctx.fillStyle = "#e0436f";
	ctx.beginPath();
	ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawPartyHat(ctx: CanvasRenderingContext2D) {
	ctx.save();
	ctx.translate(-15, -BODY_H / 2 + 3);
	ctx.rotate(-0.4);
	const g = ctx.createLinearGradient(-8, 0, 8, 0);
	g.addColorStop(0, "#7c6cff");
	g.addColorStop(1, "#b49cff");
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo(-8, 1);
	ctx.lineTo(0, -19);
	ctx.lineTo(8, 1);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = "#ffe27a";
	ctx.lineWidth = 1.6;
	ctx.beginPath();
	ctx.moveTo(-5.2, -7);
	ctx.lineTo(5.2, -7);
	ctx.moveTo(-2.7, -13);
	ctx.lineTo(2.7, -13);
	ctx.stroke();
	ctx.fillStyle = "#ffe27a";
	ctx.beginPath();
	ctx.arc(0, -19.5, 2.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawGlasses(ctx: CanvasRenderingContext2D, pose: Pose) {
	const fx = pose.gazeX * 1.8;
	const fy = pose.gazeY * 1.2 - 2;
	ctx.save();
	ctx.translate(fx, fy);
	ctx.strokeStyle = "#3a2d54";
	ctx.lineWidth = 1.7;
	ctx.fillStyle = "rgba(255,255,255,0.14)";
	for (const x of [-11.5, 11.5]) {
		ctx.beginPath();
		ctx.arc(x, 0, 8.4, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.moveTo(-3.3, -1);
	ctx.quadraticCurveTo(0, -3.5, 3.3, -1);
	ctx.stroke();
	ctx.restore();
}

function drawHeadphones(ctx: CanvasRenderingContext2D, p: PetPalette) {
	ctx.save();
	ctx.strokeStyle = "#2e2545";
	ctx.lineWidth = 3.2;
	ctx.beginPath();
	ctx.arc(0, -2, BODY_W / 2 + 0.5, Math.PI * 1.02, Math.PI * 1.98);
	ctx.stroke();
	for (const s of [-1, 1]) {
		ctx.fillStyle = "#2e2545";
		ctx.beginPath();
		ctx.roundRect(s * (BODY_W / 2 + 0.5) - 3.6, -2 - 1, 7.2, 13, 3.2);
		ctx.fill();
		ctx.fillStyle = p.glow;
		ctx.beginPath();
		ctx.arc(s * (BODY_W / 2 + 0.5), 5.5, 1.5, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawScarf(ctx: CanvasRenderingContext2D) {
	ctx.save();
	ctx.fillStyle = "#ff6b6b";
	ctx.strokeStyle = "#d44a4a";
	ctx.lineWidth = 0.9;
	ctx.beginPath();
	ctx.moveTo(-24, 14);
	ctx.quadraticCurveTo(0, 22, 24, 14);
	ctx.lineTo(23.5, 20);
	ctx.quadraticCurveTo(0, 28, -23.5, 20);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(14, 22);
	ctx.lineTo(21, 22.6);
	ctx.lineTo(19.5, 33);
	ctx.lineTo(12.5, 32);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.strokeStyle = "rgba(255,255,255,0.55)";
	ctx.lineWidth = 1.2;
	ctx.beginPath();
	ctx.moveTo(14, 27.5);
	ctx.lineTo(20.4, 28.2);
	ctx.stroke();
	ctx.restore();
}

function drawCrown(ctx: CanvasRenderingContext2D) {
	ctx.save();
	ctx.translate(-2, -BODY_H / 2 - 2);
	const cg = ctx.createLinearGradient(-12, -12, 12, 0);
	cg.addColorStop(0, "#ffe066");
	cg.addColorStop(0.5, "#ffd700");
	cg.addColorStop(1, "#e6b800");
	ctx.fillStyle = cg;
	ctx.strokeStyle = "#b8860b";
	ctx.lineWidth = 1.0;
	// Crown base band.
	ctx.beginPath();
	ctx.roundRect(-10, -2, 20, 7, 2);
	ctx.fill();
	ctx.stroke();
	// Three points.
	for (const [px, ph] of [[-7, -11], [0, -14], [7, -11]] as const) {
		ctx.beginPath();
		ctx.moveTo(px - 4, -1);
		ctx.lineTo(px, ph);
		ctx.lineTo(px + 4, -1);
		ctx.fill();
		ctx.stroke();
	}
	// Jewel gems.
	const gems = [["#ff4d6d", -7, -5], ["#7dd3fc", 0, -5], ["#a78bfa", 7, -5]] as const;
	for (const [color, gx, gy] of gems) {
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(gx, gy, 1.8, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawCape(ctx: CanvasRenderingContext2D, p: PetPalette, pose: Pose) {
	ctx.save();
	// Cape drapes from the shoulders and flutters with tilt.
	const flutter = Math.sin(pose.tilt * 3 + Date.now() / 600) * 2;
	const capeCg = ctx.createLinearGradient(-24, -10, 20, 28);
	capeCg.addColorStop(0, p.dark);
	capeCg.addColorStop(1, withAlpha(p.dark, 0.6));
	ctx.fillStyle = capeCg;
	ctx.strokeStyle = withAlpha(p.dark, 0.7);
	ctx.lineWidth = 0.8;
	ctx.beginPath();
	ctx.moveTo(-20, -8);
	ctx.bezierCurveTo(-28, 4, -26 + flutter, 22, -14, 30);
	ctx.lineTo(14, 30);
	ctx.bezierCurveTo(26 - flutter, 22, 28, 4, 20, -8);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	// Collar clasp.
	ctx.fillStyle = "#ffe066";
	ctx.beginPath();
	ctx.arc(0, -5, 3, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawSunglasses(ctx: CanvasRenderingContext2D, pose: Pose) {
	const fx = pose.gazeX * 1.8;
	const fy = pose.gazeY * 1.2 - 2;
	ctx.save();
	ctx.translate(fx, fy);
	ctx.strokeStyle = "#1a1020";
	ctx.lineWidth = 1.8;
	// Tinted lenses — wider and slightly rounder than regular glasses.
	const lensColors = ["rgba(10,10,30,0.55)", "rgba(10,10,30,0.55)"];
	for (const [i, x] of ([-11.5, 11.5] as const).entries()) {
		ctx.fillStyle = lensColors[i];
		ctx.beginPath();
		ctx.roundRect(x - 9.5, -5.5, 19, 10, 4);
		ctx.fill();
		ctx.stroke();
		// Lens glint.
		ctx.fillStyle = "rgba(255,255,255,0.22)";
		ctx.beginPath();
		ctx.ellipse(x - 4, -3, 4, 1.8, -0.3, 0, Math.PI * 2);
		ctx.fill();
	}
	// Bridge.
	ctx.beginPath();
	ctx.moveTo(-2.5, -1);
	ctx.quadraticCurveTo(0, -3, 2.5, -1);
	ctx.stroke();
	ctx.restore();
}

// ── Particles ────────────────────────────────────────────────────────────────

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
	for (const p of particles) {
		const t = p.life / p.max;
		const alpha = t < 0.15 ? t / 0.15 : t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
		ctx.save();
		ctx.globalAlpha = Math.max(0, alpha);
		ctx.translate(p.x, p.y);
		ctx.rotate(p.rot);
		switch (p.kind) {
			case "heart":
				drawHeart(ctx, p.size, p.color);
				break;
			case "confetti":
				ctx.fillStyle = p.color;
				ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
				break;
			case "sparkle":
				drawSparkle(ctx, p.size, p.color);
				break;
			case "note":
				drawNote(ctx, p.size, p.color);
				break;
			case "zzz":
				ctx.fillStyle = p.color;
				ctx.font = `bold ${p.size}px system-ui, sans-serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText("z", 0, 0);
				break;
			case "anger":
				drawAnger(ctx, p.size, p.color);
				break;
			case "star":
				drawStar(ctx, p.size, p.color);
				break;
		}
		ctx.restore();
	}
}

function drawHeart(ctx: CanvasRenderingContext2D, s: number, color: string) {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, s * 0.35);
	ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.5, -s * 0.85, 0, -s * 0.35);
	ctx.bezierCurveTo(s * 0.5, -s * 0.85, s * 0.9, -s * 0.2, 0, s * 0.35);
	ctx.fill();
}

function drawSparkle(ctx: CanvasRenderingContext2D, s: number, color: string) {
	ctx.fillStyle = color;
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const r = i % 2 === 0 ? s : s * 0.28;
		const a = (i * Math.PI) / 4;
		ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	ctx.closePath();
	ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, s: number, color: string) {
	ctx.fillStyle = color;
	ctx.beginPath();
	for (let i = 0; i < 10; i++) {
		const r = i % 2 === 0 ? s : s * 0.45;
		const a = -Math.PI / 2 + (i * Math.PI) / 5;
		ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	ctx.closePath();
	ctx.fill();
}

function drawNote(ctx: CanvasRenderingContext2D, s: number, color: string) {
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max(1, s * 0.16);
	ctx.beginPath();
	ctx.ellipse(-s * 0.15, s * 0.45, s * 0.38, s * 0.28, -0.4, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(s * 0.18, s * 0.38);
	ctx.lineTo(s * 0.18, -s * 0.6);
	ctx.quadraticCurveTo(s * 0.55, -s * 0.45, s * 0.5, -s * 0.05);
	ctx.stroke();
}

function drawAnger(ctx: CanvasRenderingContext2D, s: number, color: string) {
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max(1.2, s * 0.22);
	for (const [sx, sy] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1]
	] as const) {
		ctx.beginPath();
		ctx.moveTo(sx * s * 0.25, sy * s * 0.25);
		ctx.quadraticCurveTo(sx * s * 0.25, sy * s * 0.9, sx * s * 0.9, sy * s * 0.9);
		ctx.stroke();
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(n: number) {
	return Math.max(0, Math.min(1, n));
}

/** "#rrggbb" + alpha → rgba(). */
export function withAlpha(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
