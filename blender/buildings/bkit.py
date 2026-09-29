"""
A kit for the city's building archetypes (spike: Blender assets vs procedural).

An archetype is authored in UNIT SPACE -- x and z in [-0.5, 0.5], y in [0, 1],
the door on +z -- and every instance stretches it, non-uniformly, to its own
footprint and height. So nothing here is bevelled or booleaned: every face is
placed by hand, in exact planes, so the city's z-fighting, coplanar and ledge
checkers can hold it to the same rules as the procedural models, and a detail
is sized per axis with the stretch in mind (see `SCALE` in each script).

What the Blender version buys, inside the same triangle budget:
  - windows are OPENINGS: glass set back into the wall, with a lit sill, a
    soffit and two jambs, so every window carries a shadow line at its head
    and a bright line at its foot from the overview camera;
  - cornices, copings and plinths that project and step, not flat bands;
  - ambient occlusion baked at a representative instance size, floor 0.55.

Faces are built T-junction free where a surface is continuous (a wall and its
openings share every vertex along their seams), because the buildings are
hollow and a crack in a wall shows the sky through it.

`Draft` collects faces with a material ROLE each; the TypeScript side maps the
role to the city's vertex-colour multiplier (`models.ts`). The hex here is only
for Blender previews. Windows and roof pads are collected by the same calls
that place the geometry, and written to `<name>.meta.json` for the importer.

Coordinates are the app's: x across, y up, z forward (see `blender/kit.py`).
"""

import json
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
from kit import B  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

#: The depth step between stacked details (`LAYER` in mesh.ts).
LAYER = 0.006
PANEL_LIFT = 0.006

# role -> (preview hex, surface). The preview hex is the multiplier (models.ts)
# times a pale building colour; the city ignores it.
ROLES = {
    "wall": ("#ece3d4", "plaster"),
    "wallSoft": ("#dbd3c6", "plaster"),
    "trim": ("#f6efe2", "stone"),
    "plinth": ("#bdb6aa", "concrete"),
    "deck": ("#8d8c8c", "concrete"),
    "roof": ("#8d8c8c", "slate"),
    "roofLight": ("#a9a6a0", "slate"),
    "window": ("#636a72", "glass"),
    "glass": ("#8a939a", "glass"),
    "door": ("#5e514a", "timber"),
    "mech": ("#a1a09d", "metal"),
    "frame": ("#f0e7d8", "metal"),
    "lobby": ("#636e7c", "glass"),
    "metal": ("#c1bfbb", "metal"),
    "core": ("#ece3d4", "plaster"),
}
for i in range(9):
    ROLES[f"glass{i}"] = ("#7f9ab4", "glass")

FACES = ("+z", "-z", "+x", "-x")


def face_point(face, plane, u, v, depth=0.0, cx=0.0, cz=0.0):
    """A point on the wall `face` whose plane is `plane` from the centre
    (cx, cz): `u` along the wall as `mesh.ts` panels count it, `v` up, and
    `depth` out of the wall (negative is into it)."""
    out = plane + depth
    if face == "+z":
        return (cx + u, v, cz + out)
    if face == "-z":
        return (cx - u, v, cz - out)
    if face == "+x":
        return (cx + out, v, cz - u)
    return (cx - out, v, cz + u)


def outward(face):
    return {"+z": (0, 0, 1), "-z": (0, 0, -1), "+x": (1, 0, 0), "-x": (-1, 0, 0)}[face]


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


class Draft:
    def __init__(self, near=None):
        self.faces = []
        self.windows = []
        self.pads = []
        # A near-level detailer (`nkit.Near`): the same script builds the lean
        # draft with `near=None` and the detailed one with it, so every window,
        # pad and plane is placed by the same calls and the two agree exactly.
        self.near = near
        #: What made each face (`nkit` names its methods here), for debugging.
        self.tags = []
        self.tag = "lean"

    # -- primitives ---------------------------------------------------------

    def poly(self, pts, role, facing=None):
        """A planar polygon; with `facing`, wound so its normal points that way."""
        pts = [tuple(float(c) for c in p) for p in pts]
        if facing is not None:
            n = _cross(_sub(pts[1], pts[0]), _sub(pts[-1], pts[0]))
            if abs(_dot(n, n)) < 1e-18 and len(pts) > 3:
                n = _cross(_sub(pts[2], pts[1]), _sub(pts[0], pts[1]))
            if _dot(n, facing) < 0:
                pts = pts[::-1]
        self.faces.append((pts, role))
        self.tags.append(self.tag)

    def box(self, x, y, z, w, h, d, role, top=None, bottom=False, skip=()):
        """An axis-aligned box, `y` its BASE (as `addBox`). `skip` names faces
        buried in something else: '+x', '-x', '+z', '-z', '+y'."""
        x0, x1, y0, y1, z0, z1 = x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2
        if "+z" not in skip:
            self.poly([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], role, (0, 0, 1))
        if "-z" not in skip:
            self.poly([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], role, (0, 0, -1))
        if "+x" not in skip:
            self.poly([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], role, (1, 0, 0))
        if "-x" not in skip:
            self.poly([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], role, (-1, 0, 0))
        if "+y" not in skip:
            self.poly([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], top or role, (0, 1, 0))
        if bottom:
            self.poly([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], role, (0, -1, 0))

    def slab(self, y, h, hx, hz, role, top=None, cx=0.0, cz=0.0, bottom=True, top_face=True):
        """A projecting band (cornice, coping, plinth course): a box whose
        underside shows from the street."""
        skip = () if top_face else ("+y",)
        self.box(cx, y, cz, hx * 2, h, hz * 2, role, top=top, bottom=bottom, skip=skip)

    def ring(self, y, h, outer, inner, role, top=None, cx=0.0, cz=0.0, bottom=False, inner_faces=True):
        """A parapet: four walls round a roof, `outer` and `inner` half
        extents (x, z). Inner faces face the roof. Corners are mitred into one
        closed frame: an 8-vertex top, no overlaps."""
        ox, oz = outer
        ix, iz = inner
        y0, y1 = y, y + h
        O = [(cx + ox, cz + oz), (cx - ox, cz + oz), (cx - ox, cz - oz), (cx + ox, cz - oz)]
        I = [(cx + ix, cz + iz), (cx - ix, cz + iz), (cx - ix, cz - iz), (cx + ix, cz - iz)]
        for k in range(4):
            a, b = O[k], O[(k + 1) % 4]
            mid = ((a[0] + b[0]) / 2 - cx, 0, (a[1] + b[1]) / 2 - cz)
            self.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], role, mid)
            a, b = I[k], I[(k + 1) % 4]
            mid = (-((a[0] + b[0]) / 2 - cx), 0, -((a[1] + b[1]) / 2 - cz))
            if inner_faces:
                self.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], role, mid)
            # The coping, one trapezoid per side.
            self.poly(
                [(O[k][0], y1, O[k][1]), (O[(k + 1) % 4][0], y1, O[(k + 1) % 4][1]),
                 (I[(k + 1) % 4][0], y1, I[(k + 1) % 4][1]), (I[k][0], y1, I[k][1])],
                top or role, (0, 1, 0),
            )
            if bottom:
                self.poly(
                    [(O[k][0], y0, O[k][1]), (O[(k + 1) % 4][0], y0, O[(k + 1) % 4][1]),
                     (I[(k + 1) % 4][0], y0, I[(k + 1) % 4][1]), (I[k][0], y0, I[k][1])],
                    role, (0, -1, 0),
                )

    def gable(self, ridge, half_a, half_b, eave_y, ridge_y, t, courses=0, lap=0.0, cap=0.0,
              roof="roof", under="wallSoft", edge="trim", capping="roofLight"):
        """A pitched roof slab with a real thickness: two slopes from the eaves
        (at +-half_b across the ridge, top at eave_y) to the ridge (ridge_y),
        running +-half_a along it, an underside, fascias and verges. With
        `courses`, each slope is stepped into that many laps `lap` proud, so
        the roof reads as tiles or slates from the overview. Returns the
        height of the plain slope's top at a distance across the ridge."""
        def at(a, b, y):
            return (a, y, b) if ridge == "x" else (b, y, a)

        def vec(a, b, y):
            return at(a, b, y)

        slope = lambda b: ridge_y - (ridge_y - eave_y) * abs(b) / half_b  # noqa: E731
        A = half_a
        for s in (1, -1):
            # The top profile across the ridge, eave to ridge: (b, y) points.
            prof = [(s * half_b, eave_y)]
            if courses:
                for k in range(courses):
                    b0 = half_b * (1 - k / courses)
                    b1 = half_b * (1 - (k + 1) / courses)
                    if k > 0:
                        prof.append((s * b0, slope(b0) + lap))
                    prof.append((s * b1, slope(b1)))
                prof[0] = (s * half_b, eave_y + lap)
            else:
                prof.append((0.0, ridge_y))
            for (b0, y0), (b1, y1) in zip(prof, prof[1:]):
                p = [at(-A, b0, y0), at(A, b0, y0), at(A, b1, y1), at(-A, b1, y1)]
                if abs(b0 - b1) < 1e-9:
                    self.poly(p, roof, vec(0, s, 0))
                else:
                    self.poly(p, roof, vec(0, s * 0.5, 1))
            e_bot = (s * half_b, eave_y - t)
            r_bot = (0.0, ridge_y - t)
            self.poly([at(-A, *e_bot), at(A, *e_bot), at(A, *r_bot), at(-A, *r_bot)], under, vec(0, -s * 0.5, -1))
            self.poly([at(-A, *e_bot), at(A, *e_bot), at(A, *prof[0]), at(-A, *prof[0])], edge, vec(0, s, 0))
            for a in (A, -A):
                pts = [at(a, *e_bot)] + [at(a, *q) for q in prof] + [at(a, *r_bot)]
                self.poly(pts, edge, vec(1 if a > 0 else -1, 0, 0))
        if cap:
            # A layer past the verges, so its ends never share their plane.
            A = half_a + LAYER * 1.2
            w = half_b * 0.08
            lo = slope(w) + lap * 0.5 + 0.003
            for s in (1, -1):
                self.poly([at(-A, s * w, lo), at(A, s * w, lo), at(A, 0, ridge_y + cap), at(-A, 0, ridge_y + cap)], capping, vec(0, s, 1))
            for a in (A, -A):
                self.poly([at(a, w, lo), at(a, 0, ridge_y + cap), at(a, -w, lo), at(a, 0, ridge_y - 0.004)], capping, vec(1 if a > 0 else -1, 0, 0))
        return slope

    def prism_y(self, x, z, r, y0, y1, n, role, top=None):
        """An upright n-sided prism (a mast, a flue), capped."""
        import math
        ring = [(x + r * math.cos(2 * math.pi * k / n), z + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            a, b = ring[k], ring[(k + 1) % n]
            mid = ((a[0] + b[0]) / 2 - x, 0, (a[1] + b[1]) / 2 - z)
            self.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], role, mid)
        self.poly([(p[0], y1, p[1]) for p in ring], top or role, (0, 1, 0))

    def core(self, y0, y1, hx, hz, cx=0.0, cz=0.0):
        """The building's core: four walls, no lid, just behind the glass of
        every opening. Nothing sees it but through a crack at a seam of the
        facade in front, where it shows wall, not sky."""
        self.box(cx, y0, cz, hx * 2, y1 - y0, hz * 2, "core", skip=("+y",))

    def flat_roof(self, y, outer, inner, deck="deck", edge="trim", inset=0.0, cx=0.0, cz=0.0):
        """The top of a cornice with a roof deck inside it: `outer` the
        cornice's half extents, `inner` where the deck starts (a parapet's
        inner face). One grid, so the deck and the cornice's top share every
        vertex; with `inset`, the deck gets a line of vertices that far in
        from its edge, so the occlusion darkens a rim and not the whole deck."""
        def lines(o, i):
            ls = [-o, -i, i, o]
            if inset and i - inset > 0.02:
                ls = [-o, -i, -i + inset, i - inset, i, o]
            return _dedupe(sorted(set(ls)))
        xs = lines(outer[0], inner[0])
        zs = lines(outer[1], inner[1])
        for a in range(len(xs) - 1):
            for b in range(len(zs) - 1):
                x0, x1, z0, z1 = xs[a], xs[a + 1], zs[b], zs[b + 1]
                mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
                role = deck if abs(mx) < inner[0] and abs(mz) < inner[1] else edge
                self.poly([(cx + x0, y, cz + z0), (cx + x1, y, cz + z0), (cx + x1, y, cz + z1), (cx + x0, y, cz + z1)], role, (0, 1, 0))

    def pad(self, x, z, y, w, d):
        self.pads.append({"x": round(x, 6), "z": round(z, 6), "y": round(y, 6), "w": round(w, 6), "d": round(d, 6)})

    # -- facades --------------------------------------------------------------

    def facade(self, face, plane, u0, u1, v0, v1, openings, role="wall", cx=0.0, cz=0.0, vbreaks=(), ubreaks=(), merge=True):
        """One wall, `u0..u1` by `v0..v1`, with rectangular OPENINGS cut into it.

        Each opening is a dict: u, v (centre), w, h, depth (how far the glass
        is set back), glass (role), and optionally lit (publish it as a window
        for the lit-window pass, default True), sill / head / jamb roles, and
        head=False to leave the soffit off (a door has a canopy over it).

        The wall is the grid of every opening's edges, minus the openings, so
        the wall and the reveals share every vertex along every seam."""
        us = sorted(set([u0, u1, *ubreaks] + [o["u"] + s * o["w"] / 2 for o in openings for s in (-1, 1)]))
        vs = sorted(set([v0, v1, *vbreaks] + [o["v"] + s * o["h"] / 2 for o in openings for s in (-1, 1)]))
        us = _dedupe(us)
        vs = _dedupe(vs)
        out = outward(face)

        def inside(u, v):
            for o in openings:
                if abs(u - o["u"]) < o["w"] / 2 - 1e-9 and abs(v - o["v"]) < o["h"] / 2 - 1e-9:
                    return True
            return False

        P = lambda u, v, d=0.0: face_point(face, plane, u, v, d, cx, cz)  # noqa: E731
        nu, nv = len(us) - 1, len(vs) - 1
        wall = [[not inside((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2) for j in range(nv)] for i in range(nu)]
        if not merge:
            rects = [(i, i + 1, j, j + 1) for i in range(nu) for j in range(nv) if wall[i][j]]
        else:
            # Greedy: maximal runs along each row, then runs stacked with the
            # same ends merged up. The seams this leaves as T-junctions have
            # the building's core (`core`) right behind them.
            rects = []
            open_ = {}
            for j in range(nv):
                runs = []
                i = 0
                while i < nu:
                    if not wall[i][j]:
                        i += 1
                        continue
                    k = i
                    while k < nu and wall[k][j]:
                        k += 1
                    runs.append((i, k))
                    i = k
                nxt = {}
                for run in runs:
                    if run in open_:
                        nxt[run] = open_.pop(run)
                    else:
                        nxt[run] = j
                for (i0, i1), j0 in open_.items():
                    rects.append((i0, i1, j0, j))
                open_ = nxt
            for (i0, i1), j0 in open_.items():
                rects.append((i0, i1, j0, nv))
        top_us = set()
        for i0, i1, j0, j1 in rects:
            a, b, c, d = us[i0], us[i1], vs[j0], vs[j1]
            self.poly([P(a, c), P(b, c), P(b, d), P(a, d)], role, out)
            if j1 == nv:
                top_us.update((a, b))
        self.last_top = sorted(top_us)

        for o in openings:
            ou0, ou1 = o["u"] - o["w"] / 2, o["u"] + o["w"] / 2
            ov0, ov1 = o["v"] - o["h"] / 2, o["v"] + o["h"] / 2
            r = -o["depth"]
            ou = [u for u in us if ou0 - 1e-9 <= u <= ou1 + 1e-9] if not merge else [ou0, ou1]
            ov = [v for v in vs if ov0 - 1e-9 <= v <= ov1 + 1e-9] if not merge else [ov0, ov1]
            # The glass, split wherever the wall round it is.
            for i in range(len(ou) - 1):
                for j in range(len(ov) - 1):
                    self.poly([P(ou[i], ov[j], r), P(ou[i + 1], ov[j], r), P(ou[i + 1], ov[j + 1], r), P(ou[i], ov[j + 1], r)], o["glass"], out)
            sill = o.get("sill", role)
            head = o.get("head", role)
            jamb = o.get("jamb", role)
            for i in range(len(ou) - 1):
                if o.get("sill_face", True):
                    self.poly([P(ou[i], ov0, 0), P(ou[i + 1], ov0, 0), P(ou[i + 1], ov0, r), P(ou[i], ov0, r)], sill, (0, 1, 0))
                if head:
                    self.poly([P(ou[i], ov1, 0), P(ou[i + 1], ov1, 0), P(ou[i + 1], ov1, r), P(ou[i], ov1, r)], head, (0, -1, 0))
            for j in range(len(ov) - 1):
                for uu, sgn in ((ou0, 1), (ou1, -1)):
                    # A jamb faces into the opening: along +u from the left.
                    a = P(uu, ov[j], 0)
                    along = _sub(P(uu + sgn * 0.1, ov[j], 0), a)
                    self.poly([P(uu, ov[j], 0), P(uu, ov[j + 1], 0), P(uu, ov[j + 1], r), P(uu, ov[j], r)], jamb, along)
            if o.get("ledge"):
                # A projecting sill, its top a step under the opening's so
                # neither is a sliver on the other.
                proj, h, lrole = o["ledge"]
                ext = o.get("ledge_ext", 0.012)
                top = ov0 - 0.008
                a0, a1 = ou0 - ext, ou1 + ext
                corners = lambda v, dd: [P(a0, v, dd), P(a1, v, dd)]  # noqa: E731
                f0, f1 = corners(top - h, proj), corners(top, proj)
                b0, b1 = corners(top - h, 0), corners(top, 0)
                self.poly([f0[0], f0[1], f1[1], f1[0]], lrole, out)
                self.poly([b1[0], b1[1], f1[1], f1[0]], lrole, (0, 1, 0))
                self.poly([b0[0], b0[1], f0[1], f0[0]], lrole, (0, -1, 0))
                for k in (0, 1):
                    side = _sub(f0[k], f0[1 - k])
                    self.poly([b0[k], f0[k], f1[k], b1[k]], lrole, side)
            if o.get("lit", True):
                self.window(face, plane - o["depth"], o["u"], o["v"], o.get("lit_w", o["w"]), o.get("lit_h", o["h"]), cx, cz,
                            whole="lit_w" not in o and "lit_h" not in o)
            if self.near and not o.get("bay"):
                self.near.opening(self, face, plane, o, cx, cz)
        return us, vs

    def window(self, face, glass_plane, u, v, w, h, cx=0.0, cz=0.0, whole=False, frame=True):
        """Publish a window for the lit-window pass: the dark pane of `mesh.ts`
        sits PANEL_LIFT off `plane`, so `plane` is the glass minus the lift.
        `whole` says the window is its opening's whole glass (the near level
        frames it inside its rectangle rather than round it); `frame=False`
        leaves it unframed (a curtain wall's cells are framed by its mullions)."""
        panel = {"facing": face, "u": round(u, 6), "v": round(v, 6), "w": round(w, 6), "h": round(h, 6),
                 "plane": round(glass_plane - PANEL_LIFT, 6)}
        if cx or cz:
            panel["cx"] = round(cx, 6)
            panel["cz"] = round(cz, 6)
        self.windows.append(panel)
        if self.near and frame:
            self.near.light(self, face, glass_plane, u, v, w, h, cx, cz, inside=whole)

    # -- output ---------------------------------------------------------------

    def triangles(self):
        return sum(len(p) - 2 for p, _ in self.faces)

    def mesh(self, name):
        """The draft as one Blender object with a material per role and an
        `AO` corner colour attribute, ready for `kit.bake_ao`."""
        mats = {}
        bm = bmesh.new()
        index = {}
        order = []
        for pts, role in self.faces:
            if role not in index:
                index[role] = len(order)
                order.append(role)
            verts = [bm.verts.new(B(p)) for p in pts]
            f = bm.faces.new(verts)
            f.material_index = index[role]
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for role in order:
            # `role@96` is the role at a 96% tone, baked into the vertex colour.
            base, _, tone = role.partition("@")
            hex_, surface = ROLES[base]
            mats[role] = kit.material(base, hex_, surface, roughness=0.8, tone=int(tone) / 100 if tone else 1.0)
            mesh.materials.append(mats[role])
        for poly in mesh.polygons:
            poly.use_smooth = False
        ao = mesh.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
        ao.data.foreach_set("color", [1.0] * (len(ao.data) * 4))
        mesh.color_attributes.active_color = ao
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def _dedupe(values, eps=1e-7):
    out = []
    for v in values:
        if not out or v - out[-1] > eps:
            out.append(v)
    return out


def bake(obj, scale, distance=1.2, floor=0.55, samples=96):
    """Bake occlusion with the model stretched to a representative instance
    (`scale` = world size x, y, z), so a cornice shades the wall under it by
    what it overhangs in the city, not in the unit box."""
    sx, sy, sz = scale
    obj.scale = (sx, sz, sy)
    bpy.context.view_layer.update()
    kit.bake_ao([obj], distance=distance, samples=samples, floor=floor)
    obj.scale = (1, 1, 1)
    # The core is only ever seen through a crack: bright, like the wall.
    mesh = obj.data
    core = [i for i, m in enumerate(mesh.materials) if m.name.startswith("core.")]
    if core:
        data = mesh.color_attributes["AO"].data
        for poly in mesh.polygons:
            if poly.material_index in core:
                for li in poly.loop_indices:
                    data[li].color = (0.9, 0.9, 0.9, 1)


def build_model(make, scale, meta_extra=None, name="Building", distance=1.2, near=False):
    """Run an archetype script: build the draft, bake, write the sidecar.
    With `near`, `make(True)` builds the detailed level (`near.py`)."""
    kit.reset()
    d = make(True) if near else make()
    obj = d.mesh(name)
    print("TRIS", name, d.triangles(), "WINDOWS", len(d.windows))
    bake(obj, scale, distance=distance, samples=16 if near else 96)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) >= 2 and argv[0].endswith(".py"):
        meta = {"windows": d.windows, "roofPads": d.pads, "maxProps": 0}
        meta.update(meta_extra or {})
        path = os.path.join(ROOT, "assets/models", f"{argv[1]}.meta.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(meta, f, indent=1)
        print("META", path)
    return [obj]


# -- composition helpers ------------------------------------------------------


def spread(n, width):
    """`n` centres spread across `width`, ends on its edges (`windowGrid`)."""
    if n == 1:
        return [0.0]
    return [-width / 2 + width * i / (n - 1) for i in range(n)]


def grid(us, vs, w, h, depth, glass="window", **kw):
    """Openings at every (u, v)."""
    return [dict(u=u, v=v, w=w, h=h, depth=depth, glass=glass, **kw) for v in vs for u in us]


def _bay(d, face, plane, u, w, v0, v1, lights, depth, spandrel, cx=0.0, cz=0.0, role="wallSoft", glass="window"):
    """A tall recessed bay from v0 to v1: one opening, glass at the back, and
    `lights` storeys of it divided by spandrel panels two layers proud of the
    glass. Publishes each light as a window."""
    h = (v1 - v0) / lights
    g = plane - depth
    for k in range(1, lights):
        v = v0 + h * k
        a, b = u - w / 2, u + w / 2
        pts = [face_point(face, g + LAYER * 2, a, v - spandrel / 2, 0, cx, cz), face_point(face, g + LAYER * 2, b, v - spandrel / 2, 0, cx, cz),
               face_point(face, g + LAYER * 2, b, v + spandrel / 2, 0, cx, cz), face_point(face, g + LAYER * 2, a, v + spandrel / 2, 0, cx, cz)]
        d.poly(pts, role, outward(face))
    for k in range(lights):
        lo = v0 + h * k + (spandrel / 2 if k > 0 else 0)
        hi = v0 + h * (k + 1) - (spandrel / 2 if k < lights - 1 else 0)
        d.window(face, g, u, (lo + hi) / 2, w * 0.9, (hi - lo) * 0.9, cx, cz)
    if d.near:
        d.near.bay(d, face, plane, u, w, v0, v1, lights, depth, spandrel, cx, cz)
    return dict(u=u, v=(v0 + v1) / 2, w=w, h=v1 - v0, depth=depth, glass=glass, lit=False, bay=True)


def fins(d, face, plane, us, y0, y1, t, proud, back, role="trim", cx=0.0, cz=0.0, back_face=False, capital=True):
    """Vertical fins down a facade: `proud` in front of the wall and `back`
    behind it (to the glass), so where a fin crosses an opening it stands on
    the glass rather than floating in front of a hole."""
    out = outward(face)
    for u in us:
        a, b = u - t / 2, u + t / 2
        P = lambda uu, v, dd: face_point(face, plane, uu, v, dd, cx, cz)  # noqa: E731
        d.poly([P(a, y0, proud), P(b, y0, proud), P(b, y1, proud), P(a, y1, proud)], role, out)
        for uu, sgn in ((a, -1), (b, 1)):
            side = _sub(P(uu + sgn * 0.1, y0, 0), P(uu, y0, 0))
            d.poly([P(uu, y0, -back), P(uu, y0, proud), P(uu, y1, proud), P(uu, y1, -back)], role, side)
        if back_face:
            # Flush on the wall: closes the fin over the wall it hides.
            d.poly([P(a, y0, -back), P(b, y0, -back), P(b, y1, -back), P(a, y1, -back)], role, tuple(-c for c in out))
    if d.near and capital:
        d.near.fins(d, face, plane, us, y0, y1, t, proud, cx, cz)


def volume(d, y0, y1, hx, hz, openings, depth, cx=0.0, cz=0.0, role="wall", core_gap=0.01):
    """Four walls with their openings, and the core behind them."""
    d.core(y0, y1, hx - depth - core_gap, hz - depth - core_gap, cx, cz)
    for face in FACES:
        along = hx if face in ("+z", "-z") else hz
        plane = hz if face in ("+z", "-z") else hx
        d.facade(face, plane, -along, along, y0, y1, openings.get(face, []), role, cx, cz)


def crown(d, y, hx, hz, cornice_h, proj, parapet_h, parapet_t, cx=0.0, cz=0.0, inset=0.06,
          cornice="trim", coping="trim", deck="deck"):
    """A projecting cornice at `y` over walls of half extents (hx, hz), a
    parapet flush with its face and a roof deck inside. Returns the deck's
    height and its half extents."""
    ox, oz = hx + proj, hz + proj
    d.box(cx, y, cz, ox * 2, cornice_h, oz * 2, cornice, bottom=True, skip=("+y",))
    top = y + cornice_h
    ix, iz = ox - parapet_t, oz - parapet_t
    d.flat_roof(top, (ox, oz), (ix, iz), deck=deck, edge=cornice, inset=inset, cx=cx, cz=cz)
    if parapet_h > 0:
        d.ring(top, parapet_h, (ox, oz), (ix, iz), coping, cx=cx, cz=cz)
    if d.near:
        d.near.crown(d, y, hx, hz, cornice_h, proj, parapet_h, parapet_t, cx, cz)
    return top, ix, iz


def _sleeve(d, y, h, hx, hz, proud, chamfer, role, cx, cz):
    """A spandrel sleeve closed against the glass with no underside: its
    face leans out from the glass over the lower `chamfer` of its height,
    then stands upright to a lit top, so from the street there is no gap to
    look up into."""
    I = [(cx + hx, cz + hz), (cx - hx, cz + hz), (cx - hx, cz - hz), (cx + hx, cz - hz)]
    O = [(cx + (hx + proud) * sx, cz + (hz + proud) * sz) for sx, sz in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    yb, yt = y + h * chamfer, y + h
    for k in range(4):
        n = (k + 1) % 4
        mid = ((O[k][0] + O[n][0]) / 2 - cx, 0, (O[k][1] + O[n][1]) / 2 - cz)
        d.poly([(I[k][0], y, I[k][1]), (I[n][0], y, I[n][1]), (O[n][0], yb, O[n][1]), (O[k][0], yb, O[k][1])], role, (mid[0], -0.5, mid[2]))
        if chamfer < 1.0:
            d.poly([(O[k][0], yb, O[k][1]), (O[n][0], yb, O[n][1]), (O[n][0], yt, O[n][1]), (O[k][0], yt, O[k][1])], role, mid)
        d.poly([(O[k][0], yt, O[k][1]), (O[n][0], yt, O[n][1]), (I[n][0], yt, I[n][1]), (I[k][0], yt, I[k][1])], role, (0, 1, 0))


def curtain(d, y0, y1, hx, hz, bands, mullions, spandrel, grade=(0.0, 1.0), cx=0.0, cz=0.0,
            sleeve="frame", lit_every=3, lit_faces=FACES, proud=0.014, mproud=0.022, mt=0.022, panes=2, seed=0, chamfer=1.0):
    """A curtain-walled shaft: a closed glass box, one band a storey graded
    from dark at the foot to sky-pale at the top (`glass0`..`glass8`, and
    each pane a slightly different tone of it), a spandrel sleeve `proud` of
    the glass at the foot of every storey with a lit top, and mullions
    `mproud` proud down every face. Publishes the cells between mullions of
    every `lit_every`th storey, from the top down, as windows."""
    band = (y1 - y0) / bands
    tones = (96, 102, 99, 104, 97, 101)
    for i in range(bands):
        t = grade[0] + (grade[1] - grade[0]) * (i + 0.5) / bands
        level = max(0, min(8, round(t * 8)))
        b0, b1 = y0 + band * i, y0 + band * (i + 1)
        for fi, face in enumerate(FACES):
            half = hx if face in ("+z", "-z") else hz
            plane = hz if face in ("+z", "-z") else hx
            for k in range(panes):
                a = -half + 2 * half * k / panes
                b = -half + 2 * half * (k + 1) / panes
                tone = tones[(i * 5 + k * 3 + fi * 2 + seed) % len(tones)]
                pts = [face_point(face, plane, a, b0, 0, cx, cz), face_point(face, plane, b, b0, 0, cx, cz),
                       face_point(face, plane, b, b1, 0, cx, cz), face_point(face, plane, a, b1, 0, cx, cz)]
                d.poly(pts, f"glass{level}@{tone}", outward(face))
        _sleeve(d, b0, band * spandrel, hx, hz, proud, chamfer, sleeve, cx, cz)
    for face in FACES:
        half = hx if face in ("+z", "-z") else hz
        plane = hz if face in ("+z", "-z") else hx
        posts = [-half + 2 * half * k / (mullions + 1) for k in range(1, mullions + 1)]
        fins(d, face, plane, posts, y0, y1, mt, mproud, 0.0, sleeve, cx, cz, capital=False)
        if face not in lit_faces:
            continue
        cell = 2 * half / (mullions + 1)
        glass_h = band * (1 - spandrel)
        for i in range(bands):
            if (bands - 1 - i) % lit_every:
                continue
            v = y0 + band * i + band * spandrel + glass_h / 2
            for k in range(mullions + 1):
                u = -half + cell * (k + 0.5)
                d.window(face, plane, u, v, cell * 0.8, glass_h * 0.78, cx, cz, frame=False)
    if d.near:
        d.near.curtain(d, y0, y1, hx, hz, bands, mullions, spandrel, cx, cz, proud, mproud, mt, sleeve)
    return y1


def lobby(d, y0, y1, hw, depth, glass="lobby", cx=0.0, cz=0.0):
    """A glazed ground floor: a band of glass round all four walls, the door
    in the middle of the front one, and the core behind."""
    foot, head = y0 + (y1 - y0) * 0.22, y0 + (y1 - y0) * 0.86
    band = dict(v=(foot + head) / 2, h=head - foot, depth=depth, glass=glass, sill="plinth", lit=False)
    door = dict(u=0, v=(y0 + head) / 2, w=0.16, h=head - y0, depth=depth + 0.012, glass="door", lit=False, sill_face=False, lamps=False, arch=0.1)
    w = hw * 2 * 0.8
    side = (w - 0.2) / 2
    openings = {f: [dict(band, u=0, w=w)] for f in FACES}
    openings["+z"] = [dict(band, u=-(0.1 + side / 2), w=side), door, dict(band, u=0.1 + side / 2, w=side)]
    volume(d, y0, y1, hw, hw, openings, depth + 0.02, cx, cz)
    if d.near:
        d.near.lobby(d, y0, y1, hw, depth, cx, cz)
