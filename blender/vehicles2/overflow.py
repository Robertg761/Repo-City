"""
The signboard at the city limits (`Overflow.tsx`), modelled by script.

    blender -b --python blender/export.py -- blender/vehicles2/overflow.py overflow-sign

Same footprint, board size and posts as the procedural sign: the plot is six
units wide, the board 5.3 x 2.7 with a 12 cm border, 22 cm deep, its centre
3.55 up, a post at each end 2.9 out and 5 tall, a concrete footing under each,
and a hazard rail at the foot. What the loft buys: the board's border stands
up as a raised lip round each face, the posts have caps and base plates, and
the rail is striped instead of one flat orange.

Nodes:
  Frame  posts, footings, board and rail, occlusion baked in. Coloured; the
         city tints it as one.
  Faces  the two sheets the sign's text is painted on, as bare quads: the
         runtime gives them UVs from their positions.
Markers `board.front` and `board.back` are the middle of each sheet.
"""

import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fleet"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
from kit import B  # noqa: E402

# `BOARD` and `POST_X` in Overflow.tsx.
BOARD_W, BOARD_H, BOARD_D, BOARD_Y = 5.3, 2.7, 0.22, 3.55
POST_X = BOARD_W / 2 + 0.12 + 0.13
POST_H = BOARD_Y + BOARD_H / 2 + 0.1
BORDER = 0.12
FACE_Z = BOARD_D / 2 + 0.01


def materials():
    m = kit.material
    return {
        "post": m("post", "#6f7270", "metal", 0.6),
        "frame": m("frame", "#e9e5d8", "metal", 0.6),
        "stripe": m("stripe", "#e8853c", "metal", 0.6),
        "rail": m("rail", "#3b3d3f", "metal", 0.6),
        "footing": m("footing", "#8f8b80", "concrete", 0.9),
        "face": m("face", "#1f5a46", "metal", 0.55),
    }


def rect(w, h, z, y=BOARD_Y):
    return [(-w / 2, y - h / 2, z), (w / 2, y - h / 2, z), (w / 2, y + h / 2, z), (-w / 2, y + h / 2, z)]


def lip(side, M):
    """The raised border round a face: an outer slope up from the slab's edge
    to a flat crest, then an inner slope down to just above the face."""
    z0 = side * BOARD_D / 2
    outer = rect(BOARD_W + 2 * BORDER, BOARD_H + 2 * BORDER, z0)
    crest = rect(BOARD_W + 2 * BORDER - 0.1, BOARD_H + 2 * BORDER - 0.1, z0 + side * 0.05)
    inner = rect(BOARD_W, BOARD_H, side * (FACE_Z + 0.005))
    bm = bmesh.new()
    for ring_a, ring_b in ((outer, crest), (crest, inner)):
        va = [bm.verts.new(B(p)) for p in ring_a]
        vb = [bm.verts.new(B(p)) for p in ring_b]
        for i in range(4):
            j = (i + 1) % 4
            f = bm.faces.new([va[i], va[j], vb[j], vb[i]])
            carkit._orient(bm, f, B((0, 0, side)))
    return kit._object("lip", bm, M["frame"])


def board(M):
    slab = kit.box("slab", (BOARD_W + 2 * BORDER, BOARD_H + 2 * BORDER, BOARD_D), (0, BOARD_Y, 0), M["frame"], bev=0.0)
    # The lips cover the faces of the slab.
    carkit.drop_faces(slab, lambda n: abs(n.y) > 0.9)
    return [slab, lip(1, M), lip(-1, M)]


def post(x, M):
    """A post from its footing up, a cap, and a plate at its foot."""
    parts = [
        carkit.lidless_box("post", (0.26, POST_H - 0.05 - 0.33, 0.26), (x, (POST_H - 0.05 + 0.33) / 2, 0), M["post"]),
        # The cap overhangs the post outward only: inward it would run into the board.
        kit.box("cap", (0.3, 0.05, 0.34), (x + (0.02 if x > 0 else -0.02), POST_H - 0.025, 0), M["post"], bev=0.0),
        carkit.lidless_box("plate", (0.36, 0.03, 0.36), (x, 0.315, 0), M["post"]),
        carkit.lidless_box("footing", (0.4, 0.3, 1.1), (x, 0.15, 0), M["footing"]),
    ]
    return parts


def rail(M):
    """The hazard rail under the board: a dark bar, and orange stripes leaning
    across its two faces."""
    y = BOARD_Y - BOARD_H / 2 - 0.2
    parts = [kit.box("rail", (BOARD_W, 0.2, BOARD_D + 0.04), (0, y, 0), M["rail"], bev=0.0)]
    z = (BOARD_D + 0.04) / 2 + 0.003
    pitch, run, lean = 0.6, 0.3, 0.2
    a = -BOARD_W / 2
    while a + run + lean <= BOARD_W / 2 + 1e-6:
        for side in (1, -1):
            zz = side * z
            corners = [(a, y - 0.1, zz), (a + run, y - 0.1, zz), (a + run + lean, y + 0.1, zz), (a + lean, y + 0.1, zz)]
            parts.append(carkit.quad("stripe", corners, M["stripe"], (0, 0, side)))
        a += pitch
    return parts


def frame(M):
    parts = board(M) + rail(M)
    for x in (-POST_X, POST_X):
        parts += post(x, M)
    return parts


def faces(M):
    parts = []
    for side in (1, -1):
        z = side * FACE_Z
        corners = [(-BOARD_W / 2, BOARD_Y - BOARD_H / 2, z), (BOARD_W / 2, BOARD_Y - BOARD_H / 2, z),
                   (BOARD_W / 2, BOARD_Y + BOARD_H / 2, z), (-BOARD_W / 2, BOARD_Y + BOARD_H / 2, z)]
        parts.append(carkit.quad("face", corners, M["face"], (0, 0, side)))
    return parts


def build():
    kit.reset()
    M = materials()
    sign = kit.finish(frame(M), "Frame")
    kit.bake_ao([sign], distance=0.5, samples=128, floor=0.55)
    sheets = kit.finish(faces(M), "Faces")
    kit.marker("board.front", (0, BOARD_Y, FACE_Z))
    kit.marker("board.back", (0, BOARD_Y, -FACE_Z))
    for o in (sign, sheets):
        print("TRIS", o.name, carkit.triangles(o))
    return [sign, sheets] + [o for o in bpy.data.objects if o.type == "EMPTY"]


def preview(n=0):
    return build()
