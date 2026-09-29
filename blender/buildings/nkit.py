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
from bkit import FACES, _cross, face_point, outward  # noqa: E402

#: How far a frame stands off the glass, unit-space: past the lit pane (0.006 off
#: the glass) and clear of the lean spandrel panels (0.012).
STAND = 0.016


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


class Near:
    def __init__(self, scale, sash="mech", trim="trim", post="trim", frame_t=0.07, dentils=True, balustrade=0.45):
        self.sx, self.sy, self.sz = scale
        #: Roles the city has no multiplier for, drawn as another: the stone
        #: archetypes know no metal, frame or window here (`models.ts`), the
        #: glass towers no window (`metropolis.ts`).
        #: `skip_bead(face, cx, cz, u0, u1, v0, v1)` -> True where a curtain wall's
        #: cell is buried in something else (a skybridge).
        self.skip_bead = None
        #: (face, u) of bays whose sill has a canopy under it: no corbels there.
        self.no_corbel = set()
        self.remap = {"metal": "mech", "frame": "trim"} if sash == "mech" else {"window": "lobby"}
        #: Height (m) of the balustrade on parapets, 0 for none.
        self.balustrade = balustrade
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
        # A jamb's inner face lies flush against the bead's back where there is one.
        bead = wm >= 0.7 and hm >= 0.9
        self.fbox(d, face, g, ou0, iu0, iv0, iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom") + (("left",) if inside else ()) + (("right",) if bead else ()))
        self.fbox(d, face, g, iu1, ou1, iv0, iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom") + (("right",) if inside else ()) + (("left",) if bead else ()))
        # A drip cap over the head, standing further out than the frame.
        if not inside and wm >= 1.6:
            cap = self.ux(0.04)
            self.fbox(d, face, g, ou0 - cap, ou1 + cap, bv1, bv1 + self.uy(0.06), 0, STAND + 0.007, s, cx, cz, skip=("back",))
        # The sash's glazing bead, just inside the rectangle: four thin
        # strips that read as the gasket round the pane. The middle stays open.
        bd, bdy = self.ux(0.04), self.uy(0.04)
        if bead:
            self.fbox(d, face, g, iu0, iu1, iv0, iv0 + bdy, 0, STAND + 0.006, s, cx, cz, skip=("back", "left", "right"))
            self.fbox(d, face, g, iu0, iu1, iv1 - bdy, iv1, 0, STAND + 0.006, s, cx, cz, skip=("back", "left", "right"))
            self.fbox(d, face, g, iu0, iu0 + bd, iv0 + bdy, iv1 - bdy, 0, STAND + 0.006, s, cx, cz, skip=("back", "left", "top", "bottom"))
            self.fbox(d, face, g, iu1 - bd, iu1, iv0 + bdy, iv1 - bdy, 0, STAND + 0.006, s, cx, cz, skip=("back", "right", "top", "bottom"))
        # The transom, and mullions in the lights either side of the middle.
        gap = ty * 0.55
        split = None
        if hm >= 0.5:
            tv = iv0 + (iv1 - iv0) * 0.7
            split = (tv - gap, tv + gap)
            self.fbox(d, face, g, iu0, iu1, split[0], split[1], 0, STAND, s, cx, cz, skip=("back", "left", "right"))
        if wm >= 1.5 or (wm >= 0.9 and hm >= 1.6):
            mt = t * (0.55 if wm >= 1.5 else 0.4)
            span = iu1 - iu0
            pos = 0.29 if wm >= 1.5 else 0.27
            for k in (-1, 1):
                mu = u + k * span * pos
                if split:
                    self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, iv0, split[0], 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))
                    self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, split[1], iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))
                else:
                    self.fbox(d, face, g, mu - mt / 2, mu + mt / 2, iv0, iv1, 0, STAND, s, cx, cz, skip=("back", "top", "bottom"))
            # A glazing bar across the lower sash's outer lights (a pane
            # a third of the way up), and one across the tall upper light.
            if split and hm >= 1.8:
                bt = ty * 0.4
                for lo, hi in ((iu0 + bd, u - span * pos - mt / 2), (u + span * pos + mt / 2, iu1 - bd)):
                    bv = iv0 + (split[0] - iv0) * 0.36
                    self.fbox(d, face, g, lo, hi, bv - bt / 2, bv + bt / 2, 0, STAND - 0.004, s, cx, cz, skip=("back", "left", "right"))
                    if (iv1 - split[1]) * self.sy >= 0.9:
                        bv = split[1] + (iv1 - split[1]) * 0.5
                        self.fbox(d, face, g, lo, hi, bv - bt / 2, bv + bt / 2, 0, STAND - 0.004, s, cx, cz, skip=("back", "left", "right"))

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
        # An outer architrave a step further out.
        if arch >= 0.15:
            a2 = self.ux(arch * 0.55 + 0.05)
            self.fbox(d, face, plane, u - w / 2 - a - a2, u - w / 2 - a, v0, y1, 0, 0.007, self.trim, cx, cz, skip=("right", "back", "top"))
            self.fbox(d, face, plane, u + w / 2 + a, u + w / 2 + a + a2, v0, y1, 0, 0.007, self.trim, cx, cz, skip=("left", "back", "top"))
        if lintel:
            self.fbox(d, face, plane, u - w / 2, u + w / 2, y1, y1 + self.uy(0.16), 0, 0.012, self.trim, cx, cz, skip=("bottom", "left", "right"))
            # A raised centre block on it.
            self.fbox(d, face, plane, u - self.ux(0.22), u + self.ux(0.22), y1, y1 + self.uy(0.16), 0.012, 0.017, self.trim, cx, cz, skip=("back",))
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
        # A lock rail across each leaf, and a threshold under the pair.
        for a, b in ((u0 + t, u - mt), (u + mt, u1 - t)) if h * self.sy >= 1.8 else ():
            lr = v0 + h * 0.5
            self.fbox(d, face, g, a, b, lr - ty * 0.6, lr + ty * 0.6, 0, STAND, s, cx, cz, skip=("back", "left", "right"))
        self.fbox(d, face, g, u0, u1, v0, v0 + self.uy(0.04), 0, STAND + 0.005, "metal", cx, cz, skip=("back", "bottom"))
        # Push bars, off the meeting stile, standing well proud.
        bar = self.ux(0.05)
        for k in (-1, 1):
            bu = u + k * self.ux(0.24)
            self.fbox(d, face, g, bu - bar / 2, bu + bar / 2, v0 + self.uy(0.55), v0 + self.uy(1.05), STAND, STAND + 0.012, "metal" if self.sash == "frame" else self.sash, cx, cz, skip=("back", "top"))

    # -- bays -----------------------------------------------------------------

    def bay(self, d, face, plane, u, w, v0, v1, lights, depth, spandrel, cx=0.0, cz=0.0):
        """A tall recessed bay: a sill on corbels under it, a stepped lintel
        with a keystone over it, and a framed panel on each spandrel between
        its lights."""
        ext = self.ux(0.06)
        lin = self.uy(0.2)
        self.fbox(d, face, plane, u - w / 2 - ext, u + w / 2 + ext, v1, v1 + lin, 0, 0.012, self.trim, cx, cz)
        # A cap over the lintel, wider and a step further out.
        capx = self.ux(0.07)
        cap = self.uy(0.07)
        self.fbox(d, face, plane, u - w / 2 - ext - capx, u + w / 2 + ext + capx, v1 + lin, v1 + lin + cap, 0, 0.015, self.trim, cx, cz, skip=("back",))
        key = self.ux(0.16)
        self.fbox(d, face, plane, u - key, u + key, v1 + lin, v1 + lin + self.uy(0.15), 0, 0.02, self.trim, cx, cz, skip=("back", "bottom"))
        self.bays.setdefault((face, cx, cz), []).append((u, w / 2 + ext + capx, v1 + lin + self.uy(0.15)))
        sill = self.uy(0.16)
        self.fbox(d, face, plane, u - w / 2 - ext, u + w / 2 + ext, v0 - sill, v0, 0, 0.02, self.trim, cx, cz)
        # Two corbels under the sill (not where a canopy runs under it).
        for k in (-1, 1) if (face, round(u, 4)) not in self.no_corbel else ():
            cu = u + k * (w / 2 - self.ux(0.16))
            self.fbox(d, face, plane, cu - self.ux(0.07), cu + self.ux(0.07), v0 - sill - self.uy(0.22), v0 - sill, 0, 0.016, self.trim, cx, cz, skip=("back", "top"))
            self.fbox(d, face, plane, cu - self.ux(0.05), cu + self.ux(0.05), v0 - sill - self.uy(0.32), v0 - sill - self.uy(0.22), 0, 0.011, self.trim, cx, cz, skip=("back", "top"))
        # Spandrel panels: a raised frame round a raised field.
        if lights > 1:
            step = (v1 - v0) / lights
            g0 = -depth + 0.012
            # The window frames reach into the spandrel by what they are wide
            # less the margin the glass leaves: keep the panel clear of them.
            margin = (step - spandrel) * 0.05 * self.sy
            inset = self.uy(max(0.03, self.frame_t + 0.02 - margin))
            for k in range(1, lights):
                v = v0 + step * k
                self.panel(d, face, plane, u - w / 2 + self.ux(0.06), u + w / 2 - self.ux(0.06),
                           v - spandrel / 2 + inset, v + spandrel / 2 - inset, g0, cx, cz)

    def panel(self, d, face, plane, a, b, lo, hi, g0, cx=0.0, cz=0.0, ring=0.05, lift=0.006):
        """A framed panel on a wall `g0` off `plane`: a raised frame `ring`
        metres wide round a recessed field (the wall itself), u `a`..`b`,
        v `lo`..`hi`."""
        ringx, ringy = self.ux(ring), self.uy(ring * 0.7)
        if hi - lo < 2 * ringy + self.uy(0.08) or b - a < 2 * ringx + self.ux(0.1):
            return
        top = g0 + lift
        self.fbox(d, face, plane, a, b, hi - ringy, hi, g0, top, self.trim, cx, cz, skip=("back", "left", "right", "bottom"))
        self.fbox(d, face, plane, a, b, lo, lo + ringy, g0, top, self.trim, cx, cz, skip=("back", "left", "right", "top"))
        self.fbox(d, face, plane, a, a + ringx, lo + ringy, hi - ringy, g0, top, self.trim, cx, cz, skip=("back", "top", "bottom", "left"))
        self.fbox(d, face, plane, b - ringx, b, lo + ringy, hi - ringy, g0, top, self.trim, cx, cz, skip=("back", "top", "bottom", "right"))

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
                # Under the bead, a fillet and a row of ovolo beads: the
                # cornice steps out in four courses, not one.
                fil = self.uy(0.07)
                self.fbox(d, face, plane, -half, half, y - hh - bead - fil, y - hh - bead, 0, proj * 0.2, self.trim, cx, cz, skip=("back", "top"))
                eggs = max(4, int(2 * half * self.sx / 0.26))
                for k in range(eggs):
                    eu = -half + 2 * half * (k + 0.5) / eggs
                    if any(abs(eu - pu) < pw for pu, pw in self.piers.get((face, cx, cz), ())):
                        continue
                    self.fbox(d, face, plane, eu - self.ux(0.035), eu + self.ux(0.035), y - hh - bead + self.uy(0.02), y - hh - self.uy(0.02), proj * 0.35, proj * 0.35 + self.ux(0.05), self.trim, cx, cz, skip=("back", "bottom"))
            if cornice_h * self.sy >= 0.3:
                # A drip moulding along the top of the cornice, just proud.
                lip = self.uy(0.07)
                self.fbox(d, face, plane, -half - proj, half + proj, y + cornice_h - lip, y + cornice_h, proj, proj + self.ux(0.05), self.trim, cx, cz, skip=("back", "left", "right"))
        if parapet_h > 0:
            ox, oz = hx + proj, hz + proj
            ix, iz = ox - parapet_t, oz - parapet_t
            over = self.ux(0.07)
            top = y + cornice_h + parapet_h
            cap = self.uy(0.09)
            d.ring(top, cap, (ox, oz), (ix - over, iz - over), self.trim, cx=cx, cz=cz, bottom=True)
            if self.balustrade:
                self.balustrade_ring(d, ox, oz, min(parapet_t + over, self.ux(0.4)), top + cap, cx, cz, self.balustrade)

    def quoins(self, d, hx, hz, y0, y1, cx=0.0, cz=0.0, course=0.7, long=0.34, short=0.18, proud=0.009, role=None):
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
        """A base block, reeding up the shaft and a stepped capital on each
        pier of a facade (the cornice's dentils sit over the capital)."""
        w = t + self.ux(0.16)
        hgt = self.uy(0.34)
        cap1, cap2 = self.uy(0.32), self.uy(0.14)
        reed = self.ux(0.035)
        n = 3 if t * self.sx >= 0.25 else 2
        for u in us:
            self.fbox(d, face, plane, u - w / 2, u + w / 2, y0, y0 + hgt, 0, proud + 0.008, self.trim, cx, cz, skip=("back", "bottom"))
            self.piers.setdefault((face, cx, cz), []).append((u, t / 2 + self.ux(0.05)))
            if y1 - y0 < 1.0 / self.sy * 4:
                continue
            # Reeding: raised strips up the front of the shaft.
            half = t / 2 - self.ux(0.03) - reed / 2
            for k in range(n):
                ru = u + (k - (n - 1) / 2) * 2 * half / max(1, n - 1)
                self.fbox(d, face, plane, ru - reed / 2, ru + reed / 2, y0 + hgt + self.uy(0.15), y1 - cap1 - cap2 - self.uy(0.1), 0, proud + 0.01, self.trim, cx, cz, skip=("back", "top", "bottom"))
            # The capital: two steps, each a little wider and further out.
            self.fbox(d, face, plane, u - t / 2 - self.ux(0.06), u + t / 2 + self.ux(0.06), y1 - cap1 - cap2, y1 - cap2, 0, proud + 0.005, self.trim, cx, cz, skip=("back",))
            self.fbox(d, face, plane, u - t / 2 - self.ux(0.11), u + t / 2 + self.ux(0.11), y1 - cap2, y1, 0, proud + 0.009, self.trim, cx, cz, skip=("back", "top"))

    # -- curtain walls --------------------------------------------------------

    def curtain(self, d, y0, y1, hx, hz, bands, mullions, spandrel, cx=0.0, cz=0.0, proud=0.014, mproud=0.022, mt=0.022, sleeve="frame"):
        """A transom capping every storey's glass, a pressure cap where each
        mullion crosses it, a glazing bar across each cell of a tall storey,
        and a chamfered post at each corner with a collar every third storey.

        The glazing hardware is metal, and slim: on a stone spandrel (`sleeve`
        "wall") it takes the sash's role, not the wall's, so the cells read as
        panes of glass in a frame and not as holes punched in stone. The
        spandrels and the proud mullions are the lean model's own (`bkit.curtain`)
        and keep its role."""
        hardware = self.sash if sleeve == "wall" else sleeve
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
                self.fbox(d, face, plane, -half, half, top - ty * 0.6, top - 0.001, 0, STAND, hardware, cx, cz, skip=("back", "left", "right"))
                posts = [-half + 2 * half * k / (mullions + 1) for k in range(1, mullions + 1)]
                for u in posts:
                    self.fbox(d, face, plane, u - cap_w / 2, u + cap_w / 2, top - cap_h * 1.4, top - cap_h * 0.4, mproud * 0.4, mproud + 0.008, hardware, cx, cz, skip=("back", "bottom"))
                if bars:
                    # Between the mullions' faces, so the bar butts into each.
                    edges = [-half] + [e for u in posts for e in (u - mt / 2, u + mt / 2)] + [half]
                    for a, b in zip(edges[0::2], edges[1::2]):
                        self.fbox(d, face, plane, a, b, mid - ty * 0.3, mid + ty * 0.3, 0, 0.012, hardware, cx, cz, skip=("back", "left", "right"))
        # A glazing bead round every cell's glass, clear of the lit window
        # in it (a tenth of the cell in from each mullion).
        bd, bdy = self.ux(0.03), self.uy(0.025)
        gasket = hardware
        for i in range(bands):
            lo = y0 + band * i + band * spandrel + self.uy(0.02)
            hi = y0 + band * (i + 1) - ty * 0.6 - self.uy(0.02)
            if (hi - lo) * self.sy < 0.4:
                continue
            for face in FACES:
                half = hx if face in ("+z", "-z") else hz
                plane = hz if face in ("+z", "-z") else hx
                posts = [-half + 2 * half * k / (mullions + 1) for k in range(1, mullions + 1)]
                edges = [-half] + [e for u in posts for e in (u - mt / 2, u + mt / 2)] + [half]
                for a, b in zip(edges[0::2], edges[1::2]):
                    # The corner posts stand over the first and last cell's ends.
                    a += self.ux(0.03) + (proud + 0.006 if a == -half else 0.0)
                    b -= self.ux(0.03) + (proud + 0.006 if b == half else 0.0)
                    if (b - a) * self.sx < 0.5 or (self.skip_bead and self.skip_bead(face, cx, cz, a, b, lo, hi)):
                        continue
                    dp = 0.0155
                    self.fbox(d, face, plane, a, b, lo, lo + bdy, 0, dp, gasket, cx, cz, skip=("back", "left", "right", "bottom"))
                    self.fbox(d, face, plane, a, b, hi - bdy, hi, 0, dp, gasket, cx, cz, skip=("back", "left", "right", "top"))
                    self.fbox(d, face, plane, a, a + bd, lo + bdy, hi - bdy, 0, dp, gasket, cx, cz, skip=("back", "left", "top", "bottom"))
                    self.fbox(d, face, plane, b - bd, b, lo + bdy, hi - bdy, 0, dp, gasket, cx, cz, skip=("back", "right", "top", "bottom"))
        # A chamfered post at each corner of every storey's glass, standing
        # clear of the sleeves that wrap the corner and stopping short of the
        # next one, so no sleeve face is buried in it.
        a = proud + 0.006
        c = 0.006
        for i in range(bands):
            lo = y0 + band * i + band * spandrel
            hi = y0 + band * (i + 1)
            for sx_ in (1, -1):
                for sz_ in (1, -1):
                    self.chamfered(d, cx + sx_ * hx, cz + sz_ * hz, a, c, lo, hi, hardware, bottom=True, top=i < bands - 1)

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

    def canopy(self, d, face, plane, u, y, w, proj, cx=0.0, cz=0.0, slab=True, brackets=True, lights=True):
        """An entrance canopy at height `y` (its underside): a thin slab with
        a deep fascia, and a bracket under each end that ties it to the wall
        (a post would stand off the plinth, past the footprint)."""
        t = self.uy(0.26)
        if slab:
            self.fbox(d, face, plane, u - w / 2, u + w / 2, y, y + t, 0, proj, self.trim, cx, cz, skip=("back",))
        # Downlights in the soffit, clear of the brackets under it.
        n = max(2, int(w * self.sx / 0.9)) if lights else 0
        keep = self.ux(0.28)
        for k in range(n):
            lu = u - w / 2 + w * (k + 0.5) / n
            if brackets and any(abs(lu - (u + sgn * (w / 2 - self.ux(0.22)))) < keep for sgn in (-1, 1)):
                continue
            lx, ly, lz = face_point(face, plane, lu, y, proj * 0.5, cx, cz)
            self.prism(d, lx, lz, self.ux(0.08), y - self.uy(0.06), y, 8, "frame", top=False, bottom=True)
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
        """The tower lobby's door is dressed by `opening`; its cornice is
        too close over the glass for a canopy."""

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

    def rod(self, d, a, b, r, role="mech", n=6, caps=True):
        """A round bar from `a` to `b` (unit-space points), radius `r` metres,
        its section round in the world, however the model is stretched."""
        S = (self.sx, self.sy, self.sz)
        A = tuple(a[i] * S[i] for i in range(3))
        Bp = tuple(b[i] * S[i] for i in range(3))
        v = _sub(Bp, A)
        L = math.sqrt(sum(c * c for c in v))
        if L < 1e-6:
            return
        t = tuple(c / L for c in v)
        up = (0, 1, 0) if abs(t[1]) < 0.9 else (1, 0, 0)
        e1 = _cross(t, up)
        m = math.sqrt(sum(c * c for c in e1))
        e1 = tuple(c / m for c in e1)
        e2 = _cross(t, e1)
        ring = []
        for k in range(n):
            ang = 2 * math.pi * k / n + math.pi / n
            ring.append(tuple(r * (math.cos(ang) * e1[i] + math.sin(ang) * e2[i]) for i in range(3)))

        def U(P):
            return tuple(P[i] / S[i] for i in range(3))

        def add(P, o):
            return tuple(P[i] + o[i] for i in range(3))

        for k in range(n):
            o0, o1 = ring[k], ring[(k + 1) % n]
            mid = tuple((o0[i] + o1[i]) / 2 / S[i] for i in range(3))
            d.poly([U(add(A, o0)), U(add(A, o1)), U(add(Bp, o1)), U(add(Bp, o0))], role, mid)
        if caps:
            d.poly([U(add(Bp, o)) for o in ring], role, tuple(t[i] / S[i] for i in range(3)))
            d.poly([U(add(A, o)) for o in ring], role, tuple(-t[i] / S[i] for i in range(3)))

    def balustrade_ring(self, d, ox, oz, width, y, cx, cz, height, role=None):
        """A balustrade round a roof edge: a top rail and a bottom rail on a
        ring, square balusters between, a newel at each corner and every few
        metres. `width` is the coping it stands on (unit space)."""
        role = role or self.trim
        h = self.uy(height)
        rw = min(self.ux(0.16), width * 0.55)
        if rw < self.ux(0.06):
            return
        edge = (width - rw) / 2
        rx0, rz0 = ox - edge, oz - edge
        rx1, rz1 = rx0 - rw, rz0 - rw
        top_r, bot_r = self.uy(0.08), self.uy(0.07)
        d.ring(y + h - top_r, top_r, (rx0, rz0), (rx1, rz1), role, cx=cx, cz=cz, bottom=True)
        d.ring(y, bot_r, (rx0, rz0), (rx1, rz1), role, cx=cx, cz=cz, bottom=False)
        mx, mz = (rx0 + rx1) / 2, (rz0 + rz1) / 2
        bw = min(rw * 0.55, self.ux(0.06))
        pitch = self.ux(0.3)
        nw = rw * 1.5
        for side in ("+z", "-z", "+x", "-x"):
            along = mx if side in ("+z", "-z") else mz
            fixed = mz if side in ("+z", "-z") else mx
            sgn = 1 if side[0] == "+" else -1
            span = 2 * along
            n = max(2, round(span / pitch))
            newel_at = {round(n / 2)} if n >= 6 else set()
            for k in range(1, n):
                pos = -along + span * k / n
                if k in newel_at:
                    continue
                if side in ("+z", "-z"):
                    d.box(cx + pos, y + bot_r, cz + sgn * fixed, bw, h - top_r - bot_r, bw, role, skip=("+y",))
                else:
                    d.box(cx + sgn * fixed, y + bot_r, cz + pos, bw, h - top_r - bot_r, bw, role, skip=("+y",))
            for k in newel_at:
                pos = -along + span * k / n
                px, pz = (pos, sgn * fixed) if side in ("+z", "-z") else (sgn * fixed, pos)
                self.newel(d, cx + px, cz + pz, y, nw, h + self.uy(0.08), role)
        for sx_ in (1, -1):
            for sz_ in (1, -1):
                self.newel(d, cx + sx_ * mx, cz + sz_ * mz, y, nw, h + self.uy(0.08), role)

    def newel(self, d, x, z, y, w, h, role):
        """A square post with a cap and a small pyramid finial."""
        d.box(x, y, z, w, h, w, role, skip=("+y",))
        cap = w * 1.3
        ch = self.uy(0.07)
        d.box(x, y + h, z, cap, ch, cap, role, bottom=True)
        tip = y + h + ch + self.uy(0.16)
        base = cap * 0.62
        yb = y + h + ch
        ring = [(x + base / 2, z + base / 2), (x - base / 2, z + base / 2), (x - base / 2, z - base / 2), (x + base / 2, z - base / 2)]
        d.box(x, yb, z, base, self.uy(0.05), base, role, skip=("+y",))
        for k in range(4):
            a, b = ring[k], ring[(k + 1) % 4]
            d.poly([(a[0], yb + self.uy(0.05), a[1]), (b[0], yb + self.uy(0.05), b[1]), (x, tip, z)], role, ((a[0] + b[0]) / 2 - x, 0.3, (a[1] + b[1]) / 2 - z))

    def sign(self, d, face, plane, u, v, letters, height, cx=0.0, cz=0.0, role="frame", proud=0.006, backing="mech", pitch=None):
        """Lettering on a fascia: `letters` (H I O T E L R N A) in blocks
        `height` metres tall, each stroke a raised bar on a backing plate."""
        glyphs = {
            "H": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 2, 2, 3)],
            "I": [(1, 0, 2, 5), (0, 0, 1, 1), (2, 0, 3, 1), (0, 4, 1, 5), (2, 4, 3, 5)],
            "O": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 0, 2, 1), (1, 4, 2, 5)],
            "T": [(1, 0, 2, 4), (0, 4, 3, 5)],
            "E": [(0, 0, 1, 5), (1, 0, 3, 1), (1, 2, 2, 3), (1, 4, 3, 5)],
            "L": [(0, 0, 1, 5), (1, 0, 3, 1)],
            "R": [(0, 0, 1, 5), (1, 4, 3, 5), (2, 2, 3, 4), (1, 2, 2, 3), (2, 0, 3, 2)],
            "N": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 3, 2, 4), (1, 1, 2, 2)],
            "A": [(0, 0, 1, 4), (2, 0, 3, 4), (1, 4, 2, 5), (1, 2, 2, 3)],
            "C": [(0, 0, 1, 5), (1, 0, 3, 1), (1, 4, 3, 5)],
            "W": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 0, 2, 2)],
        }
        gh = self.uy(height)
        cell_h, cell_w = gh / 5, self.ux(height * 0.6) / 3
        pitch = pitch or cell_w * 4.4
        total = pitch * len(letters) - (pitch - cell_w * 3)
        pad = self.ux(0.12)
        self.fbox(d, face, plane, u - total / 2 - pad, u + total / 2 + pad, v - gh / 2 - self.uy(0.07), v + gh / 2 + self.uy(0.07), 0, proud * 0.6, backing, cx, cz, skip=("back",))
        for i, ch in enumerate(letters):
            lu0 = u - total / 2 + pitch * i
            for a, b, c, e in glyphs.get(ch, []):
                self.fbox(d, face, plane, lu0 + cell_w * a, lu0 + cell_w * c, v - gh / 2 + cell_h * b, v - gh / 2 + cell_h * e, proud * 0.6, proud * 0.6 + proud, role, cx, cz, skip=("back",))

    def tank(self, d, x, z, y, r, h, role="mech", ladder=(1, 0)):
        """A rooftop water tank on legs: a banded drum under a conical lid,
        a ladder, an inlet pipe and a hatch. `r`, `h` in metres; returns the top."""
        R = self.ux(r)
        leg = self.uy(0.45)
        L = R * 0.72
        for kx in (1, -1):
            for kz in (1, -1):
                d.box(x + kx * L, y, z + kz * L, self.ux(0.1), leg, self.ux(0.1), role)
        for f in (0.35,):
            for kz in (1, -1):
                d.box(x, y + leg * f, z + kz * L, L * 2 - self.ux(0.1), self.uy(0.05), self.ux(0.05), role)
            for kx in (1, -1):
                d.box(x + kx * L, y + leg * f, z, self.ux(0.05), self.uy(0.05), L * 2 - self.ux(0.1), role)
        d.box(x, y + leg, z, R * 2.4, self.uy(0.1), R * 2.4, role, bottom=True)
        base = y + leg + self.uy(0.1)
        self.prism(d, x, z, R, base, base + self.uy(h), 16, role, top=False)
        for f, lo in ((0.0, 0.0), (0.5, -0.05), (1.0, -0.1)):
            self.prism(d, x, z, R * 1.09, base + self.uy(h) * f + self.uy(lo), base + self.uy(h) * f + self.uy(lo + 0.1), 16, role, top=False, bottom=True)
        top = base + self.uy(h)
        ring = [(x + R * 1.09 * math.cos(2 * math.pi * k / 16), z + R * 1.09 * math.sin(2 * math.pi * k / 16)) for k in range(16)]
        apex = top + self.uy(0.3)
        for k in range(16):
            a, b = ring[k], ring[(k + 1) % 16]
            d.poly([(a[0], top, a[1]), (b[0], top, b[1]), (x, apex, z)], role, ((a[0] + b[0]) / 2 - x, 0.4, (a[1] + b[1]) / 2 - z))
        d.box(x, apex - self.uy(0.02), z, self.ux(0.3), self.uy(0.1), self.ux(0.3), role, bottom=True)
        # A ladder up one side (`ladder`, a direction in x, z), clear of the platform.
        dx, dz = ladder
        off = R * 1.2 + self.ux(0.1)
        lx, lz = x + dx * off, z + dz * off
        px, pz = abs(dz), abs(dx)
        for k in (-0.16, 0.16):
            d.box(lx + px * self.ux(k), y, lz + pz * self.ux(k), self.ux(0.04), leg + self.uy(h) + self.uy(0.1), self.ux(0.04), role)
        for k in range(int((leg + self.uy(h)) * self.sy / 0.28)):
            d.box(lx, y + self.uy(0.15 + 0.28 * k), lz, self.ux(0.03) if dx else self.ux(0.28), self.uy(0.03), self.ux(0.28) if dx else self.ux(0.03), role, bottom=True)
        self.rod(d, (x - R * 0.5, top + self.uy(0.05), z), (x - R * 0.5, top + self.uy(0.32), z), 0.05, role, 6)
        return top

    def duct(self, d, x0, z0, x1, z1, y, w, h, role="mech", legs=True):
        """A rectangular duct run along x or z at height `y` (unit space
        end points), `w` metres wide and `h` tall, flanged every 1.2 m and
        standing on legs."""
        along_x = abs(z1 - z0) < 1e-9
        length = abs(x1 - x0) if along_x else abs(z1 - z0)
        cx_, cz_ = (x0 + x1) / 2, (z0 + z1) / 2
        W, H = self.ux(w), self.uy(h)
        leg = self.uy(0.35) if legs else 0.0
        yb = y + leg
        if along_x:
            d.box(cx_, yb, cz_, length, H, W, role, bottom=True)
        else:
            d.box(cx_, yb, cz_, W, H, length, role, bottom=True)
        n = max(1, int(length * (self.sx if along_x else self.sz) / 1.2))
        for k in range(1, n):
            f = k / n
            px = x0 + (x1 - x0) * f
            pz = z0 + (z1 - z0) * f
            fl = self.ux(0.05)
            if along_x:
                d.box(px, yb - self.uy(0.03), pz, fl, H + self.uy(0.06), W + self.ux(0.06), role, bottom=True)
            else:
                d.box(px, yb - self.uy(0.03), pz, W + self.ux(0.06), H + self.uy(0.06), fl, role, bottom=True)
            if legs and k % 2 == 1:
                d.box(px, y, pz, self.ux(0.04), leg - self.uy(0.03), self.ux(0.04), role)

    def tray(self, d, x0, z0, x1, z1, y, w=0.4, role="mech"):
        """A cable tray: two side rails, rungs every 0.3 m and a run of cable."""
        along_x = abs(z1 - z0) < 1e-9
        length = abs(x1 - x0) if along_x else abs(z1 - z0)
        cx_, cz_ = (x0 + x1) / 2, (z0 + z1) / 2
        W = self.ux(w)
        rail_h = self.uy(0.09)
        rs = self.ux(0.035)
        for k in (-1, 1):
            if along_x:
                d.box(cx_, y, cz_ + k * W / 2, length, rail_h, rs, role)
            else:
                d.box(cx_ + k * W / 2, y, cz_, rs, rail_h, length, role)
        n = max(2, int(length * (self.sx if along_x else self.sz) / 0.3))
        for k in range(n):
            f = (k + 0.5) / n
            px = x0 + (x1 - x0) * f
            pz = z0 + (z1 - z0) * f
            if along_x:
                d.box(px, y, pz, self.ux(0.03), self.uy(0.03), W - rs, role, bottom=True)
            else:
                d.box(px, y, pz, W - rs, self.uy(0.03), self.ux(0.03), role, bottom=True)
        # Three bundled cables lying on the rungs.
        for k, off in enumerate((-0.28, 0.0, 0.28)):
            r = 0.03 + 0.01 * (k % 2)
            if along_x:
                self.rod(d, (x0, y + self.uy(0.05 + r), z0 + W * off), (x1, y + self.uy(0.05 + r), z0 + W * off), r, "core", 5, caps=False)
            else:
                self.rod(d, (x0 + W * off, y + self.uy(0.05 + r), z0), (x0 + W * off, y + self.uy(0.05 + r), z1), r, "core", 5, caps=False)

    def pipes(self, d, x0, z0, x1, z1, y, radii=(0.06, 0.04), role="metal"):
        """Parallel pipes along a run on shared saddle supports."""
        along_x = abs(z1 - z0) < 1e-9
        length = abs(x1 - x0) if along_x else abs(z1 - z0)
        off = 0.0
        pos = []
        for r in radii:
            off += r
            pos.append(off)
            off += r + 0.03
        for r, o in zip(radii, pos):
            oz, ox = (self.ux(o), 0.0) if along_x else (0.0, self.ux(o))
            self.rod(d, (x0 + ox, y + self.uy(r + 0.08), z0 + oz), (x1 + ox, y + self.uy(r + 0.08), z1 + oz), r, role, 8)
        n = max(1, int(length * (self.sx if along_x else self.sz) / 1.5))
        wide = self.ux(off)
        for k in range(n + 1):
            f = k / n
            px, pz = x0 + (x1 - x0) * f, z0 + (z1 - z0) * f
            if along_x:
                d.box(px, y, pz + wide / 2 - self.ux(radii[0]), self.ux(0.05), self.uy(0.08), wide, "mech")
            else:
                d.box(px + wide / 2 - self.ux(radii[0]), y, pz, wide, self.uy(0.08), self.ux(0.05), "mech")

    def ahu(self, d, x, z, y, w, dp, h, role="mech", fans=1):
        """An air-handling unit: a louvred housing with a lid that overhangs,
        access doors with handles, and a condenser fan on top per `fans`."""
        self.louvred_box(d, x, z, y, w, dp, h, role)
        lid = self.uy(0.07)
        d.box(x, y + h, z, w + self.ux(0.14), lid, dp + self.ux(0.14), role, bottom=True)
        for k in range(fans):
            fx = x + (k - (fans - 1) / 2) * w / max(1, fans) * 0.9 if fans > 1 else x
            self.fan(d, fx, z, y + h + lid, min(self.ux(0.34), w * 0.36 / max(1, fans)))
        return y + h + lid

    def bmu(self, d, x, z0, z1, y, role="mech"):
        """A building-maintenance unit parked on rails that run along z at
        `x` on a roof edge: two rails, a wheeled carriage, a cab with a
        window, a mast and a jib stowed leaning inward with its wire and hook."""
        rw = self.ux(0.08)
        length = z1 - z0
        zc = (z0 + z1) / 2
        gauge = self.ux(0.33)
        d.box(x - gauge, y, zc, rw, self.uy(0.07), length, "metal")
        d.box(x + gauge, y, zc, rw, self.uy(0.07), length, "metal")
        y1 = y + self.uy(0.07)
        d.box(x, y1, zc, self.ux(0.9), self.uy(0.12), self.ux(1.6), role, bottom=True)
        for dx in (-0.33, 0.33):
            for dz in (-0.6, 0.6):
                self.prism(d, x + self.ux(dx), zc + self.ux(dz), self.ux(0.12), y, y1 + self.uy(0.1), 10, "core", bottom=True)
        y2 = y1 + self.uy(0.12)
        cz_ = zc - self.ux(0.15)
        d.box(x, y2, cz_, self.ux(0.75), self.uy(0.8), self.ux(0.9), role, bottom=True)
        # The cab window with a frame, on both ends.
        for face in ("+z", "-z"):
            self.fbox(d, face, self.ux(0.45), -self.ux(0.28), self.ux(0.28), y2 + self.uy(0.32), y2 + self.uy(0.68), 0, 0.004, "window", x, cz_, skip=("back",))
            for lo, hi in ((0.28, 0.32), (0.68, 0.72)):
                self.fbox(d, face, self.ux(0.45), -self.ux(0.33), self.ux(0.33), y2 + self.uy(lo), y2 + self.uy(hi), 0, 0.007, "frame", x, cz_, skip=("back",))
        d.box(x, y2 + self.uy(0.8), cz_, self.ux(0.85), self.uy(0.05), self.ux(1.0), role, bottom=True)
        # The mast, and the jib leaning over the roof, with a wire to a hook.
        mz = zc + self.ux(0.55)
        d.box(x, y2, mz, self.ux(0.24), self.uy(0.8), self.ux(0.24), role, bottom=True)
        tip = (x - self.ux(0.75), y2 + self.uy(1.25), mz)
        self.rod(d, (x, y2 + self.uy(0.75), mz), tip, 0.07, role, 6)
        self.rod(d, tip, (tip[0], y2 + self.uy(0.45), tip[2]), 0.012, "core", 4, caps=True)
        d.box(tip[0], y2 + self.uy(0.3), tip[2], self.ux(0.12), self.uy(0.15), self.ux(0.12), "metal", bottom=True)

    def rigging(self, d, x, z, y_from, y_to, reach, n=4, r=0.014, phase=math.pi / 4, angles=None):
        """Guy wires from a mast at `y_to` down to anchors `reach` away on
        the roof at `y_from`, each with a turnbuckle and a small foot."""
        for k in range(len(angles) if angles else n):
            ang = angles[k] if angles else phase + k * math.pi / 2 * (4 / n)
            ax, az = x + reach * math.cos(ang), z + reach * math.sin(ang)
            self.rod(d, (x, y_to, z), (ax, y_from, az), r * 1.0, "metal", 4, caps=False)
            mx, mz = x + (ax - x) * 0.85, z + (az - z) * 0.85
            my = y_to + (y_from - y_to) * 0.85
            self.prism(d, mx, mz, self.ux(0.05), my - self.uy(0.05), my + self.uy(0.05), 5, "metal", bottom=True)

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
