"""
Street furniture and the street lamp at close range: the NEAR level of
`street_furniture.py`. Same kinds, footprints and anchors, for the few
dozen the camera is close to (under 1,500 triangles each).

What the lean ones leave out and a close camera sees: slats with rounded
edges and screws through them into cast-iron ends with a real profile, a
bin with hoops, a hinged flap and a rolled rim, a bush that is a heap of
separate clumps over bare stems, a flower bed of kerbstones and stalks with
petals, and a lamp with a fluted plinth, cast collars, a bracketed lantern
cage and a finial.

Nodes: BenchNear, BinNear, BushNear, BedNear, LampPoleNear, LampHeadNear
(`street-furniture-near.glb`). The lamp's nodes keep the lean ones' frame.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
import near_kit as nk  # noqa: E402
from kit import box, finish, prism  # noqa: E402
from street_furniture import LAMP_HEAD_Y, LAMP_HEIGHT, palette  # noqa: E402


def screw(name, x, y, z, mat, r=0.014, h=0.007):
    """A round screw head standing `h` proud of a horizontal face."""
    return lp.tube(name, (x, y, z), (x, y + h, z), r, r * 0.85, mat, sides=6, cap1=True)


def bench(M):
    wood, iron = M["wood"], M["iron"]
    parts = []
    seat_z = (-0.17, -0.056, 0.056, 0.17)
    for i, z in enumerate(seat_z):
        parts.append(box("seat", (1.5, 0.08, 0.1), (0, 0.42, z), wood, bev=0.012))
        for x in (-0.62, 0.62):
            parts.append(screw("ss", x, 0.46, z, iron))
    tilt = 0.18
    for y in (0.53, 0.65, 0.77):
        z = -0.2 - math.sin(tilt) * (y - 0.62)
        parts.append(box("back", (1.5, 0.11, 0.07), (0, y, z), wood, bev=0.011, rot=(-tilt, 0, 0)))
        for x in (-0.62, 0.62):
            # Countersunk screws on the front face of each back slat.
            zf = z + 0.036 * math.cos(tilt) + 0.0
            parts.append(lp.tube("bs", (x, y - 0.004, zf), (x, y - 0.004 + 0.007 * math.sin(tilt), zf + 0.007), 0.013, 0.011, iron, sides=6, cap1=True, ))
    end = [
        (0.25, 0.0), (0.26, 0.66), (0.19, 0.68), (0.18, 0.38), (-0.2, 0.38), (-0.28, 0.88),
        (-0.35, 0.86), (-0.27, 0.38), (-0.29, 0.0), (-0.2, 0.0), (-0.13, 0.31), (0.12, 0.31), (0.17, 0.0),
    ]
    for x in (-0.62, 0.62):
        parts.append(prism("end", end, 0.07, iron, x=x, bev=0.008))
        parts.append(box("arm", (0.08, 0.05, 0.5), (x, 0.69, -0.03), iron, bev=0.012))
        # A rounded knob at the arm's front end.
        parts.append(lp.tube("knob", (x, 0.69, 0.22), (x, 0.69, 0.25), 0.03, 0.03, iron, sides=8, cap1=True, turn=0.0) if False else
                     lp.tube("knob", (x, 0.69, 0.215), (x, 0.69, 0.245), 0.028, 0.02, iron, sides=8, cap1=True))
        # Foot plates, one under each leg.
        for z0 in (0.21, -0.245):
            parts.append(box("foot", (0.11, 0.012, 0.11), (x, 0.006, z0), iron, bev=0.003))
    # Stretchers tie the ends together.
    parts.append(lp.tube("stretch", (-0.6, 0.15, -0.22), (0.6, 0.15, -0.22), 0.016, 0.016, iron, sides=8, cap0=True, cap1=True))
    parts.append(box("rail", (1.16, 0.035, 0.05), (0, 0.345, -0.02), iron, bev=0.006))
    return finish(parts, "BenchNear")


def bin_(M):
    """Round where the lean bin is an octagon (inside its outline), with the
    slats as sixteen proud strips, hoops, a rolled lid and a hinged flap."""
    N = 16
    turn = math.pi / N
    k = 0.965  # a sixteen-sided ring inside the octagon's corners
    parts = [
        lp.tube("plinth", (0, 0, 0), (0, 0.07, 0), 0.28 * k, 0.27 * k, M["lid"], sides=N, cap1=True, turn=turn),
        lp.tube("body", (0, 0.07, 0), (0, 0.72, 0), 0.22 * k, 0.26 * k, M["metal"], sides=N, turn=turn),
        lp.tube("lid", (0, 0.72, 0), (0, 0.8, 0), 0.3 * k, 0.29 * k, M["lid"], sides=N, cap0=True, turn=turn),
        lp.tube("lip", (0, 0.8, 0), (0, 0.83, 0), 0.29 * k, 0.23 * k, M["lid"], sides=N, turn=turn),
        lp.tube("mouth", (0, 0.83, 0), (0, 0.77, 0), 0.23 * k, 0.2 * k, M["mouth"], sides=N, cap1=True, turn=turn),
        # The bag inside, seen through the mouth.
        lp.tube("liner", (0, 0.77, 0), (0, 0.5, 0), 0.19 * k, 0.17 * k, M["mouth"], sides=N, cap1=True, turn=turn),
    ]
    lean = math.atan(0.04 / 0.65)
    for i in range(N):
        a = i * 2 * math.pi / N
        r = (0.22 + 0.04 * (0.4 - 0.07) / 0.65) * k * math.cos(math.pi / N) + 0.003
        parts.append(box("slot", (0.05, 0.5, 0.012), (math.sin(a) * (r + 0.003), 0.4, math.cos(a) * (r + 0.003)), M["slot"],
                         bev=0.004, rot=(lean, a, 0)))
    parts.append(box("label", (0.17, 0.16, 0.008), (0, 0.5, 0.2325), M["label"], bev=0.002, rot=(lean, 0, 0)))
    for y in (0.24, 0.6):
        ro = (0.22 + 0.04 * (y - 0.07) / 0.65) * k
        parts.append(lp.tube("hoop", (0, y - 0.012, 0), (0, y + 0.012, 0), ro + 0.012, ro + 0.012, M["lid"], sides=N, turn=turn))
    for dx in (-0.07, 0.07):
        for dy in (0.44, 0.56):
            parts.append(lp.tube("rivet", (dx, dy, 0.2385), (dx, dy, 0.2455), 0.007, 0.006, M["metal"], sides=5, cap1=True))
    parts.append(lp.tube("roll", (0, 0.8, 0), (0, 0.814, 0), 0.3 * k, 0.3 * k, M["metal"], sides=N, turn=turn))
    parts.append(lp.tube("flap", (0, 0.83, 0.02), (0, 0.845, 0.02), 0.17, 0.15, M["lid"], sides=N, cap1=True, turn=turn, squash=0.6))
    parts.append(box("hinge", (0.09, 0.02, 0.02), (0, 0.843, -0.14), M["metal"], bev=0.004))
    # Bolts round the lid's top edge and feet under the plinth.
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        parts.append(nk.hex_bolt("lidbolt", (math.sin(a) * 0.255, 0.8, math.cos(a) * 0.255), "y", 0.012, 0.008, M["metal"]))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        parts.append(lp.tube("foot", (math.sin(a) * 0.24, 0, math.cos(a) * 0.24), (math.sin(a) * 0.24, 0.02, math.cos(a) * 0.24), 0.03, 0.03, M["mouth"], sides=6, cap1=True))
    return finish(parts, "BinNear")


def bush(M):
    ell = [
        ((0, 0.46, 0), 0.52, (1, 0.92, 1)),
        ((0.36, 0.34, 0.18), 0.38, (1, 0.9, 1)),
        ((-0.3, 0.3, -0.22), 0.34, (1, 0.9, 1)),
        ((-0.05, 0.76, 0.1), 0.28, (1, 0.9, 1)),
        ((0.12, 0.3, -0.36), 0.28, (1, 0.9, 1)),
    ]
    parts = [lp.blobs("core", [(c, r * 0.88, sq) for c, r, sq in ell], M["leaf"], wobble=0.08, seed=7.0, decimate=150)]
    # Big clumps over the hull, then a scatter of small ones between them.
    parts += nk.clumps("clump", ell, 9, 0.12, 0.19, M["leaf"], seed=12.0, squash=(1, 0.8, 1), bias=0.5, alt=M["leaf2"])
    parts += nk.clumps("bud", ell, 14, 0.06, 0.09, M["leaf"], seed=31.0, squash=(1, 0.8, 1), bias=0.3, sub=1, alt=M["leaf2"])
    # A dark clump low on one side, as the lean bush has.
    parts.append(nk.lump("dark", (-0.44, 0.36, 0.16), 0.2, M["leaf2"], (1, 0.9, 1), 0.4, 0.16, 9.0))
    # Bare stems where the bush meets the ground.
    for i, a in enumerate((0.4, 2.2, 3.8, 5.3)):
        parts.append(lp.tube(f"stem{i}", (math.cos(a) * 0.05, 0, math.sin(a) * 0.05), (math.cos(a) * 0.16, 0.28, math.sin(a) * 0.16), 0.022, 0.014, M["wood"], sides=4))
    return finish(parts, "BushNear")


def bed(M):
    kerb, soil = M["kerb"], M["soil"]
    W, D, T, H = 2.34, 1.54, 0.12, 0.2
    parts = [lp.panel("soil", W - 2 * T, D - 2 * T, (0, 0.165, 0), soil, rot=(-math.pi / 2, 0, 0))]
    # The kerb as separate stones with a hair of gap and rounded arrises.
    def run(x0, x1, z, along_x, tag):
        n = max(2, round(abs(x1 - x0) / 0.6))
        step = (x1 - x0) / n
        for i in range(n):
            c = x0 + step * (i + 0.5)
            size = (step - 0.01, H, T) if along_x else (T, H, step - 0.01)
            pos = (c, H / 2, z) if along_x else (z, H / 2, c)
            parts.append(box(f"{tag}{i}", size, pos, kerb, bev=0.008, cell=0.0))
    run(-W / 2, W / 2, -D / 2 + T / 2, True, "n")
    run(-W / 2, W / 2, D / 2 - T / 2, True, "s")
    run(-D / 2 + T, D / 2 - T, -W / 2 + T / 2, False, "w")
    run(-D / 2 + T, D / 2 - T, W / 2 - T / 2, False, "e")
    # Clods of turned soil.
    rnd = random.Random(3)
    for i in range(4):
        parts.append(nk.lump(f"clod{i}", (rnd.uniform(-0.95, 0.95), 0.17, rnd.uniform(-0.55, 0.55)), rnd.uniform(0.035, 0.06), soil, (1, 0.6, 1), i, 0.2, 60 + i, sub=1))
    leaves = [((-0.62, 0.2, -0.12), 0.34, (1.25, 0.7, 1.0)), ((-0.1, 0.22, 0.2), 0.32, (1.25, 0.7, 1.0)),
              ((0.45, 0.2, -0.08), 0.34, (1.25, 0.7, 1.0)), ((0.8, 0.2, 0.28), 0.26, (1.2, 0.7, 1.0))]
    for i, (c, r, sq) in enumerate(leaves):
        parts.append(nk.lump(f"leaf{i}", (c[0], c[1] - 0.03, c[2]), r * 0.75, M["leaf2"], sq, i * 1.3, 0.1, 30 + i, sub=1))
        # Blades of foliage fanned out of each mound.
        for k in range(9):
            a = 2 * math.pi * (k + 0.3 * i) / 9
            ring = 0.35 + 0.65 * ((k * 5) % 3) / 2
            base = (c[0] + math.cos(a) * r * 0.25 * sq[0], c[1] - 0.02, c[2] + math.sin(a) * r * 0.25 * sq[2])
            tip = (c[0] + math.cos(a) * r * 1.0 * ring * sq[0], c[1] + 0.12 + 0.08 * (1 - ring), c[2] + math.sin(a) * r * 1.0 * ring * sq[2])
            parts.append(nk.bipyramid(f"blade{i}.{k}", base, tip, r * 0.42, r * 0.09, M["leaf"] if k % 2 else M["leaf2"], at=0.5))
    flowers = [((-0.7, 0.36, -0.3), 0.16, "red"), ((-0.1, 0.38, 0.34), 0.15, "gold"), ((0.55, 0.38, -0.25), 0.16, "pink"),
               ((0.88, 0.34, 0.3), 0.14, "violet"), ((0.12, 0.36, -0.4), 0.14, "gold"), ((-0.42, 0.36, 0.32), 0.13, "pink")]
    for i, (pos, r, colour) in enumerate(flowers):
        mat = M[colour]
        parts.append(lp.tube(f"stalk{i}", (pos[0], 0.17, pos[2]), (pos[0], pos[1] - r * 0.4, pos[2]), 0.012, 0.009, M["leaf2"], sides=3))
        # Five petals round a centre, each a small faceted bud lying open.
        for k in range(5):
            a = i + k * 2 * math.pi / 5
            tip = (pos[0] + math.cos(a) * r * 1.25, pos[1] + r * 0.02, pos[2] + math.sin(a) * r * 1.25)
            base = (pos[0] + math.cos(a) * r * 0.1, pos[1] + r * 0.15, pos[2] + math.sin(a) * r * 0.1)
            parts.append(nk.bipyramid(f"pet{i}.{k}", base, tip, r * 0.8, r * 0.24, mat, up=(0, 1, 0), at=0.55))
        parts.append(nk.lump(f"eye{i}", (pos[0], pos[1] + r * 0.12, pos[2]), r * 0.26, M["gold"], (1, 0.8, 1), 0.0, 0.1, 70 + i, sub=1))
    return finish(parts, "BedNear")


def lamp(M):
    pole, dark = M["pole"], M["poleDark"]
    top = LAMP_HEAD_Y - 0.09
    y0_ = LAMP_HEAD_Y - 0.09
    parts = [
        # A stepped, eight-sided plinth with fluting: two tiers and a cove.
        lp.tube("foot", (0, 0, 0), (0, 0.06, 0), 0.17, 0.155, dark, sides=8, cap1=True, turn=math.pi / 8),
        lp.tube("plinth", (0, 0.06, 0), (0, 0.3, 0), 0.15, 0.12, dark, sides=8, cap1=True, turn=math.pi / 8),
        lp.tube("cove", (0, 0.3, 0), (0, 0.38, 0), 0.12, 0.09, dark, sides=8, cap1=True, turn=math.pi / 8),
        nk.loft("shaft", [(0, 0.38 + (top - 0.06 - 0.38) * i / 6, 0) for i in range(7)],
                [0.085 - 0.025 * (i / 6) ** 0.8 for i in range(7)], pole, sides=16, flute=0.07, twist=0.0),
        # Cast collars up the shaft.
        lp.tube("ring1", (0, 0.72, 0), (0, 0.76, 0), 0.098, 0.098, dark, sides=8, turn=math.pi / 8),
        lp.tube("ring2", (0, 1.35, 0), (0, 1.385, 0), 0.084, 0.084, dark, sides=8, turn=math.pi / 8),
        lp.tube("ring3", (0, 2.0, 0), (0, 2.03, 0), 0.075, 0.075, dark, sides=8, turn=math.pi / 8),
        lp.tube("collar", (0, top - 0.06, 0), (0, top, 0), 0.07, 0.12, dark, sides=8, cap1=True, turn=math.pi / 8),
    ]
    # Four struts carry the lantern's floor off the collar.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        parts.append(kit.strut("strut", (math.cos(a) * 0.075, top - 0.2, math.sin(a) * 0.075), (math.cos(a) * 0.115, y0_ - 0.01, math.sin(a) * 0.115), (0.016, 0.016), dark))
    # A small access door on the plinth, and four bolts on the foot.
    parts.append(box("door", (0.09, 0.14, 0.008), (0, 0.17, 0.1385), pole, bev=0.003))
    parts.append(lp.panel("latch", 0.02, 0.03, (0.03, 0.17, 0.144), dark))
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        parts.append(nk.hex_bolt("bolt", (math.sin(a) * 0.15, 0.06, math.cos(a) * 0.15), "y", 0.018, 0.02, dark))
    # The lantern cage: four corner posts either side of the glass, a floor
    # plate under it and a cornice over it.
    y0, y1 = LAMP_HEAD_Y - 0.09, LAMP_HEAD_Y + 0.08
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        # The glass is a square frustum (0.11 -> 0.17 in radius): posts on its corners.
        parts.append(lp.tube("post", (math.cos(a) * 0.11, y0, math.sin(a) * 0.11), (math.cos(a) * 0.17, y1, math.sin(a) * 0.17), 0.012, 0.012, dark, sides=4))
    for k in range(4):
        a = k * math.pi / 2
        mid = (0.11 + 0.17) / 2 * 0.98
        # A cross bar across each pane, at the height the frustum is 0.14 wide.
        parts.append(box("bar", (0.2, 0.014, 0.014), (math.sin(a) * mid * 0.72, (y0 + y1) / 2 + 0.005, math.cos(a) * mid * 0.72), dark, bev=0.002, rot=(0, a, 0)))
    parts.append(lp.tube("floor", (0, y0 - 0.005, 0), (0, y0 + 0.012, 0), 0.128, 0.128, dark, sides=4, cap1=True, turn=math.pi / 4))
    parts.append(lp.tube("cornice", (0, y1 - 0.01, 0), (0, y1 + 0.03, 0), 0.2, 0.2, dark, sides=4, cap0=True, cap1=True, turn=math.pi / 4))
    # The roof: a stepped pyramid with a finial.
    parts.append(lp.cone("roof", [(0.21, 0.21, 0), (-0.21, 0.21, 0), (-0.21, -0.21, 0), (0.21, -0.21, 0)], LAMP_HEAD_Y + 0.08, LAMP_HEAD_Y + 0.2, dark))
    parts.append(lp.tube("neck", (0, LAMP_HEAD_Y + 0.195, 0), (0, LAMP_HEAD_Y + 0.225, 0), 0.03, 0.02, dark, sides=6))
    parts.append(nk.lump("finial", (0, LAMP_HEAD_Y + 0.25, 0), 0.032, dark, (1, 1.15, 1), 0.0, 0.05, 1.0))
    post = finish(parts, "LampPoleNear")
    glass = [lp.tube("glass", (0, LAMP_HEAD_Y - 0.09, 0), (0, LAMP_HEAD_Y + 0.08, 0), 0.11, 0.17, M["glass"], sides=4, cap0=True, turn=math.pi / 4)]
    # The lamp itself inside it: a small bulb on a socket.
    glass.append(nk.lump("bulb", (0, LAMP_HEAD_Y + 0.0, 0), 0.05, M["glass"], (1, 1.2, 1), 0.0, 0.05, 2.0))
    head = finish(glass, "LampHeadNear")
    return post, head


def build():
    kit.reset()
    M = palette()
    props = [bench(M), bin_(M), bush(M), bed(M)]
    post, head = lamp(M)
    objs = props + [post, head]
    lp.bake_alone(props + [[post, head]], distance=0.35, floor=0.55, samples=16)
    return objs


def preview(_=0):
    return lp.row(build())
