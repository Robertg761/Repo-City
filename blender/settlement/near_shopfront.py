"""
Near level of the high-street shop, two and three storeys (see shopfront.py):
the lean script's own shop front, windows, roof and stacks with the near
builders from snear.py, plus glazing bars in the shop window, raised letters
on the fascia, and downpipes at the party walls.

    blender -b --python blender/export.py -- blender/settlement/near_shopfront.py shopfront-near
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import shopfront as lean  # noqa: E402
import skit  # noqa: E402
import snear  # noqa: E402

SCALES = {2: (5.5, 5.4, 5.0), 3: (5.5, 7.6, 5.0)}
HALF_W, HALF_D = lean.HALF_W, lean.HALF_D


def shop_extras(storeys):
    shop_top_h = 0.4 if storeys == 2 else 0.3
    wall_top = 0.76 if storeys == 2 else 0.82

    def extras(m):
        d = snear.det(m)
        # The shop window as `shop_front` sets it out.
        top = shop_top_h
        fascia_h = top * 0.2
        shop_top = top - fascia_h
        riser = shop_top * 0.14
        wl, wr = -HALF_W + 0.07, 0.16
        depth = 0.035
        gh = shop_top - 0.004 - riser - 0.02
        gv = riser + 0.01 + gh / 2
        o = dict(u=(wl + wr) / 2, v=gv, w=wr - wl - 0.02, h=gh, depth=depth - skit.LAYER)
        d.window("+z", HALF_D, o, bars=(3, 2), sill=0.0, lintel=False, jambs=False, fw=0.04, deep=0.0235)
        # Raised letters on the fascia, over the flat ones the lean model paints.
        for i in range(6):
            w = 0.04 + ((i * 7) % 3) * 0.012
            u = -0.24 + i * 0.075
            d.wbox("+z", HALF_D, u - w / 2, u + w / 2, shop_top + fascia_h * 0.3, shop_top + fascia_h * 0.7 - 0.008, d.O("+z", 0.045) + skit.LAYER, d.O("+z", 0.045) + skit.LAYER + d.O("+z", 0.028), "trim", skip=("back", "bottom"))
        # Downpipes at the party walls.
        for s in (-1, 1):
            d.downpipe(s * (HALF_W - d.X(0.1)), HALF_D + d.Z(0.05), 0.0, wall_top - 0.05, r=0.038)

    return extras


def build():
    kit.reset()
    M = skit.palette()
    snear.patch(lean)
    objs = []
    for storeys in (2, 3):
        snear.setup(SCALES[storeys], M, keystone=False, lintel_ext=0.06)
        snear.EXTRAS["Shopfront" if storeys == 2 else "ShopfrontTall"] = shop_extras(storeys)
        obj, _ = lean.build_shop(M, storeys)
        objs.append(obj)
    for obj, storeys in zip(objs, (2, 3)):
        snear.bake([obj], scale=SCALES[storeys])
        print("TRIS", obj.name, skit.triangles(obj))
    snear.rename(objs)
    return objs


def preview(n):
    return [build()[n]]
