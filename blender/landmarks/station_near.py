"""
The transit station's near level: `Station1..3` of `station.py`, each the lean
station drawn over -- brick courses, framed and barred glazing, a clock with
numerals, name board lettering, a canopy with standing seams, gutters and
downpipes on its columns, platform slabs and tactile studs, cast lamps and a
proper bench, ballast stone between the sleepers, rail chairs and clips,
insulator strings on the catenary, a voussoir arch over the tunnel mouth.

  blender -b --python blender/export.py -- blender/landmarks/station_near.py transit-station-near
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

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "station.py"))
DECK, PLATFORM_Y, TRACK_A, TRACK_B, TRACK_X, TRACK_HALF, PORTAL_X = (
    lean.DECK, lean.PLATFORM_Y, lean.TRACK_A, lean.TRACK_B, lean.TRACK_X, lean.TRACK_HALF, lean.PORTAL_X,
)

REPLACED = ("backSill", "clockRim", "clockFace", "hand", "letters", "seat", "seatBack", "seatLeg", "lampPost", "lampGlass", "lampHat", "insulator", "bin", "voussoir")


def windows(acc, obj, M):
    sash = {"frame": M["steel"], "trim": M["wall"]}
    for o in nkit.openings(obj):
        cx, cy, cz = o["centre"]
        wide = o["w"] > 2.4
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="steel", bars=(1, 3) if wide else (2, 3))


def concourse(acc, obj, M):
    x = -9.4
    base = DECK + 0.15
    S = lean.S
    nd.clock(acc, 0.53, {"rim": M["steel"], "dial": M["wall"], "ink": M["dark"]}, pos=(x, base + 3.72, 2.6), hands=False)
    nd.letters(acc, M["wall"], "STATION", 0.34, pos=(x, base + 4.75, 2.57), depth=0.03)
    for sx in (-1, 1):
        acc.cyl(M["dark"], 0.03, 0.05, (x + sx * 1.62, base + 4.75, 2.6), axis="z", sides=6)
    # Sliding doors: two leaves, a track, push bars and a hazard strip.
    with acc.at((x, base + 1.1, 2.45)):
        for s in (-1, 1):
            acc.rect_frame(M["steel"], s * 0.6 - 0.5, s * 0.6 + 0.5, -1.07, 1.1, [(0, 0), (0, 0.045), (0.05, 0.045), (0.05, 0)], z=0.0)
            acc.box(M["steel"], (0.04, 0.6, 0.03), (s * 0.15, 0.0, 0.05))
        acc.box(M["accent"], (2.2, 0.06, 0.02), (0, -0.7, 0.03))
        acc.box(M["dark"], (2.3, 0.1, 0.09), (0, 1.16, 0.03))
    # The entrance canopy: rafters, an edge trim, downlights, a hanging sign and its posts' feet.
    for k in range(9):
        acc.box(M["steel"], (0.06, 0.12, 1.06), (x - 2.2 + k * 0.55, base + 3.02, 3.1))
    for k in range(5):
        acc.cyl(M["glass"], 0.06, 0.02, (x - 2.0 + k * 1.0, base + 3.04, 3.3), sides=8)
    for sx in (-1, 1):
        acc.cyl(M["dark"], 0.16, 0.05, (x + sx * 2.42, base + 0.03, 2.66), sides=8)
        acc.cyl(M["steel"], 0.16, 0.05, (x + sx * 2.42, base + 3.0, 2.66), sides=8)
    # Roof: parapet coping, gravel, a glazed lantern's bars and gutters.
    acc.rect_run(M["roof"], x - 3.4, x + 3.4, -3.0, 3.0, [(0, 0), (0.1, 0), (0.1, 0.05), (0.04, 0.09), (0, 0.09)], y=base + 4.68)
    free = nkit.ground_free(obj, base + 4.75)
    nd.pebbles(acc, M["coping"], x - 3.0, x + 3.0, -2.7, 2.7, base + 4.75, 900, size=0.045, seed=2, keep=free)
    for k in range(11):
        acc.box(M["roof"], (0.05, 0.05, 2.1), (x - 1.5 + k * 0.3, base + 5.16, -0.6))
    nd.gutter(acc, M["steel"], (x - 3.5, 3.05), (x + 3.5, 3.05), base + 4.3)
    nd.gutter(acc, M["steel"], (x - 3.5, -3.05), (x + 3.5, -3.05), base + 4.3)
    for sx in (-1, 1):
        nd.downpipe(acc, M["steel"], x + sx * 3.06, -2.85, DECK, base + 4.25, yaw=sx * math.pi / 2)


def platform(acc, obj, M, level):
    columns = 5 if level >= 2 else 3
    length = 16.8 if level >= 2 else 10.4
    cx0 = TRACK_X if level >= 2 else TRACK_X - 3.2
    top = PLATFORM_Y + 3.3
    free = nkit.ground_free(obj, PLATFORM_Y + 0.02, 0.4)
    nd.paving(acc, M["deck"], TRACK_X - 9.4, TRACK_X + 9.4, -1.32, 1.32, PLATFORM_Y, size=0.6, thick=0.02, keep=free)
    # Tactile studs along both edges.
    for s in (-1, 1):
        for row in range(2):
            zz = s * (0.92 + row * 0.08)
            x = TRACK_X - 9.2
            while x < TRACK_X + 9.2:
                with acc.at((x, PLATFORM_Y + 0.006, zz), 0.0, rot=(-math.pi / 2, 0, 0)):
                    nd.frustum(acc, M["accent"], 0.05, 0.05, 0.016, 0.014)
                x += 0.09
    # Canopy: standing seams, purlins, gutters and downpipes down the columns.
    cx_list = [cx0 - length / 2 + 1.2 + i * ((length - 2.4) / (columns - 1)) for i in range(columns)]
    n = int(length / 0.45)
    for k in range(n):
        acc.box(M["roof"], (0.035, 0.05, 3.5), (cx0 - length / 2 + 0.22 + k * length / n, top + 0.15, 0))
    for k in range(int(length / 0.7)):
        acc.box(M["steel"], (0.06, 0.1, 3.5), (cx0 - length / 2 + 0.3 + k * 0.7, top - 0.16, 0))
    for s in (-1, 1):
        nd.gutter(acc, M["steel"], (cx0 - length / 2, s * 1.85), (cx0 + length / 2, s * 1.85), top - 0.02, half=0.08)
    for cx in cx_list:
        acc.cyl(M["dark"], 0.19, 0.04, (cx, PLATFORM_Y + 0.02, 0), sides=8)
        for a in range(4):
            t = a * math.pi / 2 + math.pi / 4
            acc.cyl(M["steel"], 0.018, 0.05, (cx + math.cos(t) * 0.15, PLATFORM_Y + 0.06, math.sin(t) * 0.15), sides=6)
        acc.cyl(M["steel"], 0.17, 0.1, (cx, top - 0.3, 0), sides=8, r2=0.12)
        nd.downpipe(acc, M["dark"], cx + 0.17, 0.0, PLATFORM_Y, top - 0.05, yaw=math.pi / 2, r=0.03, hopper=False)
        # A strip light under the canopy at every column.
        acc.box(M["glass"], (0.9, 0.05, 0.1), (cx, top - 0.16, 0.8))
        acc.box(M["steel"], (1.0, 0.03, 0.14), (cx, top - 0.14, 0.8))
        # A hanging platform sign with its lettering both sides.
        for face in (1, -1):
            with acc.at((cx + 0.9, top - 0.62, 0.0), math.pi / 2 if face > 0 else -math.pi / 2):
                acc.box(M["accent"], (1.0, 0.36, 0.05), (0, 0, 0.0))
                nd.letters(acc, M["wall"], "PLATFORM 1", 0.11, pos=(0, 0.0, 0.026), depth=0.008)
        acc.rod(M["steel"], (cx + 0.6, top - 0.1, 0), (cx + 0.6, top - 0.44, 0), 0.012, sides=4)
        acc.rod(M["steel"], (cx + 1.2, top - 0.1, 0), (cx + 1.2, top - 0.44, 0), 0.012, sides=4)
    # The clerestory's glazing bars.
    span = length - 1.6
    for s in (-1, 1):
        for k in range(int(span / 0.35) + 1):
            acc.box(M["steel"], (0.03, 0.44, 0.03), (cx0 - span / 2 + k * span / int(span / 0.35), top + 0.34, s * 0.615))
    # A bench, lamps and a bin, in place of the lean plain ones.
    nd.bench(acc, {"wood": M["roof"], "iron": M["steel"]}, (TRACK_X + 4.4, PLATFORM_Y, -0.4), 0.0, length=2.0)
    for lx in lean.LAMPS:
        nd.lamp_standard(acc, {"iron": M["steel"], "glass": M["glass"]}, (lx, PLATFORM_Y, 0.0), height=2.58)
    bx, bz = TRACK_X + 2.4, -0.9
    acc.cyl(M["roofDark"], 0.205, 0.66, (bx, PLATFORM_Y + 0.37, bz), sides=12)
    acc.cyl(M["steel"], 0.22, 0.05, (bx, PLATFORM_Y + 0.72, bz), sides=12)
    acc.cyl(M["dark"], 0.1, 0.03, (bx, PLATFORM_Y + 0.76, bz), sides=8)
    for y in (0.15, 0.55):
        acc.cyl(M["steel"], 0.222, 0.03, (bx, PLATFORM_Y + y, bz), sides=12)


def tracks(acc, obj, M, level):
    for cz in ([TRACK_A, TRACK_B] if level >= 3 else [TRACK_A]):
        free = nkit.ground_free(obj, 0.3)
        nd.pebbles(acc, M["ballast"], TRACK_X - 9.3, TRACK_X + 9.3, cz - 1.42, cz + 1.42, 0.3, 3000, size=0.055, seed=int(cz) + 20, keep=free)
        n = 24
        for i in range(n):
            x = TRACK_X - TRACK_HALF + 0.4 + i * ((TRACK_HALF * 2 - 0.8) / (n - 1))
            for s in (-1, 1):
                acc.box(M["deck"], (0.2, 0.03, 0.24), (x, 0.395, cz + s * 0.72), skip=("ny",))
                for c in (-1, 1):
                    acc.box(M["steel"], (0.03, 0.03, 0.05), (x + c * 0.07, 0.41, cz + s * 0.72 + c * 0.0 + s * 0.09))
        for s in (-1, 1):
            for k in range(4):
                acc.box(M["steel"], (0.5, 0.06, 0.02), (TRACK_X - 6.5 + k * 4.4, 0.44, cz + s * 0.72 - 0.05))
                acc.box(M["steel"], (0.5, 0.06, 0.02), (TRACK_X - 6.5 + k * 4.4, 0.44, cz + s * 0.72 + 0.05))
                for b in range(4):
                    acc.cyl(M["dark"], 0.014, 0.03, (TRACK_X - 6.5 + k * 4.4 - 0.15 + b * 0.1, 0.44, cz + s * 0.72 + 0.06), axis="z", sides=6)


def catenary(acc, M):
    height = 4.3
    for x in [TRACK_X - 7.4, TRACK_X - 2.4, TRACK_X + 2.6, TRACK_X + 7.6]:
        mz = TRACK_A + 1.9
        for k in range(5):
            acc.cyl(M["deck"], 0.09 - k * 0.004, 0.035, (x, PLATFORM_Y + height - 0.55 - k * 0.045, TRACK_A), sides=8)
        acc.box(M["steel"], (0.3, 0.03, 0.3), (x, DECK + 0.32, mz))
        for a in range(4):
            t = a * math.pi / 2 + math.pi / 4
            acc.cyl(M["dark"], 0.016, 0.05, (x + math.cos(t) * 0.14, DECK + 0.35, mz + math.sin(t) * 0.14), sides=6)
        acc.rod(M["steel"], (x, PLATFORM_Y + height - 1.6, mz), (x, PLATFORM_Y + height - 0.42, TRACK_A + 0.95), 0.03, sides=4)


def portal(acc, obj, M):
    # A voussoir ring of nineteen, a keystone and a string course over the mouth.
    with acc.at((PORTAL_X, 2.9, TRACK_A), -math.pi / 2):
        n = 19
        for i in range(n):
            a = math.pi * (i + 0.5) / n
            with acc.at((math.cos(a) * 1.45, math.sin(a) * 1.45, 0.06), rot=(0, 0, a - math.pi / 2)):
                acc.box(M["roof"], (0.27 if i != n // 2 else 0.32, 0.34 if i != n // 2 else 0.44, 0.13), (0, 0, 0))
        for i in range(9):
            a = math.pi * (i + 0.5) / 9
            with acc.at((math.cos(a) * 1.16, math.sin(a) * 1.16, 0.0), rot=(0, 0, a - math.pi / 2)):
                acc.box(M["dark"], (0.25, 0.05, 0.1), (0, 0, 0.0))
        for s in (-1, 1):
            for j in range(4):
                acc.box(M["roof"], (0.3, 0.3, 0.13), (s * 1.44, -1.5 + j * 0.36, 0.06))


    # The back of the headwall: the service door's architrave, panels and handle, the sign's lettering.
    # (all inside the plot, in the recess the lean model cuts)
    with acc.at((13.0, 1.1, TRACK_A), math.pi / 2):
        for py in (0.55, -0.55):
            acc.box(M["dark"], (0.66, 0.85, 0.03), (0, py, -0.16))
        acc.box(M["steel"], (0.05, 0.2, 0.06), (0.36, -0.05, -0.15))
    with acc.at((13.0, 3.62, TRACK_A), math.pi / 2):
        nd.letters(acc, M["wall"], "LINE 1", 0.16, pos=(0, 0, -0.05), depth=0.015)


    # The concourse's rear door.
    with acc.at((-9.4, DECK + 0.15 + 1.35, -2.6), math.pi):
        acc.rect_frame(M["wall"], -0.55, 0.55, -0.9, 0.9, [(0, 0), (0, 0.04), (0.03, 0.04), (0.03, 0.07), (0.08, 0.07), (0.08, 0.02), (0.1, 0.02), (0.1, 0)], z=0.0)
        for py in (0.55, -0.55):
            acc.box(M["dark"], (0.72, 0.7, 0.03), (0, py * 0.8, -0.075))
        acc.box(M["steel"], (0.05, 0.2, 0.06), (0.4, -0.05, -0.05))


def signals(acc, M):
    for s in (-1, 1):
        sx = TRACK_X + s * 8.5
        sz = TRACK_A + s * 1.8
        for k in range(3):
            acc.box(M["dark"], (0.36, 0.04, 0.13), (sx, 2.82 - k * 0.23, sz + s * 0.19))
        acc.rod(M["steel"], (sx + 0.1, 0.4, sz), (sx + 0.1, 2.3, sz), 0.012, sides=4)
        for i in range(8):
            acc.box(M["steel"], (0.1, 0.02, 0.02), (sx + 0.05, 0.6 + i * 0.25, sz + 0.08))


def far_side(acc, obj, M, level):
    if level >= 3:
        free = nkit.ground_free(obj, PLATFORM_Y + 0.02, 0.4)
        nd.paving(acc, M["deck"], TRACK_X - 9.4, TRACK_X + 9.4, -5.85, -4.5, PLATFORM_Y, size=0.6, thick=0.02, keep=free)
        for i in range(2):
            sx = TRACK_X - 4.4 + i * 8.8
            for k in range(8):
                acc.box(M["roof"], (0.04, 0.05, 1.5), (sx - 1.5 + k * 0.43, PLATFORM_Y + 2.4, -5.1))
            nd.letters(acc, M["wall"], "PLATFORM 2", 0.12, pos=(sx, PLATFORM_Y + 1.95, -5.66), depth=0.01)
            nd.bench(acc, {"wood": M["roof"], "iron": M["steel"]}, (sx, PLATFORM_Y, -5.45), math.pi, length=2.4)
    else:
        # The goods dock: planks on the crates, a barrow, and ribs on the shed.
        for bx, bz, h in ((1.2, -3.2, 0.9), (2.6, -4.0, 0.7), (5.4, -3.4, 1.1), (6.3, -4.2, 0.6)):
            for k in range(4):
                acc.box(M["roofDark"], (1.06, 0.02, 0.02), (bx, 0.7 + 0.1 + k * (h - 0.2) / 3, bz + 0.52))
                acc.box(M["roofDark"], (0.02, 0.02, 1.06), (bx + 0.52, 0.7 + 0.1 + k * (h - 0.2) / 3, bz))
            for c in (-1, 1):
                acc.box(M["roofDark"], (0.08, h, 0.08), (bx + c * 0.5, 0.7 + h / 2, bz + 0.5))
        sx = TRACK_X + 6.4
        for k in range(14):
            acc.box(M["roofDark"], (0.04, 1.7, 0.02), (sx - 0.95 + k * 0.146, 1.6, -3.0 + 0.01))


def near(M, level):
    parts = nkit.drop(lean.station(M, level), *REPLACED)
    obj = finish(parts, f"Station{level}Lean")
    acc = nkit.Acc()
    windows(acc, obj, M)
    # Brick courses over the concourse, the tunnel headwall and the dock shed.
    nkit.courses(acc, obj, lean.S("wall", 0.93), ("wall",), pitch=0.08, thick=0.062, lift=0.0025, sample=0.2, min_area=1.5, y_min=DECK + 0.3)
    concourse(acc, obj, M)
    platform(acc, obj, M, level)
    tracks(acc, obj, M, level)
    catenary(acc, M)
    portal(acc, obj, M)
    signals(acc, M)
    far_side(acc, obj, M, level)
    return nkit.rejoin(obj, acc.objects(), f"Station{level}Near")


def animated(M, scope="StationNear"):
    """The concourse clock's hands and second hand, one set for every level."""
    return animkit.clock_hands(f"{scope}.Clock.0", M["dark"], (-9.4, DECK + 0.15 + 3.72, 2.6), 0.53, z=0.145, depth=0.014, lift=0.022, second=True)


def build(levels=(1, 2, 3)):
    kit.reset()
    M = lean.palette()
    made = []
    for level in levels:
        made.append(near(M, level))
        lean.lkit.bake(made[-1], [], made, distance=1.0)
    return made + animated(M)


def preview(level):
    return build((level,))
