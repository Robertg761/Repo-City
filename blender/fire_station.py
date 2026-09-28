"""
The fire station, modelled by script (spike: Blender assets vs procedural).

Same natural size (18 x 9 x 15), deck height, hall, bays, tower, flag and
apron as `components/city/models/landmarks/fire.ts`, bay doors on +z facing
the city centre, and the same three levels:

  level 1  one bay, a drying mast, a flag
  level 2  two bays, a hose tower, one engine on the apron
  level 3  three bays, a hose tower, two engines, a training yard

Materials are the landmark's colour SLOTS (`<slot>.<surface>[.tNN]`), so the
city still paints the station through its palette and drains it when the repo
is archived; a `tNN` suffix is a darker shade of the slot baked into the
vertex colour. Out come:

  Station1..3             the station at each level, without its engines
  Station<L>.engine.<i>   empties where the engines park (nose to +z)
  Engine                  the fire engine, ladder stowed, at station scale
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import fire_truck  # noqa: E402
import kit  # noqa: E402
from kit import box, cut_many, cyl, finish, marker  # noqa: E402

DECK = 0.45
BAY = 3.5
HALL_Z0, HALL_Z1 = -4.2, 2.6
HALL_H = 4.6
# The engines park half out of open bays, nose to the city: at true scale
# against a 3 m door they were lost from the overview camera.
ENGINE_Z = 4.4
ENGINE_SCALE = 1.15
DOOR_H = 3.35


def bays(level):
    return min(3, max(1, level))


def hall_width(level):
    return bays(level) * BAY + 1.0


def hall_centre(level):
    return -1.6 if level >= 2 else -1.0


def tower_x(level):
    return hall_centre(level) + hall_width(level) / 2 + 1.5


def bay_centres(level):
    n = bays(level)
    return [hall_centre(level) + (i - (n - 1) / 2) * BAY for i in range(n)]


# The slot colours `Landmark.tsx` paints (skin.tint of these), so the preview
# matches the city. Only the slot name and the tone travel to the app.
SLOT_HEX = {
    "deck": "#a8a9a0",
    "wall": "#f4f3ec",
    "red": "#d44f3e",
    "trim": "#faf9f6",
    "steel": "#414950",
    "metal": "#7d8689",
    "dark": "#2b2f33",
    "green": "#7fa46a",
    "blue": "#3d5068",
    "glass": "#ffdca5",
}

SURFACE = {
    "deck": "concrete", "wall": "brick", "red": "metal", "trim": "concrete", "steel": "metal",
    "metal": "metal", "dark": "metal", "green": "foliage", "blue": "glass", "glass": "glass",
}


def S(slot, tone=1.0, **kw):
    return kit.material(slot, SLOT_HEX[slot], SURFACE[slot], tone=tone, **kw)


def palette():
    return {
        "deck": S("deck"),
        "apron": S("deck", 0.9),
        "joint": S("deck", 0.7),
        "wall": S("wall"),
        "recess": S("wall", 0.82),
        "red": S("red"),
        "redDeep": S("red", 0.8),
        "trim": S("trim"),
        "steel": S("steel"),
        "metal": S("metal"),
        "dark": S("dark"),
        "roof": S("trim"),
        "inside": S("dark", 1.0),
        "green": S("green"),
        "leaf": S("green", 0.8),
        "blue": S("blue"),
        "glass": S("glass", emission=0.4),
    }


def truck_palette():
    """The fire engine's materials, mapped onto the station's slots."""
    return {
        "red": S("red"),
        "white": S("trim"),
        "shutter": S("metal"),
        "steel": S("metal"),
        "chrome": S("metal"),
        "dark": S("dark"),
        "arch": S("dark", 0.8),
        "tyre": S("dark", 0.9),
        "glass": S("blue"),
        "head": S("trim"),
        "tail": S("red", 0.8),
        "amber": S("trim", 0.9),
        "lens": S("red"),
        "yellow": S("trim"),
    }


# ---------------------------------------------------------------- the plot


def plot(M, level):
    parts = [box("deck", (17.6, DECK, 14.6), (0, DECK / 2, 0), M["deck"], bev=0.08, cell=2.0)]
    width, x = hall_width(level), hall_centre(level)
    # The apron the engines stand on, with expansion joints and bay markings.
    apron_w = width + 2.4
    parts.append(box("apron", (apron_w, 0.06, 4.8), (x, DECK + 0.03, 4.9), M["apron"], bev=0.02))
    for i in range(1, 4):
        parts.append(box("joint", (apron_w - 0.1, 0.012, 0.03), (x, DECK + 0.062, 2.5 + i * 1.2), M["joint"], bev=0.0))
    for bx in bay_centres(level):
        for side in (-1.5, 1.5):
            for i in range(4):
                parts.append(box("mark", (0.14, 0.012, 0.7), (bx + side, DECK + 0.066, HALL_Z1 + 0.9 + i * 1.05), M["trim"], bev=0.0))
    # Shrubs along the back, where they show past the hall from the overview.
    for sx, sz in ((-6.5, -6.2), (-3.2, -6.4), (2.6, -6.0), (6.8, -6.3)):
        parts.append(shrub(M, sx, sz))
    # Bollards either side of the apron.
    for bx in (x - apron_w / 2 - 0.35, x + apron_w / 2 + 0.35):
        for bz in (4.2, 6.8):
            parts.append(cyl("bollard", 0.12, 0.8, (bx, DECK + 0.4, bz), M["red"], axis="y", verts=8, bev=0.03))
            parts.append(cyl("bollardCap", 0.13, 0.08, (bx, DECK + 0.78, bz), M["trim"], axis="y", verts=8))
    # A hydrant by the apron.
    hx = x - apron_w / 2 - 0.35
    parts.append(cyl("hydrant", 0.16, 0.6, (hx, DECK + 0.3, 5.5), M["red"], axis="y", verts=8, bev=0.03))
    parts.append(cyl("hydrantTop", 0.19, 0.08, (hx, DECK + 0.62, 5.5), M["red"], axis="y", verts=8))
    parts.append(cyl("hydrantNozzle", 0.06, 0.44, (hx, DECK + 0.4, 5.5), M["metal"], axis="x", verts=6))
    return parts


def shrub(M, x, z, r=0.55):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=kit.B((x, DECK + 0.1 + r * 0.7, z)))
    obj = bpy.context.active_object
    obj.scale = (1.0, 1.0, 0.75)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(M["leaf"])
    return obj


# ---------------------------------------------------------------- the hall


def hall(M, level):
    width, x = hall_width(level), hall_centre(level)
    depth = HALL_Z1 - HALL_Z0
    mid_z = (HALL_Z0 + HALL_Z1) / 2
    top = DECK + HALL_H
    parts = []

    walls = box("hall", (width, HALL_H, depth), (x, DECK + HALL_H / 2, mid_z), M["wall"], bev=0.04, cell=1.5)
    cutters = []
    # The bay openings: deep reveals with the doors set back in them, and the
    # engines' bays open, the dark apparatus floor showing behind the engine.
    for i, bx in enumerate(bay_centres(level)):
        if i in open_bays(level):
            cutters.append(box("bayOpen", (3.0, DOOR_H, 4.0), (bx, DECK + DOOR_H / 2 - 0.01, HALL_Z1 - 1.7), M["inside"], bev=0.0))
        else:
            cutters.append(box("bayCut", (3.0, DOOR_H, 0.6), (bx, DECK + DOOR_H / 2 - 0.01, HALL_Z1), M["recess"], bev=0.0))
        # Upper windows over each bay.
        for dx in (-0.95, 0, 0.95):
            cutters.append(box("upCut", (0.62, 0.52, 0.3), (bx + dx, DECK + 4.0, HALL_Z1), M["recess"], bev=0.0))
    # Side windows, tall, three a side.
    for side in (-1, 1):
        for wz in (-3.0, -0.8, 1.4):
            cutters.append(box("sideCut", (0.3, 1.4, 1.1), (x + side * width / 2, DECK + 3.0, wz), M["recess"], bev=0.0))
    # The crew door on the flag side, and small windows on the back.
    cutters.append(box("doorCut", (0.3, 2.2, 1.0), (x - width / 2, DECK + 1.1, -2.6), M["recess"], bev=0.0))
    for rx in [x + (i - (bays(level) - 1) / 2) * BAY for i in range(bays(level))]:
        cutters.append(box("rearCut", (1.2, 0.8, 0.3), (rx, DECK + 3.2, HALL_Z0), M["recess"], bev=0.0))
    cut_many(walls, cutters)
    parts.append(walls)

    # A plinth course round the foot, pilasters between the bays and at the
    # corners of the front, and a lintel over the doors.
    parts.append(box("plinth", (width + 0.14, 0.45, depth + 0.14), (x, DECK + 0.225, mid_z), M["trim"], bev=0.04))
    edges = [bx - BAY / 2 for bx in bay_centres(level)] + [bay_centres(level)[-1] + BAY / 2]
    edges[0] = x - width / 2 + 0.15
    edges[-1] = x + width / 2 - 0.15
    for ex in edges:
        parts.append(box("pilaster", (0.34, HALL_H - 0.5, 0.16), (ex, DECK + (HALL_H - 0.5) / 2, HALL_Z1 + 0.07), M["trim"], bev=0.03))
        parts.append(box("pilasterBase", (0.44, 0.5, 0.22), (ex, DECK + 0.25, HALL_Z1 + 0.09), M["trim"], bev=0.03))
    parts.append(box("lintel", (width + 0.1, 0.26, 0.2), (x, DECK + DOOR_H + 0.13, HALL_Z1 + 0.08), M["trim"], bev=0.03))

    # Sectional doors: four panels, the third glazed, set back in the reveal.
    door_z = HALL_Z1 - 0.26
    for b, bx in enumerate(bay_centres(level)):
        ph = DOOR_H / 4
        if b in open_bays(level):
            # Rolled up: only the drum housing shows under the lintel.
            parts.append(box("drum", (2.98, 0.34, 0.34), (bx, DECK + DOOR_H - 0.18, door_z), M["red"], bev=0.04))
        else:
            for i in range(4):
                parts.append(box("panel", (2.98, ph, 0.08), (bx, DECK + ph * (i + 0.5), door_z), M["red"], bev=0.025))
            for dx in (-0.99, -0.33, 0.33, 0.99):
                parts.append(box("doorGlass", (0.5, 0.36, 0.06), (bx + dx, DECK + ph * 2.5, door_z + 0.03), M["glass"], bev=0.0))
            parts.append(box("doorBar", (0.5, 0.05, 0.06), (bx, DECK + 0.35, door_z + 0.05), M["metal"], bev=0.0))
        # A wall lamp over each bay.
        parts.append(box("lamp", (0.3, 0.12, 0.22), (bx, DECK + DOOR_H + 0.38, HALL_Z1 + 0.22), M["steel"], bev=0.02))
        # Upper windows: glass set back, a sill under each.
        for dx in (-0.95, 0, 0.95):
            parts.append(box("upGlass", (0.62, 0.52, 0.04), (bx + dx, DECK + 4.0, HALL_Z1 - 0.1), M["glass"], bev=0.0))
            parts.append(box("upSill", (0.74, 0.06, 0.12), (bx + dx, DECK + 3.71, HALL_Z1 + 0.04), M["trim"], bev=0.0))

    # Side windows: glass, sills, lintels, a mullion.
    for side in (-1, 1):
        fx = x + side * width / 2
        for wz in (-3.0, -0.8, 1.4):
            parts.append(box("sideGlass", (0.04, 1.4, 1.1), (fx - side * 0.1, DECK + 3.0, wz), M["glass"], bev=0.0))
            parts.append(box("sideMull", (0.06, 1.4, 0.06), (fx - side * 0.08, DECK + 3.0, wz), M["trim"], bev=0.0))
            parts.append(box("sideSill", (0.12, 0.07, 1.26), (fx + side * 0.04, DECK + 2.27, wz), M["trim"], bev=0.0))
            parts.append(box("sideLintel", (0.1, 0.14, 1.26), (fx + side * 0.03, DECK + 3.77, wz), M["trim"], bev=0.0))
        # Downpipes at the back corners.
        parts.append(box("downpipe", (0.1, HALL_H - 0.2, 0.1), (fx + side * 0.09, DECK + (HALL_H - 0.2) / 2, HALL_Z0 + 0.25), M["metal"], bev=0.0))
    # Crew door, with a red canopy.
    dx0 = x - width / 2
    parts.append(box("crewDoor", (0.05, 2.2, 1.0), (dx0 + 0.1, DECK + 1.1, -2.6), M["redDeep"], bev=0.0))
    parts.append(box("canopy", (0.8, 0.1, 1.5), (dx0 - 0.35, DECK + 2.55, -2.6), M["red"], bev=0.03))
    parts.append(box("step", (0.5, 0.12, 1.3), (dx0 - 0.25, DECK + 0.06, -2.6), M["trim"], bev=0.02))
    for rx in [x + (i - (bays(level) - 1) / 2) * BAY for i in range(bays(level))]:
        parts.append(box("rearGlass", (1.2, 0.8, 0.04), (rx, DECK + 3.2, HALL_Z0 + 0.1), M["glass"], bev=0.0))
        parts.append(box("rearSill", (1.32, 0.06, 0.12), (rx, DECK + 2.77, HALL_Z0 - 0.04), M["trim"], bev=0.0))

    # The top: the red band, a stepped cornice, a parapet with coping and a
    # raised centre over the front with the service badge on it.
    parts.append(box("band", (width + 0.24, 0.32, depth + 0.24), (x, top - 0.52, mid_z), M["red"], bev=0.03))
    parts.append(box("cornice", (width + 0.4, 0.2, depth + 0.4), (x, top - 0.26, mid_z), M["trim"], bev=0.04))
    for s_ in (-1, 1):
        parts.append(box("parapetZ", (width + 0.2, 0.5, 0.2), (x, top + 0.09, mid_z + s_ * (depth / 2 + 0.0)), M["wall"], bev=0.02))
        parts.append(box("parapetX", (0.2, 0.5, depth + 0.2), (x + s_ * width / 2, top + 0.09, mid_z), M["wall"], bev=0.02))
        parts.append(box("copingZ", (width + 0.36, 0.1, 0.34), (x, top + 0.39, mid_z + s_ * depth / 2), M["trim"], bev=0.02))
        parts.append(box("copingX", (0.34, 0.1, depth + 0.36), (x + s_ * width / 2, top + 0.39, mid_z), M["trim"], bev=0.02))
    # The pediment and badge over the middle of the front.
    parts.append(box("pediment", (2.4, 0.9, 0.24), (x, top + 0.55, HALL_Z1), M["wall"], bev=0.03))
    parts.append(box("pedCap", (2.6, 0.12, 0.38), (x, top + 1.05, HALL_Z1), M["trim"], bev=0.03))
    parts.append(cyl("badge", 0.34, 0.08, (x, top + 0.55, HALL_Z1 + 0.15), M["trim"], axis="z", verts=16))
    parts.append(cyl("badgeIn", 0.26, 0.1, (x, top + 0.55, HALL_Z1 + 0.16), M["red"], axis="z", verts=16))
    parts.append(box("crossA", (0.34, 0.08, 0.04), (x, top + 0.55, HALL_Z1 + 0.22), M["trim"], bev=0.0))
    parts.append(box("crossB", (0.08, 0.34, 0.04), (x, top + 0.55, HALL_Z1 + 0.22), M["trim"], bev=0.0))

    # The roof: membrane, units with fans, a skylight row and solar panels.
    parts.append(box("roof", (width - 0.2, 0.08, depth - 0.2), (x, top - 0.02, mid_z), M["roof"], bev=0.0, cell=1.8))
    for i in range(2):
        ux = x - 1.4 + i * 2.8
        parts.append(box("unit", (1.1, 0.5, 0.9), (ux, top + 0.27, mid_z - 1.6), M["metal"], bev=0.05))
        parts.append(cyl("fan", 0.3, 0.04, (ux, top + 0.53, mid_z - 1.6), M["dark"], axis="y", verts=12))
    sy = top + 0.35
    for dx in ([-2.3, 0, 2.3] if level >= 2 else [-0.95, 0.95]):
        px = x + dx
        parts.append(box("solarFrame", (1.7, 0.08, 1.3), (px, sy, mid_z + 1.45), M["steel"], bev=0.0, rot=(0.22, 0, 0)))
        parts.append(box("solar", (1.6, 0.04, 1.2), (px, sy + 0.05, mid_z + 1.45), M["blue"], bev=0.01, rot=(0.22, 0, 0)))
        parts.append(box("solarLeg", (1.5, 0.3, 0.08), (px, top + 0.12, mid_z + 1.95), M["steel"], bev=0.0))
    return parts


def hose_tower(M, tx):
    height = 7.4
    tz = -1.4
    parts = []
    shaft = box("tower", (2.6, height, 2.6), (tx, DECK + height / 2, tz), M["wall"], bev=0.04, cell=1.3)
    # The open drying loft at the top, through all four faces, and a slit window.
    cut_many(shaft, [
        box("loftX", (3.0, 1.2, 1.5), (tx, DECK + height - 1.25, tz), M["recess"], bev=0.0),
        box("loftZ", (1.5, 1.2, 3.0), (tx, DECK + height - 1.25, tz), M["recess"], bev=0.0),
        box("slit", (0.5, 3.6, 0.3), (tx, DECK + 3.2, tz + 1.3), M["recess"], bev=0.0),
    ])
    parts.append(shaft)
    parts.append(box("slitGlass", (0.5, 3.6, 0.04), (tx, DECK + 3.2, tz + 1.2), M["glass"], bev=0.0))
    # Quoins: alternating trim blocks up the corners.
    for cx in (-1, 1):
        for cz in (-1, 1):
            for i in range(7):
                long_x = i % 2 == 0
                size = (0.5 if long_x else 0.18, 0.4, 0.18 if long_x else 0.5)
                off_x = 0.16 if long_x else 0.0
                off_z = 0.0 if long_x else 0.16
                parts.append(box("quoin", size, (tx + cx * (1.3 - off_x + 0.02), DECK + 0.5 + i * 0.8, tz + cz * (1.3 - off_z + 0.02)), M["trim"], bev=0.02))
    # The red band, cornice and a pyramid roof with a beacon finial.
    parts.append(box("tBand", (2.8, 0.3, 2.8), (tx, DECK + height - 0.45, tz), M["red"], bev=0.03))
    parts.append(box("tCornice", (3.0, 0.2, 3.0), (tx, DECK + height - 0.2, tz), M["trim"], bev=0.04))
    parts.append(cyl("tRoof", 2.05, 1.3, (tx, DECK + height + 0.55, tz), M["red"], axis="y", verts=4, radius2=0.05, rot=(0, math.pi / 4, 0)))
    parts.append(cyl("finial", 0.06, 0.6, (tx, DECK + height + 1.35, tz), M["metal"], axis="y", verts=6))
    # Hoses hanging in the loft.
    for hx in (-0.35, 0.0, 0.35):
        parts.append(box("hose", (0.1, 1.0, 0.1), (tx + hx, DECK + height - 1.4, tz), M["redDeep"], bev=0.0))
    # A caged ladder up the outer face.
    lx = tx + 1.36
    for s_ in (-0.3, 0.3):
        parts.append(box("rail", (0.05, height - 0.4, 0.05), (lx, DECK + (height - 0.4) / 2, tz + s_), M["metal"], bev=0.0))
    for i in range(10):
        parts.append(box("rung", (0.04, 0.04, 0.6), (lx, DECK + 0.5 + i * 0.7, tz), M["metal"], bev=0.0))
    return parts


def drying_mast(M, mx):
    parts = [
        box("mastBase", (0.6, 0.3, 0.6), (mx, DECK + 0.15, -1.0), M["trim"], bev=0.04),
        cyl("mast", 0.1, 5.0, (mx, DECK + 2.8, -1.0), M["metal"], axis="y", verts=8, radius2=0.07),
        box("arm", (1.4, 0.1, 0.1), (mx, DECK + 5.0, -1.0), M["metal"], bev=0.0),
    ]
    for hx in (-0.5, 0.5):
        parts.append(box("hose", (0.09, 2.4, 0.09), (mx + hx, DECK + 3.8, -1.0), M["redDeep"], bev=0.0))
    return parts


def flag(M, fx):
    fz = 2.0
    parts = [
        box("flagBase", (0.6, 0.3, 0.6), (fx, DECK + 0.15, fz), M["trim"], bev=0.04),
        cyl("pole", 0.07, 6.6, (fx, DECK + 3.4, fz), M["metal"], axis="y", verts=8, radius2=0.05),
    ]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=0.13, location=kit.B((fx, DECK + 6.75, fz)))
    ball = bpy.context.active_object
    ball.data.materials.append(M["trim"])
    parts.append(ball)
    # The flag: three panels, each turned a little, so it reads as cloth.
    x0 = fx + 0.06
    for i, turn in enumerate((0.18, -0.2, 0.16)):
        w = 0.5
        parts.append(box("flag", (w, 0.9, 0.04), (x0 + w * (i + 0.5), DECK + 6.1, fz + (0.05 if i == 1 else 0.0)), M["red"], bev=0.0, rot=(0, turn, 0)))
    return parts


def training_yard(M):
    parts = [box("yard", (4.0, 0.08, 4.6), (6.6, DECK + 0.04, 4.7), M["apron"], bev=0.03)]
    wall = box("drill", (2.4, 2.6, 0.3), (6.6, DECK + 1.3, 2.9), M["wall"], bev=0.03)
    cut_many(wall, [box("drillCut", (0.7, 0.8, 0.6), (6.6 + wx, DECK + 1.9, 2.9), M["recess"], bev=0.0) for wx in (-0.6, 0.6)])
    parts.append(wall)
    parts.append(box("drillCap", (2.6, 0.12, 0.44), (6.6, DECK + 2.66, 2.9), M["trim"], bev=0.02))
    for i in range(2):
        hx = 5.6 + i * 2.0
        for s_ in (-0.7, 0.7):
            parts.append(box("hurdleLeg", (0.1, 1.2, 0.1), (hx, DECK + 0.6, 5.2 + s_), M["metal"], bev=0.0))
        parts.append(box("hurdleBar", (0.12, 0.14, 1.6), (hx, DECK + 1.15, 5.2), M["red"], bev=0.02))
    parts.append(cyl("reel", 0.5, 0.5, (8.0, DECK + 0.62, 6.4), M["red"], axis="x", verts=12, bev=0.04))
    parts.append(cyl("reelHub", 0.18, 0.6, (8.0, DECK + 0.62, 6.4), M["metal"], axis="x", verts=8))
    for s_ in (-0.3, 0.3):
        parts.append(box("reelLeg", (0.08, 0.7, 0.4), (8.0 + s_, DECK + 0.35, 6.4), M["steel"], bev=0.0))
    # Cones round the drill ground.
    for cx, cz in ((5.0, 3.8), (8.2, 3.8), (5.0, 6.6)):
        parts.append(cyl("cone", 0.14, 0.4, (cx, DECK + 0.28, cz), M["red"], axis="y", verts=8, radius2=0.02))
        parts.append(box("coneFoot", (0.34, 0.05, 0.34), (cx, DECK + 0.1, cz), M["dark"], bev=0.0))
    return parts


def open_bays(level):
    """The bays an engine stands in: the first one at level 2, two at level 3."""
    return range(0) if level < 2 else range(1 if level == 2 else 2)


def station(M, level):
    parts = plot(M, level) + hall(M, level)
    if level >= 2:
        parts += hose_tower(M, tower_x(level))
    else:
        parts += drying_mast(M, tower_x(level) - 0.4)
    parts += flag(M, hall_centre(level) - hall_width(level) / 2 - 1.1)
    if level >= 3:
        parts += training_yard(M)
    return parts


def engine():
    T = truck_palette()
    objs = fire_truck.cab(T) + fire_truck.body(T) + fire_truck.wheels(T)
    objs += fire_truck.ladder(T, pitch=0.056, stowed=True)
    obj = finish(objs, "Engine")
    obj.data.transform(Matrix.Scale(ENGINE_SCALE, 4))
    return obj


def build():
    kit.reset()
    M = palette()
    made = []
    # Each piece is baked alone: the three levels share one origin and would
    # shade each other, and the engine is baked in its own frame.
    for level in (1, 2, 3):
        made.append(finish(station(M, level), f"Station{level}"))
        _bake_alone(made[-1], made, distance=1.2)
    made.append(engine())
    _bake_alone(made[-1], made, distance=0.5)
    # The engine's two roof lamps, in its own frame, for the blinking beacons.
    for i, lx in enumerate((-0.32, 0.32)):
        made.append(marker(f"Engine.lamp.{i}", tuple(v * ENGINE_SCALE for v in (lx, 2.04, 2.0))))
    for level in (2, 3):
        for i in open_bays(level):
            made.append(marker(f"Station{level}.engine.{i}", (bay_centres(level)[i], DECK, ENGINE_Z)))
    return made


def _bake_alone(obj, others, distance):
    hidden = [o for o in others if o is not obj]
    for o in hidden:
        o.hide_render = True
    # A light hand: nothing else in the city is occluded, and a station much
    # darker than its neighbours reads as dirty rather than modelled.
    kit.bake_ao([obj], distance=distance, floor=0.55)
    for o in hidden:
        o.hide_render = False


def preview(level):
    """One level with its engines parked, for the stage renders."""
    objs = build()
    engine_obj = next(o for o in objs if o.name == "Engine")
    keep = [o for o in objs if o.name == f"Station{level}"]
    for obj in objs:
        if obj.name.startswith(f"Station{level}.engine."):
            copy = bpy.data.objects.new(f"engine@{obj.name}", engine_obj.data)
            copy.location = obj.location
            bpy.context.scene.collection.objects.link(copy)
            keep.append(copy)
    for obj in objs:
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    return keep
