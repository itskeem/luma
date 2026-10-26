// Developer-only: draws Luma's app icon with the in-app renderer so the logo
// and the pet always match. Used by scripts/gen-icon.mjs.
import { drawLumi, NEUTRAL_POSE, NEUTRAL_FACE } from "../src/pet/render";

const N = 1024;
const c = document.getElementById("c") as HTMLCanvasElement;
c.width = N; c.height = N;
const ctx = c.getContext("2d")!;
const r = N * 0.225;
ctx.beginPath();
ctx.roundRect(0, 0, N, N, r);
ctx.clip();
const g = ctx.createLinearGradient(0, 0, N, N);
g.addColorStop(0, "#2b2150");
g.addColorStop(1, "#120d26");
ctx.fillStyle = g;
ctx.fillRect(0, 0, N, N);
const halo = ctx.createRadialGradient(N / 2, N * 0.42, 10, N / 2, N * 0.42, N * 0.55);
halo.addColorStop(0, "rgba(255,196,138,0.35)");
halo.addColorStop(1, "rgba(255,196,138,0)");
ctx.fillStyle = halo;
ctx.fillRect(0, 0, N, N);
ctx.save();
ctx.translate(N * 0.085, N * 0.04);
const pose = { ...NEUTRAL_POSE, glow: 1.1, face: { ...NEUTRAL_FACE, eyeArc: 0.9, mouthOpen: 0.6, mouthCurve: 1, cheek: 0.9 } };
// drawLumi clears its canvas; draw into a scratch canvas then composite.
const tmp = document.createElement("canvas");
tmp.width = tmp.height = N;
drawLumi(tmp.getContext("2d")!, { size: N, pose, color: "peach", outfit: "none", particles: [], time: 0 });
ctx.drawImage(tmp, 0, 0, N * 0.83, N * 0.83);
ctx.restore();
(window as any).ready = true;
