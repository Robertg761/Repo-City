"""
Tiers 4-5: `tower-stepped`, three stacked volumes stepping in as they rise,
each of recessed bays between piers under its own cornice and parapet, the
top with a mast. Stretched to about 6 x 19 x 6: heights are three times as
long as widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import nkit  # noqa: E402

SCALE = (6.0, 19.0, 6.0)
PLINTH = 0.02
DEPTH = 0.035
STAGES = [
    # half, top, bay centres, bay width, lights
    (0.5, 0.44, (-0.3, 0, 0.3), 0.18, 5),
    (0.39, 0.768, (-0.15, 0.15), 0.2, 4),
    (0.28, 0.962, (0,), 0.26, 2),
]


def make(near=False):
    d = bkit.Draft(nkit.Near(SCALE) if near else None)
    if near:
        d.near.no_corbel = {("+z", 0.0)}
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    y = PLINTH
    for k, (hw, top, us, bw, lights) in enumerate(STAGES):
        openings = {}
        for face in bkit.FACES:
            lo = 0.095 if k == 0 else y + 0.035
            openings[face] = [bkit._bay(d, face, hw, u, bw, lo, top - 0.025, lights, DEPTH, 0.018) for u in us]
            if k == 0:
                head = 0.07
                if face == "+z":
                    openings[face].append(dict(u=0, v=(PLINTH + head) / 2, w=0.18, h=head - PLINTH, depth=DEPTH + 0.02, glass="door", lintel=False, lit=False, sill_face=False))
                    for u in (-0.3, 0.3):
                        openings[face].append(dict(u=u, v=0.05, w=0.2, h=0.04, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False))
                else:
                    openings[face].append(dict(u=0, v=0.05, w=0.8, h=0.04, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False))
        bkit.volume(d, y, top, hw, hw, openings, DEPTH + 0.02)
        proj = 0.02 if k < 2 else 0.018
        y, _, _ = bkit.crown(d, top, hw, hw, 0.016, proj, 0.024 if k < 2 else 0.018, 0.026, inset=0.06 if k == 2 else 0)
    d.box(0, 0.074, 0.5 + 0.035, 0.34, 0.008, 0.07, "trim", bottom=True)
    d.prism_y(0.08, -0.08, 0.016, y, y + 0.09, 6, "mech")
    d.pad(0.455, 0.1, STAGES[0][1] + 0.016, 0.06, 0.6)
    d.pad(0, 0.34, STAGES[1][1] + 0.016, 0.44, 0.06)
    if near:
        n = d.near
        low = PLINTH
        for hw, top, *_ in STAGES:
            n.quoins(d, hw, hw, low + (0.075 if hw == 0.5 else 0.035), top - n.uy(0.3))
            low = top
        n.canopy(d, "+z", 0.5, 0.0, 0.074, 0.34, 0.07, slab=False)
        n.mast(d, 0.08, -0.08, y, y + 0.09, 0.016)
        n.fan(d, -0.1, 0.02, y, n.ux(0.5))
        n.stack(d, -0.14, -0.14, y, n.ux(0.12), n.uy(1.2))
        n.louvred_box(d, 0.0, 0.14, y, 0.14, 0.1, n.uy(0.9))
        n.tank(d, 0.15, 0.13, y, 0.55, 1.1, ladder=(0, -1))
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 3}, distance=1.8)


def build_near():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 3}, distance=1.8, near=True)
