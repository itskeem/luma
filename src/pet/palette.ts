import type { PetColor } from "./types";

export interface PetPalette {
	base: string;
	light: string;
	dark: string;
	cheek: string;
	/** Glow color of the aura and the bulb. */
	glow: string;
	label: string;
}

export const PALETTES: Record<PetColor, PetPalette> = {
	peach: { base: "#ffb08a", light: "#ffd9bf", dark: "#e8805a", cheek: "#ff7a8a", glow: "#ffc48a", label: "Peach" },
	mint: { base: "#7fe0b8", light: "#c4f5de", dark: "#3fb58a", cheek: "#ff8fa0", glow: "#9af2cc", label: "Mint" },
	lavender: { base: "#b7a2ff", light: "#ddd2ff", dark: "#8a70e6", cheek: "#ff8fb4", glow: "#c9b8ff", label: "Lavender" },
	sky: { base: "#7cc4ff", light: "#c3e4ff", dark: "#4a97e0", cheek: "#ff93a8", glow: "#9fd6ff", label: "Sky" },
	rose: { base: "#ff8fb0", light: "#ffcadb", dark: "#e5557f", cheek: "#ff5f86", glow: "#ffb0c8", label: "Rose" },
	lemon: { base: "#ffd966", light: "#fff0b3", dark: "#e8b52e", cheek: "#ff8a7a", glow: "#ffe58a", label: "Lemon" }
};

export const EYE_COLOR = "#2a2038";
export const BULB_CORE = "#fffbe8";
