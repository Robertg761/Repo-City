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
from detail import Detail  # noqa: E402
from skit import LAYER, Hole  # noqa: E402

#: The representative instance size (x, y, z metres) of the model being built.
SCALE = (5.0, 5.0, 5.0)
M = None
EXTRAS = {}
LINTEL = True
#: Window dressing: whether lintels carry keystones, and how far they reach past the opening (metres).
KEYSTONE = True
LINTEL_EXT = 0.1
_dets = {}


def setup(scale, materials, keystone=True, lintel_ext=0.1, lintel=True):
    global SCALE, M, KEYSTONE, LINTEL_EXT, LINTEL
    SCALE = scale
    M = materials
    KEYSTONE = keystone
    LINTEL_EXT = lintel_ext
    LINTEL = lintel
    _dets.clear()


def det(m):
    """The `Detail` writing into mesh `m`, its palette the settlement's."""
    d = _dets.get(id(m))
    if d is None:
        pal = {
            "frame": M["frame"], "trim": M["stone"], "door": M["accent"], "doorDark": M["accentDark"],
            "metal": M["metal"], "wallSoft": M["wallShade"], "roofLight": M["tileDark"], "roof": M["tile"],
            "stoneDark": M["stoneDark"], "railing": M["railing"], "cap": M["tileDark"], "glass": M["glass"],
            "timber": M["timber"], "timberDark": M["timberDark"],
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

def wall(m, facing, plane, u0, u1, v0, v1, holes, mat, cx=0.0, cz=0.0, cuts=(), cell=(1.0, 0.85), lines=True):
    """`skit.wall` with a cell to every stretch of wall no bigger than
    `cell` metres and grid lines round each opening's dressing (jambs,
    sill, lintel): the wall under the trim is never seen, and the crease
    where the trim meets it stays in narrow cells of its own."""
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
    panel = skit.window(m, M_, facing, plane, u, v, w, h, cx, cz, depth, frame, bars, glass, reveal, sill, shutters, flowers, holes, sill_mat)
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
    # The lintel and keystone, over the frame ring.
    ext = d.U(facing, LINTEL_EXT)
    top = v + hh
    if LINTEL:
        d.wbox(facing, plane, u - hw - ext, u + hw + ext, top, top + d.V(0.13), 0.0, d.O(facing, 0.03), "trim", cx, cz, ("back",))
    if LINTEL and KEYSTONE:
        kw = d.U(facing, 0.09)
        d.wbox(facing, plane, u - kw, u + kw, top, top + d.V(0.2), d.O(facing, 0.03), d.O(facing, 0.058), "trim", cx, cz, ("back",))
    return panel


# ---------------------------------------------------------------- doors

def door(m, M_, facing, plane, u, v, w, h, cx=0.0, cz=0.0, depth=0.03, mat=None, reveal=None, fanlight=False,
         holes=None, step=True, step_mat=None, glazed=False, step_from=0.0, step_w=0.035, floor=True):
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
    if step and v > 0:
        sm = step_mat or M_["stone"]
        m.wall_box(facing, plane + step_from, u - w / 2 - step_w, u + w / 2 + step_w, 0.0, v, 0.06, sm, cx, cz, skip=("back", "bottom"))
        # A lower tread in front.
        lo = v * 0.5
        m.wall_box(facing, plane + step_from + 0.06, u - w / 2 - step_w * 1.8, u + w / 2 + step_w * 1.8, 0.0, lo, 0.028, sm, cx, cz, skip=("back", "bottom"))
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
    m.box(x - w / 2, x + w / 2, y0, top - 3 * ch - dt.V(0.05), z - d / 2, z + d / 2, stone, skip=("bottom", "top"))
    y = top - 3 * ch - dt.V(0.05)
    for k, grow in enumerate((0.03, 0.06, 0.09)):
        gx, gz = dt.X(grow), dt.Z(grow)
        m.box(x - w / 2 - gx, x + w / 2 + gx, y + ch * k * 0.5, y + ch * (k * 0.5 + 0.5) if k < 2 else y + ch * 1.5 + dt.V(0.05), z - d / 2 - gz, z + d / 2 + gz, M_["stoneDark"] if k == 2 else stone, skip=("bottom",) if k else ())
    y = y + ch * 1.5 + dt.V(0.05)
    gx, gz = dt.X(0.11), dt.Z(0.11)
    m.box(x - w / 2 - gx, x + w / 2 + gx, y, y + dt.V(0.05), z - d / 2 - gz, z + d / 2 + gz, M_["stoneDark"])
    y += dt.V(0.05)
    along_z = d > w
    pitch = (d if along_z else w) * 0.5
    for i in range(pots):
        off = 0 if pots == 1 else (i - (pots - 1) / 2) * pitch
        px, pz = (x, z + off) if along_z else (x + off, z)
        m.cylinder(px, y, y + dt.V(0.2), pz, 0.02, M_["tileDark"], segments=8, top_mat=M_["railing"])
        m.cylinder(px, y + dt.V(0.2), y + dt.V(0.24), pz, 0.026, M_["tileDark"], segments=8, top_mat=M_["railing"], bottom=True)
    return None


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
    info = skit.gable_roof(
        m, M_, x=x, z=z, y=y, w=w, d=d, rise=rise, overhang=overhang, thickness=thickness, ridge=ridge, roof=roof,
        gable=gable, cap=None, courses=n, step=step * 0.55, verge=verge, butt=butt, joints=joints * 2 if joints else 0,
        gutter=gutter, avoid=[(a0 - 0.03, a1 + 0.03, b0 - 0.03, b1 + 0.03) for a0, a1, b0, b1 in avoid], ends=ends, gables=gables, downpipe=downpipe,
    )
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

def bake(objs, distance=0.9, floor=0.7, samples=16, scale=None):
    """Bake each object's occlusion at the instance size, alone over the
    ground plane (the variants of a model all stand at the origin)."""
    sx, sy, sz = scale or SCALE
    for obj in objs:
        others = [o for o in objs if o is not obj]
        for o in others:
            o.hide_render = True
        obj.scale = (sx, sz, sy)
        bpy.context.view_layer.update()
        kit.bake_ao([obj], distance=distance, samples=samples, floor=floor)
        obj.scale = (1, 1, 1)
        for o in others:
            o.hide_render = False


def rename(objs, suffix="Near"):
    for obj in objs:
        obj.name = obj.name + suffix
        obj.data.name = obj.name
