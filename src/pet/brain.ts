// The pet's "brain": a small state machine that turns events (clicks, music,
// focus sessions, alerts) and the passage of time into an expression and an
// activity. It knows nothing about drawing, windows or Tauri, so it is
// deterministic under test (inject `now` and `rand`) and the same code runs in
// the island and in the floating desktop window.
//
// Rules of thumb it enforces:
//  * One transient reaction at a time; a higher priority one may interrupt a
//    lower one, never the reverse (a poke cannot cut a celebration short).
//  * Spontaneous behaviour is rare, scaled by the intensity preference, and
//    switched off entirely while asleep, dragged, or (optionally) focusing.
//  * Sleep needs real inactivity and any real event wakes Lumi.
//  * Bond milestones (100 / 500 / 1000 interactions) trigger a unique one-off
//    celebration with confetti + sparkle.

import type { Activity, EffectKind, Expression, PetEvent, PetPrefs, PetView } from "./types";

export interface BrainClock {
	now: () => number;
	rand: () => number;
}

interface Transient {
	expression: Expression;
	activity: Activity;
	until: number;
	priority: number;
	/** Held until released (dragging) instead of timing out. */
	hold?: boolean;
}

export const PRIORITY = {
	idle: 1,
	poke: 2,
	alert: 3,
	annoyed: 3,
	drag: 4,
	dizzy: 4,
	celebrate: 5
} as const;

/** Pokes within this window count together. */
const POKE_WINDOW_MS = 2500;
const ANNOYED_AT = 3;
const DIZZY_AT = 6;
/** Affection only grows once per this interval from plain pokes. */
const AFFECTION_COOLDOWN_MS = 5000;
const STROKE_COOLDOWN_MS = 4000;
const SPONTANEOUS_MIN_MS = 9000;
const SPONTANEOUS_SPAN_MS = 14000;
/** Inactivity (ms) before Lumi looks bored — distinct from the sleep timer. */
const BORED_AFTER_MS = 90_000;
/** Bond milestone interaction counts that trigger a special celebration. */
const BOND_MILESTONES = [100, 500, 1000, 2500] as const;

export interface BrainSnapshot {
	affection: number;
	lastSeen: number;
	/** Running total of meaningful interactions (pokes, strokes, feeds). */
	totalInteractions: number;
	/** Which milestones have already fired (serialised as a number bitmask). */
	milestonesReached: number;
}

export class PetBrain {
	private prefs: PetPrefs;
	private readonly clock: BrainClock;

	private transient: Transient | null = null;
	private pokes: number[] = [];
	private lastAffection = -Infinity;
	private lastStroke = -Infinity;
	private lastInteraction: number;
	private nextSpontaneous: number;

	private musicPlaying = false;
	private focusActive = false;
	private forcedSleep = false;
	private asleep = false;
	private boredShown = false;

	private affection: number;
	private totalInteractions: number;
	private milestonesReached: number;
	private effects: EffectKind[] = [];
	private flashUntil = 0;
	private flashStart = 0;
	private seq = 0;

	constructor(prefs: PetPrefs, clock: BrainClock, snapshot?: Partial<BrainSnapshot>) {
		this.prefs = prefs;
		this.clock = clock;
		const now = clock.now();
		this.lastInteraction = now;
		this.affection = clamp01(snapshot?.affection ?? 0.3);
		this.totalInteractions = snapshot?.totalInteractions ?? 0;
		this.milestonesReached = snapshot?.milestonesReached ?? 0;
		this.nextSpontaneous = now + this.spontaneousDelay();
		// Long absences cool things down a little (never below a floor).
		if (snapshot?.lastSeen) {
			const days = Math.max(0, (Date.now() - snapshot.lastSeen) / 86_400_000);
			this.affection = Math.max(0.1, this.affection - days * 0.01);
		}
	}

	setPrefs(prefs: PetPrefs) {
		const intensityChanged = prefs.intensity !== this.prefs.intensity;
		this.prefs = prefs;
		if (intensityChanged) this.nextSpontaneous = this.clock.now() + this.spontaneousDelay();
		if (!prefs.danceToMusic && this.transient?.activity === "dance") this.transient = null;
	}

	snapshot(): BrainSnapshot {
		return {
			affection: this.affection,
			lastSeen: Date.now(),
			totalInteractions: this.totalInteractions,
			milestonesReached: this.milestonesReached
		};
	}

	get isAsleep() {
		return this.asleep;
	}

	get isFocusing() {
		return this.focusActive;
	}

	get isMusicPlaying() {
		return this.musicPlaying;
	}

	/** Current affection as a 0–5 bond level for UI display. */
	get bondLevel(): number {
		return Math.min(5, Math.floor(this.totalInteractions / 100));
	}

	dispatch(event: PetEvent) {
		const now = this.clock.now();
		switch (event.type) {
			case "poke":
				this.onPoke(now);
				break;
			case "stroke":
				this.onStroke(now);
				break;
			case "drag-start":
				this.touch(now);
				this.wakeUp();
				this.start({ expression: "surprised", activity: "drag", until: Infinity, priority: PRIORITY.drag, hold: true });
				break;
			case "drag-end":
				this.touch(now);
				if (this.transient?.hold) this.transient = null;
				this.start({ expression: "happy", activity: "jump", until: now + 700, priority: PRIORITY.poke });
				break;
			case "arrive":
				this.touch(now);
				this.start({ expression: "happy", activity: "jump", until: now + 900, priority: PRIORITY.poke });
				break;
			case "music":
				this.musicPlaying = event.playing;
				if (event.playing) {
					this.touch(now);
					this.wakeUp();
				}
				break;
			case "focus":
				this.onFocus(event.phase, now);
				break;
			case "alert":
				this.onAlert(event.kind, now);
				break;
			case "wave":
				this.touch(now);
				this.wakeUp();
				this.start({ expression: "happy", activity: "wave", until: now + 1800, priority: PRIORITY.poke });
				break;
			case "wake":
				this.touch(now);
				this.wakeUp();
				break;
			case "sleep":
				this.forcedSleep = true;
				this.transient = null;
				this.fallAsleep();
				break;
			case "feed":
				this.onFeed(now);
				break;
			case "weather":
				this.onWeather(event.kind, now);
				break;
		}
	}

	/** Current state without advancing time or consuming one-shot effects. */
	peek(): PetView {
		return { ...this.resolve(this.clock.now()), effects: [] };
	}

	/** Advances time and returns what to draw. Cheap; call it every frame. */
	update(): PetView {
		const now = this.clock.now();

		if (this.transient && !this.transient.hold && now >= this.transient.until) this.transient = null;

		if (!this.asleep && !this.forcedSleep) {
			const limit = this.prefs.sleepAfter * 60_000;
			const busy = this.musicPlaying || this.transient?.hold;
			if (limit > 0 && !busy && now - this.lastInteraction > limit) this.fallAsleep();
		}

		if (!this.asleep && !this.transient) this.maybeSpontaneous(now);

		const view = this.resolve(now);
		this.effects = [];
		return view;
	}

	// ── Events ─────────────────────────────────────────────────────────────────

	private onPoke(now: number) {
		this.touch(now);
		this.countInteraction(now);
		const wasAsleep = this.asleep;
		this.wakeUp();
		this.boredShown = false;
		this.pokes = this.pokes.filter((t) => now - t < POKE_WINDOW_MS);
		this.pokes.push(now);
		const count = this.pokes.length;

		if (count >= DIZZY_AT) {
			this.pokes = [];
			this.effects.push("stars");
			this.start({ expression: "dizzy", activity: "idle", until: now + 3000, priority: PRIORITY.dizzy });
			return;
		}
		if (count >= ANNOYED_AT) {
			this.effects.push("anger");
			this.start({ expression: "annoyed", activity: "idle", until: now + 1800, priority: PRIORITY.annoyed });
			return;
		}
		if (wasAsleep) {
			this.start({ expression: "surprised", activity: "jump", until: now + 900, priority: PRIORITY.poke });
			return;
		}
		if (now - this.lastAffection > AFFECTION_COOLDOWN_MS) {
			this.lastAffection = now;
			this.affection = clamp01(this.affection + 0.02);
		}
		// The happier Lumi is with you, the more often a poke earns hearts.
		if (this.clock.rand() < 0.35 + this.affection * 0.55) this.effects.push("hearts");
		this.start({ expression: "happy", activity: "jump", until: now + 900, priority: PRIORITY.poke });
	}

	private onStroke(now: number) {
		if (this.asleep || now - this.lastStroke < STROKE_COOLDOWN_MS) return;
		this.lastStroke = now;
		this.touch(now);
		this.countInteraction(now);
		this.boredShown = false;
		// Strokes are calming — they mildly grow affection without the cooldown.
		this.affection = clamp01(this.affection + 0.01);
		this.start({ expression: "curious", activity: "idle", until: now + 1500, priority: PRIORITY.idle });
	}

	private onFeed(now: number) {
		if (this.asleep) this.wakeUp();
		this.touch(now);
		this.countInteraction(now);
		this.boredShown = false;
		// Treats give a bigger affection boost than pokes.
		this.affection = clamp01(this.affection + 0.07);
		this.flash(now, 1200);
		this.effects.push("hearts", "sparkle");
		this.start({ expression: "excited", activity: "jump", until: now + 1600, priority: PRIORITY.alert });
	}

	private onWeather(kind: "sunny" | "rainy" | "stormy" | "cloudy" | "snowy", now: number) {
		this.touch(now);
		this.wakeUp();
		switch (kind) {
			case "sunny":
				this.effects.push("sparkle");
				this.start({ expression: "happy", activity: "jump", until: now + 1200, priority: PRIORITY.poke });
				break;
			case "rainy":
			case "stormy":
				this.start({ expression: "worried", activity: "idle", until: now + 2500, priority: PRIORITY.poke });
				break;
			case "snowy":
				this.effects.push("sparkle");
				this.start({ expression: "excited", activity: "lookaround", until: now + 2500, priority: PRIORITY.poke });
				break;
			case "cloudy":
				this.start({ expression: "neutral", activity: "lookaround", until: now + 1200, priority: PRIORITY.idle });
				break;
		}
	}

	private onFocus(phase: "start" | "pause" | "resume" | "reset" | "complete", now: number) {
		switch (phase) {
			case "start":
			case "resume":
				this.focusActive = true;
				this.touch(now);
				this.wakeUp();
				this.start({ expression: "excited", activity: "idle", until: now + 1200, priority: PRIORITY.poke });
				break;
			case "pause":
			case "reset":
				this.focusActive = false;
				this.touch(now);
				break;
			case "complete":
				this.focusActive = false;
				this.touch(now);
				this.wakeUp();
				this.affection = clamp01(this.affection + 0.1);
				this.flash(now, 2500);
				this.effects.push("confetti", "hearts");
				this.start({ expression: "excited", activity: "celebrate", until: now + 5000, priority: PRIORITY.celebrate });
				break;
		}
	}

	private onAlert(kind: "low-battery" | "charging" | "notification", now: number) {
		this.touch(now);
		this.wakeUp();
		this.flash(now, kind === "notification" ? 2500 : 1800);
		if (kind === "low-battery") {
			this.start({ expression: "worried", activity: "idle", until: now + 4000, priority: PRIORITY.alert });
		} else if (kind === "charging") {
			this.effects.push("sparkle");
			this.start({ expression: "happy", activity: "jump", until: now + 1800, priority: PRIORITY.alert });
		} else {
			this.start({ expression: "surprised", activity: "jump", until: now + 1600, priority: PRIORITY.alert });
		}
	}

	// ── Internals ──────────────────────────────────────────────────────────────

	/** Count a meaningful interaction and fire bond milestones. */
	private countInteraction(now: number) {
		this.totalInteractions++;
		const idx = BOND_MILESTONES.findIndex((m, i) => this.totalInteractions >= m && !(this.milestonesReached & (1 << i)));
		if (idx >= 0) {
			this.milestonesReached |= 1 << idx;
			this.flash(now, 3000);
			this.effects.push("confetti", "sparkle", "hearts");
			// Override any current transient with the milestone celebration.
			this.transient = null;
			this.start({ expression: "excited", activity: "celebrate", until: now + 6000, priority: PRIORITY.celebrate });
		}
	}

	private resolve(now: number): PetView {
		let expression: Expression = "neutral";
		let activity: Activity = "idle";

		if (this.asleep) {
			expression = "sleepy";
			activity = "sleep";
		} else if (this.transient) {
			({ expression, activity } = this.transient);
		} else if (this.musicPlaying && this.prefs.danceToMusic) {
			expression = "happy";
			activity = "dance";
		} else {
			// Bored: long idle with no sleep timer (so it's visible).
			const idle = now - this.lastInteraction;
			const sleepMs = this.prefs.sleepAfter * 60_000;
			const nearSleep = sleepMs > 0 && idle > sleepMs * 0.8;
			if (!nearSleep && idle > BORED_AFTER_MS && !this.boredShown) {
				this.boredShown = true;
				expression = "bored";
			} else if (this.boredShown) {
				expression = "bored";
			}
		}

		// Dancing continues underneath short, higher-priority reactions that
		// don't specify their own activity (e.g. a surprised "idle").
		if (!this.asleep && this.musicPlaying && this.prefs.danceToMusic && activity === "idle" && this.transient?.priority === PRIORITY.idle) {
			activity = "dance";
		}

		const flash = now < this.flashUntil ? Math.max(0, (this.flashUntil - now) / Math.max(1, this.flashUntil - this.flashStart)) : 0;
		return {
			expression,
			activity,
			asleep: this.asleep,
			affection: this.affection,
			effects: [...this.effects],
			flash,
			seq: this.seq
		};
	}

	private start(next: Transient) {
		if (this.transient && next.priority < this.transient.priority) return;
		this.transient = next;
		this.seq++;
	}

	private touch(now: number) {
		this.lastInteraction = now;
		this.nextSpontaneous = Math.max(this.nextSpontaneous, now + 4000);
	}

	private wakeUp() {
		if (this.asleep || this.forcedSleep) {
			this.asleep = false;
			this.forcedSleep = false;
			this.boredShown = false;
			this.nextSpontaneous = this.clock.now() + this.spontaneousDelay();
		}
	}

	private fallAsleep() {
		if (this.asleep) return;
		this.asleep = true;
		this.boredShown = false;
		this.effects.push("zzz");
	}

	private flash(now: number, ms: number) {
		this.flashStart = now;
		this.flashUntil = now + ms;
	}

	private spontaneousDelay() {
		const intensity = Math.max(0.05, this.prefs.intensity);
		const base = SPONTANEOUS_MIN_MS + this.clock.rand() * SPONTANEOUS_SPAN_MS;
		return base / intensity;
	}

	private maybeSpontaneous(now: number) {
		if (this.prefs.intensity <= 0) return;
		if (this.prefs.quietDuringFocus && this.focusActive) return;
		if (now < this.nextSpontaneous) return;
		this.nextSpontaneous = now + this.spontaneousDelay();
		if (this.musicPlaying && this.prefs.danceToMusic) return;

		const roll = this.clock.rand();
		if (roll < 0.35) {
			this.start({ expression: "curious", activity: "lookaround", until: now + 2200, priority: PRIORITY.idle });
		} else if (roll < 0.55) {
			this.start({ expression: "neutral", activity: "stretch", until: now + 1600, priority: PRIORITY.idle });
		} else if (roll < 0.68) {
			this.start({ expression: "happy", activity: "jump", until: now + 800, priority: PRIORITY.idle });
		} else if (roll < 0.78) {
			this.start({ expression: "happy", activity: "wave", until: now + 1600, priority: PRIORITY.idle });
		} else if (roll < 0.88) {
			this.start({ expression: "excited", activity: "spin", until: now + 1200, priority: PRIORITY.idle });
		} else {
			this.start({ expression: "curious", activity: "peek", until: now + 2000, priority: PRIORITY.idle });
		}
	}
}

function clamp01(n: number) {
	return Math.max(0, Math.min(1, n));
}
