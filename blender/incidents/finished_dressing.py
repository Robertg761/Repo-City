"""
What stands round a merged pull request's finished house, modelled by script
(spike: Blender assets vs procedural): the dressing `finishedHouse.ts` builds
for a village and a town, in the finished plot's frame (x across, +z the
front, y = 0 the ground), at the same places -- `FINISHED` below mirrors the
TypeScript spec. The house itself is the settlement's archetype and is not
modelled here.

  VillageDressing  gravel path, a white picket fence with its gate open,
                   bunting from the eaves to the gate post, the agent's
                   board, a sapling on a stake, balloons at the gate
  TownDressing     new paving, a banner down the front, a ribbon across the
                   doors on two stanchions, planters with young trees,
                   bunting on poles, balloons either side of the ribbon

Colours are the procedural ones; the site shades them with the city.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit  # noqa: E402
from incident_props import face_prism  # noqa: E402
from kit import B, box, cyl, finish, strut  # noqa: E402

FINISHED = {
    "village": dict(plot=7, height=4.2, footprint=(4.6, 3.7), setBack=0.9),
    "town": dict(plot=9, height=7.6, footprint=(6.4, 5.0), setBack=1.1),
}
BUNTING = ["#d8423a", "#f0c23b", "#3f7fc4", "#4aa05a", "#f4f1e8"]
BALLOONS = ["#e04a5a", "#f0c23b", "#4a8fd8"]


def palette():
    m = kit.material
    M = {
        "white": m("white", "#f4f1e8", "metal", 0.55),
        "gravel": m("gravel", "#d9cdb2", "concrete", 0.95),
        "stone": m("stone", "#c4b89c", "concrete", 0.9),
        "cord": m("cord", "#e9e4d6", "fabric", 0.8),
        "post": m("post", "#8a7a66", "timber", 0.8),
        "red": m("red", "#d23b33", "fabric", 0.6),
        "bow": m("bow", "#e0574c", "fabric", 0.6),
        "trunk": m("trunk", "#7a5a40", "timber", 0.85),
        "stake": m("stake", "#b59a6f", "timber", 0.8),
        "leaf": m("leaf", "#7fa46a", "foliage", 0.8),
        "string": m("string", "#d8d3c6", "fabric", 0.8),
        "paving": m("paving", "#e6e0d2", "concrete", 0.9),
        "joint": m("joint", "#c9c2b2", "concrete", 0.9),
        "planter": m("planter", "#8f8b80", "concrete", 0.85),
        "soil": m("soil", "#4a3b2e", "fabric", 0.95),
        "steel": m("steel", "#9aa0a6", "metal", 0.4, 0.4),
        "dark": m("dark", "#3a3d42", "metal", 0.6),
    }
    for i, hex_ in enumerate(BUNTING):
        M[f"flag{i}"] = m(f"flag{i}", hex_, "fabric", 0.6)
    for i, hex_ in enumerate(BALLOONS):
        M[f"balloon{i}"] = m(f"balloon{i}", hex_, "glass", 0.3)
    return M


def blob(name, radius, pos, mat, scale=(1, 1, 1), subdivisions=1):
    """An icosphere (a balloon, a clump of leaves), scaled in the app frame."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    sx, sy, sz = scale
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=B(pos), verts=bm.verts)
    return kit._object(name, bm, mat)


def pennant(name, knot, along, mat, drop=0.3, half=0.13, thick=0.012):
    """A triangle hanging from `knot` in the vertical plane of the cord, its
    top a hair over the cord so the cord threads it."""
    ax, az = along
    top = 0.03
    left = (knot[0] - ax * half, knot[1] + top, knot[2] - az * half)
    right = (knot[0] + ax * half, knot[1] + top, knot[2] + az * half)
    tip = (knot[0], knot[1] - drop + top, knot[2])
    nx, nz = -az, ax  # across the cord, horizontal
    bm = bmesh.new()
    verts = [bm.verts.new(B((p[0] - nx * thick / 2, p[1], p[2] - nz * thick / 2))) for p in (left, right, tip)]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=B((nx * thick, 0, nz * thick)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._object(name, bm, mat)


def bunting(M, a, b, count, sag):
    """The procedural bunting's curve: a cord sagging `sag` at its middle,
    in straight runs between knots, a pennant at every inner knot."""
    at = lambda t: (  # noqa: E731
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
        a[2] + (b[2] - a[2]) * t,
    )
    run = math.hypot(b[0] - a[0], b[2] - a[2])
    along = ((b[0] - a[0]) / run, (b[2] - a[2]) / run)
    parts = []
    for i in range(1, count):
        parts.append(strut("cord", at((i - 1) / (count - 1)), at(i / (count - 1)), (0.025, 0.025), M["cord"]))
    for i in range(1, count - 1):
        parts.append(pennant("flag", at(i / (count - 1)), along, M[f"flag{i % len(BUNTING)}"]))
    return parts


def balloons(M, x, z, top, tie_y):
    spots = [(x - 0.24, top, z - 0.08), (x + 0.28, top + 0.18, z + 0.065), (x + 0.02, top + 0.34, z - 0.14)]
    parts = []
    for i, p in enumerate(spots):
        parts.append(blob("balloon", 0.2, p, M[f"balloon{i}"], scale=(1, 1.2, 1), subdivisions=2))
        parts.append(cyl("knot", 0.035, 0.05, (p[0], p[1] - 0.25, p[2]), M[f"balloon{i}"], axis="y", verts=6, radius2=0.01))
        parts.append(strut("string", (x, tie_y, z), (p[0], p[1] - 0.26, p[2]), (0.012, 0.012), M["string"]))
    return parts


def sapling(M, x, z, lift=0.0):
    return [
        cyl("trunk", 0.07, 1.2, (x, lift + 0.6, z), M["trunk"], axis="y", verts=6, radius2=0.05),
        box("stake", (0.05, 1.1, 0.05), (x + 0.14, lift + 0.55, z), M["stake"], bev=0.0),
        box("tie", (0.18, 0.03, 0.03), (x + 0.07, lift + 0.8, z), M["dark"], bev=0.0),
        blob("leaves", 0.46, (x, lift + 1.45, z), M["leaf"]),
        blob("leaves", 0.3, (x + 0.28, lift + 1.3, z + 0.1), M["leaf"]),
        blob("leaves", 0.28, (x - 0.22, lift + 1.62, z - 0.12), M["leaf"]),
    ]


def picket(M, x, z, h=0.72):
    """A pointed picket: a pentagon pushed through its thickness."""
    w = 0.08
    pts = [(x - w / 2, 0.0), (x + w / 2, 0.0), (x + w / 2, h - 0.06), (x, h), (x - w / 2, h - 0.06)]
    return face_prism("picket", pts, z, 0.04, M["white"])


def village(M):
    spec = FINISHED["village"]
    half = spec["plot"] / 2
    fw, fd = spec["footprint"]
    front = -spec["setBack"] + fd / 2
    edge = half - 0.25
    parts = []
    # The gravel path from the door to the gate, flagstones set in it.
    parts.append(box("path", (0.9, 0.04, edge - front), (0.55, 0.02, (edge + front) / 2), M["gravel"], bev=0.0))
    z = front + 0.35
    while z < edge - 0.2:
        parts.append(box("flag", (0.44, 0.03, 0.3), (0.55 + (0.12 if int(z * 3) % 2 else -0.1), 0.045, z), M["stone"], bev=0.01))
        z += 0.46
    # The picket fence: rails on the procedural fence's line, pickets on
    # them, a post at each procedural post.
    for x0, x1 in ((-half + 0.25, -0.2), (1.2, half - 0.25)):
        for y in (0.3, 0.55):
            parts.append(box("rail", (x1 - x0, 0.06, 0.04), ((x0 + x1) / 2, y, edge - 0.03), M["white"], bev=0.0))
        n = int((x1 - x0) / 0.19)
        for i in range(n + 1):
            parts.append(picket(M, x0 + (x1 - x0) * i / n, edge, 0.72))
    for x in (-half + 0.3, -1.6, -0.1, 1.15, half - 0.3):
        parts.append(box("post", (0.1, 0.8, 0.1), (x, 0.4, edge - 0.05), M["white"], bev=0.015))
    # The gate posts, the tall one carrying the bunting, and the gate swung
    # open into the garden.
    parts.append(box("gatePost", (0.12, 1.9, 0.12), (0.02, 0.95, edge), M["white"], bev=0.02))
    parts.append(cyl("gateCap", 0.08, 0.06, (0.02, 1.93, edge), M["white"], axis="y", verts=8))
    parts.append(box("gatePostR", (0.12, 0.9, 0.12), (1.08, 0.45, edge), M["white"], bev=0.02))
    hinge = (1.02, edge - 0.02)
    swing = math.radians(70)
    for i in range(5):
        d = 0.1 + i * 0.19
        px, pz = hinge[0] - math.cos(swing) * d, hinge[1] - math.sin(swing) * d
        parts.append(box("gatePicket", (0.07, 0.66, 0.035), (px, 0.4, pz), M["white"], bev=0.0, rot=(0, swing, 0)))
    for y in (0.3, 0.55):
        mx, mz = hinge[0] - math.cos(swing) * 0.48, hinge[1] - math.sin(swing) * 0.48
        parts.append(box("gateRail", (0.95, 0.05, 0.04), (mx, y, mz - 0.03), M["white"], bev=0.0, rot=(0, swing, 0)))
    # Bunting from the eaves' front corners down to the gate post.
    eave = spec["height"] * 0.6
    parts += bunting(M, (-fw / 2 + 0.3, eave, front + 0.1), (0.02, 1.85, edge), 7, 0.25)
    parts += bunting(M, (fw / 2 - 0.2, eave, front + 0.1), (0.02, 1.85, edge), 7, 0.25)
    # The agent's board, "sold" across it.
    bx, bz = -half + 0.7, edge - 0.45
    parts.append(box("boardPost", (0.1, 1.5, 0.1), (bx, 0.75, bz), M["post"], bev=0.015))
    parts.append(box("board", (0.9, 0.62, 0.06), (bx, 1.35, bz + 0.05), M["white"], bev=0.015))
    parts.append(box("boardEdge", (0.94, 0.05, 0.07), (bx, 1.02, bz + 0.05), M["post"], bev=0.0))
    parts.append(box("sold", (0.94, 0.18, 0.08), (bx, 1.35, bz + 0.05), M["red"], bev=0.0, rot=(0, 0, 0.35)))
    parts += sapling(M, half - 1.0, edge - 1.1)
    parts += balloons(M, 1.08, edge, 1.6, 0.9)
    return parts


def town(M):
    spec = FINISHED["town"]
    half = spec["plot"] / 2
    fw, fd = spec["footprint"]
    height = spec["height"]
    front = -spec["setBack"] + fd / 2
    edge = half - 0.3
    parts = []
    # New paving, laid in slabs, with a kerb along its front.
    depth = edge - front + 0.2
    mid = (edge + front) / 2
    parts.append(box("paving", (fw + 0.4, 0.05, depth), (0, 0.025, mid), M["paving"], bev=0.0, cell=1.2))
    for i in range(1, 6):
        z = mid - depth / 2 + depth * i / 6
        parts.append(box("joint", (fw + 0.38, 0.012, 0.03), (0, 0.052, z), M["joint"], bev=0.0))
    for i in range(1, 7):
        x = -(fw + 0.4) / 2 + (fw + 0.4) * i / 7
        parts.append(box("joint", (0.03, 0.012, depth - 0.02), (x, 0.052, mid), M["joint"], bev=0.0))
    parts.append(box("kerb", (fw + 0.44, 0.1, 0.14), (0, 0.05, mid + depth / 2 - 0.07), M["planter"], bev=0.02))
    # The banner down the front on its rods, a white band across it.
    bx, by, bz = fw / 2 - 0.7, height * 0.62, front + 0.06
    parts.append(box("banner", (0.7, 2.4, 0.04), (bx, by, bz), M["red"], bev=0.0))
    parts.append(box("band", (0.72, 0.2, 0.06), (bx, by + 0.5, bz), M["white"], bev=0.0))
    for y in (by + 1.22, by - 1.22):
        parts.append(cyl("rod", 0.03, 0.84, (bx, y, bz + 0.02), M["steel"], verts=6))
    # The ribbon across the doors on two stanchions, and its bow.
    rz = front + 1.2
    for x in (-1.2, 1.2):
        parts.append(cyl("stanchionBase", 0.16, 0.05, (x, 0.08, rz), M["steel"], axis="y", verts=10))
        parts.append(cyl("stanchion", 0.04, 1.1, (x, 0.6, rz), M["steel"], axis="y", verts=8))
        parts.append(blob("stanchionTop", 0.07, (x, 1.17, rz), M["steel"]))
    parts.append(box("ribbon", (2.4, 0.14, 0.02), (0, 1.02, rz), M["red"], bev=0.0))
    for s in (-1, 1):
        parts.append(face_prism("loop", [(-0.25, 1.02), (-0.25 + s * 0.26, 1.16), (-0.25 + s * 0.26, 0.9)], rz + 0.03, 0.03, M["bow"]))
        parts.append(face_prism("tail", [(-0.27, 1.0), (-0.23, 1.0), (-0.25 + s * 0.12, 0.68), (-0.25 + s * 0.18, 0.72)], rz + 0.03, 0.02, M["bow"]))
    parts.append(box("knot", (0.08, 0.1, 0.06), (-0.25, 1.02, rz + 0.03), M["bow"], bev=0.0))
    # Planters with a young tree in each.
    for s in (-1, 1):
        px, pz = s * (fw / 2 - 0.25), edge - 0.6
        parts.append(box("planter", (0.8, 0.5, 0.8), (px, 0.25, pz), M["planter"], bev=0.03))
        parts.append(box("soil", (0.66, 0.04, 0.66), (px, 0.49, pz), M["soil"], bev=0.0))
        parts += sapling(M, px, pz, lift=0.45)
    # Bunting from the first-floor corners out to two poles, and across.
    pole = 3.4
    for s in (-1, 1):
        parts.append(cyl("pole", 0.05, pole, (s * (half - 0.4), pole / 2, edge), M["white"], axis="y", verts=8))
        parts.append(blob("poleTop", 0.08, (s * (half - 0.4), pole + 0.04, edge), M["flag1"]))
        parts += bunting(M, (s * (fw / 2 - 0.1), height * 0.36, front + 0.08), (s * (half - 0.4), pole - 0.1, edge), 7, 0.3)
    parts += bunting(M, (-(half - 0.4), pole - 0.1, edge), (half - 0.4, pole - 0.1, edge), 11, 0.45)
    parts += balloons(M, -1.2, rz, 1.7, 1.02)
    parts += balloons(M, 1.2, rz, 1.7, 1.02)
    return parts


def build():
    kit.reset()
    M = palette()
    objs = [finish(village(M), "VillageDressing"), finish(town(M), "TownDressing")]
    for obj in objs:
        obj.location = (0, 0, 0)
    # Baked side by side, far enough apart not to shade each other.
    objs[0].location.x = -6
    objs[1].location.x = 6
    kit.bake_ao(objs, floor=0.55)
    for obj in objs:
        obj.location = (0, 0, 0)
    return objs


def preview(n):
    """0: the village's dressing; 1: the town's."""
    import bpy

    objs = build()
    bpy.data.objects.remove(objs[1 - n], do_unlink=True)
    return [objs[n]]
