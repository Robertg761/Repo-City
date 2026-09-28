/**
 * The street incidents' Blender kit (`blender/incidents2/incident_kit.py`):
 * weeds, debris, skid marks, the pothole and its spoil, the scorch patch, the
 * patches under every incident, the flames and the beacon's mast, placed at the
 * procedural scenes' own positions when `BLENDER_MODELS` is on.
 *
 * Marks that run as long as their scene needs (a skid, a mast) are laid from
 * whole pieces at their real size and never stretched.
 *
 * The model is only read inside functions (never while a module is evaluated).
 */

import { BufferGeometry } from "three";
import { desaturate, mix } from "../../palette";
import { importedParts } from "../imported";
import { mergeParts, type Part, type Triple } from "./geometry";
import { frame, moved } from "./siteKit";
import { MODEL as KIT } from "./incidentKit.model";

/** Just above the dark patch the incident draws on the tarmac. */
export const DECAL_Y = 0.135;

/** The kit's own colours, for the roles the scene repaints. */
const WEED = "#7fa46a";
const WEED_DRY = "#b3aa6c";
const DEBRIS = "#8c8880";

const node = (name: string, paint: (hex: string) => string): Part[] => importedParts(KIT, name, paint);

/** A tuft the scene wants: where, how tall its procedural cone was, and how it is turned. */
export interface Weed {
  x: number;
  z: number;
  /** The height of the procedural cone the tuft stands in for. */
  height: number;
  turn: number;
  y?: number;
}

const TUFT_HEIGHTS = [0.55, 0.8, 1.05];

/** Tufts of grass at each spot, the nearest of the three modelled sizes scaled a little to fit. */
export function weedParts(weeds: readonly Weed[], color: string): Part[] {
  const dry = mix(color, "#d3ca82", 0.5);
  const paint = (hex: string) => (hex === WEED ? color : hex === WEED_DRY ? dry : hex);
  const parts: Part[] = [];
  for (const { x, z, height, turn, y = 0 } of weeds) {
    let best = 0;
    TUFT_HEIGHTS.forEach((h, i) => {
      if (Math.abs(h - height) < Math.abs(TUFT_HEIGHTS[best] - height)) best = i;
    });
    const scale = height / TUFT_HEIGHTS[best];
    parts.push(...node(`Weed${best}`, paint).map((part) => ({ ...part, position: [x, y, z] as Triple, rotation: [0, turn, 0] as Triple, scale })));
  }
  return parts;
}

/** The pieces a collision leaves in the road, in this order round the scatter. */
const DEBRIS_PIECES = ["DebrisPlate", "DebrisBumper", "DebrisHub", "DebrisGlass"];

/** One piece of debris on the road at `x, z`, its size a procedural box's `size`. */
export function debrisPiece(index: number, x: number, z: number, size: number, turn: number, color: string, shade: (hex: string) => string): Part[] {
  const scale = 0.65 + ((size - 0.12) / 0.22) * 0.5;
  const paint = (hex: string) => (hex === DEBRIS ? color : shade(hex));
  return node(DEBRIS_PIECES[index % DEBRIS_PIECES.length], paint).map((part) => ({
    ...part,
    position: [x, DECAL_Y, z] as Triple,
    rotation: [0, turn, 0] as Triple,
    scale,
  }));
}

/** The length of one tile of tyre mark. */
export const SKID_TILE = 0.85;

/**
 * A skid mark of about `length`, laid from whole tiles along its own z, the
 * last a fading tail, at `position` turned `rotationY`. The tail is on the
 * side away from the middle of the incident, where the braking began.
 */
export function skidParts(position: Triple, rotationY: number, length: number, tone: number): Part[] {
  const tiles = Math.max(1, Math.round(length / SKID_TILE));
  const paint = (hex: string) => desaturate(hex, tone * 0.4);
  const towards = position[2] >= 0 ? 1 : -1;
  const parts: Part[] = [];
  for (let i = 0; i < tiles; i++) {
    const along = (i - (tiles - 1) / 2) * SKID_TILE;
    // The tail lies at the far end, its own fading end pointing away.
    const tail = i === (towards > 0 ? tiles - 1 : 0);
    const matrix = frame(position, [0, rotationY, 0], [0, -0.01, along]);
    parts.push(...moved(node(tail ? "SkidTail" : "SkidTile", paint), tail && towards < 0 ? matrix.multiply(frame([0, 0, 0], [0, Math.PI, 0])) : matrix));
  }
  return parts;
}

/** The dug hole with a broken rim, on the tarmac at the origin. */
export function potholeParts(shade: (hex: string) => string): Part[] {
  return node("Pothole", shade).map((part) => ({ ...part, position: [0, DECAL_Y - 0.02, 0] as Triple }));
}

/** The heap dug out of it. */
export function spoilParts(x: number, z: number, shade: (hex: string) => string): Part[] {
  return node("Spoil", shade).map((part) => ({ ...part, position: [x, 0.1, z] as Triple }));
}

/** The burnt patch under a major incident. */
export function scorchParts(shade: (hex: string) => string): Part[] {
  return node("Scorch", shade).map((part) => ({ ...part, position: [0, DECAL_Y - 0.03, 0] as Triple }));
}

/** The fire's flames: about a 3.4 tall cone (outer) and a 2.5 tall one (inner), centred. */
export function flameGeometry(which: "outer" | "inner"): BufferGeometry {
  return mergeParts(node(which === "outer" ? "FlameOuter" : "FlameInner", (hex) => hex));
}

/** The dark patch under an incident, 1.8 (small) or 3.1 (wide) across, in vertex colours a tint multiplies. */
export function patchGeometry(which: "small" | "wide"): BufferGeometry {
  return mergeParts(node(which === "small" ? "PatchSmall" : "PatchWide", (hex) => hex));
}

/** Pole pieces, longest first, in metres. */
const POLES: [string, number][] = [
  ["BeaconPole100", 1],
  ["BeaconPole050", 0.5],
  ["BeaconPole020", 0.2],
  ["BeaconPole010", 0.1],
];

/**
 * A beacon's mast `height` tall, from the kit's foot, whole poles stacked to
 * the height (to the nearest 0.1) and the lamp cage and hood at the top, the
 * hood 0.62 over the mast's top as the procedural one is.
 */
export function beaconMastGeometry(height: number): BufferGeometry {
  const parts: Part[] = [...node("BeaconFoot", (hex) => hex)];
  let rest = Math.round(height * 10) / 10;
  let y = 0;
  for (const [name, length] of POLES) {
    const count = Math.floor(rest / length + 1e-6);
    for (let i = 0; i < count; i++) {
      parts.push(...node(name, (hex) => hex).map((part) => ({ ...part, position: [0, y, 0] as Triple })));
      y += length;
    }
    rest -= count * length;
  }
  parts.push(...node("BeaconHead", (hex) => hex).map((part) => ({ ...part, position: [0, height, 0] as Triple })));
  return mergeParts(parts);
}
