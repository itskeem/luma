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
		{
			affection: state.affection,
			lastSeen: state.lastSeen,
			totalInteractions: state.totalInteractions ?? 0,
			milestonesReached: state.milestonesReached ?? 0
		}
	);
	subscribePrefs((p) => brain?.setPrefs(p));
	onPetEvent((e) => brain?.dispatch(e));

	// Affection and interaction count change over time; save periodically and on exit.
	const save = () => {
		if (!brain) return;
		const s = brain.snapshot();
		const cur = getState();
		const changed =
			Math.abs(s.affection - cur.affection) > 0.005 ||
			s.totalInteractions !== (cur.totalInteractions ?? 0) ||
			s.milestonesReached !== (cur.milestonesReached ?? 0);
		if (changed) updateState(s);
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
