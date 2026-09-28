"""
Tiers 1-2: `warehouse-sawtooth`. A shed under five sawtooth roof lights,
each glazed face shaded by the lip of the tooth above it, a roll-up door set
deep in each end under a canopy, and a strip of high windows. Stretched to
about 6.5 x 5 x 6.5.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (6.5, 5.0, 6.5)
PLINTH = 0.05
HW = 0.48
TOP = 0.65
DEPTH = 0.03


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    high = dict(w=0.14, h=0.09, depth=DEPTH, glass="window", sill="trim")
    door = dict(u=0, v=(PLINTH + 0.4) / 2, w=0.38, h=0.4 - PLINTH, depth=0.06, glass="door", lit=False, sill_face=False, sill="plinth")
    ends = [door] + bkit.grid([-0.33, 0.33], [0.52], **high)
    sides = bkit.grid(bkit.spread(3, 0.6), [0.5], **high)
    bkit.volume(d, PLINTH, TOP, HW, HW, {"+z": ends, "-z": ends, "+x": sides, "-x": sides}, 0.07)
    # The roll-up doors' slats and a canopy over each.
    for face in ("+z", "-z"):
        for k in range(6):
            v = 0.1 + k * 0.05
            pts = [bkit.face_point(face, HW - 0.06 + bkit.LAYER * 2, u, v + dv) for u, dv in ((-0.17, 0), (0.17, 0), (0.17, 0.008), (-0.17, 0.008))]
            d.poly(pts, "mech", bkit.outward(face))
        s = 1 if face == "+z" else -1
        d.box(0, 0.43, s * (HW + 0.05), 0.5, 0.014, 0.1, "trim", bottom=True, skip=("-z",) if s > 0 else ("+z",))
    # The eaves band, then five teeth on it covering it exactly.
    band_h = 0.025
    d.box(0, TOP, 0, 1.0, band_h, 1.0, "trim", bottom=True, skip=("+y",))
    y0 = TOP + band_h
    teeth, rise = 5, 0.13
    w = 1.0 / teeth
    for i in range(teeth):
        x0, x1 = -0.5 + w * i, -0.5 + w * (i + 1)
        d.poly([(x0, y0, 0.5), (x1, y0 + rise, 0.5), (x1, y0 + rise, -0.5), (x0, y0, -0.5)], "roof", (-1, 1, 0))
        d.poly([(x1, y0, 0.5), (x1, y0 + rise, 0.5), (x1, y0 + rise, -0.5), (x1, y0, -0.5)], "glass", (1, 0, 0))
        for z in (0.5, -0.5):
            d.poly([(x0, y0, z), (x1, y0, z), (x1, y0 + rise, z)], "wall", (0, 0, z))
        # The lip over the glazing: a thin slab proud of it, its shadow on it.
        d.box(x1 - 0.012, y0 + rise - 0.003, 0, 0.04, 0.012, 0.97, "trim", bottom=True)
    # Two vents, because nothing else stands on a sawtooth roof.
    for x, z in ((-0.3, 0.28), (0.18, -0.26)):
        d.prism_y(x, z, 0.022, y0, y0 + 0.22, 6, "mech")
    return d


def build():
    return bkit.build_model(make, SCALE, distance=1.6)
