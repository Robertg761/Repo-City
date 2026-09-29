"""
What stands in the road at an incident, NEAR level (`incident-props.glb`'s
detailed twin): the road cone, the barricade's boards and posts and the road
crew's sign, in the lean nodes' frames and on their footprints
(`blender/incidents/incident_props.py`).

  Cone            a weighted rubber foot with tread ribs, a sixteen-sided
                  cone with two sleeves of reflective sheeting and a rolled
                  nose, a carry ring at the tip
  BarricadeRails  two boards on end brackets, each with chevron sheeting
                  laid as separate reflective strips, rolled edges, a
                  stiffening rib behind and hanger hooks
  BarricadePost   a weighted foot with its slot, a post with a reflective
                  band, a cap and bolts
  WorksSign       a flanged board with an inset border, rivets, a figure
                  digging in place of the lean blocks, a lamp housing with a
                  hood and a lens, a battery box and a base plate with bolts

    blender -b --python blender/export.py -- blender/scenes_near/incident_props_near.py incident-props-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import incident_props as lean  # noqa: E402
import kit  # noqa: E402
from incident_props import bake_apart  # noqa: E402
from kit import B, box, cyl, finish, marker  # noqa: E402
from kit_near import Acc  # noqa: E402

RAIL_Y, RAIL_MID, POST_X = lean.RAIL_Y, lean.RAIL_MID, lean.POST_X


def palette():
    M = lean.palette()
    m = kit.material
    M["sheet"] = m("band", "#e6e1ca", "glass", 0.3)
    M["rubber"] = m("foot", "#3f443f", "fabric", 0.85, tone=0.75)
    M["orangeDark"] = m("orange", "#e8853c", "metal", 0.55, tone=0.8)
    return M


def cone(M):
    parts = lean.cone(M)
    a = Acc()
    base, height, r0, r1 = 0.06, 0.8, 0.25, 0.035
    # The foot: tread ribs across its top, chamfered corner lugs and a label.
    for k in range(5):
        a.box((0.5, 0.012, 0.016), (0, 0.066, -0.2 + k * 0.1), M["rubber"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.box((0.06, 0.03, 0.06), (sx * 0.25, 0.015, sz * 0.25), M["rubber"])
    # A rolled ring round the cone's shoulder, and the carry ring at its tip.
    a.disc((0, base + 0.05, 0), r0 - 0.003, 0.03, M["orange"], "y", 16, caps=(False, False))
    a.disc((0, base + height - 0.02, 0), 0.05, 0.03, M["orange"], "y", 12)
    a.ring((0, base + height + 0.03, 0), 0.028, 0.008, M["orange"], "y", 10, 4)
    # Vertical ribs on the cone's face, below the sleeves.
    for k in range(8):
        ang = 2 * math.pi * k / 8
        r = lambda h: r0 + (r1 - r0) * h / height  # noqa: E731
        for h0, h1 in ((0.05, 0.22),):
            a.tube((math.cos(ang) * (r(h0) + 0.004), base + h0, math.sin(ang) * (r(h0) + 0.004)),
                   (math.cos(ang) * (r(h1) + 0.004), base + h1, math.sin(ang) * (r(h1) + 0.004)), 0.006, 0.006, M["orange"], 4)
    return parts + a.objects("coneFit")


def rails(M):
    parts = lean.rails(M)
    a = Acc()
    lo, hi = RAIL_Y[0] - RAIL_MID, RAIL_Y[1] - RAIL_MID
    # Rolled edges and end caps on both boards, and a stiffening rib behind.
    for y in (lo, hi):
        for s in (-1, 1):
            a.box((2.6, 0.02, 0.09), (0, y + s * 0.135, 0), M["orange"] if y == lo else M["white"])
            a.box((0.025, 0.28, 0.09), (s * 1.3, y, 0), M["dark"])
        a.box((2.4, 0.03, 0.02), (0, y, -0.048), M["steel"])
    # Reflective sheet strips over the chevrons' bases, at both ends of each board.
    for y, mat in ((lo, M["sheet"]), (hi, M["sheet"])):
        for face in (-1, 1):
            for s in (-1, 1):
                a.box((0.12, 0.24, 0.006), (s * 1.16, y, face * 0.037), mat)
    # Hanger hooks and bolts at the brackets.
    for x in (-POST_X, POST_X):
        for y in (lo, hi):
            a.box((0.2, 0.12, 0.13), (x, y, 0), M["steel"])
            for dx in (-0.07, 0.07):
                a.disc((x + dx, y, 0.068), 0.013, 0.012, M["dark"], "z", 6)
                a.disc((x + dx, y, -0.068), 0.013, 0.012, M["dark"], "z", 6)
        a.tube((x, lo, 0), (x, hi, 0), 0.02, 0.02, M["steel"], 6)
    return parts + a.objects("railsFit")


def post(M):
    parts = lean.post(M)
    a = Acc()
    # The foot's slot and rubber lugs, the reflective band and the cap's bolts.
    a.box((0.14, 0.02, 0.36), (0, 0.13, 0), M["dark"])
    for z in (-0.24, 0.24):
        a.box((0.3, 0.05, 0.05), (0, 0.025, z), M["foot"])
    for y0, y1 in ((0.72, 0.86), (0.92, 0.98)):
        for side in (-1, 1):
            a.box((0.126, y1 - y0, 0.006), (0, (y0 + y1) / 2, side * 0.063), M["sheet"])
            a.box((0.006, y1 - y0, 0.126), (side * 0.063, (y0 + y1) / 2, 0), M["sheet"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.disc((sx * 0.055, 1.145, sz * 0.055), 0.01, 0.012, M["dark"], "y", 6)
    a.box((0.22, 0.03, 0.22), (0, 0.13, 0), M["steel"])
    return parts + a.objects("postFit")


def works_sign(M):
    import bpy

    parts = lean.works_sign(M)
    # The lean sign's blocky figure is replaced by a jointed one below.
    for part in [p for p in parts if p.name in ("head", "torso", "spade")]:
        parts.remove(part)
        bpy.data.objects.remove(part, do_unlink=True)
    a = Acc()
    # Rivets round the border, a rolled flange on the board's edge.
    for k in range(9):
        x = -0.72 + k * 0.18
        for y in (3.0, 2.0):
            a.disc((x, y, 0.044), 0.011, 0.01, M["steel"], "z", 6)
    for k in range(4):
        y = 2.1 + k * 0.27
        for x in (-0.72, 0.72):
            a.disc((x, y, 0.044), 0.011, 0.01, M["steel"], "z", 6)
    for s in (-1, 1):
        a.box((1.7, 0.02, 0.05), (0, 2.5 + s * 0.61, 0.0), M["orange"])
        a.box((0.02, 1.2, 0.05), (s * 0.86, 2.5, 0.0), M["orange"])
    # A figure digging: a rounded head, torso, arms and the spade, in dark.
    a.disc((-0.14, 2.86, 0.043), 0.055, 0.012, M["dark"], "z", 10)
    a.rod((-0.1, 2.8, 0.044), (-0.02, 2.6, 0.044), 0.09, 0.012, M["dark"], ends=True)
    a.rod((-0.02, 2.7, 0.044), (0.16, 2.58, 0.044), 0.04, 0.012, M["dark"], ends=True)
    a.rod((-0.03, 2.68, 0.044), (-0.16, 2.56, 0.044), 0.04, 0.012, M["dark"], ends=True)
    a.rod((-0.03, 2.6, 0.044), (-0.14, 2.42, 0.044), 0.045, 0.012, M["dark"], ends=True)
    a.rod((-0.03, 2.6, 0.044), (0.06, 2.42, 0.044), 0.045, 0.012, M["dark"], ends=True)
    a.rod((0.16, 2.58, 0.044), (0.3, 2.46, 0.044), 0.028, 0.012, M["dark"], ends=True)
    a.box((0.14, 0.02, 0.014), (0.3, 2.45, 0.044), M["dark"], rot=(0, 0, 0.3))
    # Heaped soil beside the spade, and reflective corner sheeting.
    for s in (-1, 1):
        a.box((0.14, 0.14, 0.006), (s * 0.7, 2.94, 0.043), M["sheet"])
    # Lamp: a hooded housing, a lens, a bracket and a battery box behind.
    a.box((0.2, 0.03, 0.2), (0, 3.245, 0.0), M["dark"])
    a.box((0.22, 0.03, 0.06), (0, 3.28, 0.09), M["dark"], rot=(-0.3, 0, 0))
    a.box((0.06, 0.12, 0.04), (0, 3.09, 0.0), M["steel"])
    a.box((0.28, 0.34, 0.16), (0, 2.5, -0.17), M["dark"])
    a.box((0.2, 0.02, 0.1), (0, 2.68, -0.17), M["steel"])
    a.tube((0, 2.5, -0.09), (0, 2.5, -0.06), 0.03, 0.03, M["steel"], 8)
    # Base plate bolts and a lifting handle on the foot; band clamps on the post.
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.hexnut((sx * 0.25, 0.155, -0.08 + sz * 0.25), 0.02, 0.02, M["steel"], "y")
    a.ring((0.0, 0.15, 0.3), 0.06, 0.012, M["steel"], "y", 10, 5)
    for y in (2.2, 2.8):
        a.disc((0, y, -0.08), 0.085, 0.05, M["steel"], "y", 10, caps=(False, False))
        a.box((0.05, 0.05, 0.06), (0, y, -0.03), M["steel"])
    for y in (0.5, 1.1, 1.7):
        a.disc((0, y, -0.08), 0.074, 0.02, M["steel"], "y", 8)
    return parts + a.objects("signFit")


def build():
    kit.reset()
    M = palette()
    objs = [
        finish(cone(M), "Cone"),
        finish(rails(M), "BarricadeRails"),
        finish(post(M), "BarricadePost"),
        finish(works_sign(M), "WorksSign"),
    ]
    bake_apart(objs, {"BarricadeRails": RAIL_MID})
    return objs + [marker("sign.lamp", (0, 3.3, 0))]


def preview(_):
    import bpy

    objs = build()
    cone_obj, rails_obj, post_obj, sign = objs[:4]
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
