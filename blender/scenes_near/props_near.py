"""
The construction site's equipment, NEAR level (`construction-props.glb`'s
detailed twin): the mixer, the excavator, the site hut and the stacked
materials, in the lean models' frames and on their footprints, plus three
pieces of site clutter that only a near camera would notice: a pallet of
bricks, a skip and a portable toilet.

Each lean builder (`blender/incidents/construction_props.py`) is run again
with finer bevels and rounder drums (`kit_near.refine`), and what a close
camera reads is added on top: the mixer's drum hoops, ring gear and hand
wheel, the excavator's track shoes, rollers, hoses, seat and toothed bucket,
the hut's hinges, gutter, air conditioner and lifting eyes, the boards of the
timber stack and the pipes' collars.

    blender -b --python blender/export.py -- blender/scenes_near/props_near.py construction-props-near
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import construction_props as lean  # noqa: E402
import kit  # noqa: E402
from incident_props import bake_apart  # noqa: E402
from kit import box, cyl, finish, prism, strut  # noqa: E402
from kit_near import Acc  # noqa: E402


def palette():
    M = lean.palette()
    m = kit.material
    M["brick"] = m("brick", "#a5533b", "brick", 0.9)
    M["brickDark"] = m("brick", "#a5533b", "brick", 0.9, tone=0.8)
    M["mortar"] = m("mortar", "#b9b2a3", "concrete", 0.95)
    M["strap"] = m("strap", "#2f6fb0", "fabric", 0.6)
    M["wrap"] = m("wrap", "#dfe3e6", "fabric", 0.4)
    M["rubble"] = m("rubble", "#8b8478", "stone", 0.95)
    M["portaloo"] = m("portaloo", "#4f8f6e", "metal", 0.5)
    M["portaloo2"] = m("portaloo", "#4f8f6e", "metal", 0.5, tone=0.8)
    M["skip"] = m("skip", "#e0b750", "metal", 0.55)
    M["hazard"] = m("stripe", "#e8e3d6", "metal", 0.5)
    M["red"] = m("red", "#c8493c", "metal", 0.5)
    M["rubber"] = m("rubber", "#26282b", "fabric", 0.9)
    M["lampAmber"] = m("lamp", "#ffb347", "glass", 0.3)
    return M


def hex_ring(acc, centre, r, count, mat, axis="z", bolt=0.014, out=0.0):
    """`count` bolt heads on a circle of radius `r` about `centre`, axis along `axis`."""
    cx, cy, cz = centre
    for i in range(count):
        t = 2 * math.pi * i / count
        if axis == "z":
            p = (cx + math.cos(t) * r, cy + math.sin(t) * r, cz)
        elif axis == "x":
            p = (cx, cy + math.cos(t) * r, cz + math.sin(t) * r)
        else:
            p = (cx + math.cos(t) * r, cy, cz + math.sin(t) * r)
        acc.hexnut(p, bolt, 0.018, mat, axis)


# --- the mixer ---------------------------------------------------------------


def mixer(M):
    parts = lean.mixer(M)
    a = Acc()
    tilt = 0.5
    centre = (0.0, 1.15, 0.0)
    u = (0.0, math.cos(tilt), math.sin(tilt))
    at = lambda t: tuple(centre[i] + u[i] * t for i in range(3))  # noqa: E731
    # Raised hoops round the drum and a ring gear with its teeth.
    for t, r in ((-0.36, 0.6), (-0.08, 0.6), (0.3, 0.5)):
        a.tube(at(t - 0.025), at(t + 0.025), r + 0.02, r + 0.02, M["dark"], 20)
    ring_c = at(-0.2)
    for k in range(24):
        ang = 2 * math.pi * k / 24
        # a tooth on the gear ring, in the drum's own frame (axis u)
        ax, ay, az = u
        e1 = (1.0, 0.0, 0.0)
        e2 = (0.0, -az, ay)
        p = tuple(ring_c[i] + (e1[i] * math.cos(ang) + e2[i] * math.sin(ang)) * 0.655 for i in range(3))
        a.box((0.05, 0.05, 0.05), p, M["dark"], rot=(tilt, 0, ang))
    # Blades' rivets on the belly and a filler cap.
    for k in range(10):
        ang = 2 * math.pi * k / 10 + 0.2
        e1 = (1.0, 0.0, 0.0)
        e2 = (0.0, -u[2], u[1])
        p = tuple(at(0.3)[i] + (e1[i] * math.cos(ang) + e2[i] * math.sin(ang)) * 0.535 for i in range(3))
        a.hexnut(p, 0.014, 0.02, M["frame"], "y")
    # The mouth's rim and lip.
    a.tube(at(0.66), at(0.74), 0.37, 0.39, M["frame"], 20)
    a.tube(at(0.7), at(0.7), 0.3, 0.3, M["dark"], 20)
    # Hand wheel spokes.
    wc = (-0.72, 1.08, 0.08)
    for k in range(6):
        ang = math.pi * k / 3
        a.tube((wc[0], wc[1] + math.cos(ang) * 0.02, wc[2] + math.sin(ang) * 0.02),
               (wc[0], wc[1] + math.cos(ang) * 0.19, wc[2] + math.sin(ang) * 0.19), 0.008, 0.008, M["dark"], 4)
    a.tube((wc[0] - 0.02, wc[1] + 0.19, wc[2]), (wc[0] - 0.09, wc[1] + 0.19, wc[2]), 0.012, 0.012, M["orange"], 6, cap1=True)
    # Wheels: five wheel nuts and a hub cap, mudguard stays.
    for side in (-1, 1):
        x = side * 0.5
        for k in range(5):
            ang = 2 * math.pi * k / 5
            a.hexnut((x + side * 0.09, 0.26 + math.sin(ang) * 0.08, math.cos(ang) * 0.08), 0.014, 0.02, M["dark"], "x")
        a.disc((x + side * 0.095, 0.26, 0), 0.05, 0.02, M["chrome"], "x", 10)
        a.rod((side * 0.5, 0.56, 0.26), (side * 0.5, 0.46, 0.3), 0.03, 0.02, M["frame"])
        a.rod((side * 0.5, 0.56, -0.26), (side * 0.5, 0.46, -0.3), 0.03, 0.02, M["frame"])
    # Tow eye, chain, the prop stand's foot, and the engine's fittings.
    a.ring((0, 0.4, 1.24), 0.06, 0.012, M["dark"], "y", 10, 5)
    a.box((0.14, 0.02, 0.08), (0, 0.02, 1.0), M["dark"])
    a.disc((-0.16, 0.9, -0.48), 0.035, 0.05, M["dark"], "y", 8)
    a.disc((0.19, 0.9, -0.6), 0.028, 0.14, M["frame"], "y", 8)
    a.disc((0.19, 0.98, -0.6), 0.036, 0.03, M["dark"], "y", 8)
    a.box((0.16, 0.14, 0.05), (0.0, 0.7, -0.7), M["dark"])
    a.tube((0.0, 0.7, -0.72), (0.05, 0.6, -0.9), 0.012, 0.012, M["dark"], 5)
    # A hose and a spanner hung on the frame.
    a.polyline([(0.3, 0.46, 0.5), (0.4, 0.3, 0.45), (0.42, 0.2, 0.3)], 0.014, M["rubber"], 6)
    # Lamps.
    a.box((0.1, 0.06, 0.02), (-0.28, 0.62, -0.7), M["red"])
    a.box((0.1, 0.06, 0.02), (0.28, 0.62, -0.7), M["red"])
    return parts + a.objects("mixerFittings")


# --- the excavator -----------------------------------------------------------


def excavator(M):
    parts = lean.excavator(M)
    a = Acc()
    # Track shoes: a grouser on every link along the top run and the ends,
    # link pins down the side, bolts through the rollers and sprockets.
    for side in (-1, 1):
        x = side * 0.62
        for k in range(11):
            z = -1.04 + k * 0.208
            a.box((0.44, 0.03, 0.06), (x, 0.445, z), M["dark"])
            a.box((0.02, 0.06, 0.05), (side * 0.835, 0.36, z), M["metal"])
        for z in (-0.5, 0, 0.5):
            hex_ring(a, (side * 0.86, 0.16, z), 0.06, 4, M["dark"], "x", bolt=0.012)
        for z in (-0.98, 0.98):
            hex_ring(a, (side * 0.87, 0.24, z), 0.1, 5, M["dark"], "x", bolt=0.013)
        # Track guard rails.
        a.box((0.03, 0.05, 2.0), (side * 0.845, 0.2, 0), M["metal"])
    # A grease nipple and mudguards over the tracks' ends.
    for z in (-1.2, 1.2):
        for side in (-1, 1):
            a.box((0.44, 0.02, 0.14), (side * 0.62, 0.46, z * 0.95), M["metal"])
    # The cab: a seat, joysticks, a wiper, a beacon and handles.
    a.box((0.36, 0.1, 0.36), (-0.36, 1.32, 0.05), M["dark"])
    a.box((0.34, 0.4, 0.07), (-0.36, 1.55, -0.13), M["dark"])
    for x in (-0.55, -0.2):
        a.tube((x, 1.06, 0.4), (x, 1.32, 0.4), 0.014, 0.014, M["metal"], 6)
        a.disc((x, 1.33, 0.4), 0.025, 0.03, M["dark"], "y", 8)
    a.tube((-0.55, 1.58, 0.67), (-0.2, 1.55, 0.67), 0.008, 0.008, M["dark"], 4)
    a.tube((-0.4, 1.6, 0.67), (-0.4, 1.9, 0.67), 0.006, 0.006, M["dark"], 4)
    a.disc((-0.36, 2.1, 0.55), 0.06, 0.05, M["lampAmber"], "y", 10)
    a.disc((-0.36, 2.06, 0.55), 0.075, 0.03, M["dark"], "y", 10)
    a.box((0.03, 0.03, 0.22), (0.04, 1.5, 0.3), M["dark"])
    a.tube((0.03, 1.15, 0.72), (0.03, 1.85, 0.72), 0.012, 0.012, M["dark"], 5)
    # Mirrors and steps.
    a.tube((0.02, 1.7, 0.6), (0.12, 1.75, 0.68), 0.008, 0.008, M["dark"], 4)
    a.box((0.02, 0.14, 0.09), (0.13, 1.75, 0.7), M["dark"])
    for y, z in ((0.72, 0.5), (0.9, 0.3)):
        a.box((0.34, 0.03, 0.1), (-0.5, y, z), M["dark"])
    # Exhaust cap, fuel filler and a hatch on the engine cover.
    a.disc((0.55, 1.72, -0.3), 0.06, 0.03, M["dark"], "y", 10)
    a.disc((0.55, 1.335, -0.6), 0.055, 0.03, M["metal"], "y", 10)
    a.disc((0.55, 1.345, -0.6), 0.035, 0.03, M["dark"], "y", 8)
    for z in (-0.86, -0.7, -0.54, -0.4, -0.3):
        pass
    # The counterweight's bolts, tow eye and hook.
    hex_ring(a, (0, 0.78, -1.085), 0.3, 6, M["dark"], "z", bolt=0.02)
    a.ring((0, 0.78, -1.11), 0.06, 0.014, M["dark"], "z", 10, 5)
    # Hydraulic hoses along the boom, clamped, and the rams' pin bosses.
    ax = 0.4
    for dx in (-0.09, 0.09):
        a.polyline([(ax + dx, 1.05, 0.5), (ax + dx * 1.2, 1.55, 0.95), (ax + dx * 1.2, 2.05, 1.5), (ax + dx * 1.2, 2.32, 1.78)], 0.02, M["rubber"], 6)
        a.polyline([(ax + dx * 1.2, 2.32, 1.78), (ax + dx * 1.2, 1.8, 2.15), (ax + dx * 1.2, 1.2, 2.5)], 0.018, M["rubber"], 6)
    for t in (0.25, 0.55, 0.8):
        a.box((0.26, 0.05, 0.05), (ax, 1.02 + 1.23 * t, 0.55 + 1.3 * t), M["dark"])
    for p in ((ax, 0.85, 0.85), (ax, 1.72, 1.36), (ax, 1.9, 1.2), (ax, 2.4, 1.7), (ax, 2.0, 2.05), (ax, 1.0, 2.62)):
        a.disc(p, 0.05, 0.34, M["dark"], "x", 10)
        a.disc(p, 0.028, 0.37, M["chrome"], "x", 8)
    # Bucket: side cutters, tooth adapters and the teeth themselves.
    for side in (-1, 1):
        a.box((0.03, 0.4, 0.34), (ax + side * 0.265, 0.5, 3.02), M["metal"])
    for i in range(4):
        x = ax - 0.18 + i * 0.12
        a.box((0.09, 0.06, 0.09), (x, 0.11, 3.03), M["metal"])
        a.tube((x, 0.11, 3.05), (x, 0.06, 3.19), 0.038, 0.012, M["dark"], 4, cap1=True)
    # A work lamp on the boom and a grab handle by the cab door.
    a.box((0.09, 0.07, 0.07), (ax + 0.15, 2.05, 1.62), M["dark"])
    a.box((0.06, 0.05, 0.02), (ax + 0.15, 2.05, 1.66), M["lampAmber"])
    return parts + a.objects("excavatorFittings")


# --- the hut -----------------------------------------------------------------


def hut(M):
    parts = lean.hut(M)
    a = Acc()
    w, d = 2.6, 1.8
    y0, y1 = 0.12, 1.62
    # Door: frame, hinges, lock, a kick plate and a door closer.
    a.box((0.72, 0.05, 0.06), (0.7, y0 + 1.19, d / 2 + 0.0), M["roof"])
    for x in (0.36, 1.04):
        a.box((0.05, 1.16, 0.06), (x, y0 + 0.6, d / 2 + 0.0), M["roof"])
    for y in (0.25, 0.7, 1.15):
        a.disc((1.03, y, d / 2 + 0.02), 0.018, 0.09, M["trim"], "y", 6)
    a.box((0.12, 0.14, 0.03), (0.9, y0 + 0.62, d / 2 + 0.0), M["trim"])
    a.box((0.5, 0.16, 0.012), (0.7, y0 + 0.14, d / 2 - 0.035), M["trim"])
    a.box((0.2, 0.05, 0.05), (0.75, y0 + 1.13, d / 2 + 0.02), M["dark"])
    # Window: frame all round, an opening light and a security grille.
    for dx in (-0.4, 0.4):
        a.box((0.04, 0.6, 0.05), (-0.55 + dx, 1.05, d / 2 + 0.005), M["trim"])
    for dy in (-0.3, 0.3):
        a.box((0.84, 0.04, 0.05), (-0.55, 1.05 + dy, d / 2 + 0.005), M["trim"])
    a.box((0.02, 0.5, 0.03), (-0.55, 1.05, d / 2 + 0.0), M["trim"])
    for k in range(3):
        a.tube((-0.85 + k * 0.3, 0.8, d / 2 + 0.05), (-0.85 + k * 0.3, 1.3, d / 2 + 0.05), 0.006, 0.006, M["dark"], 4)
    # Gutter and downpipe, and the roof's rain lip.
    a.tube((-w / 2 - 0.08, y1 + 0.02, d / 2 + 0.05), (w / 2 + 0.08, y1 + 0.02, d / 2 + 0.05), 0.03, 0.03, M["dark"], 8)
    a.tube((w / 2 + 0.04, y1 + 0.02, d / 2 + 0.05), (w / 2 + 0.04, y0 + 0.1, d / 2 + 0.05), 0.022, 0.022, M["dark"], 6)
    for y in (0.4, 0.9, 1.4):
        a.box((0.05, 0.03, 0.06), (w / 2 + 0.04, y, d / 2 + 0.03), M["dark"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.ring((sx * (w / 2 - 0.1), y1 + 0.16, sz * (d / 2 - 0.1)), 0.06, 0.012, M["dark"], "z", 8, 5)
            a.box((0.1, 0.05, 0.1), (sx * (w / 2 - 0.1), y1 + 0.13, sz * (d / 2 - 0.1)), M["dark"])
    # An air conditioner on the -x flank over the side window's line, a cable
    # duct and a mains inlet.
    a.box((0.22, 0.4, 0.55), (-w / 2 - 0.13, 1.28, 0.42), M["trim"])
    for k in range(6):
        a.box((0.02, 0.025, 0.5), (-w / 2 - 0.245, 1.13 + k * 0.05, 0.42), M["dark"])
    a.disc((-w / 2 - 0.25, 1.28, 0.42), 0.08, 0.02, M["dark"], "x", 12)
    a.box((0.06, 0.06, 0.4), (-w / 2 - 0.03, 0.42, 0.5), M["dark"])
    a.box((0.1, 0.12, 0.08), (-w / 2 - 0.05, 0.5, -0.5), M["metal"])
    # A light over the door and a bracket for the notice.
    a.box((0.14, 0.08, 0.1), (0.7, y1 - 0.05, d / 2 + 0.06), M["dark"])
    a.box((0.1, 0.03, 0.04), (0.7, y1 - 0.09, d / 2 + 0.08), M["lampAmber"])
    # Corner bolts, skid bolts and the roof's vent.
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2):
            for y in (0.4, 0.8, 1.2, 1.55):
                a.hexnut((x + math.copysign(0.05, x) * 0.0, y, z + math.copysign(0.05, z)), 0.014, 0.02, M["trim"], "z")
    a.disc((0.5, y1 + 0.16, -0.3), 0.15, 0.06, M["dark"], "y", 12)
    a.disc((0.5, y1 + 0.2, -0.3), 0.19, 0.02, M["roof"], "y", 12)
    # Ribs on the front face, either side of the door and window.
    for k in range(4):
        a.box((0.03, y1 - y0 - 0.2, 0.02), (-1.15 + k * 0.2 - 0.0, (y0 + y1) / 2, d / 2 + 0.005), M["wall"])
    # Step treads: anti-slip ribs across the step.
    for k in range(5):
        a.box((0.66, 0.012, 0.02), (0.7, 0.145, d / 2 + 0.07 + k * 0.06), M["metal"])
    return parts + a.objects("hutFittings")


# --- the stock ---------------------------------------------------------------


def materials(M):
    parts = lean.materials(M)
    a = Acc()
    # Boards: the seams between the courses on both stacks' ends and faces.
    for x0, x1, y0, y1, z in ((-1.1, 1.1, 0.1, 0.68, 0.655), (-0.95, 0.95, 0.74, 1.18, 0.62)):
        n = 7 if x1 > 1.0 else 6
        for k in range(1, n):
            x = x0 + (x1 - x0) * k / n
            a.box((0.012, y1 - y0 - 0.02, 0.008), (x, (y0 + y1) / 2, z + 0.006), M["dark"])
        for k in range(1, 4):
            y = y0 + (y1 - y0) * k / 4
            a.box((x1 - x0 - 0.02, 0.01, 0.008), (0, y, z + 0.006), M["dark"])
    # Bearers' ends, ties and bundle tags.
    for k in range(4):
        a.box((0.02, 0.7, 0.008), (-1.0 + k * 0.66, 0.4, 0.665), M["pipe"])
    a.box((0.16, 0.1, 0.01), (0.5, 0.9, 0.675), M["sign"])
    # Pipes: collars round the ends and plastic end caps on the top pair.
    for y, zs in ((0.3, (-1.8, -1.4, -1.0)), (0.64, (-1.6, -1.2))):
        for z in zs:
            for x in (-2.1, -0.3):
                a.disc((x, y, z), 0.215, 0.06, M["pipe"], "x", 12)
    for z in (-1.6, -1.2):
        a.disc((-0.28, 0.64, z), 0.22, 0.03, M["sign"], "x", 12)
    # Sand: a scatter of stones and a wheelbarrow-shovel handle grip.
    rng = random.Random(3)
    for k in range(14):
        ang = rng.random() * 2 * math.pi
        r = 0.5 + rng.random() * 0.9
        s = 0.05 + rng.random() * 0.06
        x, z = 2.6 + math.cos(ang) * r, -0.6 + math.sin(ang) * r
        y = max(0.02, 0.5 * (1 - r / 1.15)) + s * 0.5
        a.slab([(x - s, z - s * 0.8), (x + s, z - s), (x + s * 0.9, z + s), (x - s * 0.8, z + s * 0.9)], y - s * 0.4, y + s * 0.4, M["rubble"])
    a.tube((2.4, 1.55, 0.05), (2.36, 1.62, 0.1), 0.016, 0.016, M["timber"], 6)
    a.box((0.1, 0.03, 0.03), (2.37, 1.62, 0.1), M["timber"])
    return parts + a.objects("stockFittings")


def brick_pallet(M):
    """A wooden pallet under three strapped packs of bricks."""
    a = Acc()
    parts = []
    # The pallet: nine bearers-on-stringers, deck boards over three stringers.
    for x in (-0.55, 0.0, 0.55):
        parts.append(box("stringer", (0.09, 0.09, 1.0), (x, 0.09, 0), M["timber"], bev=0.008, seg=2))
    for z in (-0.44, -0.22, 0.0, 0.22, 0.44):
        parts.append(box("deck", (1.2, 0.022, 0.13), (0, 0.145, z), M["timber"], bev=0.006, seg=2))
    for z in (-0.44, 0.0, 0.44):
        parts.append(box("foot", (1.2, 0.022, 0.1), (0, 0.035, z), M["timber"], bev=0.006, seg=2))
    # Three packs of bricks, ten courses each, mortar-joint lines on each face,
    # a strap round the middle and a few bricks fallen on top.
    for i, (x, z) in enumerate(((-0.29, -0.24), (0.29, -0.24), (0.0, 0.24))):
        w = 0.56 if i < 2 else 0.9
        d = 0.46
        parts.append(box("pack", (w, 0.68, d), (x, 0.48, z), M["brick"], bev=0.012, seg=2, cell=0.3))
        for k in range(1, 10, 2):
            y = 0.14 + 0.068 * k + 0.0
            a.box((w + 0.006, 0.006, 0.006), (x, y + 0.0, z + d / 2 + 0.003), M["mortar"])
            a.box((0.006, 0.006, d + 0.006), (x + w / 2 + 0.003, y, z), M["mortar"])
        for k in range(1, int(w / 0.215)):
            for row in range(0, 9, 4):
                xx = x - w / 2 + k * 0.215 + (0.1 if row % 4 == 2 else 0.0)
                if abs(xx - x) < w / 2 - 0.02:
                    a.box((0.005, 0.066, 0.006), (xx, 0.148 + 0.068 * (row + 0.5), z + d / 2 + 0.003), M["mortar"])
        a.box((w + 0.02, 0.03, 0.012), (x, 0.36, z + d / 2 + 0.008), M["strap"])
        a.box((w + 0.02, 0.03, 0.012), (x, 0.36, z - d / 2 - 0.008), M["strap"])
        a.box((0.03, 0.03, d + 0.02), (x - 0.15, 0.36, z), M["strap"])
        a.box((0.03, 0.03, d + 0.02), (x + 0.15, 0.36, z), M["strap"])
        a.box((0.05, 0.035, 0.014), (x + 0.1, 0.36, z + d / 2 + 0.014), M["dark"])
    # Loose bricks: two on the pallet's edge, one broken on the ground.
    for (x, y, z, ry) in ((0.02, 0.83, -0.22, 0.3), (-0.3, 0.83, -0.24, -0.4)):
        a.box((0.215, 0.065, 0.1025), (x, y, z), M["brickDark"], rot=(0, ry, 0))
    a.box((0.2, 0.065, 0.1), (0.7, 0.033, 0.3), M["brickDark"], rot=(0, 0.6, 0))
    a.box((0.11, 0.065, 0.1), (0.62, 0.033, 0.52), M["brickDark"], rot=(0, -0.3, 0))
    # A plastic wrap sheet slipping down one pack.
    a.box((0.0004 + 0.5, 0.3, 0.004), (-0.29, 0.3, -0.24 + 0.23 + 0.03), M["wrap"])
    return parts + a.objects("brickFittings")


def portaloo(M):
    """A portable toilet: ribbed body, roof, door with handle and indicator."""
    a = Acc()
    parts = [
        box("plinth", (1.05, 0.12, 1.05), (0, 0.06, 0), M["portaloo2"], bev=0.015, seg=2),
        box("body", (1.0, 2.0, 1.0), (0, 1.12, 0), M["portaloo"], bev=0.04, seg=3, cell=0.5),
        box("roof", (1.08, 0.1, 1.08), (0, 2.17, 0), M["wrap"], bev=0.04, seg=3),
    ]
    # Ribs down every face, the door's frame, handle, hinges and lock.
    for k in range(5):
        a.box((0.03, 1.8, 0.014), (-0.36 + k * 0.18, 1.12, -0.507), M["portaloo2"])
    for s in (-1, 1):
        for k in range(4):
            a.box((0.014, 1.8, 0.03), (s * 0.507, 1.12, -0.33 + k * 0.22), M["portaloo2"])
    for x in (-0.31, 0.31):
        a.box((0.04, 1.78, 0.016), (x, 1.1, 0.508), M["portaloo2"])
    a.box((0.66, 0.04, 0.016), (0, 1.99, 0.508), M["portaloo2"])
    a.box((0.66, 0.04, 0.016), (0, 0.22, 0.508), M["portaloo2"])
    a.box((0.03, 1.72, 0.012), (0.0, 1.1, 0.51), M["portaloo2"])
    for y in (0.4, 1.1, 1.8):
        a.disc((-0.31, y, 0.525), 0.02, 0.1, M["dark"], "y", 6)
    a.box((0.05, 0.16, 0.04), (0.24, 1.05, 0.53), M["dark"])
    a.box((0.13, 0.1, 0.02), (0.18, 1.22, 0.518), M["red"])
    a.box((0.13, 0.03, 0.02), (0.18, 1.14, 0.52), M["wrap"])
    # A vent in the roof, a header sign and drain feet.
    a.disc((0.25, 2.26, -0.2), 0.12, 0.1, M["dark"], "y", 12)
    a.box((0.5, 0.14, 0.02), (0, 2.02, 0.512), M["wrap"])
    for x in (-0.4, 0.4):
        for z in (-0.4, 0.4):
            a.box((0.1, 0.03, 0.1), (x, 0.015, z), M["dark"])
    return parts + a.objects("portalooFittings")


def skip(M):
    """A builder's skip, half full of rubble, with hazard chevrons on it."""
    a = Acc()
    parts = []
    # A trapezoid tub: a side profile pushed across, with a rolled rim.
    L, Wd, H = 1.9, 1.15, 0.85
    profile = [(-L / 2, 0.22), (L / 2, 0.22), (L / 2 + 0.16, H), (-L / 2 - 0.16, H)]
    parts.append(prism("tub", profile, Wd, M["skip"], x=0.0, bev=0.02, seg=2))
    for s in (-1, 1):
        # Runners under it and the lifting lugs.
        parts.append(box("runner", (0.12, 0.1, L + 0.5), (s * 0.4, 0.09, 0), M["dark"], bev=0.01, seg=2))
        a.ring((s * (Wd / 2 + 0.02), H - 0.1, L / 2 + 0.12), 0.07, 0.018, M["dark"], "x", 10, 5)
        a.ring((s * (Wd / 2 + 0.02), H - 0.1, -L / 2 - 0.12), 0.07, 0.018, M["dark"], "x", 10, 5)
        # Ribs down the ends.
        for k in range(3):
            z = -0.4 + k * 0.4
            a.box((0.02, 0.5, 0.05), (s * (Wd / 2 + 0.006), 0.56, z), M["dark"])
    for e in (-1, 1):
        for k in range(3):
            a.box((0.06, 0.5, 0.02), (-0.35 + k * 0.35, 0.56, e * (L / 2 + 0.09)), M["dark"])
    # Hazard chevrons on both ends, the way a hired skip is marked.
    for e in (-1, 1):
        for k in range(6):
            a.box((0.09, 0.32, 0.012), (-0.45 + k * 0.18, 0.55, e * (L / 2 + 0.115)), M["hazard"], rot=(0, 0, 0.6))
    # Rubble heaped in it: broken slabs and bricks.
    rng = random.Random(9)
    for k in range(16):
        x, z = (rng.random() - 0.5) * 0.8, (rng.random() - 0.5) * 1.3
        s = 0.07 + rng.random() * 0.09
        y = 0.6 + rng.random() * 0.1
        a.box((s * 1.4, s * 0.8, s), (x, y, z), M["rubble"] if k % 3 else M["brick"], rot=(rng.random(), rng.random() * 3, rng.random()))
    a.box((0.9, 0.05, 1.3), (0, 0.58, 0), M["rubble"])
    return parts + a.objects("skipFittings")


def build():
    kit.reset()
    M = palette()
    objs = [
        finish(mixer(M), "Mixer"),
        finish(excavator(M), "Excavator"),
        finish(hut(M), "SiteHut"),
        finish(materials(M), "Materials"),
        finish(brick_pallet(M), "BrickPallet"),
        finish(portaloo(M), "Portaloo"),
        finish(skip(M), "Skip"),
    ]
    bake_apart(objs)
    return objs



def preview(n):
    import bpy

    objs = build()
    keep = {0: objs[:4], 1: objs[:2], 2: objs[2:4], 3: objs[4:]}[n]
    for obj in objs:
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    xs = {0: [0, 3.2, 7.6, 13.5], 1: [0, 3.0], 2: [0, 5.0], 3: [0, 2.5, 5.0]}[n]
    for obj, x in zip(keep, xs):
        obj.location.x = x
    return keep
