"""
The near levels of the city's low buildings: a `bkit.Draft` that dresses
everything the lean scripts place.

`NearDraft` is a drop-in for `bkit.Draft` in a near script. Its `facade`
takes the same openings the lean script gives, so the glass stays in exactly
the rectangles the lit-window pass draws on, and then frames them, divides the
glass with bars, sets a sill under them and a lintel over them, and turns a
door into a panelled one with a surround and steps. Its walls are cut into a
grid of cells (the occlusion is baked per vertex) so the shade can follow the
reveals, sills and lintels instead of averaging over a whole storey.

Details are sized in metres at the script's representative instance size
(`detail.py`), never in unit fractions, so a stretched building does not
squash them.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
from detail import Detail  # noqa: E402

# Semantic names -> the city's Blender roles (models.ts maps them on). A tone
# after the `@` is baked into the vertex colour: a darker shade of the role.
PALETTE = {
    "frame": "frame",
    "trim": "trim",
    "door": "door",
    "doorDark": "door@80",
    "metal": "mech",
    "wallSoft": "wallSoft",
    "roofLight": "roofLight",
    "roof": "roof",
    "roofJoint": "roof@74",
    "wall": "wall",
    "plinth": "plinth",
    "deck": "deck",
    "glass": "glass",
    "window": "window",
}


class NearDraft(bkit.Draft):
    def __init__(self, scale):
        super().__init__()
        self.scale = scale
        self.det = Detail(lambda pts, mat, out: self.poly(pts, mat, out), PALETTE, scale)
        #: Per-face style for `dress`: e.g. {"+z": {"shutters": True}}.
        self.style = {}
        #: Extra cell size for the wall grid, in metres.
        self.cell = (1.1, 0.9)
        #: Heights of extra grid lines on every wall (the edges of a belt course).
        self.vlines = []

    def facade(self, face, plane, u0, u1, v0, v1, openings, role="wall", cx=0.0, cz=0.0, vbreaks=(), ubreaks=(), merge=True, dress=True):
        plain = [{k: v for k, v in o.items() if k != "ledge"} for o in openings]
        # A grid line every so often where no opening is, so the baked shade
        # can vary along a wall: never through an opening's glass.
        sxu = self.scale[0] if face in ("+z", "-z") else self.scale[2]
        cu, cv = self.cell
        ub, vb = list(ubreaks), list(vbreaks)

        def free_u(u):
            return not any(abs(u - o["u"]) < o["w"] / 2 + 1e-6 for o in openings)

        def free_v(v, u_range):
            return not any(abs(v - o["v"]) < o["h"] / 2 + 1e-6 and o["u"] + o["w"] / 2 > u_range[0] and o["u"] - o["w"] / 2 < u_range[1] for o in openings)

        # Grid lines round each opening's dressing (jambs, sill, lintel): the
        # wall under the trim is never seen, and the crease where the trim
        # meets the wall stays in its own narrow cells instead of smearing
        # its shade across a whole panel.
        det = self.det
        for o in openings:
            if o["glass"] == "door":
                ex, lo_, hi_ = 0.13, 0.0, 0.36
            else:
                ex, lo_, hi_ = 0.1, 0.06, 0.22
            for uu in (o["u"] - o["w"] / 2 - det.U(face, ex), o["u"] + o["w"] / 2 + det.U(face, ex)):
                if u0 < uu < u1 and free_u(uu):
                    ub.append(uu)
            for vv in (o["v"] - o["h"] / 2 - det.V(lo_), o["v"] + o["h"] / 2 + det.V(hi_)):
                if v0 < vv < v1 and free_v(vv, (u0, u1)):
                    vb.append(vv)
        for vv in self.vlines:
            if v0 < vv < v1 and free_v(vv, (u0, u1)):
                vb.append(vv)
        n = max(1, round((u1 - u0) * sxu / cu))
        for k in range(1, n):
            u = u0 + (u1 - u0) * k / n
            if free_u(u):
                ub.append(u)
        m = max(1, round((v1 - v0) * self.scale[1] / cv))
        for k in range(1, m):
            v = v0 + (v1 - v0) * k / m
            if free_v(v, (u0, u1)):
                vb.append(v)
        res = super().facade(face, plane, u0, u1, v0, v1, plain, role, cx, cz, vbreaks=vb, ubreaks=ub, merge=False)
        if dress:
            for o in openings:
                self.dress(face, plane, o, cx, cz)
        return res

    def dress(self, face, plane, o, cx=0.0, cz=0.0):
        style = dict(self.style.get(face, {}))
        style.update(o.get("near", {}))
        if o["glass"] == "door":
            if style.get("plain_door"):
                return
            self.det.door(face, plane, o, cx, cz, **style.get("door", {}))
        elif o["glass"] in ("window", "glass", "lobby"):
            opts = {k: v for k, v in style.items() if k in ("fw", "bars", "sill", "lintel", "jambs", "shutters", "sill_ext")}
            self.det.window(face, plane, o, cx, cz, **opts)


    def gable(self, ridge, half_a, half_b, eave_y, ridge_y, t, courses=0, lap=0.0, cap=0.0, roof="roof", slate=0.3, **kw):
        """The lean gable, its roof courses cut into slates: each course is a
        row of separate quads, staggered a half slate against the row below
        and each a slightly different shade of the roof, so the joints show
        as steps of tone and no face lies over another."""
        start = len(self.faces)
        slope = super().gable(ridge, half_a, half_b, eave_y, ridge_y, t, courses=courses, lap=lap, cap=cap, roof=roof, **kw)
        if not courses:
            return slope
        scale_a = self.scale[0] if ridge == "x" else self.scale[2]
        n = max(3, round(half_a * 2 * scale_a / slate))
        old = self.faces[start:]
        del self.faces[start:]
        del self.tags[start:]
        tones = (86, 93, 100, 96, 90)
        row = {}
        for pts, role in old:
            if role != roof or len(pts) != 4:
                self.faces.append((pts, role))
                self.tags.append(self.tag)
                continue
            # The face's height and side identify its course: rows of one slope
            # alternate the stagger.
            key = (round(pts[0][1], 4), pts[0][2 if ridge == "x" else 0] > 0)
            k = row.setdefault(key, len(row))
            p0, p1, p2, p3 = pts
            # p0 -> p1 runs along the ridge.
            lerp = lambda a_, b_, f: tuple(a_[i] + (b_[i] - a_[i]) * f for i in range(3))  # noqa: E731
            cuts = [0.0] + [(j + (0.5 if k % 2 else 0.0)) / n for j in range(n + 1) if 0 < (j + (0.5 if k % 2 else 0.0)) / n < 1] + [1.0]
            for j, (f0, f1) in enumerate(zip(cuts, cuts[1:])):
                q = [lerp(p0, p1, f0), lerp(p0, p1, f1), lerp(p3, p2, f1), lerp(p3, p2, f0)]
                tone = tones[(k * 3 + j * 7 + (k * j) % 5) % len(tones)]
                self.faces.append((q, f"{roof}@{tone}"))
                self.tags.append(self.tag)
        return slope


def build_near(make, scale, name, distance=1.2, samples=16, floor=0.7):
    """Run a near script: build the draft, bake, and write nothing the lean
    model does not already publish (its windows and roof pads are the lean
    model's; the near level only dresses them)."""
    import kit

    kit.reset()
    d = make()
    obj = d.mesh(name)
    print("TRIS", name, d.triangles(), "WINDOWS", len(d.windows))
    bkit.bake(obj, scale, distance=distance, floor=floor, samples=samples)
    return [obj]
