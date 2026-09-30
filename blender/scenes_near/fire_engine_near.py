"""
The fire engine, NEAR level (`fire-engine.glb`'s detailed twin): the lean
script's cab, body and turntable ladder (`blender/fire_truck.py`) rebuilt with
rounded edges and near wheels, and on top the equipment a close camera reads:
two hose reels on the top deck with crank handles and hose wound in layers, a
flaked hose bed, a roof monitor, air horns and a spotlight on the cab, wipers,
door hinges, a pump panel of gauges, valve wheels and brass inlets on the
flanks, tow eyes, mud flaps, handles on the roller shutters and legible plates.
Two nodes as before: `FireEngine`, and `Ladder` on the turntable pivot, whose
aerial now has rungs at twenty centimetres, braced rails, slides at the
section joints, the water pipe and the monitor nozzle.

    blender -b --python blender/export.py -- blender/scenes_near/fire_engine_near.py fire-engine-near
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vnear  # noqa: E402

vnear.install()

import fire_truck as lean  # noqa: E402
import kit  # noqa: E402
from kit import finish, strut  # noqa: E402
from kit_near import Acc  # noqa: E402

HALF, W2, WIDTH = lean.HALF, lean.W2, lean.WIDTH
PIVOT, PITCH, LENGTH = lean.LADDER_PIVOT, lean.LADDER_PITCH, lean.LADDER_LENGTH


def palette():
    M = lean.palette()
    m = kit.material
    M["brass"] = m("brass", "#b08d3c", "metal", 0.35, 0.7)
    M["hose"] = m("hose", "#c9b98a", "fabric", 0.85)
    M["hoseDark"] = m("hose", "#c9b98a", "fabric", 0.85, tone=0.72)
    M["rubber"] = m("tyre", "#26282b", "fabric", 0.9)
    M["gauge"] = m("gauge", "#eeece6", "glass", 0.3)
    M["valve"] = m("valve", "#c8493c", "metal", 0.5)
    M["blueValve"] = m("valveB", "#2f6fb0", "metal", 0.5)
    M["plate"] = m("plate", "#d5d0bc", "metal", 0.5)
    M["wood"] = m("timber", "#b59a6f", "timber", 0.8)
    return M


def reel(a, M, cx, cy, cz, radius=0.18, flange=0.3, width=0.5):
    """A hose reel with its axis along x: flanges, a core, hose wound in
    layers, a crank handle and a stand."""
    a.disc((cx, cy, cz), radius, width, M["steel"], "x", 16)
    for s in (-1, 1):
        a.disc((cx + s * (width / 2 + 0.01), cy, cz), flange, 0.02, M["dark"], "x", 20)
        # spokes on the flange
        for k in range(6):
            ang = math.pi * k / 3
            a.rod((cx + s * (width / 2 + 0.03), cy, cz), (cx + s * (width / 2 + 0.03), cy + math.cos(ang) * flange * 0.85, cz + math.sin(ang) * flange * 0.85), 0.02, 0.012, M["steel"], ends=True)
    # Hose wound in four layers of flat bands.
    for layer in range(3):
        r = radius + 0.02 + layer * 0.03
        for k in range(8):
            x = cx - width / 2 + 0.04 + k * (width - 0.08) / 7
            a.disc((x, cy, cz), r, (width - 0.08) / 8 * 0.94, M["hose"] if (k + layer) % 2 else M["hoseDark"], "x", 16, caps=(False, False))
    # The hose's free end and its brass coupling, leaving the top.
    a.tube((cx, cy + radius + 0.09, cz), (cx, cy + radius + 0.12, cz + 0.32), 0.028, 0.028, M["hose"], 8)
    a.disc((cx, cy + radius + 0.12, cz + 0.36), 0.035, 0.08, M["brass"], "z", 10)
    # Crank handle on one flange and a stand under the drum.
    a.tube((cx + width / 2 + 0.04, cy, cz), (cx + width / 2 + 0.11, cy, cz), 0.014, 0.014, M["steel"], 6)
    a.tube((cx + width / 2 + 0.11, cy, cz), (cx + width / 2 + 0.11, cy - 0.18, cz + 0.06), 0.011, 0.011, M["steel"], 6)
    a.tube((cx + width / 2 + 0.11, cy - 0.18, cz + 0.06), (cx + width / 2 + 0.2, cy - 0.18, cz + 0.06), 0.014, 0.014, M["dark"], 6)
    for s in (-1, 1):
        a.box((0.03, cy - 1.5, 0.14), (cx + s * (width / 2 + 0.02), (cy + 1.5) / 2 - 0.05, cz), M["dark"])


def extras(M):
    a = Acc()
    tail = -HALF
    deck_y = 1.515
    # Two hose reels on the top deck, behind the cab, either side of the walkway.
    for s in (-1, 1):
        reel(a, M, s * 0.34, deck_y + 0.3, -0.45, radius=0.16, flange=0.26, width=0.24)
    # A hose bed: flaked hose layers filling the well behind the reels.
    rng = random.Random(2)
    for layer in range(4):
        for k in range(4):
            a.box((0.44 - 0.02 * layer, 0.035, 0.11), (0.0, deck_y + 0.03 + 0.05 * layer, -0.85 - 0.13 * k), M["hose"] if (k + layer) % 2 else M["hoseDark"])
    for k in range(4):
        a.box((0.5, 0.06, 0.02), (0, deck_y + 0.03, -0.8 - 0.13 * k), M["dark"])
    # Air horns and a spotlight on the cab roof, and a roof monitor.
    for k in range(2):
        a.tube((-0.3 + k * 0.08, lean.ROOF + 0.09, 1.0), (-0.3 + k * 0.08, lean.ROOF + 0.29, 1.0), 0.02, 0.03, M["brass"], 8, cap1=True)
    a.disc((0.34, lean.ROOF + 0.12, 1.1), 0.05, 0.08, M["dark"], "y", 10)
    a.disc((0.34, lean.ROOF + 0.13, 1.145), 0.038, 0.02, M["head"], "z", 10)
    a.tube((0.34, lean.ROOF + 0.09, 1.1), (0.34, lean.ROOF + 0.13, 1.1), 0.025, 0.025, M["steel"], 6)
    # Siren speaker grille and a roof vent above the crew cab.
    a.box((0.34, 0.06, 0.16), (0.0, lean.ROOF + 0.11, 1.45), M["dark"])
    for k in range(5):
        a.box((0.3, 0.008, 0.02), (0.0, lean.ROOF + 0.145, 1.4 + k * 0.03), M["steel"])
    # Windscreen wipers on the raked glass.
    for x0, l in ((-0.32, 0.36), (0.02, 0.3)):
        a.tube((x0 - l / 2, 1.335, 2.365), (x0 + l / 2, 1.36, 2.35), 0.008, 0.008, M["dark"], 5)
    # Door hinges, crew-cab grab handles, flanks' steps with tread ribs.
    for s in (-1, 1):
        for z in (2.29, 1.65):
            for y in (0.7, 1.4):
                a.disc((s * (W2 + 0.01), y, z), 0.014, 0.09, M["dark"], "y", 6)
        a.tube((s * (W2 + 0.03), 1.1, 1.0), (s * (W2 + 0.03), 1.45, 1.0), 0.013, 0.013, M["chrome"], 6)
        a.tube((s * (W2 + 0.03), 1.1, 0.85), (s * (W2 + 0.03), 1.45, 0.85), 0.013, 0.013, M["chrome"], 6)
        for k in range(4):
            a.box((0.14, 0.008, 0.02), (s * (W2 - 0.02), 0.385, 0.88 + k * 0.1), M["steel"])
    # A pump panel on the -x flank ahead of the rear wheel: a plate with
    # pressure gauges, valve wheels and brass inlets below.
    px = -(W2 + 0.02)
    for i in range(3):
        a.disc((px - 0.006, 0.94, -0.98 - i * 0.16 + 0.02), 0.06, 0.02, M["chrome"], "x", 14)
        a.disc((px - 0.016, 0.94, -0.98 - i * 0.16 + 0.02), 0.05, 0.01, M["gauge"], "x", 14)
        a.rod((px - 0.02, 0.94, -0.98 - i * 0.16 + 0.02), (px - 0.02, 0.965, -0.98 - i * 0.16 + 0.04), 0.006, 0.004, M["dark"], ends=True)
    for i in range(3):
        z = -0.98 - i * 0.16 + 0.02
        a.disc((px - 0.02, 0.52, z), 0.055, 0.014, M["valve"] if i != 1 else M["blueValve"], "x", 12)
        a.tube((px - 0.02, 0.52, z), (px - 0.0, 0.52, z), 0.012, 0.012, M["steel"], 6)
        for k in range(4):
            ang = k * math.pi / 2
            a.tube((px - 0.028, 0.52 + math.cos(ang) * 0.03, z + math.sin(ang) * 0.03), (px - 0.028, 0.52 - math.cos(ang) * 0.03, z - math.sin(ang) * 0.03), 0.005, 0.005, M["steel"], 4) if k < 2 else None
    for z in (-0.5, -1.4):
        a.disc((px - 0.05, 0.36, z), 0.055, 0.1, M["brass"], "x", 12)
        a.disc((px - 0.11, 0.36, z), 0.065, 0.03, M["brass"], "x", 12)
        a.tube((px - 0.05, 0.36, z), (px + 0.0, 0.36, z), 0.03, 0.03, M["dark"], 8)
    # Shutter lift handles and lock bars (both flanks), and the rear grab rail.
    for s in (-1, 1):
        for z0, z1 in ((-0.06, 0.7), (-0.88, -0.1), (-2.38, -1.9)):
            zc = (z0 + z1) / 2
            a.box((0.03, 0.03, 0.22), (s * (W2 + 0.02), 0.48, zc), M["chrome"])
            a.tube((s * (W2 + 0.03), 0.48, zc - 0.09), (s * (W2 + 0.03), 0.48, zc + 0.09), 0.009, 0.009, M["dark"], 6)
    # Tow eyes, mud flaps and a plate with characters on both ends.
    for s in (-1, 1):
        a.ring((s * 0.42, 0.26, HALF + 0.05), 0.05, 0.014, M["dark"], "z", 10, 5)
        for z in (lean.FRONT_Z - 0.36, lean.REAR_Z - 0.36):
            a.box((0.012, 0.26, 0.28), (s * (W2 - 0.03), 0.16, z), M["rubber"])
    for z, f, y in ((HALF + 0.045, 1, 0.34), (tail - 0.025, -1, 0.5)):
        a.box((0.24, 0.07, 0.008), (0, y, z), M["plate"])
        for k in range(6):
            a.box((0.016, 0.04, 0.006), (-0.08 + k * 0.032, y, z + f * 0.006), M["dark"])
    # A hydrant key and axe on clips on the rear body's face.
    a.tube((0.5, 0.95, tail - 0.02), (0.5, 1.4, tail - 0.02), 0.014, 0.014, M["wood"], 6)
    a.box((0.14, 0.08, 0.02), (0.5, 1.4, tail - 0.02), M["steel"])
    return a.objects("extras")


def ladder_near(M):
    """The aerial, built in place then re-origined on the pivot: as the lean
    one, with rungs every twenty centimetres, braced rails, slides at the
    joints, the water pipe and the monitor."""
    px, py, pz = PIVOT
    d = (0.0, math.sin(PITCH), -math.cos(PITCH))
    n = (0.0, math.cos(PITCH), math.sin(PITCH))

    def at(along, lift=0.0, x=0.0):
        return (px + x, py + d[1] * along + n[1] * lift, pz + d[2] * along + n[2] * lift)

    a = Acc()
    parts = list(lean.ladder(M))
    # Intermediate rungs and diagonal bracing between the rails, both sections.
    for start, end, half, lift in ((-0.2, 3.3, 0.24, 0.02), (LENGTH - 3.3, LENGTH, 0.17, 0.1)):
        s = start + 0.4
        while s < end - 0.05:
            a.tube(at(s, lift, -half), at(s, lift, half), 0.011, 0.011, M["chrome"], 6)
            s += 0.4
        s = start + 0.2
        while s < end - 0.4:
            a.tube(at(s, lift, -half), at(s + 0.4, lift + 0.2, -half), 0.008, 0.008, M["steel"], 5)
            a.tube(at(s, lift, half), at(s + 0.4, lift + 0.2, half), 0.008, 0.008, M["steel"], 5)
            s += 0.4
    # Slides where the sections run on each other.
    for x in (-0.24, 0.24):
        a.box((0.1, 0.08, 0.18), at(3.25, 0.02, x), M["dark"])
        a.box((0.09, 0.07, 0.16), at(LENGTH - 3.25, 0.1, x * 0.7), M["dark"])
    # The water pipe along the centre of the aerial, a valve mid-way and the monitor.
    a.tube(at(0.2, 0.06), at(LENGTH - 0.15, 0.14), 0.04, 0.03, M["steel"], 10)
    nozzle_a = at(LENGTH + 0.05, 0.16)
    nozzle_b = at(LENGTH + 0.5, 0.2)
    a.tube(nozzle_a, nozzle_b, 0.055, 0.04, M["steel"], 12)
    a.tube(nozzle_b, at(LENGTH + 0.58, 0.2), 0.045, 0.036, M["dark"], 12, cap1=True)
    a.disc(at(LENGTH, 0.1), 0.09, 0.1, M["valve"], "y", 10)
    for s in (-1, 1):
        a.tube(at(LENGTH + 0.2, 0.19), at(LENGTH + 0.2, 0.19, s * 0.1), 0.012, 0.012, M["steel"], 5)
    # The ram's hydraulic lines and the ladder's foot hinge lugs.
    for s in (-1, 1):
        a.tube((s * 0.04, py - 0.1, pz - 0.38), (s * 0.04, py - 0.05, pz - 0.2), 0.01, 0.01, M["dark"], 5)
        a.box((0.05, 0.16, 0.12), at(-0.15, 0.0, s * 0.27), M["dark"])
    return parts + a.objects("aerialFit")


def build():
    kit.reset()
    M = palette()
    wheels = vnear.near_wheels(M, lean.WHEEL_R, lean.WHEEL_X, (lean.FRONT_Z, lean.REAR_Z), width=0.27)
    truck = finish(lean.cab(M) + lean.body(M) + wheels + extras(M), "FireEngine")
    arm = finish(ladder_near(M), "Ladder", origin=PIVOT)
    kit.bake_ao([truck, arm], floor=0.55)
    return [truck, arm]
