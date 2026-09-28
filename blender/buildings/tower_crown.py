"""
Tier 5: `tower-crown`, the landmark tower. A shaft of three tall recessed bays
a face between proud piers, a glazed lobby at its foot, a deep cornice, and a
stepped crown with a lantern storey and a mast. Stretched to about 6 x 23 x 6:
heights are nearly four times as long as widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (6.0, 23.0, 6.0)
PLINTH = 0.018
HW = 0.46
TOP = 0.86
DEPTH = 0.035


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    openings = {}
    for face in bkit.FACES:
        bays = [bkit._bay(d, face, HW, u, 0.19, 0.095, TOP - 0.03, 8, DEPTH, 0.016) for u in (-0.29, 0, 0.29)]
        head = 0.07
        if face == "+z":
            bays.append(dict(u=0, v=(PLINTH + head) / 2, w=0.19, h=head - PLINTH, depth=DEPTH + 0.02, glass="door", lit=False, sill_face=False))
            for u in (-0.29, 0.29):
                bays.append(dict(u=u, v=0.047, w=0.19, h=0.04, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False))
        else:
            bays.append(dict(u=0, v=0.047, w=0.77, h=0.04, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False))
        openings[face] = bays
    bkit.volume(d, PLINTH, TOP, HW, HW, openings, DEPTH + 0.02)
    # Piers proud between the bays, up to the cornice: the tower's grain.
    for face in bkit.FACES:
        bkit.fins(d, face, HW, [-0.145, 0.145], 0.075, TOP, 0.05, 0.016, 0.0, back_face=True)
    d.box(0, 0.075, HW + 0.035, 0.22, 0.01, 0.07, "trim", bottom=True)
    deck, _, _ = bkit.crown(d, TOP, HW, HW, 0.024, 0.03, 0.022, 0.03, inset=0)
    # The crown: a lantern storey with a window a face, its cornice, a plant
    # deck and the mast.
    ch = 0.31
    lantern = {face: [dict(u=u, v=deck + 0.036, w=0.1, h=0.034, depth=0.03, glass="window", sill="trim") for u in (-0.12, 0.12)] for face in bkit.FACES}
    bkit.volume(d, deck, deck + 0.072, ch, ch, lantern, 0.045)
    top, _, _ = bkit.crown(d, deck + 0.072, ch, ch, 0.018, 0.02, 0.0, 0.0, inset=0.05)
    d.box(0, top, 0, 0.3, 0.016, 0.3, "mech")
    d.prism_y(0, 0, 0.014, top + 0.016, 1.07, 6, "mech")
    d.pad(0.2, 0.2, top, 0.08, 0.08)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.8)
