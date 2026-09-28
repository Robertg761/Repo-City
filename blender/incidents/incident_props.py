"""
What lies in the road at an incident, modelled by script (spike: Blender
assets vs procedural): the road cone, the barricade and the road crew's
sign from `incidentDecor.ts`, each at the procedural one's size, as separate
nodes the scene places and turns:

  Cone             origin on the ground at its centre (the scene stands it
                   on the incident's dark patch)
  BarricadeRails   the two boards, built about their middle (the scene lifts
                   them to 0.785), so they can be knocked askew about their
                   centre as the procedural ones are
  BarricadePost    one post on its foot, origin on the ground; the scene
                   stands one at each end of the rails
  WorksSign        the post, the board and its lamp, origin on the ground
                   at the post; `sign.lamp` marks the lamp's lens

Colours are the procedural ones, so the scene shades them the same way
(fresh at a live incident, faded at a stale one).
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit  # noqa: E402
from kit import B, box, cyl, finish, marker  # noqa: E402

RAIL_Y = (0.62, 0.95)
RAIL_MID = sum(RAIL_Y) / 2
POST_X = 1.1


def palette():
    m = kit.material
    return {
        "orange": m("orange", "#e8853c", "metal", 0.55),
        "white": m("stripe", "#e8e3d6", "metal", 0.55),
        "band": m("band", "#e6e1ca", "glass", 0.35),
        "foot": m("foot", "#3f443f", "fabric", 0.85),
        "post": m("post", "#cfcabd", "concrete", 0.8),
        "steel": m("steel", "#6b6f6d", "metal", 0.45, 0.3),
        "dark": m("dark", "#2f3330", "metal", 0.6),
        "lens": m("lens", "#ffb347", "glass", 0.2),
    }


def face_prism(name, pts, z, depth, mat):
    """A flat shape of app (x, y) points, `depth` thick along z about `z`:
    kit's prisms push side profiles and plans, not faces."""
    bm = bmesh.new()
    verts = [bm.verts.new(B((x, y, z - depth / 2))) for x, y in pts]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=B((0, 0, depth)) - B((0, 0, 0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._object(name, bm, mat)


def stripes(name, x0, x1, y, h, z, mat, pitch=0.42, width=0.14, slope=0.16):
    """Diagonal hazard stripes edge to edge across a board face: parallelograms
    from the board's foot to its top, leaning `slope` along x."""
    parts = []
    x = x0 + width
    while x + slope < x1 - 0.02:
        lo, hi = y - h / 2, y + h / 2
        parts.append(face_prism(name, [(x, lo), (x + width, lo), (x + width + slope, hi), (x + slope, hi)], z, 0.012, mat))
        x += pitch
    return parts


def cone(M):
    parts = [box("foot", (0.56, 0.06, 0.56), (0, 0.03, 0), M["foot"], bev=0.02)]
    base, height, r0, r1 = 0.06, 0.8, 0.25, 0.035
    parts.append(cyl("cone", r0, height, (0, base + height / 2, 0), M["orange"], axis="y", verts=12, radius2=r1))
    radius = lambda h: r0 + (r1 - r0) * h / height  # noqa: E731
    # Two reflective sleeves, following the taper a hair proud of it.
    for h0, h1 in ((0.24, 0.33), (0.46, 0.54)):
        parts.append(cyl("sleeve", radius(h0) + 0.006, h1 - h0, (0, base + (h0 + h1) / 2, 0), M["band"], axis="y", verts=12, radius2=radius(h1) + 0.006))
    return parts


def rails(M):
    """Built about their middle: y is relative to `RAIL_MID`."""
    parts = []
    lo, hi = RAIL_Y[0] - RAIL_MID, RAIL_Y[1] - RAIL_MID
    parts.append(box("railLow", (2.6, 0.26, 0.07), (0, lo, 0), M["orange"], bev=0.02))
    parts.append(box("railHigh", (2.6, 0.26, 0.07), (0, hi, 0), M["white"], bev=0.02))
    # Diagonal stripes on both faces of the white board, and on the orange one
    # white ones, so each board reads as "hazard" from either side.
    for face in (-1, 1):
        parts += stripes("chev", -1.28, 1.28, hi, 0.24, face * 0.04, M["orange"])
        parts += stripes("chevL", -1.07, 1.28, lo, 0.24, face * 0.04, M["white"])
    # Brackets where the boards meet the posts.
    for x in (-POST_X, POST_X):
        for y in (lo, hi):
            parts.append(box("bracket", (0.18, 0.1, 0.1), (x, y, 0), M["steel"], bev=0.0))
    return parts


def post(M):
    return [
        box("postFoot", (0.26, 0.12, 0.56), (0, 0.06, 0), M["foot"], bev=0.03),
        box("post", (0.12, 1.02, 0.12), (0, 0.6, 0), M["post"], bev=0.02),
        box("postCap", (0.16, 0.04, 0.16), (0, 1.12, 0), M["steel"], bev=0.0),
    ]


def works_sign(M):
    parts = [
        box("signFoot", (0.6, 0.14, 0.6), (0, 0.07, -0.08), M["foot"], bev=0.03),
        cyl("signPost", 0.07, 2.96, (0, 1.48, -0.08), M["steel"], axis="y", verts=8),
        box("board", (1.7, 1.2, 0.07), (0, 2.5, 0), M["orange"], bev=0.02),
    ]
    # A white border inset from the edge, proud of the face.
    for w, h, x, y in ((1.5, 0.06, 0, 3.0), (1.5, 0.06, 0, 2.0), (0.06, 1.0, -0.72, 2.5), (0.06, 1.0, 0.72, 2.5)):
        parts.append(box("border", (w, h, 0.012), (x, y, 0.038), M["white"], bev=0.0))
    # The dark bar the procedural sign carries, and a shovel's worth of
    # symbol over it: a figure leaning on a spade.
    parts.append(box("bar", (1.2, 0.26, 0.014), (0, 2.34, 0.04), M["dark"], bev=0.0))
    parts.append(box("head", (0.12, 0.12, 0.014), (-0.08, 2.84, 0.04), M["dark"], bev=0.0))
    parts.append(box("torso", (0.12, 0.3, 0.014), (-0.02, 2.64, 0.04), M["dark"], bev=0.0, rot=(0, 0, -0.35)))
    parts.append(box("spade", (0.04, 0.34, 0.014), (0.2, 2.62, 0.04), M["dark"], bev=0.0, rot=(0, 0, 0.5)))
    # Back braces, and the lamp on top.
    for y in (2.2, 2.8):
        parts.append(box("brace", (1.5, 0.06, 0.04), (0, y, -0.055), M["steel"], bev=0.0))
    parts.append(box("lampHouse", (0.18, 0.12, 0.14), (0, 3.16, 0), M["dark"], bev=0.02))
    parts.append(cyl("lampLens", 0.07, 0.1, (0, 3.27, 0), M["lens"], axis="y", verts=8))
    return parts


def bake_apart(objs, lift=None, floor=0.55):
    """Bake each object's occlusion alone on the ground (at `lift[name]` above
    it), then put every object back on its origin."""
    lift = lift or {}
    for i, obj in enumerate(objs):
        obj.location = ((i - (len(objs) - 1) / 2) * 5.0, 0, lift.get(obj.name, 0.0))
    kit.bake_ao(objs, floor=floor)
    for obj in objs:
        obj.location = (0, 0, 0)


def build():
    kit.reset()
    M = palette()
    objs = [
        finish(cone(M), "Cone"),
        finish(rails(M), "BarricadeRails"),
        finish(post(M), "BarricadePost"),
        finish(works_sign(M), "WorksSign"),
    ]
    # Every node keeps its origin at 0: the rails are built about their own
    # middle, and the scene lifts them to `RAIL_MID`. For the bake they are
    # spread apart, and the rails stood where they will stand, so that none
    # shades another and the ground shades each as it will in the street.
    bake_apart(objs, {"BarricadeRails": RAIL_MID})
    return objs + [marker("sign.lamp", (0, 3.3, 0))]


def preview(_):
    """The props laid out as the stale scene's barricade and the minor scene's
    cones and sign, for looking at together."""
    import math

    objs = build()
    cone_obj, rails_obj, post_obj, sign = objs[:4]
    import bpy

    for i, x in enumerate((0.9, 1.6, 2.3)):
        c = cone_obj.copy()
        bpy.context.scene.collection.objects.link(c)
        c.location = (x, 1.6, 0)
    rails_obj.location = (0, 0, RAIL_MID)
    rails_obj.rotation_euler = (0, math.radians(-6), 0)
    p2 = post_obj.copy()
    bpy.context.scene.collection.objects.link(p2)
    post_obj.location = (-POST_X, 0, 0)
    p2.location = (POST_X, 0, 0)
    sign.location = (4.0, 0, 0)
    return objs
