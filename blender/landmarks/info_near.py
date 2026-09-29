"""
The information centre's near level: the three levels of `info.py` (kiosk,
visitor centre, library and garden), each the lean model drawn over with
window frames and glazing, paving slabs, gravel on the flat roofs, lettering
on the signs and fingerposts, planting in leaf, cast-iron lamps and benches,
a fluted colonnade with a dentilled entablature.

  blender -b --python blender/export.py -- blender/landmarks/info_near.py info-centre-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
from kit import finish  # noqa: E402

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "info.py"))
DECK = lean.DECK

REPLACED = ("letters", "lampFoot", "lampPost", "lampGlass", "lampHat", "lampCollar", "seat", "back", "benchLeg", "bench")


def windows(acc, obj, M):
    sash = {"frame": M["frame"], "trim": M["wall"]}
    for o in nkit.openings(obj):
        cx, cy, cz = o["centre"]
        wide = o["w"] > 2.5
        door = o["h"] > 2.0 and o["w"] < 2.0
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            if wide:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="steel", bars=(1, 1))
            elif door:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="steel", bars=(2, 4))
            else:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="plain", bars=(2, 4), sill=True, lintel=True)


def fingerposts(acc, M, level):
    words = ["DOCS", "README", "GUIDE"]
    for x, blades, direction in ((-7.9, 3 if level >= 2 else 2, 1), (7.9, 3 if level >= 3 else 2, -1)):
        for i in range(blades):
            y = DECK + 2.75 - i * 0.62
            turn = (0 if direction > 0 else math.pi) + (0.3 if i % 2 == 0 else -0.3)
            word = words[(i + (0 if direction > 0 else 1)) % 3]
            # White lettering on both faces; the back one is read from the other side.
            with acc.at((x, y, 4.6), turn):
                nd.letters(acc, M["wall"], word, 0.24, pos=(0.9, 0.0, 0.06), depth=0.02)
            with acc.at((x, y, 4.6), turn + math.pi):
                nd.letters(acc, M["wall"], word, 0.24, pos=(-0.9, 0.0, 0.06), depth=0.02)
            # Fixing bolts and a cap ring on the post.
            with acc.at((x, y, 4.6), turn):
                for u in (0.28, 1.5):
                    acc.cyl(M["roofDark"], 0.02, 0.03, (u, 0.0, 0.065), axis="z", sides=6)
        for yy in (DECK + 1.0, DECK + 2.2, DECK + 3.0):
            acc.cyl(M["roofDark"], 0.115, 0.06, (x, yy, 4.6), sides=8)


def map_board(acc, M, x, z, width, height):
    tilt = -0.16
    fy = DECK + 1.75
    # Blocks and a legend on the map, stood a hair off it.
    up, out = (math.cos(tilt), math.sin(tilt)), (-math.sin(tilt), math.cos(tilt))

    def on(du, dv, off):
        return (x + du, fy + dv * up[0] + off * out[0], z + dv * up[1] + off * out[1])

    for i, (du, dv, w, h) in enumerate(((-0.5, 0.35, 0.3, 0.2), (-0.15, 0.3, 0.25, 0.25), (0.35, 0.3, 0.3, 0.2), (-0.55, -0.1, 0.25, 0.3),
                                        (0.5, -0.05, 0.3, 0.35), (-0.3, -0.4, 0.3, 0.16), (0.2, -0.38, 0.28, 0.2), (0.75, 0.35, 0.2, 0.2))):
        if abs(du) * 2 > width - 0.55:
            continue
        acc.box(M["roofDark"], (w * width / 2.2, h * height / 1.5, 0.012), on(du * width * 0.4, dv * height * 0.4, 0.095), rot=(tilt, 0, 0), skip=("nz",))
    for k in range(4):
        acc.box(M["sign"], (0.16, 0.03, 0.01), on(-width / 2 + 0.55 + k * 0.05, -height / 2 + 0.16, 0.09), rot=(tilt, 0, 0))
    # A frame moulding, bolts and a rain lip on the roof.
    with acc.at((x, fy, z), rot=(tilt, 0, 0)):
        acc.rect_frame(M["roof"], -width / 2, width / 2, -height / 2, height / 2, [(0, 0), (0, 0.05), (0.04, 0.05), (0.04, 0)], z=0.06)
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.cyl(M["roofDark"], 0.018, 0.02, (sx * (width / 2 - 0.08), sy * (height / 2 - 0.08), 0.075), axis="z", sides=6)


def planter(acc, M, x, z, w=1.3, d=1.3, seed=1):
    r = min(w, d) * 0.42
    nd.foliage(acc, M["leaf"], (x, DECK + 0.55 + r * 0.72, z), r, 70, size=0.09, seed=seed, squash=0.8, dark=M["green"])
    for k in range(9):
        a = k * 2.4
        acc.sphere(M["sign"], 0.035, (x + math.cos(a) * r * 0.7, DECK + 0.62 + r * 1.2 + (k % 3) * 0.05, z + math.sin(a) * r * 0.7), sides=6, rings=3)
    acc.rect_run(M["wall"], x - w / 2, x + w / 2, z - d / 2, z + d / 2, [(0, 0), (0.035, 0), (0.035, 0.04), (0, 0.04)], y=DECK + 0.02)


def bench(acc, M, x, z, turn):
    nd.bench(acc, {"wood": M["roof"], "iron": M["frame"]}, (x, DECK, z), turn, length=1.7)


def ground(acc, obj, M):
    free = nkit.ground_free(obj, DECK)
    nd.paving(acc, M["paving"], -8.6, 8.6, -5.6, 5.6, DECK, size=0.45, keep=free)
    # Kerb stones along the pavement, a drain and a manhole.
    n = 26
    for i in range(n):
        acc.box(M["wall"], (17.2 / n - 0.02, 0.05, 0.22), (-8.6 + (i + 0.5) * 17.2 / n, DECK + 0.06, 5.45), skip=("ny",))
    for gx in (-3.2, 3.6):
        acc.box(M["roofDark"], (0.6, 0.02, 0.34), (gx, DECK + 0.02, 5.0))
        for k in range(6):
            acc.box(M["frame"], (0.03, 0.02, 0.32), (gx - 0.25 + k * 0.1, DECK + 0.035, 5.0))


def roof_gravel(acc, obj, M, y, x0, x1, z0, z1, count, seed):
    free = nkit.ground_free(obj, y)
    nd.pebbles(acc, M["paving"], x0, x1, z0, z1, y, count, size=0.045, seed=seed, keep=free)


def gutters(acc, M, x0, x1, z0, z1, y):
    for a, b in (((x0, z1), (x1, z1)), ((x0, z0), (x1, z0))):
        nd.gutter(acc, M["frame"], a, b, y)
    nd.downpipe(acc, M["frame"], x1 + 0.05, z0 + 0.15, DECK, y - 0.05, yaw=math.pi / 2)
    nd.downpipe(acc, M["frame"], x0 - 0.05, z0 + 0.15, DECK, y - 0.05, yaw=-math.pi / 2)


def kiosk(acc, obj, M):
    x, z = -1.0, -0.4
    nd.letters(acc, M["wall"], "INFORMATION", 0.3, pos=(x + 0.35, DECK + 2.6, z + 1.78), depth=0.02)
    # A rolled shutter box and slats over the hatch, and leaflet racks either side.
    acc.box(M["roof"], (3.2, 0.16, 0.14), (x, DECK + 2.45, z + 1.68))
    for s in (-1, 1):
        acc.box(M["frame"], (0.06, 1.7, 0.08), (x + s * 1.53, DECK + 1.55, z + 1.66))
        for r in range(3):
            acc.box(M["roof"], (0.5, 0.03, 0.2), (x + s * 2.15, DECK + 1.15 + r * 0.32, z + 1.5), rot=(-0.3, 0, 0))
            for k in range(4):
                acc.box((M["sign"], M["wall"])[k % 2], (0.09, 0.2, 0.012), (x + s * 2.15 - 0.18 + k * 0.12, DECK + 1.25 + r * 0.32, z + 1.45), rot=(-0.3, 0, 0))
        acc.box(M["roof"], (0.56, 1.3, 0.05), (x + s * 2.15, DECK + 1.6, z + 1.38))
    # Standing seams on the canopy roof and its gutter.
    for k in range(13):
        acc.box(M["roof"], (0.04, 0.05, 4.5), (x - 2.4 + k * 0.4, DECK + 3.27, z + 0.4))
    gutters(acc, M, x - 2.6, x + 2.6, z - 1.9, z + 2.7, DECK + 3.0)
    # A bike rack of inverted hoops.
    for k in range(4):
        bx = x + 3.4 + k * 0.5
        acc.rod(M["roofDark"], (bx, DECK, z - 1.3), (bx, DECK + 0.7, z - 1.3), 0.022, sides=6)
        acc.rod(M["roofDark"], (bx + 0.34, DECK, z - 1.3), (bx + 0.34, DECK + 0.7, z - 1.3), 0.022, sides=6)
        acc.rod(M["roofDark"], (bx, DECK + 0.7, z - 1.3), (bx + 0.34, DECK + 0.7, z - 1.3), 0.022, sides=6)
    # Foliage in the bin's shadow, a leaflet rack and a bin ring.
    acc.cyl(M["roof"], 0.245, 0.03, (x - 2.5, DECK + 0.6, z + 1.6), sides=8)


def centre(acc, obj, M):
    x, z = -1.8, -0.7
    front = z + 2.7
    nd.letters(acc, M["wall"], "VISITOR CENTRE", 0.34, pos=(x - 1.0, DECK + 3.42, front + 0.13), depth=0.02)
    # Roof: parapet trim, gravel, gutters and the plant's louvres.
    acc.rect_run(M["roof"], x - 5.7, x + 5.7, z - 3.3, z + 3.3, [(0, 0), (0.08, 0), (0.08, 0.05), (0.03, 0.09), (0, 0.09)], y=DECK + 4.3)
    roof_gravel(acc, obj, M, DECK + 4.36, x - 5.3, x + 5.3, z - 2.9, z + 2.9, 1500, seed=4)
    gutters(acc, M, x - 5.6, x + 5.6, z - 3.3, z + 3.3, DECK + 4.05)
    with acc.at((x + 3.0, DECK + 4.66, z - 1.6 + 0.51)):
        nd.louvre_panel(acc, M["frame"], 1.4, 0.44, slat=0.07, depth=0.03)
    for s in (-1, 1):
        with acc.at((x + 3.0 + s * 0.81, DECK + 4.66, z - 1.6), s * math.pi / 2):
            nd.louvre_panel(acc, M["frame"], 0.8, 0.44, slat=0.07, depth=0.03)
    for k in range(6):
        a = k * math.pi / 3
        with acc.at((x + 3.0, DECK + 5.0, z - 1.6), a):
            acc.box(M["frame"], (0.24, 0.012, 0.05), (0.14, 0, 0))
    # The entrance canopy: rafters underneath, downlights, and the posts' bases.
    for k in range(8):
        acc.box(M["frame"], (0.08, 0.16, 2.3), (x - 1.85 + k * 0.53, DECK + 3.5, front + 0.75))
    for k in range(4):
        acc.cyl(M["glass"], 0.06, 0.02, (x - 1.5 + k * 1.0, DECK + 3.49, front + 1.4), sides=8)
    for s in (-1, 1):
        acc.cyl(M["roofDark"], 0.12, 0.06, (x + s * 1.9, DECK + 0.03, front + 1.7), sides=8)
        acc.cyl(M["roof"], 0.12, 0.05, (x + s * 1.9, DECK + 3.47, front + 1.7), sides=8)
        planter(acc, M, x + s * 3.2, front + 0.9, seed=6 + s)
    # Sign pylon: lettering both faces, bolts and a cap.
    px, pz = 6.2, 1.4
    for face in (1, -1):
        with acc.at((px, DECK + 2.9, pz + face * 0.1), 0.0 if face > 0 else math.pi):
            nd.letters(acc, M["wall"], "INFO", 0.3, pos=(0, 0.0, 0.0), depth=0.02)
            nd.letters(acc, M["wall"], "VISITOR", 0.2, pos=(0, -0.42, 0.0), depth=0.02)
        for sx in (-1, 1):
            for sy in (-1, 1):
                acc.cyl(M["roofDark"], 0.03, 0.03, (px + sx * 1.35, DECK + 3.6 + sy * 0.95, pz + face * 0.11), axis="z", sides=6)
    map_board(acc, M, 2.8, 4.6, 2.2, 1.5)
    bench(acc, M, -6.4, 4.2, 0.0)
def library(acc, obj, M):
    x, z = -2.6, -0.4
    base = DECK + 0.4
    # A fluted, capitalled colonnade and a dentilled entablature.
    for i in range(6):
        cx = -6.4 + i * 1.52
        with acc.at((cx, 0, 2.9)):
            nd.fluted_column(acc, M["wall"], 0.3, 0.25, base + 0.3, base + 4.05, ribs=14)
            acc.lathe(M["roof"], [(0.33, base + 0.18), (0.36, base + 0.18), (0.36, base + 0.25), (0.31, base + 0.3), (0.31, base + 0.18)], sides=12)
            acc.lathe(M["roof"], [(0.26, base + 4.0), (0.29, base + 4.0), (0.29, base + 4.08), (0.26, base + 4.08)], sides=12)
            for s in (-1, 1):
                acc.cyl(M["roof"], 0.09, 0.08, (s * 0.31, base + 4.16, 0.0), axis="z", sides=10)
    path = [(x - 5.3, z - 3.7), (x + 5.3, z - 3.7), (x + 5.3, 3.55), (x - 5.3, 3.55)]
    nd.dentils(acc, M["roof"], path, base + 4.66, size=(0.08, 0.09, 0.1), pitch=0.2)
    acc.rect_run(M["roof"], x - 5.4, x + 5.4, z - 3.8, z + 3.2 + 0.4, [(0, 0), (0.2, 0), (0.2, 0.04), (0.14, 0.08), (0, 0.08)], y=base + 5.1)
    nd.letters(acc, M["wall"], "LIBRARY", 0.2, pos=(x + 2.4, base + 4.47, 3.4), depth=0.02)
    roof_gravel(acc, obj, M, base + 5.1, x - 5.0, x + 5.0, z - 3.3, z + 3.3, 1400, seed=7)
    gutters(acc, M, x - 5.5, x + 5.5, z - 3.6, z + 3.6, base + 4.8)
    for face in (-1, 1):
        for k in range(7):
            acc.box(M["frame"], (0.05, 0.05, 0.05), (x - 2.7 + k * 0.9, base + 5.34 + 0.0, z + face * 1.33))
    for i in range(2):
        acc.rod(M["roof"], (x - 4.5, DECK + 0.32 - i * 0.2, 4.05 + i * 0.7), (x + 4.5, DECK + 0.32 - i * 0.2, 4.05 + i * 0.7), 0.035, sides=8)


def garden(acc, obj, M):
    # Trees and hedges in leaf, the pergola's climber and beds of flowers.
    for i, (tx, tz) in enumerate(((3.4, 0.2), (7.8, 0.2))):
        nd.foliage(acc, M["leaf"], (tx, DECK + 1.2 + 0.75 * 0.9 * 0.9, tz), 0.78, 260, size=0.13, seed=20 + i, squash=0.95, dark=M["green"])
    for i, (hx, hz) in enumerate(((3.3, 2.4), (7.9, 2.4), (3.3, -2.6), (7.9, -2.6))):
        for k in range(3):
            nd.foliage(acc, M["leaf"], (hx, DECK + 0.52 + 0.3, hz - 0.65 + k * 0.65), 0.5, 55, size=0.09, seed=30 + i * 3 + k, squash=0.85, dark=M["green"])
    for k in range(6):
        nd.foliage(acc, M["leaf"], (5.6 - 1.5 + k * 0.6, DECK + 0.47 + 0.25, -3.4), 0.42, 40, size=0.09, seed=50 + k, squash=0.7, dark=M["green"])
    for i in range(6):
        for s in (-1, 1):
            nd.foliage(acc, M["leaf"], (5.6 + s * 1.9, DECK + 2.9, 1.7 - i * 0.78), 0.28, 22, size=0.08, seed=70 + i * 2 + s, squash=0.5)
    for k in range(14):
        a = k * 1.9
        acc.sphere(M["sign"], 0.04, (5.6 + math.cos(a) * 1.6, DECK + 0.2, 0.6 + math.sin(a) * 1.2 * (1 if k % 2 else -1) - 0.2), sides=6, rings=3)
    for lx, lz in lean.LAMPS:
        nd.lamp_standard(acc, {"iron": M["roof"], "glass": M["glass"]}, (lx, DECK, lz), height=2.98)
    for x, z, turn in ((5.6, 1.1, 0.0), (5.6, -1.4, math.pi)):
        bench(acc, M, x, z, turn)
    # Gravel path: stones between the lawn and the path.
    nd.pebbles(acc, M["paving"], 5.0, 6.2, -3.6, 3.2, DECK + 0.15, 700, size=0.035, seed=8)


def near(M, level):
    parts = nkit.drop(lean.level_parts(M, level), *REPLACED)
    obj = finish(parts, f"Info{level}Lean")
    acc = nkit.Acc()
    windows(acc, obj, M)
    # Ashlar scoring over the rendered walls: staggered blocks, the joints left as gaps.
    nkit.courses(acc, obj, lean.S("wall", 0.95), ("wall",), pitch=0.3, thick=0.27, lift=0.003, sample=0.2, min_area=1.5, block=0.8, gap=0.016, y_min=DECK + 0.3)
    ground(acc, obj, M)
    fingerposts(acc, M, level)
    if level <= 1:
        kiosk(acc, obj, M)
        map_board(acc, M, 3.6, 2.2, 2.4, 1.6)
        bench(acc, M, 3.6, -1.2, 0.0)
    elif level == 2:
        centre(acc, obj, M)
    else:
        library(acc, obj, M)
        garden(acc, obj, M)
    return nkit.rejoin(obj, acc.objects(), f"Info{level}Near")


def build(levels=(1, 2, 3)):
    kit.reset()
    M = lean.palette()
    made = []
    for level in levels:
        made.append(near(M, level))
        lean.lkit.bake(made[-1], [], made, distance=1.0)
    return made


def preview(level):
    return build((level,))
