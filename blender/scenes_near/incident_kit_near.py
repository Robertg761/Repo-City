"""
What the street incidents lay on the tarmac, NEAR level (`incident-kit.glb`'s
detailed twin): weeds, debris, skid marks, the pothole and its spoil and the
scorch patch, on the lean nodes' frames and footprints
(`blender/incidents2/incident_kit.py`), plus three pieces of dressing that
only a near camera sees:

  HoseLine   2.0 m of flat-laid fire hose along +z, a brass coupling at each end
  HoseCoil   a hose flaked in a coil, its coupling on top
  TapeSpan   1.0 m of hazard tape along +x, sagging, striped red and white; the
             scene turns it and scales its length to run between two posts

The tufts get three times the blades (with seed heads), the tread of a skid
mark shows, the pothole has a crumbling rim, exposed aggregate and cracks,
the spoil is clods, the scorch is charred lumps.

    blender -b --python blender/export.py -- blender/scenes_near/incident_kit_near.py incident-kit-near
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import incident_kit as lean  # noqa: E402
import kit  # noqa: E402
from helpers import B, bake_spread, blob, lathe, open_box, plan_slab, rod, set_ao  # noqa: E402
from kit import cyl, finish  # noqa: E402
from kit_near import Acc  # noqa: E402

TUFTS, SKID_TILE = lean.TUFTS, lean.SKID_TILE


def palette():
    M = lean.palette()
    m = kit.material
    M["hose"] = m("hose", "#c9b98a", "fabric", 0.85)
    M["hoseDark"] = m("hose", "#c9b98a", "fabric", 0.85, tone=0.72)
    M["brass"] = m("brass", "#b08d3c", "metal", 0.35, 0.7)
    M["tapeRed"] = m("tapeRed", "#d8362c", "fabric", 0.6)
    M["tapeWhite"] = m("tapeWhite", "#eeeae0", "fabric", 0.6)
    M["seed"] = m("weedDry", "#b3aa6c", "foliage", 0.9)
    M["puddle"] = m("puddle", "#4a5a63", "glass", 0.1)
    M["aggregate"] = m("stone", "#6a6660", "stone", 0.9)
    M["aggregate2"] = m("stone", "#6a6660", "stone", 0.9, tone=0.75)
    M["clod"] = m("spoil", "#4a4740", "concrete", 1.0, tone=0.85)
    return M


# --- weeds -----------------------------------------------------------------


def tuft(M, index, seed):
    rng = random.Random(seed)
    height = TUFTS[index]
    count = (14, 18, 22)[index]
    parts = []
    for i in range(count):
        a = 2 * math.pi * (i + rng.random() * 0.7) / count
        r0 = 0.02 + rng.random() * 0.11
        length = height * (0.5 + 0.5 * (1 if i == 0 else rng.random()))
        mat = M["weedDry"] if i % 4 == 3 else M["weed"]
        parts.append(lean.blade("blade", (math.cos(a) * r0, math.sin(a) * r0),
                                (math.cos(a) * (1 + rng.random()), math.sin(a) * (1 + rng.random())),
                                length, 0.028 + 0.012 * index, mat, segments=2))
    # A few stems with seed heads standing above the blades.
    acc = Acc()
    for i in range(index + 1):
        a = rng.random() * 6.28
        x, z = math.cos(a) * 0.06, math.sin(a) * 0.06
        top = height * 1.05
        acc.tube((x, 0, z), (x + math.cos(a) * 0.05, top, z + math.sin(a) * 0.05), 0.006, 0.004, M["weedDry"], 4)
        acc.tube((x + math.cos(a) * 0.05, top - 0.05, z + math.sin(a) * 0.05),
                 (x + math.cos(a) * 0.06, top + 0.08, z + math.sin(a) * 0.06), 0.014, 0.004, M["seed"], 5, cap1=True)
    return finish(parts + acc.objects("seeds"), f"Weed{index}")


# --- debris ----------------------------------------------------------------


def debris(M):
    """The four pieces a collision leaves, each with the lean piece's outline
    and more of what such a piece has: a folded panel with a torn edge and
    rivet holes, a bumper's round bars and brackets, a hub cap with its spokes
    beside a tyre's tread, a scatter of glass crazed into shards."""
    out = []
    a = Acc()
    # A bent body panel: two slabs at a fold, a crumpled corner and a rib.
    a.box((0.3, 0.02, 0.2), (-0.05, 0.03, 0), M["debris"], rot=(0, 0.2, 0.18), drop=("bottom",))
    a.box((0.2, 0.02, 0.13), (0.14, 0.065, 0.04), M["debris"], rot=(0.1, 0.5, -0.35), drop=("bottom",))
    a.box((0.3, 0.012, 0.02), (-0.05, 0.05, 0.05), M["trim"], rot=(0, 0.2, 0.18))
    a.box((0.18, 0.012, 0.02), (0.13, 0.085, 0.05), M["trim"], rot=(0.1, 0.5, -0.35))
    for k in range(4):
        a.hexnut((-0.16 + k * 0.07, 0.048, -0.05 + 0.02 * k), 0.012, 0.01, M["trim"], "y")
    for k in range(4):
        a.box((0.05 + 0.01 * k, 0.014, 0.035), (-0.22 + k * 0.03, 0.02, -0.07 - 0.02 * (k % 2)), M["trim"], rot=(0, 0.6 + k, 0.1))
    out.append(finish(a.objects("plate"), "DebrisPlate"))
    # A bumper's broken end: an arc of round bars with a bracket and bolts.
    a = Acc()
    pts = [(-0.2, 0.05, -0.02), (-0.12, 0.05, 0.03), (-0.04, 0.05, 0.06), (0.05, 0.05, 0.065), (0.14, 0.05, 0.05), (0.2, 0.05, 0.0), (0.24, 0.05, -0.05)]
    a.polyline(pts, 0.03, M["debris"], sides=8)
    a.box((0.04, 0.07, 0.1), (0.0, 0.035, -0.02), M["trim"])
    for x in (-0.03, 0.03):
        a.hexnut((x, 0.072, -0.02), 0.012, 0.012, M["trim"], "y")
    a.box((0.05, 0.02, 0.04), (0.24, 0.02, -0.05), M["trim"], rot=(0, 0.5, 0))
    out.append(finish(a.objects("bumper"), "DebrisBumper"))
    # A hub cap on its back, a lug nut or two, and a tyre's tread beside it.
    a = Acc()
    a.disc((0, 0.03, 0), 0.13, 0.04, M["trim"], "y", 16, radius2=0.11)
    a.disc((0, 0.06, 0), 0.04, 0.03, M["debris"], "y", 8)
    for k in range(5):
        ang = 2 * math.pi * k / 5
        a.rod((math.cos(ang) * 0.04, 0.052, math.sin(ang) * 0.04), (math.cos(ang) * 0.11, 0.05, math.sin(ang) * 0.11), 0.018, 0.008, M["debris"], ends=True)
    a.hexnut((0.2, 0.022, -0.1), 0.02, 0.03, M["trim"], "y")
    a.sweep([(0.1 + 0.1 * math.cos(t), 0.028, 0.02 + 0.1 * math.sin(t)) for t in [k / 10 * math.pi * 0.8 for k in range(11)]], 0.028, M["rubber"], sides=8, squash=1.0)
    for k in range(6):
        t = k / 6 * math.pi * 0.8
        a.box((0.02, 0.02, 0.014), (0.1 + 0.115 * math.cos(t), 0.03, 0.02 + 0.115 * math.sin(t)), M["skid"], rot=(0, -t, 0))
    out.append(finish(a.objects("hub"), "DebrisHub"))
    # Windscreen glass: crazed shards, some standing on edge in the road.
    a = Acc()
    rng = random.Random(5)
    for k in range(16):
        x, z = rng.uniform(-0.2, 0.2), rng.uniform(-0.18, 0.18)
        s_ = rng.uniform(0.04, 0.12)
        a.box((s_, 0.008, s_ * 0.7), (x, 0.004 + (0.01 if k % 4 == 0 else 0), z), M["glass"], rot=(0.2 * (k % 3 == 0), rng.uniform(0, 3), 0.3 * (k % 4 == 0)), drop=("bottom",))
    out.append(finish(a.objects("glass"), "DebrisGlass"))
    return out


# --- skid marks --------------------------------------------------------------


def skid(M):
    a = Acc()
    parts = []
    # The mark: a base strip with a chevron tread pressed into it.
    a.box((0.16, 0.014, SKID_TILE), (0, 0.007, 0), M["skid"], drop=("bottom",))
    n = 12
    for k in range(n):
        z = -SKID_TILE / 2 + (k + 0.5) * SKID_TILE / n
        for s in (-1, 1):
            a.box((0.07, 0.006, 0.02), (s * 0.038, 0.017, z), M["skidRib"], rot=(0, s * 0.6, 0))
    a.box((0.012, 0.006, SKID_TILE - 0.04), (0, 0.017, 0), M["skidRib"])
    tile = finish(a.objects("tile"), "SkidTile")
    b = Acc()
    at = -SKID_TILE / 2
    for w, length in ((0.16, 0.38), (0.13, 0.21), (0.09, 0.1)):
        b.box((w, 0.014, length), (0, 0.007, at + length / 2), M["skid"], drop=("bottom",))
        m = max(2, int(length / 0.04))
        for k in range(m):
            z = at + (k + 0.5) * length / m
            for s in (-1, 1):
                b.box((w * 0.42, 0.006, 0.018), (s * w * 0.24, 0.017, z), M["skidRib"], rot=(0, s * 0.6, 0))
        at += length + 0.05
    return [tile, finish(b.objects("tail"), "SkidTail")]


# --- pothole, spoil, scorch ---------------------------------------------------


def pothole(M):
    rng = random.Random(4)
    a = Acc()
    ring = lean.ragged(rng, 12, 0.6, 0.68)
    parts = [plan_slab("floor", ring, 0.0, 0.02, M["hole"])]
    # A crumbling rim: sixteen chunks of varied height, some fallen in.
    for i in range(16):
        a0 = 2 * math.pi * i / 16 + 0.1
        a1 = a0 + 2 * math.pi / 16 * 1.15
        ri = 0.6 + rng.random() * 0.06
        ro = 0.74 + rng.random() * 0.07
        mid = (a0 + a1) / 2
        pts = [(math.cos(a0) * ri, math.sin(a0) * ri), (math.cos(a0) * ro, math.sin(a0) * ro),
               (math.cos(mid) * (ro + 0.03), math.sin(mid) * (ro + 0.03)),
               (math.cos(a1) * ro, math.sin(a1) * ro), (math.cos(a1) * ri, math.sin(a1) * ri)]
        parts.append(plan_slab("chunk", pts, 0.0, 0.045 + rng.random() * 0.05, M["rim"] if i % 3 else M["subgrade"]))
    # Aggregate exposed on the sides and floor, and the water that has collected.
    for i in range(26):
        ang = rng.random() * 6.28
        r = 0.05 + rng.random() * 0.5
        s = 0.02 + rng.random() * 0.035
        x, z = math.cos(ang) * r, math.sin(ang) * r
        a.slab([(x - s, z - s * 0.8), (x + s * 0.9, z - s), (x + s, z + s * 0.7), (x - s * 0.7, z + s)], 0.018, 0.018 + s * 0.9, M["aggregate"] if i % 2 else M["aggregate2"])
    a.slab([(-0.16, -0.08), (0.02, -0.16), (0.2, -0.05), (0.14, 0.13), (-0.08, 0.15)], 0.018, 0.021, M["puddle"])
    # Cracks radiating out through the tarmac.
    for i in range(6):
        ang = rng.random() * 6.28
        r0 = 0.78
        pts = [(math.cos(ang + 0.1 * k * (1 if k % 2 else -0.4)) * (r0 + k * 0.13), 0.004, math.sin(ang + 0.1 * k * (1 if k % 2 else -0.4)) * (r0 + k * 0.13)) for k in range(4)]
        for p0, p1 in zip(pts, pts[1:]):
            a.rod(p0, p1, 0.016 - 0.003 * pts.index(p0), 0.006, M["skid"], ends=False)
    return finish(parts + a.objects("holeFit"), "Pothole")


def spoil(M):
    a = Acc()
    parts = [
        blob("heapA", 0.5, (0, 0.1, 0), M["spoil"], scale=(1, 0.55, 1), wobble=0.14, seed=1.3, bottom=False, subdivisions=2),
        blob("heapB", 0.3, (0.38, 0.05, 0.22), M["spoil"], scale=(1, 0.6, 1), wobble=0.14, seed=4.1, bottom=False, subdivisions=2),
    ]
    rng = random.Random(8)
    for k in range(30):
        ang = rng.random() * 6.28
        r = 0.1 + rng.random() * 0.55
        s = 0.03 + rng.random() * 0.06
        x, z = math.cos(ang) * r, math.sin(ang) * r
        y = max(0.0, 0.32 - r * 0.45) + s * 0.4
        a.box((s * 1.3, s, s * 1.1), (x, y, z), M["clod"] if k % 3 else M["spoil"], rot=(rng.random(), rng.random() * 3, rng.random()))
    for x, z, s, ang in ((-0.2, 0.3, 0.14, 0.4), (0.42, -0.24, 0.12, 1.9), (0.0, -0.42, 0.1, 0.9), (-0.44, -0.1, 0.11, 2.6), (0.5, 0.35, 0.09, 0.2)):
        parts.append(kit.box("stone", (s, s * 0.7, s * 1.2), (x, s * 0.35, z), M["stone"], bev=0.012, seg=2, rot=(0.1, ang, 0.15)))
    return finish(parts + a.objects("spoilFit"), "Spoil")


def scorch(M):
    rng = random.Random(9)
    a = Acc()
    parts = [
        plan_slab("edge", lean.ragged(rng, 15, 2.35, 2.85), 0.0, 0.028, M["scorch"]),
        plan_slab("char", lean.ragged(rng, 12, 1.65, 2.15, 0.2), 0.028, 0.044, M["scorchMid"]),
        plan_slab("core", lean.ragged(rng, 9, 0.8, 1.25, 0.5), 0.044, 0.056, M["scorchCore"]),
    ]
    # Charred lumps and spalled chips scattered over the burn, and streaks of
    # soot running out from the middle.
    for i in range(34):
        ang = 2 * math.pi * i / 34 + rng.random() * 0.3
        r = 0.4 + rng.random() * 2.2
        s = 0.06 + rng.random() * 0.12
        a.box((s, s * 0.45, s * 1.3), (math.cos(ang) * r, 0.03 + s * 0.15 + (0.03 if r < 1.6 else 0), math.sin(ang) * r),
              M["chip"] if i % 2 else M["scorchCore"], rot=(0.1, ang * 2.1, 0.1))
    for i in range(9):
        ang = 2 * math.pi * i / 9 + 0.2
        a.rod((math.cos(ang) * 1.0, 0.058, math.sin(ang) * 1.0), (math.cos(ang) * 2.1, 0.05, math.sin(ang) * 2.1), 0.05, 0.006, M["scorchCore"], ends=False)
    return finish(parts + a.objects("scorchFit"), "Scorch")


# --- new dressing ---------------------------------------------------------


def hose_line(M):
    """Flat-laid hose along +z, 2 m: a wide flat tube with seam lines, and a
    brass coupling with its lugs at each end. Origin under its middle."""
    a = Acc()
    L = 2.0
    a.sweep([(0.0, 0.036, -L / 2 + 0.12 + k * (L - 0.24) / 8) for k in range(9)], 0.09, M["hose"], sides=10, squash=0.4)
    a.box((0.008, 0.002, L - 0.24), (-0.055, 0.073, 0), M["hoseDark"])
    a.box((0.008, 0.002, L - 0.24), (0.055, 0.073, 0), M["hoseDark"])
    for s in (-1, 1):
        z = s * (L / 2 - 0.06)
        a.disc((0, 0.05, z), 0.062, 0.14, M["brass"], "z", 12)
        a.disc((0, 0.05, z + s * 0.06), 0.072, 0.03, M["brass"], "z", 12)
        for k in range(3):
            ang = k * 2.09
            a.box((0.03, 0.02, 0.025), (math.cos(ang) * 0.075, 0.05 + math.sin(ang) * 0.075, z), M["brass"])
    return finish(a.objects("hose"), "HoseLine")


def hose_coil(M):
    """A hose flaked in a coil on the road: three turns of flat tube round a
    small hollow, the outer end trailing off, a coupling on top."""
    a = Acc()
    pts = []
    turns, seg = 2.6, 20
    for k in range(int(turns * seg) + 1):
        t = k / seg
        r = 0.22 + t * 0.13
        ang = t * 2 * math.pi
        pts.append((math.cos(ang) * r, 0.03 + 0.0 * t, math.sin(ang) * r))
    # The tail: it runs off tangentially for half a metre.
    tail0 = pts[-1]
    pts += [(tail0[0] + 0.5 * k / 5 * 1.0, 0.03, tail0[2] + 0.1 * k / 5) for k in range(1, 6)]
    a.sweep(pts, 0.05, M["hose"], sides=8, squash=0.55)
    tail0 = pts[-1]
    a.disc((tail0[0], 0.05, tail0[2]), 0.06, 0.12, M["brass"], "x", 12)
    a.disc((pts[0][0], 0.09, pts[0][2]), 0.06, 0.1, M["brass"], "x", 12)
    return finish(a.objects("coil"), "HoseCoil")


def tape_span(M):
    """Hazard tape 1 m along +x, origin at its start, 0.07 tall, sagging a
    little, its stripes laid as separate slanted patches; a knot at each end."""
    a = Acc()
    n = 14
    for k in range(n):
        x0, x1 = k / n, (k + 1) / n
        y0 = -0.03 * math.sin(math.pi * x0)
        y1 = -0.03 * math.sin(math.pi * x1)
        mat = M["tapeRed"] if k % 2 == 0 else M["tapeWhite"]
        bm = a._bm(mat)
        v = [bm.verts.new(B((x0, y0, 0.0))), bm.verts.new(B((x1, y1, 0.0))), bm.verts.new(B((x1, y1 + 0.07, 0.0))), bm.verts.new(B((x0, y0 + 0.07, 0.0)))]
        f = bm.faces.new(v)
        # Double sided: the back face, for a ribbon seen from either side.
        bm.faces.new(list(reversed([bm.verts.new(B((x0, y0, 0.0))), bm.verts.new(B((x1, y1, 0.0))), bm.verts.new(B((x1, y1 + 0.07, 0.0))), bm.verts.new(B((x0, y0 + 0.07, 0.0)))])))
    for x in (0.0, 1.0):
        a.tube((x, 0.0, 0.0), (x, 0.09, 0.0), 0.012, 0.012, M["tapeWhite"], 5)
    return finish(a.objects("tape"), "TapeSpan")


def build():
    kit.reset()
    M = palette()
    objs = [tuft(M, i, 11 + i * 5) for i in range(3)]
    objs += debris(M)
    objs += skid(M)
    objs += [pothole(M), spoil(M), scorch(M)]
    objs += [hose_line(M), hose_coil(M), tape_span(M)]
    bake_spread(objs, gap=1.0, floor=0.55)
    for i, obj in enumerate(objs[:3]):
        h = TUFTS[i]
        set_ao(obj, lambda y, x, z, old, h=h: old * (0.6 + 0.4 * min(1.0, y / h)))
    return objs


def preview(n):
    import bpy

    objs = build()
    by = {o.name: o for o in objs}
    names = {
        0: ["Weed0", "Weed1", "Weed2", "DebrisPlate", "DebrisBumper", "DebrisHub", "DebrisGlass"],
        1: ["SkidTile", "SkidTail", "Pothole", "Spoil"],
        2: ["Scorch"],
        3: ["HoseLine", "HoseCoil", "TapeSpan"],
    }[n]
    keep = [by[k] for k in names]
    for o in objs:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    x = 0.0
    for o in keep:
        xs = [c[0] for c in o.bound_box]
        o.location.x = x - min(xs)
        x += max(xs) - min(xs) + 0.6
    return keep
