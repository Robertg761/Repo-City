"""
Procedural vs Blender, pair by pair, under stage.py's light. Spike tooling.

    blender -b --python blender/props/compare.py -- <out-prefix> a.ply:b.ply [c.ply:d.ply ...]

Each pair stands left (a, procedural) and right (b, Blender), the pairs one
after another along +X. Renders `-near` (close three-quarter), `-mid` and
`-city` (about as far as the city's overview camera sees a street).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import stage  # noqa: E402
from mathutils import Vector  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    prefix, pairs = argv[0], argv[1:]
    near_only = os.environ.get("NEAR_SCALE")
    stage.clear()
    stage.world_and_light()
    x = 0.0
    everything = []
    for pair in pairs:
        for source in pair.split(":"):
            objs = stage.import_ply(os.path.abspath(source))
            lo, hi = stage.bounds(objs)
            for obj in objs:
                obj.location.x += x - lo.x
            x += (hi.x - lo.x) + 0.35
            everything += objs
            tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
            print(f"TRIANGLES {os.path.basename(source)} {tris}")
        x += 0.8
    import bpy

    bpy.context.view_layer.update()
    lo, hi = stage.bounds(everything)
    height = hi.z - lo.z
    centre = Vector(((lo.x + hi.x) / 2, 0.0, height * 0.45))
    span = max(hi.x - lo.x, height * 1.6)
    scale = float(near_only) if near_only else 1.0
    views = [
        ("near", stage.camera("near", centre, span * 1.9 * scale, -28, 16)),
        ("top", stage.camera("top", centre, span * 2.0 * scale, -20, 55)),
        ("city", stage.camera("city", centre, 48, -30, 50)),
    ]
    stage.render(prefix, views, size=(1400, 700))


main()
