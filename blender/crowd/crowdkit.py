"""
Helpers for the issue crowd's forms (`components/city/backlog/forms.ts`),
on top of `blender/kit.py` and `blender/props/lowpoly.py`. Spike tooling.

A crowd vertex carries a PART (what the crowd shader does with it) and a
weight. Blender has no place for those, so they ride in the material ROLE,
and `blenderFormGroups` in forms.ts reads them back:

  paintA, paintB     body, paint slot 1 / 2 (modelled white / near white)
  flame...           flame; the weight is height up the flame, from forms.ts
  amber..., hazard...  always-on lamps
  worker...          optional worker (mask bit 0), weight 1
  beacon...          optional failing-checks beacon
  board...           optional stop board
  flag...            optional approval flag; weight is out along the cloth
  weed...            overgrowth
  anything else      body, its own colour

Every role must have its own colour within a node (the TypeScript side finds
a part's role by its colour), which `blender-forms.test.ts` checks.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402

HIVIS = "#e6c02f"
HELMET = "#f0d44a"
SKIN = "#c99f7d"
LEGS = "#35404b"
POST = "#6b6f6d"
BEACON_RED = "#ff3b30"
BOARD_RED = "#d8392f"
FLAG_GREEN = "#5e9a6a"

# Parts that shine: their occlusion is reset to 1 after the bake, or the
# glow the shader derives from their colour would come out dirty.
GLOWING = ("flame", "amber", "hazard", "beacon")


def mats():
    m = kit.material
    return {
        "vest": m("worker", HIVIS, "fabric", 0.9),
        "skin": m("workerSkin", SKIN, "plaster", 0.8),
        "helmet": m("workerHelmet", HELMET, "metal", 0.5),
        "legs": m("workerLegs", LEGS, "fabric", 0.9),
        "beacon": m("beacon", BEACON_RED, "metal", 0.4),
        "board": m("board", BOARD_RED, "metal", 0.6),
        "boardPost": m("boardPost", "#6b6f6e", "metal", 0.6),
        "flagPole": m("flagPole", "#6b6f6c", "metal", 0.6),
        "flag": m("flag", FLAG_GREEN, "fabric", 0.9),
    }


def worker(M, x, z, y0=0.0, turn=0.0):
    """A worker in a hi-vis vest and a hard hat, 35 triangles (the
    procedural one is three boxes, 36): legs, a vest that narrows to the
    shoulders, a head, and a dome of a helmet."""
    return [
        lp.tube("legs", (x, y0, z), (x, y0 + 0.42, z), 0.12, 0.13, M["legs"], sides=4, turn=math.pi / 4 + turn,
                squash=0.62),
        lp.tube("vest", (x, y0 + 0.4, z), (x, y0 + 0.76, z), 0.17, 0.13, M["vest"], sides=5, cap1=True,
                turn=math.pi / 2 + turn, squash=0.7),
        lp.tube("head", (x, y0 + 0.74, z), (x, y0 + 0.97, z), 0.1, 0.105, M["skin"], sides=4,
                turn=math.pi / 4 + turn),
        lp.cone("helmet", [(math.cos(a) * 0.15, math.sin(a) * 0.15, 0) for a in
                           (turn + i * math.pi / 3 for i in range(6))],
                y0 + 0.94, y0 + 1.07, M["helmet"], centre=(x, z), under="open"),
    ]


def beacon(M, pos, size=0.22):
    """The failing-checks lamp, 12 triangles, as the procedural one."""
    return [kit.box("beacon", (size, size, size), pos, M["beacon"], bev=0)]


def board(M, x, z, y0, height, size=0.56, edge_on=True):
    """A red stop board on a post: 8 + 12 triangles."""
    return [
        lp.tube("boardPost", (x, y0, z), (x, y0 + height, z), 0.035, 0.035, M["boardPost"], sides=4),
        kit.box("board", (0.05, size, size) if edge_on else (size, size, 0.05),
                (x, y0 + height + size / 2 - 0.1, z), M["board"], bev=0),
    ]


def flag(M, x, z, y0, top):
    """The approval flag: a pole and a cloth out along +x, a quad each way
    (12 triangles; the procedural one is 24)."""
    pole = lp.tube("flagPole", (x, y0, z), (x, top, z), 0.03, 0.025, M["flagPole"], sides=4, cap1=True)
    cloth = [
        lp.panel("flag", 0.72, 0.44, (x + 0.39, top - 0.26, z + 0.004), M["flag"]),
        lp.panel("flag", 0.72, 0.44, (x + 0.39, top - 0.26, z - 0.004), M["flag"], rot=(0, math.pi, 0)),
    ]
    return [pole, *cloth]


def unshade_glow(obj):
    """Occlusion 1 on every face whose material shines."""
    mesh = obj.data
    ao = mesh.color_attributes["AO"].data
    glow = {i for i, m in enumerate(mesh.materials) if m.name.split(".")[0].startswith(GLOWING)}
    for poly in mesh.polygons:
        if poly.material_index in glow:
            for li in poly.loop_indices:
                ao[li].color = (1.0, 1.0, 1.0, 1.0)
