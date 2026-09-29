"""
Near level of `house` (see house.py): same walls, roof, openings and outline,
with what a close camera sees added -- sash windows with meeting rails and
horns, sloped sills on aprons, flat arches of jointed stones with keystones,
architraves and planted window boxes; a panelled door with hinges, knocker,
letterbox, number plate, pilasters and nosed steps beside a boot scraper, and
a hood on scrolled brackets with a lantern; quoins up the corners, a course
of dentils under the eaves, slates laid in courses with their joints and a
ridge of cap tiles with finials, bargeboards on the verges, gutters with
hoppers and downpipes; and a chimney with banded brickwork, corbelled
courses, lead flashing, flaunching and pots, and a dish under the gable.

    blender -b --python blender/export.py -- blender/buildings/house_near.py building-house-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import house as lean  # noqa: E402
import nearkit  # noqa: E402
from house import DEPTH, EAVE_Y, EAVE_Z, HW, PLINTH, RIDGE_Y, T, SCALE, VERGE_X, roof_top  # noqa: E402

COURSES = 16
LAP = 0.0033


def flashing(d, cx, cz, hw, hd, lift=0.024, length=0.16, rise=0.11, mat="metal"):
    """A lead apron round the foot of a stack on the rear slope: a skirt up
    the slope, one down it and one down each side, each lifted off the
    slates and turned up the shaft."""
    det = d.det
    L, Ll = det.Z(length), det.X(length)
    up, lf, rs = det.V(lift), None, det.V(rise)
    y = lambda z: roof_top(z)  # noqa: E731
    # Down the slope (towards -z, the eave) and up it (towards the ridge).
    for s in (-1, 1):
        zf = cz + s * hd
        zo = zf + s * L
        d.poly([(cx - hw - Ll, y(zo) + up, zo), (cx + hw + Ll, y(zo) + up, zo), (cx + hw + Ll, y(zf) + rs, zf), (cx - hw - Ll, y(zf) + rs, zf)], mat, (0, 1, s * 0.6))
        # Its edge, a hair of thickness.
        d.poly([(cx - hw - Ll, y(zo), zo), (cx + hw + Ll, y(zo), zo), (cx + hw + Ll, y(zo) + up, zo), (cx - hw - Ll, y(zo) + up, zo)], mat, (0, 0, s))
    for s in (-1, 1):
        xf = cx + s * hw
        xo = xf + s * Ll
        z0, z1 = cz - hd, cz + hd
        d.poly([(xo, y(z0) + up, z0), (xo, y(z1) + up, z1), (xf, y(z1) + rs, z1), (xf, y(z0) + rs, z0)], mat, (s * 0.6, 1, 0))
        d.poly([(xo, y(z0), z0), (xo, y(z1), z1), (xo, y(z1) + up, z1), (xo, y(z0) + up, z0)], mat, (s, 0, 0))


def pot(d, x, z, y, r=0.078, h=0.3):
    """A chimney pot: a tapering barrel with a bead, a thickened rim and the dark flue."""
    det = d.det
    det.cyl(x, z, y, y + det.V(h * 0.62), r, "roofLight", n=12, r1=r * 1.22)
    det.cyl(x, z, y + det.V(h * 0.62), y + det.V(h * 0.72), r * 1.28, "roofLight", n=12, r1=r * 1.0)
    det.cyl(x, z, y + det.V(h * 0.72), y + det.V(h * 0.9), r * 0.92, "roofLight", n=12, r1=r * 1.14)
    det.cyl(x, z, y + det.V(h * 0.9), y + det.V(h), r * 1.16, "roofLight", n=12, r1=r * 0.98, top_mat="window")


def chimney(d, cx, cz, base_y, top_y):
    det = d.det
    w, dd = 0.11, 0.11
    d.box(cx, base_y, cz, w, top_y - base_y, dd, "wallSoft", skip=("+y",))
    # Bands of brick standing proud of the shaft, a header course each.
    for k, fy in enumerate((0.25, 0.5, 0.75)):
        y = base_y + (top_y - base_y - det.V(0.4)) * fy
        gx, gz = det.X(0.03), det.Z(0.03)
        d.box(cx, y, cz, w + 2 * gx, det.V(0.09), dd + 2 * gz, "brick", skip=())
    # Corbelled courses under the cap: each a little wider than the last.
    ys = top_y - det.V(0.36)
    for k, grow in enumerate((0.04, 0.075, 0.11)):
        gx, gz = det.X(grow), det.Z(grow)
        d.box(cx, ys + det.V(0.055) * k, cz, w + 2 * gx, det.V(0.055), dd + 2 * gz, "trim" if k == 2 else "brick", skip=())
    y = ys + det.V(0.055) * 3
    d.box(cx, y, cz, w + 2 * det.X(0.15), det.V(0.09), dd + 2 * det.Z(0.15), "trim", bottom=True)
    y += det.V(0.09)
    # The flaunching: a low pyramid of mortar the pots stand in.
    fx, fz = det.X(0.4), det.Z(0.4)
    hh = det.V(0.07)
    ring = [(cx + fx, cz + fz), (cx - fx, cz + fz), (cx - fx, cz - fz), (cx + fx, cz - fz)]
    inner = [(cx + fx * 0.74, cz + fz * 0.74), (cx - fx * 0.74, cz + fz * 0.74), (cx - fx * 0.74, cz - fz * 0.74), (cx + fx * 0.74, cz - fz * 0.74)]
    for i in range(4):
        j = (i + 1) % 4
        mid = ((ring[i][0] + ring[j][0]) / 2 - cx, 1.2, (ring[i][1] + ring[j][1]) / 2 - cz)
        d.poly([(ring[i][0], y, ring[i][1]), (ring[j][0], y, ring[j][1]), (inner[j][0], y + hh, inner[j][1]), (inner[i][0], y + hh, inner[i][1])], "wallSoft", mid)
    d.poly([(p[0], y + hh, p[1]) for p in inner], "wallSoft", (0, 1, 0))
    y += hh
    for dx in (-0.13, 0.13):
        pot(d, cx + det.X(dx), cz, y)


def dormer(d, u=0.0, zf=0.3, w=0.115):
    """A gabled dormer on the front slope: a cheeked box with a sash window
    in its face, a pitched roof of its own falling to the main slope, a
    ridge of cap tiles, and lead flashing where its roof lands."""
    det = d.det
    y0 = roof_top(zf) - 0.03
    y1 = y0 + 0.13
    gh = 0.055
    yr = y1 + gh
    slope_z = lambda y: (RIDGE_Y - y) / (RIDGE_Y - EAVE_Y) * EAVE_Z  # noqa: E731
    zb, zr = slope_z(y1), slope_z(yr)
    opening = dict(u=0, v=y0 + 0.075, w=0.09, h=0.07, depth=0.022, glass="window", lit=False, near={"lintel": False, "jambs": False, "bars": (2, 1), "lite": True, "sill": 0.09})
    d.facade("+z", zf, u - w, u + w, y0, y1, [opening], "wall", cx=0.0)
    d.poly([(u - w, y1, zf), (u + w, y1, zf), (u, yr, zf)], "wall", (0, 0, 1))
    for s in (-1, 1):
        x = u + s * w
        d.poly([(x, y0, zf), (x, y1, zf), (x, y1, zb)], "wall", (s, 0, 0))
    # The roof: two planes from the eaves to the ridge, a little over the walls.
    ov = 0.012
    ye, yt = y1 - 0.006, yr + 0.004
    zb2, zr2 = slope_z(ye), slope_z(yt)
    for s in (-1, 1):
        d.poly([(u + s * (w + ov), ye, zf + 0.02), (u, yt, zf + 0.02), (u, yt, zr2), (u + s * (w + ov), ye, zb2)], "roof", (s * 0.5, 1, 0))
        # The verge: the edge of each plane along the gable's front, a board's thickness.
        d.poly([(u + s * (w + ov), ye - det.V(0.1), zf + 0.02), (u, yt - det.V(0.1), zf + 0.02), (u, yt, zf + 0.02), (u + s * (w + ov), ye, zf + 0.02)], "trim", (0, 0, 1))
    d.box(u, yt, (zf + zr2) / 2 + 0.01, det.X(0.14), det.V(0.06), zf + 0.02 - zr2, "roofLight")
    # The dormer's own ridge finial.
    det.finial(u, zf + 0.02 - det.Z(0.1), yt + det.V(0.06), mat="roofLight", h=0.2, r=0.04)


def make():
    d = nearkit.NearDraft(SCALE)
    det = d.det
    d.box(0, 0, 0, 0.95, PLINTH, 0.95, "plinth")
    wall_top = roof_top(HW) - T * 0.5
    d.core(PLINTH, wall_top, HW - DEPTH - 0.01, HW - DEPTH - 0.01)
    box = dict(plants=("leaf", "leaf", "bloom", "leaf"))
    win = dict(v=0.3525, w=0.17, h=0.165, depth=DEPTH, glass="window", sill="trim")
    door = dict(u=0, v=(PLINTH + 0.435) / 2, w=0.15, h=0.435 - PLINTH, depth=0.022, glass="door", lit=False, sill_face=False,
                near={"door": {"head": False, "from_o": 0.475 - HW, "step_reach": 0.46, "limit": 0.54, "number": 2}})
    front_win = {"near": {"box": box}}
    for face, openings in (
        ("+z", [dict(win, u=-0.26, **front_win), door, dict(win, u=0.26, **front_win)]),
        ("-z", [dict(win, u=-0.2), dict(win, u=0.2)]),
    ):
        d.facade(face, HW, -HW, HW, PLINTH, wall_top, openings)
    for face in ("+x", "-x"):
        us, _ = d.facade(face, HW, -HW, HW, PLINTH, wall_top, [dict(win, u=0, w=0.2, v=0.345, h=0.17)])
        base = [bkit.face_point(face, HW, u, wall_top) for u in d.last_top]
        apex = bkit.face_point(face, HW, 0, roof_top(0) - T)
        d.poly(base + [apex], "wall", bkit.outward(face))

    d.gable("x", VERGE_X, EAVE_Z, EAVE_Y, RIDGE_Y, T, courses=COURSES, lap=LAP, cap=0)
    dormer(d)
    ccx, ccz = 0.28, -0.22
    fin = det.X(0.2)
    det.ridge_tiles(0, 0.0, RIDGE_Y, VERGE_X - det.X(0.34), tile=0.34, half_w=0.1, rise=0.08, mat="roofLight")
    for s in (-1, 1):
        det.finial(s * (VERGE_X - fin - det.X(0.1)), 0.0, RIDGE_Y + det.V(0.06), mat="roofLight", h=0.26, r=0.06)
    det.bargeboard("x", VERGE_X, EAVE_Z, EAVE_Y, RIDGE_Y, mat="trim", drop=0.24, lap=LAP)
    chimney(d, ccx, ccz, roof_top(ccz) - 0.06, RIDGE_Y + 0.02)
    flashing(d, ccx, ccz, 0.055, 0.055)

    det.quoins(HW, HW, PLINTH, wall_top - 0.01, proj=0.024, height=0.23, long_=0.34, short=0.2)
    # The plinth in brick, stopping where the door's steps stand.
    det.brick_box(0.475, 0.475, 0.0, PLINTH, proud=0.024, gaps={"+z": [(-0.32, 0.32)]})
    # A stone water table over the plinth, stopping short of the quoins and the door's step.
    det.profile_band(HW, HW, PLINTH, [(0.0, 0.0), (0.038, 0.0), (0.038, 0.06), (0.0, 0.12)], "trim", corner_gap=0.42, gaps={"+z": [(-0.22, 0.22)]})
    # A course of dentils under the eaves, front and back.
    det.corbel_course(HW - det.X(0.1), HW, roof_top(HW) - T - det.V(0.11), mat="brick", proj=0.03, faces=("+z", "-z"))
    # Gutters on the fascias, downpipes and hoppers at two corners.
    for face in ("+z", "-z"):
        det.gutter_run(face, EAVE_Z, -(VERGE_X - 0.012), VERGE_X - 0.012, EAVE_Y - det.V(0.02))
    gy = EAVE_Y - det.V(0.02) - det.V(0.08)
    det.downpipe(0.5 - det.X(0.06) - 0.02, EAVE_Z + det.Z(0.05), 0.0, gy - det.V(0.24), r=0.036)
    det.downpipe(-(0.5 - det.X(0.06) - 0.02), -(EAVE_Z + det.Z(0.05)), 0.0, gy - det.V(0.24), r=0.036)
    det.hopper("+z", EAVE_Z + det.Z(0.05) - det.Z(0.06), 0.5 - det.X(0.06) - 0.02, gy - det.V(0.03))
    det.hopper("-z", EAVE_Z + det.Z(0.05) - det.Z(0.06), 0.5 - det.X(0.06) - 0.02, gy - det.V(0.03))

    # A hood over the door on two scrolled brackets, and a lantern beside it.
    hood_y = 0.435 + 0.03
    d.box(0, hood_y, HW + 0.045, 0.24, 0.02, 0.09, "trim", bottom=True)
    for s in (-1, 1):
        u = s * 0.108
        det.profile("+z", HW, u - det.U("+z", 0.03), u + det.U("+z", 0.03), hood_y - det.V(0.24),
                    [(0.0, 0.0), (0.03, 0.0), (0.03, 0.12), (0.19, 0.17), (0.19, 0.24), (0.0, 0.24)], "trim", skip=(5,))
    det.lamp("+z", HW, 0.123, 0.33, arm=0.1)
    # A satellite dish on the back wall, under the eaves.
    det.dish("-z", HW, -0.34, 0.53, r=0.22, arm=0.08, feed=0.1, dep=0.06)
    return d


def build():
    return nearkit.build_near(make, SCALE, "BuildingNear", distance=2.0, lean_glb="building-house.glb")
