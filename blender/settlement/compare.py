"""
Procedural vs Blender for the settlement buildings, under stage.py's light.
Spike tooling.

    blender -b --python blender/settlement/compare.py -- <out-prefix> a.ply [b.ply ...]

Sources stand left to right along +X, 1.5 apart. Renders `-front` (a street
three-quarter from the door side, about eye level of the orbit camera),
`-high` (the city camera's pitch) and `-rear`. With CLUSTER=1 each source
is a cluster (a lane of houses) rendered alone, centred, as `-<name>-city`
(the city camera) and `-<name>-low`.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import stage  # noqa: E402
from mathutils import Vector  # noqa: E402


def cluster(prefix, sources):
    """Each cluster alone at the origin, from the same two cameras, so a pair
    of renders compares like with like."""
    for source in sources:
        stage.clear()
        stage.world_and_light()
        objs = stage.import_ply(os.path.abspath(source))
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        print(f"TRIANGLES {os.path.basename(source)} {tris}")
        centre = Vector((0.0, 0.0, 1.5))
        views = [
            ("city", stage.camera("city", centre, 42, -30, 50)),
            ("low", stage.camera("low", centre, 30, -20, 22)),
        ]
        name = os.path.splitext(os.path.basename(source))[0]
        stage.render(f"{prefix}-{name}", views, size=(1400, 800), samples=int(os.environ.get("SAMPLES", "48")))


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    prefix, sources = argv[0], argv[1:]
    if os.environ.get("CLUSTER"):
        cluster(prefix, sources)
        return
    stage.clear()
    stage.world_and_light()
    x = 0.0
    everything = []
    for source in sources:
        objs = stage.import_ply(os.path.abspath(source))
        lo, hi = stage.bounds(objs)
        for obj in objs:
            obj.location.x += x - lo.x
        x += (hi.x - lo.x) + 1.5
        everything += objs
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        print(f"TRIANGLES {os.path.basename(source)} {tris}")
    bpy.context.view_layer.update()
    lo, hi = stage.bounds(everything)
    height = hi.z - lo.z
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, height * 0.4))
    span = max(hi.x - lo.x, height * 1.4)
    views = [
        ("front", stage.camera("front", centre, span * 1.55, -32, 14)),
        ("high", stage.camera("high", centre, span * 1.9, -38, 48)),
        ("rear", stage.camera("rear", centre, span * 1.55, 150, 20)),
    ]
    stage.render(prefix, views, size=(1400, 700), samples=int(os.environ.get("SAMPLES", "48")))


if __name__ == "__main__":
    main()
