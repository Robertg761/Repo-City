"""
Tiers 3-5: `midrise-mech`. A ribbon-windowed shaft: seven storeys of glass
bands set back behind spandrels that run corner to corner, divided into three
lights by proud fins, under a cornice, a parapet and a louvred plant room.
Stretched to about 5.5 x 14 x 5.5, so heights here are 2.5 times as long as
widths on screen: the bands are 0.05 tall and the reveal 0.035 deep.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (5.5, 14, 5.5)
PLINTH = 0.025
HW = 0.48
TOP = 0.9
DEPTH = 0.035
ROWS = [0.14 + 0.1 * i for i in range(7)]
FIN_U = 0.2


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    band = 0.05
    ribbon = [dict(u=0, v=v, w=HW * 2 - 0.1, h=band, depth=DEPTH, glass="window", sill="trim", lit=False) for v in ROWS]
    # The lobby: a glazed band at street level, the door in the middle of it.
    lobby = dict(v=0.0655, h=0.059, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False)
    door = dict(u=0, v=(PLINTH + 0.095) / 2, w=0.14, h=0.095 - PLINTH, depth=DEPTH + 0.02, glass="door", lit=False, sill_face=False)
    front = ribbon + [dict(lobby, u=-0.26, w=0.3), door, dict(lobby, u=0.26, w=0.3)]
    others = ribbon + [dict(lobby, u=0, w=0.74)]
    bkit.volume(d, PLINTH, TOP, HW, HW, {"+z": front, "-z": others, "+x": others, "-x": others}, DEPTH + 0.02)
    for face in bkit.FACES:
        bkit.fins(d, face, HW, [-FIN_U, FIN_U], 0.12, TOP, 0.03, 0.014, DEPTH)
        # Three lights a band between the fins.
        for v in ROWS:
            for u in (-0.335, 0, 0.335):
                w = 0.2 if u == 0 else 0.15
                d.window(face, HW - DEPTH, u, v, w, band * 0.84)
    # A canopy over the door.
    d.box(0, 0.095, HW + 0.03, 0.3, 0.008, 0.06, "trim", bottom=True)
    deck, ix, iz = bkit.crown(d, TOP, HW, HW, 0.022, 0.02, 0.032, 0.028)
    # The plant room: louvred walls under an overhanging lid.
    px, pz, pw, pd, ph = -0.1, 0.06, 0.4, 0.34, 0.055
    d.box(px, deck, pz, pw, ph, pd, "mech", skip=("+y",))
    for face in bkit.FACES:
        plane = pd / 2 if face in ("+z", "-z") else pw / 2
        span = pw if face in ("+z", "-z") else pd
        for k in range(3):
            v = deck + ph * (0.22 + 0.28 * k)
            pts = [bkit.face_point(face, plane + bkit.LAYER, u, v + s, 0, px, pz) for u, s in ((-span * 0.38, 0), (span * 0.38, 0), (span * 0.38, 0.008), (-span * 0.38, 0.008))]
            d.poly(pts, "roof", bkit.outward(face))
    d.slab(deck + ph, 0.01, pw / 2 + 0.015, pd / 2 + 0.015, "mech", cx=px, cz=pz)
    d.pad(0.24, -0.25, deck, 0.3, 0.26)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.6)
