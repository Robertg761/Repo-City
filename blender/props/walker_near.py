"""
The walking crowd's figure, close up: the near level of detail of `walker.py`.

Same two nodes in the same frames as the lean figure, so `LodInstances` swaps
them in place (the crowd moves them by matrix only, bob and sway, so both
levels animate identically):

  WalkerBodyNear  origin at the chest (0.44 above the pavement), soles at -0.44,
                  shoulders and arms where the lean body has them.
  WalkerHeadNear  origin at the head's centre (0.94 above the pavement); the
                  neck reaches down inside the collar.

Colour roles are the lean figure's, so the per-instance tints still apply: the
jacket (and the darker shades of it: hem, cuffs, collar, pocket flaps) is
`paint`, the hands and the trousers, shoes and hair keep their own colours, and
the face and neck are `paintskin`. Additions that carry a fixed colour: soles,
laces, a backpack with straps, a zip, a watch, eye whites.

Budget: 3,000 triangles for both nodes together (`walkerModel.test.ts`).
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B, box, finish  # noqa: E402

SKIN = "#c99f7d"


def palette():
    m = kit.material
    return {
        "clothes": m("paint", "#ffffff", "fabric", 0.9),
        "clothes_dark": m("paint", "#ffffff", "fabric", 0.9, tone=0.78),
        "trousers": m("trousers", "#35404b", "fabric", 0.9),
        "seam": m("trousers", "#35404b", "fabric", 0.9, tone=0.8),
        "shoes": m("shoes", "#292b2e", "fabric", 0.8),
        "soles": m("soles", "#cfcabb", "fabric", 0.8),
        "laces": m("laces", "#e6e2d6", "fabric", 0.8),
        "hands": m("hands", SKIN, "plaster", 0.8),
        "skin": m("paintskin", "#ffffff", "plaster", 0.8),
        "hair": m("hair", "#4a3830", "fabric", 0.9),
        "hair_dark": m("hair", "#4a3830", "fabric", 0.9, tone=0.72),
        "eyes": m("eyes", "#302d29", "glass", 0.4),
        "eyewhite": m("eyewhite", "#efeae0", "plaster", 0.6),
        "mouth": m("mouth", "#ad8272", "plaster", 0.8),
        "pack": m("pack", "#6d5b47", "fabric", 0.9),
        "pack_dark": m("pack", "#6d5b47", "fabric", 0.9, tone=0.78),
        "strap": m("strap", "#2f3336", "fabric", 0.9),
        "zip": m("zip", "#a6a9ab", "metal", 0.4, metallic=0.6),
    }


def loft(name, stations, mat, sides=10, axis="y", caps=(True, True), turn=0.0):
    """A closed body through elliptical rings. `axis` "y" stands the rings up
    (station: y, rx, rz, cx, cz); "z" lays them along the figure's depth
    (station: z, rx, ry, cx, cy), for feet."""
    bm = bmesh.new()
    loops = []
    for s, rx, r2, c1, c2 in stations:
        ring = []
        for i in range(sides):
            t = turn + 2 * math.pi * i / sides
            a, b = math.cos(t) * rx, math.sin(t) * r2
            p = (c1 + a, s, c2 + b) if axis == "y" else (c1 + a, c2 + b, s)
            ring.append(bm.verts.new(B(p)))
        loops.append(ring)
    for a, b in zip(loops, loops[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps[0]:
        bm.faces.new(list(reversed(loops[0])))
    if caps[1]:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def hull(name, points, mat):
    """The convex hull of app-frame points: noses, ears, locks of hair."""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(B(p))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def mirror(points, side):
    return [(x * side, y, z) for x, y, z in points]


def torso_front(y):
    """z of the jacket's front facet at height y (rings below, 12 sides)."""
    rings = TORSO
    for (y0, _, z0, _, _), (y1, _, z1, _, _) in zip(rings, rings[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            return (z0 + (z1 - z0) * t) * math.cos(math.pi / 12)
    return rings[-1][2]


# Hips, waist, chest, shoulders, the collar's base (y, rx, rz, cx, cz).
TORSO = [
    (-0.13, 0.117, 0.088, 0, 0),
    (-0.05, 0.115, 0.085, 0, 0),
    (0.02, 0.111, 0.082, 0, 0),
    (0.10, 0.128, 0.09, 0, 0),
    (0.19, 0.148, 0.10, 0, 0),
    (0.255, 0.153, 0.096, 0, 0),
    (0.295, 0.112, 0.078, 0, 0),
    (0.33, 0.062, 0.058, 0, 0),
]


def surf(x, y):
    """(z, yaw) of the jacket's surface at across-position x and height y, so a
    pocket or a strap lies on the curve of the chest instead of a flat facet."""
    for (y0, rx0, rz0, _, _), (y1, rx1, rz1, _, _) in zip(TORSO, TORSO[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            rx, rz = rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t
            u = min(abs(x) / rx, 0.97)
            z = rz * math.sqrt(1 - u * u) * 0.985
            slope = (rz / rx) * u / math.sqrt(1 - u * u) * math.copysign(1, x) * 0.985
            return z, math.atan(slope)
    return TORSO[-1][2], 0.0


def body(M):
    parts = []
    # --- Jacket: the body, a hem band, a collar with a stand, a zip, pockets.
    parts.append(loft("torso", TORSO, M["clothes"], sides=12))
    parts.append(loft("hem", [(-0.158, 0.123, 0.094, 0, 0), (-0.14, 0.1235, 0.0945, 0, 0),
                              (-0.09, 0.121, 0.092, 0, 0)], M["clothes_dark"], sides=12, caps=(False, False)))
    parts.append(loft("collar", [(0.292, 0.088, 0.07, 0, 0), (0.318, 0.078, 0.066, 0, 0),
                                 (0.346, 0.071, 0.062, 0, 0.004)], M["clothes_dark"], sides=12, caps=(False, False)))
    ys = [-0.155, -0.10, -0.03, 0.04, 0.11, 0.19, 0.265, 0.318]
    for a, b in zip(ys, ys[1:]):
        parts.append(kit.strut("zip", (0, a, torso_front(a) + 0.004), (0, b, torso_front(b) + 0.004), (0.011, 0.007),
                               M["zip"]))
    parts.append(box("zip_pull", (0.014, 0.03, 0.01), (0.0, 0.29, torso_front(0.29) + 0.01), M["zip"], bev=0))
    for side in (-1, 1):
        # Pocket flaps and the welt beneath them, a chest patch, buttons.
        for name, size, x, y in (("flap", (0.062, 0.05, 0.014), 0.075, -0.05), ("welt", (0.058, 0.008, 0.012), 0.075, -0.082),
                                 ("chestpatch", (0.05, 0.04, 0.01), 0.088, 0.14), ("button", (0.012, 0.012, 0.01), 0.075, -0.03)):
            z, yaw = surf(side * x, y)
            parts.append(box(f"{name}{side}", size, (side * x, y, z + size[2] / 2 - 0.002), M["zip" if name == "button" else "clothes_dark"],
                             bev=0.004 if size[0] > 0.04 else 0, rot=(0.0, yaw, 0.0)))

    # --- Arms: sleeves with an elbow bend, cuffs, hands with fingers and thumb.
    for side in (-1, 1):
        arm = [
            (0.288, 0.05, 0.048, side * 0.16, 0.0),
            (0.245, 0.046, 0.044, side * 0.1578, 0.0),
            (0.185, 0.043, 0.041, side * 0.1561, 0.002),
            (0.12, 0.041, 0.039, side * 0.1553, 0.006),
            (0.07, 0.039, 0.039, side * 0.1549, 0.012),
            (0.02, 0.037, 0.036, side * 0.1544, 0.018),
            (-0.03, 0.036, 0.035, side * 0.1542, 0.022),
        ]
        parts.append(loft(f"sleeve{side}", arm, M["clothes"], sides=10, caps=(True, False)))
        parts.append(loft(f"cuff{side}", [(-0.02, 0.041, 0.04, side * 0.1542, 0.021), (-0.035, 0.041, 0.04, side * 0.1542, 0.022),
                                          (-0.062, 0.039, 0.038, side * 0.1540, 0.024)],
                          M["clothes_dark"], sides=10, caps=(False, True)))
        cx, cz = side * 0.1540, 0.026
        parts.append(loft(f"palm{side}", [(-0.062, 0.025, 0.02, cx, cz), (-0.085, 0.03, 0.02, cx, cz + 0.002),
                                          (-0.105, 0.029, 0.018, cx, cz + 0.004)], M["hands"], sides=8))
        for i, dx in enumerate((-0.0225, -0.0075, 0.0075, 0.0225)):
            length = (0.036, 0.042, 0.04, 0.032)[i]
            x = cx + dx * 0.95
            parts.append(lp.tube(f"finger{side}{i}", (x, -0.103, cz + 0.005), (x, -0.103 - length, cz + 0.014),
                                 0.0075, 0.006, M["hands"], sides=4, cap1=True))
        parts.append(lp.tube(f"thumb{side}", (cx - side * 0.026, -0.072, cz + 0.006),
                             (cx - side * 0.03, -0.112, cz + 0.02), 0.009, 0.0065, M["hands"], sides=4, cap1=True))
    # A watch on the left wrist.
    parts.append(loft("watchband", [(-0.048, 0.042, 0.041, -0.1540, 0.024), (-0.064, 0.042, 0.041, -0.1540, 0.025)],
                      M["strap"], sides=10, caps=(False, False)))
    parts.append(box("watch", (0.03, 0.03, 0.012), (-0.1540, -0.056, 0.066), M["zip"], bev=0.003))

    # --- Legs: trousers with a knee and a cuff, then the shoes.
    for side in (-1, 1):
        x = side * 0.07
        leg = [
            (-0.125, 0.056, 0.066, x * 0.9, 0.0),
            (-0.17, 0.058, 0.064, x * 0.96, 0.002),
            (-0.235, 0.055, 0.06, x, 0.006),
            (-0.275, 0.052, 0.058, x, 0.008),
            (-0.32, 0.05, 0.054, x, 0.004),
            (-0.36, 0.047, 0.05, x * 1.03, 0.002),
            (-0.361, 0.053, 0.056, x * 1.03, 0.004),
            (-0.4, 0.053, 0.058, x * 1.03, 0.008),
        ]
        parts.append(loft(f"leg{side}", leg, M["trousers"], sides=10, caps=(True, True)))
        parts.append(box(f"pocket{side}", (0.05, 0.05, 0.012), (x, -0.16, -0.066), M["seam"], bev=0.004))
        sx = x * 1.03
        parts.append(lp._obj(f"sole{side}", _sole(sx), M["soles"]))
        upper = [
            (-0.052, 0.036, 0.026, sx, -0.398),
            (-0.03, 0.041, 0.034, sx, -0.393),
            (0.0, 0.043, 0.036, sx, -0.393),
            (0.035, 0.043, 0.03, sx, -0.399),
            (0.078, 0.043, 0.024, sx, -0.407),
            (0.108, 0.037, 0.019, sx, -0.412),
            (0.126, 0.022, 0.013, sx, -0.414),
        ]
        parts.append(loft(f"shoe{side}", upper, M["shoes"], sides=10, axis="z", caps=(True, True)))
        parts.append(box(f"heel{side}", (0.07, 0.014, 0.03), (sx, -0.428, -0.052), M["shoes"], bev=0))
        parts.append(kit.strut(f"lace{side}", (sx, -0.366, -0.008), (sx, -0.384, 0.07), (0.022, 0.006), M["laces"]))
        for k in range(2):
            z = 0.0 + 0.025 * k
            parts.append(box(f"lacerow{side}{k}", (0.05, 0.005, 0.006), (sx, -0.366 - 0.006 * k, z), M["laces"], bev=0))
        parts.append(box(f"toecap{side}", (0.05, 0.012, 0.03), (sx, -0.417, 0.106), M["soles"], bev=0))

    # --- Backpack: body, lid, front pocket, straps over the shoulders.
    back = -0.09
    parts.append(box("pack", (0.19, 0.25, 0.095), (0, 0.085, back - 0.05), M["pack"], bev=0.022, seg=2))
    parts.append(box("packlid", (0.196, 0.075, 0.1), (0, 0.19, back - 0.05), M["pack_dark"], bev=0.02, seg=2))
    parts.append(box("packpocket", (0.13, 0.11, 0.032), (0, 0.04, back - 0.115), M["pack_dark"], bev=0.012, seg=2))
    parts.append(box("packzip", (0.13, 0.008, 0.01), (0, 0.098, back - 0.132), M["zip"], bev=0))
    for side in (-1, 1):
        x = side * 0.078
        pts = [(x, 0.29, 0.058)]
        for y in (0.255, 0.2, 0.14, 0.08, 0.02):
            px = x * (1 + (0.27 - y) * 1.6)
            pts.append((px, y, surf(px, y)[0] + 0.006))
        for a, b in zip(pts, pts[1:]):
            parts.append(kit.strut("strap", a, b, (0.028, 0.012), M["strap"]))
        for a, b in (((x, 0.29, -0.056), (x, 0.305, 0.0)), ((x, 0.305, 0.0), (x, 0.29, 0.058))):
            parts.append(kit.strut("strap", a, b, (0.028, 0.012), M["strap"]))
        parts.append(kit.strut("backstrap", (x, 0.285, -0.06), (x * 1.5, 0.05, -0.095), (0.03, 0.01), M["strap"]))
        parts.append(box("buckle", (0.022, 0.012, 0.012), (pts[-1][0], 0.02, pts[-1][2] + 0.006), M["zip"], bev=0))
    return finish(parts, "WalkerBodyNear")


def _sole(x):
    """A foot-shaped sole, rounded at toe and heel, 0.016 deep."""
    outline = kit.rounded_rect(x - 0.048, x + 0.048, -0.062, 0.13, (0.038, 0.038, 0.022, 0.022), steps=3)
    bm = bmesh.new()
    lo = [bm.verts.new(B((px, -0.44, pz))) for px, pz in outline]
    hi = [bm.verts.new(B((px, -0.424, pz))) for px, pz in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def head(M):
    parts = []
    # --- Neck, running down inside the collar.
    parts.append(loft("neck", [(-0.205, 0.05, 0.052, 0, -0.004), (-0.15, 0.047, 0.05, 0, -0.004),
                               (-0.09, 0.05, 0.054, 0, 0.0)], M["skin"], sides=10, caps=(True, False)))
    # --- Cranium and face: brow, cheeks, jaw and chin in one shell.
    skull = [
        (-0.150, 0.034, 0.048, 0, 0.028),
        (-0.135, 0.062, 0.078, 0, 0.018),
        (-0.105, 0.098, 0.112, 0, 0.004),
        (-0.06, 0.124, 0.134, 0, -0.004),
        (-0.01, 0.137, 0.144, 0, -0.008),
        (0.04, 0.143, 0.148, 0, -0.008),
        (0.09, 0.137, 0.142, 0, -0.01),
        (0.13, 0.108, 0.113, 0, -0.012),
        (0.156, 0.062, 0.066, 0, -0.012),
        (0.168, 0.022, 0.024, 0, -0.012),
    ]
    parts.append(loft("skull", skull, M["skin"], sides=12, caps=(True, True)))

    def face_z(y, k=0.97):
        for (y0, _, z0, _, c0), (y1, _, z1, _, c1) in zip(skull, skull[1:]):
            if y0 <= y <= y1:
                t = (y - y0) / (y1 - y0)
                return c0 + (c1 - c0) * t + (z0 + (z1 - z0) * t) * k
        return 0.12

    for side in (-1, 1):
        # Eye: white, iris, brow line; ear with a rim.
        ez = face_z(0.02)
        parts.append(box(f"eyewhite{side}", (0.034, 0.02, 0.01), (side * 0.05, 0.022, ez - 0.001), M["eyewhite"], bev=0))
        parts.append(box(f"iris{side}", (0.016, 0.018, 0.008), (side * 0.05 - side * 0.002, 0.022, ez + 0.005), M["eyes"], bev=0))
        parts.append(kit.strut(f"brow{side}", (side * 0.03, 0.05, face_z(0.05) + 0.003),
                               (side * 0.075, 0.056, face_z(0.056) - 0.008), (0.012, 0.01), M["hair_dark"]))
        parts.append(hull(f"ear{side}", mirror([(0.13, 0.03, -0.005), (0.146, 0.026, -0.01), (0.15, -0.005, -0.012),
                                                (0.14, -0.05, -0.006), (0.13, -0.045, -0.004), (0.13, 0.0, 0.03),
                                                (0.146, -0.01, 0.024), (0.138, -0.035, 0.02)], side), M["skin"]))
    nz = face_z(0.0)
    parts.append(hull("nose", [(0.0, 0.03, nz - 0.004), (-0.012, 0.02, nz - 0.004), (0.012, 0.02, nz - 0.004),
                               (0.0, -0.034, nz + 0.03), (-0.022, -0.042, nz + 0.002), (0.022, -0.042, nz + 0.002),
                               (-0.008, -0.044, nz + 0.018), (0.008, -0.044, nz + 0.018)], M["skin"]))
    mz = face_z(-0.07)
    parts.append(box("upperlip", (0.046, 0.011, 0.012), (0, -0.066, mz + 0.001), M["mouth"], bev=0.003))
    parts.append(box("lowerlip", (0.038, 0.011, 0.012), (0, -0.081, mz - 0.001), M["mouth"], bev=0.003))

    # --- Hair: a shell over the crown and the back of the head (cut along a
    # plane that rises towards the face), a fringe, sideburns, a nape lock.
    shell = [(y + 0.003, rx + 0.009, rz + 0.009, cx, cz - 0.003) for y, rx, rz, cx, cz in skull[2:]]
    shell = [(-0.13, 0.108, 0.122, 0, 0.0)] + shell[:-1] + [(0.172, 0.03, 0.032, 0, -0.015)]
    obj = loft("hairshell", shell, M["hair"], sides=12, caps=(False, True))
    hb = bmesh.new()
    hb.from_mesh(obj.data)
    geom = hb.verts[:] + hb.edges[:] + hb.faces[:]
    n = Vector((0, 0.5, 1)).normalized()
    bmesh.ops.bisect_plane(hb, geom=geom, plane_co=Vector((0, 0.0, 0.0)), plane_no=n, clear_inner=True)
    hb.to_mesh(obj.data)
    hb.free()
    parts.append(obj)
    top = 0.16
    for i, x in enumerate((-0.09, -0.045, 0.0, 0.045, 0.09)):
        # Fringe strands sweeping over the forehead.
        z0 = face_z(0.085) - 0.004
        length = (0.03, 0.045, 0.04, 0.05, 0.028)[i]
        parts.append(hull(f"fringe{i}", [(x - 0.02, 0.1, z0 - 0.02), (x + 0.02, 0.1, z0 - 0.02),
                                         (x - 0.019, 0.075 - length * 0.3, z0 + 0.012),
                                         (x + 0.019, 0.075 - length * 0.2, z0 + 0.012),
                                         (x + 0.004, 0.066 - length * 0.25, z0 + 0.02),
                                         (x - 0.004, 0.068 - length * 0.3, z0 + 0.018)], M["hair"]))
    for side in (-1, 1):
        parts.append(hull(f"sideburn{side}", mirror([(0.128, 0.07, 0.0), (0.146, 0.06, -0.01), (0.142, -0.01, -0.01),
                                                     (0.13, -0.005, 0.02), (0.13, 0.06, 0.03), (0.146, 0.02, 0.02)], side),
                          M["hair"]))
    parts.append(hull("napelock", [(-0.075, -0.04, -0.126), (0.075, -0.04, -0.126), (-0.09, -0.098, -0.108),
                                   (0.09, -0.098, -0.108), (-0.05, -0.115, -0.09), (0.05, -0.115, -0.09),
                                   (-0.07, 0.0, -0.152), (0.07, 0.0, -0.152)], M["hair"]))
    parts.append(hull("quiff", [(-0.06, top - 0.01, -0.08), (0.06, top - 0.01, -0.08), (-0.075, top - 0.005, 0.07),
                                (0.075, top - 0.005, 0.07), (-0.05, top + 0.008, -0.02), (0.05, top + 0.008, -0.02),
                                (-0.04, top + 0.006, 0.06), (0.04, top + 0.006, 0.06)], M["hair_dark"]))
    return finish(parts, "WalkerHeadNear")


def build():
    kit.reset()
    M = palette()
    b, h = body(M), head(M)
    # Baked standing on the ground with the head on the shoulders, then put
    # back in their own frames (the occlusion is per corner, so it travels).
    b.location.z, h.location.z = 0.44, 0.94
    lp.bake_alone([[b, h]], distance=0.12, floor=0.6, samples=48)
    b.location.z, h.location.z = 0.0, 0.0
    return [b, h]


def preview(_=0):
    objs = build()
    objs[0].location.z += 0.44
    objs[1].location.z += 0.94
    return objs
