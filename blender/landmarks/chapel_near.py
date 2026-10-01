"""
The village chapel's near level: the lean chapel (`chapel.py`) with its
stonework drawn in -- coursed blocks on every wall, a slate on every roof
face, lancets with moulded surrounds and leaded diamonds, a clock with
numerals, an oak door with studs and hinge straps, buttress set-offs, a
ridge roll, gutters with round downpipes, gravestones with their lettering,
yews and shrubs in leaf, and a lawn of grass.

  blender -b --python blender/export.py -- blender/landmarks/chapel_near.py village-chapel-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
import animkit  # noqa: E402
from kit import finish  # noqa: E402

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "chapel.py"))
NAVE_W, NAVE_H, NAVE_Z0, NAVE_Z1, TOWER, TOWER_Z, TOWER_H, FRONT = (
    lean.NAVE_W, lean.NAVE_H, lean.NAVE_Z0, lean.NAVE_Z1, lean.TOWER, lean.TOWER_Z, lean.TOWER_H, lean.FRONT,
)

REPLACED = ("hood", "eastHood", "sill", "mullion", "eastMull", "clock", "clockRim", "hand", "gutter", "downpipe", "notice", "noticeFace")


def lean_parts(M):
    return lean.churchyard(M) + lean.nave(M) + lean.tower(M) + lean.graves(M)


def lancets(acc, M):
    mats = {"trim": M["trim"], "frame": M["metal"]}
    for s in (-1, 1):
        fx = s * NAVE_W / 2
        for z in (-2.9, -0.8, 1.3):
            with acc.at((fx - s * 0.12, 1.05, z), s * math.pi / 2):
                nd.lancet(acc, 0.62, 1.55, 0.12, mats)
                acc.box(M["trim"], (0.8, 0.07, 0.2), (0, -0.05, 0.16), skip=("nz",))
    # The east window, larger, with a sill and a hood.
    with acc.at((0, 1.0, NAVE_Z0 - 1.38), math.pi):
        nd.lancet(acc, 0.9, 1.1, 0.12, mats)
        acc.box(M["trim"], (1.1, 0.08, 0.24), (0, -0.05, 0.16), skip=("nz",))
    # The belfry openings: a surround on each face, louvres already behind.
    loop = nd.lancet_points(0.7, 0.75)
    prof = [(0.0, 0.0), (0.0, 0.05), (0.03, 0.05), (0.03, 0.075), (0.09, 0.075), (0.09, 0.03), (0.12, 0.03), (0.12, 0.0)]
    for yaw, (nx, nz) in ((0.0, (0, 1)), (math.pi, (0, -1)), (math.pi / 2, (1, 0)), (-math.pi / 2, (-1, 0))):
        with acc.at((nx * TOWER / 2, TOWER_H - 1.55, TOWER_Z + nz * TOWER / 2), yaw):
            acc.sweep(M["trim"], loop, prof, plane="xy", at=0.0)
            acc.box(M["trim"], (0.88, 0.07, 0.2), (0, -0.05, 0.1), skip=("nz",))
            acc.box(M["trim"], (0.1, 0.9, 0.1), (0, 0.9, 0.02))


def masonry(acc, obj, M):
    stone = lean.S("stone", 0.94)
    nkit.courses(acc, obj, stone, ("stone",), pitch=0.22, thick=0.2, lift=0.004, sample=0.2, min_area=0.5, block=0.55, gap=0.014, y_min=0.35)


def roofs(acc, obj, M):
    for face in nkit.slopes(obj, ("roof",), min_area=0.6, lo=0.15, hi=0.95):
        nd.slates(acc, face, M["ridge"], width=0.3, exposure=0.19, thick=0.014, gap=0.006)
    # A roll on the nave and chancel ridges, and the finials.
    naveZ = (NAVE_Z0 + NAVE_Z1) / 2
    acc.rod(M["ridge"], (0, NAVE_H - 0.1 + 2.6 + 0.24, NAVE_Z0 - 0.25), (0, NAVE_H - 0.1 + 2.6 + 0.24, NAVE_Z1 + 0.25), 0.11, sides=8)
    acc.rod(M["ridge"], (0, 2.95 + 1.7 + 0.2, NAVE_Z0 - 1.6), (0, 2.95 + 1.7 + 0.2, NAVE_Z0 - 0.0), 0.09, sides=8)
    for z in (NAVE_Z0 - 0.25, NAVE_Z1 + 0.25):
        acc.sphere(M["trim"], 0.12, (0, NAVE_H - 0.1 + 2.6 + 0.26, z), sides=8, rings=5)
    # Gutters on both eaves with round downpipes at the east end.
    for s in (-1, 1):
        nd.gutter(acc, M["metal"], (s * (NAVE_W / 2 + 0.33), NAVE_Z0 - 0.25), (s * (NAVE_W / 2 + 0.33), NAVE_Z1 + 0.25), NAVE_H - 0.12)
        nd.downpipe(acc, M["metal"], s * (NAVE_W / 2 + 0.34), NAVE_Z0 + 0.1, 0.0, NAVE_H - 0.15, yaw=s * math.pi / 2, hopper=True)
        for z in (-3.85, -1.85, 0.25, 2.25):
            acc.box(M["dressed"], (0.34, 0.06, 0.3), (s * (NAVE_W / 2 + 0.3), 1.25, z))


def tower(acc, M):
    nd.clock(acc, 0.42, {"rim": M["metal"], "dial": M["trim"], "ink": M["metal"]}, pos=(0, TOWER_H - 2.6, FRONT + 0.0), hands=False)
    # The doorway: studs on the boards, hinge straps with curled ends, a ring handle.
    with acc.at((0, 0.4, FRONT - 0.09)):
        for r in range(5):
            for c in range(4):
                acc.cyl(M["metal"], 0.022, 0.02, (-0.32 + c * 0.21, 0.35 + r * 0.24, 0.03), axis="z", sides=6, r2=0.012)
        for y in (0.4, 1.1):
            acc.box(M["metal"], (0.9, 0.05, 0.02), (0, y + 0.12, 0.035))
            for s in (-1, 1):
                acc.cyl(M["metal"], 0.05, 0.02, (s * 0.44, y + 0.12, 0.038), axis="z", sides=8)
        acc.cyl(M["metal"], 0.07, 0.015, (0.18, 0.75, 0.04), axis="z", sides=12)
        acc.cyl(M["metal"], 0.045, 0.02, (0.18, 0.75, 0.045), axis="z", sides=10)
    # String courses get a weathering, and the parapet a drip.
    acc.rect_run(M["trim"], -TOWER / 2, TOWER / 2, TOWER_Z - TOWER / 2, TOWER_Z + TOWER / 2, [(0, 0), (0.16, 0), (0.16, 0.04), (0.08, 0.08), (0, 0.08)], y=TOWER_H - 0.05)
    # Merlon caps and pinnacle finials.
    for x in (-1, 1):
        for z in (-1, 1):
            acc.cyl(M["trim"], 0.09, 0.14, (x * TOWER / 2, TOWER_H + 1.24, TOWER_Z + z * TOWER / 2), sides=4, r2=0.01, phase=math.pi / 4)
    # A notice board with pinned sheets.
    with acc.at((0.95, 1.3, FRONT + 0.05)):
        acc.rect_frame(M["wood"], -0.35, 0.35, -0.25, 0.25, [(0, 0), (0, 0.05), (0.03, 0.05), (0.03, 0)])
        acc.box(M["trim"], (0.56, 0.36, 0.01), (0, 0, 0.02))
        for k in range(3):
            acc.box(M["dressed"], (0.15, 0.2, 0.008), (-0.18 + k * 0.18, 0.02, 0.03), rot=(0, 0, (k - 1) * 0.08))


def yard(acc, obj, M):
    # Headstone lettering and mounds with flowers, a flagstone path with joints.
    for x, z, tilt in ((2.9, -1.2, 0.05), (2.9, -2.6, -0.08), (2.9, -4.0, 0.02), (-3.0, -0.6, -0.06), (-3.0, -2.2, 0.08), (3.6, 3.2, -0.05), (-3.5, 3.4, 0.07)):
        with acc.at((x, 0.0, z), tilt * 3):
            for k in range(3):
                acc.box(M["recess"], (0.26 - k * 0.05, 0.022, 0.014), (0, 0.32 - k * 0.07, 0.066))
            acc.box(M["dressed"], (0.56, 0.09, 0.24), (0, 0.045, 0.02))
            for a in range(5):
                acc.sphere(M["trim"] if a % 2 else M["wood"], 0.03, (-0.15 + a * 0.075, 0.1, 0.62), sides=6, rings=3)
    # Yews and bushes in leaf.
    yews = [(-2.6, -4.6, 1.2, 1.9), (-2.6, -4.6, 0.95, 3.1), (-2.6, -4.6, 0.6, 4.1)]
    for i, (x, z, r, y) in enumerate(yews):
        nd.foliage(acc, M["yew"], (x, y, z), r * 0.95, 130, size=0.12, seed=40 + i, squash=1.0, dark=M["grass"])
    for i, (bx, bz) in enumerate(((3.2, 4.9), (-3.3, 1.2))):
        nd.foliage(acc, M["yew"], (bx, 0.03 + 0.5 * 0.8 * 0.9 + 0.09, bz), 0.52, 90, size=0.1, seed=50 + i, squash=0.8, dark=M["grass"])
    # The lawn: grass tufts wherever nothing stands.
    free = nkit.ground_free(obj, 0.06, 0.4)
    nd.grass(acc, M["yew"], -4.05, 4.05, -5.55, 5.55, 0.06, 600, seed=6, keep=free, height=0.1)
    # Gate: iron hinges and a latch, piers with moulded caps.
    for s in (-1, 1):
        acc.cyl(M["metal"], 0.04, 0.16, (s * 1.3 + 0.0, 0.7, 5.62), axis="x", sides=6)
        acc.rect_run(M["trim"], s * 1.3 - 0.3, s * 1.3 + 0.3, 5.62 - 0.3, 5.62 + 0.3, [(0, 0), (0.05, 0), (0.05, 0.04), (0, 0.04)], y=0.93)


def animated(M, scope="ChapelNear"):
    """The hands and the second hand, turned by the app, over the near dial."""
    return animkit.clock_hands(f"{scope}.Clock.0", M["metal"], (0.0, TOWER_H - 2.6, FRONT + 0.0), 0.42, z=0.145, depth=0.014, lift=0.022, second=True)


def build():
    kit.reset()
    M = lean.palette()
    parts = nkit.drop(lean_parts(M), *REPLACED)
    obj = finish(parts, "ChapelLean")
    acc = nkit.Acc()
    lancets(acc, M)
    masonry(acc, obj, M)
    roofs(acc, obj, M)
    tower(acc, M)
    yard(acc, obj, M)
    near = nkit.rejoin(obj, acc.objects(), "ChapelNear")
    kit.bake_ao([near], distance=0.9, samples=16, floor=0.55)
    return [near] + animated(M)


def preview(_=0):
    return build()
