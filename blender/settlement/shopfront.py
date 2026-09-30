"""
The high-street shop, two and three storeys (spike: Blender vs procedural).

Same unit space, footprint, heights and openings as `shopfront()` in
`components/city/models/buildings/town.ts`. The script adds a shop window set
back behind its pilasters and stall riser, a canvas awning that is one piece
with a scalloped valance, recessed sash windows with sills, slate laid in
stepped courses, a cornice that runs under the eaves, and baked occlusion.
`shop_front()` is shared with the flats over shops (`apartment.py`).

    blender -b --python blender/export.py -- blender/settlement/shopfront.py shopfront
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
from skit import LAYER, Hole, Mesh, chimney, door, gable_roof, recess, wall, window  # noqa: E402

NAME = "shopfront"
HALF_W = 0.47
HALF_D = 0.45


def shop_front(m, M, plane, half_w, top, holes, v0=0.0):
    """The shop at street level on the +z wall `plane`, from `v0` up to the
    fascia's top `top`: pilasters and a stall riser in the accent, dark; the
    window set well back behind them with mullions, a transom and goods on
    display; a glazed door; the fascia with its lettering; and the awning.
    Appends the wall's openings to `holes`; returns the window's Panel."""
    fascia_h = (top - v0) * 0.2
    shop_top = top - fascia_h
    riser = v0 + (shop_top - v0) * 0.14
    wl, wr = -half_w + 0.07, 0.16
    ww, wu = wr - wl, (wl + wr) / 2
    depth = 0.035
    # The window opening runs from the riser's top to under the fascia.
    hole = Hole(wl, wr, riser, shop_top - 0.004)
    holes.append(hole)
    recess(m, "+z", plane, hole, depth, M["accentDark"], M["frame"])
    back = plane - depth
    gh = hole.v1 - hole.v0 - 0.02
    gv = hole.v0 + 0.01 + gh / 2
    m.rect("+z", back + LAYER, wl + 0.01, wr - 0.01, gv - gh / 2, gv + gh / 2, M["shopGlass"])
    # Goods behind the glass would be behind it; in front of the lit pane
    # (two layers out) they read as goods on display. Mullions over them.
    goods = [M["flowerYellow"], M["accent"], M["cream"], M["flowerRed"]]
    for i, g in enumerate(goods):
        h = (shop_top - riser) * (0.18 + (i % 2) * 0.1)
        u = wl + 0.05 + i * (ww - 0.1) / 3
        m.rect("+z", back + 3 * LAYER, u - 0.0225, u + 0.0225, riser + 0.012, riser + 0.012 + h, g)
    for k in (-1, 1):
        u = wu + k * ww / 6
        m.rect("+z", back + 4 * LAYER, u - 0.005, u + 0.005, gv - gh / 2, gv + gh / 2, M["frame"])
    # The transom, in three lengths between the mullions (overlapping them,
    # two faces of one colour but different occlusion would flicker).
    ty = gv + gh * 0.3
    for a, b in ((wl + 0.01, wu - ww / 6 - 0.005), (wu - ww / 6 + 0.005, wu + ww / 6 - 0.005), (wu + ww / 6 + 0.005, wr - 0.01)):
        m.rect("+z", back + 4 * LAYER, a, b, ty - 0.005, ty + 0.005, M["frame"])
    window = skit.panel("+z", back + LAYER - skit.PANEL_LIFT, wu, gv, ww - 0.02, gh)
    # The stall riser under the window, and the pilasters, standing proud.
    m.wall_box("+z", plane, wl, wr, v0, riser, 0.02, M["accentDark"], skip=("back",))
    for u in (-half_w + 0.025, half_w - 0.025, wr + 0.03):
        m.wall_box("+z", plane, u - 0.02, u + 0.02, v0, shop_top, 0.03, M["accentDark"], skip=("back", "top"))
    # The glazed door beside the window.
    du = (wr + 0.05 + half_w - 0.05) / 2
    dw = min(0.13, half_w - 0.05 - (wr + 0.05))
    door(m, M, "+z", plane, du, v0, dw, (shop_top - v0) * 0.86, glazed=True, reveal=M["accentDark"], holes=holes,
         step=False, floor=v0 > 0)
    # The fascia: a box over the whole front, a moulding on top, lettering.
    m.wall_box("+z", plane, -half_w, half_w, shop_top, top - 0.008, 0.045, M["accent"], skip=("back",))
    m.wall_box("+z", plane, -half_w - 2 * LAYER, half_w + 2 * LAYER, top - 0.008, top + 0.006, 0.06, M["frame"], skip=("back",))
    for i in range(6):
        w = 0.04 + ((i * 7) % 3) * 0.012
        u = -0.24 + i * 0.075
        m.rect("+z", plane + 0.045 + LAYER, u - w / 2, u + w / 2, shop_top + fascia_h * 0.3, shop_top + fascia_h * 0.7 - 0.008, M["cream"])
    # The awning: one canvas in stripes from under the fascia down and out,
    # with a scalloped valance along its lip.
    stripes = 7
    x0, x1 = wl - 0.02, wr + 0.02
    # Its head is tucked up into the fascia, not a hair under it.
    y_in, y_out = shop_top + 0.004, shop_top - 0.085
    z_in, z_out = plane + 0.04, plane + 0.15
    t = 0.008
    for i in range(stripes):
        a = x0 + (x1 - x0) * i / stripes
        b = x0 + (x1 - x0) * (i + 1) / stripes
        mat = M["accentFabric"] if i % 2 == 0 else M["creamFabric"]
        m.face([(a, y_in, z_in), (b, y_in, z_in), (b, y_out, z_out), (a, y_out, z_out)], mat, out=(0, 1, 0.8))
        m.face([(a, y_in - t, z_in), (b, y_in - t, z_in), (b, y_out - t, z_out - 0.004), (a, y_out - t, z_out - 0.004)], mat, out=(0, -1, -0.8))
        # The valance: a flap down from the lip, scalloped at its hem.
        mid = (a + b) / 2
        m.face([(a, y_out, z_out), (b, y_out, z_out), (b, y_out - 0.03, z_out), (mid, y_out - 0.045, z_out), (a, y_out - 0.03, z_out)], mat, out=(0, 0, 1))
        m.face([(a, y_out - t, z_out - 0.004), (b, y_out - t, z_out - 0.004), (b, y_out - 0.03, z_out - 0.004), (mid, y_out - 0.045, z_out - 0.004), (a, y_out - 0.03, z_out - 0.004)], mat, out=(0, 0, -1))
    for xe, s in ((x0, -1), (x1, 1)):
        m.face([(xe, y_in, z_in), (xe, y_out, z_out), (xe, y_out - 0.03, z_out), (xe, y_out - t, z_out - 0.004), (xe, y_in - t, z_in)], M["accentFabric"], out=(s, 0, 0))
    return window


def side_course(m, v0, v1, proud, mat):
    """A plinth or string course on the two side walls and the back, the
    front's own trim (pilasters, riser, fascia) being its own."""
    m.wall_box("-z", HALF_D, -HALF_W - proud, HALF_W + proud, v0, v1, proud, mat, skip=("back",))
    for facing in ("+x", "-x"):
        m.wall_box(facing, HALF_W, -HALF_D, HALF_D, v0, v1, proud, mat, skip=("back", "left", "right"))


def build_shop(M, storeys):
    m = Mesh("Shopfront" if storeys == 2 else "ShopfrontTall")
    wall_top = 0.76 if storeys == 2 else 0.82
    shop_top = 0.4 if storeys == 2 else 0.3
    holes = {f: [] for f in ("+z", "-z", "+x", "-x")}
    windows = [shop_front(m, M, HALF_D, HALF_W, shop_top, holes["+z"])]
    rows = [0.58] if storeys == 2 else [0.45, 0.66]
    win_h = 0.17 if storeys == 2 else 0.13
    for v in rows:
        for u in (-0.28, 0.0, 0.28):
            windows.append(window(m, M, "+z", HALF_D, u, v, 0.13, win_h, bars="sash", holes=holes["+z"]))
        for u in (-0.2, 0.2):
            windows.append(window(m, M, "-z", HALF_D, u, v, 0.13, win_h, bars="sash", holes=holes["-z"]))
    door(m, M, "-z", HALF_D, 0.0, 0.0, 0.13, shop_top * 0.8, mat=M["door"], holes=holes["-z"], step=False, floor=False)
    # The side gables stand free on a town street, so they are dressed: a sash
    # window in each bay of every floor (two at street level, small under the
    # shop's fascia line), and the courses below carry round them.
    side_rows = [(shop_top * 0.5, shop_top * 0.42, (-0.2, 0.2) if storeys == 2 else (0.0,))] + [(v, win_h, (-0.27, 0.0, 0.27) if storeys == 2 else (-0.2, 0.2)) for v in rows]
    for facing in ("+x", "-x"):
        for v, h, us in side_rows:
            for u in us:
                windows.append(window(m, M, facing, HALF_W, u, v, 0.13, h, bars="sash", holes=holes[facing]))
    course_v = [shop_top]
    for v in course_v:
        side_course(m, v, v + 0.014, 0.012, M["stone"])
    side_course(m, 0.0, 0.05, 0.014, M["stone"])
    roof_y = wall_top + 0.008
    for facing, plane, half in (("+z", HALF_D, HALF_W), ("-z", HALF_D, HALF_W), ("+x", HALF_W, HALF_D), ("-x", HALF_W, HALF_D)):
        cuts = (0.15, wall_top - 0.05, wall_top - 0.03)
        if facing != "+z":
            cuts += (0.05, *course_v, *(v + 0.014 for v in course_v))
        wall(m, facing, plane, -half, half, 0.0, roof_y, holes[facing], M["wall"], cuts=cuts)
    # A cornice round the top of the wall, clear under the eaves' slates.
    skit.band(m, HALF_W, HALF_D, wall_top - 0.05, wall_top - 0.03, 0.014, M["frame"])
    gable_roof(m, M, y=roof_y, w=HALF_W * 2, d=HALF_D * 2, rise=1 - wall_top - 0.06, overhang=0.024, thickness=0.03,
               ridge="x", roof=M["slate"], gable=M["wall"], cap=M["slateDark"], courses=5, step=0.008,
               verge=M["slateDark"], butt=M["slateDark"], joints=6,
               avoid=[(s * (HALF_W - 0.045 - 2 * LAYER) - 0.045, s * (HALF_W - 0.045 - 2 * LAYER) + 0.045, -0.15, 0.05) for s in (-1, 1)])
    for s in (-1, 1):
        chimney(m, M, s * (HALF_W - 0.045 - 2 * LAYER), -0.05, wall_top, 1.04, w=0.09, d=0.2, mat=M["brick"], pots=2)
    # The hanging sign on its bracket.
    sv = shop_top + 0.1
    m.wall_box("+z", HALF_D, HALF_W - 0.058, HALF_W - 0.042, sv + 0.08, sv + 0.096, 0.13, M["railing"], skip=("back",))
    m.box(HALF_W - 0.056, HALF_W - 0.044, sv - 0.005, sv + 0.075, HALF_D + 0.035, HALF_D + 0.115, M["accent"])
    obj = skit.finish(m)
    return obj, {"windows": windows, "roofPads": [], "maxProps": 0}


def build():
    kit.reset()
    M = skit.palette()
    objs, meta = [], {}
    for storeys in (2, 3):
        obj, info = build_shop(M, storeys)
        objs.append(obj)
        meta[obj.name] = info
    skit.bake(objs)
    for obj in objs:
        print("TRIS", obj.name, skit.triangles(obj))
    skit.write_meta(NAME, meta)
    return objs


def preview(n):
    return [build()[n]]
