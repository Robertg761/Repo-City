"""
The near levels of the tall and mid-rise archetypes, one GLB each:

    blender -b --python blender/export.py -- blender/buildings/near.py building-tower-crown-near

`build()` reads the model's id from the export name; `preview(n)` returns the
lean and near models of the n-th archetype, stretched to instance size, for
`blender/stage.py near.py@n`. See `nkit.py`.
"""

import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

#: export name -> the archetype script
MODELS = {
    "building-tower-crown-near": "tower_crown",
    "building-tower-glass-near": "tower_glass",
    "building-tower-spire-near": "tower_spire",
    "building-tower-stepped-near": "tower_stepped",
    "building-tower-twin-near": "tower_twin",
    "building-midrise-mech-near": "midrise_mech",
    "building-midrise-setback-near": "midrise_setback",
}


def _script(stem):
    return runpy.run_path(os.path.join(HERE, f"{stem}.py"))


def build():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    return _script(MODELS[argv[1]])["build_near"]()


def preview(n):
    """The lean and near model of the n-th archetype, at instance size."""
    import bkit  # noqa: E402

    module = _script(list(MODELS.values())[n])
    lean = module["build"]()
    near = module["build_near"]()
    objs = [lean[0], near[0]]
    near[0].name = "BuildingNear"
    sx, sy, sz = module["SCALE"]
    for obj in objs:
        obj.scale = (sx, sz, sy)
    return objs
