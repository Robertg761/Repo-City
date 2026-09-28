"""
The crowd's two car forms (`collision`, `wreck` in forms.ts), with the
crowd car of `crowdcar.py`. Spike tooling.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import crowdcar as cc  # noqa: E402
import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import finish  # noqa: E402

# Where forms.ts stands the collision's cars (STRUCK, STRIKER), and where
# each one's hazard lamps blink (`lampAt(pose, 1.1, 0.5)`).
STRUCK = dict(x=0.5, z=0.14, yaw=-0.05)
STRIKER = dict(x=-0.25, z=-0.2, yaw=0.36)


def lamp_at(p, back=1.1, up=0.5):
    return (p["x"] - math.sin(p["yaw"]) * back, up, p["z"] - math.cos(p["yaw"]) * back)


def palette():
    m = kit.material
    return {
        "paintA": m("paintA", "#ffffff", "metal", 0.5),
        # Near white, so the TypeScript side can tell the two paint slots
        # apart by colour; it paints both from white.
        "paintB": m("paintB", "#fefefe", "metal", 0.5),
        "carGlass": m("carGlass", "#4c5c6c", "glass", 0.3),
        "glassDark": m("glassDark", "#2d3337", "glass", 0.4),
        "tyre": m("tyre", "#262729", "fabric", 0.9),
        "hazard": m("hazard", "#ffae3a", "glass", 0.3),
        "warnTri": m("warnTri", "#c8493c", "metal", 0.5),
        "crazed": m("crazed", "#dfe8ea", "glass", 0.4),
        "rust": m("rust", "#80573d", "metal", 0.8),
        "bumper": m("bumper", "#3d4045", "metal", 0.6),
        "tuft": m("tuft", "#8aa46a", "foliage", 0.9),
        "cone": m("cone", "#e8853c", "metal", 0.6),
        "oil": m("oil", "#3f3b35", "concrete", 1.0),
    }


def warning_triangle(name, side, pos, tilt, mat):
    """Two triangles back to back, standing on the road."""
    h = side * math.sqrt(3) / 2
    front = [(-side / 2, 0, 0), (side / 2, 0, 0), (0, h, 0)]
    objs = []
    for facing in (1, -1):
        pts = front if facing > 0 else list(reversed(front))
        bm = lp.bmesh.new()
        vs = [bm.verts.new(kit.B(p)) for p in pts]
        bm.faces.new(vs)
        obj = lp._obj(name, bm, mat)
        # Lean back about x, then stand at `pos`.
        obj.data.transform(cc.app_matrix(x=pos[0], z=pos[2], pitch=0) @ _pitch(tilt))
        objs.append(obj)
    return objs


def _pitch(angle):
    C = cc.Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
    return C @ cc.Matrix.Rotation(angle, 4, "X") @ C.inverted()


def crease(mat):
    """The striker's bonnet, buckled up into a ridge: two quads, a tent
    across the car over the crushed nose."""
    bm = lp.bmesh.new()
    rear = [bm.verts.new(kit.B((x, 0.73, 0.52))) for x in (-0.38, 0.38)]
    ridge = [bm.verts.new(kit.B((x * 0.9, 0.86, 0.74))) for x in (-0.38, 0.38)]
    front = [bm.verts.new(kit.B((x * 0.8, 0.66, 0.97))) for x in (-0.38, 0.38)]
    for a, b in ((rear, ridge), (ridge, front)):
        f = bm.faces.new((a[0], a[1], b[1], b[0]))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return lp._obj("crease", bm, mat)


def collision(M):
    """A crash (procedural: 142 triangles): the striker's nose buried at a
    slant in the struck car's flank, its front end crushed short and buckled
    up; hazard lamps on both, a warning triangle behind."""
    struck = [cc.body("struck", M, "paintB", "carGlass"), *cc.wheels(M)]
    cc.pose(struck, **STRUCK)
    # The striker's nose crushed: the front two sections pulled back and the
    # bonnet shoved up into a crease.
    saved = list(cc.SECTIONS)
    cc.SECTIONS[3] = (0.5, (0.45, 0.16), (0.46, 0.6), (0.4, 0.72))
    cc.SECTIONS[4] = (0.98, (0.43, 0.2), (0.44, 0.5), (0.3, 0.66))
    striker = [cc.body("striker", M, "paintA", "carGlass"), *cc.wheels(M), crease(M["paintA"])]
    cc.SECTIONS[:] = saved
    cc.pose(striker, **STRIKER)
    parts = [
        *struck,
        *striker,
        *warning_triangle("warn", 0.46, (STRUCK["x"] + 0.05, 0, -1.42), -0.2, M["warnTri"]),
        *[cc.tetra(f"hazard{i}", lamp_at(p), 0.087, M["hazard"]) for i, p in enumerate((STRUCK, STRIKER))],
    ]
    return finish(parts, "Collision")


def wreck(M):
    """An abandoned car (procedural: 144 triangles): sunk on the front left
    corner where the wheel is gone, the rear right tyre flat, the windscreen
    crazed white, rust through the bonnet, the bumper hanging off, weeds up
    round it and a traffic cone on the roof."""
    s = cc.SECTIONS
    car = [
        cc.body("wreck", M, "paintA", "glassDark"),
        *cc.wheels(M, missing={(-1, 1)}, flat={(1, -1)}),
        # The windscreen, between the roof's front section and the bonnet's.
        cc.top_quad("crazed", s[2][0] + 0.03, s[3][0] - 0.03, s[2][3][1] - 0.02, s[3][3][1] + 0.02, 0.33, 0.37,
                    M["crazed"]),
        cc.top_quad("rust", s[3][0] + 0.12, s[4][0] - 0.12, 0.615, 0.54, 0.3, 0.27, M["rust"], x=0.04),
        # The front bumper, hanging off at one end.
        lp_box_open("bumper", (0.86, 0.12, 0.1), (0.04, 0.2, cc.HALF + 0.03), M["bumper"], (0, 0, 0.3)),
    ]
    cone = lp.cone("cone", [(math.cos(a) * 0.13, math.sin(a) * 0.13, 0) for a in (i * math.pi / 3 for i in range(6))],
                   cc.roof_y(), cc.roof_y() + 0.36, M["cone"], centre=(0.06, -0.46))
    cone.data.transform(_about(0.06, cc.roof_y(), -0.46, pitch=0.12, roll=-0.1))
    posed = dict(x=0.04, z=0.0, yaw=0.0, roll=0.09, pitch=0.07)
    cc.pose(car, **posed)
    cc.pose([cone], **posed)
    drop = -cc.lowest(car)
    for obj in car + [cone]:
        obj.data.transform(cc.Matrix.Translation((0, 0, drop)))
    ground = [
        lp_disc("oil", 0.62, 8, 0.02, M["oil"], z=0.1),
        lp.cone("tuftA", _ring(0.17, 5), 0.0, 0.62, M["tuft"], centre=(-0.52, 0.95)),
        lp.cone("tuftB", _ring(0.15, 5), 0.0, 0.48, M["tuft"], centre=(0.55, -1.12)),
        lp.cone("tuftC", _ring(0.12, 5), 0.0, 0.4, M["tuft"], centre=(-0.6, -0.4)),
    ]
    return finish(car + [cone] + ground, "Wreck")


def _ring(r, n, turn=0.3):
    return [(math.cos(turn + i * 2 * math.pi / n) * r, math.sin(turn + i * 2 * math.pi / n) * r, 0) for i in range(n)]


def _about(x, y, z, pitch=0.0, roll=0.0):
    """Rotate about an app-frame point."""
    C = cc.Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
    R = cc.Matrix.Rotation(roll, 4, "Z") @ cc.Matrix.Rotation(pitch, 4, "X")
    T = cc.Matrix.Translation(cc.Vector((x, y, z)))
    return C @ T @ R @ T.inverted() @ C.inverted()


def lp_box_open(name, size, pos, mat, rot):
    """A box without its underside, 10 triangles."""
    obj = kit.box(name, size, pos, mat, bev=0.0, rot=rot)
    return cc.carkit.drop_faces(obj, lambda n: n.z < -0.9)


def lp_disc(name, radius, sides, y, mat, x=0.0, z=0.0):
    bm = lp.bmesh.new()
    vs = [bm.verts.new(kit.B((x + math.cos(0.3 + 2 * math.pi * i / sides) * radius, y,
                              z + math.sin(0.3 + 2 * math.pi * i / sides) * radius))) for i in range(sides)]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    return lp._obj(name, bm, mat)
