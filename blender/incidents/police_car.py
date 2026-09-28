"""
The police car, modelled by script (spike: Blender assets vs procedural).

The procedural one is the fleet's sedan in white with a blue band and a light
bar (`emergency.ts`); this is the same car at the same size -- `BODY_SPECS.sedan`
footprint, wheel positions, light bar over the rear seats -- built the way the
Blender fire engine is, so the incident fleet reads as one family. Out come:

  PoliceCar        the car, origin on the ground under its centre, nose +z
  police.lamp.<i>  the light bar's lenses, blue (-x) then red (+x)
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fleet  # noqa: E402
import kit  # noqa: E402
from fleet import cabin, cut_arches, handles, lamp_pair, light_bar, mirrors, seams, wheels, window  # noqa: E402
from kit import box, finish, plan_prism, prism, rounded_rect  # noqa: E402

# BODY_SPECS.sedan
LENGTH, WIDTH = 2.85, 1.1
HALF, W2 = LENGTH / 2, WIDTH / 2
WHEEL_R, WHEEL_X, WHEEL_Z = 0.25, 0.5, 0.92
BOTTOM = 0.18
ROOF = 1.0
BAR_Z = -0.23


def palette():
    return fleet.palette(
        white=("#f0f2f4", "metal", 0.45),
        blue=("#2f4f80", "metal", 0.45),
        black=("#2b2d31", "metal", 0.5),
        lensBlue=("#4f8bff", "glass", 0.2),
        lensRed=("#e8463e", "glass", 0.2),
    )


def body(M):
    parts = []
    # The lower body: bonnet, waist and boot in one side profile.
    lower = prism(
        "lower",
        [(-HALF, BOTTOM), (HALF, BOTTOM), (HALF, 0.42), (HALF - 0.1, 0.5), (1.28, 0.57), (0.62, 0.635),
         (-1.0, 0.655), (-1.36, 0.635), (-HALF, 0.5)],
        WIDTH,
        M["white"],
        bev=0.04,
    )
    cut_arches(lower, (WHEEL_Z, -WHEEL_Z), WHEEL_R + 0.05, WIDTH, M)
    parts.append(lower)

    # The glasshouse: raked screens front and back, two side windows a side
    # with the B pillar between them, white pillars over a dark glass core.
    profile = [(0.66, 0.6), (0.14, 1.0), (-0.6, 1.0), (-1.04, 0.62)]
    core = [(0.62, 0.6), (0.13, 0.985), (-0.59, 0.985), (-1.0, 0.62)]
    screen = math.atan2(0.52, 0.4)
    rear = math.atan2(0.44, 0.38)
    cutters = [
        window(M, (0.84, 0.42, 0.2), (0, 0.81, 0.4), rot=(-screen, 0, 0)),
        window(M, (0.84, 0.36, 0.2), (0, 0.8, -0.82), rot=(rear, 0, 0)),
        prism("sideF", [(0.5, 0.67), (0.15, 0.95), (-0.16, 0.95), (-0.16, 0.67)], WIDTH + 0.3, M["glass"], bev=0.0),
        prism("sideR", [(-0.25, 0.67), (-0.25, 0.95), (-0.58, 0.95), (-0.88, 0.67)], WIDTH + 0.3, M["glass"], bev=0.0),
    ]
    parts += cabin("cab", profile, core, WIDTH * 0.9, M["white"], M, cutters, bev=0.03)
    # The roof: a white cap over the glasshouse, a touch proud all round.
    parts.append(plan_prism("roof", rounded_rect(-0.5, 0.5, -0.63, 0.17, (0.08, 0.08, 0.08, 0.08), 2), ROOF - 0.02, ROOF + 0.04, M["white"], bev=0.02))

    # The livery: a blue band down each flank under a thin black line. It stops at the arches rather than bridging them in front of the tyres.
    for side in (-1, 1):
        for z0, z1 in ((-1.4, -1.17), (-0.68, 0.68), (1.17, 1.38)):
            parts.append(box("band", (0.012, 0.13, z1 - z0), (side * (W2 + 0.004), 0.44, (z0 + z1) / 2), M["blue"], bev=0.0))
        parts.append(box("line", (0.012, 0.03, 1.36), (side * (W2 + 0.004), 0.525, 0), M["black"], bev=0.0))
    # Bonnet and boot tops stay white; a blue number panel on the roof reads
    # from the helicopter's (and the city camera's) point of view.
    parts.append(box("roofNo", (0.5, 0.012, 0.22), (0, ROOF + 0.045, 0.02), M["blue"], bev=0.0))

    parts += seams(M, W2 + 0.003, 0.24, 0.6, (0.56, -0.2, -0.9))
    parts += handles(M, W2 + 0.01, 0.58, (0.1, -0.62))
    parts += mirrors(M, W2, 0.68, 0.52, reach=0.1, size=(0.04, 0.09, 0.07))

    # Sills between the arches, bumpers, the grille and a push bar.
    for side in (-1, 1):
        parts.append(box("sill", (0.03, 0.07, 2 * WHEEL_Z - 2 * WHEEL_R - 0.14), (side * (W2 - 0.01), BOTTOM + 0.04, 0), M["trim"], bev=0.0))
    for z in (HALF - 0.04, -HALF + 0.04):
        parts.append(box("bumper", (WIDTH + 0.04, 0.13, 0.14), (0, 0.26, z), M["trim"], bev=0.03))
    parts.append(box("grille", (0.44, 0.1, 0.03), (0, 0.38, HALF + 0.005), M["black"], bev=0.008))
    for y in (0.355, 0.405):
        parts.append(box("grilleBar", (0.4, 0.014, 0.02), (0, y, HALF + 0.02), M["chrome"], bev=0.0))
    parts += lamp_pair(M, 0.37, 0.38, HALF, (0.2, 0.08), M["head"])
    parts += lamp_pair(M, 0.38, 0.44, -HALF, (0.22, 0.09), M["tail"], facing=-1)
    for z, f in ((HALF + 0.07, 1), (-HALF - 0.07, -1)):
        parts.append(box("plate", (0.22, 0.07, 0.02), (0, 0.29, z), M["plate"], bev=0.0))
    # The push bar: two uprights and two rails in front of the grille.
    for x in (-0.24, 0.24):
        parts.append(box("pushPost", (0.05, 0.34, 0.05), (x, 0.36, HALF + 0.14), M["black"], bev=0.012))
        parts.append(box("pushArm", (0.04, 0.04, 0.12), (x, 0.3, HALF + 0.08), M["black"], bev=0.0))
    for y in (0.3, 0.48):
        parts.append(box("pushRail", (0.56, 0.05, 0.05), (0, y, HALF + 0.15), M["black"], bev=0.012))
    return parts


def build():
    kit.reset()
    M = palette()
    bar, markers = light_bar(
        M, "police", ROOF + 0.04, BAR_Z, 0.94, [(-0.26, M["lensBlue"]), (0.26, M["lensRed"])], depth=0.26, foot=0.04, lens_w=0.36
    )
    car = finish(body(M) + bar + wheels(M, WHEEL_R, WHEEL_X, (WHEEL_Z, -WHEEL_Z), width=0.22), "PoliceCar")
    kit.bake_ao([car], floor=0.55)
    return [car, *markers]
