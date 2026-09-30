"""
The transit station, modelled by script (spike: Blender assets vs
procedural).

Same natural size (26 x 7 x 12), concourse, island platform, canopy, tracks,
catenary, signals and tunnel portal as
`components/city/models/landmarks/station.ts`, concourse entrance on +z and
the track along x. Everything the renderer reads is kept exactly: the rail
tops at y 0.5 and gauge +-0.72 on tracks A (z +3) and B (z -3), the platform
edge, the portal face at PORTAL_X (the running train is clipped there), the
lamp heads, and nothing built between track A and the +z plot edge.

  level 1  one track, a short canopy, a goods dock behind
  level 2  one track, the canopy over the whole platform
  level 3  two tracks, the second platform with its shelters

Out come `Station1..3` and `Station.lamp.<i>` markers. The trains stay the
procedural `trainCars()`.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

DECK = 0.4
PLATFORM_Y = 0.95
TRACK_A, TRACK_B = 3.0, -3.0
TRACK_HALF = 9.4
TRACK_X = 3.5
PORTAL_X = TRACK_X + TRACK_HALF - 0.6
LAMPS = (TRACK_X - 6.2, TRACK_X + 6.6)

SLOT_HEX = {
    "deck": "#a3a59d",
    "wall": "#f5f3ed",
    "roof": "#8c9ea3",
    "steel": "#7d8689",
    "accent": "#4489b4",
    "dark": "#1f2427",
    "glass": "#ffdca5",
}
SURFACE = {"deck": "stone", "wall": "brick", "roof": "metal", "steel": "metal", "glass": "glass", "accent": "metal", "dark": "concrete"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "deck": S("deck"),
        "ballast": S("deck", 0.68),
        "sleeper": S("deck", 0.45),
        "coping": S("deck", 1.0),
        "wall": S("wall"),
        "recess": S("wall", 0.8),
        "roof": S("roof"),
        "roofDark": S("roof", 0.72),
        "steel": S("steel"),
        "rail": S("steel", 0.8),
        "accent": S("accent"),
        "dark": S("dark"),
        "glass": S("glass", emission=0.3),
    }


def track(M, cz):
    parts = [box("ballast", (TRACK_HALF * 2, 0.3, 2.9), (TRACK_X, 0.15, cz), M["ballast"], bev=0.1, cell=3.0)]
    n = 24
    for i in range(n):
        x = TRACK_X - TRACK_HALF + 0.4 + i * ((TRACK_HALF * 2 - 0.8) / (n - 1))
        parts.append(box("sleeper", (0.28, 0.1, 2.3), (x, 0.33, cz), M["sleeper"], bev=0.0))
    for s in (-1, 1):
        # The rail: a foot and a head, tops at y 0.5, the train's gauge.
        parts.append(box("railFoot", (TRACK_HALF * 2, 0.06, 0.2), (TRACK_X, 0.41, cz + s * 0.72), M["rail"], bev=0.0))
        parts.append(box("rail", (TRACK_HALF * 2, 0.1, 0.1), (TRACK_X, 0.45, cz + s * 0.72), M["steel"], bev=0.0))
    return parts


def catenary(M, xs, cz, side):
    height = 4.3
    parts = []
    for x in xs:
        mz = cz + side * 1.9
        parts.append(box("mastFoot", (0.4, 0.3, 0.4), (x, DECK + 0.15, mz), M["deck"], bev=0.03))
        parts.append(box("mast", (0.18, height, 0.18), (x, PLATFORM_Y + height / 2 - 0.3, mz), M["steel"], bev=0.02))
        parts.append(box("arm", (0.12, 0.12, 1.9), (x, PLATFORM_Y + height - 0.42, cz + side * 0.95), M["steel"], bev=0.0))
        parts.append(lkit.rod("stay", (x, PLATFORM_Y + height - 0.1, mz), (x, PLATFORM_Y + height - 0.42, cz + side * 0.3), 0.03, M["steel"], sides=3))
        parts.append(cyl("insulator", 0.07, 0.3, (x, PLATFORM_Y + height - 0.62, cz), M["deck"], axis="y", verts=5))
    for a, b in zip(xs, xs[1:]):
        # The contact wire is held level for the pantograph; the messenger
        # above it takes the sag and carries it on droppers.
        contact_y = PLATFORM_Y + height - 0.8
        messenger_y = PLATFORM_Y + height - 0.5
        sag = 0.22
        parts += lkit.cable("contact", (a, contact_y, cz), (b, contact_y, cz), 0.035, 0.0, M["rail"], segments=1)
        parts += lkit.cable("messenger", (a, messenger_y, cz), (b, messenger_y, cz), 0.03, sag, M["rail"])
        for t in (0.2, 0.4, 0.6, 0.8):
            x = a + (b - a) * t
            top = messenger_y - sag * 4 * t * (1 - t)
            parts.append(lkit.rod("dropper", (x, top, cz), (x, contact_y + 0.03, cz), 0.012, M["rail"], sides=3))
    return parts


def concourse(M):
    x = -9.4
    parts = [box("forecourt", (6.6, 0.25, 5.8), (x, DECK + 0.02, 0), M["deck"], bev=0.04)]
    base = DECK + 0.15
    body = box("concourse", (6.0, 4.2, 5.2), (x, base + 2.1, 0), M["wall"], bev=0.06, cell=1.6)
    cuts = [box("frontCut", (4.6, 2.8, 0.5), (x, base + 1.5, 2.6), M["recess"], bev=0.0)]
    for s in (-1, 1):
        cuts.append(box("sideCut", (0.5, 1.6, 3.0), (x + s * 3.0, base + 2.35, 0), M["recess"], bev=0.0))
    # The back wall: a staff door with a window either side of it, and a vent above.
    cuts.append(box("backDoorCut", (1.1, 1.8, 0.4), (x, base + 1.35, -2.6), M["recess"], bev=0.0))
    for s in (-1, 1):
        cuts.append(box("backCut", (0.9, 1.2, 0.4), (x + s * 1.85, base + 2.0, -2.6), M["recess"], bev=0.0))
    cut_many(body, cuts)
    parts.append(body)
    parts.append(box("backDoor", (1.1, 1.8, 0.05), (x, base + 1.35, -2.48), M["accent"], bev=0.0))
    parts.append(box("backHood", (1.6, 0.1, 0.6), (x, base + 2.45, -2.9), M["roof"], bev=0.03))
    for s in (-1, 1):
        parts.append(box("backGlass", (0.9, 1.2, 0.04), (x + s * 1.85, base + 2.0, -2.5), M["glass"], bev=0.0))
        parts.append(box("backSill", (1.06, 0.08, 0.14), (x + s * 1.85, base + 1.36, -2.66), M["roof"], bev=0.0))
    parts.append(box("backVentFrame", (1.4, 0.5, 0.06), (x, base + 3.4, -2.63), M["roof"], bev=0.0))
    for k in range(4):
        parts.append(box("backVentSlat", (1.24, 0.05, 0.05), (x, base + 3.24 + k * 0.11, -2.66), M["dark"], bev=0.0))
    parts.append(box("plinth", (6.14, 0.4, 5.34), (x, base + 0.2, 0), M["roofDark"], bev=0.03))
    # The glass front with its mullions and doors.
    parts.append(box("front", (4.6, 2.8, 0.05), (x, base + 1.5, 2.42), M["glass"], bev=0.0))
    for i in range(5):
        parts.append(box("mull", (0.1, 2.8, 0.12), (x - 2.3 + i * 1.15, base + 1.5, 2.48), M["steel"], bev=0.0))
    parts.append(box("transom", (4.6, 0.08, 0.12), (x, base + 2.3, 2.48), M["steel"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("sideGlass", (0.05, 1.6, 3.0), (x + s * 2.83, base + 2.35, 0), M["glass"], bev=0.0))
        for k in (-0.75, 0.75):
            parts.append(box("sideMull", (0.08, 1.6, 0.08), (x + s * 2.86, base + 2.35, k), M["steel"], bev=0.0))
        parts.append(box("pier", (0.24, 3.0, 0.24), (x + s * 2.42, base + 1.5, 2.66), M["roof"], bev=0.03))
    # The canopy over the entrance, the clock and the name board.
    parts.append(box("entryCanopy", (4.8, 0.2, 1.1), (x, base + 3.15, 3.1), M["roof"], bev=0.03))
    parts.append(box("canopyEdge", (4.9, 0.1, 0.08), (x, base + 3.08, 3.66), M["accent"], bev=0.0))
    parts.append(cyl("clockRim", 0.62, 0.12, (x, base + 3.72, 2.66), M["steel"], axis="z", verts=16))
    parts.append(cyl("clockFace", 0.52, 0.04, (x, base + 3.72, 2.73), M["glass"], axis="z", verts=16))
    parts.append(box("hand", (0.06, 0.34, 0.03), (x, base + 3.86, 2.77), M["dark"], bev=0.0))
    parts.append(box("hand", (0.26, 0.06, 0.03), (x + 0.11, base + 3.72, 2.775), M["dark"], bev=0.0))
    parts.append(box("roof", (6.8, 0.5, 6.0), (x, base + 4.45, 0), M["roof"], bev=0.06))
    parts.append(box("roofTop", (6.4, 0.06, 5.6), (x, base + 4.72, 0), M["roofDark"], bev=0.0))
    parts.append(box("nameBoard", (3.4, 0.62, 0.14), (x, base + 4.75, 2.5), M["accent"], bev=0.04))
    for k, w in enumerate((0.9, 0.6, 0.9)):
        parts.append(box("letters", (w, 0.12, 0.02), (x - 1.0 + k * 1.0, base + 4.75, 2.58), M["wall"], bev=0.0))
    # A roof lantern over the booking hall.
    parts.append(box("roofLight", (3.0, 0.3, 2.0), (x, base + 4.9, -0.6), M["glass"], bev=0.03))
    parts.append(box("roofLightCap", (3.2, 0.1, 2.2), (x, base + 5.08, -0.6), M["roof"], bev=0.0))
    return parts


def platform(M, level):
    parts = [box("platform", (18.8, PLATFORM_Y - DECK, 3.0), (TRACK_X, DECK + (PLATFORM_Y - DECK) / 2, 0), M["deck"], bev=0.04, cell=3.0)]
    for s in (-1, 1):
        # Coping over the edge, the blue safety line, and tactile paving.
        parts.append(box("coping", (18.8, 0.08, 0.3), (TRACK_X, PLATFORM_Y + 0.02, s * 1.38), M["coping"], bev=0.0))
        parts.append(box("line", (18.7, 0.02, 0.12), (TRACK_X, PLATFORM_Y + 0.065, s * 1.1), M["accent"], bev=0.0))
    columns = 5 if level >= 2 else 3
    length = 16.8 if level >= 2 else 10.4
    cx0 = TRACK_X if level >= 2 else TRACK_X - 3.2
    top = PLATFORM_Y + 3.3
    for i in range(columns):
        cx = cx0 - length / 2 + 1.2 + i * ((length - 2.4) / (columns - 1))
        parts.append(cyl("column", 0.14, 3.1, (cx, PLATFORM_Y + 1.55, 0), M["steel"], axis="y", verts=8, radius2=0.12))
        parts.append(box("colFoot", (0.4, 0.12, 0.4), (cx, PLATFORM_Y + 0.06, 0), M["steel"], bev=0.02))
        parts.append(box("beam", (0.14, 0.18, 3.4), (cx, top - 0.23, 0), M["steel"], bev=0.0))
        for side in (-1, 1):
            parts.append(lkit.rod("bracket", (cx, PLATFORM_Y + 2.3, 0), (cx, top - 0.3, side * 1.3), 0.06, M["steel"], sides=4))
    # The canopy: a slab with a raised glazed clerestory, a blue fascia.
    parts.append(box("canopy", (length, 0.24, 3.6), (cx0, top, 0), M["roof"], bev=0.05))
    parts.append(box("clerestory", (length - 1.6, 0.44, 1.2), (cx0, top + 0.34, 0), M["glass"], bev=0.0))
    parts.append(box("clereCap", (length - 1.4, 0.12, 1.5), (cx0, top + 0.62, 0), M["roof"], bev=0.03))
    n = int((length - 1.6) / 1.4)
    for k in range(n + 1):
        parts.append(box("clereMull", (0.06, 0.44, 1.26), (cx0 - (length - 1.6) / 2 + k * (length - 1.6) / n, top + 0.34, 0), M["steel"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("fascia", (length - 0.1, 0.34, 0.1), (cx0, top - 0.1, s * 1.82), M["accent"], bev=0.0))
    # Furniture: a bench, the departure board, two lamps, a bin.
    bx = TRACK_X + 4.4
    for k in range(3):
        parts.append(box("seat", (2.0, 0.05, 0.14), (bx, PLATFORM_Y + 0.45, -0.56 + k * 0.16), M["roof"], bev=0.0))
    parts.append(box("seatBack", (2.0, 0.34, 0.06), (bx, PLATFORM_Y + 0.7, -0.66), M["roof"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("seatLeg", (0.08, 0.44, 0.46), (bx + s * 0.8, PLATFORM_Y + 0.22, -0.42), M["steel"], bev=0.0))
    dx = TRACK_X - 2.0
    parts.append(box("boardPost", (0.14, 1.3, 0.14), (dx, PLATFORM_Y + 0.65, 0.6), M["steel"], bev=0.0))
    parts.append(box("board", (1.9, 0.9, 0.2), (dx, PLATFORM_Y + 1.6, 0.6), M["accent"], bev=0.04))
    parts.append(box("boardFace", (1.6, 0.66, 0.04), (dx, PLATFORM_Y + 1.6, 0.71), M["dark"], bev=0.0))
    for i in range(4):
        parts.append(box("boardLine", (1.1 - i * 0.12, 0.05, 0.02), (dx - 0.18 - i * 0.06, PLATFORM_Y + 1.84 - i * 0.16, 0.73), M["glass"], bev=0.0))
    for lx in LAMPS:
        parts.append(cyl("lampPost", 0.08, 2.4, (lx, PLATFORM_Y + 1.2, 0), M["steel"], axis="y", verts=6, radius2=0.06))
        parts.append(box("lampGlass", (0.3, 0.26, 0.3), (lx, PLATFORM_Y + 2.52, 0), M["glass"], bev=0.0))
        parts.append(cyl("lampHat", 0.32, 0.16, (lx, PLATFORM_Y + 2.73, 0), M["steel"], axis="y", verts=4, radius2=0.06, rot=(0, math.pi / 4, 0)))
    parts.append(cyl("bin", 0.2, 0.7, (TRACK_X + 2.4, PLATFORM_Y + 0.35, -0.9), M["roofDark"], axis="y", verts=8))
    return parts


def portal(M):
    x0 = PORTAL_X + 0.04
    x1 = 13.0
    depth = x1 - x0
    x = (x0 + x1) / 2
    parts = []
    wall = box("headwall", (depth, 4.1, 4.4), (x, 2.05, TRACK_A), M["wall"], bev=0.05, cell=1.4)
    # The back of the headwall, facing the plot's end: a service door under a
    # hood, a louvred vent and an accent sign plate over it, and a lamp.
    # Everything is set into the wall: the plot ends at x1.
    cut_many(wall, [
        box("backDoorCut", (0.5, 2.2, 1.0), (x1, 1.1, TRACK_A), M["dark"], bev=0.0),
        box("backVentCut", (0.3, 0.6, 1.3), (x1, 3.1, TRACK_A), M["dark"], bev=0.0),
        box("backSignCut", (0.16, 0.36, 1.1), (x1, 3.62, TRACK_A), M["dark"], bev=0.0),
    ])
    parts.append(wall)
    parts.append(box("backDoor", (0.05, 2.2, 1.0), (x1 - 0.2, 1.1, TRACK_A), M["accent"], bev=0.0))
    parts.append(box("backHood", (0.06, 0.1, 1.3), (x1 - 0.03, 2.3, TRACK_A), M["roof"], bev=0.0))
    for k in range(4):
        parts.append(box("backSlat", (0.05, 0.05, 1.2), (x1 - 0.1, 2.9 + k * 0.14, TRACK_A), M["steel"], bev=0.0))
    parts.append(box("backSign", (0.04, 0.36, 1.1), (x1 - 0.07, 3.62, TRACK_A), M["accent"], bev=0.0))
    parts.append(box("backLamp", (0.06, 0.22, 0.2), (x1 - 0.03, 2.55, TRACK_A + 0.95), M["steel"], bev=0.0))
    # The dark mouth, a round-headed arch on the face, and voussoirs round it.
    parts.append(box("mouth", (0.06, 2.6, 2.3), (PORTAL_X + 0.03, 1.6, TRACK_A), M["dark"], bev=0.0))
    parts.append(cyl("mouthArch", 1.15, 0.06, (PORTAL_X + 0.03, 2.9, TRACK_A), M["dark"], axis="x", verts=12))
    for i in range(7):
        a = math.pi * i / 6
        parts.append(box("voussoir", (0.1, 0.34, 0.24), (PORTAL_X + 0.0, 2.9 + math.sin(a) * 1.3, TRACK_A + math.cos(a) * 1.3), M["roof"], bev=0.0, rot=(-(a - math.pi / 2), 0, 0)))
    for s in (-1, 1):
        parts.append(box("jamb", (0.1, 1.9, 0.24), (PORTAL_X + 0.0, 1.35, TRACK_A + s * 1.3), M["roof"], bev=0.0))
    parts.append(box("coping", (depth, 0.3, 4.8), (x, 4.25, TRACK_A), M["roof"], bev=0.04))
    for s in (-1, 1):
        parts.append(box("buttress", (depth + 0.25, 3.4, 0.5), (x - 0.175, 1.7, TRACK_A + s * 2.0), M["roof"], bev=0.04))
        parts.append(box("buttressCap", (depth + 0.35, 0.16, 0.6), (x - 0.175, 3.45, TRACK_A + s * 2.0), M["roof"], bev=0.02))
    return parts


def signals(M):
    parts = []
    for s in (-1, 1):
        sx = TRACK_X + s * 8.5
        sz = TRACK_A + s * 1.8
        parts.append(box("sigFoot", (0.3, 0.2, 0.3), (sx, DECK + 0.1, sz), M["deck"], bev=0.02))
        parts.append(box("sigPost", (0.14, 2.6, 0.14), (sx, 1.3, sz), M["steel"], bev=0.0))
        parts.append(box("sigHead", (0.36, 0.8, 0.22), (sx, 2.6, sz), M["dark"], bev=0.04))
        parts.append(box("sigHood", (0.36, 0.05, 0.14), (sx, 2.9, sz + s * 0.16), M["dark"], bev=0.0))
        parts.append(box("sigLamp", (0.2, 0.2, 0.06), (sx, 2.78, sz + s * 0.12), M["glass"], bev=0.0))
    return parts


def far_side(M, level):
    parts = []
    if level >= 3:
        parts += track(M, TRACK_B)
        parts.append(box("platform2", (18.8, PLATFORM_Y - DECK, 1.6), (TRACK_X, DECK + (PLATFORM_Y - DECK) / 2, -5.1), M["deck"], bev=0.04, cell=3.0))
        parts.append(box("coping2", (18.8, 0.08, 0.3), (TRACK_X, PLATFORM_Y + 0.02, -4.43), M["coping"], bev=0.0))
        parts.append(box("line2", (18.7, 0.02, 0.12), (TRACK_X, PLATFORM_Y + 0.065, -4.7), M["accent"], bev=0.0))
        for i in range(2):
            sx = TRACK_X - 4.4 + i * 8.8
            parts.append(box("shelterRoof", (3.4, 0.16, 1.6), (sx, PLATFORM_Y + 2.3, -5.1), M["roof"], bev=0.03, rot=(0.08, 0, 0)))
            parts.append(box("shelterBack", (3.2, 1.4, 0.08), (sx, PLATFORM_Y + 0.95, -5.75), M["accent"], bev=0.0))
            parts.append(box("shelterSign", (1.2, 0.3, 0.1), (sx, PLATFORM_Y + 1.95, -5.72), M["wall"], bev=0.0))
            for s in (-1, 1):
                parts.append(box("shelterPost", (0.1, 2.3, 0.1), (sx + s * 1.55, PLATFORM_Y + 1.15, -5.72), M["steel"], bev=0.0))
                parts.append(box("shelterEnd", (0.06, 1.4, 0.9), (sx + s * 1.55, PLATFORM_Y + 0.95, -5.3), M["accent"], bev=0.0))
            parts.append(box("shelterSeat", (2.6, 0.06, 0.36), (sx, PLATFORM_Y + 0.45, -5.5), M["roof"], bev=0.0))
    else:
        # No second line: a goods dock with crates and a sack barrow.
        parts.append(box("dock", (9.0, 0.7, 2.4), (TRACK_X + 3.0, 0.35, -3.6), M["deck"], bev=0.05))
        parts.append(box("dockEdge", (9.0, 0.08, 0.2), (TRACK_X + 3.0, 0.72, -2.46), M["coping"], bev=0.0))
        for bx, bz, h in ((1.2, -3.2, 0.9), (2.6, -4.0, 0.7), (5.4, -3.4, 1.1), (6.3, -4.2, 0.6)):
            parts.append(box("crate", (1.0, h, 1.0), (bx, 0.7 + h / 2, bz), M["roof"], bev=0.05))
            parts.append(box("crateBand", (1.04, 0.08, 1.04), (bx, 0.7 + h * 0.7, bz), M["roofDark"], bev=0.0))
        parts.append(box("dockShed", (2.2, 1.8, 1.8), (TRACK_X + 6.4, 1.6, -3.9), M["wall"], bev=0.05))
        parts.append(box("dockShedRoof", (2.5, 0.12, 2.1), (TRACK_X + 6.4, 2.56, -3.9), M["roof"], bev=0.03, rot=(0.06, 0, 0)))
        parts.append(box("dockShedDoor", (0.9, 1.3, 0.04), (TRACK_X + 6.4, 1.35, -2.99), M["roofDark"], bev=0.0))
    return parts


def station(M, level):
    parts = [box("deck", (25.4, DECK, 11.4), (0, DECK / 2, 0), M["deck"], bev=0.08, cell=3.0)]
    parts += concourse(M) + platform(M, level) + track(M, TRACK_A)
    parts += catenary(M, [TRACK_X - 7.4, TRACK_X - 2.4, TRACK_X + 2.6, TRACK_X + 7.6], TRACK_A, 1)
    parts += far_side(M, level) + signals(M) + portal(M)
    return parts


def build():
    kit.reset()
    M = palette()
    made = []
    for level in (1, 2, 3):
        made.append(finish(station(M, level), f"Station{level}"))
        lkit.bake(made[-1], [], made, distance=1.0)
    for i, lx in enumerate(LAMPS):
        made.append(kit.marker(f"Station.lamp.{i}", (lx, PLATFORM_Y + 2.52, 0)))
    return made


def preview(level):
    return lkit.keep_only(build(), [f"Station{level}"])
