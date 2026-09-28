"""
Tier 1: the house (`house` in models.ts). A pitched roof with eaves and
verges that overhang and cast a shadow, a chimney, a door with a hood over it
and four windows set back in the wall. Unit space, stretched to about 4.4 x
4.2 x 4.4, so a unit is about the same in every direction.

    blender -b --python blender/export.py -- blender/buildings/house.py building-house
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (4.4, 4.2, 4.4)

PLINTH = 0.045
HW = 0.45           # wall half extent
EAVE_Z = 0.5        # eaves overhang in z
VERGE_X = 0.49      # verges overhang in x
EAVE_Y = 0.645      # top of the roof at the eave line
RIDGE_Y = 0.955     # top of the roof at the ridge
T = 0.028           # roof thickness (fascia)
DEPTH = 0.03        # window reveal


def roof_top(z):
    return RIDGE_Y - (RIDGE_Y - EAVE_Y) * abs(z) / EAVE_Z


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 0.95, PLINTH, 0.95, "plinth")
    # The side walls stop inside the roof slab, a hair under its top.
    wall_top = roof_top(HW) - T * 0.5
    d.core(PLINTH, wall_top, HW - DEPTH - 0.01, HW - DEPTH - 0.01)
    win = dict(v=0.3525, w=0.17, h=0.165, depth=DEPTH, glass="window", sill="trim", ledge=(0.022, 0.014, "trim"))
    door = dict(u=0, v=(PLINTH + 0.435) / 2, w=0.15, h=0.435 - PLINTH, depth=0.022, glass="door", lit=False, sill_face=False)
    for face, openings in (
        ("+z", [dict(win, u=-0.26), door, dict(win, u=0.26)]),
        ("-z", [dict(win, u=-0.2), dict(win, u=0.2)]),
    ):
        d.facade(face, HW, -HW, HW, PLINTH, wall_top, openings)
    for face in ("+x", "-x"):
        us, _ = d.facade(face, HW, -HW, HW, PLINTH, wall_top, [dict(win, u=0, w=0.2, v=0.345, h=0.17)], merge=False)
        # The gable, over every vertex the wall below has on its top edge.
        base = [bkit.face_point(face, HW, u, wall_top) for u in us]
        apex = bkit.face_point(face, HW, 0, roof_top(0) - T)
        d.poly(base + [apex], "wall", bkit.outward(face))

    # The roof: a slab with a real thickness, eaves and verges overhanging,
    # laid in four courses of slate.
    d.gable("x", VERGE_X, EAVE_Z, EAVE_Y, RIDGE_Y, T, courses=4, lap=0.012, cap=0.016)

    # The chimney, through the rear slope, with a projecting cap.
    cx, cz = 0.28, -0.22
    d.box(cx, roof_top(cz) - 0.06, cz, 0.11, RIDGE_Y + 0.05 - roof_top(cz) + 0.06, 0.11, "wallSoft", skip=("+y",))
    d.slab(RIDGE_Y + 0.05, 0.02, 0.07, 0.07, "trim", cx=cx, cz=cz)

    # A hood over the door on two brackets.
    hood_y = 0.435 + 0.03
    d.box(0, hood_y, HW + 0.045, 0.24, 0.02, 0.09, "trim", bottom=True)
    return d


def build():
    return bkit.build_model(make, SCALE, distance=2.0)
