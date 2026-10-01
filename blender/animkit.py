"""
Parts that move: clock hands and flag cloths, each exported as a node of its
own so the app can turn it (hands) or wave it (cloth) and the merged model
keeps neither. App frame everywhere, like `kit.py`.

A clock face has a centre and a normal (the way it looks out of the wall). Its
hands are modelled pointing at twelve, in the face's own plane, and each one's
object origin IS the clock centre, so turning a node about its origin by the
hand's angle, about the face normal, is all the runtime does:

    hand("Hall.Clock.0.Minute", mat, centre, outline, z0, depth, yaw)
    clock_markers("Hall.Clock.0", centre, yaw)     # .pivot and .normal

A flag's cloth is a thin two-sided sheet, hoisted at a pole: its origin is the
midpoint of the hoist edge, it flies along `fly` (a unit vector on the
ground plane) and its markers are `.pivot` (the hoist) and `.tip` (the middle
of the free edge). The runtime waves it in the vertex shader, weighted by the
distance from the hoist, so the hoist edge stays on the pole.

    cloth("Hall.Flag.0", mat, hoist, fly, length, height, segs=(8, 2))
    flag_markers("Hall.Flag.0", hoist, fly, length)

Naming: `<scope>.Clock.<k>.<Hour|Minute|Second>`, `<scope>.Flag.<k>`; markers
`<scope>.Clock.<k>.pivot` / `.normal` and `<scope>.Flag.<k>.pivot` / `.tip`.
The scope is the node the parts belong to (`TownHall`, `Fire2Near`...).
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bmesh  # noqa: E402
import bpy  # noqa: E402

import kit  # noqa: E402


def _turn(yaw, p):
    """A face-local (u right, v up, w out of the wall) offset in the app frame
    for a face looking along (sin yaw, 0, cos yaw)."""
    u, v, w = p
    c, s = math.cos(yaw), math.sin(yaw)
    return (u * c + w * s, v, -u * s + w * c)


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _object(name, bm, mat, origin):
    """A mesh object whose origin sits at the app point `origin`, flat shaded,
    with the flat `AO` layer every exported node carries."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    mesh.materials.append(mat)
    ao = mesh.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
    ao.data.foreach_set("color", [1.0] * (len(ao.data) * 4))
    mesh.color_attributes.active_color = ao
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = kit.B(origin)
    return obj


# ---------------------------------------------------------------- clock hands


def hand_outline(length, width, spade=True, tail=0.18):
    """A hand pointing at twelve (up the v axis) from the pivot at the origin,
    counter-clockwise as seen from the front: a tail, shoulders and a tip."""
    shoulder = 0.35 if spade else 0.2
    w = width * (1.0 if spade else 0.5)
    return [
        (-width * 0.4, -length * tail),
        (width * 0.4, -length * tail),
        (w, length * shoulder),
        (0.0, length),
        (-w, length * shoulder),
    ]


def needle_outline(length, width, tail=0.22):
    """The second hand: a long thin needle with a stub tail."""
    return [(-width, -length * tail), (width, -length * tail), (width * 0.5, length), (-width * 0.5, length)]


def hand(name, mat, centre, outline, z0, depth, yaw=0.0):
    """One hand: `outline` (u, v) pointing at twelve, extruded `depth` along the
    face normal from `z0` off the plane through `centre`. Its origin is the
    clock centre."""
    bm = bmesh.new()
    lo = [bm.verts.new(kit.B(_turn(yaw, (u, v, z0)))) for u, v in outline]
    hi = [bm.verts.new(kit.B(_turn(yaw, (u, v, z0 + depth)))) for u, v in outline]
    n = len(outline)
    bm.faces.new(hi)
    bm.faces.new(list(reversed(lo)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    return _object(name, bm, mat, centre)


def clock_markers(scope, centre, yaw=0.0):
    """The pivot (the clock centre) and a point one unit out along the face normal."""
    return [
        kit.marker(f"{scope}.pivot", centre),
        kit.marker(f"{scope}.normal", _add(centre, _turn(yaw, (0.0, 0.0, 1.0)))),
    ]


def clock_hands(scope, mat, centre, r, yaw=0.0, z=0.0, depth=0.03, spade=True, second=False, lift=0.025):
    """A clock's hour and minute hands (and a second hand when `second`) for a
    face of radius `r` (`scope` is `<node scope>.Clock.<k>`), the lowest `z` off the plane through `centre`, each
    layer `lift` above the last. Returns the objects and the two markers."""
    objs = [
        hand(f"{scope}.Hour", mat, centre, hand_outline(r * 0.52, r * 0.09 if spade else r * 0.07, spade), z, depth, yaw),
        hand(f"{scope}.Minute", mat, centre, hand_outline(r * 0.8, r * 0.05, False), z + lift, depth, yaw),
    ]
    if second:
        objs.append(hand(f"{scope}.Second", mat, centre, needle_outline(r * 0.88, r * 0.012), z + lift * 2, depth * 0.5, yaw))
    return objs + clock_markers(scope, centre, yaw)


# ---------------------------------------------------------------- flag cloth


def _envelope(s):
    """How far a cloth lies off its flat rest at `s` along it (0 at the hoist)."""
    return s * (0.4 + 0.6 * s)


def cloth(name, mat, hoist, fly, length, height, segs=(8, 2), thick=0.03, ripple=0.05, droop=0.04):
    """A flag's cloth: two sheets back to back and a rim, `length` long from the
    hoist edge along `fly` and `height` tall about the hoist point, with a
    static ripple (zero at the hoist) so it reads as cloth even when still."""
    fx, _, fz = fly
    n = (-fz, 0.0, fx)  # fly x up
    nx, ny = segs
    bm = bmesh.new()

    def point(i, j, side):
        s, t = i / nx, j / ny
        wave = ripple * length * _envelope(s) * math.sin(math.tau * 1.1 * s + 0.4)
        sag = -droop * height * s * s
        off = side * thick / 2 + wave
        return kit.B((fx * s * length + n[0] * off, (t - 0.5) * height + sag, fz * s * length + n[2] * off))

    front = [[bm.verts.new(point(i, j, 1)) for j in range(ny + 1)] for i in range(nx + 1)]
    back = [[bm.verts.new(point(i, j, -1)) for j in range(ny + 1)] for i in range(nx + 1)]
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((front[i][j], front[i + 1][j], front[i + 1][j + 1], front[i][j + 1]))
            bm.faces.new((back[i][j + 1], back[i + 1][j + 1], back[i + 1][j], back[i][j]))
    for i in range(nx):
        bm.faces.new((front[i][ny], front[i + 1][ny], back[i + 1][ny], back[i][ny]))
        bm.faces.new((back[i][0], back[i + 1][0], front[i + 1][0], front[i][0]))
    for j in range(ny):
        bm.faces.new((front[nx][j + 1], front[nx][j], back[nx][j], back[nx][j + 1]))
        bm.faces.new((front[0][j], front[0][j + 1], back[0][j + 1], back[0][j]))
    return _object(name, bm, mat, hoist)


def flag_markers(scope, hoist, fly, length):
    """The hoist (the pivot) and the middle of the free edge."""
    tip = (hoist[0] + fly[0] * length, hoist[1], hoist[2] + fly[2] * length)
    return [kit.marker(f"{scope}.pivot", hoist), kit.marker(f"{scope}.tip", tip)]


def flag(scope, mat, hoist, fly, length, height, **kw):
    """Cloth and markers in one call: `scope` is `<node scope>.Flag.<k>`."""
    return [cloth(scope, mat, hoist, fly, length, height, **kw)] + flag_markers(scope, hoist, fly, length)
