"""
The near level of the building archetypes: extra detail for the few buildings
drawn close to the camera (`components/city/lod.tsx`).

A near model is the SAME script run with a `Near` attached to its `Draft`
(`bkit.Draft(near=Near(SCALE))`). The lean calls place every wall, opening and
window exactly as before; `bkit` then tells the `Near` about each window,
bay, cornice, curtain wall and lobby it has just placed, and the near adds
frames, mullions, transoms, sills, dentils, copings, posts and door hardware
on top. So the two levels share their footprint, their silhouette and their
window rectangles by construction, and the lit-window pass, which draws from
the lean model's `windows`, lines up at night. Nothing here removes or moves a
lean face.

A model is stretched non-uniformly (`SCALE`), so a detail is sized in WORLD
units and turned into unit space per axis (`ux`, `uy`): a square section on
screen is not a square in the unit box. Horizontal depths are always `ux`.

Stacking rules that keep the city's checks green (`zfight.test.ts`,
`ledges.test.ts`): anything that can lie over a lit window stands at least
0.012 off the glass (the lit pane is 0.006 off it, and a layer is 0.006), and
no ledge that catches light is thinner than 0.008.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
from bkit import FACES, face_point, outward  # noqa: E402

#: How far a frame stands off the glass, unit-space: past the lit pane (0.006 off
#: the glass) and clear of the lean spandrel panels (0.012).
STAND = 0.016


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


class Near:
    def __init__(self, scale, sash="mech", trim="trim", post="trim", frame_t=0.07, dentils=True):
        self.sx, self.sy, self.sz = scale
        #: Role of window frames, mullions and transoms.
        self.sash = sash
        #: Piers placed so far, by (face, cx, cz): the dentils keep off them.
        self.piers = {}
        #: Recessed bays placed so far, (u, half width, top of their keystone),
        #: which the dentils above them make room for.
        self.bays = {}
        self.trim = trim
        self.post = post
        #: Dentils under cornices: for stone; a curtain wall's cornice has its caps there.
        self.dentils = dentils
        self.frame_t = frame_t

    # -- units ----------------------------------------------------------------

    def ux(self, m):
        """World metres across (x or z) -> unit space."""
        return m / self.sx

    def uy(self, m):
        """World metres up -> unit space."""
        return m / self.sy

    # -- primitives -----------------------------------------------------------

    def fbox(self, d, face, plane, u0, u1, v0, v1, d0, d1, role, cx=0.0, cz=0.0, skip=("back",)):
        """A box on the wall `face` (plane `plane` from the centre (cx, cz)):
        u0..u1 along the wall, v0..v1 up, d0..d1 out of it (negative is into
        it). `skip` names faces to leave off: back, front, left, right, top,
        bottom."""
        def P(u, v, dd):
            return face_point(face, plane, u, v, dd, cx, cz)

        out = outward(face)
        along = _sub(P(1, 0, 0), P(0, 0, 0))
        if "front" not in skip:
            d.poly([P(u0, v0, d1), P(u1, v0, d1), P(u1, v1, d1), P(u0, v1, d1)], role, out)
        if "back" not in skip:
            d.poly([P(u0, v0, d0), P(u1, v0, d0), P(u1, v1, d0), P(u0, v1, d0)], role, tuple(-c for c in out))
        if "left" not in skip:
            d.poly([P(u0, v0, d0), P(u0, v0, d1), P(u0, v1, d1), P(u0, v1, d0)], role, tuple(-c for c in along))
        if "right" not in skip:
            d.poly([P(u1, v0, d0), P(u1, v0, d1), P(u1, v1, d1), P(u1, v1, d0)], role, along)
        if "top" not in skip:
            d.poly([P(u0, v1, d0), P(u1, v1, d0), P(u1, v1, d1), P(u0, v1, d1)], role, (0, 1, 0))
        if "bottom" not in skip:
            d.poly([P(u0, v0, d0), P(u1, v0, d0), P(u1, v0, d1), P(u0, v0, d1)], role, (0, -1, 0))

    def prism(self, d, x, z, r, y0, y1, n, role, top=True, rot=0.0, bottom=False, rz=None):
        """An upright n-sided prism, radius `r` (x) and `rz` (z, default `r`)."""
        rz = r if rz is None else rz
        ring = [(x + r * math.cos(rot + 2 * math.pi * k / n), z + rz * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            a, b = ring[k], ring[(k + 1) % n]
            mid = ((a[0] + b[0]) / 2 - x, 0, (a[1] + b[1]) / 2 - z)
            d.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], role, mid)
        if top:
            d.poly([(p[0], y1, p[1]) for p in ring], role, (0, 1, 0))
        if bottom:
            d.poly([(p[0], y0, p[1]) for p in ring], role, (0, -1, 0))

    def block(self, d, x, y, z, w, h, dp, role, skip=()):
        """An axis-aligned box `y` its base, sized in unit space."""
        d.box(x, y, z, w, h, dp, role, skip=skip)

    # -- windows --------------------------------------------------------------

    def light(self, d, face, g, u, v, w, h, cx=0.0, cz=0.0, inside=False):
        """The frame round a published window: a sill, a head and two jambs
        just outside its rectangle (`inside` puts them just within it, for a
        window that is its whole opening), and for a tall or wide light a
        transom and mullions across the glass. The middle of the pane, where
        the lit window shows brightest, is left open."""
        wm, hm = w * self.sx, h * self.sy
        if wm < 0.45 or hm < 0.45:
            return
        t = self.ux(self.frame_t)
        ty = self.uy(self.frame_t)
        s = self.sash
        u0, u1, v0, v1 = u - w / 2, u + w / 2, v - h / 2, v + h / 2
        # The frame occupies the band between the rectangle's edge and `t`
        # beyond it, or `t` inside it for a window that is its whole opening.
        if inside:
            ou0, ou1, bv0, bv1 = u0, u1, v0, v1
            iu0, iu1, iv0, iv1 = u0 + t, u1 - t, v0 + ty, v1 - ty
        else:
            ou0, ou1, bv0, bv1 = u0 - t, u1 + t, v0 - ty, v1 + ty
            iu0, iu1, iv0, iv1 = u0, u1, v0, v1
        # The sill stands out further than the rest, its top and underside seen.
        self.fbox(d, face, g, ou0, ou1, bv0, iv0, 0, STAND + 0.008, s, cx, cz, skip=("back",))
        self.fbox(d, face, g, ou0, ou1, iv1, bv1, 0, STAND, s, cx, cz, skip=("back", "top") if inside else ("back",))
        self.fbox(d, face, g, ou0, iu0, iv0, iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom") + (("left",) if inside else ()))
        self.fbox(d, face, g, iu1, ou1, iv0, iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom") + (("right",) if inside else ()))
        # The transom, and mullions in the lights either side of the middle.
        gap = ty * 0.55
        split = None
        if hm >= 0.5:
            tv = iv0 + (iv1 - iv0) * 0.7
            split = (tv - gap, tv + gap)
            self.fbox(d, face, g, iu0, iu1, split[0], split[1], 0, STAND, s, cx, cz, skip=("back", "left", "right"))
        if wm >= 1.5:
            mt = t * 0.55
            span = iu1 - iu0
            for k in (-1, 1):
                mu = u + k * span * 0.29
                if split:
                    self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, iv0, split[0], 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))
                    self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, split[1], iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))
                else:
                    self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, iv0, iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))

    def opening(self, d, face, plane, o, cx=0.0, cz=0.0):
        """Detail for an opening the facade cut that is not itself a tall bay:
        a door gets leaves and hardware, a glazed band a frame and mullions."""
        g = plane - o["depth"]
        w, h = o["w"], o["h"]
        if o["glass"] == "door":
            self.door(d, face, g, o["u"], o["v"] - h / 2, w, h, cx, cz)
            self.surround(d, face, plane, o["u"], o["v"] - h / 2, w, h, cx, cz, o.get("arch", 0.16), o.get("lamps", True), o.get("lintel", True))
        elif not o.get("lit", True) and o.get("frame", True):
            self.band(d, face, g, o["u"], o["v"], w, h, cx, cz, o.get("mull", True))

    def surround(self, d, face, plane, u, v0, w, h, cx=0.0, cz=0.0, arch=0.16, lamps=True, lintel=True):
        """An architrave round an entrance and a wall lamp either side of it."""
        if w * self.sx < 0.55:
            return
        a = self.ux(arch)
        y1 = v0 + h
        # Jambs stop at the head where a canopy stands over the door.
        top = y1 + (self.uy(0.16) if lintel else 0.0)
        self.fbox(d, face, plane, u - w / 2 - a, u - w / 2, v0, top, 0, 0.012, self.trim, cx, cz, skip=("right",))
        self.fbox(d, face, plane, u + w / 2, u + w / 2 + a, v0, top, 0, 0.012, self.trim, cx, cz, skip=("left",))
        if lintel:
            self.fbox(d, face, plane, u - w / 2, u + w / 2, y1, y1 + self.uy(0.16), 0, 0.012, self.trim, cx, cz, skip=("bottom", "left", "right"))
        for k in (-1, 1) if lamps else ():
            lu = u + k * (w / 2 + a + self.ux(0.24))
            lv = v0 + h * 0.62
            self.fbox(d, face, plane, lu - self.ux(0.07), lu + self.ux(0.07), lv, lv + self.uy(0.34), 0, self.ux(0.16), "mech", cx, cz, skip=("back",))
            self.fbox(d, face, plane, lu - self.ux(0.1), lu + self.ux(0.1), lv + self.uy(0.34), lv + self.uy(0.4), 0, self.ux(0.2), "mech", cx, cz, skip=("back",))

    def band(self, d, face, g, u, v, w, h, cx=0.0, cz=0.0, mull=True):
        """A glazed band (a lobby, a podium window): an inner frame, mullions
        about every 1.3 m and a transom across the tall ones."""
        wm, hm = w * self.sx, h * self.sy
        if wm < 0.5 or hm < 0.4:
            return
        t = self.ux(self.frame_t)
        ty = self.uy(self.frame_t)
        s = self.sash
        u0, u1, v0, v1 = u - w / 2, u + w / 2, v - h / 2, v + h / 2
        self.fbox(d, face, g, u0, u1, v0, v0 + ty * 1.4, 0, STAND, s, cx, cz, skip=("back", "bottom"))
        self.fbox(d, face, g, u0, u1, v1 - ty, v1, 0, STAND, s, cx, cz)
        self.fbox(d, face, g, u0, u0 + t, v0 + ty * 1.4, v1 - ty, 0, STAND, s, cx, cz, skip=("back", "left", "top", "bottom"))
        self.fbox(d, face, g, u1 - t, u1, v0 + ty * 1.4, v1 - ty, 0, STAND, s, cx, cz, skip=("back", "right", "top", "bottom"))
        n = max(0, round(wm / 1.3) - 1) if mull else 0
        lo, hi = v0 + ty * 1.4, v1 - ty
        split = None
        if hm >= 1.4:
            tv = lo + (hi - lo) * 0.72
            split = (tv - ty * 0.5, tv + ty * 0.5)
            self.fbox(d, face, g, u0 + t, u1 - t, split[0], split[1], 0, STAND, s, cx, cz, skip=("back", "left", "right"))
        for k in range(1, n + 1):
            mu = u0 + (u1 - u0) * k / (n + 1)
            mt = t * 0.6
            for a, b in ((lo, split[0]), (split[1], hi)) if split else ((lo, hi),):
                self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, a, b, 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))

    def door(self, d, face, g, u, v0, w, h, cx=0.0, cz=0.0):
        """A pair of glazed leaves: frame, meeting stile, kick plates, a
        transom light and a push bar to a leaf."""
        t = self.ux(0.09)
        ty = self.uy(0.09)
        s = self.sash
        u0, u1, v1 = u - w / 2, u + w / 2, v0 + h
        # A hair off the floor, so the plinth under the leaves is not a face
        # lying in the plane of theirs.
        v0 += 0.0006
        if w * self.sx < 0.55:
            return
        self.fbox(d, face, g, u0, u1, v1 - ty * 1.3, v1, 0, STAND, s, cx, cz)
        self.fbox(d, face, g, u0, u0 + t, v0, v1 - ty * 1.3, 0, STAND, s, cx, cz, skip=("back", "left", "top"))
        self.fbox(d, face, g, u1 - t, u1, v0, v1 - ty * 1.3, 0, STAND, s, cx, cz, skip=("back", "right", "top"))
        tr = v0 + (h - ty * 1.3) * 0.8
        self.fbox(d, face, g, u0 + t, u1 - t, tr - ty * 0.4, tr + ty * 0.4, 0, STAND, s, cx, cz, skip=("left", "right"))
        # Meeting stile between the leaves and a kick plate on each.
        mt = t * 0.5
        self.fbox(d, face, g, u - mt, u + mt, v0, tr - ty * 0.4, 0, STAND, s, cx, cz, skip=("back", "top"))
        for a, b in ((u0 + t, u - mt), (u + mt, u1 - t)):
            self.fbox(d, face, g, a, b, v0, v0 + self.uy(0.32), 0, STAND, s, cx, cz, skip=("left", "right"))
        # Push bars, off the meeting stile, standing well proud.
        bar = self.ux(0.05)
        for k in (-1, 1):
            bu = u + k * self.ux(0.24)
            self.fbox(d, face, g, bu - bar / 2, bu + bar / 2, v0 + self.uy(0.55), v0 + self.uy(1.05), STAND, STAND + 0.012, "metal" if self.sash == "frame" else self.sash, cx, cz, skip=("back", "top"))

    # -- bays -----------------------------------------------------------------

    def bay(self, d, face, plane, u, w, v0, v1, lights, depth, spandrel, cx=0.0, cz=0.0):
        """A tall recessed bay: a sill under it, and a lintel with a keystone
        over it, standing on the wall round the recess."""
        ext = self.ux(0.06)
        lin = self.uy(0.2)
        self.fbox(d, face, plane, u - w / 2 - ext, u + w / 2 + ext, v1, v1 + lin, 0, 0.012, self.trim, cx, cz)
        key = self.ux(0.16)
        self.fbox(d, face, plane, u - key, u + key, v1 + lin, v1 + lin + self.uy(0.15), 0, 0.016, self.trim, cx, cz, skip=("back", "bottom"))
        self.bays.setdefault((face, cx, cz), []).append((u, w / 2 + ext, v1 + lin + self.uy(0.15)))
        self.fbox(d, face, plane, u - w / 2 - ext, u + w / 2 + ext, v0 - self.uy(0.16), v0, 0, 0.02, self.trim, cx, cz)

    # -- cornices -------------------------------------------------------------

    def crown(self, d, y, hx, hz, cornice_h, proj, parapet_h, parapet_t, cx=0.0, cz=0.0):
        """Dentils under a cornice, and a coping cap that overhangs the
        parapet on the roof side."""
        blk = self.ux(0.24)
        hh = self.uy(0.26)
        for face in FACES if self.dentils and cornice_h * self.sy >= 0.25 else ():
            half = hx if face in ("+z", "-z") else hz
            plane = hz if face in ("+z", "-z") else hx
            n = max(3, int(2 * half * self.sx / 0.55))
            step = 2 * half / n
            for k in range(n):
                u = -half + step * (k + 0.5)
                if any(abs(u - pu) < pw + blk / 2 for pu, pw in self.piers.get((face, cx, cz), ())):
                    continue
                # Not over a bay whose keystone reaches up into them.
                if any(abs(u - bu) < bw + blk / 2 and top > y - hh - 0.0005 for bu, bw, top in self.bays.get((face, cx, cz), ())):
                    continue
                self.fbox(d, face, plane, u - blk / 2, u + blk / 2, y - hh, y, 0, proj * 0.8, self.trim, cx, cz, skip=("back", "top"))
            if cornice_h * self.sy >= 0.35:
                bead = self.uy(0.1)
                self.fbox(d, face, plane, -half, half, y - hh - bead, y - hh, 0, proj * 0.35, self.trim, cx, cz, skip=("back",))
        if parapet_h > 0:
            ox, oz = hx + proj, hz + proj
            ix, iz = ox - parapet_t, oz - parapet_t
            over = self.ux(0.07)
            top = y + cornice_h + parapet_h
            cap = self.uy(0.09)
            d.ring(top, cap, (ox, oz), (ix - over, iz - over), self.trim, cx=cx, cz=cz, bottom=True)

    def quoins(self, d, hx, hz, y0, y1, cx=0.0, cz=0.0, course=0.52, long=0.3, short=0.18, proud=0.009, role=None):
        """Dressed corner stones, alternately long on one face and the other,
        each corner course one L of two boxes that share no face."""
        role = role or self.trim
        h = self.uy(course)
        n = int((y1 - y0) / h)
        step = (y1 - y0) / n
        for sx in (1, -1):
            for sz in (1, -1):
                for k in range(n):
                    a, b = (long, short) if k % 2 == 0 else (short, long)
                    ya = y0 + step * k
                    hgt = step * 0.88
                    wx, wz = self.ux(a), self.ux(b)
                    # Along the z wall (from the corner inwards in x), corner cube included.
                    x0_, x1_ = sorted((cx + sx * (hx - wx), cx + sx * (hx + proud)))
                    z0_, z1_ = sorted((cz + sz * hz, cz + sz * (hz + proud)))
                    d.box((x0_ + x1_) / 2, ya, (z0_ + z1_) / 2, x1_ - x0_, hgt, z1_ - z0_, role,
                          skip=("-z" if sz > 0 else "+z",), bottom=True)
                    # Along the x wall, without the corner cube.
                    x0_, x1_ = sorted((cx + sx * hx, cx + sx * (hx + proud)))
                    z0_, z1_ = sorted((cz + sz * (hz - wz), cz + sz * hz))
                    d.box((x0_ + x1_) / 2, ya, (z0_ + z1_) / 2, x1_ - x0_, hgt, z1_ - z0_, role,
                          skip=("-x" if sx > 0 else "+x", "+z" if sz > 0 else "-z"), bottom=True)

    def fins(self, d, face, plane, us, y0, y1, t, proud, cx=0.0, cz=0.0):
        """A base block on each pier of a facade (the cornice's dentils are
        its capital)."""
        w = t + self.ux(0.16)
        hgt = self.uy(0.34)
        for u in us:
            self.fbox(d, face, plane, u - w / 2, u + w / 2, y0, y0 + hgt, 0, proud + 0.008, self.trim, cx, cz, skip=("back", "bottom"))
            self.piers.setdefault((face, cx, cz), []).append((u, t / 2 + self.ux(0.05)))

    # -- curtain walls --------------------------------------------------------

    def curtain(self, d, y0, y1, hx, hz, bands, mullions, spandrel, cx=0.0, cz=0.0, proud=0.014, mproud=0.022, mt=0.022, sleeve="frame"):
        """A transom capping every storey's glass, a pressure cap where each
        mullion crosses it, a glazing bar across each cell of a tall storey,
        and a chamfered post at each corner with a collar every third storey."""
        band = (y1 - y0) / bands
        ty = self.uy(0.09)
        cap_w, cap_h = mt + 0.008, self.uy(0.15)
        glass_h = band * (1 - spandrel)
        bars = glass_h * self.sy >= 0.8
        for i in range(bands):
            top = y0 + band * (i + 1)
            mid = y0 + band * i + band * spandrel + glass_h * 0.56
            for face in FACES:
                half = hx if face in ("+z", "-z") else hz
                plane = hz if face in ("+z", "-z") else hx
                self.fbox(d, face, plane, -half, half, top - ty * 1.2, top - 0.001, 0, STAND, sleeve, cx, cz, skip=("back", "left", "right"))
                posts = [-half + 2 * half * k / (mullions + 1) for k in range(1, mullions + 1)]
                for u in posts:
                    self.fbox(d, face, plane, u - cap_w / 2, u + cap_w / 2, top - cap_h * 1.4, top - cap_h * 0.4, mproud * 0.4, mproud + 0.008, sleeve, cx, cz, skip=("back", "bottom"))
                if bars:
                    # Between the mullions' faces, so the bar butts into each.
                    edges = [-half] + [e for u in posts for e in (u - mt / 2, u + mt / 2)] + [half]
                    for a, b in zip(edges[0::2], edges[1::2]):
                        self.fbox(d, face, plane, a, b, mid - ty * 0.3, mid + ty * 0.3, 0, 0.012, sleeve, cx, cz, skip=("back", "left", "right"))
        # A chamfered post at each corner of every storey's glass, standing
        # clear of the sleeves that wrap the corner and stopping short of the
        # next one, so no sleeve face is buried in it.
        a = proud + 0.012
        c = 0.011
        for i in range(bands):
            lo = y0 + band * i + band * spandrel
            hi = y0 + band * (i + 1)
            for sx_ in (1, -1):
                for sz_ in (1, -1):
                    self.chamfered(d, cx + sx_ * hx, cz + sz_ * hz, a, c, lo, hi, sleeve, bottom=True, top=i < bands - 1)

    def chamfered(self, d, x, z, a, c, y0, y1, role, bottom=False, top=True):
        """A square post of half-width `a` with each corner cut by `c`."""
        ring = [(a, a - c), (a - c, a), (-(a - c), a), (-a, a - c), (-a, -(a - c)), (-(a - c), -a), (a - c, -a), (a, -(a - c))]
        ring = [(x + px, z + pz) for px, pz in ring]
        n = len(ring)
        for k in range(n):
            p, q = ring[k], ring[(k + 1) % n]
            mid = ((p[0] + q[0]) / 2 - x, 0, (p[1] + q[1]) / 2 - z)
            d.poly([(p[0], y0, p[1]), (q[0], y0, q[1]), (q[0], y1, q[1]), (p[0], y1, p[1])], role, mid)
        if top:
            d.poly([(p[0], y1, p[1]) for p in ring], role, (0, 1, 0))
        if bottom:
            d.poly([(p[0], y0, p[1]) for p in ring], role, (0, -1, 0))

    # -- entrances ------------------------------------------------------------

    def canopy(self, d, face, plane, u, y, w, proj, cx=0.0, cz=0.0, slab=True, brackets=True):
        """An entrance canopy at height `y` (its underside): a thin slab with
        a deep fascia, and a bracket under each end that ties it to the wall
        (a post would stand off the plinth, past the footprint)."""
        t = self.uy(0.26)
        if slab:
            self.fbox(d, face, plane, u - w / 2, u + w / 2, y, y + t, 0, proj, self.trim, cx, cz, skip=("back",))
        if brackets:
            bw = self.ux(0.12)
            reach = min(proj * 0.8, self.ux(0.6))
            drop = self.uy(0.5)
            for k in (-1, 1):
                bu = u + k * (w / 2 - self.ux(0.22))
                P = lambda uu, v, dd: face_point(face, plane, uu, v, dd, cx, cz)  # noqa: E731
                out = outward(face)
                along = _sub(P(1, 0, 0), P(0, 0, 0))
                a0, a1 = bu - bw / 2, bu + bw / 2
                # A triangle in (out, up): under the canopy, down the wall.
                for uu, sgn in ((a0, -1), (a1, 1)):
                    d.poly([P(uu, y, 0), P(uu, y, reach), P(uu, y - drop, 0)], self.sash, tuple(sgn * c for c in along))
                d.poly([P(a0, y, reach), P(a1, y, reach), P(a1, y - drop, 0), P(a0, y - drop, 0)], self.sash,
                       (out[0] * drop, -reach, out[2] * drop))

    def lobby(self, d, y0, y1, hw, depth, cx=0.0, cz=0.0):
        """A canopy over the tower lobby's door, standing on two posts."""
        head = y0 + (y1 - y0) * 0.86
        self.canopy(d, "+z", hw, 0.0, head + self.uy(0.17), 0.34, 0.032, cx, cz)

    # -- roofs ----------------------------------------------------------------

    def louvred_box(self, d, x, z, y, w, dp, h, role="mech", lid=True):
        """Plant on a roof: a housing, louvre slats on every face and a
        recessed hatch door on the front."""
        d.box(x, y, z, w, h, dp, role)
        slat = self.uy(0.05)
        for face in FACES:
            plane = dp / 2 if face in ("+z", "-z") else w / 2
            span = w if face in ("+z", "-z") else dp
            n = int((h * self.sy - 0.3) / 0.16)
            for k in range(n):
                v = y + self.uy(0.2) + (h - self.uy(0.4)) * (k + 0.5) / n
                self.fbox(d, face, plane, -span * 0.4, span * 0.4, v, v + slat, 0, self.ux(0.06), role, x, z, skip=("back", "left", "right"))
        return y + h

    def stack(self, d, x, z, y, r, h, role="mech", rings=1):
        """A flue or vent stack with a cap."""
        self.prism(d, x, z, r, y, y + h, 10, role, top=False)
        cap = r * 1.8
        self.prism(d, x, z, cap, y + h, y + h + self.uy(0.14), 10, role, bottom=True)
        for k in range(rings):
            yy = y + h * (0.3 + 0.35 * k)
            self.prism(d, x, z, r * 1.6, yy, yy + self.uy(0.1), 10, role, bottom=True)

    def fan(self, d, x, z, y, r, role="mech"):
        """A rooftop fan: a shroud under a lid with two grille spokes."""
        self.prism(d, x, z, r, y, y + self.uy(0.6), 12, role, top=True, bottom=True)
        for k, (sx_, sz_) in enumerate(((r * 1.5, self.ux(0.06)), (self.ux(0.06), r * 1.5))):
            d.box(x, y + self.uy(0.6 + 0.05 * k), z, sx_, self.uy(0.05), sz_, role, bottom=True)
        return y + self.uy(0.7)

    def railing(self, d, x0, x1, z0, z1, y, h, role="mech", spacing=0.8, post=0.08):
        """A guard rail round a rectangle: posts, and two rails between them
        set well inside the posts' faces."""
        ps = self.ux(post)
        rs = ps * 0.3
        rail_h = self.uy(0.05)
        sp = self.ux(spacing)
        posts = []
        for (ax, az), (bx, bz) in (((x0, z1), (x1, z1)), ((x1, z1), (x1, z0)), ((x1, z0), (x0, z0)), ((x0, z0), (x0, z1))):
            length = math.hypot(bx - ax, bz - az)
            n = max(1, round(length / sp))
            for k in range(n):
                posts.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n))
            # Between the corner posts' faces, so the rails meet no other rail.
            for frac in (0.5, 0.88):
                yy = y + h * frac
                if abs(bz - az) < 1e-9:
                    d.box((ax + bx) / 2, yy, az, abs(bx - ax) - ps, rail_h, rs, role, bottom=True)
                else:
                    d.box(ax, yy, (az + bz) / 2, rs, rail_h, abs(bz - az) - ps, role, bottom=True)
        for px, pz in posts:
            d.box(px, y, pz, ps, h, ps, role)

    def mast(self, d, x, z, y0, y1, r, role="mech"):
        """Detail for an antenna mast the lean model already stands: collars,
        a pair of cross arms and a beacon housing over its tip. The lean mast
        is a hexagonal prism of radius `r`."""
        h = y1 - y0
        for f in (0.06, 0.3, 0.85):
            self.prism(d, x, z, r * 2.2, y0 + h * f, y0 + h * f + self.uy(0.14), 6, role, bottom=True)
        arm, thick, wide = self.ux(0.9), self.uy(0.06), self.ux(0.3)
        ya = y0 + h * 0.55
        d.box(x, ya, z, arm, thick, wide, role, bottom=True)
        d.box(x, ya + self.uy(0.4), z, wide, thick, arm * 0.7, role, bottom=True)
        self.prism(d, x, z, r * 2.0, y1, y1 + self.uy(0.32), 6, role, bottom=True)


def _tagged(fn):
    def wrapper(self, d, *args, **kwargs):
        before = d.tag
        d.tag = fn.__name__ if before == "lean" else before
        try:
            return fn(self, d, *args, **kwargs)
        finally:
            d.tag = before

    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    return wrapper


# Every method that draws says so on the faces it makes.
for _name, _fn in list(vars(Near).items()):
    if callable(_fn) and not _name.startswith("_") and _name not in ("ux", "uy"):
        setattr(Near, _name, _tagged(_fn))
