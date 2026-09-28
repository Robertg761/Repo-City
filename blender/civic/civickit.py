"""
Helpers for the civic kit (spike: Blender assets vs procedural): profiles
turned on a lathe, profiles pushed along z, and single faces. App frame
throughout (x across, y up, z forward); see `blender/kit.py`.
"""

import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
from kit import B  # noqa: E402


def orient(face, outward):
    face.normal_update()
    if face.normal.dot(outward) < 0:
        face.normal_flip()


def lathe(name, profile, mat, segments=8, pos=(0, 0, 0), cap_top=True, cap_bottom=False, phase=0.0):
    """A profile of (radius, y) points, bottom to top, turned about the y axis
    at `pos`. A radius of 0 closes to a point; `cap_*` closes a flat end."""
    bm = bmesh.new()
    rings = []
    for r, y in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new(B((pos[0], pos[1] + y, pos[2])))])
            continue
        ring = []
        for i in range(segments):
            a = phase + 2 * math.pi * i / segments
            ring.append(bm.verts.new(B((pos[0] + math.cos(a) * r, pos[1] + y, pos[2] + math.sin(a) * r))))
        rings.append(ring)
    axis = B(pos)
    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        for i in range(segments):
            j = (i + 1) % segments
            if len(lo) == 1:
                verts = [lo[0], hi[j], hi[i]]
            elif len(hi) == 1:
                verts = [lo[i], lo[j], hi[0]]
            else:
                verts = [lo[i], lo[j], hi[j], hi[i]]
            f = bm.faces.new(verts)
            c = f.calc_center_median()
            out = Vector((c.x - axis.x, c.y - axis.y, 0))
            # A flat step in the profile faces up or down, not out.
            f.normal_update()
            if abs(f.normal.z) > 0.95:
                out = Vector((0, 0, 1 if profile[k + 1][0] < profile[k][0] else -1))
            orient(f, out)
    for ring, up, want in ((rings[0], -1, cap_bottom), (rings[-1], 1, cap_top)):
        if want and len(ring) > 2:
            f = bm.faces.new(ring)
            orient(f, Vector((0, 0, up)))
    return kit._object(name, bm, mat)


def xy_prism(name, profile, z0, z1, mats, x0=0.0, y0=0.0):
    """A profile of (x, y) points pushed along z from z0 to z1. `mats` is one
    material, or (front, back, sides)."""
    if not isinstance(mats, (list, tuple)):
        mats = (mats, mats, mats)
    bm = bmesh.new()
    front = [bm.verts.new(B((x0 + x, y0 + y, z1))) for x, y in profile]
    back = [bm.verts.new(B((x0 + x, y0 + y, z0))) for x, y in profile]
    faces = []
    f = bm.faces.new(front)
    faces.append((f, 0, Vector((0, -1, 0))))
    f = bm.faces.new(back)
    faces.append((f, 1, Vector((0, 1, 0))))
    n = len(profile)
    cx = sum(p[0] for p in profile) / n
    cy = sum(p[1] for p in profile) / n
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new([front[i], front[j], back[j], back[i]])
        mx = (profile[i][0] + profile[j][0]) / 2 - cx
        my = (profile[i][1] + profile[j][1]) / 2 - cy
        faces.append((f, 2, B((mx, my, 0))))
    used = []
    for mat in mats:
        if mat not in used:
            used.append(mat)
    for f, slot, out in faces:
        orient(f, out)
        f.material_index = used.index(mats[slot])
    obj = kit._object(name, bm, None)
    for mat in used:
        obj.data.materials.append(mat)
    return obj


def face(name, corners, mat, outward):
    """One flat face from app-frame corners, facing `outward` (app frame)."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(B(c)) for c in corners])
    orient(f, B(outward))
    return kit._object(name, bm, mat)


def drop_faces(obj, test):
    """Delete the faces whose Blender-frame normal passes `test`."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(f.normal)], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def no_bottom(obj):
    return drop_faces(obj, lambda n: n.z < -0.9)


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
