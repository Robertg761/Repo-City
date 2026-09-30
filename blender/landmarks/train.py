"""
The city station's train, modelled by script (spike: Blender assets vs
procedural).

Same set as `trainCars()` in `components/city/models/landmarks/station.ts`:
a locomotive (nose to +x) and two cars, the last a driving trailer, centred
on the origin, bogies and axles where the procedural ones are, wheels
standing on rail tops at y 0.5 on the station's gauge, 1.9 wide and under
12.6 long so the running-train envelope and the tunnel clip at `PORTAL_X`
hold. `Landmark.tsx` draws it twice (one running, one parked turned round),
so it is one node, `Train`, in the train's three slots: body, glass, gear.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import lkit  # noqa: E402
import kit  # noqa: E402
from kit import box, cyl, finish  # noqa: E402

RAIL = 0.5
WHEEL_R = 0.34
AXLE_Y = RAIL + WHEEL_R
GAUGE = 0.8  # the procedural wheels' z, outside the rails at +-0.72
BODY_Y0, BODY_Y1 = 1.15, 2.6
HALF_W = 0.95
LOCO = (3.7, 3.6, 1.2)   # centre, length, bogie reach
CARS = ((-0.05, 3.4, 1.15), (-3.7, 3.4, 1.15))

SLOT_HEX = {"body": "#4489b4", "glass": "#ffdca5", "gear": "#414950"}
SURFACE = {"body": "metal", "glass": "glass", "gear": "metal"}
S = lkit.slots(SLOT_HEX, SURFACE)


def palette():
    return {
        "body": S("body"),
        "roof": S("body", 0.72),
        "door": S("body", 0.8),
        "band": S("body", 0.62),
        "gear": S("gear"),
        "wheel": S("gear", 0.8),
        "glass": S("glass", emission=0.3),
    }


def bogie(M, cx, reach):
    """A two-axle bogie centred where the procedural set has its axle."""
    parts = [box("bogieFrame", (reach * 2 + 0.7, 0.3, 1.5), (cx, AXLE_Y + 0.06, 0), M["gear"], bev=0.0)]
    for dx in (-reach, reach):
        # One capped cylinder per axle: its end caps are the two wheels.
        parts.append(cyl("axle", WHEEL_R, GAUGE * 2 + 0.2, (cx + dx, AXLE_Y, 0), M["wheel"], axis="z", verts=10))
    parts.append(box("spring", (0.3, 0.18, 1.62), (cx, AXLE_Y + 0.28, 0), M["gear"], bev=0.0))
    return parts


def roof(M, x0, x1):
    """A curved roof over the body, from x0 to x1."""
    w = HALF_W
    profile = [(-w, BODY_Y1 - 0.02), (-w + 0.08, BODY_Y1 + 0.16), (-w * 0.55, BODY_Y1 + 0.27), (w * 0.55, BODY_Y1 + 0.27), (w - 0.08, BODY_Y1 + 0.16), (w, BODY_Y1 - 0.02)]
    return lkit.slab("roof", [(z, y) for z, y in profile], x1 - x0, ((x0 + x1) / 2, 0, 0), M["roof"], turn=math.pi / 2)


def carriage(M, cx, length, reach, cab_end=0):
    """A coach: body, window band, doors at both ends, roof, underframe."""
    x0, x1 = cx - length / 2, cx + length / 2
    parts = [box("body", (length, BODY_Y1 - BODY_Y0, HALF_W * 2), (cx, (BODY_Y0 + BODY_Y1) / 2, 0), M["body"], bev=0.05)]
    parts.append(roof(M, x0 + 0.02, x1 - 0.02))
    parts.append(box("skirt", (length - 0.6, 0.22, HALF_W * 2 - 0.2), (cx, BODY_Y0 - 0.1, 0), M["gear"], bev=0.0))
    # A dark band under the windows: the livery line.
    parts.append(box("band", (length - 0.02, 0.1, HALF_W * 2 + 0.02), (cx, 1.62, 0), M["band"], bev=0.0))
    # The window band, pillars across it, and a door at each end.
    doors = [x0 + 0.5, x1 - 0.5]
    if cab_end:
        doors = [d for d in doors if (d - cx) * cab_end < 0]
    lo, hi = x0 + 0.95, x1 - 0.95
    if cab_end > 0:
        hi = x1 - 0.3
    if cab_end < 0:
        lo = x0 + 0.3
    parts.append(box("windows", (hi - lo, 0.55, HALF_W * 2 + 0.02), ((lo + hi) / 2, 2.0, 0), M["glass"], bev=0.0))
    n = max(2, round((hi - lo) / 0.62))
    for k in range(1, n):
        parts.append(box("pillar", (0.08, 0.57, HALF_W * 2 + 0.04), (lo + (hi - lo) * k / n, 2.0, 0), M["body"], bev=0.0))
    for d in doors:
        parts.append(box("door", (0.62, 1.3, HALF_W * 2 + 0.02), (d, BODY_Y0 + 0.66, 0), M["door"], bev=0.0))
        parts.append(box("doorGlass", (0.26, 0.5, HALF_W * 2 + 0.04), (d, 2.0, 0), M["glass"], bev=0.0))
    # Roof equipment.
    parts.append(box("aircon", (1.0, 0.16, 0.9), (cx, BODY_Y1 + 0.33, 0), M["roof"], bev=0.03))
    for dx in (-reach, reach):
        parts += bogie(M, cx + dx, 0.37)
    return parts


def cab(M, x_face, direction):
    """A raked cab nose from the body face at `x_face` towards `direction`."""
    turn = 0.0 if direction > 0 else math.pi
    nose = [(0.0, BODY_Y0 - 0.2), (0.5, BODY_Y0 - 0.2), (0.62, 1.55), (0.3, BODY_Y1 - 0.05), (0.0, BODY_Y1 + 0.2)]
    parts = [lkit.slab("nose", nose, HALF_W * 2 - 0.04, (x_face, 0, 0), M["body"], turn=turn, bev=0.04)]
    # The windscreen on the rake, a dark surround and headlights low down.
    a, b = (0.62, 1.55), (0.3, BODY_Y1 - 0.05)

    def on(t, off):
        return (a[0] + (b[0] - a[0]) * t + off, a[1] + (b[1] - a[1]) * t)

    glass = [on(0.3, 0.0), on(0.3, 0.025), on(0.88, 0.025), on(0.88, 0.0)]
    glass = [glass[0], glass[1], glass[2], glass[3]]
    parts.append(lkit.slab("windscreen", [(u - 0.012, v) for u, v in glass], 1.5, (x_face, 0, 0), M["glass"], turn=turn))
    parts.append(lkit.slab("screenFrame", [(u - 0.02, v) for u, v in [on(0.26, 0.0), on(0.26, 0.018), on(0.92, 0.018), on(0.92, 0.0)]], 1.62, (x_face, 0, 0), M["band"], turn=turn))
    for z in (-0.55, 0.55):
        parts.append(box("headlight", (0.06, 0.12, 0.24), (x_face + direction * 0.61, 1.28, z), M["glass"], bev=0.0))
    parts.append(box("buffer", (0.12, 0.2, 1.5), (x_face + direction * 0.55, BODY_Y0 - 0.12, 0), M["gear"], bev=0.0))
    parts.append(box("coupler", (0.25, 0.14, 0.24), (x_face + direction * 0.62, BODY_Y0 - 0.2, 0), M["gear"], bev=0.0))
    # Cab side windows.
    parts.append(box("cabSide", (0.5, 0.5, HALF_W * 2 + 0.02), (x_face - direction * 0.3, 2.05, 0), M["glass"], bev=0.0))
    return parts


def locomotive(M):
    cx, length, reach = LOCO
    x0, x1 = cx - length / 2, cx + length / 2
    parts = [box("body", (length, BODY_Y1 - BODY_Y0, HALF_W * 2), (cx, (BODY_Y0 + BODY_Y1) / 2, 0), M["body"], bev=0.05)]
    parts.append(roof(M, x0 + 0.02, x1 - 0.02))
    parts.append(box("skirt", (length - 0.4, 0.22, HALF_W * 2 - 0.2), (cx, BODY_Y0 - 0.1, 0), M["gear"], bev=0.0))
    parts.append(box("band", (length - 0.02, 0.1, HALF_W * 2 + 0.02), (cx, 1.62, 0), M["band"], bev=0.0))
    # Machinery-room grilles and a crew door behind the cab.
    for gx in (x0 + 0.55, x0 + 1.25, x0 + 1.95):
        parts.append(box("grille", (0.5, 0.6, HALF_W * 2 + 0.02), (gx, 2.0, 0), M["gear"], bev=0.0))
    parts.append(box("crewDoor", (0.55, 1.3, HALF_W * 2 + 0.02), (x1 - 0.55, BODY_Y0 + 0.66, 0), M["door"], bev=0.0))
    parts.append(box("crewGlass", (0.24, 0.42, HALF_W * 2 + 0.04), (x1 - 0.55, 2.02, 0), M["glass"], bev=0.0))
    # Roof: a cooler, and the pantograph's base frame and insulators. The
    # arms are their own nodes (`pantograph`), raised on the running train and
    # folded on the parked one.
    parts.append(box("cooler", (1.1, 0.14, 1.1), (x0 + 1.0, BODY_Y1 + 0.33, 0), M["roof"], bev=0.03))
    parts.append(box("pantoBase", (0.9, 0.08, 1.0), (PANTO_X, PANTO_TOP + 0.04, 0), M["gear"], bev=0.0))
    for ix in (-0.35, 0.35):
        for iz in (-0.4, 0.4):
            parts.append(cyl("pantoInsulator", 0.05, 0.1, (PANTO_X + ix, PANTO_TOP - 0.02, iz), M["glass"], axis="y", verts=5))
    for dx in (-reach, reach):
        parts += bogie(M, cx + dx, 0.37)
    parts += cab(M, x1, 1)
    return parts


def gangways(M):
    parts = []
    for gx in (1.78, -1.875):
        parts.append(box("gangway", (0.3, 1.25, 1.1), (gx, 1.85, 0), M["gear"], bev=0.0))
        parts.append(box("coupling", (0.4, 0.16, 0.3), (gx, BODY_Y0 - 0.2, 0), M["gear"], bev=0.0))
    return parts


# The pantograph: its base on the locomotive roof, and the contact wire it
# reaches for. The wire is the station's (`blender/landmarks/station.py`
# catenary: PLATFORM_Y 0.95 + 4.3 - 0.8), level along the span, a rod of
# radius 0.035; the collector head stops just under it.
PANTO_X = LOCO[0] + 0.1
PANTO_TOP = BODY_Y1 + 0.27
CONTACT_WIRE_Y = 0.95 + 4.3 - 0.8
HEAD_TOP = CONTACT_WIRE_Y - 0.035 - 0.012


def pantograph(M, raised):
    """A single-arm pantograph: a lower arm from the hinge on the base frame
    to the knee, an upper arm back to the collector head, and a push rod.
    Raised, the head's carbon strips meet the wire; folded, the arms lie on
    the roof as a parked train's do."""
    hinge = (PANTO_X - 0.45, PANTO_TOP + 0.08)
    if raised:
        knee = (PANTO_X + 0.4, PANTO_TOP + 0.08 + 0.78)
        # The strips' tops (head + 0.065) at HEAD_TOP.
        head = (PANTO_X - 0.12, HEAD_TOP - 0.065)
    else:
        knee = (PANTO_X + 0.68, PANTO_TOP + 0.16)
        head = (PANTO_X - 0.1, PANTO_TOP + 0.24)
    parts = []
    for z in (-0.28, 0.28):
        parts.append(lkit.rod("pantoLower", (hinge[0], hinge[1], z), (knee[0], knee[1], z * 0.35), 0.035, M["gear"], sides=3))
    for z in (-0.1, 0.1):
        parts.append(lkit.rod("pantoUpper", (knee[0], knee[1], z), (head[0], head[1], z * 3.5), 0.028, M["gear"], sides=3))
    # The push rod, from the base to just below the knee.
    parts.append(lkit.rod("pantoPush", (hinge[0] + 0.12, hinge[1], 0.0), (knee[0] - 0.08, knee[1] - 0.03, 0.0), 0.018, M["gear"], sides=3))
    # The collector head: a cross-bar with two carbon strips, horns turned down.
    hx, hy = head
    parts.append(box("pantoBar", (0.08, 0.04, 1.1), (hx, hy + 0.02, 0), M["gear"], bev=0.0))
    for dx in (-0.07, 0.07):
        parts.append(box("pantoStrip", (0.05, 0.03, 1.2), (hx + dx, hy + 0.035 + 0.015, 0), M["gear"], bev=0.0))
    for side in (-1, 1):
        parts.append(lkit.rod("pantoHorn", (hx, hy + 0.05, side * 0.6), (hx, hy - 0.04, side * 0.78), 0.02, M["gear"], sides=3))
    return parts


def train(M):
    parts = locomotive(M)
    (c1, l1, r1), (c2, l2, r2) = CARS
    parts += carriage(M, c1, l1, r1)
    parts += carriage(M, c2, l2, r2, cab_end=-1)
    parts += cab(M, c2 - l2 / 2, -1)
    parts += gangways(M)
    return parts


def build():
    kit.reset()
    M = palette()
    body = finish(train(M), "Train")
    up = finish(pantograph(M, True), "PantographRaised")
    down = finish(pantograph(M, False), "PantographLowered")
    # Each pantograph is baked with the train under it but not with the other:
    # they share the one roof.
    for obj, hidden in ((body, (up, down)), (up, (down,)), (down, (up,))):
        for h in hidden:
            h.hide_render = True
        kit.bake_ao([obj], distance=0.4, floor=0.6)
        for h in hidden:
            h.hide_render = False
    return [body, up, down]


def preview(raised=1):
    objs = build()
    drop = "PantographLowered" if raised else "PantographRaised"
    keep = [o for o in objs if o.name != drop]
    for obj in objs:
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    return keep
