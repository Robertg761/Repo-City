"""
The ambulance, modelled by script (spike: Blender assets vs procedural).

The procedural one is the fleet's van in white with its stripe in red and a
cross on each flank (`emergency.ts`); this is a box-bodied ambulance on the
same footprint -- `BODY_SPECS.van` length, width and wheel positions -- with
the light bar where the procedural one has it, over the front of the box.
Out come:

  Ambulance           the ambulance, origin on the ground under its centre
  ambulance.lamp.<i>  the light bar's two blue lenses, -x then +x
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fleet  # noqa: E402
import kit  # noqa: E402
from fleet import cabin, cut_arches, handles, lamp_pair, light_bar, mirrors, seams, wheels, window  # noqa: E402
from kit import box, finish, plan_prism, prism, rounded_rect  # noqa: E402

# BODY_SPECS.van
LENGTH, WIDTH = 3.1, 1.16
HALF, W2 = LENGTH / 2, WIDTH / 2
WHEEL_R, WHEEL_X = 0.26, 0.54
FRONT_Z, REAR_Z = 1.02, -1.0
BOTTOM = 0.2
# The patient box: a hair wider than the cab, from the cab's back to the tail.
BOX_W = 1.2
BOX_Z0, BOX_Z1 = -HALF, 0.48
BOX_Y0, BOX_Y1 = 0.78, 1.54
BAR_Z = 0.28


def palette():
    return fleet.palette(
        white=("#f4f5f2", "metal", 0.45),
        red=("#c8493c", "metal", 0.45),
        frost=("#9fb0bd", "glass", 0.3),
        lensBlue=("#4f8bff", "glass", 0.2),
        lensRed=("#e8463e", "glass", 0.2),
    )


def cab(M):
    parts = []
    lower = prism(
        "lower",
        [(-HALF + 0.02, BOTTOM), (HALF, BOTTOM), (HALF, 0.5), (HALF - 0.08, 0.6), (1.34, 0.76), (0.5, 0.8), (-HALF + 0.02, 0.8)],
        WIDTH,
        M["white"],
        bev=0.035,
    )
    cut_arches(lower, (FRONT_Z, REAR_Z), WHEEL_R + 0.05, WIDTH, M)
    parts.append(lower)

    profile = [(1.38, 0.74), (0.96, 1.4), (0.44, 1.4), (0.44, 0.74)]
    core = [(1.34, 0.74), (0.95, 1.385), (0.46, 1.385), (0.46, 0.74)]
    lean = math.atan2(0.41, 0.62)
    cutters = [
        window(M, (0.94, 0.5, 0.2), (0, 1.07, 1.16), rot=(-lean, 0, 0)),
        prism("side", [(1.18, 0.86), (0.93, 1.31), (0.56, 1.31), (0.56, 0.86)], WIDTH + 0.3, M["glass"], bev=0.0),
    ]
    parts += cabin("cab", profile, core, WIDTH * 0.96, M["white"], M, cutters, bev=0.03)
    parts.append(plan_prism("cabRoof", rounded_rect(-0.56, 0.56, 0.44, 0.99, (0.06, 0.06, 0, 0), 2), 1.38, 1.44, M["white"], bev=0.02))

    # The face: a dark grille between tall lamps, bumper, plate.
    front = HALF
    parts.append(box("grille", (0.5, 0.16, 0.03), (0, 0.44, front + 0.005), M["trim"], bev=0.01))
    for y in (0.4, 0.44, 0.48):
        parts.append(box("grilleBar", (0.46, 0.014, 0.02), (0, y, front + 0.02), M["chrome"], bev=0.0))
    parts += lamp_pair(M, 0.4, 0.44, front, (0.16, 0.16), M["head"])
    parts += lamp_pair(M, 0.4, 0.33, front, (0.1, 0.05), M["amber"], housing=False)
    parts.append(box("bumper", (WIDTH + 0.04, 0.14, 0.16), (0, 0.29, front - 0.03), M["trim"], bev=0.03))
    parts.append(box("plate", (0.24, 0.07, 0.02), (0, 0.29, front + 0.06), M["plate"], bev=0.0))
    # A red band round the nose, under the headlamps, ties the cab to the box.
    parts.append(box("noseBand", (WIDTH + 0.01, 0.06, 0.95), (0, 0.66, 1.05), M["red"], bev=0.0))
    parts += mirrors(M, W2, 1.08, 0.98, reach=0.07, size=(0.03, 0.2, 0.08))
    parts += seams(M, W2 + 0.003, 0.26, 0.78, (1.24, 0.5))
    parts += handles(M, W2 + 0.01, 0.72, (0.62,))
    for side in (-1, 1):
        parts.append(box("step", (0.12, 0.04, 0.34), (side * (W2 - 0.03), 0.27, 0.7), M["trim"], bev=0.0))
    return parts


def patient_box(M):
    parts = []
    mid = (BOX_Z0 + BOX_Z1) / 2
    length = BOX_Z1 - BOX_Z0
    parts.append(box("box", (BOX_W, BOX_Y1 - BOX_Y0, length), (0, (BOX_Y0 + BOX_Y1) / 2, mid), M["white"], bev=0.04, cell=0.5))
    # A red stripe the length of the box, and a cross on each flank and the roof.
    xs = BOX_W / 2 + 0.004
    for side in (-1, 1):
        parts.append(box("stripe", (0.012, 0.1, length - 0.08), (side * xs, 0.9, mid), M["red"], bev=0.0))
        parts.append(box("crossV", (0.014, 0.42, 0.13), (side * xs, 1.24, -0.72), M["red"], bev=0.0))
        parts.append(box("crossH", (0.014, 0.13, 0.42), (side * xs, 1.24, -0.72), M["red"], bev=0.0))
    parts.append(box("roofV", (0.16, 0.012, 0.52), (0, BOX_Y1 + 0.004, -0.72), M["red"], bev=0.0))
    parts.append(box("roofH", (0.52, 0.012, 0.16), (0, BOX_Y1 + 0.004, -0.72), M["red"], bev=0.0))
    # The side door, on the kerb side (-x): seams, a frosted window, a handle.
    x = -(BOX_W / 2 + 0.003)
    for z in (0.36, -0.14):
        parts.append(box("seam", (0.01, 0.62, 0.012), (x, 1.13, z), M["dark"], bev=0.0))
    parts.append(box("doorTop", (0.01, 0.012, 0.5), (x, 1.44, 0.11), M["dark"], bev=0.0))
    parts.append(box("doorWin", (0.02, 0.2, 0.3), (x, 1.3, 0.11), M["frost"], bev=0.0))
    parts.append(box("doorHandle", (0.03, 0.03, 0.1), (x - 0.01, 1.06, -0.05), M["chrome"], bev=0.0))
    # A locker on the other flank.
    x = BOX_W / 2 + 0.003
    parts.append(box("locker", (0.012, 0.36, 0.44), (x, 1.12, 0.12), M["steel"], bev=0.0))
    for y in (1.02, 1.1, 1.18):
        parts.append(box("vent", (0.02, 0.02, 0.3), (x + 0.005, y, 0.12), M["dark"], bev=0.0))

    # The back: two doors with windows, a seam, grab rails, lamps, a step.
    back = BOX_Z0
    parts.append(box("rearSeam", (0.014, 0.66, 0.012), (0, 1.14, back - 0.004), M["dark"], bev=0.0))
    for side in (-1, 1):
        parts.append(box("rearWin", (0.34, 0.22, 0.02), (side * 0.23, 1.3, back - 0.006), M["frost"], bev=0.0))
        parts.append(box("grab", (0.03, 0.4, 0.03), (side * 0.06, 1.06, back - 0.03), M["chrome"], bev=0.0))
        parts.append(box("tail", (0.1, 0.26, 0.03), (side * 0.52, 0.66, back - 0.01), M["tail"], bev=0.01))
        parts.append(box("ind", (0.1, 0.08, 0.03), (side * 0.52, 0.48, back - 0.01), M["amber"], bev=0.01))
        # Warning lamps at the box's four top corners.
        for z, f in ((BOX_Z1, 1), (back, -1)):
            parts.append(box("corner", (0.1, 0.09, 0.03), (side * 0.5, BOX_Y1 - 0.08, z + f * 0.012), M["lensRed"], bev=0.01))
    parts.append(box("chevron", (BOX_W - 0.1, 0.08, 0.02), (0, 0.86, back - 0.006), M["red"], bev=0.0))
    parts.append(box("rearStep", (WIDTH + 0.02, 0.06, 0.24), (0, 0.32, back - 0.08), M["steel"], bev=0.015))
    parts.append(box("rearBumper", (WIDTH + 0.04, 0.12, 0.12), (0, 0.26, back + 0.02), M["trim"], bev=0.02))
    parts.append(box("plate", (0.24, 0.07, 0.02), (0, 0.44, back - 0.012), M["plate"], bev=0.0))
    return parts


def build():
    kit.reset()
    M = palette()
    bar, markers = light_bar(
        M, "ambulance", BOX_Y1, BAR_Z, 0.9, [(-0.26, M["lensBlue"]), (0.26, M["lensBlue"])], depth=0.26, foot=0.03, lens_w=0.34
    )
    van = finish(cab(M) + patient_box(M) + bar + wheels(M, WHEEL_R, WHEEL_X, (FRONT_Z, REAR_Z), width=0.22), "Ambulance")
    kit.bake_ao([van], floor=0.55)
    return [van, *markers]
