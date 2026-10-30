// Turns the brain's view (expression + activity) into smooth motion and draws
// it. The engine owns everything continuous: eased face, springs for squash and
// the bulb, blinking, gaze, particles and the frame loop.
//
// Frame pacing keeps the pet cheap: full rate only while something is moving,
// a calm rate while idling, a trickle while asleep, nothing while the page is
// hidden or the engine is stopped.

import { PetBrain } from "./brain";
import { PALETTES } from "./palette";
import {
	NEUTRAL_FACE,
	NEUTRAL_POSE,
	drawLumi,
	type FaceParams,
	type Particle,
	type Pose
} from "./render";
import type { Expression, PetPrefs, PetView } from "./types";

/** Face targets for each expression; everything else eases toward these. */
const FACES: Record<Expression, FaceParams> = {
	neutral:  { ...NEUTRAL_FACE },
	happy:    { ...NEUTRAL_FACE, eyeArc: 0.9, mouthOpen: 0.6, mouthCurve: 1, cheek: 0.9 },
	excited:  { ...NEUTRAL_FACE, eyeOpen: 1.15, eyeArc: 0.35, mouthOpen: 0.85, mouthCurve: 1, cheek: 0.85, pupil: 1.2 },
	curious:  { ...NEUTRAL_FACE, eyeOpen: 1.1, brow: 0.9, mouthOpen: 0.15, mouthCurve: 0.1, cheek: 0.3, pupil: 1.1 },
	sleepy:   { ...NEUTRAL_FACE, eyeOpen: 0.5, lidDroop: 0.6, mouthOpen: 0.3, mouthCurve: 0, cheek: 0.45, pupil: 0.8 },
	surprised:{ ...NEUTRAL_FACE, eyeOpen: 1.3, mouthOpen: 1, mouthCurve: 0, cheek: 0.2, pupil: 0.7 },
	annoyed:  { ...NEUTRAL_FACE, eyeOpen: 0.75, lidTilt: 0.9, mouthCurve: -0.8, cheek: 0.1, pupil: 0.9 },
	dizzy:    { ...NEUTRAL_FACE, spiral: 1, mouthCurve: -0.2, mouthOpen: 0.25, cheek: 0.4 },
	worried:  { ...NEUTRAL_FACE, eyeOpen: 1.1, lidTilt: -0.75, mouthCurve: -0.55, mouthOpen: 0.2, cheek: 0.15, pupil: 1.1 },
	bored:    { ...NEUTRAL_FACE, eyeOpen: 0.65, lidDroop: 0.45, mouthOpen: 0.55, mouthCurve: -0.2, cheek: 0.15, pupil: 0.85 }
};

const ASLEEP_FACE: FaceParams = { ...NEUTRAL_FACE, closedArc: 1, mouthOpen: 0.25, mouthCurve: 0, cheek: 0.5 };

const GRAVITY = 300;
const MAX_PARTICLES = 90;
const CONFETTI = ["#ff6b8b", "#ffd45e", "#6bd6ff", "#9b8cff", "#6ee7b0", "#ffa05e"];

export interface EngineOptions {
	canvas: HTMLCanvasElement;
	brain: PetBrain;
	getPrefs: () => PetPrefs;
	/** CSS pixel size of the (square) canvas. */
	size: number;
	/** Ground shadow under the feet. */
	shadow?: boolean;
}

export class PetEngine {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly brain: PetBrain;
	private readonly getPrefs: () => PetPrefs;
	private size: number;
	private readonly shadow: boolean;

	private pose: Pose = { ...NEUTRAL_POSE, face: { ...NEUTRAL_FACE } };
	private particles: Particle[] = [];

	private running = false;
	private raf = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private last = 0;
	private t = 0;

	// Gaze
	private gazeTarget = { x: 0, y: 0 };
	private gazeVel = { x: 0, y: 0 };
	private hasGaze = false;

	// Blink
	private nextBlink = 1.5;
	private blinkT = -1;
	private doubleBlink = false;

	// Springs
	private y = 0;
	private vy = 0;
	private squash = 1;
	private squashVel = 0;
	private squashX = 1;
	private sway = 0;
	private swayVel = 0;
	private grounded = true;

	private seq = -1;
	private activityStart = 0;
	private lastActivity = "idle";
	private dancePhase = 0;
	private spinAngle = 0;
	private audio = 0;
	private audioSmooth = 0;
	private audioAt = -Infinity;
	private zzzTimer = 0;
	private noteTimer = 0;
	private dragVx = 0;
	private lastExpression: Expression = "neutral";

	constructor(o: EngineOptions) {
		this.canvas = o.canvas;
		const ctx = o.canvas.getContext("2d");
		if (!ctx) throw new Error("2D canvas is unavailable");
		this.ctx = ctx;
		this.brain = o.brain;
		this.getPrefs = o.getPrefs;
		this.size = o.size;
		this.shadow = !!o.shadow;
		this.applySize();
	}

	// ── Control ────────────────────────────────────────────────────────────────

	start() {
		if (this.running) return;
		this.running = true;
		this.last = performance.now();
		document.addEventListener("visibilitychange", this.onVisibility);
		this.schedule(0);
	}

	stop() {
		this.running = false;
		cancelAnimationFrame(this.raf);
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		document.removeEventListener("visibilitychange", this.onVisibility);
	}

	/** Draws one frame right now (used by tests and the first paint). */
	renderOnce() {
		this.frame(performance.now(), true);
	}

	resize(size: number) {
		if (size === this.size) return;
		this.size = size;
		this.applySize();
	}

	/** Gaze direction toward a point, each axis in -1..1 (null = no target). */
	setGaze(x: number | null, y: number | null = 0) {
		if (x === null || y === null) {
			this.hasGaze = false;
			return;
		}
		this.hasGaze = true;
		this.gazeTarget.x = clamp(x, -1, 1);
		this.gazeTarget.y = clamp(y, -1, 1);
		this.wakeLoop();
	}

	/** 0..1 loudness from the audio visualizer; drives dance energy. */
	setAudioLevel(level: number) {
		this.audio = clamp(level, 0, 1);
		this.audioAt = performance.now();
	}

	/** Horizontal velocity (px/s) while being dragged: the body leans into it. */
	setDragVelocity(vx: number) {
		this.dragVx = vx;
	}

	/** Wakes a slowed loop so a reaction is shown at full rate immediately. */
	wakeLoop() {
		if (!this.running) return;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
			this.schedule(0);
		}
	}

	// ── Loop ───────────────────────────────────────────────────────────────────

	private onVisibility = () => {
		if (document.hidden) {
			cancelAnimationFrame(this.raf);
			if (this.timer) clearTimeout(this.timer);
			this.timer = null;
		} else if (this.running) {
			this.last = performance.now();
			this.schedule(0);
		}
	};

	private schedule(delay: number) {
		if (!this.running || document.hidden) return;
		if (delay > 20) {
			this.timer = setTimeout(() => {
				this.timer = null;
				this.raf = requestAnimationFrame((n) => this.frame(n, false));
			}, delay);
		} else {
			this.raf = requestAnimationFrame((n) => this.frame(n, false));
		}
	}

	private frame(now: number, once: boolean) {
		const dt = clamp((now - this.last) / 1000, 0.001, 0.1);
		this.last = now;
		this.t += dt;

		const view = this.brain.update();
		this.step(view, dt, now);
		this.render();

		if (!once) this.schedule(this.nextDelay(view));
	}

	/** How long to wait before the next frame, by how lively things are. */
	private nextDelay(view: PetView): number {
		if (this.particles.length > 0 || this.isMoving(view)) return 0;
		if (view.asleep) return 160;
		return 45;
	}

	private isMoving(view: PetView): boolean {
		return (
			view.activity !== "idle" ||
			view.expression !== this.lastExpression ||
			!this.grounded ||
			Math.abs(this.vy) > 0.5 ||
			Math.abs(this.squash - 1) > 0.01 ||
			Math.abs(this.swayVel) > 0.05 ||
			this.blinkT >= 0 ||
			this.gazeSettling()
		);
	}

	private gazeSettling(): boolean {
		return (
			Math.abs(this.gazeVel.x) > 0.02 ||
			Math.abs(this.gazeVel.y) > 0.02 ||
			Math.abs(this.pose.gazeX - this.gazeTarget.x) > 0.02
		);
	}

	// ── Simulation ─────────────────────────────────────────────────────────────

	private step(view: PetView, dt: number, nowMs: number) {
		const prefs = this.getPrefs();
		const p = this.pose;
		const lively = 0.35 + 0.65 * prefs.intensity;

		// New reaction → retrigger one-shot motions.
		if (view.seq !== this.seq) {
			this.seq = view.seq;
			this.activityStart = this.t;
			if (view.activity === "jump") this.hop(70 * (0.7 + 0.3 * lively));
			if (view.activity === "celebrate") this.hop(95);
			if (view.activity === "spin") this.spinAngle = 0;
			if (view.expression === "surprised" && view.activity !== "jump") this.squashVel -= 3;
			if (view.expression === "bored") this.squashVel -= 0.5; // subtle slump
		}
		if (view.activity !== this.lastActivity) {
			if (view.activity === "dance") this.dancePhase = 0;
			this.lastActivity = view.activity;
		}
		if (view.expression !== this.lastExpression) {
			if (view.expression === "dizzy") this.spawnStars();
			this.lastExpression = view.expression;
		}
		for (const e of view.effects) this.spawn(e);

		// Face easing.
		const target = view.asleep ? ASLEEP_FACE : FACES[view.expression];
		const k = 1 - Math.exp(-dt * 14);
		for (const key of Object.keys(target) as (keyof FaceParams)[]) {
			p.face[key] += (target[key] - p.face[key]) * k;
		}

		// Breathing.
		p.breath = Math.sin(this.t * (view.asleep ? 1.3 : 1.85));

		// Blinking is paused for expressions where the eyes aren't round.
		this.stepBlink(dt, view);

		// Gaze.
		this.stepGaze(view, dt, prefs);

		// Audio level decays if the visualizer stops talking.
		const fresh = nowMs - this.audioAt < 600;
		const lvl = fresh ? this.audio : 0.35;
		this.audioSmooth += (lvl - this.audioSmooth) * (1 - Math.exp(-dt * 8));

		// Activity-driven targets.
		let tilt = Math.sin(this.t * 0.9) * 0.012 * lively;
		let armL = 0.35 + 0.05 * p.breath;
		let armR = armL;
		let footL = 0;
		let footR = 0;
		let squashTarget = 1;
		let squashXTarget = 1;
		let glow = view.asleep ? 0.28 : 0.62;
		let sink = 0;
		const since = this.t - this.activityStart;

		switch (view.activity) {
			case "sleep":
				tilt = 0.04;
				squashTarget = 0.965 + 0.01 * p.breath;
				squashXTarget = 1.02;
				sink = 1.5;
				armL = armR = 0.1;
				break;
			case "dance": {
				const bpm = 104 + this.audioSmooth * 24;
				this.dancePhase += dt * (bpm / 60) * Math.PI;
				const s = Math.sin(this.dancePhase);
				const amp = (0.5 + this.audioSmooth * 0.9) * lively;
				tilt = s * 0.09 * amp;
				armL = 0.9 + Math.sin(this.dancePhase + 0.5) * 0.7 * amp;
				armR = 0.9 + Math.sin(this.dancePhase + Math.PI) * 0.7 * amp;
				footL = Math.max(0, s) * 3.6 * amp;
				footR = Math.max(0, -s) * 3.6 * amp;
				squashTarget = 1 - 0.05 * Math.abs(Math.cos(this.dancePhase)) * amp;
				glow = 0.7 + this.audioSmooth * 0.7;
				// Bounce on every beat.
				if (this.grounded && Math.cos(this.dancePhase) > 0.985 && amp > 0.3) {
					this.vy = -(34 + 40 * amp);
					this.grounded = false;
				}
				this.noteTimer -= dt;
				if (this.noteTimer <= 0) {
					this.noteTimer = 0.75 - this.audioSmooth * 0.25;
					this.spawn("notes");
				}
				break;
			}
			case "wave":
				armR = 1.5 + Math.sin(this.t * 13) * 0.32;
				tilt = -0.05;
				break;
			case "stretch": {
				const u = Math.min(1, since / 1.6);
				const bell = Math.sin(u * Math.PI);
				squashTarget = 1 + 0.12 * bell;
				squashXTarget = 1 - 0.07 * bell;
				armL = armR = 0.3 + 1.35 * bell;
				p.face.mouthOpen = Math.max(p.face.mouthOpen, 0.8 * bell);
				p.face.eyeOpen = Math.min(p.face.eyeOpen, 1 - 0.6 * bell);
				break;
			}
			case "drag":
				tilt = clamp(this.dragVx * 0.0009, -0.35, 0.35);
				squashTarget = 1.08;
				squashXTarget = 0.95;
				footL = footR = 3;
				armL = armR = 1.2;
				break;
			case "celebrate":
				armL = armR = 1.5 + Math.sin(this.t * 10) * 0.25;
				glow = 1.2;
				footL = footR = 0;
				if (this.grounded && since > 0.1) this.hop(78 + 12 * Math.sin(this.t * 3));
				break;
			case "lookaround":
				// Handled in stepGaze.
				break;
			case "spin": {
				// Full 360° rotation using tilt spring; two hops at 0° and 180°.
				const spinSpeed = 3.5 * lively;
				this.spinAngle += dt * spinSpeed;
				tilt = Math.sin(this.spinAngle) * Math.PI * 0.28;
				squashTarget = 1 + 0.06 * Math.abs(Math.cos(this.spinAngle));
				armL = 1.2 + Math.cos(this.spinAngle + 1) * 0.5;
				armR = 1.2 + Math.cos(this.spinAngle - 1) * 0.5;
				if (this.grounded && Math.abs(Math.sin(this.spinAngle)) < 0.08 && since > 0.1) {
					this.hop(55 * lively);
				}
				break;
			}
			case "peek": {
				// Lumi leans/slides sideways to peek, then returns.
				const peekU = Math.min(1, since / 2.0);
				const peekBell = Math.sin(peekU * Math.PI);
				tilt = -0.22 * peekBell;
				squashTarget = 1 + 0.05 * peekBell;
				armL = 0.35;
				armR = 0.35 + peekBell * 0.6;
				glow = 0.55 + peekBell * 0.2;
				break;
			}
			default:
				break;
		}

		// Vertical physics.
		if (!this.grounded) {
			this.vy += GRAVITY * dt;
			this.y += this.vy * dt;
			if (this.y >= 0) {
				this.y = 0;
				this.grounded = true;
				this.squashVel -= Math.min(5, Math.abs(this.vy) * 0.045);
				this.vy = 0;
			}
		}

		// Squash/stretch spring around its target (stiff, underdamped for a bounce).
		let stretch = 0;
		if (!this.grounded) stretch = clamp(-this.vy / 220, -0.12, 0.16);
		const sTarget = squashTarget + stretch;
		const accel = (sTarget - this.squash) * 260 - this.squashVel * 15;
		this.squashVel += accel * dt;
		this.squash += this.squashVel * dt;
		this.squash = clamp(this.squash, 0.6, 1.35);
		this.squashX += (squashXTarget * (1 + (1 - this.squash) * 0.55) - this.squashX) * (1 - Math.exp(-dt * 18));

		// Bulb sway: a lagging spring excited by motion and tilt.
		const swayTarget = clamp(-tilt * 4 + Math.sin(this.t * 2.1) * 0.12 * lively - this.vy * 0.004, -1, 1);
		const swayAccel = (swayTarget - this.sway) * 90 - this.swayVel * 7;
		this.swayVel += swayAccel * dt;
		this.sway += this.swayVel * dt;

		glow += view.flash * 0.9;
		p.glow += (glow - p.glow) * (1 - Math.exp(-dt * 6));
		p.tilt += (tilt - p.tilt) * (1 - Math.exp(-dt * 16));
		p.offsetY = this.y + sink;
		p.squashY = this.squash;
		p.squashX = this.squashX;
		p.bulbSway = this.sway;
		p.armL += (armL - p.armL) * (1 - Math.exp(-dt * 16));
		p.armR += (armR - p.armR) * (1 - Math.exp(-dt * 16));
		p.footL += (footL - p.footL) * (1 - Math.exp(-dt * 20));
		p.footR += (footR - p.footR) * (1 - Math.exp(-dt * 20));

		// Sleepy zzz with snore cheek puff.
		if (view.asleep) {
			this.zzzTimer -= dt;
			if (this.zzzTimer <= 0) {
				this.zzzTimer = 2.6;
				this.spawn("zzz");
				// Puff cheeks briefly to simulate a snore breath.
				p.face.mouthOpen = Math.max(p.face.mouthOpen, 0.55);
				p.face.cheek = Math.max(p.face.cheek, 0.65);
			}
		}

		this.stepParticles(dt);
	}

	private hop(speed: number) {
		this.vy = -speed;
		this.grounded = false;
		this.squashVel += 1.6;
	}

	private stepBlink(dt: number, view: PetView) {
		const eyesRound = !view.asleep && this.pose.face.eyeArc < 0.4 && this.pose.face.spiral < 0.4;
		if (!eyesRound) {
			this.pose.blink = 0;
			this.blinkT = -1;
			return;
		}
		if (this.blinkT < 0) {
			this.nextBlink -= dt;
			if (this.nextBlink <= 0) {
				this.blinkT = 0;
				this.doubleBlink = Math.random() < 0.15;
			}
			this.pose.blink = 0;
			return;
		}
		this.blinkT += dt;
		const closeT = 0.07;
		const openT = 0.11;
		if (this.blinkT < closeT) this.pose.blink = this.blinkT / closeT;
		else if (this.blinkT < closeT + openT) this.pose.blink = 1 - (this.blinkT - closeT) / openT;
		else {
			this.pose.blink = 0;
			this.blinkT = -1;
			this.nextBlink = this.doubleBlink ? 0.18 : 2.2 + Math.random() * 4.2;
			this.doubleBlink = false;
		}
	}

	private stepGaze(view: PetView, dt: number, prefs: PetPrefs) {
		let tx = 0;
		let ty = 0;
		if (view.asleep) {
			tx = 0;
			ty = 0.3;
		} else if (view.activity === "lookaround" || view.activity === "peek") {
			const u = this.t - this.activityStart;
			tx = Math.sin(u * 2.6) * 0.95;
			ty = -0.1 + Math.sin(u * 1.3) * 0.15;
		} else if (view.expression === "bored") {
			// Downcast gaze when bored.
			tx = Math.sin(this.t * 0.4) * 0.3;
			ty = 0.5;
		} else if (view.activity === "dance") {
			tx = Math.sin(this.dancePhase * 0.5) * 0.4;
			ty = -0.1;
		} else if (view.activity === "drag") {
			tx = clamp(this.dragVx * 0.002, -1, 1);
			ty = 0.3;
		} else if (prefs.followCursor && this.hasGaze) {
			tx = this.gazeTarget.x;
			ty = this.gazeTarget.y;
		}
		// Critically damped spring: quick but never snaps.
		const w = 22;
		for (const axis of ["x", "y"] as const) {
			const target = axis === "x" ? tx : ty;
			const cur = axis === "x" ? this.pose.gazeX : this.pose.gazeY;
			const vel = this.gazeVel[axis];
			const accel = (target - cur) * w * w - vel * 2 * w;
			const nv = vel + accel * dt;
			const nx = cur + nv * dt;
			this.gazeVel[axis] = nv;
			if (axis === "x") this.pose.gazeX = nx;
			else this.pose.gazeY = nx;
		}
	}

	// ── Particles ──────────────────────────────────────────────────────────────

	private spawn(kind: string) {
		const pal = PALETTES[this.getPrefs().color];
		const room = MAX_PARTICLES - this.particles.length;
		if (room <= 0) return;
		const add = (p: Partial<Particle> & Pick<Particle, "kind">) =>
			this.particles.push({
				x: 50,
				y: 36,
				vx: 0,
				vy: 0,
				life: 0,
				max: 1.4,
				size: 6,
				rot: 0,
				vr: 0,
				color: "#fff",
				...p
			});

		switch (kind) {
			case "hearts":
				for (let i = 0; i < Math.min(room, 4); i++)
					add({
						kind: "heart",
						x: 50 + (Math.random() - 0.5) * 30,
						y: 39 + Math.random() * 8,
						vx: (Math.random() - 0.5) * 10,
						vy: -18 - Math.random() * 12,
						size: 5 + Math.random() * 4,
						max: 1.5 + Math.random() * 0.6,
						color: i % 2 ? "#ff7aa0" : "#ff5f86"
					});
				break;
			case "treat":
				for (let i = 0; i < Math.min(room, 6); i++)
					add({
						kind: "sparkle",
						x: 50 + (Math.random() - 0.5) * 40,
						y: 50 + Math.random() * 14,
						vx: (Math.random() - 0.5) * 22,
						vy: -28 - Math.random() * 20,
						size: 4 + Math.random() * 3,
						max: 1.0 + Math.random() * 0.5,
						color: ["#ffd700", "#ffb347", "#ff6eb4", "#7fffd4"][i % 4]
					});
				break;
			case "confetti":
				for (let i = 0; i < Math.min(room, 30); i++)
					add({
						kind: "confetti",
						x: 50,
						y: 45,
						vx: (Math.random() - 0.5) * 90,
						vy: -55 - Math.random() * 55,
						size: 3 + Math.random() * 3,
						rot: Math.random() * 6,
						vr: (Math.random() - 0.5) * 14,
						max: 1.6 + Math.random() * 0.8,
						color: CONFETTI[i % CONFETTI.length]
					});
				break;
			case "sparkle":
				for (let i = 0; i < Math.min(room, 5); i++)
					add({
						kind: "sparkle",
						x: 50 + (Math.random() - 0.5) * 50,
						y: 43 + (Math.random() - 0.5) * 30,
						vy: -6,
						size: 3 + Math.random() * 2.5,
						max: 0.9 + Math.random() * 0.4,
						color: pal.glow
					});
				break;
			case "notes":
				add({
					kind: "note",
					x: 50 + (Math.random() < 0.5 ? -22 : 22),
					y: 45,
					vx: (Math.random() - 0.5) * 12,
					vy: -20,
					size: 7,
					max: 1.3,
					color: pal.dark
				});
				break;
			case "zzz":
				add({ kind: "zzz", x: 66, y: 39, vx: 5, vy: -9, size: 9, max: 2.6, color: pal.dark });
				break;
			case "anger":
				add({ kind: "anger", x: 72, y: 33, vy: -3, size: 7, max: 1.4, color: "#ff4d4d", rot: 0.2 });
				break;
			case "stars":
				this.spawnStars();
				break;
		}
	}

	private spawnStars() {
		for (let i = 0; i < 4; i++)
			this.particles.push({
				kind: "star",
				x: 50,
				y: 35,
				vx: 0,
				vy: 0,
				life: 0,
				max: 3,
				size: 3.2,
				rot: 0,
				vr: 3,
				color: "#ffd54a",
				orbit: { r: 17, speed: 4.2, phase: (i * Math.PI) / 2 }
			});
	}

	private stepParticles(dt: number) {
		const out: Particle[] = [];
		for (const p of this.particles) {
			p.life += dt;
			if (p.life >= p.max) continue;
			if (p.orbit) {
				const a = p.orbit.phase + p.life * p.orbit.speed;
				p.x = 50 + Math.cos(a) * p.orbit.r;
				p.y = 34 + Math.sin(a) * 4.5;
			} else {
				if (p.kind === "confetti") p.vy += 150 * dt;
				if (p.kind === "heart" || p.kind === "note" || p.kind === "zzz") p.x += Math.sin(p.life * 4 + p.size) * 6 * dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
			}
			p.rot += p.vr * dt;
			out.push(p);
		}
		this.particles = out;
	}

	// ── Drawing ────────────────────────────────────────────────────────────────

	private applySize() {
		const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
		this.canvas.width = Math.round(this.size * dpr);
		this.canvas.height = Math.round(this.size * dpr);
		this.canvas.style.width = `${this.size}px`;
		this.canvas.style.height = `${this.size}px`;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	private render() {
		const prefs = this.getPrefs();
		drawLumi(this.ctx, {
			size: this.size,
			pose: this.pose,
			color: prefs.color,
			outfit: prefs.outfit,
			particles: this.particles,
			shadow: this.shadow,
			time: this.t
		});
	}
}

function clamp(n: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, n));
}
