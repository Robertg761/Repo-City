"""
The near levels of the village and town buildings: the lean scripts' own
builders run with their windows, doors, walls, chimneys and roofs swapped for
richer ones, so the lean layout, openings and outline carry over exactly.

Each near script (`near_cottage.py` and the rest) imports its lean module,
calls `patch(module, ...)` to replace the builders that module imported from
`skit` with the versions here, builds the lean model's own `build_*` function
with the settlement palette, adds its own extras (`EXTRAS`, run just before a
mesh is finished), and bakes at the model's representative instance size.

What the near builders add, sized in metres at that size (`detail.py`) and never
in unit fractions, so a stretched building does not squash them:

  window   frame ring and glazing bars standing proud of the glass, a lintel
           with a keystone, a deeper sill
  door     stiles, rails and raised panels, a handle plate and letterbox, a
           fan of bars in a fanlight, a surround, a second step
  wall     the same wall cut into a grid of cells with lines round every
           opening's dressing (the occlusion is baked per vertex)
  roof     three times the courses with a finer step, joints, a ridge of cap
           tiles, gutter brackets
  chimney  corbelled courses, a cap, flaunching, pots with rims
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "buildings"))
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
import kit  # noqa: E402
import skit  # noqa: E402
import tone  # noqa: E402
from detail import Detail  # noqa: E402
from skit import LAYER, Hole  # noqa: E402

#: The representative instance size (x, y, z metres) of the model being built.
SCALE = (5.0, 5.0, 5.0)
M = None
EXTRAS = {}
#: House numbers for the next doors built (each door takes one).
NUMBERS = []
#: The width of a roof tile, metres.
TILE = 0.32
#: Lay walls of `brick` course by course.
BRICK = True
LINTEL = True
APRON = True
#: Soldier bricks over window heads (brick walls).
SOLDIERS = False
#: Window dressing: whether lintels carry keystones, and how far they reach past the opening (metres).
KEYSTONE = True
LINTEL_EXT = 0.1
_dets = {}


def setup(scale, materials, keystone=True, lintel_ext=0.1, lintel=True, soldiers=False, apron=True):
    global SCALE, M, KEYSTONE, LINTEL_EXT, LINTEL, SOLDIERS, APRON
    SCALE = scale
    M = materials
    KEYSTONE = keystone
    LINTEL_EXT = lintel_ext
    LINTEL = lintel
    SOLDIERS = soldiers
    APRON = apron
    _dets.clear()


def det(m):
    """The `Detail` writing into mesh `m`, its palette the settlement's."""
    d = _dets.get(id(m))
    if d is None:
        pal = {
            "frame": M["frame"], "trim": M["stone"], "door": M["accent"], "doorDark": M["accentDark"],
            "metal": M["metal"], "stone": M["stone"], "wallSoft": M["wallShade"], "roofLight": M["tileDark"], "roof": M["tile"],
            "stoneDark": M["stoneDark"], "railing": M["railing"], "cap": M["tileDark"], "glass": M["glass"],
            "timber": M["timber"], "timberDark": M["timberDark"],
            "brick": M["brick"], "brickDark": M["brickDark"], "concrete": M["concrete"], "concreteDark": M["concreteDark"], "leaf": M["leaf"], "bloom": M["flowerPink"], "brass": M["metal"],
        }
        d = Detail(lambda pts, mat, out: m.face(pts, mat, out=out), pal, SCALE)
        _dets[id(m)] = d
    return d


def patch(module, *names):
    """Swap the builders `module` imported from `skit` for the near ones."""
    for name in names or ("wall", "window", "door", "chimney", "gable_roof"):
        setattr(module, name, globals()[name])


_orig_finish = skit.finish


def finish(mesh):
    extra = EXTRAS.get(mesh.name)
    if extra:
        extra(mesh)
    return _orig_finish(mesh)


skit.finish = finish


# ---------------------------------------------------------------- walls

def brick_wall(m, facing, plane, u0, u1, v0, v1, holes, cx=0.0, cz=0.0, cuts=(), kind="brick", mortar_face=True):
    """A wall of brick laid in stretcher bond: courses 7.5 cm high, bricks
    22 cm long, every other course started half a brick along, each brick a
    quad of its own in one of two shades. Bricks are cut round the
    openings, and every quad carries the vertices of its neighbours above
    and below along its edges, so no seam is left open."""
    d = det(m)
    holes = [h for h in holes if h.u1 > u0 and h.u0 < u1 and h.v1 > v0 and h.v0 < v1]
    # Brick: 7.5 by 22.5 cm; stone: ashlar blocks 20 by 45 cm.
    ch, cl = (0.075, 0.225) if kind == "brick" else (0.2, 0.45)
    course = d.V(ch)
    brick = d.U(facing, cl)
    lines = {v0, v1, *[c for c in cuts if v0 < c < v1], *[h.v0 for h in holes if v0 < h.v0 < v1], *[h.v1 for h in holes if v0 < h.v1 < v1],
             # The tops of the stones over each head, so a course ends on them.
             *[h.v1 + dv for h in holes for dv in (d.V(0.14), d.V(0.21)) if v0 < h.v1 + dv < v1]}
    v = v0 + course
    while v < v1 - 1e-6:
        lines.add(v)
        v += course
    vs = sorted(lines)
    # Drop lines a hair from another: a sliver of a course helps nobody.
    keep = [vs[0]]
    for x in vs[1:]:
        if x - keep[-1] > course * 0.3 or x == vs[-1]:
            keep.append(x)
    vs = keep
    tones = [M["brick"], M["brick"], M["brickDark"], M["brick"], M["brickDark"], M["brick"], M["brick"], M["brickDark"]]
    mortar = M["concrete"]
    if kind == "stone":
        tones = [M["stone"], M["stone"], M["concrete"], M["stone"], M["stoneDark"], M["stone"], M["stone"], M["concrete"]]
        mortar = M["concrete"]

    def strip_lines(va, vb):
        mid = (va + vb) / 2
        c = int((mid - v0) / course)
        off = brick * 0.5 if c % 2 else 0.0
        us = {u0, u1}
        k = 0
        while True:
            x = u0 + off + brick * k
            if x >= u1 - 1e-9:
                break
            if x > u0 + 1e-9:
                us.add(x)
            k += 1
        for h in holes:
            if h.v0 < mid < h.v1:
                for x in (h.u0, h.u1):
                    if u0 < x < u1:
                        us.add(x)
        out = sorted(us)
        # A stub of a brick beside a seam is folded into it.
        cleaned = [out[0]]
        for x in out[1:]:
            if x - cleaned[-1] > brick * 0.15 or x == out[-1]:
                cleaned.append(x)
        return c, off, cleaned

    strips = [strip_lines(va, vb) for va, vb in zip(vs, vs[1:])]
    P = lambda u, v, o=0.0: on(facing, plane, u, v, o, cx, cz)  # noqa: E731
    gu, gv = d.U(facing, 0.0035 if kind == "brick" else 0.006), d.V(0.0035 if kind == "brick" else 0.006)
    back = 0.024
    edge_u = {u0, u1, *[x for h in holes for x in (h.u0, h.u1)]}
    edge_v = {v0, v1, *[x for h in holes for x in (h.v0, h.v1)]}
    near = lambda a, group: any(abs(a - g) < 1e-9 for g in group)  # noqa: E731
    for i, (va, vb) in enumerate(zip(vs, vs[1:])):
        if vb - va < 1e-9:
            continue
        c, off, ulines = strips[i]
        mid = (va + vb) / 2
        # The mortar: the row's wall, set back behind the bricks, in one piece between openings.
        spans = []
        start = None
        for ua, ub in zip(ulines, ulines[1:]):
            inside = any(h.u0 < (ua + ub) / 2 < h.u1 and h.v0 < mid < h.v1 for h in holes)
            if inside and start is not None:
                spans.append((start, ua))
                start = None
            elif not inside and start is None:
                start = ua
        if start is not None:
            spans.append((start, ulines[-1]))
        for a, b in spans if mortar_face else ():
            m.face([P(a, va, -back), P(b, va, -back), P(b, vb, -back), P(a, vb, -back)], mortar, out=skit.NORMAL[facing])
        for ua, ub in zip(ulines, ulines[1:]):
            if any(h.u0 < (ua + ub) / 2 < h.u1 and h.v0 < mid < h.v1 for h in holes):
                continue
            n = int(max(0.0, (ua - u0 - off)) / brick + 1e-6)
            tone = tones[(c * 5 + n * 3 + (c * n) % 7) % len(tones)]
            a = ua if near(ua, edge_u) else ua + gu
            b = ub if near(ub, edge_u) else ub - gu
            lo = va if near(va, edge_v) else va + gv
            hi = vb if near(vb, edge_v) else vb - gv
            m.face([P(a, lo), P(b, lo), P(b, hi), P(a, hi)], tone, out=skit.NORMAL[facing])


def plinth_stones(m, hx, hz, y1, cx=0.0, cz=0.0, gaps=None, proud=0.025):
    """Ashlar blocks over a plinth's four faces, standing `proud` metres off
    them (the plinth shows through the joints), the z faces running round the
    corners over the ends of the x faces. `gaps[facing]` lists (u0, u1) ranges
    left bare (a step)."""
    d = det(m)
    gaps = gaps or {}
    for facing, plane, half in (("+z", hz, hx), ("-z", hz, hx), ("+x", hx, hz), ("-x", hx, hz)):
        pm = proud / (SCALE[2] if facing in ("+z", "-z") else SCALE[0])
        ext = proud / SCALE[0] if facing in ("+z", "-z") else 0.0
        holes = [Hole(a, b, 0.0, y1 + 1) for a, b in gaps.get(facing, [])]
        brick_wall(m, facing, plane + pm, -half - ext, half + ext, 0.0, y1, holes, cx, cz, kind="stone", mortar_face=False)


def wall(m, facing, plane, u0, u1, v0, v1, holes, mat, cx=0.0, cz=0.0, cuts=(), cell=(1.0, 0.85), lines=True):
    """`skit.wall` with a cell to every stretch of wall no bigger than
    `cell` metres and grid lines round each opening's dressing (jambs,
    sill, lintel): the wall under the trim is never seen, and the crease
    where the trim meets it stays in narrow cells of its own."""
    if BRICK and mat is M["brick"]:
        return brick_wall(m, facing, plane, u0, u1, v0, v1, holes, cx, cz, cuts)
    if BRICK and mat is M["stone"]:
        return brick_wall(m, facing, plane, u0, u1, v0, v1, holes, cx, cz, cuts, kind="stone")
    d = det(m)
    holes = [h for h in holes if h.u1 > u0 and h.u0 < u1 and h.v1 > v0 and h.v0 < v1]
    us = {u0, u1, *[h.u0 for h in holes], *[h.u1 for h in holes]}
    vs = {v0, v1, *[h.v0 for h in holes], *[h.v1 for h in holes], *[c for c in cuts if v0 < c < v1]}
    for h in holes if lines else ():
        for u in (h.u0 - d.U(facing, 0.12), h.u1 + d.U(facing, 0.12)):
            if u0 < u < u1:
                us.add(u)
        for v in (h.v0 - d.V(0.14), h.v1 + d.V(0.3)):
            if v0 < v < v1:
                vs.add(v)
    us, vs = sorted(us), sorted(vs)

    def split(vals, size):
        out = [vals[0]]
        for a, b in zip(vals, vals[1:]):
            k = max(1, math.ceil((b - a) / size - 1e-9))
            out += [a + (b - a) * i / k for i in range(1, k + 1)]
        return out

    us = split(us, d.U(facing, cell[0]))
    vs = split(vs, d.V(cell[1]))
    for va, vb in zip(vs, vs[1:]):
        if vb - va < 1e-9:
            continue
        for ua, ub in zip(us, us[1:]):
            if ub - ua < 1e-9:
                continue
            mu, mv = (ua + ub) / 2, (va + vb) / 2
            if any(h.u0 < mu < h.u1 and h.v0 < mv < h.v1 for h in holes):
                continue
            m.rect(facing, plane, ua, ub, va, vb, mat, cx=cx, cz=cz)


# ---------------------------------------------------------------- windows

def window(m, M_, facing, plane, u, v, w, h, cx=0.0, cz=0.0, depth=0.022, frame=0.016, bars="cross",
           glass=None, reveal=None, sill=True, shutters=False, flowers=None, holes=None, sill_mat=None):
    """`skit.window`, then dressed: the frame ring and glazing bars stand
    proud of the glass (which keeps its whole rectangle, the lit window's),
    and a lintel with a keystone sits over the opening."""
    # The lean sill is left off: the near one is a sloped stone on a corbelled apron.
    panel = skit.window(m, M_, facing, plane, u, v, w, h, cx, cz, depth, frame, bars, glass, reveal, False, shutters, flowers, holes, sill_mat)
    d = det(m)
    hw, hh = w / 2 + frame, h / 2 + frame
    wm = w * (SCALE[0] if facing in ("+z", "-z") else SCALE[2])
    hm = h * SCALE[1]
    if bars == "none":
        # A plain light: one pane, with a transom if it is tall.
        cols, rows = (1 if wm < 0.9 else 2), (1 if hm < 0.9 else 2)
    elif bars == "cross":
        cols, rows = 2, 2
    else:
        cols, rows = max(1, round(wm / 0.5)), max(2, round(hm / 0.4))
    o = dict(u=u, v=v, w=w, h=h, depth=depth - LAYER)
    ring = (frame, frame)
    # The glass is one layer in front of the frame's back; the bars stand
    # proud of it. The lean window has a cross of frame between its panes: the
    # near bars stand in front of that gap.
    d.window(facing, plane, o, cx, cz, bars=(cols, rows), sill=0.0, lintel=False, jambs=False, ring=ring, back=depth, bar_m=0.022)
    ext = d.U(facing, LINTEL_EXT)
    top = v + hh
    if sill:
        stone = "trim"
        sext = d.U(facing, 0.06 if not shutters else 0.0)
        bot = v - hh
        S = 0.09
        d.profile(facing, plane, u - hw - sext, u + hw + sext, bot, [(0, -0.06), (S, -0.06), (S, -0.03), (0, 0.0)], stone, cx, cz, skip=(3,))
        if flowers is None and APRON:
            d.wbox(facing, plane, u - hw - sext + d.U(facing, 0.03), u + hw + sext - d.U(facing, 0.03), bot - d.V(0.1), bot - d.V(0.06), 0.0, d.O(facing, 0.035), stone, cx, cz, ("back", "top"))
    # The head: a flat arch of jointed stones (with a keystone), and over it a
    # course of soldier bricks where the wall is brick.
    if LINTEL:
        d.voussoirs(facing, plane, u - hw - ext, u + hw + ext, top, d.V(0.14), "trim", cx, cz, keystone=KEYSTONE, stones=5)
        if SOLDIERS:
            d.soldiers(facing, plane, u - hw - ext, u + hw + ext, top + d.V(0.14) + (d.V(0.07) if KEYSTONE else 0.0), ("brick", "brickDark"), cx, cz)
    return panel


# ---------------------------------------------------------------- doors

def door(m, M_, facing, plane, u, v, w, h, cx=0.0, cz=0.0, depth=0.03, mat=None, reveal=None, fanlight=False,
         holes=None, step=True, step_mat=None, glazed=False, step_from=0.0, step_w=0.035, floor=True, number=None):
    """A door set into its wall, as `skit.door`, its leaf made of stiles,
    rails and raised panels, with a fan of bars in the fanlight, a handle
    plate and letterbox, a surround and a second step."""
    d = det(m)
    fan = h * 0.2 if fanlight else 0.0
    hole = Hole(u - w / 2, u + w / 2, v, v + h + fan)
    if holes is not None:
        holes.append(hole)
    skit.recess(m, facing, plane, hole, depth, reveal or M_["frame"], mat or M_["accent"], cx, cz, back_face=False,
                floor=M_["stone"] if floor else False)
    back = plane - depth
    leaf = mat or M_["accent"]
    m.rect(facing, back, u - w / 2, u + w / 2, v, v + h, leaf, cx=cx, cz=cz)
    dark = M_["accentDark"] if leaf is M_["accent"] else M_["timberDark"]
    if fan:
        m.rect(facing, back, u - w / 2, u + w / 2, v + h, v + h + fan, M_["frame"], cx=cx, cz=cz)
        m.rect(facing, back + LAYER, u - w * 0.42, u + w * 0.42, v + h + 0.008, v + h + fan - 0.008, M_["glass"], cx=cx, cz=cz)
        # The fan: bars radiating from the middle of the leaf's head.
        cu, cv = u, v + h + 0.008
        for k in range(1, 5):
            a = math.pi * k / 5
            ru, rv = w * 0.42, fan - 0.016
            pts_a = (cu + math.cos(a) * ru * 0.3, cv + math.sin(a) * rv * 0.3)
            pts_b = (cu + math.cos(a) * ru, cv + math.sin(a) * rv)
            bw = 0.0035
            d.quad([on(facing, plane, pts_a[0] - bw, pts_a[1], -depth + 2.2 * LAYER, cx, cz), on(facing, plane, pts_a[0] + bw, pts_a[1], -depth + 2.2 * LAYER, cx, cz),
                    on(facing, plane, pts_b[0] + bw, pts_b[1], -depth + 2.2 * LAYER, cx, cz), on(facing, plane, pts_b[0] - bw, pts_b[1], -depth + 2.2 * LAYER, cx, cz)],
                   M_["frame"], skit.NORMAL[facing])
    # The leaf is a flat quad at `back`; the raised panels stand on it.
    o = dict(u=u, v=v + h / 2, w=w, h=h, depth=depth)
    glass_mat = M_["shopGlass"] if glazed else None
    d.door(facing, plane, o, cx, cz, leaf=leaf, dark=dark, trim="trim", metal="metal", steps=False, surround=False,
           panels=(1, 3) if glazed else (2, 3), glazed=glass_mat)
    # A surround: pilasters and a head over the reveal.
    ext = d.U(facing, 0.09)
    d.wbox(facing, plane, u - w / 2 - ext, u - w / 2, v, v + h + fan, 0.0, d.O(facing, 0.04), "trim", cx, cz, ("back", "bottom"))
    d.wbox(facing, plane, u + w / 2, u + w / 2 + ext, v, v + h + fan, 0.0, d.O(facing, 0.04), "trim", cx, cz, ("back", "bottom"))
    d.wbox(facing, plane, u - w / 2 - ext, u + w / 2 + ext, v + h + fan, v + h + fan + d.V(0.12), 0.0, d.O(facing, 0.06), "trim", cx, cz, ("back",))
    if number is None and NUMBERS:
        number = NUMBERS.pop(0)
    if number is not None:
        d.house_number(facing, plane, u, v + h + fan + d.V(0.27), digits=2 if number > 9 else 1, cx=cx, cz=cz, seed=number)
    if step and v > 0:
        reach = 0.088 * SCALE[2 if facing in ("+z", "-z") else 0]
        d.steps_nosed(facing, plane, u - w / 2 - step_w, u + w / 2 + step_w, u - w / 2 - step_w * 1.8, u + w / 2 + step_w * 1.8, v, reach,
                      step_from * SCALE[2 if facing in ("+z", "-z") else 0], cx, cz, mat="stone")
    return hole


def on(facing, plane, u, v, out, cx, cz):
    return skit.on(facing, plane, u, v, out, cx, cz)


# ---------------------------------------------------------------- chimneys

def chimney(m, M_, x, z, y0, top, w=0.1, d=0.1, mat=None, pots=1):
    """A stack from `y0` (buried in the roof) to `top`: the shaft, three
    corbelled courses, a cap, a pyramid of flaunching and pots with rims."""
    dt = det(m)
    ch = dt.V(0.09)
    stone = mat or M_["stone"]
    shaft_top = top - 3 * ch - dt.V(0.05)
    m.box(x - w / 2, x + w / 2, y0, shaft_top, z - d / 2, z + d / 2, stone, skip=("bottom", "top"))
    y = shaft_top
    for k, grow in enumerate((0.03, 0.06, 0.09)):
        gx, gz = dt.X(grow), dt.Z(grow)
        m.box(x - w / 2 - gx, x + w / 2 + gx, y + ch * k * 0.5, y + ch * (k * 0.5 + 0.5) if k < 2 else y + ch * 1.5 + dt.V(0.05), z - d / 2 - gz, z + d / 2 + gz, M_["stoneDark"] if k == 2 else stone)
    y = y + ch * 1.5 + dt.V(0.05)
    gx, gz = dt.X(0.11), dt.Z(0.11)
    m.box(x - w / 2 - gx, x + w / 2 + gx, y, y + dt.V(0.05), z - d / 2 - gz, z + d / 2 + gz, M_["stoneDark"])
    y += dt.V(0.05)
    # The flaunching: a low pyramid of mortar the pots stand in.
    fx, fz = w / 2 + dt.X(0.06), d / 2 + dt.Z(0.06)
    fh = dt.V(0.06)
    ring = [(x + fx, z + fz), (x - fx, z + fz), (x - fx, z - fz), (x + fx, z - fz)]
    inner = [(x + fx * 0.7, z + fz * 0.7), (x - fx * 0.7, z + fz * 0.7), (x - fx * 0.7, z - fz * 0.7), (x + fx * 0.7, z - fz * 0.7)]
    for i in range(4):
        j = (i + 1) % 4
        m.face([(ring[i][0], y, ring[i][1]), (ring[j][0], y, ring[j][1]), (inner[j][0], y + fh, inner[j][1]), (inner[i][0], y + fh, inner[i][1])], M_["concrete"],
               out=((ring[i][0] + ring[j][0]) / 2 - x, 1.2, (ring[i][1] + ring[j][1]) / 2 - z))
    m.face([(p[0], y + fh, p[1]) for p in inner], M_["concrete"], out=(0, 1, 0))
    y += fh
    along_z = d > w
    pitch = (d if along_z else w) * 0.5
    for i in range(pots):
        off = 0 if pots == 1 else (i - (pots - 1) / 2) * pitch
        px, pz = (x, z + off) if along_z else (x + off, z)
        # A pot: a tapering barrel, a bead, a thick rim and the dark flue.
        m.cylinder(px, y, y + dt.V(0.13), pz, 0.021, M_["tileDark"], segments=10, phase=0.0)
        m.cylinder(px, y + dt.V(0.13), y + dt.V(0.16), pz, 0.026, M_["tileDark"], segments=10, bottom=True)
        m.cylinder(px, y + dt.V(0.16), y + dt.V(0.22), pz, 0.02, M_["tileDark"], segments=10)
        m.cylinder(px, y + dt.V(0.22), y + dt.V(0.26), pz, 0.026, M_["tileDark"], segments=10, top_mat=M_["railing"], bottom=True)
    return None


# ---------------------------------------------------------------- tiles

def _pillow(m, q, mat, lift, out=None):
    """A tile as four facets round a crown `lift` metres over its middle,
    the edges left in the plane of the slope so neighbours share them."""
    sx, sy, sz = SCALE
    mq = [(p[0] * sx, p[1] * sy, p[2] * sz) for p in q]
    a = (mq[1][0] - mq[0][0], mq[1][1] - mq[0][1], mq[1][2] - mq[0][2])
    b = (mq[3][0] - mq[0][0], mq[3][1] - mq[0][1], mq[3][2] - mq[0][2])
    n = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    ln = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
    if ln < 1e-12:
        m.face(q, mat, out=(0, 1, 0))
        return
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) if out is not None else n[1] < 0:
        n = (-n[0], -n[1], -n[2])
    c = (sum(p[0] for p in q) / 4 + n[0] / ln * lift / sx, sum(p[1] for p in q) / 4 + n[1] / ln * lift / sy, sum(p[2] for p in q) / 4 + n[2] / ln * lift / sz)
    for i in range(4):
        m.face([q[i], q[(i + 1) % 4], c], mat, out=n)


def _sliced_prism(m, M_, axis, orig, tile=0.3, avoid=()):
    """A `prism_x` / `prism_z` that lays the top of every course as
    separate tiles, staggered a half tile course to course, each a slightly
    different shade and a pillow of its own, and cuts the risers between
    courses at the same joints so no vertex lies on an edge that lacks it."""
    alt = {id(M_["tile"]): M_["tileDark"], id(M_["slate"]): M_["slateDark"]}
    length_scale = SCALE[0] if axis == "x" else SCALE[2]

    def prism(profile, a0, a1, mat, caps=True, cap_mat=None, skip_edges=(), edge_mats=None):
        if caps or id(mat) not in alt:
            return orig(profile, a0, a1, mat, caps=caps, cap_mat=cap_mat, skip_edges=skip_edges, edge_mats=edge_mats)
        edge_mats = edge_mats or {}
        N = len(profile)
        n_top = N - 3  # the edges before the fascia
        tiles = max(3, round((a1 - a0) * length_scale / tile))

        def P(pt, t):
            return (t, pt[1], pt[0]) if axis == "x" else (pt[0], pt[1], t)

        def seams(k):
            off = 0.5 if k % 2 else 0.0
            return [a0 + (a1 - a0) * (j + off) / tiles for j in range(tiles + 1) if 0 < (j + off) / tiles < 1]

        slope_index = {}
        count = 0
        for i in range(n_top):
            (b0, y0_), (b1, y1_) = profile[i], profile[(i + 1) % N]
            if abs(b1 - b0) > 1e-9:
                slope_index[i] = count
                count += 1
        for i in range(N):
            if i in skip_edges:
                continue
            pa, pb = profile[i], profile[(i + 1) % N]
            out = m._profile_out(profile, i)
            outv = (0, out[1], out[0]) if axis == "x" else (out[0], out[1], 0)
            if i in slope_index:
                k = slope_index[i]
                cuts = [a0] + seams(k) + [a1]
                for j, (ta, tb) in enumerate(zip(cuts, cuts[1:])):
                    q = [P(pa, ta), P(pb, ta), P(pb, tb), P(pa, tb)]
                    h = (k * 7 + j * 3 + (k * j) % 5) % 9
                    tone = alt[id(mat)] if h % 3 == 0 else mat
                    near_stack = any(min(p[0] for p in q) < ax1 + 0.02 and max(p[0] for p in q) > ax0 - 0.02
                                     and min(p[2] for p in q) < az1 + 0.02 and max(p[2] for p in q) > az0 - 0.02 for ax0, ax1, az0, az1 in avoid)
                    if k == 0 or near_stack:
                        # Flat under the ridge roll and beside a chimney: their walls meet the slope there.
                        m.face(q, tone, out=outv)
                    else:
                        _pillow(m, q, tone, 0.007 + 0.006 * ((k * 5 + j * 3) % 4) / 3)
            elif i < N - 3 + 1 and abs(pb[0] - pa[0]) < 1e-9 and i <= n_top:
                # A riser (or the fascia): the joints of the tiles above and below its edges.
                prev = max((slope_index[j] for j in slope_index if j < i), default=None)
                nxt = min((slope_index[j] for j in slope_index if j > i), default=None)
                top_cuts = seams(prev) if prev is not None else []
                low_cuts = seams(nxt) if nxt is not None else []
                pts = [P(pa, a0)] + [P(pa, t) for t in top_cuts] + [P(pa, a1), P(pb, a1)] + [P(pb, t) for t in reversed(low_cuts)] + [P(pb, a0)]
                m.face(pts, edge_mats.get(i, mat), out=outv)
            else:
                m.face([P(pa, a0), P(pb, a0), P(pb, a1), P(pa, a1)], edge_mats.get(i, mat), out=outv)
    return prism


def _slice_roofs(m, M_, tile, avoid=()):
    """Patch `m` so the roof it is about to build is laid in tiles; returns the undo."""
    ox, oz = skit.Mesh.prism_x.__get__(m), skit.Mesh.prism_z.__get__(m)
    m.prism_x = _sliced_prism(m, M_, "x", ox, tile, avoid)
    m.prism_z = _sliced_prism(m, M_, "z", oz, tile, avoid)

    def undo():
        del m.prism_x
        del m.prism_z
    return undo


# ---------------------------------------------------------------- roofs

def gable_roof(m, M_, *, x=0.0, z=0.0, y, w, d, rise, overhang, thickness, ridge="x", roof, gable, cap=None,
               courses=5, step=0.012, verge=None, butt=None, joints=0, gutter=False, avoid=(), ends=(1, -1), gables=None, downpipe=True):
    """`skit.gable_roof` laid in three times the courses, each a smaller
    step, with more joints; a ridge of individual cap tiles for the roll;
    brackets under the gutters."""
    dt = det(m)
    along_x = ridge == "x"
    half_b = (d if along_x else w) / 2
    out_b = half_b + overhang
    # Three times the courses, give or take: whichever leaves no course butt
    # (a vertical step) within a hair of the wall plane it would fight.
    ridge_at = z if along_x else x
    planes = [half_b] + [abs(e - ridge_at) for a0, a1, b0, b1 in avoid for e in ((b0, b1) if along_x else (a0, a1))]

    def clearance(n):
        return min(abs(out_b * j / n - q) for j in range(1, n) for q in planes)

    n = max(range(courses * 3 - 3, courses * 3 + 4), key=lambda k: (min(clearance(k), 0.012), -abs(k - courses * 3)))
    undo = _slice_roofs(m, M_, TILE, [(a0 - 0.03, a1 + 0.03, b0 - 0.03, b1 + 0.03) for a0, a1, b0, b1 in avoid])
    try:
        info = skit.gable_roof(
            m, M_, x=x, z=z, y=y, w=w, d=d, rise=rise, overhang=overhang, thickness=thickness, ridge=ridge, roof=roof,
            gable=gable, cap=None, courses=n, step=step * 0.55, verge=verge, butt=butt, joints=0,
            gutter=gutter, avoid=[(a0 - 0.03, a1 + 0.03, b0 - 0.03, b1 + 0.03) for a0, a1, b0, b1 in avoid], ends=ends, gables=gables, downpipe=downpipe,
        )
    finally:
        undo()
    if cap is not None:
        dt.pal["cap"] = cap
        skips = [(a0, a1) if along_x else (b0, b1) for a0, a1, b0, b1 in avoid if (b0 <= ridge_at <= b1 if along_x else a0 <= ridge_at <= a1)]
        inset = (dt.X if along_x else dt.Z)(0.06)
        dt.ridge_tiles(0, ridge_at, info["apex"], info["out_a"] - inset, tile=0.3, half_w=0.1, rise=0.07, mat="cap",
                       along_x=along_x, center=x if along_x else z, foot_m=0.05, skip=skips)
    if gutter:
        eb = info["eave"] - thickness
        n = max(3, int(info["out_a"] * 2 * (SCALE[0] if along_x else SCALE[2]) / 0.6))
        for side in (1, -1):
            for k in range(n + 1):
                a = -info["out_a"] + 0.03 + (2 * info["out_a"] - 0.06) * k / n
                bw = dt.U("+z", 0.02) if along_x else dt.U("+x", 0.02)
                if along_x:
                    zz = sorted((z + side * (info["out_b"] - 0.008), z + side * (info["out_b"] + 0.014)))
                    m.box(x + a - bw, x + a + bw, eb - 0.024 - dt.V(0.03), eb - 0.024, zz[0], zz[1], M_["metal"], skip=("top",))
                else:
                    xx = sorted((x + side * (info["out_b"] - 0.008), x + side * (info["out_b"] + 0.014)))
                    m.box(xx[0], xx[1], eb - 0.024 - dt.V(0.03), eb - 0.024, z + a - bw, z + a + bw, M_["metal"], skip=("top",))
    return info


# ---------------------------------------------------------------- output

def bake(objs, distance=0.9, floor=0.75, samples=48, scale=None, lean_glb=None):
    """Bake each object's occlusion at the instance size, alone over the
    ground plane (the variants of a model all stand at the origin), then bring
    each role's mean to the lean model's (`lean_glb`)."""
    sx, sy, sz = scale or SCALE
    for obj in objs:
        others = [o for o in objs if o is not obj]
        for o in others:
            o.hide_render = True
        obj.scale = (sx, sz, sy)
        bpy.context.view_layer.update()
        kit.bake_ao([obj], distance=distance, samples=samples, floor=floor)
        obj.scale = (1, 1, 1)
        if lean_glb:
            # Hold the tone of every role to the lean model's (`tone.py`).
            tone.match(obj, lean_glb, obj.name.split(".")[0], (sx, sy, sz))
        for o in others:
            o.hide_render = False


def rename(objs, suffix="Near"):
    for obj in objs:
        obj.name = obj.name + suffix
        obj.data.name = obj.name
