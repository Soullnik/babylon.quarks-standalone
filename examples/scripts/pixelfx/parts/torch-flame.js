// The torch's flame alone, for a flipbook: no wrap, smoke, puffs, licks, embers or light.
import { fit } from "../../core/index.js";
import { noiseFor, hotFirst, burn } from "../fire/_lib.js";
export const meta = { name: "Torch flame", size: [40, 48], origin: [20, 44], duration: 2, loop: true, fps: 12, bg: "none",
  options: { palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"], seed: 4 } };
const D = meta.duration, NL = noiseFor(D);
const TONGUES = [[-1.9, -1, 0.74, 2.0, 1], [2.1, -1, 0.7, 2.0, 1], [-3.4, 0.5, 0.42, 1.6, 0], [3.6, 0.5, 0.46, 1.6, 0], [0, 0, 1, 2.9, 0]];
export function draw(p, t, o) {
  const H = hotFirst(fit(o.palette, 9));
  burn(p, t, TONGUES, { H, D, NL, S: o.seed, x: 0, y: 0, height: 20, lean: 0.12, spread: 4, puffs: 0, licks: 0, smoke: 0, embers: 0, glow: 0, wind: 2 });
}
