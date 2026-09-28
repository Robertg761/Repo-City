"""
The fleet's instanced parts, modelled by script: the spinning wheel and the
lit lamps the street draws as their own instances (`Traffic.tsx`).

    blender -b --python blender/export.py -- blender/vehicles2/parts.py vehicle-parts

Nodes:
  Wheel          radius 1, axle along x, centred on the node origin. Eight
                 sides, a crowned tread, a sloped sidewall and a shallow cone
                 for the rim whose eight wedges are pale or dark in an uneven
                 run, so the spin reads from any side. 64 triangles, the
                 procedural wheel's count.
  Lamps<Body>    the head and tail lamps of each fleet body (and the taxi's
                 roof sign, the bus's destination board), at the spec's points
                 in the body's own frame. Each lamp is a lens with a darker
                 bezel round it, five faces open at the back: 10 triangles.
  LampsTractor   the tractor's four lamps and its amber roof beacon.

The lamps are drawn unlit (`MeshBasicMaterial`, vertex colour), so the bezel
is a darker shade of the lens colour (the material's tone), not a shaded
surface. Their colours are HEADLIGHT, TAILLIGHT, SIGN in `shapes.ts`.
"""

import math
import os
import sys

import bmesh
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fleet"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
from kit import B  # noqa: E402

TYRE = "#26282b"
HUB = "#b9bcc0"
SPOKE = "#3d4045"
HEADLIGHT = "#fff2cf"
TAILLIGHT = "#ff4a3a"
SIGN = "#ffd66b"
BEACON = "#ffb347"

# The fleet's specs (`shapes.ts`): the street places these lamps by them.
FLEET = {
    "Hatchback": dict(length=2.35, head=(0.32, 0.38, 1.165), tail=(0.34, 0.55, -1.165), lamp=(0.2, 0.1)),
    "Sedan": dict(length=2.85, head=(0.36, 0.37, 1.415), tail=(0.38, 0.44, -1.415), lamp=(0.24, 0.1)),
    "Taxi": dict(length=2.85, head=(0.36, 0.37, 1.415), tail=(0.38, 0.44, -1.415), lamp=(0.24, 0.1)),
    "Van": dict(length=3.1, head=(0.4, 0.42, 1.545), tail=(0.44, 0.66, -1.545), lamp=(0.18, 0.2)),
    "Pickup": dict(length=3.0, head=(0.38, 0.4, 1.495), tail=(0.42, 0.6, -1.495), lamp=(0.18, 0.14)),
    "Bus": dict(length=4.5, head=(0.4, 0.48, 2.245), tail=(0.44, 0.62, -2.245), lamp=(0.2, 0.14)),
}
TRACTOR = dict(head=(0.2, 0.86, 1.33), tail=(0.4, 0.95, -1.06), lamp=(0.14, 0.1))
DEPTH = 0.05  # every lamp is 5 cm deep, centred on the spec's point
BEZEL = 0.01  # how far the lit lens is inset from the lamp's outline


def materials():
    m = kit.material
    return {
        "tyre": m("tyre", TYRE, "fabric", 0.9),
        "hub": m("hub", HUB, "metal", 0.4),
        "spoke": m("spoke", SPOKE, "metal", 0.6),
        "head": m("headlight", HEADLIGHT, "glass", 0.2, emission=0.4),
        "tail": m("taillight", TAILLIGHT, "glass", 0.3, emission=0.2),
        "sign": m("sign", SIGN, "glass", 0.3, emission=0.3),
        "beacon": m("beacon", BEACON, "glass", 0.3, emission=0.3),
        # Bezels and the unlit flanks of a lit box: the same colour, darker.
        "headSide": m("headlight", HEADLIGHT, "glass", 0.2, emission=0.4, tone=0.72),
        "tailSide": m("taillight", TAILLIGHT, "glass", 0.3, emission=0.2, tone=0.72),
        "signSide": m("sign", SIGN, "glass", 0.3, emission=0.3, tone=0.7),
        "beaconSide": m("beacon", BEACON, "glass", 0.3, emission=0.3, tone=0.7),
    }


def _add(bm, verts, mat_index, outward, centre):
    """One face on app-frame `verts`, facing away from `centre`."""
    f = bm.faces.new([bm.verts.new(B(v)) for v in verts])
    f.material_index = mat_index
    f.normal_update()
    if f.normal.dot(B(outward) if outward else (f.calc_center_median() - B(centre))) < 0:
        f.normal_flip()
    return f


# ---------------------------------------------------------------- the wheel

SIDES = 8
TREAD_HALF = 0.34  # the crowned tread's half width, at radius 1
RIM_X = 0.47  # where the sloped sidewall meets the rim
RIM_R = 0.6
HUB_X = 0.51  # the rim's cone stands proud of the sidewall, within the old hub's 0.514
# Which of the eight rim wedges are pale (runs of 2, 1, 2, 1, 1, 1 round the
# circle): an uneven pattern shows the wheel's phase, not just that it turns.
PALE = (True, True, False, True, True, False, True, False)


def wheel(M):
    """One wheel: radius 1, axle along x, centred on the origin."""
    bm = bmesh.new()

    def ring(x, r, turn=0.0):
        return [
            bm.verts.new(B((x, r * math.cos(a + turn), r * math.sin(a + turn))))
            for a in (2 * math.pi * k / SIDES for k in range(SIDES))
        ]

    tread_l, tread_r = ring(-TREAD_HALF, 1.0), ring(TREAD_HALF, 1.0)
    for k in range(SIDES):
        j = (k + 1) % SIDES
        f = bm.faces.new([tread_l[k], tread_r[k], tread_r[j], tread_l[j]])
        f.material_index = 0
        f.normal_update()
        # Outward: away from the axle.
        radial = f.calc_center_median()
        radial.x = 0
        if f.normal.dot(radial) < 0:
            f.normal_flip()
    for s in (-1, 1):
        edge = tread_r if s > 0 else tread_l
        rim = ring(s * RIM_X, RIM_R)
        apex = bm.verts.new(B((s * HUB_X, 0, 0)))
        for k in range(SIDES):
            j = (k + 1) % SIDES
            f = bm.faces.new([edge[k], rim[k], rim[j], edge[j]])
            f.material_index = 0
            # Sidewall: faces outward along the axle (and out a little).
            f.normal_update()
            if f.normal.x * s < 0:
                f.normal_flip()
            tri = bm.faces.new([rim[k], apex, rim[j]] if s > 0 else [rim[k], rim[j], apex])
            tri.material_index = 1 if PALE[k] else 2
            tri.normal_update()
            if tri.normal.x * s < 0:
                tri.normal_flip()
    obj = carkit._mesh_object("wheel", bm, [M["tyre"], M["hub"], M["spoke"]])
    return obj


# ---------------------------------------------------------------- the lamps


def lens(name, centre, size, facing, mat, side_mat, depth=DEPTH, inset=BEZEL):
    """A lamp on a face that looks along `facing` (+1 or -1 on z): the lit
    lens at the outer end of its depth, inset from the outline, with a
    darker bezel sloping out to the full outline at the back. Open behind."""
    cx, cy, cz = centre
    w, h = size
    zf, zb = cz + facing * depth / 2, cz - facing * depth / 2
    fw, fh = w / 2 - inset, h / 2 - inset
    bw, bh = w / 2, h / 2
    front = [(cx - fw, cy - fh, zf), (cx + fw, cy - fh, zf), (cx + fw, cy + fh, zf), (cx - fw, cy + fh, zf)]
    back = [(cx - bw, cy - bh, zb), (cx + bw, cy - bh, zb), (cx + bw, cy + bh, zb), (cx - bw, cy + bh, zb)]
    bm = bmesh.new()
    _add(bm, front, 0, (0, 0, facing), None)
    for i in range(4):
        j = (i + 1) % 4
        _add(bm, [front[i], front[j], back[j], back[i]], 1, None, (cx, cy, cz))
    return carkit._mesh_object(name, bm, [mat, side_mat])


def sign_box(name, x, y0, y1, z0, z1, taper, mat, side_mat):
    """A lit box that stands on the roof: the ends (along z) are the lit
    faces, the flanks and the top are darker, and the top is narrower by
    `taper` so the faces lean back. No underside."""
    xl, xr = x - 0.2, x + 0.2
    bottom = [(xl, y0, z0), (xr, y0, z0), (xr, y0, z1), (xl, y0, z1)]
    top = [(xl + taper, y1, z0 + taper), (xr - taper, y1, z0 + taper), (xr - taper, y1, z1 - taper), (xl + taper, y1, z1 - taper)]
    centre = (x, (y0 + y1) / 2, (z0 + z1) / 2)
    bm = bmesh.new()
    _add(bm, top, 1, (0, 1, 0), None)
    for i in range(4):
        j = (i + 1) % 4
        lit = i in (0, 2)  # the two along x: the ends at z0 and z1
        _add(bm, [bottom[i], bottom[j], top[j], top[i]], 0 if lit else 1, None, centre)
    return carkit._mesh_object(name, bm, [mat, side_mat])


def board(name, cx, cy, z, w, h, mat, side_mat):
    """The bus's destination board: a lens on the nose, 3 cm deep."""
    return lens(name, (cx, cy, z), (w, h), 1, mat, side_mat, depth=0.03, inset=0.012)


def fleet_lamps(kind, M):
    spec = FLEET[kind]
    parts = []
    for sx in (-1, 1):
        x, y, z = spec["head"]
        parts.append(lens("head", (sx * x, y, z), spec["lamp"], 1, M["head"], M["headSide"]))
        x, y, z = spec["tail"]
        parts.append(lens("tail", (sx * x, y, z), spec["lamp"], -1, M["tail"], M["tailSide"]))
    if kind == "Taxi":
        parts.append(sign_box("sign", 0, 1.115, 1.245, -0.32, -0.14, 0.03, M["sign"], M["signSide"]))
    if kind == "Bus":
        h = spec["length"] / 2 + 0.01
        parts.append(board("board", 0, 1.73, h, 1.16 * 0.66, 0.14, M["sign"], M["signSide"]))
    return parts


def tractor_lamps(M):
    parts = []
    for sx in (-1, 1):
        x, y, z = TRACTOR["head"]
        parts.append(lens("head", (sx * x, y, z), TRACTOR["lamp"], 1, M["head"], M["headSide"]))
        x, y, z = TRACTOR["tail"]
        parts.append(lens("tail", (sx * x, y, z), TRACTOR["lamp"], -1, M["tail"], M["tailSide"]))
    # The amber beacon on the cab roof (centred 1.92 up, 10 cm tall).
    bx, bz = 0.3, -0.45
    bottom = [(bx - 0.07, 1.87, bz - 0.07), (bx + 0.07, 1.87, bz - 0.07), (bx + 0.07, 1.87, bz + 0.07), (bx - 0.07, 1.87, bz + 0.07)]
    top = [(bx - 0.05, 1.97, bz - 0.05), (bx + 0.05, 1.97, bz - 0.05), (bx + 0.05, 1.97, bz + 0.05), (bx - 0.05, 1.97, bz + 0.05)]
    bm = bmesh.new()
    _add(bm, top, 0, (0, 1, 0), None)
    for i in range(4):
        j = (i + 1) % 4
        _add(bm, [bottom[i], bottom[j], top[j], top[i]], 1, None, (bx, 1.92, bz))
    parts.append(carkit._mesh_object("beacon", bm, [M["beacon"], M["beaconSide"]]))
    return parts


# ------------------------------------------------------------------- build


def build():
    kit.reset()
    M = materials()
    # The wheel is built with its hub 1 up, standing on the bake's ground,
    # and its node's origin there: the runtime reads it centred on 0.
    wheel_obj = kit.finish([_lift(wheel(M))], "Wheel", origin=(0, 1, 0))
    kit.bake_ao([wheel_obj], distance=0.45, samples=128, floor=0.62)
    objs = [wheel_obj]
    lamps = []
    for kind in FLEET:
        lamps.append(kit.finish(fleet_lamps(kind, M), f"Lamps{kind}"))
    lamps.append(kit.finish(tractor_lamps(M), "LampsTractor"))
    objs += lamps
    for obj in objs:
        print("TRIS", obj.name, carkit.triangles(obj))
    return objs


def _lift(obj):
    """Move a wheel built at the origin up by its radius (the app's y)."""
    obj.data.transform(Matrix.Translation(B((0, 1, 0))))
    return obj


# ----------------------------------------------------------------- preview

BODY_KINDS = ["hatchback", "sedan", "taxi", "van", "pickup", "bus"]
TINTS = {"hatchback": "#c26a58", "sedan": "#5f8fb0", "taxi": "#e8b53a", "van": "#e9e6dc", "pickup": "#7f9e77", "bus": "#5f8fb0"}


def preview(n=0):
    """Car `n` (0-5, `BODY_KINDS`), or 6 for the tractor, drawn as the street
    draws it: the fleet's Blender body, this wheel four times and these lamps."""
    import fleet
    import tractor as tractor_mod

    kit.reset()
    M = carkit.palette()
    parts = materials()
    if n == 7:
        # A wheel on its own at four spins, radius 1, for a close look.
        objs = []
        for i, spin in enumerate((0, 0.4, 0.8, 1.2)):
            w = wheel(parts)
            w.data.transform(Matrix.Rotation(-spin, 4, "X"))
            w.data.transform(Matrix.Translation(B((i * 2.4, 1, 0))))
            objs.append(w)
        return [kit.finish(objs, "Wheels")]
    if n < 6:
        kind = BODY_KINDS[n]
        body = fleet.make(kind, M)
        spec = fleet.SPECS[kind]
        node = kind[0].upper() + kind[1:]
        wheels = [(x, z, spec["wheelRadius"]) for x, z in spec["wheels"]]
        lamps = fleet_lamps(node, parts)
        tint = TINTS[kind]
    else:
        body = kit.finish(tractor_mod.tractor(M), "Tractor")
        spec = tractor_mod.SPEC
        wheels = [(x, z, r) for (x, z), r in zip(spec["wheels"], spec["wheelRadii"])]
        lamps = tractor_lamps(parts)
        tint = "#4f8a3e"
    kit.bake_ao([body], distance=0.4, samples=128, floor=0.55)
    carkit.tint([body], tint)
    print("TRIS body", carkit.triangles(body))
    objs = [body]
    for x, z, r in wheels:
        w = wheel(parts)
        w.data.transform(Matrix.Scale(r, 4))
        w.data.transform(Matrix.Translation(B((x, r, z))))
        objs.append(w)
    objs += lamps
    return [objs[0], kit.finish(objs[1:], "Street")]
