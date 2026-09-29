"""
The transit train's near level: `Train`, `PantographRaised` and
`PantographLowered` of `train.py`, drawn over -- a frame and gasket round
every window pane, door seams, glazing, handrails and thresholds, panel
seams, roof ribs, a louvred cooler with fans, skirt vents, battery boxes and
air tanks under the floor, bogies with flanged wheels, brake discs, axle
boxes, springs and dampers, a cab with wipers, a destination blind, lamp
housings, buffers, couplers and hoses, bellows between the cars, and a
pantograph with its joints, cross-tie, springs and segmented carbon strips.

  blender -b --python blender/export.py -- blender/landmarks/train_near.py transit-train-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
from kit import finish  # noqa: E402

lean = nkit.load_lean(os.path.join(os.path.dirname(os.path.abspath(__file__)), "train.py"))
BODY_Y0, BODY_Y1, HALF_W, AXLE_Y, WHEEL_R, GAUGE = lean.BODY_Y0, lean.BODY_Y1, lean.HALF_W, lean.AXLE_Y, lean.WHEEL_R, lean.GAUGE

REPLACED = ("axle",)

# (centre, length, bogie reach, cab end): the cab end is the end that carries a nose (+1 x, -1 -x, 0 none).
VEHICLES = ((3.7, 3.6, 1.2, 1), (-0.05, 3.4, 1.15, 0), (-3.7, 3.4, 1.15, -1))


def bogie(acc, M, cx):
    """One bogie centred on x = cx: two flanged wheelsets, brake discs, axle
    boxes, coil springs, dampers and a traction motor."""
    body, gear, wheel = M["gear"], M["gear"], M["wheel"]
    for dx in (-0.37, 0.37):
        x = cx + dx
        acc.rod(wheel, (x, AXLE_Y, -GAUGE - 0.1), (x, AXLE_Y, GAUGE + 0.1), 0.06, sides=8)
        for s in (-1, 1):
            z = s * GAUGE
            acc.cyl(wheel, WHEEL_R, 0.1, (x, AXLE_Y, z), axis="z", sides=24)
            acc.cyl(wheel, WHEEL_R + 0.004, 0.026, (x, AXLE_Y, z - s * 0.052), axis="z", sides=24, r2=WHEEL_R)
            acc.cyl(gear, 0.13, 0.05, (x, AXLE_Y, z + s * 0.06), axis="z", sides=12)
            acc.cyl(gear, 0.07, 0.03, (x, AXLE_Y, z + s * 0.09), axis="z", sides=8)
            acc.cyl(gear, 0.21, 0.02, (x, AXLE_Y, s * 0.55), axis="z", sides=16)
            acc.box(gear, (0.24, 0.2, 0.2), (x, AXLE_Y + 0.02, s * (GAUGE + 0.12)))
            acc.box(gear, (0.18, 0.05, 0.14), (x, AXLE_Y + 0.14, s * (GAUGE + 0.12)))
        acc.cyl(gear, 0.13, 0.5, (x, AXLE_Y + 0.05, 0.0), axis="z", sides=10)
    for s in (-1, 1):
        # Springs over the axle boxes: rings stacked into a coil, and a damper beside each.
        for dx in (-0.37, 0.37):
            x = cx + dx
            z = s * (GAUGE + 0.12)
            for k in range(5):
                acc.cyl(gear, 0.075, 0.012, (x, AXLE_Y + 0.17 + k * 0.03, z), sides=8)
            acc.rod(gear, (x + 0.11, AXLE_Y + 0.14, z), (x + 0.11, AXLE_Y + 0.34, z), 0.018, sides=5)
        acc.box(body, (0.9, 0.06, 0.1), (cx, AXLE_Y + 0.3, s * (GAUGE + 0.12)))
    acc.rod(gear, (cx, AXLE_Y + 0.12, -0.3), (cx, AXLE_Y + 0.5, 0.0), 0.03, sides=5)
    acc.cyl(gear, 0.1, 0.34, (cx, AXLE_Y + 0.26, 0.0), axis="z", sides=10)


def side_details(acc, M, cx, length, reach, cab_end):
    body, band, door, glass, gear = M["body"], M["band"], M["door"], M["glass"], M["gear"]
    x0, x1 = cx - length / 2, cx + length / 2
    is_loco = cab_end > 0
    doors = [x0 + 0.5, x1 - 0.5]
    if cab_end:
        doors = [d for d in doors if (d - cx) * cab_end < 0]
    lo, hi = x0 + 0.95, x1 - 0.95
    if cab_end > 0:
        hi = x1 - 0.3
    if cab_end < 0:
        lo = x0 + 0.3
    if is_loco:
        lo, hi = x1 + 5, x1 + 5  # a locomotive has grilles, not windows
    n = max(2, round((hi - lo) / 0.62)) if hi > lo else 0
    for s in (-1, 1):
        with acc.at((0, 0, s * (HALF_W + 0.025)), 0.0 if s > 0 else math.pi):
            u = (lambda x: x) if s > 0 else (lambda x: -x)
            # A gasket frame round every window pane, and a vent slot at the top.
            for k in range(n):
                a = lo + (hi - lo) * k / n + 0.05
                b = lo + (hi - lo) * (k + 1) / n - 0.05
                xa, xb = sorted((u(a), u(b)))
                acc.rect_frame(gear, xa, xb, 1.75, 2.25, [(0, 0), (0, 0.02), (0.022, 0.02), (0.022, 0)])
                acc.box(gear, (xb - xa - 0.1, 0.02, 0.012), (u((a + b) / 2), 2.19, 0.01))
            # Doors: a seam down the middle, a window frame, handrails and a threshold plate.
            for d in doors:
                w = 0.62 if not is_loco else 0.55
                acc.box(gear, (0.012, 1.3, 0.012), (u(d), BODY_Y0 + 0.66, 0.006))
                acc.rect_frame(gear, u(d) - w / 2 + 0.03, u(d) + w / 2 - 0.03, BODY_Y0 + 0.08, BODY_Y0 + 1.22, [(0, 0), (0, 0.012), (0.018, 0.012), (0.018, 0)])
                if not is_loco:
                    acc.rect_frame(gear, u(d) - 0.14, u(d) + 0.14, 1.75, 2.25, [(0, 0), (0, 0.016), (0.02, 0.016), (0.02, 0)])
                for off in (-0.38, 0.38):
                    acc.rod(M["door"], (u(d) + off, BODY_Y0 + 0.12, 0.04), (u(d) + off, BODY_Y0 + 1.25, 0.04), 0.014, sides=6)
                    acc.rod(gear, (u(d) + off, BODY_Y0 + 0.12, 0.04), (u(d) + off, BODY_Y0 + 0.12, 0.0), 0.01, sides=4)
                acc.box(gear, (0.7, 0.03, 0.09), (u(d), BODY_Y0 - 0.02, 0.05))
                acc.box(M["band"], (0.06, 0.06, 0.012), (u(d) + 0.24, BODY_Y0 + 0.75, 0.01))
            # Panel seams above and below the windows.
            k = 0
            xx = x0 + 0.45
            while xx < x1 - 0.3:
                if all(abs(xx - d) > 0.42 for d in doors):
                    acc.box(gear, (0.008, 0.36, 0.006), (u(xx), 1.4, 0.004))
                    acc.box(gear, (0.008, 0.2, 0.006), (u(xx), 2.44, 0.004))
                xx += 0.85
            # Rivet rows along the lower edge and under the roof line.
            xx = x0 + 0.1
            while xx < x1 - 0.08:
                for yy in (BODY_Y0 + 0.07, BODY_Y1 - 0.08):
                    acc.cyl(gear, 0.013, 0.02, (u(xx), yy, -0.015), axis="z", sides=6, r2=0.008)
                xx += 0.11
            # Skirt vents between the bogies.
            for k in (-0.55, 0.0, 0.55):
                with acc.at((u(cx + k * 1.0), BODY_Y0 - 0.1, -0.09), 0.0):
                    nd.louvre_panel(acc, gear, 0.34, 0.16, slat=0.04, tilt=0.4, depth=0.03)
        # Battery boxes and air tanks hang under the floor.
        for k, (dx, w) in enumerate(((-0.55, 0.5), (0.35, 0.5))):
            acc.box(gear, (w, 0.24, 0.3), (cx + dx, BODY_Y0 - 0.3, s * 0.68))
            acc.box(gear, (0.04, 0.16, 0.04), (cx + dx - w / 2 + 0.05, BODY_Y0 - 0.28, s * 0.84))
        acc.cyl(gear, 0.09, 0.9, (cx + 0.05, BODY_Y0 - 0.32, -s * 0.5), axis="x", sides=10)
    # Roof: ribs along the curve, a cooler with louvres and fans, cable run.
    w = HALF_W
    top = BODY_Y1
    profile = [(-w, top - 0.02), (-w + 0.08, top + 0.16), (-w * 0.55, top + 0.27), (w * 0.55, top + 0.27), (w - 0.08, top + 0.16), (w, top - 0.02)]
    xx = x0 + 0.3
    while xx < x1 - 0.2:
        for (za, ya), (zb, yb) in zip(profile, profile[1:]):
            acc.bar(M["roof"], (xx, ya + 0.012, za), (xx, yb + 0.012, zb), 0.035, 0.02)
        xx += 0.5
    fx = cx + (0 if not is_loco else -1.1)
    for s in (-1, 1):
        with acc.at((fx + s * 0.52, top + 0.4, 0.0), s * math.pi / 2):
            nd.louvre_panel(acc, gear, 0.85, 0.12, slat=0.03, tilt=0.5, depth=0.04)
    for zc in (-0.25, 0.25):
        acc.cyl(gear, 0.18, 0.02, (fx, top + 0.42, zc), sides=12)
        for k in range(6):
            with acc.at((fx, top + 0.435, zc), k * math.tau / 6):
                acc.box(gear, (0.16, 0.008, 0.045), (0.09, 0, 0), rot=(0.3, 0, 0))
    acc.rod(gear, (x0 + 0.2, top + 0.3, 0.55), (x1 - 0.2, top + 0.3, 0.55), 0.02, sides=6)
    for x in (x0 + 0.5, cx, x1 - 0.5):
        acc.box(gear, (0.05, 0.06, 0.06), (x, top + 0.29, 0.55))


def cab_details(acc, M, x_face, direction, is_loco):
    """A nose's screens, wipers, blind, lamps, buffers and couplings."""
    gear, glass, body = M["gear"], M["glass"], M["body"]
    turn = 0.0 if direction > 0 else math.pi
    with acc.at((x_face, 0, 0), turn):
        # local +x is the direction the nose points.
        a, b = (0.62, 1.55), (0.3, BODY_Y1 - 0.05)
        ang = math.atan2(b[0] - a[0], b[1] - a[1])
        # Wipers on the raked screen and a centre pillar.
        for z in (-0.45, 0.2):
            acc.rod(gear, (a[0] + (b[0] - a[0]) * 0.28 + 0.03, a[1] + (b[1] - a[1]) * 0.28, z), (a[0] + (b[0] - a[0]) * 0.8 + 0.03, a[1] + (b[1] - a[1]) * 0.8, z + 0.45), 0.008, sides=4)
        acc.rod(gear, (a[0] + (b[0] - a[0]) * 0.28 + 0.03, a[1] + (b[1] - a[1]) * 0.28, 0.0), (a[0] + (b[0] - a[0]) * 0.88 + 0.03, a[1] + (b[1] - a[1]) * 0.88, 0.0), 0.02, sides=4)
        # A destination blind above the screen, with its lettering on the nose.
        with acc.at((0.31, 2.44, 0.0), math.pi / 2):
            acc.box(gear, (0.7, 0.14, 0.02), (0, 0, 0))
            nd.letters(acc, M["glass"], "CITY", 0.07, pos=(0, 0, 0.012), depth=0.006, spacing=0.4)
        # Lamp housings and the number plate.
        with acc.at((0.6, 0, 0), math.pi / 2):
            for z in (-0.55, 0.55):
                acc.rect_frame(gear, z - 0.14, z + 0.14, 1.15, 1.41, [(0, 0), (0, 0.02), (0.02, 0.02), (0.02, 0)])
            acc.box(M["body"], (0.34, 0.1, 0.012), (0, 1.0, 0.008))
            nd.letters(acc, gear, "123", 0.06, pos=(0, 1.0, 0.012), depth=0.006)
            # Buffers with round heads and a coupler with its hoses, kept inside the lean set's length
            # (the timetable hides the train behind that margin).
            for z in (-0.6, 0.6):
                acc.cyl(gear, 0.055, 0.1, (z, BODY_Y0 - 0.12, 0.0), axis="z", sides=10)
                acc.cyl(gear, 0.1, 0.025, (z, BODY_Y0 - 0.12, 0.1), axis="z", sides=12)
            acc.box(gear, (0.1, 0.1, 0.16), (0.0, BODY_Y0 - 0.22, 0.03))
            for z in (-0.22, 0.22):
                acc.rod(gear, (z, BODY_Y0 - 0.16, 0.0), (z * 1.4, BODY_Y0 - 0.34, 0.08), 0.014, sides=5)
            acc.box(gear, (1.5, 0.05, 0.24), (0, BODY_Y0 - 0.06, -0.02))


def train_details(acc, M):
    for cx, length, reach, cab in VEHICLES:
        side_details(acc, M, cx, length, reach, cab)
        for dx in (-reach, reach):
            bogie(acc, M, cx + dx)
    x0, x1, x2 = lean.LOCO[0] + lean.LOCO[1] / 2, -3.7 - 3.4 / 2, 0
    cab_details(acc, M, x0, 1, True)
    cab_details(acc, M, x1, -1, False)
    # The gangways' bellows: ribs round each, in the gap between vehicles.
    for gx in (1.78, -1.875):
        for k in range(5):
            acc.rect_run(M["gear"], gx - 0.15 + k * 0.075 - 0.02, gx - 0.15 + k * 0.075 + 0.02, -0.55, 0.55, [(0, 0), (0.05, 0), (0.05, 0.03), (0, 0.03)], y=1.28)


def pantograph_details(acc, M, raised):
    gear = M["gear"]
    hinge = (lean.PANTO_X - 0.45, lean.PANTO_TOP + 0.08)
    if raised:
        knee = (lean.PANTO_X + 0.4, lean.PANTO_TOP + 0.08 + 0.78)
        head = (lean.PANTO_X - 0.12, lean.HEAD_TOP - 0.065)
    else:
        knee = (lean.PANTO_X + 0.68, lean.PANTO_TOP + 0.16)
        head = (lean.PANTO_X - 0.1, lean.PANTO_TOP + 0.24)
    # Joint blocks at hinge and knee, a cross-tie between the lower arms, a spring on the push rod.
    for z in (-0.28, 0.28):
        acc.box(gear, (0.09, 0.09, 0.07), (hinge[0], hinge[1], z))
        acc.box(gear, (0.08, 0.08, 0.06), (knee[0], knee[1], z * 0.35))
    acc.rod(gear, (hinge[0] + 0.15, hinge[1] + 0.05, -0.28), (hinge[0] + 0.15, hinge[1] + 0.05, 0.28), 0.018, sides=6)
    acc.rod(gear, (knee[0] - 0.1, knee[1], -0.1), (knee[0] - 0.1, knee[1], 0.1), 0.018, sides=6)
    for k in range(6):
        t = 0.2 + k * 0.1
        acc.cyl(gear, 0.03, 0.012, (hinge[0] + 0.12 + (knee[0] - hinge[0] - 0.2) * t, hinge[1] + 0.03 + (knee[1] - hinge[1]) * t * 0.9, 0.0), sides=8)
    # Segmented carbon strips and their mounting clamps on the head.
    hx, hy = head
    for dx in (-0.07, 0.07):
        for k in range(8):
            acc.box(gear, (0.05, 0.034, 0.14), (hx + dx, hy + 0.05, -0.5 + k * 0.143), skip=())
    for k in range(-2, 3):
        acc.box(gear, (0.12, 0.05, 0.03), (hx, hy + 0.03, k * 0.24))
    # A flexible earth strap down the arm.
    acc.rod(M["wheel"], (hinge[0] - 0.05, hinge[1], 0.05), (hinge[0] - 0.05, lean.PANTO_TOP, 0.3), 0.012, sides=4)


def build():
    kit.reset()
    M = lean.palette()
    body_parts = nkit.drop(lean.train(M), *REPLACED)
    body_lean = finish(body_parts, "TrainLean")
    acc = nkit.Acc()
    train_details(acc, M)
    body = nkit.rejoin(body_lean, acc.objects(), "TrainNear")
    made = [body]
    for raised, name in ((True, "PantographRaisedNear"), (False, "PantographLoweredNear")):
        arm = finish(lean.pantograph(M, raised), name + "Lean")
        acc2 = nkit.Acc()
        pantograph_details(acc2, M, raised)
        made.append(nkit.rejoin(arm, acc2.objects(), name))
    up, down = made[1], made[2]
    for obj, hidden in ((made[0], (up, down)), (up, (down,)), (down, (up,))):
        for h in hidden:
            h.hide_render = True
        kit.bake_ao([obj], distance=0.4, samples=16, floor=0.6)
        for h in hidden:
            h.hide_render = False
    return made


def preview(raised=1):
    import bpy

    objs = build()
    drop = "PantographLoweredNear" if raised else "PantographRaisedNear"
    keep = [o for o in objs if o.name != drop]
    for obj in objs:
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    return keep
