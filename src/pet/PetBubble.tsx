import { forwardRef } from "react";
import { motion } from "framer-motion";
import { dragOutOfIsland } from "./floating";
import { PetCanvas } from "./PetCanvas";
import "./pet.css";

interface PetBubbleProps {
	/** Offset from the pill's centre, to sit past the pill's edge. */
	offset: number;
	side: "left" | "right";
	onOpenPanel: () => void;
	onSettled: () => void;
	/** The pill is hovered: use the deeper "expanded" background. */
	expanded: boolean;
}

/**
 * Lumi beside the collapsed pill. A click pokes it, a double-click opens the
 * Pet panel, and dragging it out sets it loose on the desktop.
 */
export const PetBubble = forwardRef<HTMLDivElement, PetBubbleProps>(function PetBubble(
	{ offset, side, onOpenPanel, onSettled, expanded },
	ref
) {
	const anchor = side === "left" ? { right: "50%", marginRight: offset } : { left: "50%", marginLeft: offset };
	const from = side === "left" ? 28 : -28;
	return (
		<motion.div
			ref={ref}
			className={`activity-bubble pet-bubble ${expanded ? "expanded" : ""}`}
			style={anchor}
			initial={{ opacity: 0, scale: 0.4, x: from }}
			animate={{ opacity: 1, scale: 1, x: 0 }}
			exit={{ opacity: 0, scale: 0.4, x: from }}
			transition={{ type: "spring", stiffness: 400, damping: 31, opacity: { duration: 0.15 } }}
			onAnimationComplete={onSettled}
			onClick={(e) => e.stopPropagation()}
		>
			<PetCanvas size={38} onDragStart={() => void dragOutOfIsland()} onDoubleClick={onOpenPanel} title="Lumi: click to poke, double-click for more, drag to the desktop" />
		</motion.div>
	);
});
