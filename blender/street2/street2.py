"""
The street and rooftop leftovers, modelled by script: the bus stop, the
rooftop equipment blocks and water tank, and the farmland's hedge, bale and
crop rows. Spike tooling, on top of `blender/kit.py` and `blender/props/lowpoly.py`.

Nodes (all in the app's frame, origin where the procedural model's is):

  BusStop   the shelter of `furnitureParts("stop")` in
            `components/city/models/props/streetFurniture.ts`, standing on the
            ground (< 220 triangles, one instanced draw for six stops).
  Block     the unit box `propBlockGeometry` stretches into an air-conditioning
            unit, a vent, a skylight or a mast (x, z in +-0.5, y 0..1; < 96).
  Tank      the water tank on legs, `propTankGeometry` (unit footprint; < 220).
  Hedge     a unit-long hedge along x (`hedgeGeometry`, <= 24).
  Bale      a round bale on its side (`baleGeometry`, <= 64).
  Row0..3   crop rows, unit long along x, 1 wide, 1 high (`rowGeometry`, <= 24).

The farmland nodes are stretched along x by 10-20 in the city: their
ambient occlusion is baked on a representative length and squeezed back to a
unit, so the shade sits where it does on the stretched thing.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "props"))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import B, box, finish, prism  # noqa: E402

METAL = "#6b6f6d"
PAINT = "#c9c3b4"
WOOD = "#9a7c58"


def palette():
    m = kit.material
    return {
        "post": m("post", METAL, "metal", 0.5),
        "canopy": m("canopy", PAINT, "metal", 0.6),
        "canopyDark": m("canopy", PAINT, "metal", 0.6, tone=0.72),
        "glass": m("glass", "#a8bcc4", "glass", 0.15),
        "frame": m("frame", "#4f5452", "metal", 0.5),
        "wood": m("wood", WOOD, "timber", 0.8),
        "board": m("board", "#37423f", "metal", 0.6),
        "paper": m("paper", "#d6cfb8", "metal", 0.9),
        "line": m("line", "#a9b4ab", "metal", 0.9),
        "sign": m("sign", "#68848b", "metal", 0.6),
        "roundel": m("roundel", "#e2c46a", "metal", 0.6),
    }


def frame(name, w, h, t, depth, pos, mat):
    """A rectangular frame `w` x `h` in the xy plane, `t` wide, `depth` deep
    (z), centred on `pos`: a front and a back face, the outer and inner walls."""
    bm = bmesh.new()
    hw, hh, d = w / 2, h / 2, depth / 2
    iw, ih = hw - t, hh - t
    layers = {}
    for tag, z in (("f", d), ("b", -d)):
        layers[tag + "o"] = [bm.verts.new(B((pos[0] + x, pos[1] + y, pos[2] + z))) for x, y in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
        layers[tag + "i"] = [bm.verts.new(B((pos[0] + x, pos[1] + y, pos[2] + z))) for x, y in ((-iw, -ih), (iw, -ih), (iw, ih), (-iw, ih))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((layers["fo"][i], layers["fo"][j], layers["fi"][j], layers["fi"][i]))
        bm.faces.new((layers["bo"][j], layers["bo"][i], layers["bi"][i], layers["bi"][j]))
        bm.faces.new((layers["bo"][i], layers["bo"][j], layers["fo"][j], layers["fo"][i]))
        bm.faces.new((layers["fi"][i], layers["fi"][j], layers["bi"][j], layers["bi"][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def quad2(name, w, h, pos, mat, rot=(0, 0, 0), gap=0.004):
    """A pane of glass seen from both sides: two quads a hair apart (the same
    quad twice would be welded into one)."""
    a = lp.panel(name, w, h, (pos[0], pos[1], pos[2] + gap / 2), mat, rot)
    b = lp.panel(name + "b", w, h, (pos[0], pos[1], pos[2] - gap / 2), mat, (rot[0], rot[1] + math.pi, rot[2]))
    return [a, b]


def bus_stop(M):
    """A shelter: two hexagonal posts, a canopy with a deep front lip and a
    fall to the back, a glazed back wall as a thin frame with two mullions and a
    kick rail, a slatted bench on two cast ends, a timetable case on the right
    post and a flag sign above it."""
    parts = []
    # Posts, standing in the ground: hexagons, open where nobody looks.
    parts.append(lp.tube("postL", (-1.1, 0, 0.02), (-1.1, 2.56, 0.02), 0.07, 0.07, M["post"], sides=6))
    parts.append(lp.tube("postR", (1.1, 0, 0.02), (1.1, 2.9, 0.02), 0.07, 0.07, M["post"], sides=6))
    # The canopy in side profile (z forward, y up): a top that falls to the
    # back, a flat soffit, and a lip at the front.
    canopy = [
        (0.52, 2.44), (0.52, 2.69), (-0.7, 2.61), (-0.7, 2.52), (0.42, 2.52), (0.42, 2.44),
    ]
    parts.append(prism("canopy", canopy, 2.7, M["canopy"], bev=0))
    # The route strip along the lip.
    parts.append(lp.panel("strip", 1.5, 0.15, (0, 2.565, 0.5215), M["sign"]))
    # The glazed back: a frame with two mullions and a rail; three panes.
    y0, y1, zb = 0.82, 2.52, -0.62
    h = y1 - y0
    cy = (y0 + y1) / 2
    parts.append(frame("wall", 2.5, h, 0.055, 0.07, (0, cy, zb), M["frame"]))
    for x in (-0.42, 0.42):
        parts.append(lp.tube("mull", (x, y0 + 0.055, zb), (x, y1 - 0.055, zb), 0.03 * math.sqrt(2), 0.03 * math.sqrt(2), M["frame"], sides=4, turn=math.pi / 4, squash=1.5))
    parts.append(box("rail", (2.39, 0.04, 0.06), (0, 1.12, zb), M["frame"], bev=0))
    for x0, x1 in ((-1.195, -0.44), (-0.4, 0.4), (0.44, 1.195)):
        parts += quad2("pane", x1 - x0, y1 - 0.055 - 1.14, ((x0 + x1) / 2, (1.14 + y1 - 0.055) / 2, zb), M["glass"])
    # Legs to the ground for the back wall, so it does not hang in the air.
    for x in (-1.225, 1.225):
        parts.append(lp.tube("leg", (x, 0, zb), (x, y0, zb), 0.045, 0.045, M["frame"], sides=4, turn=math.pi / 4))
    # The bench: a slab of slats on two cast ends.
    parts.append(box("seat", (1.4, 0.06, 0.4), (0, 0.5, -0.35), M["wood"], bev=0))
    for x in (-0.6, 0.6):
        parts.append(box("bench leg", (0.06, 0.47, 0.34), (x, 0.235, -0.35), M["post"], bev=0))
    # The timetable case on the right post, and the sign flag above it.
    parts.append(box("case", (0.62, 0.46, 0.07), (1.1, 2.1, 0.1), M["frame"], bev=0))
    parts.append(lp.panel("board", 0.54, 0.38, (1.1, 2.1, 0.1355), M["board"]))
    parts.append(lp.panel("head", 0.5, 0.07, (1.1, 2.26, 0.137), M["paper"]))
    for i in range(3):
        parts.append(lp.panel("line", 0.42 - i * 0.06, 0.018, (1.1 - 0.03 * i, 2.15 - i * 0.055, 0.137), M["line"]))
    parts.append(box("flag", (0.03, 0.34, 0.5), (1.1, 2.7, 0.3), M["sign"], bev=0))
    return finish(parts, "BusStop")


def facing_quad(name, pts, want, mat):
    """One quad from four app-frame points, wound so that it faces `want` (an
    app-frame direction): a louvre blade, a sign, a pane."""
    bm = bmesh.new()
    vs = [bm.verts.new(B(p)) for p in pts]
    face = bm.faces.new(vs)
    face.normal_update()
    if face.normal.dot(B(want)) < 0:
        face.normal_flip()
    return lp._obj(name, bm, mat)


def turned(p, yaw):
    """An app-frame point turned about the vertical axis."""
    c, s = math.cos(yaw), math.sin(yaw)
    return (p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c)


def block_palette():
    m = kit.material
    return {
        # Vertex colours here are multipliers on the roof prop's instance
        # colour, as in `propBlockGeometry`: near white, with dark louvres.
        "body": m("body", "#eaeaeb", "metal", 0.6),
        "lid": m("lid", "#f7f8f9", "metal", 0.5),
        "louvre": m("louvre", "#b9bcc3", "metal", 0.5),
        "slit": m("slit", "#5a5f66", "metal", 0.8),
        "well": m("well", "#8497a6", "glass", 0.3),
        "fan": m("fan", "#59616b", "metal", 0.6),
        "blade": m("blade", "#d3d6da", "metal", 0.5),
        "label": m("label", "#fff0c2", "metal", 0.7),
        "leg": m("leg", "#a6a9ad", "metal", 0.5),
        "tank": m("tank", "#dcdad4", "metal", 0.7),
        "tankTop": m("tankTop", "#b6b8bc", "metal", 0.6),
        "band": m("band", "#a6a9ad", "metal", 0.5),
        "hatch": m("hatch", "#a3a7ad", "metal", 0.5),
        "pipe": m("pipe", "#98999e", "metal", 0.5),
    }


def block(M):
    """The rooftop unit `propBlockGeometry` stretches into an air-conditioner,
    a vent, a skylight or a mast: a body with louvres on every side (a dark
    backing with four slanted blades in front of it), a stepped lid, and a fan
    well with a two-bladed grille on top, and a label on one face."""
    parts = []
    r = 0.465 * math.sqrt(2)
    parts.append(lp.tube("body", (0, 0, 0), (0, 0.86, 0), r, r, M["body"], sides=4, cap1=True, turn=math.pi / 4))
    parts.append(lp.tube("lid", (0, 0.86, 0), (0, 1.0, 0), r, 0.40 * math.sqrt(2), M["lid"], sides=4, cap1=True, turn=math.pi / 4))
    # Louvres on all four faces: a dark backing and four slanted blades, high
    # at the wall and low at their outer edge, so the sun catches their tops.
    for k in range(4):
        yaw = k * math.pi / 2
        wall = 0.4715
        parts.append(facing_quad(
            "slit", [turned((x, y, wall), yaw) for x, y in ((-0.34, 0.14), (0.34, 0.14), (0.34, 0.66), (-0.34, 0.66))],
            turned((0, 0, 1), yaw), M["slit"]))
        for i in range(4):
            y0 = 0.17 + i * 0.125
            pts = [(-0.34, y0 + 0.1, wall), (0.34, y0 + 0.1, wall), (0.34, y0 + 0.02, wall + 0.044), (-0.34, y0 + 0.02, wall + 0.044)]
            parts.append(facing_quad("blade", [turned(p, yaw) for p in pts], turned((0, 1, 1), yaw), M["blade"]))
    # The fan well on top: a low rim round a dark disc with two blades across.
    parts.append(lp.tube("rim", (0, 1.0, 0), (0, 1.03, 0), 0.3, 0.28, M["louvre"], sides=8, turn=math.pi / 8))
    ring = [(0.28 * math.cos(math.pi / 8 + i * math.pi / 4), 1.008, 0.28 * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]
    parts.append(facing_quad("well", ring, (0, 1, 0), M["well"]))
    for a in (0.0, math.pi / 2):
        pts = [((-0.255) * math.cos(a), 1.016, (-0.255) * math.sin(a) - 0.02), ((0.255) * math.cos(a), 1.016, (0.255) * math.sin(a) - 0.02),
               ((0.255) * math.cos(a), 1.016, (0.255) * math.sin(a) + 0.02), ((-0.255) * math.cos(a), 1.016, (-0.255) * math.sin(a) + 0.02)]
        parts.append(facing_quad("grille", pts, (0, 1, 0), M["fan"]))
    parts.append(lp.panel("label", 0.14, 0.07, (0.22, 0.79, 0.4715), M["label"]))
    return finish(parts, "Block")


def tank(M):
    """The water tank of `propTankGeometry`: a drum on four legs with an X of
    bracing on each side, two rolled hoops, a shallow dome lid with an
    inspection hatch, and the overflow pipe."""
    parts = []
    L = 0.27
    for x in (-L, L):
        for z in (-L, L):
            parts.append(lp.tube("leg", (x, 0, z), (x, 0.32, z), 0.06, 0.055, M["leg"], sides=4, cap1=False, turn=math.pi / 4))
    # Cross bracing between the legs, one X on each side, single quads seen from both sides.
    for k in range(4):
        yaw = k * math.pi / 2
        for flip in (-1, 1):
            a = (flip * 0.27, 0.05, 0.3)
            b = (-flip * 0.27, 0.27, 0.3)
            n = 0.012
            for off in (n, -n):
                pts = [turned((a[0] + off, a[1], a[2]), yaw), turned((b[0] + off, b[1], b[2]), yaw), turned((b[0] - off, b[1], b[2]), yaw), turned((a[0] - off, a[1], a[2]), yaw)]
                # skip: a single flat strut, both faces
                break
            parts.append(facing_quad("brace", pts, turned((0, 0, 1), yaw), M["leg"]))
            parts.append(facing_quad("braceb", pts, turned((0, 0, -1), yaw), M["leg"]))
    N = 10
    turn = math.pi / N
    parts.append(lp.tube("drum", (0, 0.3, 0), (0, 0.88, 0), 0.46, 0.46, M["tank"], sides=N, cap0=True, turn=turn))
    parts.append(lp.tube("dome", (0, 0.88, 0), (0, 0.94, 0), 0.46, 0.34, M["tankTop"], sides=N, cap1=True, turn=turn))
    for y in (0.44, 0.74):
        parts.append(lp.tube("hoop", (0, y - 0.02, 0), (0, y + 0.02, 0), 0.478, 0.478, M["band"], sides=N, turn=turn))
    parts.append(lp.tube("hatch", (-0.15, 0.94, 0.03), (-0.15, 0.965, 0.03), 0.105, 0.09, M["hatch"], sides=6, cap1=True))
    parts.append(lp.tube("pipe", (0.24, 0.9, 0.0), (0.24, 1.02, 0.0), 0.05, 0.05, M["pipe"], sides=5, cap1=True))
    return finish(parts, "Tank")


# ---------------------------------------------------------------------------
# Farmland. These are drawn in their thousands and stretched along x by the
# instance matrix: a hedge or a crop row is a unit long and authored at a
# representative length, its occlusion baked there, then squeezed to a unit so
# the shade sits across the section and not stretched along the run.
# ---------------------------------------------------------------------------


def lofted(name, xs, sections, mat, caps=True):
    """A run along app x through `sections`, one list of (z, y) points per
    station in `xs`, left base round to right base. Sides and end caps, no
    bottom: it stands on the ground."""
    bm = bmesh.new()
    rings = [[bm.verts.new(B((x, y, z))) for z, y in sec] for x, sec in zip(xs, sections)]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
        # the bottom, so the winding can be settled; removed below
        bm.faces.new((a[n - 1], a[0], b[0], b[n - 1]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bottom = [f for f in bm.faces if all(abs(v.co.z) < 1e-6 for v in f.verts)]
    bmesh.ops.delete(bm, geom=bottom, context="FACES")
    return lp._obj(name, bm, mat)


def squeeze(obj, factor):
    """Scale an object's mesh along app x (Blender x) about the origin."""
    obj.data.transform(Matrix.Diagonal((factor, 1, 1, 1)))


def farm_palette():
    m = kit.material
    return {
        # The instance colour is the crop's or hedge's own; these carry shade.
        "leaf": m("leaf", "#ffffff", "foliage", 0.95),
        "leafTop": m("leaf", "#ffffff", "foliage", 0.95, tone=1.0),
        "straw": m("straw", "#d9bd68", "thatch", 0.9),
        "strawEnd": m("straw", "#d9bd68", "thatch", 0.9, tone=0.76),
        "twine": m("twine", "#a48942", "thatch", 0.9),
    }


HEDGE_LEN = 8.0
HEDGE_W = 0.35
HEDGE_H = 1.05


def hedge(M):
    """A hedge run: a pitched-and-rounded section with a wandering ridge, three
    stations of different height so the top is lumpy along its length. Baked at
    eight units long, squeezed to a unit."""
    w, h = HEDGE_W, HEDGE_H
    #        left shoulder, right shoulder, ridge height, ridge offset
    stations = [(0.62, 0.68, 0.93, -0.12), (0.72, 0.6, 1.0, 0.14), (0.64, 0.7, 0.88, -0.05)]
    sections = []
    for ls, rs, rh, ro in stations:
        # Shoulders lean in a little: a trimmed mound, not a gabled wall.
        sections.append([(-w, 0.0), (-w * 0.9, ls * h), (ro * w, rh * h), (w * 0.9, rs * h), (w, 0.0)])
    xs = [-HEDGE_LEN / 2, 0.0, HEDGE_LEN / 2]
    return lofted("hedge.src", xs, sections, M["leaf"])


BALE_R = 0.55


def bale(M):
    """A round bale on its flat side, axis along z: ends dished in the middle
    and striped in two tones like a wound spiral, twine chamfers, the drum."""
    r = BALE_R
    sides = 8
    turn = math.pi / 8
    foot = r * math.cos(math.pi / 8)
    bm = bmesh.new()

    def ring(radius, z):
        return [
            bm.verts.new(B((math.cos(turn + 2 * math.pi * i / sides) * radius, foot + math.sin(turn + 2 * math.pi * i / sides) * radius, z)))
            for i in range(sides)
        ]

    end0 = bm.verts.new(B((0, foot, -0.425)))
    end1 = bm.verts.new(B((0, foot, 0.425)))
    a, b, c, d = ring(0.44, -0.45), ring(r, -0.34), ring(r, 0.34), ring(0.44, 0.45)
    for i in range(sides):
        j = (i + 1) % sides
        # 0 straw, 1 twine, 2 the darker straw of the spiral on the ends
        bm.faces.new((end0, a[j], a[i])).material_index = 2 if i % 2 else 0
        bm.faces.new((a[i], a[j], b[j], b[i])).material_index = 1
        bm.faces.new((b[i], b[j], c[j], c[i])).material_index = 0
        bm.faces.new((c[i], c[j], d[j], d[i])).material_index = 1
        bm.faces.new((end1, d[i], d[j])).material_index = 2 if i % 2 else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = lp._obj("bale.src", bm, M["straw"])
    obj.data.materials.append(M["twine"])
    obj.data.materials.append(M["strawEnd"])
    return obj


# (pitch, width, height) of `CROP_ROWS` in farmland.ts, and the section of each
# crop in unit coordinates (z across, y up) with the heights it varies between
# along the row.
ROW_SPEC = {
    0: dict(pitch=0.75, width=0.55, height=0.42,
            section=[(-0.5, 0.0), (-0.42, 0.6), (0.0, 1.0), (0.42, 0.6), (0.5, 0.0)], tops=[0.84, 1.0, 0.9]),
    1: dict(pitch=0.6, width=0.42, height=0.14,
            section=[(-0.5, 0.0), (0.0, 1.0), (0.5, 0.0)], tops=[0.82, 1.0, 0.76, 0.94, 0.86]),
    2: dict(pitch=0.95, width=0.5, height=0.3,
            section=[(-0.5, 0.0), (-0.3, 1.0), (0.0, 0.84), (0.3, 1.0), (0.5, 0.0)], tops=[0.8, 1.0, 0.88]),
    3: dict(pitch=2.3, width=0.7, height=0.16,
            section=[(-0.5, 0.0), (-0.3, 0.86), (0.0, 1.0), (0.3, 0.86), (0.5, 0.0)], tops=[0.88, 1.0, 0.84]),
}
ROW_LEN = 16.0


def crop_row(crop, name, dz=0.0):
    """A crop row at its real size (so its shade is right), `dz` along the
    field for the neighbours that shade it."""
    spec = ROW_SPEC[crop]
    k = len(spec["tops"])
    xs = [-ROW_LEN / 2 + ROW_LEN * i / (k - 1) for i in range(k)]
    sections = []
    for top in spec["tops"]:
        sections.append([(z * spec["width"] + dz, y * top * spec["height"]) for z, y in spec["section"]])
    return lofted(name, xs, sections, ROW_MAT["leaf"])


ROW_MAT = {}


def rows(F):
    ROW_MAT.update(F)
    out = []
    for crop, spec in ROW_SPEC.items():
        neighbours = [crop_row(crop, f"n{crop}{i}", dz) for i, dz in enumerate((-2 * spec["pitch"], -spec["pitch"], spec["pitch"], 2 * spec["pitch"]))]
        row = finish([crop_row(crop, f"row{crop}.src")], f"Row{crop}")
        # `finish` removed the joined sources; the neighbours stay to shade it.
        kit.bake_ao([row], distance=spec["height"] * 2.2 + 0.1, samples=96, floor=0.6)
        for n in neighbours:
            bpy.data.objects.remove(n, do_unlink=True)
        # Unit section: 1 wide, 1 high, 1 long.
        row.data.transform(Matrix.Diagonal((1 / ROW_LEN, 1 / spec["width"], 1 / spec["height"], 1)))
        out.append(row)
    return out


def build():
    kit.reset()
    M = palette()
    B_ = block_palette()
    F = farm_palette()
    objs = [bus_stop(M), block(B_), tank(B_)]
    lp.bake_alone(objs, distance=0.4, floor=0.55)
    return objs + farm(F)


def farm(F):
    """The farmland nodes, each baked alone."""
    h = hedge(F)
    b = bale(F)
    objs = [finish([h], "Hedge"), finish([b], "Bale")]
    lp.bake_alone(objs, distance=0.35, floor=0.6)
    squeeze(objs[0], 1 / HEDGE_LEN)
    return objs + rows(F)


FARM_NODES = {"Hedge", "Bale", "Row0", "Row1", "Row2", "Row3"}
SIZES = {"ac": (0.9, 0.5, 0.7), "vent": (0.4, 0.62, 0.4), "skylight": (1.0, 0.12, 0.7), "antenna": (0.09, 2.3, 0.09)}


def preview(arg=0):
    """0: the lot. 1: the block as the four roof kinds it stands in for."""
    objs = build()
    for o in objs:
        print("NODE", o.name, lp.tris(o))
    if arg == 2:
        # The farmland the way it is drawn: a hedge stretched to a run of eight.
        keep = [o for o in objs if o.name in FARM_NODES]
        for o in objs:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        for o in keep:
            if o.name == "Hedge":
                o.scale = (8, 1, 1)
            if o.name.startswith("Row"):
                o.scale = (8, 1, 1)
        return lp.row(keep, gap=0.6)
    if arg != 1:
        return lp.row(objs)
    block = [o for o in objs if o.name == "Block"][0]
    out = []
    for name, size in SIZES.items():
        copy = block.copy()
        copy.data = block.data
        bpy.context.scene.collection.objects.link(copy)
        copy.scale = (size[0], size[2], size[1])
        out.append(copy)
    bpy.data.objects.remove(block, do_unlink=True)
    return lp.row(out, gap=0.5)
