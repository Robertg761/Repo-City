"""
Near level of the town terrace (see terrace.py): the lean script's own three
houses with the near builders from snear.py -- framed sash windows with bars,
lintels and keystones, panelled doors under fanlights with bars, slates in
three times the courses with a ridge of cap tiles, corbelled chimney stacks --
plus downpipes down the party walls.

    blender -b --python blender/export.py -- blender/settlement/near_terrace.py terrace-near
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import skit  # noqa: E402
import snear  # noqa: E402
import terrace as lean  # noqa: E402

SCALE = (6.0, 5.4, 5.0)


def extras(m):
    d = snear.det(m)
    HW, HD = lean.HALF_W, lean.HALF_D
    # Downpipes down the party walls, off the pilasters.
    for i in range(1, lean.HOUSES):
        u = -HW + lean.HOUSE_W * i
        d.downpipe(u, HD + d.Z(0.05), lean.PLINTH, 0.588, r=0.038, clips=False)


def build():
    kit.reset()
    M = skit.palette()
    snear.setup(SCALE, M)
    snear.patch(lean)
    # (No grid lines round the openings here: the bays' roofs taper to nothing
    # at their corners, and a wall cell edge there reads as a sliver of ledge.)
    lean.wall = lambda *a, **k: snear.wall(*a, lines=False, **k)
    snear.EXTRAS["Terrace"] = extras
    obj, _ = lean.build_terrace(M)
    snear.bake([obj])
    print("TRIS", obj.name, skit.triangles(obj))
    snear.rename([obj])
    return [obj]


def preview(n):
    return build()
