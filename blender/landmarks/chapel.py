"""
The village chapel, modelled by script (spike: Blender assets vs procedural).

Same natural size (9 x 12.5 x 12), churchyard, nave, chancel, west tower,
spire, clock, door and lamp as `chapel()` in
`components/city/models/landmarks/village.ts`, the door on +z facing the
green. Out come `Chapel` and the `Chapel.lamp` marker where the lamp over the
door glows.

Materials are the chapel's colour SLOTS (`<slot>.<surface>[.tNN]`).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
import animkit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

NAVE_W, NAVE_H = 4.4, 3.7
NAVE_Z0, NAVE_Z1 = -4.0, 2.4
TOWER = 2.5
TOWER_Z = NAVE_Z1 + TOWER / 2 - 0.3
TOWER_H = 6.4
FRONT = TOWER_Z + TOWER / 2
LAMP = (0.0, 2.75, FRONT + 0.28)
YARD = (8.6, 11.6)

SLOT_HEX = {
    "stone": "#d8cfbd",
    "roof": "#6f7a82",
    "trim": "#fafaf7",
    "wood": "#6b4e39",
    "green": "#3f5f45",
    "metal": "#414950",
    "glass": "#b1b6b0",
}
SURFACE = {"stone": "stone", "roof": "slate", "trim": "stone", "wood": "timber", "glass": "glass", "green": "foliage", "metal": "metal"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "stone": S("stone"),
        "dressed": S("stone", 0.9),
        "weather": S("stone", 0.82),
        "recess": S("stone", 0.7),
        "roof": S("roof"),
        "ridge": S("roof", 0.8),
        "trim": S("trim"),
        "wood": S("wood"),
        "oak": S("wood", 0.8),
        "grass": S("green"),
        "lawn": S("green", 1.0),
        "yew": S("green", 0.85),
        "metal": S("metal"),
        "glass": S("glass", emission=0.25),
    }


def churchyard(M):
    w, d = YARD
    parts = [box("lawn", (w - 0.2, 0.06, d - 0.2), (0, 0.03, 0), M["lawn"], bev=0.0, cell=2.5)]
    # A dry-stone wall round three sides and the front, open at the gate,
    # with a coping.
    for s in (-1, 1):
        parts.append(box("wall", (0.35, 0.55, d), (s * (w / 2 - 0.18), 0.275, 0), M["weather"], bev=0.04))
        parts.append(box("coping", (0.45, 0.1, d + 0.05), (s * (w / 2 - 0.18), 0.6, 0), M["dressed"], bev=0.02))
        parts.append(box("wall", (w / 2 - 1.3, 0.55, 0.35), (s * (w / 4 + 0.65), 0.275, d / 2 - 0.18), M["weather"], bev=0.04))
        parts.append(box("coping", (w / 2 - 1.3, 0.1, 0.45), (s * (w / 4 + 0.65), 0.6, d / 2 - 0.18), M["dressed"], bev=0.02))
        parts.append(box("gatePier", (0.5, 0.95, 0.5), (s * 1.3, 0.475, d / 2 - 0.18), M["dressed"], bev=0.04))
        parts.append(box("pierCap", (0.6, 0.1, 0.6), (s * 1.3, 1.0, d / 2 - 0.18), M["trim"], bev=0.02))
        parts.append(lkit.sphere(s * 1.3, 1.14, d / 2 - 0.18, 0.12, M["trim"], segments=6, rings=4))
    parts.append(box("wall", (w, 0.55, 0.35), (0, 0.275, -d / 2 + 0.18), M["weather"], bev=0.04))
    parts.append(box("coping", (w + 0.05, 0.1, 0.45), (0, 0.6, -d / 2 + 0.18), M["dressed"], bev=0.02))
    # The gate, open, and a flagstone path to the door.
    parts.append(box("gate", (0.9, 0.8, 0.05), (0.62, 0.5, d / 2 - 0.62), M["wood"], bev=0.0, rot=(0, 1.2, 0)))
    zp0, zp1 = FRONT + 0.7, d / 2 - 0.2
    n = 5
    for i in range(n):
        z = zp0 + (zp1 - zp0) * (i + 0.5) / n
        parts.append(box("flag", (1.2 - (i % 2) * 0.15, 0.05, (zp1 - zp0) / n - 0.1), (0.04 * (i % 2), 0.08, z), M["dressed"], bev=0.0))
    return parts


def nave(M):
    naveD = NAVE_Z1 - NAVE_Z0
    naveZ = (NAVE_Z0 + NAVE_Z1) / 2
    parts = [box("plinth", (NAVE_W + 0.3, 0.35, naveD + 0.3), (0, 0.175, naveZ), M["dressed"], bev=0.03)]
    walls = box("nave", (NAVE_W, NAVE_H, naveD), (0, NAVE_H / 2, naveZ), M["stone"], bev=0.03, cell=1.6)
    cutters = []
    for s in (-1, 1):
        for z in (-2.9, -0.8, 1.3):
            cutters.append(lkit.pointed("lancetCut", 0.62, 1.55, 0.4, (s * NAVE_W / 2, 1.05, z), M["recess"], turn=math.pi / 2))
    cut_many(walls, cutters)
    parts.append(walls)
    for s in (-1, 1):
        fx = s * NAVE_W / 2
        for z in (-2.9, -0.8, 1.3):
            parts.append(lkit.pointed("lancet", 0.62, 1.55, 0.04, (fx - s * 0.12, 1.05, z), M["glass"], turn=math.pi / 2))
            parts.append(box("mullion", (0.04, 1.9, 0.04), (fx - s * 0.1, 1.95, z), M["metal"], bev=0.0))
            parts.append(box("sill", (0.2, 0.08, 0.8), (fx + s * 0.05, 1.03, z), M["trim"], bev=0.0))
            hood = lkit.pointed("hood", 0.84, 1.55, 0.08, (fx + s * 0.02, 0.98, z), M["dressed"], turn=math.pi / 2, head=0.72)
            cut_many(hood, [lkit.pointed("hoodCut", 0.62, 1.55, 0.3, (fx + s * 0.02, 0.9, z), M["recess"], turn=math.pi / 2)])
            parts.append(hood)
        # Buttresses between the windows, each with a sloped weathering.
        for z in (-3.85, -1.85, 0.25, 2.25):
            parts.append(box("buttress", (0.45, 2.3, 0.4), (fx + s * 0.2, 1.15, z), M["dressed"], bev=0.03))
            parts.append(box("weathering", (0.36, 0.5, 0.34), (fx + s * 0.12, 2.45, z), M["dressed"], bev=0.02, rot=(0, 0, -s * 0.5)))
        # Gutter and a downpipe at the east end.
        parts.append(box("gutter", (0.1, 0.1, naveD + 0.45), (fx + s * 0.36, NAVE_H - 0.3, naveZ), M["metal"], bev=0.0))
        parts.append(box("downpipe", (0.09, NAVE_H - 0.3, 0.09), (fx + s * 0.3, (NAVE_H - 0.3) / 2, NAVE_Z0 + 0.1), M["metal"], bev=0.0))
    # The roof, its ridge, and the east gable under it.
    parts.append(lkit.gable_roof("roof", NAVE_W / 2, 2.6, naveD + 0.5, (0, NAVE_H - 0.1, naveZ), M["roof"], thick=0.16, overhang=0.35))
    parts.append(box("ridge", (0.2, 0.18, naveD + 0.56), (0, NAVE_H - 0.1 + 2.6 + 0.12, naveZ), M["ridge"], bev=0.02))
    parts.append(lkit.gable_end("eastGable", NAVE_W / 2, 2.6, 0.3, (0, NAVE_H - 0.02, NAVE_Z0 + 0.15), M["stone"]))
    parts.append(box("cross", (0.08, 0.5, 0.08), (0, NAVE_H + 2.9, NAVE_Z0 - 0.02), M["trim"], bev=0.0))
    parts.append(box("cross", (0.3, 0.08, 0.08), (0, NAVE_H + 2.98, NAVE_Z0 - 0.02), M["trim"], bev=0.0))
    # The chancel: lower, narrower, its own roof and the east window.
    cz = NAVE_Z0 - 0.7
    chancel = box("chancel", (3.2, 3.0, 1.6), (0, 1.5, cz), M["stone"], bev=0.03, cell=1.6)
    cut_many(chancel, [lkit.pointed("eastCut", 0.9, 1.1, 0.4, (0, 1.0, NAVE_Z0 - 1.5), M["recess"])])
    parts.append(chancel)
    parts.append(lkit.pointed("eastGlass", 0.9, 1.1, 0.04, (0, 1.0, NAVE_Z0 - 1.38), M["glass"]))
    hood = lkit.pointed("eastHood", 1.14, 1.1, 0.08, (0, 0.93, NAVE_Z0 - 1.52), M["dressed"], head=0.9)
    cut_many(hood, [lkit.pointed("eastHoodCut", 0.9, 1.1, 0.3, (0, 0.85, NAVE_Z0 - 1.52), M["recess"])])
    parts.append(hood)
    parts.append(box("eastMull", (0.05, 1.8, 0.04), (0, 1.8, NAVE_Z0 - 1.4), M["metal"], bev=0.0))
    parts.append(lkit.gable_roof("chancelRoof", 1.6, 1.7, 1.9, (0, 2.95, cz - 0.1), M["roof"], thick=0.14, overhang=0.25))
    parts.append(lkit.gable_end("chancelGable", 1.6, 1.7, 0.2, (0, 3.0, cz - 0.7), M["stone"]))
    return parts


def tower(M):
    parts = [box("towerPlinth", (TOWER + 0.3, 0.4, TOWER + 0.3), (0, 0.2, TOWER_Z), M["dressed"], bev=0.03)]
    shaft = box("tower", (TOWER, TOWER_H, TOWER), (0, TOWER_H / 2, TOWER_Z), M["stone"], bev=0.03, cell=1.3)
    cuts = []
    # Belfry openings on all four faces, and the arched doorway.
    for turn, (nx, nz) in ((0.0, (0, 1)), (0.0, (0, -1)), (math.pi / 2, (1, 0)), (math.pi / 2, (-1, 0))):
        cuts.append(lkit.pointed("belfryCut", 0.7, 0.75, 0.4, (nx * TOWER / 2, TOWER_H - 1.55, TOWER_Z + nz * TOWER / 2), M["recess"], turn=turn))
    cuts.append(lkit.arched("doorCut", 1.0, 1.4, 0.4, (0, 0.4, FRONT), M["recess"]))
    cut_many(shaft, cuts)
    parts.append(shaft)
    for turn, (nx, nz) in ((0.0, (0, 1)), (0.0, (0, -1)), (math.pi / 2, (1, 0)), (math.pi / 2, (-1, 0))):
        out = TOWER / 2
        px, pz = nx * (out - 0.12), TOWER_Z + nz * (out - 0.12)
        # Louvres in the opening, dark behind.
        parts.append(lkit.pointed("belfryBack", 0.7, 0.75, 0.04, (px - nx * 0.06, TOWER_H - 1.55, pz - nz * 0.06), M["oak"], turn=turn))
        for k in range(3):
            size = (0.66, 0.05, 0.1) if nx == 0 else (0.1, 0.05, 0.66)
            parts.append(box("louvre", size, (px, TOWER_H - 1.4 + k * 0.28, pz), M["wood"], bev=0.0, rot=(0.5 * nz, 0, -0.5 * nx)))
    # String courses, the parapet and battlements.
    parts.append(box("string", (TOWER + 0.2, 0.18, TOWER + 0.2), (0, TOWER_H - 1.9, TOWER_Z), M["trim"], bev=0.02))
    parts.append(box("string", (TOWER + 0.14, 0.14, TOWER + 0.14), (0, 3.2, TOWER_Z), M["dressed"], bev=0.02))
    parts.append(box("parapet", (TOWER + 0.3, 0.3, TOWER + 0.3), (0, TOWER_H + 0.15, TOWER_Z), M["trim"], bev=0.03))
    for x in (-1, 1):
        for z in (-1, 1):
            parts.append(box("merlon", (0.42, 0.55, 0.42), (x * TOWER / 2, TOWER_H + 0.57, TOWER_Z + z * TOWER / 2), M["stone"], bev=0.03))
            parts.append(box("pinnacle", (0.2, 0.3, 0.2), (x * TOWER / 2, TOWER_H + 1.0, TOWER_Z + z * TOWER / 2), M["trim"], bev=0.0))
    # The spire and its weathercock.
    parts.append(cyl("spire", TOWER * 0.6, 4.6, (0, TOWER_H + 0.3 + 2.3, TOWER_Z), M["roof"], axis="y", verts=4, radius2=0.04, rot=(0, math.pi / 4, 0), bev=0.0))
    for k in range(3):
        y = TOWER_H + 0.9 + k * 1.2
        r = TOWER * 0.6 * (1 - (y - TOWER_H - 0.3) / 4.6) + 0.02
        parts.append(cyl("spireBand", r, 0.1, (0, y, TOWER_Z), M["ridge"], axis="y", verts=4, radius2=r - 0.03, rot=(0, math.pi / 4, 0)))
    top = TOWER_H + 0.3 + 4.6
    parts.append(box("vaneMast", (0.05, 0.9, 0.05), (0, top + 0.35, TOWER_Z), M["metal"], bev=0.0))
    parts.append(box("vaneArm", (0.5, 0.05, 0.05), (0, top + 0.5, TOWER_Z), M["metal"], bev=0.0))
    parts.append(lkit.slab("cock", [(-0.25, 0.0), (0.18, 0.0), (0.25, 0.18), (0.05, 0.12), (-0.05, 0.3), (-0.2, 0.2)], 0.04, (0, top + 0.62, TOWER_Z), M["metal"]))
    # The clock under the belfry.
    cy = TOWER_H - 2.6
    parts.append(cyl("clock", 0.46, 0.08, (0, cy, FRONT + 0.03), M["trim"], axis="z", verts=12))
    parts.append(cyl("clockRim", 0.5, 0.05, (0, cy, FRONT + 0.005), M["metal"], axis="z", verts=12))
    # (the hands are `animated()`)
    # The door: oak, boarded, in a stone surround, a step and the lamp.
    parts.append(lkit.arched("door", 1.0, 1.4, 0.06, (0, 0.4, FRONT - 0.14), M["wood"]))
    for i in range(4):
        parts.append(box("board", (0.025, 1.6, 0.02), (-0.3 + i * 0.2, 1.2, FRONT - 0.1), M["oak"], bev=0.0))
    for y in (0.8, 1.5):
        parts.append(box("strap", (0.86, 0.06, 0.03), (0, y, FRONT - 0.09), M["metal"], bev=0.0))
    surround = lkit.arched("surround", 1.4, 1.4, 0.12, (0, 0.4, FRONT + 0.03), M["trim"])
    cut_many(surround, [lkit.arched("surroundCut", 1.0, 1.4, 0.4, (0, 0.3, FRONT + 0.03), M["recess"])])
    parts.append(surround)
    parts.append(box("step", (1.7, 0.2, 0.7), (0, 0.1, FRONT + 0.35), M["dressed"], bev=0.03))
    parts.append(box("lampArm", (0.05, 0.05, 0.32), (LAMP[0], LAMP[1] + 0.2, FRONT + 0.2), M["metal"], bev=0.0))
    parts.append(box("lampCage", (0.2, 0.26, 0.2), (LAMP[0], LAMP[1], LAMP[2]), M["glass"], bev=0.0))
    parts.append(cyl("lampHat", 0.17, 0.1, (LAMP[0], LAMP[1] + 0.18, LAMP[2]), M["metal"], axis="y", verts=4, radius2=0.03, rot=(0, math.pi / 4, 0)))
    # A notice board by the door.
    parts.append(box("notice", (0.7, 0.5, 0.06), (0.95, 1.3, FRONT + 0.05), M["wood"], bev=0.0))
    parts.append(box("noticeFace", (0.56, 0.36, 0.02), (0.95, 1.3, FRONT + 0.09), M["trim"], bev=0.0))
    return parts


def graves(M):
    parts = []
    # A yew by the chancel, in two tiers.
    parts.append(cyl("yewTrunk", 0.16, 0.8, (-2.6, 0.4, -4.6), M["oak"], axis="y", verts=5, radius2=0.12))
    for r, h, y in ((1.2, 2.2, 1.9), (0.95, 1.8, 3.1), (0.6, 1.3, 4.1)):
        parts.append(cyl("yew", r, h, (-2.6, y, -4.6), M["yew"], axis="y", verts=7, radius2=0.08))
    # A round bush by the gate.
    parts.append(lkit.shrub(3.2, 0.03, 4.9, 0.55, M["grass"], squash=0.8))
    parts.append(lkit.shrub(-3.3, 0.03, 1.2, 0.5, M["grass"], squash=0.8))
    for x, z, tilt in ((2.9, -1.2, 0.05), (2.9, -2.6, -0.08), (2.9, -4.0, 0.02), (-3.0, -0.6, -0.06), (-3.0, -2.2, 0.08), (3.6, 3.2, -0.05), (-3.5, 3.4, 0.07)):
        parts.append(lkit.arched("headstone", 0.46, 0.5, 0.12, (x, 0.0, z), M["dressed"], turn=tilt * 3, steps=4))
        parts.append(box("mound", (0.5, 0.06, 0.9), (x, 0.05, z + 0.55), M["yew"], bev=0.0))
    return parts


def animated(M, scope="Chapel"):
    """The clock's hands, pointing at twelve, turned about the face normal by the app."""
    centre = (0.0, TOWER_H - 2.6, FRONT + 0.07)
    return animkit.clock_hands(f"{scope}.Clock.0", M["metal"], centre, 0.46, z=0.008, depth=0.03)


def build():
    kit.reset()
    M = palette()
    obj = finish(churchyard(M) + nave(M) + tower(M) + graves(M), "Chapel")
    kit.bake_ao([obj], distance=0.9, floor=0.55)
    return [obj, kit.marker("Chapel.lamp", LAMP)] + animated(M)


def preview(_=0):
    return [o for o in build() if o.type == "MESH"]
