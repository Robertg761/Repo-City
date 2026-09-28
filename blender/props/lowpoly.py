"""
Helpers for the instanced street props, on top of `blender/kit.py`. Spike
tooling.

These models are drawn by the hundred, so every triangle has to be one the
camera sees: tubes are open where nobody looks, crowns are one hull (a union
of lumps, remeshed and decimated to a triangle target) instead of a pile of
balls that hide most of each other, and each object is baked alone.

Coordinates are the app's frame, as in kit.py.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
from kit import B  # noqa: E402


def _obj(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    return obj


def tube(name, a, b, r0, r1, mat, sides=6, cap0=False, cap1=False, turn=0.0, squash=1.0):
    """A tapered tube from app point `a` (radius r0) to `b` (radius r1).
    Open unless a cap is asked for: the foot of a trunk stands in the ground
    and the top of a limb disappears into the crown."""
    a, b = Vector(a), Vector(b)
    axis = b - a
    length = axis.length
    bm = bmesh.new()
    rings = []
    for y, r in ((0.0, r0), (length, r1)):
        ring = []
        for i in range(sides):
            t = turn + 2 * math.pi * i / sides
            ring.append(bm.verts.new((math.cos(t) * r, math.sin(t) * r * squash, y)))
        rings.append(ring)
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    if cap0:
        bm.faces.new(list(reversed(rings[0])))
    if cap1:
        bm.faces.new(rings[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Built along local Z; turn Z onto the Blender-frame axis.
    d = B(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d)
    M = Matrix.Translation(B(a)) @ q.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _obj(name, bm, mat)


def cone(name, rim, y0, y1, mat, centre=(0, 0), under=None, turn=0.0):
    """A cone from a rim of app (x, z, dy) offsets at height y0 up to an apex at
    y1. `under` is the height of an inner apex the underside rises to (a skirt
    of branches is hollow underneath); None closes the rim flat; "open"
    leaves no underside (a tuft standing on the ground)."""
    bm = bmesh.new()
    cx, cz = centre
    ring = []
    for x, z, dy in rim:
        c, s = math.cos(turn), math.sin(turn)
        rx, rz = x * c - z * s, x * s + z * c
        ring.append(bm.verts.new(B((cx + rx, y0 + dy, cz + rz))))
    apex = bm.verts.new(B((cx, y1, cz)))
    n = len(ring)
    for i in range(n):
        bm.faces.new((ring[i], ring[(i + 1) % n], apex))
    if under is None:
        bm.faces.new(list(reversed(ring)))
    elif under == "open":
        pass
    else:
        inner = bm.verts.new(B((cx, under, cz)))
        for i in range(n):
            bm.faces.new((ring[(i + 1) % n], ring[i], inner))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, mat)


def lumps(name, spheres, target, mat, voxel=0.07, wobble=0.0, seed=0.0):
    """One hull round a cluster of lumps, decimated to about `target`
    triangles. `spheres` are (centre, radius, (sx, sy, sz)) in the app frame.
    The union is taken by a voxel remesh, so no triangle is spent inside
    another lump; `wobble` pushes the surface in and out a little so the
    decimated facets are not a regular polyhedron."""
    bm = bmesh.new()
    for centre, radius, squash in spheres:
        part = bmesh.new()
        bmesh.ops.create_uvsphere(part, u_segments=24, v_segments=14, radius=radius)
        sx, sy, sz = squash
        bmesh.ops.scale(part, vec=Vector((sx, sz, sy)), verts=part.verts)
        bmesh.ops.translate(part, vec=B(centre), verts=part.verts)
        mesh = bpy.data.meshes.new("tmp")
        part.to_mesh(mesh)
        part.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    obj = _obj(name + ".src", bm, mat)
    rm = obj.modifiers.new("Remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    mesh = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(obj, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    if wobble:
        for v in bm.verts:
            n = noise.noise(v.co * 1.7 + Vector((seed, seed * 0.7, seed * 1.3)))
            v.co += v.normal * n * wobble
    out = _obj(name, bm, mat)
    tris = sum(len(p.vertices) - 2 for p in out.data.polygons)
    dec = out.modifiers.new("Decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, target / max(tris, 1))
    dec.use_collapse_triangulate = True
    return out


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bake_alone(groups, distance=0.5, floor=0.55, samples=96):
    """Bake each group's occlusion with every other group hidden: the models
    share one origin and would shade each other. A group is an object or a
    list of objects that belong together (a lamp's pole and its glass)."""
    groups = [g if isinstance(g, (list, tuple)) else [g] for g in groups]
    everything = [o for g in groups for o in g]
    for group in groups:
        for o in everything:
            o.hide_render = o not in group
        kit.bake_ao(group, distance=distance, samples=samples, floor=floor)
    for o in everything:
        o.hide_render = False


def grade(obj, prefix, y0, y1, low):
    """Darken the faces of materials named `prefix...` towards their bottom:
    `low` at app height y0, 1 at y1. The underside of a crown is in its own
    shade, which a short occlusion bake does not see."""
    mesh = obj.data
    ao = mesh.color_attributes["AO"].data
    idx = [i for i, m in enumerate(mesh.materials) if m.name.startswith(prefix)]
    origin = obj.location
    for poly in mesh.polygons:
        if poly.material_index not in idx:
            continue
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            y = v.z + origin.z  # Blender z is app y
            t = min(1.0, max(0.0, (y - y0) / (y1 - y0)))
            k = low + (1 - low) * t
            c = ao[li].color
            ao[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)


def row(objs, gap=0.6):
    """Lay objects out along +x for a preview, left to right."""
    x = 0.0
    for obj in objs:
        lo = min((obj.matrix_world @ Vector(c)).x for c in obj.bound_box)
        hi = max((obj.matrix_world @ Vector(c)).x for c in obj.bound_box)
        obj.location.x += x - lo
        x += hi - lo + gap
    return objs


def blobs(name, spheres, mat, subdiv=1, wobble=0.06, seed=0.0, decimate=None):
    """A crown of faceted balls joined by an exact boolean union: the facets
    keep their crisp low-poly planes and the creases between balls, but the
    faces buried inside another ball are gone. `spheres` are (centre, radius,
    (sx, sy, sz)) in the app frame. `decimate` collapses the union down to
    about that many triangles."""
    objs = []
    for i, (centre, radius, squash) in enumerate(spheres):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
        for v in bm.verts:
            n = noise.noise(v.co * 2.3 + Vector((seed + i * 3.1, seed * 0.7, seed * 1.3 + i)))
            v.co *= 1 + n * wobble
        sx, sy, sz = squash
        bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(seed + i * 0.9, 3, "Z"), verts=bm.verts)
        bmesh.ops.translate(bm, vec=B(centre), verts=bm.verts)
        objs.append(_obj(f"{name}.{i}", bm, mat))
    base = objs[0]
    for other in objs[1:]:
        mod = base.modifiers.new("Union", "BOOLEAN")
        mod.operation = "UNION"
        mod.solver = "EXACT"
        mod.object = other
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    out = _obj(name, bm, mat)
    out.data.materials.clear()
    out.data.materials.append(mat)
    if decimate:
        n = tris(out)
        if n > decimate:
            dec = out.modifiers.new("Decimate", "DECIMATE")
            dec.decimate_type = "COLLAPSE"
            dec.ratio = decimate / n
            dec.use_collapse_triangulate = True
    return out


def panel(name, w, h, pos, mat, rot=(0, 0, 0)):
    """One quad, `w` x `h`, facing app +z before `rot`: a flush marking that
    costs two triangles instead of a box's twelve."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, y)) for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
    bm.faces.new(vs)
    # Built facing Blender -y, which is app +z.
    kit._place(bm, pos, rot)
    return _obj(name, bm, mat)


def ring(name, w, d, t, y0, y1, mat):
    """A rectangular kerb `w` x `d` (outside), `t` thick, from y0 to y1: top,
    outer and inner walls, no bottom."""
    bm = bmesh.new()
    outer = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    inner = [(x - math.copysign(t, x), z - math.copysign(t, z)) for x, z in outer]
    ob = [bm.verts.new(B((x, y0, z))) for x, z in outer]
    ot = [bm.verts.new(B((x, y1, z))) for x, z in outer]
    ib = [bm.verts.new(B((x, y0, z))) for x, z in inner]
    it = [bm.verts.new(B((x, y1, z))) for x, z in inner]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ib[j], ib[i], it[i], it[j]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, mat)
