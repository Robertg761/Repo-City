"""
Shared parts of the incident vehicles' NEAR models (`blender/scenes_near/
*_near.py`): rounder wheels, lamps with reflectors and ribs, light bars with
domed lenses, mirrors, door handles and hinges. `blender/incidents/fleet.py`
holds the lean versions the five vehicle scripts import by name; `install()`
swaps them for these BEFORE the scripts are imported, so every vehicle picks
them up, and the fire engine's own script is patched the same way.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import fleet  # noqa: E402
import kit  # noqa: E402
import parts_near  # noqa: E402
from kit import B, box, cyl, marker, strut  # noqa: E402
from kit_near import Acc  # noqa: E402

def _wheel_materials():
    m = kit.material
    return {
        "tyre": m("tyre", "#26282b", "fabric", 0.9),
        "hub": m("hub", "#b9bcc0", "metal", 0.4),
        "spoke": m("spoke", "#3d4045", "metal", 0.6),
    }


def near_wheels(M, radius, x, zs, width=0.24, verts=12):
    """A near wheel (rounded tyre with a groove, a lipped rim and five spokes)
    at each `(±x, z)`, scaled to `radius` and `width`."""
    mats = _wheel_materials()
    proto = parts_near.wheel(mats)
    parts = []
    sx = width / 0.94
    for z in zs:
        for side in (-1, 1):
            obj = bpy.data.objects.new("wheel", proto.data.copy())
            bpy.context.scene.collection.objects.link(obj)
            # App scale (sx, r, r) is Blender scale (sx, r, r): x stays x, y and z swap under the frame change.
            obj.data.transform(Matrix.Diagonal((sx, radius, radius, 1.0)))
            obj.data.transform(Matrix.Translation(B((side * x, radius, z))))
            parts.append(obj)
    bpy.data.objects.remove(proto, do_unlink=True)
    return parts


def near_lamp_pair(M, x, y, z, size, mat, housing=True, facing=1):
    """Two lamps at `±x` on a face whose outward normal is `facing` along z:
    a housing with a chamfer, an inset reflector cup, the lens, and ribs."""
    parts = []
    a = Acc()
    w, h = size
    for side in (-1, 1):
        if housing:
            parts.append(box("lampHouse", (w + 0.06, h + 0.05, 0.04), (side * x, y, z), M["dark"], bev=0.012, seg=2))
        parts.append(box("lamp", (w, h, 0.03), (side * x, y, z + facing * 0.018), mat, bev=0.012, seg=2))
        # A bezel round the lens and, inside, the reflector's cup and ribs.
        ry = h * 0.5
        for dy in (-1, 1):
            a.box((w + 0.02, 0.012, 0.014), (side * x, y + dy * (h / 2 + 0.006), z + facing * 0.036), M["chrome"])
        for dx in (-1, 1):
            a.box((0.012, h + 0.03, 0.014), (side * x + dx * (w / 2 + 0.006), y, z + facing * 0.036), M["chrome"])
        for k in (-1, 0, 1):
            a.box((w * 0.9, 0.006, 0.006), (side * x, y + k * h * 0.25, z + facing * 0.037), M["dark"])
    return parts + a.objects("lampFit")


def near_light_bar(M, prefix, y, z, width, lenses, depth=0.26, foot=0.08, lens_w=None):
    parts = [
        box("barFoot", (0.06, foot, depth * 0.6), (-width * 0.36, y + foot / 2, z), M["dark"], bev=0.01, seg=2),
        box("barFoot", (0.06, foot, depth * 0.6), (width * 0.36, y + foot / 2, z), M["dark"], bev=0.01, seg=2),
        box("barBase", (width, 0.06, depth), (0, y + foot + 0.03, z), M["dark"], bev=0.02, seg=3),
    ]
    markers = []
    lens_w = lens_w or (width - 0.1) / max(2, len(lenses)) - 0.02
    top = y + foot + 0.06
    a = Acc()
    for i, (x, mat) in enumerate(lenses):
        parts.append(box("lens", (lens_w, 0.1, depth - 0.04), (x, top + 0.05, z), mat, bev=0.035, seg=4))
        markers.append(marker(f"{prefix}.lamp.{i}", (x, top + 0.06, z)))
        # Ribs across the lens, and a reflector cup under it.
        for k in range(1, 4):
            a.box((0.008, 0.11, depth - 0.02), (x - lens_w / 2 + lens_w * k / 4, top + 0.05, z), M["dark"])
        a.disc((x, top + 0.005, z), min(lens_w, depth) * 0.3, 0.02, M["chrome"], "y", 12)
    if len(lenses) == 2:
        parts.append(box("barMid", (0.14, 0.08, depth - 0.06), (0, top + 0.04, z), M["chrome"], bev=0.015, seg=3))
        for k in range(4):
            a.box((0.1, 0.006, 0.01), (0, top + 0.085, z - 0.06 + k * 0.04), M["dark"])
    # End caps and a row of rivets along the base.
    for s in (-1, 1):
        a.box((0.02, 0.05, depth), (s * (width / 2 + 0.005), y + foot + 0.03, z), M["dark"])
    for k in range(9):
        a.disc((-width * 0.42 + k * width * 0.105, y + foot + 0.062, z + depth * 0.45), 0.006, 0.008, M["chrome"], "y", 6)
    return parts + a.objects("barFit"), markers


def near_mirrors(M, x, y, z, reach=0.12, size=(0.04, 0.12, 0.08)):
    parts = []
    a = Acc()
    for side in (-1, 1):
        parts.append(strut("mirrorArm", (side * (x - 0.02), y - 0.02, z), (side * (x + reach), y, z - 0.03), (0.025, 0.025), M["dark"], bev=0.006))
        parts.append(box("mirror", size, (side * (x + reach + 0.01), y, z - 0.03), M["dark"], bev=0.014, seg=3))
        # The glass, set in the housing's back face, and a hinge cap.
        a.box((0.008, size[1] * 0.8, size[2] * 0.75), (side * (x + reach + 0.01 + size[0] / 2 + 0.002), y, z - 0.03 - 0.0), M["glass"])
        a.disc((side * (x - 0.02), y - 0.02, z), 0.02, 0.03, M["dark"], "y", 8)
    return parts + a.objects("mirrorFit")


def near_handles(M, x, y, zs):
    parts = []
    a = Acc()
    for z in zs:
        for side in (-1, 1):
            a.box((0.008, 0.06, 0.16), (side * (x - 0.008), y, z), M["dark"])
            a.tube((side * (x + 0.006), y, z - 0.045), (side * (x + 0.006), y, z + 0.045), 0.011, 0.011, M["chrome"], 8, cap0=True, cap1=True)
            a.box((0.02, 0.014, 0.014), (side * (x + 0.002), y, z - 0.048), M["chrome"])
            a.box((0.02, 0.014, 0.014), (side * (x + 0.002), y, z + 0.048), M["chrome"])
            a.disc((side * (x + 0.002), y + 0.05, z + 0.05), 0.011, 0.01, M["chrome"], "x", 8)
    return parts + a.objects("handleFit")


def near_seams(M, x, y0, y1, zs):
    """Door shut lines with a hinge at the door's front edge and a rubber seal."""
    parts = [box("seam", (0.01, y1 - y0, 0.012), (side * x, (y0 + y1) / 2, z), M["dark"], bev=0.0) for z in zs for side in (-1, 1)]
    return parts


def install():
    """Swap the lean helpers in `fleet` for the near ones."""
    fleet.wheels = near_wheels
    fleet.lamp_pair = near_lamp_pair
    fleet.light_bar = near_light_bar
    fleet.mirrors = near_mirrors
    fleet.handles = near_handles
