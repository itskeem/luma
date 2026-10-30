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
	peach:    { base: "#ffb08a", light: "#ffd9bf", dark: "#e8805a", cheek: "#ff7a8a", glow: "#ffc48a", label: "Peach" },
	mint:     { base: "#7fe0b8", light: "#c4f5de", dark: "#3fb58a", cheek: "#ff8fa0", glow: "#9af2cc", label: "Mint" },
	lavender: { base: "#b7a2ff", light: "#ddd2ff", dark: "#8a70e6", cheek: "#ff8fb4", glow: "#c9b8ff", label: "Lavender" },
	sky:      { base: "#7cc4ff", light: "#c3e4ff", dark: "#4a97e0", cheek: "#ff93a8", glow: "#9fd6ff", label: "Sky" },
	rose:     { base: "#ff8fb0", light: "#ffcadb", dark: "#e5557f", cheek: "#ff5f86", glow: "#ffb0c8", label: "Rose" },
	lemon:    { base: "#ffd966", light: "#fff0b3", dark: "#e8b52e", cheek: "#ff8a7a", glow: "#ffe58a", label: "Lemon" },
	// New palettes
	ocean:    { base: "#5bc8d6", light: "#a8eaf0", dark: "#2d8fa0", cheek: "#ff8fa0", glow: "#7de0ec", label: "Ocean" },
	midnight: { base: "#6a7bbd", light: "#adb8e6", dark: "#3a4880", cheek: "#c8a0e0", glow: "#8898d8", label: "Midnight" },
	cherry:   { base: "#d44c6c", light: "#f09cb4", dark: "#8c2040", cheek: "#b0e870", glow: "#e87098", label: "Cherry" },
};

export const EYE_COLOR = "#2a2038";
export const BULB_CORE = "#fffbe8";
