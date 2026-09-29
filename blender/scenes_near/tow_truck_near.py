"""
The tow truck, NEAR level (`tow-truck.glb`'s detailed twin): the lean
script's chassis-cab, lockers, boom and wheel-lift
(`blender/incidents/tow_truck.py`) rebuilt with rounded edges, near wheels,
lamps, light bar, mirrors and handles (`vnear.install`), and on top a winch
cable, a forged hook with its latch, hydraulic hoses along the boom, a heap of
chain on the deck, work lamps on the boom head, locker handles and hinges,
rubber cradles on the wheel-lift's forks, mud flaps and hazard chevrons on the
tail. The boom's foot, head and hook markers stay where they were.

    blender -b --python blender/export.py -- blender/scenes_near/tow_truck_near.py tow-truck-near
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vnear  # noqa: E402

vnear.install()

import kit  # noqa: E402
import tow_truck as lean  # noqa: E402
from fleet import chassis_cab, light_bar, wheels  # noqa: E402
from kit import finish, marker  # noqa: E402
from kit_near import Acc  # noqa: E402

SPEC, HALF, W, W2 = lean.SPEC, lean.HALF, lean.W, lean.W2
BOOM_FOOT, BOOM_HEAD, HOOK_Y = lean.BOOM_FOOT, lean.BOOM_HEAD, lean.HOOK_Y


def palette():
    M = lean.palette()
    M["rubber"] = kit.material("tyre", "#26282b", "fabric", 0.9)
    M["chain"] = kit.material("chain", "#6f747b", "metal", 0.4, 0.5)
    M["hazardY"] = kit.material("yellow", "#d8a43c", "metal", 0.45)
    M["hazardR"] = kit.material("red", "#c8493c", "metal", 0.5)
    return M


def extras(M):
    a = Acc()
    tail = -HALF
    hx, hy, hz = 0.0, HOOK_Y, BOOM_HEAD[2]
    # Winch cable from the drum, along the boom's underside, over the sheave.
    a.tube((0.0, 1.0, BOOM_FOOT[2] + 0.34), (0.0, BOOM_HEAD[1] - 0.06, BOOM_HEAD[2] + 0.02), 0.009, 0.009, M["black"], 5)
    # Hydraulic hoses on both sides of the boom, clamped at three points.
    d = [BOOM_HEAD[i] - BOOM_FOOT[i] for i in range(3)]
    for s in (-1, 1):
        pts = [(s * 0.13, BOOM_FOOT[1] - 0.15 + d[1] * t, BOOM_FOOT[2] + d[2] * t - 0.14) for t in (0.05, 0.25, 0.5, 0.72)]
        a.polyline(pts, 0.014, M["black"], sides=6)
        for p in pts[1:]:
            a.box((0.05, 0.05, 0.03), p, M["dark"])
    # The hook: a forged J with a safety latch and a swivel above it.
    a.tube((hx, hy + 0.08, hz), (hx, hy - 0.02, hz), 0.03, 0.02, M["steel"], 8, cap0=True)
    a.box((0.13, 0.05, 0.1), (hx, hy + 0.06, hz), M["black"])
    pts = [(hx, hy - 0.02, hz)] + [(hx + 0.09 * (1 - math.cos(t)), hy - 0.02 - 0.09 * math.sin(t) * 1.2, hz) for t in [k / 8 * math.pi * 1.15 for k in range(1, 9)]]
    a.polyline(pts, 0.02, M["steel"], sides=8)
    a.tube((hx + 0.02, hy - 0.06, hz), (hx + 0.13, hy - 0.16, hz), 0.006, 0.006, M["dark"], 4)
    # Work lamps on the boom head, aimed at the job, and a beacon on the boom foot.
    for s in (-1, 1):
        a.box((0.12, 0.09, 0.08), (s * 0.13, BOOM_HEAD[1] + 0.1, BOOM_HEAD[2] + 0.08), M["dark"])
        a.box((0.08, 0.06, 0.02), (s * 0.13, BOOM_HEAD[1] + 0.1, BOOM_HEAD[2] + 0.125), M["head"])
        a.tube((s * 0.13, BOOM_HEAD[1] + 0.04, BOOM_HEAD[2] + 0.06), (s * 0.06, BOOM_HEAD[1] - 0.02, BOOM_HEAD[2] + 0.02), 0.01, 0.01, M["steel"], 5)
    # Chain heaped on the deck between the lockers, and a strap coil.
    rng = random.Random(4)
    for k in range(16):
        a.ring((rng.uniform(-0.12, 0.12), 0.7 + 0.03 * (k % 4), rng.uniform(-1.55, -1.25)), 0.03, 0.007, M["chain"], "y" if k % 2 else "x", 8, 4)
    # Lockers: a handle and hinge on each flank's shutters, and lock bars.
    for s in (-1, 1):
        for z in (-1.0, -0.23):
            a.tube((s * (W2 + 0.03), 0.79, z - 0.12), (s * (W2 + 0.03), 0.79, z + 0.12), 0.012, 0.012, M["chrome"], 6, cap0=True, cap1=True)
        # Mud flaps behind the rear wheels and a side marker.
        a.box((0.012, 0.22, 0.24), (s * (W2 - 0.03), 0.16, SPEC["rear"] - 0.42), M["rubber"])
        a.box((0.008, 0.04, 0.1), (s * (W2 + 0.006), 0.95, -1.7), M["amber"])
    # Rubber cradles on the wheel-lift's forks, and their chains' hooks.
    for s in (-1, 1):
        a.box((0.12, 0.05, 0.22), (s * 0.42, 0.335, tail - 0.66), M["rubber"])
        a.ring((s * 0.42, 0.29, tail - 0.83), 0.03, 0.007, M["steel"], "x", 8, 4)
    # Hazard chevrons on the rear crossbar and the tail lamps' housings.
    for k in range(8):
        a.box((0.06, 0.11, 0.012), (-0.42 + k * 0.12, 0.3, tail - 0.594), M["hazardY"] if k % 2 else M["hazardR"], rot=(0, 0, 0.6))
    for s in (-1, 1):
        a.box((0.16, 0.14, 0.04), (s * 0.44, 0.45, tail - 0.02), M["dark"])
    a.box((0.22, 0.06, 0.02), (0, 0.3, tail - 0.5), M["plate"])
    for k in range(6):
        a.box((0.016, 0.03, 0.008), (-0.08 + k * 0.032, 0.3, tail - 0.512), M["dark"])
    # A diesel cap on the cab's flank.
    a.disc((W2 + 0.004, 0.55, 0.3), 0.045, 0.012, M["dark"], "x", 10)
    return a.objects("extras")


def build():
    kit.reset()
    M = palette()
    roof_top = SPEC["roof"] + 0.07
    bar, markers = light_bar(
        M, "tow", roof_top, lean.BAR_Z, 0.72, [(-0.2, M["lensAmber"]), (0.2, M["lensAmber"])], depth=0.24, foot=0.03, lens_w=0.26
    )
    truck = finish(
        chassis_cab(M, SPEC, M["yellow"]) + lean.body(M) + lean.boom(M) + bar
        + wheels(M, SPEC["r"], SPEC["wheelX"], (SPEC["front"], SPEC["rear"]), width=0.24) + extras(M),
        "TowTruck",
    )
    kit.bake_ao([truck], floor=0.55)
    markers += [
        marker("tow.boom.foot", BOOM_FOOT),
        marker("tow.boom.head", BOOM_HEAD),
        marker("tow.hook", (0.0, HOOK_Y, BOOM_HEAD[2])),
    ]
    return [truck, *markers]
