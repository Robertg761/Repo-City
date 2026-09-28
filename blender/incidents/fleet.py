"""
Shared parts for the incident scene's vehicles (spike: Blender assets).

The police car, ambulance, tow truck and works truck are built the way the
Blender fire engine is (`blender/fire_truck.py`): a bevelled lower body with
its wheel arches cut out, a painted shell over a glass core with the windows
cut through it so the glass sits recessed, a cap on the roof, and lamps in
dark housings. This module holds what they share, in the app's frame
(x across, y up, z forward).
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import kit  # noqa: E402
from kit import box, cut, cyl, marker, plan_prism, prism, rounded_rect, strut  # noqa: E402


def palette(**extra):
    """The materials every service vehicle shares, plus its own livery:
    `extra` maps a role to `(hex, surface, roughness[, metallic])`."""
    m = kit.material
    M = {
        "tyre": m("tyre", "#26282b", "fabric", 0.9),
        "arch": m("arch", "#232427", "metal", 0.9),
        "dark": m("dark", "#3a3d42", "metal", 0.7),
        "trim": m("trim", "#3d4045", "metal", 0.6),
        "chrome": m("chrome", "#c9ccd1", "metal", 0.25, 0.6),
        "steel": m("steel", "#8b9097", "metal", 0.4, 0.4),
        "glass": m("glass", "#51647a", "glass", 0.15),
        "head": m("headlight", "#fff2cf", "glass", 0.2, emission=0.6),
        "tail": m("taillight", "#ff4a3a", "glass", 0.3),
        "amber": m("amber", "#ffb347", "glass", 0.3),
        "plate": m("plate", "#d5d0bc", "metal", 0.5),
    }
    for role, spec in extra.items():
        M[role] = m(role, *spec)
    return M


def arch_cutter(z, radius, width):
    """A cylinder through both flanks, a little bigger than the tyre: cut out
    of a body it leaves the arch, lined in the cutter's dark material."""
    return cyl(f"arch{z}", radius, width + 0.4, (0, radius * 0.92, z), None, axis="x", verts=16)


def cut_arches(body, zs, radius, width, M):
    for z in zs:
        c = arch_cutter(z, radius, width)
        c.data.materials.append(M["arch"])
        cut(body, c)
    return body


def wheels(M, radius, x, zs, width=0.24, verts=12):
    """Tyre, rim and hub at each `(±x, z)`."""
    parts = []
    for z in zs:
        for side in (-1, 1):
            at = (side * x, radius, z)
            parts.append(cyl("tyre", radius, width, at, M["tyre"], verts=verts, bev=min(0.045, radius * 0.16)))
            parts.append(cyl("rim", radius * 0.58, width + 0.02, at, M["chrome"], verts=10))
            parts.append(cyl("hub", radius * 0.24, width + 0.04, at, M["dark"], verts=6))
    return parts


def lamp_pair(M, x, y, z, size, mat, housing=True, facing=1):
    """Two lamps at `±x` on a face whose outward normal is `facing` along z."""
    parts = []
    w, h = size
    for side in (-1, 1):
        if housing:
            parts.append(box("lampHouse", (w + 0.06, h + 0.05, 0.04), (side * x, y, z), M["dark"], bev=0.01))
        parts.append(box("lamp", (w, h, 0.03), (side * x, y, z + facing * 0.018), mat, bev=0.01))
    return parts


def light_bar(M, prefix, y, z, width, lenses, depth=0.26, foot=0.08, lens_w=None):
    """A light bar on a roof whose top is `y`: a dark base on two feet and
    a lens per `(x, material)`. Exports a `<prefix>.lamp.<i>` marker at each
    lens's centre, a hair under its top, for the blinking lights."""
    parts = [
        box("barFoot", (0.06, foot, depth * 0.6), (-width * 0.36, y + foot / 2, z), M["dark"], bev=0.0),
        box("barFoot", (0.06, foot, depth * 0.6), (width * 0.36, y + foot / 2, z), M["dark"], bev=0.0),
        box("barBase", (width, 0.06, depth), (0, y + foot + 0.03, z), M["dark"], bev=0.018),
    ]
    markers = []
    lens_w = lens_w or (width - 0.1) / max(2, len(lenses)) - 0.02
    top = y + foot + 0.06
    for i, (x, mat) in enumerate(lenses):
        parts.append(box("lens", (lens_w, 0.1, depth - 0.04), (x, top + 0.05, z), mat, bev=0.03))
        markers.append(marker(f"{prefix}.lamp.{i}", (x, top + 0.06, z)))
    if len(lenses) == 2:
        parts.append(box("barMid", (0.14, 0.08, depth - 0.06), (0, top + 0.04, z), M["chrome"], bev=0.015))
    return parts, markers


def mirrors(M, x, y, z, reach=0.12, size=(0.04, 0.12, 0.08)):
    parts = []
    for side in (-1, 1):
        parts.append(strut("mirrorArm", (side * (x - 0.02), y - 0.02, z), (side * (x + reach), y, z - 0.03), (0.025, 0.025), M["dark"]))
        parts.append(box("mirror", size, (side * (x + reach + 0.01), y, z - 0.03), M["dark"], bev=0.012))
    return parts


def handles(M, x, y, zs):
    return [box("handle", (0.024, 0.024, 0.1), (side * x, y, z), M["chrome"], bev=0.0) for z in zs for side in (-1, 1)]


def seams(M, x, y0, y1, zs):
    """Door seams: thin dark strips proud of both flanks."""
    return [box("seam", (0.01, y1 - y0, 0.012), (side * x, (y0 + y1) / 2, z), M["dark"], bev=0.0) for z in zs for side in (-1, 1)]


def cabin(name, profile, core, width, shell_mat, M, windows, bev=0.02):
    """A glass core (`core`, a side profile a hair inside `profile`) under a
    painted shell, with the window openings (cutter boxes) cut through the
    shell so the glass sits recessed behind painted pillars."""
    parts = [prism(name + "Glass", core, width - 0.05, M["glass"], bev=0.0)]
    shell = prism(name, profile, width, shell_mat, bev=bev)
    for w in windows:
        cut(shell, w)
    parts.append(shell)
    return parts


def window(M, size, pos, rot=(0, 0, 0)):
    """A window cutter (hidden at render, removed at join); the reveal it
    leaves takes the glass's colour, as the fire engine's do."""
    return box("win", size, pos, M["glass"], bev=0.0, rot=rot)


def chassis_cab(M, S, paint):
    """A short-bonnet chassis-cab (the tow truck's and the works truck's), from
    a `TRUCK_SPECS` entry `S` given as a dict: the lower cab with its bonnet
    and front arch, the glasshouse over it, a roof cap, the face, and the
    chassis rails running back to the tail. What stands on the chassis is the
    service's own and is built by its script."""
    import math

    w, half = S["width"], S["length"] / 2
    w2 = w / 2
    back = S["cabBack"]
    parts = []
    lower = prism("cabLower", S["profile"], w, paint, bev=0.035)
    cut_arches(lower, (S["front"],), S["r"] + 0.05, w, M)
    parts.append(lower)

    # The glasshouse, from the glass profile: the foot of the windscreen, its
    # top, the back of the roof, and down the cab's back wall.
    (fz, fy), (tz, ty), _, _ = S["glass"]
    y0, roof = S["belt"] - 0.03, S["roof"] + 0.02
    rake = (fz - tz) / (ty - fy)
    profile = [(fz + 0.02, y0), (tz, roof), (back, roof), (back, y0)]
    core = [(fz - 0.02, y0), (tz - 0.02, roof - 0.015), (back + 0.04, roof - 0.015), (back + 0.04, y0)]
    lean = math.atan2(fz - tz, ty - fy)
    # The side window keeps a pillar's width behind the windscreen's line.
    wy0, wy1 = S["belt"] + 0.06, S["roof"] - 0.08
    z_at = lambda y: fz - (y - fy) * rake - 0.07  # noqa: E731
    cutters = [
        window(M, (w * 0.8, (ty - fy) * 0.8, 0.2), (0, (fy + ty) / 2, (fz + tz) / 2), rot=(-lean, 0, 0)),
        prism("side", [(z_at(wy0), wy0), (z_at(wy1), wy1), (back + 0.1, wy1), (back + 0.1, wy0)], w + 0.3, M["glass"], bev=0.0),
        window(M, (w * 0.6, (wy1 - wy0) * 0.7, 0.2), (0, (wy0 + wy1) / 2 + 0.02, back)),
    ]
    parts += cabin("cab", profile, core, w * 0.96, paint, M, cutters, bev=0.03)
    parts.append(
        plan_prism("cabRoof", rounded_rect(-w2 + 0.01, w2 - 0.01, back - 0.01, tz + 0.05, (0.06, 0.06, 0.02, 0.02), 2), roof - 0.02, roof + 0.05, paint, bev=0.02)
    )

    # The face: grille, lamps in housings, indicators, a heavy bumper.
    front = half
    gy = S["bumperY"] + 0.2
    parts.append(box("grille", (w * 0.5, 0.2, 0.03), (0, gy, front + 0.005), M["trim"], bev=0.01))
    for dy in (-0.06, 0, 0.06):
        parts.append(box("grilleBar", (w * 0.46, 0.016, 0.02), (0, gy + dy, front + 0.02), M["chrome"], bev=0.0))
    hx, hy = S["headlight"]
    parts += lamp_pair(M, hx, hy, front, (0.16, 0.11), M["head"])
    parts += lamp_pair(M, hx, hy - 0.12, front, (0.09, 0.05), M["amber"], housing=False)
    parts.append(box("bumper", (w + 0.06, 0.15, 0.18), (0, S["bumperY"], front + 0.02), M["chrome"], bev=0.03))
    parts.append(box("plate", (0.24, 0.07, 0.02), (0, S["bumperY"], front + 0.115), M["plate"], bev=0.0))
    parts += mirrors(M, w2, S["belt"] + 0.2, fz - 0.12, reach=0.065, size=(0.03, 0.18, 0.08))
    door_front = z_at(wy0) + 0.04
    parts += seams(M, w2 + 0.003, S["bottom"] + 0.06, S["belt"] - 0.02, (door_front, back + 0.03))
    parts += handles(M, w2 + 0.01, S["belt"] - 0.1, (back + 0.18,))
    for side in (-1, 1):
        parts.append(box("step", (0.12, 0.04, 0.3), (side * (w2 - 0.03), S["bottom"] + 0.02, (door_front + back) / 2), M["trim"], bev=0.0))

    # The chassis rails from under the cab to the tail, and an exhaust stack
    # up the back corner of the cab.
    length = back + half
    parts.append(box("chassis", (w * 0.7, 0.16, length + 0.4), (0, S["bottom"] + 0.06, (back - half - 0.4) / 2 + 0.2), M["arch"], bev=0.0))
    parts.append(cyl("exhaust", 0.04, 0.72, (w2 - 0.08, S["belt"] + 0.3, back - 0.07), M["chrome"], axis="y", verts=8))
    parts.append(cyl("exhaustCap", 0.05, 0.06, (w2 - 0.08, S["belt"] + 0.68, back - 0.07), M["dark"], axis="y", verts=8))
    return parts
