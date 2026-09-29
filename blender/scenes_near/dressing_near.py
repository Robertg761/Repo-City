"""
What stands round a merged pull request's finished house, NEAR level
(`finished-dressing.glb`'s detailed twin): the village's path, picket fence,
gate, bunting, agent's board and sapling, and the town's paving, banner,
ribbon, planters and bunting, on the lean nodes' frames and footprints
(`blender/incidents/finished_dressing.py`), rebuilt with rounded edges and a
finer sapling (forked trunk, a stake tied twice, leaf clusters), plus gate
hinges and latch, a letterbox and a house number, a flower bed along the
fence, individual slabs in the town's paving, ropes and hooks on the
stanchions, a plaque, and shrubs in the planters.

    blender -b --python blender/export.py -- blender/scenes_near/dressing_near.py finished-dressing-near
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import finished_dressing as lean  # noqa: E402
import kit  # noqa: E402
from kit import finish  # noqa: E402
from kit_near import Acc  # noqa: E402

FINISHED = lean.FINISHED


def palette():
    M = lean.palette()
    m = kit.material
    M["flowerA"] = m("flowerA", "#e8533f", "foliage", 0.7)
    M["flowerB"] = m("flowerB", "#f0c23b", "foliage", 0.7)
    M["flowerC"] = m("flowerC", "#f4f1e8", "foliage", 0.7)
    M["leafDark"] = m("leaf", "#7fa46a", "foliage", 0.8, tone=0.82)
    M["brass"] = m("brass", "#b08d3c", "metal", 0.35, 0.7)
    M["wood"] = m("timber", "#b59a6f", "timber", 0.8)
    M["glassLamp"] = m("glass", "#ffe9a8", "glass", 0.2, emission=0.3)
    M["petalRed"] = m("flowerA", "#e8533f", "foliage", 0.7)
    M["petalYellow"] = m("flowerB", "#f0c23b", "foliage", 0.7)
    M["petalWhite"] = m("flowerC", "#f4f1e8", "foliage", 0.7)
    M["can"] = m("can", "#4a8fd8", "metal", 0.4)
    return M


def sapling_near(M, x, z, lift=0.0):
    a = Acc()
    a.tube((x, lift, z), (x, lift + 0.7, z), 0.075, 0.055, M["trunk"], 8)
    a.tube((x, lift + 0.7, z), (x + 0.12, lift + 1.2, z + 0.02), 0.05, 0.03, M["trunk"], 6)
    a.tube((x, lift + 0.7, z), (x - 0.14, lift + 1.35, z - 0.06), 0.045, 0.025, M["trunk"], 6)
    a.tube((x, lift + 0.7, z), (x + 0.05, lift + 1.45, z + 0.12), 0.04, 0.02, M["trunk"], 6)
    a.tube((x + 0.14, lift, z), (x + 0.14, lift + 1.1, z), 0.025, 0.025, M["stake"], 6)
    for y in (0.5, 0.85):
        a.tube((x + 0.14, lift + y, z), (x + 0.03, lift + y, z), 0.008, 0.008, M["dark"], 4)
        a.box((0.04, 0.05, 0.04), (x + 0.14, lift + y, z), M["dark"])
    lumps = ((0, 1.45, 0, 0.46), (0.28, 1.3, 0.1, 0.3), (-0.22, 1.62, -0.12, 0.28), (0.1, 1.75, 0.08, 0.24), (-0.3, 1.35, 0.14, 0.22))
    for i, (dx, dy, dz, r) in enumerate(lumps):
        for k in range(3):
            ang = k * 2.1 + i
            a.lump((x + dx + math.cos(ang) * r * 0.4, lift + dy + math.sin(ang * 1.3) * r * 0.2, z + dz + math.sin(ang) * r * 0.4),
                       r * 0.62, M["leaf"] if k != 1 else M["leafDark"], seed=i * 5 + k)
    return a.objects("saplingFit")


def flower(a, x, y, z, r, petal, centre, seed=0.0):
    """A flower head: a ring of five petals round a centre, facing up."""
    for k in range(5):
        ang = 2 * math.pi * k / 5 + seed
        a.box((r * 0.9, 0.012, r * 0.5), (x + math.cos(ang) * r * 0.7, y, z + math.sin(ang) * r * 0.7), petal, rot=(0, -ang, 0))
    a.disc((x, y + 0.008, z), r * 0.35, 0.02, centre, "y", 6)


def wheelbarrow(a, M, x, z, turn):
    """A garden wheelbarrow: tub, wheel, legs and handles, at `x, z` turned `turn`."""
    c, s = math.cos(turn), math.sin(turn)

    def at(lx, ly, lz):
        return (x + lx * c + lz * s, ly, z - lx * s + lz * c)

    # The tub: a floor and four sides, the sides leaning out.
    a.box((0.5, 0.02, 0.5), at(0, 0.27, 0.16), M["red"], rot=(0, turn, 0))
    for sx in (-1, 1):
        a.box((0.02, 0.15, 0.5), at(sx * 0.28, 0.34, 0.16), M["red"], rot=(0, turn, sx * 0.25))
    a.box((0.6, 0.15, 0.02), at(0, 0.34, 0.42), M["red"], rot=(0, turn, 0))
    a.box((0.46, 0.15, 0.02), at(0, 0.34, -0.09), M["red"], rot=(0, turn, 0))
    a.disc(at(0, 0.12, 0.5), 0.12, 0.05, M["dark"], "x", 12)
    a.tube(at(-0.05, 0.12, 0.5), at(0.05, 0.12, 0.5), 0.02, 0.02, M["steel"], 5)
    for sx in (-1, 1):
        a.tube(at(sx * 0.22, 0.26, -0.05), at(sx * 0.22, 0.0, -0.2), 0.014, 0.014, M["steel"], 5)
        a.tube(at(sx * 0.22, 0.28, -0.05), at(sx * 0.2, 0.42, -0.62), 0.016, 0.014, M["wood"], 5)
        a.tube(at(sx * 0.2, 0.42, -0.62), at(sx * 0.2, 0.42, -0.72), 0.02, 0.02, M["dark"], 5, cap1=True)


def village_extras(M):
    spec = FINISHED["village"]
    half = spec["plot"] / 2
    fw, fd = spec["footprint"]
    front = -spec["setBack"] + fd / 2
    edge = half - 0.25
    a = Acc()
    # Gate: hinges on the post, a latch, a stop; a letterbox and a house number.
    for y in (0.3, 0.6):
        a.disc((1.02, y, edge - 0.02), 0.014, 0.09, M["dark"], "y", 6)
        a.box((0.16, 0.03, 0.01), (0.95, y, edge - 0.005), M["dark"])
    a.box((0.06, 0.04, 0.03), (0.06, 0.45, edge + 0.075), M["dark"])
    a.tube((0.06, 0.45, edge + 0.09), (0.16, 0.45, edge + 0.09), 0.008, 0.008, M["dark"], 5)
    a.box((0.22, 0.14, 0.12), (0.02, 1.35, edge + 0.09), M["red"])
    a.box((0.18, 0.02, 0.1), (0.02, 1.43, edge + 0.09), M["dark"])
    a.box((0.2, 0.012, 0.014), (0.02, 1.33, edge + 0.152), M["dark"])
    for k in range(2):
        a.box((0.03, 0.06, 0.008), (-0.1 + k * 0.045, 1.62, edge + 0.065), M["dark"])
    # Picket tips and nails: a nail at each picket foot, both rails.
    for x0, x1 in ((-half + 0.25, -0.2), (1.2, half - 0.25)):
        n = int((x1 - x0) / 0.19)
        for i in range(n + 1):
            for y in (0.3, 0.55):
                a.disc((x0 + (x1 - x0) * i / n, y, edge + 0.024), 0.008, 0.008, M["dark"], "z", 6)
    # Flower beds along the fence's inside: soil strips with plants.
    rng = random.Random(3)
    for x0, x1 in ((-half + 0.45, -0.4), (1.4, half - 0.5)):
        a.box((x1 - x0, 0.08, 0.32), ((x0 + x1) / 2, 0.04, edge - 0.32), M["soil"])
        n = int((x1 - x0) / 0.16)
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n + rng.uniform(-0.03, 0.03)
            petal = (M["petalRed"], M["petalYellow"], M["petalWhite"])[i % 3]
            h = rng.uniform(0.18, 0.32)
            a.tube((x, 0.06, edge - 0.32), (x + rng.uniform(-0.02, 0.02), 0.06 + h, edge - 0.32), 0.008, 0.005, M["leaf"], 4)
            flower(a, x, 0.06 + h + 0.01, edge - 0.32, 0.05, petal, M["flowerB"] if i % 3 == 0 else M["brass"], seed=i)
            a.lump((x, 0.1, edge - 0.32 + 0.05), 0.07, M["leafDark"], seed=i)
            a.lump((x + 0.05, 0.09, edge - 0.32 - 0.06), 0.06, M["leaf"], seed=i + 40)
    # Bunting on the eaves: brass hooks at the anchors.
    for x in (-fw / 2 + 0.3, fw / 2 - 0.2):
        a.ring((x, spec["height"] * 0.6, front + 0.12), 0.03, 0.006, M["dark"], "z", 8, 4)
    # A lantern on the gate post, a wheelbarrow and a watering can in the
    # garden, a bird bath, and a hedge along the back of the plot.
    a.box((0.16, 0.02, 0.16), (0.02, 1.96, edge), M["dark"])
    a.box((0.12, 0.2, 0.12), (0.02, 2.07, edge), M["glassLamp"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.tube((0.02 + sx * 0.06, 1.97, edge + sz * 0.06), (0.02 + sx * 0.06, 2.17, edge + sz * 0.06), 0.008, 0.008, M["dark"], 4)
    a.box((0.18, 0.03, 0.18), (0.02, 2.19, edge), M["dark"])
    a.tube((0.02, 2.2, edge), (0.02, 2.28, edge), 0.02, 0.006, M["dark"], 6, cap1=True)
    wheelbarrow(a, M, -half + 1.2, front + 1.0, 0.5)
    can_x, can_z = half - 1.8, edge - 0.9
    a.disc((can_x, 0.13, can_z), 0.09, 0.26, M["can"], "y", 10)
    a.tube((can_x + 0.08, 0.2, can_z), (can_x + 0.32, 0.33, can_z), 0.014, 0.01, M["can"], 6)
    a.tube((can_x - 0.08, 0.22, can_z), (can_x - 0.08, 0.34, can_z + 0.05), 0.01, 0.01, M["can"], 5)
    a.tube((can_x - 0.08, 0.34, can_z + 0.05), (can_x + 0.06, 0.32, can_z), 0.01, 0.01, M["can"], 5)
    bx0, bz0 = -1.7, front + 1.8
    a.tube((bx0, 0.0, bz0), (bx0, 0.55, bz0), 0.06, 0.04, M["planter"], 8)
    a.disc((bx0, 0.02, bz0), 0.14, 0.04, M["planter"], "y", 10)
    a.disc((bx0, 0.6, bz0), 0.24, 0.1, M["planter"], "y", 12, radius2=0.28)
    a.disc((bx0, 0.66, bz0), 0.21, 0.02, M["steel"], "y", 12)
    # A clipped bush in a pot each side of the door, and a mat on the step.
    for sx in (-1, 1):
        px, pz = 0.55 + sx * 0.75, front + 0.35
        a.disc((px, 0.16, pz), 0.17, 0.32, M["planter"], "y", 10, radius2=0.13)
        a.disc((px, 0.33, pz), 0.18, 0.03, M["planter"], "y", 10)
        a.tube((px, 0.33, pz), (px, 0.5, pz), 0.02, 0.02, M["trunk"], 5)
        for k in range(7):
            ang = k * 0.9
            a.lump((px + math.cos(ang) * 0.1, 0.72 + (k % 3) * 0.06, pz + math.sin(ang) * 0.1), 0.16, M["leaf"] if k % 2 else M["leafDark"], seed=k + sx * 9)
    a.box((0.7, 0.02, 0.4), (0.55, 0.055, front + 0.28), M["dark"])
    return a.objects("villageFit")


def town_extras(M):
    spec = FINISHED["town"]
    half = spec["plot"] / 2
    fw, fd = spec["footprint"]
    height = spec["height"]
    front = -spec["setBack"] + fd / 2
    edge = half - 0.3
    depth = edge - front + 0.2
    mid = (edge + front) / 2
    a = Acc()
    # The paving as individual slabs, over the lean single slab.
    nx, nz = 7, 6
    w = fw + 0.4
    for i in range(nx):
        for j in range(nz):
            x = -w / 2 + w * (i + 0.5) / nx
            z = mid - depth / 2 + depth * (j + 0.5) / nz
            a.box((w / nx - 0.02, 0.014, depth / nz - 0.02), (x, 0.056, z), M["paving"] if (i + j) % 2 else M["joint"])
    # Ropes between the stanchions and hooks for them; a plaque by the door.
    rz = front + 1.2
    for x in (-1.2, 1.2):
        a.ring((x, 1.02, rz), 0.04, 0.008, M["steel"], "z", 8, 4)
        for k in range(3):
            a.box((0.02, 0.1, 0.02), (x, 0.3 + k * 0.28, rz + 0.045), M["steel"])
    a.box((0.4, 0.28, 0.02), (-fw / 2 + 0.7, 1.4, front + 0.06), M["brass"])
    for k in range(4):
        a.box((0.3 - 0.03 * (k % 2), 0.016, 0.006), (-fw / 2 + 0.7, 1.5 - k * 0.06, front + 0.072), M["dark"])
    # Shrubs in the planters and stones on their soil.
    for s in (-1, 1):
        px, pz = s * (fw / 2 - 0.25), edge - 0.6
        for k in range(6):
            ang = k * 1.05
            a.lump((px + math.cos(ang) * 0.24, 0.62 + (k % 2) * 0.04, pz + math.sin(ang) * 0.24), 0.16, M["leaf"] if k % 2 else M["leafDark"], seed=k + 20 * s)
        for k in range(4):
            a.box((0.06, 0.03, 0.05), (px + math.cos(k * 1.7) * 0.3, 0.52, pz + math.sin(k * 1.7) * 0.3), M["planter"], rot=(0, k, 0))
        a.box((0.84, 0.04, 0.84), (px, 0.48, pz), M["planter"])
    # Two lamp posts and a run of bollards along the kerb, a bench and a bin
    # by the planters and a bike rack of five hoops.
    for s_ in (-1, 1):
        lx = s_ * (half - 0.25)
        a.disc((lx, 0.06, edge - 0.05), 0.12, 0.12, M["dark"], "y", 8)
        a.tube((lx, 0.1, edge - 0.05), (lx, 2.8, edge - 0.05), 0.045, 0.03, M["dark"], 8)
        a.tube((lx, 2.75, edge - 0.05), (lx - s_ * 0.3, 2.95, edge - 0.05), 0.022, 0.018, M["dark"], 6)
        a.box((0.26, 0.05, 0.16), (lx - s_ * 0.36, 2.94, edge - 0.05), M["dark"])
        a.box((0.22, 0.14, 0.12), (lx - s_ * 0.36, 2.86, edge - 0.05), M["glassLamp"])
    for k in range(9):
        bxx = -(fw + 0.4) / 2 + 0.3 + k * ((fw + 0.4 - 0.6) / 8)
        if abs(bxx) < 1.5:
            continue
        a.disc((bxx, 0.3, mid + depth / 2 + 0.05), 0.05, 0.6, M["steel"], "y", 8)
        a.disc((bxx, 0.62, mid + depth / 2 + 0.05), 0.06, 0.03, M["dark"], "y", 8)
        a.disc((bxx, 0.5, mid + depth / 2 + 0.05), 0.058, 0.04, M["red"], "y", 8)
    bx1, bz1 = -fw / 2 + 1.3, edge - 0.6
    for z in (-0.12, 0.0, 0.12):
        a.box((1.4, 0.04, 0.1), (bx1, 0.46, bz1 + z), M["wood"])
    for y in (0.7, 0.82):
        a.box((1.4, 0.09, 0.03), (bx1, y, bz1 - 0.24), M["wood"])
    for s_ in (-1, 1):
        a.box((0.06, 0.44, 0.5), (bx1 + s_ * 0.62, 0.22, bz1), M["dark"])
        a.box((0.06, 0.4, 0.05), (bx1 + s_ * 0.62, 0.64, bz1 - 0.24), M["dark"])
    a.disc((fw / 2 - 1.3, 0.42, edge - 0.5), 0.2, 0.84, M["steel"], "y", 10, radius2=0.17)
    a.disc((fw / 2 - 1.3, 0.86, edge - 0.5), 0.21, 0.03, M["dark"], "y", 10)
    for k in range(5):
        hx = -0.8 + k * 0.36
        a.polyline([(hx, 0.0, front + 2.6), (hx, 0.5, front + 2.6), (hx + 0.08, 0.72, front + 2.6), (hx + 0.24, 0.72, front + 2.6), (hx + 0.32, 0.5, front + 2.6), (hx + 0.32, 0.0, front + 2.6)], 0.017, M["steel"], sides=5, cap_ends=True)
    # Petalled flowers in the planters, two more planters along the forecourt's
    # edges, and a small fountain in the paving, its basin and three jets.
    rng = random.Random(11)
    planters = [(s_ * (fw / 2 - 0.25), edge - 0.6) for s_ in (-1, 1)] + [(s_ * (fw / 2 - 1.5), edge - 0.15) for s_ in (-1, 1)]
    for k, (px, pz) in enumerate(planters):
        if k >= 2:
            a.box((0.7, 0.4, 0.5), (px, 0.2, pz), M["planter"])
            a.box((0.56, 0.04, 0.38), (px, 0.4, pz), M["soil"])
        top = 0.5 if k < 2 else 0.42
        for i in range(12):
            fx, fz = px + rng.uniform(-0.28, 0.28), pz + rng.uniform(-0.28, 0.28)
            h = rng.uniform(0.15, 0.3)
            a.tube((fx, top, fz), (fx, top + h, fz), 0.007, 0.005, M["leaf"], 4)
            flower(a, fx, top + h + 0.01, fz, 0.05, (M["petalRed"], M["petalYellow"], M["petalWhite"])[i % 3], M["brass"], seed=i)
    fx0, fz0 = 0.0, mid + 0.4
    a.disc((fx0, 0.14, fz0), 0.62, 0.12, M["planter"], "y", 16, radius2=0.7)
    a.disc((fx0, 0.2, fz0), 0.55, 0.02, M["steel"], "y", 16)
    a.tube((fx0, 0.15, fz0), (fx0, 0.55, fz0), 0.08, 0.05, M["planter"], 8)
    a.disc((fx0, 0.58, fz0), 0.22, 0.06, M["planter"], "y", 12, radius2=0.26)
    for k in range(3):
        ang = 2 * math.pi * k / 3
        a.tube((fx0 + math.cos(ang) * 0.06, 0.6, fz0 + math.sin(ang) * 0.06), (fx0 + math.cos(ang) * 0.12, 1.0 - 0.1 * k, fz0 + math.sin(ang) * 0.12), 0.012, 0.008, M["steel"], 5, cap1=True)
    # Banner rod finials and its tie cords.
    bx, by, bz = fw / 2 - 0.7, height * 0.62, front + 0.06
    for y in (by + 1.22, by - 1.22):
        for s in (-1, 1):
            a.disc((bx + s * 0.44, y, bz + 0.02), 0.05, 0.06, M["steel"], "x", 8)
    for x in (-0.3, 0.3):
        a.tube((bx + x, by + 1.2, bz + 0.02), (bx + x, by + 1.1, bz + 0.03), 0.006, 0.006, M["cord"], 4)
    return a.objects("townFit")


def build():
    kit.reset()
    M = palette()
    lean.sapling = sapling_near
    objs = [finish(lean.village(M) + village_extras(M), "VillageDressing"), finish(lean.town(M) + town_extras(M), "TownDressing")]
    for obj in objs:
        obj.location = (0, 0, 0)
    objs[0].location.x = -6
    objs[1].location.x = 6
    kit.bake_ao(objs, floor=0.55)
    for obj in objs:
        obj.location = (0, 0, 0)
    return objs


def preview(n):
    import bpy

    objs = build()
    bpy.data.objects.remove(objs[1 - n], do_unlink=True)
    return [objs[n]]
