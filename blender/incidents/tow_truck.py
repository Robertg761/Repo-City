"""
The tow truck, modelled by script (spike: Blender assets vs procedural).

Same chassis-cab as `TRUCK_SPECS.wrecker`, and the same boom as the
procedural one in `emergency.ts`: its foot on the mount between the lockers,
its head over the tail, the hook on a line below it and the wheel-lift folded
down behind. Out come:

  TowTruck        the truck, origin on the ground under its centre, nose +z
  tow.lamp.<i>    the light bar's two amber lenses, -x then +x
  tow.boom.foot   the boom's pivot on the mount
  tow.boom.head   the sheave at the boom's head
  tow.hook        the hook, where a towed car's chain would hang from
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fleet  # noqa: E402
import kit  # noqa: E402
from fleet import chassis_cab, cut_arches, light_bar, wheels  # noqa: E402
from kit import box, cyl, finish, marker, strut  # noqa: E402

SPEC = dict(
    length=3.6, width=1.2, r=0.3, wheelX=0.5, front=1.14, rear=-1.0,
    bottom=0.26, belt=0.88, roof=1.42, cabBack=0.02, bumperY=0.36,
    profile=[(0.02, 0.26), (1.8, 0.26), (1.8, 0.64), (1.64, 0.8), (0.95, 0.88), (0.02, 0.88)],
    glass=[(0.97, 0.86), (0.64, 1.42), (0.1, 1.42), (0.1, 0.86)],
    headlight=(0.4, 0.56),
)
HALF = SPEC["length"] / 2
W = SPEC["width"]
W2 = W / 2
BOOM_FOOT = (0.0, 1.1, -0.45)
BOOM_HEAD = (0.0, 2.05, -2.12)
HOOK_Y = BOOM_HEAD[1] - 0.82
BAR_Z = 0.36


def palette():
    return fleet.palette(
        yellow=("#d8a43c", "metal", 0.45),
        black=("#2b2d31", "metal", 0.5),
        shutter=("#6f747b", "metal", 0.35, 0.3),
        lensAmber=("#ffb347", "glass", 0.2),
    )


def rollup(name, x, z0, z1, y0, y1, M, slats=3):
    """A roller shutter on one flank: slats whose bevels read as grooves."""
    parts = []
    h = (y1 - y0) / slats
    for i in range(slats):
        parts.append(box(name, (0.03, h, z1 - z0), (x, y0 + h * (i + 0.5), (z0 + z1) / 2), M["shutter"], bev=0.008))
    parts.append(box(name + "Bar", (0.04, 0.035, z1 - z0 - 0.06), (x, y0 + 0.03, (z0 + z1) / 2), M["steel"], bev=0.0))
    return parts


def body(M):
    parts = []
    back = SPEC["cabBack"]
    tail = -HALF
    length = back - tail - 0.02
    mid = (back - 0.02 + tail) / 2
    # A painted skirt over the rear wheels, its arch cut out.
    skirt = box("skirt", (W, 0.36, length), (0, 0.46, mid), M["yellow"], bev=0.03)
    cut_arches(skirt, (SPEC["rear"],), SPEC["r"] + 0.05, W, M)
    parts.append(skirt)
    # A locker down each side, on the skirt, with a shutter on its flank and
    # the boom mount between them.
    for side in (-1, 1):
        x = side * (W2 - 0.16)
        parts.append(box("locker", (0.32, 0.5, length), (x, 0.89, mid), M["yellow"], bev=0.03, cell=0.6))
        parts += rollup("shutter", side * (W2 + 0.006), -1.52, -0.5, 0.7, 1.08, M)
        parts += rollup("shutterF", side * (W2 + 0.006), -0.38, -0.08, 0.7, 1.08, M)
        # Black and yellow on the lockers' tail ends.
        for dy in (-0.12, 0.06):
            parts.append(box("hazard", (0.05, 0.26, 0.02), (x, 0.89 + dy, tail - 0.004), M["black"], bev=0.0, rot=(0, 0, side * 0.75)))
        parts.append(box("rail", (0.03, 0.03, length - 0.2), (x, 1.2, mid), M["chrome"], bev=0.0))
        for z in (mid - length / 2 + 0.15, mid, mid + length / 2 - 0.15):
            parts.append(box("railPost", (0.025, 0.08, 0.025), (x, 1.16, z), M["chrome"], bev=0.0))
    # The deck between the lockers.
    parts.append(box("deck", (W - 0.64, 0.05, length), (0, 0.66, mid), M["dark"], bev=0.0))
    # The boom mount: a tower between the lockers, and the winch on it.
    parts.append(box("mount", (0.42, 0.56, 0.5), (0, 0.9, BOOM_FOOT[2]), M["dark"], bev=0.025))
    parts.append(cyl("winch", 0.1, 0.46, (0, 0.9, BOOM_FOOT[2] + 0.34), M["steel"], verts=10))
    parts.append(box("winchFrame", (0.5, 0.16, 0.08), (0, 0.84, BOOM_FOOT[2] + 0.34), M["dark"], bev=0.0))
    for side in (-1, 1):
        parts.append(box("cheek", (0.05, 0.3, 0.26), (side * 0.15, BOOM_FOOT[1], BOOM_FOOT[2]), M["yellow"], bev=0.012))
    parts.append(cyl("pin", 0.045, 0.4, BOOM_FOOT, M["chrome"], verts=8))

    # The tail: lamps on the locker ends, a bumper, the wheel-lift.
    for side in (-1, 1):
        parts.append(box("tail", (0.12, 0.1, 0.03), (side * 0.44, 0.5, tail - 0.012), M["tail"], bev=0.01))
        parts.append(box("tailA", (0.12, 0.06, 0.03), (side * 0.44, 0.4, tail - 0.012), M["amber"], bev=0.01))
    parts.append(box("rearBumper", (W + 0.02, 0.1, 0.1), (0, 0.3, tail + 0.02), M["dark"], bev=0.02))
    # Stinger, crossbar and the two forks a car's wheels sit in, and the
    # arms that fold them.
    parts.append(box("stinger", (0.18, 0.12, 0.62), (0, 0.3, tail - 0.26), M["dark"], bev=0.02))
    parts.append(box("crossbar", (1.0, 0.1, 0.14), (0, 0.3, tail - 0.52), M["yellow"], bev=0.02))
    for side in (-1, 1):
        parts.append(box("fork", (0.1, 0.08, 0.36), (side * 0.42, 0.29, tail - 0.64), M["dark"], bev=0.015))
        parts.append(box("forkTip", (0.2, 0.06, 0.06), (side * 0.37, 0.29, tail - 0.8), M["dark"], bev=0.0))
        parts.append(strut("liftRam", (side * 0.08, 0.55, tail + 0.05), (side * 0.08, 0.34, tail - 0.3), (0.05, 0.05), M["chrome"]))
    return parts


def boom(M):
    """Two box sections, the outer from the foot, the inner run out of it to
    the head, a ram under it, a sheave, a line and the hook."""
    parts = []
    foot, head = BOOM_FOOT, BOOM_HEAD
    d = [head[i] - foot[i] for i in range(3)]
    length = math.sqrt(sum(v * v for v in d))
    u = [v / length for v in d]
    at = lambda t, lift=0.0: (0.0, foot[1] + u[1] * t + u[2] * lift, foot[2] + u[2] * t - u[1] * lift)  # noqa: E731
    parts.append(strut("boomOuter", at(-0.1), at(length * 0.62), (0.24, 0.24), M["yellow"], bev=0.025))
    parts.append(strut("boomInner", at(length * 0.55), at(length + 0.06), (0.16, 0.16), M["steel"], bev=0.015))
    parts.append(strut("boomCollar", at(length * 0.6), at(length * 0.64), (0.28, 0.28), M["dark"], bev=0.0))
    # The ram from low on the mount to under the outer section.
    parts.append(strut("ram", (0.0, 0.72, foot[2] + 0.2), at(length * 0.42, -0.14), (0.1, 0.1), M["chrome"]))
    parts.append(strut("ramBody", (0.0, 0.72, foot[2] + 0.2), at(length * 0.22, -0.14), (0.14, 0.14), M["dark"]))
    # Sheave at the head, the line and the hook.
    parts.append(cyl("sheave", 0.1, 0.12, head, M["dark"], verts=10))
    for side in (-1, 1):
        parts.append(box("sheaveCheek", (0.03, 0.22, 0.24), (side * 0.08, head[1], head[2]), M["yellow"], bev=0.0))
    line_top = head[1] - 0.1
    parts.append(box("line", (0.025, line_top - HOOK_Y - 0.08, 0.025), (0, (line_top + HOOK_Y + 0.08) / 2, head[2]), M["black"], bev=0.0))
    parts.append(box("hookBlock", (0.1, 0.12, 0.08), (0, HOOK_Y + 0.1, head[2]), M["black"], bev=0.015))
    parts.append(cyl("hook", 0.08, 0.03, (0, HOOK_Y - 0.02, head[2]), M["steel"], verts=8, radius2=0.08))
    parts.append(box("hookTip", (0.03, 0.08, 0.03), (0, HOOK_Y - 0.03, head[2] + 0.08), M["steel"], bev=0.0))
    # Floodlights on the head, facing the job.
    parts.append(box("flood", (0.12, 0.08, 0.06), (0, head[1] + 0.14, head[2] + 0.1), M["dark"], bev=0.01))
    return parts


def build():
    kit.reset()
    M = palette()
    roof_top = SPEC["roof"] + 0.07
    bar, markers = light_bar(
        M, "tow", roof_top, BAR_Z, 0.72, [(-0.2, M["lensAmber"]), (0.2, M["lensAmber"])], depth=0.24, foot=0.03, lens_w=0.26
    )
    truck = finish(
        chassis_cab(M, SPEC, M["yellow"]) + body(M) + boom(M) + bar + wheels(M, SPEC["r"], SPEC["wheelX"], (SPEC["front"], SPEC["rear"]), width=0.24),
        "TowTruck",
    )
    kit.bake_ao([truck], floor=0.55)
    markers += [
        marker("tow.boom.foot", BOOM_FOOT),
        marker("tow.boom.head", BOOM_HEAD),
        marker("tow.hook", (0.0, HOOK_Y, BOOM_HEAD[2])),
    ]
    return [truck, *markers]
