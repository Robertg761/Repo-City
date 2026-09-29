"""
Near level of the village farmhouse (see farmhouse.py): the lean script's own
walls, openings, roofs, stacks and porch with the near builders from snear.py,
plus a gutter and downpipe on the
lean-to.

    blender -b --python blender/export.py -- blender/settlement/near_farmhouse.py farmhouse-near
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import farmhouse as lean  # noqa: E402
import kit  # noqa: E402
import skit  # noqa: E402
import snear  # noqa: E402

SCALE = (4.6, 5.8, 4.4)


def extras(m):
    d = snear.det(m)
    CX, HW, HD = lean.CX, lean.HALF_W, lean.HALF_D
    # The lean-to's gutter and downpipe: its eave is at x = -0.5, y 0.31.
    lx0 = -0.49
    lhd = 0.26
    d.wbox("-x", -lx0 + 0.0, -lhd - 0.025, lhd + 0.025, 0.31 - d.V(0.06) - d.V(0.05), 0.31 - d.V(0.06), 0.0, d.O("-x", 0.09), "metal", skip=("back",))
    d.downpipe(lx0 - d.X(0.06), lhd + 0.03, 0.0, 0.31 - d.V(0.11), r=0.04)
    snear.plinth_stones(m, HW + lean.PLINTH_OUT, HD + lean.PLINTH_OUT, lean.PLINTH, cx=CX, gaps={"+z": [(-0.16, 0.16)]})
    # Quoins up the main block, a lamp by the door and a downpipe with a hopper at the front corner.
    d.quoins(HW, HD, 0.045, 0.6, proj=0.024, height=0.24, long_=0.36, short=0.2, cx=CX, corners=[(1, -1), (-1, -1)])
    d.lamp("+z", HD, 0.11, 0.2, cx=CX, arm=0.1, glass="glass")


def build():
    kit.reset()
    M = skit.palette()
    snear.setup(SCALE, M)
    snear.patch(lean)
    snear.EXTRAS["Farmhouse"] = extras
    obj, _ = lean.build_farmhouse(M)
    snear.bake([obj], lean_glb="farmhouse.glb")
    print("TRIS", obj.name, skit.triangles(obj))
    snear.rename([obj])
    return [obj]


def preview(n):
    return build()
