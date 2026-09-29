"""
The road crew's truck, NEAR level (`works-truck.glb`'s detailed twin): the lean
script's chassis-cab and dropside bed (`blender/incidents/works_truck.py`)
rebuilt with rounded edges, near wheels, lamps, light bar, mirrors and
handles (`vnear.install`), and on top: reflective sleeves on every cone in the
stacks, dropside latches with their chains, a toolbox, a spade and a broom
racked on the bed, a jerrycan, a folded warning triangle, tie-down straps,
mud flaps and legible plates.

    blender -b --python blender/export.py -- blender/scenes_near/works_truck_near.py works-truck-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vnear  # noqa: E402

vnear.install()

import kit  # noqa: E402
import works_truck as lean  # noqa: E402
from fleet import chassis_cab, light_bar, wheels  # noqa: E402
from kit import finish  # noqa: E402
from kit_near import Acc  # noqa: E402

SPEC, HALF, W, W2, FLOOR, STACKS = lean.SPEC, lean.HALF, lean.W, lean.W2, lean.FLOOR, lean.STACKS


def palette():
    M = lean.palette()
    M["rubber"] = kit.material("tyre", "#26282b", "fabric", 0.9)
    M["chain"] = kit.material("chain", "#6f747b", "metal", 0.4, 0.5)
    M["wood"] = kit.material("timber", "#b59a6f", "timber", 0.8)
    M["jerry"] = kit.material("jerry", "#3d6f3a", "metal", 0.5)
    M["bristle"] = kit.material("bristle", "#6d5b47", "fabric", 0.9)
    M["strap"] = kit.material("strap", "#2f6fb0", "fabric", 0.6)
    return M


def extras(M):
    a = Acc()
    tail = -HALF
    # Sleeves on every cone in the stacks: bands of reflective sheeting.
    for x, z in STACKS:
        for i in range(3):
            y = FLOOR + 0.04 + i * 0.07
            a.disc((x, y + 0.22, z), 0.1, 0.05, M["band"], "y", 14, radius2=0.085, caps=(False, False))
        a.disc((x, FLOOR + 0.05, z), 0.14, 0.016, M["cone"], "y", 14)
    # Dropside latches with chains along both sides, and corner posts.
    for s in (-1, 1):
        for z in (-0.2, -0.75, -1.3):
            a.box((0.03, 0.06, 0.05), (s * (W2 + 0.012), FLOOR + 0.2, z), M["steel"])
            a.ring((s * (W2 + 0.03), FLOOR + 0.12, z), 0.02, 0.005, M["chain"], "x", 8, 4)
        for z in (lean.SPEC["cabBack"] - 0.05, tail + 0.03):
            a.box((0.05, 0.42, 0.05), (s * (W2 - 0.02), FLOOR + 0.21, z), M["steel"])
        a.box((0.012, 0.22, 0.24), (s * (W2 - 0.03), 0.16, SPEC["rear"] - 0.4), M["rubber"])
    # A toolbox behind the headboard on the +x side, with lid, latches and handle.
    a.box((0.4, 0.2, 0.26), (0.34, FLOOR + 0.1, -0.05 + 0.0), M["dark"])
    a.box((0.42, 0.03, 0.28), (0.34, FLOOR + 0.215, -0.05), M["steel"])
    a.box((0.02, 0.04, 0.02), (0.22, FLOOR + 0.15, 0.09), M["chrome"])
    a.box((0.02, 0.04, 0.02), (0.46, FLOOR + 0.15, 0.09), M["chrome"])
    a.tube((0.28, FLOOR + 0.24, -0.05), (0.4, FLOOR + 0.24, -0.05), 0.01, 0.01, M["chrome"], 6)
    # A spade and a broom lying along the -x dropside, and a jerrycan.
    a.tube((-0.42, FLOOR + 0.06, -0.05), (-0.42, FLOOR + 0.06, -1.5), 0.016, 0.016, M["wood"], 6)
    a.box((0.2, 0.02, 0.26), (-0.42, FLOOR + 0.06, -1.62), M["steel"], rot=(0, 0, 0))
    a.tube((-0.36, FLOOR + 0.06, -0.15), (-0.36, FLOOR + 0.06, -1.3), 0.014, 0.014, M["wood"], 6)
    a.box((0.28, 0.05, 0.12), (-0.36, FLOOR + 0.065, -1.36), M["bristle"])
    a.box((0.2, 0.28, 0.12), (0.4, FLOOR + 0.14, -1.6), M["jerry"])
    a.disc((0.4, FLOOR + 0.3, -1.6), 0.03, 0.03, M["dark"], "y", 8)
    a.box((0.02, 0.08, 0.1), (0.4, FLOOR + 0.28, -1.6), M["jerry"])
    # A folded warning triangle in its case on the tailgate, and tie-down straps.
    a.box((0.34, 0.03, 0.03), (-0.1, FLOOR + 0.3, tail + 0.06), M["red"])
    for z in (-0.45, -1.35):
        a.box((W - 0.1, 0.012, 0.05), (0, FLOOR + 0.002, z), M["strap"])
    # A mesh guard over the headboard: horizontal bars to close the panel.
    for y in (FLOOR + 0.5, FLOOR + 0.68):
        a.box((W - 0.06, 0.02, 0.02), (0, y, SPEC["cabBack"] - 0.05), M["steel"])
    # Plate characters, front and back.
    for z, f, y in ((HALF + 0.115, 1, SPEC["bumperY"]), (tail + 0.032, -1, 0.44)):
        for k in range(6):
            a.box((0.016, 0.04, 0.008), (-0.08 + k * 0.032, y, z + f * 0.006), M["dark"])
    return a.objects("extras")


def build():
    kit.reset()
    M = palette()
    bar, markers = light_bar(
        M, "works", SPEC["roof"] + 0.07, lean.BAR_Z, 0.64, [(-0.17, M["lensAmber"]), (0.17, M["lensAmber"])], depth=0.22, foot=0.03, lens_w=0.24
    )
    truck = finish(
        chassis_cab(M, SPEC, M["orange"]) + lean.bed(M) + bar
        + wheels(M, SPEC["r"], SPEC["wheelX"], (SPEC["front"], SPEC["rear"]), width=0.24) + extras(M),
        "WorksTruck",
    )
    kit.bake_ao([truck], floor=0.55)
    return [truck, *markers]
