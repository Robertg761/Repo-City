"""
Tier 3: `midrise-setback`. A four-storey base block with a glazed lobby,
three tall recessed bays a face divided by spandrels, under a cornice and a
parapet round a terrace; a setback upper block of two bays a face under its
own cornice. Stretched to about 5.5 x 12 x 5.5: heights are 2.2 times as long
as widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (5.5, 12.0, 5.5)
PLINTH = 0.03
BASE_HW, BASE_TOP = 0.5, 0.44
UP_HW, UP_TOP = 0.38, 0.905
DEPTH = 0.035


def lobby(front):
    head = 0.115
    band = dict(v=(0.05 + head) / 2, h=head - 0.05, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False)
    if not front:
        return [dict(band, u=0, w=0.7)]
    door = dict(u=0, v=(PLINTH + head) / 2, w=0.14, h=head - PLINTH, depth=DEPTH + 0.02, glass="door", lit=False, sill_face=False)
    return [dict(band, u=-0.24, w=0.3), door, dict(band, u=0.24, w=0.3)]


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth", skip=())
    openings = {}
    for face in bkit.FACES:
        bays = [bkit._bay(d, face, BASE_HW, u, 0.19, 0.15, 0.4, 4, DEPTH, 0.022) for u in (-0.3, 0, 0.3)]
        openings[face] = bays + lobby(face == "+z")
    bkit.volume(d, PLINTH, BASE_TOP, BASE_HW, BASE_HW, openings, DEPTH + 0.02)
    d.box(0, 0.12, BASE_HW + 0.03, 0.3, 0.012, 0.06, "trim", bottom=True)
    terrace, ix, iz = bkit.crown(d, BASE_TOP, BASE_HW, BASE_HW, 0.022, 0.018, 0.03, 0.028, inset=0)
    openings = {}
    for face in bkit.FACES:
        openings[face] = [bkit._bay(d, face, UP_HW, u, 0.2, terrace + 0.05, UP_TOP - 0.035, 4, DEPTH, 0.022) for u in (-0.17, 0.17)]
    bkit.volume(d, terrace, UP_TOP, UP_HW, UP_HW, openings, DEPTH + 0.02)
    deck, ix2, _ = bkit.crown(d, UP_TOP, UP_HW, UP_HW, 0.026, 0.02, 0.04, 0.03, inset=0.07)
    d.pad(0.44, 0, terrace, 0.07, 0.6)
    d.pad(0, 0, deck, 0.46, 0.46)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.6)
