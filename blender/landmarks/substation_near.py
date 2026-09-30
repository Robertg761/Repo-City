"""
The village substation's near level: the lean substation (`substation.py`)
drawn over -- a yard of loose stone, a welded-mesh fence with barbed arms and
a gate with its hinges, a transformer with bolted lid, radiator fins, fans,
gauge, breather, porcelain sheds and wheels, a hut with ribbed cladding and a
seamed roof, framed glazing and gutters, and poles with climbing steps and
pin insulators.

  blender -b --python blender/export.py -- blender/landmarks/substation_near.py village-substation-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
from kit import finish  # noqa: E402

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "substation.py"))
FX, FZ, TX, TZ, HX, HZ = lean.FX, lean.FZ, lean.TX, lean.TZ, lean.HX, lean.HZ

REPLACED = ("insulator", "downpipe")


def yard(acc, obj, M):
    free = nkit.ground_free(obj, 0.1, 0.4)
    nd.pebbles(acc, M["deck"], -FX + 0.2, FX - 0.2, -FZ + 0.2, FZ - 0.2, 0.1, 4400, size=0.05, seed=9, keep=free)
    free_pad = nkit.ground_free(obj, 0.11, 0.4)
    nd.paving(acc, M["pad"], 0.45, 1.75, 1.9, 3.3, 0.11, size=0.42, thick=0.02, keep=free_pad)
    nd.paving(acc, M["pad"], 0.9, 2.05, -0.3, 1.8, 0.11, size=0.42, thick=0.02, keep=free_pad)


def fence(acc, M):
    steel, dark = M["steel"], M["dark"]
    gate = 1.2
    runs = [
        ((-FX, -FZ), (FX, -FZ)),
        ((FX, -FZ), (FX, FZ)),
        ((-FX, -FZ), (-FX, FZ)),
        ((-FX, FZ), (-gate, FZ)),
        ((gate, FZ), (FX, FZ)),
    ]
    for a, b in runs:
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        nx, nz = dz / length, -dx / length
        n = int(length / 0.09)
        for i in range(n + 1):
            t = i / n
            # The mesh hangs a hand's breadth outside the posts, so no face of it lies in a post's.
            px, pz = a[0] + dx * t + nx * 0.035, a[1] + dz * t + nz * 0.035
            acc.rod(dark, (px, 0.22, pz), (px, 1.7, pz), 0.007, sides=3, caps=False)
        m = max(1, round(length / 1.0))
        for i in range(m + 1):
            t = i / m
            p = (a[0] + dx * t, a[1] + dz * t)
            acc.rod(steel, (p[0], 1.8, p[1]), (p[0] + nx * 0.25, 2.0, p[1] + nz * 0.25), 0.016, sides=4)
            acc.sphere(steel, 0.05, (p[0], 1.84, p[1]), sides=6, rings=3)
        for off, y in ((0.0, 1.82), (0.13, 1.92), (0.25, 2.0)):
            acc.bar(steel, (a[0] + nx * off, y, a[1] + nz * off), (b[0] + nx * off, y, b[1] + nz * off), 0.009, 0.009)
        for k in range(int(length / 0.25)):
            t = (k + 0.5) / int(length / 0.25)
            acc.bar(steel, (a[0] + dx * t + nx * 0.13, 1.89, a[1] + dz * t + nz * 0.13), (a[0] + dx * t + nx * 0.13, 1.95, a[1] + dz * t + nz * 0.13), 0.007, 0.02)
    # The gate posts' caps and hinges, the hazard sign's bolts and its lettering.
    for s in (-1, 1):
        acc.box(steel, (0.16, 0.05, 0.16), (s * gate, 1.92, FZ))
        for y in (0.4, 1.5):
            acc.cyl(dark, 0.03, 0.14, (s * gate + s * 0.05, y, FZ + 0.0), sides=6)
    with acc.at((1.8, 1.25, FZ + 0.075)):
        nd.letters(acc, dark, "HIGH", 0.13, pos=(0, 0.1, 0.0), depth=0.006)
        nd.letters(acc, dark, "VOLT", 0.13, pos=(0, -0.08, 0.0), depth=0.006)
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.cyl(steel, 0.014, 0.02, (sx * 0.22, sy * 0.17, 0.0), axis="z", sides=6)


def transformer(acc, M):
    steel, dark, hull, por = M["steel"], M["dark"], M["hullDeep"], M["glass"]
    cx, cz = TX, TZ
    for i in range(9):
        for s in (-1, 1):
            acc.cyl(dark, 0.02, 0.028, (cx - 0.9 + i * 0.225, 2.09, cz + s * 0.62), sides=6)
    for i in range(5):
        for s in (-1, 1):
            acc.cyl(dark, 0.02, 0.028, (cx + s * 1.0, 2.09, cz - 0.5 + i * 0.25), sides=6)
    for side in (-1, 1):
        for k in range(5):
            acc.box(hull, (0.04, 1.14, 0.26), (cx - 0.6 + k * 0.3, 1.1, cz + side * 0.8))
        for fx in (-0.4, 0.4):
            with acc.at((cx + fx, 0.7, cz + side * 1.02), 0.0 if side > 0 else math.pi):
                acc.cyl(dark, 0.2, 0.05, (0, 0, 0), axis="z", sides=14)
                for k in range(5):
                    with acc.at((0, 0, 0.03), rot=(0, 0, k * math.tau / 5)):
                        acc.box(steel, (0.18, 0.05, 0.012), (0.11, 0, 0), rot=(0.4, 0, 0))
                acc.cyl(steel, 0.04, 0.05, (0, 0, 0.04), axis="z", sides=8)
    for dx in (0.0, 0.4, 0.75):
        acc.cyl(dark, 0.255, 0.035, (cx + 0.15 + dx * 0.5, 2.45, cz - 0.35), axis="x", sides=10)
    with acc.at((cx + 0.9, 2.45, cz - 0.35), math.pi / 2):
        acc.cyl(dark, 0.105, 0.015, (0, 0, 0.0125), axis="z", sides=12)
        acc.cyl(M["deck"], 0.09, 0.02, (0, 0, 0.03), axis="z", sides=12)
    acc.cyl(por, 0.06, 0.22, (cx - 0.85, 2.2, cz - 0.35), sides=8)
    acc.cyl(dark, 0.07, 0.04, (cx - 0.85, 2.1, cz - 0.35), sides=8)
    for i in range(3):
        x = cx - 0.6 + i * 0.6
        for k in range(6):
            acc.cyl(por, 0.18 - k * 0.016, 0.04, (x, 2.14 + k * 0.1, cz + 0.3), sides=8)
    for sx in (-1, 1):
        for sz in (-1, 1):
            acc.cyl(dark, 0.09, 0.08, (cx + sx * 0.8, 0.28, cz + sz * 0.5), axis="z", sides=10)
    acc.bar(M["hazard"], (cx + 1.02, 0.4, cz + 0.4), (cx + 1.02, 1.5, cz + 0.4), 0.03, 0.012)
    acc.box(M["deck"], (0.4, 0.24, 0.012), (cx - 0.5, 1.15, cz + 0.66))
    nd.letters(acc, dark, "TR 2", 0.08, pos=(cx - 0.5, 1.15, cz + 0.667), depth=0.006)


def hut(acc, obj, M):
    hull, dark, steel = M["hull"], M["dark"], M["steel"]
    nkit.ribs(acc, obj, M["hullDeep"], ("hull",), pitch=0.1, width=0.04, lift=0.008, sample=0.2, min_area=0.5, y_min=0.25,
              keep=lambda p, n: p.x > 0.7)
    for face in nkit.slopes(obj, ("dark",), min_area=0.5, lo=0.15, hi=0.95):
        nd.seams(acc, face, dark, pitch=0.2, w=0.035, h=0.03)
    sash = {"frame": hull, "trim": hull}
    for o in nkit.openings(obj):
        cx, cy, cz = o["centre"]
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="plain", bars=(2, 2), sill=True, lintel=True)
    with acc.at((HX - 0.3, 0.9, HZ + 0.9)):
        acc.rect_frame(dark, -0.415, 0.415, -0.78, 0.81, [(0, 0), (0, 0.04), (0.05, 0.04), (0.05, 0)], z=0.02)
        acc.rod(steel, (0.3, -0.2, 0.06), (0.3, 0.2, 0.06), 0.018, sides=6)
    # Gutters on the eaves, round downpipe at the back corner.
    for s in (-1, 1):
        nd.gutter(acc, steel, (HX + s * 1.32, HZ - 1.3), (HX + s * 1.32, HZ + 1.3), 2.15)
    nd.downpipe(acc, steel, HX + 1.32, HZ - 0.8, 0.0, 2.1, yaw=math.pi / 2)


def poles(acc, M):
    steel, wood, dark = M["steel"], M["wood"], M["dark"]
    for x, z in lean.POLES:
        for k in range(8):
            a = k * 0.9
            acc.rod(steel, (x + math.cos(a) * 0.14, 1.2 + k * 0.32, z + math.sin(a) * 0.14), (x + math.cos(a) * 0.27, 1.2 + k * 0.32 - 0.05, z + math.sin(a) * 0.27), 0.012, sides=4)
        for y in (1.0, 2.6, 4.2):
            acc.cyl(M["weathered"], 0.15 - y * 0.008, 0.05, (x, y, z), sides=6)
        for dx in (-0.55, 0.0, 0.55):
            for k in range(4):
                acc.cyl(M["glass"], 0.06 - k * 0.008, 0.035, (x + dx, 5.22 + k * 0.05, z), sides=8)
            acc.rod(steel, (x + dx, 5.16, z), (x + dx, 5.1, z), 0.01, sides=4)
        for bx in (-0.5, 0.5):
            acc.cyl(dark, 0.02, 0.04, (x + bx, 5.1, z + 0.065), axis="z", sides=6)
        acc.cyl(M["weathered"], 0.08, 0.06, (x, 5.44, z), sides=6, r2=0.03)
        acc.rod(dark, (x + 0.12, 0.3, z), (x + 0.12, 4.9, z), 0.01, sides=3)


def build():
    kit.reset()
    M = lean.palette()
    parts = lean.yard(M) + lean.transformer(M) + lean.hut(M) + lean.poles(M)
    parts = nkit.drop(parts, *REPLACED)
    obj = finish(parts, "SubstationLean")
    acc = nkit.Acc()
    yard(acc, obj, M)
    fence(acc, M)
    transformer(acc, M)
    hut(acc, obj, M)
    poles(acc, M)
    near_obj = nkit.rejoin(obj, acc.objects(), "SubstationNear")
    kit.bake_ao([near_obj], distance=0.8, samples=16, floor=0.55)
    return [near_obj]


def preview(_=0):
    return build()
