"""
Near-level building detail (`LodInstances` draws it for the few buildings
closest to the camera; see blender/README.md, "Near levels").

The lean archetypes are authored in UNIT SPACE (x, z in [-0.5, 0.5], y in
[0, 1]) and every instance stretches them, so a frame that is 5 cm thick in
the city is a different fraction of the unit box along each axis. This module
takes every detail in METRES at a representative instance size (`scale`, the
same numbers as `SCALE` in the lean scripts) and converts it to unit space per
axis, so a sill is as deep as a sill should be however the model stretches.
Positions along a wall stay in unit space (they come from the lean script's
own numbers, which is what keeps the glazing exactly where the lit windows
are).

The `Detail` writes through an `emit(points, material, outward)` callback and
takes its materials from a palette of semantic names, so the same code dresses
the city's `bkit.Draft` (materials are role strings) and the settlement's
`skit.Mesh` (materials are Blender materials).

Coordinates are the app's: x across, y up, z forward, the door on +z.
"""

import math

LAYER = 0.006

FACINGS = ("+z", "-z", "+x", "-x")
NORMAL = {"+z": (0, 0, 1), "-z": (0, 0, -1), "+x": (1, 0, 0), "-x": (-1, 0, 0)}
ALONG = {"+z": (1, 0, 0), "-z": (-1, 0, 0), "+x": (0, 0, -1), "-x": (0, 0, 1)}


def fp(facing, plane, u, v, o=0.0, cx=0.0, cz=0.0):
    """A point on a wall: `u` along it, `v` up, `o` out of `plane`."""
    d = plane + o
    if facing == "+z":
        return (cx + u, v, cz + d)
    if facing == "-z":
        return (cx - u, v, cz - d)
    if facing == "+x":
        return (cx + d, v, cz - u)
    return (cx - d, v, cz + u)


class Detail:
    def __init__(self, emit, pal, scale):
        self.emit = emit
        self.pal = pal
        self.sx, self.sy, self.sz = scale

    # -- metres to unit space -------------------------------------------------

    def U(self, facing, m):
        """Metres along a wall, as unit space."""
        return m / (self.sx if facing in ("+z", "-z") else self.sz)

    def O(self, facing, m):
        """Metres out of a wall, as unit space."""
        return m / (self.sz if facing in ("+z", "-z") else self.sx)

    def V(self, m):
        return m / self.sy

    def X(self, m):
        return m / self.sx

    def Z(self, m):
        return m / self.sz

    def mat(self, key):
        return self.pal.get(key, key) if isinstance(key, str) else key

    # -- primitives -------------------------------------------------------------

    def quad(self, pts, mat, out):
        self.emit(pts, self.mat(mat), out)

    def wbox(self, facing, plane, u0, u1, v0, v1, o0, o1, mat, cx=0.0, cz=0.0, skip=("back",)):
        """A box on a wall, from `o0` to `o1` out of `plane` (unit space).
        Faces: front back top bottom left right (`skip` leaves some out)."""
        if u1 < u0:
            u0, u1 = u1, u0
        P = lambda u, v, o: fp(facing, plane, u, v, o, cx, cz)  # noqa: E731
        n = NORMAL[facing]
        a = ALONG[facing]
        faces = {
            "front": ([P(u0, v0, o1), P(u1, v0, o1), P(u1, v1, o1), P(u0, v1, o1)], n),
            "back": ([P(u0, v0, o0), P(u1, v0, o0), P(u1, v1, o0), P(u0, v1, o0)], (-n[0], 0, -n[2])),
            "top": ([P(u0, v1, o0), P(u1, v1, o0), P(u1, v1, o1), P(u0, v1, o1)], (0, 1, 0)),
            "bottom": ([P(u0, v0, o0), P(u1, v0, o0), P(u1, v0, o1), P(u0, v0, o1)], (0, -1, 0)),
            "left": ([P(u0, v0, o0), P(u0, v1, o0), P(u0, v1, o1), P(u0, v0, o1)], (-a[0], 0, -a[2])),
            "right": ([P(u1, v0, o0), P(u1, v1, o0), P(u1, v1, o1), P(u1, v0, o1)], a),
        }
        for key, (pts, out) in faces.items():
            if key not in skip:
                self.quad(pts, mat, out)

    def box(self, x0, x1, y0, y1, z0, z1, mat, skip=()):
        """An axis-aligned box in unit space; `skip` names faces
        (front = +z, back = -z, left = -x, right = +x, top, bottom)."""
        self.wbox("+z", 0.0, x0, x1, y0, y1, z0, z1, mat, skip=skip)

    def cyl(self, x, z, y0, y1, r, mat, n=8, top=True, bottom=False, top_mat=None, r1=None, phase=0.0):
        """An upright prism of radius `r` metres (`r1` at the foot for a
        taper), elliptical in unit space so it is round in the city."""
        r1 = r if r1 is None else r1
        ring0 = [(x + self.X(r1) * math.cos(phase + 2 * math.pi * k / n), z + self.Z(r1) * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]
        ring1 = [(x + self.X(r) * math.cos(phase + 2 * math.pi * k / n), z + self.Z(r) * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            j = (k + 1) % n
            mid = ((ring0[k][0] + ring0[j][0]) / 2 - x, 0, (ring0[k][1] + ring0[j][1]) / 2 - z)
            self.quad([(ring0[k][0], y0, ring0[k][1]), (ring0[j][0], y0, ring0[j][1]), (ring1[j][0], y1, ring1[j][1]), (ring1[k][0], y1, ring1[k][1])], mat, mid)
        if top:
            self.quad([(p[0], y1, p[1]) for p in ring1], top_mat or mat, (0, 1, 0))
        if bottom:
            self.quad([(p[0], y0, p[1]) for p in ring0], mat, (0, -1, 0))

    def band(self, hx, hz, v0, v1, proj, mat, cx=0.0, cz=0.0, gaps=None, skip_top=False, corner_gap=0.0):
        """A course round a block of half extents (hx, hz): four boxes
        `proj` metres proud of the walls, mitred by letting the z sides run
        over the ends of the x sides. `gaps[facing]` lists (u0, u1) ranges to
        leave open (a door, a shop window)."""
        gaps = gaps or {}
        for facing, plane, half in (("+z", hz, hx), ("-z", hz, hx), ("+x", hx, hz), ("-x", hx, hz)):
            o = self.O(facing, proj)
            ext = self.U("+z", proj) if facing in ("+z", "-z") else 0.0
            spans = [(-half - ext, half + ext)]
            if corner_gap:
                # Stops short of the corners (their quoins stand there).
                spans = [(-half + self.U(facing, corner_gap), half - self.U(facing, corner_gap))]
            for g0, g1 in gaps.get(facing, []):
                nxt = []
                for a, b in spans:
                    if g1 <= a or g0 >= b:
                        nxt.append((a, b))
                        continue
                    if g0 > a:
                        nxt.append((a, g0))
                    if g1 < b:
                        nxt.append((g1, b))
                spans = nxt
            skip = ("back", "top") if skip_top else ("back",)
            for a, b in spans:
                self.wbox(facing, plane, a, b, v0, v1, 0.0, o, mat, cx, cz, skip=skip + (() if facing in ("+z", "-z") else ("left", "right")))


    def quoins(self, hx, hz, y0, y1, proj=0.024, height=0.23, long_=0.48, short=0.28, mat="trim", cx=0.0, cz=0.0):
        """Alternating long and short stones up all four corners. The stones
        on the z faces run round the corner over the ends of those on the x
        faces."""
        n = max(2, int((y1 - y0) * self.sy / height))
        h = (y1 - y0) / n
        for k in range(n):
            ya, yb = y0 + h * k, y0 + h * (k + 1)
            skip = ["back"]
            if 0 < k:
                skip.append("bottom")
            if k < n - 1:
                skip.append("top")
            for sx in (1, -1):
                for sz in (1, -1):
                    zf, xf = ("+z" if sz > 0 else "-z"), ("+x" if sx > 0 else "-x")
                    lz, lx = (long_, short) if k % 2 == 0 else (short, long_)
                    uc = sx * hx * (1 if zf == "+z" else -1)
                    length, ext = self.U(zf, lx), self.U(zf, proj)
                    u0, u1 = (uc - length, uc + ext) if uc > 0 else (uc - ext, uc + length)
                    self.wbox(zf, hz, u0, u1, ya, yb, 0.0, self.O(zf, proj), mat, cx, cz, skip=tuple(skip))
                    uc = sz * hz * (-1 if xf == "+x" else 1)
                    length = self.U(xf, lz)
                    u0, u1 = (uc - length, uc) if uc > 0 else (uc, uc + length)
                    self.wbox(xf, hx, u0, u1, ya, yb, 0.0, self.O(xf, proj), mat, cx, cz, skip=tuple(skip))

    # -- windows ----------------------------------------------------------------

    def window(self, facing, plane, o, cx=0.0, cz=0.0, fw=0.05, bars=None, sill=0.09, lintel=True, jambs=True,
               shutters=False, frame="frame", trim="trim", bar_m=0.026, sash="frame", ring=None, back=None, sill_ext=0.085, deep=None, keystone=True, lintel_ext=0.1):
        """The dressing of one opening `o` (u, v, w, h, depth as the lean
        script gave them): a frame and glazing bars standing in front of the
        glass without touching the rectangle the lit window draws on, a
        projecting sill, a lintel with a keystone, and reveal surrounds."""
        u0, u1 = o["u"] - o["w"] / 2, o["u"] + o["w"] / 2
        v0, v1 = o["v"] - o["h"] / 2, o["v"] + o["h"] / 2
        d = o["depth"]
        wm = o["w"] * (self.sx if facing in ("+z", "-z") else self.sz)
        hm = o["h"] * self.sy
        g = -d  # the glass
        fu, fv = self.U(facing, fw), self.V(fw)
        # Bars and frame stand clear of the lit pane (a LAYER off the glass).
        depth = deep if deep else max(self.O(facing, 0.05), 0.0135)
        W = lambda a0, a1, b0, b1, oo0, oo1, m, skip=("back",): self.wbox(facing, plane, a0, a1, b0, b1, oo0, oo1, m, cx, cz, skip)  # noqa: E731
        if ring:
            # The lean script's own frame ring stands round the glass: bars
            # go in the ring, so the glass keeps its whole rectangle.
            ru, rv = ring
            b0 = -(back if back is not None else d)
            fd = self.O(facing, 0.06)
            W(u0 - ru, u1 + ru, v1, v1 + rv, b0, b0 + fd, frame, ("back", "top", "left", "right"))
            W(u0 - ru, u1 + ru, v0 - rv, v0, b0, b0 + fd, frame, ("back", "bottom", "left", "right"))
            W(u0 - ru, u0, v0, v1, b0, b0 + fd, frame, ("back", "top", "bottom", "left"))
            W(u1, u1 + ru, v0, v1, b0, b0 + fd, frame, ("back", "top", "bottom", "right"))
            iu0, iu1, iv0, iv1 = u0, u1, v0, v1
        else:
            # The frame: head and cill run the full width, the stiles between.
            W(u0, u1, v1 - fv, v1, g, g + depth, frame, ("back", "top", "left", "right"))
            W(u0, u1, v0, v0 + fv, g, g + depth, frame, ("back", "bottom", "left", "right"))
            W(u0, u0 + fu, v0 + fv, v1 - fv, g, g + depth, frame, ("back", "top", "bottom", "left"))
            W(u1 - fu, u1, v0 + fv, v1 - fv, g, g + depth, frame, ("back", "top", "bottom", "right"))
            iu0, iu1, iv0, iv1 = u0 + fu, u1 - fu, v0 + fv, v1 - fv
        cols, rows = bars if bars else (max(1, round(wm / 0.45)), max(1, round(hm / 0.4)))
        bd = depth
        bu, bv = self.U(facing, bar_m) / 2, self.V(bar_m) / 2
        for k in range(1, cols):
            u = iu0 + (iu1 - iu0) * k / cols
            W(u - bu, u + bu, iv0, iv1, g, g + bd, sash, ("back", "top", "bottom"))
        for k in range(1, rows):
            v = iv0 + (iv1 - iv0) * k / rows
            for c in range(cols):
                a = iu0 + (iu1 - iu0) * c / cols + (bu if c else 0)
                b = iu0 + (iu1 - iu0) * (c + 1) / cols - (bu if c < cols - 1 else 0)
                W(a, b, v - bv, v + bv, g, g + bd, sash, ("back", "left", "right"))
        ext = self.U(facing, 0.06)
        if sill:
            sext = self.U(facing, sill_ext)
            W(u0 - sext, u1 + sext, v0 - self.V(0.06), v0, 0.0, self.O(facing, sill), trim)
        if lintel:
            lext = self.U(facing, lintel_ext)
            W(u0 - lext, u1 + lext, v1, v1 + self.V(0.14), 0.0, self.O(facing, 0.03), trim)
            if keystone:
                kw = self.U(facing, 0.09)
                W(o["u"] - kw, o["u"] + kw, v1, v1 + self.V(0.21), self.O(facing, 0.03), self.O(facing, 0.058), trim)
        if jambs:
            gap = self.U(facing, 0.02)
            W(u0 - ext, u0 - gap, v0, v1, 0.0, self.O(facing, 0.024), trim, ("back", "top", "bottom"))
            W(u1 + gap, u1 + ext, v0, v1, 0.0, self.O(facing, 0.024), trim, ("back", "top", "bottom"))
        if shutters:
            sw = self.U(facing, shutters if isinstance(shutters, float) else min(0.42, wm * 0.5))
            for side, (a, b) in ((-1, (u0 - ext - sw, u0 - ext)), (1, (u1 + ext, u1 + ext + sw))):
                self.shutter(facing, plane, a, b, v0 - self.V(0.06), v1 + self.V(0.02), cx, cz, frame=frame)

    def shutter(self, facing, plane, u0, u1, v0, v1, cx=0.0, cz=0.0, frame="frame", slat="wallSoft"):
        """A louvred shutter: a frame with slats set between the stiles."""
        depth = self.O(facing, 0.03)
        st = self.U(facing, 0.045)
        rail = self.V(0.05)
        W = lambda a0, a1, b0, b1, oo0, oo1, m, skip=("back",): self.wbox(facing, plane, a0, a1, b0, b1, oo0, oo1, m, cx, cz, skip)  # noqa: E731
        W(u0, u0 + st, v0, v1, 0.0, depth, frame)
        W(u1 - st, u1, v0, v1, 0.0, depth, frame)
        W(u0 + st, u1 - st, v0, v0 + rail, 0.0, depth, frame, ("back", "left", "right"))
        W(u0 + st, u1 - st, v1 - rail, v1, 0.0, depth, frame, ("back", "left", "right"))
        n = max(4, int((v1 - v0 - 2 * rail) * self.sy / 0.085))
        h = (v1 - v0 - 2 * rail) / n
        for k in range(n):
            y = v0 + rail + h * k
            # A slat leans out at its foot: a sloped face, not a box.
            a, b = u0 + st, u1 - st
            P = lambda u, v, o: fp(facing, plane, u, v, o, cx, cz)  # noqa: E731
            self.quad([P(a, y, depth * 0.35), P(b, y, depth * 0.35), P(b, y + h, depth * 0.8), P(a, y + h, depth * 0.8)], slat, (NORMAL[facing][0], 0.4, NORMAL[facing][2]))
            self.quad([P(a, y, depth * 0.35), P(b, y, depth * 0.35), P(b, y, 0.0), P(a, y, 0.0)], slat, (0, -1, 0))

    # -- doors ------------------------------------------------------------------

    def door(self, facing, plane, o, cx=0.0, cz=0.0, leaf="door", dark="doorDark", trim="trim", metal="metal",
             steps=True, surround=True, head=True, panels=(2, 3), step_reach=0.5, glazed=None, from_o=0.0, limit=0.53):
        """A panelled door in its opening `o`: stiles and rails standing
        proud of the leaf with raised panels between, a handle, letterbox and
        kick plate, pilasters and a stone step or two."""
        u0, u1 = o["u"] - o["w"] / 2, o["u"] + o["w"] / 2
        v0, v1 = o["v"] - o["h"] / 2, o["v"] + o["h"] / 2
        g = -o["depth"]
        W = lambda a0, a1, b0, b1, oo0, oo1, m, skip=("back",): self.wbox(facing, plane, a0, a1, b0, b1, oo0, oo1, m, cx, cz, skip)  # noqa: E731
        st, rl = self.U(facing, 0.085), self.V(0.11)
        cols, rows = panels
        pd = self.O(facing, 0.024)
        # Stiles and rails (the leaf's frame), standing off the leaf.
        W(u0, u0 + st, v0, v1, g, g + pd, dark, ("back", "left"))
        W(u1 - st, u1, v0, v1, g, g + pd, dark, ("back", "right"))
        W(u0 + st, u1 - st, v0, v0 + rl * 1.5, g, g + pd, dark, ("back", "left", "right"))
        W(u0 + st, u1 - st, v1 - rl, v1, g, g + pd, dark, ("back", "left", "right"))
        iu0, iu1 = u0 + st, u1 - st
        iv0, iv1 = v0 + rl * 1.5, v1 - rl
        mid = self.U(facing, 0.05)
        rail = self.V(0.09)
        pw = (iu1 - iu0 - mid * (cols - 1)) / cols
        ph = (iv1 - iv0 - rail * (rows - 1)) / rows
        for c in range(cols):
            a = iu0 + (pw + mid) * c
            if c:
                W(a - mid, a, iv0, iv1, g, g + pd, dark, ("back", "left", "right", "top", "bottom"))
            for r in range(rows):
                b = iv0 + (ph + rail) * r
                # The panel, raised a little more than the frame round it.
                inset_u, inset_v = self.U(facing, 0.02), self.V(0.02)
                if glazed is not None and r == rows - 1:
                    W(a + inset_u, a + pw - inset_u, b + inset_v, b + ph - inset_v, g + pd, g + pd + self.O(facing, 0.024), glazed, ("back",))
                else:
                    W(a + inset_u, a + pw - inset_u, b + inset_v, b + ph - inset_v, g + pd, g + pd + self.O(facing, 0.024), leaf, ("back",))
                if r:
                    W(a, a + pw, b - rail, b, g, g + pd, dark, ("back", "left", "right", "top", "bottom"))
        # Furniture: a lever handle and its plate, a letterbox, a kick plate.
        hu = u1 - st * 0.5
        hv = v0 + (v1 - v0) * 0.46
        W(hu - self.U(facing, 0.02), hu + self.U(facing, 0.02), hv - self.V(0.06), hv + self.V(0.06), g + pd, g + pd + self.O(facing, 0.024), metal)
        W(hu - self.U(facing, 0.075), hu + self.U(facing, 0.006), hv - self.V(0.012), hv + self.V(0.012), g + pd + self.O(facing, 0.024), g + pd + self.O(facing, 0.05), metal)
        cu = o["u"]
        W(cu - self.U(facing, 0.13), cu + self.U(facing, 0.13), v0 + (v1 - v0) * 0.66 - self.V(0.025), v0 + (v1 - v0) * 0.66 + self.V(0.025), g + pd, g + pd + self.O(facing, 0.024), metal)
        if surround:
            ext = self.U(facing, 0.1)
            W(u0 - ext, u0, v0, v1, 0.0, self.O(facing, 0.05), trim, ("back", "bottom"))
            W(u1, u1 + ext, v0, v1, 0.0, self.O(facing, 0.05), trim, ("back", "bottom"))
            if head:
                W(u0 - ext, u1 + ext, v1, v1 + self.V(0.16), 0.0, self.O(facing, 0.07), trim)
                W(u0 - ext - self.U(facing, 0.03), u1 + ext + self.U(facing, 0.03), v1 + self.V(0.16), v1 + self.V(0.2), 0.0, self.O(facing, 0.1), trim)
        if steps and v0 > 1e-6:
            top = v0
            # No further out than the lean model's own trim reaches.
            room = (limit - plane - from_o) * (self.sz if facing in ("+z", "-z") else self.sx)
            reach = max(0.12, min(step_reach, room))
            wide = self.U(facing, 0.14)
            ext = self.U(facing, 0.1) if surround else 0.0
            W(u0 - ext - wide, u1 + ext + wide, 0.0, top, from_o, from_o + self.O(facing, reach * 0.5), trim)
            W(u0 - ext - wide * 2.4, u1 + ext + wide * 2.4, 0.0, top * 0.5, from_o + self.O(facing, reach * 0.5), from_o + self.O(facing, reach), trim, ("back",))

    # -- roofs and rainwater --------------------------------------------------

    def gutter_run(self, facing, plane, u0, u1, y, cx=0.0, cz=0.0, w=0.085, h=0.08, mat="metal", brackets=True):
        """A gutter along a wall or eave at height `y` (its top): a trough
        box with end caps, and brackets to the fascia every 60 cm."""
        self.wbox(facing, plane, u0, u1, y - self.V(h), y, 0.0, self.O(facing, w), mat, cx, cz, skip=("back",))
        if brackets:
            n = max(2, int((u1 - u0) * (self.sx if facing in ("+z", "-z") else self.sz) / 0.6))
            for k in range(n + 1):
                u = u0 + (u1 - u0) * k / n
                self.wbox(facing, plane, u - self.U(facing, 0.012), u + self.U(facing, 0.012), y - self.V(h + 0.03), y - self.V(h), 0.0, self.O(facing, w * 0.85), mat, cx, cz, skip=("back", "top"))

    def downpipe(self, x, z, y0, y1, r=0.038, mat="metal", clips=True, standoff=None):
        """A round pipe from `y0` to `y1` with a clip ring every metre and a
        shoe at the foot."""
        self.cyl(x, z, y0, y1, r, mat, n=8, top=True)
        if clips:
            k = 0.8
            y = y0 + self.V(0.5)
            while y < y1 - self.V(0.2):
                self.cyl(x, z, y, y + self.V(0.045), r, mat, n=8, top=False, r1=r * 1.9)
                y += self.V(k)
        self.cyl(x, z, y0, y0 + self.V(0.09), r, mat, n=8, top=False, r1=r * 1.9)

    def ridge_tiles(self, along, ridge_at, y, half_len, tile=0.32, half_w=0.09, rise=0.075, mat="roofLight", along_x=True, center=0.0, foot_m=0.06, skip=()):
        """A ridge of individual cap tiles, `tile` metres long with a hair
        between them: an arch of three faces a side over the ridge line."""
        length = half_len * 2
        metres = length * (self.sx if along_x else self.sz)
        n = max(2, int(metres / tile))
        step = length / n
        gap = self.X(0.006) if along_x else self.Z(0.006)
        for k in range(n):
            a0 = center - half_len + step * k + gap
            a1 = center - half_len + step * (k + 1) - gap
            if any(a1 > lo and a0 < hi for lo, hi in skip):
                continue
            w = self.Z(half_w) if along_x else self.X(half_w)
            h = self.V(rise)
            foot = self.V(foot_m)
            prof = [(-w, y - foot), (-w * 0.72, y + h * 0.7), (0.0, y + h), (w * 0.72, y + h * 0.7), (w, y - foot)]
            for i in range(4):
                (b0, y0), (b1, y1) = prof[i], prof[i + 1]
                if along_x:
                    pts = [(a0, y0, ridge_at + b0), (a1, y0, ridge_at + b0), (a1, y1, ridge_at + b1), (a0, y1, ridge_at + b1)]
                    out = (0, 1, (b0 + b1) / 2 * 8)
                else:
                    pts = [(ridge_at + b0, y0, a0), (ridge_at + b0, y0, a1), (ridge_at + b1, y1, a1), (ridge_at + b1, y1, a0)]
                    out = ((b0 + b1) / 2 * 8, 1, 0)
                self.quad(pts, mat, out)
            for a, s in ((a0, -1), (a1, 1)):
                if along_x:
                    self.quad([(a, y0_, ridge_at + b_) for b_, y0_ in prof], mat, (s, 0, 0))
                else:
                    self.quad([(ridge_at + b_, y0_, a) for b_, y0_ in prof], mat, (0, 0, s))

    def oculus(self, facing, plane, u, v, r, mat="trim", fill="window", proud=0.05, cx=0.0, cz=0.0, n=14, band=0.09):
        """A round attic window in a gable: a moulded ring standing `proud`
        metres off the wall round a dark disc set a hair off it."""
        P = lambda uu, vv, o: fp(facing, plane, uu, vv, o, cx, cz)  # noqa: E731
        nrm = NORMAL[facing]
        ru, rv = self.U(facing, r), self.V(r)
        bu, bv = self.U(facing, band), self.V(band)
        po = self.O(facing, proud)
        ring = lambda ru_, rv_, o: [P(u + ru_ * math.cos(2 * math.pi * k / n), v + rv_ * math.sin(2 * math.pi * k / n), o) for k in range(n)]  # noqa: E731
        outer, inner = ring(ru + bu, rv + bv, 0.0), ring(ru, rv, 0.0)
        outer_f, inner_f = ring(ru + bu, rv + bv, po), ring(ru, rv, po)
        for k in range(n):
            j = (k + 1) % n
            self.quad([outer_f[k], outer_f[j], inner_f[j], inner_f[k]], mat, nrm)
            self.quad([outer[k], outer[j], outer_f[j], outer_f[k]], mat, ((outer[k][0] + outer[j][0]) / 2 - P(u, v, 0)[0], (outer[k][1] + outer[j][1]) / 2 - v, (outer[k][2] + outer[j][2]) / 2 - P(u, v, 0)[2]))
            self.quad([inner_f[k], inner_f[j], inner[j], inner[k]], mat, (P(u, v, 0)[0] - (inner[k][0] + inner[j][0]) / 2, v - (inner[k][1] + inner[j][1]) / 2, P(u, v, 0)[2] - (inner[k][2] + inner[j][2]) / 2))
        self.quad(ring(ru, rv, self.O(facing, 0.024)), fill, nrm)
