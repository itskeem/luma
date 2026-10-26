// One PetBrain per window, shared by every canvas in it (island bubble, panel,
// floating window), wired to preferences and to the window bus.

import { PetBrain } from "./brain";
import { onPetEvent } from "./bus";
import { getPrefs, getState, subscribePrefs, updateState, wirePrefsSync } from "./prefs";

let brain: PetBrain | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getBrain(): PetBrain {
	if (brain) return brain;
	wirePrefsSync();
	const state = getState();
	brain = new PetBrain(
		getPrefs(),
		{ now: () => performance.now(), rand: Math.random },
		{ affection: state.affection, lastSeen: state.lastSeen }
	);
	subscribePrefs((p) => brain?.setPrefs(p));
	onPetEvent((e) => brain?.dispatch(e));

	// Affection changes slowly; save it now and then and on the way out.
	const save = () => {
		if (!brain) return;
		const s = brain.snapshot();
		if (Math.abs(s.affection - getState().affection) > 0.005) updateState(s);
	};
	saveTimer = setInterval(save, 60_000);
	window.addEventListener("pagehide", save);
	return brain;
}

export function disposeBrain() {
	if (saveTimer) clearInterval(saveTimer);
	saveTimer = null;
	brain = null;
}
