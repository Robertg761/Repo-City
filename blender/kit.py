"""
A small modelling kit for scripted Blender assets. Spike tooling.

Every call takes coordinates in the APP's frame -- x across, y up, z forward,
ground at y = 0 -- and converts to Blender's Z-up frame (x, -z, y) itself, so
numbers can be copied straight out of the TypeScript specs. The glTF exporter
converts back.

Materials are named `<role>.<surface>`; the importer reads the surface id from
the name and the colour from the material's base colour.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector


def B(p):
    """App (x, y up, z forward) -> Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(hex_):
    h = hex_.lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


_materials = {}


def material(role, hex_, surface, roughness=0.6, metallic=0.0, emission=0.0, tone=1.0):
    """`tone` darkens a slot colour for this material only: the importer bakes
    it into the vertex colour, so a landmark slot can carry a darker shade of
    itself (a door recess, a roof membrane) without costing another draw."""
    name = f"{role}.{surface}" + (f".t{round(tone * 100)}" if tone != 1.0 else "")
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgb = tuple(c * tone for c in hex_linear(hex_))
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    # The city multiplies a baked ambient occlusion into the vertex colour; the
    # preview does the same so what is rendered here is what the city shows.
    ao = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    ao.layer_name = "AO"
    mix = mat.node_tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["A"].default_value = (*rgb, 1)
    mat.node_tree.links.new(ao.outputs["Color"], mix.inputs["B"])
    mat.node_tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    mat["hex"] = hex_
    _materials[name] = mat
    return mat


def reset():
    _materials.clear()


def _object(name, bm, mat, collection=None):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    return obj


def bevel(obj, width, segments=1, angle=40, harden=False):
    if width <= 0:
        return obj
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.use_clamp_overlap = True
    mod.harden_normals = harden
    return obj


def _place(bm, pos, rot=(0, 0, 0)):
    # Rotation is given in the app frame (XYZ Euler about app axes). App axes
    # map to Blender as x->x, y->z, z->-y, so an app rotation R becomes
    # C R C^-1 with C the axis change.
    C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
    rx, ry, rz = rot
    R = (
        Matrix.Rotation(rz, 3, "Z") @ Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rx, 3, "X")
    )
    M = (C @ R @ C.inverted()).to_4x4()
    M.translation = B(pos)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)


def box(name, size, pos, mat, bev=0.02, seg=1, rot=(0, 0, 0), cell=0.0):
    """A box of app-frame `size` (x, y, z) centred on `pos`. `cell` slices the
    faces into cells about that big: occlusion is baked per vertex, and a wall
    that is one quad takes the shade of its four corners across its face."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    if cell:
        for axis, length in ((0, sx), (1, sz), (2, sy)):
            cuts = max(0, math.ceil(length / cell) - 1)
            for i in range(1, cuts + 1):
                co = Vector((0, 0, 0))
                co[axis] = -length / 2 + length * i / (cuts + 1)
                no = Vector((0, 0, 0))
                no[axis] = 1
                geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
                bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    _place(bm, pos, rot)
    # A chamfer on anything thinner than 5 cm is sub-pixel in the city and
    # costs 30-odd triangles; leave those square.
    if min(size) < 0.05:
        bev = 0
    return bevel(_object(name, bm, mat), min(bev, min(size) * 0.45), seg)


def cyl(name, radius, depth, pos, mat, axis="x", verts=12, bev=0.0, seg=1, radius2=None, rot=None):
    """A cylinder (or a cone frustum with `radius2`) along an app-frame axis."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=verts, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth
    )
    # created along Blender Z, which is app y.
    turn = {"y": (0, 0, 0), "x": (0, 0, -math.pi / 2), "z": (math.pi / 2, 0, 0)}[axis]
    _place(bm, pos, rot or turn)
    return bevel(_object(name, bm, mat), bev, seg)


def prism(name, profile, width, mat, x=0.0, bev=0.02, seg=1):
    """A side profile of app (z, y) points pushed across `width`, centred on `x`."""
    bm = bmesh.new()
    verts = [bm.verts.new(B((x - width / 2, y, z))) for z, y in profile]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((width, 0, 0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bevel(_object(name, bm, mat), bev, seg)


def plan_prism(name, plan, y0, y1, mat, bev=0.02, seg=1):
    """A plan of app (x, z) points stood up from y0 to y1."""
    bm = bmesh.new()
    verts = [bm.verts.new(B((px, y0, pz))) for px, pz in plan]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, y1 - y0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bevel(_object(name, bm, mat), bev, seg)


def rounded_rect(x0, x1, z0, z1, radii, steps=3):
    """Plan outline with per-corner radii (x1z1, x0z1, x0z0, x1z0), counter-clockwise."""
    corners = [
        (x1, z1, 0.0, radii[0]),
        (x0, z1, math.pi / 2, radii[1]),
        (x0, z0, math.pi, radii[2]),
        (x1, z0, 3 * math.pi / 2, radii[3]),
    ]
    out = []
    for cx, cz, start, r in corners:
        if r <= 0:
            out.append((cx, cz))
            continue
        sx = -1 if cx == x1 else 1
        sz = -1 if cz == z1 else 1
        ox, oz = cx + sx * r, cz + sz * r
        for i in range(steps + 1):
            a = start + (math.pi / 2) * i / steps
            out.append((ox + math.cos(a) * r, oz + math.sin(a) * r))
    return out


def strut(name, a, b, thick, mat, bev=0.0):
    """A bar from app point `a` to `b`, `thick` = (across, deep)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((thick[0], length, thick[1])), verts=bm.verts)
    obj = _object(name, bm, mat)
    # Blender-frame direction of the bar; the cube's long axis is Blender Y.
    db = B(d).normalized()
    q = Vector((0, 1, 0)).rotation_difference(db)
    obj.data.transform(Matrix.Translation(B((a + b) / 2)) @ q.to_matrix().to_4x4())
    return bevel(obj, min(bev, min(thick) * 0.4))


def cut(target, cutter):
    """Boolean-subtract `cutter` from `target` (cutter is removed at join)."""
    mod = target.modifiers.new("Cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.material_mode = "TRANSFER"
    mod.object = cutter
    # Booleans go before the bevel so the new edges get chamfered too.
    target.modifiers.move(len(target.modifiers) - 1, 0)
    cutter.hide_render = True
    cutter.display_type = "WIRE"
    cutter["cutter"] = True
    return target


def cut_many(target, cutters):
    """Boolean-subtract a whole list of cutters in one modifier."""
    coll = bpy.data.collections.new(f"cut-{target.name}")
    bpy.context.scene.collection.children.link(coll)
    for c in cutters:
        for home in c.users_collection:
            home.objects.unlink(c)
        coll.objects.link(c)
        c.hide_render = True
        c["cutter"] = True
    mod = target.modifiers.new("CutMany", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.material_mode = "TRANSFER"
    mod.operand_type = "COLLECTION"
    mod.collection = coll
    target.modifiers.move(len(target.modifiers) - 1, 0)
    return target


def marker(name, pos):
    """An empty at an app-frame point; exported as a mesh-less glTF node."""
    obj = bpy.data.objects.new(name, None)
    obj.location = B(pos)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def finish(objs, name, origin=(0, 0, 0)):
    """Apply every modifier, join into one mesh, flat shade, set the origin."""
    cutters = [o for o in bpy.data.objects if o.get("cutter")]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bms = bmesh.new()
    mats = []
    for obj in objs:
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        mesh.transform(obj.matrix_world)
        remap = []
        for m in mesh.materials:
            # The evaluated mesh lists the depsgraph's copies of the materials;
            # the joined mesh must hold the originals or it dangles.
            m = m.original
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        offset = len(bms.faces)
        bms.from_mesh(mesh)
        bms.faces.ensure_lookup_table()
        for f in bms.faces[offset:]:
            f.material_index = remap[f.material_index] if remap else 0
        ev.to_mesh_clear()
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(bms, verts=bms.verts, dist=1e-5)
    bms.to_mesh(mesh)
    bms.free()
    for m in mats:
        mesh.materials.append(m)
    for poly in mesh.polygons:
        poly.use_smooth = False
    ao = mesh.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
    ao.data.foreach_set("color", [1.0] * (len(ao.data) * 4))
    mesh.color_attributes.active_color = ao
    out = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(out)
    for obj in list(objs) + cutters:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    o = B(origin)
    out.data.transform(Matrix.Translation(-o))
    out.location = o
    return out


def bake_ao(objs, distance=0.5, samples=128, floor=0.35):
    """Bake ambient occlusion into each object's `AO` colour attribute, with a
    ground plane under them so the lower edges pick up contact shade."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.bake_type = "AO"
    scene.render.bake.target = "VERTEX_COLORS"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("BakeWorld")
    scene.world.light_settings.distance = distance
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
    ground = _object("bakeGround", bm, None)
    for obj in objs:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.bake(type="AO")
    bpy.data.objects.remove(ground, do_unlink=True)
    # Lift the floor: full black in a crevice reads as a hole at city scale.
    for obj in objs:
        data = obj.data.color_attributes["AO"].data
        values = [0.0] * (len(data) * 4)
        data.foreach_get("color", values)
        for i in range(0, len(values), 4):
            v = floor + (1 - floor) * values[i]
            values[i] = values[i + 1] = values[i + 2] = v
            values[i + 3] = 1.0
        data.foreach_set("color", values)
