"""
Lean and near side by side, stretched to a representative instance size
(spike tooling, one model per Blender process).

    blender -b -t 2 --python blender/buildings/nearstage.py -- <out-prefix> <sx> <sy> <sz> <lean.py[@n]> <near.py[@n]> [views]

Renders `-front34`, `-rear34`, `-street` (a pedestrian's view of the door
side) and `-high` (the city camera's pitch) of the two, lean on the left.
`views` is a comma-separated subset. Materials named `wall.*` and `accent.*`
(the settlement's paint channels) are tinted so they show.
"""

import os
import re
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import stage  # noqa: E402

WALL = (0.86, 0.72, 0.55)
ACCENT = (0.16, 0.36, 0.42)


def tint():
    for mat in bpy.data.materials:
        colour = WALL if mat.name.startswith("wall.") else ACCENT if mat.name.startswith("accent.") else None
        if colour is None or not mat.use_nodes:
            continue
        print('TINT', mat.name, [n.type for n in mat.node_tree.nodes])
        tone = 1.0
        found = re.search(r"\.t(\d+)", mat.name)
        if found:
            tone = int(found.group(1)) / 100
        for node in mat.node_tree.nodes:
            if node.type == "MIX":
                node.inputs["A"].default_value = (*(c * tone for c in colour), 1)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    prefix, sx, sy, sz, lean, near = argv[0], float(argv[1]), float(argv[2]), float(argv[3]), argv[4], argv[5]
    only = argv[6].split(",") if len(argv) > 6 else None
    stage.clear()
    stage.world_and_light()
    groups = []
    x = 0.0
    for source in (lean, near):
        objs = stage.load(os.path.abspath(source) if "@" not in source else os.path.abspath(source.split("@")[0]) + "@" + source.split("@")[1])
        for obj in objs:
            obj.scale = (sx, sz, sy)
            obj.location.x += x
        x += sx * 1.25
        groups.append(objs)
        tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
        print(f"TRIANGLES {os.path.basename(source)} {tris}")
    tint()
    bpy.context.view_layer.update()
    lo, hi = stage.bounds([o for g in groups for o in g])
    centre = Vector(((lo.x + hi.x) / 2, 0, sy * 0.45))
    span = max(hi.x - lo.x, sy * 1.5)
    views = {
        "front34": stage.camera("front34", centre, span * 1.9, -30, 14),
        "rear34": stage.camera("rear34", centre, span * 1.9, 150, 20),
        "street": stage.camera("street", Vector((centre.x, 0, sy * 0.32)), span * 1.35, -12, 3),
        "high": stage.camera("high", Vector((centre.x, 0, sy * 0.35)), span * 2.1, -38, 48),
    }
    # Close views of the near model alone (the last group, drawn to the right).
    nlo, nhi = stage.bounds([o for o in groups[-1]])
    ncx = (nlo.x + nhi.x) / 2
    nspan = max(nhi.x - nlo.x, nhi.y - nlo.y)
    views["door"] = stage.camera("door", Vector((ncx, 0, sy * 0.16)), nspan * 0.95, -18, 8)
    views["roof"] = stage.camera("roof", Vector((ncx, 0, sy * 0.82)), nspan * 1.05, -32, 30)
    views["eave"] = stage.camera("eave", Vector((ncx, 0, sy * 0.6)), nspan * 1.2, -50, 6)
    views["side"] = stage.camera("side", Vector((ncx, 0, sy * 0.4)), nspan * 1.6, 62, 12)
    views["upper"] = stage.camera("upper", Vector((ncx, 0, sy * 0.5)), nspan * 0.9, -14, 4)
    chosen = [(k, v) for k, v in views.items() if only is None or k in only]
    stage.render(prefix, chosen, size=(1200, 640), samples=32)


main()
