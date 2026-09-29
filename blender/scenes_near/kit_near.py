"""
Shared tooling for the construction and incident scenes' NEAR models (spike
tooling, on top of `blender/kit.py`).

The lean site and incident models (`blender/incidents*/`) are drawn for every
site and incident in the city; a near model is drawn instead for the few the
camera is close to (`SceneLod` in `components/city/SceneLod.tsx`). Same frame,
pivot, footprint and node names as the lean one, so the swap only adds detail.

`refine()` re-runs a lean script's own builders with finer bevels and rounder
cylinders: every box gets a soft edge that catches light, every drum and pole
more sides. It has to be called BEFORE the lean modules are imported, because
they bind `box`, `cyl` and `bake_ao` from `kit` by name at import.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.path.dirname(HERE)
for path in (
    HERE,
    BLENDER,
    os.path.join(BLENDER, "incidents"),
    os.path.join(BLENDER, "incidents2"),
    os.path.join(BLENDER, "props"),
    os.path.join(BLENDER, "vehicles2"),
):
    if path not in sys.path:
        sys.path.insert(0, path)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import kit  # noqa: E402
from kit import B  # noqa: E402

_refined = False


def refine(segments=3, min_bevel=0.008, sides=1.75, max_sides=24, samples=16):
    """Patch `kit` so the lean builders come out finer. Idempotent."""
    global _refined
    if _refined:
        return
    _refined = True
    bevel = kit.bevel
    cyl = kit.cyl
    bake = kit.bake_ao

    def fine_bevel(obj, width, seg=1, angle=40, harden=False):
        # A chamfer on anything under 6 cm is sub-pixel even close up.
        if width <= 0 and min(obj.dimensions) >= 0.06:
            width = min_bevel
        if width <= 0:
            return obj
        # Round only what is big enough for the curve to show: 188 triangles
        # a box at three segments, 92 at two, 44 at one.
        wanted = segments if width >= 0.03 else 2 if width >= 0.015 else 1
        return bevel(obj, width, max(seg if seg < 3 else 3, wanted) if seg <= wanted else wanted, angle, harden)

    def fine_cyl(name, radius, depth, pos, mat, axis="x", verts=12, bev=0.0, seg=1, radius2=None, rot=None):
        if verts >= 6:
            verts = min(max_sides, max(verts, int(round(verts * sides))))
        return cyl(name, radius, depth, pos, mat, axis=axis, verts=verts, bev=bev, seg=seg, radius2=radius2, rot=rot)

    def capped_bake(objs, distance=0.5, samples_=128, floor=0.35, **kw):
        return bake(objs, distance=distance, samples=min(samples_, samples), floor=floor)

    kit.bevel = fine_bevel
    kit.cyl = fine_cyl
    kit.bake_ao = lambda objs, distance=0.5, samples=128, floor=0.35: capped_bake(objs, distance, samples, floor)


# --- an accumulating builder ------------------------------------------------


def _basis(axis):
    """Two unit vectors perpendicular to `axis` (app frame), u x v = axis."""
    a = Vector(axis).normalized()
    helper = Vector((0, 1, 0)) if abs(a.y) < 0.9 else Vector((1, 0, 0))
    u = a.cross(helper).normalized()
    v = a.cross(u).normalized()
    # u x v = a  requires v = a x u.
    return a, u, v


class Acc:
    """Collects geometry into one bmesh per material, so a lattice of a
    thousand struts costs one object instead of a thousand. Everything is
    given in the app's frame; `objects(name)` hands back one object per
    material for `kit.finish` to join."""

    def __init__(self):
        self.bms = {}

    def _bm(self, mat):
        if mat not in self.bms:
            self.bms[mat] = bmesh.new()
        return self.bms[mat]

    def _v(self, bm, p):
        return bm.verts.new(B(p))

    def tube(self, a, b, r0, r1, mat, sides=6, cap0=False, cap1=False, turn=0.0, squash=1.0):
        """A tapered tube from app point `a` to `b`; open unless capped."""
        bm = self._bm(mat)
        a, b = Vector(a), Vector(b)
        # A rod under 4 cm across is a hair from a metre away: five sides do.
        sides = min(sides, 5 if max(r0, r1) < 0.02 else 6 if max(r0, r1) < 0.04 else sides)
        axis, u, v = _basis(b - a)
        rings = []
        for c, r in ((a, r0), (b, r1)):
            ring = []
            for i in range(sides):
                t = turn + 2 * math.pi * i / sides
                ring.append(self._v(bm, c + (u * math.cos(t) + v * math.sin(t) * squash) * r))
            rings.append(ring)
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
        if cap0:
            bm.faces.new(list(reversed(rings[0])))
        if cap1:
            bm.faces.new(rings[1])

    def polyline(self, points, r, mat, sides=6, cap_ends=True):
        """A tube through app points (a hook, a cable), each joint a bare mitre."""
        for i in range(len(points) - 1):
            self.tube(points[i], points[i + 1], r, r, mat, sides=sides,
                      cap0=cap_ends and i == 0, cap1=cap_ends and i == len(points) - 2)

    def box(self, size, pos, mat, rot=(0, 0, 0), drop=()):
        """An unbevelled box, faces named in `drop` left out."""
        bm = self._bm(mat)
        geom = bmesh.new()
        bmesh.ops.create_cube(geom, size=1.0)
        sx, sy, sz = size
        bmesh.ops.scale(geom, vec=Vector((sx, sz, sy)), verts=geom.verts)
        geom.normal_update()
        names = {"top": (0, 0, 1), "bottom": (0, 0, -1), "front": (0, -1, 0), "back": (0, 1, 0), "left": (-1, 0, 0), "right": (1, 0, 0)}
        dead = [f for f in geom.faces if any(f.normal.dot(Vector(names[d])) > 0.9 for d in drop)]
        if dead:
            bmesh.ops.delete(geom, geom=dead, context="FACES")
        kit._place(geom, pos, rot)
        self._merge(bm, geom)

    def _merge(self, bm, geom):
        mesh = bpy.data.meshes.new("acc")
        geom.to_mesh(mesh)
        geom.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)

    def rod(self, a, b, w, h, mat, ends=False):
        """A square bar (x`w` across, `h` deep) from a to b."""
        bm = self._bm(mat)
        a, b = Vector(a), Vector(b)
        d = b - a
        geom = bmesh.new()
        bmesh.ops.create_cube(geom, size=1.0)
        bmesh.ops.scale(geom, vec=Vector((w, d.length, h)), verts=geom.verts)
        geom.normal_update()
        if not ends:
            bmesh.ops.delete(geom, geom=[f for f in geom.faces if abs(f.normal.y) > 0.9], context="FACES")
        q = Vector((0, 1, 0)).rotation_difference(B(d).normalized())
        bmesh.ops.transform(geom, matrix=Matrix.Translation(B((a + b) / 2)) @ q.to_matrix().to_4x4(), verts=geom.verts)
        self._merge(bm, geom)

    def disc(self, centre, radius, height, mat, axis="y", sides=12, radius2=None, caps=(True, True)):
        """A drum or a cone frustum about an app axis, centred on `centre`."""
        a = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[axis]
        c = Vector(centre)
        self.tube(c - a * height / 2, c + a * height / 2, radius, radius if radius2 is None else radius2, mat,
                  sides=sides, cap0=caps[0], cap1=caps[1])

    def lathe(self, centre, rings, mat, axis="y", sides=12, cap_first=True, cap_last=True):
        """A body of revolution through (t, radius) rings along an app axis."""
        a = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[axis]
        c = Vector(centre)
        for (t0, r0), (t1, r1) in zip(rings, rings[1:]):
            self.tube(c + a * t0, c + a * t1, r0, r1, mat, sides=sides,
                      cap0=cap_first and t0 == rings[0][0] and r0 > 0, cap1=cap_last and t1 == rings[-1][0] and r1 > 0)

    def objects(self, name):
        out = []
        for mat, bm in self.bms.items():
            out.append(kit._object(name, bm, mat))
        self.bms = {}
        return out


def _acc_ring(self, centre, radius, r, mat, axis="y", seg=12, sides=5):
    """A torus-like ring of tube: an eye, a hoop, a clip."""
    c = Vector(centre)
    a, u, v = _basis({"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis])
    pts = [c + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * radius for i in range(seg + 1)]
    self.polyline(pts, r, mat, sides=sides, cap_ends=False)


def _acc_hex(self, centre, radius, height, mat, axis="y"):
    """A bolt head or nut: five sides, closed on the outside only (the inside
    sits against the surface it holds)."""
    self.disc(centre, radius, height, mat, axis, 5, caps=(False, True))


def _acc_slab(self, plan, y0, y1, mat, top=True, bottom=False):
    """A convex-or-not plan of app (x, z) points stood from y0 to y1: sides and top."""
    bm = self._bm(mat)
    area = sum(plan[i][0] * plan[(i + 1) % len(plan)][1] - plan[(i + 1) % len(plan)][0] * plan[i][1] for i in range(len(plan)))
    if area > 0:  # counter-clockwise in Blender's frame is negative in the app's
        plan = list(reversed(plan))
    lo = [bm.verts.new(B((x, y0, z))) for x, z in plan]
    hi = [bm.verts.new(B((x, y1, z))) for x, z in plan]
    n = len(plan)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if top:
        bm.faces.new(hi)
    if bottom:
        bm.faces.new(list(reversed(lo)))


Acc.ring = _acc_ring
Acc.hexnut = _acc_hex
Acc.slab = _acc_slab


def _acc_sweep(self, points, radius, mat, sides=8, squash=1.0, cap_ends=True, up=(0, 1, 0), radii=None):
    """A smooth tube along an app-frame polyline: one ring per point, oriented
    from the path's tangent with `up` held, so bends do not gap or twist.
    `squash` flattens it along `up` (a hose lying on the ground)."""
    bm = self._bm(mat)
    pts = [Vector(p) for p in points]
    upv = Vector(up)
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(upv)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        vert = side.cross(t).normalized()
        r = radii[i] if radii else radius
        ring = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            ring.append(bm.verts.new(B(p + side * math.cos(ang) * r + vert * math.sin(ang) * r * squash)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], b[k], b[j], a[j]))
    if cap_ends:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


Acc.sweep = _acc_sweep


def _acc_lump(self, centre, r, mat, seed=0.0, sides=6):
    """A faceted clump of leaves: five rings of a rough ellipse, closed to a
    point top and bottom."""
    import random

    rng = random.Random(seed)
    rings = [(-r, 0.0), (-r * 0.5, r * 0.85), (0.0, r), (r * 0.5, r * 0.8), (r, 0.0)]
    turn = rng.random() * 3
    bm = self._bm(mat)
    loops = []
    for dy, rr in rings:
        if rr == 0:
            loops.append(bm.verts.new(B((centre[0], centre[1] + dy, centre[2]))))
            continue
        loops.append([
            bm.verts.new(B((centre[0] + math.cos(turn + 2 * math.pi * i / sides) * rr * (0.85 + rng.random() * 0.3),
                            centre[1] + dy,
                            centre[2] + math.sin(turn + 2 * math.pi * i / sides) * rr * (0.85 + rng.random() * 0.3))))
            for i in range(sides)
        ])
    for lo, hi in zip(loops, loops[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            if isinstance(lo, list) and isinstance(hi, list):
                bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
            elif isinstance(lo, list):
                bm.faces.new((lo[i], lo[j], hi))
            else:
                bm.faces.new((lo, hi[j], hi[i]))


Acc.lump = _acc_lump
