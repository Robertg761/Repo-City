/**
 * A merged pull request in a village or a town (PLAN.md 76.5, 76.7): not a
 * works with a crane but the house it built, just finished. S4 sizes the plot
 * as the settlement's own building (`COMPLETED_SITE` in
 * `lib/city/generator.ts`): a village's at most `[7, 4.2, 7]`, a two-storey
 * farmhouse-cottage, and a town's at most `[9, 7.6, 9]`, a three-storey block
 * of flats.
 *
 * The house is the settlement's own archetype (`models/buildings`), so it
 * belongs on its street, with its paint baked in fresh: new limewash and a
 * teal door in the village, new render in the town. What says "just built"
 * is round it: new turf and a gravel path, a picket fence and a sapling on a
 * stake, the agent's board, bunting from the eaves and a bunch of balloons
 * at the gate; in the town a paved forecourt, planters, a banner up the
 * front and a ribbon across the doors with bunting over it.
 *
 * FRAME. The site's own frame, like `constructionDecor.ts`, but at the
 * finished plot's size (`FINISHED[tier].plot`) instead of the crane site's
 * eleven units: `x` across, `+z` the front, `y = 0` the ground. The site
 * scales it uniformly to its `size`, so a squeezed plot keeps its
 * proportions and the house its height (`size[1]`).
 *
 * One merged geometry for the house and one for its dressing, per tier and
 * tone, drawn from the city's shared pools: a village's three finished
 * houses are two draw calls between them.
 */

import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Euler,
  IcosahedronGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import { TREE_LEAF, desaturate } from "../../palette";
import { archetypeGeometry } from "../buildings/geometry";
import type { ModelKey } from "../buildings/archetypes";
import { geometryCache, mergeParts, toneKey, type Part, type Triple } from "./geometry";

export type FinishedTier = "village" | "town";

export interface FinishedSpec {
  /** The plot the model is drawn on, square. */
  plot: number;
  /** The house's height to its ridge or roof, before the site's scale. */
  height: number;
  /** The house: which archetype, its footprint and where it stands. */
  model: ModelKey;
  footprint: [number, number];
  /** How far back from the plot's centre the house stands. */
  setBack: number;
  /** Fresh paint: the walls and the accent (door, shutters, fascia). */
  wall: string;
  accent: string;
  /** The ground the plot is laid with. */
  ground: string;
}

export const FINISHED: Record<FinishedTier, FinishedSpec> = {
  village: {
    plot: 7,
    height: 4.2,
    model: "farmhouse",
    footprint: [4.6, 3.7],
    setBack: 0.9,
    wall: "#f6eedc",
    accent: "#2f8a8c",
    ground: "#95b56f",
  },
  town: {
    plot: 9,
    height: 7.6,
    model: "apartment-low",
    footprint: [6.4, 5],
    setBack: 1.1,
    wall: "#e9d7b6",
    accent: "#2f5f8f",
    ground: "#d6cfbf",
  },
};

/** Whether a completed site in this settlement is drawn as a finished house. */
export const finishedTier = (tier: string | undefined): FinishedTier | null =>
  tier === "village" || tier === "town" ? tier : null;

const WHITE = "#f4f1e8";
const BUNTING = ["#d8423a", "#f0c23b", "#3f7fc4", "#4aa05a", "#f4f1e8"] as const;
const BALLOONS = ["#e04a5a", "#f0c23b", "#4a8fd8"] as const;

function box(size: Triple, position: Triple, color: string, rotation?: Triple): Part {
  return { geometry: new BoxGeometry(size[0], size[1], size[2]), color, position, rotation };
}

/**
 * Turned to `heading` about y and then tipped `tilt` about its own x, as the
 * XYZ Euler angles a `Part` takes. Written straight into XYZ order, a cord
 * that runs anywhere but along z was tipped about the world's x instead, and
 * missed the knots it was meant to join.
 */
function headingThenTilt(heading: number, tilt: number): Triple {
  const q = new Quaternion().setFromEuler(new Euler(tilt, heading, 0, "YXZ"));
  const e = new Euler().setFromQuaternion(q, "XYZ");
  return [e.x, e.y, e.z];
}

/**
 * A string of pennants from `a` to `b`, sagging `sag` in the middle: a thin
 * cord in short straight runs and a small downward triangle at each knot.
 *
 * Each pennant is tipped to the cord's slope at its knot and threaded on the
 * cord, its top a little above the cord's: with a flat top a hair under the
 * cord, the cord came up through it and stopped a hair above, and the two
 * dashed at any distance.
 */
function bunting(a: Triple, b: Triple, count: number, sag: number, shade: (hex: string) => string): Part[] {
  const at = (t: number): Triple => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
    a[2] + (b[2] - a[2]) * t,
  ];
  const parts: Part[] = [];
  const heading = Math.atan2(b[0] - a[0], b[2] - a[2]);
  const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const cord = 0.025;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const p = at(t);
    if (i > 0) {
      const q = at((i - 1) / (count - 1));
      const length = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const pitch = Math.asin((p[1] - q[1]) / length);
      parts.push({
        geometry: new BoxGeometry(cord, cord, length),
        color: shade("#e9e4d6"),
        position: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
        rotation: headingThenTilt(heading, -pitch),
      });
    }
    if (i === 0 || i === count - 1) continue;
    // The slope of the curve at the knot, and "up" across the cord there.
    const slope = Math.atan2(b[1] - a[1] - sag * 4 * (1 - 2 * t), run);
    const rotation = headingThenTilt(heading, Math.PI - slope);
    const up = new Vector3(0, -1, 0).applyEuler(new Euler(...rotation));
    // The cone is 0.3 tall about its centre; its top stands 0.03 above the
    // knot, clear of the cord's top.
    const down = 0.15 - 0.03;
    parts.push({
      geometry: new ConeGeometry(0.13, 0.3, 3),
      color: shade(BUNTING[i % BUNTING.length]),
      position: [p[0] - up.x * down, p[1] - up.y * down, p[2] - up.z * down],
      rotation,
    });
  }
  return parts;
}

/**
 * A bunch of three balloons on strings, tied at `x, z`, `top` high. The
 * strings stand clear of the fence, the ribbon and the path's edge: through
 * a picket or a ribbon, or a hair inside the path, they left a thread of its
 * top showing beside them.
 */
function balloons(x: number, z: number, top: number, shade: (hex: string) => string): Part[] {
  const spots: Triple[] = [
    [x - 0.24, top, z - 0.08],
    [x + 0.28, top + 0.18, z + 0.065],
    [x + 0.02, top + 0.34, z - 0.14],
  ];
  return spots.flatMap((p, i) => [
    {
      geometry: new IcosahedronGeometry(0.2, 0),
      color: shade(BALLOONS[i]),
      position: p,
      scale: [1, 1.2, 1] as Triple,
    },
    box([0.02, p[1] - 0.2, 0.02], [(x + p[0]) / 2, (p[1] - 0.2) / 2, (z + p[2]) / 2], shade("#d8d3c6")),
  ]);
}

/** A sapling on a stake, tied in. */
function sapling(x: number, z: number, shade: (hex: string) => string): Part[] {
  return [
    { geometry: new CylinderGeometry(0.06, 0.08, 1.2, 5), color: shade("#7a5a40"), position: [x, 0.6, z] },
    box([0.05, 1.1, 0.05], [x + 0.14, 0.55, z], shade("#b59a6f")),
    { geometry: new IcosahedronGeometry(0.55, 0), color: shade(TREE_LEAF), position: [x, 1.45, z] },
  ];
}

function villageDressing(shade: (hex: string) => string): Part[] {
  const { plot, footprint, setBack } = FINISHED.village;
  const half = plot / 2;
  const front = -setBack + footprint[1] / 2;
  const edge = half - 0.25;
  const parts: Part[] = [
    // A gravel path from the door to the gate.
    box([0.9, 0.04, edge - front], [0.55, 0.03, (edge + front) / 2], shade("#d9cdb2")),
    // A white picket fence along the front, a gap for the gate.
    box([half - 0.5 + 0.05, 0.08, 0.06], [-(half + 0.5) / 2 + 0.25, 0.55, edge], shade(WHITE)),
    box([half - 1.6 + 0.05, 0.08, 0.06], [(half + 1.6) / 2 - 0.25, 0.55, edge], shade(WHITE)),
    box([half - 0.5 + 0.05, 0.08, 0.06], [-(half + 0.5) / 2 + 0.25, 0.3, edge], shade(WHITE)),
    box([half - 1.6 + 0.05, 0.08, 0.06], [(half + 1.6) / 2 - 0.25, 0.3, edge], shade(WHITE)),
  ];
  for (const x of [-half + 0.3, -1.6, -0.1, 1.15, half - 0.3]) {
    parts.push(box([0.1, 0.72, 0.1], [x, 0.36, edge], shade(WHITE)));
  }
  // The gate posts, taller, with the bunting's far end on one of them.
  parts.push(box([0.12, 1.9, 0.12], [0.02, 0.95, edge], shade(WHITE)));
  parts.push(box([0.12, 0.9, 0.12], [1.08, 0.45, edge], shade(WHITE)));
  // Bunting from the eave's front corners down to the gate post.
  const eave = FINISHED.village.height * 0.6;
  parts.push(...bunting([-footprint[0] / 2 + 0.3, eave, front + 0.1], [0.02, 1.85, edge], 7, 0.25, shade));
  parts.push(...bunting([footprint[0] / 2 - 0.2, eave, front + 0.1], [0.02, 1.85, edge], 7, 0.25, shade));
  // The agent's board: "sold", in red across the white.
  parts.push(
    box([0.1, 1.5, 0.1], [-half + 0.7, 0.75, edge - 0.45], shade("#8a7a66")),
    box([0.9, 0.62, 0.06], [-half + 0.7, 1.35, edge - 0.4], shade(WHITE)),
    box([0.94, 0.2, 0.08], [-half + 0.7, 1.35, edge - 0.4], shade("#d23b33"), [0, 0, 0.35]),
  );
  parts.push(...sapling(half - 1.0, edge - 1.1, shade));
  parts.push(...balloons(1.08, edge, 1.6, shade));
  return parts;
}

function townDressing(shade: (hex: string) => string): Part[] {
  const { plot, footprint, setBack, height } = FINISHED.town;
  const half = plot / 2;
  const front = -setBack + footprint[1] / 2;
  const edge = half - 0.3;
  const parts: Part[] = [
    // Fresh paving in front, a shade lighter than the plot.
    box([footprint[0] + 0.4, 0.05, edge - front + 0.2], [0, 0.03, (edge + front) / 2], shade("#e6e0d2")),
    // A banner down the front: new, and open.
    box([0.7, 2.4, 0.06], [footprint[0] / 2 - 0.7, height * 0.62, front + 0.06], shade("#d23b33")),
    // Its white band two layers proud of it all round, not a hair.
    box([0.724, 0.2, 0.084], [footprint[0] / 2 - 0.7, height * 0.62 + 0.5, front + 0.06], shade(WHITE)),
    // The ribbon across the doors on two posts, with its bow.
    box([0.08, 1.2, 0.08], [-1.2, 0.6, front + 1.2], shade("#9aa0a6")),
    box([0.08, 1.2, 0.08], [1.2, 0.6, front + 1.2], shade("#9aa0a6")),
    box([2.4, 0.16, 0.04], [0, 1.02, front + 1.2], shade("#d23b33")),
    // The bow is deeper than the ribbon and straddles it, so neither shows a
    // hair of the other's top.
    box([0.34, 0.34, 0.07], [-0.25, 1.02, front + 1.2], shade("#e0574c"), [0, 0, 0.78]),
    // Two planters with a young tree in each.
    // Set in from the paving's edge, whose side they would otherwise share.
    box([0.8, 0.5, 0.8], [-footprint[0] / 2 + 0.25, 0.25, edge - 0.6], shade("#8f8b80")),
    box([0.8, 0.5, 0.8], [footprint[0] / 2 - 0.25, 0.25, edge - 0.6], shade("#8f8b80")),
  ];
  parts.push(...sapling(-footprint[0] / 2 + 0.25, edge - 0.6, shade).map((p) => lift(p, 0.45)));
  parts.push(...sapling(footprint[0] / 2 - 0.25, edge - 0.6, shade).map((p) => lift(p, 0.45)));
  // Bunting over the forecourt, from the first-floor corners out to two poles.
  const poleH = 3.4;
  for (const s of [-1, 1]) {
    parts.push(box([0.1, poleH, 0.1], [s * (half - 0.4), poleH / 2, edge], shade(WHITE)));
    parts.push(
      ...bunting([s * (footprint[0] / 2 - 0.1), height * 0.36, front + 0.08], [s * (half - 0.4), poleH - 0.1, edge], 7, 0.3, shade),
    );
  }
  parts.push(...bunting([-(half - 0.4), poleH - 0.1, edge], [half - 0.4, poleH - 0.1, edge], 11, 0.45, shade));
  parts.push(...balloons(-1.2, front + 1.2, 1.7, shade), ...balloons(1.2, front + 1.2, 1.7, shade));
  return parts;
}

const lift = (part: Part, dy: number): Part => ({
  ...part,
  position: [part.position![0], part.position![1] + dy, part.position![2]],
});

/**
 * The settlement's archetype with the fresh paint baked in: walls and accent
 * multiplied into the vertex colours, as `settlementMaterial` would do per
 * instance, so the house draws with a plain vertex-coloured material from a
 * shared pool. In the archetype's unit space; the site scales it.
 */
function bakedHouse(tier: FinishedTier, tone: number): BufferGeometry {
  const spec = FINISHED[tier];
  const source = archetypeGeometry(spec.model);
  const geometry = source.clone();
  const color = geometry.getAttribute("color");
  const paint = geometry.getAttribute("paint");
  // `Color.setStyle` gives the working (linear) space the colours are in.
  const rgb = (hex: string): Triple => {
    const c = new Color().setStyle(desaturate(hex, tone));
    return [c.r, c.g, c.b];
  };
  const wall = rgb(spec.wall);
  const accent = rgb(spec.accent);
  const baked = new Float32Array(color.count * 3);
  for (let i = 0; i < color.count; i++) {
    const p = paint ? paint.getX(i) : 0;
    const mul = p > 1.5 ? accent : p > 0.5 ? wall : null;
    const [r, g, b] = [color.getX(i), color.getY(i), color.getZ(i)];
    baked[i * 3] = mul ? r * mul[0] : r;
    baked[i * 3 + 1] = mul ? g * mul[1] : g;
    baked[i * 3 + 2] = mul ? b * mul[2] : b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(baked, 3));
  if (paint) geometry.deleteAttribute("paint");
  return geometry;
}

const houseCache = geometryCache<string>((key) => {
  const [tier, tone] = key.split(":");
  return bakedHouse(tier as FinishedTier, Number(tone));
});

const dressingCache = geometryCache<string>((key) => {
  const [tier, tone] = key.split(":");
  const shade = (hex: string) => desaturate(hex, Number(tone));
  return mergeParts(tier === "village" ? villageDressing(shade) : townDressing(shade));
});

/** The finished house, in its archetype's unit space (scale it to its footprint). */
export function finishedHouseGeometry(tier: FinishedTier, desaturation: number): BufferGeometry {
  return houseCache(`${tier}:${toneKey(desaturation)}`);
}

/** Everything round the house, in the finished plot's frame. */
export function finishedDressingGeometry(tier: FinishedTier, desaturation: number): BufferGeometry {
  return dressingCache(`${tier}:${toneKey(desaturation)}`);
}
