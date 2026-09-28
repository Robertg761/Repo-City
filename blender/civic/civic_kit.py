"""
The civic kit (spike: Blender assets vs procedural): the parts the five civic
buildings in `components/city/models/buildings/civic.ts` are assembled from.

A civic building is authored in world units from the plot the generator
reserved, so no fixed mesh fills it. What is modelled here are the PARTS, each
its own node with its origin where `civic.ts` places it, and each authored so
that the way `civic.ts` scales it is safe:

  uniform       ColumnBase, ColumnCapital, Clock, Belfry, Spire, Lantern,
                Baluster, Container, FlagTop, Vent, Bell -- sized by one
                number (a column's radius, a tower's width) and never
                stretched, so their proportions and bevels hold;
  one axis      ColumnShaft, FlagPole (y), Steps3/Steps4 and StepCheek
                (a stair is planar, any of x, y, z), RollDoor, Door and
                Buttress (their mouldings run along the stretched axis);
  near-uniform  Pediment (authored at the proportions the buildings use,
                corrected by a few per cent on y and z).

The walls, slabs and band courses stay boxes in `civic.ts`: a box is exact at
any size. Their cornice PROFILES are authored here and written to the model's
meta (`civic-kit.meta.json`), and `civic.ts` sweeps them round the building,
which gives true mitred corners at any plot size.

Material roles are the civic palette's slots (wall, stone, roof, accent, trim,
door, window, metal, flag, container); `civic.ts` colours each from the
palette. `...Glow` nodes are warm glass, for the second draft.

    blender -b --python blender/export.py -- blender/civic/civic_kit.py civic-kit
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import civickit as ck  # noqa: E402
import kit  # noqa: E402
from kit import box, cyl  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Cornice profiles, (projection past the wall, height) from the wall line up,
# in world units: `civic.ts` sweeps them round a rectangle. A step is two
# points at one height; a slope is a cyma, cheap and legible from above.
PROFILES = {
    # The crowning cornice under a flat roof: fillet, cyma, corona, drip.
    "cornice": [(0.0, 0.0), (0.06, 0.0), (0.06, 0.06), (0.16, 0.14), (0.2, 0.14), (0.2, 0.26), (0.24, 0.26), (0.24, 0.3), (0.0, 0.3)],
    # A band course: a torus-ish roll and a fillet.
    "band": [(0.0, 0.0), (0.05, 0.03), (0.08, 0.09), (0.08, 0.13), (0.04, 0.16), (0.0, 0.18)],
    # The plinth's cap: a chamfered stone course.
    "plinthCap": [(0.0, 0.0), (0.05, 0.0), (0.05, 0.1), (0.0, 0.15)],
}

# Proportions `civic.ts` scales the near-uniform parts by.
PEDIMENT = {"h": 0.3, "d": 0.27}
DOOR = {"h": 2.6}


def palette():
    m = kit.material
    return {
        "wall": m("wall", "#e6e6e0", "plaster", 0.8),
        "stone": m("stone", "#f5f2ea", "stone", 0.8),
        "stoneDark": m("stone", "#f5f2ea", "stone", 0.8, tone=0.82),
        "roof": m("roof", "#b3c2c7", "slate", 0.7),
        "roofDeck": m("roof", "#b3c2c7", "concrete", 0.8),
        "roofMetal": m("roof", "#b3c2c7", "metal", 0.5),
        "accent": m("accent", "#80a8bd", "plaster", 0.6),
        "trim": m("trim", "#f2f2f0", "stone", 0.7),
        "door": m("door", "#59544a", "timber", 0.8),
        "doorDark": m("door", "#59544a", "timber", 0.8, tone=0.7),
        "window": m("window", "#4a5461", "glass", 0.3),
        "metal": m("metal", "#99a1a1", "metal", 0.4),
        "flag": m("flag", "#c75a3d", "fabric", 0.9),
        "container": m("container", "#4a87a8", "metal", 0.6),
        "containerDark": m("container", "#4a87a8", "metal", 0.6, tone=0.75),
        "glow": m("glow", "#ffd9a0", "glass", 0.3, emission=0.5),
    }


# ---------------------------------------------------------------------------
# Columns: radius 1, base and capital fixed, the shaft stretched on y.
# ---------------------------------------------------------------------------


def column_base(M):
    # Square plinth, a torus (a chamfered drum) and a fillet: 0.7 tall, like
    # the procedural base, 2.7 wide.
    return [
        ck.no_bottom(box("plinth", (2.7, 0.3, 2.7), (0, 0.15, 0), M["stone"], bev=0.0)),
        ck.lathe("torus", [(1.3, 0.3), (1.34, 0.46), (1.0, 0.7)], M["stone"], segments=8, cap_top=False, phase=math.pi / 8),
    ]


def column_shaft():
    # Tapered to the neck: a ring for entasis would cost as much again.
    return [(1.0, 0.0), (0.86, 1.0)]


def column_capital(M):
    # Necking ring, echinus flaring out to a square abacus: 0.8 tall.
    return [
        ck.lathe("echinus", [(0.86, 0.0), (0.98, 0.12), (1.4, 0.4)], M["stone"], segments=8, cap_top=False, phase=math.pi / 8),
        ck.no_bottom(box("abacus", (2.9, 0.4, 2.9), (0, 0.6, 0), M["stone"], bev=0.0)),
    ]


# ---------------------------------------------------------------------------
# The portico's pediment: width 1, apex PEDIMENT.h, depth PEDIMENT.d, facing +z.
# ---------------------------------------------------------------------------


def pediment(M):
    h, d = PEDIMENT["h"], PEDIMENT["d"]
    parts = []
    # The roof over the portico: a triangular prism, slopes in roof slate.
    parts.append(ck.xy_prism("gable", [(-0.5, 0), (0.5, 0), (0, h)], -d / 2, d / 2 - 0.03, (M["stone"], M["stone"], M["roof"])))
    # The tympanum, recessed behind its frame.
    parts.append(ck.xy_prism("tympanum", [(-0.42, 0.04), (0.42, 0.04), (0, h - 0.04)], d / 2 - 0.05, d / 2 - 0.02, M["stoneDark"]))
    # Raking cornices and the horizontal one, standing proud.
    slope = math.atan2(h, 0.5)
    t = 0.035
    for s in (-1, 1):
        a = (s * 0.53, -0.005)
        b = (0, h + 0.03)
        prof = [(a[0], a[1]), (b[0], b[1]), (b[0], b[1] + t * 1.2), (a[0] - s * 0.01, a[1] + t)]
        parts.append(ck.xy_prism("rake", prof if s > 0 else list(reversed(prof)), -d / 2 - 0.01, d / 2 + 0.02, M["trim"]))
    parts.append(box("corona", (1.06, 0.045, d + 0.08), (0, 0.0, 0.01), M["trim"], bev=0.0))
    # An oculus in its ring, each standing clear of the one behind.
    parts.append(ck.drop_faces(kit.cyl("oculusRing", h * 0.25, 0.02, (0, h * 0.45, d / 2 - 0.01), M["trim"], axis="z", verts=12), lambda n: n.y > 0.9))
    parts.append(ck.drop_faces(kit.cyl("oculus", h * 0.2, 0.02, (0, h * 0.45, d / 2 + 0.01), M["accent"], axis="z", verts=12), lambda n: n.y > 0.9))
    return parts


# ---------------------------------------------------------------------------
# Steps: width 1 (x), height 1 (y), run 1 (z) from the building out to +z.
# ---------------------------------------------------------------------------


def steps(M, treads):
    parts = []
    for i in range(treads):
        top = 1 - i / treads
        z0, z1 = i / treads, (i + 1) / treads
        w = 1 - i * 0.04
        # The riser and the tread, with a nosing lip on the front edge.
        parts.append(ck.no_bottom(box("tread", (w, top, z1 - z0 + 0.001), (0, top / 2, (z0 + z1) / 2), M["stone"], bev=0.0)))
        # The nosing stands proud of the tread it caps: the depth buffer has
        # to tell the two tops apart from the overview.
        parts.append(box("nosing", (w + 0.01, 0.1, 0.05), (0, top - 0.01, z1 + 0.012), M["trim"], bev=0.0))
    return parts


def step_cheek(M):
    # A cheek wall with a coping that overhangs it: width 1, height 1.15, run 1.
    return [
        ck.no_bottom(box("cheek", (1.0, 1.0, 1.0), (0, 0.5, 0.5), M["stone"], bev=0.0)),
        box("coping", (1.2, 0.15, 1.04), (0, 1.075, 0.5), M["trim"], bev=0.03),
    ]


# ---------------------------------------------------------------------------
# The clock: radius 1, on the wall plane, facing +z.
# ---------------------------------------------------------------------------


def clock(M):
    parts = [
        ck.drop_faces(kit.cyl("bezel", 1.14, 0.1, (0, 0, 0.05), M["trim"], axis="z", verts=12), lambda n: n.y > 0.9),
        ck.face("face", [(math.cos(a) * 0.98, math.sin(a) * 0.98, 0.15) for a in (2 * math.pi * (i + 0.5) / 12 for i in range(12))], M["stone"], (0, 0, 1)),
    ]
    # Each layer 5 hundredths of the radius off the one behind it: a clock
    # 0.3 across is still separable from the overview.
    z = 0.2
    for hour in range(12):
        a = hour * math.pi / 6
        long = 0.16 if hour % 3 == 0 else 0.1
        wide = 0.07 if hour % 3 == 0 else 0.05
        c, s = math.cos(a), math.sin(a)
        r0, r1 = 0.84 - long, 0.84
        # A radial tick: four corners in the dial's plane.
        corners = [
            (s * r0 - c * wide / 2, c * r0 + s * wide / 2, z),
            (s * r0 + c * wide / 2, c * r0 - s * wide / 2, z),
            (s * r1 + c * wide / 2, c * r1 - s * wide / 2, z),
            (s * r1 - c * wide / 2, c * r1 + s * wide / 2, z),
        ]
        parts.append(ck.face("tick", corners, M["door"], (0, 0, 1)))
    # Ten to two, the clockmaker's hour.
    for angle, length, wide, lift in ((math.radians(-60), 0.5, 0.1, 0.05), (math.radians(60), 0.78, 0.06, 0.1)):
        c, s = math.cos(angle), math.sin(angle)
        corners = [
            (-c * wide / 2 - s * 0.1, s * wide / 2 - c * 0.1, z + lift),
            (c * wide / 2 - s * 0.1, -s * wide / 2 - c * 0.1, z + lift),
            (c * wide / 2 + s * length, -s * wide / 2 + c * length, z + lift),
            (-c * wide / 2 + s * length, s * wide / 2 + c * length, z + lift),
        ]
        parts.append(ck.face("hand", corners, M["door"], (0, 0, 1)))
    parts.append(ck.face("boss", [(math.cos(a) * 0.08, math.sin(a) * 0.08, z + 0.045) for a in (2 * math.pi * i / 6 for i in range(6))], M["metal"], (0, 0, 1)))
    parts[-1].data.transform(__import__("mathutils").Matrix.Translation(kit.B((0, 0, 0.1))))
    return parts


# ---------------------------------------------------------------------------
# The clock hall's belfry and spire: tower width 1, origin at the stage floor.
# ---------------------------------------------------------------------------

BELFRY_H = 1.04  # base slab 0.16, open stage 0.7, cornice 0.18
SPIRE_H = 1.2


def belfry(M):
    parts = [ck.no_bottom(box("floor", (1.24, 0.16, 1.24), (0, 0.08, 0), M["trim"], bev=0.0))]
    stage0, stage1 = 0.16, 0.86
    for dx in (-1, 1):
        for dz in (-1, 1):
            parts.append(ck.no_bottom(box("pier", (0.2, stage1 - stage0, 0.2), (dx * 0.4, (stage0 + stage1) / 2, dz * 0.4), M["stone"], bev=0.0)))
    # A round-headed arch on each face, springing from the piers.
    spring = stage1 - 0.24
    arch = [(-0.3, spring), (-0.2, spring + 0.13), (0.0, spring + 0.18), (0.2, spring + 0.13), (0.3, spring), (0.3, stage1), (-0.3, stage1)]
    from mathutils import Matrix

    for facing in range(4):
        obj = ck.xy_prism("arch", arch, -0.06, 0.06, M["stone"])
        obj.data.transform(Matrix.Rotation(facing * math.pi / 2, 4, "Z") @ Matrix.Translation(kit.B((0, 0, 0.42))))
        parts.append(obj)
    # The bell, hung in the middle of the stage.
    parts.append(ck.lathe("bell", [(0.24, 0.3), (0.15, 0.48), (0.12, 0.6), (0.0, 0.64)], M["metal"], segments=8, cap_top=False, cap_bottom=True))
    parts.append(ck.no_bottom(box("yoke", (0.5, 0.05, 0.06), (0, 0.66, 0), M["door"], bev=0.0)))
    parts.append(box("cornice", (1.4, 0.1, 1.4), (0, stage1 + 0.05, 0), M["trim"], bev=0.0))
    parts.append(ck.no_bottom(box("corniceTop", (1.3, 0.08, 1.3), (0, stage1 + 0.14, 0), M["trim"], bev=0.0)))
    return parts


def spire(M):
    # A broach spire: a square base with its corners chamfered into a
    # slender octagonal needle, a ball and a vane.
    parts = [
        ck.lathe("broach", [(0.68, 0.0), (0.68, 0.12), (0.2, 0.5), (0.0, SPIRE_H - 0.2)], M["accent"], segments=4, phase=math.pi / 4, cap_top=False),
        ck.lathe("needle", [(0.28, 0.2), (0.0, SPIRE_H - 0.18)], M["accent"], segments=8, phase=math.pi / 8, cap_top=False),
        ck.lathe("ball", [(0.0, SPIRE_H - 0.2), (0.07, SPIRE_H - 0.15), (0.07, SPIRE_H - 0.08), (0.0, SPIRE_H - 0.03)], M["metal"], segments=6),
        box("rod", (0.02, 0.3, 0.02), (0, SPIRE_H + 0.1, 0), M["metal"], bev=0.0),
        ck.face("vane", [(-0.02, SPIRE_H + 0.12, 0), (0.24, SPIRE_H + 0.12, 0), (0.2, SPIRE_H + 0.2, 0), (-0.02, SPIRE_H + 0.2, 0)], M["metal"], (0, 0, 1)),
        ck.face("vane", [(-0.02, SPIRE_H + 0.12, 0), (-0.02, SPIRE_H + 0.2, 0), (0.2, SPIRE_H + 0.2, 0), (0.24, SPIRE_H + 0.12, 0)], M["metal"], (0, 0, -1)),
    ]
    return parts


# ---------------------------------------------------------------------------
# A lantern: diameter 1, an octagonal glazed drum, a dome and a finial.
# ---------------------------------------------------------------------------

LANTERN_H = 1.45
DRUM_H = 0.55


def lantern(M, glow=False):
    r = 0.5
    apothem = r * math.cos(math.pi / 8)
    if glow:
        parts = []
        for i in range(8):
            a = 2 * math.pi * i / 8 + math.pi / 8 + math.pi / 8
            c, s = math.cos(a), math.sin(a)
            half = apothem * math.tan(math.pi / 8) * 0.62
            d = apothem + 0.026
            corners = [
                (c * d - s * half, 0.16, s * d + c * half),
                (c * d + s * half, 0.16, s * d - c * half),
                (c * d + s * half, DRUM_H - 0.08, s * d - c * half),
                (c * d - s * half, DRUM_H - 0.08, s * d + c * half),
            ]
            parts.append(ck.face("glass", corners, M["glow"], (c, 0, s)))
        return parts
    parts = [
        ck.lathe("sill", [(0.56, 0.0), (0.56, 0.08), (r, 0.1)], M["trim"], segments=8, phase=math.pi / 8, cap_top=False),
        ck.lathe("drum", [(r, 0.1), (r, DRUM_H)], M["stone"], segments=8, phase=math.pi / 8, cap_top=False),
    ]
    # Dark panes behind the glow, one per face.
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 4
        c, s = math.cos(a), math.sin(a)
        half = apothem * math.tan(math.pi / 8) * 0.7
        d = apothem + 0.012
        corners = [
            (c * d - s * half, 0.14, s * d + c * half),
            (c * d + s * half, 0.14, s * d - c * half),
            (c * d + s * half, DRUM_H - 0.06, s * d - c * half),
            (c * d - s * half, DRUM_H - 0.06, s * d + c * half),
        ]
        parts.append(ck.face("pane", corners, M["window"], (c, 0, s)))
    parts.append(ck.lathe("cornice", [(r, DRUM_H), (0.58, DRUM_H + 0.04), (0.58, DRUM_H + 0.1), (0.52, DRUM_H + 0.1)], M["trim"], segments=8, phase=math.pi / 8, cap_top=False))
    dome = [(0.52, DRUM_H + 0.1)]
    for k in range(1, 4):
        a = k * math.pi / 2 / 4
        dome.append((0.52 * math.cos(a), DRUM_H + 0.1 + 0.46 * math.sin(a)))
    dome.append((0.0, DRUM_H + 0.56))
    parts.append(ck.lathe("dome", dome, M["accent"], segments=8, phase=math.pi / 8, cap_top=False))
    top = DRUM_H + 0.56
    parts.append(ck.lathe("finial", [(0.0, top - 0.02), (0.06, top + 0.05), (0.03, top + 0.12), (0.07, top + 0.2), (0.0, top + 0.3)], M["metal"], segments=6))
    return parts


# ---------------------------------------------------------------------------
# Smaller parts.
# ---------------------------------------------------------------------------


def baluster(M):
    # Height 1, a turned vase on a square foot, under the handrail.
    return [
        box("foot", (0.3, 0.12, 0.3), (0, 0.06, 0), M["stone"], bev=0.0),
        ck.lathe("vase", [(0.1, 0.12), (0.15, 0.3), (0.16, 0.42), (0.08, 0.72), (0.12, 0.84), (0.12, 0.9), (0.0, 0.9)], M["stone"], segments=6),
        box("cap", (0.3, 0.1, 0.3), (0, 0.95, 0), M["stone"], bev=0.0),
    ]


def container(M):
    # 2 long, 0.86 tall, 0.92 deep, origin under its centre. Corrugations
    # are the facets of the flanks, the doors are at +x.
    L, H, D = 2.0, 0.86, 0.92
    parts = [ck.no_bottom(box("shell", (L - 0.06, H - 0.06, D - 0.06), (0, H / 2, 0), M["container"], bev=0.0))]
    # Corrugation: shallow vertical ribs down both flanks and the roof edge.
    for i in range(7):
        x = -L / 2 + 0.2 + i * (L - 0.4) / 6
        for s in (-1, 1):
            parts.append(ck.face("rib", [(x - 0.06, 0.06, s * (D / 2 - 0.01)), (x + 0.06, 0.06, s * (D / 2 - 0.01)), (x + 0.06, H - 0.06, s * (D / 2 - 0.01)), (x - 0.06, H - 0.06, s * (D / 2 - 0.01))][:: -s if s < 0 else 1], M["containerDark"], (0, 0, s)))
    # The frame: corner posts and rails, and the door bars at +x.
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(ck.no_bottom(box("post", (0.07, H, 0.07), (sx * (L / 2 - 0.035), H / 2, sz * (D / 2 - 0.035)), M["containerDark"], bev=0.0)))
    for sz in (-1, 1):
        parts.append(box("rail", (L - 0.14, 0.06, 0.05), (0, H - 0.03, sz * (D / 2 - 0.037)), M["containerDark"], bev=0.0))
        parts.append(box("sill", (L - 0.14, 0.06, 0.05), (0, 0.03, sz * (D / 2 - 0.037)), M["containerDark"], bev=0.0))
    for z in (-0.25, -0.1, 0.1, 0.25):
        parts.append(ck.face("bar", [(L / 2 + 0.004, 0.08, z - 0.012), (L / 2 + 0.004, 0.08, z + 0.012), (L / 2 + 0.004, H - 0.08, z + 0.012), (L / 2 + 0.004, H - 0.08, z - 0.012)], M["metal"], (1, 0, 0)))
    return parts


def roll_door(M):
    # Width 1, height 1, on the wall plane facing +z: a frame, the slatted
    # curtain (a grooved face every eighth), and the drum's hood on top.
    parts = [
        ck.no_bottom(box("jambL", (0.08, 1.0, 0.1), (-0.46, 0.5, 0.05), M["trim"], bev=0.0)),
        ck.no_bottom(box("jambR", (0.08, 1.0, 0.1), (0.46, 0.5, 0.05), M["trim"], bev=0.0)),
        box("hood", (1.04, 0.1, 0.16), (0, 1.02, 0.08), M["metal"], bev=0.02),
    ]
    slats = 8
    for i in range(slats):
        y0, y1 = 0.02 + 0.9 * i / slats, 0.02 + 0.9 * (i + 1) / slats
        # Each slat leans out at its foot, so the curtain reads ribbed.
        parts.append(ck.face("slat", [(-0.42, y0, 0.05), (0.42, y0, 0.05), (0.42, y1, 0.02), (-0.42, y1, 0.02)], M["door"], (0, 0.3, 1)))
        parts.append(ck.face("lip", [(-0.42, y0, 0.02), (0.42, y0, 0.02), (0.42, y0, 0.05), (-0.42, y0, 0.05)], M["doorDark"], (0, -1, 0)))
    parts.append(box("handle", (0.2, 0.03, 0.04), (0, 0.12, 0.06), M["metal"], bev=0.0))
    return parts


def door(M):
    # Width 1, height DOOR.h, on the wall plane facing +z: a double door of
    # panels in a stone surround with a cornice hood.
    h = DOOR["h"]
    parts = [
        ck.no_bottom(box("leafs", (0.8, h * 0.86, 0.04), (0, h * 0.43, 0.02), M["door"], bev=0.0)),
        ck.no_bottom(box("jambL", (0.12, h * 0.9, 0.08), (-0.46, h * 0.45, 0.04), M["trim"], bev=0.0)),
        ck.no_bottom(box("jambR", (0.12, h * 0.9, 0.08), (0.46, h * 0.45, 0.04), M["trim"], bev=0.0)),
        box("lintel", (1.1, 0.12, 0.1), (0, h * 0.9 + 0.06, 0.05), M["trim"], bev=0.0),
        box("hood", (1.24, 0.08, 0.18), (0, h * 0.9 + 0.16, 0.09), M["trim"], bev=0.02),
    ]
    # Two tall panels per leaf, sunk into the timber, and a fanlight.
    for x in (-0.2, 0.2):
        for y0, y1 in ((0.1, 0.9), (1.05, h * 0.62)):
            parts.append(ck.face("panel", [(x - 0.13, y0, 0.056), (x + 0.13, y0, 0.056), (x + 0.13, y1, 0.056), (x - 0.13, y1, 0.056)], M["doorDark"], (0, 0, 1)))
    parts.append(ck.face("fanlight", [(-0.34, h * 0.7, 0.056), (0.34, h * 0.7, 0.056), (0.34, h * 0.82, 0.056), (-0.34, h * 0.82, 0.056)], M["window"], (0, 0, 1)))
    parts.append(ck.face("seam", [(-0.01, 0.05, 0.056), (0.01, 0.05, 0.056), (0.01, h * 0.66, 0.056), (-0.01, h * 0.66, 0.056)], M["doorDark"], (0, 0, 1)))
    return parts


def buttress(M):
    # Across 1 (x), height 1, projection 1 (z, out from the wall at z = 0): a
    # stepped buttress with two sloped offsets, facing +z like every wall part.
    prof = [(0, 0), (1.0, 0), (1.0, 0.5), (0.7, 0.62), (0.7, 0.86), (0.35, 1.0), (0, 1.0)]
    obj = kit.prism("buttress", prof, 1.0, M["stone"], bev=0.0)
    # No underside, and no back against the wall (Blender +y is app -z).
    return [ck.drop_faces(obj, lambda n: n.z < -0.9 or n.y > 0.9)]


def vent(M):
    # A roof ventilator, radius 1: a drum and a coolie hat.
    return [
        ck.lathe("drum", [(1.0, 0.0), (1.0, 1.4)], M["metal"], segments=8, cap_top=False),
        ck.lathe("hat", [(0.6, 1.4), (1.5, 1.6), (0.0, 2.2)], M["metal"], segments=8, cap_bottom=False),
        ck.lathe("hatUnder", [(0.0, 1.62), (1.5, 1.6)], M["metal"], segments=8, cap_top=False),
    ]


def flag_pole():
    # Height 1, radius 1 (x, z scaled to the pole's radius): a tapered pole.
    return [(1.0, 0.0), (0.7, 1.0)]


FLAG_SIZE = 1.1


def flag_top(M):
    # Size 1.1, origin at the pole's top: a gilt ball, and a flag with a wave
    # in it (both sides, so it reads from behind), hoisted at +x.
    s = FLAG_SIZE
    parts = [ck.lathe("ball", [(0.0, 0.0), (0.12, 0.06), (0.12, 0.14), (0.0, 0.2)], M["trim"], segments=6)]
    cols = [0.0, 0.5, 1.0, 1.5]
    wave = [0.0, 0.1, -0.02, 0.14]
    y0, y1 = -s * 0.62, -s * 0.06
    for i in range(3):
        xa, xb = cols[i] * s, cols[i + 1] * s
        za, zb = wave[i] * s, wave[i + 1] * s
        droop = 0.03 * i
        quad = [(xa, y0 - droop, za), (xb, y0 - droop - 0.03, zb), (xb, y1 - droop - 0.03, zb), (xa, y1 - droop, za)]
        parts.append(ck.face("cloth", quad, M["flag"], (-(zb - za), 0, xb - xa)))
        parts.append(ck.face("cloth", list(reversed(quad)), M["flag"], ((zb - za), 0, -(xb - xa))))
    return parts


def _against_wall(obj):
    # No underside and no back: a sill or a hood is only seen from the front,
    # the top and the ends (Blender +y is app -z, into the wall).
    return ck.drop_faces(obj, lambda n: n.z < -0.9 or n.y > 0.9)


def sill(M):
    # Width 1 (x), for under a window: 0.07 tall, projecting 0.09.
    return [_against_wall(box("sill", (1.0, 0.07, 0.09), (0, -0.035, 0.045), M["trim"], bev=0.0))]


def hood(M):
    # Width 1 (x), for over a window: a cornice hood, deeper at its top.
    prof = [(0.0, 0.0), (0.06, 0.0), (0.06, 0.04), (0.12, 0.08), (0.12, 0.11), (0.0, 0.11)]
    obj = kit.prism("hood", prof, 1.0, M["trim"], bev=0.0)
    return [_against_wall(obj)]


def bench(M):
    # Length 1 (z), a slatted seat on two stone ends.
    return [
        ck.no_bottom(box("endA", (0.3, 0.42, 0.08), (0, 0.21, -0.42), M["stone"], bev=0.0)),
        ck.no_bottom(box("endB", (0.3, 0.42, 0.08), (0, 0.21, 0.42), M["stone"], bev=0.0)),
        box("seat", (0.36, 0.06, 1.0), (0, 0.45, 0), M["door"], bev=0.01),
        box("back", (0.05, 0.3, 1.0), (-0.16, 0.66, 0), M["door"], bev=0.01),
    ]


NODES = {
    "ColumnBase": column_base,
    "ColumnShaft": lambda M: [ck.lathe("shaft", column_shaft(), M["stone"], segments=8, cap_top=False, phase=math.pi / 8)],
    "ColumnCapital": column_capital,
    "Pediment": pediment,
    "Steps3": lambda M: steps(M, 3),
    "Steps4": lambda M: steps(M, 4),
    "StepCheek": step_cheek,
    "Clock": clock,
    "Belfry": belfry,
    "Spire": spire,
    "Lantern": lambda M: lantern(M),
    "LanternGlow": lambda M: lantern(M, glow=True),
    "Baluster": baluster,
    "Container": container,
    "RollDoor": roll_door,
    "Door": door,
    "Buttress": buttress,
    "Vent": vent,
    "FlagPole": lambda M: [ck.lathe("pole", flag_pole(), M["metal"], segments=6, cap_top=True)],
    "FlagTop": flag_top,
    "Sill": sill,
    "Hood": hood,
    "Bench": bench,
}


def build():
    kit.reset()
    M = palette()
    objs = []
    for name, make in NODES.items():
        objs.append(kit.finish(make(M), name))
    # Baked apart, on a grid, so no part darkens its neighbour. Parts are
    # authored at unit size, where 0.5 of occlusion distance reads as a
    # crevice's width, not as a room's.
    for i, obj in enumerate(objs):
        obj.location.x = (i % 6 - 2.5) * 6
        obj.location.y = (i // 6 - 2) * 6
    kit.bake_ao([o for o in objs if not o.name.endswith("Glow")], distance=0.3, samples=96, floor=0.6)
    for obj in objs:
        obj.location.x = obj.location.y = 0
        print("TRIS", obj.name, ck.triangles(obj))
    meta = {"profiles": PROFILES, "pediment": PEDIMENT, "door": DOOR, "belfryH": BELFRY_H, "spireH": SPIRE_H,
            "lanternH": LANTERN_H, "drumH": DRUM_H, "flagSize": FLAG_SIZE}
    os.makedirs(os.path.join(ROOT, "assets/models"), exist_ok=True)
    with open(os.path.join(ROOT, "assets/models/civic-kit.meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    return objs


def preview(n):
    """Every part in a row, for looking at the kit itself."""
    return build()
