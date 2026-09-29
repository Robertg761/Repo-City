"""
The construction site's tower crane, NEAR level (`crane.glb`'s detailed twin).

Same two nodes, same frame and outline as `blender/incidents/crane.py`: a
mast standing on its concrete base (origin on the ground under its centre)
and a jib the site turns about the mast's top (origin on the slewing ring),
the hook where the lean one hangs it. What is new is what a camera at the
foot of the crane sees: a lattice of round tubes with gussets and flanged,
bolted section joints, the climbing ladder with its cage and landings, the
slewing bearing and its bolts, a jib of braced panels with a trolley on its
chords, a four-fall hoist, a real hook and block, the counter-jib's walkway
and handrails, banded concrete ballast, the winch, the cat head with its
pendants, and a cab with framed windows, a door and its air conditioner.

    blender -b --python blender/export.py -- blender/scenes_near/crane_near.py crane-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import crane as lean  # noqa: E402
import kit  # noqa: E402
from kit import box, cyl, finish, marker  # noqa: E402
from kit_near import Acc  # noqa: E402

JIB_Y, HALF, HOOK, TIP, TAIL = lean.JIB_Y, lean.HALF, lean.HOOK, lean.TIP, lean.TAIL


def palette():
    M = lean.palette()
    M["lamp"] = kit.material("lamp", "#e8463e", "glass", 0.3, emission=0.5)
    M["rope"] = kit.material("dark", "#3a3d42", "metal", 0.6)
    return M


def lerp(p, q, t):
    return tuple(p[i] + (q[i] - p[i]) * t for i in range(3))


# --- the mast ---------------------------------------------------------------

SECTIONS = 10
MAST_Y0, MAST_Y1 = 0.72, JIB_Y - 0.2
CHORD = 0.05  # tube radius of a chord


def mast(M):
    parts = []
    # The concrete base: chamfered, its faces sliced so the bake shades them.
    parts.append(box("base", (2.4, 0.6, 2.4), (0, 0.3, 0), M["base"], bev=0.07, seg=3, cell=0.6))
    # Shutter lines cast into its faces, and lifting sockets.
    a = Acc()
    for y in (0.2, 0.42):
        for s in (-1, 1):
            a.box((2.42, 0.014, 0.014), (0, y, s * 1.2), M["base"])
            a.box((0.014, 0.014, 2.42), (s * 1.2, y, 0), M["base"])
    # Base plate on the concrete, with its four anchor bolts and nuts.
    a.box((1.0, 0.05, 1.0), (0, 0.625, 0), M["dark"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * 0.42, sz * 0.42
            a.disc((x, 0.68, z), 0.028, 0.14, M["steel"], "y", 8)
            a.disc((x, 0.665, z), 0.05, 0.03, M["steel"], "y", 6)
            a.disc((x, 0.72, z), 0.05, 0.03, M["steel"], "y", 6)
    parts += a.objects("baseFittings")

    corners = [(-HALF, -HALF), (HALF, -HALF), (HALF, HALF), (-HALF, HALF)]
    step = (MAST_Y1 - MAST_Y0) / SECTIONS
    parts.append(box("plinth", (0.9, 0.12, 0.9), (0, 0.66, 0), M["dark"], bev=0.02, seg=2))
    # Four chords, each a square section with its flange every section.
    for x, z in corners:
        parts.append(box("chord", (0.1, MAST_Y1 - MAST_Y0, 0.1), (x, (MAST_Y0 + MAST_Y1) / 2, z), M["mast"], bev=0.014, seg=2))
    a = Acc()
    for x, z in corners:
        for k in range(SECTIONS + 1):
            y = MAST_Y0 + step * k
            a.box((0.17, 0.035, 0.17), (x, y, z), M["mast"])
            # Two bolts on each flange's outer corner.
            for sx, sz in ((math.copysign(1, x), 0.35 * math.copysign(1, z)), (0.35 * math.copysign(1, x), math.copysign(1, z))):
                a.hexnut((x + sx * 0.062, y + 0.018, z + sz * 0.062), 0.011, 0.02, M["steel"], "y")
    # Each face: an X between every pair of flanges, a horizontal tie at the
    # bottom of the section and gusset plates where they meet the chords.
    for i in range(4):
        (xa, za), (xb, zb) = corners[i], corners[(i + 1) % 4]
        # Push the bracing to the face plane a hair outside the chord centre.
        out = (math.copysign(1, (xa + xb)) if xa == xb else 0, math.copysign(1, (za + zb)) if za == zb else 0)
        for k in range(SECTIONS):
            y0, y1 = MAST_Y0 + step * k, MAST_Y0 + step * (k + 1)
            p00, p10 = (xa, y0 + 0.02, za), (xb, y0 + 0.02, zb)
            p01, p11 = (xa, y1 - 0.02, za), (xb, y1 - 0.02, zb)
            a.tube(p00, p11, 0.02, 0.02, M["mast"], 6)
            a.tube(p10, p01, 0.02, 0.02, M["mast"], 6)
            a.tube((xa, y0 + step * 0.5, za), (xb, y0 + step * 0.5, zb), 0.018, 0.018, M["mast"], 6)
            # Gussets at the crossing and at both ends of the mid tie.
            cx, cz = (xa + xb) / 2, (za + zb) / 2
            a.box((0.1 if za == zb else 0.02, 0.1, 0.1 if xa == xb else 0.02), (cx, y0 + step * 0.5, cz), M["mast"])
    parts += a.objects("mastLattice")

    # Diaphragm frames inside at every other joint.
    a = Acc()
    for k in range(0, SECTIONS + 1, 2):
        y = MAST_Y0 + step * k
        for i in range(4):
            (xa, za), (xb, zb) = corners[i], corners[(i + 1) % 4]
            a.tube((xa, y, za), (xb, y, zb), 0.02, 0.02, M["mast"], 6)
    # The climbing ladder up the +z face: stiles, rungs, stand-offs.
    zl = HALF + 0.12
    for x in (-0.15, 0.15):
        a.tube((x, 0.9, zl), (x, MAST_Y1 - 0.5, zl), 0.018, 0.018, M["steel"], 6)
    y = 1.0
    while y < MAST_Y1 - 0.55:
        a.tube((-0.15, y, zl), (0.15, y, zl), 0.012, 0.012, M["steel"], 6)
        y += 0.3
    y = 1.1
    while y < MAST_Y1 - 0.5:
        for x in (-0.15, 0.15):
            a.box((0.03, 0.03, 0.12), (x, y, zl - 0.06), M["steel"])
        y += 1.17
    # The safety cage: hoops and straps behind the climber, from 2.4 up.
    y = 2.4
    while y < MAST_Y1 - 0.7:
        pts = [(math.sin(t) * 0.36, y, zl + 0.03 + math.cos(t) * 0.36 * 0.9 + 0.0) for t in [(-1.25 + 2.5 * i / 6) for i in range(7)]]
        pts = [(px, py, zl - 0.02 + (pz - zl) * 1.0) for px, py, pz in pts]
        a.polyline(pts, 0.011, M["steel"], sides=5, cap_ends=True)
        y += 1.2
    for t in (-0.7, 0.0, 0.7):
        a.tube((math.sin(t) * 0.36, 2.4, zl - 0.02 + math.cos(t) * 0.32), (math.sin(t) * 0.36, MAST_Y1 - 0.75, zl - 0.02 + math.cos(t) * 0.32), 0.009, 0.009, M["steel"], 5)
    parts += a.objects("mastFittings")

    # Landings: one halfway and one under the slewing ring, with handrails.
    a = Acc()
    for level, reach in ((6.4, 0.78), (JIB_Y - 1.05, 0.9)):
        a.box((2 * reach, 0.04, 2 * reach), (0, level, 0), M["steel"])
        for i in range(-3, 4):
            a.box((2 * reach, 0.012, 0.012), (0, level + 0.027, i * reach / 3.4), M["dark"])
        for s in (-1, 1):
            for pts in (((-reach, 0, s * reach), (reach, 0, s * reach)), ((s * reach, 0, -reach), (s * reach, 0, reach))):
                (x0, _, z0), (x1, _, z1) = pts
                a.tube((x0, level + 1.0, z0), (x1, level + 1.0, z1), 0.016, 0.016, M["mast"], 6)
                a.tube((x0, level + 0.55, z0), (x1, level + 0.55, z1), 0.012, 0.012, M["mast"], 6)
                a.box((abs(x1 - x0) or 0.03, 0.12, abs(z1 - z0) or 0.03), ((x0 + x1) / 2, level + 0.08, (z0 + z1) / 2), M["mast"])
        for sx in (-1, 1):
            for sz in (-1, 1):
                a.tube((sx * reach, level, sz * reach), (sx * reach, level + 1.0, sz * reach), 0.017, 0.017, M["mast"], 6)
        for t in (-0.5, 0.5):
            for s in (-1, 1):
                a.tube((t * reach * 2, level, s * reach), (t * reach * 2, level + 1.0, s * reach), 0.012, 0.012, M["mast"], 5)
                a.tube((s * reach, level, t * reach * 2), (s * reach, level + 1.0, t * reach * 2), 0.012, 0.012, M["mast"], 5)
        # Kick plates' brackets to the mast.
        for sx, sz in corners:
            a.tube((sx, level - 0.02, sz), (sx * reach / HALF * 0.98, level - 0.02, sz * reach / HALF * 0.98), 0.02, 0.02, M["mast"], 6)
    parts += a.objects("landings")

    # The fixed half of the slewing bearing: seat, race, bolts.
    parts.append(box("slewSeat", (0.9, 0.2, 0.9), (0, JIB_Y - 0.12, 0), M["dark"], bev=0.03, seg=3))
    a = Acc()
    a.disc((0, JIB_Y - 0.03, 0), 0.5, 0.06, M["steel"], "y", 28)
    for i in range(16):
        ang = 2 * math.pi * i / 16
        a.disc((math.cos(ang) * 0.43, JIB_Y + 0.01, math.sin(ang) * 0.43), 0.02, 0.025, M["dark"], "y", 6)
    parts += a.objects("slewFittings")
    return parts


# --- the jib ----------------------------------------------------------------

LO, HI, W = 0.12, 0.62, 0.24
PANELS = 12


def jib_frame(M, a):
    """The lifting jib: three round chords, braced panels, gussets."""
    tip_lo = (TIP, LO, 0)
    for z in (-W, W):
        a.tube((0.3, LO, z), (TIP, LO, z), 0.04, 0.04, M["mast"], 8, cap0=True, cap1=True)
    top0, top1 = (0.3, HI, 0), (TIP - 0.4, LO + 0.1, 0)
    a.tube(top0, top1, 0.036, 0.036, M["mast"], 8, cap0=True, cap1=True)
    for z in (-W, W):
        e0, e1 = (0.3, LO, z), (TIP, LO, z)
        for k in range(PANELS):
            t0, t1 = k / PANELS, (k + 1) / PANELS
            b0, b1 = lerp(e0, e1, t0), lerp(e0, e1, t1)
            c0 = lerp(top0, top1, t0)
            c1 = lerp(top0, top1, t1)
            if k % 2 == 0:
                a.tube(b0, c1, 0.017, 0.017, M["mast"], 6)
            else:
                a.tube(c0, b1, 0.017, 0.017, M["mast"], 6)
            # A vertical tie at each node, and a gusset on the chord there.
            a.tube(b1, c1, 0.014, 0.014, M["mast"], 5)
            a.box((0.09, 0.06, 0.02), (b1[0], b1[1] + 0.03, z), M["mast"])
    # The bottom plan: rungs and zigzag between the two lower chords.
    for k in range(PANELS + 1):
        x = 0.3 + (TIP - 0.3) * k / PANELS
        a.tube((x, LO, -W), (x, LO, W), 0.014, 0.014, M["mast"], 6)
    for k in range(PANELS):
        x0 = 0.3 + (TIP - 0.3) * k / PANELS
        x1 = 0.3 + (TIP - 0.3) * (k + 1) / PANELS
        z0, z1 = (-W, W) if k % 2 == 0 else (W, -W)
        a.tube((x0, LO, z0), (x1, LO, z1), 0.012, 0.012, M["mast"], 5)
    # The tip: cap plate, sheave and its cheeks.
    a.box((0.12, 0.26, 2 * W + 0.08), (TIP, LO + 0.08, 0), M["mast"])
    a.disc((TIP + 0.02, LO - 0.02, 0), 0.11, 0.06, M["dark"], "z", 14)
    for z in (-0.06, 0.06):
        a.box((0.22, 0.24, 0.015), (TIP + 0.02, LO - 0.02, z * 1.5), M["mast"])


def counter_jib(M, a):
    """Two braced girders, a walkway with handrails, the weights, the winch."""
    x0, x1 = TAIL + 0.3, 0.3
    for z in (-0.3, 0.3):
        a.tube((x0, 0.27, z), (x1, 0.27, z), 0.03, 0.03, M["mast"], 8, cap0=True, cap1=True)
        a.tube((x0, 0.13, z), (x1, 0.13, z), 0.03, 0.03, M["mast"], 8, cap0=True, cap1=True)
        n = 8
        for k in range(n):
            xa = x0 + (x1 - x0) * k / n
            xb = x0 + (x1 - x0) * (k + 1) / n
            lo, hi = (xa, 0.13, z), (xb, 0.27, z)
            if k % 2:
                lo, hi = (xb, 0.13, z), (xa, 0.27, z)
            a.tube(lo, hi, 0.014, 0.014, M["mast"], 5)
            a.tube((xb, 0.13, z), (xb, 0.27, z), 0.012, 0.012, M["mast"], 5)
    for k in range(9):
        x = x0 + (x1 - x0) * k / 8
        a.tube((x, 0.2, -0.3), (x, 0.2, 0.3), 0.013, 0.013, M["mast"], 5)
    # Walkway: a grating plate with its bars, hand rails on posts and toe boards.
    a.box((-TAIL - 0.9, 0.03, 0.52), ((TAIL + 0.9) / 2 - 0.3, 0.29, 0), M["steel"])
    for k in range(14):
        a.box((0.02, 0.012, 0.5), (TAIL + 0.45 + k * 0.145 - 0.0, 0.312, 0), M["dark"])
    for s in (-1, 1):
        z = s * 0.29
        a.tube((TAIL + 0.35, 0.86, z), (x1 - 0.5, 0.86, z), 0.014, 0.014, M["mast"], 6)
        a.tube((TAIL + 0.35, 0.58, z), (x1 - 0.5, 0.58, z), 0.011, 0.011, M["mast"], 5)
        a.box((-TAIL - 1.1, 0.09, 0.015), ((TAIL + 0.35 + x1 - 0.5) / 2, 0.36, z), M["mast"])
        for k in range(6):
            x = TAIL + 0.35 + (x1 - 0.5 - TAIL - 0.35) * k / 5
            a.tube((x, 0.3, z), (x, 0.86, z), 0.014, 0.014, M["mast"], 6)
    # The far rail closes the tail.
    a.tube((TAIL + 0.35, 0.86, -0.29), (TAIL + 0.35, 0.86, 0.29), 0.014, 0.014, M["mast"], 6)
    a.tube((TAIL + 0.35, 0.58, -0.29), (TAIL + 0.35, 0.58, 0.29), 0.011, 0.011, M["mast"], 5)


def jib(M):
    a = Acc()
    parts = []
    # The slewing ring: the moving race, its bolts and the turntable deck.
    parts.append(cyl("ring", 0.5, 0.14, (0, 0.05, 0), M["steel"], axis="y", verts=14, bev=0.02, seg=2))
    for i in range(16):
        ang = 2 * math.pi * i / 16 + 0.1
        a.disc((math.cos(ang) * 0.4, 0.13, math.sin(ang) * 0.4), 0.02, 0.03, M["dark"], "y", 6)
    a.disc((0, 0.16, 0), 0.32, 0.03, M["dark"], "y", 24)

    jib_frame(M, a)
    counter_jib(M, a)

    # The counterweights: three banded slabs with lifting eyes on top.
    for x in (TAIL + 0.2, TAIL + 0.55, TAIL + 0.9):
        parts.append(box("weight", (0.32, 0.72, 0.78), (x, 0.0, 0), M["weight"], bev=0.035, seg=3, cell=0.4))
        for y in (-0.22, 0.22):
            a.box((0.336, 0.04, 0.8), (x, y, 0), M["dark"])
        for z in (-0.22, 0.22):
            a.tube((x, 0.36, z - 0.05), (x, 0.44, z - 0.05), 0.013, 0.013, M["steel"], 6)
            a.tube((x, 0.36, z + 0.05), (x, 0.44, z + 0.05), 0.013, 0.013, M["steel"], 6)
            a.tube((x, 0.44, z - 0.05), (x, 0.44, z + 0.05), 0.013, 0.013, M["steel"], 6)
    # The winch: drum with flanges and rope wraps, its motor, brake and guard.
    parts.append(box("winch", (0.5, 0.3, 0.4), (-1.3, 0.44, 0), M["dark"], bev=0.03, seg=3))
    a.disc((-1.3, 0.66, 0), 0.13, 0.3, M["steel"], "z", 20)
    for z in (-0.16, 0.16):
        a.disc((-1.3, 0.66, z), 0.2, 0.025, M["dark"], "z", 20)
    for k in range(9):
        a.disc((-1.3, 0.66, -0.12 + k * 0.03), 0.145, 0.02, M["rope"], "z", 14, caps=(False, False))
    a.box((0.3, 0.24, 0.26), (-1.62, 0.5, 0.0), M["mast"])
    a.disc((-1.62, 0.5, 0.17), 0.09, 0.06, M["steel"], "z", 12)
    a.box((0.34, 0.03, 0.3), (-1.62, 0.63, 0), M["dark"])
    for i in range(4):
        a.box((0.02, 0.02, 0.2), (-1.7 + i * 0.05, 0.635, 0), M["steel"])
    # An electrical cabinet at the tail, with its door and hasp.
    a.box((0.34, 0.5, 0.26), (TAIL + 1.5, 0.56, -0.1), M["white"])
    a.box((0.02, 0.44, 0.02), (TAIL + 1.5 + 0.17, 0.56, -0.1), M["dark"])
    a.box((0.015, 0.04, 0.1), (TAIL + 1.5 + 0.18, 0.56, -0.02), M["steel"])

    # The cat head: four legs braced at two heights to a sheave cap; the
    # pendants run to the jib and the counter-jib through turnbuckles.
    apex = (0.0, 2.3, 0.0)
    legs = [(-0.28, -0.28), (0.28, -0.28), (0.28, 0.28), (-0.28, 0.28)]
    for x, z in legs:
        a.tube((x, 0.15, z), apex, 0.035, 0.03, M["mast"], 8)
        a.box((0.11, 0.05, 0.11), (x, 0.17, z), M["mast"])
    for level in (0.85, 1.55):
        s = 0.28 * (1 - (level - 0.15) / (2.3 - 0.15))
        ring = [(-s, -s), (s, -s), (s, s), (-s, s)]
        for i in range(4):
            (xa, za), (xb, zb) = ring[i], ring[(i + 1) % 4]
            a.tube((xa, level, za), (xb, level, zb), 0.016, 0.016, M["mast"], 6)
        for i in range(4):
            (xa, za), (xb, zb) = ring[i], ring[(i + 1) % 4]
            a.tube((xa, level - 0.35, za * 1.7), (xb, level, zb), 0.012, 0.012, M["mast"], 5)
    parts.append(box("catTop", (0.2, 0.16, 0.2), apex, M["dark"], bev=0.025, seg=3))
    a.disc((0, 2.42, 0), 0.075, 0.07, M["steel"], "z", 12)
    # Aviation lamp, lightning rod and an anemometer on the top.
    a.disc((0, 2.42, 0), 0.05, 0.1, M["lamp"], "y", 10, caps=(False, True))
    a.tube((0, 2.5, 0), (0, 2.82, 0), 0.008, 0.005, M["steel"], 5, cap1=True)
    a.tube((0.1, 2.5, 0), (0.1, 2.64, 0), 0.006, 0.006, M["steel"], 4)
    for i in range(3):
        ang = i * 2 * math.pi / 3
        a.tube((0.1, 2.64, 0), (0.1 + math.cos(ang) * 0.09, 2.64, math.sin(ang) * 0.09), 0.004, 0.004, M["steel"], 4)
        a.disc((0.1 + math.cos(ang) * 0.09, 2.64, math.sin(ang) * 0.09), 0.02, 0.03, M["steel"], "y", 6)
    for z in (-0.05, 0.05):
        for tip, name in (((5.0, 0.36, z), "tie"), (((TAIL + 0.3), 0.3, z), "tieBack")):
            a.tube((0, apex[1], z), tip, 0.014, 0.014, M["steel"], 6)
            mid = lerp((0, apex[1], z), tip, 0.5)
            a.box((0.16, 0.05, 0.05), mid, M["dark"])
            for t in (0.04, 0.96):
                p = lerp((0, apex[1], z), tip, t)
                a.box((0.06, 0.06, 0.04), p, M["dark"])

    # The cab on the ring's side, facing along the jib: a shell with framed
    # windows and a door, a roof unit, a step, a rail and a work lamp.
    cx, cy, cz = 0.25, -0.34, 0.58
    parts.append(box("cab", (0.7, 0.62, 0.62), (cx, cy, cz), M["white"], bev=0.045, seg=3))
    a.box((0.02, 0.4, 0.5), (cx + 0.355, cy + 0.04, cz), M["glass"])
    for z in (-0.2, 0.0, 0.2):
        pass
    for dz in (-0.25, 0.25):
        a.box((0.03, 0.44, 0.03), (cx + 0.36, cy + 0.04, cz + dz), M["dark"])
    for dy in (-0.18, 0.26):
        a.box((0.03, 0.03, 0.55), (cx + 0.36, cy + dy, cz), M["dark"])
    a.box((0.03, 0.03, 0.5), (cx + 0.36, cy + 0.04, cz), M["dark"])
    # Side windows and the door.
    a.box((0.46, 0.34, 0.015), (cx - 0.05, cy + 0.06, cz + 0.315), M["glass"])
    a.box((0.5, 0.03, 0.02), (cx - 0.05, cy + 0.24, cz + 0.32), M["dark"])
    a.box((0.5, 0.03, 0.02), (cx - 0.05, cy - 0.12, cz + 0.32), M["dark"])
    a.box((0.03, 0.4, 0.02), (cx - 0.05, cy + 0.06, cz + 0.32), M["dark"])
    a.box((0.46, 0.34, 0.015), (cx - 0.05, cy + 0.06, cz - 0.315), M["glass"])
    a.box((0.02, 0.5, 0.02), (cx - 0.33, cy, cz - 0.315), M["dark"])
    a.box((0.06, 0.02, 0.03), (cx - 0.28, cy - 0.02, cz - 0.33), M["steel"])
    parts.append(box("cabRoof", (0.76, 0.05, 0.68), (cx, cy + 0.335, cz), M["mast"], bev=0.012, seg=2))
    a.box((0.26, 0.09, 0.22), (cx - 0.12, cy + 0.41, cz), M["white"])
    for k in range(4):
        a.box((0.02, 0.06, 0.2), (cx - 0.22 + k * 0.06, cy + 0.42, cz), M["dark"])
    a.box((0.2, 0.014, 0.6), (cx + 0.42, cy + 0.34, cz), M["mast"])
    a.box((0.16, 0.06, 0.06), (cx + 0.4, cy + 0.3, cz + 0.25), M["dark"])
    a.box((0.05, 0.04, 0.5), (cx + 0.21, cy - 0.33, cz), M["steel"])
    a.box((0.3, 0.02, 0.1), (cx - 0.05, cy - 0.34, cz + 0.36), M["steel"])
    for dz in (0.05, 0.62):
        a.tube((cx - 0.2, cy - 0.32, cz + dz), (cx - 0.2, cy + 0.0, cz + dz), 0.011, 0.011, M["steel"], 5)
    a.tube((cx - 0.2, cy + 0.0, cz + 0.05), (cx - 0.2, cy + 0.0, cz + 0.62), 0.011, 0.011, M["steel"], 5)
    # A drive shaft-to-ring stair: two treads from the cab down to the walkway.

    # The trolley on the jib's lower chords: frame, four wheels, cable drum,
    # the four-fall hoist and the hook block with its hook.
    hx, hy, hz = HOOK
    parts.append(box("trolley", (0.5, 0.14, 0.56), (hx, LO - 0.1, 0), M["dark"], bev=0.02, seg=3))
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.disc((hx + sx * 0.17, LO - 0.02, sz * W), 0.055, 0.05, M["steel"], "z", 12)
            a.box((0.06, 0.1, 0.02), (hx + sx * 0.17, LO - 0.06, sz * (W + 0.03)), M["dark"])
    a.disc((hx, LO - 0.2, 0), 0.07, 0.4, M["steel"], "z", 12)
    for z in (-0.2, 0.2):
        a.disc((hx, LO - 0.2, z), 0.1, 0.02, M["dark"], "z", 12)
    top_y = LO - 0.17
    for dx in (-0.09, 0.09):
        for dz in (-0.07, 0.07):
            a.tube((hx + dx, top_y, dz), (hx + dx * 0.9, hy + 0.3, dz), 0.008, 0.008, M["rope"], 4)
    parts.append(box("block", (0.62, 0.5, 0.42), (hx, hy, 0), M["hook"], bev=0.05, seg=3))
    for dx in (-0.16, 0.16):
        a.disc((hx + dx, hy + 0.1, 0), 0.155, 0.36, M["dark"], "z", 16)
        a.disc((hx + dx, hy + 0.1, 0), 0.05, 0.4, M["steel"], "z", 8)
    a.box((0.66, 0.04, 0.46), (hx, hy + 0.25, 0), M["dark"])
    a.tube((hx, hy - 0.25, 0), (hx, hy - 0.42, 0), 0.05, 0.035, M["steel"], 10, cap0=True)
    # The hook: a shank, a swept bend and a tip, with its safety latch.
    pts = [(hx, hy - 0.42, 0)]
    for k in range(1, 11):
        t = k / 10 * math.pi * 1.15
        pts.append((hx + (1 - math.cos(t)) * 0.13 * 1.0, hy - 0.42 - math.sin(t) * 0.13 * 1.4 - 0.05 * min(1, k / 3), 0))
    a.polyline(pts, 0.032, M["steel"], sides=8)
    a.tube((hx + 0.02, hy - 0.5, 0), (hx + 0.2, hy - 0.62, 0), 0.008, 0.008, M["dark"], 4)
    return parts + a.objects("jibFittings")


def build():
    kit.reset()
    M = palette()
    tower = finish(mast(M) + [], "CraneMast")
    arm = finish(jib(M), "CraneJib")
    arm.location.z = JIB_Y
    kit.bake_ao([tower, arm], distance=0.6, floor=0.55)
    arm.location.z = 0
    return [tower, arm, marker("crane.hook", HOOK)]


def preview(n):
    import bpy

    objs = build()
    if n == 1:
        bpy.data.objects.remove(objs[0], do_unlink=True)
        objs[1].location.z = 3.2
        return objs[1:]
    objs[1].location.z = JIB_Y
    objs[1].rotation_euler.z = 0.5
    return objs
