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
    doors = []
    for i in range(lean.HOUSES):
        side = -1 if i % 2 == 0 else 1
        du = -HW + lean.HOUSE_W * (i + 0.5) + side * lean.HOUSE_W * 0.24
        doors.append((du - 0.1, du + 0.1))
    snear.plinth_stones(m, HW + lean.PLINTH_OUT, HD + lean.PLINTH_OUT, lean.PLINTH, gaps={"+z": doors})
    # Glazing bars across each bay's front glass.
    for i in range(lean.HOUSES):
        centre = -HW + lean.HOUSE_W * (i + 0.5)
        side = -1 if i % 2 == 0 else 1
        wu = centre - side * lean.HOUSE_W * 0.18
        du = centre + side * lean.HOUSE_W * 0.24
        o = dict(u=wu, v=0.21, w=0.084, h=0.16, depth=0.0)
        d.window("+z", HD + 0.05 + skit.LAYER, o, bars=(2, 3), sill=0.0, lintel=False, jambs=False, ring=(0.006, 0.006), back=0.0, bar_m=0.022)
    # A dish under the eaves at the back.
    d.dish("-z", HD, 0.1, 0.55, r=0.22, arm=0.08, feed=0.1, dep=0.06)


def build():
    kit.reset()
    M = skit.palette()
    snear.setup(SCALE, M)
    snear.patch(lean)
    # (No grid lines round the openings here: the bays' roofs taper to nothing
    # at their corners, and a wall cell edge there reads as a sliver of ledge.)
    lean.wall = lambda *a, **k: snear.wall(*a, lines=False, **k)
    snear.NUMBERS[:] = [21, 23, 25]
    snear.EXTRAS["Terrace"] = extras
    obj, _ = lean.build_terrace(M)
    snear.bake([obj], lean_glb="terrace.glb")
    print("TRIS", obj.name, skit.triangles(obj))
    snear.rename([obj])
    return [obj]


def preview(n):
    return build()
