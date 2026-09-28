"""
Shared modelling helpers for the construction and incident kits (spike:
Blender assets vs procedural), on top of `blender/kit.py`. Coordinates are the
app's frame, as in kit.py.

Everything here builds cheaply: boxes drop the faces nobody sees, rods are
open at the ends, lathes are open at the bottom, because the pieces are
repeated along fences and scaffolds and every triangle is paid for many times.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.path.dirname(HERE)
for path in (HERE, BLENDER, os.path.join(BLENDER, "props"), os.path.join(BLENDER, "incidents")):
    if path not in sys.path:
        sys.path.insert(0, path)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B  # noqa: E402

# Blender-frame normals of a box's faces, named in the app's frame.
SIDES = {
    "top": (0, 0, 1),
    "bottom": (0, 0, -1),
    "front": (0, -1, 0),  # app +z
    "back": (0, 1, 0),
    "left": (-1, 0, 0),
    "right": (1, 0, 0),
}


def open_box(name, size, pos, mat, drop=(), rot=(0, 0, 0)):
    """A box of app `size` at `pos` without the faces named in `drop`
    ("bottom", "left", ...): 2 triangles a face instead of 12 a box."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    bm.normal_update()
    dead = [f for f in bm.faces if any(f.normal.dot(Vector(SIDES[d])) > 0.9 for d in drop)]
    if dead:
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    kit._place(bm, pos, rot)
    return kit._object(name, bm, mat)


def rod(name, a, b, w, h, mat, ends=False):
    """A square bar from app point `a` to `b`, `w` x `h` across, open at both
    ends unless `ends`: what a ledger, a brace or a rail is."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d.length, h)), verts=bm.verts)
    bm.normal_update()
    if not ends:
        dead = [f for f in bm.faces if abs(f.normal.y) > 0.9]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    obj = kit._object(name, bm, mat)
    q = Vector((0, 1, 0)).rotation_difference(B(d).normalized())
    obj.data.transform(Matrix.Translation(B((a + b) / 2)) @ q.to_matrix().to_4x4())
    return obj


def plan_slab(name, plan, y0, y1, mat, bottom=False, pos=(0, 0, 0)):
    """A plan of app (x, z) points stood up from y0 to y1: top and sides, and
    a bottom only when asked (a patch on the ground never shows it)."""
    bm = bmesh.new()
    verts = [bm.verts.new(B((px, y0, pz))) for px, pz in plan]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, y1 - y0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if not bottom:
        bm.normal_update()
        dead = [f for f in bm.faces if f.normal.z < -0.9]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    if any(pos):
        bmesh.ops.translate(bm, vec=B(pos), verts=bm.verts)
    return kit._object(name, bm, mat)


def lathe(name, rings, mat, sides=6, mats=None, turn=0.0, tip=None, cap_bottom=False):
    """A closed shell through rings of app (y, rx, rz, dx, dz): each ring is
    `sides` corners round an ellipse centred `dx, dz` off the axis, so a flame
    can lean. `mats` gives a material per band between rings; `tip` is an app
    point the last ring closes to. Open at the bottom unless `cap_bottom`."""
    bm = bmesh.new()
    loops = []
    for y, rx, rz, dx, dz in rings:
        loops.append([
            bm.verts.new(B((dx + math.cos(turn + 2 * math.pi * i / sides) * rx, y,
                            dz + math.sin(turn + 2 * math.pi * i / sides) * rz)))
            for i in range(sides)
        ])
    materials = []
    slots = []

    def slot(m):
        if m not in materials:
            materials.append(m)
        return materials.index(m)

    for band, (a, b) in enumerate(zip(loops, loops[1:])):
        idx = slot(mats[band] if mats else mat)
        for i in range(sides):
            j = (i + 1) % sides
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = idx
    if tip is not None:
        idx = slot(mats[len(loops) - 1] if mats and len(mats) >= len(loops) else (mats[-1] if mats else mat))
        apex = bm.verts.new(B(tip))
        for i in range(sides):
            j = (i + 1) % sides
            f = bm.faces.new((loops[-1][i], loops[-1][j], apex))
            f.material_index = idx
    if cap_bottom:
        f = bm.faces.new(list(reversed(loops[0])))
        f.material_index = slot(mats[0] if mats else mat)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for m in materials:
        mesh.materials.append(m)
    return obj


def tri_fan(name, points, mat):
    """A flat polygon of app (x, y, z) points, one face (fan-triangulated at export)."""
    bm = bmesh.new()
    verts = [bm.verts.new(B(p)) for p in points]
    bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._object(name, bm, mat)


def bake_spread(objs, gap=1.2, distance=0.5, floor=0.55, samples=96):
    """Bake each object's occlusion alone on the ground, laid out along x so
    nothing shades anything else, then put every object back on its origin."""
    x = 0.0
    for obj in objs:
        xs = [c[0] for c in obj.bound_box]
        lo, hi = min(xs), max(xs)
        obj.location.x = x - lo
        x += hi - lo + gap
    lp.bake_alone([[o] for o in objs], distance=distance, floor=floor, samples=samples)
    for obj in objs:
        obj.location = (0, 0, 0)


def row(objs, gap=0.8):
    """For a preview: objects side by side along +x, left to right."""
    return lp.row(objs, gap)


def set_ao(obj, fn):
    """Rewrite an object's AO per corner: `fn(app_y, x, z, old) -> value`, for
    gradients a bake cannot give (a flame's heat, a blade's tip)."""
    mesh = obj.data
    ao = mesh.color_attributes["AO"].data
    origin = obj.location
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            c = ao[li].color
            k = fn(v.z + origin.z, v.x + origin.x, -(v.y + origin.y), c[0])
            ao[li].color = (k, k, k, 1.0)


def blob(name, radius, pos, mat, scale=(1, 1, 1), subdivisions=1, wobble=0.0, seed=0.0, bottom=True):
    """A faceted icosphere (a clump of leaves, a heap of soil), scaled in the
    app frame; `wobble` pushes its corners in and out so it is not a
    regular ball. `bottom=False` drops the faces that face the ground."""
    from mathutils import noise

    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    if wobble:
        for v in bm.verts:
            n = noise.noise(v.co * 2.1 + Vector((seed, seed * 0.7, seed * 1.3)))
            v.co *= 1 + n * wobble
    sx, sy, sz = scale
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    if not bottom:
        bm.normal_update()
        dead = [f for f in bm.faces if f.normal.z < -0.5]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.translate(bm, vec=B(pos), verts=bm.verts)
    return kit._object(name, bm, mat)
