"""
The village cottage, thatched and tiled (spike: Blender vs procedural).

Same unit space, footprint, heights and openings as `cottage()` in
`components/city/models/buildings/village.ts`. What the script adds, inside
the procedural model's triangle budget:

  - a soft thatch: contour rings with rounded hips, a slight belly, and a
    thick rolled eave with a real underside, instead of four flat slabs;
  - a block-cut ridge standing proud of the thatch with a scalloped lip;
  - clay tiles laid in stepped courses that cast their own shade lines;
  - windows and the door set into the wall, with reveals and sills;
  - baked occlusion: under the eaves, in the reveals, at the plinth.

    blender -b --python blender/export.py -- blender/settlement/cottage.py cottage
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
from skit import Hole, Mesh, chimney, door, gable_roof, window, wall  # noqa: E402

NAME = "cottage"
HALF_W = 0.42
HALF_D = 0.37
PLINTH = 0.045
PLINTH_OUT = 0.02


def thatch(m, M, wall_top):
    """A hipped thatch as contour rings from the soffit up to the ridge, laid
    in three courses (each one's butt standing proud of the one below), and a
    block-cut ridge over the top with a scalloped lip."""
    rise, overhang, thick = 0.46, 0.05, 0.065
    r = 0.15  # half the ridge
    pitch = rise / HALF_D
    apex = wall_top + rise
    eave = wall_top - overhang * pitch
    out_a, out_b = HALF_W + overhang, HALF_D + overhang
    course = 0.006  # how far each course's butt stands proud: a hint, not tiers

    def ring(a, b, y, rc, mids, dip_at=None):
        """A rounded rectangle at height y with `mids` points along each long
        side; `dip_at(i)` gives (grow, dy) for the i-th mid point."""
        rc = max(0.0, min(rc, a * 0.8, b * 0.8))
        base = skit.rounded_rect(a, b, rc, steps=2)
        out = []
        for q in range(4):
            out += [(x, y, z) for x, z in base[q * 3 : (q + 1) * 3]]
            if q in (0, 2):
                # After the (+x,+z) corner the +z side runs to -x; after the
                # (-x,-z) corner the -z side runs to +x.
                x0, x1 = (a - rc, -(a - rc)) if q == 0 else (-(a - rc), a - rc)
                zs = b if q == 0 else -b
                for i in range(1, mids + 1):
                    x = x0 + (x1 - x0) * i / (mids + 1)
                    g, dy = dip_at(i) if dip_at else (0.0, 0.0)
                    out.append((x, y + dy, math.copysign(abs(zs) + g, zs)))
        return out

    def contour(t, grow=0.0, lift=0.0, mids=1, dip=None):
        """The section `t` of the way from eave to ridge, grown out by `grow`
        and raised by `lift`. `dip` scallops the long sides: every other mid
        point sits `dip` further down the slope."""
        belly = 0.016 * math.sin(math.pi * min(t, 1.0))
        a = r + (out_a - r) * (1 - t) + belly + grow
        b = out_b * (1 - t) + belly + grow
        y = eave + (apex - eave) * t + lift
        dip_at = None
        if dip:
            # Down the slope by `dip` of the way: out by that much of out_b,
            # down by that much of the rise.
            dip_at = lambda i: (out_b * dip, -(apex - eave) * dip) if i % 2 == 1 else (0.0, 0.0)  # noqa: E731
        return ring(a, b, y, min(0.08, b * 0.8), mids, dip_at)

    g1, g2 = course, course * 2
    soffit = ring(HALF_W - 0.006, HALF_D - 0.006, wall_top - 0.035, 0.004, 1)
    under = ring(out_a - 0.02, out_b - 0.02, eave - thick, 0.05, 1)
    lip = ring(out_a + 0.008, out_b + 0.008, eave - thick * 0.45, 0.065, 1)
    rings = [
        soffit, under, lip, contour(0.0),
        contour(0.3), contour(0.3, grow=g1, lift=0.002),
        contour(0.56, grow=g1), contour(0.56, grow=g2, lift=0.002),
        contour(0.8, grow=g2),
    ]
    T, D = M["thatch"], M["thatchDark"]
    mats = [D, D, T, T, T, T, T, T]
    hints = ["down", "out", "out", "out", "out", "out", "out", "out"]
    skit.loft_rings(m, rings, mats, hints, axis=(-r, r, 0.0, 0.0))
    # A ceiling closes the shell over the walls: never seen, but the thatch is
    # a solid, not a lid.
    m.face(soffit, D, out=(0, -1, 0))

    # The block-cut ridge: a second skin over the top, standing proud, with
    # a scalloped lower edge. Its foot is buried in the thatch.
    lift = 0.024
    grow = g2 + lift * 0.75
    teeth = 9
    band = [
        contour(0.72, grow=g2 - 0.004, lift=-0.006, mids=teeth, dip=0.07),
        contour(0.72, grow=grow, lift=lift * 0.62, mids=teeth, dip=0.07),
        contour(0.86, grow=grow, lift=lift * 0.62, mids=teeth),
        contour(0.97, grow=grow, lift=lift * 0.62, mids=teeth),
    ]
    skit.loft_rings(m, band, [M["thatchLight"]] * 3, ["out"] * 3, axis=(-r, r, 0.0, 0.0))
    top = band[-1]
    m.face(top, M["thatchLight"], out=(0, 1, 0))
    # The ridge roll along the top, wide and long enough to cover the cap it
    # lies on: a hair short of its edge, the cap showed as a sliver.
    ty = top[0][1]
    ta = max(p[0] for p in top) + 0.004
    tb = max(p[2] for p in top) + 0.004
    # Its flanks cross the cap's height beyond the cap's edge.
    roll = [(-tb - 0.008, ty - 0.006), (-tb, ty + 0.014), (0.0, ty + 0.028), (tb, ty + 0.014), (tb + 0.008, ty - 0.006)]
    m.prism_x(roll, -ta, ta, D)
    return eave


def build_cottage(M, roof):
    m = Mesh("CottageThatch" if roof == "thatch" else "CottageTile")
    wall_top = 0.5 if roof == "thatch" else 0.52
    # The plinth.
    m.box(-HALF_W - PLINTH_OUT, HALF_W + PLINTH_OUT, 0, PLINTH, -HALF_D - PLINTH_OUT, HALF_D + PLINTH_OUT, M["stoneDark"], skip=("bottom",))

    holes = {f: [] for f in ("+z", "-z", "+x", "-x")}
    windows = []
    # The front: the door off-centre, a window either side, a rose.
    door(m, M, "+z", HALF_D, 0.1, PLINTH, 0.13, 0.28, holes=holes["+z"], step_from=PLINTH_OUT, step_w=0.025, floor=False)
    windows.append(window(m, M, "+z", HALF_D, -0.23, 0.28, 0.15, 0.13, shutters=roof == "tile", flowers=M["flowerRed"], holes=holes["+z"]))
    windows.append(window(m, M, "+z", HALF_D, 0.33, 0.28, 0.1, 0.12, flowers=M["flowerYellow"], holes=holes["+z"]))
    windows.append(window(m, M, "-z", HALF_D, -0.18, 0.28, 0.14, 0.13, holes=holes["-z"]))
    windows.append(window(m, M, "-z", HALF_D, 0.2, 0.28, 0.14, 0.13, holes=holes["-z"]))
    # The tiled cottage's chimney breast stands on the +x gable: its window
    # moves forward, clear of the breast (the procedural one is behind it).
    windows.append(window(m, M, "+x", HALF_W, 0.08 if roof == "thatch" else -0.13, 0.28, 0.13, 0.13, holes=holes["+x"]))
    windows.append(window(m, M, "-x", HALF_W, 0.0, 0.28, 0.13, 0.13, holes=holes["-x"]))

    # The walls, sliced round their openings; the gable walls of the tiled
    # cottage close up into the gable triangles.
    for facing, plane, half in (("+z", HALF_D, HALF_W), ("-z", HALF_D, HALF_W), ("+x", HALF_W, HALF_D), ("-x", HALF_W, HALF_D)):
        # Under thatch the walls stop just inside the soffit: carried up to
        # the wall plate, their corners came out through the rounded hips.
        top = 0.472 if roof == "thatch" else wall_top
        wall(m, facing, plane, -half, half, PLINTH, top, holes[facing], M["wall"], cuts=(0.16,))

    # A climbing rose by the door: two leafy clumps and a few flowers.
    m.wall_box("+z", HALF_D, 0.2, 0.25, 0.0, 0.24, 0.036, M["leaf"], skip=("back", "bottom", "top"))
    # The upper clump shares the lower one's left edge and stands deeper, so
    # the lower one's top is buried in it rather than a shelf.
    m.wall_box("+z", HALF_D, 0.2, 0.262, 0.24, 0.35, 0.05, M["leaf"], skip=("back",))
    for du, dv in ((0.212, 0.1), (0.238, 0.19), (0.215, 0.27), (0.245, 0.31)):
        m.wall_box("+z", HALF_D + (0.036 if dv < 0.24 else 0.05), du - 0.012, du + 0.012, dv, dv + 0.022, 0.016, M["flowerPink"], skip=("back",))

    if roof == "thatch":
        thatch(m, M, wall_top)
        # On the back slope below the ridge's skin, not through it.
        chimney(m, M, 0.25, -0.22, 0.5, 1.06, w=0.1, d=0.11)
    else:
        roof_ = gable_roof(m, M, y=wall_top, w=HALF_W * 2, d=HALF_D * 2, rise=0.38, overhang=0.05, thickness=0.035,
                           ridge="x", roof=M["tile"], gable=M["wall"], cap=M["tileDark"], courses=6, step=0.012,
                           verge=M["tileDark"], butt=M["tileDark"], joints=5, gutter=True,
                           avoid=[(HALF_W - 0.07, HALF_W + 0.03, -0.15, -0.03)])
        # The chimney on the gable end: a stone breast up the wall, the stack
        # through the verge.
        # (Off the course lines: at z = -0.14 a face of it lay in the plane
        # of a course's butt.)
        m.box(HALF_W, HALF_W + 0.07, 0.0, 0.52, -0.15, -0.03, M["stone"], skip=("bottom", "nx"))
        # The stack starts on the breast's top: its sides run on from the
        # breast's, not over them.
        chimney(m, M, HALF_W - 0.02, -0.09, 0.52, 1.0, w=0.1, d=0.12, pots=2)
        # A porch hood on brackets over the door.
        gable_roof(m, M, x=0.1, z=HALF_D + 0.055, y=0.395, w=0.2, d=0.1, rise=0.07, overhang=0.015, thickness=0.02,
                   ridge="z", roof=M["tileDark"], gable=M["frame"], courses=2, step=0.008, ends=(1,))
        for s in (-1, 1):
            m.box(0.1 + s * 0.085 - 0.01, 0.1 + s * 0.085 + 0.01, 0.33, 0.385, HALF_D, HALF_D + 0.09, M["timber"], skip=("nz",))
    obj = skit.finish(m)
    return obj, {"windows": windows, "roofPads": [], "maxProps": 0}


def build():
    kit.reset()
    M = skit.palette()
    meta = {}
    objs = []
    for roof in ("thatch", "tile"):
        obj, info = build_cottage(M, roof)
        objs.append(obj)
        meta[obj.name] = info
    skit.bake(objs)
    for obj in objs:
        print("TRIS", obj.name, skit.triangles(obj))
    skit.write_meta(NAME, meta)
    return objs


def preview(n):
    return [build()[n]]
