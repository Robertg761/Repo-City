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
SCALE_CUR = list(SCALES[2])  # (x, y, z) metres of the model being dressed, set by `build`
HALF_W, HALF_D = lean.HALF_W, lean.HALF_D


def dress_shop(m, plane, half_w, top, v0=0.0, letters=True):
    """What the near level adds to `shop_front`'s window, fascia and awning,
    from the same numbers: glazing bars, raised stallriser panels, consoles
    over the pilasters, a moulded fascia cap with raised lettering, and the
    awning's frame."""
    d = snear.det(m)
    fascia_h = (top - v0) * 0.2
    shop_top = top - fascia_h
    riser = v0 + (shop_top - v0) * 0.14
    wl, wr = -half_w + 0.07, 0.16
    depth = 0.035
    gh = shop_top - 0.004 - riser - 0.02
    gv = riser + 0.01 + gh / 2
    o = dict(u=(wl + wr) / 2, v=gv, w=wr - wl - 0.02, h=gh, depth=depth - skit.LAYER)
    d.window("+z", plane, o, bars=(3, 2), sill=0.0, lintel=False, jambs=False, fw=0.04, deep=0.0235)
    # Raised panels on the stallriser (which stands 0.02 out of the wall).
    n = max(3, int((wr - wl) * SCALE_CUR[0] / 0.55))
    pw = (wr - wl - 0.02) / n
    for k in range(n):
        ua = wl + 0.01 + pw * k
        d.wbox("+z", plane, ua + d.U("+z", 0.05), ua + pw - d.U("+z", 0.05), v0 + d.V(0.07), riser - d.V(0.07), 0.02 + skit.LAYER, 0.02 + skit.LAYER + d.O("+z", 0.022), "door")
    # Consoles: a scroll bracket under the fascia at each pilaster, standing clear of it.
    pil = 0.03 * SCALE_CUR[2] + 0.04  # the pilasters stand 0.03 out; the console 4 cm further
    console = [(0.0, 0.0), (0.05, 0.0), (0.05, 0.05), (pil, 0.13), (pil, 0.24), (0.0, 0.24)]
    for u in (-half_w + 0.025, half_w - 0.025, wr + 0.03):
        d.profile("+z", plane, u - d.U("+z", 0.16), u + d.U("+z", 0.16), shop_top - d.V(0.24), console, "door", skip=(5,))
    # A moulded cap on the fascia's top, and the raised letters.
    d.profile("+z", plane, -half_w, half_w, top + 0.006, [(0.0, 0.0), (0.06 * SCALE_CUR[2] + 0.03, 0.0), (0.06 * SCALE_CUR[2] + 0.03, 0.022), (0.06 * SCALE_CUR[2], 0.04), (0.06 * SCALE_CUR[2], 0.075), (0.0, 0.075)], "frame", skip=(5,))
    if letters:
        for i in range(6):
            w = 0.04 + ((i * 7) % 3) * 0.012
            u = -0.24 + i * 0.075
            d.wbox("+z", plane, u - w / 2, u + w / 2, shop_top + fascia_h * 0.3, shop_top + fascia_h * 0.7 - 0.008, d.O("+z", 0.045) + skit.LAYER, d.O("+z", 0.045) + skit.LAYER + d.O("+z", 0.028), "trim", skip=("back", "bottom"))
    # The awning's frame: an arm under the canvas at each end and one between, and a roller box at the head.
    x0, x1 = wl - 0.02, wr + 0.02
    y_in, y_out = shop_top + 0.004, shop_top - 0.085
    z_in, z_out = plane + 0.04, plane + 0.15
    t = 0.008
    sz = SCALE_CUR[2]
    o_in, o_out = (z_in - plane) * sz, (z_out - plane) * sz
    base = y_out - t - 0.004 - d.V(0.05)

    def y_u(om):
        f = (om - o_in) / (o_out - o_in)
        return y_in - t - (y_in - y_out - 0.004) * f

    lo, hi = o_in + 0.04, o_out - 0.05
    arm = [(lo, (y_u(lo) - base) * SCALE_CUR[1] - 0.03), (hi, (y_u(hi) - base) * SCALE_CUR[1] - 0.03), (hi, (y_u(hi) - base) * SCALE_CUR[1] - 0.055), (lo, (y_u(lo) - base) * SCALE_CUR[1] - 0.055)]
    for ua in (x0 + 0.012, (x0 + x1) / 2, x1 - 0.012):
        d.profile("+z", plane, ua - d.U("+z", 0.012), ua + d.U("+z", 0.012), base, arm, "railing")


def shop_extras(storeys):
    shop_top_h = 0.4 if storeys == 2 else 0.3
    wall_top = 0.76 if storeys == 2 else 0.82

    def extras(m):
        d = snear.det(m)
        dress_shop(m, HALF_D, HALF_W, shop_top_h)
        # Window boxes on the first floor, and a downpipe at each party wall.
        rows = [0.58] if storeys == 2 else [0.45]
        win_h = 0.17 if storeys == 2 else 0.13
        for v in rows:
            for u in (-0.28, 0.0, 0.28):
                bot = v - win_h / 2 - 0.016
                d.window_box("+z", HALF_D, u - 0.078, u + 0.078, bot - d.V(0.1) - d.V(0.005), plants=("leaf", "leaf", "bloom"), seed=int(u * 10) + 5)
        for s in (-1, 1):
            d.downpipe(s * (HALF_W - d.X(0.1)), HALF_D + d.Z(0.05), 0.0, wall_top - 0.05, r=0.038)

    return extras


def build():
    kit.reset()
    M = skit.palette()
    snear.patch(lean)
    objs = []
    for storeys in (2, 3):
        SCALE_CUR[:] = SCALES[storeys]
        snear.setup(SCALES[storeys], M, keystone=False, lintel_ext=0.06)
        snear.EXTRAS["Shopfront" if storeys == 2 else "ShopfrontTall"] = shop_extras(storeys)
        obj, _ = lean.build_shop(M, storeys)
        objs.append(obj)
    for obj, storeys in zip(objs, (2, 3)):
        snear.bake([obj], scale=SCALES[storeys], lean_glb="shopfront.glb")
        print("TRIS", obj.name, skit.triangles(obj))
    snear.rename(objs)
    return objs


def preview(n):
    return [build()[n]]
