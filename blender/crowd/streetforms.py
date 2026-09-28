"""
The crowd's small street forms (`roadblock`, `signpost`, `survey`,
`pothole`, `trench` in forms.ts), modelled by script. Spike tooling.

Each spends no more triangles than its procedural form and stays inside its
`CROWD_BASE_SIZE` footprint; the amber lamp, the beacon and the optional
parts stand where the procedural forms have them, so `formSpec` still holds.
Nothing goes below the ground (the crowd stands on the road): a hole is a
dark floor at road level inside a raised broken lip, a trench a dark cut
between shored sides and a berm.
"""

import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import crowdkit as ck  # noqa: E402
import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B, box, finish, prism  # noqa: E402


def palette():
    m = kit.material
    return {
        "barrierRed": m("barrierRed", "#c8493d", "metal", 0.5),
        "barrierWhite": m("barrierWhite", "#f2efe6", "metal", 0.5),
        "trestle": m("trestle", "#50544f", "metal", 0.6),
        "coneOrange": m("coneOrange", "#e8853d", "metal", 0.6),
        "coneBand": m("coneBand", "#f2efe7", "metal", 0.6),
        "housing": m("housing", "#2f3336", "metal", 0.6),
        "signPost": m("signPost", "#6b6f6b", "metal", 0.5),
        "signBlue": m("signBlue", "#3f74b5", "metal", 0.5),
        "signWhite": m("signWhite", "#eeeae0", "metal", 0.5),
        "tripod": m("tripod", "#c9a24a", "timber", 0.7),
        "instrument": m("instrument", "#e2c46a", "metal", 0.5),
        "lens": m("lens", "#2f3330", "glass", 0.3),
        "peg": m("peg", "#b59a6f", "timber", 0.8),
        "tape": m("tape", "#ff6f91", "fabric", 0.8),
        "staffRed": m("staffRed", "#d8392e", "metal", 0.5),
        "hole": m("hole", "#2f302c", "concrete", 1.0),
        "asphalt": m("asphalt", "#6a6860", "concrete", 1.0),
        "rubble": m("rubble", "#4a4740", "concrete", 1.0),
        "weed": m("weed", "#88a46a", "foliage", 0.9),
        "earth": m("earth", "#6e5540", "concrete", 1.0),
        "shoring": m("shoring", "#9c7a4e", "timber", 0.8),
        "rail": m("rail", "#cfcabd", "concrete", 0.7),
    }


def ring(r, n, turn=0.0, jitter=None):
    out = []
    for i in range(n):
        a = turn + i * 2 * math.pi / n
        k = 1.0 + (jitter[i % len(jitter)] if jitter else 0.0)
        out.append((math.cos(a) * r * k, math.sin(a) * r * k, 0))
    return out


def traffic_cone(name, x, z, h, r, M, sides=5):
    """A traffic cone in three bands, orange, white, orange: no base, 25
    triangles at five sides. The white band is what makes it a cone."""
    bm = bmesh.new()
    levels = [(0.0, r), (0.42 * h, r * 0.62), (0.62 * h, r * 0.44)]
    rings = [[bm.verts.new(B((x + math.cos(a) * rr, y, z + math.sin(a) * rr)))
              for a in (i * 2 * math.pi / sides for i in range(sides))] for y, rr in levels]
    tip = bm.verts.new(B((x, h, z)))
    mats = []
    for band in range(2):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((rings[band][i], rings[band][j], rings[band + 1][j], rings[band + 1][i]))
            mats.append(band)
    for i in range(sides):
        bm.faces.new((rings[2][i], rings[2][(i + 1) % sides], tip))
        mats.append(0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        c = f.calc_center_median()
        out = c - B((x, c.z, z))
        out.z = 0.3
        if f.normal.dot(out) < 0:
            f.normal_flip()
    for f, k in zip(bm.faces, mats):
        f.material_index = k
    obj = lp._obj(name, bm, None)
    obj.data.materials.append(M["coneOrange"])
    obj.data.materials.append(M["coneBand"])
    return obj


def striped_board(name, length, height, thick, y, M, stripes=6, slant=0.12):
    """A barrier board with diagonal red and white stripes on both faces:
    one quad a stripe a face, a top and two ends, 30 triangles at six."""
    bm = bmesh.new()
    x0 = -length / 2
    step = length / stripes
    faces = []
    for face_z, facing in ((thick / 2, 1), (-thick / 2, -1)):
        lo = [bm.verts.new(B((x0 + i * step, y - height / 2, face_z))) for i in range(stripes + 1)]
        hi = [bm.verts.new(B((min(length / 2, max(x0, x0 + i * step + slant * facing)), y + height / 2, face_z)))
              for i in range(stripes + 1)]
        for i in range(stripes):
            f = bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
            faces.append((f, i % 2, (0, 0, facing)))
    # Top and ends, white.
    corners = {}
    for sx in (-1, 1):
        for sz in (-1, 1):
            for sy in (-1, 1):
                corners[sx, sy, sz] = bm.verts.new(B((sx * length / 2, y + sy * height / 2, sz * thick / 2)))
    c = corners
    faces.append((bm.faces.new((c[-1, 1, -1], c[1, 1, -1], c[1, 1, 1], c[-1, 1, 1])), 1, (0, 1, 0)))
    for sx in (-1, 1):
        faces.append((bm.faces.new((c[sx, -1, -1], c[sx, 1, -1], c[sx, 1, 1], c[sx, -1, 1])), 1, (sx, 0, 0)))
    for f, k, out in faces:
        f.material_index = k
        f.normal_update()
        if f.normal.dot(B(out)) < 0:
            f.normal_flip()
    obj = lp._obj(name, bm, None)
    obj.data.materials.append(M["barrierRed"])
    obj.data.materials.append(M["barrierWhite"])
    return obj


def roadblock(M):
    """A barrier across the way (procedural: 108): a striped board on two
    A-frame trestles, a blinker in its housing on the right-hand trestle and
    two banded cones in front. (`housing` is unused: a hood cost more than
    the budget had.)"""
    parts = [striped_board("board", 1.86, 0.3, 0.06, 0.78, M)]
    for x in (-0.82, 0.82):
        for z in (-0.28, 0.28):
            parts.append(lp.tube("leg", (x, 0, z), (x, 1.08, z * 0.1), 0.04, 0.03, M["trestle"], sides=3))
    # The blinker on the apex of the right-hand trestle.
    parts += [
        ck_amber(M, (0.82, 1.17, 0)),
        traffic_cone("coneL", -0.4, 0.22, 0.5, 0.16, M, sides=4),
        traffic_cone("coneR", 0.4, 0.22, 0.5, 0.16, M, sides=4),
    ]
    return finish(parts, "Roadblock")


def ck_amber(M, pos):
    """The amber blinker, 12 triangles, as the procedural one."""
    return kit.box("amber", (0.18, 0.18, 0.16), pos, M["amber"], bev=0)


def ck_lidless(name, size, pos, mat):
    """A box with no underside, 10 triangles."""
    obj = box(name, size, pos, mat, bev=0)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def arrow(name, length, height, thick, pos, facing, mat):
    """A finger board pointing along +z (facing 1) or -z: a pointed
    profile pushed across `thick`, 16 triangles."""
    L, h = length, height
    tip = 0.14
    prof = [(-L / 2, -h / 2), (L / 2 - tip, -h / 2), (L / 2, 0.0), (L / 2 - tip, h / 2), (-L / 2, h / 2)]
    prof = [(pos[2] + z * facing, pos[1] + y) for z, y in prof]
    return prism(name, prof, thick, mat, x=pos[0], bev=0)


def signpost(M):
    """A finger post (procedural: 84): a post on a collar with a cap, two
    pointed finger boards, and an information board in a frame."""
    parts = [
        lp.tube("collar", (0, 0, 0), (0, 0.16, 0), 0.1, 0.09, M["signPost"], sides=6, cap1=True),
        lp.tube("post", (0, 0.16, 0), (0, 2.26, 0), 0.06, 0.055, M["signPost"], sides=6),
        lp.cone("cap", ring(0.08, 6), 2.26, 2.38, M["signPost"], under="open"),
        arrow("fingerA", 0.64, 0.2, 0.06, (0.07, 2.06, 0.07), 1, M["signBlue"]),
        arrow("fingerB", 0.64, 0.2, 0.06, (-0.07, 1.76, -0.07), -1, M["signBlue"]),
        box("frame", (0.08, 0.84, 0.56), (0, 0.92, 0), M["signBlue"], bev=0),
        lp.panel("faceA", 0.44, 0.68, (0.041, 0.92, 0), M["signWhite"], rot=(0, math.pi / 2, 0)),
        lp.panel("faceB", 0.44, 0.68, (-0.041, 0.92, 0), M["signWhite"], rot=(0, -math.pi / 2, 0)),
    ]
    return finish(parts, "Signpost")


def survey(M):
    """A surveyor's set-up (procedural: 142): a tripod on three splayed legs
    under a head plate, the instrument with its eyepiece, a striped staff
    stood by it, pegs with flagging tape, and grass up round a peg once it
    has been left long enough."""
    parts = []
    for i in range(3):
        a = i * 2 * math.pi / 3
        foot = (math.sin(a) * 0.42, 0.015, math.cos(a) * 0.42)
        parts.append(lp.tube(f"leg{i}", foot, (math.sin(a) * 0.07, 0.9, math.cos(a) * 0.07), 0.028, 0.035,
                             M["tripod"], sides=4))
    parts += [
        lp.tube("head", (0, 0.88, 0), (0, 0.93, 0), 0.12, 0.12, M["tripod"], sides=6, cap1=True),
        box("body", (0.2, 0.2, 0.26), (0, 1.03, 0), M["instrument"], bev=0),
        lp.tube("scope", (0, 1.07, 0.1), (0, 1.07, 0.26), 0.045, 0.04, M["lens"], sides=4, cap1=True,
                turn=math.pi / 4),
    ]
    # The levelling staff, red and white, stood on its foot.
    for k in range(4):
        parts.append(lp.tube(f"staff{k}", (0.45, k * 0.27, -0.3), (0.45, (k + 1) * 0.27, -0.3), 0.035, 0.035,
                             M["staffRed"] if k % 2 == 0 else M["barrierWhite"], sides=3, cap1=k == 3))
    for i, (x, z) in enumerate(((-0.44, 0.44), (0.36, 0.46), (0.0, -0.5))):
        parts.append(lp.tube(f"peg{i}", (x, 0, z), (x, 0.46, z), 0.04, 0.035, M["peg"], sides=3, cap1=True))
        parts.append(lp.panel(f"tapeA{i}", 0.18, 0.06, (x + 0.12, 0.42, z + 0.002), M["tape"]))
        parts.append(lp.panel(f"tapeB{i}", 0.18, 0.06, (x + 0.12, 0.42, z - 0.002), M["tape"], rot=(0, math.pi, 0)))
    parts.append(lp.cone("weedA", ring(0.16, 5, 0.4), 0.0, 0.42, M["weed"], centre=(-0.36, 0.36), under="open"))
    return finish(parts, "Survey")


def pothole(M):
    """A hole in the road (procedural: 104): a dark floor inside a broken,
    raised lip of asphalt, chunks thrown out beside it, two banded cones,
    and grass round the rim once it has been left."""
    jag = [0.0, 0.12, -0.06, 0.1, -0.1, 0.05, 0.14, -0.04]
    bm = bmesh.new()
    inner = [bm.verts.new(B((x, 0.075, z + 0.1))) for x, z, _ in ring(0.46, 8, 0.2, jag)]
    outer = [bm.verts.new(B((x, 0.02, z + 0.1))) for x, z, _ in ring(0.68, 8, 0.2, [j * 0.6 for j in jag])]
    floor = [bm.verts.new(B((x, 0.03, z + 0.1))) for x, z, _ in ring(0.4, 8, 0.2, jag)]
    lip, walls = [], []
    for i in range(8):
        j = (i + 1) % 8
        lip.append(bm.faces.new((outer[i], outer[j], inner[j], inner[i])))
        walls.append(bm.faces.new((inner[i], inner[j], floor[j], floor[i])))
    bottom = bm.faces.new(floor)
    for f in lip + [bottom]:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    for f in walls:
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.dot(B((0, 0, 0.1)) - c + kit.Vector((0, 0, c.z))) < 0:
            f.normal_flip()
        f.material_index = 1
    bottom.material_index = 1
    rim = lp._obj("rim", bm, None)
    rim.data.materials.append(M["asphalt"])
    rim.data.materials.append(M["hole"])
    parts = [
        rim,
        lp.cone("chunkA", ring(0.2, 4, 0.3, [0.1, -0.2, 0.15, 0]), 0.0, 0.14, M["rubble"], centre=(0.4, -0.55), under="open"),
        lp.cone("chunkB", ring(0.14, 4, 1.1, [0, 0.2, -0.1, 0.1]), 0.0, 0.1, M["rubble"], centre=(0.55, -0.22), under="open"),
        traffic_cone("coneA", -0.5, 0.62, 0.46, 0.16, M, sides=4),
        traffic_cone("coneB", 0.5, 0.68, 0.46, 0.16, M, sides=4),
        lp.cone("weedA", ring(0.2, 5, 0.1), 0.0, 0.52, M["weed"], centre=(-0.52, -0.3), under="open"),
        lp.cone("weedB", ring(0.17, 5, 0.6), 0.0, 0.44, M["weed"], centre=(0.46, 0.2), under="open"),
    ]
    return finish(parts, "Pothole")


def trench(M):
    """A trench in the road (procedural: 212): a dark cut between shored
    timber sides with struts across it, a berm of earth round it, a shaped
    spoil heap at one end, a barrier rail either side, and the four
    optional parts where the procedural trench has them."""
    parts = [
        # The earth apron, and the dark cut in it.
        lp.panel("apron", 1.3, 2.9, (0, 0.012, 0), M["earth"], rot=(-math.pi / 2, 0, 0)),
        lp.panel("cut", 0.72, 2.42, (0, 0.022, 0.1), M["hole"], rot=(-math.pi / 2, 0, 0)),
    ]
    # Shoring: a plank wall down each long side and across each end, their
    # faces towards the cut, and walings along the top edge.
    for s in (-1, 1):
        parts.append(lp.panel(f"shore{s}", 2.42, 0.16, (s * 0.36, 0.1, 0.1), M["shoring"], rot=(0, -s * math.pi / 2, 0)))
        parts.append(ck_lidless(f"wale{s}", (0.08, 0.08, 2.5), (s * 0.4, 0.14, 0.1), M["shoring"]))
    for e in (-1, 1):
        parts.append(lp.panel(f"end{e}", 0.72, 0.16, (0, 0.1, 0.1 + e * 1.21), M["shoring"],
                              rot=(0, 0 if e < 0 else math.pi, 0)))
    parts += [
        lp.tube(f"strut{k}", (-0.36, 0.12, z), (0.36, 0.12, z), 0.025, 0.025, M["shoring"], sides=4)
        for k, z in enumerate((-0.4, 0.6))
    ]
    spoil = lp.blobs("spoil", [((0.08, 0.12, -1.16), 0.4, (1.35, 0.55, 0.5)),
                                ((-0.25, 0.08, -1.12), 0.26, (1.2, 0.5, 0.7))], M["earth"], wobble=0.12,
                     seed=4.0, decimate=26)
    parts.append(spoil)
    for x in (-0.72, 0.72):
        colour = M["coneOrange"] if x > 0 else M["barrierWhite"]
        parts.append(box(f"rail{x}", (0.08, 0.18, 2.8), (x, 0.62, 0), colour, bev=0))
        for z in (-1.3, 1.3):
            parts.append(lp.tube("post", (x, 0, z), (x, 0.54, z), 0.045, 0.045, M["rail"], sides=3))
    M2 = M
    parts += [
        *ck.worker(M2, 0.0, 0.35),
        # A hair smaller than the procedural lamp, so it stays inside the footprint.
        *ck.beacon(M2, (0.72, 0.8, 1.3), size=0.2),
        *ck.board(M2, -0.72, 1.1, 0.0, 1.12),
        *ck.flag(M2, -0.72, -1.3, 0.0, 1.8),
    ]
    out = finish(parts, "Trench")
    # The spoil heap is balls; flatten what would sink under the road.
    for v in out.data.vertices:
        if v.co.z < 0.0:
            v.co.z = 0.0
    return out
