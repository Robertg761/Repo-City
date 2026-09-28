"""
Helpers the landmark scripts share on top of `blender/kit.py` (which is
frozen): slot palettes, surfaces of revolution, sagging wires, shrubs and a
per-node occlusion bake. App frame everywhere (x across, y up, z forward).
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit  # noqa: E402


def slots(hexes, surfaces):
    """`S(slot, tone=1.0, **kw)`: the material for a landmark colour slot."""

    def S(slot, tone=1.0, **kw):
        return kit.material(slot, hexes[slot], surfaces[slot], tone=tone, **kw)

    return S


def lathe(name, profile, segments, centre, mat, closed=False, cap_top=False, cap_bottom=False, mats=None, phase=0.0):
    """A surface of revolution about app-y through `centre` (x, y, z) from
    `[(radius, y), ...]` rows. Faces point to the right of the direction the
    profile walks in the (radius, y) plane: walk up the outside and they face
    out, walk a closed loop counter-clockwise and it is a solid ring. `mats`
    optionally gives one material index per band between rows."""
    cx, cy, cz = centre
    bm = bmesh.new()
    rings = []
    for r, y in profile:
        ring = []
        for i in range(segments):
            a = phase + 2 * math.pi * i / segments
            ring.append(bm.verts.new(kit.B((cx + math.cos(a) * r, cy + y, cz + math.sin(a) * r))))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
    for k, (lo, hi) in enumerate(pairs):
        for i in range(segments):
            j = (i + 1) % segments
            f = bm.faces.new((lo[i], hi[i], hi[j], lo[j]))
            f.material_index = mats[k] if mats else 0
    if cap_bottom:
        bm.faces.new(rings[0])
    if cap_top:
        bm.faces.new(list(reversed(rings[-1])))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for m in mat if isinstance(mat, (list, tuple)) else [mat]:
        mesh.materials.append(m)
    return obj


def ring(name, r_in, r_out, y0, y1, segments, centre, mat):
    """A solid annulus from y0 to y1."""
    return lathe(name, [(r_in, y0), (r_out, y0), (r_out, y1), (r_in, y1)], segments, centre, mat, closed=True)


def solidify(obj, thickness, offset=-1.0):
    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = True
    return obj


def wire(name, a, b, thick, sag, mat, segments=4):
    """A cable from `a` to `b` that sags by `sag` in the middle."""

    def point(t):
        return (
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
            a[2] + (b[2] - a[2]) * t,
        )

    return [kit.strut(name, point(i / segments), point((i + 1) / segments), (thick, thick), mat) for i in range(segments)]


def shrub(x, y, z, r, mat, squash=0.75, subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=kit.B((x, y + r * squash * 0.9, z)))
    obj = bpy.context.active_object
    obj.scale = (1.0, 1.0, squash)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def sphere(x, y, z, r, mat, segments=8, rings=5):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=r, location=kit.B((x, y, z)))
    obj = bpy.context.active_object
    obj.data.materials.append(mat)
    return obj


def bake(obj, visible, everything, distance, floor=0.55):
    """Bake `obj`'s occlusion with only `visible` (plus itself) rendering."""
    keep = set(o.name for o in visible) | {obj.name}
    hidden = [o for o in everything if o.name not in keep and o.type == "MESH"]
    for o in hidden:
        o.hide_render = True
    kit.bake_ao([obj], distance=distance, floor=floor)
    for o in hidden:
        o.hide_render = False


def lattice_face(name, p0, p1, q0, q1, thick, mat):
    """An X brace across a quad with bottom p0-p1 and top q0-q1."""
    return [kit.strut(name, p0, q1, (thick, thick), mat), kit.strut(name, p1, q0, (thick, thick), mat)]


def mid(a, b, t=0.5):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def keep_only(objs, names):
    """For `preview()`: drop every object not named in `names`."""
    keep = [o for o in objs if o.name in names]
    for o in objs:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    return keep


def v(x, y, z):
    return Vector((x, y, z))


def rod(name, a, b, radius, mat, sides=4, phase=None):
    """An open-ended prism from app point `a` to `b`: a lattice member or a
    cable seen from the city costs 2 x `sides` triangles, no caps."""
    pa, pb = kit.B(a), kit.B(b)
    d = (pb - pa).normalized()
    ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(ref).normalized()
    w = d.cross(u).normalized()
    if phase is None:
        phase = math.pi / sides
    bm = bmesh.new()
    lo, hi = [], []
    for i in range(sides):
        t = phase + 2 * math.pi * i / sides
        off = (u * math.cos(t) + w * math.sin(t)) * radius
        lo.append(bm.verts.new(pa + off))
        hi.append(bm.verts.new(pb + off))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    # Point every face away from the axis.
    for f in bm.faces:
        c = f.calc_center_median()
        axis_pt = pa + d * (c - pa).dot(d)
        if f.normal.dot(c - axis_pt) < 0:
            f.normal_flip()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


def cable(name, a, b, radius, sag, mat, segments=4, sides=3):
    """A sagging cable of open rods."""

    def point(t):
        return (
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
            a[2] + (b[2] - a[2]) * t,
        )

    return [rod(name, point(i / segments), point((i + 1) / segments), radius, mat, sides) for i in range(segments)]


def slab(name, outline, thickness, pos, mat, turn=0.0, bev=0.0):
    """A flat shape from a local (u, v) outline -- u along app x, v up --
    extruded `thickness` along local z, turned `turn` about app y and moved
    to `pos`: sign blades, arrows, gables."""
    bm = bmesh.new()
    front = [bm.verts.new(kit.B((u, v, thickness / 2))) for u, v in outline]
    face = bm.faces.new(front)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=kit.B((0, 0, -thickness)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kit._place(bm, pos, (0, turn, 0))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    return kit.bevel(obj, bev) if bev else obj


def gable_roof(name, half_w, rise, depth, pos, mat, thick=0.14, overhang=0.25, along="z", bev=0.02):
    """A pitched roof: two sloping slabs meeting at the ridge, as one solid
    chevron, eaves `overhang` past `half_w`. `pos` is the wall-top centre;
    the ridge runs along app `along` (z or x)."""
    slope = rise / half_w
    w = half_w + overhang
    drop = overhang * slope
    outline = [(-w, -drop), (0.0, rise), (w, -drop), (w, -drop - thick), (0.0, rise - thick * 1.3), (-w, -drop - thick)]
    outline = [(u, v + thick * 0.5) for u, v in outline]
    return slab(name, outline, depth, pos, mat, turn=0.0 if along == "z" else math.pi / 2, bev=bev)


def gable_end(name, half_w, rise, thick, pos, mat, along="z"):
    """The triangular wall under a gable roof, `thick` deep."""
    return slab(name, [(-half_w, 0.0), (half_w, 0.0), (0.0, rise)], thick, pos, mat, turn=0.0 if along == "z" else math.pi / 2)


def pointed(name, width, height, depth, pos, mat, turn=0.0, head=None):
    """A lancet: a rectangle under a pointed head, `height` to the springing,
    stood on `pos` (its bottom centre), `depth` thick. A window, a cutter."""
    hw = width / 2
    head = head if head is not None else width * 0.8
    outline = [(-hw, 0.0), (hw, 0.0), (hw, height), (hw * 0.55, height + head * 0.62), (0.0, height + head), (-hw * 0.55, height + head * 0.62), (-hw, height)]
    return slab(name, outline, depth, pos, mat, turn=turn)


def arched(name, width, height, depth, pos, mat, turn=0.0, steps=5):
    """A round-headed opening: `height` to the springing, a semicircle over."""
    hw = width / 2
    outline = [(-hw, 0.0), (hw, 0.0)]
    for i in range(steps + 1):
        a = math.pi * i / steps
        outline.append((math.cos(a) * hw, height + math.sin(a) * hw))
    return slab(name, outline, depth, pos, mat, turn=turn)
