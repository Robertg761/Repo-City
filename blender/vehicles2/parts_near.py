"""
The fleet's near (detailed) wheel and lamps: what `parts.py` builds for the
lean fleet, in the same frame and with the same instancing contract, but with
enough shape and colour to hold up when the camera is a few metres from the car.

  WheelNear      radius 1, axle along x, centred on the node origin; a round
                 tyre with a groove down its tread, a bulging sidewall, a rim
                 with a lip, a dished barrel and five raised spokes round a hub
                 cap. Sixteen sides round, so a spin still shows in the spokes.
  Lamps<Body>Near, LampsTractorNear
                 the lit lamps at the lean lamps' points and depth, with the
                 same colours, and inside them what the lean ones leave out:
                 projector cups, tail chambers and their ribs, the taxi sign's
                 panes and the bus's destination text.

Built by `blender/fleet/near.py`, which exports them with the bodies.
"""

import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fleet"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402
from kit import B  # noqa: E402

SIDES = 16

# The tyre's half profile from the tread's centre out to the bead: (x, radius).
# A groove down the middle, a flat crown, rounded shoulders and a sidewall that
# bulges to 0.47, inside the lean wheel's 0.47 at the rim and 0.34 at the tread.
TYRE = [(0.0, 0.982), (0.06, 0.982), (0.09, 1.0), (0.27, 1.0), (0.34, 0.955), (0.42, 0.86), (0.465, 0.73), (0.47, 0.65), (0.455, 0.605)]
# The rim, from the bead in: lip, its face, the dished barrel down to the hub.
RIM = [(0.455, 0.605), (0.49, 0.585), (0.49, 0.545), (0.4, 0.17)]
HUB_APEX = (0.43, 0.0)
SPOKES = 5


def _ring(bm, x, r, turn=0.0):
    if r < 1e-6:
        apex = bm.verts.new(B((x, 0, 0)))
        return [apex] * SIDES
    return [
        bm.verts.new(B((x, r * math.cos(a + turn), r * math.sin(a + turn))))
        for a in (2 * math.pi * k / SIDES for k in range(SIDES))
    ]


def _face(bm, verts, mat, outward):
    f = bm.faces.new(verts)
    f.material_index = mat
    carkit._orient(bm, f, B(outward))
    return f


def _band(bm, profile, mat, side):
    """Faces round the axle between successive (x, radius) points of a profile
    that runs from the crown outward, on `side` (+1 or -1) of the wheel."""
    rings = [_ring(bm, side * x, r) for x, r in profile]
    for i in range(len(profile) - 1):
        (xa, ra), (xb, rb) = profile[i], profile[i + 1]
        # Outward normal of a profile segment, in (axial, radial) terms.
        nx, nr = -(rb - ra), xb - xa
        if abs(xb - xa) < 1e-9 and abs(rb - ra) < 1e-9:
            continue
        for k in range(SIDES):
            j = (k + 1) % SIDES
            a = 2 * math.pi * (k + 0.5) / SIDES
            out = (side * nx, nr * math.cos(a), nr * math.sin(a))
            if ra < 1e-6:
                _face(bm, [rings[i][0], rings[i + 1][k], rings[i + 1][j]], mat, out)
            elif rb < 1e-6:
                _face(bm, [rings[i][k], rings[i + 1][0], rings[i][j]], mat, out)
            else:
                _face(bm, [rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j]], mat, out)


def wheel(M):
    """One wheel: radius 1, axle along x, centred on the origin."""
    bm = bmesh.new()
    tyre, hub, dark = 0, 1, 2
    for side in (-1, 1):
        _band(bm, TYRE, tyre, side)
        # The lip and its face are pale, the barrel is dark between the spokes.
        _band(bm, RIM[:3], hub, side)
        _band(bm, RIM[2:], dark, side)
        _band(bm, [RIM[-1], HUB_APEX], hub, side)
        # Spokes, raised off the barrel to the lip's height.
        for s in range(SPOKES):
            phi = 2 * math.pi * s / SPOKES + 0.35
            top_x = 0.5
            spec = [(0.2, 0.05), (0.56, 0.075)]

            def point(r, w, dx, lift):
                c = Vector((math.cos(phi), math.sin(phi)))
                p = Vector((-math.sin(phi), math.cos(phi)))
                v = c * r + p * dx * w
                # Down to the barrel: the dish's x at this radius.
                x = top_x if lift else RIM[3][0] + (RIM[2][0] - RIM[3][0]) * (r - RIM[3][1]) / (RIM[2][1] - RIM[3][1])
                return bm.verts.new(B((side * x, v.x, v.y)))

            top = [point(r, w, dx, True) for r, w in spec for dx in (-1, 1)]
            base = [point(r, w, dx, False) for r, w in spec for dx in (-1, 1)]
            # top: inner-left, inner-right, outer-left, outer-right
            f = bm.faces.new([top[0], top[1], top[3], top[2]])
            f.material_index = hub
            carkit._orient(bm, f, B((side, 0, 0)))
            for a, b in ((0, 2), (1, 3)):
                f = bm.faces.new([top[a], top[b], base[b], base[a]])
                f.material_index = hub
                lateral = (1 if a == 1 else -1)
                out = (0, -math.sin(phi) * lateral, math.cos(phi) * lateral)
                carkit._orient(bm, f, B(out))
    return carkit._mesh_object("wheel", bm, [M["tyre"], M["hub"], M["spoke"]])


# ---------------------------------------------------------------- the lamps


def _quad(bm, pts, mat, facing):
    return _face(bm, [bm.verts.new(B(p)) for p in pts], mat, (0, 0, facing))


def _rect(cx, cy, z, w, h):
    return [(cx - w / 2, cy - h / 2, z), (cx + w / 2, cy - h / 2, z), (cx + w / 2, cy + h / 2, z), (cx - w / 2, cy + h / 2, z)]


def _disc(bm, cx, cy, z, radius, mat, facing, sides=10, ring=None):
    """A flat disc facing along z, or an annulus when `ring` (an inner radius) is given."""
    outer = [bm.verts.new(B((cx + radius * math.cos(a), cy + radius * math.sin(a), z))) for a in (2 * math.pi * k / sides for k in range(sides))]
    if ring is None:
        _face(bm, outer, mat, (0, 0, facing))
        return
    inner = [bm.verts.new(B((cx + ring * math.cos(a), cy + ring * math.sin(a), z))) for a in (2 * math.pi * k / sides for k in range(sides))]
    for k in range(sides):
        j = (k + 1) % sides
        _face(bm, [outer[k], outer[j], inner[j], inner[k]], mat, (0, 0, facing))


def housing(bm, centre, size, facing, lens_mat, side_mat, depth, inset):
    """The lean lamp's box: a lit face at the outer end, inset from the outline,
    a darker bezel sloping out to the full outline at the back. Open behind.
    Returns the z of the lit face."""
    cx, cy, cz = centre
    w, h = size
    zf, zb = cz + facing * depth / 2, cz - facing * depth / 2
    fw, fh = w / 2 - inset, h / 2 - inset
    front = [(cx - fw, cy - fh, zf), (cx + fw, cy - fh, zf), (cx + fw, cy + fh, zf), (cx - fw, cy + fh, zf)]
    back = [(cx - w / 2, cy - h / 2, zb), (cx + w / 2, cy - h / 2, zb), (cx + w / 2, cy + h / 2, zb), (cx - w / 2, cy + h / 2, zb)]
    fv = [bm.verts.new(B(p)) for p in front]
    bv = [bm.verts.new(B(p)) for p in back]
    for i in range(4):
        j = (i + 1) % 4
        f = bm.faces.new([fv[i], fv[j], bv[j], bv[i]])
        f.material_index = side_mat
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - B((cx, cy, cz))) < 0:
            f.normal_flip()
    return zf, fw, fh


def head_lamp(M, centre, size, side):
    """A headlamp: bezel, a lit lens, a projector cup and a daytime strip."""
    bm = bmesh.new()
    cx, cy, cz = centre
    w, h = size
    # 0: lit lens, 1: darker tone (bezel, cup).
    zf, fw, fh = housing(bm, centre, size, 1, 0, 1, parts.DEPTH, parts.BEZEL)
    # Lens face in two pieces round the cup.
    lens_z = zf
    _quad(bm, _rect(cx, cy, lens_z, 2 * fw, 2 * fh), 0, 1)
    cup_r = min(fw, fh) * 0.82
    ex = cx - side * fw * 0.32  # the cup sits towards the middle of the car
    _disc(bm, ex, cy - fh * 0.05, lens_z + 0.0015, cup_r, 1, 1, sides=12)
    _disc(bm, ex, cy - fh * 0.05, lens_z + 0.003, cup_r * 0.55, 0, 1, sides=10)
    # A daytime strip along the top of the lamp, dark either side.
    _quad(bm, _rect(cx, cy + fh * 0.78, lens_z + 0.0015, 2 * fw * 0.94, fh * 0.16), 1, 1)
    _quad(bm, _rect(cx, cy + fh * 0.78, lens_z + 0.003, 2 * fw * 0.86, fh * 0.07), 0, 1)
    return carkit._mesh_object("head", bm, [M["head"], M["headSide"]])


def tail_lamp(M, centre, size, side):
    """A tail lamp: bezel, three chambers (the outer one amber) with ribs between."""
    bm = bmesh.new()
    cx, cy, cz = centre
    w, h = size
    # 0: red, 1: darker red, 2: amber.
    zf, fw, fh = housing(bm, centre, size, -1, 0, 1, parts.DEPTH, parts.BEZEL)
    lens_z = zf
    # Chambers run across the lamp: brake (inner, wide), tail, indicator (outer).
    edges = [-fw, -fw / 3, fw / 3, fw]
    # The lamp's outer end is at +x on the right side, -x on the left.
    mats = [0, 0, 2] if side > 0 else [2, 0, 0]
    for i in range(3):
        x0, x1 = edges[i], edges[i + 1]
        # Facing -z: order the corners so the quad faces back.
        _quad(bm, _rect(cx + (x0 + x1) / 2, cy, lens_z, (x1 - x0) - 0.006, 2 * fh), mats[i], -1)
    for x in edges[1:3]:
        _quad(bm, _rect(cx + x, cy, lens_z - 0.0015, 0.012, 2 * fh), 1, -1)
    # A darker band across the lamp's top and a bright slot in the brake chamber.
    _quad(bm, _rect(cx - side * fw * 0.35, cy - fh * 0.15, lens_z - 0.0015, fw * 0.5, fh * 0.35), 1, -1)
    _quad(bm, _rect(cx - side * fw * 0.35, cy - fh * 0.15, lens_z - 0.003, fw * 0.36, fh * 0.16), 0, -1)
    return carkit._mesh_object("tail", bm, [M["tail"], M["tailSide"], M["beacon"]])


def sign_near(M, x, y0, y1, z0, z1, taper):
    """The taxi sign: a lit box on the roof, its two long faces in three panes
    split by dark ribs, and a lit top strip."""
    bm = bmesh.new()
    xl, xr = x - 0.2, x + 0.2
    bottom = [(xl, y0, z0), (xr, y0, z0), (xr, y0, z1), (xl, y0, z1)]
    top = [(xl + taper, y1, z0 + taper), (xr - taper, y1, z0 + taper), (xr - taper, y1, z1 - taper), (xl + taper, y1, z1 - taper)]
    centre = (x, (y0 + y1) / 2, (z0 + z1) / 2)
    f = bm.faces.new([bm.verts.new(B(p)) for p in top])
    f.material_index = 1
    carkit._orient(bm, f, B((0, 1, 0)))
    for i in range(4):
        j = (i + 1) % 4
        lit = i in (0, 2)
        a, b = bottom[i], bottom[j]
        c, d = top[j], top[i]
        f = bm.faces.new([bm.verts.new(B(p)) for p in (a, b, c, d)])
        f.material_index = 0 if lit else 1
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - B(centre)) < 0:
            f.normal_flip()
    # Ribs on the two long faces, standing a millimetre proud.
    for zb, zt, out in ((z0 - 0.0012, z0 + taper - 0.0012, -1), (z1 + 0.0012, z1 - taper + 0.0012, 1)):
        for dx in (-0.066, 0.066):
            f = bm.faces.new([bm.verts.new(B(p)) for p in ((x + dx - 0.006, y0, zb), (x + dx + 0.006, y0, zb), (x + dx + 0.006, y1, zt), (x + dx - 0.006, y1, zt))])
            f.material_index = 1
            carkit._orient(bm, f, B((0, 0, out)))
    return carkit._mesh_object("sign", bm, [M["sign"], M["signSide"]])


def board_near(M, cx, cy, z, w, h):
    """The bus's destination board: a lens with a dark surround and bars of text."""
    bm = bmesh.new()
    zf, fw, fh = housing(bm, (cx, cy, z), (w, h), 1, 0, 1, 0.03, 0.012)
    _quad(bm, _rect(cx, cy, zf, 2 * fw, 2 * fh), 0, 1)
    # Destination text: a route number block and two lines, in the dark tone.
    _quad(bm, _rect(cx - fw * 0.72, cy, zf + 0.0015, fw * 0.3, fh * 1.2), 1, 1)
    for i, (dy, wl) in enumerate(((0.3, 0.9), (-0.3, 0.6))):
        _quad(bm, _rect(cx + fw * 0.2 - (1 - wl) * fw * 0.5, cy + fh * dy, zf + 0.0015, fw * wl, fh * 0.38), 1, 1)
    return carkit._mesh_object("board", bm, [M["sign"], M["signSide"]])


def fleet_lamps(kind, M):
    spec = parts.FLEET[kind]
    out = []
    for sx in (-1, 1):
        x, y, z = spec["head"]
        out.append(head_lamp(M, (sx * x, y, z), spec["lamp"], sx))
        x, y, z = spec["tail"]
        out.append(tail_lamp(M, (sx * x, y, z), spec["lamp"], sx))
    if kind == "Taxi":
        out.append(sign_near(M, 0, 1.115, 1.245, -0.32, -0.14, 0.03))
    if kind == "Bus":
        h = spec["length"] / 2 + 0.01
        out.append(board_near(M, 0, 1.73, h, 1.16 * 0.66, 0.14))
    return out


def tractor_lamps(M):
    out = []
    T = parts.TRACTOR
    for sx in (-1, 1):
        x, y, z = T["head"]
        out.append(head_lamp(M, (sx * x, y, z), T["lamp"], sx))
        x, y, z = T["tail"]
        out.append(tail_lamp(M, (sx * x, y, z), T["lamp"], sx))
    # The amber beacon on the cab roof, on a dark base, with a lit dome.
    bx, bz = 0.3, -0.45
    bm = bmesh.new()
    sides = 10
    rings = [(1.87, 0.07, 1), (1.895, 0.066, 1), (1.925, 0.055, 0), (1.955, 0.038, 0), (1.975, 0.016, 0)]
    verts = [[bm.verts.new(B((bx + r * math.cos(a), y, bz + r * math.sin(a)))) for a in (2 * math.pi * k / sides for k in range(sides))] for y, r, _ in rings]
    for i in range(len(rings) - 1):
        mat = rings[i + 1][2]
        for k in range(sides):
            j = (k + 1) % sides
            f = bm.faces.new([verts[i][k], verts[i][j], verts[i + 1][j], verts[i + 1][k]])
            f.material_index = mat
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - B((bx, 1.92, bz))) < 0:
                f.normal_flip()
    cap = bm.faces.new(verts[-1])
    cap.material_index = 0
    carkit._orient(bm, cap, B((0, 1, 0)))
    out.append(carkit._mesh_object("beacon", bm, [M["beacon"], M["beaconSide"]]))
    return out


def lifted_wheel(M):
    obj = wheel(M)
    obj.data.transform(Matrix.Translation(B((0, 1, 0))))
    return obj
