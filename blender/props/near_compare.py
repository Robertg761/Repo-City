"""
Lean against near, pair by pair, under stage.py's light. Spike tooling.

    blender -b --python blender/props/near_compare.py -- <out-prefix> lean.py near.py [Name ...]

Builds both scripts, pairs every `<Name>` of the lean one with `<Name>Near` of
the other, and lays the pairs out left (lean) and right (near), one after
another along +X. Optional names limit the pairs. Renders `-close`, `-mid` and
`-far` (about how the city's overview camera sees a street).
"""

import math
import os
import runpy
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import stage  # noqa: E402
from mathutils import Vector  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    prefix, lean_py, near_py, only = argv[0], argv[1], argv[2], set(argv[3:])
    stage.clear()
    stage.world_and_light()
    lean = {o.name: o for o in runpy.run_path(os.path.abspath(lean_py))["build"]()}
    near = {o.name: o for o in runpy.run_path(os.path.abspath(near_py))["build"]()}
    # The instance's leaf tint paints `paint` materials in the city: a green here.
    for mat in bpy.data.materials:
        if mat.name.startswith("paint") and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == "MIX":
                    node.inputs["A"].default_value = (0.13, 0.34, 0.09, 1)
    x = 0.0
    everything = []
    for name, obj in near.items():
        base = name[: -len("Near")]
        if only and base not in only:
            continue
        mates = [lean[base]] if base in lean else []
        for o in mates + [obj]:
            lo, hi = stage.bounds([o])
            o.location.x += x - lo.x
            x += (hi.x - lo.x) + 0.3
            everything.append(o)
            t = sum(len(p.vertices) - 2 for p in o.data.polygons)
            print(f"TRIANGLES {o.name} {t}")
        x += 0.7
    for o in list(lean.values()) + list(near.values()):
        if o not in everything:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    lo, hi = stage.bounds(everything)
    height = hi.z - lo.z
    centre = Vector(((lo.x + hi.x) / 2, 0.0, height * 0.45))
    span = max(hi.x - lo.x, height * 2.2)
    all_views = {
        "close": (span * 1.7, -24, 14),
        "mid": (span * 2.8, -28, 24),
        "far": (span * 6.0, -30, 50),
    }
    names = os.environ.get("VIEWS", "close,mid").split(",")
    views = [(n, stage.camera(n, centre, *all_views[n])) for n in names]
    stage.render(prefix, views, size=(1400, 800), samples=int(os.environ.get("SAMPLES", "16")))


main()
