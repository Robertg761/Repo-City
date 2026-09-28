"""
The information centre, modelled by script (spike: Blender assets vs
procedural).

Same natural size (18 x 8 x 12), deck, buildings, fingerposts, map boards and
garden as `components/city/models/landmarks/info.ts`, entrance on +z facing
the city centre, and the same three levels:

  level 1  a kiosk with a map board              (no planting)
  level 2  a visitor centre, glass front, sign pylon, planters
  level 3  a library behind a colonnade, a reading garden with four lamps

Materials are the landmark's colour SLOTS (`<slot>.<surface>[.tNN]`). Out
come `Info1..3`, and `Info3.lamp.<i>` markers where the garden lamps glow.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

DECK = 0.45

SLOT_HEX = {
    "deck": "#a3a59d",
    "wall": "#f5f3ed",
    "roof": "#8c9ea3",
    "green": "#7fa46a",
    "sign": "#4d8fce",
    "glass": "#d3dace",
}
SURFACE = {"deck": "stone", "wall": "plaster", "roof": "metal", "glass": "glass", "sign": "metal", "green": "foliage"}
S = lkit.slots(SLOT_HEX, SURFACE)

LAMPS = ((3.2, 4.3), (8.0, 4.3), (3.2, -4.3), (8.0, -4.3))


def palette():
    return {
        "deck": S("deck"),
        "paving": S("deck", 0.92),
        "joint": S("deck", 0.75),
        "wall": S("wall"),
        "recess": S("wall", 0.8),
        "roof": S("roof"),
        "roofDark": S("roof", 0.7),
        "frame": S("roof", 0.55),
        "sign": S("sign"),
        "signDeep": S("sign", 0.8),
        "glass": S("glass", emission=0.3),
        "green": S("green"),
        "leaf": S("green", 0.82),
        "soil": S("deck", 0.55),
    }


# ---------------------------------------------------------------- shared furniture


def ground(M):
    parts = [box("deck", (17.4, DECK, 11.4), (0, DECK / 2, 0), M["deck"], bev=0.08, cell=2.8)]
    # The pavement along the front: a kerb and joints.
    parts.append(box("kerb", (17.2, 0.06, 0.24), (0, DECK + 0.03, 5.45), M["wall"], bev=0.0))
    for x in (-6.4, -4.6, -2.8, -1.0, 0.8, 2.6, 4.4):
        parts.append(box("joint", (0.03, 0.012, 1.3), (x, DECK + 0.006, 4.75), M["joint"], bev=0.0))
    return parts


def fingerpost(M, x, z, blades, direction):
    parts = [
        box("fpFoot", (0.4, 0.14, 0.4), (x, DECK + 0.07, z), M["roofDark"], bev=0.03),
        box("fpPost", (0.18, 3.2, 0.18), (x, DECK + 1.6, z), M["roof"], bev=0.03),
        cyl("fpCap", 0.16, 0.14, (x, DECK + 3.27, z), M["roof"], axis="y", verts=8),
        lkit.sphere(x, DECK + 3.42, z, 0.1, M["sign"], segments=8, rings=4),
    ]
    reach = 1.9
    for i in range(blades):
        y = DECK + 2.75 - i * 0.62
        # Blades point back into the plot, alternately turned.
        turn = (0 if direction > 0 else math.pi) + (0.3 if i % 2 == 0 else -0.3)
        arrow = [(0.1, -0.24), (reach - 0.25, -0.24), (reach, 0.0), (reach - 0.25, 0.24), (0.1, 0.24)]
        parts.append(lkit.slab("blade", arrow, 0.1, (x, y, z), M["sign"], turn=turn, bev=0.02))
        # White lettering bars on both faces.
        for face in (-1, 1):
            for k, (u0, u1) in enumerate(((0.3, 1.25), (0.3, 0.95))):
                v = 0.07 - k * 0.14
                parts.append(lkit.slab("letters", [(u0, v - 0.035), (u1, v - 0.035), (u1, v + 0.035), (u0, v + 0.035)],
                                       0.02, (x + math.sin(turn) * 0.06 * face, y, z + math.cos(turn) * 0.06 * face), M["wall"], turn=turn))
    return parts


def map_board(M, x, z, width, height):
    tilt = -0.16
    parts = []
    for s in (-1, 1):
        parts.append(box("mbPost", (0.12, 2.1, 0.12), (x + s * (width / 2 - 0.2), DECK + 1.05, z), M["roof"], bev=0.02))
    parts.append(box("mbFrame", (width, height, 0.12), (x, DECK + 1.75, z), M["sign"], bev=0.03, rot=(tilt, 0, 0)))
    parts.append(box("mbRoof", (width + 0.2, 0.08, 0.4), (x, DECK + 1.75 + height / 2 + 0.06, z + 0.02), M["roof"], bev=0.02, rot=(tilt, 0, 0)))

    # The map: a pale sheet, roads, a blue river and the "you are here" dot,
    # laid on the tilted face.
    fx, fy, fz = x, DECK + 1.75, z
    up = (math.cos(tilt), math.sin(tilt))
    out = (-math.sin(tilt), math.cos(tilt))

    def on(du, dv, off):
        return (fx + du, fy + dv * up[0] + off * out[0], fz + dv * up[1] + off * out[1])

    parts.append(box("map", (width - 0.3, height - 0.28, 0.02), on(0, 0, 0.065), M["wall"], bev=0.0, rot=(tilt, 0, 0)))
    for dv in (-0.2, 0.25):
        parts.append(box("road", (width - 0.5, 0.05, 0.015), on(0, dv * height, 0.078), M["roofDark"], bev=0.0, rot=(tilt, 0, 0)))
    for du in (-0.25, 0.22):
        parts.append(box("road", (0.05, height - 0.45, 0.015), on(du * width, 0, 0.079), M["roofDark"], bev=0.0, rot=(tilt, 0, 0)))
    parts.append(box("river", (0.14, height - 0.45, 0.015), on(0.02 * width, 0, 0.08), M["sign"], bev=0.0, rot=(tilt, 0.0, 0.45)))
    parts.append(box("here", (0.12, 0.12, 0.02), on(-0.1 * width, -0.05 * height, 0.085), M["glass"], bev=0.0, rot=(tilt, 0, 0)))
    return parts


def bench(M, x, z, turn):
    c, s_ = math.cos(turn), math.sin(turn)

    def at(dx, dy, dz):
        return (x + dx * c + dz * s_, DECK + dy, z - dx * s_ + dz * c)

    parts = []
    for k in range(3):
        parts.append(box("seat", (1.7, 0.05, 0.14), at(0, 0.46, -0.16 + k * 0.16), M["roof"], bev=0.0, rot=(0, turn, 0)))
    for k in range(2):
        parts.append(box("back", (1.7, 0.12, 0.05), at(0, 0.66 + k * 0.17, -0.25), M["roof"], bev=0.0, rot=(0.12, turn, 0)))
    for d in (-0.7, 0.7):
        parts.append(box("benchLeg", (0.08, 0.44, 0.46), at(d, 0.22, -0.03), M["frame"], bev=0.0, rot=(0, turn, 0)))
    return parts


def lamp(M, x, z):
    return [
        box("lampFoot", (0.3, 0.12, 0.3), (x, DECK + 0.06, z), M["roofDark"], bev=0.02),
        cyl("lampPost", 0.06, 2.7, (x, DECK + 1.4, z), M["roof"], axis="y", verts=6, radius2=0.045),
        box("lampGlass", (0.3, 0.3, 0.3), (x, DECK + 2.92, z), M["glass"], bev=0.0),
        cyl("lampHat", 0.3, 0.16, (x, DECK + 3.14, z), M["roof"], axis="y", verts=4, radius2=0.06, rot=(0, math.pi / 4, 0)),
        box("lampCollar", (0.22, 0.08, 0.22), (x, DECK + 2.74, z), M["roof"], bev=0.0),
    ]


def planter(M, x, z, w=1.3, d=1.3):
    return [
        box("planter", (w, 0.55, d), (x, DECK + 0.275, z), M["deck"], bev=0.05),
        box("planterRim", (w + 0.1, 0.08, d + 0.1), (x, DECK + 0.58, z), M["wall"], bev=0.02),
        box("soil", (w - 0.2, 0.04, d - 0.2), (x, DECK + 0.6, z), M["soil"], bev=0.0),
        lkit.shrub(x, DECK + 0.55, z, min(w, d) * 0.42, M["green"], squash=0.8),
    ]


# ---------------------------------------------------------------- level 1: the kiosk


def kiosk(M):
    x, z = -1.0, -0.4
    parts = []
    body = box("kiosk", (3.8, 2.8, 3.2), (x, DECK + 1.4, z), M["wall"], bev=0.05, cell=1.4)
    # The serving hatch, recessed, and a door on the side.
    cut_many(body, [
        box("hatchCut", (3.0, 1.7, 0.4), (x, DECK + 1.55, z + 1.6), M["recess"], bev=0.0),
        box("doorCut", (0.4, 2.1, 0.9), (x + 1.9, DECK + 1.05, z - 0.5), M["recess"], bev=0.0),
    ])
    parts.append(body)
    parts.append(box("hatchGlass", (3.0, 1.7, 0.04), (x, DECK + 1.55, z + 1.46), M["glass"], bev=0.0))
    for dx in (-0.5, 0.5):
        parts.append(box("hatchMull", (0.06, 1.7, 0.06), (x + dx, DECK + 1.55, z + 1.5), M["frame"], bev=0.0))
    parts.append(box("door", (0.05, 2.1, 0.9), (x + 1.82, DECK + 1.05, z - 0.5), M["roofDark"], bev=0.0))
    parts.append(box("plinth", (3.92, 0.3, 3.32), (x, DECK + 0.15, z), M["roofDark"], bev=0.03))
    # The counter, on brackets, with leaflet racks either side.
    parts.append(box("counter", (3.6, 0.1, 0.6), (x, DECK + 0.95, z + 1.85), M["roof"], bev=0.02))
    for dx in (-1.4, 1.4):
        parts.append(box("bracket", (0.08, 0.3, 0.4), (x + dx, DECK + 0.8, z + 1.75), M["frame"], bev=0.0))
    # The canopy: a deep fascia with the blue sign band on it, on two posts.
    parts.append(box("canopy", (5.4, 0.36, 4.8), (x, DECK + 2.98, z + 0.4), M["roof"], bev=0.05))
    parts.append(box("canopyTop", (5.1, 0.08, 4.5), (x, DECK + 3.2, z + 0.4), M["roofDark"], bev=0.0))
    parts.append(box("signBand", (3.4, 0.5, 0.12), (x, DECK + 2.6, z + 1.72), M["sign"], bev=0.03))
    parts += info_glyph(M, x - 1.3, DECK + 2.6, z + 1.79, 0.2)
    for k in range(3):
        parts.append(box("letters", (0.5 - k * 0.1, 0.07, 0.02), (x + 0.1 + k * 0.62, DECK + 2.6, z + 1.79), M["wall"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("post", (0.14, 3.1, 0.14), (x + s * 2.3, DECK + 1.55, z + 2.6), M["roof"], bev=0.02))
    # A bin and a bike rack by the kiosk.
    parts.append(cyl("bin", 0.22, 0.8, (x - 2.5, DECK + 0.4, z + 1.6), M["roofDark"], axis="y", verts=8))
    parts.append(cyl("binLid", 0.25, 0.06, (x - 2.5, DECK + 0.83, z + 1.6), M["roof"], axis="y", verts=8))
    return parts


def info_glyph(M, x, y, z, r):
    """The white "i" in a circle, facing +z."""
    return [
        cyl("glyphDisc", r, 0.02, (x, y, z), M["wall"], axis="z", verts=12),
        box("glyphStem", (r * 0.3, r * 0.9, 0.02), (x, y - r * 0.15, z + 0.015), M["sign"], bev=0.0),
        box("glyphDot", (r * 0.3, r * 0.3, 0.02), (x, y + r * 0.55, z + 0.015), M["sign"], bev=0.0),
    ]


# ---------------------------------------------------------------- level 2: the visitor centre


def visitor_centre(M):
    x, z = -1.8, -0.7
    front = z + 2.7
    parts = []
    body = box("centre", (10.2, 3.9, 5.4), (x, DECK + 1.95, z), M["wall"], bev=0.06, cell=1.8)
    cuts = [box("frontCut", (9.2, 2.7, 0.5), (x, DECK + 1.7, front), M["recess"], bev=0.0)]
    for s in (-1, 1):
        cuts.append(box("sideCut", (0.4, 1.6, 2.4), (x + s * 5.1, DECK + 2.0, z - 0.6), M["recess"], bev=0.0))
    cut_many(body, cuts)
    parts.append(body)
    parts.append(box("plinth", (10.32, 0.3, 5.52), (x, DECK + 0.15, z), M["roofDark"], bev=0.03))
    # The glass front, set back, with a mullion grid and the door.
    parts.append(box("front", (9.2, 2.7, 0.05), (x, DECK + 1.7, front - 0.18), M["glass"], bev=0.0))
    for i in range(7):
        parts.append(box("mull", (0.12, 2.7, 0.14), (x - 4.5 + i * 1.5, DECK + 1.7, front - 0.12), M["frame"], bev=0.0))
    parts.append(box("transom", (9.2, 0.08, 0.14), (x, DECK + 2.5, front - 0.12), M["frame"], bev=0.0))
    parts.append(box("doorFrame", (1.6, 2.3, 0.1), (x, DECK + 1.15, front - 0.1), M["frame"], bev=0.0))
    parts.append(box("doorGlass", (1.4, 2.15, 0.04), (x, DECK + 1.1, front - 0.05), M["glass"], bev=0.0))
    parts.append(box("doorBar", (0.05, 0.9, 0.05), (x, DECK + 1.1, front), M["roof"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("sideGlass", (0.05, 1.6, 2.4), (x + s * 4.97, DECK + 2.0, z - 0.6), M["glass"], bev=0.0))
        parts.append(box("sideSill", (0.2, 0.08, 2.6), (x + s * 5.12, DECK + 1.16, z - 0.6), M["roof"], bev=0.0))
    # The sign band and the roof: a thin overhanging slab with a fascia.
    parts.append(box("signBand", (10.4, 0.62, 0.22), (x, DECK + 3.42, front + 0.02), M["sign"], bev=0.04))
    parts += info_glyph(M, x - 4.3, DECK + 3.42, front + 0.14, 0.24)
    for k, w in enumerate((1.6, 1.1, 1.4)):
        parts.append(box("letters", (w, 0.1, 0.02), (x - 2.7 + sum((1.6, 1.1, 1.4)[:k]) + k * 0.3 + w / 2, DECK + 3.42, front + 0.14), M["wall"], bev=0.0))
    parts.append(box("roof", (11.4, 0.4, 6.6), (x, DECK + 4.1, z), M["roof"], bev=0.06, cell=2.4))
    parts.append(box("roofDeck", (10.9, 0.06, 6.1), (x, DECK + 4.33, z), M["roofDark"], bev=0.0))
    # Roof plant and a skylight.
    parts.append(box("ahu", (1.6, 0.6, 1.0), (x + 3.0, DECK + 4.66, z - 1.6), M["roof"], bev=0.05))
    parts.append(cyl("ahuFan", 0.3, 0.04, (x + 3.0, DECK + 4.98, z - 1.6), M["frame"], axis="y", verts=10))
    parts.append(box("skylight", (3.0, 0.3, 1.4), (x - 1.8, DECK + 4.5, z - 0.8), M["glass"], bev=0.03))
    parts.append(box("skyFrame", (3.2, 0.12, 1.6), (x - 1.8, DECK + 4.4, z - 0.8), M["frame"], bev=0.0))
    # The entrance canopy, clear of the sign band, on two posts.
    parts.append(box("canopy", (4.2, 0.24, 2.4), (x, DECK + 3.62, front + 0.75), M["roof"], bev=0.04))
    parts.append(box("canopyEdge", (4.3, 0.08, 0.1), (x, DECK + 3.5, front + 1.93), M["sign"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("canopyPost", (0.16, 3.5, 0.16), (x + s * 1.9, DECK + 1.75, front + 1.7), M["roof"], bev=0.02))
        parts += planter(M, x + s * 3.2, front + 0.9)
    # The sign pylon: the part of a visitor centre you see from the road.
    px, pz = 6.2, 1.4
    parts.append(box("pylonFoot", (0.9, 0.2, 0.9), (px, DECK + 0.1, pz), M["roofDark"], bev=0.03))
    parts.append(box("pylon", (0.45, 4.2, 0.45), (px, DECK + 2.1, pz), M["roof"], bev=0.04))
    parts.append(box("pylonSign", (3.0, 2.2, 0.2), (px, DECK + 3.6, pz), M["sign"], bev=0.05))
    parts.append(box("pylonTrim", (3.1, 0.1, 0.26), (px, DECK + 4.72, pz), M["roof"], bev=0.0))
    for face in (-1, 1):
        parts += [
            box("pylonGlyphA", (0.44, 1.15, 0.04), (px, DECK + 3.4, pz + face * 0.12), M["wall"], bev=0.0),
            box("pylonGlyphB", (0.44, 0.38, 0.04), (px, DECK + 4.28, pz + face * 0.12), M["wall"], bev=0.0),
        ]
    parts += map_board(M, 2.8, 4.6, 2.2, 1.5)
    parts += bench(M, -6.4, 4.2, 0.0)
    return parts


# ---------------------------------------------------------------- level 3: the library


def library(M):
    x, z = -2.6, -0.4
    base = DECK + 0.4
    front = z + 3.0
    parts = [box("podium", (11.4, 0.4, 7.4), (x, DECK + 0.2, -0.2), M["deck"], bev=0.05)]
    for i in range(2):
        parts.append(box("step", (9.0 - i * 0.8, 0.2, 0.8), (x, DECK + 0.3 - i * 0.2, 3.7 + i * 0.7), M["deck"], bev=0.03))
    hall = box("library", (10.0, 4.6, 6.0), (x, base + 2.3, z), M["wall"], bev=0.06, cell=1.8)
    cuts = [box("frontCut", (8.6, 3.2, 0.5), (x, base + 1.9, front), M["recess"], bev=0.0)]
    # Tall windows down the sides and the back.
    for s in (-1, 1):
        for wz in (-2.0, 0.0, 2.0):
            cuts.append(box("sideCut", (0.4, 2.6, 0.9), (x + s * 5.0, base + 2.3, z + wz * 0.95), M["recess"], bev=0.0))
    for wx in (-3.6, -1.2, 1.2, 3.6):
        cuts.append(box("backCut", (0.9, 2.6, 0.4), (x + wx, base + 2.3, z - 3.0), M["recess"], bev=0.0))
    cut_many(hall, cuts)
    parts.append(hall)
    parts.append(box("front", (8.6, 3.2, 0.05), (x, base + 1.9, front - 0.18), M["glass"], bev=0.0))
    for i in range(7):
        parts.append(box("mull", (0.1, 3.2, 0.12), (x - 4.2 + i * 1.4, base + 1.9, front - 0.12), M["frame"], bev=0.0))
    parts.append(box("transom", (8.6, 0.08, 0.12), (x, base + 2.7, front - 0.12), M["frame"], bev=0.0))
    for s in (-1, 1):
        for wz in (-2.0, 0.0, 2.0):
            parts.append(box("sideGlass", (0.05, 2.6, 0.9), (x + s * 4.88, base + 2.3, z + wz * 0.95), M["glass"], bev=0.0))
            parts.append(box("sideSill", (0.16, 0.08, 1.05), (x + s * 5.05, base + 0.96, z + wz * 0.95), M["roof"], bev=0.0))
    for wx in (-3.6, -1.2, 1.2, 3.6):
        parts.append(box("backGlass", (0.9, 2.6, 0.05), (x + wx, base + 2.3, z - 2.88), M["glass"], bev=0.0))
    # The colonnade: six columns with bases and capitals, and the entablature.
    for i in range(6):
        cx = -6.4 + i * 1.52
        parts.append(cyl("column", 0.3, 3.9, (cx, base + 2.15, 2.9), M["wall"], axis="y", verts=10, radius2=0.25))
        parts.append(box("colBase", (0.72, 0.18, 0.72), (cx, base + 0.09, 2.9), M["roof"], bev=0.03))
        parts.append(box("capital", (0.74, 0.2, 0.74), (cx, base + 4.2, 2.9), M["roof"], bev=0.03))
    parts.append(box("architrave", (10.4, 0.34, 0.9), (x, base + 4.47, 2.9), M["roof"], bev=0.04))
    parts.append(box("frieze", (10.0, 0.3, 0.06), (x, base + 4.47, 3.37), M["sign"], bev=0.0))
    parts.append(box("roof", (11.2, 0.5, 7.2), (x, base + 4.85, z), M["roof"], bev=0.06, cell=2.4))
    # The clerestory over the reading room, glazed all round, and its cap.
    parts.append(box("clerestory", (6.0, 0.85, 2.6), (x, base + 5.5, z), M["wall"], bev=0.04))
    parts.append(box("clereGlass", (6.05, 0.44, 2.65), (x, base + 5.5, z), M["glass"], bev=0.0))
    for k in range(7):
        parts.append(box("clereMull", (0.06, 0.44, 2.7), (x - 2.7 + k * 0.9, base + 5.5, z), M["frame"], bev=0.0))
    parts.append(box("clereCap", (6.4, 0.22, 3.0), (x, base + 6.02, z), M["roof"], bev=0.04))
    parts += info_glyph(M, x, base + 4.47, 3.42, 0.18)
    return parts


def garden(M):
    parts = [box("lawn", (5.6, 0.12, 7.0), (5.6, DECK + 0.06, -0.2), M["green"], bev=0.03)]
    # A gravel path down the middle, hedges at the corners and the back.
    parts.append(box("path", (1.2, 0.03, 7.0), (5.6, DECK + 0.135, -0.2), M["paving"], bev=0.0))
    for hx, hz in ((3.3, 2.4), (7.9, 2.4), (3.3, -2.6), (7.9, -2.6)):
        parts.append(box("hedge", (0.8, 0.8, 1.9), (hx, DECK + 0.52, hz), M["leaf"], bev=0.12, seg=2))
    parts.append(box("hedge", (4.2, 0.7, 0.7), (5.6, DECK + 0.47, -3.4), M["leaf"], bev=0.12, seg=2))
    # Two small trees, where they frame the garden from the overview.
    for tx, tz in ((3.4, 0.2), (7.8, 0.2)):
        parts.append(cyl("trunk", 0.1, 1.4, (tx, DECK + 0.8, tz), M["frame"], axis="y", verts=6))
        parts.append(lkit.shrub(tx, DECK + 1.2, tz, 0.75, M["green"], squash=0.9))
    for lx, lz in LAMPS:
        parts += lamp(M, lx, lz)
    parts += bench(M, 5.6, 1.1, 0.0)
    parts += bench(M, 5.6, -1.4, math.pi)
    # The pergola over the reading benches.
    for s in (-1, 1):
        for pz in (1.9, -2.2):
            parts.append(box("pergolaPost", (0.16, 2.6, 0.16), (5.6 + s * 1.9, DECK + 1.3, pz), M["roof"], bev=0.02))
        parts.append(box("pergolaBeam", (0.14, 0.18, 4.4), (5.6 + s * 1.9, DECK + 2.66, -0.15), M["roof"], bev=0.02))
    for i in range(6):
        parts.append(box("pergolaRafter", (4.4, 0.1, 0.12), (5.6, DECK + 2.8, 1.7 - i * 0.78), M["roof"], bev=0.0))
    return parts


# ---------------------------------------------------------------- build


def level_parts(M, level):
    parts = ground(M)
    if level <= 1:
        parts += kiosk(M)
        parts += map_board(M, 3.6, 2.2, 2.4, 1.6)
        parts += bench(M, 3.6, -1.2, 0.0)
    elif level == 2:
        parts += visitor_centre(M)
    else:
        parts += library(M) + garden(M)
    parts += fingerpost(M, -7.9, 4.6, 3 if level >= 2 else 2, 1)
    parts += fingerpost(M, 7.9, 4.6, 3 if level >= 3 else 2, -1)
    return parts


def build():
    kit.reset()
    M = palette()
    made = []
    for level in (1, 2, 3):
        made.append(finish(level_parts(M, level), f"Info{level}"))
        lkit.bake(made[-1], [], made, distance=1.0)
    for i, (lx, lz) in enumerate(LAMPS):
        made.append(kit.marker(f"Info3.lamp.{i}", (lx, DECK + 2.92, lz)))
    return made


def preview(level):
    return lkit.keep_only(build(), [f"Info{level}"])
