"""
The bus stop, the rooftop plant and the hay bale at close range: the NEAR
level of `street2.py`. Same frames, pivots and outlines as the lean nodes
(the unit box of `Block`, the unit footprint of `Tank`), for the few the
camera is close to.

  BusStopNear  under 1,500 triangles: bolted base plates, ribbed canopy with a
               gutter, framed and clipped glazing, a slatted bench on cast
               ends, a hinged timetable case with rows of times, a roundel
  BlockNear    under 3,000: a beveled body with eight louvre blades a face,
               corner posts, feet, a fan with blades behind a guard, screws
  TankNear     under 3,000: a twenty-sided drum with seams, hoops with lugs
               and bolts, braced legs, a hinged hatch, a vent pipe with a cap
  BaleNear     under 1,500: a round bale with wound layers on its ends,
               twine bands and loose straw

`street2-near.glb`.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
import near_kit as nk  # noqa: E402
from kit import B, box, finish, prism  # noqa: E402
from street2 import block_palette, farm_palette, facing_quad, palette, quad2, turned  # noqa: E402


def bus_stop(M):
    parts = []
    # Posts on base plates: eight-sided, with a cap ring and four bolts.
    for x, top in ((-1.1, 2.56), (1.1, 2.9)):
        parts.append(lp.tube("post", (x, 0, 0.02), (x, top, 0.02), 0.07, 0.07, M["post"], sides=8, turn=math.pi / 8))
        parts.append(box("plate", (0.24, 0.02, 0.24), (x, 0.01, 0.02), M["post"], bev=0.004))
        for dx in (-0.09, 0.09):
            for dz in (-0.09, 0.09):
                parts.append(nk.hex_bolt("pb", (x + dx, 0.02, 0.02 + dz), "y", 0.014, 0.012, M["frame"]))
        parts.append(lp.tube("collar", (x, 0.02, 0.02), (x, 0.09, 0.02), 0.095, 0.075, M["frame"], sides=8, turn=math.pi / 8))
        parts.append(lp.tube("ring", (x, top - 0.14, 0.02), (x, top - 0.1, 0.02), 0.08, 0.08, M["frame"], sides=8, turn=math.pi / 8))
    # The canopy: the lean prism, bevelled, with ribs under it, seams over it,
    # a trim strip and a gutter with a downpipe at the low back edge.
    canopy = [(0.52, 2.44), (0.52, 2.69), (-0.7, 2.61), (-0.7, 2.52), (0.42, 2.52), (0.42, 2.44)]
    parts.append(prism("canopy", canopy, 2.7, M["canopy"], bev=0.01))
    tilt = math.atan2(0.08, 1.22)
    for x in (-1.0, -0.5, 0.0, 0.5, 1.0):
        parts.append(box("seam", (0.03, 0.014, 1.2), (x, 2.667, -0.09), M["canopyDark"], bev=0.002, rot=(-tilt, 0, 0)))
        parts.append(box("rib", (0.04, 0.05, 1.05), (x, 2.495, -0.1), M["canopyDark"], bev=0.004))
    parts.append(box("strip", (1.5, 0.15, 0.012), (0, 2.565, 0.5225), M["sign"], bev=0.002))
    parts.append(lp.tube("gutter", (-1.36, 2.6, -0.72), (1.36, 2.6, -0.72), 0.03, 0.03, M["frame"], sides=8, cap0=True, cap1=True))
    parts.append(lp.tube("pipe", (-1.28, 2.6, -0.72), (-1.28, 0.0, -0.72), 0.022, 0.022, M["frame"], sides=6))
    for y in (0.5, 1.5, 2.4):
        parts.append(box("clamp", (0.05, 0.03, 0.05), (-1.28, y, -0.72), M["post"], bev=0.004))
    # The glazed back: a bevelled frame, two mullions, a kick rail, panes
    # with clips at their corners, a frosted band across them.
    y0, y1, zb = 0.82, 2.52, -0.62
    cy = (y0 + y1) / 2
    bar = 0.055
    for x in (-1.2225, 1.2225):
        parts.append(box("stile", (bar, y1 - y0, 0.07), (x, cy, zb), M["frame"], bev=0.004))
    for y in (y0 + bar / 2, y1 - bar / 2):
        parts.append(box("railh", (2.5, bar, 0.07), (0, y, zb), M["frame"], bev=0.004))
    for x in (-0.42, 0.42):
        parts.append(box("mull", (0.045, y1 - y0 - 2 * bar, 0.07), (x, cy, zb), M["frame"], bev=0.004))
    parts.append(box("rail", (2.39, 0.045, 0.07), (0, 1.12, zb), M["frame"], bev=0.004))
    for x0, x1 in ((-1.195, -0.44), (-0.4, 0.4), (0.44, 1.195)):
        pw, ph = x1 - x0, y1 - 0.055 - 1.14
        xc, yc = (x0 + x1) / 2, (1.14 + y1 - 0.055) / 2
        parts += quad2("pane", pw, ph, (xc, yc, zb), M["glass"])
        parts += quad2("frost", pw, 0.14, (xc, yc - 0.05, zb), M["line"], gap=0.014)
        for sx in (-1, 1):
            for sy in (1,):
                parts.append(box("clip", (0.05, 0.05, 0.02), (xc + sx * (pw / 2 - 0.02), yc + sy * (ph / 2 - 0.02), zb + 0.03), M["frame"], bev=0.004))
    for x in (-1.225, 1.225):
        parts.append(box("leg", (0.06, y0, 0.06), (x, y0 / 2, zb), M["frame"], bev=0.004))
        parts.append(box("shoe", (0.11, 0.02, 0.11), (x, 0.01, zb), M["post"], bev=0.003))
    # The bench: three slats on two cast ends, tied to the glazing.
    for z in (-0.5, -0.35, -0.2):
        parts.append(box("slat", (1.4, 0.06, 0.13), (0, 0.5, z), M["wood"], bev=0.01))
    for x in (-0.6, 0.6):
        parts.append(box("bench leg", (0.06, 0.47, 0.34), (x, 0.235, -0.35), M["post"], bev=0.006))
        parts.append(box("foot", (0.1, 0.014, 0.4), (x, 0.007, -0.35), M["post"], bev=0.003))
    # The timetable case: a frame, a glazed door with hinges, a header, rows
    # of times and a small roundel above.
    parts.append(box("case", (0.62, 0.46, 0.07), (1.1, 2.1, 0.1), M["frame"], bev=0.008))
    parts.append(lp.panel("board", 0.54, 0.38, (1.1, 2.1, 0.1355), M["board"]))
    parts.append(lp.panel("head", 0.5, 0.07, (1.1, 2.26, 0.137), M["paper"]))
    for i in range(6):
        parts.append(lp.panel("line", 0.44 - (i % 3) * 0.05, 0.016, (1.1 - 0.03 * (i % 3), 2.17 - i * 0.045, 0.137), M["line"]))
    for y in (2.3, 1.9):
        parts.append(box("hinge", (0.02, 0.05, 0.02), (0.8, y + 0.0 if y > 2 else y + 0.2, 0.14), M["post"], bev=0.002))
    parts.append(box("handle", (0.02, 0.06, 0.02), (1.38, 2.1, 0.145), M["post"], bev=0.003))
    parts.append(box("flag", (0.03, 0.34, 0.5), (1.1, 2.7, 0.3), M["sign"], bev=0.004))
    parts.append(lp.tube("roundel", (1.117, 2.72, 0.3), (1.122, 2.72, 0.3), 0.12, 0.12, M["roundel"], sides=16, cap1=True, turn=0.0)
                 if False else lp.tube("roundel", (1.1155, 2.72, 0.3), (1.1215, 2.72, 0.3), 0.125, 0.125, M["roundel"], sides=16, cap1=True))
    # A bus in the roundel: a body, windows, two wheels.
    parts.append(box("bus", (0.006, 0.09, 0.2), (1.1245, 2.73, 0.3), M["board"], bev=0.0))
    for z in (0.24, 0.3, 0.36):
        parts.append(box("win", (0.006, 0.035, 0.04), (1.1265, 2.745, z), M["paper"], bev=0.0))
    for z in (0.24, 0.36):
        parts.append(lp.tube("wheel", (1.1235, 2.68, z), (1.1275, 2.68, z), 0.018, 0.018, M["board"], sides=6, cap1=True))
    return finish(parts, "BusStopNear")


def unit_block(M):
    """The rooftop unit: a beveled body on four feet, corner posts, eight
    louvre blades a face over a dark backing, a stepped lid with a fan well
    (a rim, a guard of rings and spokes, five blades on a hub) and screws."""
    parts = []
    half = 0.465
    parts.append(box("body", (2 * half, 0.86, 2 * half), (0, 0.43, 0), M["body"], bev=0.014, cell=0.3))
    parts.append(box("lid", (0.93, 0.14, 0.93), (0, 0.93, 0), M["lid"], bev=0.012, cell=0.3))
    # A step in the lid: the lean lid narrows to 0.40 at its top.
    parts.append(box("lidtop", (0.8, 0.02, 0.8), (0, 0.99, 0), M["lid"], bev=0.006, cell=0.3))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(box("post", (0.05, 0.86, 0.05), (sx * (half - 0.005), 0.43, sz * (half - 0.005)), M["louvre"], bev=0.008))
    for k in range(4):
        yaw = k * math.pi / 2
        wall = 0.4715
        parts.append(facing_quad(
            "slit", [turned((x, y, wall), yaw) for x, y in ((-0.34, 0.12), (0.34, 0.12), (0.34, 0.68), (-0.34, 0.68))],
            turned((0, 0, 1), yaw), M["slit"]))
        # A frame round the louvres, then eight slanted blades with end caps.
        for y in (0.115, 0.685):
            c = turned((0, y, wall + 0.006), yaw)
            parts.append(box("lf", (0.72, 0.03, 0.02), c, M["louvre"], bev=0.004, rot=(0, yaw, 0)))
        for x in (-0.355, 0.355):
            c = turned((x, 0.4, wall + 0.006), yaw)
            parts.append(box("lv", (0.03, 0.6, 0.02), c, M["louvre"], bev=0.004, rot=(0, yaw, 0)))
        for i in range(10):
            y = 0.165 + i * 0.052
            c = turned((0, y + 0.03, wall + 0.02), yaw)
            parts.append(box("blade", (0.68, 0.008, 0.06), c, M["blade"], bev=0.0, rot=(0.55, yaw, 0)))
    # Feet under the body are hidden by the ground line, so none; a label,
    # and a service panel with four screws on one face.
    parts.append(lp.panel("label", 0.14, 0.07, (0.22, 0.79, 0.4715), M["label"]))
    parts.append(box("panel", (0.26, 0.16, 0.012), (-0.22, 0.77, 0.4715), M["lid"], bev=0.004))
    for dx in (-0.1, 0.1):
        for dy in (-0.06, 0.06):
            parts.append(nk.hex_bolt("sc", (-0.22 + dx, 0.77 + dy, 0.4775), "z", 0.008, 0.006, M["frame"] if "frame" in M else M["fan"]))
    # The fan well: a rim, a dark disc, a guard, five blades on a hub.
    parts.append(lp.tube("rim", (0, 1.0, 0), (0, 1.035, 0), 0.3, 0.285, M["louvre"], sides=16, turn=math.pi / 16))
    ring = [(0.28 * math.cos(math.pi / 16 + i * math.pi / 8), 1.008, 0.28 * math.sin(math.pi / 16 + i * math.pi / 8)) for i in range(16)]
    parts.append(facing_quad("well", ring, (0, 1, 0), M["well"]))
    for r in (0.24, 0.17, 0.1):
        parts.append(lp.tube("guard", (0, 1.03, 0), (0, 1.044, 0), r, r, M["fan"], sides=16, turn=math.pi / 16))
    for i in range(12):
        a = i * math.pi / 6
        parts.append(lp.tube("spoke", (math.cos(a) * 0.04, 1.037, math.sin(a) * 0.04), (math.cos(a) * 0.285, 1.037, math.sin(a) * 0.285), 0.006, 0.006, M["fan"], sides=4))
    for i in range(5):
        a = i * 2 * math.pi / 5
        parts.append(nk.bipyramid("fanblade", (math.cos(a) * 0.04, 1.014, math.sin(a) * 0.04), (math.cos(a + 0.35) * 0.235, 1.02, math.sin(a + 0.35) * 0.235), 0.1, 0.012, M["blade"], up=(0, 1, 0), at=0.6))
    parts.append(lp.tube("hub", (0, 1.008, 0), (0, 1.04, 0), 0.04, 0.03, M["fan"], sides=8, cap1=True))
    # Screws round the lid's edge.
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        parts.append(nk.hex_bolt("ls", (math.cos(a) * 0.4 * (1.0 if i % 2 == 0 else 0.98), 0.86 + 0.14, math.sin(a) * 0.4), "y", 0.011, 0.006, M["fan"]) if False else
                     nk.hex_bolt("ls", (math.cos(a) * 0.35, 1.0, math.sin(a) * 0.35), "y", 0.01, 0.006, M["fan"]))
    return finish(parts, "BlockNear")


def water_tank(M):
    parts = []
    L = 0.27
    for x in (-L, L):
        for z in (-L, L):
            parts.append(box("leg", (0.075, 0.32, 0.075), (x, 0.16, z), M["leg"], bev=0.008))
            parts.append(box("shoe", (0.13, 0.014, 0.13), (x, 0.007, z), M["band"], bev=0.003))
            parts.append(nk.hex_bolt("lb", (x, 0.014, z), "y", 0.014, 0.01, M["hatch"]))
    # Bracing: a real X on each side, two flat bars with a turnbuckle where they cross.
    for k in range(4):
        yaw = k * math.pi / 2
        for flip in (-1, 1):
            a = turned((flip * 0.27, 0.06, 0.29), yaw)
            b = turned((-flip * 0.27, 0.28, 0.29), yaw)
            parts.append(kit.strut("brace", a, b, (0.022, 0.008), M["leg"]))
        parts.append(lp.tube("turn", turned((0, 0.155, 0.29), yaw), turned((0, 0.185, 0.29), yaw), 0.02, 0.02, M["band"], sides=6))
    N = 20
    turn = math.pi / N
    R = 0.448
    parts.append(lp.tube("drum", (0, 0.3, 0), (0, 0.88, 0), R, R, M["tank"], sides=N, cap0=True, turn=turn))
    parts.append(lp.tube("dome", (0, 0.88, 0), (0, 0.94, 0), R, 0.34, M["tankTop"], sides=N, cap1=True, turn=turn))
    # The staves' seams: ten ribs up the drum.
    for i in range(10):
        a = i * 2 * math.pi / 10
        parts.append(box("seam", (0.014, 0.56, 0.014), (math.cos(a) * (R + 0.003), 0.59, math.sin(a) * (R + 0.003)), M["band"], bev=0.0, rot=(0, -a + math.pi / 2, 0)))
    for y in (0.305, 0.875):
        parts.append(lp.tube("bead", (0, y - 0.012, 0), (0, y + 0.012, 0), R + 0.012, R + 0.012, M["band"], sides=N, turn=turn))
    for y in (0.44, 0.74):
        parts.append(lp.tube("hoop", (0, y - 0.02, 0), (0, y + 0.02, 0), 0.478, 0.478, M["band"], sides=N, turn=turn))
        for i in range(6):
            a = i * math.pi / 3 + 0.3
            parts.append(box("lug", (0.05, 0.05, 0.03), (math.cos(a) * 0.472, y, math.sin(a) * 0.472), M["hatch"], bev=0.004, rot=(0, -a + math.pi / 2, 0)))
            parts.append(nk.hex_bolt("hb", (math.cos(a) * 0.485, y, math.sin(a) * 0.485), "x" if False else "y", 0.011, 0.012, M["pipe"]))
    # The lid: a seam ring of rivets, a hinged hatch with a handle and bolts.
    for i in range(14):
        a = i * 2 * math.pi / 14
        parts.append(lp.tube("rv", (math.cos(a) * 0.4, 0.895, math.sin(a) * 0.4), (math.cos(a) * 0.4, 0.903, math.sin(a) * 0.4), 0.009, 0.007, M["pipe"], sides=4, cap1=True))
    parts.append(lp.tube("hatch", (-0.15, 0.94, 0.03), (-0.15, 0.965, 0.03), 0.105, 0.09, M["hatch"], sides=12, cap1=True))
    for i in range(6):
        a = i * math.pi / 3
        parts.append(nk.hex_bolt("hb", (-0.15 + math.cos(a) * 0.075, 0.965, 0.03 + math.sin(a) * 0.075), "y", 0.01, 0.007, M["pipe"]))
    parts.append(box("handle", (0.09, 0.012, 0.02), (-0.15, 0.975, 0.03), M["band"], bev=0.003))
    parts.append(box("hinge", (0.04, 0.02, 0.03), (-0.15, 0.95, -0.085), M["band"], bev=0.003))
    # The overflow pipe with a capped, bent top, and a level gauge on the drum.
    parts.append(lp.tube("pipe", (0.24, 0.9, 0.0), (0.24, 1.0, 0.0), 0.05, 0.05, M["pipe"], sides=8))
    parts.append(lp.tube("pipecap", (0.24, 1.0, 0.0), (0.24, 1.02, 0.0), 0.058, 0.058, M["pipe"], sides=8, cap1=True))
    parts.append(lp.tube("gauge", (0.0, 0.36, R + 0.03), (0.0, 0.84, R + 0.03), 0.012, 0.012, M["hatch"], sides=6, cap0=True, cap1=True))
    for y in (0.36, 0.6, 0.84):
        parts.append(box("gclamp", (0.03, 0.02, 0.06), (0.0, y, R + 0.015), M["band"], bev=0.003))
    return finish(parts, "TankNear")


def bale(F):
    """A round bale on its flat side, axis along z: sixteen-sided drum, ends
    wound in steps, twine bands, and loose straw across the barrel."""
    r = 0.542
    sides = 16
    turn = math.pi / sides
    foot = r * math.cos(math.pi / sides)
    straw, twine, dark = F["straw"], F["twine"], F["strawEnd"]
    parts = []
    # The barrel and two dished, stepped ends.
    parts.append(lp.tube("barrel", (0, foot, -0.34), (0, foot, 0.34), r, r, straw, sides=sides, turn=turn))
    for s in (-1, 1):
        z = 0.34 * s
        parts.append(lp.tube("shoulder", (0, foot, z), (0, foot, z + 0.09 * s), r, 0.44, twine, sides=sides, turn=turn))
        # Wound layers: steps down into the dish.
        prev = z + 0.09 * s
        for i, (rr, dz) in enumerate(((0.44, 0.02), (0.34, 0.02), (0.24, 0.02), (0.14, 0.015))):
            nxt = prev + dz * s
            parts.append(lp.tube(f"step{i}", (0, foot, prev), (0, foot, nxt), rr, rr * 0.99, dark if i % 2 else straw, sides=sides, turn=turn))
            parts.append(lp.tube(f"tread{i}", (0, foot, nxt), (0, foot, nxt + 0.0005 * s), rr, rr * 0.7, dark if i % 2 == 0 else straw, sides=sides, turn=turn))
            prev = nxt
        # Close the dish over the last step.
        parts.append(lp.tube("dish", (0, foot, prev), (0, foot, prev + 0.001 * s), 0.1, 0.1, dark, sides=sides, cap1=True, turn=turn))
    # Twine: four bands round the barrel.
    for z in (-0.24, -0.08, 0.08, 0.24):
        parts.append(lp.tube("twine", (0, foot, z - 0.012), (0, foot, z + 0.012), r + 0.008, r + 0.008, twine, sides=sides, turn=turn))
    # Loose straw: flat buds lying across the barrel, standing a little off it.
    rnd = random.Random(5)
    for i in range(46):
        a = rnd.uniform(0, 2 * math.pi)
        z = rnd.uniform(-0.3, 0.3)
        ln = rnd.uniform(0.12, 0.22)
        dz = rnd.uniform(-0.05, 0.05)
        base = (math.cos(a) * (r - 0.005), foot + math.sin(a) * (r - 0.005), z)
        tip = (math.cos(a + 0.35) * (r + 0.03), foot + math.sin(a + 0.35) * (r + 0.03), z + dz + ln * 0.5)
        parts.append(nk.bipyramid("wisp", base, tip, 0.028, 0.006, straw if i % 3 else dark, up=(math.cos(a), math.sin(a), 0), at=0.5, sides=4))
    return finish(parts, "BaleNear")


def build():
    kit.reset()
    M = palette()
    B_ = block_palette()
    F = farm_palette()
    objs = [bus_stop(M), unit_block(B_), water_tank(B_)]
    lp.bake_alone(objs, distance=0.4, floor=0.55, samples=16)
    b = bale(F)
    lp.bake_alone([b], distance=0.35, floor=0.6, samples=16)
    return objs + [b]


def preview(_=0):
    return lp.row(build())
