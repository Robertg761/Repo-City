"""
The power station, modelled by script (spike: Blender assets vs procedural).

Same natural size (17 x 13 x 12), deck, hall, cooling towers, chimney,
switchyard, pylons and status board as
`components/city/models/landmarks/power.ts`, front (+z) to the city centre,
and every anchor `POWER_ANCHORS` publishes left where the effects expect it.

The CI state changes the geometry in one place only -- a failing plant's
chimney goes cold -- so the chimney is its own node in two paints and the
rest is shared:

  Power       the plant and its yard, without the chimney
  Stack       the chimney, lit (hull slot, hazard bands)
  StackCold   the chimney, cold (`cold` slot): state "failing"
  Bare        the substation alone: state "none" (section 14, no CI is not
              a failure, so the plant is simply not there)

Materials are the landmark's colour SLOTS (`<slot>.<surface>[.tNN]`); a
`tNN` is a darker shade of the slot baked into the vertex colour.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402,F401  (puts blender/ on sys.path)
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish, strut  # noqa: E402
from lkit import lathe, wire  # noqa: E402

DECK = 0.5
HALL_X = -4.55
HALL_W, HALL_H, HALL_D = 7.0, 5.2, 8.6
CHIMNEY = (0.3, 3.3)
TOWERS = ((1.6, -2.4), (5.9, -2.4))
YARD = dict(x0=1.0, x1=8.2, z0=1.1, z1=4.9)
# The bare (no CI) state adds a second bay where the hall would stand, a
# control kiosk between them and the line poles along the back.
YARD2 = dict(x0=-7.0, x1=0.2, z0=-2.6, z1=1.2)
YARD2_CZ = -0.7
GANTRY2 = (-6.6, -0.2)
GATE2 = (-4.2, -3.0)
KIOSK = (4.6, -2.5)
POLES = tuple((x, -4.9) for x in (-6.6, -2.4, 1.8, 6.0))
POLE_H = 5.4
PYLONS = ((-6.9, 5.05), (0.4, 5.05))
PYLON_H = 7.6
ARM_REACH = 0.8
BEACON = (-7.2, 6.15, 3.2)
BOARD = (-1.8, 5.2)

# The slot colours `Landmark.tsx` paints (before the atmosphere tint), so the
# preview matches the city. Only the slot name and the tone travel.
SLOT_HEX = {
    "deck": "#a3a59d",
    "hull": "#f5f3ed",
    "cold": "#6f6a64",
    "steel": "#7d8689",
    "hazard": "#c8493c",
    "glass": "#ffdca5",
}
SURFACE = {"deck": "concrete", "hull": "metal", "cold": "metal", "steel": "metal", "hazard": "metal", "glass": "glass"}

S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "deck": S("deck"),
        "gravel": S("deck", 0.86),
        "curb": S("deck", 1.0),
        "joint": S("deck", 0.72),
        "stain": S("deck", 0.84),
        "inside": S("deck", 0.5),
        "water": S("steel", 0.45),
        "porcelain": S("deck", 0.95),
        "hull": S("hull"),
        "recess": S("hull", 0.78),
        "clad": S("hull", 0.9),
        "steel": S("steel"),
        "steelDark": S("steel", 0.6),
        "flue": S("steel", 0.35),
        "hazard": S("hazard"),
        "hazardDeep": S("hazard", 0.8),
        "glass": S("glass", emission=0.4),
        "cold": S("cold"),
        "coldDark": S("cold", 0.8),
    }


# ---------------------------------------------------------------- the ground


def ground(M):
    parts = [box("deck", (16.6, DECK, 11.4), (0, DECK / 2, 0), M["deck"], bev=0.08, cell=2.8)]
    # Expansion joints across the deck, so the biggest surface on the plot is
    # not one flat grey.
    for jx in (-1.0, 3.2):
        parts.append(box("joint", (0.04, 0.012, 11.2), (jx, DECK + 0.006, 0), M["joint"], bev=0.0))
    return parts


# ---------------------------------------------------------------- the hall


def hall(M):
    x = HALL_X
    top = DECK + HALL_H
    z1 = HALL_D / 2
    # The paved apron in front of the roller door, with its stop line.
    parts = [box("road", (3.2, 0.04, 1.4), (x, DECK + 0.02, 5.0), M["joint"], bev=0.0)]
    for i in range(2):
        parts.append(box("lane", (0.5, 0.012, 0.12), (x - 0.7 + i * 1.4, DECK + 0.046, 5.2), M["hull"], bev=0.0))
    walls = box("hall", (HALL_W, HALL_H, HALL_D), (x, DECK + HALL_H / 2, 0), M["hull"], bev=0.05, cell=2.6)
    cutters = []
    for side in (-1, 1):
        # The long window band on both faces, set back in a reveal.
        cutters.append(box("bandCut", (6.1, 1.35, 0.3), (x, DECK + 3.3, side * z1), M["recess"], bev=0.0))
        # Tall vents on the end walls.
        for vz in (-1.6, 1.6):
            cutters.append(box("ventCut", (0.3, 2.0, 1.1), (x + side * HALL_W / 2, DECK + 2.8, vz), M["recess"], bev=0.0))
    # The roller door on the front.
    cutters.append(box("doorCut", (2.3, 2.8, 0.36), (x, DECK + 1.4, z1), M["recess"], bev=0.0))
    cut_many(walls, cutters)
    parts.append(walls)

    # Plinth course round the foot.
    plinth = box("plinth", (HALL_W + 0.14, 0.5, HALL_D + 0.14), (x, DECK + 0.25, 0), M["clad"], bev=0.04)
    cut_many(plinth, [
        box("plinthCut", (2.3, 1.0, 0.6), (x, DECK + 0.4, z1), M["recess"], bev=0.0),
        box("plinthCut", (0.9, 1.0, 0.6), (x + 2.35, DECK + 0.4, z1), M["recess"], bev=0.0),
    ])
    parts.append(plinth)

    for side in (-1, 1):
        fz = side * z1
        # Glass set back in the band, with mullions.
        parts.append(box("band", (6.1, 1.35, 0.04), (x, DECK + 3.3, fz - side * 0.12), M["glass"], bev=0.0))
        for i in range(5):
            parts.append(box("mull", (0.06, 1.35, 0.06), (x - 2.9 + (i + 0.5) * 1.16, DECK + 3.3, fz - side * 0.09), M["steelDark"], bev=0.0))
        parts.append(box("sill", (6.3, 0.08, 0.2), (x, DECK + 2.58, fz + side * 0.05), M["clad"], bev=0.0))
        # Steel pilasters, standing proud of the cladding.
        for i in range(6):
            if side > 0 and i in (2, 3):
                continue
            px = x - 2.9 + i * 1.16
            parts.append(box("pilaster", (0.26, HALL_H - 0.1, 0.22), (px, DECK + (HALL_H - 0.1) / 2, fz + side * 0.11), M["steel"], bev=0.03))
        # End walls: vent louvres in the cuts, and a downpipe at each corner.
        fx = x + side * HALL_W / 2
        for vz in (-1.6, 1.6):
            parts.append(box("vent", (0.04, 2.0, 1.1), (fx - side * 0.12, DECK + 2.8, vz), M["steelDark"], bev=0.0))
            for k in range(3):
                parts.append(box("louvre", (0.08, 0.05, 1.06), (fx - side * 0.07, DECK + 2.2 + k * 0.6, vz), M["steel"], bev=0.0))
        for cz in (-1, 1):
            parts.append(box("downpipe", (0.1, HALL_H - 0.3, 0.1), (fx + side * 0.07, DECK + (HALL_H - 0.3) / 2, cz * (z1 - 0.3)), M["steel"], bev=0.0))

    # The roller door: slats, a hazard-striped lintel, a personnel door.
    for k in range(9):
        parts.append(box("slat", (2.28, 0.3, 0.06), (x, DECK + 0.17 + k * 0.3, z1 - 0.15), M["steel"], bev=0.0))
    parts.append(box("lintel", (2.6, 0.22, 0.22), (x, DECK + 2.93, z1 + 0.06), M["hazard"], bev=0.03))
    for k in range(4):
        parts.append(box("stripe", (0.22, 0.2, 0.02), (x - 0.99 + k * 0.66, DECK + 2.93, z1 + 0.175), M["hull"], bev=0.0, rot=(0, 0, 0.6)))
    parts.append(box("pdoor", (0.9, 2.1, 0.06), (x + 2.35, DECK + 1.05, z1 + 0.03), M["steelDark"], bev=0.0))
    parts.append(box("pcanopy", (1.2, 0.08, 0.6), (x + 2.35, DECK + 2.35, z1 + 0.3), M["steel"], bev=0.02))

    # The top: a fascia, the roof slab, two clerestory monitors along x.
    parts.append(box("fascia", (HALL_W + 0.5, 0.4, HALL_D + 0.5), (x, top + 0.2, 0), M["clad"], bev=0.04))
    parts.append(box("roof", (HALL_W + 0.2, 0.06, HALL_D + 0.2), (x, top + 0.39, 0), M["deck"], bev=0.0, cell=1.8))
    for mz in (-2.3, 2.3):
        mon = box("monitor", (6.0, 0.8, 1.1), (x, top + 0.84, mz), M["hull"], bev=0.04)
        cut_many(mon, [box("monCut", (5.6, 0.34, 1.4), (x, top + 0.85, mz), M["recess"], bev=0.0)])
        parts.append(mon)
        parts.append(box("monGlass", (5.6, 0.34, 0.9), (x, top + 0.85, mz), M["glass"], bev=0.0))
        parts.append(box("monCap", (6.3, 0.14, 1.4), (x, top + 1.3, mz), M["deck"], bev=0.03))
        for k in range(4):
            parts.append(box("monMull", (0.05, 0.34, 1.0), (x - 2.1 + k * 1.4, top + 0.85, mz), M["steelDark"], bev=0.0))
    # Roof fans between the monitors, and the beacon's base plate on the
    # front corner (the mast itself is drawn by React).
    for fx in (x - 1.8, x + 1.8):
        parts.append(box("fanBox", (0.9, 0.3, 0.9), (fx, top + 0.57, 0), M["steel"], bev=0.04))
        parts.append(cyl("fan", 0.34, 0.04, (fx, top + 0.73, 0), M["flue"], axis="y", verts=10))
    parts.append(box("beaconBase", (0.4, 0.04, 0.4), (BEACON[0], BEACON[1] - 0.01, BEACON[2]), M["steelDark"], bev=0.0))
    return parts


# ---------------------------------------------------------------- cooling towers

SHELL = [
    (1.82, 1.2),
    (1.56, 2.4),
    (1.33, 3.8),
    (1.17, 5.2),
    (1.16, 6.3),
    (1.26, 7.5),
    (1.37, 8.6),
]


def cooling_tower(M, tx, tz):
    y0 = DECK
    c = (tx, y0, tz)
    # The pond: a concrete kerb with dark water inside it.
    parts = [lathe("pond", [(2.15, 0.0), (2.15, 0.45), (1.95, 0.45), (1.95, 0.1)], 16, c, M["deck"])]
    parts.append(lathe("water", [(1.97, 0.3)], 16, c, M["water"], cap_top=True))
    # The shell stands on a ring of raking legs: the open skirt is what makes
    # it read as a cooling tower rather than as a vase.
    n = 10
    for i in range(n):
        b = 2 * math.pi * (i + 0.5) / n
        foot = (tx + math.cos(b) * 2.05, y0 + 0.45, tz + math.sin(b) * 2.05)
        for top_a in (2 * math.pi * i / n, 2 * math.pi * (i + 1) / n):
            head = (tx + math.cos(top_a) * 1.76, y0 + 1.12, tz + math.sin(top_a) * 1.76)
            parts.append(lkit.rod("leg", foot, head, 0.075, M["deck"], sides=3))
    # The ring beam the shell stands on, closed underneath so the skirt never
    # shows the sky through the shell.
    parts.append(cyl("ringBeam", 1.9, 0.19, (tx, y0 + 1.145, tz), M["deck"], axis="y", verts=16))
    # The shell, weathered darker towards the lip; dark inside, down to a
    # floor deep enough that the top reads as a hole.
    parts.append(lathe("shell", SHELL, 16, c, [M["deck"], M["stain"]], mats=[0, 0, 0, 0, 1, 1]))
    inner = [(r - 0.13, y) for r, y in reversed(SHELL) if y >= 6.0]
    parts.append(lathe("inner", inner, 16, c, M["inside"]))
    parts.append(lathe("innerFloor", [(inner[-1][0] + 0.02, inner[-1][1])], 16, c, M["inside"], cap_top=True))
    # The lip.
    r, y = SHELL[-1]
    parts.append(lathe("lip", [(r + 0.07, y - 0.02), (r + 0.07, y + 0.14), (r - 0.16, y + 0.14), (r - 0.16, y + 0.0)], 16, c, M["steel"]))
    return parts


def pump_house(M):
    """A pump house between the towers, piped to each pond."""
    px, pz = 3.75, -5.0
    parts = [
        box("pump", (1.2, 1.1, 1.0), (px, DECK + 0.55, pz), M["hull"], bev=0.05),
        box("pumpRoof", (1.4, 0.1, 1.2), (px, DECK + 1.15, pz), M["steel"], bev=0.03),
        box("pumpDoor", (0.5, 0.8, 0.04), (px, DECK + 0.4, pz + 0.51), M["steelDark"], bev=0.0),
    ]
    for s, (tx, tz) in zip((-1, 1), TOWERS):
        start = (px + s * 0.6, DECK + 0.35, pz + 0.1)
        dx, dz = start[0] - tx, start[2] - tz
        d = math.hypot(dx, dz)
        end = (tx + dx / d * 2.15, DECK + 0.35, tz + dz / d * 2.15)
        parts.append(strut("pumpPipe", start, end, (0.18, 0.18), M["steel"]))
    return parts


# ---------------------------------------------------------------- chimney


def chimney(M, cold):
    cx, cz = CHIMNEY
    shaft_m = M["cold"] if cold else M["hull"]
    band_m = M["coldDark"] if cold else M["hazard"]
    c = (cx, DECK, cz)
    parts = [box("stackBase", (2.2, 0.6, 2.2), (cx, DECK + 0.3, cz), M["deck"], bev=0.06)]
    parts.append(cyl("stack", 1.0, 10.5, (cx, DECK + 0.6 + 5.25, cz), shaft_m, axis="y", verts=16, radius2=0.745))
    # Two hazard bands, each a slightly proud collar.
    for y, r in ((8.6, 0.84), (9.8, 0.8)):
        parts.append(lathe("band", [(r - 0.02, y - 0.28), (r + 0.04, y - 0.28), (r + 0.02, y + 0.28), (r - 0.04, y + 0.28)], 16, c, band_m))
    # The gallery between the bands, on posts, with its rail.
    parts.append(cyl("gallery", 1.12, 0.08, (cx, DECK + 9.15, cz), M["steel"], axis="y", verts=16))
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        p = (cx + math.cos(a) * 1.08, DECK + 9.19, cz + math.sin(a) * 1.08)
        parts.append(lkit.rod("galleryPost", p, (p[0], p[1] + 0.38, p[2]), 0.025, M["steel"], sides=3))
    parts.append(lkit.ring("galleryRail", 1.05, 1.1, 9.55, 9.6, 16, c, M["steel"]))
    # The cap: a steel ring over a dark flue.
    parts.append(lkit.ring("cap", 0.6, 0.82, 11.08, 11.38, 16, c, M["steel"]))
    parts.append(cyl("flue", 0.62, 0.04, (cx, DECK + 11.12, cz), M["flue"], axis="y", verts=16))
    # The ladder up the front, following the taper.
    for sx in (-0.22, 0.22):
        parts.append(lkit.rod("ladRail", (cx + sx, DECK + 0.6, cz + 1.06), (cx + sx, DECK + 10.9, cz + 0.8), 0.03, M["steel"], sides=4))

    def zf(y):
        return cz + 1.06 - (y - DECK - 0.6) / 10.3 * 0.26

    for i in range(11):
        y = DECK + 1.0 + i * 0.95
        parts.append(box("rung", (0.44, 0.04, 0.04), (cx, y, zf(y)), M["steel"], bev=0.0))
    return parts


def flue_duct(M):
    """The duct from the hall to the foot of the chimney."""
    cx, cz = CHIMNEY
    x0 = HALL_X + HALL_W / 2
    return [
        box("duct", (cx - 0.9 - x0, 0.8, 0.9), ((x0 + cx - 0.9) / 2, DECK + 1.6, cz), M["steel"], bev=0.04),
        box("ductFlange", (0.14, 1.0, 1.1), (x0 + 0.07, DECK + 1.6, cz), M["steelDark"], bev=0.02),
        box("ductLeg", (0.16, 1.2, 0.16), ((x0 + cx - 0.9) / 2, DECK + 0.6, cz), M["steel"], bev=0.0),
    ]


# ---------------------------------------------------------------- switchyard


def transformer(M, cx, cz=3.0, gantry_x=(1.4, 7.8)):
    parts = [box("tPad", (2.6, 0.12, 2.3), (cx, DECK + 0.22, cz), M["deck"], bev=0.03)]
    parts.append(box("tank", (2.2, 1.6, 1.6), (cx, DECK + 0.28 + 0.8, cz), M["steel"], bev=0.06))
    parts.append(box("tankLid", (2.3, 0.1, 1.7), (cx, DECK + 1.93, cz), M["steelDark"], bev=0.02))
    # Radiator banks, both long faces: fins stood off the tank.
    for side in (-1, 1):
        for k in range(5):
            parts.append(box("fin", (0.045, 1.2, 0.26), (cx - 0.76 + k * 0.38, DECK + 1.05, cz + side * 0.95), M["steel"], bev=0.0))
        parts.append(box("header", (1.8, 0.08, 0.08), (cx, DECK + 1.68, cz + side * 0.95), M["steelDark"], bev=0.0))
    # Conservator on its brackets.
    parts.append(cyl("conservator", 0.24, 1.2, (cx - 0.3, DECK + 2.35, cz - 0.5), M["steel"], axis="x", verts=10))
    for bx in (-0.7, 0.1):
        parts.append(box("conBracket", (0.08, 0.36, 0.08), (cx + bx, DECK + 2.12, cz - 0.5), M["steelDark"], bev=0.0))
    # Porcelain bushings with their sheds, and the jumpers up to the gantry.
    for dx in (-0.7, 0.0, 0.7):
        bx = cx + dx
        parts.append(cyl("bushing", 0.1, 0.9, (bx, DECK + 2.4, cz + 0.2), M["porcelain"], axis="y", verts=6, radius2=0.07))
        for k, y in enumerate((2.15, 2.5)):
            parts.append(cyl("shed", 0.21 - k * 0.04, 0.07, (bx, DECK + y, cz + 0.2), M["porcelain"], axis="y", verts=6))
        parts.append(cyl("terminal", 0.08, 0.12, (bx, DECK + 2.9, cz + 0.2), M["steelDark"], axis="y", verts=4))
        t = (bx - gantry_x[0]) / (gantry_x[1] - gantry_x[0])
        pz = cz - 1.4 if dx < 0 else cz + 1.4
        parts += lkit.cable("jumper", (bx, DECK + 2.95, cz + 0.2), (bx, DECK + 3.72 - 0.3 * 4 * t * (1 - t), pz), 0.03, 0.12, M["steelDark"], segments=2)
    # A danger sign on the front.
    parts.append(box("sign", (0.45, 0.32, 0.03), (cx, DECK + 1.15, cz + 0.815), M["hazard"], bev=0.0))
    parts.append(box("signBolt", (0.08, 0.16, 0.02), (cx, DECK + 1.15, cz + 0.83), M["deck"], bev=0.0, rot=(0, 0, 0.5)))
    return parts


def gantry(M, x0=1.4, x1=7.8, cz=3.0):
    parts = []
    for px in (x0, x1):
        for pz in (cz - 1.4, cz + 1.4):
            parts.append(box("post", (0.18, 4.2, 0.18), (px, DECK + 2.1, pz), M["steel"], bev=0.0))
            # A lattice look on the posts: two cross braces a side.
        parts.append(box("beamZ", (0.18, 0.16, 3.0), (px, DECK + 4.1, cz), M["steel"], bev=0.02))
        for k in range(3):
            y = DECK + 0.8 + k * 1.2
            parts.append(lkit.rod("brace", (px, y, cz - 1.4), (px, y + 1.2, cz + 1.4), 0.035, M["steel"], sides=3))
    for pz in (cz - 1.4, cz + 1.4):
        parts.append(box("beamX", (x1 - x0 + 0.2, 0.16, 0.18), ((x0 + x1) / 2, DECK + 4.1, pz), M["steel"], bev=0.02))
        # Suspension insulators and the busbar they carry.
        parts += lkit.cable("bus", (x0, DECK + 3.72, pz), (x1, DECK + 3.72, pz), 0.04, 0.3, M["steelDark"])
    return parts


def fence(M, yard=None, gate=(4.1, 5.3)):
    x0, x1, z0, z1 = (yard or YARD)["x0"], (yard or YARD)["x1"], (yard or YARD)["z0"], (yard or YARD)["z1"]
    h = 1.7
    parts = []

    def run(a, b, fixed, along_x):
        length = abs(b - a)
        n = max(1, round(length / 1.2))
        for i in range(n + 1):
            t = a + (b - a) * i / n
            p = (t, DECK + h / 2, fixed) if along_x else (fixed, DECK + h / 2, t)
            parts.append(lkit.rod("fencePost", (p[0], DECK, p[2]), (p[0], DECK + h, p[2]), 0.045, M["steel"], sides=4))
        for y in (0.15, 0.85, 1.6):
            c = (a + b) / 2
            size = (length, 0.04, 0.04) if along_x else (0.04, 0.04, length)
            p = (c, DECK + y, fixed) if along_x else (fixed, DECK + y, c)
            parts.append(box("fenceRail", size, p, M["steel"], bev=0.0))

    run(x0, x1, z0, True)
    run(x0, gate[0], z1, True)
    run(gate[1], x1, z1, True)
    run(z0, z1, x0, False)
    run(z0, z1, x1, False)
    # The gate posts, striped, and the gate itself, half open.
    for gx in gate:
        parts.append(box("gatePost", (0.16, 1.9, 0.16), (gx, DECK + 0.95, z1), M["hazard"], bev=0.02))
        for k in range(3):
            parts.append(box("gateStripe", (0.17, 0.14, 0.17), (gx, DECK + 0.4 + k * 0.55, z1), M["deck"], bev=0.0))
    parts.append(box("gate", (0.7, 1.4, 0.04), (gate[0] + 0.35, DECK + 0.8, z1 - 0.12), M["steel"], bev=0.0))
    return parts


def switchyard(M):
    parts = [box("yard", (7.4, 0.16, 4.0), (4.6, DECK + 0.08, 3.0), M["gravel"], bev=0.03)]
    for cx in (2.9, 6.3):
        parts += transformer(M, cx)
    parts += gantry(M)
    parts += fence(M)
    return parts


def second_bay(M):
    """The bare yard's second transformer bay, on the hall's ground."""
    cz = YARD2_CZ
    x0, x1 = GANTRY2
    parts = [box("yard", (7.4, 0.16, 4.0), ((YARD2["x0"] + YARD2["x1"]) / 2 - 0.0, DECK + 0.08, cz), M["gravel"], bev=0.03)]
    for cx in (x0 + 1.5, x0 + 4.9):
        parts += transformer(M, cx, cz, GANTRY2)
    parts += gantry(M, x0, x1, cz)
    parts += fence(M, YARD2, GATE2)
    return parts


def kiosk(M):
    """A control kiosk: a steel cabin with a door, a louvred vent and a
    blind window, a plant unit on its flat roof, a conduit down its wall."""
    kx, kz = KIOSK
    w, h, d = 2.6, 2.5, 2.2
    y = DECK
    body = box("kioskBody", (w, h, d), (kx, y + h / 2 + 0.12, kz), M["steel"], bev=0.04, cell=1.3)
    front = kz + d / 2
    cut_many(body, [
        box("kioskDoorCut", (0.95, 2.0, 0.3), (kx - 0.6, y + 0.12 + 1.0, front), M["inside"], bev=0.0),
        box("kioskWinCut", (0.8, 0.7, 0.3), (kx + 0.7, y + 1.65, front), M["inside"], bev=0.0),
    ])
    parts = [
        box("kioskPlinth", (w + 0.2, 0.12, d + 0.2), (kx, y + 0.06, kz), M["curb"], bev=0.03),
        body,
        box("kioskDoor", (0.95, 2.0, 0.05), (kx - 0.6, y + 0.12 + 1.0, front - 0.1), M["hazardDeep"], bev=0.0),
        box("kioskHandle", (0.05, 0.16, 0.05), (kx - 0.26, y + 1.1, front - 0.05), M["steelDark"], bev=0.0),
        box("kioskGlass", (0.8, 0.7, 0.04), (kx + 0.7, y + 1.65, front - 0.1), M["steelDark"], bev=0.0),
        box("kioskSill", (0.96, 0.06, 0.12), (kx + 0.7, y + 1.27, front + 0.02), M["steel"], bev=0.0),
        box("kioskRoof", (w + 0.3, 0.14, d + 0.3), (kx, y + h + 0.19, kz), M["steelDark"], bev=0.03),
        box("kioskUnit", (0.9, 0.45, 0.7), (kx + 0.5, y + h + 0.5, kz - 0.2), M["steel"], bev=0.04),
        cyl("kioskFan", 0.24, 0.04, (kx + 0.5, y + h + 0.75, kz - 0.2), M["steelDark"], axis="y", verts=10),
        box("kioskStep", (1.2, 0.1, 0.45), (kx - 0.6, y + 0.05, front + 0.35), M["curb"], bev=0.02),
        box("kioskSign", (0.36, 0.26, 0.03), (kx + 0.7, y + 2.15, front + 0.02), M["hazard"], bev=0.0),
        lkit.rod("kioskConduit", (kx + 1.1, y + 0.2, kz - d / 2 - 0.05), (kx + 1.1, y + h, kz - d / 2 - 0.05), 0.04, M["steelDark"], sides=5),
    ]
    for k in range(4):
        parts.append(box("kioskVent", (0.04, 0.05, 0.6), (kx - w / 2 - 0.02, y + 1.6 + k * 0.1, kz), M["steelDark"], bev=0.0))
    return parts


def trenches(M):
    """Cable trench covers: plates in a run, from the kiosk to each bay."""
    kx, kz = KIOSK
    parts = []
    # South from the kiosk into the first bay's fence, west to the second bay's.
    n = 5
    for i in range(n):
        z = kz + 1.35 + (1.1 - (kz + 1.35)) * (i + 0.5) / n
        parts.append(box("trench", (0.7, 0.04, (1.1 - (kz + 1.35)) / n - 0.05), (kx + 0.4, DECK + 0.02, z), M["steelDark"], bev=0.0))
        parts.append(box("trenchLug", (0.1, 0.03, 0.04), (kx + 0.4, DECK + 0.055, z), M["steel"], bev=0.0))
    x_a, x_b = kx - 1.5, YARD2["x1"] + 0.1
    m = 6
    for i in range(m):
        x = x_a + (x_b - x_a) * (i + 0.5) / m
        parts.append(box("trench", ((x_a - x_b) / m - 0.05, 0.04, 0.7), (x, DECK + 0.02, -1.9), M["steelDark"], bev=0.0))
        parts.append(box("trenchLug", (0.04, 0.03, 0.1), (x, DECK + 0.055, -1.9), M["steel"], bev=0.0))
    return parts


def line_poles(M):
    """A pole line along the back of the plot, three wires a span, with a drop
    to each bay's gantry."""
    parts = []
    for px, pz in POLES:
        parts.append(cyl("linePole", 0.11, POLE_H, (px, DECK + POLE_H / 2, pz), M["steel"], axis="y", verts=6, radius2=0.08))
        parts.append(box("lineArm", (1.5, 0.1, 0.1), (px, DECK + POLE_H - 0.35, pz), M["steel"], bev=0.0))
        parts.append(lkit.rod("lineStay", (px - 0.6, DECK + POLE_H - 0.35, pz), (px, DECK + POLE_H - 0.9, pz), 0.03, M["steel"], sides=3))
        parts.append(lkit.rod("lineStay", (px + 0.6, DECK + POLE_H - 0.35, pz), (px, DECK + POLE_H - 0.9, pz), 0.03, M["steel"], sides=3))
        for dx in (-0.65, 0.0, 0.65):
            parts.append(cyl("lineIns", 0.07, 0.3, (px + dx, DECK + POLE_H - 0.18, pz), M["porcelain"], axis="y", verts=5, radius2=0.05))
        parts.append(box("polePlate", (0.24, 0.16, 0.02), (px, DECK + 1.7, pz + 0.1), M["hazard"], bev=0.0))
    for (ax, az), (bx, bz) in zip(POLES, POLES[1:]):
        for dx in (-0.65, 0.0, 0.65):
            parts += lkit.cable("line", (ax + dx, DECK + POLE_H + 0.05, az), (bx + dx, DECK + POLE_H + 0.05, bz), 0.04, 0.4, M["steelDark"])
    # Drops from the line to the gantries.
    parts += lkit.cable("line", (POLES[1][0], DECK + POLE_H + 0.05, POLES[1][1]), (sum(GANTRY2) / 2, DECK + 4.1, YARD2_CZ - 1.4), 0.04, 0.25, M["steelDark"])
    parts += lkit.cable("line", (POLES[3][0], DECK + POLE_H + 0.05, POLES[3][1]), (4.6, DECK + 4.1, 1.6), 0.04, 0.25, M["steelDark"])
    return parts


def bare_extras(M):
    return second_bay(M) + kiosk(M) + trenches(M) + line_poles(M)


def board(M):
    bx, bz = BOARD
    parts = [
        box("boardFoot", (0.5, 0.16, 0.5), (bx, DECK + 0.08, bz), M["deck"], bev=0.03),
        box("boardPost", (0.16, 2.1, 0.16), (bx, DECK + 1.05, bz), M["steel"], bev=0.02),
    ]
    frame = box("boardFrame", (1.7, 1.1, 0.14), (bx, DECK + 2.1, bz), M["hazard"], bev=0.04)
    cut_many(frame, [box("boardCut", (1.44, 0.84, 0.2), (bx, DECK + 2.1, bz + 0.1), M["hazardDeep"], bev=0.0)])
    parts.append(frame)
    parts.append(box("boardFace", (1.44, 0.84, 0.04), (bx, DECK + 2.1, bz + 0.02), M["deck"], bev=0.0))
    for i in range(3):
        w = 0.76 - i * 0.14
        parts.append(box("boardLine", (w, 0.05, 0.02), (bx - 0.1 - (0.76 - w) / 2, DECK + 2.23 - i * 0.18, bz + 0.05), M["steelDark"], bev=0.0))
    # The hood over the status lamp; the lamp itself is drawn by React.
    parts.append(box("hood", (0.62, 0.06, 0.28), (bx, DECK + 2.35, bz + 0.2), M["steel"], bev=0.0))
    return parts


# ---------------------------------------------------------------- pylons


def pylon(M, x, z):
    parts = []
    h = PYLON_H
    foot, head = 0.44, 0.16

    def corner(sx, sz, t):
        r = foot + (head - foot) * t
        return (x + sx * r, DECK + h * t, z + sz * r)

    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(lkit.rod("leg", corner(sx, sz, 0), corner(sx, sz, 1), 0.065, M["steel"], sides=4))
            parts.append(box("footing", (0.3, 0.2, 0.3), (x + sx * foot, DECK + 0.1, z + sz * foot), M["deck"], bev=0.0))
    levels = (0.0, 0.32, 0.6, 0.82)
    for a_, b_ in zip(levels, levels[1:]):
        for (s1, s2) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            p0, p1 = corner(*s1, a_), corner(*s2, a_)
            q0, q1 = corner(*s1, b_), corner(*s2, b_)
            parts += [lkit.rod("brace", p0, q1, 0.028, M["steel"], sides=3), lkit.rod("brace", p1, q0, 0.028, M["steel"], sides=3)]
        for (s1, s2) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            parts.append(lkit.rod("tie", corner(*s1, b_), corner(*s2, b_), 0.03, M["steel"], sides=3))
    # Crossarms along z, tapering, with insulator strings.
    for t, reach in ((0.82, ARM_REACH), (1.0, 0.55)):
        y = DECK + h * t
        for s in (-1, 1):
            parts.append(strut("arm", (x, y, z), (x, y, z + s * (reach + 0.06)), (0.12, 0.12), M["steel"]))
            parts.append(lkit.rod("armStay", (x, y + 0.45, z), (x, y, z + s * (reach + 0.06)), 0.03, M["steel"], sides=3))
            parts.append(cyl("insulator", 0.09, 0.4, (x, y - 0.22, z + s * reach), M["porcelain"], axis="y", verts=5, radius2=0.06))
    parts.append(cyl("peak", 0.05, 0.6, (x, DECK + h + 0.25, z), M["steel"], axis="y", verts=5, radius2=0.02))
    # A danger plate on the leg facing the city.
    parts.append(box("plate", (0.28, 0.2, 0.02), (x, DECK + 1.6, z + 0.39), M["hazard"], bev=0.0))
    return parts


def lines(M):
    parts = []
    (ax, az), (bx, bz) = PYLONS
    arm_y = DECK + PYLON_H * 0.82 - 0.42
    top_y = DECK + PYLON_H - 0.42
    for dz in (-ARM_REACH, ARM_REACH):
        parts += lkit.cable("line", (ax, arm_y, az + dz), (bx, arm_y, bz + dz), 0.05, 0.55, M["steelDark"])
    for dz in (-0.55, 0.55):
        parts += lkit.cable("line", (ax, top_y, az + dz), (bx, top_y, bz + dz), 0.045, 0.45, M["steelDark"])
    parts += lkit.cable("line", (ax, arm_y, az - ARM_REACH), (HALL_X + 1.6, DECK + HALL_H + 1.2, 3.4), 0.045, 0.3, M["steelDark"])
    parts += lkit.cable("line", (bx, arm_y, bz - ARM_REACH), (1.4, DECK + 4.1, 4.4), 0.045, 0.3, M["steelDark"])
    parts += lkit.cable("line", (bx, top_y, bz + 0.55), (8.2, DECK + 4.4, 5.4), 0.045, 0.45, M["steelDark"])
    # Where the line lands on the hall roof: a small terminal frame.
    parts.append(box("entry", (0.5, 0.5, 0.24), (HALL_X + 1.6, DECK + HALL_H + 0.67, 3.4), M["steel"], bev=0.02))
    parts.append(cyl("entryIns", 0.07, 0.3, (HALL_X + 1.6, DECK + HALL_H + 1.07, 3.4), M["porcelain"], axis="y", verts=6))
    # The line off the plot lands on a pole at the corner.
    parts.append(cyl("pole", 0.1, 4.4, (8.2, DECK + 2.2, 5.4), M["steel"], axis="y", verts=6, radius2=0.07))
    parts.append(box("poleArm", (0.08, 0.08, 0.6), (8.2, DECK + 4.35, 5.4), M["steel"], bev=0.0))
    return parts


# ---------------------------------------------------------------- build


def plant(M):
    return ground(M) + hall(M) + pump_house(M) + flue_duct(M) + sum(
        (cooling_tower(M, tx, tz) for tx, tz in TOWERS), []
    ) + sum((pylon(M, px, pz) for px, pz in PYLONS), []) + lines(M) + switchyard(M) + board(M)


def bare(M):
    return ground(M) + switchyard(M) + board(M) + bare_extras(M)


def build():
    kit.reset()
    M = palette()
    power = finish(plant(M), "Power")
    stack = finish(chimney(M, cold=False), "Stack")
    cold = finish(chimney(M, cold=True), "StackCold")
    bare_obj = finish(bare(M), "Bare")
    made = [power, stack, cold, bare_obj]
    # Each node is baked with only what stands beside it in the city: the
    # plant with its lit chimney, each chimney with the plant, and the bare
    # yard alone.
    lkit.bake(power, [stack], made, distance=1.2)
    lkit.bake(stack, [power], made, distance=1.2)
    lkit.bake(cold, [power], made, distance=1.2)
    lkit.bake(bare_obj, [], made, distance=1.2)
    return made


VARIANTS = {1: ("Power", "Stack"), 2: ("Power", "StackCold"), 3: ("Bare",)}


def preview(variant):
    """1 = running, 2 = failing (cold stack), 3 = no CI (the substation)."""
    return lkit.keep_only(build(), VARIANTS[variant])
