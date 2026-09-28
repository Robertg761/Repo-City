"""
The village substation, modelled by script (spike: Blender assets vs
procedural).

Same natural size (8.5 x 5.6 x 7), gravel yard, fence and gate, transformer,
control hut, status lamp and wooden poles as `substation()` in
`components/city/models/landmarks/village.ts`. One model for every CI
state: the state is the lamp React draws at the `Substation.lamp` marker, and
the sparks at `Substation.yard`.

Materials are the substation's colour SLOTS (`<slot>.<surface>[.tNN]`).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

FX, FZ = 3.9, 3.1
TX, TZ = -1.2, -0.6
HX, HZ = 2.0, -1.4
LAMP = (HX + 0.55, 2.2 + 0.95, HZ + 0.9)
YARD_ANCHOR = (TX, 2.6, TZ)
POLES = ((-3.2, 2.2), (-0.6, 2.3), (3.2, 1.9))
WIRE_Y = 5.3

SLOT_HEX = {
    "deck": "#9f9c91",
    "hull": "#d7dbd6",
    "steel": "#7d8689",
    "hazard": "#e8853c",
    "dark": "#4a4e52",
    "wood": "#6b4e39",
    "glass": "#9fb9c4",
}
SURFACE = {"deck": "concrete", "hull": "metal", "steel": "metal", "hazard": "metal", "glass": "glass", "wood": "timber", "dark": "metal"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "deck": S("deck"),
        "gravel": S("deck", 0.88),
        "pad": S("deck", 1.0),
        "hull": S("hull"),
        "hullDeep": S("hull", 0.82),
        "steel": S("steel"),
        "wire": S("steel", 0.75),
        "hazard": S("hazard"),
        "dark": S("dark"),
        "wood": S("wood"),
        "weathered": S("wood", 0.82),
        "glass": S("glass"),
    }


def yard(M):
    parts = [box("yard", (8.2, 0.1, 6.6), (0, 0.05, 0), M["gravel"], bev=0.03, cell=2.0)]
    parts.append(box("path", (1.4, 0.03, 1.4), (0, 0.11, 2.6), M["pad"], bev=0.0))
    parts.append(box("path", (1.1, 0.03, 2.2), (HX - 0.3, 0.11, 0.9), M["pad"], bev=0.0))
    # The fence: posts, a top rail, two strands and a gate, open at the front.
    posts = [(-FX + i * FX * 2 / 8, -FZ) for i in range(9)]
    for i in range(1, 7):
        posts += [(FX, -FZ + i * FZ * 2 / 6), (-FX, -FZ + i * FZ * 2 / 6)]
    posts += [(-FX + i * FX * 2 / 8, FZ) for i in range(9) if abs(-FX + i * FX * 2 / 8) > 1.2]
    for x, z in posts:
        parts.append(lkit.rod("post", (x, 0.1, z), (x, 1.8, z), 0.045, M["steel"], sides=4))
    for y, r in ((0.9, 0.018), (1.3, 0.018), (1.75, 0.03)):
        parts.append(lkit.rod("strand", (-FX, y, -FZ), (FX, y, -FZ), r, M["wire"], sides=3))
        for s in (-1, 1):
            parts.append(lkit.rod("strand", (s * FX, y, -FZ), (s * FX, y, FZ), r, M["wire"], sides=3))
            parts.append(lkit.rod("strand", (s * FX, y, FZ), (s * 1.2, y, FZ), r, M["wire"], sides=3))
    # The gate posts and a gate, swung half open.
    for s in (-1, 1):
        parts.append(box("gatePost", (0.12, 1.9, 0.12), (s * 1.2, 0.95, FZ), M["steel"], bev=0.0))
    # The gate: a steel frame with bars, hung on the right post and swung
    # into the yard.
    a = 0.9
    hinge = (1.12, FZ)
    tip = (hinge[0] - 1.05 * math.cos(a), hinge[1] - 1.05 * math.sin(a))
    for y in (0.2, 0.85, 1.5):
        parts.append(lkit.rod("gateRail", (hinge[0], y, hinge[1]), (tip[0], y, tip[1]), 0.03, M["steel"], sides=4))
    for k in range(6):
        t = k / 5
        gx, gz = hinge[0] + (tip[0] - hinge[0]) * t, hinge[1] + (tip[1] - hinge[1]) * t
        parts.append(lkit.rod("gateBar", (gx, 0.2, gz), (gx, 1.5, gz), 0.02, M["steel"], sides=3))
    parts.append(box("danger", (0.5, 0.4, 0.03), (1.8, 1.25, FZ + 0.06), M["hazard"], bev=0.0))
    parts.append(box("dangerMark", (0.06, 0.22, 0.02), (1.8, 1.25, FZ + 0.08), M["dark"], bev=0.0, rot=(0, 0, 0.4)))
    return parts


def transformer(M):
    parts = [box("plinth", (2.4, 0.3, 1.8), (TX, 0.25, TZ), M["pad"], bev=0.03)]
    parts.append(box("tank", (2.0, 1.6, 1.3), (TX, 1.2, TZ), M["hull"], bev=0.05))
    parts.append(box("lid", (2.1, 0.08, 1.4), (TX, 2.04, TZ), M["hullDeep"], bev=0.0))
    for i in range(6):
        for s in (-1, 1):
            parts.append(box("fin", (0.05, 1.2, 0.3), (TX - 0.75 + i * 0.3, 1.1, TZ + s * 0.8), M["hullDeep"], bev=0.0))
    # The conservator on its legs.
    parts.append(cyl("conservator", 0.24, 1.0, (TX + 0.4, 2.45, TZ - 0.35), M["hull"], axis="x", verts=10))
    for dx in (0.05, 0.75):
        parts.append(box("conLeg", (0.06, 0.4, 0.06), (TX + dx, 2.2, TZ - 0.35), M["dark"], bev=0.0))
    # Three bushings, each a stack of sheds, with the line landing on them.
    for i in range(3):
        x = TX - 0.6 + i * 0.6
        parts.append(cyl("bushing", 0.1, 0.72, (x, 2.43, TZ + 0.3), M["glass"], axis="y", verts=6, radius2=0.07))
        for k, y in enumerate((2.25, 2.45, 2.65)):
            parts.append(cyl("shed", 0.17 - k * 0.02, 0.05, (x, y, TZ + 0.3), M["glass"], axis="y", verts=6))
        parts.append(cyl("terminal", 0.05, 0.1, (x, 2.84, TZ + 0.3), M["dark"], axis="y", verts=4))
    parts.append(box("rating", (0.4, 0.26, 0.02), (TX, 1.3, TZ + 0.66), M["hazard"], bev=0.0))
    return parts


def hut(M):
    parts = []
    body = box("hut", (2.2, 2.2, 2.0), (HX, 1.1, HZ), M["hull"], bev=0.04, cell=1.2)
    cut_many(body, [
        box("doorCut", (0.8, 1.6, 0.4), (HX - 0.3, 0.9, HZ + 1.0), M["hullDeep"], bev=0.0),
        box("winCut", (0.5, 0.4, 0.4), (HX + 0.55, 1.4, HZ + 1.0), M["hullDeep"], bev=0.0),
    ])
    parts.append(body)
    parts.append(box("hutPlinth", (2.3, 0.2, 2.1), (HX, 0.1, HZ), M["pad"], bev=0.02))
    parts.append(box("door", (0.8, 1.6, 0.04), (HX - 0.3, 0.9, HZ + 0.88), M["dark"], bev=0.0))
    for k in range(5):
        parts.append(box("louvre", (0.6, 0.04, 0.03), (HX - 0.3, 0.35 + k * 0.14, HZ + 0.91), M["hull"], bev=0.0))
    parts.append(box("doorSign", (0.36, 0.36, 0.03), (HX - 0.3, 1.45, HZ + 0.915), M["hazard"], bev=0.0))
    parts.append(box("winGlass", (0.5, 0.4, 0.04), (HX + 0.55, 1.4, HZ + 0.9), M["glass"], bev=0.0))
    parts.append(box("winBar", (0.04, 0.4, 0.04), (HX + 0.55, 1.4, HZ + 0.92), M["dark"], bev=0.0))
    parts.append(box("step", (1.0, 0.12, 0.4), (HX - 0.3, 0.06, HZ + 1.2), M["pad"], bev=0.02))
    # The roof: a shallow gable with its gable ends.
    parts.append(lkit.gable_roof("roof", 1.1, 0.8, 2.4, (HX, 2.2, HZ), M["dark"], thick=0.1, overhang=0.2))
    for gz in (HZ + 1.0 - 0.06, HZ - 1.0 + 0.06):
        parts.append(lkit.gable_end("gable", 1.1, 0.8, 0.12, (HX, 2.18, gz), M["hull"]))
    parts.append(box("vent", (0.3, 0.3, 0.04), (HX, 2.5, HZ + 1.0), M["dark"], bev=0.0))
    # The status lamp's bracket (the lamp itself is drawn by React) and a
    # downpipe.
    parts.append(box("lampPost", (0.06, 0.3, 0.06), (LAMP[0], 2.8, LAMP[2]), M["steel"], bev=0.0))
    parts.append(box("lampPlate", (0.2, 0.04, 0.2), (LAMP[0], 2.97, LAMP[2]), M["steel"], bev=0.0))
    parts.append(box("downpipe", (0.05, 1.95, 0.05), (HX + 1.13, 0.975, HZ - 0.8), M["steel"], bev=0.0))
    return parts


def poles(M):
    parts = []
    for x, z in POLES:
        parts.append(cyl("pole", 0.16, 5.4, (x, 2.7, z), M["weathered"], axis="y", verts=6, radius2=0.11))
        parts.append(box("crossarm", (1.4, 0.12, 0.12), (x, 5.1, z), M["wood"], bev=0.0))
        for s in (-1, 1):
            parts.append(lkit.rod("brace", (x, 4.7, z), (x + s * 0.45, 5.05, z), 0.03, M["dark"], sides=3))
        for dx in (-0.55, 0.0, 0.55):
            parts.append(cyl("insulator", 0.06, 0.18, (x + dx, 5.25, z), M["glass"], axis="y", verts=5))
    for dx in (-0.55, 0.0, 0.55):
        for (px, pz), (qx, qz) in zip(POLES, POLES[1:]):
            parts += lkit.cable("wire", (px + dx, WIRE_Y, pz), (qx + dx, WIRE_Y, qz), 0.018, 0.3, M["wire"], segments=3)
        px, pz = POLES[0]
        parts += lkit.cable("wire", (px + dx, WIRE_Y, pz), (TX - 0.6 + (dx + 0.55), 2.85, TZ + 0.3), 0.018, 0.25, M["wire"], segments=3)
    # A stay wire off the end pole into the ground.
    parts.append(lkit.rod("stay", (3.2, 4.8, 1.9), (3.8, 0.1, 2.5), 0.02, M["wire"], sides=3))
    return parts


def build():
    kit.reset()
    M = palette()
    obj = finish(yard(M) + transformer(M) + hut(M) + poles(M), "Substation")
    kit.bake_ao([obj], distance=0.8, floor=0.55)
    return [obj, kit.marker("Substation.lamp", LAMP), kit.marker("Substation.yard", YARD_ANCHOR)]


def preview(_=0):
    return [o for o in build() if o.type == "MESH"]
