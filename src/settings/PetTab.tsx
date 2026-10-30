import { useEffect, useState } from "react";
import { Bed, Eye, Gauge, Home, Monitor, Music, PawPrint, Ruler, Shirt, Sparkles, Timer, Type, Layers, Maximize, Heart, Download, Upload } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { PetCanvas } from "../pet/PetCanvas";
import { sendPetCommand } from "../pet/bus";
import { PALETTES } from "../pet/palette";
import { getPrefs, getState, SIZE_MAX, SIZE_MIN, SLEEP_AFTER_CHOICES, updatePrefs, updateState, usePetPrefs } from "../pet/prefs";
import { PET_COLORS, PET_OUTFITS, type PetOutfit } from "../pet/types";
import { getBrain } from "../pet/brainStore";
import { heartsFor, bondLabel } from "../pet/mood";
import "../pet/pet.css";

const OUTFIT_LABELS: Record<PetOutfit, string> = {
	none: "None",
	bow: "Bow",
	partyHat: "Party hat",
	glasses: "Glasses",
	headphones: "Headphones",
	scarf: "Scarf",
	crown: "Crown",
	cape: "Cape",
	sunglasses: "Sunglasses"
};

const sleepLabel = (m: number) => (m === 0 ? "Never" : `${m} min`);

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<label className="toggle-switch">
			<input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
			<span className="slider"></span>
		</label>
	);
}

/** Affection meter: 5 hearts that fill based on the current affection level. */
function AffectionMeter() {
	const [info, setInfo] = useState({ hearts: 0, affection: 0, interactions: 0, tier: "" });

	useEffect(() => {
		const read = () => {
			try {
				const brain = getBrain();
				const v = brain.peek();
				const snap = brain.snapshot();
				setInfo({
					hearts: heartsFor(v.affection),
					affection: Math.round(v.affection * 100),
					interactions: snap.totalInteractions,
					tier: bondLabel(snap.totalInteractions)
				});
			} catch {
				/* brain may not be ready yet */
			}
		};
		read();
		const id = setInterval(read, 1000);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="pet-affection-meter">
			<div className="pet-affection-hearts" title={`Affection: ${info.affection}%`}>
				{[0, 1, 2, 3, 4].map((i) => (
					<Heart key={i} size={14} className={`pet-affection-heart ${i < info.hearts ? "filled" : ""}`} />
				))}
				<span className="pet-affection-pct">{info.affection}%</span>
			</div>
			<div className="pet-affection-bond">
				{info.tier} · {info.interactions} interactions
			</div>
		</div>
	);
}

/** Export prefs + state as JSON to clipboard; import from clipboard. */
async function exportPrefs() {
	const data = JSON.stringify({ prefs: getPrefs(), state: getState() }, null, 2);
	try {
		await navigator.clipboard.writeText(data);
		alert("Pet settings copied to clipboard ✓");
	} catch {
		prompt("Copy this JSON:", data);
	}
}

async function importPrefs() {
	let text: string;
	try {
		text = await navigator.clipboard.readText();
	} catch {
		const input = prompt("Paste pet settings JSON:");
		if (!input) return;
		text = input;
	}
	try {
		const data = JSON.parse(text);
		if (data?.prefs) updatePrefs(data.prefs);
		if (data?.state) updateState(data.state);
		alert("Pet settings imported ✓");
	} catch {
		alert("Invalid JSON — couldn't import settings.");
	}
}

export function PetTab() {
	const prefs = usePetPrefs();
	const onDesktop = prefs.home === "desktop";
	const intensityLabel = prefs.intensity === 0 ? "Perfectly still" : prefs.intensity < 0.4 ? "Calm" : prefs.intensity < 0.75 ? "Balanced" : "Lively";

	return (
		<>
			<div className="setting-group-label">Companion</div>
			<div className="setting-group">
				<SettingRow icon={PawPrint} label="Show Lumi" desc="Your little desktop companion">
					<Toggle label="Show Lumi" checked={prefs.enabled} onChange={(enabled) => updatePrefs({ enabled })} />
				</SettingRow>
				{prefs.enabled && (
					<div className="pet-preview">
						<PetCanvas size={Math.round(130 * Math.min(1.1, prefs.size))} shadow title="Say hi" />
					</div>
				)}
				<SettingRow icon={Type} label="Name" desc="Shown in the Pet panel" divider={false}>
					<input
						className="pet-name-input"
						value={prefs.name}
						maxLength={16}
						aria-label="Pet name"
						onChange={(e) => updatePrefs({ name: e.target.value })}
						onBlur={(e) => updatePrefs({ name: e.target.value.trim() || "Lumi" })}
					/>
				</SettingRow>
			</div>

			{prefs.enabled && (
				<>
					<div className="setting-group-label setting-group-label--spaced">Bond</div>
					<div className="setting-group">
						<SettingRow icon={Heart} label="Affection" desc="How much Lumi likes you" divider={false}>
							<AffectionMeter />
						</SettingRow>
					</div>
				</>
			)}

			<div className="setting-group-label setting-group-label--spaced">Appearance</div>
			<div className="setting-group">
				<SettingRow icon={Sparkles} label="Colour" desc={PALETTES[prefs.color].label}>
					<div className="pet-swatches" role="radiogroup" aria-label="Colour">
						{PET_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								role="radio"
								aria-checked={prefs.color === c}
								aria-label={PALETTES[c].label}
								title={PALETTES[c].label}
								className={`pet-swatch ${prefs.color === c ? "active" : ""}`}
								style={{ background: `linear-gradient(135deg, ${PALETTES[c].light}, ${PALETTES[c].base} 55%, ${PALETTES[c].dark})` }}
								onClick={() => updatePrefs({ color: c })}
							/>
						))}
					</div>
				</SettingRow>
				<SettingRow icon={Shirt} label="Outfit" desc={OUTFIT_LABELS[prefs.outfit]}>
					<div className="pet-chip-row" role="radiogroup" aria-label="Outfit">
						{PET_OUTFITS.map((o) => (
							<button
								key={o}
								type="button"
								role="radio"
								aria-checked={prefs.outfit === o}
								className={`pet-chip ${prefs.outfit === o ? "active" : ""}`}
								onClick={() => updatePrefs({ outfit: o })}
							>
								{OUTFIT_LABELS[o]}
							</button>
						))}
					</div>
				</SettingRow>
				<SettingRow icon={Ruler} label="Size" desc={`${Math.round(prefs.size * 100)}% (desktop and Pet panel)`} divider={false}>
					<input
						type="range"
						className="pet-range"
						min={SIZE_MIN}
						max={SIZE_MAX}
						step={0.05}
						value={prefs.size}
						aria-label="Size"
						onChange={(e) => updatePrefs({ size: parseFloat(e.target.value) })}
					/>
				</SettingRow>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Behaviour</div>
			<div className="setting-group">
				<SettingRow icon={Gauge} label="Animation intensity" desc={`${intensityLabel}. How often Lumi does things on its own.`}>
					<input
						type="range"
						className="pet-range"
						min={0}
						max={1}
						step={0.1}
						value={prefs.intensity}
						aria-label="Animation intensity"
						onChange={(e) => updatePrefs({ intensity: parseFloat(e.target.value) })}
					/>
				</SettingRow>
				<SettingRow icon={Eye} label="Follow the cursor" desc="Eyes track the mouse across the screen">
					<Toggle label="Follow the cursor" checked={prefs.followCursor} onChange={(followCursor) => updatePrefs({ followCursor })} />
				</SettingRow>
				<SettingRow icon={Music} label="Dance to music" desc="Moves with what is playing">
					<Toggle label="Dance to music" checked={prefs.danceToMusic} onChange={(danceToMusic) => updatePrefs({ danceToMusic })} />
				</SettingRow>
				<SettingRow icon={Timer} label="Quiet while focusing" desc="No spontaneous animations during a focus timer">
					<Toggle label="Quiet while focusing" checked={prefs.quietDuringFocus} onChange={(quietDuringFocus) => updatePrefs({ quietDuringFocus })} />
				</SettingRow>
				<SettingRow icon={Bed} label="Nap after" desc="Time without any activity" divider={false}>
					<div className="pet-chip-row" role="radiogroup" aria-label="Nap after">
						{SLEEP_AFTER_CHOICES.map((m) => (
							<button
								key={m}
								type="button"
								role="radio"
								aria-checked={prefs.sleepAfter === m}
								className={`pet-chip ${prefs.sleepAfter === m ? "active" : ""}`}
								onClick={() => updatePrefs({ sleepAfter: m })}
							>
								{sleepLabel(m)}
							</button>
						))}
					</div>
				</SettingRow>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Where Lumi lives</div>
			<div className="setting-group">
				<SettingRow
					icon={onDesktop ? Home : Monitor}
					label={onDesktop ? "Bring Lumi back to the island" : "Send Lumi to the desktop"}
					desc={onDesktop ? "Lumi is on your desktop. You can also drop it onto the island." : "Or drag it out of the island yourself."}
					action
					onClick={() => sendPetCommand({ cmd: onDesktop ? "go-home" : "go-desktop" })}
				/>
				<SettingRow icon={Layers} label="Stay above other windows" desc="For the desktop pet">
					<Toggle label="Stay above other windows" checked={prefs.floatOnTop} onChange={(floatOnTop) => updatePrefs({ floatOnTop })} />
				</SettingRow>
				<SettingRow icon={Maximize} label="Step aside for fullscreen apps" desc="Hides the desktop pet behind games and videos" divider={false}>
					<Toggle label="Step aside for fullscreen apps" checked={prefs.hideInFullscreen} onChange={(hideInFullscreen) => updatePrefs({ hideInFullscreen })} />
				</SettingRow>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Data</div>
			<div className="setting-group">
				<SettingRow icon={Download} label="Export settings" desc="Copy all pet settings and state as JSON" action onClick={exportPrefs} />
				<SettingRow icon={Upload} label="Import settings" desc="Paste previously exported JSON from clipboard" action divider={false} onClick={importPrefs} />
			</div>
		</>
	);
}
