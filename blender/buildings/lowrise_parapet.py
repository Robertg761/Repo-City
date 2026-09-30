"""
Tiers 1-2: `lowrise-parapet`. Two storeys of recessed windows over a shop:
glazing either side of the door under a fascia, a projecting cornice and a
parapet with a roof deck behind it. Stretched to about 5.2 x 5.6 x 5.2.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402

SCALE = (5.2, 5.6, 5.2)
PLINTH = 0.05
HW = 0.47
TOP = 0.85
DEPTH = 0.032
# The crown: cornice height, projection, parapet height and thickness (unit space). Slim,
# so the roof edge does not read as a lid on a five-metre building.
CROWN = (0.02, 0.016, 0.05, 0.018)


def make():
    d = bkit.Draft()
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    cols = bkit.spread(3, HW * 2 * 0.62)
    upper = bkit.grid(cols, [0.49, 0.71], 0.16, 0.13, DEPTH, sill="trim", ledge=(0.02, 0.012, "trim"))
    # The shop: glazing on a stallriser each side of the door, heads level.
    head = 0.33
    shop = dict(v=(0.11 + head) / 2, h=head - 0.11, depth=DEPTH + 0.01, glass="window", sill="plinth")
    door = dict(u=0, v=(PLINTH + head) / 2, w=0.15, h=head - PLINTH, depth=DEPTH + 0.018, glass="door", lit=False, sill_face=False)
    side = bkit.grid(cols, [0.49, 0.71], 0.16, 0.13, DEPTH, sill="trim")
    front = [dict(shop, u=-0.25, w=0.28), door, dict(shop, u=0.25, w=0.28)] + upper
    back = [dict(shop, u=0, w=0.62)] + side
    side = bkit.grid(cols, [0.49, 0.71], 0.16, 0.13, DEPTH, sill="trim")
    bkit.volume(d, PLINTH, TOP, HW, HW, {"+z": front, "-z": back, "+x": side, "-x": side}, DEPTH + 0.018)
    # The fascia over the shop, on +z and -z.
    for s in (1, -1):
        d.box(0, head + 0.01, s * (HW + 0.0125), 0.76, 0.04, 0.025, "trim", bottom=True)
    # Stone pilasters either side of the shopfront, the near level's own.
    for s in (1, -1):
        for u in (-0.44, 0.44):
            d.box(u, PLINTH, s * (HW + 0.015), 0.05, head - PLINTH - 0.02, 0.03, "plinth", skip=("-y",))
    deck, ix, iz = bkit.crown(d, TOP, HW, HW, *CROWN, inset=0)
    d.pad(0, 0, deck, 0.62, 0.62)
    return d


def build():
    return bkit.build_model(make, SCALE, meta_extra={"maxProps": 2}, distance=1.6)
