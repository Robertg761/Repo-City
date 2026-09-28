"""
The fire engine, modelled by script (spike: Blender assets vs procedural).

Same footprint, wheel positions, light-bar lamps and ladder pivot as
`TRUCK_SPECS.engine` and `emergency.ts`, so the model drops into the incident
scene where the procedural one stood. Two objects come out:

  FireEngine  the truck, origin on the ground under its centre;
  Ladder      the turntable top, ram and aerial ladder, origin on the ladder
              pivot so the scene can turn it towards the fire.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from kit import box, cut, cyl, finish, plan_prism, prism, rounded_rect, strut  # noqa: E402

# The spec this has to match (shapes.ts / emergency.ts).
LENGTH, WIDTH = 4.9, 1.3
HALF = LENGTH / 2
W2 = WIDTH / 2
WHEEL_R = 0.34
WHEEL_X = 0.54
FRONT_Z, REAR_Z = 1.52, -1.4
BOTTOM, BELT, ROOF = 0.3, 1.2, 1.8
CAB_BACK = 0.8
LADDER_PIVOT = (0.0, 1.74, -1.75)
LADDER_PITCH = 0.78
LADDER_LENGTH = 5.6


def palette():
    m = kit.material
    return {
        "red": m("red", "#b8342c", "metal", 0.45),
        "white": m("white", "#eeece6", "metal", 0.5),
        "shutter": m("shutter", "#b3b8bf", "metal", 0.35, 0.3),
        "steel": m("steel", "#8b9097", "metal", 0.4, 0.4),
        "chrome": m("chrome", "#c9ccd1", "metal", 0.25, 0.6),
        "dark": m("dark", "#3a3d42", "metal", 0.7),
        "arch": m("arch", "#232427", "metal", 0.9),
        "tyre": m("tyre", "#26282b", "fabric", 0.9),
        "glass": m("glass", "#51647a", "glass", 0.15),
        "head": m("headlight", "#fff2cf", "glass", 0.2, emission=0.6),
        "tail": m("taillight", "#ff4a3a", "glass", 0.3),
        "amber": m("amber", "#ffb347", "glass", 0.3),
        "lens": m("lens", "#e8463e", "glass", 0.2),
        "yellow": m("yellow", "#f2c230", "metal", 0.5),
    }


def arch_cutter(z, mat):
    c = cyl(f"arch{z}", WHEEL_R + 0.08, WIDTH + 0.4, (0, WHEEL_R, z), mat, axis="x", verts=16)
    return c


def cab(M):
    parts = []
    # The lower cab: a plan with rounded front corners, from the chassis to
    # the waist, with the front wheel's arch cut out of it.
    lower = plan_prism(
        "cabLower", rounded_rect(-W2, W2, CAB_BACK, HALF, (0.12, 0.12, 0, 0)), BOTTOM, BELT + 0.005, M["red"], bev=0.025
    )
    cut(lower, arch_cutter(FRONT_Z, M["arch"]))
    parts.append(lower)

    # The glass band: a glass core a hair inside a red shell, and the windows
    # cut through the shell so the glass sits recessed behind painted pillars.
    rake = [(2.4, BELT), (2.24, ROOF), (CAB_BACK, ROOF), (CAB_BACK, BELT)]
    parts.append(prism("glassCore", [(2.37, BELT), (2.21, ROOF), (CAB_BACK + 0.05, ROOF), (CAB_BACK + 0.05, BELT)], WIDTH - 0.06, M["glass"], bev=0.0))
    shell = prism("cabUpper", rake, WIDTH, M["red"], bev=0.025)
    lean = math.atan2(0.16, ROOF - BELT)
    # Windscreen: one slab through the raked front, with a centre post left.
    for x in (-0.28, 0.28):
        cut(shell, box("ws", (0.5, 0.5, 0.3), (x, 1.5, 2.33), M["glass"], bev=0.0, rot=(-lean, 0, 0)))
    # Side windows: the front door's and the crew door's, through both flanks.
    cut(shell, box("sw1", (WIDTH + 0.2, 0.44, 0.5), (0, 1.52, 1.93), M["glass"], bev=0.0))
    cut(shell, box("sw2", (WIDTH + 0.2, 0.44, 0.62), (0, 1.52, 1.24), M["glass"], bev=0.0))
    parts.append(shell)

    # The roof cap, white, overhanging a touch all round, and the light bar.
    parts.append(
        plan_prism("roof", rounded_rect(-W2 - 0.015, W2 + 0.015, CAB_BACK - 0.01, 2.27, (0.1, 0.1, 0.02, 0.02)), ROOF - 0.01, ROOF + 0.08, M["white"], bev=0.03)
    )
    parts.append(box("barBase", (1.04, 0.07, 0.28), (0, ROOF + 0.115, 2.0), M["dark"], bev=0.02))
    for x in (-0.32, 0.32):
        parts.append(box("lens", (0.34, 0.1, 0.22), (x, ROOF + 0.2, 2.0), M["lens"], bev=0.035))
    parts.append(box("barMid", (0.26, 0.08, 0.2), (0, ROOF + 0.19, 2.0), M["white"], bev=0.02))

    # The face: grille, headlamps in dark housings, indicators, bumper, step.
    front = HALF
    parts.append(box("grille", (0.62, 0.3, 0.04), (0, 0.84, front), M["dark"], bev=0.01))
    for y in (0.76, 0.84, 0.92):
        parts.append(box("grilleBar", (0.58, 0.025, 0.03), (0, y, front + 0.02), M["chrome"], bev=0.006))
    for side in (-1, 1):
        parts.append(box("lampHouse", (0.3, 0.2, 0.04), (side * 0.44, 0.6, front), M["dark"], bev=0.012))
        parts.append(box("lamp", (0.2, 0.12, 0.03), (side * 0.47, 0.6, front + 0.02), M["head"], bev=0.012))
        parts.append(box("ind", (0.07, 0.07, 0.03), (side * 0.33, 0.6, front + 0.02), M["amber"], bev=0.01))
        # Mirrors on arms off the front corners.
        parts.append(strut("mirrorArm", (side * (W2 - 0.02), 1.42, 2.22), (side * (W2 + 0.14), 1.46, 2.3), (0.03, 0.03), M["dark"]))
        parts.append(box("mirror", (0.05, 0.24, 0.12), (side * (W2 + 0.16), 1.42, 2.3), M["dark"], bev=0.015))
    parts.append(box("bumper", (WIDTH + 0.06, 0.16, 0.2), (0, 0.4, front + 0.04), M["chrome"], bev=0.03))
    parts.append(box("frontStep", (WIDTH - 0.1, 0.04, 0.16), (0, 0.27, front + 0.02), M["dark"], bev=0.01))

    # Door seams, handles and the crew step behind the front wheel.
    for side in (-1, 1):
        x = side * (W2 + 0.004)
        for z in (2.26, 1.62, 0.9):
            parts.append(box("seam", (0.012, 1.3, 0.014), (x, 1.05, z), M["dark"], bev=0.0))
        for z in (1.72, 1.02):
            parts.append(box("handle", (0.03, 0.03, 0.12), (x, 1.1, z), M["chrome"], bev=0.008))
        parts.append(box("step", (0.14, 0.04, 0.5), (side * (W2 - 0.02), 0.36, 1.05), M["dark"], bev=0.01))
    return parts


def rollup(name, z0, z1, y0, y1, M, slats=4):
    """A roller shutter across both flanks: stacked slats whose bevels read as
    the grooves, and a steel lift bar along the foot."""
    parts = []
    h = (y1 - y0) / slats
    for i in range(slats):
        y = y0 + h * (i + 0.5)
        parts.append(box(name, (WIDTH + 0.024, h, z1 - z0), (0, y, (z0 + z1) / 2), M["shutter"], bev=0.008))
    parts.append(box(name + "Bar", (WIDTH + 0.04, 0.04, z1 - z0 - 0.08), (0, y0 + 0.03, (z0 + z1) / 2), M["steel"], bev=0.01))
    return parts


def body(M):
    parts = []
    tail = -HALF
    main = box("body", (WIDTH, 1.2, CAB_BACK - 0.03 - tail), (0, 0.9, (CAB_BACK - 0.03 + tail) / 2), M["red"], bev=0.03)
    cut(main, arch_cutter(REAR_Z, M["arch"]))
    parts.append(main)

    # Compartments: two ahead of the rear wheel, a short one over it, one behind.
    parts += rollup("sh1", -0.06, 0.7, 0.42, 1.06, M)
    parts += rollup("sh2", -0.88, -0.1, 0.42, 1.06, M)
    parts += rollup("sh3", -1.72, -1.08, 0.82, 1.06, M, slats=2)
    parts += rollup("sh4", -2.38, -1.9, 0.42, 1.06, M)

    # The white stripe, cab to tail, and a red rubbing strip at the sill.
    for side in (-1, 1):
        parts.append(box("stripe", (0.02, 0.07, 4.66), (side * (W2 + 0.006), 1.15, -0.08), M["white"], bev=0.008))

    # The top: a steel walkway, hand rails on posts, and the ladder's rest.
    # A steel walkway down the middle only: from the city camera the top is
    # most of what shows, and it has to read red.
    parts.append(box("deck", (0.42, 0.03, CAB_BACK - 0.1 - tail), (0, 1.51, (CAB_BACK - 0.1 + tail) / 2), M["steel"], bev=0.0))
    for side in (-1, 1):
        x = side * (W2 - 0.05)
        parts.append(box("rail", (0.035, 0.035, 2.9), (x, 1.72, -0.95), M["chrome"], bev=0.01))
        for z in (0.45, -0.95, -2.35):
            parts.append(box("post", (0.03, 0.2, 0.03), (x, 1.62, z), M["chrome"], bev=0.0))
    parts.append(box("restL", (0.05, 0.3, 0.05), (-0.25, 1.68, 0.55), M["dark"], bev=0.01))
    parts.append(box("restR", (0.05, 0.3, 0.05), (0.25, 1.68, 0.55), M["dark"], bev=0.01))
    parts.append(box("restBar", (0.6, 0.05, 0.08), (0, 1.84, 0.55), M["dark"], bev=0.01))
    # The turntable's fixed ring.
    parts.append(cyl("ring", 0.46, 0.14, (0, 1.6, LADDER_PIVOT[2]), M["steel"], axis="y", verts=16, bev=0.02))

    # The tail: a rear shutter, lamps, a diamond-plate step and chevrons' worth
    # of yellow on the corner posts.
    parts.append(box("rearShutter", (0.8, 0.64, 0.024), (0, 0.78, tail - 0.004), M["shutter"], bev=0.008))
    for side in (-1, 1):
        parts.append(box("tail", (0.12, 0.16, 0.03), (side * 0.52, 0.66, tail - 0.01), M["tail"], bev=0.012))
        parts.append(box("tailA", (0.12, 0.08, 0.03), (side * 0.52, 0.52, tail - 0.01), M["amber"], bev=0.012))
        parts.append(box("post", (0.08, 1.1, 0.03), (side * 0.56, 0.95, tail - 0.012), M["yellow"], bev=0.01))
    parts.append(box("rearStep", (WIDTH + 0.04, 0.06, 0.28), (0, 0.36, tail - 0.1), M["steel"], bev=0.015))

    # Under-tray, so the gap between the wheels reads as shadowed chassis.
    parts.append(box("chassis", (WIDTH - 0.3, 0.14, LENGTH - 0.3), (0, 0.24, 0), M["arch"], bev=0.0))
    return parts


def wheels(M):
    parts = []
    for z in (FRONT_Z, REAR_Z):
        for side in (-1, 1):
            x = side * WHEEL_X
            parts.append(cyl("tyre", WHEEL_R, 0.26, (x, WHEEL_R, z), M["tyre"], verts=14, bev=0.05))
            parts.append(cyl("rim", 0.2, 0.28, (x, WHEEL_R, z), M["chrome"], verts=10))
            parts.append(cyl("hub", 0.08, 0.3, (x, WHEEL_R, z), M["dark"], verts=6))
    return parts


def ladder(M, pitch=LADDER_PITCH, stowed=False):
    """The aerial, built in place and then re-origined on the pivot. Raised, it
    runs back over the tail; stowed, it is retracted and lies forward on its
    rest over the cab."""
    px, py, pz = LADDER_PIVOT
    f = 1.0 if stowed else -1.0  # which way along z the ladder runs
    d = (0.0, math.sin(pitch), f * math.cos(pitch))  # up the ladder
    n = (0.0, math.cos(pitch), -f * math.sin(pitch))  # ladder "up"
    tilt = f * pitch  # the x rotation that lays a box along the ladder

    def at(along, lift=0.0, x=0.0):
        return (px + x, py + d[1] * along + n[1] * lift, pz + d[2] * along + n[2] * lift)

    parts = [
        cyl("table", 0.42, 0.08, (px, 1.7, pz), M["dark"], axis="y", verts=16),
    ]
    # Pedestal cheeks either side of the hinge.
    for side in (-1, 1):
        parts.append(box("cheek", (0.06, 0.26, 0.4), (side * 0.3, 1.82, pz), M["red"], bev=0.015))
    parts.append(cyl("hinge", 0.05, 0.66, (px, py, pz), M["chrome"], verts=8))

    def section(start, end, half, lift, rail, rung_step):
        out = []
        for side in (-1, 1):
            x = side * half
            out.append(strut("chord", at(start, lift, x), at(end, lift, x), (rail, rail), M["steel"]))
            out.append(strut("hand", at(start, lift + 0.2, x), at(end, lift + 0.2, x), (rail * 0.7, rail * 0.7), M["steel"]))
            s = start + 0.1
            while s < end - 0.05:
                out.append(strut("post", at(s, lift, x), at(s, lift + 0.2, x), (rail * 0.6, rail * 0.6), M["steel"]))
                s += rung_step * 3
        s = start + 0.2
        while s < end - 0.05:
            out.append(box("rung", (half * 2, 0.025, 0.025), at(s, lift), M["chrome"], bev=0.0, rot=(tilt, 0, 0)))
            s += rung_step
        return out

    # Retracted, the fly section sits inside the base section's length.
    reach = 3.4 if stowed else LADDER_LENGTH
    parts += section(-0.2, 3.3, 0.24, 0.02, 0.06, 0.4)
    parts += section(reach - 3.3, reach, 0.17, 0.1, 0.045, 0.4)
    # The ram that lifts it, from the table's far edge to the base section.
    foot = (0, 1.74, pz - f * 0.38)
    parts.append(strut("ram", foot, at(1.3, -0.02), (0.09, 0.09), M["chrome"]))
    parts.append(strut("ramBody", foot, at(0.7, -0.02), (0.13, 0.13), M["red"]))
    # The monitor nozzle at the tip.
    tip = at(reach, 0.1)
    parts.append(box("tipBox", (0.3, 0.14, 0.16), tip, M["red"], bev=0.02, rot=(tilt, 0, 0)))
    return parts


def build():
    kit.reset()
    M = palette()
    truck = finish(cab(M) + body(M) + wheels(M), "FireEngine")
    arm = finish(ladder(M), "Ladder", origin=LADDER_PIVOT)
    kit.bake_ao([truck, arm])
    return [truck, arm]
