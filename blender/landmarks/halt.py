"""
The village halt, modelled by script (spike: Blender assets vs procedural).

Same natural size (15 x 4.6 x 6.5), single line, platform, timber shelter,
name board, bench, lamps and buffers as `halt()` in
`components/city/models/landmarks/village.ts`, and its two levels:

  level 1  the halt
  level 2  a two-car railcar waiting at the platform

Out come `Halt1`, `Halt2` and the `Halt.lamp.<i>` markers.

Materials are the halt's colour SLOTS (`<slot>.<surface>[.tNN]`).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

TRACK_Z = -1.9
PLATFORM_Z = 0.9
PLAT_Y = 0.75
LAMPS = (-4.6, 1.8)
LAMP_Z = PLATFORM_Z + 1.2

SLOT_HEX = {
    "deck": "#b8b6aa",
    "wall": "#f5f3ed",
    "roof": "#6f7a82",
    "steel": "#7d8689",
    "accent": "#38787e",
    "dark": "#5b554e",
    "wood": "#6b4e39",
    "glass": "#ffdca5",
}
SURFACE = {"deck": "stone", "wall": "timber", "roof": "slate", "steel": "metal", "accent": "metal", "dark": "concrete", "glass": "glass", "wood": "timber"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "deck": S("deck"),
        "flag": S("deck", 0.9),
        "joint": S("deck", 0.75),
        "wall": S("wall"),
        "roof": S("roof"),
        "ridge": S("roof", 0.8),
        "steel": S("steel"),
        "rail": S("steel", 0.85),
        "accent": S("accent"),
        "accentDeep": S("accent", 0.8),
        "ballast": S("dark"),
        "dark": S("dark", 0.6),
        "wood": S("wood"),
        "oak": S("wood", 0.8),
        "glass": S("glass", emission=0.3),
    }


def line(M):
    parts = [box("ballast", (15, 0.2, 2.4), (0, 0.1, TRACK_Z), M["ballast"], bev=0.08, cell=3.0)]
    for i in range(22):
        parts.append(box("sleeper", (0.24, 0.08, 1.9), (-7.2 + i * 0.69, 0.24, TRACK_Z), M["oak"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("railFoot", (15, 0.04, 0.16), (0, 0.3, TRACK_Z + s * 0.55), M["rail"], bev=0.0))
        parts.append(box("rail", (15, 0.1, 0.08), (0, 0.35, TRACK_Z + s * 0.55), M["steel"], bev=0.0))
    # Buffers at the end of the siding: a beam on two struts, sprung heads.
    bx = 7.2
    parts.append(box("bufferBeam", (0.3, 0.4, 1.4), (bx, 0.72, TRACK_Z), M["accent"], bev=0.03))
    for s in (-1, 1):
        parts.append(lkit.rod("bufferStrut", (bx + 0.1, 0.3, TRACK_Z + s * 0.55), (bx - 0.05, 0.85, TRACK_Z + s * 0.55), 0.06, M["dark"], sides=4))
        parts.append(cyl("bufferHead", 0.14, 0.12, (bx - 0.2, 0.7, TRACK_Z + s * 0.45), M["dark"], axis="x", verts=8))
    parts.append(box("bufferLamp", (0.12, 0.12, 0.12), (bx, 0.98, TRACK_Z), M["glass"], bev=0.0))
    return parts


def platform(M):
    pz = PLATFORM_Z
    parts = [box("platform", (12, PLAT_Y, 3.2), (0, PLAT_Y / 2, pz), M["deck"], bev=0.04, cell=2.4)]
    # The coping along the edge, white-lined, and a brick face below it.
    parts.append(box("coping", (12, 0.08, 0.35), (0, PLAT_Y + 0.03, pz - 1.425), M["wall"], bev=0.0))
    for k in range(5):
        parts.append(box("joint", (0.03, 0.01, 2.6), (-4.8 + k * 2.4, PLAT_Y + 0.005, pz + 0.2), M["joint"], bev=0.0))
    # Ramps at both ends.
    for s in (-1, 1):
        parts.append(box("ramp", (1.6, 0.4, 3.2), (s * 6.6, 0.2, pz), M["deck"], bev=0.02, rot=(0, 0, s * -0.22)))
    # A picket fence along the back of the platform.
    for i in range(24):
        x = -5.75 + i * 0.5
        if abs(x - 4.0) < 1.1:
            continue
        parts.append(box("picket", (0.08, 0.7, 0.04), (x, PLAT_Y + 0.35, pz + 1.55), M["wall"], bev=0.0))
    for y in (0.25, 0.55):
        parts.append(box("fenceRail", (11.9, 0.06, 0.04), (0, PLAT_Y + y, pz + 1.52), M["wall"], bev=0.0))
    return parts


def shelter(M):
    sx, sz = -1.2, PLATFORM_Z + 0.7
    y0 = PLAT_Y
    parts = []
    back = box("shelterBack", (3.6, 2.2, 0.16), (sx, y0 + 1.1, sz + 0.7), M["wall"], bev=0.02)
    cut_many(back, [box("winCut", (1.4, 0.7, 0.4), (sx - 0.6, y0 + 1.5, sz + 0.7), M["accentDeep"], bev=0.0)])
    parts.append(back)
    for s in (-1, 1):
        parts.append(box("shelterSide", (0.16, 2.2, 1.5), (sx + s * 1.72, y0 + 1.1, sz), M["wall"], bev=0.02))
    # Boarding, a green dado and corner posts.
    for i in range(9):
        parts.append(box("board", (0.03, 2.0, 0.02), (sx - 1.45 + i * 0.36, y0 + 1.05, sz + 0.61), M["wall"], bev=0.0))
    parts.append(box("dado", (3.6, 0.7, 0.18), (sx, y0 + 0.35, sz + 0.7), M["accent"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("dadoSide", (0.18, 0.7, 1.5), (sx + s * 1.72, y0 + 0.35, sz), M["accent"], bev=0.0))
        parts.append(box("post", (0.14, 2.3, 0.14), (sx + s * 1.72, y0 + 1.15, sz - 0.75), M["accentDeep"], bev=0.0))
    parts.append(box("winGlass", (1.4, 0.7, 0.04), (sx - 0.6, y0 + 1.5, sz + 0.63), M["glass"], bev=0.0))
    parts.append(box("winBar", (0.04, 0.7, 0.04), (sx - 0.6, y0 + 1.5, sz + 0.6), M["accentDeep"], bev=0.0))
    # The seat inside, the notice, the roof and its fretted valance.
    parts.append(box("seat", (3.0, 0.1, 0.45), (sx, y0 + 0.45, sz + 0.4), M["wood"], bev=0.0))
    parts.append(box("notice", (0.7, 0.5, 0.03), (sx + 0.8, y0 + 1.5, sz + 0.6), M["wall"], bev=0.0))
    parts.append(box("noticeFrame", (0.8, 0.6, 0.02), (sx + 0.8, y0 + 1.5, sz + 0.615), M["accentDeep"], bev=0.0))
    parts.append(lkit.gable_roof("roof", 1.1, 0.8, 4.4, (sx, y0 + 2.3, sz - 0.1), M["roof"], thick=0.1, overhang=0.35, along="x"))
    parts.append(box("ridge", (4.44, 0.1, 0.12), (sx, y0 + 2.3 + 0.86, sz - 0.1), M["ridge"], bev=0.0))
    for i in range(12):
        parts.append(cyl("valance", 0.12, 0.26, (sx - 2.05 + i * 0.37, y0 + 2.08, sz - 1.47), M["accent"], axis="y", verts=3, radius2=0.0, rot=(math.pi, 0, 0)))
    parts.append(box("valanceBoard", (4.4, 0.1, 0.05), (sx, y0 + 2.24, sz - 1.47), M["accent"], bev=0.0))
    return parts


def furniture(M):
    pz = PLATFORM_Z
    y0 = PLAT_Y
    parts = []
    # The name board on two posts.
    for x in (3.2, 4.8):
        parts.append(box("boardPost", (0.08, 1.8, 0.08), (x, y0 + 0.9, pz + 0.84), M["accentDeep"], bev=0.0))
    parts.append(box("nameBoard", (2.0, 0.55, 0.08), (4.0, y0 + 1.75, pz + 0.9), M["accent"], bev=0.02))
    parts.append(box("nameBorder", (1.84, 0.4, 0.02), (4.0, y0 + 1.75, pz + 0.85), M["wall"], bev=0.0))
    parts.append(box("nameLetters", (1.4, 0.12, 0.02), (4.0, y0 + 1.75, pz + 0.835), M["accentDeep"], bev=0.0))
    # Two lamps: a post, a lantern, a cap.
    for x in LAMPS:
        parts.append(box("lampFoot", (0.24, 0.1, 0.24), (x, y0 + 0.05, LAMP_Z), M["dark"], bev=0.0))
        parts.append(cyl("lampPost", 0.05, 2.45, (x, y0 + 1.25, LAMP_Z), M["accentDeep"], axis="y", verts=6, radius2=0.04))
        parts.append(box("lantern", (0.24, 0.3, 0.24), (x, y0 + 2.6, LAMP_Z), M["glass"], bev=0.0))
        parts.append(cyl("lampCap", 0.24, 0.16, (x, y0 + 2.83, LAMP_Z), M["accentDeep"], axis="y", verts=4, radius2=0.04, rot=(0, math.pi / 4, 0)))
    # A bench, a milk churn and a barrow.
    bx, bz = -4.6, pz + 0.9
    parts.append(box("benchSeat", (1.4, 0.08, 0.4), (bx, y0 + 0.45, bz), M["wood"], bev=0.0))
    parts.append(box("benchBack", (1.4, 0.3, 0.06), (bx, y0 + 0.72, bz + 0.2), M["wood"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("benchEnd", (0.06, 0.45, 0.42), (bx + s * 0.6, y0 + 0.22, bz), M["dark"], bev=0.0))
    for cx in (5.3, 5.62):
        parts.append(cyl("churn", 0.14, 0.5, (cx, y0 + 0.25, pz - 0.2), M["steel"], axis="y", verts=8, radius2=0.11))
    parts.append(box("barrow", (0.5, 0.06, 0.8), (-3.0, y0 + 0.35, pz - 0.3), M["wood"], bev=0.0, rot=(0.15, 0, 0)))
    parts.append(cyl("barrowWheel", 0.14, 0.06, (-3.0, y0 + 0.16, pz - 0.7), M["dark"], axis="x", verts=8))
    return parts


def railcar(M):
    car = 4.6
    parts = []
    for cx in (-car / 2 - 0.1, car / 2 + 0.1):
        body = box("carBody", (car, 1.5, 1.7), (cx, 0.4 + 1.05, TRACK_Z), M["accent"], bev=0.06)
        parts.append(body)
        parts.append(box("carBand", (car + 0.04, 0.1, 1.76), (cx, 0.4 + 1.55, TRACK_Z), M["wall"], bev=0.0))
        parts.append(box("carRoof", (car - 0.1, 0.18, 1.56), (cx, 0.4 + 1.88, TRACK_Z), M["roof"], bev=0.06))
        parts.append(box("carWindows", (car - 0.6, 0.45, 1.72), (cx, 0.4 + 1.3, TRACK_Z), M["glass"], bev=0.0))
        for side in (-1, 1):
            for i in range(5):
                parts.append(box("pillar", (0.07, 0.45, 0.02), (cx - 1.6 + i * 0.8, 0.4 + 1.3, TRACK_Z + side * 0.865), M["accent"], bev=0.0))
            parts.append(box("carDoor", (0.5, 1.1, 0.02), (cx + 1.85 * (1 if cx > 0 else -1) * -1, 0.4 + 1.0, TRACK_Z + side * 0.86), M["accentDeep"], bev=0.0))
        # Underframe, bogies and wheels.
        parts.append(box("underframe", (car - 0.8, 0.32, 1.3), (cx, 0.4 + 0.2, TRACK_Z), M["dark"], bev=0.0))
        for bx in (-1.4, 1.4):
            for s in (-1, 1):
                parts.append(cyl("wheel", 0.2, 0.08, (cx + bx, 0.4 + 0.02, TRACK_Z + s * 0.55), M["dark"], axis="z", verts=8))
    # The cabs at either end: a raked front, glass, lamps.
    for s in (-1, 1):
        ex = s * (car + 0.1)
        parts.append(box("cabGlass", (0.06, 0.5, 1.2), (ex + s * 0.02, 0.4 + 1.35, TRACK_Z), M["glass"], bev=0.0))
        parts.append(box("cabStripe", (0.04, 0.24, 1.3), (ex + s * 0.02, 0.4 + 0.72, TRACK_Z), M["wall"], bev=0.0))
        for dz in (-0.5, 0.5):
            parts.append(box("cabLamp", (0.04, 0.1, 0.16), (ex + s * 0.04, 0.4 + 0.72, TRACK_Z + dz), M["glass"], bev=0.0))
    # The gangway between the cars.
    parts.append(box("gangway", (0.3, 1.3, 1.1), (0, 0.4 + 1.05, TRACK_Z), M["dark"], bev=0.0))
    return parts


def halt(M, level):
    parts = line(M) + platform(M) + shelter(M) + furniture(M)
    if level >= 2:
        parts += railcar(M)
    return parts


def build():
    kit.reset()
    M = palette()
    made = []
    for level in (1, 2):
        made.append(finish(halt(M, level), f"Halt{level}"))
        lkit.bake(made[-1], [], made, distance=0.8)
    for i, x in enumerate(LAMPS):
        made.append(kit.marker(f"Halt.lamp.{i}", (x, PLAT_Y + 2.5, LAMP_Z)))
    return made


def preview(level):
    return lkit.keep_only(build(), [f"Halt{level}"])
