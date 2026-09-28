"""
The town terrace: three narrow houses under one slate roof (spike: Blender
vs procedural).

Same unit space, footprint, heights and openings as `terrace()` in
`components/city/models/buildings/town.ts`: the middle house bare brick, its
neighbours painted, every door its own colour, doors alternating sides so
neighbours share their steps. The script adds canted bay windows (a real
three-sided bay under a lead roof, where the procedural one is a box),
recessed doors under fanlights, party-wall pilasters and a string course
that stand proud, slates in stepped courses, a gutter, and baked occlusion.

    blender -b --python blender/export.py -- blender/settlement/terrace.py terrace
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
from skit import LAYER, Mesh, chimney, door, gable_roof, wall, window  # noqa: E402

NAME = "terrace"
HALF_W = 0.48
HALF_D = 0.38
WALL_TOP = 0.66
PLINTH = 0.035
PLINTH_OUT = 3 * LAYER
HOUSES = 3
HOUSE_W = HALF_W * 2 / HOUSES
STRING = (0.34, 0.354)


def bay(m, M, u, plane):
    """A canted bay on the +z wall at `u`: a stone base, a three-sided timber
    body with glass in each face, and a lead roof. Returns the front glass's
    Panel."""
    back_h, front_h, depth = 0.075, 0.05, 0.05
    y0, y1, y2, y3 = PLINTH, 0.11, 0.31, 0.328
    zb, zf = plane, plane + depth
    plan = [(u - back_h, zb), (u - front_h, zf), (u + front_h, zf), (u + back_h, zb)]

    def walls(ya, yb, mat, lift=0.0):
        for (xa, za), (xb, zb_) in zip(plan, plan[1:]):
            m.face([(xa, ya, za), (xb, ya, zb_), (xb, yb, zb_), (xa, yb, za)], mat, inside=(u, ya, plane - 0.1))
    walls(y0, y1, M["stone"])
    walls(y1, y2, M["frame"])
    # The lead roof, a little over the body all round, and its underside.
    o = 0.01
    roof_plan = [(u - back_h - o, zb), (u - front_h - o * 0.6, zf + o), (u + front_h + o * 0.6, zf + o), (u + back_h + o, zb)]
    m.face([(x, y3, z) for x, z in roof_plan], M["slateDark"], out=(0, 1, 0))
    m.face([(x, y2, z) for x, z in roof_plan], M["slateDark"], out=(0, -1, 0))
    for (xa, za), (xb, zb_) in zip(roof_plan, roof_plan[1:]):
        m.face([(xa, y2, za), (xb, y2, zb_), (xb, y3, zb_), (xa, y3, za)], M["slateDark"], inside=(u, y2, plane - 0.1))
    # Glass: two panes up the front under a sash bar, one up each side.
    gv, gh, gw = 0.21, 0.16, 0.084
    for a, b in ((gv - gh / 2, gv - 0.006), (gv + 0.006, gv + gh / 2)):
        m.rect("+z", zf + LAYER, u - gw / 2, u + gw / 2, a, b, M["glass"])
    for s in (-1, 1):
        (xa, za), (xb, zb_) = (plan[0], plan[1]) if s < 0 else (plan[3], plan[2])
        # The side's own outward normal, and a pane a layer off it.
        nx, nz = (zb_ - za), -(xb - xa)
        ln = (nx * nx + nz * nz) ** 0.5
        nx, nz = nx / ln, nz / ln
        if nx * s < 0:
            nx, nz = -nx, -nz
        pts = []
        for t, yy in ((0.2, gv - gh / 2), (0.8, gv - gh / 2), (0.8, gv + gh / 2), (0.2, gv + gh / 2)):
            pts.append((xa + (xb - xa) * t + nx * LAYER, yy, za + (zb_ - za) * t + nz * LAYER))
        m.face(pts, M["glass"], out=(nx, 0, nz))
    return skit.panel("+z", zf + LAYER - skit.PANEL_LIFT, u, gv, gw, gh)


def build_terrace(M):
    m = Mesh("Terrace")
    m.box(-HALF_W - PLINTH_OUT, HALF_W + PLINTH_OUT, 0, PLINTH, -HALF_D - PLINTH_OUT, HALF_D + PLINTH_OUT, M["stoneDark"], skip=("bottom",))
    walls = [M["wall"], M["brick"], M["wallShade"]]
    doors = [M["accent"], M["door"], M["accentDark"]]
    front = {i: [] for i in range(HOUSES)}
    rear = {i: [] for i in range(HOUSES)}
    sides = {"+x": [], "-x": []}
    windows = []
    steps = []
    door_v, door_w = 0.06, 0.075
    for i in range(HOUSES):
        centre = -HALF_W + HOUSE_W * (i + 0.5)
        side = -1 if i % 2 == 0 else 1
        du = centre + side * HOUSE_W * 0.24
        wu = centre - side * HOUSE_W * 0.18
        door(m, M, "+z", HALF_D, du, door_v, door_w, 0.22, mat=doors[i], fanlight=True, holes=front[i], step=False)
        steps.append([du - door_w / 2 - 0.04, du + door_w / 2 + 0.04])
        windows.append(bay(m, M, wu, HALF_D))
        windows.append(window(m, M, "+z", HALF_D, wu, 0.5, 0.1, 0.16, bars="sash", frame=0.012, holes=front[i]))
        windows.append(window(m, M, "+z", HALF_D, du, 0.52, 0.055, 0.12, bars="sash", frame=0.01, holes=front[i]))
        for v in (0.5, 0.2):
            windows.append(window(m, M, "-z", HALF_D, -centre, v, 0.1, 0.14, bars="sash", holes=rear[i]))
    for facing in ("+x", "-x"):
        windows.append(window(m, M, facing, HALF_W, 0.0, 0.5, 0.1, 0.13, bars="sash", holes=sides[facing]))

    cuts = (STRING[0], STRING[1], 0.16)
    for i in range(HOUSES):
        x0 = -HALF_W + HOUSE_W * i
        wall(m, "+z", HALF_D, x0, x0 + HOUSE_W, PLINTH, WALL_TOP, front[i], walls[i], cuts=cuts)
        wall(m, "-z", HALF_D, -(x0 + HOUSE_W), -x0, PLINTH, WALL_TOP, rear[i], walls[i], cuts=cuts)
    wall(m, "-x", HALF_W, -HALF_D, HALF_D, PLINTH, WALL_TOP, sides["-x"], walls[0], cuts=cuts)
    wall(m, "+x", HALF_W, -HALF_D, HALF_D, PLINTH, WALL_TOP, sides["+x"], walls[2], cuts=cuts)

    # The steps: a pair that nearly meet is one flight.
    steps.sort()
    flights = []
    for s in steps:
        if flights and s[0] - flights[-1][1] < 2 * LAYER:
            flights[-1][1] = max(flights[-1][1], s[1])
        else:
            flights.append(list(s))
    for u0, u1 in flights:
        m.wall_box("+z", HALF_D, u0, u1, 0.0, door_v, 0.06, M["stone"], skip=("back", "bottom"))

    # The string course, and the party-wall pilasters above and below it,
    # a course's width less proud so its top is a ledge over them.
    skit.band(m, HALF_W, HALF_D, STRING[0], STRING[1], 0.024, M["frame"])
    for i in range(1, HOUSES):
        u = -HALF_W + HOUSE_W * i
        for v0, v1 in ((PLINTH, STRING[0]), (STRING[1], 0.64)):
            m.wall_box("+z", HALF_D, u - 0.012, u + 0.012, v0, v1, 0.012, M["frame"], skip=("back", "bottom", "top"))

    stacks = [(-HALF_W + HOUSE_W * i, 0.8, 1.03, 2) for i in range(1, HOUSES)]
    stacks += [(s * (HALF_W - 0.035 - 2 * LAYER), 0.72, 1.0, 1) for s in (-1, 1)]
    gable_roof(m, M, y=WALL_TOP, w=HALF_W * 2, d=HALF_D * 2, rise=0.28, overhang=0.02, thickness=0.03, ridge="x",
               roof=M["slate"], gable=walls[0], cap=M["slateDark"], courses=5, step=0.008, verge=M["slateDark"],
               butt=M["slateDark"], joints=6, gutter=True, gables={-1: walls[0], 1: walls[2]},
               downpipe=False,
               avoid=[(x - 0.035, x + 0.035, -0.09, 0.05) for x, *_ in stacks])
    for x, y0, top, pots in stacks:
        chimney(m, M, x, -0.02, y0, top, w=0.07, d=0.14, mat=M["brick"], pots=pots)
    obj = skit.finish(m)
    return obj, {"windows": windows, "roofPads": [], "maxProps": 0}


def build():
    kit.reset()
    M = skit.palette()
    obj, info = build_terrace(M)
    skit.bake([obj])
    print("TRIS", obj.name, skit.triangles(obj))
    skit.write_meta(NAME, {obj.name: info})
    return [obj]


def preview(n):
    return build()
