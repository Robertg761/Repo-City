"""
The village halt's near level: `Halt1` and `Halt2` of `halt.py`, each the
lean halt drawn over -- ballast stone between the sleepers, rail chairs and
clips, platform slabs and a coursed edge, a pointed-picket fence, a boarded
shelter with a slate roof and its battens, a name board with lettering, cast
lamps, a slatted bench, milk churns with their rings and lids, a barrow with
spokes -- and, at level 2, a railcar with framed panes, doors and handrails,
a roof with ribs and a cooler, flanged wheels with axle boxes, buffers and
couplings.

  blender -b --python blender/export.py -- blender/landmarks/halt_near.py village-halt-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
from kit import finish  # noqa: E402

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "halt.py"))
TRACK_Z, PLATFORM_Z, PLAT_Y, LAMP_Z = lean.TRACK_Z, lean.PLATFORM_Z, lean.PLAT_Y, lean.LAMP_Z

REPLACED = ("picket", "nameLetters", "lampFoot", "lampPost", "lantern", "lampCap", "benchSeat", "benchBack", "benchEnd", "wheel")


def track(acc, obj, M):
    free = nkit.ground_free(obj, 0.2, 0.4)
    nd.pebbles(acc, M["flag"], -7.3, 7.3, TRACK_Z - 1.15, TRACK_Z + 1.15, 0.2, 2500, size=0.05, seed=12, keep=free)
    for i in range(22):
        x = -7.2 + i * 0.69
        for s in (-1, 1):
            z = TRACK_Z + s * 0.55
            acc.box(M["flag"], (0.18, 0.025, 0.2), (x, 0.298, z), skip=("ny",))
            for c in (-1, 1):
                acc.box(M["steel"], (0.03, 0.03, 0.05), (x + c * 0.06, 0.32, z + s * 0.08))
    for s in (-1, 1):
        for k in range(3):
            for side in (-1, 1):
                acc.box(M["steel"], (0.45, 0.09, 0.015), (-4.6 + k * 4.6, 0.35, TRACK_Z + s * 0.55 + side * 0.045))
            for b in range(4):
                acc.cyl(M["dark"], 0.012, 0.03, (-4.6 - 0.15 + k * 4.6 + b * 0.1, 0.35, TRACK_Z + s * 0.55 + 0.05), axis="z", sides=6)
    # The buffer stop: a chain of rivets down the beam and a bracket each side.
    bx = 7.2
    for k in range(6):
        acc.cyl(M["dark"], 0.02, 0.03, (bx + 0.16, 0.6 + k * 0.05 + 0.1, TRACK_Z + (k - 2.5) * 0.2), axis="x", sides=6)
    for s in (-1, 1):
        acc.cyl(M["steel"], 0.18, 0.03, (bx - 0.27, 0.7, TRACK_Z + s * 0.45), axis="x", sides=12)


def platform(acc, obj, M):
    pz = PLATFORM_Z
    free = nkit.ground_free(obj, PLAT_Y, 0.4)
    nd.paving(acc, M["joint"], -5.95, 5.95, pz - 1.05, pz + 1.55, PLAT_Y, size=0.5, thick=0.02, keep=free)
    nkit.courses(acc, obj, lean.S("deck", 0.93), ("deck",), pitch=0.15, thick=0.135, lift=0.003, sample=0.2, min_area=2.0, block=0.5, gap=0.012, y_min=0.21)
    # The coping edge in stone blocks, tactile studs behind it.
    n = int(11.9 / 0.5)
    for i in range(n):
        acc.box(M["flag"], (11.9 / n - 0.02, 0.05, 0.36), (-5.95 + (i + 0.5) * 11.9 / n, PLAT_Y + 0.05, pz - 1.425), skip=("ny",))
    for row in range(2):
        x = -5.8
        while x < 5.8:
            with acc.at((x, PLAT_Y + 0.09, pz - 1.2 + row * 0.08), 0.0, rot=(-math.pi / 2, 0, 0)):
                nd.frustum(acc, M["accent"], 0.05, 0.05, 0.014, 0.012)
            x += 0.09
    # A picket fence with pointed tops along the back, and a gate gap.
    for i in range(70):
        x = -5.75 + i * 0.165
        if abs(x - 4.0) < 1.1:
            continue
        zf = pz + 1.55
        acc.box(M["wall"], (0.07, 0.62, 0.03), (x, PLAT_Y + 0.31, zf), skip=("ny",))
        acc.prism(M["wall"], [(-0.035, 0.0), (0.035, 0.0), (0, 0.09)], 0.03, pos=(x, PLAT_Y + 0.62, zf))
    for y in (0.25, 0.55):
        acc.box(M["wall"], (11.9, 0.05, 0.03), (0, PLAT_Y + y, pz + 1.51))
    for i in range(9):
        acc.box(M["wall"], (0.09, 0.8, 0.07), (-5.9 + i * 1.475, PLAT_Y + 0.4, pz + 1.55))
    for s in (-1, 1):
        acc.box(M["wall"], (0.14, 0.9, 0.14), (4.0 + s * 1.15, PLAT_Y + 0.45, pz + 1.55))
        acc.sphere(M["wall"], 0.06, (4.0 + s * 1.15, PLAT_Y + 0.95, pz + 1.55), sides=6, rings=4)


def shelter(acc, obj, M):
    sx, sz = -1.2, PLATFORM_Z + 0.7
    y0 = PLAT_Y
    for face in nkit.slopes(obj, ("roof",), min_area=0.5, lo=0.15, hi=0.95):
        nd.slates(acc, face, M["ridge"], width=0.28, exposure=0.17, thick=0.013, gap=0.006)
    acc.rod(M["ridge"], (sx - 2.3, y0 + 2.3 + 0.86 + 0.06, sz - 0.1), (sx + 2.3, y0 + 2.3 + 0.86 + 0.06, sz - 0.1), 0.07, sides=8)
    # Board-and-batten on the back and the ends; window frames; a notice frame.
    nkit.ribs(acc, obj, M["oak"], ("wall",), pitch=0.12, width=0.035, lift=0.007, sample=0.2, min_area=1.5, y_min=y0 + 0.75)
    sash = {"frame": M["wall"], "trim": M["wall"]}
    for o in nkit.openings(obj):
        cx, cy, cz = o["centre"]
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="plain", bars=(3, 1), sill=True, lintel=True)
    for i in range(12):
        x = sx - 2.05 + i * 0.37
        acc.box(M["accent"], (0.03, 0.04, 0.05), (x, y0 + 2.2, sz - 1.5))
    # Bracket knees under the roof's eaves.
    for s in (-1, 1):
        for z in (-0.75, 0.75):
            acc.bar(M["oak"], (sx + s * 1.72, y0 + 1.75, sz + z), (sx + s * 1.95, y0 + 2.12, sz + z), 0.05, 0.05)


def furniture(acc, M):
    pz = PLATFORM_Z
    y0 = PLAT_Y
    with acc.at((4.0, y0 + 1.75, pz + 0.9 - 0.04 - 0.02), math.pi):
        nd.letters(acc, M["accentDeep"], "HALT", 0.3, pos=(0, 0, 0.0), depth=0.02)
    for s in (-1, 1):
        for sy in (-1, 1):
            acc.cyl(M["dark"], 0.02, 0.03, (4.0 + s * 0.9, y0 + 1.75 + sy * 0.2, pz + 0.9 - 0.05), axis="z", sides=6)
    for x in lean.LAMPS:
        nd.lamp_standard(acc, {"iron": M["accentDeep"], "glass": M["glass"]}, (x, y0, LAMP_Z), height=2.66)
    nd.bench(acc, {"wood": M["wood"], "iron": M["dark"]}, (-4.6, y0, pz + 0.9), math.pi, length=1.4)
    for cx in (5.3, 5.62):
        for y in (0.08, 0.28, 0.42):
            acc.cyl(M["steel"], 0.16 - (y - 0.08) * 0.1, 0.025, (cx, y0 + y, pz - 0.2), sides=8)
        acc.cyl(M["steel"], 0.11, 0.04, (cx, y0 + 0.52, pz - 0.2), sides=8)
        for s in (-1, 1):
            acc.bar(M["steel"], (cx + s * 0.12, y0 + 0.42, pz - 0.2), (cx + s * 0.16, y0 + 0.3, pz - 0.2), 0.02)
    # The barrow: spokes, a tub with ribs, two legs.
    bx, bz = -3.0, pz - 0.3
    for k in range(8):
        a = math.tau * k / 8
        acc.rod(M["dark"], (bx, y0 + 0.16, bz - 0.4), (bx + 0.0, y0 + 0.16 + math.sin(a) * 0.13, bz - 0.4 + math.cos(a) * 0.13), 0.008, sides=3)
    for k in range(3):
        acc.box(M["dark"], (0.52, 0.02, 0.02), (bx, y0 + 0.37, bz - 0.3 + k * 0.3), rot=(0.15, 0, 0))
    for s in (-1, 1):
        acc.bar(M["wood"], (bx + s * 0.2, y0 + 0.3, bz - 0.4), (bx + s * 0.22, y0 + 0.62, bz + 0.6), 0.035, 0.03)
        acc.bar(M["dark"], (bx + s * 0.2, y0 + 0.33, bz + 0.3), (bx + s * 0.2, y0, bz + 0.34), 0.03)


def railcar(acc, M):
    car = 4.6
    y0 = 0.4
    for cx in (-car / 2 - 0.1, car / 2 + 0.1):
        for s in (-1, 1):
            with acc.at((0, 0, TRACK_Z + s * 0.875), 0.0 if s > 0 else math.pi):
                u = (lambda x: x) if s > 0 else (lambda x: -x)
                for i in range(4):
                    a = cx - 1.6 + i * 0.8 + 0.06
                    b = a + 0.8 - 0.12
                    xa, xb = sorted((u(a), u(b)))
                    acc.rect_frame(M["dark"], xa, xb, y0 + 1.1, y0 + 1.5, [(0, 0), (0, 0.02), (0.02, 0.02), (0.02, 0)])
                    acc.box(M["dark"], (xb - xa - 0.1, 0.018, 0.012), (u((a + b) / 2), y0 + 1.46, 0.01))
                door_x = cx + 1.85 * (1 if cx > 0 else -1) * -1
                acc.rect_frame(M["dark"], u(door_x) - 0.22, u(door_x) + 0.22, y0 + 0.5, y0 + 1.55, [(0, 0), (0, 0.015), (0.02, 0.015), (0.02, 0)])
                for off in (-0.28, 0.28):
                    acc.rod(M["dark"], (u(door_x) + off, y0 + 0.4, 0.05), (u(door_x) + off, y0 + 1.4, 0.05), 0.014, sides=6)
                acc.box(M["dark"], (0.6, 0.03, 0.1), (u(door_x), y0 + 0.36, 0.05))
                xx = cx - 2.15
                while xx < cx + 2.2:
                    for yy in (y0 + 0.27, y0 + 1.78):
                        acc.cyl(M["dark"], 0.012, 0.02, (u(xx), yy, 0.0), axis="z", sides=6, r2=0.007)
                    xx += 0.12
                for k in (-1.2, 0.0, 1.2):
                    with acc.at((u(cx + k), y0 + 0.18, -0.03)):
                        nd.louvre_panel(acc, M["dark"], 0.4, 0.14, slat=0.04, tilt=0.4, depth=0.03)
        # The roof: ribs across the curve and a cooler with fans.
        for k in range(int(car / 0.5)):
            x = cx - car / 2 + 0.3 + k * 0.5
            acc.box(M["roof"], (0.035, 0.03, 1.5), (x, y0 + 1.98, TRACK_Z), skip=("ny",))
        for zc in (-0.25, 0.25):
            acc.cyl(M["dark"], 0.16, 0.03, (cx, y0 + 2.06, TRACK_Z + zc), sides=12)
            for k in range(6):
                with acc.at((cx, y0 + 2.08, TRACK_Z + zc), k * math.tau / 6):
                    acc.box(M["dark"], (0.14, 0.008, 0.04), (0.08, 0, 0), rot=(0.3, 0, 0))
        # Bogies: flanged wheels, axle boxes, springs and brake discs.
        for bxo in (-1.4, 1.4):
            for s in (-1, 1):
                z = TRACK_Z + s * 0.55
                x = cx + bxo
                acc.cyl(M["dark"], 0.2, 0.06, (x, 0.42, z), axis="z", sides=20)
                acc.cyl(M["dark"], 0.225, 0.016, (x, 0.42, z - s * 0.036), axis="z", sides=20, r2=0.208)
                acc.cyl(M["steel"], 0.07, 0.07, (x, 0.42, z + s * 0.02), axis="z", sides=8)
                acc.box(M["dark"], (0.16, 0.13, 0.13), (x, 0.44, z + s * 0.11))
                for k in range(3):
                    acc.cyl(M["steel"], 0.04, 0.01, (x, 0.53 + k * 0.025, z + s * 0.11), sides=8)
            acc.rod(M["dark"], (cx + bxo, 0.42, TRACK_Z - 0.6), (cx + bxo, 0.42, TRACK_Z + 0.6), 0.035, sides=6)
    # The cabs: wipers, a lamp bezel, buffers and a coupling at each end.
    car_end = car + 0.1
    for s in (-1, 1):
        ex = s * car_end
        with acc.at((ex, 0, TRACK_Z), s * math.pi / 2):
            for z in (-0.3, 0.3):
                acc.rod(M["dark"], (z - 0.15, y0 + 1.15, 0.05), (z + 0.2, y0 + 1.5, 0.05), 0.008, sides=4)
            for z in (-0.5, 0.5):
                acc.rect_frame(M["dark"], z - 0.11, z + 0.11, y0 + 0.62, y0 + 0.82, [(0, 0), (0, 0.02), (0.015, 0.02), (0.015, 0)], z=0.04)
                acc.cyl(M["dark"], 0.05, 0.14, (z * 0.9, y0 + 0.28, 0.1), axis="z", sides=8)
                acc.cyl(M["dark"], 0.09, 0.03, (z * 0.9, y0 + 0.28, 0.19), axis="z", sides=10)
            acc.box(M["dark"], (0.12, 0.1, 0.22), (0, y0 + 0.36, 0.12))
            acc.box(M["dark"], (1.2, 0.05, 0.1), (0, y0 + 0.16, 0.06))


def near(M, level):
    parts = nkit.drop(lean.halt(M, level), *REPLACED)
    obj = finish(parts, f"Halt{level}Lean")
    acc = nkit.Acc()
    track(acc, obj, M)
    platform(acc, obj, M)
    shelter(acc, obj, M)
    furniture(acc, M)
    if level >= 2:
        railcar(acc, M)
    return nkit.rejoin(obj, acc.objects(), f"Halt{level}Near")


def build(levels=(1, 2)):
    kit.reset()
    M = lean.palette()
    made = []
    for level in levels:
        made.append(near(M, level))
        lean.lkit.bake(made[-1], [], made, distance=0.8)
    return made


def preview(level):
    return build((level,))
