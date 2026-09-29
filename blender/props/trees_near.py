"""
The four tree species at close range: the NEAR level of `trees.py`.

Same species, foot, height and silhouette as the lean trees (and the same
paint contract: the crown is the `paint` material, which takes the instance's
leaf tint and the wind; bark is not), for the few dozen trees the camera is
close to. Where the lean crown is one lumpy hull, this one is a hundred leaf
clumps over a smaller core; where the lean trunk is a six-sided pipe with two
stubs, this one is a ridged, flared bole that forks into limbs and twigs that
run out into the crown.

Nodes: TreeBroadleafNear, TreeConifer Near, TreePoplarNear, TreeBirchNear
(under 5,000 triangles each; `trees-near.glb`).
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
import near_kit as nk  # noqa: E402
from kit import finish  # noqa: E402
from trees import palette  # noqa: E402


def bole(name, base_r, top_r, height, mat, sides=8, seed=0.0, lean=(0.0, 0.0), rings=5):
    """A ridged trunk with a flared foot, swaying a little as it rises."""
    path, radii = [], []
    for i in range(rings):
        t = i / (rings - 1)
        path.append((lean[0] * t * t + math.sin(t * 3 + seed) * 0.02, t * height, lean[1] * t * t))
        flare = 1 + 0.3 * max(0.0, 1 - t / 0.1) ** 2
        radii.append((base_r + (top_r - base_r) * t) * flare)
    return nk.loft(name, path, radii, mat, sides=sides, ridge=0.16, seed=seed)


def limb(name, a, b, r0, r1, mat, sides=5, sag=0.0, seed=0.0):
    """A branch from `a` to `b` in three rings with a bow in the middle."""
    a, b = tuple(a), tuple(b)
    mid = tuple((a[i] + b[i]) / 2 for i in range(3))
    mid = (mid[0], mid[1] + sag, mid[2])
    rm = (r0 + r1) / 2 * 1.02
    return nk.loft(name, [a, mid, b], [r0, rm, r1], mat, sides=sides, ridge=0.12, seed=seed)


def roots(M, mat, radius, n=4, start=0.3):
    out = []
    for i in range(n):
        a = start + i * 2 * math.pi / n
        foot = (math.cos(a) * (radius + 0.17), 0.0, -math.sin(a) * (radius + 0.17))
        top = (math.cos(a) * radius * 0.5, 0.4, -math.sin(a) * radius * 0.5)
        out.append(lp.tube(f"root{i}", foot, top, 0.04, 0.085, mat, sides=4, turn=a))
    return out


def crown_core(name, blobs, scale, mat, target, seed):
    """A smaller hull inside the clumps, so the crown has no daylight through
    its middle."""
    shrunk = [(c, r * scale, sq) for c, r, sq in blobs]
    return lp.blobs(name, shrunk, mat, wobble=0.06, seed=seed, decimate=target)


BROADLEAF = [
    ((0, 2.55, 0), 1.12, (1, 0.86, 1)),
    ((-0.74, 2.2, 0.28), 0.8, (1, 0.9, 1)),
    ((0.68, 2.25, -0.34), 0.78, (1, 0.9, 1)),
    ((0.14, 2.3, 0.76), 0.72, (1, 0.9, 1)),
    ((0.12, 3.2, -0.06), 0.7, (1, 0.95, 1)),
    ((-0.3, 2.85, -0.62), 0.6, (1, 0.9, 1)),
]


def broadleaf(M):
    bark, leaf = M["bark"], M["leaf"]
    parts = [bole("trunk", 0.2, 0.115, 1.7, bark, seed=1.0, lean=(0.03, 0.0)), *roots(M, bark, 0.15)]
    # The fork at 1.6: primary limbs run up into the lumps of the crown, each
    # with a side twig that reaches out to a clump.
    tops = [((0.05, 1.7, 0), (0.62, 2.55, 0.1)), ((0.0, 1.7, 0), (-0.55, 2.5, -0.2)),
            ((0.0, 1.68, 0.02), (0.05, 2.9, 0.35)), ((0.02, 1.7, 0), (0.2, 3.1, -0.15))]
    for i, (a, b) in enumerate(tops):
        parts.append(limb(f"limb{i}", a, b, 0.085, 0.045, bark, sides=5, sag=0.03, seed=i))
    for i, (a, b) in enumerate([((0.3, 2.1, 0.06), (0.86, 2.4, 0.4)), ((-0.28, 2.15, -0.1), (-0.85, 2.45, -0.05)),
                                ((0.4, 2.3, 0.0), (0.8, 2.15, -0.4)), ((-0.15, 2.4, -0.2), (-0.35, 2.85, -0.55))]):
        parts.append(limb(f"twig{i}", a, b, 0.045, 0.02, bark, sides=4, seed=10 + i))
    parts.append(crown_core("core", BROADLEAF, 0.84, leaf, 520, 1.0))
    parts += nk.clumps("clump", BROADLEAF, 44, 0.2, 0.34, leaf, seed=4.0, bias=0.4)
    return finish(parts, "TreeBroadleafNear")


CONIFER = [
    # radius, rim y, apex y, underside apex
    (1.3, 0.72, 2.2, 1.05),
    (1.04, 1.62, 3.0, 1.9),
    (0.78, 2.5, 3.7, 2.72),
    (0.48, 3.28, 4.42, 3.45),
]


def conifer(M):
    """Each tier is a cone of overlapping fronds: a twig that droops out from
    the trunk with a spray of needle buds along it, over the lean model's own
    star-rimmed cone (drawn a little smaller so the fronds stand out of it)."""
    bark, leaf = M["bark"], M["leaf"]
    rnd = random.Random(21)
    parts = [bole("trunk", 0.16, 0.1, 1.15, bark, sides=6, seed=2.0), *roots(M, bark, 0.11, n=3)]
    for i, (r, y0, y1, under) in enumerate(CONIFER):
        tips = 9 - (i // 2)
        rim = []
        for k in range(tips * 2):
            a = 2 * math.pi * k / (tips * 2)
            tip = k % 2 == 0
            rr = r * (0.9 if tip else 0.68)
            rim.append((math.cos(a) * rr, math.sin(a) * rr, -0.06 if tip else 0.08))
        parts.append(lp.cone(f"core{i}", rim, y0, y1, leaf, under=under, turn=i * 0.37))
        # Fronds in rings, each ring a little higher and shorter than the last
        # on the way up the cone.
        rings = [(0.98, 0.0, 15 - 2 * i), (0.74, 0.28, 11 - i), (0.48, 0.5, 8 - i)]
        for ri, (rad, rise, count) in enumerate(rings):
            count = max(4, count)
            for k in range(count):
                a = 2 * math.pi * (k + 0.5 * ri + rnd.uniform(-0.12, 0.12)) / count + i * 0.37
                cx, sx = math.cos(a), math.sin(a)
                # Along the cone's surface, from near the axis out to the rim.
                y_at = lambda f: y0 + (y1 - y0) * rise * (1 - f) - 0.02 * f
                f0, f1 = rad * 0.28, rad
                base = (cx * r * f0, y_at(f0) + 0.02, sx * r * f0)
                tip = (cx * r * f1, y_at(f1) - 0.09 - 0.05 * (1 - rise), sx * r * f1)
                w = 0.13 + 0.05 * r
                parts.append(nk.bipyramid(f"frond{i}.{ri}.{k}", base, tip, w * 1.4, w * 0.5, leaf, at=0.55))
                # A needle spray on either side of the frond's twig.
                for s in (-1, 1):
                    for u, along in enumerate((0.42, 0.68)):
                        p = tuple(base[j] + (tip[j] - base[j]) * along for j in range(3))
                        side = (-sx * s * w * (1.0 - 0.3 * u), -0.03, cx * s * w * (1.0 - 0.3 * u))
                        e = (p[0] + side[0] + cx * 0.05, p[1] + side[1], p[2] + side[2] + sx * 0.05)
                        parts.append(nk.bipyramid(f"n{i}.{ri}.{k}.{s}{u}", p, e, w * 0.5, w * 0.24, leaf, at=0.5, sides=3))
    return finish(parts, "TreeConiferNear")


POPLAR = [
    ((-0.04, 1.95, 0.06), 1.0, (0.56, 0.9, 0.56)),
    ((0, 3.05, 0), 1.0, (0.62, 1.7, 0.62)),
    ((0.06, 4.4, 0.04), 1.0, (0.44, 1.12, 0.44)),
    ((-0.26, 2.75, 0.18), 0.5, (0.7, 1.1, 0.7)),
    ((0.24, 3.85, -0.14), 0.44, (0.7, 1.25, 0.7)),
]


def poplar(M):
    bark, leaf = M["bark"], M["leaf"]
    parts = [bole("trunk", 0.14, 0.085, 1.65, bark, sides=6, seed=3.0), *roots(M, bark, 0.1, n=3)]
    # Upswept limbs hug the trunk into the column of the crown.
    for i, (a, b) in enumerate([((0, 1.35, 0), (0.22, 2.3, 0.06)), ((0, 1.45, 0), (-0.2, 2.5, -0.08)),
                                ((0, 1.5, 0), (0.05, 2.7, 0.2))]):
        parts.append(limb(f"limb{i}", a, b, 0.05, 0.028, bark, sides=4, seed=i))
    parts.append(crown_core("core", POPLAR, 0.8, leaf, 460, 3.0))
    parts += nk.clumps("clump", POPLAR, 46, 0.18, 0.3, leaf, seed=7.0, squash=(0.9, 1.1, 0.9), bias=0.2)
    # The lean crown ends in a point: a few small clumps stacked up to it.
    for i, (y, r) in enumerate([(5.22, 0.2), (5.02, 0.26), (4.86, 0.3)]):
        parts.append(nk.lump(f"tip{i}", (0.06, y, 0.04), r, leaf, (0.85, 1.25, 0.85), i * 1.1, 0.16, 40.0 + i))
    return finish(parts, "TreePoplarNear")


BIRCH = [
    ((0.22, 2.62, 0.1), 0.66, (1, 0.85, 1)),
    ((-0.24, 3.2, -0.12), 0.72, (1, 0.88, 1)),
    ((0.48, 3.15, -0.38), 0.48, (1, 0.9, 1)),
    ((0.12, 3.86, 0.06), 0.54, (1, 0.9, 1)),
]


def birch(M):
    """A pale trunk with dark lenticel marks all the way up, whippy limbs and
    drooping twigs, and a loose crown of small clumps with the sky between."""
    pale, mark, leaf = M["birch"], M["mark"], M["leaf"]
    rnd = random.Random(31)
    parts = [bole("trunk", 0.115, 0.06, 2.75, pale, sides=6, seed=5.0, rings=7), *roots(M, pale, 0.065, n=3)]
    # The lean model's two bands, and lenticels between them: short dark
    # dashes half way round the trunk at irregular heights.
    def radius_at(y):
        return (0.115 + (0.06 - 0.115) * y / 2.75) * 0.97
    for y0, y1 in ((0.72, 0.8), (1.34, 1.41)):
        parts.append(lp.tube("band", (0, y0, 0), (0, y1, 0), radius_at(y0) * 1.02, radius_at(y1) * 1.02, mark, sides=6))
    for i in range(16):
        y = 0.3 + i * 0.145 + rnd.uniform(-0.03, 0.03)
        a = rnd.uniform(0, 6.28)
        r = radius_at(y)
        pos = (math.sin(a) * r, y, math.cos(a) * r)
        parts.append(lp.panel(f"len{i}", rnd.uniform(0.05, 0.1), 0.02, tuple(p * 1.0 for p in pos), mark, rot=(0, a, 0)))
    ends = [((0.03, 1.9, 0.02), (0.5, 2.65, 0.06)), ((0.0, 2.2, 0.0), (-0.32, 3.05, -0.1)),
            ((0.0, 2.45, 0.0), (0.12, 3.35, 0.05)), ((0.02, 2.6, 0.0), (0.42, 3.15, -0.35))]
    for i, (a, b) in enumerate(ends):
        parts.append(limb(f"limb{i}", a, b, 0.05, 0.022, pale, sides=4, seed=i, sag=0.02))
    # Drooping twigs off the limb ends, the birch's habit.
    for i in range(8):
        a, b = ends[i % 4]
        t = 0.5 + 0.1 * (i // 4)
        s = tuple(a[j] + (b[j] - a[j]) * t for j in range(3))
        ang = rnd.uniform(0, 6.28)
        e = (s[0] + math.cos(ang) * 0.32, s[1] - 0.12, s[2] + math.sin(ang) * 0.32)
        parts.append(limb(f"twig{i}", s, e, 0.02, 0.008, pale, sides=3, sag=-0.03, seed=20 + i))
    parts.append(crown_core("core", BIRCH, 0.68, leaf, 260, 5.0))
    parts += nk.clumps("clump", BIRCH, 44, 0.14, 0.26, leaf, seed=9.0, squash=(1.0, 0.7, 1.0), bias=0.3)
    return finish(parts, "TreeBirchNear")


def build():
    kit.reset()
    M = palette()
    trees = [broadleaf(M), conifer(M), poplar(M), birch(M)]
    lp.bake_alone(trees, distance=0.9, floor=0.5, samples=16)
    for obj, (y0, y1) in zip(trees, [(1.6, 3.0), (0.7, 3.8), (1.2, 4.2), (2.1, 3.7)]):
        lp.grade(obj, "paint", y0, y1, 0.72)
    return trees


def preview(_=0):
    return lp.row(build())
