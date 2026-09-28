"""
The town's low block of flats, plain and over shops (spike: Blender vs
procedural).

Same unit space, footprint, heights and openings as `apartmentLow()` in
`components/city/models/buildings/town.ts`: four storeys of render over a
stone base (or a row of shops, `shop_front()` from `shopfront.py`),
balconies on the two middle bays of the front, an entrance under a canopy,
and a flat roof behind a parapet with a stair head and room for plant. The
script sets all thirty-six upper windows into the wall in white-painted
reveals (no sills, as the procedural one: the budget is the windows), gives the parapet a
real thickness over a cornice, stands the string courses and the base proud,
and bakes the occlusion.

    blender -b --python blender/export.py -- blender/settlement/apartment.py apartment-low
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
from shopfront import shop_front  # noqa: E402
from skit import LAYER, Mesh, door, wall, window  # noqa: E402

NAME = "apartment-low"
HALF_W = 0.47
HALF_D = 0.44
ROOF_Y = 0.93
FLOORS = 4
OUT = 2 * LAYER  # how far the base stands out of the wall above it
PARAPET = (0.045, 0.03)  # height, thickness
CORNICE = 0.012


def build_block(M, retail):
    m = Mesh("ApartmentLowRetail" if retail else "ApartmentLow")
    base = 0.24 if retail else 0.2
    floor_h = (ROOF_Y - base) / (FLOORS - 1 + 0.001)
    sw, sd = HALF_W + OUT, HALF_D + OUT  # the street planes of the base
    base_mat = M["wallDeep"] if retail else M["stone"]
    windows = []

    # --- the base: its four faces at the street planes, and the ledge on top
    base_holes = {f: [] for f in ("+z", "-z", "+x", "-x")}
    if retail:
        # The fascia's moulding comes up level with the base's top.
        windows.append(shop_front(m, M, sd, HALF_W, base - 0.006, base_holes["+z"]))
        # The rear door up a step, as the procedural one is.
        door(m, M, "-z", sd, 0.0, 0.02, 0.14, base * 0.8, mat=M["accent"], holes=base_holes["-z"], step_w=0.03)
    else:
        door(m, M, "+z", sd, 0.0, 0.02, 0.14, 0.14, mat=M["accent"], reveal=M["frame"], holes=base_holes["+z"], step_w=0.03)
        m.wall_box("+z", sd, -0.15, 0.15, 0.175, 0.189, 0.1, M["frame"], skip=("back",))
        for u in (-0.32, -0.16, 0.16, 0.32):
            windows.append(window(m, M, "+z", sd, u, 0.1, 0.1, 0.08, bars="none", holes=base_holes["+z"], depth=0.018))
    for facing, plane, half in (("+z", sd, sw), ("-z", sd, sw), ("+x", sw, sd), ("-x", sw, sd)):
        wall(m, facing, plane, -half, half, 0.0, base, base_holes[facing], base_mat)
    # The base's top: a ledge round the foot of the wall above.
    for pts in (
        [(-sw, base, HALF_D), (sw, base, HALF_D), (sw, base, sd), (-sw, base, sd)],
        [(-sw, base, -sd), (sw, base, -sd), (sw, base, -HALF_D), (-sw, base, -HALF_D)],
        [(HALF_W, base, -HALF_D), (sw, base, -HALF_D), (sw, base, HALF_D), (HALF_W, base, HALF_D)],
        [(-sw, base, -HALF_D), (-HALF_W, base, -HALF_D), (-HALF_W, base, HALF_D), (-sw, base, HALF_D)],
    ):
        m.face(pts, base_mat, out=(0, 1, 0))

    # --- the storeys: windows set in, string courses, balconies
    holes = {f: [] for f in ("+z", "-z", "+x", "-x")}
    strings = [base + f * floor_h for f in range(1, FLOORS - 1)]
    for f in range(FLOORS - 1):
        v = base + (f + 0.5) * floor_h
        for u in (-0.32, -0.11, 0.11, 0.32):
            for facing in ("+z", "-z"):
                windows.append(window(m, M, facing, HALF_D, u, v, 0.12, floor_h * 0.5, bars="none", sill=False,
                                      holes=holes[facing], depth=0.018, reveal=M["frame"]))
        for u in (-0.2, 0.2):
            for facing in ("+x", "-x"):
                windows.append(window(m, M, facing, HALF_W, u, v, 0.11, floor_h * 0.5, bars="none", sill=False,
                                      holes=holes[facing], depth=0.018, reveal=M["frame"]))
        # A balcony on each middle bay: a slab, a painted front with a rail
        # on it, and end panels flush with the slab's ends.
        fy = base + f * floor_h + 0.004
        rail_h = floor_h * 0.24
        for u in (-0.215, 0.215):
            u0, u1 = u - 0.17, u + 0.17
            m.wall_box("+z", HALF_D, u0, u1, fy, fy + 0.014, 0.08, M["concrete"], skip=("back",))
            m.wall_box("+z", HALF_D + 0.07, u0, u1, fy + 0.014, fy + 0.014 + rail_h, 0.01, M["accentMetal"], skip=("bottom", "top"))
            # Balusters: dark bars a layer proud of the front.
            for k in (-2, -1, 0, 1, 2):
                bu = u + k * 0.053
                m.rect("+z", HALF_D + 0.08, bu - 0.004, bu + 0.004, fy + 0.02, fy + 0.008 + rail_h, M["accentMetalDark"], out=LAYER)
            # The rail on top; its underside and back are never seen.
            m.wall_box("+z", HALF_D + 0.068, u0, u1, fy + 0.014 + rail_h, fy + 0.024 + rail_h, 0.014, M["frameMetal"], skip=("back", "bottom"))
            # (Their fronts are buried in the front panel's back.)
            for e0, e1 in ((u0, u0 + 0.008), (u1 - 0.008, u1)):
                m.wall_box("+z", HALF_D, e0, e1, fy + 0.014, fy + 0.014 + rail_h, 0.07, M["accentMetalDark"], skip=("back", "bottom", "front"))
    cuts = [c for s in strings for c in (s - 0.006, s + 0.004)] + [ROOF_Y - 0.02]
    for facing, plane, half in (("+z", HALF_D, HALF_W), ("-z", HALF_D, HALF_W), ("+x", HALF_W, HALF_D), ("-x", HALF_W, HALF_D)):
        wall(m, facing, plane, -half, half, base, ROOF_Y, holes[facing], M["wall"], cuts=cuts)
    for s in strings:
        skit.band(m, HALF_W, HALF_D, s - 0.006, s + 0.004, OUT, M["wallShade"])

    # --- the roof: a cornice, the parapet over it, the deck, the stair head
    for facing, plane, half in (("+z", HALF_D, HALF_W + CORNICE), ("-z", HALF_D, HALF_W + CORNICE), ("+x", HALF_W, HALF_D), ("-x", HALF_W, HALF_D)):
        skip = ("back", "top") if facing in ("+z", "-z") else ("back", "top", "left", "right")
        m.wall_box(facing, plane, -half, half, ROOF_Y - 0.02, ROOF_Y, CORNICE, M["frame"], skip=skip)
    ph, pt = PARAPET
    ox, oz = HALF_W + CORNICE, HALF_D + CORNICE
    ix, iz = ox - pt, oz - pt
    top = ROOF_Y + ph
    m.box(-ox, ox, ROOF_Y, top, -oz, oz, M["wallShade"], skip=("top", "bottom"))
    # The coping: a ring between the outer and inner faces.
    for pts in (
        [(-ox, top, iz), (ox, top, iz), (ox, top, oz), (-ox, top, oz)],
        [(-ox, top, -oz), (ox, top, -oz), (ox, top, -iz), (-ox, top, -iz)],
        [(ix, top, -iz), (ox, top, -iz), (ox, top, iz), (ix, top, iz)],
        [(-ox, top, -iz), (-ix, top, -iz), (-ix, top, iz), (-ox, top, iz)],
    ):
        m.face(pts, M["wallShade"], out=(0, 1, 0))
    for facing, plane, half in (("+z", iz, ix), ("-z", iz, ix), ("+x", ix, iz), ("-x", ix, iz)):
        # The inner faces look into the roof.
        pts = [skit.on(facing, plane, u, v) for u, v in ((-half, ROOF_Y), (half, ROOF_Y), (half, top), (-half, top))]
        n = skit.NORMAL[facing]
        m.face(pts, M["wallShade"], out=(-n[0], 0, -n[2]))
    m.face([(-ix, ROOF_Y, -iz), (ix, ROOF_Y, -iz), (ix, ROOF_Y, iz), (-ix, ROOF_Y, iz)], M["concreteDark"], out=(0, 1, 0))
    # The stair head: a box with a metal lid, a door, louvres at the back.
    sx, sz = -0.22, -0.18
    m.box(sx - 0.1, sx + 0.1, ROOF_Y, ROOF_Y + 0.06, sz - 0.08, sz + 0.08, M["wallShade"], skip=("bottom", "top"))
    m.box(sx - 0.106, sx + 0.106, ROOF_Y + 0.06, ROOF_Y + 0.072, sz - 0.086, sz + 0.086, M["metal"])
    m.rect("+z", 0.08, -0.0425, 0.0425, ROOF_Y + 0.0065, ROOF_Y + 0.0535, M["frame"], cx=sx, cz=sz, out=LAYER)
    m.rect("+z", 0.08, -0.0335, 0.0335, ROOF_Y + 0.011, ROOF_Y + 0.049, M["metal"], cx=sx, cz=sz, out=2 * LAYER)
    for row in range(3):
        v = ROOF_Y + 0.015 + row * 0.015
        m.rect("-z", 0.08, -0.06, 0.06, v - 0.003, v + 0.003, M["railing"], cx=sx, cz=sz, out=LAYER)

    obj = skit.finish(m)
    return obj, {
        "windows": windows,
        "roofPads": [{"x": 0.18, "z": 0.12, "y": ROOF_Y, "w": 0.46, "d": 0.5}],
        "maxProps": 2,
    }


def build():
    kit.reset()
    M = skit.palette()
    objs, meta = [], {}
    for retail in (False, True):
        obj, info = build_block(M, retail)
        objs.append(obj)
        meta[obj.name] = info
    skit.bake(objs)
    for obj in objs:
        print("TRIS", obj.name, skit.triangles(obj))
    skit.write_meta(NAME, meta)
    return objs


def preview(n):
    return [build()[n]]
