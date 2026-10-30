// Shared vocabulary for the Luma pet ("Lumi"). Nothing in here touches the DOM
// or Tauri, so the brain can be unit-tested and every window can use it.

export type Expression =
	| "neutral"
	| "happy"
	| "excited"
	| "curious"
	| "sleepy"
	| "surprised"
	| "annoyed"
	| "dizzy"
	| "worried"
	| "bored";

export type Activity =
	| "idle"
	| "sleep"
	| "dance"
	| "drag"
	| "jump"
	| "wave"
	| "celebrate"
	| "stretch"
	| "lookaround"
	| "spin"
	| "peek";

/** Where Lumi lives right now. */
export type PetHome = "island" | "desktop";

/** One-shot visual effects the brain asks the renderer to spawn. */
export type EffectKind = "hearts" | "confetti" | "zzz" | "notes" | "anger" | "stars" | "sparkle" | "treat";

export type PetEvent =
	| { type: "poke" }
	| { type: "stroke" }
	| { type: "drag-start" }
	| { type: "drag-end" }
	| { type: "arrive" }
	| { type: "music"; playing: boolean }
	| { type: "focus"; phase: "start" | "pause" | "resume" | "reset" | "complete" }
	| { type: "alert"; kind: "low-battery" | "charging" | "notification" }
	| { type: "wave" }
	| { type: "wake" }
	| { type: "sleep" }
	| { type: "feed" }
	| { type: "weather"; kind: "sunny" | "rainy" | "stormy" | "cloudy" | "snowy" };

/** What the renderer needs from the brain on each frame. */
export interface PetView {
	expression: Expression;
	activity: Activity;
	asleep: boolean;
	/** 0..1, how much Lumi likes you; drives how readily hearts appear. */
	affection: number;
	/** Effects to spawn this frame (consumed: the brain clears them). */
	effects: EffectKind[];
	/** Bulb flash 0..1 (notifications, focus completion). */
	flash: number;
	/** Increments each time a new reaction starts, so repeats (two pokes) can retrigger a hop. */
	seq: number;
}

export interface PetPrefs {
	enabled: boolean;
	name: string;
	color: PetColor;
	outfit: PetOutfit;
	/** Size multiplier for the floating pet and island views. */
	size: number;
	/** 0 = perfectly still, 1 = lively. Scales how often and how big idle animations are. */
	intensity: number;
	followCursor: boolean;
	danceToMusic: boolean;
	/** Minutes without interaction before Lumi naps; 0 = never. */
	sleepAfter: number;
	/** No spontaneous animations while a focus session runs. */
	quietDuringFocus: boolean;
	/** Keep the floating pet above other windows. */
	floatOnTop: boolean;
	/** Hide the floating pet while an app is fullscreen. */
	hideInFullscreen: boolean;
	/** Whether Lumi is on the desktop or in the island. */
	home: PetHome;
}

export const PET_COLORS = [
	"peach", "mint", "lavender", "sky", "rose", "lemon",
	"ocean", "midnight", "cherry"
] as const;
export type PetColor = (typeof PET_COLORS)[number];

export const PET_OUTFITS = [
	"none", "bow", "partyHat", "glasses", "headphones", "scarf",
	"crown", "cape", "sunglasses"
] as const;
export type PetOutfit = (typeof PET_OUTFITS)[number];

export const DEFAULT_PREFS: PetPrefs = {
	enabled: true,
	name: "Lumi",
	color: "peach",
	outfit: "none",
	size: 1,
	intensity: 0.6,
	followCursor: true,
	danceToMusic: true,
	sleepAfter: 5,
	quietDuringFocus: true,
	floatOnTop: true,
	hideInFullscreen: true,
	home: "island"
};
