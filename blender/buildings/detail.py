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


    def profile_band(self, hx, hz, v, prof, mat, cx=0.0, cz=0.0, gaps=None, corner_gap=0.0, faces=("+z", "-z", "+x", "-x")):
        """A moulding `prof` (see `profile`) run along the walls of a block of
        half extents (hx, hz) at height `v`, stopping `corner_gap` metres
        short of each corner (where quoins stand) and at each gap
        (u0, u1) in `gaps[facing]`."""
        gaps = gaps or {}
        for facing, plane, half in (("+z", hz, hx), ("-z", hz, hx), ("+x", hx, hz), ("-x", hx, hz)):
            if facing not in faces:
                continue
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
            for a, b in spans:
                self.profile(facing, plane, a, b, v, prof, mat, cx, cz, skip=(len(prof) - 1,))

    def bricks(self, facing, plane, u0, u1, v0, v1, cx=0.0, cz=0.0, gaps=(), kind="brick", proud=0.024, tones=("brick", "brick", "brickDark", "brick", "brickDark"), span_ext=0.0, seed=0):
        """A face of masonry laid course by course in stretcher bond, standing
        `proud` metres off `plane` in front of whatever is there (which
        shows through the joints): each brick a quad of its own in one of
        `tones`. `gaps` lists (u0, u1) ranges to leave bare (a door, its
        step). Bricks are 7.5 by 22.5 cm; `kind` "block" lays 20 by 40 cm
        blocks."""
        ch, cl = (0.075, 0.225) if kind == "brick" else (0.2, 0.4)
        n_rows = max(1, round((v1 - v0) / self.V(ch)))
        course = (v1 - v0) / n_rows  # the courses share the height evenly
        brick = self.U(facing, cl)
        gu, gv = self.U(facing, 0.0035), self.V(0.0035)
        o = self.O(facing, proud)
        P = lambda u, v: fp(facing, plane, u, v, o, cx, cz)  # noqa: E731
        nrm = NORMAL[facing]
        a0, a1 = u0 - span_ext, u1 + span_ext
        for r in range(n_rows):
            va, vb = v0 + course * r, v0 + course * (r + 1)
            off = brick * 0.5 if r % 2 else 0.0
            cuts = {a0, a1}
            k = 0
            while True:
                x = a0 + off + brick * k
                if x >= a1 - 1e-9:
                    break
                if x > a0 + 1e-9:
                    cuts.add(x)
                k += 1
            for g0, g1 in gaps:
                for x in (g0, g1):
                    if a0 < x < a1:
                        cuts.add(x)
            us = sorted(cuts)
            clean = [us[0]]
            for x in us[1:]:
                if x - clean[-1] > brick * 0.15 or x == us[-1]:
                    clean.append(x)
            for i, (ua, ub) in enumerate(zip(clean, clean[1:])):
                mid = (ua + ub) / 2
                if any(g0 < mid < g1 for g0, g1 in gaps):
                    continue
                tone = tones[(r * 5 + i * 3 + (r * i) % 7 + seed) % len(tones)]
                a = ua + (gu if ua > a0 + 1e-9 and not any(abs(ua - g1) < 1e-9 for _, g1 in gaps) else 0.0)
                b = ub - (gu if ub < a1 - 1e-9 and not any(abs(ub - g0) < 1e-9 for g0, _ in gaps) else 0.0)
                self.quad([P(a, va + gv), P(b, va + gv), P(b, vb - gv), P(a, vb - gv)], tone, nrm)

    def brick_box(self, hx, hz, v0, v1, cx=0.0, cz=0.0, proud=0.024, gaps=None, kind="brick", tones=("brick", "brick", "brickDark", "brick", "brickDark"), faces=("+z", "-z", "+x", "-x")):
        """Masonry over all four faces of a block of half extents (hx, hz):
        the z faces run round the corners over the ends of the x faces."""
        gaps = gaps or {}
        for facing, plane, half in (("+z", hz, hx), ("-z", hz, hx), ("+x", hx, hz), ("-x", hx, hz)):
            if facing not in faces:
                continue
            ext = self.U("+z", proud) if facing in ("+z", "-z") else 0.0
            self.bricks(facing, plane, -half, half, v0, v1, cx, cz, gaps=gaps.get(facing, ()), kind=kind, proud=proud, tones=tones, span_ext=ext, seed=len(facing) + ord(facing[0]))

    def quoins(self, hx, hz, y0, y1, proj=0.024, height=0.23, long_=0.48, short=0.28, mat="trim", cx=0.0, cz=0.0, corners=None):
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
                    if corners is not None and (sx, sz) not in corners:
                        continue
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


    def profile(self, facing, plane, u0, u1, v, prof, mat, cx=0.0, cz=0.0, caps=True, skip=()):
        """The side profile `prof`, [(out, up)] in metres from a base at `v`
        (unit space) on the wall, extruded along it from `u0` to `u1`: a
        sloped sill, a nosed step, a bracket, a moulding. `skip` lists the
        edge indexes to leave out (a buried back, a hidden foot)."""
        n = NORMAL[facing]
        a = ALONG[facing]
        P = lambda u, om, ym: fp(facing, plane, u, v + self.V(ym), self.O(facing, om), cx, cz)  # noqa: E731
        N = len(prof)
        area = sum(prof[i][0] * prof[(i + 1) % N][1] - prof[(i + 1) % N][0] * prof[i][1] for i in range(N))
        for i in range(N):
            if i in skip:
                continue
            (o0, y0), (o1, y1) = prof[i], prof[(i + 1) % N]
            if abs(o1 - o0) < 1e-9 and abs(y1 - y0) < 1e-9:
                continue
            e = (o1 - o0, y1 - y0)
            right = (e[1], -e[0])
            outn = right if area > 0 else (-right[0], -right[1])
            self.quad([P(u0, o0, y0), P(u1, o0, y0), P(u1, o1, y1), P(u0, o1, y1)], mat, (n[0] * outn[0], outn[1], n[2] * outn[0]))
        if caps:
            self.quad([P(u0, *q) for q in prof], mat, (-a[0], 0, -a[2]))
            self.quad([P(u1, *q) for q in prof], mat, a)

    def finial(self, x, z, y, mat="metal", h=0.32, r=0.05):
        """A ridge finial: a tapering foot, a bead, a ball and a spike."""
        self.cyl(x, z, y, y + self.V(h * 0.22), r, mat, n=8, top=True, r1=r * 1.5)
        self.cyl(x, z, y + self.V(h * 0.22), y + self.V(h * 0.3), r * 0.5, mat, n=8, top=False)
        self.cyl(x, z, y + self.V(h * 0.3), y + self.V(h * 0.46), r * 1.05, mat, n=8, top=False, r1=r * 0.55)
        self.cyl(x, z, y + self.V(h * 0.46), y + self.V(h * 0.62), r * 1.05, mat, n=8, top=False, r1=r * 1.05)
        self.cyl(x, z, y + self.V(h * 0.62), y + self.V(h * 0.72), r * 0.55, mat, n=8, top=False, r1=r * 1.05)
        self.cyl(x, z, y + self.V(h * 0.72), y + self.V(h), 0.008, mat, n=6, top=True, r1=r * 0.5)

    def house_number(self, facing, plane, u, v, digits=2, cx=0.0, cz=0.0, plate="frame", ink="doorDark", seed=0):
        """An enamel plate with raised digits: plate and each stroke a box."""
        w, h = 0.065 * digits + 0.04, 0.11
        plate_o = self.O(facing, 0.022)
        W = lambda a0, a1, b0, b1, o0, o1, m, sk=("back",): self.wbox(facing, plane, a0, a1, b0, b1, o0, o1, m, cx, cz, sk)  # noqa: E731
        W(u - self.U(facing, w / 2), u + self.U(facing, w / 2), v - self.V(h / 2), v + self.V(h / 2), 0.0, plate_o, plate)
        for k in range(digits):
            du = (k - (digits - 1) / 2) * 0.065
            uc = u + self.U(facing, du)
            sw = self.U(facing, 0.012)
            o0, o1 = plate_o, plate_o + self.O(facing, 0.024)
            shape = (seed + k * 3) % 4
            # A tall stroke, plus a cross bar or a foot: enough to read as a digit at a glance.
            W(uc - self.U(facing, 0.014) - sw, uc - self.U(facing, 0.014), v - self.V(0.035), v + self.V(0.035), o0, o1, ink, ("back", "bottom"))
            if shape < 2:
                W(uc + self.U(facing, 0.014), uc + self.U(facing, 0.014) + sw, v - self.V(0.035), v + self.V(0.035), o0, o1, ink, ("back", "bottom"))
            W(uc - self.U(facing, 0.014), uc + self.U(facing, 0.014), v + self.V(0.035) - self.V(0.012), v + self.V(0.035), o0, o1, ink, ("back", "left", "right"))
            if shape % 2 == 0:
                W(uc - self.U(facing, 0.014), uc + self.U(facing, 0.014), v - self.V(0.006), v + self.V(0.006), o0, o1, ink, ("back", "left", "right"))

    def lamp(self, facing, plane, u, v, cx=0.0, cz=0.0, arm=0.09, metal="metal", glass="window", cap="metal"):
        """A wall lantern on a bracket: back plate, arm, a glass box and a cap."""
        U, V, O = (lambda m: self.U(facing, m)), self.V, (lambda m: self.O(facing, m))  # noqa: E731
        W = lambda a0, a1, b0, b1, o0, o1, m, sk=("back",): self.wbox(facing, plane, a0, a1, b0, b1, o0, o1, m, cx, cz, sk)  # noqa: E731
        W(u - U(0.03), u + U(0.03), v - V(0.09), v + V(0.09), 0.0, O(0.024), metal)
        W(u - U(0.012), u + U(0.012), v + V(0.02), v + V(0.045), O(0.024), O(arm), metal)
        W(u - U(0.05), u + U(0.05), v - V(0.11), v - V(0.03), O(arm - 0.03), O(arm + 0.09), glass)
        W(u - U(0.06), u + U(0.06), v - V(0.03), v - V(0.005), O(arm - 0.04), O(arm + 0.1), cap)
        W(u - U(0.035), u + U(0.035), v - V(0.005), v + V(0.02), O(arm - 0.01), O(arm + 0.07), cap)
        W(u - U(0.058), u + U(0.058), v - V(0.14), v - V(0.11), O(arm - 0.04), O(arm + 0.1), metal, ("back", "top"))

    def _bowl(self, hub, facing, r, dep, feed, bowl, back, tilt=0.42):
        """The dish itself, at `hub` (unit space), facing `facing` and tilted up."""
        n = 8
        nrm = NORMAL[facing]
        al = ALONG[facing]
        f = (nrm[0], tilt, nrm[2])
        fl = math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2)
        f = (f[0] / fl, f[1] / fl, f[2] / fl)
        up = (f[1] * al[2] - f[2] * al[1], f[2] * al[0] - f[0] * al[2], f[0] * al[1] - f[1] * al[0])
        ul = math.sqrt(sum(c * c for c in up))
        up = tuple(c / ul for c in up)
        if up[1] < 0:
            up = tuple(-c for c in up)
        toU = lambda vec: (vec[0] / self.sx, vec[1] / self.sy, vec[2] / self.sz)  # noqa: E731
        add = lambda a, b, k=1.0: (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)  # noqa: E731
        rim, core = [], []
        for k in range(n):
            t = 2 * math.pi * k / n + math.pi / n
            vec = tuple(r * (math.cos(t) * al[i] + math.sin(t) * up[i]) + dep * f[i] for i in range(3))
            rim.append(add(hub, toU(vec)))
            vec = tuple(0.035 * (math.cos(t) * al[i] + math.sin(t) * up[i]) + 0.004 * f[i] for i in range(3))
            core.append(add(hub, toU(vec)))
        self.quad(core, bowl, f)
        self.quad(core[::-1], back, (-f[0], -f[1], -f[2]))
        for k in range(n):
            j = (k + 1) % n
            self.quad([core[k], core[j], rim[j], rim[k]], bowl, f)
            self.quad([core[j], core[k], rim[k], rim[j]], back, (-f[0], -f[1], -f[2]))
        tip = add(hub, toU(tuple(f[i] * (dep + feed) for i in range(3))))

        def stick(a, b, half, cap):
            w = toU(tuple(al[i] * half for i in range(3)))
            h_ = toU(tuple(up[i] * half for i in range(3)))
            A = [add(add(a, w, sx_), h_, sy_) for sx_, sy_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            B = [add(add(b, w, sx_), h_, sy_) for sx_, sy_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            for i in range(4):
                j = (i + 1) % 4
                mid = tuple((A[i][c] + A[j][c]) / 2 - a[c] for c in range(3))
                self.quad([A[i], A[j], B[j], B[i]], back, mid)
            self.quad(B, back, cap)
        stick(add(hub, toU(tuple(f[i] * 0.02 for i in range(3)))), add(tip, toU(tuple(f[i] * 0.02 for i in range(3)))), 0.008, f)
        # The LNB: a fatter cap at the arm's tip.
        stick(add(tip, toU(tuple(f[i] * 0.03 for i in range(3)))), add(tip, toU(tuple(f[i] * 0.08 for i in range(3)))), 0.02, f)

    def dish(self, facing, plane, u, v, cx=0.0, cz=0.0, r=0.25, arm=0.12, feed=0.16, dep=0.08, bowl="frame", back="metal"):
        """A satellite dish on a short bracket from a wall: the bowl of eight
        petals tilted up, its feed arm and LNB."""
        hub = fp(facing, plane, u, v, self.O(facing, arm), cx, cz)
        self.wbox(facing, plane, u - self.U(facing, 0.02), u + self.U(facing, 0.02), v - self.V(0.05), v + self.V(0.02), 0.0, self.O(facing, arm - 0.03), back, cx, cz, skip=("back",))
        self._bowl(hub, facing, r, dep, feed, bowl, back)

    def dish_roof(self, facing, x, y, z, r=0.3, mast=0.5, feed=0.2, dep=0.1, bowl="frame", back="metal"):
        """A dish on a mast standing on a roof, aimed towards `facing`."""
        self.cyl(x, z, y, y + self.V(mast), 0.022, back, n=6, top=False)
        self.cyl(x, z, y, y + self.V(0.03), 0.09, back, n=8, top=True)
        self._bowl((x, y + self.V(mast), z), facing, r, dep, feed, bowl, back)

    def ac_unit(self, x, z, y, w=0.9, d=0.45, h=0.5, mat="metal", dark="railing", grille="glass"):
        """A roof air-conditioning unit: a casing on four feet, louvres down
        the front (+z), a fan grille with crossed bars in the top and a
        refrigerant pipe off the back. `x, z, y` its centre and base (unit)."""
        hx, hz = self.X(w) / 2, self.Z(d) / 2
        foot = self.V(0.06)
        for sx in (-1, 1):
            for sz in (-1, 1):
                fx, fz = x + sx * (hx - self.X(0.06)), z + sz * (hz - self.Z(0.06))
                self.box(fx - self.X(0.04), fx + self.X(0.04), y, y + foot, fz - self.Z(0.04), fz + self.Z(0.04), dark, skip=("bottom",))
        b0 = y + foot
        top = b0 + self.V(h)
        self.box(x - hx, x + hx, b0, top, z - hz, z + hz, mat, skip=("bottom",))
        # Louvres across the front, standing off the casing.
        for k in range(6):
            v = b0 + self.V(0.06) + self.V((h - 0.14) * k / 5)
            self.box(x - hx + self.X(0.05), x + hx - self.X(0.05), v, v + self.V(0.022), z + hz, z + hz + self.Z(0.03), dark, skip=("back", "left", "right", "bottom"))
        # The fan well in the top: a dark disc a little proud, and crossed bars over it.
        r_ = min(w, d) * 0.4
        self.cyl(x, z, top, top + self.V(0.03), r_, grille, n=12, top=True)
        bx, bz = self.X(r_), self.Z(r_)
        hw, gap = 0.012, self.V(0.03)
        self.box(x - bx, x + bx, top + gap, top + gap + self.V(0.025), z - self.Z(hw), z + self.Z(hw), dark, skip=("bottom",))
        for a, b in ((z - bz, z - self.Z(hw)), (z + self.Z(hw), z + bz)):
            self.box(x - self.X(hw), x + self.X(hw), top + gap, top + gap + self.V(0.025), a, b, dark, skip=("bottom",))
        # Two pipes off the back.
        for off in (-0.08, 0.05):
            self.cyl(x + self.X(off), z - hz - self.Z(0.06), b0 + self.V(0.05), b0 + self.V(0.3), 0.022, dark, n=6, top=True)

    def bargeboard(self, ridge, a_plane, half_b, eave_y, ridge_y, mat="trim", cx=0.0, cz=0.0, drop=0.16, thick=0.03, tooth=0.34, top_lift=0.008, lap=0.0, eave_short=0.04):
        """The bargeboards on both verges of a gable roof whose ridge runs
        along `ridge` ("x" or "z"): a board a `drop` deep following each
        slope on the outside of the verge, with a sawtooth of pendants along
        its foot and a long one at the apex. `a_plane` is the verge's
        distance from the centre along the ridge, `half_b` the eave's across."""
        slope = lambda b: ridge_y - (ridge_y - eave_y) * abs(b) / half_b  # noqa: E731
        along_x = ridge == "x"
        T_ = self.O("+x" if along_x else "+z", thick)
        Vd = self.V(drop)
        for end in (1, -1):
            a0, a1 = end * (a_plane + self.O('+x' if along_x else '+z', 0.006)), end * (a_plane + T_ + self.O('+x' if along_x else '+z', 0.006))
            def pt(a, b, y):
                return (cx + a, y, cz + b) if along_x else (cx + b, y, cz + a)
            out = (end, 0, 0) if along_x else (0, 0, end)
            for s in (1, -1):
                # The board's top follows the slope, its foot a drop below.
                top = lambda b: slope(b) + top_lift + lap  # noqa: E731
                b_eave = s * (half_b - (self.Z if along_x else self.X)(eave_short))
                self.quad([pt(a1, 0, top(0) - Vd), pt(a1, b_eave, top(b_eave) - Vd), pt(a1, b_eave, top(b_eave)), pt(a1, 0, top(0))], mat, out)
                # The top edge and the foot edge, thin faces along the board.
                self.quad([pt(a0, 0, top(0)), pt(a1, 0, top(0)), pt(a1, b_eave, top(b_eave)), pt(a0, b_eave, top(b_eave))], mat, (0, 1, 0.4 * s) if along_x else (0.4 * s, 1, 0))
                self.quad([pt(a0, 0, top(0) - Vd), pt(a1, 0, top(0) - Vd), pt(a1, b_eave, top(b_eave) - Vd), pt(a0, b_eave, top(b_eave) - Vd)], mat, (0, -1, 0))
                # Its inner face, over the verge (seen through the gap above the slates).
                self.quad([pt(a0, 0, top(0) - Vd), pt(a0, 0, top(0)), pt(a0, b_eave, top(b_eave)), pt(a0, b_eave, top(b_eave) - Vd)], mat, (-out[0], 0, -out[2]))
                # The eave end.
                self.quad([pt(a0, b_eave, top(b_eave) - Vd), pt(a1, b_eave, top(b_eave) - Vd), pt(a1, b_eave, top(b_eave)), pt(a0, b_eave, top(b_eave))], mat, (0, 0, s) if along_x else (s, 0, 0))
                # Pendants: pointed teeth hanging from the foot.
                span_m = half_b * (self.sz if along_x else self.sx)
                n = max(3, int(span_m / tooth))
                for k in range(n):
                    b0, b1 = s * half_b * (k + 0.15) / n, s * half_b * (k + 0.85) / n
                    if k == 0:
                        continue
                    bm = (b0 + b1) / 2
                    self.quad([pt(a1, b0, top(b0) - Vd), pt(a1, b1, top(b1) - Vd), pt(a1, bm, top(bm) - Vd - self.V(0.09))], mat, out)
                    self.quad([pt(a0, b0, top(b0) - Vd), pt(a0, bm, top(bm) - Vd - self.V(0.09)), pt(a0, b1, top(b1) - Vd)], mat, (-out[0], 0, -out[2]))
            # The apex pendant: a long spike where the boards meet.
            wb = (self.Z if along_x else self.X)(0.07)
            yf = lambda b: top(b) - Vd  # noqa: E731
            self.quad([pt(a1, -wb, yf(wb)), pt(a1, wb, yf(wb)), pt(a1, 0, yf(0) - self.V(0.32))], mat, out)
            self.quad([pt(a0, -wb, yf(wb)), pt(a0, 0, yf(0) - self.V(0.32)), pt(a0, wb, yf(wb))], mat, (-out[0], 0, -out[2]))

    def hopper(self, facing, plane, u, y, cx=0.0, cz=0.0, mat="metal"):
        """A rainwater hopper head where a gutter meets its downpipe: a
        box on a short spout under a wider rim, hung `y` (its rim's top)."""
        U, V, O = (lambda m: self.U(facing, m)), self.V, (lambda m: self.O(facing, m))  # noqa: E731
        W = lambda a0, a1, b0, b1, o0, o1, m, sk=("back",): self.wbox(facing, plane, a0, a1, b0, b1, o0, o1, m, cx, cz, sk)  # noqa: E731
        W(u - U(0.09), u + U(0.09), y - V(0.15), y - V(0.03), 0.0, O(0.11), mat, ("back", "top"))
        W(u - U(0.105), u + U(0.105), y - V(0.03), y, 0.0, O(0.135), mat, ("back", "bottom"))
        W(u - U(0.05), u + U(0.05), y - V(0.24), y - V(0.15), O(0.02), O(0.08), mat, ("back", "top"))

    def window_box(self, facing, plane, u0, u1, v_top, cx=0.0, cz=0.0, box="door", soil="doorDark", plants=("leaf", "leaf", "bloom"), seed=1):
        """A trough on the wall under a sill with plants heaped in it: the
        box, a cleat at each end, and clusters of pyramids for the foliage."""
        U, V, O = (lambda m: self.U(facing, m)), self.V, (lambda m: self.O(facing, m))  # noqa: E731
        W = lambda a0, a1, b0, b1, o0, o1, m, sk=("back",): self.wbox(facing, plane, a0, a1, b0, b1, o0, o1, m, cx, cz, sk)  # noqa: E731
        depth = O(0.17)
        bot = v_top - V(0.17)
        W(u0, u1, bot, v_top, 0.0, depth, box, ("back", "top"))
        # The compost, a hair below the rim, then the plants.
        W(u0 + U(0.02), u1 - U(0.02), v_top - V(0.02), v_top - V(0.015), O(0.02), depth - O(0.02), soil, ("back", "bottom", "left", "right", "front"))
        rng = (seed * 7919) % 97
        span = (u1 - u0)
        spanm = span * (self.sx if facing in ("+z", "-z") else self.sz)
        count = max(3, int(spanm / 0.11))
        P = lambda u, v, o: fp(facing, plane, u, v, o, cx, cz)  # noqa: E731
        for k in range(count):
            uc = u0 + span * (k + 0.5) / count
            mat = plants[(k + rng) % len(plants)]
            hsh = ((k * 5 + rng) % 7) / 6
            h = 0.08 + 0.07 * hsh
            rr = min(0.07, spanm / count * 0.62) * (0.85 + 0.3 * (((k * 3 + rng) % 4) / 3))
            o_c = 0.085 + (((k * 2 + rng) % 3) - 1) * 0.012
            ring = lambda r_, v_, ph=0.0: [P(uc + self.U(facing, r_) * math.cos(ph + math.pi * a / 3), v_, self.O(facing, o_c + r_ * math.sin(ph + math.pi * a / 3))) for a in range(6)]  # noqa: E731
            base = ring(rr, v_top - self.V(0.012))
            mid = ring(rr * 1.0, v_top + self.V(h * 0.5), 0.3)
            apex = P(uc, v_top + self.V(h), self.O(facing, o_c))
            cen = P(uc, v_top, self.O(facing, o_c))
            for a in range(6):
                b = (a + 1) % 6
                m1 = tuple((base[a][c] + base[b][c]) / 2 - cen[c] for c in range(3))
                self.quad([base[a], base[b], mid[b], mid[a]], mat, (m1[0], 0.3, m1[2]))
                m2 = tuple((mid[a][c] + mid[b][c]) / 2 - cen[c] for c in range(3))
                self.quad([mid[a], mid[b], apex], mat, (m2[0], 0.9, m2[2]))
            if len(plants) > 1 and (k + rng) % 3 == 0:
                # A bloom on a stalk of leaf: a little pyramid on the crown.
                bl = self.V(0.035)
                bw = self.U(facing, 0.03)
                bz = self.O(facing, 0.03)
                top = P(uc, v_top + self.V(h) + bl, self.O(facing, o_c))
                sq = [P(uc + s_ * bw, v_top + self.V(h) - self.V(0.005), self.O(facing, o_c) + t_ * bz) for s_, t_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                for a in range(4):
                    b = (a + 1) % 4
                    mm = tuple((sq[a][c] + sq[b][c]) / 2 - apex[c] for c in range(3))
                    self.quad([sq[a], sq[b], top], "bloom", (mm[0], 0.6, mm[2]))

    # -- windows ----------------------------------------------------------------

    def window(self, facing, plane, o, cx=0.0, cz=0.0, fw=0.05, bars=None, sill=0.09, lintel=True, jambs=True,
               shutters=False, frame="frame", trim="trim", bar_m=0.026, sash="frame", ring=None, back=None, sill_ext=0.085,
               deep=None, keystone=True, lintel_ext=0.1, rail=True, soldier=None, box=None, arch=True, lite=False):
        """The dressing of one opening `o` (u, v, w, h, depth as the lean
        script gave them): a frame and glazing bars standing in front of the
        glass without touching the rectangle the lit window draws on, a
        meeting rail with its horns, a sloped sill on an apron, a head of
        jointed stones (`arch`) with a keystone or a plain lintel, an
        architrave, a course of soldier bricks over the head (`soldier`, a
        pair of materials) and a planted box under the sill (`box`)."""
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
        meet = rows // 2 if (rail and rows >= 2) else 0
        rail_d = self.O(facing, 0.016)
        for k in range(1, rows):
            v = iv0 + (iv1 - iv0) * k / rows
            half = self.V(0.022) if k == meet else bv
            for c in range(cols):
                a = iu0 + (iu1 - iu0) * c / cols + (bu if c else 0)
                b = iu0 + (iu1 - iu0) * (c + 1) / cols - (bu if c < cols - 1 else 0)
                if k == meet:
                    # The meeting rail stands a little proud of the bars, and
                    # carries the top sash's horns at its ends.
                    W(a, b, v - half, v + half, g, g + bd + rail_d, sash, ("back", "left", "right"))
                else:
                    W(a, b, v - half, v + half, g, g + bd, sash, ("back", "left", "right"))
            if k == meet:
                hp = self.O(facing, 0.024)
                for a, b in ((iu0, iu0 + self.U(facing, 0.03)), (iu1 - self.U(facing, 0.03), iu1)):
                    W(a, b, v - half - self.V(0.06), v - half, g + bd, g + bd + hp, sash, ("back", "top"))
        # The architrave: two steps of moulding round the frame, standing
        # off the wall by more than a layer each.
        ext = self.U(facing, 0.06)
        if jambs:
            gap = self.U(facing, 0.02)
            in_ = self.U(facing, 0.026)
            W(u0 - ext, u0 - gap, v0, v1, 0.0, self.O(facing, 0.024), trim, ("back", "top", "bottom"))
            W(u1 + gap, u1 + ext, v0, v1, 0.0, self.O(facing, 0.024), trim, ("back", "top", "bottom"))
            if not lite:
                W(u0 - gap - in_, u0 - gap, v0, v1, self.O(facing, 0.024), self.O(facing, 0.048), trim, ("back", "top", "bottom"))
                W(u1 + gap, u1 + gap + in_, v0, v1, self.O(facing, 0.024), self.O(facing, 0.048), trim, ("back", "top", "bottom"))
        if sill:
            sext = self.U(facing, sill_ext)
            S = sill
            # A sloped stone sill (its top drains outward) on a corbelled apron.
            self.profile(facing, plane, u0 - sext, u1 + sext, v0, [(0, -0.06), (S, -0.06), (S, -0.03), (0, 0.0)], trim, cx, cz, skip=(3,))
            a_ext = self.U(facing, max(0.0, sill_ext - 0.03))
            if not lite:
                W(u0 - a_ext, u1 + a_ext, v0 - self.V(0.1), v0 - self.V(0.06), 0.0, self.O(facing, 0.035), trim, ("back", "top"))
        top = v1
        if lintel:
            lext = self.U(facing, lintel_ext)
            lh = self.V(0.14)
            if arch:
                self.voussoirs(facing, plane, u0 - lext, u1 + lext, v1, lh, trim, cx, cz, keystone=keystone, stones=5 if lite else None)
            else:
                W(u0 - lext, u1 + lext, v1, v1 + lh, 0.0, self.O(facing, 0.03), trim)
                if keystone:
                    kw = self.U(facing, 0.09)
                    W(o["u"] - kw, o["u"] + kw, v1, v1 + self.V(0.21), self.O(facing, 0.03), self.O(facing, 0.058), trim)
            top = v1 + lh + (self.V(0.07) if keystone else 0.0)
        if soldier:
            self.soldiers(facing, plane, u0 - self.U(facing, lintel_ext), u1 + self.U(facing, lintel_ext), top, soldier, cx, cz)
        if box:
            self.window_box(facing, plane, u0 - self.U(facing, 0.02), u1 + self.U(facing, 0.02), v0 - self.V(0.1) - self.V(0.005), cx, cz, **(box if isinstance(box, dict) else {}))
        if shutters:
            sw = self.U(facing, shutters if isinstance(shutters, float) else min(0.42, wm * 0.5))
            for side, (a, b) in ((-1, (u0 - ext - sw, u0 - ext)), (1, (u1 + ext, u1 + ext + sw))):
                self.shutter(facing, plane, a, b, v0 - self.V(0.06), v1 + self.V(0.02), cx, cz, frame=frame)

    def voussoirs(self, facing, plane, u0, u1, v, height, mat, cx=0.0, cz=0.0, keystone=True, stones=None):
        """A flat arch of jointed stones over `u0..u1`: wedges, wider at the
        top, alternately proud, the middle one a taller keystone."""
        width_m = (u1 - u0) * (self.sx if facing in ("+z", "-z") else self.sz)
        n = max(5, int(width_m / 0.13) | 1)
        n = stones or min(n, 9)
        mid = (u0 + u1) / 2
        lean = self.U(facing, 0.018)
        P = lambda u, vv, oo: fp(facing, plane, u, vv, oo, cx, cz)  # noqa: E731
        nrm = NORMAL[facing]
        a = ALONG[facing]
        step = (u1 - u0) / n
        for k in range(n):
            ua, ub = u0 + step * k, u0 + step * (k + 1)
            keyed = keystone and k == n // 2
            v1 = v + height + (self.V(0.06) if keyed else 0.0)
            proud = self.O(facing, 0.045 if keyed else (0.036 if k % 2 else 0.028))
            # The joints lean towards the middle: each stone's foot is
            # narrower than its head, and neighbours agree on the joint.
            foot = lambda j: j + lean * (1 if j < mid - 1e-9 else -1 if j > mid + 1e-9 else 0)  # noqa: E731
            fa, fb = foot(ua), foot(ub)
            front = [P(fa, v, proud), P(fb, v, proud), P(ub, v1, proud), P(ua, v1, proud)]
            self.quad(front, mat, nrm)
            self.quad([P(ua, v1, 0.0), P(ub, v1, 0.0), P(ub, v1, proud), P(ua, v1, proud)], mat, (0, 1, 0))
            self.quad([P(fa, v, 0.0), P(fb, v, 0.0), P(fb, v, proud), P(fa, v, proud)], mat, (0, -1, 0))
            # Joints between neighbours of a height show only as the step in
            # their proud faces; the ends and the keystone's flanks show whole.
            if k == 0 or keyed or (keystone and k == n // 2 + 1):
                self.quad([P(fa, v, 0.0), P(ua, v1, 0.0), P(ua, v1, proud), P(fa, v, proud)], mat, (-a[0], 0, -a[2]))
            if k == n - 1 or keyed or (keystone and k == n // 2 - 1):
                self.quad([P(fb, v, 0.0), P(ub, v1, 0.0), P(ub, v1, proud), P(fb, v, proud)], mat, a)
            if 0 < k < n - 1 and not keyed:
                # The step to the taller neighbour on this side, a thin quad.
                nxt = self.O(facing, 0.036 if (k + 1) % 2 else 0.028)
                if nxt < proud:
                    self.quad([P(fb, v, nxt), P(ub, v1, nxt), P(ub, v1, proud), P(fb, v, proud)], mat, a)
                pv = self.O(facing, 0.036 if (k - 1) % 2 else 0.028)
                if pv < proud:
                    self.quad([P(fa, v, pv), P(ua, v1, pv), P(ua, v1, proud), P(fa, v, proud)], mat, (-a[0], 0, -a[2]))

    def soldiers(self, facing, plane, u0, u1, v, mats, cx=0.0, cz=0.0, brick=0.1, height=0.2, gap=0.012):
        """A soldier course: bricks on end side by side over a head, each a
        little proud, alternating two shades of brick."""
        width_m = (u1 - u0) * (self.sx if facing in ("+z", "-z") else self.sz)
        n = max(3, round(width_m / (brick + gap)))
        step = (u1 - u0) / n
        for k in range(n):
            ua = u0 + step * k + self.U(facing, gap) / 2
            ub = u0 + step * (k + 1) - self.U(facing, gap) / 2
            self.wbox(facing, plane, ua, ub, v, v + self.V(height), 0.0, self.O(facing, 0.03), mats[k % len(mats)], cx, cz, skip=("back", "bottom"))

    def corbel_course(self, hx, hz, y, mat="wallSoft", proj=0.03, brick=0.22, height=0.075, cx=0.0, cz=0.0, gap=0.03, faces=("+z", "-z", "+x", "-x"), inset=0.0, top=False):
        """A course of dentils: every other brick stands out from the wall,
        all the way round (the eaves' corbelled brick course)."""
        for facing, plane, half in (("+z", hz, hx), ("-z", hz, hx), ("+x", hx, hz), ("-x", hx, hz)):
            if facing not in faces:
                continue
            span = half - self.U(facing, 0.08) - inset
            n = max(2, int(2 * span * (self.sx if facing in ("+z", "-z") else self.sz) / (brick + gap)))
            step = 2 * span / n
            w = self.U(facing, brick) / 2
            for k in range(n):
                u = -span + step * (k + 0.5)
                self.wbox(facing, plane, u - w, u + w, y, y + self.V(height), 0.0, self.O(facing, proj), mat, cx, cz, skip=("back",) if top else ("back", "top"))

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

    def door(self, facing, plane, o, cx=0.0, cz=0.0, leaf="door", dark="doorDark", trim="trim", metal="metal", iron="railing",
             steps=True, surround=True, head=True, panels=(2, 3), step_reach=0.5, glazed=None, from_o=0.0, limit=0.53,
             knocker=True, hinges=True, number=None, scraper=True):
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
        if knocker:
            # A knocker on the top panel: a back plate, a boss and the striker hung below it.
            ky = v0 + (v1 - v0) * 0.8
            pz = g + pd + self.O(facing, 0.024)
            W(cu - self.U(facing, 0.03), cu + self.U(facing, 0.03), ky - self.V(0.06), ky + self.V(0.06), pz, pz + self.O(facing, 0.026), iron)
            W(cu - self.U(facing, 0.016), cu + self.U(facing, 0.016), ky + self.V(0.005), ky + self.V(0.04), pz + self.O(facing, 0.026), pz + self.O(facing, 0.052), iron)
            W(cu - self.U(facing, 0.013), cu + self.U(facing, 0.013), ky - self.V(0.05), ky - self.V(0.005), pz + self.O(facing, 0.026), pz + self.O(facing, 0.052), iron)
        if hinges:
            # Strap hinges on the hanging side, on the stile and standing well off it.
            for f in (0.16, 0.5, 0.84):
                hy = v0 + (v1 - v0) * f
                W(u0, u0 + st, hy - self.V(0.018), hy + self.V(0.018), g + pd, g + pd + self.O(facing, 0.05), iron, ("back", "left"))
        if surround:
            ext = self.U(facing, 0.1)
            W(u0 - ext, u0, v0, v1, 0.0, self.O(facing, 0.05), trim, ("back", "bottom"))
            W(u1, u1 + ext, v0, v1, 0.0, self.O(facing, 0.05), trim, ("back", "bottom"))
            if head:
                W(u0 - ext, u1 + ext, v1, v1 + self.V(0.16), 0.0, self.O(facing, 0.07), trim)
                W(u0 - ext - self.U(facing, 0.03), u1 + ext + self.U(facing, 0.03), v1 + self.V(0.16), v1 + self.V(0.2), 0.0, self.O(facing, 0.1), trim)
                # A little moulding under the cornice: a cyma shown as a stepped bead.
                W(u0 - ext, u1 + ext, v1 + self.V(0.16), v1 + self.V(0.19), self.O(facing, 0.1), self.O(facing, 0.122), trim, ("back", "bottom"))
            # Pilaster bases and capitals: a plinth block at each foot and a capital under the head.
            for a, b in ((u0 - ext - self.U(facing, 0.02), u0), (u1, u1 + ext + self.U(facing, 0.02))):
                if v0 > 1e-6:
                    W(a, b, v0, v0 + self.V(0.12), self.O(facing, 0.05), self.O(facing, 0.075), trim, ("back", "bottom"))
                W(a, b, v1 - self.V(0.1), v1, self.O(facing, 0.05), self.O(facing, 0.075), trim, ("back", "top"))
        if number is not None:
            self.house_number(facing, plane, o["u"], v1 + self.V(0.36) if head and surround else v1 + self.V(0.28), digits=number, cx=cx, cz=cz)
        if steps and v0 > 1e-6:
            top = v0
            top_m = top * self.sy
            # No further out than the lean model's own trim reaches.
            room = (limit - plane - from_o) * (self.sz if facing in ("+z", "-z") else self.sx)
            reach = max(0.12, min(step_reach, room))
            wide = self.U(facing, 0.14)
            ext = self.U(facing, 0.1) if surround else 0.0
            fo = from_o * (self.sz if facing in ("+z", "-z") else self.sx)
            self.steps_nosed(facing, plane, u0 - ext - wide, u1 + ext + wide, u0 - ext - wide * 2.4, u1 + ext + wide * 2.4, top, reach, fo, cx, cz)
            if scraper:
                # A boot scraper beside the step: a slotted blade between two posts on a base plate.
                su = u1 + ext + wide * 2.4 + self.U(facing, 0.3)
                base = self.O(facing, fo + 0.02)
                for dx in (-0.075, 0.075):
                    W(su + self.U(facing, dx) - self.U(facing, 0.008), su + self.U(facing, dx) + self.U(facing, 0.008), 0.0, self.V(0.16), base, base + self.O(facing, 0.036), iron, ("back", "bottom"))
                W(su - self.U(facing, 0.067), su + self.U(facing, 0.067), self.V(0.11), self.V(0.15), base, base + self.O(facing, 0.012), iron, ("back", "left", "right"))

    def steps_nosed(self, facing, plane, a0, a1, b0, b1, top, reach, fo=0.0, cx=0.0, cz=0.0, mat="trim"):
        """Two nosed treads up to `top` (unit space): a lip overhangs each
        riser and its arris is chamfered. `a0..a1` is the upper tread's
        width, `b0..b1` the lower's; `reach` and `fo` are metres."""
        top_m = top * self.sy
        if top_m < 0.1:
            self.wbox(facing, plane, a0, a1, 0.0, top, self.O(facing, fo), self.O(facing, fo + reach), mat, cx, cz, ("back",))
            return

        def tread(wa, wb, r0, r1, t_m):
            lip = 0.02
            self.profile(facing, plane, wa, wb, 0.0,
                         [(fo + r0, 0.0), (fo + r1, 0.0), (fo + r1, t_m - 0.045), (fo + r1 + lip, t_m - 0.045), (fo + r1 + lip, t_m - 0.014),
                          (fo + r1 + lip - 0.012, t_m), (fo + r0, t_m)], mat, cx, cz, skip=(6,))
        tread(a0, a1, 0.0, reach * 0.5, top_m)
        tread(b0, b1, reach * 0.5, reach - 0.02, top_m * 0.5)

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

    def oculus(self, facing, plane, u, v, r, mat="trim", fill="window", proud=0.05, cx=0.0, cz=0.0, n=14, band=0.09, bars=0, bar_mat="frame"):
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
        if bars:
            # Glazing bars across the light: one upright and a cross bar in two halves.
            bw, bd = self.U(facing, 0.03), self.O(facing, 0.05)
            W = lambda a0, a1, b0, b1, m, sk: self.wbox(facing, plane, a0, a1, b0, b1, self.O(facing, 0.024), bd, m, cx, cz, sk)  # noqa: E731
            W(u - bw / 2, u + bw / 2, v - rv + self.V(0.02), v + rv - self.V(0.02), bar_mat, ("back",))
            W(u - ru + self.U(facing, 0.02), u - bw / 2, v - self.V(0.015), v + self.V(0.015), bar_mat, ("back", "right"))
            W(u + bw / 2, u + ru - self.U(facing, 0.02), v - self.V(0.015), v + self.V(0.015), bar_mat, ("back", "left"))
