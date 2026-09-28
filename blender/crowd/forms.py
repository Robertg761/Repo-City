"""
The issue crowd's forms, modelled by script (spike: Blender assets vs
procedural). Up to fifteen hundred of these are instanced at once, so each
node spends no more triangles than its procedural form in
`components/city/backlog/forms.ts`, keeps inside its `CROWD_BASE_SIZE`
footprint, and puts its lamps where `formSpec` says they are (the halos and
the smoke still come from the procedural spec).

  Fire      a hollow skip you can see into, its burnt load and three
            twisting flame tongues rising out of it, on a scorch mark
  Van       a van with a raked bonnet and windscreen, cab windows, wheels,
            a livery band and a roof ladder, with the four optional parts
  Scaffold  a braced bay: standards, ledgers and a diagonal brace, two
            boarded lifts with toe boards, debris netting, and the four
            optional parts
  Collision, Wreck                        cars.py (the crowd car, crowdcar.py)
  Roadblock, Signpost, Survey, Pothole, Trench   streetforms.py
  Hoard...  the hoarding kit, laid out round each plot in forms.ts
            (hoarding.py)

Frame as forms.ts: x across the road, z along it, y = 0 the ground. Part
and paint slot ride in the material role (see crowdkit.py).
"""

import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cars  # noqa: E402
import hoarding  # noqa: E402
import streetforms as sf  # noqa: E402
import crowdkit as ck  # noqa: E402
import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B, box, finish, prism  # noqa: E402

SCAFFOLD = {"width": 4.4, "height": 7.0, "depth": 0.9}


def palette():
    m = kit.material
    return {
        **ck.mats(),
        "paintA": m("paintA", "#ffffff", "metal", 0.5),
        "scorch": m("scorch", "#2b2724", "concrete", 1.0),
        "burnt": m("burnt", "#4a433d", "concrete", 1.0),
        "lug": m("lug", "#3b3632", "metal", 0.6),
        "flameOuter": m("flameOuter", "#ff8a2a", "metal", 0.5, emission=0.0),
        "flameInner": m("flameInner", "#ffd35a", "metal", 0.5),
        "vanWhite": m("vanWhite", "#e9e6dc", "metal", 0.45),
        "glass": m("glass", "#3b4450", "glass", 0.2),
        "tyre": m("tyre", "#262729", "fabric", 0.9),
        "chassis": m("chassis", "#2f3134", "metal", 0.7),
        "steel": m("steel", "#9aa0a6", "metal", 0.5),
        "amber": m("amber", "#ffb347", "metal", 0.4),
        "plank": m("plank", "#c39a5f", "timber", 0.8),
        "netting": m("netting", "#6f9a6a", "fabric", 0.9),
    }


def disc(name, radius, sides, y, mat, x=0.0, z=0.0, turn=0.0):
    """A flat n-gon on the ground, facing up."""
    bm = bmesh.new()
    vs = [bm.verts.new(B((x + math.cos(turn + 2 * math.pi * i / sides) * radius, y,
                          z + math.sin(turn + 2 * math.pi * i / sides) * radius))) for i in range(sides)]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    return lp._obj(name, bm, mat)


def sleeve(name, w, d, y0, y1, mat, z=0.0):
    """Four outside walls round a `w` x `d` rectangle, no top or bottom: a
    band proud of a body (8 triangles)."""
    bm = bmesh.new()
    corners = [(-w / 2, z - d / 2), (w / 2, z - d / 2), (w / 2, z + d / 2), (-w / 2, z + d / 2)]
    lo = [bm.verts.new(B((cx, y0, cz))) for cx, cz in corners]
    hi = [bm.verts.new(B((cx, y1, cz))) for cx, cz in corners]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.dot(c - B((0, 0, z))) < 0:
            f.normal_flip()
    return lp._obj(name, bm, mat)


def mound(name, hx, hz, y_edge, y_peak, mat):
    """A 3 x 3 grid heaped in the middle, facing up: a bin's burnt load
    (8 triangles)."""
    bm = bmesh.new()
    grid = {}
    for i in (-1, 0, 1):
        for k in (-1, 0, 1):
            y = y_peak if (i, k) == (0, 0) else y_edge + (0.05 if i == 0 or k == 0 else 0)
            grid[i, k] = bm.verts.new(B((i * hx + 0.04 * k, y, k * hz - 0.03 * i)))
    for i in (-1, 0):
        for k in (-1, 0):
            f = bm.faces.new((grid[i, k], grid[i + 1, k], grid[i + 1, k + 1], grid[i, k + 1]))
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
    return lp._obj(name, bm, mat)


def frustum_shell(name, lo, hi, y0, y1, mat, inner_mat=None, wall=0.05, bottom_in=None):
    """An open-topped tapered bin: outside walls, a rim and inside walls down
    to a floor at `bottom_in`. `lo` and `hi` are (half x, half z) at the
    bottom and the top."""
    bm = bmesh.new()

    def ring(hx, hz, y):
        return [bm.verts.new(B((sx * hx, y, sz * hz))) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

    ob, ot = ring(*lo, y0), ring(*hi, y1)
    it = ring(hi[0] - wall, hi[1] - wall, y1)
    ib = ring(lo[0] - wall, lo[1] - wall, bottom_in if bottom_in is not None else y0 + wall)
    faces = []
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new((ob[i], ob[j], ot[j], ot[i])))
        faces.append(bm.faces.new((ot[i], ot[j], it[j], it[i])))
        faces.append(bm.faces.new((it[i], it[j], ib[j], ib[i])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def flame(name, x, z, y0, height, radius, mat, twist=0.6, lean=(0.0, 0.0)):
    """A tongue of flame: a four-sided base ring, a wider ring a third of the
    way up turned against it, and a tip that leans. 12 triangles, no base."""
    bm = bmesh.new()
    base = [bm.verts.new(B((x + math.cos(a) * radius * 0.7, y0, z + math.sin(a) * radius * 0.7)))
            for a in (i * math.pi / 2 for i in range(4))]
    mid = [bm.verts.new(B((x + lean[0] * 0.3 + math.cos(a) * radius, y0 + height * 0.35,
                           z + lean[1] * 0.3 + math.sin(a) * radius)))
           for a in (twist + i * math.pi / 2 for i in range(4))]
    tip = bm.verts.new(B((x + lean[0], y0 + height, z + lean[1])))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((base[i], base[j], mid[j]))
        bm.faces.new((base[i], mid[j], mid[i]))
        bm.faces.new((mid[i], mid[j], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def fire(M):
    """A skip on fire (procedural: 96 triangles, 60 body and 36 flame)."""
    # The skip, painted: sloped ends and sides like the procedural one, but
    # open, so from above you look into the burning load.
    skip = frustum_shell("skip", (0.4, 0.47), (0.51, 0.62), 0.03, 0.66, M["paintA"], bottom_in=0.4)
    load = mound("load", 0.44, 0.55, 0.42, 0.58, M["burnt"])
    parts = [
        disc("scorch", 0.68, 8, 0.02, M["scorch"], turn=0.3),
        skip,
        load,
        # Lifting lugs on the ends.
        lp.tube("lugL", (-0.48, 0.44, 0), (-0.6, 0.44, 0), 0.07, 0.07, M["lug"], sides=3, cap1=True),
        lp.tube("lugR", (0.48, 0.44, 0), (0.6, 0.44, 0), 0.07, 0.07, M["lug"], sides=3, cap1=True),
        flame("flameA", 0.0, -0.08, 0.5, 1.42, 0.36, M["flameOuter"], twist=0.5, lean=(0.06, -0.05)),
        flame("flameB", 0.16, 0.22, 0.5, 1.0, 0.24, M["flameInner"], twist=0.2, lean=(-0.05, 0.08)),
        flame("flameC", -0.22, 0.3, 0.5, 0.86, 0.22, M["flameOuter"], twist=0.9, lean=(-0.08, 0.02)),
    ]
    return finish(parts, "Fire")


def van(M):
    """A utility van (procedural: 192 triangles)."""
    W = 1.2
    profile = [(-1.25, 0.2), (1.47, 0.2), (1.47, 0.52), (1.38, 0.66), (1.05, 0.86), (0.7, 1.36), (0.55, 1.4),
               (-1.25, 1.4)]
    parts = [
        prism("body", profile, W, M["vanWhite"], bev=0),
        # Windscreen on the rake, cab windows either side.
        lp.panel("screen", W * 0.84, 0.54, (0, 1.11 + 0.57 * 0.006, 0.875 + 0.82 * 0.006), M["glass"],
                 rot=(-math.atan2(0.35, 0.5), 0, 0)),
        lp.panel("winL", 0.44, 0.34, (-W / 2 - 0.004, 1.12, 0.62), M["glass"], rot=(0, -math.pi / 2, 0)),
        lp.panel("winR", 0.44, 0.34, (W / 2 + 0.004, 1.12, 0.62), M["glass"], rot=(0, math.pi / 2, 0)),
        # Wheels, an axle block each, a touch wider than the body.
        lp.tube("axleF", (-0.66, 0.2, 0.95), (0.66, 0.2, 0.95), 0.2, 0.2, M["tyre"], sides=4, turn=math.pi / 4),
        lp.tube("axleR", (-0.66, 0.2, -0.78), (0.66, 0.2, -0.78), 0.2, 0.2, M["tyre"], sides=4, turn=math.pi / 4),
        # A dark skirt round the sills, and the livery band (paint slot 1).
        sleeve("skirt", W + 0.02, 2.74, 0.06, 0.22, M["chassis"], z=0.11),
        sleeve("band", W + 0.02, 2.74, 0.3, 0.42, M["paintA"], z=0.11),
        # The roof ladder.
        lp.tube("railL", (-0.3, 1.45, -1.15), (-0.3, 1.45, 0.75), 0.03, 0.03, M["steel"], sides=4),
        lp.tube("railR", (0.3, 1.45, -1.15), (0.3, 1.45, 0.75), 0.03, 0.03, M["steel"], sides=4),
        # The light bar (always on, amber), where formSpec's lamp is.
        box("amber", (0.34, 0.13, 0.15), (0, 1.45, 0.62), M["amber"], bev=0),
        # The optional parts, where the procedural van has them.
        *ck.worker(M, 0.3, -1.37),
        *ck.beacon(M, (0, 1.5, -1.05)),
        *ck.board(M, 0.63, -0.7, 0.0, 0.93),
        *ck.flag(M, -0.5, 0.6, 1.4, 2.2),
    ]
    return finish(parts, "Van")


def scaffold(M):
    """A braced bay of scaffolding (procedural: 192 triangles)."""
    w, h, d = SCAFFOLD["width"], SCAFFOLD["height"], SCAFFOLD["depth"]
    half = w / 2 - 0.05
    front = d / 2 - 0.06
    back = -d / 2 + 0.1
    lift1, lift2 = h * 0.36, h * 0.7
    steel = M["steel"]

    def tube(name, a, b, r=0.045):
        return lp.tube(name, a, b, r, r, steel, sides=4, turn=math.pi / 4)

    parts = [
        *[tube(f"std{i}", (x, 0, z), (x, h, z)) for i, (x, z) in
          enumerate(((-half, front), (half, front), (-half, back), (half, back)))],
        # Guard rails a metre over each lift, and the ledgers under the boards.
        tube("rail1", (-half, lift1 + 0.9, front), (half, lift1 + 0.9, front), 0.04),
        tube("rail2", (-half, lift2 + 0.9, front), (half, lift2 + 0.9, front), 0.04),
        tube("ledger1", (-half, lift1 - 0.08, front), (half, lift1 - 0.08, front), 0.04),
        tube("ledger0", (-half, 0.35, front), (half, 0.35, front), 0.04),
        # The face brace, corner to corner of the bottom lift.
        tube("brace", (-half, 0.35, front + 0.05), (half, lift1 - 0.08, front + 0.05), 0.04),
        # Boarded lifts, with a toe board along the front of each.
        box("deck1", (w - 0.1, 0.08, d - 0.2), (0, lift1, 0), M["plank"], bev=0),
        box("deck2", (w - 0.1, 0.08, d - 0.2), (0, lift2, 0), M["plank"], bev=0),
        lp.panel("toe1", w - 0.1, 0.18, (0, lift1 + 0.13, (d - 0.2) / 2 + 0.005), M["plank"]),
        lp.panel("toe2", w - 0.1, 0.18, (0, lift2 + 0.13, (d - 0.2) / 2 + 0.005), M["plank"]),
        # Debris netting over the top lift, seen from both sides.
        lp.panel("net", w - 0.2, h - lift2 - 0.15, (0, (h + lift2) / 2, front + 0.03), M["netting"]),
        lp.panel("netIn", w - 0.2, h - lift2 - 0.15, (0, (h + lift2) / 2, front + 0.025), M["netting"],
                 rot=(0, math.pi, 0)),
        *ck.worker(M, half * 0.35, 0, y0=lift1 + 0.04),
        *ck.beacon(M, (half - 0.12, h + 0.12, front - 0.1)),
        box("board", (0.62, 0.62, 0.04), (-half * 0.5, lift1 * 0.55, front + 0.03), M["board"], bev=0),
        *ck.flag(M, -half, front, h - 0.5, h + 1.1),
    ]
    return finish(parts, "Scaffold")


def build():
    kit.reset()
    M = palette()
    M.update(cars.palette())
    M.update(sf.palette())
    forms = [fire(M), van(M), scaffold(M), cars.collision(M), cars.wreck(M), sf.roadblock(M), sf.signpost(M),
             sf.survey(M), sf.pothole(M), sf.trench(M)]
    M.update(hoarding.palette())
    kit_pieces = hoarding.build(M)
    lp.bake_alone(forms + kit_pieces, distance=0.4, floor=0.55)
    for obj in forms + kit_pieces:
        ck.unshade_glow(obj)
    return forms + kit_pieces


def preview(_=0):
    return lp.row(build())
