"""
The crowd's small car, in the Blender fleet's style (`blender/fleet/carkit.py`)
at the crowd's price. Spike tooling.

A crash is two of these and fifteen hundred crowd objects can be on screen,
so the car is one loft of five sections with three points a side (sill,
waist, roof edge): 48 triangles for a body whose plan tapers into the nose
and tail, whose flanks lean in above the waist to a narrower roof, with a
sloped bonnet, a raked windscreen and a hatchback's tailgate, the glass in
the skin rather than stuck on. Wheels are the procedural car's dark sleeves
(8 triangles an axle), since the crowd has no wheel instances of its own.

Frame: the car's own, x across, y up, z forward, road at y = 0; 0.9 across
and 2.3 long like `CAR` in forms.ts, so the poses there still fit.
"""

import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fleet"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
from kit import B  # noqa: E402

HALF = 1.15
AXLE = 0.72
TYRE_R = 0.19

# Rear to front: (z, sill, waist, roof edge), each an (x, y) on the right.
SECTIONS = [
    (-HALF, (0.41, 0.2), (0.43, 0.55), (0.33, 0.83)),
    (-0.93, (0.45, 0.16), (0.46, 0.6), (0.36, 0.93)),
    (0.12, (0.45, 0.16), (0.46, 0.6), (0.36, 0.93)),
    (0.55, (0.45, 0.16), (0.46, 0.58), (0.4, 0.64)),
    (HALF, (0.41, 0.19), (0.42, 0.44), (0.34, 0.52)),
]


def body(name, M, paint, glass, top_glass=True):
    """The loft. `paint` and `glass` are material keys in `M`."""

    def side(segment, strip):
        if strip == 0:
            return paint
        if strip == 1:
            # The side windows along the cabin; painted shoulders elsewhere.
            return glass if segment == 1 else paint
        # The top: tailgate glass, roof, windscreen, bonnet.
        return {0: glass, 1: paint, 2: glass, 3: paint}[segment] if top_glass else paint

    def cap(end, band):
        # Tail: bumper and panel below the waist, the rear window above.
        if end == 0:
            return paint if band == 0 else glass
        return paint

    sections = [(z, [s, w, r]) for z, s, w, r in SECTIONS]
    return carkit.build_loft(name, sections, side, cap, M, centre_y=0.45)


def sleeve(name, size, pos, mat):
    """A box with no top or bottom, 8 triangles: an axle's two tyres."""
    obj = kit.box(name, size, pos, mat, bev=0.0)
    return carkit.drop_faces(obj, lambda n: abs(n.z) > 0.9)


def wheels(M, tyre="tyre", missing=(), flat=()):
    """Tyres, as one sleeve an axle, or one a wheel when some are missing
    or flat: `missing` and `flat` hold (side, axle) pairs, side -1 / 1 and
    axle 1 front / -1 rear."""
    if not missing and not flat:
        return [sleeve(f"axle{a}", (0.98, TYRE_R * 2, TYRE_R * 2), (0, TYRE_R, a * AXLE), M[tyre]) for a in (1, -1)]
    out = []
    for a in (1, -1):
        for s in (-1, 1):
            if (s, a) in missing:
                continue
            squash = 0.6 if (s, a) in flat else 1.0
            h = TYRE_R * 2 * squash
            out.append(sleeve(f"tyre{s}{a}", (0.16, h, TYRE_R * 2 * (1.1 if squash < 1 else 1)),
                              (s * 0.41, h / 2, a * AXLE), M[tyre]))
    return out


def app_matrix(x=0.0, z=0.0, yaw=0.0, roll=0.0, pitch=0.0, y=0.0):
    """forms.ts's `poseMatrix` (T, then Ry, Rz, Rx in the app frame) as a
    Blender-frame matrix."""
    C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
    R = (Matrix.Rotation(yaw, 4, "Y") @ Matrix.Rotation(roll, 4, "Z") @ Matrix.Rotation(pitch, 4, "X"))
    M = Matrix.Translation(Vector((x, y, z))) @ R
    return C @ M @ C.inverted()


def pose(objs, **kw):
    M = app_matrix(**kw)
    for obj in objs:
        obj.data.transform(M)
    return objs


def lowest(objs):
    """The lowest app-frame y over the objects' vertices."""
    return min(v.co.z for o in objs for v in o.data.vertices)


def tetra(name, pos, size, mat):
    """A small tetrahedron, 4 triangles: a hazard lamp."""
    bm = bmesh.new()
    s = size
    pts = [(s, s, s), (s, -s, -s), (-s, s, -s), (-s, -s, s)]
    vs = [bm.verts.new(B((pos[0] + p[0], pos[1] + p[1], pos[2] + p[2]))) for p in pts]
    for f in ((0, 1, 2), (0, 3, 1), (0, 2, 3), (1, 3, 2)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._object(name, bm, mat)


def lamp_quad(name, pos, w, h, mat, facing=1):
    """A small flat lamp lens, 1 triangle, in the car's frame, facing along
    +z (`facing` 1) or -z: a corner indicator."""
    bm = bmesh.new()
    x, y, z = pos
    pts = [(x - w / 2, y - h / 2, z), (x + w / 2, y - h / 2, z), (x, y + h / 2, z)]
    face = bm.faces.new([bm.verts.new(B(p)) for p in pts])
    face.normal_update()
    # App +z is Blender -y.
    if (face.normal.y < 0) != (facing > 0):
        face.normal_flip()
    return kit._object(name, bm, mat)


def top_quad(name, z0, z1, y0, y1, half0, half1, mat, lift=0.008, x=0.0):
    """A quad lying on the car's top between two sections: a crazed
    windscreen, a rust patch through the bonnet."""
    n = Vector((0, z1 - z0, -(y1 - y0))).normalized() if abs(y1 - y0) > 1e-6 else Vector((0, 1, 0))
    if n.y < 0:
        n = -n
    ly, lz = n.y * lift, n.z * lift  # app (y, z) offset off the surface
    corners = [
        (x - half0, y0 + ly, z0 + lz),
        (x + half0, y0 + ly, z0 + lz),
        (x + half1, y1 + ly, z1 + lz),
        (x - half1, y1 + ly, z1 + lz),
    ]
    return carkit.quad(name, corners, mat, (0, n.y, n.z))


def roof_y():
    return SECTIONS[1][3][1]
