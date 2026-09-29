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
import nkit  # noqa: E402

SCALE = (5.5, 14, 5.5)
PLINTH = 0.025
HW = 0.48
TOP = 0.9
DEPTH = 0.035
ROWS = [0.14 + 0.1 * i for i in range(7)]
FIN_U = 0.2


def make(near=False):
    d = bkit.Draft(nkit.Near(SCALE, dentils=False) if near else None)
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    band = 0.05
    ribbon = [dict(u=0, v=v, w=HW * 2 - 0.1, h=band, depth=DEPTH, glass="window", sill="trim", lit=False, frame=False) for v in ROWS]
    # The lobby: a glazed band at street level, the door in the middle of it.
    lobby = dict(v=0.0655, h=0.059, depth=DEPTH + 0.01, glass="window", sill="plinth", lit=False)
    door = dict(u=0, v=(PLINTH + 0.095) / 2, w=0.14, h=0.095 - PLINTH, depth=DEPTH + 0.02, glass="door", lintel=False, lit=False, sill_face=False, lamps=False, arch=0.1)
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
    if near:
        n = d.near
        n.canopy(d, "+z", HW, 0.0, 0.095, 0.3, 0.06, slab=False)
        # A slab edge under every ribbon, running the width of the wall.
        for face in bkit.FACES:
            for v in ROWS:
                n.fbox(d, face, HW, -HW + 0.02, HW - 0.02, v - band / 2 - n.uy(0.16), v - band / 2 - 0.004, 0, 0.018, "trim", skip=("back", "left", "right"))
        # A sunshade blade over each ribbon, on a bracket at either end.
        for face in bkit.FACES:
            for v in ROWS:
                top = v + band / 2
                n.fbox(d, face, HW, -HW + 0.06, HW - 0.06, top + n.uy(0.03), top + n.uy(0.09), 0, 0.04, "trim", skip=("back",))
                for u in (-HW + 0.07, HW - 0.07):
                    n.fbox(d, face, HW, u - n.ux(0.05), u + n.ux(0.05), top, top + n.uy(0.03), 0, 0.03, "trim", skip=("back", "top"))
        # A framed panel in every spandrel between the fins, and a tall one
        # in the parapet's frieze.
        cells = ((-HW + 0.06, -FIN_U - 0.03 - n.ux(0.12)), (-FIN_U + 0.03 + n.ux(0.12), FIN_U - 0.03 - n.ux(0.12)), (FIN_U + 0.03 + n.ux(0.12), HW - 0.06))
        for face in bkit.FACES:
            for k, v in enumerate(ROWS):
                lo = ROWS[k - 1] + band / 2 + n.uy(0.07) if k else PLINTH + 0.085 + n.uy(0.1)
                hi = v - band / 2 - n.uy(0.16) - n.uy(0.07)
                for a, b in cells:
                    n.panel(d, face, HW, a, b, lo, hi, 0.0)
            for a, b in cells:
                n.panel(d, face, HW, a, b, ROWS[-1] + band / 2 + n.uy(0.1), TOP - n.uy(0.15), 0.0)
        # The plant room's hatch, a fan and a stack on its lid.
        n.stack(d, px + 0.12, pz + 0.05, deck + ph + 0.01, n.ux(0.13), n.uy(0.7))
        n.fan(d, px - 0.1, pz - 0.04, deck + ph + 0.01, n.ux(0.5))
        # Three condensers in a row behind the plant room, each with its fan.
        for x in (-0.36, -0.22, -0.08):
            n.louvred_box(d, x, -0.32, deck, 0.11, 0.09, n.uy(0.62))
            n.fan(d, x, -0.32, deck + n.uy(0.62), n.ux(0.28))
        # A tank in the corner, a cable tray from the plant room to the
        # condensers, an air handler with its duct, and pipes along the edge.
        n.tank(d, -0.34, 0.34, deck, 0.4, 0.9)
        n.tray(d, -0.385, -0.22, -0.385, 0.24, deck + n.uy(0.05), 0.4)
        n.ahu(d, 0.29, 0.15, deck, 0.12, 0.09, n.uy(0.8), fans=2)
        n.duct(d, 0.09, 0.15, 0.245, 0.15, deck, 0.4, 0.45)
        n.pipes(d, -0.16, 0.395, 0.42, 0.395, deck)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.6)


def build_near():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.6, near=True)
