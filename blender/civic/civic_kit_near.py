"""
The civic kit's near level: every part of `civic_kit.py` again, on the same
node names, origins and frames, with the detail a camera close to a civic
building sees -- fluted columns with a rolled base and a carved capital, a
pediment with stepped mouldings and acroteria, nosed steps, a clock with its
minute ring and counterweighted hands, a belfry with arched louvres and
pinnacles, a ribbed spire, a lantern with mullions and a ribbed dome, turned
balusters, corrugated containers with their locking gear, slatted roll-up
doors, panelled doors with pilasters and a bracketed hood, and so on.

`civic.ts` assembles a building from these exactly as it does from the lean
parts (`buildCivic(..., { near: true })`), so every wall, plot and placement
is shared; only the parts differ. Sizes and stretch axes are the lean parts':
read the header of `civic_kit.py`.

    blender -b --python blender/export.py -- blender/civic/civic_kit_near.py civic-kit-near
"""

import math
import os
import sys

import bmesh
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import civic_kit as lean  # noqa: E402
import civickit as ck  # noqa: E402
import kit  # noqa: E402
from kit import B, box  # noqa: E402


def _rot_z(obj, angle, offset=(0, 0, 0)):
    obj.data.transform(Matrix.Rotation(angle, 4, "Z") @ Matrix.Translation(kit.B(offset)))
    return obj


def flutes(name, mat, rings, flute_count=16, depth=0.06):
    """A column shaft: `rings` is (y, radius) from foot to neck, and every
    ring alternates a flute (cut in by `depth` of the radius) with an arris."""
    n = flute_count * 2
    bm = bmesh.new()
    grid = []
    for y, r in rings:
        row = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r * (1 - depth) if i % 2 else r
            row.append(bm.verts.new(B((math.cos(a) * rr, y, math.sin(a) * rr))))
        grid.append(row)
    for k in range(len(grid) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new([grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]])
            c = f.calc_center_median()
            ck.orient(f, __import__("mathutils").Vector((c.x, c.y, 0)))
    return kit._object(name, bm, mat)


# ---------------------------------------------------------------- columns

def column_base(M):
    return [
        ck.no_bottom(box("plinth", (2.7, 0.3, 2.7), (0, 0.15, 0), M["stone"], bev=0.04, seg=1)),
        ck.lathe("torus", [(1.3, 0.3), (1.34, 0.36), (1.34, 0.42), (1.3, 0.47), (1.2, 0.5), (1.1, 0.52), (1.06, 0.56), (1.08, 0.61), (1.02, 0.65), (1.0, 0.7)],
                 M["stone"], segments=16, cap_top=False, phase=math.pi / 16),
    ]


def column_shaft(M):
    # Entasis in five rings, sixteen flutes.
    rings = [(0.0, 1.0), (0.25, 0.985), (0.5, 0.95), (0.75, 0.905), (1.0, 0.86)]
    return [flutes("shaft", M["stone"], rings, 16, 0.07)]


def column_capital(M):
    return [
        ck.lathe("neck", [(0.86, 0.0), (0.9, 0.03), (0.86, 0.06)], M["stone"], segments=16, cap_top=False, phase=math.pi / 16),
        ck.lathe("echinus", [(0.86, 0.06), (0.95, 0.12), (1.06, 0.2), (1.2, 0.28), (1.32, 0.34), (1.4, 0.4)], M["stone"], segments=16, cap_top=False, phase=math.pi / 16),
        ck.no_bottom(box("abacus", (2.9, 0.4, 2.9), (0, 0.6, 0), M["stone"], bev=0.04)),
        ck.no_bottom(box("fillet", (2.6, 0.06, 2.6), (0, 0.43, 0), M["stoneDark"], bev=0.0)),
    ]


# ---------------------------------------------------------------- pediment

def pediment(M):
    parts = lean.pediment(M)
    h, d = lean.PEDIMENT["h"], lean.PEDIMENT["d"]
    # Acroteria: a block at the apex and one at each foot of the rake.
    for x, y, s in ((0.0, h + 0.03, 0.06), (-0.52, 0.0, 0.045), (0.52, 0.0, 0.045)):
        parts.append(box("acroterion", (s, s * 1.1, s * 1.4), (x, y + s * 0.55, d / 2 - 0.02), M["trim"], bev=0.004))
    # A second, lower moulding under each raking cornice: a bed mould.
    for s in (-1, 1):
        a = (s * 0.5, 0.0)
        b = (0, h - 0.005)
        t = 0.02
        prof = [(a[0], a[1] + 0.004), (b[0], b[1] + 0.004), (b[0], b[1] - t), (a[0], a[1] + 0.004 - t)]
        parts.append(ck.xy_prism("bed", prof if s > 0 else list(reversed(prof)), d / 2 - 0.045, d / 2 + 0.03, M["trim"]))
    # A raised panel in the tympanum, over the recessed one, round the oculus.
    parts.append(ck.xy_prism("panel", [(-0.34, 0.06), (0.34, 0.06), (0.0, h - 0.07)], d / 2 - 0.02, d / 2 - 0.005, M["stone"]))
    # Dentils along the front of the corona: blocks standing off its face.
    n = 34
    front = 0.01 + (d + 0.08) / 2
    for i in range(n):
        x = -0.5 + (i + 0.5) / n
        parts.append(box("dentil", (0.017, 0.02, 0.025), (x, 0.0, front + 0.0125), M["trim"], bev=0.0))
    return parts


# ---------------------------------------------------------------- steps

def steps(M, treads):
    parts = []
    for i in range(treads):
        top = 1 - i / treads
        z0, z1 = i / treads, (i + 1) / treads
        w = 1 - i * 0.04
        parts.append(ck.no_bottom(box("tread", (w, top, z1 - z0 + 0.001), (0, top / 2, (z0 + z1) / 2), M["stone"], bev=0.0)))
        # A bullnosed lip on the front edge: a rounded profile the width of the step.
        r = 0.045
        prof = [(z1 - 0.004, top - 0.1), (z1 + 0.012, top - 0.1), (z1 + 0.024 + r * 0.3, top - 0.06), (z1 + 0.024 + r * 0.5, top - 0.03), (z1 + 0.02, top + 0.0), (z1 - 0.004, top)]
        obj = kit.prism("nosing", [(p[0], p[1]) for p in prof], w + 0.01, M["trim"], x=0.0, bev=0.0)
        parts.append(obj)
        # A shadow-line groove in the riser.
        parts.append(ck.face("groove", [(-w / 2 + 0.02, top - 0.14, z1 + 0.0125), (w / 2 - 0.02, top - 0.14, z1 + 0.0125), (w / 2 - 0.02, top - 0.17, z1 + 0.0125), (-w / 2 + 0.02, top - 0.17, z1 + 0.0125)], M["stoneDark"], (0, 0, 1)))
    return parts


def step_cheek(M):
    parts = lean.step_cheek(M)
    # A raised panel on each outer face of the cheek.
    for x in (-0.515, 0.515):
        parts.append(box("panelFace", (0.03, 0.62, 0.66), (x, 0.52, 0.5), M["stoneDark"], bev=0.0))
    return parts


# ---------------------------------------------------------------- clock

def clock(M):
    parts = [
        ck.drop_faces(kit.cyl("bezel", 1.14, 0.1, (0, 0, 0.05), M["trim"], axis="z", verts=32), lambda n: n.y > 0.9),
        ck.drop_faces(kit.cyl("bezelRim", 1.06, 0.14, (0, 0, 0.07), M["stone"], axis="z", verts=32), lambda n: n.y > 0.9),
        ck.face("face", [(math.cos(a) * 0.98, math.sin(a) * 0.98, 0.15) for a in (2 * math.pi * (i + 0.5) / 32 for i in range(32))], M["stone"], (0, 0, 1)),
    ]
    z = 0.2
    for hour in range(12):
        a = hour * math.pi / 6
        long = 0.16 if hour % 3 == 0 else 0.1
        wide = 0.07 if hour % 3 == 0 else 0.05
        c, s = math.cos(a), math.sin(a)
        r0, r1 = 0.84 - long, 0.84
        parts.append(ck.face("tick", [
            (s * r0 - c * wide / 2, c * r0 + s * wide / 2, z), (s * r0 + c * wide / 2, c * r0 - s * wide / 2, z),
            (s * r1 + c * wide / 2, c * r1 - s * wide / 2, z), (s * r1 - c * wide / 2, c * r1 + s * wide / 2, z)], M["door"], (0, 0, 1)))
    # The minute ring: a small tick every five degrees off the hours.
    for minute in range(60):
        if minute % 5 == 0:
            continue
        a = minute * math.pi / 30
        c, s = math.cos(a), math.sin(a)
        r0, r1, wide = 0.9, 0.95, 0.018
        parts.append(ck.face("minute", [
            (s * r0 - c * wide / 2, c * r0 + s * wide / 2, z), (s * r0 + c * wide / 2, c * r0 - s * wide / 2, z),
            (s * r1 + c * wide / 2, c * r1 - s * wide / 2, z), (s * r1 - c * wide / 2, c * r1 + s * wide / 2, z)], M["door"], (0, 0, 1)))
    # Ten to two: spade hands with a tail, each in two layers.
    for angle, length, wide, lift in ((math.radians(-60), 0.5, 0.1, 0.05), (math.radians(60), 0.78, 0.06, 0.1)):
        c, s = math.cos(angle), math.sin(angle)

        def p(u, v, lz):
            # u across the hand, v along it
            return (c * u + s * v, -s * u + c * v, lz)

        outline = [(-wide / 2, -0.16), (wide / 2, -0.16), (wide / 2, 0.0), (wide * 0.95, length * 0.62), (0.0, length), (-wide * 0.95, length * 0.62), (-wide / 2, 0.0)]
        parts.append(ck.face("hand", [p(u, v, z + lift) for u, v in outline], M["door"], (0, 0, 1)))
        # A counterweight disc on the tail.
        parts.append(ck.face("tail", [p(0.045 * math.cos(2 * math.pi * k / 8), -0.16 + 0.045 * math.sin(2 * math.pi * k / 8), z + lift + 0.025) for k in range(8)], M["door"], (0, 0, 1)))
    boss = ck.face("boss", [(math.cos(a) * 0.08, math.sin(a) * 0.08, z + 0.045) for a in (2 * math.pi * i / 10 for i in range(10))], M["metal"], (0, 0, 1))
    boss.data.transform(Matrix.Translation(kit.B((0, 0, 0.1))))
    parts.append(boss)
    return parts


# ---------------------------------------------------------------- belfry, spire

def belfry(M):
    parts = [ck.no_bottom(box("floor", (1.24, 0.16, 1.24), (0, 0.08, 0), M["trim"], bev=0.01))]
    stage0, stage1 = 0.16, 0.86
    for dx in (-1, 1):
        for dz in (-1, 1):
            parts.append(ck.no_bottom(box("pier", (0.2, stage1 - stage0, 0.2), (dx * 0.4, (stage0 + stage1) / 2, dz * 0.4), M["stone"], bev=0.008)))
            # A moulded cap and base to each pier.
            parts.append(box("pierCap", (0.25, 0.04, 0.25), (dx * 0.4, stage1 - 0.02, dz * 0.4), M["trim"], bev=0.0))
            parts.append(box("pierBase", (0.24, 0.04, 0.24), (dx * 0.4, stage0 + 0.02, dz * 0.4), M["trim"], bev=0.0))
    spring = stage1 - 0.24
    crown = spring + 0.18
    curve = [(-0.3 * math.cos(math.pi * k / 8), spring + 0.18 * math.sin(math.pi * k / 8)) for k in range(0, 9)]
    curve[0], curve[8] = (-0.3, spring), (0.3, spring)
    for facing in range(4):
        sheets = []

        def tri(a, b, c, z, out):
            f = ck.face("archface", [(a[0], a[1], z), (b[0], b[1], z), (c[0], c[1], z)], M["stone"], out)
            f.data.transform(Matrix.Rotation(facing * math.pi / 2, 4, "Z"))
            sheets.append(f)

        # The spandrels, as fans from the corners over the arch curve, front and
        # back (each convex, so no triangulation to go wrong), and the header
        # block over the crown.
        for corner, pts in (((-0.3, crown), curve[:5]), ((0.3, crown), curve[4:])):
            fan = [(corner[0], spring)] + pts if False else pts
            for p0, p1 in zip(fan, fan[1:]):
                tri(corner, p0, p1, 0.48, (0, 0, 1))
                tri(corner, p1, p0, 0.36, (0, 0, -1))
            edge = (corner[0], spring)
            tri(corner, edge, fan[0] if corner[0] < 0 else fan[-1], 0.48, (0, 0, 1))
            tri(corner, fan[0] if corner[0] < 0 else fan[-1], edge, 0.36, (0, 0, -1))
        parts += sheets
        header = box("header", (0.6, stage1 - crown, 0.12), (0, (crown + stage1) / 2, 0.42), M["stone"], bev=0.0)
        header.data.transform(Matrix.Rotation(facing * math.pi / 2, 4, "Z"))
        parts.append(header)
        # Louvres in the opening: slats behind the arch's face.
        for k in range(6):
            y = stage0 + 0.06 + k * 0.085
            slat = box("louvre", (0.56, 0.03, 0.05), (0, y, 0.4), M["door"], bev=0.0)
            slat.data.transform(Matrix.Rotation(facing * math.pi / 2, 4, "Z"))
            parts.append(slat)
    parts.append(ck.lathe("bell", [(0.24, 0.3), (0.2, 0.36), (0.15, 0.48), (0.13, 0.55), (0.12, 0.6), (0.07, 0.63), (0.0, 0.64)], M["metal"], segments=14, cap_top=False, cap_bottom=True))
    parts.append(ck.no_bottom(box("yoke", (0.5, 0.05, 0.06), (0, 0.66, 0), M["door"], bev=0.0)))
    parts.append(box("cornice", (1.4, 0.1, 1.4), (0, stage1 + 0.05, 0), M["trim"], bev=0.01))
    parts.append(ck.no_bottom(box("corniceTop", (1.3, 0.08, 1.3), (0, stage1 + 0.14, 0), M["trim"], bev=0.0)))
    # Pinnacles at the corners of the cornice.
    for dx in (-1, 1):
        for dz in (-1, 1):
            parts.append(ck.lathe("pinnacle", [(0.05, stage1 + 0.1), (0.04, stage1 + 0.17), (0.055, stage1 + 0.19), (0.0, stage1 + 0.28)], M["trim"], segments=6, pos=(dx * 0.6, 0, dz * 0.6)))
    return parts


def spire(M):
    H = lean.SPIRE_H
    parts = [
        # The square base broaches into the octagon at half height.
        ck.lathe("broach", [(0.68, 0.0), (0.68, 0.12), (0.52, 0.26), (0.38, 0.38), (0.3, 0.46)], M["accent"], segments=4, phase=math.pi / 4, cap_top=False),
        ck.lathe("needle", [(0.3, 0.46), (0.27, 0.6), (0.22, 0.78), (0.16, 0.96), (0.08, 1.08), (0.0, H - 0.18)], M["accent"], segments=8, phase=math.pi / 8, cap_top=False),
        ck.lathe("collar", [(0.31, 0.44), (0.36, 0.5), (0.31, 0.56)], M["trim"], segments=8, phase=math.pi / 8, cap_top=False),
        ck.lathe("collarTop", [(0.18, 0.86), (0.22, 0.9), (0.18, 0.94)], M["trim"], segments=8, phase=math.pi / 8, cap_top=False),
        ck.lathe("ball", [(0.0, H - 0.2), (0.05, H - 0.18), (0.07, H - 0.15), (0.07, H - 0.11), (0.05, H - 0.07), (0.0, H - 0.03)], M["metal"], segments=10),
        box("rod", (0.02, 0.3, 0.02), (0, H + 0.1, 0), M["metal"], bev=0.0),
        ck.face("vane", [(-0.02, H + 0.12, 0), (0.24, H + 0.12, 0), (0.2, H + 0.2, 0), (-0.02, H + 0.2, 0)], M["metal"], (0, 0, 1)),
        ck.face("vane", [(-0.02, H + 0.12, 0), (-0.02, H + 0.2, 0), (0.2, H + 0.2, 0), (0.24, H + 0.12, 0)], M["metal"], (0, 0, -1)),
    ]
    return parts


# ---------------------------------------------------------------- lantern

def lantern(M, glow=False):
    if glow:
        return lean.lantern(M, glow=True)
    parts = lean.lantern(M, glow=False)
    r = 0.5
    apothem = r * math.cos(math.pi / 8)
    # A mullion at every corner of the drum, and a transom band.
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8 + math.pi / 8 + math.pi / 8
        parts.append(box("mullion", (0.05, lean.DRUM_H - 0.06, 0.05), (math.cos(a) * (apothem + 0.05), (lean.DRUM_H + 0.14) / 2, math.sin(a) * (apothem + 0.05)), M["stone"], bev=0.0, rot=(0, -a, 0)))
    # Ribs on the dome.
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8
        pts = []
        for k in range(0, 5):
            t = k * math.pi / 2 / 4
            pts.append((0.58 * math.cos(t) * math.cos(a), lean.DRUM_H + 0.1 + 0.5 * math.sin(t), 0.58 * math.cos(t) * math.sin(a)))
        for p, q in zip(pts, pts[1:]):
            parts.append(kit.strut("rib", p, q, (0.03, 0.03), M["trim"]))
    return parts


# ---------------------------------------------------------------- smaller parts

def baluster(M):
    return [
        box("foot", (0.3, 0.12, 0.3), (0, 0.06, 0), M["stone"], bev=0.01),
        ck.lathe("vase", [(0.1, 0.12), (0.12, 0.16), (0.1, 0.19), (0.15, 0.27), (0.17, 0.36), (0.16, 0.44), (0.1, 0.56), (0.075, 0.66), (0.09, 0.72), (0.12, 0.78), (0.13, 0.84), (0.12, 0.9)], M["stone"], segments=12, cap_top=False),
        box("cap", (0.3, 0.1, 0.3), (0, 0.95, 0), M["stone"], bev=0.01),
    ]


def container(M):
    L, H, D = 2.0, 0.86, 0.92
    parts = [ck.no_bottom(box("shell", (L - 0.06, H - 0.06, D - 0.06), (0, H / 2, 0), M["container"], bev=0.0))]
    # Corrugation as real ribs: trapezoid sections down both flanks.
    n = 16
    for i in range(n):
        x = -L / 2 + 0.16 + i * (L - 0.32) / (n - 1)
        for s in (-1, 1):
            z0 = s * (D / 2 - 0.03)
            z1 = s * (D / 2)
            w0, w1 = 0.05, 0.03
            y0, y1 = 0.07, H - 0.07
            prof = [(x - w0, z0), (x + w0, z0), (x + w1, z1), (x - w1, z1)]
            parts.append(ck.face("rib", [(x - w1, y0, z1), (x + w1, y0, z1), (x + w1, y1, z1), (x - w1, y1, z1)][:: -s if s < 0 else 1], M["containerDark"], (0, 0, s)))
            parts.append(ck.face("ribSide", [(x + w0, y0, z0), (x + w1, y0, z1), (x + w1, y1, z1), (x + w0, y1, z0)][:: -s if s < 0 else 1], M["containerDark"], (1, 0, s)))
            parts.append(ck.face("ribSide", [(x - w1, y0, z1), (x - w0, y0, z0), (x - w0, y1, z0), (x - w1, y1, z1)][:: -s if s < 0 else 1], M["containerDark"], (-1, 0, s)))
            del prof
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(ck.no_bottom(box("post", (0.09, H, 0.09), (sx * (L / 2 - 0.045), H / 2, sz * (D / 2 - 0.045)), M["containerDark"], bev=0.0)))
            # Corner castings on top.
            parts.append(box("casting", (0.14, 0.05, 0.14), (sx * (L / 2 - 0.045), H + 0.0, sz * (D / 2 - 0.045)), M["metal"], bev=0.0))
    for sz in (-1, 1):
        parts.append(box("rail", (L - 0.18, 0.07, 0.08), (0, H - 0.035, sz * (D / 2 - 0.04)), M["containerDark"], bev=0.0))
        parts.append(box("sill", (L - 0.18, 0.07, 0.08), (0, 0.035, sz * (D / 2 - 0.04)), M["containerDark"], bev=0.0))
    # Door end: four locking rods with cams and two handles.
    for z in (-0.28, -0.1, 0.1, 0.28):
        parts.append(ck.face("bar", [(L / 2 + 0.004, 0.08, z - 0.012), (L / 2 + 0.004, 0.08, z + 0.012), (L / 2 + 0.004, H - 0.08, z + 0.012), (L / 2 + 0.004, H - 0.08, z - 0.012)], M["metal"], (1, 0, 0)))
        for y in (0.2, H - 0.2):
            parts.append(box("cam", (0.03, 0.04, 0.05), (L / 2 + 0.018, y, z), M["metal"], bev=0.0))
    for z in (-0.19, 0.19):
        parts.append(box("handle", (0.035, 0.22, 0.03), (L / 2 + 0.024, H * 0.5, z), M["metal"], bev=0.0))
    return parts


def roll_door(M):
    parts = [
        ck.no_bottom(box("jambL", (0.08, 1.0, 0.1), (-0.46, 0.5, 0.05), M["trim"], bev=0.0)),
        ck.no_bottom(box("jambR", (0.08, 1.0, 0.1), (0.46, 0.5, 0.05), M["trim"], bev=0.0)),
        box("hood", (1.04, 0.1, 0.16), (0, 1.02, 0.08), M["metal"], bev=0.02),
        # Guide rails inside the jambs and a bottom bar.
        ck.no_bottom(box("railL", (0.03, 0.96, 0.05), (-0.415, 0.48, 0.045), M["metal"], bev=0.0)),
        ck.no_bottom(box("railR", (0.03, 0.96, 0.05), (0.415, 0.48, 0.045), M["metal"], bev=0.0)),
        box("bar", (0.84, 0.035, 0.07), (0, 0.037, 0.045), M["metal"], bev=0.0),
    ]
    slats = 20
    for i in range(slats):
        y0, y1 = 0.055 + 0.865 * i / slats, 0.055 + 0.865 * (i + 1) / slats
        h_ = y1 - y0
        # A rolled section: a flat face, a bead at its head and an under-lip.
        parts.append(ck.face("slat", [(-0.4, y0 + h_ * 0.08, 0.05), (0.4, y0 + h_ * 0.08, 0.05), (0.4, y0 + h_ * 0.62, 0.046), (-0.4, y0 + h_ * 0.62, 0.046)], M["door"], (0, 0, 1)))
        parts.append(ck.face("bead", [(-0.4, y0 + h_ * 0.62, 0.046), (0.4, y0 + h_ * 0.62, 0.046), (0.4, y0 + h_ * 0.82, 0.058), (-0.4, y0 + h_ * 0.82, 0.058)], M["door"], (0, 0.5, 1)))
        parts.append(ck.face("bead", [(-0.4, y0 + h_ * 0.82, 0.058), (0.4, y0 + h_ * 0.82, 0.058), (0.4, y1, 0.05), (-0.4, y1, 0.05)], M["doorDark"], (0, -0.5, 1)))
        parts.append(ck.face("lip", [(-0.4, y0, 0.02), (0.4, y0, 0.02), (0.4, y0 + h_ * 0.08, 0.05), (-0.4, y0 + h_ * 0.08, 0.05)], M["doorDark"], (0, -1, 0.3)))
    parts.append(box("handle", (0.2, 0.03, 0.04), (0, 0.12, 0.075), M["metal"], bev=0.0))
    # Vision slits in the top slats.
    for k in range(6):
        x = -0.3 + 0.12 * k
        parts.append(ck.face("slit", [(x - 0.04, 0.83, 0.03), (x + 0.04, 0.83, 0.03), (x + 0.04, 0.86, 0.03), (x - 0.04, 0.86, 0.03)], M["window"], (0, 0, 1)))
    return parts


def door(M):
    h = lean.DOOR["h"]
    parts = [
        ck.no_bottom(box("leafs", (0.8, h * 0.86, 0.04), (0, h * 0.43, 0.02), M["door"], bev=0.0)),
        ck.no_bottom(box("jambL", (0.12, h * 0.9, 0.08), (-0.46, h * 0.45, 0.04), M["trim"], bev=0.0)),
        ck.no_bottom(box("jambR", (0.12, h * 0.9, 0.08), (0.46, h * 0.45, 0.04), M["trim"], bev=0.0)),
        box("lintel", (1.1, 0.12, 0.1), (0, h * 0.9 + 0.06, 0.05), M["trim"], bev=0.0),
        box("hood", (1.24, 0.08, 0.18), (0, h * 0.9 + 0.16, 0.09), M["trim"], bev=0.02),
    ]
    # Raised panels in stiles and rails, two a leaf tall and two above.
    for x in (-0.2, 0.2):
        for y0, y1 in ((0.1, 0.9), (1.05, h * 0.62)):
            parts.append(ck.face("panelBed", [(x - 0.13, y0, 0.056), (x + 0.13, y0, 0.056), (x + 0.13, y1, 0.056), (x - 0.13, y1, 0.056)], M["doorDark"], (0, 0, 1)))
            parts.append(box("panelRaised", (0.2, y1 - y0 - 0.1, 0.02), (x, (y0 + y1) / 2, 0.066), M["door"], bev=0.004))
    # A fanlight with radial bars and its sill.
    fh0, fh1 = h * 0.7, h * 0.82
    parts.append(ck.face("fanlight", [(-0.34, fh0, 0.056), (0.34, fh0, 0.056), (0.34, fh1, 0.056), (-0.34, fh1, 0.056)], M["window"], (0, 0, 1)))
    for k in range(-3, 4):
        parts.append(box("fanbar", (0.012, fh1 - fh0, 0.02), (k * 0.1, (fh0 + fh1) / 2, 0.068), M["trim"], bev=0.0))
    parts.append(box("fanrail", (0.68, 0.018, 0.02), (0.0, (fh0 + fh1) / 2, 0.068), M["trim"], bev=0.0))
    parts.append(ck.face("seam", [(-0.01, 0.05, 0.056), (0.01, 0.05, 0.056), (0.01, h * 0.66, 0.056), (-0.01, h * 0.66, 0.056)], M["doorDark"], (0, 0, 1)))
    # Handles and brackets under the hood.
    for x in (-0.05, 0.05):
        parts.append(box("pull", (0.02, 0.16, 0.03), (x, h * 0.36, 0.085), M["metal"], bev=0.0))
    for x in (-0.55, 0.55):
        parts.append(box("bracket", (0.05, 0.18, 0.1), (x * 0.94, h * 0.9 + 0.02, 0.08), M["trim"], bev=0.0))
    # Hinges on the outer stiles, a kick plate, a letterbox and a knocker.
    for y in (0.22, h * 0.36, h * 0.66):
        for x in (-0.395, 0.395):
            parts.append(box("hinge", (0.09, 0.05, 0.03), (x, y, 0.06), M["metal"], bev=0.0))
    parts.append(box("kick", (0.5, 0.12, 0.012), (0, 0.11, 0.064), M["metal"], bev=0.0))
    parts.append(box("letterbox", (0.22, 0.05, 0.02), (0, h * 0.5, 0.078), M["metal"], bev=0.0))
    parts.append(box("knockPlate", (0.07, 0.11, 0.015), (0, h * 0.58, 0.075), M["metal"], bev=0.0))
    parts.append(box("knocker", (0.04, 0.07, 0.03), (0, h * 0.58 - 0.02, 0.098), M["metal"], bev=0.0))
    return parts


def buttress(M):
    # Stepped offsets need no more than the lean part's: the near level adds
    # nothing that would leave a ledge a hand wide.
    return lean.buttress(M)


def vent(M):
    parts = [
        ck.lathe("drum", [(1.0, 0.0), (1.06, 0.06), (1.0, 0.12), (1.0, 1.4)], M["metal"], segments=16, cap_top=False),
        ck.lathe("hat", [(0.6, 1.4), (1.2, 1.5), (1.5, 1.6), (0.9, 1.9), (0.0, 2.2)], M["metal"], segments=16, cap_bottom=False),
        ck.lathe("hatUnder", [(0.0, 1.62), (1.5, 1.6)], M["metal"], segments=16, cap_top=False),
    ]
    for k in range(4):
        y = 0.3 + 0.28 * k
        parts.append(ck.lathe("band", [(1.0, y), (1.14, y + 0.04), (1.14, y + 0.1), (1.0, y + 0.14)], M["metal"], segments=16, cap_top=False))
    return parts


def flag_pole(M):
    return [ck.lathe("pole", [(1.0, 0.0), (0.95, 0.25), (0.86, 0.5), (0.78, 0.75), (0.7, 1.0)], M["metal"], segments=10, cap_top=True)]


def flag_top(M):
    s = lean.FLAG_SIZE
    parts = [ck.lathe("ball", [(0.0, 0.0), (0.06, 0.02), (0.11, 0.06), (0.12, 0.1), (0.11, 0.14), (0.06, 0.18), (0.0, 0.2)], M["trim"], segments=10)]
    cols = [i / 6 * 1.5 for i in range(7)]
    wave = [0.0, 0.06, 0.1, 0.05, -0.02, 0.07, 0.14]
    y0, y1 = -s * 0.62, -s * 0.06
    for i in range(6):
        xa, xb = cols[i] * s, cols[i + 1] * s
        za, zb = wave[i] * s, wave[i + 1] * s
        droop = 0.03 * i * 0.5
        quad = [(xa, y0 - droop, za), (xb, y0 - droop - 0.015, zb), (xb, y1 - droop - 0.015, zb), (xa, y1 - droop, za)]
        parts.append(ck.face("cloth", quad, M["flag"], (-(zb - za), 0, xb - xa)))
        parts.append(ck.face("cloth", list(reversed(quad)), M["flag"], ((zb - za), 0, -(xb - xa))))
    return parts


def sill(M):
    parts = [ck.drop_faces(box("sill", (1.0, 0.07, 0.09), (0, -0.035, 0.045), M["trim"], bev=0.0), lambda n: n.z < -0.9 or n.y > 0.9)]
    parts.append(ck.drop_faces(box("apron", (0.96, 0.04, 0.05), (0, -0.09, 0.025), M["trim"], bev=0.0), lambda n: n.z < -0.9 or n.y > 0.9))
    return parts


def hood(M):
    prof = [(0.0, 0.0), (0.06, 0.0), (0.06, 0.03), (0.075, 0.04), (0.09, 0.06), (0.12, 0.08), (0.12, 0.11), (0.0, 0.11)]
    obj = kit.prism("hood", prof, 1.0, M["trim"], bev=0.0)
    parts = [ck.drop_faces(obj, lambda n: n.z < -0.9 or n.y > 0.9)]
    for x in (-0.45, 0.45):
        parts.append(ck.drop_faces(box("bracket", (0.05, 0.06, 0.055), (x, -0.03, 0.0275), M["trim"], bev=0.0), lambda n: n.z < -0.9 or n.y > 0.9))
    return parts


def bench(M):
    parts = [
        ck.no_bottom(box("endA", (0.3, 0.42, 0.08), (0, 0.21, -0.42), M["stone"], bev=0.008)),
        ck.no_bottom(box("endB", (0.3, 0.42, 0.08), (0, 0.21, 0.42), M["stone"], bev=0.008)),
        box("stretcher", (0.06, 0.05, 0.76), (0.1, 0.2, 0), M["stone"], bev=0.0),
    ]
    for i in range(4):
        z = -0.375 + 0.25 * i
        parts.append(box("slat", (0.36, 0.05, 0.22), (0, 0.45, z + 0.0), M["door"], bev=0.008))
    for i in range(3):
        z = -0.3 + 0.3 * i
        parts.append(box("backSlat", (0.04, 0.12, 0.24), (-0.16, 0.6 + (i % 2) * 0.0, z), M["door"], bev=0.006))
        parts.append(box("backSlat", (0.04, 0.12, 0.24), (-0.16, 0.74, z), M["door"], bev=0.006))
    return parts


NODES = {
    "ColumnBase": column_base,
    "ColumnShaft": column_shaft,
    "ColumnCapital": column_capital,
    "Pediment": pediment,
    "Steps3": lambda M: steps(M, 3),
    "Steps4": lambda M: steps(M, 4),
    "StepCheek": step_cheek,
    "Clock": clock,
    "Belfry": belfry,
    "Spire": spire,
    "Lantern": lambda M: lantern(M),
    "LanternGlow": lambda M: lantern(M, glow=True),
    "Baluster": baluster,
    "Container": container,
    "RollDoor": roll_door,
    "Door": door,
    "Buttress": buttress,
    "Vent": vent,
    "FlagPole": flag_pole,
    "FlagTop": flag_top,
    "Sill": sill,
    "Hood": hood,
    "Bench": bench,
}


def build():
    kit.reset()
    M = lean.palette()
    objs = []
    for name, make in NODES.items():
        objs.append(kit.finish(make(M), name))
    for i, obj in enumerate(objs):
        obj.location.x = (i % 6 - 2.5) * 6
        obj.location.y = (i // 6 - 2) * 6
    kit.bake_ao([o for o in objs if not o.name.endswith("Glow")], distance=0.3, samples=16, floor=0.6)
    for obj in objs:
        obj.location.x = obj.location.y = 0
        print("TRIS", obj.name, ck.triangles(obj))
    return objs


def preview(n):
    return build()
