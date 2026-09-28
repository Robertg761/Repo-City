"""
Street furniture, modelled by script (spike: Blender assets vs procedural).

The same kinds, footprints, colours and anchors as `furnitureParts` in
`components/city/models/props/streetFurniture.ts` and the lamp in
`components/city/Props.tsx`. Up to a hundred and fifty of these stand in a
city and each kind is one instanced draw, so every node stays under the 220
triangles `streetFurniture.test.ts` allows; nothing is bevelled, the budget
goes on silhouette instead: a bench with cast-iron ends and real slats, a bin
with a flared lid and a dark mouth, a bush that is one clumpy hull, a flower
bed with a kerb, and a lamp with a plinth, a collar and a lantern.

Nodes (origin on the ground under the prop unless noted):
  Bench, Bin, Bush, Bed
  LampPole   the pole, plinth, collar and lantern roof
  LampHead   the lantern glass, centred 2.79 above the ground (the halo's
             anchor); drawn with the lamp's own emissive material
The lamp's nodes keep their origin on the ground too: the TypeScript side
moves them onto the pole's centre and the lantern's (`blenderLampGeometry`),
because `importedParts` subtracts a node's origin from vertices the glTF
already stores relative to it.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import box, finish, prism  # noqa: E402

WOOD = "#9a7c58"
METAL = "#6b6f6d"
LEAF = "#6f9760"
SOIL = "#6b5a46"
LAMP_POST = "#6f7270"

LAMP_HEIGHT = 2.7
LAMP_HEAD_Y = LAMP_HEIGHT + 0.09


def palette():
    m = kit.material
    return {
        "wood": m("wood", WOOD, "timber", 0.8),
        "iron": m("iron", "#4f5452", "metal", 0.5),
        "metal": m("metal", METAL, "metal", 0.5),
        "lid": m("lid", "#4c4f4d", "metal", 0.5),
        "mouth": m("mouth", "#242b2a", "metal", 0.8),
        "slot": m("slot", "#47534d", "metal", 0.6),
        "label": m("label", "#a7bb9c", "metal", 0.6),
        "leaf": m("leaf", LEAF, "foliage", 0.9),
        "leaf2": m("leaf", LEAF, "foliage", 0.9, tone=0.86),
        "soil": m("soil", SOIL, "stone", 1.0),
        "kerb": m("kerb", "#a89f8c", "stone", 0.9),
        "red": m("flowerRed", "#d8676a", "foliage", 0.8),
        "gold": m("flowerGold", "#e2c46a", "foliage", 0.8),
        "pink": m("flowerPink", "#c86fa0", "foliage", 0.8),
        "violet": m("flowerViolet", "#8f6fb0", "foliage", 0.8),
        # The lamp's pole is coloured by its material in `Props.tsx`: white
        # here, darker tones for the plinth, so the vertex colour is only the
        # shade and the city's desaturated LAMP_POST is the colour.
        "pole": m("pole", "#ffffff", "metal", 0.6),
        "poleDark": m("pole", "#ffffff", "metal", 0.6, tone=0.7),
        "glass": m("glass", "#ffffff", "glass", 0.2),
    }


def bench(M):
    """Four seat slats and three back slats on two cast-iron ends: front
    legs that run up into the armrest, rear legs that run up into the back."""
    wood, iron = M["wood"], M["iron"]
    parts = []
    for z in (-0.17, -0.056, 0.056, 0.17):
        parts.append(box("seat", (1.5, 0.08, 0.1), (0, 0.42, z), wood, bev=0))
    tilt = 0.18
    for y in (0.53, 0.65, 0.77):
        z = -0.2 - math.sin(tilt) * (y - 0.62)
        parts.append(box("back", (1.5, 0.11, 0.07), (0, y, z), wood, bev=0, rot=(-tilt, 0, 0)))
    # A bench end in side profile (z forward, y up), a simple polygon.
    end = [
        (0.25, 0.0), (0.26, 0.66), (0.19, 0.68), (0.18, 0.38), (-0.2, 0.38), (-0.28, 0.88),
        (-0.35, 0.86), (-0.27, 0.38), (-0.29, 0.0), (-0.2, 0.0), (-0.13, 0.31), (0.12, 0.31), (0.17, 0.0),
    ]
    for x in (-0.62, 0.62):
        parts.append(prism("end", end, 0.07, iron, x=x, bev=0))
        parts.append(box("arm", (0.08, 0.05, 0.5), (x, 0.69, -0.03), iron, bev=0))
    return finish(parts, "Bench")


def bin_(M):
    """An octagonal litter bin: a plinth, slatted body tapering to the foot,
    a flared lid with a dark mouth, and the label facing the street."""
    parts = [
        lp.tube("plinth", (0, 0, 0), (0, 0.07, 0), 0.28, 0.27, M["lid"], sides=8, cap1=True, turn=math.pi / 8),
        lp.tube("body", (0, 0.07, 0), (0, 0.72, 0), 0.22, 0.26, M["metal"], sides=8, turn=math.pi / 8),
        lp.tube("lid", (0, 0.72, 0), (0, 0.8, 0), 0.3, 0.29, M["lid"], sides=8, cap0=True, turn=math.pi / 8),
        lp.tube("lip", (0, 0.8, 0), (0, 0.83, 0), 0.29, 0.23, M["lid"], sides=8, turn=math.pi / 8),
        lp.tube("mouth", (0, 0.83, 0), (0, 0.77, 0), 0.23, 0.2, M["mouth"], sides=8, cap1=True, turn=math.pi / 8),
    ]
    # The slats: dark vertical strips proud of each face of the body.
    # They lean with the body's taper, just proud of each face.
    lean = math.atan(0.04 * math.cos(math.pi / 8) / 0.65)
    for i in range(8):
        a = i * math.pi / 4
        r = (0.22 + 0.04 * (0.4 - 0.07) / 0.65) * math.cos(math.pi / 8) + 0.004
        parts.append(lp.panel("slot", 0.05, 0.5, (math.sin(a) * r, 0.4, math.cos(a) * r), M["slot"], rot=(lean, a, 0)))
    parts.append(lp.panel("label", 0.17, 0.16, (0, 0.5, 0.2295), M["label"], rot=(lean, 0, 0)))
    return finish(parts, "Bin")


def bush(M):
    """One clumpy hull of five lumps, a darker lump low on one side."""
    main = lp.blobs(
        "bush",
        [
            ((0, 0.46, 0), 0.52, (1, 0.92, 1)),
            ((0.36, 0.34, 0.18), 0.38, (1, 0.9, 1)),
            ((-0.3, 0.3, -0.22), 0.34, (1, 0.9, 1)),
            ((-0.05, 0.76, 0.1), 0.28, (1, 0.9, 1)),
            ((0.12, 0.3, -0.36), 0.28, (1, 0.9, 1)),
        ],
        M["leaf"],
        wobble=0.1,
        seed=7.0,
        decimate=92,
    )
    dark = lp.blobs("bush2", [((-0.44, 0.36, 0.16), 0.24, (1, 0.9, 1))], M["leaf2"], wobble=0.1, seed=9.0)
    return finish([main, dark], "Bush")


def bed(M):
    """A raised bed: a stone kerb round a mound of turned soil, a leafy mound
    and a handful of flowers standing out of it."""
    kerb, soil = M["kerb"], M["soil"]
    W, D, T, H = 2.34, 1.54, 0.12, 0.2
    # The kerb as one ring (no hidden ends where four boxes would meet), and
    # of the soil only its top: the kerb hides the rest.
    parts = [
        lp.ring("kerb", W, D, T, 0.0, H, kerb),
        lp.panel("soil", W - 2 * T, D - 2 * T, (0, 0.16, 0), soil, rot=(-math.pi / 2, 0, 0)),
    ]
    leaves = lp.blobs(
        "leaves",
        [
            ((-0.62, 0.2, -0.12), 0.34, (1.25, 0.7, 1.0)),
            ((-0.1, 0.22, 0.2), 0.32, (1.25, 0.7, 1.0)),
            ((0.45, 0.2, -0.08), 0.34, (1.25, 0.7, 1.0)),
            ((0.8, 0.2, 0.28), 0.26, (1.2, 0.7, 1.0)),
        ],
        M["leaf"],
        wobble=0.08,
        seed=11.0,
        decimate=62,
    )
    parts.append(leaves)
    flowers = [
        ((-0.7, 0.36, -0.3), 0.16, "red"),
        ((-0.1, 0.38, 0.34), 0.15, "gold"),
        ((0.55, 0.38, -0.25), 0.16, "pink"),
        ((0.88, 0.34, 0.3), 0.14, "violet"),
        ((0.12, 0.36, -0.4), 0.14, "gold"),
        ((-0.42, 0.36, 0.32), 0.13, "pink"),
    ]
    for i, (pos, r, colour) in enumerate(flowers):
        # A faceted ball, a clump of blooms, a little squat.
        parts.append(lp.blobs(f"f{i}", [(pos, r, (1, 0.85, 1))], M[colour], wobble=0.1, seed=20.0 + i))
    return finish(parts, "Bed")


def lamp(M):
    """A cast pole on a plinth, a collar under the lantern, and the lantern's
    roof; the glass is its own node so it can glow."""
    pole, dark = M["pole"], M["poleDark"]
    top = LAMP_HEAD_Y - 0.09
    parts = [
        lp.tube("plinth", (0, 0, 0), (0, 0.32, 0), 0.15, 0.12, dark, sides=6, cap1=True),
        lp.tube("shaft", (0, 0.32, 0), (0, top - 0.06, 0), 0.085, 0.06, pole, sides=6),
        lp.tube("collar", (0, top - 0.06, 0), (0, top, 0), 0.07, 0.12, dark, sides=6, cap1=True),
        # The roof over the lantern, a flat pyramid with a finial.
        lp.cone("roof", [(0.21, 0.21, 0), (-0.21, 0.21, 0), (-0.21, -0.21, 0), (0.21, -0.21, 0)],
                LAMP_HEAD_Y + 0.08, LAMP_HEAD_Y + 0.2, dark),
    ]
    post = finish(parts, "LampPole")
    glass = lp.tube("glass", (0, LAMP_HEAD_Y - 0.09, 0), (0, LAMP_HEAD_Y + 0.08, 0), 0.11, 0.17, M["glass"],
                    sides=4, cap0=True, turn=math.pi / 4)
    head = finish([glass], "LampHead")
    return post, head


def build():
    kit.reset()
    M = palette()
    props = [bench(M), bin_(M), bush(M), bed(M)]
    post, head = lamp(M)
    objs = props + [post, head]
    # The lamp bakes as one piece, glass and pole together.
    lp.bake_alone(props + [[post, head]], distance=0.35, floor=0.55)
    return objs


def preview(_=0):
    return lp.row(build())
