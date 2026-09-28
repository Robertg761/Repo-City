"""
Helpers for the traffic fleet (spike: Blender assets vs procedural).

The fleet is instanced forty-odd times a frame, so its bodies are built for
triangles, not from boxes: each body is one LOFT, a ring of points across the
car (sill, bumper line, waist, roof edge, mirrored) stepped along its length.
One loft gives what the procedural stack of prisms cannot at the same cost:
a plan that tapers into the nose and tail (rounded, from the city camera),
tumblehome (flanks that lean in above the waist, a roof narrower than the
body), a bonnet with chamfered shoulders, and bumpers that wrap the corners.
Its underside is left open: nothing ever looks at a car from below.

Coordinates are the app's (x across, y up, z forward, road at y = 0); see
`blender/kit.py`.
"""

import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
from kit import B  # noqa: E402

# The fleet's colours (shapes.ts). Paintwork is near white and its role starts
# with `paint`, so the instance colour paints it; the three shades are the
# ones `emergency.ts` tells apart when it repaints a body (PAINT, ROOF_SHADE,
# PANEL_SHADE), so their hex must match shapes.ts exactly.
PAINT = "#f0f0f0"
ROOF = "#ffffff"
PANEL = "#b4b4b4"
GLASS = "#51647a"
TRIM = "#3d4045"
ARCH = "#232427"
TYRE = "#26282b"
HUB = "#b9bcc0"
PLATE = "#d5d0bc"
AMBER = "#c98e42"
REFLECTOR = "#ac4438"


def palette():
    # Roughness only shapes the previews (the importer reads the colour and
    # the surface); it is held near the city's own 0.5 so a render compares
    # like with like.
    m = kit.material
    return {
        "paint": m("paint", PAINT, "metal", 0.5),
        "roof": m("paintRoof", ROOF, "metal", 0.5),
        "panel": m("paintPanel", PANEL, "metal", 0.5),
        "glass": m("glass", GLASS, "glass", 0.45),
        "trim": m("trim", TRIM, "metal", 0.6),
        "arch": m("arch", ARCH, "metal", 0.8),
        "hub": m("hub", HUB, "metal", 0.4),
        "plate": m("plate", PLATE, "metal", 0.6),
        "amber": m("amber", AMBER, "glass", 0.4),
        "reflector": m("reflector", REFLECTOR, "glass", 0.4),
        "tyre": m("tyre", TYRE, "fabric", 0.9),
    }


def _mesh_object(name, bm, mats):
    """An object from a bmesh whose faces carry indices into `mats`."""
    obj = kit._object(name, bm, None)
    for mat in mats:
        obj.data.materials.append(mat)
    return obj


def _orient(bm, face, outward):
    face.normal_update()
    if face.normal.dot(outward) < 0:
        face.normal_flip()


def loft(name, sections, side_mat, cap_mat, centre_y=0.6):
    """A car shell from cross-sections.

    `sections` run rear to front as `(z, [(x, y), ...])`: the right half of the
    ring from the sill up to the roof edge, mirrored to make the left. Every
    section has the same number of points; points that coincide (a glass band
    of no height over the bonnet) collapse into triangles.

    `side_mat(segment, strip)` names the material of a strip of the skin (strip
    0 at the sill up to `m - 1`, the top, for `m` points a side; None leaves a
    hole). `cap_mat(end, band)` names the tail (`end` 0) and nose (`end` 1)
    faces, band 0 at the bottom.
    """
    bm = bmesh.new()
    rings = []
    m = len(sections[0][1])
    for z, pts in sections:
        assert len(pts) == m, f"{name}: section at z={z} has {len(pts)} points, not {m}"
        ring = [bm.verts.new(B((x, y, z))) for x, y in pts]
        ring += [bm.verts.new(B((-x, y, z))) for x, y in reversed(pts)]
        rings.append(ring)
    n = 2 * m
    names = []
    faces = []

    def index(key):
        if key not in names:
            names.append(key)
        return names.index(key)

    for s in range(len(sections) - 1):
        z_mid = (sections[s][0] + sections[s + 1][0]) / 2
        for j in range(n - 1):
            strip = j if j < m else n - 2 - j
            key = side_mat(s, strip)
            if key is None:
                continue
            quad = [rings[s][j], rings[s][j + 1], rings[s + 1][j + 1], rings[s + 1][j]]
            faces.append((quad, key, None, z_mid))
    for end, s in ((0, 0), (1, len(sections) - 1)):
        ring = rings[s]
        for j in range(m - 1):
            key = cap_mat(end, j)
            if key is None:
                continue
            quad = [ring[j], ring[j + 1], ring[n - 2 - j], ring[n - 1 - j]]
            faces.append((quad, key, "tail" if end == 0 else "nose", None))

    made = []
    for quad, key, cap, z_mid in faces:
        # Drop repeated corners so a collapsed quad becomes a triangle.
        uniq = []
        for v in quad:
            if all((v.co - u.co).length > 1e-6 for u in uniq):
                uniq.append(v)
        if len(uniq) < 3:
            continue
        # Coincident verts are distinct BMVerts until remove_doubles; build
        # the face on the survivors.
        try:
            f = bm.faces.new(uniq)
        except ValueError:
            continue
        f.material_index = index(key)
        c = f.calc_center_median()
        if cap == "nose":
            outward = Vector((0, -1, 0))
        elif cap == "tail":
            outward = Vector((0, 1, 0))
        else:
            outward = c - Vector((0, c.y, centre_y))
        made.append((f, outward))
    for f, outward in made:
        _orient(bm, f, outward)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    return name, bm, names


def build_loft(name, sections, side_mat, cap_mat, M, centre_y=0.6):
    name, bm, keys = loft(name, sections, side_mat, cap_mat, centre_y)
    return _mesh_object(name, bm, [M[k] for k in keys])


def quad(name, corners, mat, outward):
    """One quad from four app-frame corners, facing `outward` (app frame)."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(B(c)) for c in corners])
    _orient(bm, f, B(outward))
    return kit._object(name, bm, mat)


def flank_panel(name, x_at, z0, z1, y0, y1, mat, side, proud=0.006):
    """A quad on a flank between heights y0..y1 and z0..z1, following the
    flank's lean: `x_at(y)` is the flank's half width at that height."""
    s = side
    corners = [
        (s * (x_at(y0) + proud), y0, z0),
        (s * (x_at(y0) + proud), y0, z1),
        (s * (x_at(y1) + proud), y1, z1),
        (s * (x_at(y1) + proud), y1, z0),
    ]
    return quad(name, corners, mat, (s, 0, 0))


def face_panel(name, cx, cy, z, w, h, mat, facing=1, lean=0.0):
    """A quad on the nose (facing +1) or the tail (-1), centred on (cx, cy)."""
    corners = [
        (cx - w / 2, cy - h / 2, z - lean * h / 2),
        (cx + w / 2, cy - h / 2, z - lean * h / 2),
        (cx + w / 2, cy + h / 2, z + lean * h / 2),
        (cx - w / 2, cy + h / 2, z + lean * h / 2),
    ]
    return quad(name, corners, mat, (0, 0, facing))


def drop_faces(obj, test):
    """Delete the faces whose Blender-frame normal passes `test`: the bottom
    of a part that stands on the car, the side of one that lies against it."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(f.normal)], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def arch(name, z, radius, bottom, half_width, mat, top=None):
    """A wheel arch across the car: a dark six-sided flare over the tyre,
    standing a touch proud of both flanks. The shoulders are what make it
    read as an arch rather than as a block. No underside: 18 triangles."""
    top = top if top is not None else radius * 2.2
    r = radius
    profile = [
        (z - r * 1.3, bottom),
        (z + r * 1.3, bottom),
        (z + r * 1.1, top - r * 0.35),
        (z + r * 0.55, top),
        (z - r * 0.55, top),
        (z - r * 1.1, top - r * 0.35),
    ]
    obj = kit.prism(name, profile, half_width * 2, mat, bev=0.0)
    return drop_faces(obj, lambda n: n.z < -0.9)


def lidless_box(name, size, pos, mat):
    """A box with no underside, for things that stand on the car: 10 triangles."""
    return drop_faces(kit.box(name, size, pos, mat, bev=0.0), lambda n: n.z < -0.9)


def mirror(name, side, x, y, z, mat, reach=0.05, height=0.07, depth=0.1):
    """A door mirror: a wedge off the flank at (x, y, z), pointing back into
    the wind. Its inner face is against the car and its underside is never
    seen, so it is five triangles."""
    s = side
    bm = bmesh.new()
    y0, y1 = y - height / 2, y + height / 2
    # Plan triangle: the root along the flank, the tip out and back.
    plan = [(s * x, z + depth / 2), (s * (x + reach), z + depth * 0.1), (s * (x + reach * 0.8), z - depth / 2), (s * x, z - depth / 2)]
    lo = [bm.verts.new(B((px, y0, pz))) for px, pz in plan]
    hi = [bm.verts.new(B((px, y1, pz))) for px, pz in plan]
    faces = [(hi, (0, 1, 0))]
    for i in range(3):
        a, b = i, i + 1
        mid = [(plan[a][0] + plan[b][0]) / 2, (plan[a][1] + plan[b][1]) / 2]
        faces.append(([lo[a], lo[b], hi[b], hi[a]], (mid[0] - s * x, 0, mid[1] - z)))
    for verts, out in faces:
        f = bm.faces.new(verts)
        _orient(bm, f, B(out))
    return kit._object(name, bm, mat)


def tint(objs, hex_):
    """Paint the paintwork of `objs` in a car colour, for previews only: the
    city does this with the instance colour."""
    k = kit.hex_linear(hex_)
    done = set()
    for obj in objs:
        if obj.type != "MESH":
            continue
        for mat in obj.data.materials:
            if mat is None or mat.name in done or not mat.name.startswith("paint"):
                continue
            done.add(mat.name)
            mix = next(n for n in mat.node_tree.nodes if n.type == "MIX")
            a = mix.inputs["A"].default_value
            mix.inputs["A"].default_value = (a[0] * k[0], a[1] * k[1], a[2] * k[2], 1)


def preview_wheels(spec, M, radii=None, widths=None):
    """The street's wheels and lamps at the spec's positions, for previews
    (the city draws them as separate instances)."""
    objs = []
    for i, (x, z) in enumerate(spec["wheels"]):
        r = radii[i] if radii else spec["wheelRadius"]
        w = widths[i] if widths else 0.9 * r
        objs.append(kit.cyl("tyre", r, w, (x, r, z), M["tyre"], axis="x", verts=8))
        objs.append(kit.cyl("hubcap", r * 0.5, w + 0.1 * r, (x, r, z), M["hub"], axis="x", verts=6))
    head = kit.material("headlight", "#fff2cf", "glass", 0.2, emission=0.4)
    tail = kit.material("taillight", "#ff4a3a", "glass", 0.3, emission=0.2)
    lw, lh = spec["lamp"]
    for p in spec["headlights"]:
        objs.append(kit.box("lamp", (lw, lh, 0.05), p, head, bev=0.0))
    for p in spec["taillights"]:
        objs.append(kit.box("lamp", (lw, lh, 0.05), p, tail, bev=0.0))
    return objs


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
