import { useEffect, useState } from "react";
import { Hand, Home, Monitor, Moon, Sun, Cookie } from "lucide-react";
import { getBrain } from "./brainStore";
import { sendPetCommand, sendPetEvent } from "./bus";
import { heartsFor, moodText, bondLabel } from "./mood";
import { PetCanvas } from "./PetCanvas";
import { usePetPrefs } from "./prefs";
import "./pet.css";

function Heart({ on }: { on: boolean }) {
	return (
		<svg className={`pet-heart ${on ? "on" : ""}`} viewBox="0 0 24 24" aria-hidden>
			<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2 0 3.7 1.1 5.4 3.2 1.7-2.1 3.4-3.2 5.4-3.2 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z" fill="#ff6b8b" />
		</svg>
	);
}

/** The island's Pet mode: a larger Lumi, how it feels, and a few real actions. */
export function PetPanel() {
	const prefs = usePetPrefs();
	const [info, setInfo] = useState(() => ({ text: "", hearts: 0, asleep: false, bondLevel: 0, bondTier: "" }));

	useEffect(() => {
		const read = () => {
			const brain = getBrain();
			const v = brain.peek();
			const snap = brain.snapshot();
			setInfo((prev) => {
				const next = {
					text: moodText(v, brain.isFocusing),
					hearts: heartsFor(v.affection),
					asleep: v.asleep,
					bondLevel: brain.bondLevel,
					bondTier: bondLabel(snap.totalInteractions)
				};
				return (
					prev.text === next.text &&
					prev.hearts === next.hearts &&
					prev.asleep === next.asleep &&
					prev.bondLevel === next.bondLevel
						? prev
						: next
				);
			});
		};
		read();
		const id = setInterval(read, 400);
		return () => clearInterval(id);
	}, []);

	const onDesktop = prefs.home === "desktop";

	return (
		<div className="pet-panel" onClick={(e) => e.stopPropagation()}>
			<div className="pet-panel-stage">
				<PetCanvas size={Math.round(92 * Math.min(1.1, prefs.size))} shadow title={`Poke ${prefs.name}`} />
			</div>
			<div className="pet-panel-info">
				<div className="pet-panel-name">{prefs.name}</div>
				<div className="pet-panel-mood">{info.text}</div>
				<div className="pet-hearts" title="How much Lumi likes you" aria-label={`Affection ${info.hearts} of 5`}>
					{[0, 1, 2, 3, 4].map((i) => (
						<Heart key={i} on={i < info.hearts} />
					))}
				</div>
				<div className="pet-bond-tier" title={`${info.bondLevel * 100}+ interactions`}>
					{info.bondTier}
				</div>
				<div className="pet-actions">
					<button
						type="button"
						className="pet-action"
						onClick={() => {
							getBrain().dispatch({ type: "wave" });
						}}
					>
						<Hand size={12} /> Wave
					</button>
					<button
						type="button"
						className="pet-action"
						title="Give Lumi a treat"
						onClick={() => {
							sendPetEvent({ type: "feed" });
						}}
					>
						<Cookie size={12} /> Feed
					</button>
					<button
						type="button"
						className="pet-action"
						onClick={() => {
							getBrain().dispatch({ type: info.asleep ? "wake" : "sleep" });
						}}
					>
						{info.asleep ? <Sun size={12} /> : <Moon size={12} />} {info.asleep ? "Wake" : "Nap"}
					</button>
					<button type="button" className="pet-action" onClick={() => sendPetCommand({ cmd: onDesktop ? "go-home" : "go-desktop" })}>
						{onDesktop ? <Home size={12} /> : <Monitor size={12} />} {onDesktop ? "Home" : "Desktop"}
					</button>
				</div>
			</div>
		</div>
	);
}
