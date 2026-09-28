"""
`blender/stage.py` framed for buildings: the same ground, sun and cameras,
aimed at the middle of the buildings' height rather than at a truck's.

    blender -b --python blender/civic/stage_civic.py -- <out-prefix> <a.ply> [b.ply ...]
"""

import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import stage  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    prefix, sources = argv[0], argv[1:]
    stage.clear()
    stage.world_and_light()
    x = 0.0
    groups = []
    for source in sources:
        objs = stage.load(os.path.abspath(source))
        lo, hi = stage.bounds(objs)
        for obj in objs:
            obj.location.x += x - lo.x
        x += (hi.x - lo.x) + 2.0
        groups.append(objs)
    import bpy

    bpy.context.view_layer.update()
    lo, hi = stage.bounds([o for g in groups for o in g])
    for g, source in zip(groups, sources):
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in g if o.type == "MESH")
        print(f"TRIANGLES {os.path.basename(source)} {tris}")
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (hi.z - lo.z) * 0.4))
    span = max(hi.x - lo.x, hi.z - lo.z)
    views = [
        ("front34", stage.camera("front34", centre, span * 2.3, -30, 20)),
        ("rear34", stage.camera("rear34", centre, span * 2.3, 150, 28)),
        ("city", stage.camera("city", centre, span * 2.6, -40, 48)),
    ]
    stage.render(prefix, views, size=(1200, 700), samples=32)


if __name__ == "__main__":
    main()
