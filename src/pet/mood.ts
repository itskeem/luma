import type { PetView } from "./types";

/** A short, honest sentence about what Lumi is doing, for the Pet panel. */
export function moodText(view: PetView, focusing: boolean): string {
	if (view.asleep) return "Napping. Tap to wake up.";
	switch (view.activity) {
		case "dance":
			return "Dancing along to your music";
		case "celebrate":
			return "Celebrating. Nice focus!";
		case "drag":
			return "Wheee!";
		case "stretch":
			return "Stretching";
		case "wave":
			return "Waving hello";
		case "lookaround":
			return "Looking around";
	}
	switch (view.expression) {
		case "annoyed":
			return "A little annoyed. Too many pokes!";
		case "dizzy":
			return "Dizzy...";
		case "worried":
			return "Worried about your battery";
		case "surprised":
			return "Oh!";
		case "curious":
			return "Curious";
		case "happy":
		case "excited":
			return "Happy";
	}
	return focusing ? "Keeping you company while you focus" : "Relaxed";
}

/** 0..5 hearts for the affection meter. */
export function heartsFor(affection: number): number {
	return Math.max(0, Math.min(5, Math.round(affection * 5)));
}
