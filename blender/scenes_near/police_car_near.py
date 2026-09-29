"""
The police car, NEAR level (`police-car.glb`'s detailed twin): the lean
script's body (`blender/incidents/police_car.py`) rebuilt with rounded edges,
near wheels, lamps, light bar, mirrors and handles (`vnear.install`), and a
Battenburg chequer on the livery band, POLICE lettering on the doors and
bonnet, an aerial, a roof spotlight, wipers front and back, door hinges, fuel
flap, mud flaps, grille slats and legible plates.

    blender -b --python blender/export.py -- blender/scenes_near/police_car_near.py police-car-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vnear  # noqa: E402

vnear.install()

import kit  # noqa: E402
import police_car as lean  # noqa: E402
from fleet import light_bar, wheels  # noqa: E402
from kit import finish  # noqa: E402
from kit_near import Acc  # noqa: E402

HALF, W2, ROOF = lean.HALF, lean.W2, lean.ROOF
WZ, WR = lean.WHEEL_Z, lean.WHEEL_R

# A blocky five-by-seven face for each letter of POLICE: a row of columns.
LETTERS = {
    "P": ["###", "#.#", "###", "#..", "#.."],
    "O": ["###", "#.#", "#.#", "#.#", "###"],
    "L": ["#..", "#..", "#..", "#..", "###"],
    "I": ["###", ".#.", ".#.", ".#.", "###"],
    "C": ["###", "#..", "#..", "#..", "###"],
    "E": ["###", "#..", "##.", "#..", "###"],
}


def palette():
    M = lean.palette()
    M["rubber"] = kit.material("tyre", "#26282b", "fabric", 0.9)
    return M


def lettering(a, mat, x, y, z0, size, word="POLICE", side=1):
    """`word` in blocky letters on a flank, cell `size`, its foot at `y`,
    standing proud of the panel at `x`, reading left to right as seen from
    outside: towards +z on the -x flank and towards -z on the +x one."""
    z = z0
    d = 1 if side < 0 else -1
    for ch in word:
        rows = LETTERS[ch]
        for r, line in enumerate(rows):
            for c, cell in enumerate(line):
                if cell == "#":
                    a.box((0.006, size, size), (x, y + (len(rows) - 1 - r) * size, z + d * c * size), mat)
        z += d * (len(rows[0]) + 1) * size


def extras(M):
    a = Acc()
    x = W2 + 0.007
    # Battenburg squares along the blue band: white over blue in two rows.
    for side in (-1, 1):
        for z0, z1 in ((-1.4, -1.19), (-0.66, 0.66), (1.19, 1.38)):
            n = int((z1 - z0) / 0.13)
            for k in range(n):
                z = z0 + 0.065 + k * 0.13
                a.box((0.004, 0.065, 0.13), (side * (x + 0.002), 0.44 - 0.0325 + (0.065 if k % 2 else 0), z), M["white"])
    # POLICE on both doors, running back to front (so it reads from either side),
    # and on the bonnet, all in blocky letters.
    for side in (-1, 1):
        s = 0.028
        length = 6 * 4 * s - s
        lettering(a, M["blue"], side * (x + 0.006), 0.545, (-length / 2 if side < 0 else length / 2) - 0.02, s, "POLICE", side)
    # Hinges and the fuel flap, a spotlight on the A pillar and an aerial.
    for side in (-1, 1):
        for y in (0.3, 0.55):
            a.disc((side * (W2 + 0.006), y, 0.6), 0.012, 0.06, M["dark"], "y", 6)
        a.disc((side * (W2 + 0.004), 0.5, -1.25), 0.035, 0.01, M["dark"], "x", 10)
        a.tube((side * (W2 - 0.02), 0.98, 0.36), (side * (W2 + 0.05), 1.06, 0.4), 0.007, 0.007, M["dark"], 5)
        a.disc((side * (W2 + 0.06), 1.06, 0.42), 0.035, 0.05, M["dark"], "z", 8)
        a.disc((side * (W2 + 0.06), 1.06, 0.447), 0.026, 0.01, M["head"], "z", 8)
        for z in (WZ, -WZ):
            # Mud flaps behind each wheel.
            a.box((0.012, 0.13, 0.17), (side * (W2 - 0.02), 0.1, z - 0.3), M["rubber"])
    a.tube((-0.3, ROOF + 0.02, -0.85), (-0.34, ROOF + 0.6, -0.9), 0.006, 0.003, M["dark"], 5, cap1=True)
    a.disc((-0.3, ROOF + 0.02, -0.85), 0.03, 0.04, M["dark"], "y", 8)
    # Wipers: front (on the raked screen's foot) and rear.
    for x0, l in ((-0.3, 0.34), (0.06, 0.3)):
        a.tube((x0 - l / 2, 0.635, 0.6), (x0 + l / 2, 0.66, 0.588), 0.006, 0.006, M["dark"], 5)
    a.tube((-0.15, 0.64, -0.99), (0.15, 0.66, -0.987), 0.006, 0.006, M["dark"], 5)
    # More grille slats, fog lamps in the bumper and plates with characters.
    for y in (0.34, 0.38, 0.42):
        a.box((0.4, 0.012, 0.012), (0, y, HALF + 0.024), M["chrome"])
    for s in (-1, 1):
        a.disc((s * 0.42, 0.24, HALF + 0.028), 0.03, 0.02, M["head"], "z", 10)
    for z, f, y in ((HALF + 0.07, 1, 0.29), (-HALF - 0.07, -1, 0.29)):
        for k in range(6):
            a.box((0.016, 0.04, 0.008), (-0.08 + k * 0.032, y, z + f * 0.006), M["dark"])
    # A roof number panel's digits and the light bar's spotlight.
    for k in range(3):
        a.box((0.03, 0.006, 0.09), (-0.05 + k * 0.05, ROOF + 0.052, 0.02), M["white"])
    return a.objects("extras")


def build():
    kit.reset()
    M = palette()
    bar, markers = light_bar(
        M, "police", ROOF + 0.04, lean.BAR_Z, 0.94, [(-0.26, M["lensBlue"]), (0.26, M["lensRed"])], depth=0.26, foot=0.04, lens_w=0.36
    )
    car = finish(lean.body(M) + bar + wheels(M, WR, lean.WHEEL_X, (WZ, -WZ), width=0.22) + extras(M), "PoliceCar")
    kit.bake_ao([car], floor=0.55)
    return [car, *markers]
