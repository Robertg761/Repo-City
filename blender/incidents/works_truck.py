"""
The road crew's truck, modelled by script (spike: Blender assets vs procedural).

Same chassis-cab as `TRUCK_SPECS.dropside` and the same open dropside bed as
the procedural one in `emergency.ts`, with its three stacks of cones where
the procedural ones stand, ready to be put out round a hole. Out come:

  WorksTruck      the truck, origin on the ground under its centre, nose +z
  works.lamp.<i>  the light bar's two amber lenses, -x then +x
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fleet  # noqa: E402
import kit  # noqa: E402
from fleet import chassis_cab, light_bar, wheels  # noqa: E402
from kit import box, cyl, finish  # noqa: E402

SPEC = dict(
    length=3.4, width=1.2, r=0.28, wheelX=0.5, front=1.06, rear=-0.95,
    bottom=0.24, belt=0.86, roof=1.38, cabBack=0.12, bumperY=0.34,
    profile=[(0.12, 0.24), (1.7, 0.24), (1.7, 0.62), (1.55, 0.78), (0.95, 0.86), (0.12, 0.86)],
    glass=[(0.97, 0.84), (0.66, 1.38), (0.2, 1.38), (0.2, 0.84)],
    headlight=(0.4, 0.54),
)
HALF = SPEC["length"] / 2
W = SPEC["width"]
W2 = W / 2
FLOOR = 0.7
BAR_Z = 0.44
# Where the procedural truck stands its cone stacks, `[x, z]`.
STACKS = [(-0.3, -0.42), (0.3, -0.55), (-0.05, -1.2)]


def palette():
    return fleet.palette(
        orange=("#e8853c", "metal", 0.45),
        side=("#c96f2e", "metal", 0.5),
        cone=("#f06a32", "fabric", 0.6),
        band=("#e6e1ca", "glass", 0.35),
        foot=("#34322f", "fabric", 0.8),
        white=("#eeece6", "metal", 0.5),
        red=("#c8493c", "metal", 0.5),
        lensAmber=("#ffb347", "glass", 0.2),
    )


def cone_stack(M, x, z, count=3):
    """Cones nested one in the next on a square foot: each upper rim over the
    one below is what says "stack"."""
    parts = [box("coneFoot", (0.3, 0.04, 0.3), (x, FLOOR + 0.02, z), M["foot"], bev=0.0)]
    for i in range(count):
        y = FLOOR + 0.04 + i * 0.07
        parts.append(cyl("cone", 0.13, 0.44, (x, y + 0.22, z), M["cone"], axis="y", verts=8, radius2=0.025))
        if i == count - 1:
            parts.append(cyl("coneBand", 0.085, 0.07, (x, y + 0.27, z), M["band"], axis="y", verts=8, radius2=0.07))
    return parts


def bed(M):
    parts = []
    back = SPEC["cabBack"]
    tail = -HALF
    length = back - 0.02 - tail
    mid = (back - 0.02 + tail) / 2
    parts.append(box("floor", (W, 0.08, length), (0, FLOOR - 0.04, mid), M["dark"], bev=0.015))
    # Cross members under the floor, and mudguards over the rear wheels.
    for z in (-0.3, -1.55):
        parts.append(box("bearer", (W - 0.1, 0.08, 0.08), (0, FLOOR - 0.12, z), M["arch"], bev=0.0))
    for side in (-1, 1):
        parts.append(box("guard", (0.3, 0.03, 0.74), (side * SPEC["wheelX"], FLOOR - 0.1, SPEC["rear"]), M["arch"], bev=0.0))
    # The headboard guarding the cab, with a mesh guard's bars over it.
    parts.append(box("headboard", (W, 0.5, 0.06), (0, FLOOR + 0.25, back - 0.05), M["side"], bev=0.015))
    for x in (-0.4, -0.2, 0, 0.2, 0.4):
        parts.append(box("guardBar", (0.03, 0.3, 0.03), (x, FLOOR + 0.65, back - 0.05), M["steel"], bev=0.0))
    parts.append(box("guardTop", (W - 0.04, 0.04, 0.05), (0, FLOOR + 0.81, back - 0.05), M["steel"], bev=0.0))
    # The dropsides: hinged boards with ribs, and the tailgate with its
    # chevrons for the traffic coming up behind.
    for side in (-1, 1):
        x = side * (W2 - 0.025)
        parts.append(box("dropside", (0.05, 0.28, length - 0.02), (x, FLOOR + 0.14, mid), M["side"], bev=0.012))
        for z in (-0.25, -0.85, -1.4):
            parts.append(box("rib", (0.02, 0.26, 0.04), (side * (W2 + 0.006), FLOOR + 0.14, z), M["steel"], bev=0.0))
        parts.append(box("hinge", (0.03, 0.03, length - 0.1), (side * (W2 + 0.004), FLOOR + 0.02, mid), M["steel"], bev=0.0))
    parts.append(box("tailgate", (W, 0.28, 0.05), (0, FLOOR + 0.14, tail + 0.025), M["white"], bev=0.012))
    for i in range(5):
        x = -0.48 + i * 0.24
        parts.append(box("chevron", (0.07, 0.3, 0.02), (x, FLOOR + 0.14, tail - 0.004), M["red"], bev=0.0, rot=(0, 0, 0.6)))
    # The cones, and a pair of barrier boards lying along the other side.
    for x, z in STACKS:
        parts += cone_stack(M, x, z)
    for i, y in enumerate((FLOOR + 0.03, FLOOR + 0.09)):
        parts.append(box("board", (0.26, 0.05, 1.05), (0.34 - i * 0.02, y, -1.12), M["white"], bev=0.01))
        for k in range(3):
            parts.append(box("boardStripe", (0.265, 0.052, 0.14), (0.34 - i * 0.02, y, -1.5 + k * 0.36), M["red"], bev=0.0))
    # The tail: lamps under the bed, a bumper, a plate.
    for side in (-1, 1):
        parts.append(box("tailHouse", (0.18, 0.12, 0.04), (side * 0.44, 0.48, tail + 0.02), M["dark"], bev=0.0))
        parts.append(box("tail", (0.08, 0.08, 0.03), (side * 0.48, 0.48, tail + 0.002), M["tail"], bev=0.0))
        parts.append(box("tailA", (0.06, 0.08, 0.03), (side * 0.39, 0.48, tail + 0.002), M["amber"], bev=0.0))
    parts.append(box("rearBumper", (W - 0.1, 0.1, 0.1), (0, 0.32, tail + 0.08), M["dark"], bev=0.02))
    parts.append(box("plate", (0.22, 0.07, 0.02), (0, 0.44, tail + 0.02), M["plate"], bev=0.0))
    return parts


def build():
    kit.reset()
    M = palette()
    bar, markers = light_bar(
        M, "works", SPEC["roof"] + 0.07, BAR_Z, 0.64, [(-0.17, M["lensAmber"]), (0.17, M["lensAmber"])], depth=0.22, foot=0.03, lens_w=0.24
    )
    truck = finish(
        chassis_cab(M, SPEC, M["orange"]) + bed(M) + bar + wheels(M, SPEC["r"], SPEC["wheelX"], (SPEC["front"], SPEC["rear"]), width=0.24),
        "WorksTruck",
    )
    kit.bake_ao([truck], floor=0.55)
    return [truck, *markers]
