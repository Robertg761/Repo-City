"""
Shared pieces of the crowd's near (detailed) forms (`near.py`): turned
shapes, banded traffic cones, wheels, bolts, tufts, and the four optional
pull request parts (worker, beacon, stop board, approval flag) in detail.

The lean crowd forms are spent in triangles, one per visible plane. Up close
they need the things a person standing beside a skip or a barrier sees: the
rolled rim, the bolt heads, the reflective band on the cone, the rungs of a
ladder. Everything here is built from small, cheap primitives (a bolt is
16 triangles) and adds up: `near.py` spends up to 3,000 triangles a form.

Roles keep the lean forms' contract (`crowdkit.py`): a role's prefix says
which part the crowd shader drives, so a worker's boots are `workerBoots`
and a flag's hem `flagHem`, and each role has its own colour.
"""

import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B, box  # noqa: E402


def palette():
    """The near forms' own roles, on top of the lean ones (`forms.palette`)."""
    m = kit.material
    return {
        "coneBase": m("coneBase", "#2a2d30", "metal", 0.8),
        "coneShade": m("coneOrange", "#e8853d", "metal", 0.6, tone=0.82),
        "bolt": m("bolt", "#7c8085", "metal", 0.4, metallic=0.5),
        "rubber": m("rubber", "#1f2022", "fabric", 0.9),
        "rim": m("rim", "#aeb2b6", "metal", 0.4, metallic=0.4),
        "steelDark": m("steelDark", "#5d6266", "metal", 0.6),
        "workerStripe": m("workerStripe", "#d6dade", "fabric", 0.6),
        "workerBoots": m("workerBoots", "#2b2a28", "fabric", 0.8),
        "workerGloves": m("workerGloves", "#a98c58", "fabric", 0.9),
        "workerHair": m("workerHair", "#4a3830", "fabric", 0.9),
        "workerHelmetBand": m("workerHelmetBand", "#3a3628", "metal", 0.5),
        "beaconBase": m("beaconBase", "#33373a", "metal", 0.6),
        "boardEdge": m("boardEdge", "#f0ede4", "metal", 0.5),
        "flagHem": m("flagHem", "#2c8a44", "fabric", 0.9),
        "flagFinial": m("flagFinial", "#8a8e90", "metal", 0.4),
    }


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

_AXES = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}


def _ring_point(base, axis, h, r, a):
    bx, by, bz = base
    c, s = math.cos(a) * r, math.sin(a) * r
    if axis == "y":
        return (bx + c, by + h, bz + s)
    if axis == "x":
        return (bx + h, by + c, bz + s)
    return (bx + c, by + s, bz + h)


def lathe(name, stations, mats, base=(0.0, 0.0, 0.0), sides=12, turn=0.0, cap_top=False, cap_bottom=False, axis="y"):
    """A turned shape: `stations` are (height along `axis`, radius) from the
    bottom up, `mats` a material per band (or one for all). Traversed bottom
    to top with the solid on the axis side, so a step outward faces down and
    one inward faces up. A radius of 0 is an apex."""
    if not isinstance(mats, (list, tuple)):
        mats = [mats] * (len(stations) - 1)
    bm = bmesh.new()
    ad = Vector(_AXES[axis])
    rings = []
    for h, r in stations:
        if r < 1e-6:
            rings.append([bm.verts.new(B(_ring_point(base, axis, h, 0.0, 0.0)))] * sides)
        else:
            rings.append([bm.verts.new(B(_ring_point(base, axis, h, r, turn + 2 * math.pi * i / sides))) for i in range(sides)])
    used = []
    for k in range(len(stations) - 1):
        (h0, r0), (h1, r1) = stations[k], stations[k + 1]
        n2 = (h1 - h0, -(r1 - r0))
        for i in range(sides):
            j = (i + 1) % sides
            quad = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]]
            verts = []
            for v in quad:
                if v not in verts:
                    verts.append(v)
            if len(verts) < 3:
                continue
            try:
                f = bm.faces.new(verts)
            except ValueError:
                continue
            f.normal_update()
            mid = f.calc_center_median()
            # Radial direction (Blender frame) at the face, away from the axis.
            axis_b = B(ad)
            rel = mid - B(base)
            rad = rel - axis_b * rel.dot(axis_b)
            rad = rad.normalized() if rad.length > 1e-9 else Vector((0, 0, 0))
            outward = rad * n2[0] + axis_b * n2[1]
            if f.normal.dot(outward) < 0:
                f.normal_flip()
            f.material_index = used.index(mats[k]) if mats[k] in used else (used.append(mats[k]) or len(used) - 1)
    for cap, k, sign in ((cap_top, len(stations) - 1, 1), (cap_bottom, 0, -1)):
        if cap and stations[k][1] > 1e-6:
            f = bm.faces.new(list(rings[k]) if sign > 0 else list(reversed(rings[k])))
            f.normal_update()
            if f.normal.dot(B(ad) * sign) < 0:
                f.normal_flip()
            m = mats[-1] if sign > 0 else mats[0]
            f.material_index = used.index(m) if m in used else (used.append(m) or len(used) - 1)
    obj = lp._obj(name, bm, None)
    for m in used:
        obj.data.materials.append(m)
    return obj


def blob(name, centre, radii, mat, u=10, v=6, turn=0.0):
    """An ellipsoid, faceted: `radii` (x, y, z) in the app frame."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector((radii[0], radii[2], radii[1])), verts=bm.verts)
    if turn:
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Matrix.Rotation(turn, 3, "Z"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=B(centre), verts=bm.verts)
    return lp._obj(name, bm, mat)


def slab(name, size, pos, mat, bev=0.012, seg=1, rot=(0, 0, 0)):
    """A bevelled box: the bevel is what catches light on a close edge."""
    return box(name, size, pos, mat, bev=bev, seg=seg, rot=rot)


def bolt(name, pos, axis, r, length, mat, sides=6):
    """A hex bolt head, its axis along `axis`, sitting from `pos` outwards
    (`length` negative points it the other way): 16 triangles."""
    return lathe(name, [(0.0, r), (length, r * 0.92)], mat, base=pos, sides=sides, cap_top=True, axis=axis) if length > 0 else \
        lathe(name, [(length, r * 0.92), (0.0, r)], mat, base=pos, sides=sides, cap_bottom=True, axis=axis)


def torus(name, centre, R, r, mat, axis="z", major=10, minor=5, turn=0.0):
    """A ring: a lifting eye, a hoop. 4 * major * minor / 2 triangles."""
    bm = bmesh.new()
    cx, cy, cz = centre
    rings = []
    for i in range(major):
        a = turn + 2 * math.pi * i / major
        ring = []
        for k in range(minor):
            b = 2 * math.pi * k / minor
            rr = R + r * math.cos(b)
            ax = r * math.sin(b)
            c, s = math.cos(a) * rr, math.sin(a) * rr
            p = (cx + c, cy + s, cz + ax) if axis == "z" else (cx + ax, cy + c, cz + s) if axis == "x" else (cx + c, cy + ax, cz + s)
            ring.append(bm.verts.new(B(p)))
        rings.append(ring)
    for i in range(major):
        j = (i + 1) % major
        for k in range(minor):
            l = (k + 1) % minor
            bm.faces.new((rings[i][k], rings[j][k], rings[j][l], rings[i][l]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def ring_of(r, n, turn=0.0, jitter=None):
    out = []
    for i in range(n):
        a = turn + i * 2 * math.pi / n
        k = 1.0 + (jitter[i % len(jitter)] if jitter else 0.0)
        out.append((math.cos(a) * r * k, math.sin(a) * r * k, 0))
    return out


def tuft(name, x, z, height, radius, mat, blades=7, seed=0.0, lean=0.06):
    """Grass: a fan of thin tapering blades, 2 triangles each (a folded
    quad tapering to a point). Leans outwards from (x, z)."""
    bm = bmesh.new()
    for i in range(blades):
        a = seed + i * 2.399963  # golden angle: no two blades in a row alike
        d = radius * (0.25 + 0.75 * ((i * 0.618) % 1.0))
        bx, bz = x + math.cos(a) * d, z + math.sin(a) * d
        hh = height * (0.55 + 0.45 * ((i * 0.37 + seed) % 1.0))
        tx, tz = bx + math.cos(a) * lean * hh * 2, bz + math.sin(a) * lean * hh * 2
        w = 0.022
        nx, nz = -math.sin(a) * w, math.cos(a) * w
        pts = [(bx - nx, 0.0, bz - nz), (bx + nx, 0.0, bz + nz), (bx + (tx - bx) * 0.5, hh * 0.55, bz + (tz - bz) * 0.5), (tx, hh, tz)]
        # Two skins over the same points, so the blade shows from either side.
        for order in ((0, 1, 2), (0, 2, 3), (1, 0, 2), (2, 0, 3)):
            bm.faces.new([bm.verts.new(B(pts[k])) for k in order])
    return lp._obj(name, bm, mat)


def quad_strip(name, points, width, mat, up=(0, 1, 0), lift=0.0):
    """A flat ribbon along an app-frame polyline, `width` wide, lying in the
    plane whose normal is `up`: cracks, tape, skid marks."""
    bm = bmesh.new()
    n = len(points)
    u = Vector(up)
    left, right = [], []
    for i, p in enumerate(points):
        a = Vector(points[max(0, i - 1)])
        b = Vector(points[min(n - 1, i + 1)])
        t = (b - a).normalized()
        side = t.cross(u).normalized() * width / 2
        pp = Vector(p) + u * lift
        left.append(bm.verts.new(B(pp - side)))
        right.append(bm.verts.new(B(pp + side)))
    for i in range(n - 1):
        f = bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
        f.normal_update()
        if f.normal.dot(B(u)) < 0:
            f.normal_flip()
    return lp._obj(name, bm, mat)


# ---------------------------------------------------------------------------
# Traffic cones
# ---------------------------------------------------------------------------


def cone(name, x, z, h, r, M, sides=10, y=0.0, pitch=0.0, roll=0.0, yaw=0.0):
    """A traffic cone (about 240 triangles): a bevelled rubber base with four
    studs, an orange body with two reflective white sleeves standing proud of
    it, and a rounded tip. `r` is the lean cone's ring radius, `h` its
    height. A cone knocked over is built upright at the origin and turned
    (pitch, roll, yaw in the app frame) before it is stood at (x, y, z)."""
    rb = r * 0.70
    y0 = h * 0.06
    rt = r * 0.15
    orange, white = M["coneOrange"], M["coneBand"]

    def at(t):
        return rb + (rt - rb) * (t - y0) / (h - y0)

    stations = [(y0, rb * 1.02)]
    mats = []

    def to(t, radius, mat):
        stations.append((t, radius))
        mats.append(mat)

    def sleeve(t0, t1, lift=0.008):
        to(t0, at(t0) + lift, white)  # steps out from the skin
        to(t1, at(t1) + lift, white)
        to(t1, at(t1), white)  # and back in

    to(h * 0.26, at(h * 0.26), orange)
    sleeve(h * 0.26, h * 0.46)
    to(h * 0.56, at(h * 0.56), orange)
    sleeve(h * 0.56, h * 0.68)
    to(h * 0.94, at(h * 0.94), orange)
    to(h * 0.985, rt * 0.7, orange)
    to(h, rt * 0.3, orange)
    body = lathe(f"{name}Body", stations, mats, sides=sides, turn=math.pi / sides, cap_top=True)
    s = r * 0.98
    parts = [body, slab(f"{name}Plate", (s * 1.7, y0, s * 1.7), (0, y0 / 2, 0), M["coneBase"], bev=0.014)]
    from crowdcar import app_matrix

    turn = app_matrix(pitch=pitch, roll=roll, yaw=yaw)
    for obj in parts:
        if pitch or roll or yaw:
            obj.data.transform(turn)
        obj.data.transform(Matrix.Translation(B((x, y, z))))
    return parts


# ---------------------------------------------------------------------------
# Wheels
# ---------------------------------------------------------------------------


def _axial(x, side, profile):
    """(offset, radius) pairs from a wheel's inner face to its outer one as
    lathe stations along x, ascending, whichever way the wheel faces."""
    stations = [(x + side * off, r) for off, r in profile]
    return stations if side > 0 else stations[::-1]


def wheel(name, x, y, z, radius, width, M, sides=10, lugs=4, squash=None, light=False):
    """A car wheel about the x axis, centred on (x, y, z) and facing
    outwards along the sign of x (about 220 triangles at 10 sides): a tyre
    with a tread crown and rounded shoulders, a rim with a lip and a dished
    face, and a hub cap with lug nuts. `squash` (height, length) crushes it
    about the road: a flat tyre."""
    side = 1 if x >= 0 else -1
    w, R = width / 2, radius
    # `light` spends four bands on the tyre and two on the rim, for cars
    # that carry four to eight of them.
    tyre_profile = ([(-0.85 * w, 0.62 * R), (-w, 0.9 * R), (0.0, R), (w, 0.9 * R), (0.85 * w, 0.62 * R)] if light else
                    [(-0.85 * w, 0.62 * R), (-w, 0.85 * R), (-0.55 * w, R), (0.55 * w, R), (w, 0.85 * R), (0.85 * w, 0.62 * R)])
    rim_profile = ([(0.85 * w, 0.64 * R), (0.98 * w, 0.55 * R), (0.86 * w, 0.25 * R)] if light else
                   [(0.85 * w, 0.64 * R), (0.98 * w, 0.6 * R), (0.86 * w, 0.5 * R), (0.86 * w, 0.2 * R)])
    tyre = lathe(f"{name}Tyre", _axial(x, side, tyre_profile), M["rubber"], base=(0, y, z), sides=sides, axis="x")
    outward = dict(cap_top=side > 0, cap_bottom=side < 0)
    rim = lathe(f"{name}Rim", _axial(x, side, rim_profile), M["rim"], base=(0, y, z), sides=sides, axis="x", **outward)
    parts = [tyre, rim]
    if not light:
        parts.append(lathe(f"{name}Hub", _axial(x, side, [(0.86 * w, 0.2 * R), (1.04 * w, 0.18 * R)]), M["steelDark"],
                           base=(0, y, z), sides=6, axis="x", **outward))
    for i in range(lugs):
        a = 2 * math.pi * i / lugs
        parts.append(bolt(f"{name}Lug", (x + side * 0.86 * w, y + math.cos(a) * 0.36 * R, z + math.sin(a) * 0.36 * R), "x",
                          R * 0.035, side * 0.02, M["bolt"], sides=4))
    if squash:
        # Scaled about the road under the wheel; Blender's z is the app's y
        # and its -y the app's z.
        about = Matrix.Translation(B((0, 0, z)))
        crush = about @ Matrix.Diagonal((1, squash[1], squash[0], 1)) @ about.inverted()
        for obj in parts:
            obj.data.transform(crush)
    return parts


# ---------------------------------------------------------------------------
# The four optional parts, in detail (mask bits 0..3 in the crowd shader)
# ---------------------------------------------------------------------------


def worker(M, x, z, y0=0.0, turn=0.0):
    """A worker (about 500 triangles): boots, legs, a belted hi-vis vest with
    reflective bands and braces, arms with gloves, a neck, a head with nose
    and ears, a hard hat with brim, ridge and band. Same height (1.07) and
    footprint as the lean worker: the helmet still tops out at y0 + 1.07."""
    parts = []
    c, s = math.cos(turn), math.sin(turn)

    def P(dx, dy, dz):
        return (x + dx * c + dz * s, y0 + dy, z - dx * s + dz * c)

    for side in (-1, 1):
        parts.append(slab("boot", (0.1, 0.08, 0.2), P(side * 0.065, 0.04, 0.03), M["workerBoots"], bev=0))
        parts.append(lp.tube("leg", P(side * 0.065, 0.07, 0), P(side * 0.06, 0.44, 0), 0.052, 0.058, M["legs"], sides=8))
        # A knee pad's worth of bulk on the shin.
    parts.append(lp.tube("hips", P(0, 0.4, 0), P(0, 0.5, 0), 0.135, 0.13, M["legs"], sides=10, squash=0.65, turn=0.3))
    parts.append(slab("belt", (0.27, 0.035, 0.2), P(0, 0.5, 0), M["workerBoots"], bev=0.01))
    # The vest: chest and shoulders in two courses.
    parts.append(lp.tube("vest", P(0, 0.49, 0), P(0, 0.68, 0), 0.145, 0.16, M["vest"], sides=10, squash=0.66, turn=0.3))
    parts.append(lp.tube("shoulders", P(0, 0.68, 0), P(0, 0.78, 0), 0.16, 0.12, M["vest"], sides=10, squash=0.66, cap1=True, turn=0.3))
    for y in (0.56, 0.66):
        parts.append(lp.tube("band", P(0, y - 0.018, 0), P(0, y + 0.018, 0), 0.151, 0.153, M["workerStripe"], sides=10, squash=0.66, turn=0.3))
    for side in (-1, 1):
        parts.append(slab("brace", (0.03, 0.2, 0.012), P(side * 0.06, 0.67, 0.112), M["workerStripe"], bev=0.004))
        parts.append(slab("braceB", (0.03, 0.2, 0.012), P(side * 0.06, 0.67, -0.112), M["workerStripe"], bev=0.004))
        # Arms: sleeve, elbow, forearm and a gloved hand, angled at the work.
        sh = P(side * 0.172, 0.73, 0)
        el = P(side * 0.185, 0.56, 0.035)
        hd = P(side * 0.17, 0.42, 0.11)
        parts.append(lp.tube("sleeve", sh, el, 0.036, 0.032, M["vest"], sides=6))
        parts.append(lp.tube("forearm", el, hd, 0.032, 0.026, M["skin"], sides=6))
        parts.append(lp.tube("glove", hd, P(side * 0.165, 0.37, 0.13), 0.03, 0.028, M["workerGloves"], sides=6, cap1=True))
    parts.append(lp.tube("neck", P(0, 0.76, 0), P(0, 0.84, 0), 0.05, 0.048, M["skin"], sides=6))
    parts.append(blob("head", P(0, 0.905, 0), (0.078, 0.092, 0.088), M["skin"], u=8, v=5))
    parts.append(slab("nose", (0.022, 0.03, 0.026), P(0, 0.9, 0.09), M["skin"], bev=0.006))
    # The hard hat: dome, a brim all round and a ridge over the crown.
    parts.append(blob("helmet", P(0, 0.955, 0), (0.108, 0.115, 0.118), M["helmet"], u=10, v=5))
    parts.append(lp.tube("brim", P(0, 0.945, 0), P(0, 0.953, 0), 0.135, 0.12, M["helmet"], sides=12, turn=0.26))
    parts.append(lp.tube("peak", P(0, 0.943, 0.1), P(0, 0.951, 0.15), 0.06, 0.05, M["helmet"], sides=6, squash=0.2))
    parts.append(slab("ridge", (0.03, 0.02, 0.2), P(0, 1.06, 0), M["helmet"], bev=0.008))
    return parts


def beacon(M, pos, size=0.22):
    """The failing-checks lamp (about 130 triangles): a bolted base with a
    ribbed collar, a domed lens with a lens ring and a reflector cone inside
    the dome. Stays inside the lean lamp's cube."""
    x, y, z = pos
    h = size / 2
    parts = [
        slab("bBase", (size * 0.95, size * 0.2, size * 0.95), (x, y - h + size * 0.1, z), M["beaconBase"], bev=0.012),
        lathe("bCollar", [(y - h + size * 0.2, size * 0.36), (y - h + size * 0.3, size * 0.34)], M["beaconBase"], base=(x, 0, z), sides=10),
        lathe("bDome", [(y - h + size * 0.3, size * 0.34), (y - h + size * 0.5, size * 0.4), (y - h + size * 0.8, size * 0.3), (y + h, size * 0.05)],
              M["beacon"], base=(x, 0, z), sides=10, cap_top=True),
        lathe("bRing", [(y - h + size * 0.3, size * 0.37), (y - h + size * 0.36, size * 0.37)], M["beaconBase"], base=(x, 0, z), sides=10, cap_top=False),
    ]
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(bolt("bBolt", (x + sx * size * 0.4, y - h + size * 0.2, z + sz * size * 0.4), "y", size * 0.05, size * 0.05, M["bolt"], sides=5))
    return parts


def board_panel(M, centre, size=0.56, edge_on=True, thick=0.05):
    """A red stop board without its post (about 90 triangles): a bevelled red
    plate, a white border and bar on both faces and four bolts a face."""
    x, cy, z = centre
    dims = (thick, size, size) if edge_on else (size, size, thick)
    parts = [slab("board", dims, centre, M["board"], bev=0.02)]

    def at(a, b, c):
        return (x + a, cy + b, z + c) if edge_on else (x + c, cy + b, z + a)

    def size3(a, b, c):
        return (a, b, c) if edge_on else (c, b, a)

    face = thick / 2 + 0.004
    e = size * 0.44
    for sgn in (-1, 1):
        loop = [at(sgn * face, b, c) for b, c in ((-e, -e), (e, -e), (e, e), (-e, e), (-e, -e))]
        parts.append(quad_strip("edge", loop, 0.026, M["boardEdge"], up=(sgn, 0, 0) if edge_on else (0, 0, sgn)))
        parts.append(slab("bar", size3(0.008, 0.07, size * 0.6), at(sgn * face, 0, 0), M["boardEdge"], bev=0))
        for k in (-1, 1):
            for j in (-1, 1):
                parts.append(bolt("bolt", at(sgn * face, k * size * 0.4, j * size * 0.4), "x" if edge_on else "z", 0.014, sgn * 0.01, M["bolt"], sides=4))
    return parts


def board(M, x, z, y0, height, size=0.56, edge_on=True):
    """A red stop board on a footed post (about 200 triangles), edge-on to x
    like the lean one."""
    parts = [
        lp.tube("bPost", (x, y0 + 0.02, z), (x, y0 + height, z), 0.03, 0.03, M["boardPost"], sides=8),
        slab("bFoot", (0.09, 0.03, 0.22) if edge_on else (0.22, 0.03, 0.09), (x, y0 + 0.015, z), M["boardPost"], bev=0),
    ]
    return parts + board_panel(M, (x, y0 + height + size / 2 - 0.1, z), size, edge_on)


def flag(M, x, z, y0, top):
    """The approval flag (about 260 triangles): a footed pole with a
    finial ball, a cleat, and a cloth of a 8 x 3 grid a side, held out along
    +x with a hem and a stitched heading. The shader ripples it by the
    vertex's distance from the pole, so the cloth is cut in columns."""
    parts = [
        lp.tube("fPole", (x, y0 + 0.03, z), (x, top, z), 0.03, 0.022, M["flagPole"], sides=8),
        slab("fFoot", (0.14, 0.03, 0.14), (x, y0 + 0.015, z), M["flagPole"], bev=0.008),
        blob("finial", (x, top + 0.03, z), (0.03, 0.03, 0.03), M["flagFinial"], u=6, v=3),
        lp.tube("cleat", (x, top - 0.08, z), (x + 0.03, top - 0.08, z), 0.02, 0.016, M["flagFinial"], sides=6),
    ]
    cols, rows = 8, 3
    w, hgt = 0.72, 0.44
    x0 = x + 0.03
    ytop = top - 0.04
    for face_sign in (1, -1):
        bm = bmesh.new()
        grid = []
        for r in range(rows + 1):
            line = []
            for c in range(cols + 1):
                u = c / cols
                # A gentle fixed billow, so the cloth is not a board at rest.
                dz = face_sign * (0.004 + 0.012 * math.sin(u * 5.0) * u)
                line.append(bm.verts.new(B((x0 + u * w, ytop - hgt * r / rows, z + dz))))
            grid.append(line)
        for r in range(rows):
            for c in range(cols):
                f = bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
                f.normal_update()
                if f.normal.dot(B((0, 0, face_sign))) < 0:
                    f.normal_flip()
                f.material_index = 1 if r == rows - 1 or c == 0 else 0
        obj = lp._obj("cloth", bm, None)
        obj.data.materials.append(M["flag"])
        obj.data.materials.append(M["flagHem"])
        parts.append(obj)
    return parts
