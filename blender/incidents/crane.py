"""
The construction site's tower crane, modelled by script (spike: Blender
assets vs procedural).

The same two pieces `constructionDecor.ts` builds and `ConstructionSite.tsx`
draws: a mast standing on its concrete base, and a jib the site turns about
the mast's top, `JIB_Y` up. Both keep their origin at 0: the mast's on the
ground under its centre, the jib's on the slewing ring (the site lifts it).
The hook hangs where the procedural one does, `HOOK` in the jib's frame.

  CraneMast   base, lattice tower, the fixed half of the slewing ring
  CraneJib    ring, cat head, jib, counter-jib with its weights, the cab,
              the trolley, the lines and the hook
  crane.hook  the hook block's centre, in the jib's frame

Colours are the procedural ones (`#e0b750` steel, the hook in warning
orange); the site paints the steel rust on an abandoned site.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import kit  # noqa: E402
from kit import box, cyl, finish, marker, strut  # noqa: E402

JIB_Y = 12.6
HALF = 0.3  # the mast's chords stand at +-HALF
HOOK = (5.4, -3.0, 0.0)
TIP, TAIL = 7.3, -3.0


def palette():
    m = kit.material
    return {
        "mast": m("mast", "#e0b750", "metal", 0.5, 0.15),
        "base": m("base", "#cfcabd", "concrete", 0.85),
        "weight": m("weight", "#b9b4a8", "concrete", 0.85),
        "dark": m("dark", "#3a3d42", "metal", 0.6),
        "steel": m("steel", "#6f7270", "metal", 0.45, 0.3),
        "glass": m("glass", "#516779", "glass", 0.15),
        "hook": m("hook", "#e8853c", "metal", 0.5),
        "white": m("cabin", "#eeece6", "metal", 0.5),
    }


def lattice_face(a0, a1, b0, b1, steps, thick, mat, name="brace"):
    """Zigzag bracing between two parallel chords, a0->a1 and b0->b1."""
    parts = []
    lerp = lambda p, q, t: tuple(p[i] + (q[i] - p[i]) * t for i in range(3))  # noqa: E731
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        if i % 2 == 0:
            parts.append(strut(name, lerp(a0, a1, t0), lerp(b0, b1, t1), thick, mat))
        else:
            parts.append(strut(name, lerp(b0, b1, t0), lerp(a0, a1, t1), thick, mat))
    return parts


def mast(M):
    parts = [
        box("base", (2.4, 0.6, 2.4), (0, 0.3, 0), M["base"], bev=0.05, cell=0.8),
        box("plinth", (0.9, 0.12, 0.9), (0, 0.66, 0), M["dark"], bev=0.02),
    ]
    y0, y1 = 0.7, JIB_Y - 0.2
    corners = [(-HALF, -HALF), (HALF, -HALF), (HALF, HALF), (-HALF, HALF)]
    for x, z in corners:
        parts.append(box("chord", (0.1, y1 - y0, 0.1), (x, (y0 + y1) / 2, z), M["mast"], bev=0.0))
    # Each face zigzags between its two chords; a frame every third of it.
    thick = (0.05, 0.05)
    for i in range(4):
        (xa, za), (xb, zb) = corners[i], corners[(i + 1) % 4]
        parts += lattice_face((xa, y0, za), (xa, y1, za), (xb, y0, zb), (xb, y1, zb), 8, thick, M["mast"])
    for y in (y0 + 0.1, 4.6, 8.5, y1):
        parts.append(box("frame", (2 * HALF + 0.12, 0.08, 2 * HALF + 0.12), (0, y, 0), M["mast"], bev=0.0))
    # The fixed half of the slewing ring.
    parts.append(box("slewSeat", (0.9, 0.2, 0.9), (0, JIB_Y - 0.12, 0), M["dark"], bev=0.03))
    return parts


def jib(M):
    """In the jib's frame: y = 0 on the ring, x out along the jib."""
    parts = [cyl("ring", 0.5, 0.14, (0, 0.05, 0), M["steel"], axis="y", verts=14, bev=0.02)]
    # The jib: a triangular section, two bottom chords and a top one.
    lo, hi, w = 0.12, 0.62, 0.24
    left0, left1 = (0.3, lo, -w), (TIP, lo, -w)
    right0, right1 = (0.3, lo, w), (TIP, lo, w)
    top0, top1 = (0.3, hi, 0), (TIP - 0.4, lo + 0.1, 0)
    for a, b in ((left0, left1), (right0, right1)):
        parts.append(strut("chord", a, b, (0.08, 0.08), M["mast"]))
    parts.append(strut("topChord", top0, top1, (0.07, 0.07), M["mast"]))
    thick = (0.04, 0.04)
    parts += lattice_face(left0, left1, top0, top1, 9, thick, M["mast"])
    parts += lattice_face(right0, right1, top0, top1, 9, thick, M["mast"])
    for i in range(6):
        x = 0.3 + (TIP - 0.3) * (i + 0.5) / 6
        parts.append(box("rung", (0.04, 0.04, 2 * w), (x, lo, 0), M["mast"], bev=0.0))
    parts.append(box("tipCap", (0.12, 0.26, 2 * w + 0.08), (TIP, lo + 0.08, 0), M["mast"], bev=0.0))

    # The counter-jib: two flat girders, a walkway and the concrete weights.
    for z in (-0.3, 0.3):
        parts.append(box("counterGirder", (-TAIL + 0.3, 0.14, 0.08), ((TAIL + 0.3) / 2, 0.2, z), M["mast"], bev=0.0))
    parts.append(box("walk", (-TAIL - 0.9, 0.03, 0.52), ((TAIL + 0.9) / 2 - 0.3, 0.28, 0), M["steel"], bev=0.0))
    for i, x in enumerate((TAIL + 0.2, TAIL + 0.55, TAIL + 0.9)):
        parts.append(box("weight", (0.32, 0.72, 0.78), (x, 0.0, 0), M["weight"], bev=0.03))
    parts.append(box("winch", (0.5, 0.3, 0.4), (-1.3, 0.44, 0), M["dark"], bev=0.03))
    parts.append(cyl("drum", 0.13, 0.36, (-1.3, 0.62, 0), M["steel"], axis="z", verts=10))

    # The cat head over the ring, and its ties out to both ends.
    apex = (0.0, 2.3, 0.0)
    for x, z in ((-0.28, -0.28), (0.28, -0.28), (0.28, 0.28), (-0.28, 0.28)):
        parts.append(strut("catLeg", (x, 0.15, z), apex, (0.07, 0.07), M["mast"]))
    parts.append(box("catTop", (0.18, 0.14, 0.18), apex, M["dark"], bev=0.02))
    for z in (-0.05, 0.05):
        parts.append(strut("tie", (0, apex[1], z), (5.0, 0.36, z), (0.025, 0.025), M["steel"]))
        parts.append(strut("tieBack", (0, apex[1], z), (TAIL + 0.3, 0.3, z), (0.025, 0.025), M["steel"]))

    # The cab on the ring's side, facing out along the jib.
    parts.append(box("cab", (0.7, 0.62, 0.62), (0.25, -0.34, 0.58), M["white"], bev=0.04))
    parts.append(box("cabGlass", (0.02, 0.36, 0.5), (0.61, -0.3, 0.58), M["glass"], bev=0.0))
    parts.append(box("cabSide", (0.44, 0.3, 0.02), (0.26, -0.28, 0.9), M["glass"], bev=0.0))
    parts.append(box("cabRoof", (0.76, 0.05, 0.68), (0.25, -0.01, 0.58), M["mast"], bev=0.0))

    # The trolley under the jib, its lines and the hook block.
    hx, hy, hz = HOOK
    parts.append(box("trolley", (0.5, 0.14, 0.56), (hx, lo - 0.1, 0), M["dark"], bev=0.02))
    for dz in (-0.07, 0.07):
        parts.append(box("line", (0.02, lo - 0.17 - (hy + 0.25), 0.02), (hx, (lo - 0.17 + hy + 0.25) / 2, dz), M["dark"], bev=0.0))
    parts.append(box("block", (0.62, 0.5, 0.42), (hx, hy, 0), M["hook"], bev=0.05))
    parts.append(cyl("sheave", 0.16, 0.44, (hx, hy + 0.06, 0), M["dark"], axis="z", verts=10))
    parts.append(box("shank", (0.06, 0.22, 0.06), (hx, hy - 0.34, 0), M["steel"], bev=0.0))
    parts.append(cyl("hook", 0.12, 0.05, (hx + 0.05, hy - 0.48, 0), M["steel"], axis="z", verts=8))
    return parts


def build():
    kit.reset()
    M = palette()
    tower = finish(mast(M), "CraneMast")
    arm = finish(jib(M), "CraneJib")
    # Baked where they stand, the jib on the mast, then the jib's node set
    # back on its own origin: the site lifts it to `JIB_Y`.
    arm.location.z = JIB_Y
    kit.bake_ao([tower, arm], distance=0.6, floor=0.55)
    arm.location.z = 0
    return [tower, arm, marker("crane.hook", HOOK)]


def preview(n):
    """0: the crane standing; 1: the jib alone near the ground, to look at."""
    import bpy

    objs = build()
    if n == 1:
        bpy.data.objects.remove(objs[0], do_unlink=True)
        objs[1].location.z = 3.2
        return objs[1:]
    objs[1].location.z = JIB_Y
    objs[1].rotation_euler.z = 0.5
    return objs
