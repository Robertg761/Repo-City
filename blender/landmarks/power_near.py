"""
The power station's near level: `Power`, `Stack`, `StackCold` and `Bare` of
`power.py`, each the lean model drawn over -- corrugated cladding, framed
glazing, roof guard rails, gravel ballast, ribbed cooling-tower shells with
their ladders and rails, a stack with cage hoops and gallery rails, lattice
pylons with strings of insulator discs, transformers with bolted lids,
radiator banks, fans, gauges and sheds of porcelain, a gantry hung with
insulators, a welded-mesh fence and a yard of loose stone.

  blender -b --python blender/export.py -- blender/landmarks/power_near.py power-station-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
from kit import finish  # noqa: E402

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "power.py"))
DECK, HALL_X, HALL_W, HALL_H, HALL_D = lean.DECK, lean.HALL_X, lean.HALL_W, lean.HALL_H, lean.HALL_D
CX, CZ = lean.CHIMNEY

REPLACED = ("downpipe", "boardLine", "insulator", "shed", "pumpPipe")


def shell_r(y):
    rows = lean.SHELL
    if y <= rows[0][1]:
        return rows[0][0]
    for (r0, y0), (r1, y1) in zip(rows, rows[1:]):
        if y <= y1:
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return rows[-1][0]


def stack_r(y):
    return 1.0 - (y - 0.6) / 10.5 * 0.255


def insulator_string(acc, mat, x, y_top, z, discs=6, r=0.09, pitch=0.055, axis="y"):
    """A hanging string of porcelain discs from y_top down, with caps."""
    for k in range(discs):
        acc.cyl(mat, r * (1.0 - 0.0 * k), 0.026, (x, y_top - 0.03 - k * pitch, z), sides=8, r2=r * 0.7)
    acc.cyl(mat, 0.022, discs * pitch, (x, y_top - discs * pitch / 2, z), sides=5)


# ---------------------------------------------------------------- ground


def ground(acc, obj, M):
    free = nkit.ground_free(obj, DECK)
    nd.paving(acc, M["curb"], -8.25, 8.25, -5.65, 5.65, DECK, size=0.9, keep=free, thick=0.02)
    for bx, bz in ((-8.0, 5.3), (8.0, 5.3), (-8.0, -5.3), (8.0, -5.3)):
        acc.cyl(M["hazard"], 0.12, 0.7, (bx, DECK + 0.35, bz), sides=8)
        acc.cyl(M["deck"], 0.145, 0.1, (bx, DECK + 0.45, bz), sides=8)
        acc.sphere(M["hazard"], 0.12, (bx, DECK + 0.7, bz), sides=8, rings=4)


# ---------------------------------------------------------------- the hall


def hall(acc, obj, M):
    x = HALL_X
    top = DECK + HALL_H
    z1 = HALL_D / 2
    sash = {"frame": M["steelDark"], "trim": M["clad"]}
    for o in nkit.openings(obj):
        cx, cy, cz = o["centre"]
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="steel", bars=(6, 2) if o["w"] > 3 else (2, 2))
    # Corrugated cladding on every wall the ribs can reach.
    nkit.ribs(acc, obj, M["clad"], ("hull",), pitch=0.13, width=0.055, lift=0.012, sample=0.25, min_area=3.0, y_min=DECK + 0.5)
    # Roof guard rail round the fascia, gravel on the roof deck, fan blades.
    rail = [(x - HALL_W / 2 - 0.1, -z1 - 0.1), (x + HALL_W / 2 + 0.1, -z1 - 0.1), (x + HALL_W / 2 + 0.1, z1 + 0.1), (x - HALL_W / 2 - 0.1, z1 + 0.1)]
    nd.guardrail(acc, M["steel"], rail, top + 0.4, height=1.05, closed=True)
    free = nkit.ground_free(obj, top + 0.42)
    nd.pebbles(acc, M["gravel"], x - HALL_W / 2 + 0.1, x + HALL_W / 2 - 0.1, -z1 + 0.1, z1 - 0.1, top + 0.42, 1300, size=0.045, seed=3, keep=free)
    for fx in (x - 1.8, x + 1.8):
        for k in range(5):
            with acc.at((fx, top + 0.755, 0), k * math.tau / 5):
                acc.box(M["flue"], (0.3, 0.012, 0.09), (0.16, 0, 0), rot=(0.2, 0, 0))
        acc.cyl(M["steelDark"], 0.06, 0.05, (fx, top + 0.76, 0), sides=8)
        for a in range(8):
            t = a * math.tau / 8
            acc.rod(M["steel"], (fx + math.cos(t) * 0.36, top + 0.73, math.sin(t) * 0.36), (fx + math.cos(t + 0.4) * 0.36, top + 0.73, math.sin(t + 0.4) * 0.36), 0.008, sides=3)
    # Monitors: cap gutters and louvres in their ends.
    for mz in (-2.3, 2.3):
        for s in (-1, 1):
            with acc.at((x + s * 3.02, top + 0.84, mz), s * math.pi / 2):
                nd.louvre_panel(acc, M["steelDark"], 0.9, 0.6, slat=0.08, tilt=0.5, depth=0.05)
    # Roller door: guides, a spring drum, a bottom bar and a lock plate, plus the personnel door's frame.
    with acc.at((x, DECK + 1.4, z1)):
        acc.rect_frame(M["steel"], -1.17, 1.17, -1.33, 1.4, [(0, 0), (0, 0.07), (0.06, 0.07), (0.06, 0)], z=0.02)
    acc.cyl(M["steelDark"], 0.14, 2.3, (x, DECK + 2.72, z1 - 0.12), axis="x", sides=10)
    acc.box(M["hazard"], (2.1, 0.1, 0.09), (x, DECK + 0.08, z1 - 0.1))
    acc.box(M["steelDark"], (0.1, 0.12, 0.04), (x + 0.9, DECK + 1.1, z1 - 0.1))
    with acc.at((x + 2.35, DECK + 1.05, z1 + 0.03)):
        acc.rect_frame(M["steel"], -0.47, 0.47, -0.98, 1.05, [(0, 0), (0, 0.05), (0.05, 0.05), (0.05, 0)], z=0.0)
        acc.box(M["steel"], (0.05, 0.16, 0.03), (0.3, 0.0, 0.05))
        acc.box(M["steelDark"], (0.7, 0.3, 0.012), (0, -0.7, 0.035))
    # Downpipes, round and bracketed, at the four corners.
    for side in (-1, 1):
        fx = x + side * HALL_W / 2
        for cz in (-1, 1):
            nd.downpipe(acc, M["steel"], fx + side * 0.12, cz * (z1 - 0.3), DECK, top - 0.1, yaw=side * math.pi / 2)


def pump_and_duct(acc, M):
    px, pz = 3.75, -5.0
    with acc.at((px, DECK + 0.4, pz + 0.51)):
        acc.rect_frame(M["steel"], -0.27, 0.27, -0.33, 0.4, [(0, 0), (0, 0.04), (0.04, 0.04), (0.04, 0)])
        acc.cyl(M["steel"], 0.02, 0.03, (0.18, 0.0, 0.05), axis="z", sides=6)
    acc.rect_run(M["steel"], px - 0.6, px + 0.6, pz - 0.5, pz + 0.5, [(0, 0), (0.1, 0), (0.1, 0.03), (0, 0.03)], y=DECK + 1.2)
    # The pump's pipes to each pond: flanges and saddles along them.
    for s, (tx, tz) in zip((-1, 1), lean.TOWERS):
        start = (px + s * 0.6, DECK + 0.35, pz + 0.1)
        dx, dz = start[0] - tx, start[2] - tz
        d = math.hypot(dx, dz)
        end = (tx + dx / d * 2.15, DECK + 0.35, tz + dz / d * 2.15)
        acc.bar(M["steel"], start, end, 0.18, 0.18)
        for t in (0.02, 0.5, 0.98):
            p = tuple(start[i] + (end[i] - start[i]) * t for i in range(3))
            a = math.atan2(end[0] - start[0], end[2] - start[2])
            with acc.at(p, a):
                acc.cyl(M["steelDark"], 0.15, 0.05, (0, 0, 0), axis="z", sides=10)
                for k in range(8):
                    t2 = k * math.tau / 8
                    acc.cyl(M["steel"], 0.014, 0.07, (math.cos(t2) * 0.12, math.sin(t2) * 0.12, 0), axis="z", sides=6)
        for t in (0.25, 0.75):
            p = tuple(start[i] + (end[i] - start[i]) * t for i in range(3))
            acc.box(M["steelDark"], (0.26, 0.22, 0.12), (p[0], DECK + 0.13, p[2]), rot=(0, math.atan2(end[0] - start[0], end[2] - start[2]) + math.pi / 2, 0))
    # The flue duct: stiffener frames and an inspection hatch with bolts.
    x0 = HALL_X + HALL_W / 2
    length = CX - 0.9 - x0
    for k in range(int(length / 0.5)):
        xx = x0 + 0.3 + k * 0.5
        acc.rect_run(M["steelDark"], xx - 0.03, xx + 0.03, CZ - 0.45, CZ + 0.45, [(0, 0), (0.03, 0), (0.03, 0.02), (0, 0.02)], y=DECK + 1.2)
        acc.box(M["steelDark"], (0.06, 0.86, 0.96), (xx, DECK + 1.6, CZ))
    with acc.at(((x0 + CX - 0.9) / 2, DECK + 1.6, CZ + 0.45)):
        acc.box(M["steelDark"], (0.5, 0.4, 0.03), (0, 0, 0.02))
        for a in range(-1, 2, 2):
            for b in range(-1, 2, 2):
                acc.cyl(M["steel"], 0.012, 0.03, (a * 0.2, b * 0.15, 0.045), axis="z", sides=6)


# ---------------------------------------------------------------- towers, stack, pylons


def cooling_tower(acc, M, tx, tz):
    c = (tx, DECK, tz)
    y = 1.6
    while y < 8.4:
        nd.ring_band(acc, M["stain"] if y > 5.3 else M["deck"], shell_r, y, y + 0.09, sides=16, pos=c, lift=0.035)
        y += 0.7
    # Pond kerb coping and the overflow weir.
    acc.lathe(M["curb"], [(2.05, 0.45), (2.22, 0.45), (2.22, 0.5), (2.05, 0.5)], sides=16, pos=c)
    acc.box(M["deck"], (0.5, 0.12, 0.3), (tx + 2.1, DECK + 0.3, tz + 0.4))
    # The top: a rail round the lip, and a caged ladder up the front.
    r_lip = shell_r(8.6) + 0.02
    for i in range(16):
        a = math.tau * (i + 0.5) / 16
        acc.box(M["steel"], (0.04, 0.55, 0.04), (tx + math.cos(a) * (r_lip + 0.1), DECK + 8.74 + 0.275, tz + math.sin(a) * (r_lip + 0.1)))
    for yy in (8.74 + 0.5, 8.74 + 0.3):
        acc.lathe(M["steel"], [(r_lip + 0.08, yy), (r_lip + 0.13, yy), (r_lip + 0.13, yy + 0.03), (r_lip + 0.08, yy + 0.03)], sides=16, pos=c)
    ang = math.pi / 2
    for side in (-0.2, 0.2):
        pts = []
        for yy in (1.4, 8.7):
            r = shell_r(yy) + 0.06
            pts.append((tx + math.cos(ang) * r + side, DECK + yy, tz + math.sin(ang) * r))
        acc.rod(M["steel"], pts[0], pts[1], 0.022, sides=4)
    yy = 1.7
    while yy < 8.5:
        r = shell_r(yy) + 0.06
        acc.box(M["steel"], (0.42, 0.03, 0.03), (tx, DECK + yy, tz + r))
        yy += 0.28


def chimney(acc, M, cold):
    shaft = M["cold"] if cold else M["hull"]
    band_dark = M["coldDark"] if cold else M["hazardDeep"]
    c = (CX, DECK, CZ)
    # Seam rings up the shaft, skipping the hazard bands.
    y = 1.2
    while y < 10.5:
        if not (8.2 < y < 8.98 or 9.4 < y < 10.2):
            nd.ring_band(acc, shaft, stack_r, y, y + 0.07, sides=16, pos=c, lift=0.03)
        y += 0.62
    # The ladder's cage: hoops round the rungs, and the straps that tie them.
    def zf(yy):
        return CZ + 1.06 - (yy - 0.6) / 10.3 * 0.26

    yy = 2.4
    while yy < 10.6:
        zc = zf(yy) + 0.02
        for a in range(6):
            t0 = -math.pi / 2 + math.pi * a / 6
            t1 = t0 + math.pi / 6
            p = (CX + math.sin(t0) * 0.42, DECK + yy, zc + 0.05 + math.cos(t0) * 0.42)
            q = (CX + math.sin(t1) * 0.42, DECK + yy, zc + 0.05 + math.cos(t1) * 0.42)
            acc.bar(M["steel"], p, q, 0.028, 0.028)
        yy += 0.72
    for sx in (-0.42, 0.42):
        acc.rod(M["steel"], (CX + sx, DECK + 2.4, zf(2.4) + 0.5), (CX + sx, DECK + 10.6, zf(10.6) + 0.5), 0.02, sides=4)
    # The gallery: a second rail, a kick ring, posts twice as close and brackets.
    for yy, r in ((9.4, 1.07), (9.24, 1.09)):
        acc.lathe(M["steel"], [(r - 0.03, DECK + yy), (r + 0.03, DECK + yy), (r + 0.03, DECK + yy + 0.03), (r - 0.03, DECK + yy + 0.03)], sides=16, pos=(CX, 0, CZ))
    for i in range(8):
        a = 2 * math.pi * i / 8
        p = (CX + math.cos(a) * 1.08, DECK + 9.19, CZ + math.sin(a) * 1.08)
        acc.rod(M["steel"], p, (p[0], p[1] + 0.4, p[2]), 0.02, sides=4)
        acc.bar(M["steel"], (CX + math.cos(a) * 0.9, DECK + 8.98, CZ + math.sin(a) * 0.9), (CX + math.cos(a) * 1.09, DECK + 9.16, CZ + math.sin(a) * 1.09), 0.04, 0.03)
    # The cap: bolts round the ring, a warning lamp and a rod.
    for i in range(24):
        a = math.tau * i / 24
        acc.cyl(M["steelDark"], 0.02, 0.04, (CX + math.cos(a) * 0.72, DECK + 11.4, CZ + math.sin(a) * 0.72), sides=6)
    acc.cyl(M["hazard"], 0.06, 0.1, (CX + 0.7, DECK + 11.44, CZ), sides=8)
    acc.rod(M["steel"], (CX - 0.7, DECK + 11.38, CZ), (CX - 0.7, DECK + 12.3, CZ), 0.012, sides=4)
    # Foot: a plinth chamfer and anchor bolts.
    for i in range(12):
        a = math.tau * i / 12
        acc.cyl(M["steelDark"], 0.035, 0.08, (CX + math.cos(a) * 1.06, DECK + 0.64, CZ + math.sin(a) * 1.06), sides=6)


def pylon(acc, M, x, z):
    h = lean.PYLON_H
    foot, head = 0.44, 0.16

    def corner(sx, sz, t):
        r = foot + (head - foot) * t
        return (x + sx * r, DECK + h * t, z + sz * r)

    # Gusset plates and bolts at every joint of the legs, the arms' trusses and their insulator strings.
    for t in (0.0, 0.32, 0.6, 0.82, 1.0):
        for sx in (-1, 1):
            for sz in (-1, 1):
                p = corner(sx, sz, t)
                acc.box(M["steelDark"], (0.09, 0.09, 0.09), p)
                acc.cyl(M["steel"], 0.014, 0.03, (p[0] + sx * 0.05, p[1], p[2]), axis="x", sides=5)
    for t in (0.16, 0.46, 0.71, 0.91):
        for s1, s2 in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            a, b = corner(*s1, t), corner(*s2, t)
            acc.rod(M["steel"], a, b, 0.018, sides=3)
    for t, reach in ((0.82, lean.ARM_REACH), (1.0, 0.55)):
        y = DECK + h * t
        for s in (-1, 1):
            insulator_string(acc, M["porcelain"], x, y - 0.06, z + s * reach, discs=7)
            acc.box(M["steel"], (0.14, 0.05, 0.14), (x, y - 0.08, z + s * (reach + 0.02)))
            acc.rod(M["steel"], (x, y - 0.1, z + s * (reach - 0.3)), (x, y - 0.02, z + s * reach), 0.02, sides=3)
    for k in range(3):
        acc.box(M["hazard"], (0.3, 0.03, 0.02), (x, DECK + 2.0 + k * 0.12, z + 0.4))
    # A climbing guard: barbed collar at the foot.
    for a in range(12):
        t = a * math.tau / 12
        acc.rod(M["steelDark"], (x + math.cos(t) * 0.5, DECK + 2.3, z + math.sin(t) * 0.5), (x + math.cos(t) * 0.62, DECK + 2.42, z + math.sin(t) * 0.62), 0.012, sides=3)


# ---------------------------------------------------------------- the yard


def transformer(acc, M, cx):
    cz = 3.0
    steel, dark, por = M["steel"], M["steelDark"], M["porcelain"]
    lid_y = DECK + 1.98
    # Lid bolts, a rim and the lifting lugs.
    for i in range(10):
        for s in (-1, 1):
            acc.cyl(dark, 0.022, 0.03, (cx - 1.0 + i * 0.222, lid_y + 0.03, cz + s * 0.78), sides=6)
    for i in range(5):
        for s in (-1, 1):
            acc.cyl(dark, 0.022, 0.03, (cx + s * 1.1, lid_y + 0.03, cz - 0.6 + i * 0.3), sides=6)
    for s in (-1, 1):
        acc.box(dark, (0.14, 0.12, 0.03), (cx + s * 0.9, lid_y + 0.1, cz))
    # More radiator fins between the lean ones, and cooling fans on the banks.
    for side in (-1, 1):
        for k in range(4):
            acc.box(steel, (0.04, 1.14, 0.22), (cx - 0.57 + k * 0.38, DECK + 1.05, cz + side * 0.95))
        for fx in (-0.5, 0.5):
            with acc.at((cx + fx, DECK + 0.5, cz + side * 1.3), 0.0 if side > 0 else math.pi):
                acc.cyl(dark, 0.22, 0.05, (0, 0, 0), axis="z", sides=14)
                for k in range(5):
                    with acc.at((0, 0, 0.03), rot=(0, 0, k * math.tau / 5)):
                        acc.box(steel, (0.2, 0.06, 0.012), (0.12, 0, 0), rot=(0.4, 0, 0))
                acc.cyl(steel, 0.04, 0.05, (0, 0, 0.04), axis="z", sides=8)
    # The conservator: bands, an oil gauge, a breather jar.
    for dx in (-0.55, 0.0, 0.55):
        acc.cyl(dark, 0.255, 0.04, (cx - 0.3 + dx * 0.9, DECK + 2.35, cz - 0.5), axis="x", sides=10)
    with acc.at((cx + 0.3, DECK + 2.35, cz - 0.5), math.pi / 2):
        acc.cyl(dark, 0.105, 0.015, (0, 0.0, 0.0125), axis="z", sides=12)
        acc.cyl(M["porcelain"], 0.09, 0.02, (0, 0.0, 0.03), axis="z", sides=12)
    acc.cyl(por, 0.07, 0.24, (cx - 0.8, DECK + 2.2, cz - 0.5), sides=8)
    acc.cyl(dark, 0.08, 0.04, (cx - 0.8, DECK + 2.02, cz - 0.5), sides=8)
    # Extra porcelain sheds on each bushing, finer than the two the lean one has.
    for dx in (-0.7, 0.0, 0.7):
        bx = cx + dx
        for k in range(7):
            acc.cyl(por, 0.2 - k * 0.018, 0.045, (bx, DECK + 2.02 + k * 0.11, cz + 0.2), sides=8)
    # Wheels and chocks under the tank, an earth strap and the ID plate.
    for sx in (-1, 1):
        for sz in (-1, 1):
            acc.cyl(dark, 0.11, 0.09, (cx + sx * 0.9, DECK + 0.33, cz + sz * 0.62), axis="z", sides=10)
            acc.box(dark, (0.22, 0.05, 0.1), (cx + sx * 0.9, DECK + 0.29, cz + sz * 0.82))
    acc.bar(M["hazard"], (cx + 1.1, DECK + 0.3, cz + 0.4), (cx + 1.1, DECK + 1.5, cz + 0.4), 0.03, 0.012)
    acc.box(M["deck"], (0.42, 0.22, 0.014), (cx - 0.55, DECK + 1.0, cz + 0.807))
    nd.letters(acc, dark, "TR 1", 0.09, pos=(cx - 0.55, DECK + 1.0, cz + 0.812), depth=0.006)


def gantry(acc, M):
    for px in (1.4, 7.8):
        for pz in (1.6, 4.4):
            for a in (-1, 1):
                for b in (-1, 1):
                    acc.cyl(M["steelDark"], 0.018, 0.05, (px + a * 0.1, DECK + 0.22, pz + b * 0.1), sides=6)
            acc.box(M["steelDark"], (0.3, 0.04, 0.3), (px, DECK + 0.16, pz))
    for pz in (1.6, 4.4):
        for x in (1.9, 2.9, 3.9, 5.3, 6.3, 7.3):
            insulator_string(acc, M["porcelain"], x, DECK + 4.02, pz, discs=5, r=0.085, pitch=0.05)
        for x in (1.4, 7.8):
            acc.box(M["steel"], (0.3, 0.03, 0.3), (x, DECK + 4.2, pz))


def fence(acc, M):
    x0, x1, z0, z1 = lean.YARD["x0"], lean.YARD["x1"], lean.YARD["z0"], lean.YARD["z1"]
    gate = (4.1, 5.3)
    h = 1.7
    steel = M["steel"]
    runs = [((x0, z0), (x1, z0)), ((x0, z1), (gate[0], z1)), ((gate[1], z1), (x1, z1)), ((x0, z0), (x0, z1)), ((x1, z0), (x1, z1))]
    for a, b in runs:
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        n = max(1, int(length / 0.09))
        for i in range(n + 1):
            t = i / n
            p = (a[0] + dx * t, a[1] + dz * t)
            acc.rod(M["steelDark"], (p[0], DECK + 0.18, p[1]), (p[0], DECK + 1.62, p[1]), 0.007, sides=3, caps=False)
        for y in (0.45, 0.8, 1.2):
            acc.bar(M["steelDark"], (a[0], DECK + y, a[1]), (b[0], DECK + y, b[1]), 0.012, 0.012)
        # Barbed strands on outward arms at the top of every post.
        m = max(1, round(length / 1.2))
        nx, nz = (dz / length, -dx / length)
        for i in range(m + 1):
            t = i / m
            p = (a[0] + dx * t, a[1] + dz * t)
            for s in (1,):
                acc.rod(steel, (p[0], DECK + h, p[1]), (p[0] + nx * 0.28, DECK + h + 0.22, p[1] + nz * 0.28), 0.018, sides=4)
        for k, (off, yy) in enumerate(((0.0, h + 0.02), (0.14, h + 0.11), (0.28, h + 0.22))):
            acc.bar(steel, (a[0] + nx * off, DECK + yy, a[1] + nz * off), (b[0] + nx * off, DECK + yy, b[1] + nz * off), 0.01, 0.01)
        n2 = int(length / 0.25)
        for i in range(n2):
            t = (i + 0.5) / n2
            p = (a[0] + dx * t + nx * 0.14, DECK + h + 0.11, a[1] + dz * t + nz * 0.14)
            acc.bar(steel, (p[0], p[1] - 0.03, p[2]), (p[0], p[1] + 0.03, p[2]), 0.008, 0.02)
    # The gate: hinges, a latch and a brace.
    gx = gate[0]
    for y in (0.3, 1.4):
        acc.cyl(M["steelDark"], 0.03, 0.14, (gx + 0.02, DECK + y, lean.YARD["z1"] - 0.0), sides=6)
    acc.bar(steel, (gate[0] + 0.05, DECK + 0.25, lean.YARD["z1"] - 0.12), (gate[0] + 0.68, DECK + 1.35, lean.YARD["z1"] - 0.12), 0.03, 0.03)


def yard(acc, obj, M):
    # Loose stone over the whole yard, kept off everything that stands on it.
    free = nkit.ground_free(obj, DECK + 0.16)
    nd.pebbles(acc, M["curb"], 1.0, 8.2, 1.1, 4.9, DECK + 0.16, 2400, size=0.05, seed=5, keep=free)
    for cx in (2.9, 6.3):
        transformer(acc, M, cx)
    gantry(acc, M)
    fence(acc, M)


def board(acc, M):
    bx, bz = lean.BOARD
    nd.letters(acc, M["steelDark"], "CI STATUS", 0.14, pos=(bx, DECK + 2.32, bz + 0.05), depth=0.012)
    for k in range(5):
        acc.box(M["steelDark"], (0.7 - k * 0.1, 0.03, 0.012), (bx - 0.2 - (k * 0.05), DECK + 2.0 - k * 0.09, bz + 0.05))
    for sx in (-1, 1):
        for sy in (-1, 1):
            acc.cyl(M["steel"], 0.02, 0.02, (bx + sx * 0.78, DECK + 2.1 + sy * 0.5, bz + 0.075), axis="z", sides=6)
    acc.rect_run(M["steel"], bx - 0.09, bx + 0.09, bz - 0.09, bz + 0.09, [(0, 0), (0.03, 0), (0.03, 0.05), (0, 0.05)], y=DECK + 0.16)


# ---------------------------------------------------------------- nodes


def plant_near(M):
    obj = finish(lean.plant(M), "PowerLean")
    acc = nkit.Acc()
    ground(acc, obj, M)
    hall(acc, obj, M)
    pump_and_duct(acc, M)
    for tx, tz in lean.TOWERS:
        cooling_tower(acc, M, tx, tz)
    for px, pz in lean.PYLONS:
        pylon(acc, M, px, pz)
    yard(acc, obj, M)
    board(acc, M)
    return nkit.rejoin(obj, acc.objects(), "PowerNear")


def bare_near(M):
    obj = finish(lean.bare(M), "BareLean")
    acc = nkit.Acc()
    ground(acc, obj, M)
    yard(acc, obj, M)
    board(acc, M)
    return nkit.rejoin(obj, acc.objects(), "BareNear")


def stack_near(M, cold):
    obj = finish(lean.chimney(M, cold), "StackLean")
    acc = nkit.Acc()
    chimney(acc, M, cold)
    return nkit.rejoin(obj, acc.objects(), "StackColdNear" if cold else "StackNear")


def build(which=("power", "stack", "cold", "bare")):
    kit.reset()
    M = lean.palette()
    made = []
    if "power" in which:
        made.append(plant_near(M))
    if "stack" in which:
        made.append(stack_near(M, False))
    if "cold" in which:
        made.append(stack_near(M, True))
    if "bare" in which:
        made.append(bare_near(M))
    by = {o.name: o for o in made}
    for obj in made:
        others = [o for o in made if o is not obj]
        visible = [by[n] for n in (("StackNear",) if obj.name == "PowerNear" else ("PowerNear",) if obj.name.startswith("Stack") else ()) if n in by]
        for o in others:
            if o not in visible:
                o.hide_render = True
        kit.bake_ao([obj], distance=1.2, samples=16, floor=0.55)
        for o in others:
            o.hide_render = False
    return made


VARIANTS = {1: ("PowerNear", "StackNear"), 2: ("PowerNear", "StackColdNear"), 3: ("BareNear",)}


def preview(variant):
    which = {1: ("power", "stack"), 2: ("power", "cold"), 3: ("bare",)}[variant]
    return build(which)
