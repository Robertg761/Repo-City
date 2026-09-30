"""
The ambulance, NEAR level (`ambulance.glb`'s detailed twin): the lean
script's own cab and patient box (`blender/incidents/ambulance.py`) rebuilt
with rounded edges, a near wheel, lamps with reflectors and ribs, a light bar
with ribbed lenses and finer mirrors and handles (`vnear.install`), and on top
the details of a real one: a Star of Life on the rear doors, a chequered
flank band, hinges and handles on the back doors, roof vents, a siren
speaker and an aerial, wipers, a fuel flap, mud flaps and legible plates.

    blender -b --python blender/export.py -- blender/scenes_near/ambulance_near.py ambulance-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vnear  # noqa: E402

vnear.install()

import ambulance as lean  # noqa: E402
import kit  # noqa: E402
from fleet import light_bar, wheels  # noqa: E402
from kit import finish, marker  # noqa: E402
from kit_near import Acc  # noqa: E402

HALF, W2 = lean.HALF, lean.W2
BOX_W, BOX_Z0, BOX_Z1, BOX_Y0, BOX_Y1 = lean.BOX_W, lean.BOX_Z0, lean.BOX_Z1, lean.BOX_Y0, lean.BOX_Y1


def palette():
    M = lean.palette()
    M["white2"] = kit.material("white", "#f4f5f2", "metal", 0.45)
    M["blueStar"] = kit.material("lensBlue", "#4f8bff", "glass", 0.2)
    M["rubber"] = kit.material("tyre", "#26282b", "fabric", 0.9)
    return M


def extras(M):
    a = Acc()
    back = BOX_Z0
    # Star of Life on each rear door: a blue hexagon with its six-armed star.
    for x in (-0.3, 0.3):
        a.disc((x, 1.0, back - 0.006), 0.15, 0.01, M["blueStar"], "z", 6)
        for k in range(3):
            ang = k * math.pi / 3 + math.pi / 2
            a.rod((x + math.cos(ang) * 0.11, 1.0 + math.sin(ang) * 0.11, back - 0.014),
                  (x - math.cos(ang) * 0.11, 1.0 - math.sin(ang) * 0.11, back - 0.014), 0.035, 0.008, M["white"], ends=True)
    # The flank band chequered: white squares along the red stripe, both sides.
    for side in (-1, 1):
        x = side * (BOX_W / 2 + 0.008)
        n = int((BOX_Z1 - BOX_Z0 - 0.1) / 0.2)
        for k in range(n):
            z = BOX_Z0 + 0.1 + k * 0.2 + 0.1
            if (k % 2) == 0:
                a.box((0.004, 0.05, 0.1), (x, 0.925, z), M["white"])
            else:
                a.box((0.004, 0.05, 0.1), (x, 0.875, z), M["white"])
    # Rear doors: three hinges a side, handles, drip rail, window frames.
    for s in (-1, 1):
        for y in (0.9, 1.15, 1.42):
            a.disc((s * (BOX_W / 2 - 0.02), y, back - 0.01), 0.016, 0.09, M["dark"], "y", 8)
        a.tube((s * 0.04, 1.0, back - 0.03), (s * 0.04, 1.2, back - 0.03), 0.01, 0.01, M["chrome"], 8, cap0=True, cap1=True)
        a.box((0.34, 0.02, 0.014), (s * 0.23, 1.187, back - 0.012), M["dark"])
        a.box((0.34, 0.02, 0.014), (s * 0.23, 1.413, back - 0.012), M["dark"])
        for dx in (-1, 1):
            a.box((0.02, 0.24, 0.014), (s * 0.23 + dx * 0.17, 1.3, back - 0.012), M["dark"])
    a.box((BOX_W - 0.04, 0.03, 0.05), (0, BOX_Y1 - 0.01, back - 0.02), M["white"])
    # Roof: two vents with slats, the siren speaker, an aerial and a floodlight.
    for x in (-0.3, 0.3):
        a.box((0.34, 0.05, 0.3), (x, BOX_Y1 + 0.025, -0.25), M["white"])
        for k in range(5):
            a.box((0.3, 0.012, 0.02), (x, BOX_Y1 + 0.056, -0.34 + k * 0.045), M["dark"])
    a.box((0.2, 0.08, 0.14), (0.0, 1.45 + 0.03, 0.75), M["dark"])
    for k in range(3):
        a.box((0.16, 0.008, 0.02), (0.0, 1.45 + 0.075, 0.71 + k * 0.04), M["steel"])
    a.tube((0.45, BOX_Y1, -0.6), (0.44, BOX_Y1 + 0.55, -0.62), 0.006, 0.003, M["dark"], 5, cap1=True)
    a.disc((0.45, BOX_Y1 + 0.02, -0.6), 0.03, 0.04, M["dark"], "y", 8)
    # Fuel flap, mud flaps, indicator repeaters and an oxygen-filler cap on the flanks.
    a.disc((-W2 - 0.003, 0.6, -0.55), 0.055, 0.012, M["dark"], "x", 10)
    a.disc((-W2 - 0.008, 0.6, -0.55), 0.035, 0.012, M["chrome"], "x", 10)
    for s in (-1, 1):
        for z in (1.02 - 0.3, -1.0 - 0.3):
            a.box((0.012, 0.16, 0.2), (s * (W2 - 0.02), 0.12, z), M["rubber"])
        a.box((0.008, 0.03, 0.08), (s * (W2 + 0.006), 0.66, 0.85), M["amber"])
    # The plates: a face and a few characters, front and back.
    for z, f in ((HALF + 0.062, 1), (BOX_Z0 - 0.02, -1)):
        for k in range(6):
            a.box((0.018, 0.04, 0.008), (-0.09 + k * 0.036, 0.29 if f > 0 else 0.44, z + f * 0.004), M["dark"])
    # Windscreen wipers, parked along the base of the screen.
    for x, l in ((-0.32, 0.36), (0.02, 0.32)):
        a.tube((x - l / 2, 0.83, 1.335), (x + l / 2, 0.87, 1.32), 0.007, 0.007, M["dark"], 5)
        a.disc((x - l / 2, 0.82, 1.34), 0.014, 0.02, M["dark"], "y", 6)
    # Side scene lamps at the box's front corners and grab handle at the cab door.
    for s in (-1, 1):
        a.box((0.02, 0.06, 0.12), (s * (BOX_W / 2 + 0.008), BOX_Y1 - 0.13, BOX_Z1 - 0.1), M["head"])
        a.tube((s * (W2 + 0.02), 0.84, 0.62), (s * (W2 + 0.02), 1.22, 0.62), 0.011, 0.011, M["chrome"], 6)
    return a.objects("extras")


def build():
    kit.reset()
    M = palette()
    bar, markers = light_bar(
        M, "ambulance", BOX_Y1, lean.BAR_Z, 0.9, [(-0.26, M["lensBlue"]), (0.26, M["lensBlue"])], depth=0.26, foot=0.03, lens_w=0.34
    )
    van = finish(
        lean.cab(M) + lean.patient_box(M) + bar + wheels(M, lean.WHEEL_R, lean.WHEEL_X, (lean.FRONT_Z, lean.REAR_Z), width=0.22) + extras(M),
        "Ambulance",
    )
    kit.bake_ao([van], floor=0.55)
    return [van, *markers]
