"""
Near level of the village cottage, thatched and tiled (see cottage.py): the
lean script's own walls, openings, roof and chimney with the near builders
from snear.py in their place, plus a thatch laid in finer courses under a
scalloped block-cut ridge, and a lantern by the door.

    blender -b --python blender/export.py -- blender/settlement/near_cottage.py cottage-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cottage as lean  # noqa: E402
import kit  # noqa: E402
import skit  # noqa: E402
import snear  # noqa: E402

SCALES = {"thatch": (4.2, 3.6, 4.0), "tile": (4.0, 4.2, 3.8)}
HALF_W, HALF_D = lean.HALF_W, lean.HALF_D
#: Vertices along each long edge of a thatch ring: one per bundle of the course's butt.
MIDS = 9


def loft_bundles(m, rings, mats, hints, tones, axis):
    """`skit.loft_rings`, the courses of thatch laid in bundles: the quads of
    a course alternate between two shades of straw, a different pair
    of neighbours on each course, so the courses read as separate handfuls."""
    x0, x1, z0, _ = axis
    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        n = len(lo)
        for i in range(n):
            j = (i + 1) % n
            pts = [lo[i], lo[j], hi[j], hi[i]]
            c = skit.centroid(pts)
            if hints[k] == "up":
                out = (0, 1, 0)
            elif hints[k] == "down":
                out = (0, -1, 0)
            else:
                ax = min(max(c[0], x0), x1)
                out = (c[0] - ax, 0, c[2] - z0)
            mat = mats[k]
            if mat is tones[0] and k >= 4:
                # (Courses only; the eave and the soffit stay one shade.)
                mat = tones[1] if (i + (k // 2) * 2) % 5 in (0, 1) else tones[0]
            if k >= 4 and hints[k] == "out" and mats[k] is tones[0]:
                # A bundle: four facets round a crown a hand's width off the course.
                snear._pillow(m, pts, mat, 0.009, out=out)
            else:
                m.face(pts, mat, out=out)


def thatch(m, M, wall_top):
    """The lean thatch in more, finer courses: each rolled out over the one
    below, with a block-cut ridge over the top whose lip is scalloped."""
    rise, overhang, thick = 0.46, 0.05, 0.065
    r = 0.15
    pitch = rise / HALF_D
    apex = wall_top + rise
    eave = wall_top - overhang * pitch
    out_a, out_b = HALF_W + overhang, HALF_D + overhang

    def ring(a, b, y, rc, mids, dip_at=None):
        rc = max(0.0, min(rc, a * 0.8, b * 0.8))
        base = skit.rounded_rect(a, b, rc, steps=2)
        out = []
        for q in range(4):
            out += [(x, y, z) for x, z in base[q * 3 : (q + 1) * 3]]
            if q in (0, 2):
                x0, x1 = (a - rc, -(a - rc)) if q == 0 else (-(a - rc), a - rc)
                zs = b if q == 0 else -b
                for i in range(1, mids + 1):
                    x = x0 + (x1 - x0) * i / (mids + 1)
                    g, dy = dip_at(i) if dip_at else (0.0, 0.0)
                    out.append((x, y + dy, math.copysign(abs(zs) + g, zs)))
        return out

    def contour(t, grow=0.0, lift=0.0, mids=MIDS, dip=None, zig=0.0):
        belly = 0.016 * math.sin(math.pi * min(t, 1.0))
        a = r + (out_a - r) * (1 - t) + belly + grow
        b = out_b * (1 - t) + belly + grow
        y = eave + (apex - eave) * t + lift
        dip_at = None
        if dip:
            dip_at = lambda i: (out_b * dip, -(apex - eave) * dip) if i % 2 == 1 else (0.0, 0.0)  # noqa: E731
        elif zig:
            # Each bundle's butt a little lower than the next: the course's edge steps along.
            dip_at = lambda i: (0.0, -zig * ((i * 5) % 3) / 2)  # noqa: E731
        return ring(a, b, y, min(0.08, b * 0.8), mids, dip_at)

    step = 0.005
    soffit = ring(HALF_W - 0.006, HALF_D - 0.006, wall_top - 0.035, 0.004, MIDS)
    under = ring(out_a - 0.02, out_b - 0.02, eave - thick, 0.05, MIDS)
    lip = ring(out_a + 0.008, out_b + 0.008, eave - thick * 0.45, 0.065, MIDS, lambda i: (0.0, -0.006 * (i % 2)))
    rings = [soffit, under, lip, contour(0.0)]
    courses = 8
    for k in range(1, courses + 1):
        t = 0.8 * k / courses
        # Each course ends in a rolled butt: back to the slope, then out.
        rings += [contour(t, grow=step * (k - 1), zig=0.005), contour(t, grow=step * k, lift=0.002)]
    T, D = M["thatch"], M["thatchDark"]
    mats = [D, D, T, T] + [T] * (2 * courses - 1)
    hints = ["down", "out", "out", "out"] + ["out"] * (2 * courses - 1)
    loft_bundles(m, rings, mats[: len(rings) - 1], hints[: len(rings) - 1], (M["thatch"], M["thatchLight"]), axis=(-r, r, 0.0, 0.0))
    m.face(soffit, D, out=(0, -1, 0))

    g2 = step * courses
    lift = 0.024
    grow = g2 + lift * 0.75
    teeth = 15
    band = [
        contour(0.72, grow=g2 - 0.004, lift=-0.006, mids=teeth, dip=0.07),
        contour(0.72, grow=grow, lift=lift * 0.62, mids=teeth, dip=0.07),
        contour(0.86, grow=grow, lift=lift * 0.62, mids=teeth),
        contour(0.97, grow=grow, lift=lift * 0.62, mids=teeth),
    ]
    skit.loft_rings(m, band, [M["thatchLight"]] * 3, ["out"] * 3, axis=(-r, r, 0.0, 0.0))
    top = band[-1]
    m.face(top, M["thatchLight"], out=(0, 1, 0))
    ty = top[0][1]
    ta = max(p[0] for p in top) + 0.004
    tb = max(p[2] for p in top) + 0.004
    roll = [(-tb - 0.008, ty - 0.006), (-tb, ty + 0.014), (0.0, ty + 0.028), (tb, ty + 0.014), (tb + 0.008, ty - 0.006)]
    m.prism_x(roll, -ta, ta, D)
    return eave


def lantern(m):
    """A carriage lamp on the wall beside the door, a plate with a number over the door."""
    d = snear.det(m)
    d.lamp("+z", HALF_D, -0.06, 0.31, arm=0.1, glass="glass")
    snear.plinth_stones(m, HALF_W + lean.PLINTH_OUT, HALF_D + lean.PLINTH_OUT, lean.PLINTH, gaps={"+z": [(-0.015, 0.27)]})
    thatch = m.name == "CottageThatch"
    # (The tiled cottage's shuttered window is at the front left: no quoins there.)
    d.quoins(HALF_W, HALF_D, 0.05, 0.4 if thatch else 0.45, proj=0.024, height=0.22, long_=0.34, short=0.18,
             corners=[(-1, 1), (-1, -1), (1, -1)] if thatch else [(-1, -1), (1, -1)])


def build():
    kit.reset()
    M = skit.palette()
    lean.thatch = thatch
    snear.patch(lean)
    objs = []
    for roof in ("thatch", "tile"):
        snear.setup(SCALES[roof], M)
        snear.EXTRAS["CottageThatch" if roof == "thatch" else "CottageTile"] = lantern
        obj, _ = lean.build_cottage(M, roof)
        objs.append(obj)
    for obj, roof in zip(objs, SCALES):
        snear.bake([obj], scale=SCALES[roof], lean_glb="cottage.glb")
        print("TRIS", obj.name, skit.triangles(obj))
    snear.rename(objs)
    return objs


def preview(n):
    return [build()[n]]
