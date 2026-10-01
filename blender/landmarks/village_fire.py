"""
The village fire station, modelled by script (spike: Blender assets vs
procedural).

Same natural size (8 x 7.4 x 8.5), apron, brick hall, pitched roof, bay door
on +z, bell turret, hose pole and flag as `villageFireStation()` in
`components/city/models/landmarks/village.ts`, and its two levels:

  level 1  the station, the blue lamp over the door
  level 2  a small appliance parked nose out on the apron

Out come `VFire1`, `VFire2` and the beacon markers `VFire<L>.beacon.<i>` in
the procedural order: the lamp over the door, then the appliance's roof
light.

Materials are the station's colour SLOTS (`<slot>.<surface>[.tNN]`).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lkit  # noqa: E402
import kit  # noqa: E402
import animkit  # noqa: E402
from kit import box, cut_many, cyl, finish  # noqa: E402

W, D, H = 4.6, 5.2, 3.6
X, Z0 = -0.3, -1.4
FRONT = Z0 + D / 2
RISE = 1.9
RIDGE = H - 0.1 + RISE
DOOR_LAMP = (X, H - 0.05, FRONT + 0.2)
ENGINE = (1.9, 2.9)
ENGINE_LAMP = (ENGINE[0], 1.8, ENGINE[1] + 0.7)

SLOT_HEX = {
    "deck": "#a3a59d",
    "wall": "#a8604a",
    "roof": "#6f7a82",
    "red": "#d44f3e",
    "trim": "#fafaf7",
    "steel": "#414950",
    "glass": "#ffdca5",
}
SURFACE = {"deck": "concrete", "wall": "brick", "red": "metal", "trim": "stone", "roof": "slate", "steel": "metal", "glass": "glass"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "deck": S("deck"),
        "apron": S("deck", 0.9),
        "joint": S("deck", 0.7),
        "wall": S("wall"),
        "recess": S("wall", 0.75),
        "roof": S("roof"),
        "ridge": S("roof", 0.78),
        "red": S("red"),
        "redDeep": S("red", 0.78),
        "trim": S("trim"),
        "stone": S("trim", 0.86),
        "steel": S("steel"),
        "tyre": S("steel", 0.6),
        "glass": S("glass", emission=0.3),
    }


def ground(M):
    parts = [box("deck", (7.8, 0.12, 8.2), (0, 0.06, 0), M["deck"], bev=0.04, cell=2.0)]
    parts.append(box("apron", (3.6, 0.06, 2.9), (X, 0.15, 2.65), M["apron"], bev=0.02))
    for k in range(2):
        parts.append(box("joint", (3.5, 0.01, 0.03), (X, 0.185, 1.9 + k * 1.0), M["joint"], bev=0.0))
    # Keep-clear hatching in front of the door.
    for k in range(5):
        parts.append(box("hatch", (0.1, 0.01, 0.9), (X - 1.0 + k * 0.5, 0.186, 3.4), M["trim"], bev=0.0, rot=(0, 0.6, 0)))
    # A strip of grass and a bench along the side.
    parts.append(box("verge", (1.4, 0.05, 5.4), (3.1, 0.145, -1.2), M["stone"], bev=0.0))
    return parts


def hall(M):
    parts = []
    body = box("hall", (W, H, D), (X, H / 2, Z0), M["wall"], bev=0.03, cell=1.3)
    cuts = [box("bayCut", (2.5, 2.45, 0.4), (X, 0.12 + 1.225, FRONT), M["recess"], bev=0.0)]
    for z in (-3.0, -0.8):
        cuts.append(box("winCut", (0.4, 0.8, 0.7), (X + W / 2, 2.0, z), M["recess"], bev=0.0))
        cuts.append(box("winCut", (0.4, 0.8, 0.7), (X - W / 2, 2.0, z - 0.4 if z < -2 else -2.0), M["recess"], bev=0.0))
    cuts.append(box("doorCut", (0.4, 1.9, 0.9), (X - W / 2, 0.12 + 0.95, -0.4), M["recess"], bev=0.0))
    # The rear: a back door with two windows either side of it.
    back = Z0 - D / 2
    cuts.append(box("rearDoorCut", (0.9, 1.9, 0.4), (X, 0.12 + 0.95, back), M["recess"], bev=0.0))
    for dx in (-1.35, 1.35):
        cuts.append(box("winCut", (0.7, 0.8, 0.4), (X + dx, 2.0, back), M["recess"], bev=0.0))
    cut_many(body, cuts)
    parts.append(body)
    parts.append(box("plinth", (W + 0.1, 0.3, D + 0.1), (X, 0.15, Z0), M["stone"], bev=0.02))
    # The bay: a white frame, the red door in four panels with a glazed row.
    frame = box("bayFrame", (2.9, 2.75, 0.12), (X, 0.12 + 1.375, FRONT + 0.03), M["trim"], bev=0.03)
    cut_many(frame, [box("frameCut", (2.5, 2.45, 0.4), (X, 0.12 + 1.225, FRONT), M["recess"], bev=0.0)])
    parts.append(frame)
    ph = 2.45 / 4
    for i in range(4):
        parts.append(box("panel", (2.48, ph - 0.02, 0.07), (X, 0.12 + ph * (i + 0.5), FRONT - 0.1), M["red"], bev=0.02))
    for dx in (-0.8, 0.0, 0.8):
        parts.append(box("doorGlass", (0.6, 0.26, 0.04), (X + dx, 0.12 + ph * 2.5, FRONT - 0.05), M["glass"], bev=0.0))
    parts.append(box("handle", (0.3, 0.05, 0.05), (X, 0.45, FRONT - 0.04), M["steel"], bev=0.0))
    # The painted band over the door with its lettering.
    parts.append(box("band", (W + 0.04, 0.4, 0.06), (X, H - 0.45, FRONT + 0.02), M["red"], bev=0.0))
    for k, w in enumerate((0.7, 1.0)):
        parts.append(box("letters", (w, 0.1, 0.02), (X - 0.55 + k * 1.05, H - 0.45, FRONT + 0.06), M["trim"], bev=0.0))
    # The blue lamp over the door (the procedural beacon point).
    parts.append(box("lampArm", (0.06, 0.06, 0.22), (DOOR_LAMP[0], DOOR_LAMP[1], FRONT + 0.1), M["steel"], bev=0.0))
    parts.append(box("lamp", (0.2, 0.2, 0.2), DOOR_LAMP, M["glass"], bev=0.0))
    # Windows: a white frame, glass, a glazing bar; a red side door.
    for z in (-3.0, -0.8):
        fx = X + W / 2
        parts.append(box("winGlass", (0.04, 0.8, 0.7), (fx - 0.12, 2.0, z), M["glass"], bev=0.0))
        parts.append(box("winBar", (0.04, 0.8, 0.04), (fx - 0.1, 2.0, z), M["trim"], bev=0.0))
        parts.append(box("winBar", (0.04, 0.04, 0.7), (fx - 0.1, 2.0, z), M["trim"], bev=0.0))
        parts.append(box("sill", (0.16, 0.08, 0.86), (fx + 0.05, 1.56, z), M["stone"], bev=0.0))
        parts.append(box("lintel", (0.06, 0.14, 0.9), (fx + 0.02, 2.48, z), M["stone"], bev=0.0))
    for z in (-3.4, -2.0):
        fx = X - W / 2
        parts.append(box("winGlass", (0.04, 0.8, 0.7), (fx + 0.12, 2.0, z), M["glass"], bev=0.0))
        parts.append(box("winBar", (0.04, 0.8, 0.04), (fx + 0.1, 2.0, z), M["trim"], bev=0.0))
        parts.append(box("sill", (0.16, 0.08, 0.86), (fx - 0.05, 1.56, z), M["stone"], bev=0.0))
    parts.append(box("sideDoor", (0.05, 1.9, 0.9), (X - W / 2 + 0.12, 0.12 + 0.95, -0.4), M["red"], bev=0.0))
    parts.append(box("doorHood", (0.4, 0.08, 1.2), (X - W / 2 - 0.2, 2.25, -0.4), M["roof"], bev=0.02))
    for dx in (-1.35, 1.35):
        parts.append(box("winGlass", (0.7, 0.8, 0.04), (X + dx, 2.0, back + 0.12), M["glass"], bev=0.0))
        parts.append(box("winBar", (0.04, 0.8, 0.04), (X + dx, 2.0, back + 0.1), M["trim"], bev=0.0))
        parts.append(box("winBar", (0.7, 0.04, 0.04), (X + dx, 2.0, back + 0.1), M["trim"], bev=0.0))
        parts.append(box("sill", (0.86, 0.08, 0.16), (X + dx, 1.56, back - 0.05), M["stone"], bev=0.0))
    parts.append(box("rearDoor", (0.9, 1.9, 0.05), (X, 0.12 + 0.95, back + 0.12), M["red"], bev=0.0))
    parts.append(box("rearDoorHood", (1.2, 0.08, 0.24), (X, 2.25, back - 0.12), M["roof"], bev=0.02))
    parts.append(box("rearStep", (1.1, 0.12, 0.24), (X, 0.18, back - 0.12), M["stone"], bev=0.02))
    # Gutters and downpipes.
    for side in (-1, 1):
        parts.append(box("gutter", (0.1, 0.1, D + 0.5), (X + side * (W / 2 + 0.3), H - 0.18, Z0), M["steel"], bev=0.0))
        parts.append(box("downpipe", (0.07, H - 0.3, 0.07), (X + side * (W / 2 + 0.25), (H - 0.3) / 2, Z0 - D / 2 + 0.15), M["steel"], bev=0.0))
    # The roof, the gables under it and a ridge.
    parts.append(lkit.gable_roof("roof", W / 2, RISE, D + 0.4, (X, H - 0.1, Z0), M["roof"], thick=0.14, overhang=0.32))
    for gz, sign in ((FRONT, 1), (Z0 - D / 2, -1)):
        parts.append(lkit.gable_end("gable", W / 2, RISE, 0.2, (X, H - 0.12, gz - sign * 0.1), M["wall"]))
    parts.append(box("ridge", (0.16, 0.14, D + 0.44), (X, RIDGE + 0.08, Z0), M["ridge"], bev=0.02))
    # The round window in the front gable.
    parts.append(cyl("roundel", 0.36, 0.08, (X, H + 0.55, FRONT + 0.02), M["trim"], axis="z", verts=12))
    parts.append(cyl("roundelGlass", 0.27, 0.06, (X, H + 0.55, FRONT + 0.05), M["glass"], axis="z", verts=12))
    # And one in the rear gable, over the back door.
    parts.append(cyl("roundel", 0.36, 0.08, (X, H + 0.55, back - 0.02), M["trim"], axis="z", verts=12))
    parts.append(cyl("roundelGlass", 0.27, 0.06, (X, H + 0.55, back - 0.05), M["glass"], axis="z", verts=12))
    return parts


def turret(M):
    tz = Z0 - 1.2
    base = RIDGE - 0.3
    parts = [box("turretBase", (0.8, 0.7, 0.8), (X, base + 0.35, tz), M["trim"], bev=0.03)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(box("turretPost", (0.1, 0.6, 0.1), (X + sx * 0.33, base + 1.0, tz + sz * 0.33), M["trim"], bev=0.0))
    parts.append(cyl("bell", 0.2, 0.34, (X, base + 1.0, tz), M["steel"], axis="y", verts=8, radius2=0.1))
    parts.append(cyl("turretRoof", 0.64, 0.7, (X, base + 1.65, tz), M["red"], axis="y", verts=4, radius2=0.03, rot=(0, math.pi / 4, 0)))
    parts.append(box("finial", (0.04, 0.3, 0.04), (X, base + 2.1, tz), M["steel"], bev=0.0))
    return parts


def hose_pole(M):
    px, pz = 2.8, -2.6
    parts = [
        box("poleFoot", (0.4, 0.2, 0.4), (px, 0.22, pz), M["stone"], bev=0.02),
        cyl("pole", 0.08, 6.0, (px, 3.1, pz), M["steel"], axis="y", verts=6, radius2=0.06),
        box("poleArm", (0.7, 0.07, 0.07), (px, 5.9, pz), M["steel"], bev=0.0),
        lkit.sphere(px, 6.15, pz, 0.08, M["trim"], segments=6, rings=4),
    ]
    for hx in (-0.25, 0.25):
        parts.append(box("hose", (0.07, 1.6, 0.07), (px + hx, 5.05, pz), M["redDeep"], bev=0.0))
    # (the cloth is `flag_cloth()`: a node of its own, waved by the app)
    # A hydrant and a bench on the verge.
    parts.append(cyl("hydrant", 0.12, 0.5, (2.5, 0.42, 1.2), M["red"], axis="y", verts=8))
    parts.append(cyl("hydrantCap", 0.14, 0.08, (2.5, 0.7, 1.2), M["red"], axis="y", verts=8, radius2=0.06))
    for k in range(2):
        parts.append(box("benchSeat", (0.4, 0.05, 1.2), (3.3 + k * 0.0, 0.62, -0.6), M["roof"], bev=0.0))
    parts.append(box("benchBack", (0.05, 0.3, 1.2), (3.5, 0.82, -0.6), M["roof"], bev=0.0))
    for dz in (-0.5, 0.5):
        parts.append(box("benchLeg", (0.4, 0.45, 0.06), (3.3, 0.4, -0.6 + dz), M["steel"], bev=0.0))
    return parts


def appliance(M):
    cx, cz = ENGINE
    parts = []
    # Chassis, body lockers, cab.
    parts.append(box("chassis", (1.1, 0.25, 2.6), (cx, 0.42, cz), M["steel"], bev=0.0))
    parts.append(box("body", (1.3, 0.9, 1.6), (cx, 0.95, cz - 0.45), M["red"], bev=0.05))
    parts.append(box("cab", (1.28, 1.05, 1.0), (cx, 1.02, cz + 0.75), M["red"], bev=0.06))
    parts.append(box("windscreen", (1.1, 0.38, 0.04), (cx, 1.3, cz + 1.24), M["glass"], bev=0.0, rot=(-0.12, 0, 0)))
    for s in (-1, 1):
        parts.append(box("sideWindow", (0.04, 0.32, 0.5), (cx + s * 0.64, 1.3, cz + 0.85), M["glass"], bev=0.0))
        parts.append(box("locker", (0.03, 0.6, 1.4), (cx + s * 0.655, 0.95, cz - 0.45), M["trim"], bev=0.0))
        for wz in (0.8, -0.8):
            parts.append(cyl("wheel", 0.28, 0.2, (cx + s * 0.58, 0.28, cz + wz), M["tyre"], axis="x", verts=10))
            parts.append(cyl("hub", 0.12, 0.22, (cx + s * 0.58, 0.28, cz + wz), M["trim"], axis="x", verts=6))
    parts.append(box("stripe", (1.32, 0.08, 2.6), (cx, 0.72, cz + 0.05), M["trim"], bev=0.0))
    parts.append(box("bumper", (1.3, 0.14, 0.1), (cx, 0.42, cz + 1.27), M["steel"], bev=0.0))
    for s in (-1, 1):
        parts.append(box("head", (0.18, 0.1, 0.03), (cx + s * 0.44, 0.7, cz + 1.26), M["glass"], bev=0.0))
    # A short ladder on the roof, and the roof light (the second beacon).
    for s in (-1, 1):
        parts.append(box("ladderRail", (0.05, 0.05, 1.5), (cx + s * 0.25, 1.46, cz - 0.4), M["trim"], bev=0.0))
    for k in range(5):
        parts.append(box("rung", (0.5, 0.03, 0.04), (cx, 1.46, cz - 1.0 + k * 0.3), M["trim"], bev=0.0))
    parts.append(box("lightBar", (0.7, 0.1, 0.18), (ENGINE_LAMP[0], 1.6, ENGINE_LAMP[2]), M["steel"], bev=0.0))
    return parts


def station(M, level):
    parts = ground(M) + hall(M) + turret(M) + hose_pole(M)
    if level >= 2:
        parts += appliance(M)
    return parts


FLAG_HOIST, FLAG_LENGTH, FLAG_HEIGHT = (2.88, 5.55, -2.6), 0.9, 0.55


def flag_cloth(M, level, scope=None, segs=(6, 2), thick=0.02, ripple=0.05):
    """The hose pole's flag cloth, hoisted on the pole's arm and flying towards +x."""
    scope = scope or f"VFire{level}"
    return animkit.flag(f"{scope}.Flag.0", M["red"], FLAG_HOIST, (1.0, 0.0, 0.0), FLAG_LENGTH, FLAG_HEIGHT, segs=segs, thick=thick, ripple=ripple)


def build():
    kit.reset()
    M = palette()
    made = []
    for level in (1, 2):
        made.append(finish(station(M, level), f"VFire{level}"))
        lkit.bake(made[-1], [], made, distance=0.8)
    for level in (1, 2):
        made += flag_cloth(M, level)
    for level in (1, 2):
        made.append(kit.marker(f"VFire{level}.beacon.0", DOOR_LAMP))
    made.append(kit.marker("VFire2.beacon.1", ENGINE_LAMP))
    return made


def preview(level):
    return lkit.keep_only(build(), [f"VFire{level}"])
