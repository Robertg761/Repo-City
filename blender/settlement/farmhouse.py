"""
The village farmhouse (spike: Blender vs procedural).

Same unit space, footprint, heights and openings as `farmhouse()` in
`components/city/models/buildings/village.ts`: two storeys under a clay-tile
gable with a stack at each end, a porch over the front door, and a stone
lean-to scullery on -x under its own mono-pitch roof. The script adds stepped
tile courses, a gutter and downpipe, a string course that stands proud,
windows and doors set into the walls, and baked occlusion.

    blender -b --python blender/export.py -- blender/settlement/farmhouse.py farmhouse
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
from skit import LAYER, Hole, Mesh, chimney, door, gable_roof, wall, window  # noqa: E402

NAME = "farmhouse"
CX = 0.13
HALF_W = 0.33
HALF_D = 0.34
WALL_TOP = 0.62
PLINTH = 0.04
PLINTH_OUT = 0.026


def build_farmhouse(M):
    m = Mesh("Farmhouse")
    x0, x1 = CX - HALF_W, CX + HALF_W
    m.box(x0 - PLINTH_OUT, x1 + PLINTH_OUT, 0, PLINTH, -HALF_D - PLINTH_OUT, HALF_D + PLINTH_OUT, M["stoneDark"], skip=("bottom",))

    holes = {f: [] for f in ("+z", "-z", "+x", "-x")}
    windows = []
    front = HALF_D
    # The front door under the porch, with a fanlight.
    door(m, M, "+z", front, 0.0, PLINTH, 0.12, 0.22, cx=CX, fanlight=True, holes=holes["+z"], step=False, floor=False)
    # (A hundredth higher than the procedural windows: their window boxes
    # came down into the plinth.)
    for u in (-0.2, 0.2):
        windows.append(window(m, M, "+z", front, u, 0.2, 0.13, 0.14, cx=CX, flowers=M["flowerRed"], holes=holes["+z"]))
    for u, w, h, sh in ((-0.2, 0.12, 0.13, True), (0.0, 0.1, 0.12, False), (0.2, 0.12, 0.13, True)):
        windows.append(window(m, M, "+z", front, u, 0.48, w, h, cx=CX, bars="sash", shutters=sh, holes=holes["+z"]))
    windows.append(window(m, M, "-z", front, -0.14, 0.19, 0.12, 0.13, cx=CX, holes=holes["-z"]))
    windows.append(window(m, M, "-z", front, 0.14, 0.48, 0.12, 0.13, cx=CX, holes=holes["-z"]))
    windows.append(window(m, M, "+x", HALF_W, 0.0, 0.48, 0.12, 0.13, cx=CX, holes=holes["+x"]))
    windows.append(window(m, M, "+x", HALF_W, 0.12, 0.19, 0.12, 0.13, cx=CX, holes=holes["+x"]))
    for facing, plane, half in (("+z", HALF_D, HALF_W), ("-z", HALF_D, HALF_W), ("+x", HALF_W, HALF_D), ("-x", HALF_W, HALF_D)):
        wall(m, facing, plane, -half, half, PLINTH, WALL_TOP, holes[facing], M["wall"], cx=CX, cuts=(0.33, 0.344))
    # A string course between the storeys, standing proud enough that its
    # top is a ledge and not a thread.
    sc = 0.014
    skit.band(m, HALF_W, HALF_D, 0.33, 0.344, sc, M["wallShade"], cx=CX)

    gable_roof(m, M, x=CX, y=WALL_TOP, w=HALF_W * 2, d=HALF_D * 2, rise=0.3, overhang=0.035, thickness=0.032, ridge="x",
               roof=M["tile"], gable=M["wall"], cap=M["tileDark"], courses=5, step=0.012, verge=M["tileDark"],
               butt=M["tileDark"], joints=5, gutter=True,
               avoid=[(CX + e * (HALF_W - 0.045 - 2 * LAYER) - 0.045, CX + e * (HALF_W - 0.045 - 2 * LAYER) + 0.045, -0.065, 0.065) for e in (-1, 1)])
    for e in (-1, 1):
        chimney(m, M, CX + e * (HALF_W - 0.045 - 2 * LAYER), 0.0, 0.7, 1.02, w=0.09, d=0.13, pots=2)

    # The lean-to: stone walls, a door, and a mono-pitch roof falling away.
    lx0, lx1, lhd = -0.49, x0, 0.26
    y_lo, y_hi = 0.29, 0.415  # its walls' top, inside the roof slab
    lean_holes = []
    door(m, M, "+z", lhd, (lx0 + lx1) / 2 + 0.02, 0.0, 0.1, 0.22, mat=M["timber"], reveal=M["stoneDark"],
         holes=lean_holes, step=False, floor=False, depth=0.024)
    wall(m, "+z", lhd, lx0, lx1, 0.0, 0.28, lean_holes, M["stone"])
    m.face([(lx0, 0.28, lhd), (lx1, 0.28, lhd), (lx1, y_hi, lhd), (lx0, y_lo, lhd)], M["stone"], out=(0, 0, 1))
    m.face([(lx0, 0.0, -lhd), (lx1, 0.0, -lhd), (lx1, y_hi, -lhd), (lx0, y_lo, -lhd)], M["stone"], out=(0, 0, -1))
    m.face([(lx0, 0.0, -lhd), (lx0, 0.0, lhd), (lx0, y_lo, lhd), (lx0, y_lo, -lhd)], M["stone"], out=(-1, 0, 0))
    # Its roof in three courses, from the main wall down to the eave.
    hx, hy, ex, ey, t = lx1 + 0.005, 0.44, lx0 - 0.01, 0.31, 0.03
    courses, step = 3, 0.008
    pts = [(hx, hy)]
    for k in range(courses):
        xx = hx + (ex - hx) * (k + 1) / courses
        yy = hy + (ey - hy) * (k + 1) / courses
        pts.append((xx, yy + step))
        if k < courses - 1:
            pts.append((xx, yy))
    profile = pts + [(ex, ey - t), (hx, hy - t)]
    butts = {2 * k + 1: M["tileDark"] for k in range(courses - 1)}
    m.prism_z(profile, -lhd - 0.035, lhd + 0.035, M["tileDark"], edge_mats=butts, cap_mat=M["tileDark"])

    # The porch: a little gabled roof on two posts over a stone floor.
    pz = front + 0.07
    gable_roof(m, M, x=CX, z=pz, y=0.31, w=0.24, d=0.13, rise=0.08, overhang=0.015, thickness=0.022, ridge="z",
               roof=M["tileDark"], gable=M["frame"], courses=2, step=0.008, ends=(1,))
    fz0 = front + PLINTH_OUT
    m.box(CX - 0.13, CX + 0.13, 0.0, PLINTH, fz0, front + 0.15, M["stone"], skip=("bottom", "nz"))
    for s in (-1, 1):
        # Up into the porch roof, not a hair short of it.
        m.box(CX + s * 0.1 - 0.011, CX + s * 0.1 + 0.011, PLINTH, 0.312, front + 0.12 - 0.011, front + 0.12 + 0.011, M["frame"], skip=("bottom", "top"))
    obj = skit.finish(m)
    return obj, {"windows": windows, "roofPads": [], "maxProps": 0}


def build():
    kit.reset()
    M = skit.palette()
    obj, info = build_farmhouse(M)
    skit.bake([obj])
    print("TRIS", obj.name, skit.triangles(obj))
    skit.write_meta(NAME, {obj.name: info})
    return [obj]


def preview(n):
    return build()
