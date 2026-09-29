"""
Near level of the village barn (see barn.py): the lean script's own boards,
battens, doors, gambrel roof, cupola and silo with the near builders from
snear.py for its windows, plus boards with V-grooves between them (each a
shade of the paint), battens on the gable walls, trim boards, strap hinges and a
track on the big doors and round the hay hatch, a ridge cap, gutters and
downpipes, a vane on the cupola, and a ladder up the silo.

    blender -b --python blender/export.py -- blender/settlement/near_barn.py barn-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import barn as lean  # noqa: E402
import kit  # noqa: E402
import skit  # noqa: E402
import snear  # noqa: E402

SCALE = (4.4, 6.0, 4.8)


def board_wall(m, facing, plane, u0, u1, v0, v1, holes, mat, cx=0.0, cz=0.0, cuts=()):
    """The lean wall as boards: vertical strips a foot wide, each a slightly
    different shade of the barn's paint, with a V-groove between neighbours,
    cut round the openings and every metre or so up so the occlusion can
    follow the battens and sills."""
    d = snear.det(m)
    hs = [h for h in holes if h.u1 > u0 and h.u0 < u1 and h.v1 > v0 and h.v0 < v1]
    n = max(2, round((u1 - u0) / d.U(facing, 0.16)))
    step = (u1 - u0) / n
    gw = d.U(facing, 0.024)
    gd = d.O(facing, 0.022)
    tones = ["wall", "wallShade", "wall", "wallDeep", "wallShade", "wall", "wallShade", "wallDeep", "wall"]
    cell = d.V(1.0)
    P = lambda u, v, o: skit.on(facing, plane, u, v, o, cx, cz)  # noqa: E731
    out = skit.NORMAL[facing]

    def spans(ua, ub):
        """The solid stretches of the wall between heights, at columns ua..ub."""
        cut = {v0, v1, *[c for c in cuts if v0 < c < v1]}
        for h in hs:
            if h.u0 < ub and h.u1 > ua:
                cut |= {x for x in (h.v0, h.v1) if v0 < x < v1}
        cut = sorted(cut)
        for va, vb in zip(cut, cut[1:]):
            mv = (va + vb) / 2
            if any(h.u0 < (ua + ub) / 2 < h.u1 and h.v0 < mv < h.v1 for h in hs):
                continue
            k = max(1, round((vb - va) / cell))
            for i in range(k):
                yield va + (vb - va) * i / k, va + (vb - va) * (i + 1) / k

    def grooves(k):
        """Is the line between boards k - 1 and k a clean groove (no hole either side)?"""
        u = u0 + step * k
        return not any(h.u0 - gw < u < h.u1 + gw for h in hs)

    for k in range(n):
        ua, ub = u0 + step * k, u0 + step * (k + 1)
        tone = M_[tones[(k * 5 + (k // 3)) % len(tones)]]
        lo = ua + (gw / 2 if 0 < k and grooves(k) else 0.0)
        hi = ub - (gw / 2 if k < n - 1 and grooves(k + 1) else 0.0)
        # The board's own face, cut at every hole edge inside it.
        us = sorted({lo, hi, *[x for h in hs for x in (h.u0, h.u1) if lo < x < hi]})
        for a, b in zip(us, us[1:]):
            for va, vb in spans(a, b):
                m.rect(facing, plane, a, b, va, vb, tone, cx=cx, cz=cz)
        if k and grooves(k):
            for va, vb in spans(ua - gw, ua + gw):
                m.face([P(ua - gw / 2, va, 0), P(ua, va, -gd), P(ua, vb, -gd), P(ua - gw / 2, vb, 0)], tone, out=(-1 * 0 + out[0] * 0.5 + skit.ALONG[facing][0] * 0.6, 0, out[2] * 0.5 + skit.ALONG[facing][2] * 0.6))
                m.face([P(ua, va, -gd), P(ua + gw / 2, va, 0), P(ua + gw / 2, vb, 0), P(ua, vb, -gd)], tone, out=(out[0] * 0.5 - skit.ALONG[facing][0] * 0.6, 0, out[2] * 0.5 - skit.ALONG[facing][2] * 0.6))


def gable_boards(m, M, end, hole=None):
    """The gable end above the wall plate in vertical boards, as the walls
    below are, each ending on the gambrel's outline, a V-groove between
    neighbours and the hay hatch (`hole`) left open."""
    d = snear.det(m)
    facing = "+z" if end > 0 else "-z"
    z = end * lean.HALF_D
    X = lambda u: lean.CX + u * end  # noqa: E731
    ya = lean.AT_WALL
    kn, kv = lean.KNEE
    ridge = lean.RIDGE_Y - 0.006
    tones = ["wall", "wallShade", "wall", "wallDeep", "wallShade", "wall", "wallShade", "wallDeep", "wall"]

    def top(u):
        u = abs(u)
        if u <= kn:
            return ridge - u * (ridge - kv) / kn
        return ya + (lean.HALF_W - u) * (kv - ya) / (lean.HALF_W - kn)

    n = max(4, round(2 * lean.HALF_W / d.U(facing, 0.16)))
    step = 2 * lean.HALF_W / n
    gw = d.U(facing, 0.024) / 2
    gd = d.O(facing, 0.022)
    out = (0, 0, end)
    for k in range(n):
        ua, ub = -lean.HALF_W + step * k, -lean.HALF_W + step * (k + 1)
        la = ua + (gw if k else 0.0)
        lb = ub - (gw if k < n - 1 else 0.0)
        tone = M[tones[(k * 5 + k // 3) % len(tones)]]
        cuts = [u for u in (-kn, 0.0, kn) if la < u < lb]
        bounds = sorted({la, lb, *cuts, *([x for x in (hole.u0, hole.u1) if la < x < lb] if hole else [])})
        for a, b in zip(bounds, bounds[1:]):
            head = [(u, top(u)) for u in [a] + [c for c in cuts if a < c < b] + [b]]
            if hole and hole.u0 - 1e-9 <= a and b <= hole.u1 + 1e-9:
                lo, hi = hole.v0, hole.v1
                if lo > ya:
                    m.face([(X(a), ya, z), (X(b), ya, z), (X(b), lo, z), (X(a), lo, z)], tone, out=out)
                m.face([(X(a), hi, z), (X(b), hi, z)] + [(X(u), y, z) for u, y in reversed(head)], tone, out=out)
            else:
                m.face([(X(a), ya, z), (X(b), ya, z)] + [(X(u), y, z) for u, y in reversed(head)], tone, out=out)
        if k and not (hole and hole.u0 - gw < ua < hole.u1 + gw):
            P = lambda u, y, o: (X(u), y, z + end * o)  # noqa: E731
            # Up to the boards' heads, so no slit shows the roof's underside.
            m.face([P(ua - gw, ya, 0), P(ua, ya, -gd), P(ua, top(ua), -gd), P(ua - gw, top(ua - gw), 0)], tone, out=(0.6 * end, 0, 0.5 * end))
            m.face([P(ua, ya, -gd), P(ua + gw, ya, 0), P(ua + gw, top(ua + gw), 0), P(ua, top(ua), -gd)], tone, out=(-0.6 * end, 0, 0.5 * end))


def near_roof(m, M):
    """The lean gambrel with a standing seam every 7 cm folded up out of the
    sheet: a closed rib, a narrow crown over a wider foot, its ends capped."""
    t = 0.028
    rz = lean.HALF_D + 0.03
    roof_m = M["barnRoof"]
    CX = lean.CX
    for side in (1, -1):
        for (xa, ya), (xb, yb) in ((lean.EAVE, lean.KNEE), (lean.KNEE, (0.0, lean.RIDGE_Y))):
            profile = [(CX + side * xa, ya), (CX + side * xb, yb), (CX + side * xb, yb - t), (CX + side * xa, ya - t)]
            m.prism_z(profile, -rz, rz, roof_m)
        pts = [(lean.EAVE[0], lean.EAVE[1]), (lean.KNEE[0], lean.KNEE[1]), (0.03, lean.RIDGE_Y - 0.03 * (lean.RIDGE_Y - lean.KNEE[1]) / lean.KNEE[0])]
        seams = 13
        h, hz = 0.011, 0.0045
        for k in range(seams):
            zc = -rz + 0.03 + (2 * rz - 0.06) * (k + 0.5) / seams
            for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
                dx, dy = xb - xa, yb - ya
                ln = math.hypot(dx, dy)
                nx, ny = -dy / ln * side, dx / ln
                if ny < 0:
                    nx, ny = -nx, -ny
                ax, bx = CX + side * xa, CX + side * xb
                for sgn in (-1, 1):
                    m.face([(ax, ya, zc + sgn * hz), (bx, yb, zc + sgn * hz), (bx + nx * h, yb + ny * h, zc + sgn * hz * 0.5), (ax + nx * h, ya + ny * h, zc + sgn * hz * 0.5)],
                           roof_m, out=(nx * 0.3, ny * 0.3, sgn))
                m.face([(ax + nx * h, ya + ny * h, zc - hz * 0.5), (bx + nx * h, yb + ny * h, zc - hz * 0.5),
                        (bx + nx * h, yb + ny * h, zc + hz * 0.5), (ax + nx * h, ya + ny * h, zc + hz * 0.5)], roof_m, out=(nx, ny, 0))
                for x_, y_, e in ((ax, ya, -1), (bx, yb, 1)):
                    m.face([(x_, y_, zc - hz), (x_, y_, zc + hz), (x_ + nx * h, y_ + ny * h, zc + hz * 0.5), (x_ + nx * h, y_ + ny * h, zc - hz * 0.5)],
                           roof_m, out=(dx / ln * e * side, dy / ln * e, 0))


M_ = {}


def extras(m):
    d = snear.det(m)
    CX, HD, HW = lean.CX, lean.HALF_D, lean.HALF_W
    # Battens up the gable walls, stopping round the doors and the hatch.
    for face in ("+z", "-z"):
        for i in range(7):
            u = -HW + 0.06 + i * ((HW * 2 - 0.12) / 6)
            if abs(u) < (0.2 if face == "+z" else 0.13):
                continue
            top = lean.AT_WALL - 0.01
            d.wbox(face, HD, u - d.U(face, 0.03), u + d.U(face, 0.03), lean.PLINTH, top, 0.0, d.O(face, 0.03), "stoneDark", CX, 0.0, skip=("back", "top", "bottom"))
    # The big doors: strap hinges on each leaf and a track above.
    for s in (-1, 1):
        for v in (lean.PLINTH + 0.07, lean.PLINTH + 0.27):
            u0, u1 = (0.0, 0.14) if s > 0 else (-0.14, 0.0)
            d.wbox("+z", HD, u0 + d.U("+z", 0.0) - d.U("+z", 0.0), u1, v - d.V(0.04), v + d.V(0.04), 0.0, d.O("+z", 0.045), "railing", CX, 0.0, skip=("back",))
    d.wbox("+z", HD, -0.24, 0.24, lean.PLINTH + 0.372, lean.PLINTH + 0.372 + d.V(0.06), 0.0, d.O("+z", 0.1), "railing", CX, 0.0, skip=("back",))
    # The hoist beam's pulley wheel.
    d.cyl(CX, HD + 0.09, 0.66, 0.66 + d.V(0.0001), 0.01, "railing", n=6)
    # The silo's ladder: two rails and rungs up its front, standing off it clear of the hoops.
    sx, sz, r = 0.35, -0.2, 0.115
    ang = math.radians(30)
    rr = r + 0.02
    for k in (-1, 1):
        a = ang + k * 0.11
        d.cyl(sx + math.cos(a) * rr, sz + math.sin(a) * rr, 0.06, 0.9, 0.018, "railing", n=5)
    for y in [0.09 + 0.028 * k for k in range(29)]:
        a0, a1 = ang - 0.11, ang + 0.11
        p0 = (sx + math.cos(a0) * rr, sz + math.sin(a0) * rr)
        p1 = (sx + math.cos(a1) * rr, sz + math.sin(a1) * rr)
        m.face([(p0[0], y, p0[1]), (p1[0], y, p1[1]), (p1[0], y + d.V(0.03), p1[1]), (p0[0], y + d.V(0.03), p0[1])], m_mat("railing"), out=(math.cos(ang), 0, math.sin(ang)))
    # Trim boards round the big doors and the hay hatch, standing off the boards.
    dw = 0.17
    top = lean.PLINTH + 0.36
    tb = d.U("+z", 0.09)
    for a, b in ((-dw - tb, -dw), (dw, dw + tb)):
        d.wbox("+z", HD, a, b, lean.PLINTH, top, 0.0, d.O("+z", 0.035), "frame", CX, 0.0, skip=("back", "bottom"))
    d.wbox("+z", HD, -dw - tb, dw + tb, top, top + d.V(0.09), 0.0, d.O("+z", 0.035), "frame", CX, 0.0, skip=("back",))
    hb = d.U("+z", 0.08)
    for a, b in ((-0.065 - hb, -0.065), (0.065, 0.065 + hb)):
        d.wbox("+z", HD, a, b, 0.54, 0.66, 0.0, d.O("+z", 0.035), "frame", CX, 0.0, skip=("back", "bottom"))
    d.wbox("+z", HD, -0.065 - hb, 0.065 + hb, 0.66, 0.66 + d.V(0.08), 0.0, d.O("+z", 0.035), "frame", CX, 0.0, skip=("back",))
    d.wbox("+z", HD, -0.065 - hb, 0.065 + hb, 0.54 - d.V(0.08), 0.54, 0.0, d.O("+z", 0.05), "frame", CX, 0.0, skip=("back",))
    snear.plinth_stones(m, lean.HALF_W + lean.PLINTH_OUT, lean.HALF_D + lean.PLINTH_OUT, lean.PLINTH, cx=CX, gaps={"+z": [(-0.2, 0.2)]})
    # Louvre slats across each face of the cupola.
    for facing in ("+x", "-x", "+z", "-z"):
        for k in range(5):
            v = lean.RIDGE_Y + 0.004 + k * 0.0085
            d.wbox(facing, 0.04, -0.022, 0.022, v, v + 0.005, 0.0, d.O(facing, 0.06), "timberDark", CX, 0.0, skip=("back", "left", "right"))
    # A hasp and padlock on the middle stile of the big doors, and cast-iron vents in the gable.
    d.wbox("+z", HD, -0.016, 0.016, lean.PLINTH + 0.165, lean.PLINTH + 0.185, -0.012, 0.006, "railing", CX, 0.0, skip=("back",))
    d.wbox("+z", HD, -0.011, 0.011, lean.PLINTH + 0.12, lean.PLINTH + 0.16, -0.012, 0.006, "metal", CX, 0.0, skip=("back",))
    for end, face in ((1, "+z"), (-1, "-z")):
        for su in (-1, 1):
            u = su * 0.2
            vv = 0.63
            d.wbox(face, HD, u - 0.045, u + 0.045, vv - 0.032, vv + 0.032, 0.0, d.O(face, 0.05), "railing", CX, 0.0, skip=("back",))
            for k in range(5):
                v = vv - 0.026 + k * 0.0125
                d.wbox(face, HD, u - 0.038, u + 0.038, v, v + d.V(0.02), d.O(face, 0.05), d.O(face, 0.095), "metal", CX, 0.0, skip=("back",))
    # The silo's staves: seams up between the hoops.
    sx, sz, r = 0.35, -0.2, 0.115
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        if abs(math.remainder(a - math.radians(30), 2 * math.pi)) < 0.5:
            continue  # the ladder
        c, sn = math.cos(a), math.sin(a)
        tx, tz = -sn, c
        rr = r + 0.006
        w = 0.005
        for y0_, y1_ in ((0.02, 0.215), (0.245, 0.455), (0.485, 0.695), (0.725, 0.9)):
            m.face([(sx + c * rr - tx * w, y0_, sz + sn * rr - tz * w), (sx + c * rr + tx * w, y0_, sz + sn * rr + tz * w),
                    (sx + c * rr + tx * w, y1_, sz + sn * rr + tz * w), (sx + c * rr - tx * w, y1_, sz + sn * rr - tz * w)], m_mat("concreteDark"), out=(c, 0, sn))
    # A ridge cap along the roof, gutters on the long eaves, downpipes at the front.
    rz = HD + 0.03
    t = 0.028
    roll = [(-0.05, lean.RIDGE_Y - t * 0.5), (-0.03, lean.RIDGE_Y + 0.012), (0.0, lean.RIDGE_Y + 0.02), (0.03, lean.RIDGE_Y + 0.012), (0.05, lean.RIDGE_Y - t * 0.5)]
    m.prism_z([(CX + px, py) for px, py in roll], -rz + 0.012, rz - 0.012, m_mat("railing"))
    ex, ey = lean.EAVE
    for s_ in (-1, 1):
        x0_, x1_ = sorted((CX + s_ * (ex - 0.006), CX + s_ * (ex + 0.02)))
        m.box(x0_, x1_, ey - t - d.V(0.09), ey - t + d.V(0.02), -rz + 0.01, rz - 0.01, m_mat("metal"))
        for zz in (-rz + 0.03, rz - 0.03):
            d.downpipe(CX + s_ * (ex + 0.005), zz, 0.0, ey - t - d.V(0.09), r=0.04)
    # Cupola: a vane on the cap.
    cy = lean.RIDGE_Y
    top = lean.RIDGE_Y + 0.06 + 0.012 + 0.062
    d.cyl(CX, 0.0, top, top + d.V(0.2), 0.012, "railing", n=5)


def m_mat(key):
    return snear.det(CURRENT[0]).mat(key)


CURRENT = [None]


def build():
    kit.reset()
    M = skit.palette()
    M_.update(M)
    snear.setup(SCALE, M, lintel=False, apron=False)
    snear.patch(lean, "window")
    lean.wall = board_wall
    lean.gable = gable_boards
    lean.roof = near_roof

    def hooked(mesh):
        CURRENT[0] = mesh
        extras(mesh)

    snear.EXTRAS["Barn"] = hooked
    obj, _ = lean.build_barn(M)
    snear.bake([obj], lean_glb="barn.glb")
    print("TRIS", obj.name, skit.triangles(obj))
    snear.rename([obj])
    return [obj]


def preview(n):
    return build()
