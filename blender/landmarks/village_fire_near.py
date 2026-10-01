"""
The village fire station's near level: `VFire1` and `VFire2` of
`village_fire.py`, each the lean station drawn over -- brick courses, a slate
on every roof face, window frames and glazing bars, a panelled bay door in
its frame, lettering on the painted band, a bell and its yoke in the turret,
gutters and round downpipes, a hose pole with a waving flag, a bench and a
hydrant -- and, at level 2, an appliance with treaded tyres, wheel nuts, a
grille, lamp bezels, a light bar in cells and a ladder with all its rungs.

  blender -b --python blender/export.py -- blender/landmarks/village_fire_near.py village-fire-near
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

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "village_fire.py"))
W, D, H, X, Z0, FRONT, RISE, RIDGE = lean.W, lean.D, lean.H, lean.X, lean.Z0, lean.FRONT, lean.RISE, lean.RIDGE

REPLACED = ("letters", "gutter", "downpipe", "benchSeat", "benchBack", "benchLeg", "sill", "lintel", "winBar", "flag")


def windows(acc, obj, M):
    sash = {"frame": M["trim"], "trim": M["trim"]}
    for o in nkit.openings(obj):
        cx, cy, cz = o["centre"]
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            if abs(o["w"] - o["h"]) < 0.03 and o["w"] < 0.7:
                # The round window in the gable: a ring, eight spokes and a hood.
                r = o["w"] / 2
                for k in range(16):
                    a0, a1 = math.tau * k / 16, math.tau * (k + 1) / 16
                    acc.bar(M["trim"], (math.cos(a0) * (r + 0.05), math.sin(a0) * (r + 0.05), o["wall"] + 0.03), (math.cos(a1) * (r + 0.05), math.sin(a1) * (r + 0.05), o["wall"] + 0.03), 0.09, 0.07)
                for k in range(8):
                    a = math.tau * k / 8
                    acc.bar(M["trim"], (0, 0, o["thick"] / 2 + 0.01), (math.cos(a) * r, math.sin(a) * r, o["thick"] / 2 + 0.01), 0.025, 0.03)
                acc.cyl(M["trim"], 0.05, 0.04, (0, 0, o["thick"] / 2 + 0.02), axis="z", sides=8)
            elif o["h"] < 0.3:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="steel", bars=(2, 1))
            else:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="plain", bars=(2, 2), sill=True, lintel=True)


def hall(acc, obj, M):
    S = lean.S
    nkit.courses(acc, obj, S("wall", 0.92), ("wall",), pitch=0.0625, thick=0.048, lift=0.0025, sample=0.18, min_area=0.5, y_min=0.3)
    # Slates on both roof faces, clay tiles on the turret, a ridge roll and finial ends.
    for face in nkit.slopes(obj, ("roof",), min_area=0.5, lo=0.15, hi=0.95):
        nd.slates(acc, face, M["ridge"], width=0.28, exposure=0.18, thick=0.013, gap=0.006)
    for face in nkit.slopes(obj, ("red",), min_area=0.15, lo=0.15, hi=0.95):
        nd.slates(acc, face, M["red"], width=0.16, exposure=0.1, thick=0.01, gap=0.004)
    acc.rod(M["ridge"], (X, RIDGE + 0.2, Z0 - D / 2 - 0.1), (X, RIDGE + 0.2, Z0 + D / 2 + 0.1), 0.09, sides=8)
    for gz in (Z0 - D / 2 - 0.12, Z0 + D / 2 + 0.12):
        acc.sphere(M["trim"], 0.1, (X, RIDGE + 0.22, gz), sides=8, rings=5)
    # Gutters and round downpipes.
    for s in (-1, 1):
        nd.gutter(acc, M["steel"], (X + s * (W / 2 + 0.3), Z0 - D / 2 - 0.2), (X + s * (W / 2 + 0.3), Z0 + D / 2 + 0.2), H - 0.15)
        nd.downpipe(acc, M["steel"], X + s * (W / 2 + 0.3), Z0 - D / 2 + 0.15, 0.12, H - 0.2, yaw=s * math.pi / 2)
    # The band's lettering, the bay door's frame details and panels, the hood on the side door.
    nd.letters(acc, M["trim"], "FIRE STATION", 0.18, pos=(X, H - 0.45, FRONT + 0.05), depth=0.02)
    door_z = FRONT - 0.1
    ph = 2.45 / 4
    for i in range(4):
        y = 0.12 + ph * (i + 0.5)
        for k in range(3):
            nd.frustum(acc, M["redDeep"], 0.72, ph - 0.14, 0.02, 0.03, pos=(X - 0.82 + k * 0.82, y, door_z + 0.035))
        acc.box(M["steel"], (2.48, 0.02, 0.02), (X, y - ph / 2, door_z + 0.04))
    for s in (-1, 1):
        acc.box(M["steel"], (0.06, 2.45, 0.08), (X + s * 1.27, 0.12 + 1.225, FRONT - 0.2))
    with acc.at((X, 0.12 + 1.375, FRONT + 0.09)):
        acc.rect_frame(M["trim"], -1.45, 1.45, -1.345, 1.375, [(0, 0), (0, 0.04), (0.03, 0.04), (0.03, 0.06), (0.09, 0.06), (0.09, 0.03), (0.11, 0.03), (0.11, 0)])
        nd.frustum(acc, M["stone"], 0.24, 0.3, 0.05, 0.03, pos=(0, 1.375 + 0.1, 0.02))
    # The blue lamp gets a cage.
    for sx in (-1, 1):
        for sz in (-1, 1):
            acc.box(M["steel"], (0.02, 0.22, 0.02), (lean.DOOR_LAMP[0] + sx * 0.11, lean.DOOR_LAMP[1], lean.DOOR_LAMP[2] + sz * 0.11))
    acc.cyl(M["steel"], 0.13, 0.05, (lean.DOOR_LAMP[0], lean.DOOR_LAMP[1] + 0.14, lean.DOOR_LAMP[2]), sides=8, r2=0.08)


def turret_and_pole(acc, M):
    tz = Z0 - 1.2
    base = RIDGE - 0.3
    # The bell hangs in a yoke, with its clapper and rope; louvre slats between the posts.
    acc.bar(M["steel"], (X - 0.3, base + 1.28, tz), (X + 0.3, base + 1.28, tz), 0.05, 0.05)
    acc.cyl(M["steel"], 0.05, 0.05, (X, base + 1.18, tz), sides=6)
    acc.sphere(M["steel"], 0.05, (X, base + 0.83, tz), sides=6, rings=4)
    acc.rod(M["steel"], (X, base + 0.86, tz), (X, base + 0.5, tz), 0.008, sides=4)
    acc.rod(M["red"], (X + 0.22, base + 1.25, tz), (X + 0.22, base + 0.6, tz + 0.12), 0.012, sides=5)
    for sx in (-1, 1):
        for sz in (-1, 1):
            acc.box(M["trim"], (0.14, 0.06, 0.14), (X + sx * 0.33, base + 0.72, tz + sz * 0.33))
            acc.box(M["trim"], (0.14, 0.06, 0.14), (X + sx * 0.33, base + 1.32, tz + sz * 0.33))
    acc.rect_run(M["trim"], X - 0.45, X + 0.45, tz - 0.45, tz + 0.45, [(0, 0), (0.1, 0), (0.1, 0.04), (0, 0.04)], y=base + 0.7)
    # The hose pole: rings, a halyard and the waving cloth.
    px, pz = 2.8, -2.6
    for y in (1.2, 2.8, 4.4):
        acc.cyl(M["steel"], 0.1, 0.05, (px, y, pz), sides=8)
    acc.rod(M["steel"], (px + 0.06, 5.8, pz + 0.05), (px + 0.06, 1.5, pz + 0.05), 0.006, sides=3)
    for hx in (-0.25, 0.25):
        acc.cyl(M["redDeep"], 0.05, 0.1, (px + hx, 4.2, pz), sides=8)
    # The hydrant: bolts round the cap, a nozzle either side.
    for a in range(6):
        t = a * math.tau / 6
        acc.cyl(M["steel"], 0.012, 0.03, (2.5 + math.cos(t) * 0.1, 0.72, 1.2 + math.sin(t) * 0.1), sides=6)
    for s in (-1, 1):
        acc.cyl(M["steel"], 0.045, 0.06, (2.5 + s * 0.16, 0.5, 1.2), axis="x", sides=8)
    nd.bench(acc, {"wood": M["roof"], "iron": M["steel"]}, (3.3, 0.17, -0.6), -math.pi / 2, length=1.2)


def ground(acc, obj, M):
    free = nkit.ground_free(obj, 0.18, 0.4)
    nd.paving(acc, M["apron"], X - 1.75, X + 1.75, 1.25, 2.9, 0.18, size=0.45, thick=0.02, keep=free)
    free2 = nkit.ground_free(obj, 0.17, 0.4)
    nd.pebbles(acc, M["apron"], 2.45, 3.75, -3.8, 1.4, 0.17, 550, size=0.035, seed=4, keep=free2)
    for k in range(5):
        acc.box(M["stone"], (0.4, 0.05, 0.16), (X - 1.0 + k * 0.5, 0.2, 3.98), skip=("ny",))
    # A white picket fence down the west side and across the back, with its posts and rails.
    for (ax, az), (bx, bz) in (((-3.75, -3.9), (-3.75, 3.6)),):
        length = math.hypot(bx - ax, bz - az)
        n = int(length / 0.13)
        for i in range(n + 1):
            t = i / n
            with acc.at((ax + (bx - ax) * t, 0.12, az + (bz - az) * t), math.atan2(bz - az, bx - ax)):
                acc.box(M["trim"], (0.07, 0.75, 0.025), (0, 0.375, 0), skip=("ny",))
                acc.prism(M["trim"], [(-0.035, 0.75), (0.035, 0.75), (0, 0.82)], 0.025, skip_back=False)
        for y in (0.22, 0.55):
            acc.bar(M["trim"], (ax, 0.12 + y, az), (bx, 0.12 + y, bz), 0.05, 0.03)
        m = max(1, int(length / 1.5))
        for i in range(m + 1):
            t = i / m
            acc.box(M["trim"], (0.09, 0.9, 0.09), (ax + (bx - ax) * t, 0.12 + 0.45, az + (bz - az) * t))


def appliance(acc, M):
    cx, cz = lean.ENGINE
    steel, trim, red, glass = M["steel"], M["trim"], M["red"], M["glass"]
    for s in (-1, 1):
        for wz in (0.8, -0.8):
            x = cx + s * 0.58
            for i in range(18):
                a = math.tau * (i + 0.5) / 18
                with acc.at((x, 0.28, cz + wz), rot=(a, 0, 0)):
                    acc.box(M["tyre"], (0.2, 0.02, 0.05), (0, 0.276, 0), skip=("ny",))
            with acc.at((x + s * 0.11, 0.28, cz + wz), s * math.pi / 2):
                for i in range(6):
                    a = math.tau * i / 6
                    acc.cyl(trim, 0.014, 0.02, (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.0), axis="z", sides=6)
                acc.cyl(steel, 0.05, 0.03, (0, 0, 0.01), axis="z", sides=8)
        # Lockers: frames and handles, and a running board.
        for lz, lw in ((-0.9, 0.45), (-0.4, 0.45), (0.1, 0.45)):
            with acc.at((cx + s * 0.672, 0.95, cz + lz), s * math.pi / 2):
                acc.rect_frame(steel, -lw / 2, lw / 2, -0.28, 0.28, [(0, 0), (0, 0.015), (0.02, 0.015), (0.02, 0)])
                acc.box(steel, (0.14, 0.03, 0.03), (0, -0.2, 0.02))
                for k in range(1, 4):
                    acc.box(steel, (lw - 0.02, 0.008, 0.006), (0, -0.28 + 0.56 * k / 4, 0.004))
        acc.box(steel, (0.14, 0.03, 1.4), (cx + s * 0.68, 0.5, cz - 0.4))
    front = cz + 1.3
    for k in range(-3, 4):
        acc.box(trim, (0.01, 0.16, 0.02), (cx + k * 0.06, 0.66, front + 0.01))
    for s in (-1, 1):
        acc.rect_frame(steel, cx + s * 0.44 - 0.11, cx + s * 0.44 + 0.11, 0.65, 0.75, [(0, 0), (0, 0.02), (0.015, 0.02), (0.015, 0)], z=front - 0.03)
        acc.rod(steel, (cx + s * 0.64, 1.28, cz + 1.0), (cx + s * 0.78, 1.32, cz + 1.12), 0.012, sides=4)
        acc.box(steel, (0.04, 0.16, 0.1), (cx + s * 0.8, 1.3, cz + 1.12))
    for k in range(5):
        acc.box(red, (0.11, 0.08, 0.15), (ENGINE_LAMP_X - 0.25 + k * 0.125, 1.63, lean.ENGINE_LAMP[2]), skip=("ny",))
    for k in range(4):
        acc.box(trim, (0.5, 0.03, 0.04), (cx, 1.46, cz - 0.7 + k * 0.3))
    acc.rod(trim, (cx - 0.25, 1.5, cz - 1.2), (cx - 0.25, 1.5, cz + 0.1), 0.014, sides=5)
    acc.rod(trim, (cx + 0.25, 1.5, cz - 1.2), (cx + 0.25, 1.5, cz + 0.1), 0.014, sides=5)
    acc.box(M["tyre"], (1.1, 0.03, 0.16), (cx, 0.36, cz - 1.32))


ENGINE_LAMP_X = lean.ENGINE_LAMP[0]


def near(M, level):
    parts = nkit.drop(lean.station(M, level), *REPLACED)
    obj = finish(parts, f"VFire{level}Lean")
    acc = nkit.Acc()
    windows(acc, obj, M)
    hall(acc, obj, M)
    turret_and_pole(acc, M)
    ground(acc, obj, M)
    if level >= 2:
        appliance(acc, M)
    return nkit.rejoin(obj, acc.objects(), f"VFire{level}Near")


def build(levels=(1, 2)):
    kit.reset()
    M = lean.palette()
    made = []
    for level in levels:
        made.append(near(M, level))
        lean.lkit.bake(made[-1], [], made, distance=0.8)
    for level in levels:
        made += lean.flag_cloth(M, level, scope=f"VFire{level}Near", segs=(12, 4), thick=0.015, ripple=0.045)
    return made


def preview(level):
    return build((level,))
