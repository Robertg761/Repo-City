"""
Helpers for the NEAR levels of the instanced street scenery (trees, lamps,
furniture, rooftop plant, bales). Spike tooling, on top of `blender/kit.py`
and `blender/props/lowpoly.py`.

The lean models are drawn by the thousand and every triangle in them is on
the outside. A near model is drawn for the few dozen instances the camera is
close to, so it spends its triangles on what a close camera notices: a crown
of individual leaf clusters instead of one hull, branches that fork, bark
that is not a smooth tube, bolts, bevels and panel lines.

Coordinates are the app's frame, as in kit.py.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B  # noqa: E402


def _bm_obj(name, bm, mat):
    return lp._obj(name, bm, mat)


def lump(name, centre, radius, mat, squash=(1, 1, 1), yaw=0.0, wobble=0.16, seed=0.0, sub=2):
    """A faceted ball (an icosphere, `sub` 2 is 80 triangles) with every
    vertex pushed in or out by noise, squashed on the app axes and turned
    about the vertical: one clump of leaves or one flower head."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=radius)
    for v in bm.verts:
        n = noise.noise(v.co * (2.4 / max(radius, 0.05)) * 0.5 + Vector((seed, seed * 0.7, seed * 1.3)))
        v.co *= 1 + n * wobble
    sx, sy, sz = squash
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(yaw, 3, "Z"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=B(centre), verts=bm.verts)
    return _bm_obj(name, bm, mat)


def loft(name, path, radii, mat, sides=6, ridge=0.0, seed=0.0, cap0=False, cap1=False, turn=0.0, flute=0.0, twist=0.35):
    """A tube along an app-frame polyline: `radii[i]` at `path[i]`, `sides`
    round. `ridge` roughens the section (bark ridges), so a trunk is not a
    smooth pipe. Each ring is turned a little from the last one so ridges
    spiral; the ends stay open unless capped."""
    pts = [Vector(p) for p in path]
    bm = bmesh.new()
    rings = []
    ref = Vector((0, 0, 1))
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = t.cross(ref)
        if u.length < 0.2:
            u = t.cross(Vector((1, 0, 0)))
        u.normalize()
        w = t.cross(u).normalized()
        ring = []
        for k in range(sides):
            a = turn + i * twist + 2 * math.pi * k / sides
            r = radii[i]
            if flute:
                r *= 1 - flute * (k % 2)
            if ridge:
                r *= 1 + ridge * noise.noise(Vector((k * 1.7 + seed, i * 0.9, seed * 0.5)))
            q = p + u * (math.cos(a) * r) + w * (math.sin(a) * r)
            ring.append(bm.verts.new(B(q)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], a[j], b[j], b[k]))
    if cap0:
        bm.faces.new(list(reversed(rings[0])))
    if cap1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _bm_obj(name, bm, mat)


def bipyramid(name, base, tip, width, thick, mat, up=(0, 1, 0), at=0.4, sides=4):
    """An elongated faceted bud from `base` to `tip`: widest `at` of the way
    along, `width` across and `thick` deep. Eight triangles with 4 `sides`:
    a frond, a needle spray, a petal, a leaf."""
    a, b = Vector(base), Vector(tip)
    d = b - a
    ln = d.length
    t = d / max(ln, 1e-6)
    u = t.cross(Vector(up))
    if u.length < 0.1:
        u = t.cross(Vector((1, 0, 0)))
    u.normalize()
    w = t.cross(u).normalized()
    mid = a + d * at
    bm = bmesh.new()
    va, vb = bm.verts.new(B(a)), bm.verts.new(B(b))
    ring = []
    for k in range(sides):
        ang = 2 * math.pi * k / sides
        q = mid + u * (math.cos(ang) * width / 2) + w * (math.sin(ang) * thick / 2)
        ring.append(bm.verts.new(B(q)))
    for k in range(sides):
        j = (k + 1) % sides
        bm.faces.new((va, ring[j], ring[k]))
        bm.faces.new((vb, ring[k], ring[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _bm_obj(name, bm, mat)


def shell_points(ellipsoids, n, seed, inset=0.0, others=True, up_bias=0.0):
    """About `n` points on the outside of a union of app-frame ellipsoids
    `(centre, radius, (sx, sy, sz))`, with outward normals: a fibonacci
    spray on each, keeping only points not buried in another one. `inset` pulls
    the point in along its normal, so a clump that is centred there still
    ends at the surface."""
    rnd = random.Random(seed)
    total = sum(r * r * sq[0] * sq[2] for _, r, sq in ellipsoids)
    out = []
    for c, r, sq in ellipsoids:
        share = max(1, round(n * r * r * sq[0] * sq[2] / total))
        # A denser spray than wanted, thinned by the burial test and to `share`.
        cand = []
        m = share * 10
        for i in range(m):
            y = 1 - 2 * (i + 0.5) / m
            rad = math.sqrt(max(0.0, 1 - y * y))
            a = i * math.pi * (3 - math.sqrt(5)) + rnd.random() * 0.4
            d = Vector((math.cos(a) * rad, y, math.sin(a) * rad))
            p = Vector((c[0] + d.x * r * sq[0], c[1] + d.y * r * sq[1], c[2] + d.z * r * sq[2]))
            if others:
                buried = False
                for c2, r2, sq2 in ellipsoids:
                    if c2 is c:
                        continue
                    q = ((p.x - c2[0]) / (r2 * sq2[0])) ** 2 + ((p.y - c2[1]) / (r2 * sq2[1])) ** 2 + ((p.z - c2[2]) / (r2 * sq2[2])) ** 2
                    if q < 0.92:
                        buried = True
                        break
                if buried:
                    continue
            # Outward normal of the ellipsoid there.
            nrm = Vector((d.x / sq[0], d.y / sq[1], d.z / sq[2])).normalized()
            cand.append((p, nrm, y))
        rnd.shuffle(cand)
        if up_bias:
            cand.sort(key=lambda t: -t[2] * up_bias + rnd.random())
        for p, nrm, _ in cand[:share]:
            out.append((p - nrm * inset, nrm))
    return out


def clumps(name, ellipsoids, n, rmin, rmax, mat, seed, squash=(1.0, 0.78, 1.0), overshoot=0.32, wobble=0.18, bias=0.0, sub=2, alt=None):
    """Leaf clumps over the outside of a crown. Each clump's outer edge lies
    `overshoot` of its radius past the crown's surface, so the silhouette
    stays the lean model's. `alt` is a second material for every third clump."""
    rnd = random.Random(seed)
    pts = shell_points(ellipsoids, n, seed, up_bias=bias)
    objs = []
    for i, (p, nrm) in enumerate(pts):
        r = rnd.uniform(rmin, rmax)
        c = p - nrm * r * (1 - overshoot)
        sq = (squash[0] * rnd.uniform(0.9, 1.15), squash[1] * rnd.uniform(0.85, 1.1), squash[2] * rnd.uniform(0.9, 1.15))
        objs.append(lump(f"{name}.{i}", (c.x, c.y, c.z), r, alt if alt and i % 3 == 2 else mat, sq, rnd.uniform(0, 6.28), wobble, seed + i * 1.7, sub))
    return objs


def hex_bolt(name, pos, axis, radius, height, mat):
    """A hexagonal bolt head standing `height` proud along `axis` ('x', 'y' or
    'z', sign in the position's own direction of travel)."""
    a = Vector(pos)
    d = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1)),
         "-x": Vector((-1, 0, 0)), "-y": Vector((0, -1, 0)), "-z": Vector((0, 0, -1))}[axis]
    return lp.tube(name, tuple(a), tuple(a + d * height), radius, radius * 0.92, mat, sides=6, cap1=True)


def tris(obj):
    return lp.tris(obj)
