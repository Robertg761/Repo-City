"""
The near-level kit for the landmarks (`blender/landmarks/*_near.py`).

A landmark is drawn once, so its near level is the lean model plus a great
deal more: `Acc` gathers the extra geometry straight into one mesh per
material (no object per box, so tens of thousands of pieces stay cheap), in
the app's frame like `kit.py`, through a stack of local frames so a window,
a column or a sign is written once, upright, and placed with `at()`.

  acc = Acc()
  with acc.at((x, y, z), yaw=facing("+x")):    # local +z now points to +x
      window_surround(acc, ...)

The finished pieces join the lean model in `kit.finish`, which is why the
near level keeps the lean model's frame, pivot and colour slots: it IS the
lean model, drawn over with mouldings, glazing bars, slates, railings...

`openings()` and `slopes()` read the lean mesh back (its glass boxes, its
roof faces) so every window and every roof of a landmark gets the treatment
without listing them.
"""

import math
import os
import sys
from contextlib import contextmanager

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import kit  # noqa: E402

TAU = math.tau

YAW = {"+z": 0.0, "+x": math.pi / 2, "-z": math.pi, "-x": -math.pi / 2}


def facing(name):
    """The yaw that turns local +z (the outward side) to `name`."""
    return YAW[name]


def to_app(p):
    """Blender -> app frame."""
    return (p[0], p[2], -p[1])


def load_lean(path):
    """Import a lean landmark script as a module (its parts functions)."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(os.path.basename(path)[:-3] + "_lean", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Corner index = ix + 2 iy + 4 iz, each 0 (-) or 1 (+).
_BOX_FACES = {
    "nx": (0, 4, 6, 2),
    "px": (1, 3, 7, 5),
    "ny": (0, 1, 5, 4),
    "py": (2, 6, 7, 3),
    "nz": (0, 2, 3, 1),
    "pz": (4, 5, 7, 6),
}


class Acc:
    def __init__(self):
        self._bm = {}
        self._mats = {}
        self._m = Matrix.Identity(4)
        self._stack = []
        self.count = 0

    # ------------------------------------------------------------ frames

    @contextmanager
    def at(self, pos=(0.0, 0.0, 0.0), yaw=0.0, rot=None):
        """A local frame at app point `pos`, turned `yaw` about app y (local
        +z goes to (sin yaw, 0, cos yaw)), then by `rot` (an app-frame XYZ
        Euler, as `kit.box`'s)."""
        m = Matrix.Translation(Vector(pos)) @ Matrix.Rotation(yaw, 4, "Y")
        if rot:
            rx, ry, rz = rot
            m = m @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X")
        self._stack.append(self._m)
        self._m = self._m @ m
        try:
            yield self
        finally:
            self._m = self._stack.pop()

    @contextmanager
    def basis(self, origin, x, y, z):
        """A local frame from app-frame axes (right-handed, unit)."""
        m = Matrix((Vector((*x, 0.0)), Vector((*y, 0.0)), Vector((*z, 0.0)), Vector((0.0, 0.0, 0.0, 1.0)))).transposed()
        m.translation = Vector(origin)
        self._stack.append(self._m)
        self._m = self._m @ m
        try:
            yield self
        finally:
            self._m = self._stack.pop()

    # ------------------------------------------------------------ core

    def _target(self, mat):
        key = mat.name
        if key not in self._bm:
            self._bm[key] = bmesh.new()
            self._mats[key] = mat
        return self._bm[key]

    def add(self, mat, verts, faces, orient="volume"):
        """Add a polyhedron given in the local frame. `orient` fixes the
        winding: "convex" points every face away from the centroid, "volume"
        flips the whole piece if it came out inside out, "none" trusts it."""
        pts = [self._m @ Vector(v) for v in verts]
        faces = [list(f) for f in faces]
        if orient == "convex":
            c = sum(pts, Vector()) / len(pts)
            for f in faces:
                fc = sum((pts[i] for i in f), Vector()) / len(f)
                n = Vector()
                for k in range(1, len(f) - 1):
                    n += (pts[f[k]] - pts[f[0]]).cross(pts[f[k + 1]] - pts[f[0]])
                if n.dot(fc - c) < 0:
                    f.reverse()
        elif orient == "volume":
            vol = 0.0
            for f in faces:
                for k in range(1, len(f) - 1):
                    vol += pts[f[0]].dot(pts[f[k]].cross(pts[f[k + 1]]))
            if vol < 0:
                for f in faces:
                    f.reverse()
        bm = self._target(mat)
        vs = [bm.verts.new(kit.B(p)) for p in pts]
        for f in faces:
            try:
                bm.faces.new([vs[i] for i in f])
                self.count += len(f) - 2
            except ValueError:
                pass

    # ------------------------------------------------------------ primitives

    def box(self, mat, size, pos=(0, 0, 0), rot=None, skip=(), taper=None):
        """A box centred on `pos`. `skip` drops faces nobody sees ("nx" ...
        "pz"); `taper` = (top scale x, top scale z) narrows the top."""
        sx, sy, sz = size
        verts = []
        for i in range(8):
            ix, iy, iz = i & 1, (i >> 1) & 1, (i >> 2) & 1
            tx, tz = taper if (taper and iy) else (1.0, 1.0)
            verts.append(((ix - 0.5) * sx * tx, (iy - 0.5) * sy, (iz - 0.5) * sz * tz))
        faces = [f for name, f in _BOX_FACES.items() if name not in skip]
        with self.at(pos, 0.0, rot):
            self.add(mat, verts, faces, "convex")

    def bar(self, mat, a, b, w, d=None, skip=()):
        """A square bar from local point `a` to `b`, `w` by `d` across."""
        a, b = Vector(a), Vector(b)
        v = b - a
        length = v.length
        if length < 1e-6:
            return
        y = v / length
        ref = Vector((0, 0, 1)) if abs(y.z) < 0.9 else Vector((1, 0, 0))
        x = y.cross(ref).normalized()
        z = x.cross(y)
        with self.basis((a + b) / 2, x, y, z):
            self.box(mat, (w, length, d if d else w), skip=skip)

    def prism(self, mat, outline, depth, pos=(0, 0, 0), rot=None, yaw=0.0, skip_back=False):
        """A local (u, v) outline extruded `depth` along local z, centred on
        z = 0, at `pos`. Any simple polygon."""
        pts = list(outline)
        n = len(pts)
        area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
        if area < 0:
            pts.reverse()
        h = depth / 2
        verts = [(u, v, h) for u, v in pts] + [(u, v, -h) for u, v in pts]
        faces = [list(range(n))]
        if not skip_back:
            faces.append(list(range(2 * n - 1, n - 1, -1)))
        for i in range(n):
            j = (i + 1) % n
            faces.append([i, n + i, n + j, j])
        with self.at(pos, yaw, rot):
            self.add(mat, verts, faces, "volume")

    def cyl(self, mat, r, h, pos=(0, 0, 0), axis="y", sides=8, r2=None, caps=True, phase=0.0, rot=None):
        """A cylinder or frustum (`r2` at the far end) along local `axis`."""
        r2 = r if r2 is None else r2
        verts, faces = [], []
        for rr, t in ((r, -h / 2), (r2, h / 2)):
            for i in range(sides):
                a = phase + TAU * i / sides
                verts.append((math.cos(a) * rr, t, math.sin(a) * rr))
        for i in range(sides):
            j = (i + 1) % sides
            faces.append([i, j, sides + j, sides + i])
        if caps:
            faces.append(list(range(sides)))
            faces.append(list(range(2 * sides - 1, sides - 1, -1)))
        turn = {"y": None, "x": (0, 0, -math.pi / 2), "z": (math.pi / 2, 0, 0)}[axis]
        with self.at(pos, 0.0, rot or turn):
            self.add(mat, verts, faces, "convex")

    def rod(self, mat, a, b, r, sides=4, caps=True):
        a, b = Vector(a), Vector(b)
        v = b - a
        length = v.length
        if length < 1e-6:
            return
        y = v / length
        ref = Vector((0, 0, 1)) if abs(y.z) < 0.9 else Vector((1, 0, 0))
        x = y.cross(ref).normalized()
        z = x.cross(y)
        with self.basis((a + b) / 2, x, y, z):
            self.cyl(mat, r, length, sides=sides, caps=caps, phase=math.pi / sides)

    def sphere(self, mat, r, pos, sides=8, rings=5, squash=1.0):
        verts = [(0, r * squash, 0)]
        for k in range(1, rings):
            t = math.pi * k / rings
            for i in range(sides):
                a = TAU * i / sides
                verts.append((math.sin(t) * math.cos(a) * r, math.cos(t) * r * squash, math.sin(t) * math.sin(a) * r))
        verts.append((0, -r * squash, 0))
        faces = []
        for i in range(sides):
            faces.append([0, 1 + (i + 1) % sides, 1 + i])
        for k in range(rings - 2):
            for i in range(sides):
                j = (i + 1) % sides
                a0, a1 = 1 + k * sides + i, 1 + k * sides + j
                faces.append([a0, a1, a1 + sides, a0 + sides])
        last = len(verts) - 1
        for i in range(sides):
            faces.append([last, 1 + (rings - 2) * sides + i, 1 + (rings - 2) * sides + (i + 1) % sides])
        with self.at(pos):
            self.add(mat, verts, faces, "convex")

    def lathe(self, mat, profile, sides=12, pos=(0, 0, 0), closed=True, phase=0.0):
        """A solid of revolution about local y from `(r, y)` rows. `closed`
        joins the last row to the first (a solid ring); a profile that starts
        and ends on the axis (r == 0) needs `closed=False`."""
        rows = list(profile)
        verts, index = [], []
        for r, y in rows:
            if r < 1e-6:
                index.append([len(verts)] * sides)
                verts.append((0.0, y, 0.0))
            else:
                ring = []
                for i in range(sides):
                    a = phase + TAU * i / sides
                    ring.append(len(verts))
                    verts.append((math.cos(a) * r, y, math.sin(a) * r))
                index.append(ring)
        faces = []
        pairs = list(zip(range(len(rows)), range(1, len(rows))))
        if closed:
            pairs.append((len(rows) - 1, 0))
        for p, q in pairs:
            for i in range(sides):
                j = (i + 1) % sides
                dedup = []
                for v in (index[p][i], index[q][i], index[q][j], index[p][j]):
                    if v not in dedup:
                        dedup.append(v)
                if len(dedup) >= 3:
                    faces.append(dedup)
        with self.at(pos):
            self.add(mat, verts, faces, "volume")

    def sweep(self, mat, path, profile, plane="xz", at=0.0):
        """A moulding: the closed `profile` [(d, h), ...] (d outward from the
        path in its plane, h along the plane's normal axis) swept round the
        closed `path` [(a, b), ...] (mitred at the corners). `plane` names
        the path's local axes: "xz" (h is y: a cornice round a building),
        "xy" (h is z: a frame round an opening), "zy" (h is x). `at` is the
        position on the normal axis."""
        n = len(path)
        area = sum(path[i][0] * path[(i + 1) % n][1] - path[(i + 1) % n][0] * path[i][1] for i in range(n))
        pts = list(path) if area >= 0 else list(reversed(path))
        rings = []
        for k in range(n):
            p, prev, nxt = pts[k], pts[k - 1], pts[(k + 1) % n]
            norms = []
            for e in ((p[0] - prev[0], p[1] - prev[1]), (nxt[0] - p[0], nxt[1] - p[1])):
                length = math.hypot(*e) or 1.0
                norms.append((e[1] / length, -e[0] / length))
            nx = norms[0][0] + norms[1][0]
            ny = norms[0][1] + norms[1][1]
            length = math.hypot(nx, ny) or 1.0
            nx, ny = nx / length, ny / length
            miter = 1.0 / max(0.4, nx * norms[0][0] + ny * norms[0][1])
            rings.append([_plane_point(plane, p[0] + nx * d * miter, p[1] + ny * d * miter, at + h) for d, h in profile])
        m = len(profile)
        verts = [v for ring in rings for v in ring]
        faces = []
        for k in range(n):
            k1 = (k + 1) % n
            for j in range(m):
                j1 = (j + 1) % m
                faces.append([k * m + j, k1 * m + j, k1 * m + j1, k * m + j1])
        self.add(mat, verts, faces, "volume")

    def rect_frame(self, mat, x0, x1, y0, y1, profile, z=0.0):
        """A moulded frame round the rectangle x0..x1 by y0..y1 in the local
        xy plane at local depth `z`, its profile `(d, dz)` rising from the
        rectangle's edge outward."""
        self.sweep(mat, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], profile, plane="xy", at=z)

    def rect_run(self, mat, x0, x1, z0, z1, profile, y=0.0):
        """A moulding round the plan rectangle (a cornice, a string course, a
        plinth): `profile` `(d, dy)` outward from the wall line."""
        self.sweep(mat, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], profile, plane="xz", at=y)

    # ------------------------------------------------------------ output

    def objects(self, name="near"):
        made = []
        for key, bm in self._bm.items():
            if not bm.faces:
                bm.free()
                continue
            mesh = bpy.data.meshes.new(f"{name}.{key}")
            bm.to_mesh(mesh)
            bm.free()
            obj = bpy.data.objects.new(f"{name}.{key}", mesh)
            bpy.context.scene.collection.objects.link(obj)
            mesh.materials.append(self._mats[key])
            made.append(obj)
        self._bm.clear()
        return made


def _plane_point(plane, a, b, c):
    if plane == "xz":
        return (a, c, b)
    if plane == "xy":
        return (a, b, c)
    if plane == "zy":
        return (c, b, a)
    raise ValueError(plane)


# ---------------------------------------------------------------- reading the lean mesh


def _bvh(obj, skip_slots=()):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    skip = {i for i, m in enumerate(obj.data.materials) if m and m.name.split(".")[0] in skip_slots}
    drop = [f for f in bm.faces if f.material_index in skip]
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="FACES")
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def openings(obj, slot="glass", thin=0.16, min_size=0.25):
    """The lean mesh's glass boxes as windows: each `{centre, w, h, thick,
    face, room}` in the app frame, `face` the outward axis ("+z", "-x", ...)
    found by which way is open air. Boxes that are not thin in x or z (a roof
    light, the train's screens) are not windows and are skipped."""
    mesh = obj.data
    glass = {i for i, m in enumerate(mesh.materials) if m and m.name.split(".")[0] == slot}
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    faces = [f for f in bm.faces if f.material_index in glass]
    by_vert = {}
    for f in faces:
        for v in f.verts:
            by_vert.setdefault(v.index, []).append(f)
    seen, groups = set(), []
    for f in faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for v in cur.verts:
                for g in by_vert[v.index]:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        groups.append(comp)
    tree = _bvh(obj, skip_slots=(slot,))
    found = []
    for comp in groups:
        pts = [to_app(obj.matrix_world @ v.co) for f in comp for v in f.verts]
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        size = [hi[i] - lo[i] for i in range(3)]
        centre = [(lo[i] + hi[i]) / 2 for i in range(3)]
        if size[0] <= thin and size[2] > size[0]:
            axis, w = 0, size[2]
        elif size[2] <= thin:
            axis, w = 2, size[0]
        else:
            continue
        h = size[1]
        if w < min_size or h < min_size:
            continue
        thick = size[axis]
        best, room = 1, -1.0
        for sign in (1, -1):
            d = [0.0, 0.0, 0.0]
            d[axis] = sign
            origin = Vector(kit.B([centre[i] + d[i] * (thick / 2 + 0.01) for i in range(3)]))
            hit = tree.ray_cast(origin, Vector(kit.B(d)), 30.0)
            reach = hit[3] if hit[0] is not None else 30.0
            if reach > room:
                best, room = sign, reach
        face = ("+" if best > 0 else "-") + ("x" if axis == 0 else "z")
        # The wall face: rays from well outside, back in at the window's sides.
        lat = [0.0, 0.0, 0.0]
        lat[2 if axis == 0 else 0] = 1.0
        seen_walls = []
        for du, dv in ((w / 2 + 0.3, 0.0), (-(w / 2 + 0.3), 0.0), (0.0, h / 2 + 0.3), (0.0, -(h / 2 + 0.3))):
            p = [centre[i] + lat[i] * du for i in range(3)]
            p[1] += dv
            p[axis] += best * 1.5
            back = [0.0, 0.0, 0.0]
            back[axis] = -best
            hit = tree.ray_cast(Vector(kit.B(p)), Vector(kit.B(back)), 3.0)
            if hit[0] is not None:
                seen_walls.append(1.5 - hit[3])
        seen_walls.sort()
        wall = seen_walls[len(seen_walls) // 2] if seen_walls else thick / 2
        found.append({"centre": tuple(centre), "w": w, "h": h, "thick": thick, "face": face, "room": room, "wall": wall})
    bm.free()
    return found


def slopes(obj, slots=("roof",), min_area=0.4, lo=0.25, hi=0.92):
    """The lean mesh's roof faces: sloped planar polygons of the given
    material roles. Each is `{origin, along, up, out, points, area}` in the
    app frame: `along` the eave direction, `up` up the slope, `out` the face
    normal, `points` the corners as (along, up) coordinates from `origin`."""
    mesh = obj.data
    picks = {i for i, m in enumerate(mesh.materials) if m and m.name.split(".")[0] in slots}
    found = []
    for poly in mesh.polygons:
        if poly.material_index not in picks or poly.area < min_area:
            continue
        n = Vector(to_app(obj.matrix_world.to_3x3() @ poly.normal)).normalized()
        if not (lo < n.y < hi):
            continue
        up = (Vector((0, 1, 0)) - n * n.y).normalized()
        along = up.cross(n).normalized()
        verts = [Vector(to_app(obj.matrix_world @ mesh.vertices[i].co)) for i in poly.vertices]
        origin = verts[0]
        pts = [((v - origin).dot(along), (v - origin).dot(up)) for v in verts]
        found.append({"origin": origin, "along": along, "up": up, "out": n, "points": pts, "area": poly.area})
    return found


def courses(acc, obj, mat, roles, pitch=0.15, thick=0.05, lift=0.004, sample=0.16, min_area=3.0, block=None, gap=0.012, y_min=0.0, y_max=1e9, keep=None):
    """Coursed masonry over the lean mesh's big outward walls of the given
    material roles: horizontal strips `thick` tall every `pitch`, standing
    `lift` proud (or, with `block`, staggered blocks of that length with head
    joints). A strip only lays where a ray from outside meets the wall
    itself, so windows, pilasters and reveals interrupt the courses."""
    mesh = obj.data
    picks = {i for i, m in enumerate(mesh.materials) if m and m.name.split(".")[0] in roles}
    tree = _bvh(obj)
    up = Vector((0, 1, 0))
    for poly in mesh.polygons:
        if poly.material_index not in picks or poly.area < min_area:
            continue
        n = Vector(to_app(obj.matrix_world.to_3x3() @ poly.normal)).normalized()
        if abs(n.y) > 0.05 or max(abs(n.x), abs(n.z)) < 0.99:
            continue
        n = Vector((round(n.x), 0.0, round(n.z)))
        verts = [Vector(to_app(obj.matrix_world @ mesh.vertices[i].co)) for i in poly.vertices]
        along = up.cross(n).normalized()
        p0 = verts[0]
        us = [(v - p0).dot(along) for v in verts]
        ys = [v.y for v in verts]
        u0, u1, y0, y1 = min(us), max(us), max(min(ys), y_min), min(max(ys), y_max)

        def wall_at(u, y):
            point = p0 + along * u
            point.y = y
            if keep and not keep(point, n):
                return False
            origin = Vector(kit.B(point + n * 0.3))
            hit = tree.ray_cast(origin, Vector(kit.B(-n)), 0.6)
            return hit[0] is not None and abs(hit[3] - 0.3) < 0.006

        # Rows and blocks sit on a grid fixed in the world, so the courses of
        # neighbouring cells of one wall (and of two walls) line up.
        ug0 = p0.dot(along)
        j = math.ceil((y0 - 1e-6) / pitch - 0.5)
        while True:
            y = (j + 0.5) * pitch
            j += 1
            if y + thick / 2 > y1 + 1e-6:
                break
            if y - thick / 2 < y0 - 1e-6:
                continue
            row = j
            if block:
                shift = (block * 0.5) if row % 2 else 0.0
                k = math.floor((u0 + ug0 - shift) / block) - 1
                while True:
                    aw = k * block + shift
                    k += 1
                    a, b = aw - ug0, aw - ug0 + block
                    if b < u0 + 0.05:
                        continue
                    if a > u1 - 0.05:
                        break
                    a, b = max(a, u0), min(b, u1)
                    if b - a < 0.1:
                        continue
                    a, b = a + gap / 2, b - gap / 2
                    if all(wall_at(u, y) for u in (a + 0.02, (a + b) / 2, b - 0.02)):
                        centre = p0 + along * ((a + b) / 2)
                        centre.y = y
                        with acc.basis(centre, along, up, n):
                            acc.box(mat, (b - a - 0.008, thick, lift * 2), skip=("nz",))
            else:
                run = None
                u = u0 + sample * 0.5
                while u <= u1 + sample * 0.5:
                    ok = u < u1 and wall_at(u, y)
                    if ok and run is None:
                        run = u - sample * 0.5
                    if not ok and run is not None:
                        a, b = max(run, u0 + 0.01), min(u - sample * 0.5, u1 - 0.01)
                        if b - a > 0.08:
                            centre = p0 + along * ((a + b) / 2)
                            centre.y = y
                            with acc.basis(centre, along, up, n):
                                acc.box(mat, (b - a - 0.008, thick, lift * 2), skip=("nz",))
                        run = None
                    u += sample
                if run is not None:
                    a, b = max(run, u0 + 0.01), u1 - 0.01
                    if b - a > 0.08:
                        centre = p0 + along * ((a + b) / 2)
                        centre.y = y
                        with acc.basis(centre, along, up, n):
                            acc.box(mat, (b - a - 0.008, thick, lift * 2), skip=("nz",))


def ribs(acc, obj, mat, roles, pitch=0.12, width=0.05, lift=0.012, sample=0.2, min_area=3.0, y_min=0.0, y_max=1e9, keep=None):
    """Corrugated cladding: vertical ribs every `pitch` over the lean mesh's
    big outward walls of the given roles, laid only where a ray from outside
    meets the wall itself (so openings and pilasters interrupt them). Each
    rib is a shallow trapezoid: cheap, and it catches the light."""
    mesh = obj.data
    picks = {i for i, m in enumerate(mesh.materials) if m and m.name.split(".")[0] in roles}
    tree = _bvh(obj)
    up = Vector((0, 1, 0))
    for poly in mesh.polygons:
        if poly.material_index not in picks or poly.area < min_area:
            continue
        n = Vector(to_app(obj.matrix_world.to_3x3() @ poly.normal)).normalized()
        if abs(n.y) > 0.05 or max(abs(n.x), abs(n.z)) < 0.99:
            continue
        n = Vector((round(n.x), 0.0, round(n.z)))
        verts = [Vector(to_app(obj.matrix_world @ mesh.vertices[i].co)) for i in poly.vertices]
        along = up.cross(n).normalized()
        p0 = verts[0]
        us = [(v - p0).dot(along) for v in verts]
        ys = [v.y for v in verts]
        u0, u1, y0, y1 = min(us), max(us), max(min(ys), y_min), min(max(ys), y_max)

        def wall_at(u, y):
            point = p0 + along * u
            point.y = y
            if keep and not keep(point, n):
                return False
            hit = tree.ray_cast(Vector(kit.B(point + n * 0.3)), Vector(kit.B(-n)), 0.6)
            return hit[0] is not None and abs(hit[3] - 0.3) < 0.006

        u = u0 + pitch * 0.5
        while u < u1 - width * 0.5:
            run = None
            y = y0 + sample * 0.5
            while y <= y1 + sample * 0.5:
                ok = y < y1 and wall_at(u, y)
                if ok and run is None:
                    run = y - sample * 0.5
                if not ok and run is not None:
                    a, b = max(run, y0 + 0.01), min(y - sample * 0.5, y1 - 0.01)
                    if b - a > 0.15:
                        centre = p0 + along * u
                        centre.y = (a + b) / 2
                        with acc.basis(centre, along, up, n):
                            acc.box(mat, (width, b - a, lift * 2), skip=("nz",))
                    run = None
                y += sample
            if run is not None:
                a, b = max(run, y0 + 0.01), y1 - 0.01
                if b - a > 0.15:
                    centre = p0 + along * u
                    centre.y = (a + b) / 2
                    with acc.basis(centre, along, up, n):
                        acc.box(mat, (width, b - a, lift * 2), skip=("nz",))
            u += pitch


def ground_free(obj, y, clearance=0.5):
    """`free(x, z)`: true where nothing stands on the surface at height `y`
    (a ray from `clearance` above it meets that surface first). For paving
    and gravel that must stay out from under walls, planters and steps."""
    tree = _bvh(obj)

    def free(x, z):
        hit = tree.ray_cast(Vector(kit.B((x, y + clearance, z))), Vector(kit.B((0, -1, 0))), clearance + 0.2)
        return hit[0] is not None and abs(hit[3] - clearance) < 0.02

    return free


def rejoin(lean, pieces, name, origin=(0, 0, 0)):
    """Join the finished lean object and the near pieces into one mesh: the
    lean object's flat AO layer is dropped first so `finish` can make the one."""
    for layer in list(lean.data.color_attributes):
        lean.data.color_attributes.remove(layer)
    return kit.finish([lean] + list(pieces), name, origin)


def drop(parts, *names):
    """Remove the lean parts whose base name (before Blender's `.001`) is in
    `names` and return the rest: the near level replaces them."""
    keep = []
    for obj in parts:
        if obj.name.split(".")[0] in names:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            keep.append(obj)
    return keep


def inside(poly, x, y):
    """Point in polygon (any winding)."""
    hit = False
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            hit = not hit
    return hit
