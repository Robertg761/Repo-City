"""
A stage for the building archetypes (spike tooling). Renders PLYs written by
`export-procedural.test.ts` -- procedural and Blender drafts, stretched to a
representative instance size and painted the way the instanced mesh paints
them -- under `blender/stage.py`'s sky and sun.

    blender -b --python blender/buildings/bstage.py -- pair <out-prefix> <a.ply> <b.ply>
    blender -b --python blender/buildings/bstage.py -- cluster <out-prefix> <ids...>

`pair` puts two buildings side by side and renders a street-corner view, a
three-quarter overview and a high city view. `cluster` lays the same few
archetypes out as a block twice, procedural on the left and Blender on the
right, and renders it from the city camera.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import stage  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out", "buildings")


def place(path, x, y=0.0):
    [obj] = stage.import_ply(path)
    obj.location.x += x
    obj.location.y += y
    return obj


def setup():
    stage.clear()
    stage.world_and_light()
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.scale = (6, 6, 1)


def pair(prefix, a, b):
    setup()
    objs = []
    x = 0.0
    for path in (a, b):
        obj = place(path, 0)
        lo, hi = stage.bounds([obj])
        obj.location.x = x - lo.x
        x += (hi.x - lo.x) + 3.0
        objs.append(obj)
    bpy.context.view_layer.update()
    lo, hi = stage.bounds(objs)
    h = hi.z
    span = max(hi.x - lo.x, h * 1.25)
    centre = Vector(((lo.x + hi.x) / 2, 0, h * 0.5))
    views = [
        ("front34", stage.camera("front34", centre, span * 1.45, -32, 14)),
        ("rear34", stage.camera("rear34", centre, span * 1.45, 148, 22)),
        ("city", stage.camera("city", Vector((centre.x, 0, h * 0.35)), span * 2.0, -38, 50)),
    ]
    stage.render(prefix, views, size=(1200, 760), samples=40)


def cluster(prefix, ids):
    setup()
    cols = math.ceil(math.sqrt(len(ids)))
    pitch = 11.0
    objs = []
    for side, tag in ((0, "proc"), (1, "bl")):
        ox = side * (cols * pitch + 8)
        for i, id_ in enumerate(ids):
            path = os.path.join(OUT, f"{tag}-{id_}.ply")
            if not os.path.exists(path):
                path = os.path.join(OUT, f"proc-{id_}.ply")
            objs.append(place(path, ox + (i % cols) * pitch, -(i // cols) * pitch))
    bpy.context.view_layer.update()
    lo, hi = stage.bounds(objs)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, max(5, hi.z * 0.35)))
    span = max(hi.x - lo.x, hi.z * 1.6)
    views = [
        ("city", stage.camera("city", centre + Vector((0, 0, 4)), span * 2.0, -28, 36)),
        ("high", stage.camera("high", centre, span * 1.8, -18, 62)),
    ]
    stage.render(prefix, views, size=(1500, 820), samples=40)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    mode, prefix = argv[0], argv[1]
    if mode == "pair":
        pair(prefix, argv[2], argv[3])
    else:
        cluster(prefix, argv[2:])


main()
