/**
 * The village's buildings (PLAN.md 76.1 decision 7): the thatched cottage and
 * its tiled cousin, the farmhouse, and the barn.
 *
 * Same unit space and conventions as `models.ts` -- x and z in [-0.5, 0.5],
 * y in [0, 1], the front door on +z -- and built with `kit.ts`, so the walls
 * take the instance's limewash, the doors and shutters its accent, and the
 * thatch, tile, stone and glass keep their own colours.
 *
 * Proportions are for the village's heights (3.4 to 7.6, PLAN.md 76.5): a
 * cottage is one storey under a deep roof, the farmhouse two, the barn a tall
 * single volume. Pure arrays, no three.js. Unit tested.
 */

import type { ArchetypeModel } from "./models";
import { LAYER, PANEL_LIFT, type Panel } from "./mesh";
import {
  M,
  box,
  chimney,
  cylinder,
  door,
  face,
  framedWindow,
  gableRoof,
  hipRoof,
  panel,
  quad,
  settlementDraft,
  slab,
  wallBox,
  type Mat,
} from "./kit";

/** A climbing rose: a patch of leaves up the wall with a few flowers in it. */
function climbingRose(
  draft: ReturnType<typeof settlementDraft>,
  spec: { plane: number; u: number; h: number },
): void {
  wallBox(draft, { facing: "+z", plane: spec.plane, u: spec.u, v: 0.02, w: 0.07, h: spec.h, depth: 0.03 }, M.leaf);
  wallBox(draft, { facing: "+z", plane: spec.plane, u: spec.u + 0.005, v: spec.h * 0.72, w: 0.085, h: spec.h * 0.3, depth: 0.028 }, M.leaf);
  const blooms: [number, number][] = [
    [-0.012, 0.3],
    [0.02, 0.55],
    [0.05, 0.8],
    [-0.01, 0.92],
  ];
  for (const [du, dv] of blooms) {
    wallBox(
      draft,
      { facing: "+z", plane: spec.plane + 0.03, u: spec.u + du, v: spec.h * dv, w: 0.026, h: 0.022, depth: 0.012 },
      M.flowerPink,
    );
  }
}

/**
 * The cottage. One storey of limewashed wall under either a deep hipped
 * thatch with a ridge roll, or a steep gabled clay-tile roof with a porch
 * hood. A stone chimney, a painted door off-centre, shutters and window
 * boxes at the front, and a rose up the wall by the door.
 */
export function cottage(roof: "thatch" | "tile"): ArchetypeModel {
  const draft = settlementDraft();
  const wallTop = roof === "thatch" ? 0.5 : 0.52;
  const halfW = 0.42;
  const halfD = 0.37;

  box(draft, { y: 0, w: halfW * 2 + 0.04, h: 0.045, d: halfD * 2 + 0.04 }, M.stoneDark);
  box(draft, { y: 0.045, w: halfW * 2, h: wallTop - 0.045, d: halfD * 2, skipBottom: true }, M.wall);

  if (roof === "thatch") {
    // Deep, soft and low: the eave comes well down the wall and the ridge is
    // short, which is what makes a thatch read as a thatch at any distance.
    hipRoof(draft, {
      y: wallTop,
      w: halfW * 2,
      d: halfD * 2,
      rise: 0.46,
      overhang: 0.05,
      thickness: 0.065,
      ridge: "x",
      ridgeLength: 0.3,
      roof: M.thatch,
      gable: M.wall,
      ridgeCap: M.thatchDark,
      ridgeBand: M.thatchLight,
    });
    chimney(draft, { x: 0.25, z: -0.07, y0: 0.55, top: 1.06, w: 0.1, d: 0.11 });
  } else {
    gableRoof(draft, {
      y: wallTop,
      w: halfW * 2,
      d: halfD * 2,
      rise: 0.38,
      overhang: 0.05,
      thickness: 0.035,
      ridge: "x",
      roof: M.tile,
      gable: M.wall,
      ridgeCap: M.tileDark,
    });
    // The chimney stands on the gable end, the way a cottage hearth does.
    // Its breast starts at the wall face rather than inside the wall, so its
    // top does not share a plane with the wall's.
    box(draft, { x: halfW + 0.035, y: 0, z: -0.08, w: 0.07, h: 0.52, d: 0.14 }, M.stone);
    chimney(draft, { x: halfW - 0.02, z: -0.08, y0: 0.5, top: 1.0, w: 0.1, d: 0.12, pots: 2 });
    // A porch hood on brackets over the door.
    gableRoof(draft, {
      x: 0.1,
      z: halfD + 0.055,
      y: 0.395,
      w: 0.2,
      d: 0.1,
      rise: 0.07,
      overhang: 0.015,
      thickness: 0.02,
      ridge: "z",
      roof: M.tileDark,
      gable: M.frame,
    });
    // Brackets clear of the climbing rose beside the door.
    for (const s of [-1, 1]) {
      box(draft, { x: 0.1 + s * 0.085, y: 0.33, z: halfD + 0.05, w: 0.02, h: 0.055, d: 0.08 }, M.timber);
    }
  }

  const front = halfD;
  door(draft, { facing: "+z", plane: front, u: 0.1, v: 0.045, w: 0.13, h: 0.28 });
  climbingRose(draft, { plane: front, u: 0.22, h: 0.36 });

  const windows: Panel[] = [
    framedWindow(draft, {
      facing: "+z",
      plane: front,
      u: -0.23,
      v: 0.28,
      w: 0.15,
      h: 0.13,
      shutters: roof === "tile",
      flowers: M.flowerRed,
    }),
    framedWindow(draft, { facing: "+z", plane: front, u: 0.33, v: 0.28, w: 0.1, h: 0.12, flowers: M.flowerYellow }),
    framedWindow(draft, { facing: "-z", plane: front, u: -0.18, v: 0.28, w: 0.14, h: 0.13 }),
    framedWindow(draft, { facing: "-z", plane: front, u: 0.2, v: 0.28, w: 0.14, h: 0.13 }),
    framedWindow(draft, { facing: "+x", plane: halfW, u: 0.08, v: 0.28, w: 0.13, h: 0.13 }),
    framedWindow(draft, { facing: "-x", plane: halfW, u: 0, v: 0.28, w: 0.13, h: 0.13 }),
  ];

  return { id: roof === "thatch" ? "cottage" : "cottage/tile", draft, windows, roofPads: [], maxProps: 0 };
}

/**
 * The farmhouse. Two storeys of wall under a clay-tile gable with a chimney
 * at each end, a porch on the front, and a stone lean-to scullery on one side
 * under its own mono-pitch roof.
 */
export function farmhouse(): ArchetypeModel {
  const draft = settlementDraft();
  // The main block, pushed to +x so the lean-to fits on -x.
  const cx = 0.13;
  const halfW = 0.33;
  const halfD = 0.34;
  const wallTop = 0.62;

  box(draft, { x: cx, y: 0, w: halfW * 2 + 0.04, h: 0.04, d: halfD * 2 + 0.04 }, M.stoneDark);
  box(draft, { x: cx, y: 0.04, w: halfW * 2, h: wallTop - 0.04, d: halfD * 2, skipBottom: true }, M.wall);
  // A string course between the storeys, two layers proud: the door's
  // surround reaches up behind it.
  box(draft, { x: cx, y: 0.33, w: halfW * 2 + LAYER * 4, h: 0.014, d: halfD * 2 + LAYER * 4, skipBottom: true }, M.wallShade);
  gableRoof(draft, {
    x: cx,
    y: wallTop,
    w: halfW * 2,
    d: halfD * 2,
    rise: 0.3,
    overhang: 0.035,
    thickness: 0.032,
    ridge: "x",
    roof: M.tile,
    gable: M.wall,
    ridgeCap: M.tileDark,
  });
  // The stacks stand just inside the gable walls. Half a hundredth further
  // out, as they were, their faces lay a hair in front of the gable and the
  // two flickered through each other from any distance.
  for (const end of [-1, 1]) {
    chimney(draft, { x: cx + end * (halfW - 0.045 - LAYER * 2), z: 0, y0: 0.7, top: 1.02, w: 0.09, d: 0.13, pots: 2 });
  }

  // The lean-to: stone, lower, its roof falling away from the house.
  const leanX0 = -0.49;
  const leanX1 = cx - halfW;
  const leanHalfD = 0.26;
  // The roof's underside clears the top of the wall all the way to the eave;
  // it used to cut through it, and a line of stone showed along the tiles.
  const leanWall = 0.28;
  box(draft, { x: (leanX0 + leanX1) / 2, y: 0, w: leanX1 - leanX0, h: leanWall, d: leanHalfD * 2 }, M.stone);
  slab(
    draft,
    [
      [leanX1 + 0.005, 0.44, leanHalfD + 0.035],
      [leanX1 + 0.005, 0.44, -leanHalfD - 0.035],
      [leanX0 - 0.01, 0.31, -leanHalfD - 0.035],
      [leanX0 - 0.01, 0.31, leanHalfD + 0.035],
    ],
    0.03,
    M.tileDark,
  );
  // Close the triangle between the stone wall and its sloping roof.
  for (const s of [1, -1]) {
    face(
      draft,
      [
        [leanX0, leanWall, s * leanHalfD],
        [leanX1, leanWall, s * leanHalfD],
        [leanX1, 0.42, s * leanHalfD],
      ],
      [(leanX0 + leanX1) / 2, leanWall, 0],
      M.stone,
    );
  }
  door(draft, { facing: "+z", plane: leanHalfD, u: (leanX0 + leanX1) / 2 + 0.02, v: 0, w: 0.1, h: 0.22, mat: M.timber, surround: M.stoneDark, step: false });

  // A porch: two posts and a little gabled roof over the front door.
  const front = halfD;
  gableRoof(draft, {
    x: cx,
    z: front + 0.07,
    y: 0.3,
    w: 0.24,
    d: 0.13,
    rise: 0.08,
    overhang: 0.015,
    thickness: 0.022,
    ridge: "z",
    roof: M.tileDark,
    gable: M.frame,
  });
  // The posts stop inside the porch roof rather than poking through it.
  for (const s of [-1, 1]) {
    box(draft, { x: cx + s * 0.1, y: 0.02, z: front + 0.12, w: 0.02, h: 0.275, d: 0.02 }, M.frame);
  }
  box(draft, { x: cx, y: 0, z: front + 0.07, w: 0.26, h: 0.02, d: 0.15 }, M.stone);
  door(draft, { facing: "+z", plane: front, u: 0, cx, v: 0.02, w: 0.12, h: 0.24, fanlight: true, step: false });

  const windows: Panel[] = [
    framedWindow(draft, { facing: "+z", plane: front, cx, u: -0.2, v: 0.19, w: 0.13, h: 0.14, flowers: M.flowerRed }),
    framedWindow(draft, { facing: "+z", plane: front, cx, u: 0.2, v: 0.19, w: 0.13, h: 0.14, flowers: M.flowerRed }),
    // Far enough apart that a shutter never overlaps the middle window's frame.
    framedWindow(draft, { facing: "+z", plane: front, cx, u: -0.21, v: 0.48, w: 0.12, h: 0.13, shutters: true, bars: "sash" }),
    framedWindow(draft, { facing: "+z", plane: front, cx, u: 0, v: 0.48, w: 0.1, h: 0.12, bars: "sash" }),
    framedWindow(draft, { facing: "+z", plane: front, cx, u: 0.21, v: 0.48, w: 0.12, h: 0.13, shutters: true, bars: "sash" }),
    framedWindow(draft, { facing: "-z", plane: front, cx, u: -0.14, v: 0.19, w: 0.12, h: 0.13 }),
    framedWindow(draft, { facing: "-z", plane: front, cx, u: 0.14, v: 0.48, w: 0.12, h: 0.13 }),
    framedWindow(draft, { facing: "+x", plane: halfW, cx, u: 0, v: 0.48, w: 0.12, h: 0.13 }),
    framedWindow(draft, { facing: "+x", plane: halfW, cx, u: 0.12, v: 0.19, w: 0.12, h: 0.13 }),
  ];

  return { id: "farmhouse", draft, windows, roofPads: [], maxProps: 0 };
}

/** A thin bar across a wall between two points in its plane: the white X on a barn door. */
function brace(
  draft: ReturnType<typeof settlementDraft>,
  z: number,
  from: [number, number],
  to: [number, number],
  width: number,
  mat: Mat,
): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  quad(
    draft,
    [from[0] - nx, from[1] - ny, z],
    [to[0] - nx, to[1] - ny, z],
    [to[0] + nx, to[1] + ny, z],
    [from[0] + nx, from[1] + ny, z],
    mat,
  );
}

/**
 * The barn. Board-and-batten walls in the barn's own paint under a gambrel
 * roof, big braced doors and a hay loft on the gable that faces the lane, a
 * cupola on the ridge, and a stone silo standing beside it.
 */
export function barn(): ArchetypeModel {
  const draft = settlementDraft();
  const cx = -0.12;
  const halfW = 0.31;
  const halfD = 0.45;
  // The gambrel, across x: eave, knee, ridge.
  const eave = { x: halfW + 0.04, y: 0.46 };
  const knee = { x: 0.2, y: 0.72 };
  const ridgeY = 0.86;
  const slopeLow = (knee.y - eave.y) / (eave.x - knee.x);
  const atWall = eave.y + (eave.x - halfW) * slopeLow;

  box(draft, { x: cx, y: 0, w: halfW * 2 + 0.03, h: 0.035, d: halfD * 2 + 0.03 }, M.stoneDark);
  box(draft, { x: cx, y: 0.035, w: halfW * 2, h: atWall - 0.035, d: halfD * 2, skipBottom: true }, M.wall);

  const roofZ = halfD + 0.03;
  for (const side of [1, -1]) {
    slab(
      draft,
      [
        [cx + side * eave.x, eave.y, roofZ],
        [cx + side * knee.x, knee.y, roofZ],
        [cx + side * knee.x, knee.y, -roofZ],
        [cx + side * eave.x, eave.y, -roofZ],
      ],
      0.028,
      M.barnRoof,
    );
    slab(
      draft,
      [
        [cx + side * knee.x, knee.y, roofZ],
        [cx, ridgeY, roofZ],
        [cx, ridgeY, -roofZ],
        [cx + side * knee.x, knee.y, -roofZ],
      ],
      0.028,
      M.barnRoof,
    );
  }
  // Gable ends, as a pentagon of two quads.
  for (const end of [1, -1]) {
    const z = end * halfD;
    const inside: [number, number, number] = [cx, 0.5, 0];
    face(
      draft,
      [
        [cx - halfW, atWall, z],
        [cx + halfW, atWall, z],
        [cx + knee.x - 0.004, knee.y - 0.004, z],
        [cx - knee.x + 0.004, knee.y - 0.004, z],
      ],
      inside,
      M.wall,
    );
    face(
      draft,
      [
        [cx - knee.x + 0.004, knee.y - 0.004, z],
        [cx + knee.x - 0.004, knee.y - 0.004, z],
        [cx, ridgeY - 0.006, z],
      ],
      inside,
      M.wall,
    );
  }

  // Battens down the long walls: the board-and-batten that says "barn".
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const u = -halfD + 0.07 + i * ((halfD * 2 - 0.14) / 6);
      panel(draft, { facing: side > 0 ? "+x" : "-x", cx, u: side * u, v: atWall / 2 + 0.02, w: 0.014, h: atWall - 0.06, plane: halfW }, M.wallDeep);
    }
  }

  // The big doors on the lane gable, with their white frames and braces.
  const doorW = 0.34;
  const doorH = 0.36;
  panel(draft, { facing: "+z", cx, u: 0, v: 0.035 + doorH / 2, w: doorW, h: doorH, plane: halfD }, M.wallDeep);
  // The braces a layer in front of the doors, and all in one plane: they are
  // one colour, so where they cross nothing can flicker. The bottom rail sits
  // on the plinth rather than behind its face.
  const t = 0.018;
  const x0 = cx - doorW / 2;
  const x1 = cx + doorW / 2;
  const y0 = 0.035 + t / 2;
  const y1 = 0.035 + doorH;
  const zb = halfD + PANEL_LIFT + LAYER;
  brace(draft, zb, [x0, y0], [x0, y1], t, M.frame);
  brace(draft, zb, [x1, y0], [x1, y1], t, M.frame);
  brace(draft, zb, [cx, y0], [cx, y1], t, M.frame);
  brace(draft, zb, [x0, y1], [x1, y1], t, M.frame);
  brace(draft, zb, [x0, y0], [x1, y0], t, M.frame);
  for (const [a, b] of [
    [x0, cx],
    [cx, x1],
  ]) {
    brace(draft, zb, [a, y0], [b, y1], t, M.frame);
    brace(draft, zb, [a, y1], [b, y0], t, M.frame);
  }
  // The hay loft: a hatch with hay showing, and the hoist beam over it.
  panel(draft, { facing: "+z", cx, u: 0, v: 0.6, w: 0.13, h: 0.12, plane: halfD }, M.frame);
  panel(draft, { facing: "+z", cx, u: 0, v: 0.595, w: 0.1, h: 0.095, plane: halfD + LAYER }, M.hay);
  box(draft, { x: cx, y: 0.73, z: halfD + 0.05, w: 0.03, h: 0.03, d: 0.12 }, M.timberDark);

  // A cupola on the ridge.
  box(draft, { x: cx, y: ridgeY - 0.03, z: 0, w: 0.08, h: 0.09, d: 0.08 }, M.frame);
  panel(draft, { facing: "+x", cx, u: 0, v: ridgeY + 0.02, w: 0.04, h: 0.04, plane: 0.04 }, M.timberDark);
  panel(draft, { facing: "-x", cx, u: 0, v: ridgeY + 0.02, w: 0.04, h: 0.04, plane: 0.04 }, M.timberDark);
  slab(
    draft,
    [
      [cx - 0.06, ridgeY + 0.06, 0.06],
      [cx + 0.06, ridgeY + 0.06, 0.06],
      [cx + 0.06, ridgeY + 0.06, -0.06],
      [cx - 0.06, ridgeY + 0.06, -0.06],
    ],
    0.012,
    M.barnRoof,
  );
  face(draft, [[cx - 0.06, ridgeY + 0.06, 0.06], [cx + 0.06, ridgeY + 0.06, 0.06], [cx, ridgeY + 0.11, 0]], [cx, ridgeY + 0.06, 0], M.barnRoof);
  face(draft, [[cx + 0.06, ridgeY + 0.06, -0.06], [cx - 0.06, ridgeY + 0.06, -0.06], [cx, ridgeY + 0.11, 0]], [cx, ridgeY + 0.06, 0], M.barnRoof);
  face(draft, [[cx + 0.06, ridgeY + 0.06, 0.06], [cx + 0.06, ridgeY + 0.06, -0.06], [cx, ridgeY + 0.11, 0]], [cx, ridgeY + 0.06, 0], M.barnRoof);
  face(draft, [[cx - 0.06, ridgeY + 0.06, -0.06], [cx - 0.06, ridgeY + 0.06, 0.06], [cx, ridgeY + 0.11, 0]], [cx, ridgeY + 0.06, 0], M.barnRoof);

  // The silo: concrete staves with darker hoops and a metal dome.
  const sx = 0.35;
  const sz = -0.2;
  const radius = 0.115;
  cylinder(draft, { x: sx, y: 0, z: sz, radius, h: 0.9, segments: 10 }, M.concrete);
  for (const hy of [0.22, 0.46, 0.7]) {
    cylinder(draft, { x: sx, y: hy, z: sz, radius: radius + 0.006, h: 0.02, segments: 10 }, M.concreteDark);
  }
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2;
    const a1 = ((i + 1) / 10) * Math.PI * 2;
    face(
      draft,
      [
        [sx + Math.cos(a0) * radius, 0.9, sz + Math.sin(a0) * radius],
        [sx + Math.cos(a1) * radius, 0.9, sz + Math.sin(a1) * radius],
        [sx, 1.0, sz],
      ],
      [sx, 0.9, sz],
      M.metal,
    );
  }
  // A chute from the silo into the barn.
  box(draft, { x: (sx - radius + cx + halfW) / 2, y: 0.4, z: sz, w: sx - radius - (cx + halfW) + 0.01, h: 0.05, d: 0.05 }, M.metal);

  // The long walls' windows sit a layer out, over the battens.
  const onBattens = halfW + LAYER;
  const windows: Panel[] = [
    framedWindow(draft, { facing: "+x", cx, plane: onBattens, u: 0.28, v: 0.3, w: 0.09, h: 0.08, bars: "cross" }),
    framedWindow(draft, { facing: "-x", cx, plane: onBattens, u: -0.28, v: 0.3, w: 0.09, h: 0.08, bars: "cross" }),
    framedWindow(draft, { facing: "-x", cx, plane: onBattens, u: 0.28, v: 0.3, w: 0.09, h: 0.08, bars: "cross" }),
    framedWindow(draft, { facing: "-z", cx, plane: halfD, u: 0, v: 0.35, w: 0.1, h: 0.09, bars: "cross" }),
  ];

  return { id: "barn", draft, windows, roofPads: [], maxProps: 0 };
}
