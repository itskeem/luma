import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getBrain } from "./brainStore";
import { inTauri } from "./bus";
import { gazeToward, subscribeCursor, windowOrigin } from "./cursor";
import { PetEngine } from "./engine";
import { getPrefs, usePetPrefs } from "./prefs";

interface PetCanvasProps {
	/** Side of the square canvas in CSS pixels. */
	size: number;
	/** Soft ground shadow beneath the feet. */
	shadow?: boolean;
	className?: string;
	/** Fires once when a press on the pet turns into a drag. */
	onDragStart?: (e: PointerEvent) => void;
	onDoubleClick?: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	/** Pokes are suppressed (the owner handles clicks itself). */
	passive?: boolean;
	title?: string;
	/** Gives the owner the engine (to set drag velocity, wake the loop). */
	onEngine?: (engine: PetEngine | null) => void;
}

const DRAG_THRESHOLD = 5;
const STROKE_AFTER_MS = 800;
const DOUBLE_CLICK_MS = 260;

/**
 * Hosts a PetEngine on a canvas: feeds it the cursor and audio, and turns
 * clicks, hovers and drags into brain events. Rendering and behaviour live in
 * engine.ts / brain.ts; this is only the glue to the DOM.
 */
export function PetCanvas({ size, shadow, className, onDragStart, onDoubleClick, onContextMenu, passive, title, onEngine }: PetCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const engineRef = useRef<PetEngine | null>(null);
	const prefs = usePetPrefs();
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const onEngineRef = useRef(onEngine);
	onEngineRef.current = onEngine;
	const onDoubleClickRef = useRef(onDoubleClick);
	onDoubleClickRef.current = onDoubleClick;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const engine = new PetEngine({ canvas, brain: getBrain(), getPrefs, size: sizeRef.current, shadow });
		engineRef.current = engine;
		onEngineRef.current?.(engine);
		engine.start();
		return () => {
			engine.stop();
			engineRef.current = null;
			onEngineRef.current?.(null);
		};
	}, [shadow]);

	useEffect(() => {
		engineRef.current?.resize(size);
	}, [size]);

	// Cursor → gaze.
	useEffect(() => {
		const engine = engineRef.current;
		const canvas = canvasRef.current;
		if (!engine || !canvas) return;
		if (!prefs.followCursor) {
			engine.setGaze(null);
			return;
		}
		const off = subscribeCursor((p) => {
			const r = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const origin = inTauri() ? windowOrigin() : { x: 0, y: 0 };
			const g = gazeToward(p, origin.x + (r.left + r.width / 2) * dpr, origin.y + (r.top + r.height * 0.55) * dpr);
			engine.setGaze(g.x, g.y);
		});
		return () => {
			off();
			engine.setGaze(null);
		};
	}, [prefs.followCursor]);

	// Audio loudness → dance energy (only emitted by the backend while music plays).
	useEffect(() => {
		if (!inTauri()) return;
		let un: (() => void) | null = null;
		let stopped = false;
		listen<{ frequencies: number[] }>("audio-visualization", (e) => {
			const f = e.payload.frequencies;
			if (!f?.length) return;
			const low = f.slice(0, Math.max(1, Math.ceil(f.length / 2)));
			engineRef.current?.setAudioLevel(low.reduce((a, b) => a + b, 0) / low.length);
		})
			.then((f) => (stopped ? f() : (un = f)))
			.catch(() => {});
		return () => {
			stopped = true;
			un?.();
		};
	}, []);

	// Pointer: click = poke, hover = stroke, press-and-move = drag.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || passive) return;
		let down: { x: number; y: number; id: number } | null = null;
		let dragged = false;
		let strokeTimer: ReturnType<typeof setTimeout> | null = null;
		let pokeTimer: ReturnType<typeof setTimeout> | null = null;

		const onEnter = () => {
			strokeTimer = setTimeout(() => {
				getBrain().dispatch({ type: "stroke" });
				engineRef.current?.wakeLoop();
			}, STROKE_AFTER_MS);
		};
		const onLeave = () => {
			if (strokeTimer) clearTimeout(strokeTimer);
			strokeTimer = null;
		};
		const onDown = (e: PointerEvent) => {
			if (e.button !== 0) return;
			down = { x: e.clientX, y: e.clientY, id: e.pointerId };
			dragged = false;
			canvas.setPointerCapture(e.pointerId);
		};
		const onMove = (e: PointerEvent) => {
			if (!down || dragged || !onDragStart) return;
			if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD) {
				dragged = true;
				canvas.releasePointerCapture(down.id);
				onDragStart(e);
			}
		};
		// With a double-click action the poke waits a beat, so opening the
		// panel doesn't also count as three pokes and annoy Lumi.
		const poke = () => {
			getBrain().dispatch({ type: "poke" });
			engineRef.current?.wakeLoop();
		};
		const onUp = () => {
			if (down && !dragged) {
				if (!onDoubleClickRef.current) poke();
				else {
					if (pokeTimer) clearTimeout(pokeTimer);
					pokeTimer = setTimeout(poke, DOUBLE_CLICK_MS);
				}
			}
			down = null;
		};
		const onDbl = () => {
			if (pokeTimer) clearTimeout(pokeTimer);
			pokeTimer = null;
		};
		canvas.addEventListener("pointerenter", onEnter);
		canvas.addEventListener("pointerleave", onLeave);
		canvas.addEventListener("pointerdown", onDown);
		canvas.addEventListener("pointermove", onMove);
		canvas.addEventListener("pointerup", onUp);
		canvas.addEventListener("dblclick", onDbl);
		canvas.addEventListener("pointercancel", () => (down = null));
		return () => {
			onLeave();
			canvas.removeEventListener("pointerenter", onEnter);
			canvas.removeEventListener("pointerleave", onLeave);
			canvas.removeEventListener("pointerdown", onDown);
			canvas.removeEventListener("pointermove", onMove);
			canvas.removeEventListener("pointerup", onUp);
			canvas.removeEventListener("dblclick", onDbl);
			if (pokeTimer) clearTimeout(pokeTimer);
		};
	}, [passive, onDragStart]);

	return (
		<canvas
			ref={canvasRef}
			className={className}
			title={title}
			onDoubleClick={onDoubleClick}
			onContextMenu={onContextMenu}
			style={{ display: "block", touchAction: "none", userSelect: "none", cursor: "pointer" }}
		/>
	);
}
