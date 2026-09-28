"""
What the street incident scenes still drew from primitives (spike: Blender
assets vs procedural), modelled by script: the weeds through the tarmac, the
debris, the skid marks, the pothole and its spoil, the scorch patch and the
patches under every incident, the fire's tongues of flame, and the beacon's
mast. Every node's origin is on the ground (a flame's is its middle, as the
cone it replaces), and the scene places, turns and shades them:

  Weed0, Weed1, Weed2   small, middling and tall tufts (0.55, 0.8, 1.05 high)
  DebrisPlate, DebrisBumper, DebrisHub, DebrisGlass
                         the bits a collision leaves in the road
  SkidTile, SkidTail     0.85 m of tyre mark, and 0.85 m of one fading out
                         (+z end); a mark is laid from whole tiles
  Pothole                a dug hole with a broken rim, 0.78 across
  Spoil                  the heap dug out of it
  Scorch                 the burnt patch under a major incident, 2.8 across
  PatchSmall, PatchWide  the dark patch under every incident (1.8 and 3.1)
  FlameOuter, FlameInner the fire's flames, about a 3.4 and a 2.5 tall cone
  BeaconFoot, BeaconPole100, BeaconPole050, BeaconPole020, BeaconPole010,
  BeaconHead             a lamp mast in pieces: the foot, poles of 1.0, 0.5,
                         0.2 and 0.1 stacked to any height, and the head
                         (lamp cage and hood) at the mast's top

Colours are the procedural ones, so the scene shades them the same way.
"""

import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from helpers import (  # noqa: E402
    B, bake_spread, blob, kit, lathe, lp, open_box, plan_slab, rod, set_ao,
)
from kit import cyl, finish  # noqa: E402

SKID_TILE = 0.85
TUFTS = (0.55, 0.8, 1.05)
POLES = (1.0, 0.5, 0.2, 0.1)


def palette():
    m = kit.material
    M = {
        "weed": m("weed", "#7fa46a", "foliage", 0.85),
        "weedDry": m("weedDry", "#b3aa6c", "foliage", 0.9),
        "debris": m("debris", "#8c8880", "metal", 0.6, 0.2),
        "rubber": m("rubber", "#2c2d2e", "fabric", 0.9),
        "trim": m("trim", "#5b5f63", "metal", 0.5, 0.3),
        "glass": m("glass", "#9bb1b8", "glass", 0.15),
        "skid": m("skid", "#2e2f30", "concrete", 0.95),
        "skidRib": m("skid", "#2e2f30", "concrete", 0.95, tone=0.72),
        "hole": m("hole", "#33352f", "concrete", 1.0, tone=0.62),
        "rim": m("rim", "#33352f", "concrete", 0.95),
        "subgrade": m("subgrade", "#4a4740", "concrete", 1.0, tone=0.7),
        "spoil": m("spoil", "#4a4740", "concrete", 1.0),
        "stone": m("stone", "#6a6660", "stone", 0.9),
        "scorch": m("scorch", "#2b2724", "concrete", 1.0),
        "scorchMid": m("scorch", "#2b2724", "concrete", 1.0, tone=0.78),
        "scorchCore": m("scorch", "#2b2724", "concrete", 1.0, tone=0.55),
        "chip": m("chip", "#3a3532", "stone", 0.9),
        "patch": m("patch", "#ffffff", "concrete", 1.0, tone=0.94),
        "patchMid": m("patch", "#ffffff", "concrete", 1.0, tone=0.8),
        "patchCore": m("patch", "#ffffff", "concrete", 1.0, tone=0.66),
        "flameBase": m("flameBase", "#d8431a", "metal", 0.6),
        "flameMid": m("flameMid", "#f2803a", "metal", 0.6),
        "flameTop": m("flameTop", "#ffb347", "metal", 0.6),
        "coreBase": m("coreBase", "#ffa326", "metal", 0.6),
        "coreMid": m("coreMid", "#ffd66b", "metal", 0.6),
        "coreTop": m("coreTop", "#fff3b0", "metal", 0.6),
        "mast": m("mast", "#9aa0a0", "metal", 0.6, 0.25),
        "mastDark": m("mastDark", "#4a4f4f", "metal", 0.6, 0.3),
    }
    return M


# --- Weeds -----------------------------------------------------------------


def blade(name, base, lean, length, width, mat, segments=2):
    """A three-sided tapering blade from `base`, leaning towards `lean` (an
    app xz direction), curving over as it grows."""
    bx, bz = base
    lx, lz = lean
    n = math.hypot(lx, lz) or 1.0
    lx, lz = lx / n, lz / n
    bm = bmesh.new()
    rings = []
    stations = [(0.0, width, 0.0)] + ([(0.55, width * 0.7, 0.16)] if segments == 2 else [])
    for t, r, bend in stations:
        cx = bx + lx * length * bend
        cz = bz + lz * length * bend
        cy = length * t * (1 - 0.15 * bend)
        rings.append([
            bm.verts.new(B((cx + math.cos(a) * r, cy, cz + math.sin(a) * r)))
            for a in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)
        ])
    tip = bm.verts.new(B((bx + lx * length * 0.42, length, bz + lz * length * 0.42)))
    for a, b in zip(rings, rings[1:]):
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for i in range(3):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % 3], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._object(name, bm, mat)


def tuft(M, index, seed):
    rng = random.Random(seed)
    height = TUFTS[index]
    count = (6, 7, 8)[index]
    parts = []
    for i in range(count):
        a = 2 * math.pi * (i + rng.random() * 0.6) / count
        r0 = 0.02 + rng.random() * 0.09
        length = height * (0.55 + 0.45 * (1 if i == 0 else rng.random()))
        mat = M["weedDry"] if i % 4 == 3 else M["weed"]
        parts.append(blade("blade", (math.cos(a) * r0, math.sin(a) * r0),
                           (math.cos(a) * (1 + rng.random()), math.sin(a) * (1 + rng.random())),
                           length, 0.03 + 0.012 * index, mat, segments=1 if index == 0 else 2))
    return finish(parts, f"Weed{index}")


# --- Debris ----------------------------------------------------------------


def debris(M):
    out = []
    # A bent body panel: two slabs at an angle, torn edge.
    out.append(finish([
        open_box("panelA", (0.3, 0.02, 0.2), (-0.05, 0.03, 0), M["debris"], drop=("bottom",), rot=(0, 0.2, 0.18)),
        open_box("panelB", (0.2, 0.02, 0.13), (0.14, 0.065, 0.04), M["debris"], drop=("bottom",), rot=(0.1, 0.5, -0.35)),
        open_box("torn", (0.06, 0.012, 0.05), (-0.22, 0.02, -0.07), M["trim"], drop=("bottom",), rot=(0, 0.6, 0.1)),
    ], "DebrisPlate"))
    # A bumper's broken end: an arc of three bars and a bracket.
    out.append(finish([
        rod("barA", (-0.2, 0.05, -0.02), (-0.04, 0.05, 0.06), 0.06, 0.06, M["debris"], ends=True),
        rod("barB", (-0.04, 0.05, 0.06), (0.14, 0.05, 0.05), 0.06, 0.06, M["debris"], ends=True),
        rod("barC", (0.14, 0.05, 0.05), (0.24, 0.05, -0.05), 0.05, 0.05, M["debris"], ends=True),
        open_box("bracket", (0.04, 0.07, 0.1), (0.0, 0.035, -0.02), M["trim"], drop=("bottom",)),
    ], "DebrisBumper"))
    # A hub cap, on its back.
    out.append(finish([
        cyl("cap", 0.13, 0.04, (0, 0.03, 0), M["trim"], axis="y", verts=8, radius2=0.11),
        cyl("centre", 0.04, 0.03, (0, 0.06, 0), M["debris"], axis="y", verts=6),
        open_box("tyre", (0.05, 0.05, 0.16), (0.16, 0.03, 0.02), M["rubber"], drop=("bottom",), rot=(0, 0.7, 0)),
    ], "DebrisHub"))
    # Windscreen glass: a scatter of small shards.
    shards = []
    for i, (x, z, s, a) in enumerate(((0, 0, 0.13, 0.3), (0.16, 0.07, 0.09, 1.2), (-0.13, 0.1, 0.1, 2.2), (0.05, -0.15, 0.08, 0.7), (-0.15, -0.08, 0.06, 1.8))):
        pts = [(x + math.cos(a + k * 2.1) * s * (1 - 0.25 * (k == 1)), 0.008, z + math.sin(a + k * 2.1) * s) for k in range(3)]
        shards.append(open_box(f"shard{i}", (s, 0.008, s * 0.7), (x, 0.004, z), M["glass"], drop=("bottom", "left", "right", "front", "back"), rot=(0, a, 0)))
    out.append(finish(shards, "DebrisGlass"))
    return out


# --- Skid marks ------------------------------------------------------------


def skid(M):
    tile = finish([
        open_box("mark", (0.16, 0.014, SKID_TILE), (0, 0.007, 0), M["skid"], drop=("bottom", "front", "back")),
        open_box("ribA", (0.03, 0.006, SKID_TILE - 0.1), (-0.045, 0.017, 0), M["skidRib"], drop=("bottom", "front", "back")),
        open_box("ribB", (0.03, 0.006, SKID_TILE - 0.1), (0.045, 0.017, 0), M["skidRib"], drop=("bottom", "front", "back")),
    ], "SkidTile")
    dashes = []
    at = -SKID_TILE / 2
    for w, length in ((0.16, 0.38), (0.13, 0.21), (0.09, 0.1)):
        dashes.append(open_box("dash", (w, 0.014, length), (0, 0.007, at + length / 2), M["skid"], drop=("bottom", "front", "back")))
        at += length + 0.05
    return [tile, finish(dashes, "SkidTail")]


# --- Pothole, spoil, scorch, patches ---------------------------------------


def ragged(rng, count, r0, r1, turn=0.0):
    """A closed outline of `count` corners between radii r0 and r1, in app (x, z)."""
    return [(math.cos(turn + 2 * math.pi * i / count) * (r0 + (r1 - r0) * rng.random()),
             math.sin(turn + 2 * math.pi * i / count) * (r0 + (r1 - r0) * rng.random())) for i in range(count)]


def pothole(M):
    rng = random.Random(4)
    parts = [plan_slab("floor", ragged(rng, 9, 0.5, 0.66), 0.0, 0.02, M["hole"])]
    for i in range(9):
        a0 = 2 * math.pi * i / 9 + 0.1
        a1 = a0 + 2 * math.pi / 9 * 1.12
        ri = 0.6 + rng.random() * 0.06
        ro = 0.74 + rng.random() * 0.05
        pts = [(math.cos(a0) * ri, math.sin(a0) * ri), (math.cos(a0) * ro, math.sin(a0) * ro),
               (math.cos((a0 + a1) / 2) * (ro + 0.02), math.sin((a0 + a1) / 2) * (ro + 0.02)),
               (math.cos(a1) * ro, math.sin(a1) * ro), (math.cos(a1) * ri, math.sin(a1) * ri)]
        parts.append(plan_slab("chunk", pts, 0.0, 0.05 + rng.random() * 0.04, M["rim"] if i % 3 else M["subgrade"]))
    return finish(parts, "Pothole")


def spoil(M):
    parts = [
        blob("heapA", 0.5, (0, 0.1, 0), M["spoil"], scale=(1, 0.55, 1), wobble=0.12, seed=1.3, bottom=False),
        blob("heapB", 0.3, (0.38, 0.05, 0.22), M["spoil"], scale=(1, 0.6, 1), wobble=0.12, seed=4.1, bottom=False),
    ]
    for x, z, s, a in ((-0.2, 0.3, 0.14, 0.4), (0.42, -0.24, 0.12, 1.9), (0.0, -0.42, 0.1, 0.9), (-0.44, -0.1, 0.11, 2.6)):
        parts.append(open_box("stone", (s, s * 0.7, s * 1.2), (x, s * 0.35, z), M["stone"], rot=(0.1, a, 0.15)))
    return finish(parts, "Spoil")


def scorch(M):
    rng = random.Random(9)
    parts = [
        plan_slab("edge", ragged(rng, 15, 2.35, 2.85), 0.0, 0.028, M["scorch"]),
        plan_slab("char", ragged(rng, 12, 1.65, 2.15, 0.2), 0.028, 0.044, M["scorchMid"]),
        plan_slab("core", ragged(rng, 9, 0.8, 1.25, 0.5), 0.044, 0.056, M["scorchCore"]),
    ]
    for i in range(7):
        a = 2 * math.pi * i / 7 + rng.random() * 0.4
        r = 1.5 + rng.random() * 1.1
        s = 0.12 + rng.random() * 0.1
        parts.append(open_box("chip", (s, s * 0.4, s * 1.3), (math.cos(a) * r, 0.03 + s * 0.15, math.sin(a) * r),
                              M["chip"], rot=(0.1, a * 2.1, 0.1)))
    return finish(parts, "Scorch")


def patch(M, radius, name, seed):
    rng = random.Random(seed)
    n = 20
    parts = [
        plan_slab("stain", ragged(rng, n, radius * 0.84, radius), 0.0, 0.008, M["patch"]),
        plan_slab("wet", ragged(rng, 16, radius * 0.55, radius * 0.72, 0.3), 0.008, 0.016, M["patchMid"]),
    ]
    if radius > 2:
        parts.append(plan_slab("core", ragged(rng, 12, radius * 0.28, radius * 0.4, 0.5), 0.016, 0.024, M["patchCore"]))
    return finish(parts, name)


# --- Flames ----------------------------------------------------------------


def tongue(name, base, radius, tip, mats, sides=5, levels=3, sway=0.0, turn=0.0):
    """A flame tongue from a base ring at `base` (app x, y, z) up to `tip`:
    rings narrowing and drifting towards the tip's side, `sway` bending it."""
    bx, by, bz = base
    tx, ty, tz = tip
    rings = []
    for k in range(levels):
        t = k / levels
        shrink = (1 - t) ** 0.7 * (1 - 0.12 * t)
        bend = t ** 1.6
        rings.append((by + (ty - by) * t, radius * shrink, radius * shrink,
                      bx + (tx - bx) * bend + sway * math.sin(t * 3.0), bz + (tz - bz) * bend))
    return lathe(name, rings, mats[0], sides=sides, mats=[mats[min(k, len(mats) - 1)] for k in range(levels)], turn=turn, tip=tip)


def flame_outer(M):
    lows = [M["flameBase"], M["flameMid"], M["flameMid"], M["flameTop"]]
    parts = [tongue("main", (0, -1.7, 0), 0.78, (0.03, 1.7, -0.02), lows, sides=6, levels=4, sway=0.06)]
    rng = random.Random(3)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.35
        cx, cz = math.cos(a) * 0.5, math.sin(a) * 0.5
        height = 0.1 + 0.9 * rng.random()
        lean = 0.3 + 0.2 * rng.random()
        parts.append(tongue(f"lick{k}", (cx, -1.7, cz), 0.34 + 0.06 * rng.random(),
                            (cx + math.cos(a) * lean, height - 0.4, cz + math.sin(a) * lean),
                            [M["flameBase"], M["flameMid"], M["flameTop"]], sides=5, levels=3, turn=a))
    return finish(parts, "FlameOuter")


def flame_inner(M):
    lows = [M["coreBase"], M["coreMid"], M["coreMid"], M["coreTop"]]
    parts = [tongue("main", (0, -1.25, 0), 0.6, (-0.02, 1.25, 0.03), lows, sides=6, levels=4, sway=-0.05, turn=0.3)]
    for k in range(3):
        a = 2 * math.pi * k / 3 + 1.0
        cx, cz = math.cos(a) * 0.34, math.sin(a) * 0.34
        parts.append(tongue(f"lick{k}", (cx, -1.25, cz), 0.26, (cx + math.cos(a) * 0.15, -0.1 + 0.3 * k, cz + math.sin(a) * 0.15),
                            [M["coreBase"], M["coreMid"], M["coreTop"]], sides=5, levels=3, turn=a))
    return finish(parts, "FlameInner")


# --- Beacon ----------------------------------------------------------------

MAST_R = 0.1


def beacon(M):
    out = []
    out.append(finish([
        open_box("plate", (0.5, 0.06, 0.5), (0, 0.03, 0), M["mastDark"], drop=("bottom",)),
        cyl("collar", 0.24, 0.24, (0, 0.18, 0), M["mast"], axis="y", verts=8, radius2=MAST_R * 1.25),
    ], "BeaconFoot"))
    for length in POLES:
        parts = [lp.tube("pole", (0, 0, 0), (0, length, 0), MAST_R * 1.15, MAST_R * 1.15, M["mast"], sides=6)]
        if length >= 0.5:
            parts.append(lp.tube("cuff", (0, length - 0.06, 0), (0, length, 0), MAST_R * 1.45, MAST_R * 1.45, M["mastDark"], sides=6))
        out.append(finish(parts, f"BeaconPole{round(length * 100):03d}"))
    head = [
        cyl("mount", 0.13, 0.08, (0, 0.04, 0), M["mastDark"], axis="y", verts=6),
        cyl("seat", 0.3, 0.03, (0, 0.095, 0), M["mastDark"], axis="y", verts=8),
        cyl("crown", 0.34, 0.03, (0, 0.435, 0), M["mastDark"], axis="y", verts=8),
    ]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        head.append(open_box("cage", (0.035, 0.31, 0.035), (math.cos(a) * 0.33, 0.265, math.sin(a) * 0.33), M["mast"], drop=("bottom",)))
    for s in (-1, 1):
        head.append(open_box("strut", (0.05, 0.13, 0.05), (s * 0.22, 0.5, 0), M["mastDark"], drop=("bottom",)))
    head.append(open_box("hood", (0.7, 0.12, 0.42), (0, 0.62, 0), M["mast"], drop=("bottom",)))
    head.append(open_box("visor", (0.7, 0.03, 0.12), (0, 0.575, 0.27), M["mastDark"], drop=("bottom",), rot=(-0.4, 0, 0)))
    out.append(finish(head, "BeaconHead"))
    return out


def build():
    kit.reset()
    M = palette()
    objs = [tuft(M, i, 11 + i * 5) for i in range(3)]
    objs += debris(M)
    objs += skid(M)
    objs += [pothole(M), spoil(M), scorch(M), patch(M, 1.8, "PatchSmall", 2), patch(M, 3.1, "PatchWide", 5)]
    objs += beacon(M)
    bake_spread(objs, gap=1.0, floor=0.55)
    # The tufts darken towards the ground, where the blades crowd.
    for i, obj in enumerate(objs[:3]):
        h = TUFTS[i]
        set_ao(obj, lambda y, x, z, old, h=h: old * (0.6 + 0.4 * min(1.0, y / h)))
    # Flames are unlit: no occlusion in them, and they are made last so the
    # bake never sees them.
    return objs + [flame_outer(M), flame_inner(M)]


def preview(n):
    """0: weeds and debris; 1: skids, pothole, spoil and patches; 2: scorch and
    the flames; 3: the beacon's pieces stacked to 4.2."""
    objs = build()
    by = {o.name: o for o in objs}
    names = {
        0: ["Weed0", "Weed1", "Weed2", "DebrisPlate", "DebrisBumper", "DebrisHub", "DebrisGlass"],
        1: ["SkidTile", "SkidTail", "Pothole", "Spoil", "PatchSmall"],
        2: ["Scorch", "FlameOuter", "FlameInner"],
        3: ["BeaconFoot", "BeaconPole100", "BeaconPole050", "BeaconPole020", "BeaconPole010", "BeaconHead"],
    }[n]
    keep = [by[k] for k in names]
    for o in objs:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    if n == 3:
        y = 0.0
        for o in keep:
            o.location.z = y
            y += {"BeaconFoot": 0.0, "BeaconPole100": 1.0, "BeaconPole050": 0.5, "BeaconPole020": 0.2, "BeaconPole010": 0.1}.get(o.name, 0.0)
        return keep
    x = 0.0
    for o in keep:
        xs = [c[0] for c in o.bound_box]
        o.location.x = x - min(xs)
        x += max(xs) - min(xs) + 0.6
        if o.name.startswith("Flame"):
            o.location.z = 1.7 if o.name == "FlameOuter" else 1.25
    return keep
