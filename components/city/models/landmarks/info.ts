/**
 * The information centre: documentation as the city's wayfinding (PLAN.md
 * section 16). Strong docs make the city navigable, weak docs leave it with a
 * kiosk and a map board.
 *
 * Natural size 18 x 8 x 12, entrance on +z facing the city centre.
 *
 *   level 1  a kiosk with a map board
 *   level 2  a visitor centre with a glass front and a sign pylon
 *   level 3  a library hall with a colonnade, a reading garden and lamp posts
 *
 * Blue-and-white fingerposts stand at the plot edge at every level: the sign
 * is the part of this landmark that reads from the overview camera.
 */

import { Assembly, cached, type Slots, type V3 } from "./assembly";

export type InfoSlot = "deck" | "wall" | "roof" | "glass" | "sign" | "green";

const DECK = 0.45;

type A = Assembly<InfoSlot>;

export interface InfoLayout {
  slots: Slots<InfoSlot>;
  /** Lamp heads in the reading garden, lit by React from the atmosphere. */
  lamps: V3[];
}

/** A blue fingerpost with white blades: the city's road signs, in miniature. */
function fingerpost(a: A, x: number, z: number, blades: number, dir: 1 | -1): void {
  a.box("roof", [0.18, 3.2, 0.18], { at: [x, DECK + 1.6, z] });
  a.cylinder("roof", 0.18, 0.18, 0.2, 8, { at: [x, DECK + 3.25, z] });
  const reach = 1.9;
  for (let i = 0; i < blades; i++) {
    const y = DECK + 2.75 - i * 0.62;
    // Blades always point back into the plot, so a post on the right-hand
    // edge never reaches past it.
    const turn = (dir > 0 ? 0 : Math.PI) + (i % 2 === 0 ? 0.3 : -0.3);
    const axis: [number, number] = [Math.cos(turn), -Math.sin(turn)];
    const normal: [number, number] = [Math.sin(turn), Math.cos(turn)];
    const cx = x + (axis[0] * reach) / 2;
    const cz = z + (axis[1] * reach) / 2;
    const rot: [number, number, number] = [0, turn, 0];
    a.box("sign", [reach, 0.48, 0.1], { at: [cx, y, cz], rot });
    for (const s of [-1, 1]) {
      a.box("roof", [reach - 0.3, 0.09, 0.05], {
        at: [cx + normal[0] * 0.06, y + s * 0.14, cz + normal[1] * 0.06],
        rot,
      });
    }
  }
}

/** A map board on two posts, tilted towards the reader. */
function mapBoard(a: A, x: number, z: number, width: number, height: number): void {
  for (const s of [-1, 1]) {
    a.box("roof", [0.12, 2.1, 0.12], { at: [x + (s * width) / 2 - s * 0.2, DECK + 1.05, z] });
  }
  a.box("sign", [width, height, 0.12], { at: [x, DECK + 1.75, z], rot: [-0.16, 0, 0] });
  a.box("roof", [width - 0.34, height - 0.32, 0.06], {
    at: [x, DECK + 1.75 + 0.02, z + 0.1],
    rot: [-0.16, 0, 0],
  });
}

/** A garden lamp. Returns the point where its glow belongs. */
function lamp(a: A, x: number, z: number): V3 {
  a.cylinder("roof", 0.08, 0.12, 3.0, 6, { at: [x, DECK + 1.5, z] });
  a.box("roof", [0.46, 0.14, 0.46], { at: [x, DECK + 3.08, z] });
  a.box("glass", [0.34, 0.22, 0.34], { at: [x, DECK + 2.92, z] });
  return [x, DECK + 2.92, z];
}

function bench(a: A, x: number, z: number, turn: number): void {
  a.box("roof", [1.7, 0.12, 0.52], { at: [x, DECK + 0.46, z], rot: [0, turn, 0] });
  a.box("roof", [1.7, 0.5, 0.1], { at: [x, DECK + 0.72, z - 0.22], rot: [0, turn, 0] });
  for (const s of [-1, 1]) {
    a.box("roof", [0.12, 0.4, 0.42], {
      at: [x + s * 0.7, DECK + 0.22, z],
      rot: [0, turn, 0],
    });
  }
}

function buildInfo(level: number): InfoLayout {
  const a = new Assembly<InfoSlot>();
  const lamps: V3[] = [];

  a.box("deck", [17.4, DECK, 11.4], { at: [0, DECK / 2, 0] });

  if (level <= 1) {
    // A kiosk: a counter, a canopy and somewhere to read the map.
    a.box("wall", [3.8, 2.8, 3.2], { at: [-1.0, DECK + 1.4, -0.4] });
    a.box("glass", [3.0, 1.7, 0.1], { at: [-1.0, DECK + 1.55, 1.26] });
    a.box("roof", [5.4, 0.36, 4.8], { at: [-1.0, DECK + 2.98, 0.0] });
    a.box("roof", [3.6, 0.16, 0.6], { at: [-1.0, DECK + 0.95, 1.45] });
    for (const s of [-1, 1]) {
      a.box("roof", [0.14, 3.1, 0.14], { at: [-1.0 + s * 2.3, DECK + 1.55, 2.2] });
    }
    a.box("sign", [3.4, 0.5, 0.12], { at: [-1.0, DECK + 2.6, 1.32] });
    mapBoard(a, 3.6, 2.2, 2.4, 1.6);
    bench(a, 3.6, -1.2, 0);
  } else if (level === 2) {
    // A visitor centre: a glazed front under a blue sign band, a canopy over
    // the door, a sign pylon and planters.
    a.box("wall", [10.2, 3.9, 5.4], { at: [-1.8, DECK + 1.95, -0.7] });
    a.box("roof", [11.4, 0.45, 6.6], { at: [-1.8, DECK + 4.12, -0.7] });
    a.box("glass", [9.2, 2.7, 0.12], { at: [-1.8, DECK + 1.7, 2.07] });
    for (let i = 0; i < 6; i++) {
      a.box("roof", [0.16, 2.9, 0.18], { at: [-5.8 + i * 1.6, DECK + 1.75, 2.1] });
    }
    a.box("sign", [10.4, 0.62, 0.22], { at: [-1.8, DECK + 3.42, 2.12] });
    a.box("roof", [1.6, 0.2, 0.08], { at: [-1.8, DECK + 3.42, 2.25] });
    // The canopy starts clear of the sign band, whose top it would share.
    a.box("roof", [4.2, 0.24, 2.4], { at: [-1.8, DECK + 3.62, 3.45] });
    for (const s of [-1, 1]) {
      a.box("roof", [0.16, 3.5, 0.16], { at: [-1.8 + s * 1.9, DECK + 1.75, 4.4] });
      a.box("deck", [1.3, 0.55, 1.3], { at: [-1.8 + s * 3.2, DECK + 0.28, 3.6] });
      a.box("green", [1.0, 0.5, 1.0], { at: [-1.8 + s * 3.2, DECK + 0.72, 3.6] });
    }
    // The sign pylon: the part of a visitor centre you see from the road.
    a.box("roof", [0.45, 4.2, 0.45], { at: [6.2, DECK + 2.1, 1.4] });
    a.box("sign", [3.0, 2.2, 0.2], { at: [6.2, DECK + 3.6, 1.4] });
    a.box("roof", [0.44, 1.15, 0.07], { at: [6.2, DECK + 3.4, 1.52] });
    a.box("roof", [0.44, 0.38, 0.07], { at: [6.2, DECK + 4.28, 1.52] });
    mapBoard(a, 2.8, 4.6, 2.2, 1.5);
    bench(a, -6.4, 4.2, 0);
  } else {
    // A library: a raised hall behind a colonnade, with a reading garden.
    a.box("deck", [11.4, 0.4, 7.4], { at: [-2.6, DECK + 0.2, -0.2] });
    const base = DECK + 0.4;
    a.box("wall", [10.0, 4.6, 6.0], { at: [-2.6, base + 2.3, -0.4] });
    a.box("roof", [11.2, 0.5, 7.2], { at: [-2.6, base + 4.85, -0.4] });
    a.box("wall", [6.0, 0.85, 2.6], { at: [-2.6, base + 5.5, -0.4] });
    a.box("glass", [6.05, 0.44, 2.65], { at: [-2.6, base + 5.5, -0.4] });
    a.box("roof", [6.4, 0.22, 3.0], { at: [-2.6, base + 6.02, -0.4] });
    a.box("glass", [8.6, 3.2, 0.12], { at: [-2.6, base + 1.9, 2.66] });
    for (let i = 0; i < 6; i++) {
      const cx = -6.4 + i * 1.52;
      a.cylinder("roof", 0.26, 0.3, 4.3, 8, { at: [cx, base + 2.15, 2.9] });
      a.cylinder("roof", 0.38, 0.38, 0.16, 8, { at: [cx, base + 0.08, 2.9] });
      a.cylinder("roof", 0.38, 0.38, 0.16, 8, { at: [cx, base + 4.22, 2.9] });
    }
    a.box("roof", [10.4, 0.34, 0.9], { at: [-2.6, base + 4.5, 2.9] });
    for (let i = 0; i < 2; i++) {
      a.box("deck", [9.0 - i * 0.8, 0.2, 0.8], { at: [-2.6, DECK + 0.3 - i * 0.2, 3.7 + i * 0.7] });
    }

    a.box("green", [5.6, 0.12, 7.0], { at: [5.6, DECK + 0.06, -0.2] });
    for (const [hx, hz] of [
      [3.3, 2.4],
      [7.9, 2.4],
      [3.3, -2.6],
      [7.9, -2.6],
    ] as const) {
      a.box("green", [0.8, 0.8, 1.9], { at: [hx, DECK + 0.5, hz] });
    }
    a.box("green", [4.2, 0.7, 0.7], { at: [5.6, DECK + 0.47, -3.4] });
    for (const [lx, lz] of [
      [3.2, 4.3],
      [8.0, 4.3],
      [3.2, -4.3],
      [8.0, -4.3],
    ] as const) {
      lamps.push(lamp(a, lx, lz));
    }
    bench(a, 5.6, 1.1, 0);
    bench(a, 5.6, -1.4, Math.PI);
    // A pergola over the reading benches.
    for (const s of [-1, 1]) {
      a.box("roof", [0.16, 2.6, 0.16], { at: [5.6 + s * 1.9, DECK + 1.3, 1.9] });
      a.box("roof", [0.16, 2.6, 0.16], { at: [5.6 + s * 1.9, DECK + 1.3, -2.2] });
    }
    for (let i = 0; i < 4; i++) {
      a.box("roof", [4.2, 0.1, 0.12], { at: [5.6, DECK + 2.6, 1.7 - i * 1.3] });
    }
  }

  fingerpost(a, -7.9, 4.6, level >= 2 ? 3 : 2, 1);
  fingerpost(a, 7.9, 4.6, level >= 3 ? 3 : 2, -1);

  return { slots: a.build(), lamps };
}

export function infoCentre(level: number): InfoLayout {
  const clamped = Math.min(3, Math.max(1, Math.round(level)));
  return cached(`info:${clamped}`, () => buildInfo(clamped));
}
