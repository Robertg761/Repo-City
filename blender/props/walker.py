"""
The walking crowd's figure, modelled by script (spike: Blender assets vs
procedural).

Two nodes, as `walkerModel.ts` has two instanced meshes:

  WalkerBody  origin at the crowd's chest height (0.44 above the pavement),
              feet at exactly -0.44, nothing above 0.34, under 0.46 across;
              the clothes are paint (the instance colour), trousers, shoes
              and hands keep their own colours.
  WalkerHead  origin at the head's centre (0.94 above the pavement), within
              -0.15 .. 0.17; the skin is paint, hair and face are not.

Both nodes keep their origin at 0 and are modelled in their own frame (the
body's chest, the head's centre), so nothing depends on a node origin.

The budget is `walkerModel.test.ts`'s: body and head together within 240
triangles for up to eighty people at once. The Blender figure spends it on
the silhouette a person has from above: shoulders wider than the waist, two
legs with a gap between them, arms that hang clear of the body, and hair that
covers the back of the head.
"""

import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from fleet import carkit  # noqa: E402
from kit import B, box, finish  # noqa: E402

SKIN = "#c99f7d"


def palette():
    m = kit.material
    return {
        "clothes": m("paint", "#ffffff", "fabric", 0.9),
        "trousers": m("trousers", "#35404b", "fabric", 0.9),
        "shoes": m("shoes", "#292b2e", "fabric", 0.8),
        "hands": m("hands", SKIN, "plaster", 0.8),
        "pack": m("pack", "#6d5b47", "fabric", 0.9),
        "skin": m("paintskin", "#ffffff", "plaster", 0.8),
        "hair": m("hair", "#4a3830", "fabric", 0.9),
        "eyes": m("eyes", "#302d29", "glass", 0.4),
        "mouth": m("mouth", "#ad8272", "plaster", 0.8),
    }


def loft(name, rings, mat, sides=6, cap_top=True, cap_bottom=True, turn=0.0):
    """A closed body through horizontal elliptical rings (y, rx, rz, dz)."""
    bm = bmesh.new()
    loops = []
    for y, rx, rz, dz in rings:
        loops.append([
            bm.verts.new(B((math.cos(turn + 2 * math.pi * i / sides) * rx, y,
                            math.sin(turn + 2 * math.pi * i / sides) * rz + dz)))
            for i in range(sides)
        ])
    for a, b in zip(loops, loops[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(loops[0])))
    if cap_top:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def body(M):
    parts = [
        # Hips, waist, chest, shoulders, the base of the neck.
        loft("torso", [(-0.13, 0.115, 0.085, 0), (0.02, 0.118, 0.085, 0), (0.19, 0.15, 0.1, 0),
                       (0.28, 0.14, 0.095, 0), (0.34, 0.06, 0.06, 0)],
             M["clothes"], sides=6, turn=math.pi / 6),
    ]
    for side in (-1, 1):
        x = side * 0.068
        parts += [
            lp.tube(f"leg{side}", (x, -0.1, 0), (x * 1.05, -0.375, 0.0), 0.058, 0.045, M["trousers"], sides=5),
            box(f"shoe{side}", (0.09, 0.065, 0.17), (x * 1.05, -0.4075, 0.03), M["shoes"], bev=0),
            lp.tube(f"arm{side}", (side * 0.16, 0.27, 0), (side * 0.155, -0.05, 0.01), 0.042, 0.034, M["clothes"],
                    sides=5, cap0=True),
            lp.tube(f"hand{side}", (side * 0.155, -0.05, 0.01), (side * 0.154, -0.125, 0.015), 0.03, 0.024, M["hands"],
                    sides=3, cap1=True),
        ]
    # The backpack the near figure carries: one box behind the shoulders.
    parts.append(carkit.lidless_box("pack", (0.19, 0.25, 0.095), (0, 0.085, -0.14), M["pack"]))
    return finish(parts, "WalkerBody")


def head(M):
    """A faceted ball (skin, painted) and a cap of hair over its top and
    back, the face left bare."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=7, v_segments=4, radius=0.148)
    skin = lp._obj("head", bm, M["skin"])
    # Hair: the same ball a touch larger, cut away below a plane that rises
    # towards the face, so it covers the crown and the back of the head.
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=7, v_segments=4, radius=0.158)
    for v in bm.verts:
        v.co.z *= 1.04
        v.co.y += 0.006  # Blender -y is app +z: shift the cap back a little
    # Blender frame: z up, -y forward. Keep what lies above the tilted plane.
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    n = Vector((0, 0.55, 1)).normalized()
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector((0, 0, 0.0)), plane_no=n, clear_inner=True)
    hair = lp._obj("hair", bm, M["hair"])
    face = [
        lp.panel("eyeL", 0.022, 0.022, (-0.045, 0.02, 0.143), M["eyes"]),
        lp.panel("eyeR", 0.022, 0.022, (0.045, 0.02, 0.143), M["eyes"]),
        lp.panel("mouth", 0.036, 0.012, (0, -0.055, 0.138), M["mouth"]),
    ]
    return finish([skin, hair, *face], "WalkerHead")


def build():
    kit.reset()
    M = palette()
    b, h = body(M), head(M)
    # Baked standing on the ground, the head on the shoulders, then put back
    # in their own frames (the occlusion is per corner, so it travels).
    b.location.z, h.location.z = 0.44, 0.94
    lp.bake_alone([[b, h]], distance=0.12, floor=0.6)
    b.location.z, h.location.z = 0.0, 0.0
    return [b, h]


def preview(_=0):
    objs = build()
    objs[0].location.z += 0.44
    objs[1].location.z += 0.94
    return objs
