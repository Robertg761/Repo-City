"""
The farm tractor, modelled by script (spike: Blender assets vs procedural).

Same frame, footprint, wheel positions and lamp points as `TRACTOR_SPEC` in
`components/city/models/vehicles/shapes.ts`: the street draws the wheels and
the lamps (and the amber beacon) as their own instances, so the body leaves
room for them. What the loft buys here: a bonnet with chamfered shoulders
tapering to the grille, a roof with a chamfered edge, and mudguards that
follow the big rear wheels round instead of sitting on them like slabs. The
tail lamps get brackets on the mudguards' backs (the procedural ones float).

    blender -b --python blender/export.py -- blender/fleet/tractor.py tractor
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
from carkit import build_loft, face_panel, flank_panel, lidless_box  # noqa: E402

SPEC = dict(
    length=2.76, width=1.18, wheelRadius=0.5,
    wheels=[(0.44, 0.82), (-0.44, 0.82), (0.438, -0.62), (-0.438, -0.62)],
    wheelRadii=[0.3, 0.3, 0.5, 0.5], wheelWidths=[0.2, 0.2, 0.3, 0.3],
    headlights=[(0.2, 0.86, 1.33), (-0.2, 0.86, 1.33)],
    taillights=[(0.4, 0.95, -1.06), (-0.4, 0.95, -1.06)],
    lamp=(0.14, 0.1),
)
CAB_Z = -0.45
NOSE = 1.32


def sec(z, *pts):
    return (z, [(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)])


def mudguard(side, M):
    """A curved guard over a rear wheel: a band of five facets round the tyre,
    from the axle's height in front to the lamp bracket behind."""
    import bmesh
    from kit import B

    (x, z0), r = SPEC["wheels"][2], SPEC["wheelRadii"][2]
    x *= side
    hub_y = r
    inner, outer = r + 0.05, r + 0.11
    half = 0.16
    angles = [math.radians(a) for a in (15, 50, 90, 125, 160)]
    ring = [(math.cos(a), math.sin(a)) for a in angles]
    bm = bmesh.new()

    def v(k, rad, dx):
        c, s = ring[k]
        return bm.verts.new(B((x + dx, hub_y + s * rad, z0 + c * rad)))

    outer_l = [v(k, outer, -half) for k in range(len(ring))]
    outer_r = [v(k, outer, half) for k in range(len(ring))]
    inner_l = [v(k, inner, -half) for k in range(len(ring))]
    inner_r = [v(k, inner, half) for k in range(len(ring))]
    faces = []
    for k in range(len(ring) - 1):
        mid_c = (ring[k][0] + ring[k + 1][0]) / 2
        mid_s = (ring[k][1] + ring[k + 1][1]) / 2
        out = B((0, mid_s, mid_c))
        faces.append(([outer_l[k], outer_r[k], outer_r[k + 1], outer_l[k + 1]], out))
        faces.append(([inner_l[k], inner_r[k], inner_r[k + 1], inner_l[k + 1]], -out))
        for dx, o, i in ((-1, outer_l, inner_l), (1, outer_r, inner_r)):
            faces.append(([o[k], o[k + 1], i[k + 1], i[k]], B((dx, 0, 0))))
    # The two ends of the band, oriented away from its middle below.
    for k in (0, len(ring) - 1):
        faces.append(([outer_l[k], outer_r[k], inner_r[k], inner_l[k]], None))
    made = []
    for verts, out in faces:
        f = bm.faces.new(verts)
        if out is not None:
            carkit._orient(bm, f, out)
        made.append(f)
    middle = B((x, hub_y + outer, z0))
    for f in made[-2:]:
        carkit._orient(bm, f, f.calc_center_median() - middle)
    obj = kit._object("mudguard", bm, M["paint"])
    return obj


def tractor(M):
    parts = []
    # Chassis and engine block, under the bonnet.
    parts.append(lidless_box("chassis", (0.5, 0.3, 1.96), (0, 0.55, 0.28), M["trim"]))
    # The bonnet: a loft from the cab to the grille, tapering a touch.
    bonnet = [
        sec(-0.1, 0.28, 0.62, 0.28, 1.02, 0.22, 1.14),
        sec(1.1, 0.28, 0.62, 0.28, 1.02, 0.22, 1.12),
        sec(NOSE, 0.28, 0.62, 0.28, 0.98, 0.2, 1.05),
    ]
    top = {0: "paint", 1: "paint"}

    def side(s, strip):
        return "paint"

    def caps(end, band):
        if end == 0:
            return None  # against the cab
        return "arch" if band == 0 else "paint"

    parts.append(build_loft("bonnet", bonnet, side, caps, M, centre_y=0.85))
    # Grille slats between the lamps, and louvres down the bonnet's flanks.
    for y in (0.7, 0.78, 0.86, 0.94):
        parts.append(face_panel("slat", 0, y, NOSE + 0.004, 0.2, 0.025, M["hub"], 1))
    for s in (-1, 1):
        for z in (0.35, 0.55, 0.75):
            parts.append(flank_panel("louvre", lambda y: 0.28, z - 0.012, z + 0.012, 0.76, 0.98, M["trim"], s, 0.004))
    # Front weights and axle.
    parts.append(lidless_box("weights", (0.62, 0.22, 0.2), (0, 0.42, 1.24), M["trim"]))
    parts.append(lidless_box("axle", (0.92, 0.1, 0.1), (0, 0.3, 0.82), M["trim"]))
    # The exhaust stack, just ahead of the cab.
    parts.append(kit.cyl("exhaust", 0.045, 0.8, (0.2, 1.5, 0.35), M["trim"], axis="y", verts=6))
    # The cab: a painted floor pan, glass all round, four posts and a roof.
    parts.append(lidless_box("pan", (0.58, 0.2, 1.0), (0, 0.95, CAB_Z), M["paint"]))
    parts.append(carkit.drop_faces(kit.box("glass", (0.54, 0.74, 0.92), (0, 1.42, CAB_Z), M["glass"], bev=0.0), lambda n: abs(n.z) > 0.9))
    for x, z in ((0.28, 0.04), (-0.28, 0.04), (0.28, -0.94), (-0.28, -0.94)):
        parts.append(carkit.drop_faces(kit.box("post", (0.06, 0.78, 0.06), (x, 1.42, z), M["paint"], bev=0.0), lambda n: abs(n.z) > 0.9))
    roof = [
        sec(CAB_Z - 0.56, 0.4, 1.79, 0.4, 1.83, 0.36, 1.86),
        sec(CAB_Z - 0.52, 0.42, 1.79, 0.42, 1.84, 0.38, 1.87),
        sec(CAB_Z + 0.52, 0.42, 1.79, 0.42, 1.84, 0.38, 1.87),
        sec(CAB_Z + 0.56, 0.4, 1.79, 0.4, 1.83, 0.36, 1.86),
    ]
    parts.append(build_loft("roof", roof, lambda s, strip: "roof", lambda end, band: "roof", M, centre_y=1.8))
    parts.append(carkit.quad("roofUnder", [(-0.42, 1.79, CAB_Z - 0.52), (0.42, 1.79, CAB_Z - 0.52), (0.42, 1.79, CAB_Z + 0.52), (-0.42, 1.79, CAB_Z + 0.52)], M["trim"], (0, -1, 0)))
    # Mudguards over the big wheels, and the tail lamps' brackets on their backs.
    for s in (-1, 1):
        parts.append(mudguard(s, M))
        parts.append(lidless_box("bracket", (0.18, 0.14, 0.08), (s * 0.4, 0.95, -1.03), M["trim"]))
        # The step and the fuel tank under the cab door.
        parts.append(lidless_box("tank", (0.24, 0.12, 0.4), (s * 0.38, 0.62, -0.02), M["trim"]))
        parts.append(carkit.mirror("mirror", s, 0.42, 1.72, -0.02, M["trim"], reach=0.06, height=0.1, depth=0.08))
    # The hitch behind.
    parts.append(lidless_box("hitch", (0.2, 0.12, 0.3), (0, 0.5, -1.2), M["trim"]))
    return parts


def build():
    kit.reset()
    M = carkit.palette()
    obj = kit.finish(tractor(M), "Tractor")
    kit.bake_ao([obj], distance=0.4, samples=128, floor=0.55)
    print("TRIS", obj.name, carkit.triangles(obj))
    return [obj]


def preview(n=0):
    objs = build()
    M = carkit.palette()
    carkit.tint(objs, "#4f8a3e")
    extras = carkit.preview_wheels(SPEC, M, radii=SPEC["wheelRadii"], widths=SPEC["wheelWidths"])
    beacon = kit.material("beacon", "#ffb347", "glass", 0.3, emission=0.3)
    extras.append(kit.box("beacon", (0.14, 0.1, 0.14), (0.3, 1.92, -0.45), beacon, bev=0.0))
    return objs + [kit.finish(extras, "Wheels")]
