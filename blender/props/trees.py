"""
The four tree species, modelled by script (spike: Blender assets vs procedural).

Same species, sizes and silhouettes as `speciesParts` in
`components/city/models/props/trees.ts`, and the same contract: origin at the
foot of the trunk, the crown in a `paint` material (the instance's leaf tint
paints it and the wind sways it), the bark not. A hundred of them stand in a
city, so each stays under the 170 triangles `trees.test.ts` allows.

What Blender buys within that budget: a crown that is one lumpy hull rather
than five balls buried in each other (every triangle is on the outside), a
conifer whose tiers end in a star of branch tips and are hollow underneath,
and baked occlusion that puts the inside and underside of a crown in its own
shade and darkens the trunk under it.

Nodes: TreeBroadleaf, TreeConifer, TreePoplar, TreeBirch.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import finish  # noqa: E402

TREE_TRUNK = "#8a6d52"
BIRCH_BARK = "#e4e0d5"
BIRCH_MARK = "#3b3935"


def palette():
    m = kit.material
    return {
        # White: the instance's leaf tint is the colour; the bake is the shade.
        "leaf": m("paint", "#ffffff", "foliage", 0.9),
        "bark": m("bark", TREE_TRUNK, "timber", 0.9),
        "birch": m("birch", BIRCH_BARK, "timber", 0.8),
        "mark": m("mark", BIRCH_MARK, "timber", 0.9),
    }


def roots(M, mat, radius, n=3, start=0.3):
    """Three root flares, as the procedural trunk has."""
    out = []
    for i in range(n):
        a = start + i * 2 * math.pi / n
        foot = (math.cos(a) * (radius + 0.2), 0.0, -math.sin(a) * (radius + 0.2))
        top = (math.cos(a) * radius * 0.3, 0.42, -math.sin(a) * radius * 0.3)
        out.append(lp.tube(f"root{i}", foot, top, 0.06, 0.1, mat, sides=3, turn=a))
    return out


def broadleaf(M):
    bark = M["bark"]
    parts = [
        lp.tube("trunk", (0, 0, 0), (0, 1.95, 0), 0.21, 0.12, bark, sides=6),
        lp.tube("limbL", (0.04, 1.3, 0), (0.55, 2.05, 0.08), 0.08, 0.045, bark, sides=4),
        lp.tube("limbR", (-0.04, 1.45, 0), (-0.5, 2.1, -0.2), 0.075, 0.04, bark, sides=4),
        *roots(M, bark, 0.15),
        lp.blobs(
            "crown",
            [
                ((0, 2.55, 0), 1.12, (1, 0.86, 1)),
                ((-0.74, 2.2, 0.28), 0.8, (1, 0.9, 1)),
                ((0.68, 2.25, -0.34), 0.78, (1, 0.9, 1)),
                ((0.14, 2.3, 0.76), 0.72, (1, 0.9, 1)),
                ((0.12, 3.2, -0.06), 0.7, (1, 0.95, 1)),
                ((-0.3, 2.85, -0.62), 0.6, (1, 0.9, 1)),
            ],
            M["leaf"],
            wobble=0.08,
            seed=1.0,
            decimate=116,
        ),
    ]
    return finish(parts, "TreeBroadleaf")


def conifer(M):
    """Stepped tiers whose rims are a star of drooping branch tips, hollow
    underneath so the tier above casts its shade into the one below."""
    bark = M["bark"]
    tiers = [
        # radius, rim y, apex y, tips, underside apex
        (1.3, 0.72, 2.2, 9, 1.05),
        (1.04, 1.62, 3.0, 9, 1.9),
        (0.78, 2.5, 3.7, 8, 2.72),
        (0.48, 3.28, 4.42, 7, 3.45),
    ]
    parts = [lp.tube("trunk", (0, 0, 0), (0, 1.1, 0), 0.17, 0.11, bark, sides=5), *roots(M, bark, 0.11)]
    for i, (r, y0, y1, tips, under) in enumerate(tiers):
        rim = []
        for k in range(tips * 2):
            a = 2 * math.pi * k / (tips * 2)
            tip = k % 2 == 0
            rr = r if tip else r * 0.72
            # Branch tips droop; the notches between them ride higher.
            dy = -0.08 if tip else 0.1
            rim.append((math.cos(a) * rr, math.sin(a) * rr, dy))
        parts.append(lp.cone(f"tier{i}", rim, y0, y1, M["leaf"], under=under, turn=i * 0.37))
    return finish(parts, "TreeConifer")


def poplar(M):
    bark = M["bark"]
    parts = [
        lp.tube("trunk", (0, 0, 0), (0, 1.5, 0), 0.15, 0.09, bark, sides=5),
        *roots(M, bark, 0.1),
        lp.blobs(
            "crown",
            [
                ((-0.04, 1.95, 0.06), 1.0, (0.56, 0.9, 0.56)),
                ((0, 3.05, 0), 1.0, (0.62, 1.7, 0.62)),
                ((0.06, 4.4, 0.04), 1.0, (0.44, 1.12, 0.44)),
                ((-0.26, 2.75, 0.18), 0.5, (0.7, 1.1, 0.7)),
                ((0.24, 3.85, -0.14), 0.44, (0.7, 1.25, 0.7)),
            ],
            M["leaf"],
            wobble=0.07,
            seed=3.0,
            decimate=120,
        ),
    ]
    return finish(parts, "TreePoplar")


def birch(M):
    """A pale trunk ringed with dark bark marks, one limb, and a loose crown
    of three clumps you can see the sky between."""
    pale, mark = M["birch"], M["mark"]
    trunk = []
    # The trunk in bands so the marks are faces of their own, not decals.
    bands = [(0.0, 0.72, pale), (0.72, 0.8, mark), (0.8, 1.34, pale), (1.34, 1.41, mark), (1.41, 2.75, pale)]
    for i, (y0, y1, mat) in enumerate(bands):
        r0 = 0.12 - 0.04 * (y0 / 2.75)
        r1 = 0.12 - 0.04 * (y1 / 2.75)
        trunk.append(lp.tube(f"band{i}", (0, y0, 0), (0, y1, 0), r0, r1, mat, sides=5))
    parts = [
        *trunk,
        *roots(M, pale, 0.065),
        lp.tube("limb", (0.02, 1.9, 0.02), (0.5, 2.62, 0.05), 0.055, 0.03, pale, sides=4),
        lp.blobs(
            "crown",
            [
                ((0.22, 2.62, 0.1), 0.66, (1, 0.85, 1)),
                ((-0.24, 3.2, -0.12), 0.72, (1, 0.88, 1)),
                ((0.48, 3.15, -0.38), 0.48, (1, 0.9, 1)),
                ((0.12, 3.86, 0.06), 0.54, (1, 0.9, 1)),
            ],
            M["leaf"],
            wobble=0.08,
            seed=5.0,
            decimate=88,
        ),
    ]
    return finish(parts, "TreeBirch")


def build():
    kit.reset()
    M = palette()
    trees = [broadleaf(M), conifer(M), poplar(M), birch(M)]
    lp.bake_alone(trees, distance=0.9, floor=0.5)
    # The underside of a crown sits in its own shade: from 0.72 at its foot
    # to full light across its top half.
    for obj, (y0, y1) in zip(trees, [(1.6, 3.0), (0.7, 3.8), (1.2, 4.2), (2.1, 3.7)]):
        lp.grade(obj, "paint", y0, y1, 0.72)
    return trees


def preview(_=0):
    return lp.row(build())
