import { type BufferGeometry } from "three";
import { type RoadLay, type SidewalkLay, type MarkLay, JUNCTION_INSET, MEDIAN_WIDTH } from "./groundwork";
import { toGeometry } from "./models/buildings/geometry";
import { addQuad, emptyDraft, type MeshDraft, type Rgb3 } from "./models/buildings/mesh";

/** Utility covers sit in a traffic lane; gully grates follow each kerb. */
export function roadDetailLays(lays: readonly RoadLay[], walks: readonly SidewalkLay[]): {
  covers: MarkLay[];
  drains: MarkLay[];
} {
  const covers: MarkLay[] = [];
  const drains: MarkLay[] = [];
  lays.forEach((lay, road) => {
    if (lay.style === "motorway" || lay.length < JUNCTION_INSET * 2 + 3 || lay.width < 1.5) return;
    const lateral = lay.style === "avenue"
      ? (MEDIAN_WIDTH / 2 + lay.width / 2) / 2
      : -lay.width * 0.24;
    if (covers.length < 400) covers.push({ road, s: lay.length * 0.5, lateral, across: 1, along: 1 });
  });
  for (const walk of walks) {
    if (walk.along < 3 || drains.length >= 800) continue;
    const lay = lays[walk.road];
    // Inside the asphalt, with a gap to the kerb. No overlap with paving.
    const lateral = Math.sign(walk.lateral) * (lay.width / 2 - 0.29);
    drains.push({ road: walk.road, s: walk.start + walk.along * 0.27, lateral, across: 1, along: 1 });
  }
  return { covers, drains };
}

function plate(draft: MeshDraft, x: number, z: number, w: number, d: number, y: number, color: Rgb3): void {
  addQuad(draft, [x - w / 2, y, z - d / 2], [x - w / 2, y, z + d / 2],
    [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2], color);
}

let cover: BufferGeometry | undefined;
let drain: BufferGeometry | undefined;

/** Flush ironwork, merged once and instanced across every road. */
export function utilityCoverGeometry(): BufferGeometry {
  if (cover) return cover;
  const draft = emptyDraft();
  const rim: Rgb3 = [0.36, 0.38, 0.39];
  const iron: Rgb3 = [0.22, 0.24, 0.25];
  const segments = 16;
  for (let i = 0; i < segments; i++) {
    const a = i * Math.PI * 2 / segments;
    const b = (i + 1) * Math.PI * 2 / segments;
    const at = (angle: number, radius: number): [number, number, number] =>
      [Math.sin(angle) * radius, 0, Math.cos(angle) * radius];
    addQuad(draft, at(a, 0.37), at(b, 0.37), at(b, 0.32), at(a, 0.32), rim);
    const base = draft.positions.length / 3;
    for (const p of [[0, 0, 0], at(a, 0.32), at(b, 0.32)]) {
      draft.positions.push(...p);
      draft.normals.push(0, 1, 0);
      draft.colors.push(...iron);
    }
    draft.indices.push(base, base + 1, base + 2);
  }
  for (const x of [-0.18, -0.09, 0, 0.09, 0.18]) {
    plate(draft, x, 0, 0.018, 0.42, 0.012, rim);
  }
  plate(draft, -0.22, 0, 0.035, 0.065, 0.013, [0.09, 0.1, 0.11]);
  plate(draft, 0.22, 0, 0.035, 0.065, 0.013, [0.09, 0.1, 0.11]);
  cover = toGeometry(draft);
  return cover;
}

export function gullyGeometry(): BufferGeometry {
  if (drain) return drain;
  const draft = emptyDraft();
  plate(draft, 0, 0, 0.42, 0.68, 0, [0.34, 0.36, 0.37]);
  plate(draft, 0, 0, 0.34, 0.59, 0.012, [0.07, 0.09, 0.1]);
  for (let i = 0; i < 7; i++) {
    plate(draft, 0, (i - 3) * 0.078, 0.35, 0.032, 0.023, [0.29, 0.31, 0.32]);
  }
  drain = toGeometry(draft);
  return drain;
}
