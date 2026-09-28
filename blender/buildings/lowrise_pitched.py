"""
Tier 2: `lowrise-pitched`, the working street of the city. Three storeys of
recessed windows under a slated roof whose gables face the street, eaves and
verges overhanging, with a dormer on each slope. Stretched to about 5 x 7 x 5:
heights are 1.4 times as long as widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (5.0, 7.0, 5.0)
PLINTH = 0.04
HW = 0.47
DEPTH = 0.033
EAVE_B, VERGE_A = 0.51, 0.505
EAVE_Y, RIDGE_Y, T = 0.735, 0.985, 0.024
ROWS = [0.2, 0.4, 0.6]


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 0.97, PLINTH, 0.97, "plinth")
    slope = lambda b: RIDGE_Y - (RIDGE_Y - EAVE_Y) * abs(b) / EAVE_B  # noqa: E731
    wall_top = slope(HW) - T * 0.5
    win = dict(w=0.15, h=0.1, depth=DEPTH, glass="window", sill="trim")
    front_cols = bkit.spread(3, HW * 2 * 0.64)
    side_cols = bkit.spread(2, HW * 2 * 0.5)
    front = bkit.grid(front_cols, ROWS[1:], **win) + bkit.grid([front_cols[0], front_cols[2]], ROWS[:1], **win)
    head = ROWS[0] + 0.05
    front.append(dict(u=0, v=(PLINTH + head) / 2, w=0.15, h=head - PLINTH, depth=DEPTH + 0.015, glass="door", lit=False, sill_face=False))
    back = bkit.grid(front_cols, ROWS, **win)
    side = bkit.grid(side_cols, ROWS, **win)
    d.core(PLINTH, wall_top, HW - DEPTH - 0.025, HW - DEPTH - 0.025)
    for face, openings in (("+z", front), ("-z", back)):
        d.facade(face, HW, -HW, HW, PLINTH, wall_top, openings)
        base = [bkit.face_point(face, HW, u, wall_top) for u in d.last_top]
        d.poly(base + [bkit.face_point(face, HW, 0, RIDGE_Y - T)], "wall", bkit.outward(face))
    for face in ("+x", "-x"):
        d.facade(face, HW, -HW, HW, PLINTH, wall_top, side)
    d.gable("z", VERGE_A, EAVE_B, EAVE_Y, RIDGE_Y, T, courses=4, lap=0.011, cap=0.014)
    # A hood over the door.
    d.box(0, head + 0.025, HW + 0.04, 0.24, 0.016, 0.08, "trim", bottom=True)
    # A dormer on each slope: a window in a cheeked box under a flat lid.
    for s, zc in ((1, 0.14), (-1, -0.14)):
        face = "+x" if s > 0 else "-x"
        x_front = s * 0.33
        y0 = slope(0.33) - 0.03
        y1 = y0 + 0.12
        wz = 0.18
        us = [-wz / 2, wz / 2]
        opening = dict(u=0, v=y0 + 0.07, w=0.1, h=0.07, depth=0.02, glass="window", sill="trim")
        d.facade(face, abs(x_front), -wz / 2, wz / 2, y0, y1, [opening], "wall", cz=-zc if s > 0 else zc)
        # Cheeks down to the slope, back to where the lid meets the roof.
        back_x = s * (EAVE_B - (y1 + 0.004 - EAVE_Y) * EAVE_B / (RIDGE_Y - EAVE_Y))
        for zz in (-wz / 2, wz / 2):
            zz_ = zz + (-zc if s > 0 else zc)
            d.poly([(x_front, y0, zz_), (x_front, y1, zz_), (back_x, y1, zz_)], "wall", (0, 0, 1 if zz > 0 else -1))
        del us
        d.box((x_front + back_x) / 2 + s * 0.012, y1, -zc if s > 0 else zc, abs(back_x - x_front) + 0.024, 0.014, wz + 0.03, "roofLight", bottom=True)
    return d


def build():
    return bkit.build_model(make, SCALE, distance=1.6)
