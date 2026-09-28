"""
The settlement kit: village and town buildings as Blender scripts (spike).

Everything is authored in the archetypes' UNIT SPACE -- x and z in
[-0.5, 0.5], y in [0, 1], the front door on +z -- in the app's frame (x
across, y up, z forward); `kit.B` converts to Blender. The city stretches
each model per instance, non-uniformly, so nothing here is bevelled or
rounded in a way that would read wrong once stretched two to one.

Geometry is built face by face into a `Mesh` rather than from bevelled,
booleaned boxes: every triangle is placed on purpose, walls are sliced round
their openings into clean strips (the occlusion is baked per vertex, so the
slicing is also where the shade can change), and nothing lies a hair off
anything else. The rules the city's checkers enforce (`coplanar.ts`,
`ledges.ts`) are the kit's rules too:

  - two faces facing the same way and overlapping stand at least LAYER apart;
  - a wall stands flush with the edge of what it stands on, or at least two
    LAYERs back from it;
  - a wall never stops a hair above a surface it rises through.

Windows publish the rectangle of their glass as the `Panel` the lit-window
pass draws on (`window()` returns it), from the same numbers that place the
glass, so the two can never disagree.

Materials are `<role>.<surface>[.tNN]`. The TypeScript side maps roles to the
settlement paint channels: `wall` is PAINT_WALL, `accent` is PAINT_ACCENT,
every other role an absolute colour (its hex, below, matches `M` in
`components/city/models/buildings/kit.ts`).
"""

import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
LAYER = 0.006
PANEL_LIFT = 0.006

# (role, hex, surface, tone) -- the colours of `M` in buildings/kit.ts.
PALETTE = {
    "wall": ("wall", "#ffffff", "plaster", 1.0),
    "wallShade": ("wall", "#ffffff", "plaster", 0.86),
    "wallDeep": ("wall", "#ffffff", "plaster", 0.72),
    "wallBrick": ("wall", "#ffffff", "brick", 1.0),
    "accent": ("accent", "#ffffff", "timber", 1.0),
    "accentDark": ("accent", "#ffffff", "timber", 0.72),
    "accentFabric": ("accent", "#ffffff", "fabric", 1.0),
    "accentMetal": ("accent", "#ffffff", "metal", 1.0),
    "accentMetalDark": ("accent", "#ffffff", "metal", 0.72),
    "thatch": ("thatch", "#c6a25e", "thatch", 1.0),
    "thatchDark": ("thatchDark", "#a3823f", "thatch", 1.0),
    "thatchLight": ("thatchLight", "#d6b675", "thatch", 1.0),
    "tile": ("tile", "#a8573f", "clayTile", 1.0),
    "tileDark": ("tileDark", "#8a4434", "clayTile", 1.0),
    "slate": ("slate", "#6b7680", "slate", 1.0),
    "slateDark": ("slateDark", "#56606a", "slate", 1.0),
    "barnRoof": ("barnRoof", "#655e58", "metal", 1.0),
    "stone": ("stone", "#bdb4a3", "stone", 1.0),
    "stoneDark": ("stoneDark", "#968d7e", "stone", 1.0),
    "brick": ("brick", "#a95e46", "brick", 1.0),
    "brickDark": ("brickDark", "#8b4a37", "brick", 1.0),
    "timber": ("timber", "#6b4e39", "timber", 1.0),
    "timberDark": ("timberDark", "#4e3a2b", "timber", 1.0),
    "frame": ("frame", "#f1ede2", "timber", 1.0),
    "frameMetal": ("frame", "#f1ede2", "metal", 1.0),
    "glass": ("glass", "#4f6070", "glass", 1.0),
    "shopGlass": ("shopGlass", "#5d7384", "glass", 1.0),
    "door": ("door", "#4a3a30", "timber", 1.0),
    "flowerRed": ("flowerRed", "#cf4d57", "foliage", 1.0),
    "flowerPink": ("flowerPink", "#e07ca0", "foliage", 1.0),
    "flowerYellow": ("flowerYellow", "#e9c44f", "foliage", 1.0),
    "leaf": ("leaf", "#5b8a47", "foliage", 1.0),
    "hay": ("hay", "#d9bd68", "thatch", 1.0),
    "concrete": ("concrete", "#c8c2b4", "concrete", 1.0),
    "concreteDark": ("concreteDark", "#a9a397", "concrete", 1.0),
    "metal": ("metal", "#8b9295", "metal", 1.0),
    "railing": ("railing", "#3e4448", "metal", 1.0),
    "cream": ("cream", "#f1e7cf", "plaster", 1.0),
    "creamFabric": ("cream", "#f1e7cf", "fabric", 1.0),
}


def palette():
    out = {}
    for key, (role, hex_, surface, tone) in PALETTE.items():
        out[key] = kit.material(role, hex_, surface, 0.7, tone=tone)
    return out


# ---------------------------------------------------------------- vectors

def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def scale(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        n[0] += (p[1] - q[1]) * (p[2] + q[2])
        n[1] += (p[2] - q[2]) * (p[0] + q[0])
        n[2] += (p[0] - q[0]) * (p[1] + q[1])
    return tuple(n)


def centroid(pts):
    k = 1 / len(pts)
    return (sum(p[0] for p in pts) * k, sum(p[1] for p in pts) * k, sum(p[2] for p in pts) * k)


# Facings, as in mesh.ts: the outward normal and the direction `u` runs.
NORMAL = {"+z": (0, 0, 1), "-z": (0, 0, -1), "+x": (1, 0, 0), "-x": (-1, 0, 0)}
ALONG = {"+z": (1, 0, 0), "-z": (-1, 0, 0), "+x": (0, 0, -1), "-x": (0, 0, 1)}


def on(facing, plane, u, v, out=0.0, cx=0.0, cz=0.0):
    """A point on a wall: `u` along it, `v` up, `out` in front of `plane`."""
    n, a = NORMAL[facing], ALONG[facing]
    d = plane + out
    return (cx + a[0] * u + n[0] * d, v, cz + a[2] * u + n[2] * d)


# ---------------------------------------------------------------- the mesh

class Mesh:
    """Faces in app coordinates, each with a material and wound to face out."""

    def __init__(self, name):
        self.name = name
        self.faces = []

    def face(self, pts, mat, out=None, inside=None):
        """A polygon facing `out` (a direction) or away from `inside` (a point)."""
        uniq = []
        for p in pts:
            if all(sum((p[i] - q[i]) ** 2 for i in range(3)) > 1e-14 for q in uniq):
                uniq.append(tuple(p))
        if len(uniq) < 3:
            return
        n = newell(uniq)
        if out is None:
            out = sub(centroid(uniq), inside)
        if dot(n, out) < 0:
            uniq.reverse()
        self.faces.append((uniq, mat))

    def rect(self, facing, plane, u0, u1, v0, v1, mat, out=0.0, cx=0.0, cz=0.0):
        """A rectangle on a wall, facing out of it."""
        pts = [on(facing, plane, u, v, out, cx, cz) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
        self.face(pts, mat, out=NORMAL[facing])

    def box(self, x0, x1, y0, y1, z0, z1, mat, skip=(), mats=None):
        """An axis-aligned box. `skip` names faces to leave out (buried or
        never seen): px nx top bottom pz nz. `mats` overrides per face."""
        mats = mats or {}
        c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        faces = {
            "px": [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
            "nx": [(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)],
            "top": [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)],
            "bottom": [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
            "pz": [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
            "nz": [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
        }
        for key, pts in faces.items():
            if key in skip:
                continue
            self.face(pts, mats.get(key, mat), inside=c)

    def wall_box(self, facing, plane, u0, u1, v0, v1, depth, mat, cx=0.0, cz=0.0, skip=("back",), mats=None):
        """A box standing proud of a wall, `depth` out from `plane`: a sill, a
        step, a shutter. Face keys: front back top bottom left right."""
        mats = mats or {}
        corners = {}
        for ku, u in (("l", u0), ("r", u1)):
            for kv, v in (("b", v0), ("t", v1)):
                for ko, o in (("i", 0.0), ("o", depth)):
                    corners[ku + kv + ko] = on(facing, plane, u, v, o, cx, cz)
        c = on(facing, plane, (u0 + u1) / 2, (v0 + v1) / 2, depth / 2, cx, cz)
        faces = {
            "front": ["lbo", "rbo", "rto", "lto"],
            "back": ["lbi", "rbi", "rti", "lti"],
            "top": ["lti", "rti", "rto", "lto"],
            "bottom": ["lbi", "rbi", "rbo", "lbo"],
            "left": ["lbi", "lbo", "lto", "lti"],
            "right": ["rbi", "rbo", "rto", "rti"],
        }
        for key, names in faces.items():
            if key in skip:
                continue
            self.face([corners[k] for k in names], mats.get(key, mat), inside=c)

    def prism_x(self, profile, x0, x1, mat, caps=True, cap_mat=None, skip_edges=(), edge_mats=None):
        """A (z, y) profile pushed from x0 to x1. The profile is a simple
        polygon; each edge makes one quad, the caps are the polygon itself."""
        edge_mats = edge_mats or {}
        cz = sum(p[0] for p in profile) / len(profile)
        cy = sum(p[1] for p in profile) / len(profile)
        inside = ((x0 + x1) / 2, cy, cz)
        n = len(profile)
        for i in range(n):
            if i in skip_edges:
                continue
            a, b = profile[i], profile[(i + 1) % n]
            pts = [(x0, a[1], a[0]), (x0, b[1], b[0]), (x1, b[1], b[0]), (x1, a[1], a[0])]
            # Outward: perpendicular to the edge, away from the polygon.
            ez, ey = b[0] - a[0], b[1] - a[1]
            out = self._profile_out(profile, i)
            self.face(pts, edge_mats.get(i, mat), out=(0, out[1], out[0]))
        if caps:
            for x, sign in ((x0, -1), (x1, 1)):
                self.face([(x, y, z) for z, y in profile], cap_mat or mat, out=(sign, 0, 0))

    def prism_z(self, profile, z0, z1, mat, caps=True, cap_mat=None, skip_edges=(), edge_mats=None):
        """An (x, y) profile pushed from z0 to z1."""
        edge_mats = edge_mats or {}
        n = len(profile)
        for i in range(n):
            if i in skip_edges:
                continue
            a, b = profile[i], profile[(i + 1) % n]
            pts = [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)]
            out = self._profile_out(profile, i)
            self.face(pts, edge_mats.get(i, mat), out=(out[0], out[1], 0))
        if caps:
            for z, sign in ((z0, -1), (z1, 1)):
                self.face([(x, y, z) for x, y in profile], cap_mat or mat, out=(0, 0, sign))

    @staticmethod
    def _profile_out(profile, i):
        """The outward normal of edge i of a 2D polygon (either winding)."""
        area = 0.0
        n = len(profile)
        for k in range(n):
            p, q = profile[k], profile[(k + 1) % n]
            area += p[0] * q[1] - q[0] * p[1]
        a, b = profile[i], profile[(i + 1) % n]
        e = (b[0] - a[0], b[1] - a[1])
        # Counter-clockwise polygons have the outside on the right of each edge.
        right = (e[1], -e[0])
        return right if area > 0 else (-right[0], -right[1])

    def cylinder(self, x, y0, y1, z, r, mat, segments=6, top_mat=None, bottom=False, phase=0.0, top=True):
        pts = [(x + math.cos(phase + 2 * math.pi * i / segments) * r, z + math.sin(phase + 2 * math.pi * i / segments) * r) for i in range(segments)]
        c = (x, (y0 + y1) / 2, z)
        for i in range(segments):
            a, b = pts[i], pts[(i + 1) % segments]
            self.face([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], mat, inside=c)
        if top:
            self.face([(p[0], y1, p[1]) for p in pts], top_mat or mat, out=(0, 1, 0))
        if bottom:
            self.face([(p[0], y0, p[1]) for p in pts], mat, out=(0, -1, 0))

    def build(self):
        bm = bmesh.new()
        mats = []
        for pts, mat in self.faces:
            if mat not in mats:
                mats.append(mat)
            verts = [bm.verts.new(kit.B(p)) for p in pts]
            f = bm.faces.new(verts)
            f.material_index = mats.index(mat)
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        for m in mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ---------------------------------------------------------------- walls

class Hole:
    def __init__(self, u0, u1, v0, v1):
        self.u0, self.u1, self.v0, self.v1 = u0, u1, v0, v1


def wall(m, facing, plane, u0, u1, v0, v1, holes, mat, cx=0.0, cz=0.0, cuts=()):
    """A wall face from (u0, v0) to (u1, v1) with rectangular holes, sliced
    into rows at every hole's top and bottom (and `cuts`), each row into
    strips between the holes. No T-junction ever falls inside a strip."""
    holes = [h for h in holes if h.u1 > u0 and h.u0 < u1 and h.v1 > v0 and h.v0 < v1]
    vs = sorted({v0, v1, *[h.v0 for h in holes], *[h.v1 for h in holes], *[c for c in cuts if v0 < c < v1]})
    us = sorted({u0, u1, *[h.u0 for h in holes], *[h.u1 for h in holes]})
    for va, vb in zip(vs, vs[1:]):
        if vb - va < 1e-9:
            continue
        start = None
        for ua, ub in zip(us, us[1:]):
            solid = not any(h.u0 <= ua + 1e-9 and ub <= h.u1 + 1e-9 and h.v0 <= va + 1e-9 and vb <= h.v1 + 1e-9 for h in holes)
            if solid and start is None:
                start = ua
            if not solid and start is not None:
                m.rect(facing, plane, start, ua, va, vb, mat, cx=cx, cz=cz)
                start = None
        if start is not None:
            m.rect(facing, plane, start, us[-1], va, vb, mat, cx=cx, cz=cz)


def recess(m, facing, plane, hole, depth, reveal, back, cx=0.0, cz=0.0, floor=None, head=None, sides=None, back_face=True):
    """The reveals of a hole `depth` deep, and its back face."""
    u0, u1, v0, v1 = hole.u0, hole.u1, hole.v0, hole.v1
    p = lambda u, v, o: on(facing, plane, u, v, o, cx, cz)  # noqa: E731
    a = ALONG[facing]
    m.face([p(u0, v0, 0), p(u0, v1, 0), p(u0, v1, -depth), p(u0, v0, -depth)], sides or reveal, out=a)
    m.face([p(u1, v0, 0), p(u1, v1, 0), p(u1, v1, -depth), p(u1, v0, -depth)], sides or reveal, out=scale(a, -1))
    m.face([p(u0, v1, 0), p(u1, v1, 0), p(u1, v1, -depth), p(u0, v1, -depth)], head or reveal, out=(0, -1, 0))
    if floor is not False:
        m.face([p(u0, v0, 0), p(u1, v0, 0), p(u1, v0, -depth), p(u0, v0, -depth)], floor or reveal, out=(0, 1, 0))
    if back_face:
        m.rect(facing, plane - depth, u0, u1, v0, v1, back, cx=cx, cz=cz)


def panel(facing, plane, u, v, w, h, cx=0.0, cz=0.0):
    """A `Panel` for the lit-window pass (mesh.ts): its glass is drawn at
    `plane + PANEL_LIFT`."""
    out = {"facing": facing, "u": round(u, 6), "v": round(v, 6), "w": round(w, 6), "h": round(h, 6), "plane": round(plane, 6)}
    if cx:
        out["cx"] = round(cx, 6)
    if cz:
        out["cz"] = round(cz, 6)
    return out


def window(m, M, facing, plane, u, v, w, h, cx=0.0, cz=0.0, depth=0.022, frame=0.016, bars="cross",
           glass=None, reveal=None, sill=True, shutters=False, flowers=None, holes=None, sill_mat=None):
    """A window set `depth` into its wall: the reveals, a white frame at the
    back with the glass a layer in front of it (the glazing bars are the frame
    showing between the panes), a stone sill, and optionally shutters and a
    window box. Appends the wall's hole to `holes`; returns the glass Panel."""
    hw, hh = w / 2 + frame, h / 2 + frame
    hole = Hole(u - hw, u + hw, v - hh, v + hh)
    if holes is not None:
        holes.append(hole)
    recess(m, facing, plane, hole, depth, reveal or M["wallShade"], M["frame"], cx, cz)
    glass_plane = plane - depth + LAYER
    bar = 0.012
    across = [(-w / 2, -bar / 2), (bar / 2, w / 2)] if bars == "cross" else [(-w / 2, w / 2)]
    up = [(-h / 2, h / 2)] if bars == "none" else [(-h / 2, -bar / 2), (bar / 2, h / 2)]
    for a0, a1 in across:
        for b0, b1 in up:
            m.rect(facing, glass_plane, u + a0, u + a1, v + b0, v + b1, glass or M["glass"], cx=cx, cz=cz)
    if sill:
        # The sill's top is the reveal's floor carried out: one flat, no sliver.
        ext = 0.012 if not shutters else 0.0
        m.wall_box(facing, plane, hole.u0 - ext, hole.u1 + ext, hole.v0 - 0.016, hole.v0, 0.032, sill_mat or M["stone"], cx, cz)
    if shutters:
        sw = w * 0.46
        for side in (-1, 1):
            e0 = hw if side > 0 else -hw - sw
            e1 = hw + sw if side > 0 else -hw
            m.wall_box(facing, plane, u + e0, u + e1, hole.v0, hole.v1, 0.012, M["accent"], cx, cz)
            for k in (-1, 0, 1):
                sv = v + k * h * 0.26
                m.rect(facing, plane + 0.012 + LAYER, u + e0 + sw * 0.16, u + e1 - sw * 0.16, sv - 0.005, sv + 0.005, M["accentDark"], cx=cx, cz=cz)
    if flowers is not None:
        # The box hangs under the sill and the flowers stand in it, a rim of
        # box showing round them; their top stops clear below the sill, so
        # no face of one lies a hair off a face of the other.
        top = hole.v0 - 0.016 - 0.006
        y = top - 0.02 - 0.03
        m.wall_box(facing, plane, hole.u0, hole.u1, y, y + 0.03, 0.048, M["timber"], cx, cz, skip=("back",))
        rim = 0.012
        m.wall_box(facing, plane, hole.u0 + rim, hole.u1 - rim, y + 0.03, top, 0.048 - rim, flowers, cx, cz, skip=("back", "bottom"))
    return panel(facing, glass_plane - PANEL_LIFT, u, v, w, h, cx, cz)


def door(m, M, facing, plane, u, v, w, h, cx=0.0, cz=0.0, depth=0.03, mat=None, reveal=None, fanlight=False,
         holes=None, step=True, step_mat=None, glazed=False, step_from=0.0, step_w=0.035, floor=True):
    """A door set into its wall: reveals, the painted leaf with two recessed
    panels a layer proud of it, a brass knob, a fanlight over it, a step."""
    fan = h * 0.2 if fanlight else 0.0
    hole = Hole(u - w / 2, u + w / 2, v, v + h + fan)
    if holes is not None:
        holes.append(hole)
    # With `floor` False the threshold is the top of whatever the door stands
    # on (a plinth running under the wall), which already covers it.
    recess(m, facing, plane, hole, depth, reveal or M["frame"], mat or M["accent"], cx, cz, back_face=False,
           floor=M["stone"] if floor else False)
    back = plane - depth
    leaf = mat or M["accent"]
    m.rect(facing, back, u - w / 2, u + w / 2, v, v + h, leaf, cx=cx, cz=cz)
    if fan:
        m.rect(facing, back, u - w / 2, u + w / 2, v + h, v + h + fan, M["frame"], cx=cx, cz=cz)
        m.rect(facing, back + LAYER, u - w * 0.42, u + w * 0.42, v + h + 0.008, v + h + fan - 0.008, M["glass"], cx=cx, cz=cz)
    dark = M["accentDark"] if leaf in (M["accent"],) else M["timberDark"]
    for side in (-1, 1):
        m.rect(facing, back + LAYER, u + side * w * 0.2 - w * 0.14, u + side * w * 0.2 + w * 0.14, v + h * 0.1, v + h * 0.3, dark, cx=cx, cz=cz)
        if glazed:
            continue
        m.rect(facing, back + LAYER, u + side * w * 0.2 - w * 0.14, u + side * w * 0.2 + w * 0.14, v + h * 0.42, v + h * 0.86, dark, cx=cx, cz=cz)
    if glazed:
        m.rect(facing, back + LAYER, u - w * 0.34, u + w * 0.34, v + h * 0.4, v + h * 0.88, M["shopGlass"], cx=cx, cz=cz)
    m.rect(facing, back + 2 * LAYER, u + w * 0.32, u + w * 0.32 + 0.012, v + h * 0.47, v + h * 0.47 + 0.012, M["metal"], cx=cx, cz=cz)
    if step and v > 0:
        # The step's tread is the threshold carried out: one flat.
        # It starts at the face of whatever it stands against (a plinth
        # `step_from` proud), so its tread never overlaps the plinth's top.
        m.wall_box(facing, plane + step_from, u - w / 2 - step_w, u + w / 2 + step_w, 0.0, v, 0.06, step_mat or M["stone"], cx, cz, skip=("back", "bottom"))
    return hole


def chimney(m, M, x, z, y0, top, w=0.1, d=0.1, mat=None, pots=1):
    """A stack with an overhanging cap and pots, from `y0` (buried in the
    roof) to `top`."""
    cap = 0.024
    m.box(x - w / 2, x + w / 2, y0, top - cap, z - d / 2, z + d / 2, mat or M["stone"], skip=("bottom", "top"))
    m.box(x - w / 2 - 0.013, x + w / 2 + 0.013, top - cap, top, z - d / 2 - 0.013, z + d / 2 + 0.013, M["stoneDark"])
    along_z = d > w
    pitch = (d if along_z else w) * 0.5
    for i in range(pots):
        off = 0 if pots == 1 else (i - (pots - 1) / 2) * pitch
        px, pz = (x, z + off) if along_z else (x + off, z)
        m.cylinder(px, top, top + 0.042, pz, 0.019, M["tileDark"], segments=6, top_mat=M["railing"])


# ---------------------------------------------------------------- roofs

def gable_roof(m, M, *, x=0.0, z=0.0, y, w, d, rise, overhang, thickness, ridge="x", roof, gable, cap=None,
               courses=5, step=0.012, verge=None, butt=None, joints=0, gutter=False, avoid=(), ends=(1, -1), gables=None, downpipe=True):
    """A gabled roof whose slopes are laid in `courses`: each course rises
    `step` proud of the slope at its lower edge, so every course casts a line
    of shade (and bakes one) instead of having one painted on; `butt` colours
    those edges. `joints` staggered joints per course are laid a layer and a
    half over the tiles. The slopes carry on past the walls by `overhang` and
    drop below the wall plate as they do. `gutter` hangs a gutter under each
    eave and a downpipe at the back. No joint is laid inside an `avoid`
    rectangle (x0, x1, z0, z1): a chimney's footprint."""
    along_x = ridge == "x"
    half_a = (w if along_x else d) / 2
    half_b = (d if along_x else w) / 2
    pitch = rise / half_b
    apex = y + rise
    out_a = half_a + overhang
    out_b = half_b + overhang
    s = lambda b: apex - b * pitch  # noqa: E731
    # One slope's profile in (b, y), b from the ridge out to the eave. Course
    # k starts at the slope (tucked under the course above) and ends `step`
    # over it, where its butt drops back to the slope: the next course.
    top = [(0.0, apex)]
    for k in range(courses):
        b1 = out_b * (k + 1) / courses
        top.append((b1, s(b1) + step))
        if k < courses - 1:
            top.append((b1, s(b1)))
    profile = top + [(out_b, s(out_b) - thickness), (0.0, apex - thickness)]
    butts = {2 * k + 1: butt for k in range(courses - 1)} if butt is not None else {}
    c0 = z if along_x else x
    at = (lambda a, b, yy, side: (x + a, yy, z + side * b)) if along_x else (lambda a, b, yy, side: (x + side * b, yy, z + a))  # noqa: E731
    for side in (1, -1):
        pts = [(c0 + side * b, yy) for b, yy in profile]
        if along_x:
            m.prism_x(pts, x - out_a, x + out_a, roof, caps=False, edge_mats=butts)
        else:
            m.prism_z(pts, z - out_a, z + out_a, roof, caps=False, edge_mats=butts)
        # The verges, course by course: each a convex quad. (As one saw-
        # toothed polygon, its triangulation left slivers wound backwards.)
        for k in range(courses):
            b0 = out_b * k / courses
            b1 = out_b * (k + 1) / courses
            quad_b = [(b0, s(b0)), (b1, s(b1) + step), (b1, s(b1) - thickness), (b0, s(b0) - thickness)]
            for e in ends:
                pts3 = [at(e * out_a, b, yy, side) for b, yy in quad_b]
                out = (e, 0, 0) if along_x else (0, 0, e)
                m.face(pts3, verge or roof, out=out)
        # Staggered joints, clear of the ridge roll and the verges.
        for k in range(1, courses):
            if not joints:
                break
            b0 = out_b * k / courses
            b1 = out_b * (k + 1) / courses
            p0 = (b0, s(b0))
            p1 = (b1, s(b1) + step)
            db, dy = p1[0] - p0[0], p1[1] - p0[1]
            ln = math.hypot(db, dy)
            nb, ny = -dy / ln * 1.5 * LAYER, db / ln * 1.5 * LAYER
            lo = (p0[0] + db * 0.3 + nb, p0[1] + dy * 0.3 + ny)
            hi = (p0[0] + db * 0.97 + nb, p0[1] + dy * 0.97 + ny)
            for j in range(joints):
                a = -out_a + 2 * out_a * (j + 0.5 + 0.5 * (k % 2)) / (joints + 0.5)
                if abs(a) + 0.004 > out_a - 0.02:
                    continue
                quad = [at(a - 0.004, lo[0], lo[1], side), at(a + 0.004, lo[0], lo[1], side),
                        at(a + 0.004, hi[0], hi[1], side), at(a - 0.004, hi[0], hi[1], side)]
                if any(min(p[0] for p in quad) < ax1 + 0.01 and max(p[0] for p in quad) > ax0 - 0.01
                       and min(p[2] for p in quad) < az1 + 0.01 and max(p[2] for p in quad) > az0 - 0.01
                       for ax0, ax1, az0, az1 in avoid):
                    continue
                n = at(0, nb, ny, side)
                m.face(quad, butt or roof, out=(n[0] - x, n[1], n[2] - z))
        if gutter:
            # Its top is level with the foot of the eave: everything under
            # the slates, and anything rising through it, sees a gutter's
            # width of it, never a hair.
            eb = s(out_b) - thickness
            g0, g1 = out_b - 0.008, out_b + 0.016
            ga = out_a - 0.012  # its ends stop short of the verges' plane
            if along_x:
                zz = sorted((z + side * g0, z + side * g1))
                m.box(x - ga, x + ga, eb - 0.024, eb, zz[0], zz[1], M["metal"])
            else:
                xx = sorted((x + side * g0, x + side * g1))
                m.box(xx[0], xx[1], eb - 0.024, eb, z - ga, z + ga, M["metal"])
            if side == -1 and downpipe:
                px, _, pz = at(-half_a + 0.05, out_b + 0.004, 0, side)
                # Its top is inside the gutter.
                m.cylinder(px, 0.0, eb - 0.01, pz, 0.01, M["railing"], segments=5, top=False)
    inside = (x, y, z)
    # A porch's gable against the house is never seen: `ends` leaves it out.
    for end in ends:
        if along_x:
            tri = [(x + end * half_a, y, z - half_b), (x + end * half_a, y, z + half_b), (x + end * half_a, apex - 0.004, z)]
        else:
            tri = [(x - half_b, y, z + end * half_a), (x + half_b, y, z + end * half_a), (x, apex - 0.004, z + end * half_a)]
        m.face(tri, (gables or {}).get(end, gable), inside=inside)
    if cap is not None:
        t = thickness
        # A rounded ridge roll: five sides over the joint of the slopes.
        roll = [(-t * 0.9, apex - t * 0.2), (-t * 0.75, apex + t * 0.45), (0.0, apex + t * 0.75), (t * 0.75, apex + t * 0.45), (t * 0.9, apex - t * 0.2)]
        if along_x:
            m.prism_x([(z + p[0], p[1]) for p in roll], x - out_a - LAYER, x + out_a + LAYER, cap)
        else:
            m.prism_z([(x + p[0], p[1]) for p in roll], z - out_a - LAYER, z + out_a + LAYER, cap)
    return {"eave": s(out_b), "apex": apex, "pitch": pitch, "out_b": out_b, "out_a": out_a}


def rounded_rect(a, b, r, steps=2):
    """A counter-clockwise ring in (x, z): half extents a, b, corner radius r."""
    r = max(0.0, min(r, a * 0.999, b * 0.999))
    pts = []
    for cx, cz, start in ((a - r, b - r, 0.0), (-(a - r), b - r, 0.5), (-(a - r), -(b - r), 1.0), (a - r, -(b - r), 1.5)):
        for i in range(steps + 1):
            t = math.pi * (start + 0.5 * i / steps)
            pts.append((cx + math.cos(t) * r, cz + math.sin(t) * r))
    return pts


def loft_rings(m, rings, mats, hints, axis=(0.0, 0.0, 0.0, 0.0)):
    """Quads between consecutive closed rings of equal length (lists of 3D
    points). Band k, between ring k and k + 1, takes `mats[k]` and faces
    `hints[k]`: "out" (away from the axis segment x0..x1 at z), "up" or
    "down"."""
    x0, x1, z0, _ = axis
    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        n = len(lo)
        for i in range(n):
            j = (i + 1) % n
            pts = [lo[i], lo[j], hi[j], hi[i]]
            c = centroid(pts)
            if hints[k] == "up":
                out = (0, 1, 0)
            elif hints[k] == "down":
                out = (0, -1, 0)
            else:
                ax = min(max(c[0], x0), x1)
                out = (c[0] - ax, 0, c[2] - z0)
            m.face(pts, mats[k], out=out)


# ---------------------------------------------------------------- output

def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bake(objs, distance=0.16, floor=0.55, samples=128):
    """Bake each object's occlusion alone (the variants of a model all stand
    at the origin), over kit.bake_ao's ground plane."""
    for obj in objs:
        others = [o for o in objs if o is not obj]
        for o in others:
            o.hide_render = True
        kit.bake_ao([obj], distance=distance, samples=samples, floor=floor)
        for o in others:
            o.hide_render = False


def finish(mesh):
    """The `Mesh` as one object, doubles merged, flat, with an AO layer."""
    src = mesh.build()
    src.name = mesh.name + "-src"
    src.data.name = mesh.name + "-src"
    return kit.finish([src], mesh.name)


def write_meta(name, meta):
    """`assets/models/<name>.meta.json`, which the importer embeds as
    `MODEL.meta`: per node, the lit-window panels, roof pads and prop count."""
    path = os.path.join(ROOT, "assets/models", f"{name}.meta.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(meta, f, indent=1)


def band(m, plane_x, plane_z, v0, v1, proud, mat, cx=0.0, cz=0.0):
    """A string course round a block of half extents (plane_x, plane_z):
    four boxes standing `proud` of the walls, their tops a ledge only on the
    outside of the walls (a full slab's top would lie in every opening)."""
    for facing, plane, half in (("+z", plane_z, plane_x + proud), ("-z", plane_z, plane_x + proud), ("+x", plane_x, plane_z), ("-x", plane_x, plane_z)):
        # The x sides' ends are buried in the z sides' ends.
        skip = ("back",) if facing in ("+z", "-z") else ("back", "left", "right")
        m.wall_box(facing, plane, -half, half, v0, v1, proud, mat, cx, cz, skip=skip)
