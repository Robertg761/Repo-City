"""
Metropolis tiers 4-5: `tower-twin`. Two slender stone-banded shafts on one
podium, ribbon glass between proud stone spandrels, tied by a glazed
skybridge, each under a stepped crown and a mast. Stretched to about 7.5 x 28
x 7.5: heights nearly four times as long as widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (7.5, 28.0, 7.5)
PLINTH = 0.012
PODIUM = 0.16
HX, HZ, CX = 0.155, 0.3, 0.3
TOP = 0.95
BANDS = 12
SPANDREL = 0.42


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    head = 0.052
    band = dict(v=(0.022 + head) / 2, h=head - 0.022, depth=0.03, glass="lobby", sill="plinth", lit=False)
    ribbons = [dict(u=0, v=v, w=0.84, h=0.024, depth=0.028, glass="lobby", sill="trim", lit=False) for v in (0.09, 0.128)]
    door = dict(u=0, v=(PLINTH + head) / 2, w=0.16, h=head - PLINTH, depth=0.042, glass="door", lit=False, sill_face=False)
    openings = {f: ribbons + [dict(band, u=0, w=0.84)] for f in bkit.FACES}
    openings["+z"] = ribbons + [dict(band, u=-0.26, w=0.32), door, dict(band, u=0.26, w=0.32)]
    bkit.volume(d, PLINTH, PODIUM, 0.5, 0.5, openings, 0.05)
    d.box(0, head + 0.004, 0.5 + 0.045, 0.34, 0.008, 0.09, "trim", bottom=True)
    deck, _, _ = bkit.crown(d, PODIUM, 0.5, 0.5, 0.012, 0.01, 0.014, 0.012)
    step = (TOP - deck) / BANDS
    for n, s in enumerate((-1, 1)):
        bkit.curtain(d, deck, TOP, HX, HZ, BANDS, 1, SPANDREL, grade=(0.15, 0.95), cx=s * CX, sleeve="wall",
                     lit_every=2, lit_faces=("+z", "-z"), panes=1, seed=n * 3, chamfer=0.25)
        # The crown: a frame band, a stepped cap, a mast.
        d.box(s * CX, TOP, 0, HX * 2 + 0.05, 0.014, HZ * 2 + 0.05, "trim", bottom=True)
        d.box(s * CX, TOP + 0.014, 0, HX * 1.5, 0.026, HZ * 1.5, "wall", top="deck")
        top = TOP + 0.04
        d.prism_y(s * CX, 0, 0.012, top, top + 0.06, 6, "mech")
        d.pad(s * CX, -s * 0.13, top, 0.12, 0.08)
    # The skybridge fills one storey's glass between the sleeves, so its
    # lid and floor never lie a hair off a sleeve's top.
    i = BANDS // 2
    b0 = deck + step * (i + SPANDREL)
    b1 = deck + step * (i + 1)
    x = CX - HX + 0.005
    d.box(0, b0, 0, x * 2, b1 - b0, 0.2, "glass5@100", top="deck", bottom=True, skip=("+x", "-x"))
    for z in (0.1, -0.1):
        for u in (-0.045, 0, 0.045):
            pts = [(u - 0.004, b0, z), (u + 0.004, b0, z), (u + 0.004, b1, z), (u - 0.004, b1, z)]
            d.poly([(p[0], p[1], p[2] + (bkit.LAYER * 1.2 if z > 0 else -bkit.LAYER * 1.2)) for p in pts], "frame", (0, 0, z))
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.0)
