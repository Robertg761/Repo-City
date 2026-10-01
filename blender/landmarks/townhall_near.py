"""
The town hall's near level: the lean hall (`townhall.py`) with its stonework
drawn in. Same frame, footprint, dome and lantern marker, drawn over with
window surrounds and glazing bars, a rusticated base, a dentilled cornice,
fluted columns, a turned balustrade, a clock with numerals and hands, a
seamed dome, flags that wave and a fountain with its jets.

  blender -b --python blender/export.py -- blender/landmarks/townhall_near.py town-hall-near
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

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "townhall.py"))

PODIUM_TOP, BLOCK_H, CORNICE_Y = lean.PODIUM_TOP, lean.BLOCK_H, lean.CORNICE_Y
DRUM_Y, DOME_Y, LANTERN = lean.DRUM_Y, lean.DOME_Y, lean.LANTERN
HALF = 3.6

# What the near level draws itself, in place of the lean part of that name.
REPLACED = ("surround", "sill", "hood", "mullion", "transom", "baseCourse", "band", "hand", "clockRim", "clockFace", "flag",
            "lampPost", "lampHead", "lampHat", "doorSurround")


def lean_parts(M):
    return lean.plaza(M) + lean.block(M) + lean.colonnade(M) + lean.cornice(M) + lean.dome(M) + lean.forecourt(M)


def windows(acc, hall, M):
    mats = {"frame": M["metal"], "trim": M["wall"]}
    for o in nkit.openings(hall):
        x, y, z = o["centre"]
        if o["h"] > 2.4:
            style = "steel"  # the door's glass
        elif o["face"] == "+z" and abs(x) > 1.5:
            continue  # behind the colonnade
        else:
            style = "civic"
        with acc.at((x, y, z), nkit.facing(o["face"])):
            nd.window(acc, o["w"], o["h"], o["wall"] + 0.0, mats, glass_front=o["thick"] / 2 + 0.005, style=style,
                      bars=(2, 4) if style == "civic" else (3, 5), sill=style == "civic", lintel=style == "civic")


def rustication(acc, M):
    """The hall's ground floor as dressed stone courses with chamfered joints."""
    stone = M["wall"]
    course, blocks = 0.35, 0.9
    for face, yaw in (("+z", 0.0), ("-z", math.pi), ("+x", math.pi / 2), ("-x", -math.pi / 2)):
        for row in range(4):
            y = PODIUM_TOP + course * (row + 0.5)
            n = 8
            for i in range(n + 1):
                w = blocks
                x = -HALF + (i + 0.5) * blocks - (blocks * 0.5 if row % 2 else 0.0)
                if x - w / 2 < -HALF:
                    w = x + w / 2 + HALF
                    x = -HALF + w / 2
                if x + w / 2 > HALF:
                    w = HALF - (x - w / 2)
                    x = HALF - w / 2
                if w < 0.15:
                    continue
                if face == "+z" and abs(x) < 1.05 + w / 2 and row < 4 and abs(x) - w / 2 < 0.95:
                    continue  # the doorway
                with acc.at((0, 0, 0), yaw):
                    nd.frustum(acc, stone, w - 0.03, course - 0.03, 0.06, 0.03, pos=(x, y, HALF - 0.005))


def plinth_and_cornice(acc, M):
    stone = M["stone"]
    # A moulded plinth cap on the rusticated storey, and a string above it.
    acc.rect_run(stone, -HALF, HALF, -HALF, HALF, [(0, 0), (0.12, 0), (0.12, 0.05), (0.09, 0.08), (0.03, 0.09), (0, 0.09)], y=PODIUM_TOP + 1.4)
    # Under the cornice: a cove and a dentil band on the three sides the portico leaves clear.
    acc.rect_run(stone, -HALF, HALF, -HALF, HALF, [(0, 0), (0.3, 0.02), (0.3, 0.06), (0.16, 0.06), (0.16, 0.24), (0, 0.24)], y=CORNICE_Y - 0.28)
    for yaw, run in ((math.pi, (-HALF, HALF)), (math.pi / 2, (-HALF, HALF)), (-math.pi / 2, (-HALF, HALF))):
        with acc.at((0, CORNICE_Y - 0.1, 0), yaw):
            x = run[0] + 0.15
            while x < run[1] - 0.1:
                acc.box(stone, (0.1, 0.11, 0.1), (x, 0, HALF + 0.16 + 0.05), skip=("nz",))
                x += 0.2
    # A drip and a fillet either side of the cornice slab.
    acc.rect_run(stone, -4.2, 4.2, -4.2, 4.2, [(0, 0), (0.04, 0), (0.04, 0.03), (0, 0.03)], y=CORNICE_Y + 0.3)


def steps(acc, M):
    for w, d, y in ((10.4, 9.8, 0.6), (9.6, 9.2, 0.9), (8.8, 8.6, 1.2)):
        # A rounded nosing along the front edge of each tread, and the sides.
        acc.rod(M["stone"], (-w / 2, y - 0.03, d / 2 + 0.005), (w / 2, y - 0.03, d / 2 + 0.005), 0.035, sides=8)
        for s in (-1, 1):
            acc.rod(M["stone"], (s * (w / 2 + 0.005), y - 0.03, -d / 2), (s * (w / 2 + 0.005), y - 0.03, d / 2), 0.035, sides=8)
        acc.rod(M["stone"], (-w / 2, y - 0.03, -d / 2 - 0.005), (w / 2, y - 0.03, -d / 2 - 0.005), 0.035, sides=8)
    for s in (-1, 1):
        # Newel pedestals at the head of the flight, each with a ball.
        for z in (4.5,):
            acc.box(M["stone"], (0.42, 0.7, 0.42), (s * 4.7, 1.55, z))
            acc.box(M["stone"], (0.5, 0.08, 0.5), (s * 4.7, 1.94, z))
            acc.sphere(M["stone"], 0.16, (s * 4.7, 2.16, z), sides=10, rings=6)


def columns(acc, M):
    z = 3.85
    for i in range(6):
        x = -3.0 + i * 1.2
        with acc.at((x, 0, z)):
            nd.fluted_column(acc, M["wall"], 0.3, 0.25, PODIUM_TOP + 0.35, PODIUM_TOP + 4.0, ribs=16)
            acc.lathe(M["stone"], [(0.32, PODIUM_TOP + 0.3), (0.34, PODIUM_TOP + 0.3), (0.34, PODIUM_TOP + 0.36), (0.3, PODIUM_TOP + 0.4), (0.3, PODIUM_TOP + 0.3)], sides=12, pos=(0, 0, 0))
            acc.lathe(M["stone"], [(0.25, PODIUM_TOP + 3.98), (0.28, PODIUM_TOP + 3.98), (0.28, PODIUM_TOP + 4.04), (0.25, PODIUM_TOP + 4.04)], sides=12)
    # Rosettes in the frieze's metopes, guttae under each triglyph.
    for i in range(12):
        x = -3.7 + 0.31 + i * 0.62
        acc.cyl(M["stone"], 0.09, 0.03, (x, CORNICE_Y - 0.01, z + 0.45), axis="z", sides=10)
    for i in range(13):
        x = -3.7 + i * 0.62
        for k in (-1, 0, 1):
            acc.cyl(M["stone"], 0.022, 0.04, (x + k * 0.07, CORNICE_Y - 0.19, z + 0.43), axis="y", sides=6)
    acc.box(M["stone"], (8.1, 0.05, 1.0), (0, CORNICE_Y - 0.5, z), skip=("py",))


def pediment(acc, M):
    stone = M["stone"]
    base = CORNICE_Y + 0.55
    rake = math.atan2(1.35, 3.3)
    length = math.hypot(3.3, 1.35)
    # Modillions under the raking cornices, and a dentil row along the base.
    for s in (-1, 1):
        n = 14
        for k in range(n):
            t = (k + 0.5) / n
            x = s * (3.3 * (1 - t))
            y = base + 1.35 * t
            with acc.at((x, y - 0.14, 4.62), rot=(0, 0, -s * rake)):
                acc.box(stone, (0.1, 0.09, 0.28), (0, 0, 0), skip=())
    for k in range(-16, 17):
        acc.box(stone, (0.1, 0.09, 0.1), (k * 0.2, CORNICE_Y + 0.28, 4.67), skip=("nz",))
    # Acroteria: a plinth and an urn at the apex and at each foot.
    for x, y in ((0, base + 1.42), (-3.55, base + 0.05), (3.55, base + 0.05)):
        acc.box(stone, (0.34, 0.16, 0.34), (x, y + 0.08, 4.0))
        acc.lathe(stone, [(0, y + 0.16), (0.12, y + 0.16), (0.14, y + 0.24), (0.09, y + 0.3), (0.16, y + 0.42), (0.19, y + 0.5), (0.1, y + 0.56), (0, y + 0.56)], sides=10, pos=(x, 0, 4.0), closed=False)
    # The laurel round the clock.
    cy = base + 0.52
    for i in range(28):
        a = math.tau * i / 28
        with acc.at((math.sin(a) * 0.7, cy + math.cos(a) * 0.7, 4.66), rot=(0, 0, -a)):
            acc.box(M["accent"], (0.11, 0.07, 0.03), (0, 0, 0), rot=(0, 0, 0.5))
    nd.clock(acc, 0.5, {"rim": M["metal"], "dial": M["wall"], "ink": M["dark"]}, pos=(0, cy, 4.62), hands=False)


def balustrades(acc, M):
    y0 = CORNICE_Y + 0.56
    for face in (-1, 1):
        # Along x on the back, and along z on both sides, between the dies.
        for k in range(6):
            a = -3.3 + k * 1.1 + 0.12
            b = a + 1.1 - 0.24
            for axis in ("x", "z"):
                if axis == "x" and face > 0:
                    continue
                n = 4
                for i in range(n + 1):
                    u = a + (b - a) * i / n
                    p = (u, y0, face * 3.9) if axis == "x" else (face * 3.9, y0, u)
                    nd.baluster(acc, M["wall"], p, 0.4, 0.055, sides=6)


def drum_and_dome(acc, M):
    stone, wall = M["stone"], M["wall"]
    mats = {"frame": M["metal"], "trim": M["wall"]}
    for i in range(8):
        b = i * math.pi / 4 + math.pi / 8
        yaw = math.pi / 2 - b
        with acc.at((math.cos(b) * 2.76, DRUM_Y + 0.05, math.sin(b) * 2.76), yaw):
            nd.window(acc, 0.5, 0.8, 0.02, mats, glass_front=0.055, style="plain", bars=(1, 2), sill=True, lintel=True)
        a = i * math.pi / 4
        with acc.at((math.cos(a) * 2.78, DRUM_Y, math.sin(a) * 2.78), math.pi / 2 - a):
            acc.box(stone, (0.36, 0.08, 0.2), (0, 0.79, 0.02))
            acc.box(stone, (0.36, 0.08, 0.2), (0, -0.79, 0.02))
    # Dentils round the drum cap, and a cornice ring above them.
    for i in range(48):
        a = math.tau * i / 48
        with acc.at((math.cos(a) * 3.03, DRUM_Y + 0.72, math.sin(a) * 3.03), math.pi / 2 - a):
            acc.box(stone, (0.16, 0.1, 0.1), (0, 0, 0.05), skip=("nz",))
    # Standing seams down the dome, on the edges between its gores.
    steps_ = 6
    top_t = math.acos(0.72 / 2.55)
    for i in range(16):
        a = math.pi / 16 + i * math.pi / 8
        pts = []
        for k in range(steps_ + 1):
            t = k * top_t / steps_
            r = 2.58 * math.cos(t)
            pts.append((math.cos(a) * r, DOME_Y + 2.58 * math.sin(t), math.sin(a) * r))
        for p, q in zip(pts, pts[1:]):
            acc.rod(M["accent"], p, q, 0.022, sides=4, caps=False)
    # Lantern: a rail between the posts, ribs on its cap and a finial urn.
    ly = LANTERN[1]
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        b = a + math.pi / 4
        p = (math.cos(a) * 0.78, ly - 0.1, math.sin(a) * 0.78)
        q = (math.cos(b) * 0.78, ly - 0.1, math.sin(b) * 0.78)
        acc.bar(wall, p, q, 0.05, 0.05)
        for k in range(1, 3):
            t = k / 3
            m = tuple(p[j] + (q[j] - p[j]) * t for j in range(3))
            nd.baluster(acc, wall, (m[0], ly - 0.5, m[2]), 0.4, 0.03, sides=5)
        acc.box(M["stone"], (0.2, 0.06, 0.2), (math.cos(a) * 0.78, ly + 0.62, math.sin(a) * 0.78))
        rr = 0.8
        acc.rod(M["accent"], (math.cos(a + math.pi / 8) * 0.3, ly + 1.3, math.sin(a + math.pi / 8) * 0.3), (math.cos(a + math.pi / 8) * rr, ly + 0.8, math.sin(a + math.pi / 8) * rr), 0.02, sides=4)


def door(acc, M):
    """The entrance under the portico: stone pilasters and an entablature, a
    kick plate and a lower panelled band on the glazed doors."""
    stone = M["stone"]
    z = 3.62
    for s in (-1, 1):
        acc.box(stone, (0.2, 2.6, 0.16), (s * 0.93, PODIUM_TOP + 1.3, z + 0.02))
        acc.box(stone, (0.28, 0.1, 0.22), (s * 0.93, PODIUM_TOP + 0.05, z + 0.03))
        acc.box(stone, (0.28, 0.1, 0.22), (s * 0.93, PODIUM_TOP + 2.55, z + 0.03))
    acc.box(stone, (2.2, 0.16, 0.24), (0, PODIUM_TOP + 2.7, z + 0.05))
    acc.box(stone, (2.4, 0.05, 0.3), (0, PODIUM_TOP + 2.82, z + 0.07))
    for s in (-1, 1):
        for j in range(2):
            nd.frustum(acc, M["wall"], 0.62, 0.52, 0.03, 0.04, pos=(s * 0.4, PODIUM_TOP + 0.3 + j * 0.62, 3.46))
        acc.box(M["metal"], (0.04, 0.3, 0.03), (s * 0.12, PODIUM_TOP + 1.3, 3.5))
    acc.box(M["metal"], (1.6, 0.14, 0.03), (0, PODIUM_TOP + 0.1, 3.46), skip=("nz",))


def forecourt(acc, M):
    stone, metal, accent = M["stone"], M["metal"], M["accent"]
    iron = {"iron": M["dark"], "glass": M["glass"]}
    for s in (-1, 1):
        # Flag poles: rings and a ball; the cloth is `animated()`.
        px = s * 3.4
        acc.cyl(stone, 0.26, 0.08, (px, 0.84, 4.75), sides=8)
        for y in (1.2, 2.6, 4.2):
            acc.cyl(metal, 0.085, 0.05, (px, y, 4.75), sides=8)
        acc.rod(metal, (px, 4.7, 4.75), (px + s * 0.5, 4.7, 4.75), 0.008, sides=3)
        # Lamp standards at the corners of the steps.
        nd.lamp_standard(acc, iron, (s * 5.4, 0.3, 4.9), height=2.85)
    # The fountain: a moulded basin rim, gadroons on the bowl and a spray.
    fz = 5.95
    acc.lathe(stone, [(1.04, 0.62), (1.04, 0.72), (0.98, 0.76), (0.92, 0.76), (0.92, 0.62)], sides=28, pos=(0, 0, fz))
    for i in range(14):
        a = math.tau * i / 14
        acc.rod(stone, (math.cos(a) * 0.19, 1.28, fz + math.sin(a) * 0.19), (math.cos(a) * 0.44, 1.44, fz + math.sin(a) * 0.44), 0.03, sides=4)
    for k, (rr, y) in enumerate(((0.36, 0.72), (0.28, 0.9), (0.22, 1.1))):
        acc.cyl(stone, rr, 0.06, (0, y, fz), sides=16)
    for i in range(10):
        a = math.tau * i / 10
        c, s_ = math.cos(a), math.sin(a)
        acc.rod(M["glass"], (c * 0.05, 2.05, fz + s_ * 0.05), (c * 0.5, 1.55, fz + s_ * 0.5), 0.02, sides=4)
        acc.sphere(M["glass"], 0.035, (c * 0.55, 1.5, fz + s_ * 0.55), sides=6, rings=3)
    # Chains between the bollards.
    xs = (-4.6, -2.3, 2.3, 4.6)
    for a, b in zip(xs, xs[1:]):
        if b - a < 3:
            nd.chain(acc, M["dark"], (a + 0.1, 0.8, 6.4), (b - 0.1, 0.8, 6.4), sag=0.16, links=18, size=0.05)


def paving(acc, M):
    y = 0.3
    nd.paving(acc, M["paving"], -6.55, 6.55, 5.0, 6.55, y, size=0.45)
    nd.paving(acc, M["paving"], -6.55, 6.55, -6.55, -5.0, y, size=0.45)
    nd.paving(acc, M["paving"], -6.55, -5.25, -4.95, 4.95, y, size=0.45)
    nd.paving(acc, M["paving"], 5.25, 6.55, -4.95, 4.95, y, size=0.45)


def animated(M, scope="TownHallNear"):
    """The hands (with a second hand: the clock is big enough here) and the
    cloths, finer than the lean ones, in the same places."""
    objs = animkit.clock_hands(f"{scope}.Clock.0", M["dark"], (0.0, lean.CLOCK[1], 4.62), 0.5, z=0.145, depth=0.014, lift=0.022, second=True)
    for k, px in enumerate(lean.FLAG_POLES):
        s = 1 if px > 0 else -1
        objs += animkit.flag(f"{scope}.Flag.{k}", M["accent"], (px + s * 0.05, lean.FLAG_Y, lean.FLAG_Z), (s, 0.0, 0.0), lean.FLAG_LENGTH, lean.FLAG_HEIGHT, segs=(14, 4), thick=0.02, ripple=0.045)
    return objs


def build():
    kit.reset()
    M = lean.palette()
    parts = nkit.drop(lean_parts(M), *REPLACED)
    hall = finish(parts, "TownHallLean")
    acc = nkit.Acc()
    windows(acc, hall, M)
    rustication(acc, M)
    plinth_and_cornice(acc, M)
    steps(acc, M)
    columns(acc, M)
    pediment(acc, M)
    balustrades(acc, M)
    drum_and_dome(acc, M)
    door(acc, M)
    forecourt(acc, M)
    paving(acc, M)
    near = nkit.rejoin(hall, acc.objects(), "TownHallNear")
    kit.bake_ao([near], distance=1.2, samples=16, floor=0.55)
    return [near] + animated(M)


def preview(_=0):
    return build()
