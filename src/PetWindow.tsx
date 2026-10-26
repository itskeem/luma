// The floating desktop pet: Lumi in a small transparent window of its own.
// The island owns this window's lifecycle (src/pet/floating.ts); this page
// draws Lumi, lets you drag it around, and sends requests back to the island.

import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/window";
import { Home, Moon, Settings, Sun } from "lucide-react";
import { getBrain } from "./pet/brainStore";
import { sendPetCommand } from "./pet/bus";
import { dragWindowWithCursor } from "./pet/dragWindow";
import type { PetEngine } from "./pet/engine";
import { finishDrop } from "./pet/floating";
import { petWindowSize } from "./pet/geometry";
import { PetCanvas } from "./pet/PetCanvas";
import { usePetPrefs } from "./pet/prefs";
import "./pet/pet.css";

const win = getCurrentWebviewWindow();
const PARKED = { x: -32000, y: -32000 };

function PetWindowApp() {
	const prefs = usePetPrefs();
	const engineRef = useRef<PetEngine | null>(null);
	const [menu, setMenu] = useState(false);
	const [asleep, setAsleep] = useState(false);
	const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const size = petWindowSize(prefs.size);

	// Ask the island for the current music/focus state we may have missed.
	useEffect(() => {
		sendPetCommand({ cmd: "sync" });
	}, []);

	useEffect(() => {
		win.setAlwaysOnTop(prefs.floatOnTop).catch(() => {});
	}, [prefs.floatOnTop]);

	// Keep the menu's sleep/wake label honest.
	useEffect(() => {
		const id = setInterval(() => setAsleep(getBrain().isAsleep), 500);
		return () => clearInterval(id);
	}, []);

	// Step aside while an app is fullscreen: park the window off-screen (hiding
	// and re-showing a window can steal focus) and come back to the same spot.
	useEffect(() => {
		if (!prefs.hideInFullscreen) return;
		let parked: { x: number; y: number } | null = null;
		let busy = false;
		const check = async () => {
			if (busy) return;
			busy = true;
			try {
				const fs = await invoke<boolean>("foreground_fullscreen");
				if (fs && !parked) {
					const p = await win.outerPosition();
					parked = { x: p.x, y: p.y };
					await win.setPosition(new PhysicalPosition(PARKED.x, PARKED.y));
				} else if (!fs && parked) {
					await win.setPosition(new PhysicalPosition(parked.x, parked.y));
					parked = null;
				}
			} catch {
				/* command unavailable: stay put */
			} finally {
				busy = false;
			}
		};
		const id = setInterval(check, 2000);
		return () => {
			clearInterval(id);
			if (parked) win.setPosition(new PhysicalPosition(parked.x, parked.y)).catch(() => {});
		};
	}, [prefs.hideInFullscreen]);

	const openMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setMenu(true);
		if (menuTimer.current) clearTimeout(menuTimer.current);
		menuTimer.current = setTimeout(() => setMenu(false), 5000);
	}, []);

	const onDragStart = useCallback(async (e: PointerEvent) => {
		setMenu(false);
		const dpr = window.devicePixelRatio || 1;
		const physical = Math.round(window.innerWidth * dpr);
		const brain = getBrain();
		brain.dispatch({ type: "drag-start" });
		engineRef.current?.wakeLoop();
		const result = await dragWindowWithCursor(win, { x: e.clientX * dpr, y: e.clientY * dpr }, (_p, vx) => engineRef.current?.setDragVelocity(vx));
		engineRef.current?.setDragVelocity(0);
		if ((await finishDrop(win, result.position, physical)) === "home") {
			sendPetCommand({ cmd: "go-home" });
		} else {
			brain.dispatch({ type: "drag-end" });
		}
	}, []);

	return (
		<div style={{ width: size, height: size, position: "relative" }} onMouseLeave={() => setMenu(false)}>
			<PetCanvas
				size={size}
				shadow
				title={`${prefs.name}: click to poke, drag to move, double-click to go home`}
				onDragStart={onDragStart}
				onDoubleClick={() => sendPetCommand({ cmd: "go-home" })}
				onContextMenu={openMenu}
				onEngine={(e) => (engineRef.current = e)}
			/>
			{menu && (
				<div className="pet-menu" role="menu">
					<button type="button" role="menuitem" title="Back to the island" aria-label="Back to the island" onClick={() => sendPetCommand({ cmd: "go-home" })}>
						<Home size={15} />
					</button>
					<button
						type="button"
						role="menuitem"
						title={asleep ? "Wake up" : "Take a nap"}
						aria-label={asleep ? "Wake up" : "Take a nap"}
						onClick={() => {
							const cmd = asleep ? "wake" : "sleep";
							getBrain().dispatch({ type: cmd });
							engineRef.current?.wakeLoop();
							setAsleep(!asleep);
							setMenu(false);
						}}
					>
						{asleep ? <Sun size={15} /> : <Moon size={15} />}
					</button>
					<button type="button" role="menuitem" title="Pet settings" aria-label="Pet settings" onClick={() => invoke("open_settings_window").catch(() => {})}>
						<Settings size={15} />
					</button>
				</div>
			)}
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<PetWindowApp />
	</StrictMode>
);
