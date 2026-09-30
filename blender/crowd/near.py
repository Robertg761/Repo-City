"""
The crowd's near (detailed) forms, modelled by script: the level of detail
`LodInstances` draws in place of `forms.py`'s lean forms for the few crowd
objects nearest a street-level camera (`Backlog.tsx`).

    blender -b --python blender/export.py -- blender/crowd/near.py crowd-near

Same frame, footprint, outline, colour roles, paint slots, lamp points and
optional parts as the lean forms (see `forms.py`, `crowdkit.py`): only the
detail is new. New roles follow `crowdkit.py`'s prefixes (`workerBoots` is
part of the worker, `flagHem` of the flag), and every role keeps a colour of
its own, which `forms.ts` reads a part's role back by. Every node is
`<Form>Near`:

  FireNear        a ribbed skip with a rolled rim, chevrons and lifting eyes,
                  a burning load of planks, a tyre and bags, seven flames
  CollisionNear   two finely lofted cars (door lines, mirrors, lamps, plates,
                  wheels with rims), crumpled, with glass and debris
  WreckNear       an abandoned car sunk on its bare hub, crazed screen,
                  rusted bonnet, hanging bumper, weeds, a cone on the roof
  PotholeNear     a layered hole (asphalt, base course, floor with a puddle),
                  cracks, thrown rubble, a spray-painted ring, cones, planks
  RoadblockNear   a two-rail striped barrier on braced trestles with sandbags,
                  an amber lamp in a hooded housing, cones with reflective sleeves
  SurveyNear      a tripod with its tribrach and total station, a graduated
                  staff, pegs with tape, a mallet, a tape measure
  SignpostNear    a bolted finger post with lettered boards and a framed map
  VanNear         a rounded van with grille, lamps, arches, door lines, a
                  laddered roof rack and light bar, and the optional parts
  ScaffoldNear    a coupled tube scaffold with boarded lifts, ladders, ties,
                  netting, a brick stack and tools, and the optional parts
  TrenchNear      a shored trench with props, pipe and ladder, a striped
                  barrier on footed posts, sandbags, spoil and a shovel
  Hoard...Near    the hoarding kit's pieces (sheet, band, post, gate, notice,
                  ground and the optional parts), laid out round the plot in
                  `hoardingKit`

Budget: at most 3,000 triangles a form (a hoarding's, at its largest plot:
fifteen sheets, four bands and posts, a gate, a notice, the optional parts).

Debug aids: NEAR_DEBUG=1 prints each part's triangles (bevels included) as a
node is finished; NEAR_XMAX=<x> lists the parts reaching past |x|.
"""

import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fleet"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cars  # noqa: E402
import carkit  # noqa: E402
import crowdcar as cc  # noqa: E402
import crowdkit as ck  # noqa: E402
import forms  # noqa: E402
import hoarding  # noqa: E402
import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
import nearkit as fleet_near  # noqa: E402
import nearparts as nk  # noqa: E402
import streetforms as sf  # noqa: E402
from kit import B, box, cyl, prism  # noqa: E402
from nearparts import blob, bolt, cone, lathe, slab, torus, tuft  # noqa: E402


def palette():
    m = kit.material
    M = {**forms.palette(), **cars.palette(), **sf.palette(), **hoarding.palette(), **nk.palette()}
    M.update({
        "sandbag": m("sandbag", "#b7a984", "fabric", 0.95),
        "sandbagDark": m("sandbag", "#b7a984", "fabric", 0.95, tone=0.8),
        "gravel": m("gravel", "#8b867a", "concrete", 1.0),
        "puddle": m("puddle", "#46535c", "glass", 0.15),
        "spray": m("spray", "#ecdfa0", "concrete", 0.9),
        "chevron": m("chevron", "#dcb02b", "fabric", 0.7),
        "chevronDark": m("chevronDark", "#2c2d2e", "fabric", 0.7),
        "timberNew": m("timberNew", "#b98f57", "timber", 0.8),
        "timberOld": m("timberOld", "#8a6a43", "timber", 0.9),
        "ash": m("ash", "#5b544d", "concrete", 1.0),
        "charred": m("charred", "#2a2522", "timber", 1.0),
        "letter": m("letter", "#f4f1e8", "metal", 0.5),
        "signBlueDark": m("signBlueDark", "#2f5d94", "metal", 0.5),
        "mapGreen": m("mapGreen", "#7fa06c", "metal", 0.6),
        "mapRoad": m("mapRoad", "#d8d3c2", "metal", 0.6),
        "surveyRed": m("surveyRed", "#c8352b", "metal", 0.5),
        "instrumentDark": m("instrumentDark", "#3a3d3f", "metal", 0.5),
        "screen": m("screen", "#56705f", "glass", 0.2),
        "mallet": m("mallet", "#9a7448", "timber", 0.85),
        "tapeCase": m("tapeCase", "#d6a628", "metal", 0.5),
        "rustDark": m("rustDark", "#5e3f2c", "metal", 0.9),
        "glassShard": m("glassShard", "#b8ccd2", "glass", 0.2),
        "skidMark": m("skidMark", "#2c2a27", "concrete", 1.0),
        "plate": m("plate", "#d9d5c0", "metal", 0.6),
        "plateInk": m("plateInk", "#26282a", "metal", 0.6),
        "lampWhite": m("lampWhite", "#ece8d8", "glass", 0.2),
        "lampRed": m("lampRed", "#a8352d", "glass", 0.2),
        "indicator": m("indicator", "#d98f34", "glass", 0.3),
        "mesh": m("mesh", "#6f767a", "metal", 0.5),
        "brick": m("brick", "#a4664d", "concrete", 0.9),
        "hoistDark": m("hoistDark", "#4a4d50", "metal", 0.6),
        "ladder": m("ladder", "#b3b7ba", "metal", 0.4),
    })
    return M


def finish(parts, node):
    parts = [p for p in parts if p is not None]
    if os.environ.get("NEAR_DEBUG"):
        by = {}
        import bpy

        dg = bpy.context.evaluated_depsgraph_get()
        for p in parts:
            key = p.name.rstrip("0123456789.")
            mesh = p.evaluated_get(dg).to_mesh()
            by[key] = by.get(key, 0) + sum(len(q.vertices) - 2 for q in mesh.polygons)
            p.evaluated_get(dg).to_mesh_clear()
        print("BREAKDOWN", node, sorted(by.items(), key=lambda kv: -kv[1])[:70])
    if os.environ.get("NEAR_XMAX"):
        limit = float(os.environ["NEAR_XMAX"])
        for p in parts:
            xs = [abs(v.co.x) for v in p.data.vertices]
            if xs and max(xs) > limit:
                print("OVER", node, p.name, round(max(xs), 3))
    return kit.finish(parts, node)


def poly_disc(name, points, y, mat, cx=0.0, cz=0.0):
    """A flat polygon lying on the ground, facing up."""
    bm = bmesh.new()
    vs = [bm.verts.new(B((cx + px, y, cz + py))) for px, py, _ in points]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    return lp._obj(name, bm, mat)


def rot_box(name, size, pos, mat, yaw=0.0, pitch=0.0, roll=0.0, bev=0.01):
    """A bevelled box turned about its own centre (app-frame Euler, radians)."""
    return box(name, size, pos, mat, bev=bev, rot=(pitch, yaw, roll))


def lumps(name, spots, mat, u=7, v=4, seed=0.0, y=0.0):
    """A handful of faceted rubble lumps: (x, z, size) each, resting on the
    ground, or on whatever is at height `y`."""
    parts = []
    for i, (x, z, s) in enumerate(spots):
        squash = 0.45 + 0.25 * ((i * 0.7 + seed) % 1.0)
        parts.append(blob(f"{name}{i}", (x, y + s * squash, z), (s, s * squash, s * (0.8 + 0.3 * ((i * 0.37) % 1.0))), mat,
                          u=u, v=v, turn=seed + i))
    return parts


# ---------------------------------------------------------------------------
# Fire
# ---------------------------------------------------------------------------


def flame(name, x, z, y0, height, radius, mat, twist=0.6, lean=(0.0, 0.0), sides=6):
    """A tongue of flame: a ring at the foot, three swelling rings that turn
    against one another as they rise, and a tip that leans (about 60
    triangles). Same reach as forms.flame."""
    bm = bmesh.new()
    levels = [(0.0, 0.62, 0.0), (0.16, 1.0, 0.35), (0.42, 0.86, 0.8), (0.7, 0.5, 1.2), (0.88, 0.22, 1.5)]
    rings = []
    for t, k, turn in levels:
        cx = x + lean[0] * t * t * 1.2
        cz = z + lean[1] * t * t * 1.2
        rings.append([bm.verts.new(B((cx + math.cos(twist * turn + 2 * math.pi * i / sides) * radius * k, y0 + height * t,
                                       cz + math.sin(twist * turn + 2 * math.pi * i / sides) * radius * k))) for i in range(sides)])
    tip = bm.verts.new(B((x + lean[0], y0 + height, z + lean[1])))
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for i in range(sides):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % sides], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lp._obj(name, bm, mat)


def fire(M):
    """A skip on fire."""
    paint = M["paintA"]
    lo, hi = (0.4, 0.47), (0.51, 0.62)
    parts = [
        forms.frustum_shell("skip", lo, hi, 0.03, 0.66, paint, bottom_in=0.4),
        forms.mound("load", 0.44, 0.55, 0.42, 0.58, M["burnt"]),
        poly_disc("scorch", nk.ring_of(0.68, 14, 0.3, [0, 0.05, -0.04, 0.06, -0.03]), 0.02, M["scorch"]),
        poly_disc("ash", nk.ring_of(0.55, 10, 0.9, [0.04, -0.06, 0.02]), 0.024, M["ash"]),
    ]

    def wall(t, sx, sz):
        """A point on the outside of the skip's wall at height fraction t."""
        y = 0.03 + 0.63 * t
        return (sx * (lo[0] + (hi[0] - lo[0]) * t), y, sz * (lo[1] + (hi[1] - lo[1]) * t))

    # Rolled rim: a bevelled bar along each edge of the top.
    rim = 0.05
    for sz in (-1, 1):
        parts.append(slab("rimZ", (hi[0] * 2 + 0.06, rim, 0.07), (0, 0.665, sz * (hi[1] + 0.02)), paint, bev=0.016, seg=2))
    for sx in (-1, 1):
        parts.append(slab("rimX", (0.07, rim, hi[1] * 2 - 0.05), (sx * (hi[0] + 0.02), 0.665, 0), paint, bev=0.016, seg=2))
    # Ribs pressed up the outside of the walls.
    for sz in (-1, 1):
        for x in (-0.36, -0.18, 0.0, 0.18, 0.36):
            a = (x * 1.06, 0.09, sz * (lo[1] + 0.028))
            b = (x * (1 + 0.1), 0.6, sz * (lo[1] + (hi[1] - lo[1]) * 0.9 + 0.028))
            parts.append(kit.strut("rib", a, b, (0.035, 0.03), paint, bev=0.006))
    for sx in (-1, 1):
        for z in (-0.28, 0.0, 0.28):
            a = (sx * (lo[0] + 0.028), 0.09, z * 0.95)
            b = (sx * (lo[0] + (hi[0] - lo[0]) * 0.9 + 0.028), 0.6, z)
            parts.append(kit.strut("ribE", a, b, (0.03, 0.035), paint, bev=0.006))
    # Hazard chevrons along the sides: alternating yellow and black.
    for sz in (-1, 1):
        for k in range(7):
            x0 = -0.44 + k * 0.147
            mat = M["chevron"] if k % 2 == 0 else M["chevronDark"]
            zface = sz * (lo[1] + (hi[1] - lo[1]) * 0.78 + 0.036)
            parts.append(slab("chev", (0.1, 0.11, 0.008), (x0 * 1.0, 0.47, zface), mat, bev=0, rot=(0, 0, 0.0)))
    # Lifting eyes and their brackets on the ends, and skids under the floor.
    for sx in (-1, 1):
        parts.append(torus("eye", (sx * (hi[0] - 0.01 + 0.09), 0.5, 0), 0.055, 0.016, M["lug"], axis="x", major=10, minor=5))
        parts.append(slab("eyePlate", (0.02, 0.09, 0.13), (sx * (lo[0] + (hi[0] - lo[0]) * 0.75 + 0.035), 0.5, 0), M["lug"], bev=0.006))
    for x in (-0.3, 0.3):
        parts.append(slab("skid", (0.09, 0.03, 1.1), (x, 0.015, 0.0), M["lug"], bev=0.008))
    # Bolts round the rim, one at every rib head.
    for sz in (-1, 1):
        for x in (-0.36, -0.18, 0.0, 0.18, 0.36):
            parts.append(bolt("rivet", (x, 0.69, sz * (hi[1] + 0.02)), "y", 0.016, 0.01, M["bolt"], sides=6))
    # The burning load: charred planks, a tyre, bags and lumps stacked in the bin.
    for i, (x, z, yaw, pitch) in enumerate(((-0.18, 0.1, 0.4, 0.15), (0.12, -0.22, -0.5, -0.2), (0.22, 0.24, 1.2, 0.1), (-0.25, -0.3, 2.0, 0.25))):
        parts.append(rot_box(f"plank{i}", (0.09, 0.03, 0.55), (x, 0.54 + i * 0.012, z), M["charred"], yaw=yaw, pitch=pitch, bev=0.005))
    parts.append(torus("tyre", (0.0, 0.5, 0.05), 0.17, 0.06, M["rubber"], axis="y", major=12, minor=6))
    parts += lumps("ember", [(-0.3, 0.05, 0.1), (0.3, -0.02, 0.09), (0.05, -0.34, 0.11), (0.08, 0.34, 0.1)], M["burnt"], seed=1.0, y=0.5)
    parts += lumps("coal", [(-0.05, 0.02, 0.08), (0.2, 0.15, 0.07)], M["charred"], seed=2.0, y=0.5)
    for i, (x, z, s) in enumerate(((-0.28, 0.32, 0.09), (0.3, -0.3, 0.08))):
        parts.append(blob(f"bag{i}", (x, 0.5, z), (s * 1.6, s * 0.7, s), M["burnt"], u=8, v=4, turn=i))
    # Flames: seven tongues, the two larger ones as tall as the lean form's.
    parts += [
        flame("flameA", 0.0, -0.08, 0.5, 1.42, 0.36, M["flameOuter"], twist=0.5, lean=(0.06, -0.05)),
        flame("flameB", 0.16, 0.22, 0.5, 1.0, 0.24, M["flameInner"], twist=0.2, lean=(-0.05, 0.08)),
        flame("flameC", -0.22, 0.3, 0.5, 0.86, 0.22, M["flameOuter"], twist=0.9, lean=(-0.08, 0.02)),
        flame("flameD", -0.2, -0.22, 0.5, 0.72, 0.17, M["flameInner"], twist=0.4, lean=(0.05, 0.04)),
        flame("flameE", 0.26, -0.18, 0.5, 0.6, 0.16, M["flameOuter"], twist=1.1, lean=(-0.03, 0.05)),
        flame("flameF", 0.0, 0.05, 0.5, 1.1, 0.16, M["flameInner"], twist=0.7, lean=(0.03, 0.02)),
        flame("flameG", 0.04, 0.4, 0.5, 0.5, 0.13, M["flameOuter"], twist=0.3, lean=(0.0, 0.06)),
    ]
    # Sparks lifting off the top of the fire: small four-sided diamonds.
    for i, (x, y, z, r) in enumerate(((0.18, 1.62, -0.12, 0.035), (-0.16, 1.5, 0.12, 0.03), (0.05, 1.82, 0.08, 0.028),
                                      (-0.22, 1.28, -0.1, 0.03), (0.28, 1.35, 0.2, 0.026), (0.0, 1.7, -0.24, 0.024))):
        parts.append(lathe(f"spark{i}", [(y - r * 1.6, 0.0), (y, r), (y + r * 1.6, 0.0)], M["flameInner"], base=(x, 0, z), sides=4))
    return finish(parts, "FireNear")


# ---------------------------------------------------------------------------
# Roadblock
# ---------------------------------------------------------------------------


def rail(name, length, height, thick, y, M, stripes=9, slant=0.1):
    return sf.striped_board(name, length, height, thick, y, M, stripes=stripes, slant=slant)


def sandbag(name, x, y, z, yaw, M, size=(0.36, 0.11, 0.2)):
    """A sandbag: a slumped pillow with tied corners (about 70 triangles)."""
    sx, sy, sz = size
    parts = [blob(name, (x, y + sy / 2, z), (sx / 2, sy / 2, sz / 2), M["sandbag"], u=8, v=5, turn=yaw)]
    c, s = math.cos(yaw), math.sin(yaw)
    for k in (-1, 1):
        parts.append(blob(name + "Tie", (x + k * sx * 0.46 * c, y + sy * 0.4, z - k * sx * 0.46 * s), (0.035, 0.03, 0.035), M["sandbagDark"], u=5, v=3))
    return parts


def roadblock(M):
    parts = []
    # Two striped rails, as the board's height (0.63 to 0.93) in two courses.
    parts.append(rail("railTop", 1.86, 0.14, 0.06, 0.86, M))
    parts.append(rail("railLow", 1.86, 0.14, 0.06, 0.70, M))
    for sx in (-1, 1):
        parts.append(slab("cap", (0.05, 0.3, 0.09), (sx * 0.955, 0.78, 0), M["housing"], bev=0.014, seg=2))
    for x in (-0.82, 0.82):
        # An A-frame: two raked legs each side of the rails, the rails' clamps,
        # a hinge pin at the apex, a stretcher and two foot bars.
        for z in (-0.28, 0.28):
            parts.append(lp.tube("leg", (x, 0.02, z), (x, 1.08, z * 0.1), 0.042, 0.032, M["trestle"], sides=8))
            parts.append(slab("foot", (0.09, 0.04, 0.14), (x, 0.02, z * 1.12), M["trestle"], bev=0.012))
            parts.append(bolt("clamp", (x + 0.035, 0.78, z * 0.32), "x", 0.02, 0.018, M["bolt"], sides=6))
        parts.append(cyl("hinge", 0.035, 0.16, (x, 1.06, 0.0), M["trestle"], axis="x", verts=10, bev=0.004))
        parts.append(kit.strut("stretch", (x, 0.3, -0.2), (x, 0.3, 0.2), (0.03, 0.03), M["trestle"], bev=0.004))
        parts.append(slab("clampPlate", (0.03, 0.34, 0.07), (x - 0.04, 0.78, 0.0), M["trestle"], bev=0.008))
        parts.append(slab("plateBack", (0.03, 0.34, 0.07), (x + 0.04, 0.78, 0.0), M["trestle"], bev=0.008))
    # Sandbags weighting the trestles' feet.
    for x in (-0.82, 0.82):
        for k, z in enumerate((-0.2, 0.2)):
            parts += sandbag(f"bag{x}{k}", x + (0.0), 0.04, z * 1.1, 1.57, M, size=(0.3, 0.1, 0.19))
        parts += sandbag(f"bagTop{x}", x, 0.14, 0.0, 1.57, M, size=(0.3, 0.09, 0.17))
    # The amber blinker on the right-hand apex: hooded housing and lens.
    x = 0.82
    parts += [
        slab("bhouse", (0.17, 0.05, 0.16), (x, 1.115, 0), M["housing"], bev=0.01),
        lathe("lens", [(1.14, 0.075), (1.17, 0.083), (1.21, 0.07), (1.245, 0.03)], M["amber"], base=(x, 0, 0), sides=12, cap_top=True),
        lathe("lensRing", [(1.14, 0.09), (1.16, 0.09)], M["housing"], base=(x, 0, 0), sides=12),
        slab("hood", (0.17, 0.014, 0.08), (x, 1.245, 0.055), M["housing"], bev=0.004),
        slab("hoodL", (0.012, 0.09, 0.08), (x - 0.078, 1.2, 0.055), M["housing"], bev=0.003),
        slab("hoodR", (0.012, 0.09, 0.08), (x + 0.078, 1.2, 0.055), M["housing"], bev=0.003),
    ]
    for sx in (-1, 1):
        parts.append(bolt("lampBolt", (x + sx * 0.07, 1.14, -0.065), "y", 0.012, 0.012, M["bolt"], sides=5))
    parts += cone("coneL", -0.4, 0.22, 0.5, 0.16, M)
    parts += cone("coneR", 0.4, 0.22, 0.5, 0.16, M)
    # A reflective sticker on each rail's face, and a warning plate.
    for z in (-0.032, 0.032):
        parts.append(slab("sticker", (0.28, 0.08, 0.005), (-0.45, 0.78, z), M["chevron"], bev=0))
    return finish(parts, "RoadblockNear")


# ---------------------------------------------------------------------------
# Pothole
# ---------------------------------------------------------------------------


def pothole(M):
    jag = [0.0, 0.12, -0.06, 0.1, -0.1, 0.05, 0.14, -0.04]
    n = 16
    cz = 0.1

    def ringpts(r, jit, turn=0.2):
        return [(x, z + cz) for x, z, _ in nk.ring_of(r, n, turn, [jit[(i // 2) % len(jit)] * (1 if i % 2 == 0 else 0.6) for i in range(n)])]

    def build_ring(bm, pts, y):
        return [bm.verts.new(B((x, y, z))) for x, z in pts]

    bm = bmesh.new()
    outer = build_ring(bm, ringpts(0.66, [j * 0.4 for j in jag]), 0.018)
    lip = build_ring(bm, ringpts(0.54, [j * 0.6 for j in jag]), 0.05)
    edge = build_ring(bm, ringpts(0.47, jag), 0.076)
    step_o = build_ring(bm, ringpts(0.44, jag), 0.05)  # asphalt layer's face
    step_i = build_ring(bm, ringpts(0.4, jag), 0.05)  # base course shelf
    shelf = build_ring(bm, ringpts(0.36, jag), 0.038)
    floor = build_ring(bm, ringpts(0.31, jag), 0.03)
    faces_lip, faces_wall, faces_base = [], [], []
    for i in range(n):
        j = (i + 1) % n
        faces_lip.append(bm.faces.new((outer[i], outer[j], lip[j], lip[i])))
        faces_lip.append(bm.faces.new((lip[i], lip[j], edge[j], edge[i])))
        faces_wall.append(bm.faces.new((edge[i], edge[j], step_o[j], step_o[i])))
        faces_base.append(bm.faces.new((step_o[i], step_o[j], step_i[j], step_i[i])))
        faces_base.append(bm.faces.new((step_i[i], step_i[j], shelf[j], shelf[i])))
        faces_base.append(bm.faces.new((shelf[i], shelf[j], floor[j], floor[i])))
    bottom = bm.faces.new(floor)
    up = B((0, 1, 0))
    for f in faces_lip + faces_base + [bottom]:
        f.normal_update()
        if f.normal.dot(up) < 0:
            f.normal_flip()
    centre = B((0, 0, cz))
    for f in faces_wall:
        f.normal_update()
        c = f.calc_center_median()
        # The wall faces in, towards the hole's axis.
        if f.normal.dot(Vector((centre.x - c.x, centre.y - c.y, 0.0))) < 0:
            f.normal_flip()
        f.material_index = 1
    for f in faces_base:
        f.material_index = 2
    bottom.material_index = 1
    bm.normal_update()
    rim = lp._obj("rim", bm, None)
    for k in ("asphalt", "hole", "gravel"):
        rim.data.materials.append(M[k])
    parts = [rim]
    # Cracks running out of the edge across the road, and a spray-painted ring round the hole.
    for i, (a, l) in enumerate(((0.3, 0.1), (1.8, 0.09), (3.3, 0.11), (4.4, 0.08), (5.5, 0.1))):
        p0 = (math.cos(a) * 0.56, 0.021, math.sin(a) * 0.56 + cz)
        mid = (math.cos(a + 0.12) * (0.56 + l * 0.5), 0.021, math.sin(a + 0.12) * (0.56 + l * 0.5) + cz)
        p1 = (math.cos(a - 0.05) * (0.56 + l), 0.021, math.sin(a - 0.05) * (0.56 + l) + cz)
        parts.append(nk.quad_strip(f"crack{i}", [p0, mid, p1], 0.02, M["hole"], lift=0.0))
    # A web of fine cracks between the long ones, and broken slabs lifted along the lip.
    for i, (a, l) in enumerate(((0.9, 0.08), (2.5, 0.1), (3.9, 0.08), (5.0, 0.09), (1.4, 0.07), (2.9, 0.07))):
        p0 = (math.cos(a) * 0.58, 0.021, math.sin(a) * 0.58 + cz)
        p1 = (math.cos(a + 0.18) * (0.58 + l), 0.021, math.sin(a + 0.18) * (0.58 + l) + cz)
        parts.append(nk.quad_strip(f"fine{i}", [p0, p1], 0.012, M["hole"]))
    for i in range(9):
        a = 0.3 + i * 0.7
        r = 0.55 + 0.03 * (i % 3)
        parts.append(rot_box(f"slab{i}", (0.14, 0.03, 0.1), (math.cos(a) * r, 0.06, math.sin(a) * r + cz), M["asphalt"], yaw=-a, pitch=0.18 * (1 if i % 2 else -1), roll=0.1, bev=0))
    # Rebar left sticking out of the wall, and grit in the floor.
    for i, a in enumerate((0.6, 2.2, 4.1)):
        parts.append(lp.tube(f"rebar{i}", (math.cos(a) * 0.4, 0.04, math.sin(a) * 0.4 + cz), (math.cos(a) * 0.3, 0.1, math.sin(a) * 0.3 + cz), 0.008, 0.008, M["rustDark"], sides=4))
    parts += lumps("stone", [(-0.12, cz + 0.05, 0.035), (0.1, cz - 0.1, 0.03), (0.02, cz + 0.16, 0.03)], M["gravel"], seed=2.4)
    # A folding road-works sign on a stand.
    sx, sz = 0.56, -0.1
    parts += [
        lp.tube("signLegA", (sx, 0.0, sz), (sx + 0.06, 0.34, sz + 0.03), 0.012, 0.01, M["trestle"], sides=4),
        lp.tube("signLegB", (sx, 0.0, sz + 0.2), (sx + 0.06, 0.34, sz + 0.06), 0.012, 0.01, M["trestle"], sides=4),
        flat_poly("signBack", [(sx + 0.05, 0.3, sz - 0.16), (sx + 0.05, 0.3, sz + 0.26), (sx + 0.05, 0.66, sz + 0.05)], M["barrierWhite"], (1, 0, 0)),
        flat_poly("signFace", [(sx + 0.056, 0.325, sz - 0.115), (sx + 0.056, 0.325, sz + 0.215), (sx + 0.056, 0.6, sz + 0.05)], M["warnTri"], (1, 0, 0)),
        slab("signMark", (0.004, 0.11, 0.02), (sx + 0.06, 0.43, sz + 0.05), M["barrierWhite"], bev=0),
        slab("signDot", (0.004, 0.02, 0.02), (sx + 0.06, 0.37, sz + 0.05), M["barrierWhite"], bev=0),
    ]
    ring_pts = [(math.cos(a) * 0.68, 0.024, math.sin(a) * 0.68 + cz) for a in [i * math.pi / 8 for i in range(17)]]
    for k in range(0, 16, 2):
        parts.append(nk.quad_strip(f"spray{k}", ring_pts[k:k + 2 + 1][:3], 0.03, M["spray"], lift=0.0))
    # A puddle in the floor.
    parts.append(poly_disc("puddle", [(x * 0.55, z * 0.55, 0) for x, z, _ in nk.ring_of(0.3, 9, 0.5, [0.1, -0.05, 0.08])], 0.034, M["puddle"], cz=cz + 0.02))
    # Broken asphalt thrown out beside the hole, and lumps of the base course.
    parts += lumps("chunk", [(0.4, -0.55, 0.11), (0.58, -0.25, 0.08), (-0.1, -0.68, 0.07), (0.28, -0.7, 0.06)], M["rubble"], seed=0.4)
    parts += lumps("grit", [(-0.55, 0.4, 0.05), (0.62, 0.3, 0.045), (-0.6, -0.1, 0.05)], M["gravel"], seed=1.4)
    # Two planks laid across the near corner and a sandbag to weight them.
    parts.append(rot_box("plankA", (0.12, 0.03, 0.6), (-0.32, 0.03, 0.62), M["timberNew"], yaw=1.15, bev=0.006))
    parts.append(rot_box("plankB", (0.12, 0.03, 0.6), (-0.2, 0.036, 0.68), M["timberOld"], yaw=1.28, bev=0.006))
    parts += sandbag("bagP", -0.52, 0.0, 0.5, 0.4, M, size=(0.28, 0.1, 0.16))
    # A bucket of cold-mix, a shovel and a plate compactor left by the hole.
    parts.append(lathe("bucket", [(0.0, 0.08), (0.24, 0.1)], M["coneOrange"], base=(0.3, 0.0, 0.78), sides=10, cap_bottom=True))
    parts.append(lathe("mix", [(0.22, 0.09), (0.27, 0.06)], M["rubble"], base=(0.3, 0.0, 0.78), sides=10, cap_top=True))
    parts.append(torus("bucketHandle", (0.3, 0.24, 0.78), 0.1, 0.008, M["steelDark"], axis="z", major=8, minor=3))
    parts.append(lp.tube("shovel", (-0.55, 0.02, 0.1), (-0.4, 0.5, 0.2), 0.016, 0.016, M["mallet"], sides=5, cap1=True))
    parts.append(rot_box("shovelBlade", (0.2, 0.02, 0.26), (-0.52, 0.05, 0.06), M["steelDark"], pitch=0.15, yaw=0.2, bev=0.004))
    parts.append(slab("compactor", (0.36, 0.05, 0.42), (0.42, 0.06, -0.68), M["steelDark"], bev=0.01))
    parts.append(slab("engine", (0.2, 0.16, 0.2), (0.42, 0.19, -0.68), M["surveyRed"], bev=0.02))
    parts.append(lp.tube("compactorHandle", (0.42, 0.2, -0.78), (0.42, 0.55, -0.9), 0.012, 0.012, M["steelDark"], sides=5))
    # Tape strung between the cones, and a wheel track across the road.
    tape = [(-0.5, 0.36, 0.62), (0.0, 0.3, 0.72), (0.5, 0.36, 0.68)]
    parts.append(nk.quad_strip("tape", tape, 0.04, M["chevron"], up=(0, 1, 0)))
    parts.append(nk.quad_strip("track", [(-0.62, 0.018, 0.5), (-0.4, 0.018, 0.3), (0.2, 0.018, -0.8)], 0.06, M["skidMark"]))
    parts += cone("coneA", -0.5, 0.62, 0.46, 0.16, M)
    parts += cone("coneB", 0.5, 0.68, 0.46, 0.16, M)
    for i, (x, z) in enumerate(((-0.5, -0.3), (0.46, 0.2), (-0.5, 0.22))):
        parts.append(tuft(f"weed{i}", x, z, 0.5 - i * 0.05, 0.1, M["weed"], blades=9, seed=i * 1.3))
    return finish(parts, "PotholeNear")


# ---------------------------------------------------------------------------
# Signpost
# ---------------------------------------------------------------------------


def finger(M, name, length, height, y, x, facing, thick=0.06):
    """A finger board, pointed, with a white border line and two words, both faces."""
    L, h = length, height
    tip = 0.14
    prof = [(-L / 2, -h / 2), (L / 2 - tip, -h / 2), (L / 2, 0.0), (L / 2 - tip, h / 2), (-L / 2, h / 2)]
    prof = [(z * facing, y + yy) for z, yy in prof]
    parts = [prism(name, prof, thick, M["signBlue"], x=x, bev=0.008, seg=1)]
    outline = [(-L / 2 + 0.035, -h / 2 + 0.02), (L / 2 - tip - 0.02, -h / 2 + 0.02), (L / 2 - 0.06, 0.0),
               (L / 2 - tip - 0.02, h / 2 - 0.02), (-L / 2 + 0.035, h / 2 - 0.02), (-L / 2 + 0.035, -h / 2 + 0.02)]
    for face in (-1, 1):
        fx = x + face * (thick / 2 + 0.003)
        parts.append(nk.quad_strip(f"{name}Line", [(fx, y + yy, z * facing) for z, yy in outline], 0.008, M["letter"], up=(face, 0, 0)))
        for k, (dz, ln) in enumerate(((-0.06, 0.34), (0.0, 0.22))):
            parts.append(slab(f"{name}Word", (0.006, 0.03, ln), (x + face * (thick / 2 + 0.004), y + 0.035 - k * 0.07, dz * facing), M["letter"], bev=0))
    return parts


def signpost(M):
    parts = [
        slab("baseplate", (0.3, 0.025, 0.3), (0, 0.0125, 0), M["signPost"], bev=0.008),
        lathe("collar", [(0.025, 0.115), (0.08, 0.1), (0.16, 0.085), (0.18, 0.062)], M["signPost"], sides=12, cap_bottom=False),
        lp.tube("post", (0, 0.18, 0), (0, 2.26, 0), 0.06, 0.055, M["signPost"], sides=12),
        lathe("capRing", [(2.26, 0.068), (2.29, 0.068), (2.29, 0.058)], M["signPost"], sides=12),
        lathe("cap", [(2.29, 0.058), (2.33, 0.05), (2.36, 0.032), (2.38, 0.0)], M["signPost"], sides=12),
    ]
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(bolt("anchor", (sx * 0.11, 0.025, sz * 0.11), "y", 0.022, 0.03, M["bolt"], sides=6))
    # Two ribs bracing the post on its base plate.
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        parts.append(kit.strut("gusset", (math.cos(a) * 0.09, 0.03, math.sin(a) * 0.09), (math.cos(a) * 0.05, 0.2, math.sin(a) * 0.05), (0.02, 0.02), M["signPost"]))
    parts += finger(M, "fingerA", 0.64, 0.2, 2.06, 0.07, 1)
    parts += finger(M, "fingerB", 0.64, 0.2, 1.76, -0.07, -1)
    # Clamps to the post: a collar each board.
    for y, x in ((2.06, 0.07), (1.76, -0.07)):
        parts.append(lathe("clamp", [(y - 0.045, 0.072), (y + 0.045, 0.072)], M["steelDark"], base=(0, 0, 0), sides=10, cap_top=False))
        parts.append(bolt("clampBolt", (0.075, y, 0.0), "x", 0.016, 0.02, M["bolt"], sides=6))
    # The information board: a rounded frame, a header, a map and its key.
    parts.append(slab("frame", (0.08, 0.84, 0.56), (0, 0.92, 0), M["signBlue"], bev=0.028, seg=2))
    for face in (-1, 1):
        fx = face * 0.043
        parts.append(lp.panel("face", 0.44, 0.68, (fx, 0.92, 0), M["signWhite"], rot=(0, face * math.pi / 2, 0)))
        parts.append(slab("header", (0.008, 0.11, 0.44), (face * 0.046, 1.19, 0), M["signBlueDark"], bev=0))
        for k, ln in enumerate((0.3, 0.18)):
            parts.append(slab("headerTxt", (0.006, 0.02, ln), (face * 0.05, 1.21 - k * 0.04, 0.0), M["letter"], bev=0))
        # A little map: two roads crossing and a park.
        parts.append(slab("park", (0.006, 0.2, 0.15), (face * 0.046, 0.93, -0.11 * face), M["mapGreen"], bev=0))
        parts.append(slab("roadA", (0.007, 0.03, 0.42), (face * 0.047, 0.86, 0), M["mapRoad"], bev=0))
        parts.append(slab("roadB", (0.007, 0.5, 0.03), (face * 0.047, 0.9, 0.07 * face), M["mapRoad"], bev=0))
        parts.append(torus("you", (face * 0.05, 0.95, 0.09 * face), 0.018, 0.005, M["surveyRed"], axis="x", major=8, minor=3))
        for k, ln in enumerate((0.32, 0.26, 0.2)):
            parts.append(slab("key", (0.006, 0.018, ln), (face * 0.046, 0.7 - k * 0.04, -0.02), M["signBlue"], bev=0))
    # Frame bolts at the corners, and two brackets to the post.
    for face in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                parts.append(bolt("fb", (face * 0.04, 0.92 + sy * 0.38, sz * 0.24), "x", 0.014, face * 0.012, M["bolt"], sides=6))
    for y in (0.6, 1.24):
        parts.append(slab("bracket", (0.06, 0.04, 0.09), (0, y, 0.0), M["steelDark"], bev=0.006))
    # A little hood over the map, so the rain does not run down it.
    parts.append(prism("hood", [(-0.3, 1.33), (0.3, 1.33), (0.3, 1.36), (0.06, 1.44), (-0.06, 1.44), (-0.3, 1.36)], 0.16, M["signBlueDark"], x=0.0, bev=0.006))
    # More map: blocks, a river, a dashed route and a compass rose.
    for face in (-1, 1):
        fx = face * 0.048
        for k, (dy, dz, h, w) in enumerate(((0.08, 0.13, 0.07, 0.07), (-0.02, 0.15, 0.06, 0.09), (0.04, 0.02, 0.05, 0.05), (-0.1, -0.12, 0.06, 0.07))):
            parts.append(slab("block", (0.008, h, w), (fx, 0.93 + dy, dz * face), M["brick"], bev=0))
        parts.append(nk.quad_strip("river", [(fx, 1.06, -0.2 * face), (fx, 0.98, -0.05 * face), (fx, 0.78, -0.13 * face), (fx, 0.72, -0.2 * face)], 0.03, M["screen"], up=(face, 0, 0)))
        for k in range(6):
            parts.append(slab("route", (0.008, 0.012, 0.03), (fx + face * 0.002, 0.86 + k * 0.0, (-0.18 + k * 0.07) * face), M["surveyRed"], bev=0))
        parts.append(torus("compass", (fx, 1.08, 0.17 * face), 0.028, 0.004, M["signBlueDark"], axis="x", major=8, minor=3))
        parts.append(slab("north", (0.006, 0.05, 0.008), (fx + face * 0.002, 1.08, 0.17 * face), M["surveyRed"], bev=0))
        parts.append(slab("east", (0.006, 0.008, 0.05), (fx + face * 0.002, 1.08, 0.17 * face), M["signBlueDark"], bev=0))
        parts.append(blob("pin", (fx + face * 0.006, 0.95, 0.09 * face), (0.008, 0.012, 0.012), M["surveyRed"], u=6, v=3))
    # A street-name plate on the post, lettered on both sides, and bands down the shaft.
    parts.append(slab("plate", (0.02, 0.12, 0.56), (0.0, 1.5, 0.0), M["signBlueDark"], bev=0.008))
    for face in (-1, 1):
        for k, ln in enumerate((0.44, 0.32)):
            parts.append(slab("plateWord", (0.006, 0.024, ln), (face * 0.013, 1.53 - k * 0.05, 0.0), M["letter"], bev=0))
        parts.append(nk.quad_strip("plateLine", [(face * 0.012, 1.45, -0.26), (face * 0.012, 1.45, 0.26)], 0.008, M["letter"], up=(face, 0, 0)))
    for y in (0.5, 1.4, 1.62, 2.16):
        parts.append(lathe("band", [(y, 0.066), (y + 0.03, 0.066)], M["steelDark"], sides=12))
    # A sticker or two, and a plinth of two steps under the collar.
    parts.append(slab("sticker", (0.012, 0.08, 0.1), (0.062, 0.7, 0.03), M["chevron"], bev=0, rot=(0, 0, 0.0)))
    parts.append(slab("plinthB", (0.24, 0.02, 0.24), (0, 0.035, 0), M["signPost"], bev=0.006))
    return finish(parts, "SignpostNear")


# ---------------------------------------------------------------------------
# Survey
# ---------------------------------------------------------------------------


def survey(M):
    parts = []
    for i in range(3):
        a = i * 2 * math.pi / 3
        foot = (math.sin(a) * 0.42, 0.04, math.cos(a) * 0.42)
        top = (math.sin(a) * 0.07, 0.9, math.cos(a) * 0.07)
        parts.append(lp.tube(f"leg{i}", foot, top, 0.028, 0.035, M["tripod"], sides=8))
        # A steel shoe with a spike, a clamp knuckle, a tread lug for the boot.
        parts.append(lathe(f"shoe{i}", [(0.0, 0.0), (0.04, 0.03)], M["steelDark"], base=(foot[0], 0.0, foot[2]), sides=8, cap_top=True))
        mid = tuple(foot[k] + (top[k] - foot[k]) * 0.55 for k in range(3))
        parts.append(slab(f"knuckle{i}", (0.05, 0.05, 0.05), mid, M["steelDark"], bev=0.008))
        parts.append(kit.strut(f"lug{i}", (foot[0] + math.sin(a) * 0.03, 0.09, foot[2] + math.cos(a) * 0.03),
                               (foot[0] + math.sin(a) * 0.09, 0.09, foot[2] + math.cos(a) * 0.09), (0.02, 0.015), M["steelDark"]))
    parts += [
        lathe("head", [(0.86, 0.12), (0.89, 0.12), (0.93, 0.1)], M["tripod"], sides=12, cap_top=True),
        lathe("tribrach", [(0.93, 0.085), (0.955, 0.085), (0.975, 0.06)], M["instrumentDark"], sides=12, cap_top=True),
    ]
    for i in range(3):
        a = i * 2 * math.pi / 3 + 0.5
        parts.append(bolt("footScrew", (math.cos(a) * 0.09, 0.93, math.sin(a) * 0.09), "y", 0.016, 0.03, M["surveyRed"], sides=6))
    # The instrument: a bevelled body, two standards, the telescope, a handle.
    parts += [
        slab("body", (0.2, 0.09, 0.26), (0, 1.0, 0), M["instrument"], bev=0.014, seg=2),
        slab("standardL", (0.035, 0.16, 0.16), (-0.085, 1.11, 0), M["instrument"], bev=0.01, seg=2),
        slab("standardR", (0.035, 0.16, 0.16), (0.085, 1.11, 0), M["instrument"], bev=0.01, seg=2),
        lathe("scopeBody", [(-0.05, 0.043), (0.12, 0.048)], M["instrumentDark"], base=(0, 1.1, 0.14), sides=12, axis="z"),
        cyl("scopeCap", 0.056, 0.03, (0, 1.1, 0.27), M["instrumentDark"], axis="z", verts=12),
        cyl("lens", 0.045, 0.012, (0, 1.1, 0.29), M["lens"], axis="z", verts=12),
        cyl("eyepiece", 0.03, 0.05, (0, 1.1, -0.05), M["instrumentDark"], axis="z", verts=10),
        cyl("focus", 0.028, 0.03, (0.11, 1.1, 0.14), M["surveyRed"], axis="x", verts=10),
        cyl("focusB", 0.028, 0.03, (-0.11, 1.1, 0.14), M["surveyRed"], axis="x", verts=10),
        slab("screenBox", (0.12, 0.08, 0.02), (0, 1.04, -0.14), M["instrumentDark"], bev=0.008, rot=(0.35, 0, 0)),
        slab("screen", (0.09, 0.05, 0.005), (0, 1.045, -0.152), M["screen"], bev=0, rot=(0.35, 0, 0)),
        blob("bubble", (0.06, 1.058, 0.1), (0.018, 0.012, 0.018), M["lens"], u=6, v=3),
    ]
    parts.append(kit.strut("carry", (-0.06, 1.19, 0.0), (0.06, 1.19, 0.0), (0.02, 0.02), M["instrumentDark"]))
    parts.append(kit.strut("carryL", (-0.06, 1.19, 0.0), (-0.085, 1.17, 0.0), (0.02, 0.02), M["instrumentDark"]))
    parts.append(kit.strut("carryR", (0.06, 1.19, 0.0), (0.085, 1.17, 0.0), (0.02, 0.02), M["instrumentDark"]))
    # The levelling staff: graduated red and white blocks, a spike foot, a bubble and a hand-grip.
    for k in range(16):
        y0 = k * 0.0675
        parts.append(slab(f"grad{k}", (0.05, 0.0675, 0.03), (0.45, y0 + 0.03375, -0.3), M["staffRed"] if k % 2 == 0 else M["barrierWhite"], bev=0.004))
    parts.append(lathe("staffFoot", [(0.0, 0.0), (0.04, 0.02)], M["steelDark"], base=(0.45, 0.0, -0.3), sides=6, cap_top=True))
    parts.append(slab("staffCap", (0.055, 0.02, 0.04), (0.45, 1.09, -0.3), M["steelDark"], bev=0.006))
    parts.append(blob("staffBubble", (0.45, 0.7, -0.27), (0.018, 0.018, 0.018), M["lens"], u=6, v=4))
    parts.append(slab("grip", (0.012, 0.16, 0.03), (0.49, 0.56, -0.3), M["steelDark"], bev=0.003))
    # Pegs with flagging tape and red-painted heads.
    for i, (x, z) in enumerate(((-0.44, 0.44), (0.36, 0.46), (0.0, -0.5))):
        parts.append(lp.tube(f"peg{i}", (x, 0, z), (x, 0.46, z), 0.04, 0.035, M["peg"], sides=6, cap1=True))
        parts.append(lp.tube(f"pegHead{i}", (x, 0.4, z), (x, 0.46, z), 0.042, 0.042, M["staffRed"], sides=6, cap1=True))
        pts = [(x + 0.03, 0.36, z), (x + 0.09, 0.33, z + 0.02), (x + 0.15, 0.36, z - 0.01), (x + 0.19, 0.31, z + 0.02)]
        parts.append(nk.quad_strip(f"tape{i}", pts, 0.05, M["tape"], up=(0, 0, 1)))
        parts.append(nk.quad_strip(f"tapeB{i}", pts[::-1], 0.05, M["tape"], up=(0, 0, -1)))
        parts.append(poly_disc(f"mark{i}", nk.ring_of(0.09, 7), 0.006, M["spray"], cx=x, cz=z))
    # A mallet and a tape measure left on the road.
    parts.append(rot_box("malletHead", (0.16, 0.07, 0.07), (-0.2, 0.06, -0.5), M["mallet"], yaw=0.5, bev=0.014))
    parts.append(lp.tube("malletHandle", (-0.18, 0.04, -0.52), (0.1, 0.02, -0.4), 0.018, 0.02, M["mallet"], sides=6, cap1=True))
    parts.append(lathe("tapeCase", [(0.0, 0.07), (0.03, 0.07), (0.03, 0.06)], M["tapeCase"], base=(-0.3, 0.0, 0.05), sides=12, cap_top=True))
    parts.append(slab("tapeEnd", (0.035, 0.008, 0.02), (-0.22, 0.012, 0.09), M["staffRed"], bev=0))
    # The instrument's keypad and battery, the plumb bob on its cord, the lanyard.
    for r in range(3):
        for c in range(4):
            parts.append(slab("key", (0.014, 0.008, 0.012), (-0.045 + c * 0.03, 1.056 + 0.0, -0.06 - r * 0.02), M["instrumentDark"], bev=0, rot=(0.35, 0, 0)))
    parts.append(slab("battery", (0.05, 0.11, 0.09), (0.1, 1.04, -0.05), M["instrumentDark"], bev=0.008))
    parts.append(lp.tube("cord", (0, 0.93, 0), (0, 0.6, 0), 0.004, 0.004, M["staffRed"], sides=3))
    parts.append(lathe("plumb", [(0.5, 0.0), (0.6, 0.026), (0.66, 0.008)], M["steelDark"], base=(0, 0, 0), sides=8))
    # A second pole with a prism on top, a clipboard, a spray can and the marks it made.
    parts.append(lp.tube("prismPole", (-0.5, 0.0, -0.25), (-0.5, 1.1, -0.25), 0.014, 0.011, M["steelDark"], sides=6))
    parts.append(slab("prismHousing", (0.09, 0.09, 0.03), (-0.5, 1.13, -0.25), M["instrumentDark"], bev=0.008))
    parts.append(lathe("prismGlass", [(-0.245, 0.04), (-0.23, 0.04)], M["lens"], base=(-0.5, 1.13, 0), sides=10, axis="z", cap_top=True))
    parts.append(slab("clipboard", (0.22, 0.012, 0.3), (-0.2, 0.008, 0.3), M["mallet"], bev=0.004, rot=(0, 0.4, 0)))
    parts.append(slab("paper", (0.19, 0.004, 0.26), (-0.2, 0.017, 0.3), M["barrierWhite"], bev=0, rot=(0, 0.4, 0)))
    parts.append(lathe("sprayCan", [(0.0, 0.03), (0.16, 0.03), (0.18, 0.02), (0.21, 0.012)], [M["staffRed"], M["staffRed"], M["steelDark"]], base=(0.55, 0.0, 0.1), sides=10, cap_top=True))
    parts.append(lathe("sprayCap", [(0.21, 0.014), (0.24, 0.014)], M["steelDark"], base=(0.55, 0.0, 0.1), sides=6, cap_top=True))
    parts.append(poly_disc("markA", nk.ring_of(0.06, 6), 0.006, M["staffRed"], cx=0.3, cz=-0.05))
    parts.append(nk.quad_strip("markLine", [(0.3, 0.006, -0.05), (0.1, 0.006, -0.25), (-0.1, 0.006, -0.42)], 0.025, M["spray"]))
    parts.append(tuft("weedA", -0.36, 0.36, 0.42, 0.16, M["weed"], blades=9, seed=0.4))
    return finish(parts, "SurveyNear")


# ---------------------------------------------------------------------------
# Van
# ---------------------------------------------------------------------------


def arch(name, x, y, z, radius, side, M, lip=True):
    """A wheel arch on a flank: a dark liner sector and a lip round its top."""
    pts = [(x + side * 0.003, y + math.sin(a) * radius, z + math.cos(a) * radius) for a in [math.pi * i / 8 for i in range(-4, 5)]]
    pts = [(x + side * 0.003, y + math.cos(a) * radius, z + math.sin(a) * radius) for a in [-math.pi / 2 + math.pi * i / 8 for i in range(9)]]
    bm = bmesh.new()
    centre = bm.verts.new(B((x + side * 0.003, y - 0.0, z)))
    rim = [bm.verts.new(B(p)) for p in pts]
    for a, b in zip(rim, rim[1:]):
        f = bm.faces.new((centre, a, b))
        f.normal_update()
        if f.normal.dot(B((side, 0, 0))) < 0:
            f.normal_flip()
    liner = lp._obj(name + "Liner", bm, M["arch"] if "arch" in M else M["chassis"])
    if not lip:
        return [liner]
    lip = nk.quad_strip(name + "Lip", [(x + side * 0.008, y + math.cos(a) * (radius + 0.02), z + math.sin(a) * (radius + 0.02))
                                       for a in [-math.pi / 2 + math.pi * i / 8 for i in range(9)]], 0.034, M["chassis"], up=(side, 0, 0))
    return [liner, lip]


def flat_poly(name, points, mat, facing):
    """A flat convex polygon (app-frame points) facing `facing`."""
    bm = bmesh.new()
    vs = [bm.verts.new(B(p)) for p in points]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(B(facing)) < 0:
        f.normal_flip()
    return lp._obj(name, bm, mat)


def van(M):
    W = 1.2
    hw = W / 2
    profile = [(-1.25, 0.2), (1.47, 0.2), (1.47, 0.52), (1.38, 0.66), (1.05, 0.86), (0.7, 1.36), (0.55, 1.4), (-1.25, 1.4)]
    white = M["vanWhite"]
    parts = [prism("body", profile, W, white, bev=0.045, seg=2)]
    # The dark skirt and the livery band (paint slot 1), as the lean van has.
    parts.append(forms.sleeve("skirt", W + 0.02, 2.74, 0.06, 0.22, M["chassis"], z=0.11))
    parts.append(forms.sleeve("band", W + 0.02, 2.74, 0.3, 0.42, M["paintA"], z=0.11))
    parts.append(forms.sleeve("beltline", W + 0.014, 2.6, 0.44, 0.455, white, z=0.13))
    # Windscreen on the rake, with its rubber seal, and the two cab windows with frames.
    rake = -math.atan2(0.35, 0.5)
    parts.append(lp.panel("screen", W * 0.84, 0.54, (0, 1.11 + 0.57 * 0.006, 0.875 + 0.82 * 0.006), M["glass"], rot=(rake, 0, 0)))
    ry, rz = 1.11 + 0.57 * 0.006, 0.875 + 0.82 * 0.006
    seal = [(sx * 0.53, ry + sy * 0.225, rz - sy * 0.158) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1))]
    parts.append(nk.quad_strip("seal", seal, 0.03, M["chassis"], up=(0, 0.573, 0.819), lift=0.006))
    for sx in (-1, 1):
        win = [(0.4, 0.95), (0.4, 1.29), (0.74, 1.29), (0.84, 1.16), (0.84, 0.95)]
        parts.append(flat_poly("win", [(sx * (hw + 0.004), y, z) for z, y in win], M["glass"], (sx, 0, 0)))
        loop = [(sx * (hw + 0.006), y, z) for z, y in win + [win[0]]]
        parts.append(nk.quad_strip("winFrame", loop, 0.02, M["chassis"], up=(sx, 0, 0)))
        # Door: shut lines front and back, a handle, and the sliding door's track and handle.
        parts.append(slab("shut", (0.006, 0.86, 0.01), (sx * (hw + 0.004), 0.83, 0.2), M["chassis"], bev=0))
        parts.append(slab("shutF", (0.006, 0.5, 0.01), (sx * (hw + 0.004), 0.68, 0.98), M["chassis"], bev=0))
        parts.append(slab("handle", (0.02, 0.025, 0.08), (sx * (hw + 0.012), 0.95, 0.3), M["bumper"], bev=0.006))
        parts.append(slab("slideShut", (0.006, 0.86, 0.01), (sx * (hw + 0.004), 0.83, -0.95), M["chassis"], bev=0))
        parts.append(slab("track", (0.012, 0.03, 1.1), (sx * (hw + 0.006), 0.36 + 0.0, -0.35), M["chassis"], bev=0.004))
        parts.append(slab("slideHandle", (0.02, 0.025, 0.09), (sx * (hw + 0.012), 0.95, -0.2), M["bumper"], bev=0.006))
        # Mirror: arm and housing, glass facing back.
        parts.append(slab("mirrorArm", (0.06, 0.02, 0.02), (sx * (hw + 0.025), 1.02, 0.72), M["bumper"], bev=0.004))
        parts.append(slab("mirror", (0.035, 0.16, 0.09), (sx * (hw + 0.03), 1.1, 0.7), M["bumper"], bev=0.014, seg=2))
    # Wheels, and the arches over them.
    for z in (0.95, -0.78):
        for sx in (-1, 1):
            parts += nk.wheel("wheel", sx * 0.58, 0.2, z, 0.2, 0.16, M, sides=10, lugs=0)
            parts += arch("arch", sx * (hw + 0.002), 0.2, z, 0.25, sx, M)
    parts += [slab("bumperF", (W + 0.02, 0.13, 0.06), (0, 0.25, 1.485), M["bumper"], bev=0.02),
              slab("bumperR", (W + 0.02, 0.13, 0.06), (0, 0.25, -1.27), M["bumper"], bev=0.02)]
    # Front: grille with slats, lamps, plate and badge.
    parts.append(slab("grille", (0.6, 0.16, 0.012), (0, 0.42, 1.475), M["chassis"], bev=0.004))
    for k in range(3):
        parts.append(slab("slat", (0.56, 0.012, 0.014), (0, 0.375 + k * 0.05, 1.478), M["steel"], bev=0))
    for sx in (-1, 1):
        parts.append(slab("headlamp", (0.2, 0.09, 0.02), (sx * 0.42, 0.46, 1.42), M["lampWhite"], bev=0.01))
        parts.append(slab("headHousing", (0.22, 0.11, 0.012), (sx * 0.42, 0.46, 1.41), M["chassis"], bev=0.004))
        parts.append(slab("indicator", (0.07, 0.035, 0.014), (sx * 0.5, 0.4, 1.478), M["indicator"], bev=0.004))
    parts.append(slab("plateF", (0.28, 0.07, 0.01), (0, 0.29, 1.5), M["plate"], bev=0.003))
    parts.append(slab("plateInk", (0.2, 0.03, 0.005), (0, 0.29, 1.507), M["plateInk"], bev=0))
    parts.append(cyl("badge", 0.03, 0.006, (0, 0.5, 1.48), M["rim"], axis="z", verts=8))
    # Rear: doors, handles, lamps, plate, step.
    parts.append(slab("rearShut", (0.006, 1.05, 0.01), (0, 0.85, -1.255), M["chassis"], bev=0))
    for sx in (-1, 1):
        parts.append(slab("rearLamp", (0.08, 0.2, 0.02), (sx * 0.53, 0.55, -1.26), M["lampRed"], bev=0.008))
        parts.append(slab("hinge", (0.03, 0.08, 0.02), (sx * 0.55, 1.25, -1.26), M["bumper"], bev=0.004))
        parts.append(slab("rearHandle", (0.03, 0.14, 0.02), (sx * 0.04, 0.82, -1.265), M["bumper"], bev=0.006))
    parts.append(slab("plateR", (0.28, 0.07, 0.01), (0, 0.4, -1.26), M["plate"], bev=0.003))
    for k in range(4):
        mat = M["chevron"] if k % 2 == 0 else M["chevronDark"]
        parts.append(slab("chevronR", (0.2, 0.09, 0.006), (-0.3 + k * 0.2, 1.15, -1.257), mat, bev=0))
    # Roof: rack, the ladder on it with rungs, and the amber light bar.
    for z in (-0.95, 0.55):
        parts.append(slab("rackBar", (0.66, 0.025, 0.03), (0, 1.425, z), M["steel"], bev=0.005))
    for sx in (-1, 1):
        parts.append(lp.tube("rail", (sx * 0.3, 1.46, -1.15), (sx * 0.3, 1.46, 0.75), 0.03, 0.03, M["ladder"], sides=6))
    for k in range(8):
        parts.append(lp.tube("rung", (-0.3, 1.46, -1.05 + k * 0.23), (0.3, 1.46, -1.05 + k * 0.2), 0.014, 0.014, M["ladder"], sides=5))
    parts += [
        slab("barBase", (0.36, 0.05, 0.16), (0, 1.41, 0.62), M["housing"], bev=0.012),
        slab("barLensA", (0.11, 0.06, 0.13), (-0.11, 1.465, 0.62), M["amber"], bev=0.014),
        slab("barLensB", (0.11, 0.06, 0.13), (0.11, 1.465, 0.62), M["amber"], bev=0.014),
        slab("barMid", (0.08, 0.05, 0.13), (0, 1.462, 0.62), M["housing"], bev=0.01),
        slab("barCap", (0.34, 0.015, 0.15), (0, 1.505, 0.62), M["housing"], bev=0.005),
    ]
    # The optional parts, as the lean van has them.
    parts += nk.worker(M, 0.3, -1.37)
    parts += nk.beacon(M, (0, 1.5, -1.05))
    parts += nk.board(M, 0.63, -0.7, 0.0, 0.93)
    parts += nk.flag(M, -0.5, 0.6, 1.4, 2.2)
    return finish(parts, "VanNear")


# ---------------------------------------------------------------------------
# Scaffold
# ---------------------------------------------------------------------------


def grid_cloth(name, x0, x1, y0, y1, z, cols, rows, mat, billow=0.03, sag=0.0, seed=0.0, face=1, gap_every=0):
    """A hanging sheet cut into a grid so it can billow: `face` is the side
    it faces along z. Netting, tarpaulin. `gap_every` leaves every n-th
    column of cells out, so netting hangs in panels with real gaps."""
    bm = bmesh.new()
    grid = []
    for r in range(rows + 1):
        line = []
        for c in range(cols + 1):
            u, v = c / cols, r / rows
            dz = billow * math.sin(u * 3.1 + seed) * math.sin(v * 2.4 + seed * 0.6) + sag * (1 - v)
            line.append(bm.verts.new(B((x0 + (x1 - x0) * u, y1 - (y1 - y0) * v, z + face * dz))))
        grid.append(line)
    for r in range(rows):
        for c in range(cols):
            if gap_every and c % gap_every == gap_every - 1:
                continue
            f = bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
            f.normal_update()
            if f.normal.dot(B((0, 0, face))) < 0:
                f.normal_flip()
    return lp._obj(name, bm, mat)


def scaffold(M):
    w, h, d = forms.SCAFFOLD["width"], forms.SCAFFOLD["height"], forms.SCAFFOLD["depth"]
    half = w / 2 - 0.05
    front = d / 2 - 0.06
    back = -d / 2 + 0.1
    lift1, lift2 = h * 0.36, h * 0.7
    steel = M["steel"]
    R = 0.046

    def tube(name, a, b, r=R, sides=8):
        return lp.tube(name, a, b, r, r, steel, sides=sides, turn=math.pi / 8)

    parts = []
    corners = ((-half, front), (half, front), (-half, back), (half, back))
    for i, (x, z) in enumerate(corners):
        parts.append(tube(f"std{i}", (x, 0.06, z), (x, h, z)))
        parts.append(slab(f"basePlate{i}", (0.15, 0.02, 0.15), (x, 0.01, z), M["steelDark"], bev=0))
        parts.append(lathe(f"jack{i}", [(0.02, 0.03), (0.09, 0.03)], M["steelDark"], base=(x, 0, z), sides=6))
        parts.append(bolt("baseBolt", (x - math.copysign(0.05, x), 0.02, z - math.copysign(0.05, z)), "y", 0.014, 0.012, M["bolt"], sides=4))
        # A joint pin where the standard's next length meets it.
        parts.append(lathe(f"spigot{i}", [(2.0, R * 1.35), (2.09, R * 1.35)], M["steelDark"], base=(x, 0, z), sides=8))
        parts.append(lathe(f"spigotB{i}", [(4.4, R * 1.35), (4.49, R * 1.35)], M["steelDark"], base=(x, 0, z), sides=8))

    def coupler(x, y, z):
        return slab("coupler", (0.11, 0.07, 0.11), (x, y, z), M["steelDark"], bev=0)

    heights = [0.35, lift1 - 0.08, lift2 - 0.08]
    for y in heights:
        for z in (front, back):
            parts.append(tube("ledger", (-half, y, z), (half, y, z), 0.04))
            for x in (-half, half):
                parts.append(coupler(x, y, z))
    # Transoms across the depth under each deck, and at the ends of the base.
    for y in (0.35, lift1 - 0.08, lift2 - 0.08):
        for x in (-half, -half / 2, 0.0, half / 2, half):
            parts.append(tube("transom", (x, y + 0.045, back), (x, y + 0.045, front + 0.05), 0.036, sides=4))
    # Guard rails and mid rails a lift up, and returns at each end.
    for lift in (lift1, lift2):
        for dy in (0.5, 0.95):
            parts.append(tube("rail", (-half, lift + dy, front), (half, lift + dy, front), 0.04))
        for x in (-half, half):
            parts.append(tube("returnRail", (x, lift + 0.95, back), (x, lift + 0.95, front), 0.04))
            parts.append(coupler(x, lift + 0.95, front))
            parts.append(coupler(x, lift + 0.5, front))
    # Braces: the face brace on the bottom lift and a counter brace above, plus a plan brace.
    parts.append(tube("brace", (-half, 0.35, front + 0.03), (half, lift1 - 0.08, front + 0.03), 0.04))
    parts.append(tube("brace2", (half, lift1 - 0.08, front + 0.03), (-half, lift2 - 0.08, front + 0.03), 0.04))
    parts.append(tube("sideBrace", (-half, 0.35, back), (-half, lift1 - 0.08, front), 0.036, sides=6))
    parts.append(tube("sideBraceB", (half, 0.35, front), (half, lift1 - 0.08, back), 0.036, sides=6))
    # Boarded lifts: each deck is four planks with a toe board along its front.
    for lift, tag in ((lift1, "1"), (lift2, "2")):
        for k in range(4):
            z = back + 0.1 + (front - back - 0.02) * (k + 0.5) / 4
            parts.append(slab(f"plank{tag}", (w - 0.1, 0.04, (front - back - 0.02) / 4 - 0.008), (0, lift - 0.02, z), M["timberNew"] if k % 2 else M["timberOld"], bev=0))
        parts.append(slab(f"toe{tag}", (w - 0.1, 0.15, 0.03), (0, lift + 0.075, front + 0.03), M["timberNew"], bev=0))
        for x in (-half, half):
            parts.append(slab(f"toeEnd{tag}", (0.03, 0.15, front - back), (x + (0.06 if x < 0 else -0.06) + 0, lift + 0.075, (front + back) / 2), M["timberNew"], bev=0))
    # Ties to the facade at the back standards, with their anchor plates.
    facade = -d / 2
    for x in (-half, half):
        for y in (1.6, 4.0):
            parts.append(tube("tie", (x, y, back), (x, y, facade + 0.02), 0.025, sides=6))
            parts.append(slab("anchor", (0.1, 0.1, 0.02), (x, y, facade + 0.01), M["steelDark"], bev=0))
            parts.append(bolt("anchorBolt", (x, y, facade + 0.02), "z", 0.02, 0.02, M["bolt"], sides=4))
    # A ladder to the first lift and another between the lifts.
    for tag, lo, hi, x in (("A", 0.0, lift1, 1.25), ("B", lift1, lift2, -1.05)):
        for dx in (-0.22, 0.22):
            parts.append(lp.tube("ladderRail", (x + dx, lo + 0.02, front - 0.15 - 0.0), (x + dx, hi + 0.9, front - 0.15), 0.025, 0.025, M["ladder"], sides=5))
        n = int((hi - lo) / 0.3)
        for k in range(n):
            parts.append(lp.tube("rung", (x - 0.22, lo + 0.2 + k * 0.3, front - 0.15), (x + 0.22, lo + 0.2 + k * 0.3, front - 0.15), 0.014, 0.014, M["ladder"], sides=5))
    # Netting over the top lift, seen from outside and from inside, with its ties and a rope along the top.
    top0, top1 = lift2 + 0.15, h - 0.0
    parts.append(grid_cloth("net", -w / 2 + 0.1, w / 2 - 0.1, top0, top1, front + 0.03, 11, 5, M["netting"], billow=0.03, seed=0.5, gap_every=4))
    parts.append(grid_cloth("netIn", -w / 2 + 0.1, w / 2 - 0.1, top0, top1, front + 0.025, 11, 5, M["netting"], billow=0.03, seed=0.5, face=-1, gap_every=4))
    parts.append(tube("netRope", (-w / 2 + 0.1, top1 - 0.01, front + 0.045), (w / 2 - 0.1, top1 - 0.01, front + 0.045), 0.012, sides=4))
    for k in range(6):
        parts.append(slab("netTie", (0.03, 0.05, 0.03), (-w / 2 + 0.4 + k * 0.8, top1 - 0.02, front + 0.05), M["rubber"], bev=0))
    # The site's things on the decks: a brick stack, a bucket, a toolbox, a hammer, sacks.
    for k in range(6):
        parts.append(slab("brick", (0.22, 0.07, 0.105), (1.0 + (k % 2) * 0.02, lift2 + 0.035 + (k // 2) * 0.072, -0.1 + (k % 2) * 0.11), M["brick"], bev=0))
    parts.append(lathe("bucket", [(lift2 + 0.02, 0.09), (lift2 + 0.25, 0.12)], M["coneOrange"], base=(-1.4, 0, -0.05), sides=10, cap_bottom=True))
    parts.append(slab("toolbox", (0.42, 0.18, 0.2), (0.3, lift1 + 0.11, 0.05), M["steelDark"], bev=0.02))
    parts.append(slab("toolboxLid", (0.42, 0.03, 0.2), (0.3, lift1 + 0.215, 0.05), M["ladder"], bev=0.01))
    parts.append(rot_box("hammerHead", (0.11, 0.05, 0.05), (-1.6, lift1 + 0.06, 0.05), M["steelDark"], yaw=0.3, bev=0.008))
    parts.append(lp.tube("hammerHandle", (-1.6, lift1 + 0.04, 0.02), (-1.3, lift1 + 0.04, 0.12), 0.014, 0.016, M["mallet"], sides=5, cap1=True))
    for i, x in enumerate((-0.3,)):
        parts.append(blob(f"sack{i}", (x - 0.9, lift2 + 0.09, 0.08), (0.24, 0.09, 0.15), M["sandbag"], u=6, v=4, turn=i))
    # The optional parts.
    parts += nk.worker(M, half * 0.35, 0, y0=lift1 + 0.04)
    parts += nk.beacon(M, (half - 0.12, h + 0.12, front - 0.1))
    parts += nk.board_panel(M, (-half * 0.5, lift1 * 0.55, front + 0.03), 0.62, edge_on=False, thick=0.04)
    parts += nk.flag(M, -half, front, h - 0.5, h + 1.1)
    return finish(parts, "ScaffoldNear")


# ---------------------------------------------------------------------------
# Trench
# ---------------------------------------------------------------------------


def undulating(name, x0, x1, z0, z1, y, cols, rows, mat, bump=0.03, seed=0.0, hole=None):
    """A ground patch cut into a grid whose points rise and fall a little: an
    earth apron, a gravel bed. `hole` is a (x0, x1, z0, z1) rectangle left
    open (the trench's cut)."""
    bm = bmesh.new()
    grid = {}
    for r in range(rows + 1):
        for c in range(cols + 1):
            x = x0 + (x1 - x0) * c / cols
            z = z0 + (z1 - z0) * r / rows
            edge = c in (0, cols) or r in (0, rows)
            dy = 0.0 if edge else bump * (0.5 + 0.5 * math.sin(c * 2.1 + r * 1.3 + seed) * math.cos(c * 0.9 - r * 1.7 + seed))
            grid[r, c] = bm.verts.new(B((x, y + dy, z)))
    for r in range(rows):
        for c in range(cols):
            cx = x0 + (x1 - x0) * (c + 0.5) / cols
            cz = z0 + (z1 - z0) * (r + 0.5) / rows
            if hole and hole[0] < cx < hole[1] and hole[2] < cz < hole[3]:
                continue
            f = bm.faces.new((grid[r, c], grid[r, c + 1], grid[r + 1, c + 1], grid[r + 1, c]))
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
    return lp._obj(name, bm, mat)


def trench(M):
    parts = []
    # Ground: the earth apron round the cut, uneven, and the dark cut itself.
    parts.append(undulating("apron", -0.65, 0.65, -1.45, 1.45, 0.012, 4, 10, M["earth"], bump=0.025, seed=1.0, hole=(-0.36, 0.36, -1.11, 1.31)))
    parts.append(lp.panel("cut", 0.72, 2.42, (0, 0.022, 0.1), M["hole"], rot=(-math.pi / 2, 0, 0)))
    parts.append(lp.panel("cutFloor", 0.6, 2.3, (0, 0.03, 0.1), M["hole"], rot=(-math.pi / 2, 0, 0)))
    # Shoring: vertical planks down each side and across the ends, walings along
    # the top, and hydraulic props across the cut.
    for s in (-1, 1):
        for k in range(12):
            z = 0.1 - 1.155 + k * 0.21
            parts.append(slab("shore", (0.03, 0.17 + 0.02 * (k % 2), 0.19), (s * 0.375, 0.09, z), M["timberNew"] if k % 3 else M["shoring"], bev=0))
        parts.append(slab("waling", (0.06, 0.06, 2.5), (s * 0.41, 0.17, 0.1), M["shoring"], bev=0))
    for e in (-1, 1):
        for k in range(3):
            parts.append(slab("endBoard", (0.2, 0.15, 0.03), (-0.22 + k * 0.22, 0.09, 0.1 + e * 1.2), M["timberNew"], bev=0))
    for z in (-0.4, 0.6):
        parts.append(lp.tube("prop", (-0.35, 0.12, z), (0.35, 0.12, z), 0.028, 0.028, M["steelDark"], sides=8))
        parts.append(lathe("propNut", [(-0.06, 0.05), (0.06, 0.05)], M["surveyRed"], base=(0, 0.12, z), sides=8, axis="x"))
        for sx in (-1, 1):
            parts.append(slab("propPlate", (0.02, 0.09, 0.09), (sx * 0.36, 0.12, z), M["steelDark"], bev=0))
    # A pipe run along the floor with flanges, and a ladder into the cut.
    parts.append(lathe("pipe", [(-1.0, 0.07), (1.2, 0.07)], M["rail"], base=(0.0, 0.09, 0.0), sides=8, axis="z"))
    for z in (-0.6, 0.2, 0.95):
        parts.append(lathe("flange", [(z - 0.02, 0.1), (z + 0.02, 0.1)], M["steelDark"], base=(0.0, 0.09, 0.0), sides=8, axis="z"))
    parts.append(lp.tube("cable", (0.18, 0.05, -1.0), (0.18, 0.05, 1.15), 0.02, 0.02, M["rubber"], sides=5))
    for dx in (-0.12, 0.12):
        parts.append(lp.tube("ladderRail", (dx, 0.03, 0.85), (dx, 0.62, 1.32), 0.02, 0.02, M["ladder"], sides=5))
    for k in range(4):
        t = 0.15 + k * 0.22
        parts.append(lp.tube("rung", (-0.12, 0.03 + 0.59 * t, 0.85 + 0.47 * t), (0.12, 0.03 + 0.59 * t, 0.85 + 0.47 * t), 0.011, 0.011, M["ladder"], sides=4))
    # A plank bridge across the cut, and the earth thrown up: a heap, clods, a shovel.
    for k in range(2):
        parts.append(slab("bridge", (0.98, 0.04, 0.16), (0, 0.19, -0.92 + k * 0.17), M["timberOld"] if k else M["timberNew"], bev=0))
    spoil = lp.blobs("spoil", [((0.08, 0.12, -1.16), 0.4, (1.35, 0.55, 0.5)), ((-0.25, 0.08, -1.12), 0.26, (1.2, 0.5, 0.7))], M["earth"], wobble=0.12, seed=4.0, decimate=70)
    parts.append(spoil)
    parts += lumps("clod", [(0.5, -1.0, 0.07), (-0.55, -1.25, 0.06), (0.55, -1.3, 0.05), (-0.5, 1.15, 0.06), (0.52, 1.0, 0.05)], M["earth"], seed=2.0)
    parts.append(lp.tube("shovelHandle", (0.32, 0.5, -1.2), (0.18, 0.9, -1.18), 0.016, 0.016, M["mallet"], sides=5, cap1=True))
    parts.append(slab("shovelGrip", (0.11, 0.03, 0.03), (0.16, 0.92, -1.18), M["mallet"], bev=0))
    parts.append(rot_box("shovelBlade", (0.2, 0.02, 0.24), (0.36, 0.34, -1.2), M["steelDark"], pitch=-1.0, bev=0.004))
    # The barrier rails either side, in short striped lengths, on posts with feet and sandbags.
    for x in (-0.72, 0.72):
        colour = M["coneOrange"] if x > 0 else M["barrierWhite"]
        other = M["barrierWhite"] if x > 0 else M["coneOrange"]
        for k in range(8):
            parts.append(slab("rail", (0.08, 0.18, 0.35), (x, 0.62, -1.225 + k * 0.35), colour if k % 2 == 0 else other, bev=0))
        for z in (-1.3, 1.3):
            parts.append(lp.tube("post", (x, 0.02, z), (x, 0.54, z), 0.045, 0.045, M["rail"], sides=8))
            parts.append(slab("postFoot", (0.16, 0.03, 0.16), (x, 0.015, z), M["rail"], bev=0))
            parts.append(slab("postCap", (0.07, 0.03, 0.07), (x, 0.555, z), M["steelDark"], bev=0))
            parts += sandbag("bag", x * 0.85, 0.03, z + (0.18 if z < 0 else -0.18), 1.57, M, size=(0.3, 0.09, 0.17))
    # Warning tape strung between the near posts.
    tape = [(-0.72, 0.5, 1.3), (-0.3, 0.44, 1.32), (0.3, 0.44, 1.32), (0.72, 0.5, 1.3)]
    parts.append(nk.quad_strip("tape", tape, 0.04, M["chevron"], up=(0, 0, 1)))
    parts.append(nk.quad_strip("tapeB", tape[::-1], 0.04, M["chevron"], up=(0, 0, -1)))
    # The optional parts.
    parts += nk.worker(M, 0.0, 0.35)
    parts += nk.beacon(M, (0.72, 0.8, 1.3), size=0.2)
    parts += nk.board(M, -0.72, 1.1, 0.0, 1.12)
    parts += nk.flag(M, -0.72, -1.3, 0.0, 1.8)
    out = finish(parts, "TrenchNear")
    for v in out.data.vertices:
        if v.co.z < 0.0:
            v.co.z = 0.0
    return out


# ---------------------------------------------------------------------------
# The crowd's cars (collision, wreck)
# ---------------------------------------------------------------------------


def crowd_shell(paint, glass, top_glass=True):
    """`cc.body`'s loft as a shell for `near_loft`: the same five sections
    (read now, so a crushed nose is picked up) and the same material strips."""
    sections = [(z, [s, w, r]) for z, s, w, r in cc.SECTIONS]

    def side(segment, strip):
        if strip == 0:
            return paint
        if strip == 1:
            return glass if segment == 1 else paint
        return {0: glass, 1: paint, 2: glass, 3: paint}[segment] if top_glass else paint

    def cap(end, band):
        if end == 0:
            return paint if band == 0 else glass
        return paint

    return sections, side, cap, 0.45


def car_near(M, name, paint, glass, top_glass=True, front=True, rear=True):
    """One crowd car in detail (about 900 triangles without wheels): the lean
    loft's sections lofted finer with rounded corners, door shut lines and
    handles, a belt moulding, sill trim, mirrors, bonnet lines, lamps,
    grille and plates. Returns (parts, skin)."""
    body, tree = fleet_near.near_loft(name, crowd_shell(paint, glass, top_glass), M, radius=lambda k: 0.05 if k == 3 else 0.035, spacing=0.45)
    skin = fleet_near.Skin([tree])
    seal, handle = M["bumper"], M["rim"]
    parts = [body]
    for s in (-1, 1):
        for z in (-0.5, 0.06):
            parts.append(fleet_near.flank(skin, "shut", seal, s, z - 0.006, z + 0.006, 0.26, 0.6, lift=0.004))
        parts.append(fleet_near.flank(skin, "handle", handle, s, -0.4, -0.3, 0.545, 0.565, lift=0.012))
        parts.append(fleet_near.flank(skin, "pillar", seal, s, -0.3, -0.23, 0.62, 0.88, lift=0.01, ny=2))
        parts.append(fleet_near.flank(skin, "sill", seal, s, -0.7, 0.55, 0.17, 0.21, lift=0.006, nz=2))
        parts.append(fleet_near.bead_on_flank(skin, "belt", seal, s, [(-0.92, 0.605), (-0.4, 0.605), (0.1, 0.605)], 0.012, 0.006))
        parts.append(slab("mirror", (0.07, 0.05, 0.08), (s * 0.5, 0.68, 0.06), M[paint], bev=0))
        parts.append(slab("mirrorArm", (0.05, 0.02, 0.03), (s * 0.44, 0.65, 0.04), seal, bev=0))
    for s in (-1, 1):
        parts.append(fleet_near.bead_on_deck(skin, "bonnetLine", M[paint], [(s * 0.16, 0.62), (s * 0.16, 0.8), (s * 0.13, 0.93)], 0.011, 0.005))
    if front:
        parts.append(fleet_near.nose(skin, "grille", M["chassis"], 1, -0.1, 0.1, 0.27, 0.36, lift=0.008, nx=3, ny=2))
        parts.append(fleet_near.nose(skin, "plateF", M["plate"], 1, -0.13, 0.13, 0.19, 0.25, lift=0.01))
        for s in (-1, 1):
            parts.append(fleet_near.nose(skin, "headlamp", M["lampWhite"], 1, s * 0.16, s * 0.3, 0.35, 0.44, lift=0.01, nx=2))
    if rear:
        parts.append(fleet_near.nose(skin, "plateR", M["plate"], -1, -0.13, 0.13, 0.3, 0.36, lift=0.01))
        for s in (-1, 1):
            parts.append(fleet_near.nose(skin, "tailLamp", M["lampRed"], -1, s * 0.24, s * 0.38, 0.4, 0.5, lift=0.01, nx=2))
    return [p for p in parts if p is not None], skin


def car_wheels(M, missing=(), flat=(), light=True):
    """Light near wheels at the crowd car's four corners."""
    parts = []
    r, w = cc.TYRE_R, 0.14
    for a in (1, -1):
        for s in (-1, 1):
            if (s, a) in missing:
                continue
            squash = (0.62, 1.08) if (s, a) in flat else None
            parts += nk.wheel("wheel", s * 0.42, r, a * cc.AXLE, r, w, M, sides=10, lugs=0 if light else 4, squash=squash, light=light)
    return parts


def arches(M, missing=()):
    parts = []
    for a in (1, -1):
        for s in (-1, 1):
            if (s, a) in missing:
                continue
            parts += arch("arch", s * 0.452, 0.19, a * cc.AXLE, 0.235, s, M, lip=False)
    return parts


def warning_triangle_near(M, side, pos, tilt):
    """A warning triangle (about 130 triangles): a red frame of three bars, a
    reflective panel inside, two folding legs behind."""
    h = side * math.sqrt(3) / 2
    a, b, c = (-side / 2, 0.0, 0.0), (side / 2, 0.0, 0.0), (0.0, h, 0.0)
    parts = [kit.strut("bar", p, q, (0.05, 0.02), M["warnTri"]) for p, q in ((a, b), (b, c), (c, a))]
    inner = 0.62
    ic = (0.0, h / 3, 0.0)
    pts = [tuple(ic[k] + (pnt[k] - ic[k]) * inner for k in range(3)) for pnt in (a, b, c)]
    for facing in (1, -1):
        bm = bmesh.new()
        vs = [bm.verts.new(B((p[0], p[1], facing * 0.006))) for p in (pts if facing > 0 else pts[::-1])]
        bm.faces.new(vs)
        parts.append(lp._obj("reflect", bm, M["plate"]))
    for sx in (-1, 1):
        parts.append(kit.strut("leg", (sx * side * 0.25, 0.3 * h, -0.005), (sx * side * 0.32, 0.0, -0.08), (0.014, 0.014), M["steelDark"]))
    turn = cc.app_matrix(x=pos[0], z=pos[2], pitch=0) @ cars._pitch(tilt)
    for obj in parts:
        obj.data.transform(turn)
    return parts


def hazard_lamp_near(M, pos):
    """The hazard lamp (about 70 triangles): a dome on a bracket, at the lean
    tetrahedron's point."""
    x, y, z = pos
    return [
        lathe("hazard", [(y - 0.05, 0.075), (y + 0.0, 0.085), (y + 0.06, 0.05), (y + 0.087, 0.0)], M["hazard"], base=(x, 0, z), sides=8),
        slab("hazardBase", (0.14, 0.03, 0.14), (x, y - 0.065, z), M["bumper"], bev=0),
    ]


def debris(M, spots, y=0.0):
    """Glass and plastic on the road: little flat shards, (x, z, size, turn)."""
    parts = []
    for i, (x, z, size, turn) in enumerate(spots):
        pts = [(x + math.cos(turn + k * 2.1) * size * (0.6 + 0.4 * ((k + i) % 2)), y + 0.006, z + math.sin(turn + k * 2.1) * size * (0.6 + 0.4 * ((k + i) % 2))) for k in range(3)]
        bm = bmesh.new()
        f = bm.faces.new([bm.verts.new(B(p)) for p in pts])
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        parts.append(lp._obj(f"shard{i}", bm, M["glassShard"]))
    return parts


def collision(M):
    cc_saved = list(cc.SECTIONS)
    struck, _ = car_near(M, "struck", "paintB", "carGlass")
    struck += car_wheels(M) + arches(M)
    cc.pose(struck, **cars.STRUCK)
    # The striker's nose crushed, as the lean car has it.
    cc.SECTIONS[3] = (0.5, (0.45, 0.16), (0.46, 0.6), (0.4, 0.72))
    cc.SECTIONS[4] = (0.98, (0.43, 0.2), (0.44, 0.5), (0.3, 0.66))
    striker, _ = car_near(M, "striker", "paintA", "carGlass", front=False)
    cc.SECTIONS[:] = cc_saved
    striker += [cars.crease(M["paintA"])] + car_wheels(M) + arches(M)
    cc.pose(striker, **cars.STRIKER)
    parts = [*struck, *striker,
             *warning_triangle_near(M, 0.46, (cars.STRUCK["x"] + 0.05, 0, -1.42), -0.2)]
    for p in (cars.STRUCK, cars.STRIKER):
        parts += hazard_lamp_near(M, cars.lamp_at(p))
    parts += debris(M, [(0.1, 0.55, 0.06, 0.3), (0.3, 0.8, 0.05, 1.1), (-0.15, 0.9, 0.07, 2.0), (0.65, 0.7, 0.05, 0.7), (-0.5, 0.2, 0.05, 1.7)])
    out = finish(parts, "CollisionNear")
    # The warning triangle's folded legs come to rest on the road, not in it.
    for v in out.data.vertices:
        if v.co.z < 0.0:
            v.co.z = 0.0
    return out


def wreck(M):
    s = cc.SECTIONS
    car, skin = car_near(M, "wreck", "paintA", "glassDark")
    missing, flat = {(-1, 1)}, {(1, -1)}
    car += car_wheels(M, missing=missing, flat=flat, light=False) + arches(M, missing=missing)
    # The bare hub where the wheel is gone: a disc, its hub, and the stub axle.
    r = cc.TYRE_R
    car += [
        lathe("disc", [(-0.44, 0.13), (-0.4, 0.13)], M["rustDark"], base=(0, r, cc.AXLE), sides=10, axis="x", cap_top=True),
        lathe("hubStub", [(-0.45, 0.05), (-0.36, 0.045)], M["steelDark"], base=(0, r, cc.AXLE), sides=6, axis="x", cap_bottom=True),
    ]
    # The windscreen crazed white, with cracks out of the point of impact.
    car.append(cc.top_quad("crazed", s[2][0] + 0.03, s[3][0] - 0.03, s[2][3][1] - 0.02, s[3][3][1] + 0.02, 0.33, 0.37, M["crazed"]))
    zc, yc = (s[2][0] + s[3][0]) / 2, (s[2][3][1] + s[3][3][1]) / 2
    for i, (dx, dz, ln) in enumerate(((0.3, 0.0, 0.3), (-0.25, 0.1, 0.25), (0.05, 0.16, 0.2), (-0.05, -0.1, 0.22), (0.2, -0.12, 0.18), (-0.3, -0.08, 0.2))):
        car.append(skin_line(skin, f"crack{i}", M["glassDark"], (0.05, zc), (0.05 + dx * ln * 3.0, zc + dz * ln * 2.0)))
    # A notice tucked under the wiper, and spray paint down the near flank.
    car.append(cc.top_quad("notice", zc - 0.1, zc + 0.02, yc - 0.0, yc + 0.02, 0.09, 0.09, M["chevron"], lift=0.02, x=-0.18))
    for k, (z0, z1) in enumerate(((-0.6, -0.1), (-0.5, 0.0), (-0.35, -0.05))):
        car.append(fleet_near.flank(skin, "spray", M["spray"], 1, z0, z1, 0.36 + k * 0.05, 0.375 + k * 0.05, lift=0.006, nz=2))
    car.append(cc.top_quad("rust", s[3][0] + 0.12, s[4][0] - 0.12, 0.615, 0.54, 0.3, 0.27, M["rust"], x=0.04))
    # Rust through the doors and sills, and the bumper hanging off at one end.
    for side in (-1, 1):
        car.append(fleet_near.flank(skin, "rustDoor", M["rust"], side, -0.35, -0.05, 0.28, 0.42, lift=0.008))
        car.append(fleet_near.flank(skin, "rustSill", M["rustDark"], side, 0.3, 0.75, 0.17, 0.24, lift=0.008, nz=2))
    car.append(lp_box_open_near("bumper", (0.86, 0.12, 0.1), (0.04, 0.2, cc.HALF + 0.03), M["bumper"], (0, 0, 0.3)))
    car.append(slab("bumperBracket", (0.05, 0.06, 0.05), (-0.3, 0.26, cc.HALF - 0.02), M["steelDark"], bev=0))
    cone_parts = nk.cone("roofCone", 0.06, -0.46, 0.36, 0.13, M, y=cc.roof_y(), pitch=0.12, roll=-0.1)
    posed = dict(x=0.04, z=0.0, yaw=0.0, roll=0.09, pitch=0.07)
    cc.pose(car, **posed)
    cc.pose(cone_parts, **posed)
    drop = -cc.lowest(car)
    lift = cc.Matrix.Translation((0, 0, drop))
    for obj in car + cone_parts:
        obj.data.transform(lift)
    ground = [
        cars.lp_disc("oil", 0.62, 12, 0.02, M["oil"], z=0.1),
        *debris(M, [(0.5, 0.9, 0.06, 0.4), (0.55, 0.55, 0.05, 1.4), (-0.55, -0.1, 0.05, 2.2), (0.3, 1.2, 0.05, 0.9)]),
        tuft("tuftA", -0.5, 0.95, 0.62, 0.15, M["tuft"], blades=10, seed=0.3),
        tuft("tuftB", 0.5, -1.12, 0.48, 0.13, M["tuft"], blades=8, seed=1.3),
        tuft("tuftC", -0.52, -0.4, 0.4, 0.12, M["tuft"], blades=8, seed=2.3),
        tuft("tuftD", 0.5, 0.35, 0.34, 0.1, M["tuft"], blades=6, seed=3.3),
    ]
    return finish(car + cone_parts + ground, "WreckNear")


def skin_line(skin, name, mat, p0, p1):
    """A thin dark line on the windscreen between two (x, z) points, lying on the car's top."""
    pts = []
    for k in range(3):
        t = k / 2
        x = p0[0] + (p1[0] - p0[0]) * t
        z = p0[1] + (p1[1] - p0[1]) * t
        y = skin.top_y(x, z)
        pts.append((x, (y if y is not None else 0.8) + 0.012, z))
    return nk.quad_strip(name, pts, 0.014, mat, up=(0, 1, 0))


def lp_box_open_near(name, size, pos, mat, rot):
    obj = kit.box(name, size, pos, mat, bev=0.01, rot=rot)
    return carkit.drop_faces(obj, lambda n: n.z < -0.9)


# ---------------------------------------------------------------------------
# The hoarding kit
# ---------------------------------------------------------------------------


def hoarding_kit(M):
    """The kit's pieces, in the frames `hoarding.py` gives them: sheets, bands
    and gates 1 m along x (stretched to length at run time), posts, notice,
    dirt and the optional parts, each spending what a plot's worth of them
    can afford (a hoarding is at most fifteen sheets, four bands, four posts,
    a gate, a notice and the four optional parts, 3,000 triangles in all)."""
    m = kit.material
    M = dict(M)
    M["sheetShade"] = m("paintA", "#ffffff", "timber", 0.8, tone=0.72)
    M["sheetAltShade"] = m("paintA", "#ffffff", "timber", 0.8, tone=0.66)
    top = hoarding.SHEET_TOP
    band_top = hoarding.BAND_TOP

    def sheet(key, shade, name):
        parts = [
            slab("sheet", (1.0, top - 0.03, 0.03), (0, (top + 0.03) / 2, 0), M[key], bev=0),
            # A darker kick board and a joint in the plywood, on the road face.
            lp.panel("kick", 1.0, 0.16, (0, 0.12, 0.0165), M[shade]),
            lp.panel("joint", 1.0, 0.012, (0, 0.63, 0.0165), M[shade]),
        ]
        # Studs and a rail on the plot side, and screws through the face.
        for x in (-0.46, 0.46):
            parts.append(slab("stud", (0.06, top - 0.08, 0.04), (x, (top + 0.03) / 2, -0.035), M["timberOld"], bev=0))
        parts.append(slab("hoardRail", (0.9, 0.06, 0.04), (0, 0.9, -0.035), M["timberOld"], bev=0))
        for x in (-0.46, 0.46):
            parts.append(bolt("screw", (x, 1.1, 0.015), "z", 0.012, 0.008, M["bolt"], sides=4))
        return finish(parts, name)

    band = finish([
        slab("band", (1.0, band_top - top, 0.1), (0, (band_top + top) / 2, 0), M["band"], bev=0.02),
        slab("drip", (1.0, 0.012, 0.115), (0, top + 0.006, 0), M["band"], bev=0),
    ], "HoardBandNear")
    post = finish([
        lathe("post", [(0.02, 0.062), (band_top - 0.02, 0.056), (band_top + 0.0, 0.056)], M["hoardPost"], sides=8),
        lathe("postCap", [(band_top, 0.066), (band_top + 0.03, 0.062), (band_top + 0.05, 0.0)], M["hoardPost"], sides=8),
        slab("postFoot", (0.18, 0.02, 0.18), (0, 0.01, 0), M["hoardPost"], bev=0),
        bolt("footBolt", (0.07, 0.02, 0.07), "y", 0.014, 0.012, M["bolt"], sides=4),
        bolt("footBoltB", (-0.07, 0.02, -0.07), "y", 0.014, 0.012, M["bolt"], sides=4),
    ], "HoardPostNear")
    # The gate: a steel frame with bars, a diagonal brace, hinges and a padlocked bolt.
    g0, g1 = 0.06, top
    gate_parts = [
        slab("frameL", (0.05, g1 - g0, 0.04), (-0.475, (g0 + g1) / 2, 0), M["gate"], bev=0),
        slab("frameR", (0.05, g1 - g0, 0.04), (0.475, (g0 + g1) / 2, 0), M["gate"], bev=0),
        slab("frameT", (1.0, 0.05, 0.04), (0, g1 - 0.025, 0), M["gate"], bev=0),
        slab("frameB", (1.0, 0.05, 0.04), (0, g0 + 0.025, 0), M["gate"], bev=0),
        slab("frameM", (0.9, 0.04, 0.04), (0, 0.62, 0), M["gate"], bev=0),
        kit.strut("gateBrace", (-0.45, g0 + 0.05, 0), (0.45, g1 - 0.05, 0), (0.035, 0.03), M["gate"]),
    ]
    for k in range(6):
        gate_parts.append(lp.tube("bar", (-0.4 + k * 0.16, g0 + 0.05, 0.0), (-0.4 + k * 0.16, g1 - 0.05, 0.0), 0.012, 0.012, M["mesh"], sides=4))
    for y in (0.3, 0.95):
        gate_parts.append(lathe("hinge", [(y - 0.05, 0.03), (y + 0.05, 0.03)], M["steelDark"], base=(-0.5, 0, 0.0), sides=6))
    gate_parts += [
        slab("latch", (0.1, 0.03, 0.03), (0.42, 0.62, 0.035), M["steelDark"], bev=0),
        slab("padlock", (0.05, 0.06, 0.03), (0.44, 0.56, 0.04), M["coneShade"], bev=0.008),
    ]
    gate = finish(gate_parts, "HoardGateNear")
    # The planning notice: a frame, the paper, a heading and lines of text, both sides.
    notice = []
    for f in (1, -1):
        rot = (0, 0 if f > 0 else math.pi, 0)
        notice.append(lp.panel("paper", 0.6, 0.42, (0, 0.9, f * 0.008), M["notice"], rot=rot))
        notice.append(lp.panel("heading", 0.5, 0.06, (0, 1.06, f * 0.009), M["signBlueDark"], rot=rot))
        for k, ln in enumerate((0.5, 0.46, 0.5, 0.36, 0.48, 0.3)):
            notice.append(lp.panel("text", ln, 0.014, (-(0.5 - ln) / 2, 0.98 - k * 0.055, f * 0.009), M["plateInk"], rot=rot))
    notice.append(slab("noticeFrame", (0.66, 0.5, 0.012), (0, 0.9, 0.0), M["steelDark"], bev=0))
    notice = finish(notice, "HoardNoticeNear")
    ground = finish([undulating("dirt", -0.5, 0.5, -0.5, 0.5, 0.012, 5, 5, M["dirt"], bump=0.02, seed=2.0)], "HoardGroundNear")
    optional = [
        finish(nk.worker(M, 0, 0), "HoardWorkerNear"),
        finish(nk.beacon(M, (0, 0.11, 0)), "HoardBeaconNear"),
        finish(nk.board_panel(M, (0, 0.27, 0), 0.54, edge_on=True, thick=0.04), "HoardStopNear"),
        finish(nk.flag(M, 0, 0, 0, 2.3), "HoardFlagNear"),
    ]
    return [sheet("sheet", "sheetShade", "HoardSheetNear"), sheet("sheetAlt", "sheetAltShade", "HoardSheetAltNear"), band, post, gate, notice, ground] + optional


# ---------------------------------------------------------------------------
# Build and preview
# ---------------------------------------------------------------------------

# Each form: (lean builder, near builder).
FORMS = {
    "fire": (forms.fire, fire),
    "collision": (cars.collision, collision),
    "wreck": (cars.wreck, wreck),
    "roadblock": (sf.roadblock, roadblock),
    "pothole": (sf.pothole, pothole),
    "signpost": (sf.signpost, signpost),
    "van": (forms.van, van),
    "scaffold": (forms.scaffold, scaffold),
    "trench": (sf.trench, trench),
    "survey": (sf.survey, survey),
}


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# Paint for previews only: the city paints these roles with instance colours.
PAINTS = {"paintA": "#b24a2a", "paintB": "#5f8fb0"}


def tint(objs, paints=PAINTS):
    done = set()
    for obj in objs:
        for mat in obj.data.materials:
            role = mat.name.split(".")[0]
            if mat.name in done or role not in paints:
                continue
            done.add(mat.name)
            mix = next(n for n in mat.node_tree.nodes if n.type == "MIX")
            k = kit.hex_linear(paints[role])
            a = mix.inputs["A"].default_value
            mix.inputs["A"].default_value = (a[0] * k[0], a[1] * k[1], a[2] * k[2], 1)


def preview(n=0, samples=16):
    """Form `n` of FORMS as a lean and a near model side by side, painted."""
    kit.reset()
    M = palette()
    name = list(FORMS)[n]
    lean_fn, near_fn = FORMS[name]
    lean = lean_fn(M)
    near = near_fn(M)
    gap = max(lean.dimensions.x, near.dimensions.x) / 2 + 0.5
    lean.location.x = -gap
    near.location.x = gap
    lp.bake_alone([lean, near], distance=0.4, floor=0.55, samples=samples)
    for obj in (lean, near):
        ck.unshade_glow(obj)
    print("TRIS", name, "lean", tris(lean), "near", tris(near))
    tint([lean, near])
    return [lean, near]


def build():
    kit.reset()
    M = palette()
    objs = [near(M) for _, near in FORMS.values()]
    objs += hoarding_kit(M)
    # Each piece is baked with the others hidden: they share one origin.
    lp.bake_alone(objs, distance=0.4, floor=0.55, samples=16)
    for obj in objs:
        ck.unshade_glow(obj)
        print("TRIS", obj.name, tris(obj))
    return objs
