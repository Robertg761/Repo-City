"""
The village barn (spike: Blender vs procedural).

Same unit space, footprint and heights as `barn()` in
`components/city/models/buildings/village.ts`: board-and-batten walls in the
barn's paint under a gambrel roof, braced doors and a hay loft on the lane
gable, a cupola on the ridge, and a concrete silo beside it. The script adds
battens that stand off the boards (and stop round the windows), standing
seams folded up out of the roof sheet, doors set into the gable, hooped silo
rings that stand proud, a domed silo cap, and baked occlusion.

    blender -b --python blender/export.py -- blender/settlement/barn.py barn
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
from skit import LAYER, Hole, Mesh, recess, wall, window  # noqa: E402

NAME = "barn"
CX = -0.12
HALF_W = 0.31
HALF_D = 0.45
PLINTH = 0.035
PLINTH_OUT = 0.025
EAVE = (HALF_W + 0.04, 0.46)
KNEE = (0.2, 0.72)
RIDGE_Y = 0.86
SLOPE_LOW = (KNEE[1] - EAVE[1]) / (EAVE[0] - KNEE[0])
AT_WALL = EAVE[1] + (EAVE[0] - HALF_W) * SLOPE_LOW


def half_width(y):
    """The gable's half width at height y: the gambrel's outline."""
    if y <= AT_WALL:
        return HALF_W
    if y <= KNEE[1]:
        return HALF_W + (KNEE[0] - HALF_W) * (y - AT_WALL) / (KNEE[1] - AT_WALL)
    return KNEE[0] * (RIDGE_Y - y) / (RIDGE_Y - KNEE[1])


def gable(m, M, end, hole=None):
    """The gable end above the wall plate, round an optional hole."""
    z = end * HALF_D
    facing = "+z" if end > 0 else "-z"
    out = (0, 0, end)
    ys = sorted({AT_WALL, KNEE[1], *([hole.v0, hole.v1] if hole else [])})
    # With u along the facing (mirrored on -z), x = CX + u * end.
    X = lambda u: CX + u * end  # noqa: E731
    for ya, yb in zip(ys, ys[1:]):
        wa, wb = half_width(ya), half_width(yb)
        inside = hole and hole.v0 <= ya + 1e-9 and yb <= hole.v1 + 1e-9
        if inside:
            m.face([(X(-wa), ya, z), (X(hole.u0), ya, z), (X(hole.u0), yb, z), (X(-wb), yb, z)], M["wall"], out=out)
            m.face([(X(hole.u1), ya, z), (X(wa), ya, z), (X(wb), yb, z), (X(hole.u1), yb, z)], M["wall"], out=out)
        else:
            m.face([(X(-wa), ya, z), (X(wa), ya, z), (X(wb), yb, z), (X(-wb), yb, z)], M["wall"], out=out)
    m.face([(X(-KNEE[0]), KNEE[1], z), (X(KNEE[0]), KNEE[1], z), (X(0), RIDGE_Y - 0.006, z)], M["wall"], out=out)


def roof(m, M):
    """The gambrel: two pitches a side, each a slab, with standing seams
    folded up out of the sheet running eave to ridge."""
    t = 0.028
    rz = HALF_D + 0.03
    for side in (1, -1):
        for (xa, ya), (xb, yb) in ((EAVE, KNEE), (KNEE, (0.0, RIDGE_Y))):
            profile = [(CX + side * xa, ya), (CX + side * xb, yb), (CX + side * xb, yb - t), (CX + side * xa, ya - t)]
            m.prism_z(profile, -rz, rz, M["barnRoof"])
        # Seams: a low ridge of sheet, triangular, along the slope.
        for zc in (-0.3, -0.15, 0.0, 0.15, 0.3):
            pts = [(EAVE[0], EAVE[1]), (KNEE[0], KNEE[1]), (0.03, RIDGE_Y - 0.03 * (RIDGE_Y - KNEE[1]) / KNEE[0])]
            for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
                dx, dy = xb - xa, yb - ya
                ln = math.hypot(dx, dy)
                nx, ny = -dy / ln * side, dx / ln
                # Normal of the slope, pointing out and up.
                if ny < 0:
                    nx, ny = -nx, -ny
                h = 0.012
                for s in (-1, 1):
                    quad = [
                        (CX + side * xa, ya, zc + s * 0.009),
                        (CX + side * xb, yb, zc + s * 0.009),
                        (CX + side * xb + nx * h, yb + ny * h, zc),
                        (CX + side * xa + nx * h, ya + ny * h, zc),
                    ]
                    m.face(quad, M["barnRoof"], out=(nx * 0.3, ny * 0.3, s))
    # The seams' ends at the eave are open to nothing: closed by the slab.


def build_barn(M):
    m = Mesh("Barn")
    x0, x1 = CX - HALF_W, CX + HALF_W
    m.box(x0 - PLINTH_OUT, x1 + PLINTH_OUT, 0, PLINTH, -HALF_D - PLINTH_OUT, HALF_D + PLINTH_OUT, M["stoneDark"], skip=("bottom",))
    holes = {f: [] for f in ("+z", "-z", "+x", "-x")}
    windows = []
    # Windows on the long walls sit into the boards.
    for facing, u in (("+x", 0.28), ("-x", -0.28), ("-x", 0.28)):
        windows.append(window(m, M, facing, HALF_W, u, 0.3, 0.09, 0.08, cx=CX, holes=holes[facing], depth=0.018))
    windows.append(window(m, M, "-z", HALF_D, 0.0, 0.35, 0.1, 0.09, cx=CX, holes=holes["-z"], depth=0.018))

    # The big doors on the lane gable, set in, braced in white.
    door_w, door_h = 0.34, 0.36
    dh = Hole(-door_w / 2, door_w / 2, PLINTH, PLINTH + door_h)
    holes["+z"].append(dh)
    depth = 0.022
    recess(m, "+z", HALF_D, dh, depth, M["frame"], M["wallDeep"], cx=CX, floor=False)
    back = HALF_D - depth
    bt = 0.018
    zb = back + LAYER
    xa, xb = CX - door_w / 2, CX + door_w / 2
    ya, yb = PLINTH, PLINTH + door_h
    # Stiles and rails on one layer, cut so none overlaps another.
    for xs in (xa, CX - bt / 2, xb - bt):
        m.face([(xs, ya, zb), (xs + bt, ya, zb), (xs + bt, yb, zb), (xs, yb, zb)], M["frame"], out=(0, 0, 1))
    for xs0, xs1 in ((xa + bt, CX - bt / 2), (CX + bt / 2, xb - bt)):
        for yr0, yr1 in ((ya, ya + bt), (yb - bt, yb)):
            m.face([(xs0, yr0, zb), (xs1, yr0, zb), (xs1, yr1, zb), (xs0, yr1, zb)], M["frame"], out=(0, 0, 1))
    # The diagonals a layer out, and each X's second one a layer further.
    for k, (xs0, xs1) in enumerate(((xa + bt, CX - bt / 2), (CX + bt / 2, xb - bt))):
        for j, ((p0, p1)) in enumerate((((xs0, ya + bt), (xs1, yb - bt)), ((xs0, yb - bt), (xs1, ya + bt)))):
            z = zb + LAYER * (1 + j)
            dx, dy = p1[0] - p0[0], p1[1] - p0[1]
            ln = math.hypot(dx, dy)
            nx, ny = -dy / ln * bt / 2, dx / ln * bt / 2
            m.face([(p0[0] - nx, p0[1] - ny, z), (p1[0] - nx, p1[1] - ny, z), (p1[0] + nx, p1[1] + ny, z), (p0[0] + nx, p0[1] + ny, z)], M["frame"], out=(0, 0, 1))

    # The walls, and the battens that stand off the boards of the long walls.
    for facing, plane, half in (("+z", HALF_D, HALF_W), ("-z", HALF_D, HALF_W), ("+x", HALF_W, HALF_D), ("-x", HALF_W, HALF_D)):
        wall(m, facing, plane, -half, half, PLINTH, AT_WALL, holes[facing], M["wall"], cx=CX, cuts=(0.2,))
    for facing in ("+x", "-x"):
        for i in range(7):
            u = -HALF_D + 0.07 + i * ((HALF_D * 2 - 0.14) / 6)
            u0, u1 = u - 0.008, u + 0.008
            spans = [(PLINTH, 0.5)]
            for h in holes[facing]:
                if h.u1 + 0.012 > u0 and h.u0 - 0.012 < u1:
                    # Stop under the sill and start again over the head.
                    spans = [(PLINTH, h.v0 - 0.016), (h.v1, 0.5)]
            for v0, v1 in spans:
                m.wall_box(facing, HALF_W, u0, u1, v0, v1, 0.012, M["wallDeep"], cx=CX, skip=("back", "bottom", "top"))
        # Their tops are in the roof slab; their feet on the plinth.

    # The gables: the lane end with the hay loft's hatch, the back plain.
    hatch = Hole(-0.065, 0.065, 0.54, 0.66)
    gable(m, M, 1, hatch)
    gable(m, M, -1)
    recess(m, "+z", HALF_D, hatch, 0.03, M["frame"], M["hay"], cx=CX)
    # The hoist beam over the hatch.
    m.box(CX - 0.015, CX + 0.015, 0.71, 0.74, HALF_D - 0.01, HALF_D + 0.11, M["timberDark"], skip=("nz",))

    roof(m, M)

    # The cupola on the ridge: louvred sides and a pyramid cap.
    cy0, cy1 = RIDGE_Y - 0.03, RIDGE_Y + 0.06
    m.box(CX - 0.04, CX + 0.04, cy0, cy1, -0.04, 0.04, M["frame"], skip=("bottom", "top"))
    for facing in ("+x", "-x", "+z", "-z"):
        m.rect(facing, 0.04 + LAYER, -0.022, 0.022, RIDGE_Y, RIDGE_Y + 0.042, M["timberDark"], cx=CX)
    m.box(CX - 0.06, CX + 0.06, cy1, cy1 + 0.012, -0.06, 0.06, M["barnRoof"], skip=("top",))
    apex = (CX, cy1 + 0.062, 0.0)
    for a, b in (((-1, 1), (1, 1)), ((1, 1), (1, -1)), ((1, -1), (-1, -1)), ((-1, -1), (-1, 1))):
        m.face([(CX + a[0] * 0.06, cy1 + 0.012, a[1] * 0.06), (CX + b[0] * 0.06, cy1 + 0.012, b[1] * 0.06), apex], M["barnRoof"], inside=(CX, cy1, 0))

    # The silo: concrete, three hoops standing proud, a domed cap.
    sx, sz, r = 0.35, -0.2, 0.115
    seg = 12
    ring = lambda rr, y: [(sx + math.cos(2 * math.pi * i / seg) * rr, y, sz + math.sin(2 * math.pi * i / seg) * rr) for i in range(seg)]  # noqa: E731
    skit.loft_rings(m, [ring(r, 0.0), ring(r, 0.45), ring(r, 0.9)], [M["concrete"], M["concrete"]], ["out", "out"], axis=(sx, sx, sz, 0))
    for hy in (0.22, 0.46, 0.7):
        lo, hi = ring(r + 0.013, hy), ring(r + 0.013, hy + 0.02)
        skit.loft_rings(m, [lo, hi], [M["concreteDark"]], ["out"], axis=(sx, sx, sz, 0))
        # The hoop's top and bottom: annuli between the hoop and the silo.
        skit.loft_rings(m, [ring(r, hy + 0.02), hi], [M["concreteDark"]], ["up"], axis=(sx, sx, sz, 0))
        skit.loft_rings(m, [ring(r, hy), lo], [M["concreteDark"]], ["down"], axis=(sx, sx, sz, 0))
    dome = [ring(r + 0.008, 0.9), ring(r * 0.8, 0.96), ring(r * 0.42, 0.995)]
    skit.loft_rings(m, [ring(r, 0.9)] + dome, [M["metal"]] * 3, ["down", "out", "out"], axis=(sx, sx, sz, 0))
    m.face(dome[-1], M["metal"], out=(0, 1, 0))
    # A chute from the silo into the barn, under the eave.
    m.box(x1, sx - r + 0.012, 0.37, 0.42, sz - 0.025, sz + 0.025, M["metal"], skip=("nx",))

    obj = skit.finish(m)
    return obj, {"windows": windows, "roofPads": [], "maxProps": 0}


def build():
    kit.reset()
    M = skit.palette()
    obj, info = build_barn(M)
    skit.bake([obj])
    print("TRIS", obj.name, skit.triangles(obj))
    skit.write_meta(NAME, {obj.name: info})
    return [obj]


def preview(n):
    return build()
