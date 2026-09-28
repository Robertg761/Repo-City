"""
Metropolis tier 5: `tower-spire`, the landmark of the skyline. Three setbacks
of curtain wall between stone spandrels and mullions, a cornice and parapet at
each, a stone lantern with ribs at its corners, and a spire whose tip stands
past the building's height. Stretched to about 7.5 x 34 x 7.5: heights four
and a half times as long as widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (7.5, 34.0, 7.5)
PLINTH = 0.012
LOBBY = 0.042
STAGES = [(0.5, 0.46, 11, 3), (0.72, 0.36, 5, 2), (0.84, 0.26, 3, 1)]


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    bkit.lobby(d, PLINTH, LOBBY, 0.5, 0.022)
    y, _, _ = bkit.crown(d, LOBBY, 0.5, 0.5, 0.006, 0.006, 0.0, 0.0)
    decks = []
    for top, half, bands, mullions in STAGES:
        bkit.curtain(d, y, top, half, half, bands, mullions, 0.28, grade=(y, top), sleeve="wall", lit_every=3)
        y, _, _ = bkit.crown(d, top, half, half, 0.012, 0.02 + 0.006, 0.012, 0.02, inset=0)
        decks.append(y)
    # The lantern: stone, a glass panel a face, a rib at each corner.
    crown = y
    d.box(0, crown, 0, 0.3, 0.06, 0.3, "wall", top="deck")
    for face in bkit.FACES:
        pts = [bkit.face_point(face, 0.15 + bkit.LAYER, u, v) for u, v in ((-0.065, crown + 0.012), (0.065, crown + 0.012), (0.065, crown + 0.052), (-0.065, crown + 0.052))]
        d.poly(pts, "glass7@100", bkit.outward(face))
    for x in (0.15, -0.15):
        for z in (0.15, -0.15):
            d.box(x, crown, z, 0.036, 0.085, 0.036, "trim")
    d.box(0, crown + 0.06, 0, 0.22, 0.018, 0.22, "trim", bottom=True)
    d.box(0, crown + 0.078, 0, 0.14, 0.02, 0.14, "wall", skip=("+y",))
    # The spire.
    y0, tip, h = crown + 0.098, (0, 1.08, 0), 0.07
    base = [(h, h), (-h, h), (-h, -h), (h, -h)]
    for k in range(4):
        (ax, az), (bx, bz) = base[k], base[(k + 1) % 4]
        d.poly([(ax, y0, az), (bx, y0, bz), tip], "metal", ((ax + bx) / 2, 0.3, (az + bz) / 2))
    d.pad(0.42, 0, decks[0], 0.05, 0.54)
    d.pad(0, 0.32, decks[1], 0.4, 0.05)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.0)
