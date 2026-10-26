// Everything the island window does for the pet: tells it what is happening
// (music, focus timer, battery), restores it to the desktop on launch, and
// carries out requests from the pet window and Settings. Lives in the island
// because that window is always running and owns the floating window.

import { useEffect, useRef } from "react";
import { onPetCommand, sendPetEvent } from "./bus";
import { closePetWindow, getPetWindow, goHome, sendToDesktop } from "./floating";
import { usePetPrefs, wirePrefsSync } from "./prefs";
import type { PetPrefs } from "./types";

export interface IslandFacts {
	/** Only the main island window runs the pet's plumbing. */
	active: boolean;
	musicPlaying: boolean;
	timerRunning: boolean;
	timerSeconds: number;
	timerFinished: boolean;
	/** Edge-triggered flags from the island: true for the moment an event happens. */
	chargingPulse: boolean;
	lowBatteryPulse: boolean;
}

export function useIslandPet(facts: IslandFacts): PetPrefs {
	const prefs = usePetPrefs();
	const factsRef = useRef(facts);
	factsRef.current = facts;

	// Music.
	useEffect(() => {
		if (!facts.active) return;
		sendPetEvent({ type: "music", playing: facts.musicPlaying });
	}, [facts.active, facts.musicPlaying]);

	// Focus timer: start/resume, pause, complete.
	const prev = useRef({ running: false, finished: false });
	useEffect(() => {
		if (!facts.active) return;
		const p = prev.current;
		if (facts.timerFinished && !p.finished) sendPetEvent({ type: "focus", phase: "complete" });
		else if (facts.timerRunning && !p.running) sendPetEvent({ type: "focus", phase: "start" });
		else if (!facts.timerRunning && p.running && !facts.timerFinished) {
			sendPetEvent({ type: "focus", phase: facts.timerSeconds > 0 ? "pause" : "reset" });
		}
		prev.current = { running: facts.timerRunning, finished: facts.timerFinished };
	}, [facts.active, facts.timerRunning, facts.timerFinished, facts.timerSeconds]);

	// Battery moments.
	useEffect(() => {
		if (facts.active && facts.chargingPulse) sendPetEvent({ type: "alert", kind: "charging" });
	}, [facts.active, facts.chargingPulse]);
	useEffect(() => {
		if (facts.active && facts.lowBatteryPulse) sendPetEvent({ type: "alert", kind: "low-battery" });
	}, [facts.active, facts.lowBatteryPulse]);

	// Requests from the pet window and Settings.
	useEffect(() => {
		if (!facts.active) return;
		wirePrefsSync();
		return onPetCommand((c) => {
			switch (c.cmd) {
				case "go-desktop":
					void sendToDesktop();
					break;
				case "go-home":
					void goHome(c.wave ?? true);
					break;
				case "wave":
				case "sleep":
				case "wake":
					sendPetEvent({ type: c.cmd });
					break;
				case "sync": {
					const f = factsRef.current;
					sendPetEvent({ type: "music", playing: f.musicPlaying });
					if (f.timerRunning) sendPetEvent({ type: "focus", phase: "resume" });
					break;
				}
			}
		});
	}, [facts.active]);

	// Put Lumi where it was last time, and keep the floating window in step
	// with the "enabled" switch and the saved home.
	const greeted = useRef(false);
	useEffect(() => {
		if (!facts.active) return;
		if (!prefs.enabled) {
			void closePetWindow();
			return;
		}
		if (prefs.home === "desktop") {
			void getPetWindow().then((w) => (w ? undefined : sendToDesktop()));
		} else if (!greeted.current) {
			sendPetEvent({ type: "wave" });
		}
		greeted.current = true;
	}, [facts.active, prefs.enabled, prefs.home]);

	return prefs;
}
