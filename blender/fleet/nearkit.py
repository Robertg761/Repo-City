"""
Helpers for the near (detailed) vehicle models: a finer loft than
`carkit.loft`, and details that follow the body's skin.

The lean bodies are lofts of a few coarse sections. `near_loft` lofts the SAME
sections finer: the sections are interpolated along the car (a smooth roofline
and bonnet rather than straight runs), and every corner of the cross-section
is filleted, so the shoulders, roof edges and bumper lines are rounded. The
knots stay where they were, so the outline is the lean one's, refined.

Details (door shut lines, handles, mouldings, grilles, wipers) are `relief`s:
a patch of quads projected onto the finished skin along an axis with a ray
cast, lifted off it a little and skirted down to it, so they follow the
body's curvature and never float or sink. Coordinates are the app's frame
(see `blender/kit.py`).
"""

import math
import os
import sys

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
from kit import B  # noqa: E402

STEPS = 4  # facets in each rounded corner (STEPS + 1 points)
SPACING = 0.17  # along the car, between sections of a straight run
END_DEPTHS = (0.006, 0.02, 0.042)  # extra rings that round the plan at each end
END_ROUND = 0.03


def Bi(v):
    """Blender -> app frame."""
    return (v.x, v.z, -v.y)


def _pchip(xs, ys):
    """A monotone cubic through (xs, ys): no overshoot between the knots."""
    n = len(xs)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1])
            w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1])
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def at(x):
        i = max(0, min(n - 2, next((k for k in range(n - 1) if x < xs[k + 1]), n - 2)))
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        h00 = 2 * t**3 - 3 * t**2 + 1
        h10 = t**3 - 2 * t**2 + t
        h01 = -2 * t**3 + 3 * t**2
        h11 = t**3 - t**2
        return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]

    return at


def _fillet(half, radius):
    """A section's right half with each corner replaced by a rounded run of
    STEPS + 1 points. Near-straight corners collapse to one point (the loft
    drops the doubled points), so every section keeps the same count."""
    m = len(half)
    ring = list(half) + [(-x, y) for x, y in reversed(half)]
    out = [tuple(half[0])]
    for k in range(1, m):
        p = Vector(half[k])
        a, b = Vector(ring[k - 1]), Vector(ring[k + 1])
        vin, vout = a - p, b - p
        lin, lout = vin.length, vout.length
        if lin < 1e-6 or lout < 1e-6:
            out += [tuple(p)] * (STEPS + 1)
            continue
        cosang = max(-1.0, min(1.0, vin.normalized().dot(vout.normalized())))
        turn = math.pi - math.acos(cosang)
        r = radius(k) * max(0.0, min(1.0, (turn - 0.1) / 0.35))
        d = min(r, 0.45 * lin, 0.45 * lout)
        pa = p + vin.normalized() * d
        pb = p + vout.normalized() * d
        pts = [pa]
        for i in range(1, STEPS):
            t = i / STEPS
            pts.append((1 - t) ** 2 * pa + 2 * t * (1 - t) * p + t**2 * pb)
        pts.append(pb)
        out += [tuple(q) for q in pts]
    return out


def _strip_of(t, m):
    """The lean strip a refined strip `t` (right half, 0 .. mm - 1) came from."""
    if t == 0:
        return 0
    k, r = divmod(t - 1, STEPS + 1)
    # Points of corner `c` (1-based) are 1 + (c-1)(STEPS+1) .. c(STEPS+1); the
    # strips inside the run belong to the strips either side of the corner:
    # the first half to strip c - 1, the second half to strip c.
    c = k + 1
    return c - 1 if r < (STEPS + 1) // 2 else min(c, m - 1)


def refine(sections, radius=lambda k: 0.04, spacing=SPACING, end_round=END_ROUND):
    """Finer sections for `carkit.loft` from lean ones: `(new_sections, seg_of)`
    where `seg_of(new_segment)` is the lean segment it lies in."""
    zs = [z for z, _ in sections]
    m = len(sections[0][1])
    coords = [[[pts[i][a] for _, pts in sections] for a in (0, 1)] for i in range(m)]
    curves = [[_pchip(zs, c) for c in axes] for axes in coords]
    z0, z1 = zs[0], zs[-1]
    samples = set(zs)
    for a, b in zip(zs, zs[1:]):
        n = max(1, round((b - a) / spacing))
        for i in range(1, n):
            samples.add(a + (b - a) * i / n)
    for d in END_DEPTHS:
        samples.add(z0 + d)
        samples.add(z1 - d)
    ordered = []
    for z in sorted(samples):
        if not ordered or z - ordered[-1] > 0.003:
            ordered.append(z)
        elif z in zs:
            ordered[-1] = z
    new = []
    for z in ordered:
        # Round the plan at the ends: every point comes in by the arc's inset.
        d = min(z - z0, z1 - z)
        inset = end_round - math.sqrt(max(0.0, end_round**2 - (end_round - d) ** 2)) if d < end_round else 0.0
        half = [(max(0.05, curves[i][0](z) - inset if curves[i][0](z) > 0.06 else curves[i][0](z)), curves[i][1](z)) for i in range(m)]
        new.append((z, _fillet(half, radius)))

    def seg_of(s):
        zmid = (new[s][0] + new[s + 1][0]) / 2
        return max(0, min(len(zs) - 2, next((i for i in range(len(zs) - 1) if zmid < zs[i + 1]), len(zs) - 2)))

    return new, seg_of, m


def near_loft(name, shell, M, radius=lambda k: 0.04, spacing=SPACING, end_round=END_ROUND):
    """`(object, skin)`: the lean shell `(sections, side_mat, cap_mat, centre_y)`
    lofted finer, and the skin details are projected onto."""
    sections, side, caps, _ = shell
    # Below every top surface, so a bonnet is never taken for a floor.
    centre_y = 0.3
    new, seg_of, m = refine(sections, radius, spacing, end_round)
    mm = len(new[0][1])

    def strip_side(s, t):
        return side(seg_of(s), _strip_of(t, m))

    def strip_cap(end, band):
        # The lean caps have no band for the top strip.
        return caps(end, min(_strip_of(band, m), m - 2))

    name_, bm, keys = carkit.loft(name, new, strip_side, strip_cap, centre_y)
    tree = BVHTree.FromBMesh(bm)
    obj = carkit._mesh_object(name_, bm, [M[k] for k in keys])
    return obj, tree


class Skin:
    """The body's surface, for projecting details onto."""

    def __init__(self, trees=()):
        self.trees = list(trees)

    def add(self, tree):
        self.trees.append(tree)

    def cast(self, origin, direction, far=8.0):
        o, d = B(origin), B(direction).normalized()
        best = None
        for t in self.trees:
            hit = t.ray_cast(o, d, far)
            if hit[0] is not None and (best is None or hit[3] < best[3]):
                best = hit
        return Bi(best[0]) if best else None

    def flank_x(self, side, y, z):
        p = self.cast((side * 3.0, y, z), (-side, 0, 0))
        return None if p is None else p[0]

    def top_y(self, x, z, y0=3.0):
        p = self.cast((x, y0, z), (0, -1, 0))
        return None if p is None else p[1]


def _unit(v):
    return Vector(v).normalized()


def relief(skin, name, mat, dirn, grid, lift=0.006, skirt=True, sink=0.002, reach=3.0):
    """A patch of quads projected onto the skin along `dirn` (a unit axis: the
    way a ray travels TOWARDS the body, so the patch faces `-dirn`).

    `grid[i][j]` are app points lying in the plane across `dirn` (their
    coordinate along it is ignored). Each is cast onto the skin and lifted
    `lift` off it; `skirt` walls the patch's edge down to the skin so it reads
    as a raised piece, not a decal. Returns None (and says so) if the patch
    misses the body anywhere."""
    d = _unit(dirn)
    rows = len(grid)
    cols = len(grid[0])
    hits = []
    for row in grid:
        hr = []
        for p in row:
            plane = Vector(p)
            plane -= d * plane.dot(d)
            p0 = skin.cast(tuple(plane - d * reach), tuple(d))
            if p0 is None:
                print(f"RELIEF-MISS {name} at {tuple(round(c, 3) for c in p)}")
                return None
            hr.append(Vector(p0))
        hits.append(hr)
    bm = bmesh.new()
    top = [[bm.verts.new(B(h - d * lift)) for h in hr] for hr in hits]
    out = -d
    for i in range(rows - 1):
        for j in range(cols - 1):
            f = bm.faces.new([top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]])
            carkit._orient(bm, f, B(out))
    if skirt and lift > 1e-4:
        centre = sum((h for hr in hits for h in hr), Vector()) / (rows * cols)
        base = [[bm.verts.new(B(h + d * sink)) for h in hr] for hr in hits]
        edges = []
        for j in range(cols - 1):
            edges += [((0, j), (0, j + 1)), ((rows - 1, j), (rows - 1, j + 1))]
        for i in range(rows - 1):
            edges += [((i, 0), (i + 1, 0)), ((i, cols - 1), (i + 1, cols - 1))]
        for (ai, aj), (bi, bj) in edges:
            f = bm.faces.new([top[ai][aj], top[bi][bj], base[bi][bj], base[ai][aj]])
            mid = (hits[ai][aj] + hits[bi][bj]) / 2
            lateral = mid - centre
            lateral -= d * lateral.dot(d)
            carkit._orient(bm, f, B(lateral))
    return kit._object(name, bm, mat)


def _lin(a, b, n):
    return [a + (b - a) * i / n for i in range(n + 1)]


def flank_patch(side, z0, z1, y0, y1, nz=1, ny=1):
    """Grid for a flank patch, rows along y and columns along z, facing `side`."""
    return [[(0.0, y, z) for z in _lin(z0, z1, nz)] for y in _lin(y0, y1, ny)]


def flank(skin, name, mat, side, z0, z1, y0, y1, lift=0.006, nz=1, ny=1, skirt=True):
    return relief(skin, name, mat, (-side, 0, 0), flank_patch(side, z0, z1, y0, y1, nz, ny), lift, skirt)


def nose(skin, name, mat, end, x0, x1, y0, y1, lift=0.006, nx=1, ny=1, skirt=True, reach=3.0):
    """A patch on the nose (`end` +1) or the tail (-1)."""
    grid = [[(x, y, 0.0) for x in _lin(x0, x1, nx)] for y in _lin(y0, y1, ny)]
    return relief(skin, name, mat, (0, 0, -end), grid, lift, skirt, reach=reach)


def deck(skin, name, mat, x0, x1, z0, z1, lift=0.006, nx=1, nz=1, skirt=True):
    """A patch on an upward-facing surface (bonnet, roof, boot)."""
    grid = [[(x, 0.0, z) for x in _lin(x0, x1, nx)] for z in _lin(z0, z1, nz)]
    return relief(skin, name, mat, (0, -1, 0), grid, lift, skirt)


def bead_on_flank(skin, name, mat, side, path, half, lift=0.006, skirt=True):
    """A strip of half width `half` along a (z, y) polyline on a flank."""
    rows = []
    n = len(path)
    for i, (z, y) in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(n - 1, i + 1)]
        tz, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tz, ty) or 1.0
        nz_, ny_ = -ty / length, tz / length
        rows.append([(0.0, y - ny_ * half, z - nz_ * half), (0.0, y + ny_ * half, z + nz_ * half)])
    return relief(skin, name, mat, (-side, 0, 0), rows, lift, skirt)


def bead_on_deck(skin, name, mat, path, half, lift=0.006, skirt=True):
    """A strip of half width `half` along an (x, z) polyline on an upward face."""
    rows = []
    n = len(path)
    for i, (x, z) in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(n - 1, i + 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, tz) or 1.0
        nx_, nz_ = -tz / length, tx / length
        rows.append([(x - nx_ * half, 0.0, z - nz_ * half), (x + nx_ * half, 0.0, z + nz_ * half)])
    return relief(skin, name, mat, (0, -1, 0), rows, lift, skirt)


def arch_near(name, z, radius, bottom, half_width, mat, lip_mat, top=None, steps=10):
    """A wheel arch: a dark arc-topped block across the car, and a paintwork
    lip standing proud round its outline on both flanks."""
    r = radius
    ra = r * 1.22
    top = top if top is not None else r + ra
    profile = [(z - ra, bottom), (z - ra, r)]
    for i in range(steps + 1):
        a = math.pi - math.pi * i / steps
        profile.append((z + ra * math.cos(a), r + min(ra * math.sin(a), top - r)))
    profile += [(z + ra, r), (z + ra, bottom)]
    # Drop the doubled point at the crown of a clipped arc.
    clean = []
    for p in profile:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-4:
            clean.append(p)
    obj = kit.prism(name, clean, half_width * 2, mat, bev=0.0)
    carkit.drop_faces(obj, lambda n: n.z < -0.9)
    # The lip: an arc band 3 cm wide on each flank, over the arch's outline.
    lips = []
    for s in (-1, 1):
        bm = bmesh.new()
        inner, outer = [], []
        arc = [(z - ra, r)] + [(z + ra * math.cos(math.pi - math.pi * i / steps), r + ra * math.sin(math.pi - math.pi * i / steps)) for i in range(1, steps)] + [(z + ra, r)]
        centre = (z, r)
        for pz, py in arc:
            dz, dy = pz - centre[0], py - centre[1]
            L = math.hypot(dz, dy) or 1.0
            # Proud of the arch, but inside the 1.2 the widest body may be.
            x = s * min(half_width + 0.008, 0.599)
            inner.append(bm.verts.new(B((x, py, pz))))
            outer.append(bm.verts.new(B((x, py + dy / L * 0.032, pz + dz / L * 0.032))))
        for i in range(len(arc) - 1):
            f = bm.faces.new([inner[i], inner[i + 1], outer[i + 1], outer[i]])
            carkit._orient(bm, f, B((s, 0, 0)))
        lips.append(kit._object(f"{name}Lip", bm, lip_mat))
    return [obj] + lips


def triangles(obj):
    return carkit.triangles(obj)
