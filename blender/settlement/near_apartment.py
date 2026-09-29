"""
Near level of the town's low block of flats, plain and over shops (see
apartment.py): the lean script's own base, storeys, balconies and roof with the
near builders from snear.py (its thirty-six windows framed, barred and topped
with lintels, the entrance panelled and stepped, the shop fronts shared with
the shopfront's near level), plus a baluster to every gap of each balcony rail,
vent stacks and plant on the roof clear of its pad, and downpipes at the
corners.

    blender -b --python blender/export.py -- blender/settlement/near_apartment.py apartment-low-near
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import apartment as lean  # noqa: E402
import kit  # noqa: E402
import near_shopfront  # noqa: E402
import shopfront  # noqa: E402
import skit  # noqa: E402
import snear  # noqa: E402

SCALES = {False: (6.5, 10.5, 6.2), True: (6.5, 12.0, 6.2)}


def flats_extras(retail):
    def extras(m):
        d = snear.det(m)
        HW, HD, ROOF = lean.HALF_W, lean.HALF_D, lean.ROOF_Y
        base = 0.24 if retail else 0.2
        floor_h = (ROOF - base) / (lean.FLOORS - 1 + 0.001)
        rail_h = floor_h * 0.24
        # Balusters between the lean ones, and a post at each end of every rail.
        for f in range(lean.FLOORS - 1):
            fy = base + f * floor_h + 0.004
            for u in (-0.215, 0.215):
                for k in (-2.5, -1.5, -0.5, 0.5, 1.5, 2.5):
                    bu = u + k * 0.053
                    d.wbox("+z", HD + 0.08, bu - d.U("+z", 0.012), bu + d.U("+z", 0.012), fy + 0.02, fy + 0.008 + rail_h, 0.0, d.O("+z", 0.025), "metal")
                for e in (-0.17, 0.17):
                    d.wbox("+z", HD + 0.08, u + e - d.U("+z", 0.03), u + e + d.U("+z", 0.03), fy + 0.014, fy + 0.03 + rail_h, 0.0, d.O("+z", 0.045), "metal")
        # The roof, off the pad (x .18 +- .23, z .12 +- .25): vent stacks, a fan unit.
        for x, z in ((-0.37, 0.36), (0.38, -0.37), (-0.37, -0.02)):
            d.cyl(x, z, ROOF, ROOF + d.V(0.5), 0.07, "metal", n=8)
            d.cyl(x, z, ROOF + d.V(0.5), ROOF + d.V(0.56), 0.1, "metal", n=8)
        # A rooftop air-conditioning unit clear of the pad, and a dish on a mast.
        d.ac_unit(-0.24, 0.22, ROOF, w=0.9, d=0.5, h=0.55, grille="glass")
        d.dish_roof("+z", -0.37, ROOF, -0.36, r=0.28, mast=0.4, feed=0.18, dep=0.09)
        if retail:
            near_shopfront.SCALE_CUR[:] = SCALES[True]
            near_shopfront.dress_shop(m, HD + lean.OUT, HW, base - 0.006)
        # Downpipes at the front corners.
        for s in (-1, 1):
            d.downpipe(s * (HW - d.X(0.15)), HD + lean.OUT + d.Z(0.05), base + 0.001, ROOF - 0.03, r=0.04)

    return extras


def build():
    kit.reset()
    M = skit.palette()
    snear.patch(lean)
    snear.patch(shopfront)
    objs = []
    for retail in (False, True):
        snear.setup(SCALES[retail], M, keystone=False, lintel_ext=0.03)
        snear.EXTRAS["ApartmentLowRetail" if retail else "ApartmentLow"] = flats_extras(retail)
        obj, _ = lean.build_block(M, retail)
        objs.append(obj)
    for obj, retail in zip(objs, (False, True)):
        snear.bake([obj], scale=SCALES[retail], lean_glb="apartment-low.glb")
        print("TRIS", obj.name, skit.triangles(obj))
    snear.rename(objs)
    return objs


def preview(n):
    return [build()[n]]
