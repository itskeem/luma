// Developer-only gallery: draws every expression, colour and outfit so the
// character can be reviewed without the Tauri shell. Not part of the app build.
import { PetBrain } from "../src/pet/brain";
import { PetEngine } from "../src/pet/engine";
import { DEFAULT_PREFS, PET_COLORS, PET_OUTFITS, type Expression, type PetPrefs } from "../src/pet/types";

const app = document.getElementById("app")!;
function section(title: string) {
	const h = document.createElement("div");
	h.textContent = title;
	h.style.margin = "8px 0 4px";
	app.appendChild(h);
	const row = document.createElement("div");
	row.className = "row";
	app.appendChild(row);
	return row;
}

function cell(row: HTMLElement, label: string, prefs: PetPrefs, setup: (b: PetBrain) => void, frames = 40, size = 120) {
	const wrap = document.createElement("div");
	wrap.className = "cell";
	const canvas = document.createElement("canvas");
	wrap.appendChild(canvas);
	const cap = document.createElement("div");
	cap.textContent = label;
	wrap.appendChild(cap);
	row.appendChild(wrap);
	let t = 1000;
	const brain = new PetBrain(prefs, { now: () => t, rand: () => 0.5 });
	const engine = new PetEngine({ canvas, brain, getPrefs: () => prefs, size, shadow: true });
	setup(brain);
	// Fast-forward the simulation deterministically by faking time.
	const realNow = performance.now.bind(performance);
	let fake = realNow();
	for (let i = 0; i < frames; i++) {
		fake += 16.7;
		t += 16.7;
		(engine as any).frame(fake, true);
	}
	return { engine, brain };
}

const base = { ...DEFAULT_PREFS, sleepAfter: 0 };
const exprRow = section("Expressions / activities");
const cases: [string, (b: PetBrain) => void, number][] = [
	["neutral", () => {}, 30],
	["poke → happy", (b) => b.dispatch({ type: "poke" }), 8],
	["curious", (b) => b.dispatch({ type: "stroke" }), 30],
	["annoyed", (b) => { for (let i = 0; i < 3; i++) b.dispatch({ type: "poke" }); }, 30],
	["dizzy", (b) => { for (let i = 0; i < 6; i++) b.dispatch({ type: "poke" }); }, 30],
	["worried", (b) => b.dispatch({ type: "alert", kind: "low-battery" }), 40],
	["surprised", (b) => b.dispatch({ type: "alert", kind: "notification" }), 12],
	["sleep", (b) => b.dispatch({ type: "sleep" }), 60],
	["dance", (b) => b.dispatch({ type: "music", playing: true }), 50],
	["celebrate", (b) => b.dispatch({ type: "focus", phase: "complete" }), 22],
	["wave", (b) => b.dispatch({ type: "wave" }), 20],
	["drag", (b) => b.dispatch({ type: "drag-start" }), 30]
];
for (const [label, fn, frames] of cases) cell(exprRow, label, { ...base }, fn, frames);

const colorRow = section("Colours");
for (const c of PET_COLORS) cell(colorRow, c, { ...base, color: c }, (b) => b.dispatch({ type: "poke" }), 60);

const outfitRow = section("Outfits");
for (const o of PET_OUTFITS) cell(outfitRow, o, { ...base, outfit: o }, () => {}, 30);

const sizeRow = section("Sizes (island bubble 28, panel 96, desktop 150)");
for (const s of [28, 40, 96, 150]) cell(sizeRow, `${s}px`, { ...base }, () => {}, 30, s);

(window as any).ready = true;
