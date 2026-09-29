"""
Metropolis tiers 3-4: `tower-glass`. A slim curtain-walled shaft on a glazed
lobby: eighteen storeys of glass graded dark to sky-pale, a lit spandrel
sleeve at every floor and proud mullions, under a frame band and a raked glass
crown. Stretched to about 6.5 x 20 x 6.5: heights three times as long as
widths on screen.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import nkit  # noqa: E402

SCALE = (6.5, 20.0, 6.5)
PLINTH = 0.012
LOBBY = 0.058
HX = 0.4
TOP = 0.93


def make(near=False):
    d = bkit.Draft(nkit.Near(SCALE, sash="frame", post="frame", dentils=False) if near else None)
    d.box(0, 0, 0, 0.98, PLINTH, 0.98, "plinth")
    bkit.lobby(d, PLINTH, LOBBY, 0.48, 0.02)
    deck, _, _ = bkit.crown(d, LOBBY, 0.48, 0.48, 0.008, 0.008, 0.0, 0.0)
    bkit.curtain(d, deck, TOP, HX, HX, 18, 3, 0.14, grade=(0.06, 0.95), lit_every=3, chamfer=0.35)
    band = 0.012
    ob = HX + 0.03
    d.box(0, TOP, 0, ob * 2, band, ob * 2, "trim", bottom=True)
    y0 = TOP + band
    # The rake: glass sloping up to the +x wall, framed ends.
    d.poly([(-HX, y0, HX), (HX, 1.0, HX), (HX, 1.0, -HX), (-HX, y0, -HX)], "glass8@104", (-1, 1, 0))
    d.poly([(HX, y0, HX), (HX, y0, -HX), (HX, 1.0, -HX), (HX, 1.0, HX)], "frame", (1, 0, 0))
    for z in (HX, -HX):
        d.poly([(-HX, y0, z), (HX, y0, z), (HX, 1.0, z)], "frame", (0, 0, z))
    # A coping along the top of the rake's high wall.
    d.box(HX - 0.01, 1.0 - 0.008, 0, 0.034, 0.012, HX * 2 + 0.02, "trim", bottom=True)
    if near:
        n = d.near
        # Ribs down and across the raked glass, and a lightning rod at each
        # high corner.
        rise = (1.0 - y0) / (2 * HX)
        norm = (-rise, 1, 0)
        lift = 0.009

        def at(x, z):
            return (x, y0 + (x + HX) * rise + lift, z)

        for z in (-0.27, -0.09, 0.09, 0.27):
            w = n.ux(0.07)
            d.poly([at(-HX, z - w), at(HX, z - w), at(HX, z + w), at(-HX, z + w)], "frame", norm)
        for x in (-0.2, 0.0, 0.2):
            w = n.ux(0.05)
            d.poly([at(x - w, -HX), at(x + w, -HX), at(x + w, HX), at(x - w, HX)], "frame", norm)
        for z in (HX - 0.02, -HX + 0.02):
            n.prism(d, HX - 0.03, z, n.ux(0.05), 1.0 - 0.004, 1.0 + n.uy(1.6), 6, "metal")
        # The window-cleaning gantry parked on the high wall's coping.
        n.bmu(d, HX - 0.01, -0.22, 0.22, 1.0 + 0.004)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 0}, distance=1.0)


def build_near():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 0}, distance=1.0, near=True)
