"""
Near level of `lowrise-pitched` (see lowrise_pitched.py): the three-storey
working street building with what a close camera sees added -- framed windows
with glazing bars, sills and lintels, a panelled door with pilasters, steps and
a hood on corbels, string courses and quoins, a round attic light in each
gable, slates in eighteen courses with joints and a ridge of cap tiles, gutters
and downpipes, and dormers dressed like the storeys below.

    blender -b --python blender/export.py -- blender/buildings/pitched_near.py building-lowrise-pitched-near
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import nearkit  # noqa: E402
from lowrise_pitched import DEPTH, EAVE_B, EAVE_Y, HW, PLINTH, RIDGE_Y, ROWS, SCALE, T, VERGE_A  # noqa: E402

COURSES = 18
LAP = 0.0028


def make():
    d = nearkit.NearDraft(SCALE)
    det = d.det
    d.vlines = [0.288, 0.322, 0.4885, 0.5215]
    d.box(0, 0, 0, 0.97, PLINTH, 0.97, "plinth")
    slope = lambda b: RIDGE_Y - (RIDGE_Y - EAVE_Y) * abs(b) / EAVE_B  # noqa: E731
    wall_top = slope(HW) - T * 0.5
    win = dict(w=0.15, h=0.1, depth=DEPTH, glass="window", sill="trim")
    front_cols = bkit.spread(3, HW * 2 * 0.64)
    side_cols = bkit.spread(2, HW * 2 * 0.5)
    front = bkit.grid(front_cols, ROWS[1:], **win) + bkit.grid([front_cols[0], front_cols[2]], ROWS[:1], **win)
    head = ROWS[0] + 0.05
    front.append(dict(u=0, v=(PLINTH + head) / 2, w=0.15, h=head - PLINTH, depth=DEPTH + 0.015, glass="door", lit=False, sill_face=False,
                      near={"door": {"head": False, "from_o": 0.485 - HW, "limit": 0.55, "step_reach": 0.5}}))
    back = bkit.grid(front_cols, ROWS, **win)
    side = bkit.grid(side_cols, ROWS, **win)
    d.core(PLINTH, wall_top, HW - DEPTH - 0.025, HW - DEPTH - 0.025)
    for face, openings in (("+z", front), ("-z", back)):
        d.facade(face, HW, -HW, HW, PLINTH, wall_top, openings)
        base = [bkit.face_point(face, HW, u, wall_top) for u in d.last_top]
        d.poly(base + [bkit.face_point(face, HW, 0, RIDGE_Y - T)], "wall", bkit.outward(face))
        # A round attic light in the gable, over the top row of windows.
        det.oculus(face, HW, 0.0, 0.795, 0.3)
    for face in ("+x", "-x"):
        d.facade(face, HW, -HW, HW, PLINTH, wall_top, side)
    d.gable("z", VERGE_A, EAVE_B, EAVE_Y, RIDGE_Y, T, courses=COURSES, lap=LAP, cap=0)
    det.ridge_tiles(0, 0.0, RIDGE_Y, VERGE_A - det.Z(0.06), tile=0.34, half_w=0.1, rise=0.08, mat="roofLight", along_x=False)

    # A hood over the door on corbels.
    hy = head + 0.025
    d.box(0, hy, HW + 0.04, 0.24, 0.016, 0.08, "trim", bottom=True)
    for s in (-1, 1):
        u = s * 0.108
        d.box(u, hy - det.V(0.2), HW + det.Z(0.035), det.X(0.05), det.V(0.2), det.Z(0.07), "trim", skip=("-z",))

    # Dormers: a window in a cheeked box under a flat lid, as the lean model has them.
    for s, zc in ((1, 0.14), (-1, -0.14)):
        face = "+x" if s > 0 else "-x"
        x_front = s * 0.33
        y0 = slope(0.33) - 0.03
        y1 = y0 + 0.12
        wz = 0.18
        opening = dict(u=0, v=y0 + 0.07, w=0.1, h=0.07, depth=0.02, glass="window", sill="trim", near={"lintel": False, "jambs": False, "bars": (2, 1)})
        d.facade(face, abs(x_front), -wz / 2, wz / 2, y0, y1, [opening], "wall", cz=-zc if s > 0 else zc)
        back_x = s * (EAVE_B - (y1 + 0.004 - EAVE_Y) * EAVE_B / (RIDGE_Y - EAVE_Y))
        for zz in (-wz / 2, wz / 2):
            zz_ = zz + (-zc if s > 0 else zc)
            d.poly([(x_front, y0, zz_), (x_front, y1, zz_), (back_x, y1, zz_)], "wall", (0, 0, 1 if zz > 0 else -1))
        d.box((x_front + back_x) / 2 + s * 0.012, y1, -zc if s > 0 else zc, abs(back_x - x_front) + 0.024, 0.014, wz + 0.03, "roofLight", bottom=True)

    det.quoins(HW, HW, PLINTH, wall_top - 0.01, proj=0.024, height=0.3, long_=0.3, short=0.2)
    det.band(HW, HW, 0.302, 0.32, 0.03, "trim", gaps={"+z": [(-0.1, 0.1)]}, corner_gap=0.5)
    det.band(HW, HW, 0.5, 0.518, 0.03, "trim", corner_gap=0.5)

    # Gutters along the eaves, downpipes at the front corners.
    for face in ("+x", "-x"):
        det.gutter_run(face, EAVE_B, -(VERGE_A - 0.012), VERGE_A - 0.012, EAVE_Y - det.V(0.02))
    gy = EAVE_Y - det.V(0.02) - det.V(0.08)
    for sx, sz in ((1, 1), (-1, -1)):
        det.downpipe(sx * (EAVE_B + det.X(0.05)), sz * (VERGE_A - det.Z(0.1)), 0.0, gy, r=0.036)
    return d


def build():
    return nearkit.build_near(make, SCALE, "BuildingNear", distance=1.6)
