/**
 * The town's buildings (PLAN.md 76.1 decision 7): the high-street shopfront,
 * the terrace of narrow houses, and the low apartment block.
 *
 * Same unit space and conventions as `models.ts`, built with `kit.ts`. The
 * shop's fascia, awning stripes and door take the instance's accent colour,
 * so a street of the same model is still a street of different shops.
 *
 * Proportions are for the town's heights (3.8 to 14, PLAN.md 76.5). The
 * shopfront comes in two and three storeys, chosen by tier in
 * `archetypes.ts`, so its shop window stays shop-sized when the instance
 * matrix stretches the model to its height. Pure arrays, no three.js.
 */

import type { ArchetypeModel } from "./models";
import type { Panel } from "./mesh";
import {
  M,
  box,
  chimney,
  door,
  face,
  framedWindow,
  gableRoof,
  panel,
  settlementDraft,
  slab,
  wallBox,
} from "./kit";

type Draft = ReturnType<typeof settlementDraft>;

/** Parapet walls round a flat roof. */
function parapet(draft: Draft, y: number, halfW: number, halfD: number, h: number, t = 0.03): void {
  box(draft, { y, z: halfD - t / 2, w: halfW * 2, h, d: t, skipBottom: true }, M.wallShade);
  box(draft, { y, z: -halfD + t / 2, w: halfW * 2, h, d: t, skipBottom: true }, M.wallShade);
  box(draft, { x: halfW - t / 2, y, w: t, h, d: halfD * 2 - t * 2, skipBottom: true }, M.wallShade);
  box(draft, { x: -halfW + t / 2, y, w: t, h, d: halfD * 2 - t * 2, skipBottom: true }, M.wallShade);
}

/**
 * The shop at street level: pilasters, a stall riser, a big mullioned window,
 * a glazed door, the fascia with its lettering, and a striped awning over
 * the window. `top` is the fascia's top as a fraction of the height.
 */
function shopFront(draft: Draft, spec: { plane: number; halfW: number; top: number }): Panel[] {
  const { plane, halfW, top } = spec;
  const fasciaH = top * 0.2;
  const shopTop = top - fasciaH;
  const riser = shopTop * 0.14;
  const windowL = -halfW + 0.07;
  const windowR = 0.16;
  const windowW = windowR - windowL;
  const windowU = (windowL + windowR) / 2;

  // Pilasters and a stall riser in the accent colour, darker.
  for (const u of [-halfW + 0.025, halfW - 0.025, windowR + 0.03]) {
    wallBox(draft, { facing: "+z", plane, u, v: 0, w: 0.04, h: shopTop, depth: 0.025 }, M.accentDark);
  }
  wallBox(draft, { facing: "+z", plane, u: windowU, v: 0, w: windowW, h: riser, depth: 0.018 }, M.accentDark);

  const glass: Panel = { facing: "+z", u: windowU, v: riser + (shopTop - riser) / 2, w: windowW, h: shopTop - riser - 0.02, plane: plane + 0.004 };
  panel(draft, { ...glass, w: windowW + 0.02, h: glass.h + 0.02, plane }, M.frame);
  panel(draft, glass, M.shopGlass);
  // Mullions: three lights and a transom.
  for (const k of [-1, 1]) {
    panel(draft, { facing: "+z", u: windowU + (k * windowW) / 6, v: glass.v, w: 0.01, h: glass.h, plane: plane + 0.007 }, M.frame);
  }
  panel(draft, { facing: "+z", u: windowU, v: glass.v + glass.h * 0.3, w: windowW, h: 0.01, plane: plane + 0.007 }, M.frame);
  // Something on display: coloured goods against the glass.
  const goods = [M.flowerYellow, M.accent, M.cream, M.flowerRed];
  for (let i = 0; i < goods.length; i++) {
    const h = (shopTop - riser) * (0.18 + (i % 2) * 0.1);
    panel(
      draft,
      { facing: "+z", u: windowL + 0.05 + (i * (windowW - 0.1)) / 3, v: riser + 0.012 + h / 2, w: 0.045, h, plane: plane + 0.006 },
      goods[i],
    );
  }

  // A glazed door beside the window.
  const doorU = (windowR + 0.05 + halfW - 0.05) / 2;
  const doorW = Math.min(0.13, halfW - 0.05 - (windowR + 0.05));
  door(draft, { facing: "+z", plane, u: doorU, v: 0, w: doorW, h: shopTop * 0.86, step: true, surround: M.accentDark });
  panel(draft, { facing: "+z", u: doorU, v: shopTop * 0.55, w: doorW * 0.6, h: shopTop * 0.4, plane: plane + 0.006 }, M.shopGlass);

  // The fascia, with a pale band of lettering on it.
  wallBox(draft, { facing: "+z", plane, u: 0, v: shopTop, w: halfW * 2, h: fasciaH, depth: 0.035 }, M.accent);
  wallBox(draft, { facing: "+z", plane, u: 0, v: top - 0.012, w: halfW * 2 + 0.01, h: 0.014, depth: 0.05 }, M.frame);
  for (let i = 0; i < 6; i++) {
    const w = 0.04 + ((i * 7) % 3) * 0.012;
    wallBox(
      draft,
      { facing: "+z", plane: plane + 0.035, u: -0.24 + i * 0.075, v: shopTop + fasciaH * 0.3, w, h: fasciaH * 0.4, depth: 0.004 },
      M.cream,
    );
  }

  // The awning: alternating stripes from the fascia down and out, and a
  // scalloped valance along its lip.
  const stripes = 7;
  const outZ = plane + 0.13;
  const yIn = shopTop - 0.005;
  const yOut = shopTop - 0.085;
  for (let i = 0; i < stripes; i++) {
    const x0 = windowL - 0.02 + (i * (windowW + 0.04)) / stripes;
    const x1 = windowL - 0.02 + ((i + 1) * (windowW + 0.04)) / stripes;
    const mat = i % 2 === 0 ? M.accent : M.cream;
    slab(
      draft,
      [
        [x0, yIn, plane + 0.004],
        [x1, yIn, plane + 0.004],
        [x1, yOut, outZ],
        [x0, yOut, outZ],
      ],
      0.008,
      mat,
    );
    face(
      draft,
      [
        [x0, yOut, outZ],
        [x1, yOut, outZ],
        [x1, yOut - 0.035, outZ],
        [x0, yOut - 0.035, outZ],
      ],
      [x0, yOut, outZ - 0.1],
      mat,
    );
  }
  return [glass];
}

/**
 * A high-street shop with rooms above: two or three storeys of painted
 * front, sash windows with sills, a cornice, a slate roof with chimney stacks
 * on the party walls, and a hanging sign on its bracket.
 */
export function shopfront(storeys: 2 | 3): ArchetypeModel {
  const draft = settlementDraft();
  const halfW = 0.47;
  const halfD = 0.45;
  const wallTop = storeys === 2 ? 0.76 : 0.82;
  const shopTop = storeys === 2 ? 0.4 : 0.3;

  box(draft, { y: 0, w: halfW * 2, h: wallTop, d: halfD * 2, skipBottom: true }, M.wall);
  const windows = shopFront(draft, { plane: halfD, halfW, top: shopTop });

  // The upper floors: three sash windows each.
  const rows = storeys === 2 ? [0.58] : [0.45, 0.66];
  const winH = storeys === 2 ? 0.17 : 0.13;
  for (const v of rows) {
    for (const u of [-0.28, 0, 0.28]) {
      windows.push(framedWindow(draft, { facing: "+z", plane: halfD, u, v, w: 0.13, h: winH, bars: "sash" }));
    }
    windows.push(framedWindow(draft, { facing: "-z", plane: halfD, u: -0.2, v, w: 0.13, h: winH, bars: "sash" }));
    windows.push(framedWindow(draft, { facing: "-z", plane: halfD, u: 0.2, v, w: 0.13, h: winH, bars: "sash" }));
  }
  // A rear door into the yard.
  door(draft, { facing: "-z", plane: halfD, u: 0, v: 0, w: 0.13, h: shopTop * 0.8, mat: M.door });

  // Cornice and roof.
  box(draft, { y: wallTop - 0.02, w: halfW * 2 + 0.03, h: 0.028, d: halfD * 2 + 0.03, skipBottom: true }, M.frame);
  gableRoof(draft, {
    y: wallTop + 0.008,
    w: halfW * 2,
    d: halfD * 2,
    rise: 1 - wallTop - 0.06,
    overhang: 0.02,
    thickness: 0.03,
    ridge: "x",
    roof: M.slate,
    gable: M.wall,
    ridgeCap: M.slateDark,
  });
  for (const s of [-1, 1]) {
    chimney(draft, { x: s * (halfW - 0.05), z: -0.05, y0: wallTop, top: 1.04, w: 0.09, d: 0.2, mat: M.brick, pots: 2 });
  }

  // The hanging sign: a bracket off the corner and a board on edge.
  const signV = shopTop + 0.1;
  wallBox(draft, { facing: "+z", plane: halfD, u: halfW - 0.05, v: signV + 0.08, w: 0.016, h: 0.016, depth: 0.12 }, M.railing);
  box(draft, { x: halfW - 0.05, y: signV - 0.005, z: halfD + 0.075, w: 0.012, h: 0.08, d: 0.08 }, M.accent);

  return { id: storeys === 2 ? "shopfront" : "shopfront/tall", draft, windows, roofPads: [], maxProps: 0 };
}

/**
 * A terrace: three narrow houses in a row under one slate roof. The middle
 * one is bare brick, its neighbours are painted, and every door is its own
 * colour -- which is what a real terrace does with one design.
 */
export function terrace(): ArchetypeModel {
  const draft = settlementDraft();
  const halfW = 0.48;
  const halfD = 0.38;
  const wallTop = 0.66;
  const houses = 3;
  const houseW = (halfW * 2) / houses;
  const walls = [M.wall, M.brick, M.wallShade];
  const doors = [M.accent, M.door, M.accentDark];

  box(draft, { y: 0, w: halfW * 2 + 0.02, h: 0.035, d: halfD * 2 + 0.02 }, M.stoneDark);
  for (let i = 0; i < houses; i++) {
    const x = -halfW + houseW * (i + 0.5);
    box(draft, { x, y: 0.035, w: houseW, h: wallTop - 0.035, d: halfD * 2, skipBottom: true }, walls[i]);
  }
  // Party-wall pilasters between the houses, and a string course.
  for (let i = 1; i < houses; i++) {
    const u = -halfW + houseW * i;
    wallBox(draft, { facing: "+z", plane: halfD, u, v: 0.035, w: 0.024, h: wallTop - 0.035, depth: 0.014 }, M.frame);
  }
  box(draft, { y: 0.34, w: halfW * 2 + 0.012, h: 0.014, d: halfD * 2 + 0.012, skipBottom: true }, M.frame);

  gableRoof(draft, {
    y: wallTop,
    w: halfW * 2,
    d: halfD * 2,
    rise: 0.28,
    overhang: 0.02,
    thickness: 0.03,
    ridge: "x",
    roof: M.slate,
    gable: M.wall,
    ridgeCap: M.slateDark,
  });
  for (let i = 1; i < houses; i++) {
    const x = -halfW + houseW * i;
    chimney(draft, { x, z: -0.02, y0: 0.8, top: 1.03, w: 0.07, d: 0.14, mat: M.brick, pots: 2 });
  }
  for (const s of [-1, 1]) {
    chimney(draft, { x: s * (halfW - 0.035), z: -0.02, y0: 0.72, top: 1.0, w: 0.07, d: 0.14, mat: M.brick, pots: 1 });
  }

  const windows: Panel[] = [];
  for (let i = 0; i < houses; i++) {
    const centre = -halfW + houseW * (i + 0.5);
    // Doors alternate sides, so neighbours share a pair of steps.
    const doorSide = i % 2 === 0 ? -1 : 1;
    const doorU = centre + doorSide * houseW * 0.24;
    const winU = centre - doorSide * houseW * 0.18;
    door(draft, { facing: "+z", plane: halfD, u: doorU, v: 0.06, w: 0.075, h: 0.24, mat: doors[i], fanlight: true });
    // A shallow bay at the ground floor: a stone base, glass on its face and
    // a little lead roof.
    wallBox(draft, { facing: "+z", plane: halfD, u: winU, v: 0.035, w: 0.13, h: 0.075, depth: 0.05 }, M.stone);
    wallBox(draft, { facing: "+z", plane: halfD, u: winU, v: 0.11, w: 0.13, h: 0.2, depth: 0.05 }, M.frame);
    const bay: Panel = { facing: "+z", u: winU, v: 0.205, w: 0.11, h: 0.17, plane: halfD + 0.053 };
    panel(draft, bay, M.glass);
    panel(draft, { ...bay, w: 0.008, plane: bay.plane + 0.003 }, M.frame);
    panel(draft, { ...bay, v: bay.v + 0.035, h: 0.008, plane: bay.plane + 0.003 }, M.frame);
    box(draft, { x: winU, y: 0.31, z: halfD + 0.028, w: 0.145, h: 0.02, d: 0.068 }, M.slateDark);
    windows.push(bay);
    windows.push(framedWindow(draft, { facing: "+z", plane: halfD, u: winU, v: 0.5, w: 0.1, h: 0.16, bars: "sash", frame: 0.012 }));
    windows.push(framedWindow(draft, { facing: "+z", plane: halfD, u: doorU, v: 0.52, w: 0.055, h: 0.12, bars: "sash", frame: 0.01 }));
    windows.push(framedWindow(draft, { facing: "-z", plane: halfD, u: -centre, v: 0.5, w: 0.1, h: 0.14, bars: "sash" }));
    windows.push(framedWindow(draft, { facing: "-z", plane: halfD, u: -centre, v: 0.2, w: 0.1, h: 0.14, bars: "sash" }));
  }
  windows.push(framedWindow(draft, { facing: "+x", plane: halfW, u: 0, v: 0.5, w: 0.1, h: 0.13, bars: "sash" }));
  windows.push(framedWindow(draft, { facing: "-x", plane: halfW, u: 0, v: 0.5, w: 0.1, h: 0.13, bars: "sash" }));

  return { id: "terrace", draft, windows, roofPads: [], maxProps: 0 };
}

/**
 * A low block of flats: four storeys of painted render over a stone base,
 * balconies with railings on the front, a canopy over the entrance, and a
 * flat roof behind a parapet with room for plant. The retail variant puts a
 * row of shops under it, for the high street.
 */
export function apartmentLow(retail: boolean): ArchetypeModel {
  const draft = settlementDraft();
  const halfW = 0.47;
  const halfD = 0.44;
  const roofY = 0.93;
  const floors = 4;
  const base = retail ? 0.24 : 0.2;
  const floorH = (roofY - base) / (floors - 1 + 0.001);

  box(draft, { y: 0, w: halfW * 2 + 0.01, h: base, d: halfD * 2 + 0.01 }, retail ? M.wallDeep : M.stone);
  box(draft, { y: base, w: halfW * 2, h: roofY - base, d: halfD * 2, skipBottom: true }, M.wall);
  box(draft, { y: roofY - 0.004, w: halfW * 2 - 0.04, h: 0.006, d: halfD * 2 - 0.04, skipBottom: true }, M.concreteDark);
  box(draft, { y: roofY - 0.02, w: halfW * 2 + 0.024, h: 0.02, d: halfD * 2 + 0.024, skipBottom: true }, M.frame);
  parapet(draft, roofY, halfW + 0.01, halfD + 0.01, 0.045);
  // String courses at each floor line.
  for (let f = 1; f < floors - 1; f++) {
    box(draft, { y: base + f * floorH - 0.006, w: halfW * 2 + 0.01, h: 0.01, d: halfD * 2 + 0.01, skipBottom: true }, M.wallShade);
  }
  // A stair tower head on the roof.
  box(draft, { x: -0.22, y: roofY, z: -0.18, w: 0.2, h: 0.06, d: 0.16, skipBottom: true }, M.wallShade);

  const windows: Panel[] = [];
  const upper = Array.from({ length: floors - 1 }, (_, f) => base + (f + 0.5) * floorH);
  const columns = [-0.32, -0.11, 0.11, 0.32];
  for (const v of upper) {
    for (const u of columns) {
      windows.push(framedWindow(draft, { facing: "+z", plane: halfD, u, v, w: 0.12, h: floorH * 0.5, bars: "none" }));
      windows.push(framedWindow(draft, { facing: "-z", plane: halfD, u, v, w: 0.12, h: floorH * 0.5, bars: "none" }));
    }
    for (const u of [-0.2, 0.2]) {
      windows.push(framedWindow(draft, { facing: "+x", plane: halfW, u, v, w: 0.11, h: floorH * 0.5, bars: "none" }));
      windows.push(framedWindow(draft, { facing: "-x", plane: halfW, u, v, w: 0.11, h: floorH * 0.5, bars: "none" }));
    }
    // Balconies on the two middle bays of the front.
    const floorY = v - floorH * 0.5 + 0.004;
    const railH = floorH * 0.24;
    for (const u of [-0.215, 0.215]) {
      wallBox(draft, { facing: "+z", plane: halfD, u, v: floorY, w: 0.34, h: 0.014, depth: 0.08 }, M.concrete);
      // A painted panel along the front, a rail on top, and two end panels.
      wallBox(draft, { facing: "+z", plane: halfD + 0.072, u, v: floorY + 0.014, w: 0.34, h: railH, depth: 0.008 }, M.accent);
      wallBox(draft, { facing: "+z", plane: halfD + 0.07, u, v: floorY + 0.014 + railH, w: 0.35, h: 0.008, depth: 0.012 }, M.frame);
      for (const s of [-1, 1]) {
        wallBox(draft, { facing: "+z", plane: halfD, u: u + s * 0.166, v: floorY + 0.014, w: 0.008, h: railH, depth: 0.075 }, M.accentDark);
      }
    }
  }

  if (retail) {
    windows.push(...shopFront(draft, { plane: halfD + 0.005, halfW, top: base }));
    door(draft, { facing: "-z", plane: halfD, u: 0, v: 0, w: 0.14, h: base * 0.8, mat: M.accent });
  } else {
    // The entrance under a canopy, with glass either side.
    door(draft, { facing: "+z", plane: halfD + 0.005, u: 0, v: 0.02, w: 0.14, h: 0.15, mat: M.accent, surround: M.frame });
    wallBox(draft, { facing: "+z", plane: halfD, u: 0, v: 0.18, w: 0.3, h: 0.014, depth: 0.1 }, M.frame);
    for (const u of [-0.32, -0.16, 0.16, 0.32]) {
      windows.push(framedWindow(draft, { facing: "+z", plane: halfD + 0.005, u, v: 0.1, w: 0.1, h: 0.08, bars: "none" }));
    }
  }

  return {
    id: retail ? "apartment-low/retail" : "apartment-low",
    draft,
    windows,
    roofPads: [{ x: 0.18, z: 0.12, y: roofY, w: 0.46, d: 0.5 }],
    maxProps: 2,
  };
}
