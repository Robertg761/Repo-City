"""
The town hall, modelled by script (spike: Blender assets vs procedural).

Same natural size (14 x 14 x 14), plaza, steps, block, colonnade, pediment
and clock, drum, dome, lantern, flags, fountain and bollards as
`components/city/models/landmarks/townhall.ts`, portico on +z. The lantern
is open between eight posts, so the light React hangs at its centre
(`lantern`, the `TownHall.lantern` marker) shows through it.

Materials are the hall's colour SLOTS (`<slot>.<surface>[.tNN]`).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

PODIUM_TOP = 1.2
BLOCK_H = 4.8
CORNICE_Y = PODIUM_TOP + BLOCK_H
DRUM_Y = CORNICE_Y + 0.55 + 0.75
DOME_Y = DRUM_Y + 0.97
LANTERN = (0.0, DOME_Y + 2.75, 0.0)

SLOT_HEX = {
    "stone": "#8c9ea3",
    "wall": "#f5f3ed",
    "accent": "#7fb1a8",
    "metal": "#7d8689",
    "glass": "#e2e0ce",
}
SURFACE = {"stone": "stone", "wall": "stone", "accent": "metal", "metal": "metal", "glass": "glass"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "stone": S("stone"),
        "paving": S("stone", 0.92),
        "joint": S("stone", 0.75),
        "wall": S("wall"),
        "recess": S("wall", 0.8),
        "shade": S("wall", 0.9),
        "accent": S("accent"),
        "accentDeep": S("accent", 0.82),
        "metal": S("metal"),
        "dark": S("metal", 0.55),
        "glass": S("glass", emission=0.3),
    }


def plaza(M):
    parts = [box("plaza", (13.2, 0.3, 13.2), (0, 0.15, 0), M["stone"], bev=0.06, cell=2.2)]
    # Paving bands across the plaza.
    for x in (-5.7, -4.2, 4.2, 5.7):
        parts.append(box("band", (0.05, 0.012, 12.7), (x, 0.306, 0), M["joint"], bev=0.0))
    for z in (-5.6, -4.1, 4.7, 6.1):
        parts.append(box("band", (12.7, 0.012, 0.05), (0, 0.306, z), M["joint"], bev=0.0))
    # Three steps up to the hall, each with a lighter nosing.
    for w, d, y in ((10.4, 9.8, 0.45), (9.6, 9.2, 0.75), (8.8, 8.6, 1.05)):
        parts.append(box("tier", (w, 0.3, d), (0, y, 0), M["stone"], bev=0.04))
        parts.append(box("nosing", (w - 0.2, 0.04, 0.12), (0, y + 0.15, d / 2 - 0.06), M["wall"], bev=0.0))
    return parts


def window(M, along, c, face):
    """One window on the face `face` (+1/-1) of the x (along='x') or z side."""
    parts = []
    fx = lambda u, off, y, sz: ((u, y, face * (3.6 + off)), sz) if along == "x" else ((face * (3.6 + off), y, u), (sz[2], sz[1], sz[0]))  # noqa: E731
    y = PODIUM_TOP + 2.5
    for name, off, yy, size, mat in (
        ("glass", -0.12, y, (0.92, 1.95, 0.04), M["glass"]),
        ("surround", 0.04, y, (1.2, 2.3, 0.08), M["wall"]),
        ("sill", 0.1, y - 1.18, (1.36, 0.1, 0.2), M["stone"]),
        ("hood", 0.1, y + 1.28, (1.4, 0.16, 0.22), M["stone"]),
        ("mullion", -0.09, y, (0.05, 1.95, 0.04), M["metal"]),
        ("transom", -0.09, y + 0.3, (0.92, 0.05, 0.04), M["metal"]),
    ):
        pos, sz = fx(c, off, yy, size)
        parts.append(box(name, sz, pos, mat, bev=0.02 if name in ("sill", "hood") else 0.0))
    return parts


def block(M):
    parts = []
    walls = box("block", (7.2, BLOCK_H, 7.2), (0, PODIUM_TOP + BLOCK_H / 2, 0), M["wall"], bev=0.05, cell=1.6)
    cuts = []
    for face in (-1, 1):
        for o in (-2.2, 0.0, 2.2):
            if not (face > 0 and o == 0.0):
                cuts.append(box("winCut", (0.92, 1.95, 0.4), (o, PODIUM_TOP + 2.5, face * 3.6), M["recess"], bev=0.0))
            cuts.append(box("winCut", (0.4, 1.95, 0.92), (face * 3.6, PODIUM_TOP + 2.5, o), M["recess"], bev=0.0))
    # The doorway under the portico.
    cuts.append(box("doorCut", (1.6, 2.6, 0.5), (0, PODIUM_TOP + 1.3, 3.6), M["recess"], bev=0.0))
    cut_many(walls, cuts)
    parts.append(walls)
    for face in (-1, 1):
        for o in (-2.2, 0.0, 2.2):
            if not (face > 0 and o == 0.0):
                # The windows under the portico hide behind the columns: the
                # two either side of the door still read.
                cut_a = window(M, "x", o, face)
                parts += cut_a
            parts += window(M, "z", o, face)
        # A rusticated base course and a string course.
        if face > 0:
            for side in (-1, 1):
                parts.append(box("baseCourse", (2.9, 0.5, 0.2), (side * 2.25, PODIUM_TOP + 0.25, 3.66), M["stone"], bev=0.03))
        else:
            parts.append(box("baseCourse", (7.4, 0.5, 0.2), (0, PODIUM_TOP + 0.25, -3.66), M["stone"], bev=0.03))
        parts.append(box("baseCourse", (0.2, 0.5, 7.4), (face * 3.66, PODIUM_TOP + 0.25, 0), M["stone"], bev=0.03))
        parts.append(box("string", (7.36, 0.14, 0.14), (0, PODIUM_TOP + 4.15, face * 3.64), M["stone"], bev=0.0))
        parts.append(box("string", (0.14, 0.14, 7.36), (face * 3.64, PODIUM_TOP + 4.15, 0), M["stone"], bev=0.0))
        # Corner pilasters.
        for side in (-1, 1):
            parts.append(box("pilaster", (0.4, BLOCK_H - 0.5, 0.4), (side * 3.5, PODIUM_TOP + 0.5 + (BLOCK_H - 0.5) / 2, face * 3.5), M["wall"], bev=0.04))
    # The door: glass in a frame, a fanlight over it.
    parts.append(box("doorGlass", (1.6, 2.6, 0.04), (0, PODIUM_TOP + 1.3, 3.42), M["glass"], bev=0.0))
    parts.append(box("doorMull", (0.06, 2.6, 0.06), (0, PODIUM_TOP + 1.3, 3.45), M["metal"], bev=0.0))
    parts.append(box("doorRail", (1.6, 0.06, 0.06), (0, PODIUM_TOP + 2.1, 3.45), M["metal"], bev=0.0))
    parts.append(box("doorSurround", (2.0, 0.24, 0.16), (0, PODIUM_TOP + 2.72, 3.64), M["stone"], bev=0.02))
    return parts


def colonnade(M):
    parts = []
    z = 3.85
    for i in range(6):
        x = -3.0 + i * 1.2
        parts.append(cyl("column", 0.3, 3.86, (x, PODIUM_TOP + 0.2 + 1.93, z), M["wall"], axis="y", verts=10, radius2=0.25))
        parts.append(box("plinth", (0.72, 0.2, 0.72), (x, PODIUM_TOP + 0.1, z), M["stone"], bev=0.03))
        parts.append(cyl("torus", 0.36, 0.12, (x, PODIUM_TOP + 0.26, z), M["stone"], axis="y", verts=10))
        parts.append(cyl("echinus", 0.26, 0.14, (x, PODIUM_TOP + 4.1, z), M["stone"], axis="y", verts=10, radius2=0.36))
        parts.append(box("abacus", (0.76, 0.14, 0.76), (x, PODIUM_TOP + 4.24, z), M["stone"], bev=0.02))
    # Architrave, frieze with triglyph blocks, then the pediment.
    parts.append(box("architrave", (8.0, 0.36, 0.95), (0, CORNICE_Y - 0.31, z), M["stone"], bev=0.03))
    parts.append(box("frieze", (8.0, 0.28, 0.85), (0, CORNICE_Y - 0.01, z), M["wall"], bev=0.0))
    for i in range(13):
        parts.append(box("triglyph", (0.22, 0.26, 0.06), (-3.7 + i * 0.62, CORNICE_Y - 0.01, z + 0.44), M["shade"], bev=0.0))
    base = CORNICE_Y + 0.55
    parts.append(box("pedCornice", (8.0, 0.25, 1.4), (0, CORNICE_Y + 0.42, 3.95), M["stone"], bev=0.03))
    parts.append(lkit.slab("tympanum", [(-3.3, 0.0), (3.3, 0.0), (0.0, 1.35)], 1.3, (0, base, 3.95), M["wall"]))
    # Raking cornices, proud of the tympanum.
    rake = math.atan2(1.35, 3.3)
    length = math.hypot(3.3, 1.35) + 0.4
    for s in (-1, 1):
        parts.append(box("rake", (length, 0.2, 1.6), (s * 1.62, base + 0.72, 3.95), M["stone"], bev=0.03, rot=(0, 0, -s * rake)))
    # The clock in the tympanum.
    cy = base + 0.52
    parts.append(cyl("clockRim", 0.58, 0.12, (0, cy, 4.62), M["metal"], axis="z", verts=16))
    parts.append(cyl("clockFace", 0.48, 0.04, (0, cy, 4.69), M["glass"], axis="z", verts=16))
    parts.append(box("hand", (0.06, 0.32, 0.03), (0, cy + 0.13, 4.73), M["dark"], bev=0.0))
    parts.append(box("hand", (0.24, 0.06, 0.03), (0.1, cy, 4.735), M["dark"], bev=0.0))
    return parts


def cornice(M):
    parts = [box("cornice", (8.4, 0.3, 8.4), (0, CORNICE_Y + 0.15, 0), M["stone"], bev=0.04)]
    parts.append(box("corniceTop", (8.1, 0.25, 8.1), (0, CORNICE_Y + 0.42, 0), M["stone"], bev=0.03))
    # A balustrade round the roof, cheap as a solid rail over dies.
    for face in (-1, 1):
        for axis in ("x", "z"):
            if axis == "x" and face > 0:
                continue  # the pediment stands there
            size = (7.8, 0.12, 0.26) if axis == "x" else (0.26, 0.12, 7.8)
            pos = (0, CORNICE_Y + 1.02, face * 3.9) if axis == "x" else (face * 3.9, CORNICE_Y + 1.02, 0)
            parts.append(box("rail", size, pos, M["wall"], bev=0.02))
            for k in range(7):
                u = -3.3 + k * 1.1
                p = (u, CORNICE_Y + 0.75, face * 3.9) if axis == "x" else (face * 3.9, CORNICE_Y + 0.75, u)
                parts.append(box("die", (0.24, 0.44, 0.24), p, M["wall"], bev=0.0))
    parts.append(box("roof", (7.6, 0.06, 7.6), (0, CORNICE_Y + 0.58, 0), M["stone"], bev=0.0))
    return parts


def dome(M):
    parts = []
    c = (0.0, 0.0, 0.0)
    # The drum: a plinth ring, the wall, eight pilasters and windows between.
    parts.append(cyl("drumBase", 3.05, 0.3, (0, DRUM_Y - 0.6, 0), M["stone"], axis="y", verts=16, bev=0.03))
    parts.append(cyl("drum", 2.9, 1.5, (0, DRUM_Y, 0), M["wall"], axis="y", verts=16, radius2=2.6))
    for i in range(8):
        a = (i / 8) * math.pi * 2
        parts.append(box("drumPier", (0.3, 1.5, 0.3), (math.cos(a) * 2.78, DRUM_Y, math.sin(a) * 2.78), M["wall"], bev=0.03, rot=(0, -a, 0)))
        b = a + math.pi / 8
        parts.append(box("drumWin", (0.1, 0.8, 0.5), (math.cos(b) * 2.76, DRUM_Y + 0.05, math.sin(b) * 2.76), M["glass"], bev=0.0, rot=(0, -b, 0)))
    parts.append(cyl("drumCap", 3.0, 0.22, (0, DRUM_Y + 0.86, 0), M["stone"], axis="y", verts=16, bev=0.03))
    # The dome: a hemisphere, eight copper ribs, darker at the springing.
    rows = [(2.55 * math.cos(t), DOME_Y + 2.55 * math.sin(t)) for t in [k * math.pi / 2 / 6 for k in range(6)]]
    rows.append((0.72, DOME_Y + 2.55 * math.sin(math.acos(0.72 / 2.55))))
    parts.append(lkit.lathe("dome", rows, 16, c, [M["accentDeep"], M["accent"]], mats=[0, 1, 1, 1, 1, 1], phase=math.pi / 16))
    for i in range(8):
        a = i * math.pi / 4
        pts = []
        for k in range(5):
            t = k * (math.acos(0.72 / 2.55)) / 4
            r = 2.6 * math.cos(t)
            pts.append((math.cos(a) * r, DOME_Y + 2.6 * math.sin(t), math.sin(a) * r))
        for p, q in zip(pts, pts[1:]):
            parts.append(lkit.rod("rib", p, q, 0.06, M["metal"], sides=3))
    # The lantern: open between eight posts, so the light inside shows.
    ly = LANTERN[1]
    parts.append(cyl("lanternBase", 0.95, 0.2, (0, ly - 0.3, 0), M["wall"], axis="y", verts=12))
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        parts.append(box("lanternPost", (0.14, 0.8, 0.14), (math.cos(a) * 0.78, ly + 0.2, math.sin(a) * 0.78), M["wall"], bev=0.0, rot=(0, -a, 0)))
    parts.append(cyl("lanternCap", 0.98, 0.18, (0, ly + 0.69, 0), M["stone"], axis="y", verts=12))
    cap = [(0.82 * math.cos(t), ly + 0.78 + 0.55 * math.sin(t)) for t in [k * math.pi / 2 / 4 for k in range(4)]]
    parts.append(lkit.lathe("lanternDome", cap + [(0.1, ly + 1.33)], 10, c, M["accent"], cap_top=True))
    parts.append(cyl("spire", 0.07, 1.2, (0, ly + 1.9, 0), M["metal"], axis="y", verts=6, radius2=0.035))
    parts.append(lkit.sphere(0, ly + 2.58, 0, 0.17, M["accent"], segments=8, rings=5))
    return parts


def forecourt(M):
    parts = []
    # Flags either side of the steps.
    for s in (-1, 1):
        parts.append(box("flagFoot", (0.4, 0.2, 0.4), (s * 3.4, 0.7, 4.75), M["stone"], bev=0.03))
        parts.append(cyl("flagPole", 0.07, 4.05, (s * 3.4, 0.75 + 2.025, 4.75), M["metal"], axis="y", verts=6, radius2=0.05))
        parts.append(lkit.sphere(s * 3.4, 4.8, 4.75, 0.09, M["metal"], segments=6, rings=4))
        for k, turn in enumerate((0.16, -0.18, 0.14)):
            w = 0.44
            parts.append(box("flag", (w, 0.8, 0.04), (s * 3.4 + s * (0.08 + w * (k + 0.5)), 4.3, 4.75 + (0.04 if k == 1 else 0.0)), M["accent"], bev=0.0, rot=(0, turn * s, 0)))
    # The fountain: a basin, water, a column and a jet.
    fz = 5.95
    parts.append(lkit.lathe("basin", [(1.0, 0.15), (1.0, 0.65), (0.9, 0.65), (0.9, 0.5)], 14, (0, 0, fz), M["stone"]))
    parts.append(lkit.lathe("water", [(0.91, 0.56)], 14, (0, 0, fz), M["glass"], cap_top=True))
    parts.append(cyl("fountainCol", 0.3, 0.75, (0, 0.9, fz), M["stone"], axis="y", verts=8, radius2=0.24))
    parts.append(cyl("bowl", 0.18, 0.2, (0, 1.35, fz), M["stone"], axis="y", verts=8, radius2=0.45))
    parts.append(cyl("jet", 0.2, 0.7, (0, 1.8, fz), M["glass"], axis="y", verts=8, radius2=0.06))
    parts.append(lkit.sphere(0, 2.15, fz, 0.13, M["glass"], segments=8, rings=4))
    # Bollards round the forecourt.
    for bx in (-4.6, -2.3, 2.3, 4.6):
        parts.append(cyl("bollard", 0.18, 0.66, (bx, 0.63, 6.4), M["stone"], axis="y", verts=8, radius2=0.15))
        parts.append(cyl("bollardCap", 0.19, 0.1, (bx, 0.99, 6.4), M["metal"], axis="y", verts=8))
    # Lamp standards at the corners of the steps.
    for s in (-1, 1):
        parts.append(cyl("lampPost", 0.07, 2.6, (s * 5.4, 1.6, 4.9), M["dark"], axis="y", verts=6))
        parts.append(box("lampHead", (0.28, 0.34, 0.28), (s * 5.4, 3.05, 4.9), M["glass"], bev=0.0))
        parts.append(cyl("lampHat", 0.26, 0.14, (s * 5.4, 3.29, 4.9), M["dark"], axis="y", verts=4, radius2=0.04, rot=(0, math.pi / 4, 0)))
    return parts


def build():
    kit.reset()
    M = palette()
    hall = finish(plaza(M) + block(M) + colonnade(M) + cornice(M) + dome(M) + forecourt(M), "TownHall")
    kit.bake_ao([hall], distance=1.2, floor=0.55)
    return [hall, kit.marker("TownHall.lantern", LANTERN)]


def preview(_=0):
    return [o for o in build() if o.type == "MESH"]
