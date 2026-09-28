/**
 * The construction site's Blender kit (`blender/incidents2/site_kit.py`), laid
 * out at real size: what `constructionDecor.ts` draws with `BLENDER_MODELS`
 * for the site's hoarding, its scaffold, the sign, the finished building's
 * forecourt and the crew's gear.
 *
 * Nothing stretches. A fence run is five whole 2.2 m sheets (the same 11 units
 * the procedural boards span), a scaffold face is two whole bays, a standard is
 * made of whole lifts and a capped stub, in the way `hoardingKit` lays a plot's
 * hoarding out from its sheets (`backlog/forms.ts`).
 *
 * The model is only read inside functions (`loadModels()` fills it once the
 * app is up), never while this module is evaluated.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { importedParts } from "../imported";
import type { Part, Triple } from "./geometry";
import { MODEL as SITE_KIT } from "./siteKit.model";

/** The site is drawn on an eleven unit square (`constructionDecor.ts`'s `SITE`). */
const SITE = 11;

/** One boarding sheet's length, and the sheets in a side of the fence. */
export const FENCE_SHEET = 2.2;
export const FENCE_SHEETS = SITE / FENCE_SHEET;

/** Where the shell stands, how wide it is, and the scaffold round it. */
const SHELL_X = SITE * 0.12;
const SHELL_Z = SITE * 0.1;
export const SCAFFOLD_REACH = 5.4 / 2 + 0.45;
/** A bay is a side's half; a lift is what the ledgers are spaced at. */
export const SCAFFOLD_BAY = SCAFFOLD_REACH;
export const SCAFFOLD_LIFT = 1.9;

/** The colours the kit is modelled in, so a caller can repaint them. */
export const KIT_COLORS = {
  board: "#bdb6a4",
  rail: "#e8853c",
  post: "#6b6f6d",
  steel: "#9aa0a6",
  plank: "#b59a6f",
  helmet: "#f0d44a",
  leaf: "#7fa46a",
} as const;

/** A node's parts, coloured through `paint`. */
export function kitNode(node: string, paint: (hex: string) => string): Part[] {
  return importedParts(SITE_KIT, node, paint);
}

const scratch = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3(), euler: new Euler() };

/** `parts` (in a node's own frame) moved by `matrix`. */
export function moved(parts: Part[], matrix: Matrix4): Part[] {
  matrix.decompose(scratch.position, scratch.quaternion, scratch.scale);
  scratch.euler.setFromQuaternion(scratch.quaternion, "XYZ");
  const position: Triple = [scratch.position.x, scratch.position.y, scratch.position.z];
  const rotation: Triple = [scratch.euler.x, scratch.euler.y, scratch.euler.z];
  return parts.map((part) => ({ ...part, position, rotation }));
}

/** A matrix for `at`, turned `euler` (XYZ), then shifted by `local` in its own frame. */
export function frame(at: Triple, euler: Triple = [0, 0, 0], local: Triple = [0, 0, 0]): Matrix4 {
  const turned = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...euler, "XYZ")), new Vector3(1, 1, 1));
  return turned.multiply(new Matrix4().makeTranslation(...local));
}

/** One node placed by `matrix`. */
export function placeNode(node: string, paint: (hex: string) => string, matrix: Matrix4): Part[] {
  return moved(kitNode(node, paint), matrix);
}

/**
 * A run of boarding: whole sheets end to end from `start` along the run's own
 * x, the last one a half sheet when `lengths` says so. `matrix` puts the run
 * in the site; the sheets' outside faces +z.
 */
export function boardingRun(lengths: readonly number[], paint: (hex: string) => string, matrix: Matrix4, lift = 0): Part[] {
  const total = lengths.reduce((a, b) => a + b, 0);
  let at = -total / 2;
  const parts: Part[] = [];
  for (const length of lengths) {
    const node = length < FENCE_SHEET - 0.01 ? "FenceHalf" : "FenceSheet";
    parts.push(...placeNode(node, paint, matrix.clone().multiply(new Matrix4().makeTranslation(at + length / 2, lift, 0))));
    at += length;
  }
  return parts;
}

/** The hoarding round the site: four sides of five sheets, a post at each corner. */
export function fenceParts(paint: (hex: string) => string): Part[] {
  const half = SITE / 2;
  const parts: Part[] = [];
  // [x, z, turn]: the sheets' outside is local +z.
  const sides: [number, number, number][] = [
    [0, half, 0],
    [0, -half, Math.PI],
    [half, 0, Math.PI / 2],
    [-half, 0, -Math.PI / 2],
  ];
  for (const [x, z, turn] of sides) {
    parts.push(...boardingRun(Array(FENCE_SHEETS).fill(FENCE_SHEET), paint, frame([x, 0, z], [0, turn, 0])));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(...placeNode("FencePost", paint, frame([sx * half, 0, sz * half])));
  return parts;
}

/** How many whole lifts the scaffold's ledgers make for a shell `height` high. */
export function scaffoldLifts(height: number): number {
  const top = height + 0.7;
  let lifts = 0;
  while ((lifts + 1) * SCAFFOLD_LIFT < top) lifts++;
  return lifts;
}

/**
 * The scaffold round the shell: standards of whole lifts and a capped stub
 * where the shell ends, a ledger at every lift, a diagonal in every bay of the
 * front and back faces, and a working platform in the front bays of the top
 * two lifts. Two bays a face, so the reach is exactly what the procedural
 * frame's is.
 */
export function scaffoldParts(height: number, paint: (hex: string) => string): Part[] {
  const top = height + 0.7;
  const lifts = scaffoldLifts(height);
  if (lifts < 2) throw new Error("scaffoldParts: a shell that low needs no scaffold kit");
  const stub = Math.round((top - lifts * SCAFFOLD_LIFT) * 100);
  const reach = SCAFFOLD_REACH;
  const parts: Part[] = [];
  const at = (x: number, y: number, z: number, turn = 0) => frame([SHELL_X + x, y, SHELL_Z + z], [0, turn, 0]);

  const standards: [number, number][] = [
    [-reach, -reach], [reach, -reach], [-reach, reach], [reach, reach],
    [0, -reach], [0, reach], [-reach, 0], [reach, 0],
  ];
  for (const [x, z] of standards) {
    parts.push(...placeNode("ScaffoldFoot", paint, at(x, 0, z)));
    for (let lift = 2; lift < lifts; lift++) parts.push(...placeNode("ScaffoldPole", paint, at(x, lift * SCAFFOLD_LIFT, z)));
    parts.push(...placeNode(`ScaffoldStub${stub}`, paint, at(x, lifts * SCAFFOLD_LIFT, z)));
  }

  const bays = [-SCAFFOLD_BAY / 2, SCAFFOLD_BAY / 2];
  for (let level = 1; level <= lifts; level++) {
    const y = level * SCAFFOLD_LIFT;
    for (const side of [-1, 1]) {
      for (const bay of bays) {
        parts.push(...placeNode("ScaffoldLedger", paint, at(bay, y, side * reach)));
        parts.push(...placeNode("ScaffoldLedger", paint, at(side * reach, y, bay, Math.PI / 2)));
      }
    }
    if (y > top - 4.2) {
      for (const bay of bays) parts.push(...placeNode("ScaffoldDeck", paint, at(bay, y + 0.1, reach)));
    }
  }
  for (let lift = 0; lift < lifts; lift++) {
    for (const side of [-1, 1]) {
      bays.forEach((bay, index) => {
        // Alternating diagonals, the way a scaffold is braced.
        const flip = (lift + index + (side < 0 ? 1 : 0)) % 2 === 0;
        parts.push(...placeNode("ScaffoldBrace", paint, at(bay, lift * SCAFFOLD_LIFT, side * reach, flip ? 0 : Math.PI)));
      });
    }
  }
  return parts;
}

/**
 * The hoarding that came down years ago: two runs of whole sheets, one
 * leaning, one fallen across the ground, at the procedural boards' places
 * and lengths (5.5 and 3.3, to the sheet).
 */
export function fallenHoarding(paint: (hex: string) => string): Part[] {
  return [
    ...boardingRun([FENCE_SHEET, FENCE_SHEET, FENCE_SHEET / 2], paint, frame([-SITE * 0.2, 0.7, SITE / 2], [0, 0, 0.16], [0, -0.85, 0])),
    ...boardingRun([FENCE_SHEET, FENCE_SHEET / 2], paint, frame([SITE * 0.3, 0.6, SITE / 2 - 0.4], [0.9, 0.2, 0], [0, -0.85, 0])),
  ];
}

/** The sign nobody took away, leaning from its foot at `at`. */
export function leaningSign(at: Triple, lean: number, paint: (hex: string) => string): Part[] {
  return placeNode("SiteSign", paint, frame(at, [0, 0, lean]));
}

/** The finished building's forecourt, in the site's own frame. */
export function completedYard(paint: (hex: string) => string): Part[] {
  return kitNode("CompletedYard", paint);
}

/** The crew's hard hat and vest bands, in a figure's frame (feet at 0). */
export function crewGearParts(helmet: string): Part[] {
  return kitNode("CrewGear", (hex) => (hex === KIT_COLORS.helmet ? helmet : hex));
}
