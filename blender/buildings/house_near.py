"""
Near level of `house` (see house.py): same walls, roof, openings and outline,
with what a close camera sees added -- window frames with glazing bars, sills,
lintels and shutters, a panelled door with pilasters, a stone step and a hood
on corbels, quoins up the corners, slates laid in fourteen courses with their
joints and a ridge of cap tiles, gutters and downpipes, and a chimney with
corbelled courses, a cap and two pots.

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

COURSES = 14
LAP = 0.0036


def chimney(d, cx, cz, base_y, top_y):
    det = d.det
    w, dd = 0.11, 0.11
    d.box(cx, base_y, cz, w, top_y - base_y, dd, "wallSoft", skip=("+y",))
    # Corbelled courses under the cap: each a little wider than the last.
    ys = top_y - det.V(0.36)
    for k, grow in enumerate((0.03, 0.06, 0.09)):
        gx, gz = det.X(grow), det.Z(grow)
        d.box(cx, ys + det.V(0.055) * k, cz, w + 2 * gx, det.V(0.055), dd + 2 * gz, "trim", skip=())
    y = ys + det.V(0.055) * 3
    d.box(cx, y, cz, w + 2 * det.X(0.12), det.V(0.09), dd + 2 * det.Z(0.12), "trim", bottom=True)
    y += det.V(0.09)
    # The flaunching: a low pyramid of mortar the pots stand in.
    fx, fz = det.X(0.4), det.Z(0.4)
    hh = det.V(0.06)
    ring = [(cx + fx, cz + fz), (cx - fx, cz + fz), (cx - fx, cz - fz), (cx + fx, cz - fz)]
    inner = [(cx + fx * 0.72, cz + fz * 0.72), (cx - fx * 0.72, cz + fz * 0.72), (cx - fx * 0.72, cz - fz * 0.72), (cx + fx * 0.72, cz - fz * 0.72)]
    for i in range(4):
        j = (i + 1) % 4
        mid = ((ring[i][0] + ring[j][0]) / 2 - cx, 1.2, (ring[i][1] + ring[j][1]) / 2 - cz)
        d.poly([(ring[i][0], y, ring[i][1]), (ring[j][0], y, ring[j][1]), (inner[j][0], y + hh, inner[j][1]), (inner[i][0], y + hh, inner[i][1])], "wallSoft", mid)
    d.poly([(p[0], y + hh, p[1]) for p in inner], "wallSoft", (0, 1, 0))
    y += hh
    for dx in (-0.13, 0.13):
        x = cx + det.X(dx)
        det.cyl(x, cz, y, y + det.V(0.2), 0.075, "roofLight", n=10, r1=0.09)
        # The rim, its top dark: the flue.
        det.cyl(x, cz, y + det.V(0.2), y + det.V(0.235), 0.1, "roofLight", n=10, top_mat="window")


def make():
    d = nearkit.NearDraft(SCALE)
    det = d.det
    d.box(0, 0, 0, 0.95, PLINTH, 0.95, "plinth")
    wall_top = roof_top(HW) - T * 0.5
    d.core(PLINTH, wall_top, HW - DEPTH - 0.01, HW - DEPTH - 0.01)
    win = dict(v=0.3525, w=0.17, h=0.165, depth=DEPTH, glass="window", sill="trim")
    door = dict(u=0, v=(PLINTH + 0.435) / 2, w=0.15, h=0.435 - PLINTH, depth=0.022, glass="door", lit=False, sill_face=False,
                near={"door": {"head": False, "from_o": 0.475 - HW, "step_reach": 0.42, "limit": 0.54}})
    front_win = {}
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
    ccx, ccz = 0.28, -0.22
    det.ridge_tiles(0, 0.0, RIDGE_Y, VERGE_X - det.X(0.06), tile=0.34, half_w=0.1, rise=0.08, mat="roofLight")
    chimney(d, ccx, ccz, roof_top(ccz) - 0.06, RIDGE_Y + 0.02)

    det.quoins(HW, HW, PLINTH, wall_top - 0.01, proj=0.024, height=0.23, long_=0.34, short=0.2)

    # Gutters on the fascias, downpipes at two corners.
    for face in ("+z", "-z"):
        det.gutter_run(face, EAVE_Z, -(VERGE_X - 0.012), VERGE_X - 0.012, EAVE_Y - det.V(0.02))
    gy = EAVE_Y - det.V(0.02) - det.V(0.08)
    det.downpipe(0.5 - det.X(0.06) - 0.02, EAVE_Z + det.Z(0.05), 0.0, gy, r=0.036)
    det.downpipe(-(0.5 - det.X(0.06) - 0.02), -(EAVE_Z + det.Z(0.05)), 0.0, gy, r=0.036)

    # A hood over the door on two corbels, and a lantern beside it.
    hood_y = 0.435 + 0.03
    d.box(0, hood_y, HW + 0.045, 0.24, 0.02, 0.09, "trim", bottom=True)
    for s in (-1, 1):
        u = s * 0.108
        d.box(u, hood_y - det.V(0.2), HW + det.Z(0.035), det.X(0.05), det.V(0.2), det.Z(0.07), "trim", skip=("-z",))
    d.box(0.123, 0.33, HW + det.Z(0.03), det.X(0.08), det.V(0.2), det.Z(0.06), "mech", skip=("-z",))
    d.box(0.123, 0.335, HW + det.Z(0.13), det.X(0.1), det.V(0.17), det.Z(0.1), "window", skip=("-z",))
    return d


def build():
    return nearkit.build_near(make, SCALE, "BuildingNear", distance=2.0)
