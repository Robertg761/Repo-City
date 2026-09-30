"""
The fire station's near level: the three levels of `blender/fire_station.py`
and its engine, each the lean model with the building drawn in -- brick
courses, window surrounds and glazing bars, panelled bay doors with their
tracks, a dentilled cornice, lettering, downpipes, solar cells, shrubs in
leaf -- and an engine with framed roller shutters, treaded tyres and wheel
nuts, a full light bar, wipers, mirrors, ladder rungs and suction hose.

Out come `Station1Near..3Near` and `EngineNear` (same pivots as the lean
nodes: the engine parks at the lean `Station<L>.engine.<i>` markers).

  blender -b --python blender/export.py -- blender/landmarks/fire_near.py fire-station-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import nkit  # noqa: E402  (puts blender/ on sys.path)
import kit  # noqa: E402
import ndetail as nd  # noqa: E402
from kit import finish  # noqa: E402
from mathutils import Matrix  # noqa: E402

BLENDER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lean = nkit.load_lean(os.path.join(BLENDER, "fire_station.py"))
truck = lean.fire_truck

DECK, HALL_Z0, HALL_Z1, HALL_H, DOOR_H, BAY = lean.DECK, lean.HALL_Z0, lean.HALL_Z1, lean.HALL_H, lean.DOOR_H, lean.BAY

REPLACED = ("upSill", "sideMull", "sideSill", "sideLintel", "rearSill", "flag", "downpipe")

# ---------------------------------------------------------------- the engine


def engine_details(acc, T):
    steel, chrome, dark, white, lens, amber = T["steel"], T["chrome"], T["dark"], T["white"], T["lens"], T["amber"]
    shutter = T["shutter"]
    W2, HALF = truck.W2, truck.HALF
    frame_profile = [(0, 0), (0, 0.022), (0.03, 0.022), (0.03, 0)]
    # Roller shutters: a frame, a groove between the slats, a lift handle.
    for s in (-1, 1):
        for z0, z1, y0, y1, slats in ((-0.06, 0.7, 0.42, 1.06, 4), (-0.88, -0.1, 0.42, 1.06, 4), (-1.72, -1.08, 0.82, 1.06, 2), (-2.38, -1.9, 0.42, 1.06, 4)):
            w, h = z1 - z0, y1 - y0
            with acc.at((s * (W2 + 0.012), (y0 + y1) / 2, (z0 + z1) / 2), s * math.pi / 2):
                acc.rect_frame(chrome, -w / 2, w / 2, -h / 2, h / 2, frame_profile)
                for k in range(1, slats):
                    acc.box(dark, (w - 0.02, 0.008, 0.006), (0, -h / 2 + h * k / slats, 0.003))
                acc.box(chrome, (min(0.3, w * 0.5), 0.028, 0.03), (0, -h / 2 + 0.06, 0.02))
                acc.box(steel, (0.03, 0.03, 0.012), (-min(0.12, w * 0.3), -h / 2 + 0.06, 0.006))
                acc.box(steel, (0.03, 0.03, 0.012), (min(0.12, w * 0.3), -h / 2 + 0.06, 0.006))
                acc.box(dark, (0.06, 0.03, 0.015), (0, h / 2 - 0.05, 0.008))
        # Cab doors: a chrome frame round each glazed opening, seals, a footstep mesh.
        for zc, w in ((1.93, 0.5), (1.24, 0.62)):
            with acc.at((s * (W2 + 0.002), 1.52, zc), s * math.pi / 2):
                acc.rect_frame(chrome, -w / 2, w / 2, -0.22, 0.22, [(0, 0), (0, 0.012), (0.02, 0.012), (0.02, 0)])
        # A running board under the cab door with grip ribs.
        with acc.at((s * (W2 - 0.02), 0.36, 1.05), s * math.pi / 2):
            for k in range(8):
                acc.box(chrome, (0.4, 0.008, 0.016), (0, 0.022, -0.2 + k * 0.058))
        # Mirrors: a housing, a glass and a lower convex mirror.
        with acc.at((s * (W2 + 0.16), 1.42, 2.3)):
            acc.box(dark, (0.055, 0.26, 0.14), (0, 0.0, 0.0))
            acc.box(chrome, (0.01, 0.2, 0.1), (s * 0.03, 0.0, 0.0))
            acc.box(dark, (0.045, 0.1, 0.09), (s * 0.006, -0.19, 0.02))
        # Side marker lights along the belt.
        for z in (1.9, 0.5, -0.9, -2.2):
            acc.box(amber, (0.02, 0.035, 0.07), (s * (W2 + 0.03), 0.36, z))
        # Body stripe cap, reflective band lower down.
        acc.box(T["red"], (0.014, 0.05, 4.6), (s * (W2 + 0.008), 0.34, -0.08))
    # The cab front: a full grille, a plate, wipers, tow hooks, fog lamps.
    front = HALF
    for k in range(-4, 5):
        acc.box(chrome, (0.012, 0.29, 0.024), (k * 0.064, 0.84, front + 0.016))
    acc.rect_frame(chrome, -0.325, 0.325, 0.675, 1.005, [(0, 0), (0, 0.045), (0.02, 0.045), (0.02, 0)], z=front)
    acc.box(white, (0.44, 0.13, 0.014), (0, 0.4, front + 0.153))
    nd.letters(acc, dark, "FD 1", 0.08, pos=(0, 0.4, front + 0.16), depth=0.02, spacing=0.4)
    for s in (-1, 1):
        acc.rect_frame(chrome, s * 0.44 - 0.16, s * 0.44 + 0.16, 0.49, 0.71, [(0, 0), (0, 0.045), (0.012, 0.045), (0.012, 0)], z=front)
        acc.cyl(lens, 0.038, 0.02, (s * 0.63, 0.36, front + 0.035), axis="z", sides=10)
        acc.rod(dark, (s * 0.4, 0.33, front), (s * 0.4, 0.33, front + 0.14), 0.014, sides=5)
        acc.sphere(chrome, 0.018, (s * 0.4, 0.33, front + 0.15), sides=6, rings=4)
        for x in (s * 0.5, s * 0.16):
            acc.cyl(chrome, 0.02, 0.012, (x, 0.4, front + 0.135), axis="z", sides=8)
        # Wipers sweeping the raked screen.
        acc.rod(dark, (s * 0.12, 1.24, 2.4), (s * 0.5, 1.66, 2.31), 0.008, sides=4)
        acc.rod(dark, (s * 0.12, 1.24, 2.4), (s * 0.05, 1.78, 2.27), 0.008, sides=4)
        acc.cyl(chrome, 0.02, 0.03, (s * 0.12, 1.235, 2.395), sides=6)
    # The light bar: cells and a clear dome each side of the mid light, a siren.
    for s in (-1, 1):
        for k in range(6):
            acc.box(lens, (0.04, 0.085, 0.2), (s * (0.16 + k * 0.05), truck.ROOF + 0.232, 2.0), skip=("ny",))
        for k in range(7):
            acc.box(dark, (0.005, 0.09, 0.24), (s * (0.135 + k * 0.05), truck.ROOF + 0.232, 2.0))
        acc.box(white, (0.02, 0.03, 0.23), (s * 0.5, truck.ROOF + 0.18, 2.0))
    acc.cyl(chrome, 0.07, 0.05, (0.0, truck.ROOF + 0.27, 2.0), sides=10)
    acc.cyl(dark, 0.045, 0.04, (0.0, truck.ROOF + 0.3, 2.0), sides=10)
    for s in (-1, 1):
        acc.box(chrome, (0.16, 0.04, 0.03), (s * 0.5, truck.ROOF + 0.14, 2.14))
        acc.box(T["head"], (0.08, 0.05, 0.03), (s * 0.5, truck.ROOF + 0.12, 2.16))
    # Wheels: treads, nuts, hub caps and a valve.
    for z in (truck.FRONT_Z, truck.REAR_Z):
        for s in (-1, 1):
            x = s * truck.WHEEL_X
            for i in range(22):
                a = math.tau * (i + 0.5) / 22
                with acc.at((x, truck.WHEEL_R, z), rot=(a, 0, 0)):
                    acc.box(T["tyre"], (0.27, 0.02, 0.05), (0, truck.WHEEL_R - 0.004, 0.0), skip=("ny",))
            with acc.at((x + s * 0.145, truck.WHEEL_R, z), s * math.pi / 2):
                for i in range(8):
                    a = math.tau * i / 8
                    acc.cyl(chrome, 0.017, 0.028, (math.cos(a) * 0.13, math.sin(a) * 0.13, 0.008), axis="z", sides=6)
                acc.cyl(steel, 0.085, 0.03, (0, 0, 0.012), axis="z", sides=12)
                acc.cyl(dark, 0.03, 0.04, (0, 0, 0.03), axis="z", sides=8)
                acc.rod(dark, (0.2, 0.0, 0.0), (0.24, 0.0, 0.0), 0.008, sides=4)
        # Mudflaps behind each rear wheel.
    for s in (-1, 1):
        acc.box(dark, (0.02, 0.24, 0.3), (s * 0.66, 0.2, truck.REAR_Z - 0.4))
    # The walkway's grip ribs, a mid rail, suction hose and its couplings.
    zc0, zc1 = -2.3, 0.7
    n = int((zc1 - zc0) / 0.075)
    for k in range(n):
        acc.box(steel, (0.4, 0.012, 0.024), (0, 1.522, zc0 + k * 0.075), skip=("ny",))
    for s in (-1, 1):
        x = s * (W2 - 0.05)
        acc.box(chrome, (0.03, 0.03, 2.9), (x, 1.62, -0.95))
        for z in (0.45, -0.95, -2.35, -0.25, -1.65):
            acc.box(chrome, (0.026, 0.2, 0.026), (x, 1.62, z))
        acc.cyl(T["dark"], 0.075, 2.25, (s * 0.36, 1.62, -1.3), axis="z", sides=10)
        for k in range(8):
            acc.cyl(chrome, 0.08, 0.03, (s * 0.36, 1.62, -2.3 + k * 0.29), axis="z", sides=10)
        acc.cyl(T["amber"], 0.085, 0.05, (s * 0.36, 1.62, -0.16), axis="z", sides=10)
        acc.cyl(T["amber"], 0.085, 0.05, (s * 0.36, 1.62, -2.42), axis="z", sides=10)
    # The rear: a framed shutter, tail lamp ribs, a tow eye and mud flaps.
    tail = -HALF
    with acc.at((0, 0.78, tail - 0.016), math.pi):
        acc.rect_frame(chrome, -0.4, 0.4, -0.32, 0.32, [(0, 0), (0, 0.02), (0.03, 0.02), (0.03, 0)])
        for k in range(1, 4):
            acc.box(dark, (0.78, 0.008, 0.006), (0, -0.32 + 0.64 * k / 4, 0.004))
        acc.box(chrome, (0.22, 0.028, 0.03), (0, -0.26, 0.02))
    for s in (-1, 1):
        for k in range(4):
            acc.box(dark, (0.12, 0.012, 0.012), (s * 0.52, 0.6 + k * 0.04, tail - 0.026))
        acc.cyl(dark, 0.03, 0.08, (s * 0.3, 0.28, tail - 0.24), axis="z", sides=8)
    acc.rod(steel, (0, 0.34, tail - 0.2), (0, 0.34, tail - 0.32), 0.03, sides=6)
    # Exhaust and a fuel tank under the body.
    acc.cyl(dark, 0.06, 0.9, (0.42, 0.2, -1.0), axis="z", sides=8)
    acc.cyl(steel, 0.09, 0.5, (0.42, 0.24, -0.4), axis="z", sides=10)
    acc.box(steel, (0.5, 0.22, 0.8), (-0.35, 0.22, 0.1))
    # Ladder: the rungs between the lean ones, and the lock catches.
    px, py, pz = truck.LADDER_PIVOT
    pitch = 0.056
    d = (0.0, math.sin(pitch), math.cos(pitch))
    nrm = (0.0, math.cos(pitch), -math.sin(pitch))

    def on(along, lift, x=0.0):
        return (px + x, py + d[1] * along + nrm[1] * lift, pz + d[2] * along + nrm[2] * lift)

    for start, end, half, lift in ((-0.2, 3.3, 0.24, 0.02), (0.1, 3.4, 0.17, 0.1)):
        a = start + 0.4
        while a < end - 0.05:
            acc.box(chrome, (half * 2, 0.022, 0.022), on(a, lift), rot=(pitch, 0, 0))
            a += 0.4
    for a in (0.3, 2.9):
        for s in (-1, 1):
            acc.box(dark, (0.05, 0.05, 0.08), on(a, 0.14, s * 0.24), rot=(pitch, 0, 0))
    acc.box(dark, (0.26, 0.06, 0.1), on(3.35, 0.16), rot=(pitch, 0, 0))


def engine_near():
    T = lean.truck_palette()
    objs = truck.cab(T) + truck.body(T) + truck.wheels(T) + truck.ladder(T, pitch=0.056, stowed=True)
    body = finish(objs, "EngineLean")
    acc = nkit.Acc()
    engine_details(acc, T)
    obj = nkit.rejoin(body, acc.objects(), "EngineNear")
    obj.data.transform(Matrix.Scale(lean.ENGINE_SCALE, 4))
    return obj


# ---------------------------------------------------------------- the station


def station_details(acc, hall, M, level):
    S = lean.S
    trim, wall, red, steel, metal, dark = M["trim"], M["wall"], M["red"], M["steel"], M["metal"], M["dark"]
    width, x = lean.hall_width(level), lean.hall_centre(level)
    depth = HALL_Z1 - HALL_Z0
    mid_z = (HALL_Z0 + HALL_Z1) / 2
    top = DECK + HALL_H
    bays = lean.bay_centres(level)
    open_bays = list(lean.open_bays(level))
    sash = {"frame": trim, "trim": trim}

    # Windows: every glass box the lean model has, framed and barred.
    for o in nkit.openings(hall):
        if o["room"] < 1.0:
            continue  # a window facing the hose tower's wall a hand away
        cx, cy, cz = o["centre"]
        small = o["w"] < 0.55 and o["h"] < 0.45
        tall = o["h"] > 2.5 and o["w"] < 0.7
        with acc.at((cx, cy, cz), nkit.facing(o["face"])):
            if small:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="steel", bars=(2, 1))
            else:
                nd.window(acc, o["w"], o["h"], o["wall"], sash, glass_front=o["thick"] / 2 + 0.004, style="plain",
                          bars=(1, 6) if tall else None, sill=True, lintel=not tall)

    # The rear door: an architrave, two raised panels, a lever handle, kick plate and a crew sign;
    # the louvred vents get a slat's depth.
    rdx = lean.rear_door_x(level)
    with acc.at((rdx, DECK + 1.1, HALL_Z0), nkit.facing("-z")):
        acc.rect_frame(trim, -0.6, 0.6, -1.1, 1.15, [(0, 0), (0, 0.04), (0.03, 0.04), (0.03, 0.06), (0.08, 0.06), (0.08, 0.02), (0.1, 0.02), (0.1, 0)], z=0.0)
        for py, ph in ((0.55, 0.75), (-0.5, 0.75)):
            acc.box(M["redDeep"], (0.72, ph, 0.03), (0, py - 0.1, -0.06))
        acc.box(steel, (0.16, 0.04, 0.05), (0.32, -0.05, -0.04))
        acc.box(steel, (0.9, 0.2, 0.03), (0, -0.95, -0.06))
    with acc.at((rdx, DECK + 2.95, HALL_Z0 - 0.02), nkit.facing("-z")):
        acc.box(trim, (0.5, 0.2, 0.05), (0, 0.0, 0.0))
        nd.letters(acc, red, "CREW", 0.09, pos=(0, 0.0, 0.03), depth=0.015)

    # Brick courses over every wall, the joints as raised lines.
    brick = S("wall", 0.93)
    nkit.courses(acc, hall, brick, ("wall",), pitch=0.08, thick=0.062, lift=0.0025, sample=0.2, min_area=1.5, y_min=DECK + 0.45)

    # Clay tiles on the tower's pyramid roof.
    for face in nkit.slopes(hall, ("red",), min_area=0.8):
        nd.slates(acc, face, red, width=0.2, exposure=0.13, thick=0.012, gap=0.005)

    # The cornice: dentils under it round the hall, and a drip on the parapet.
    path = [(x - width / 2 - 0.12, HALL_Z0 - 0.12), (x + width / 2 + 0.12, HALL_Z0 - 0.12), (x + width / 2 + 0.12, HALL_Z1 + 0.12), (x - width / 2 - 0.12, HALL_Z1 + 0.12)]
    nd.dentils(acc, trim, path, top - 0.4, size=(0.08, 0.09, 0.1), pitch=0.17)
    acc.rect_run(trim, x - width / 2 - 0.02, x + width / 2 + 0.02, HALL_Z0 - 0.02, HALL_Z1 + 0.02, [(0, 0), (0.36, 0), (0.36, 0.03), (0.3, 0.05), (0, 0.05)], y=top + 0.44)

    # Bay doors: architraves, raised panels, tracks, handles and rollers.
    for b, bx in enumerate(bays):
        with acc.at((bx, DECK + DOOR_H / 2 - 0.01, HALL_Z1 + 0.0)):
            acc.rect_frame(trim, -1.5, 1.5, -DOOR_H / 2 + 0.03, DOOR_H / 2, [(0, 0), (0, 0.05), (0.03, 0.05), (0.03, 0.075), (0.09, 0.075), (0.09, 0.03), (0.12, 0.03), (0.12, 0)], z=0.0)
        for s in (-1, 1):
            acc.box(steel, (0.07, DOOR_H, 0.09), (bx + s * 1.44, DECK + DOOR_H / 2, HALL_Z1 - 0.32))
        if b in open_bays:
            # Rolled up: the drum's straps and the guide rails it rides in.
            for k in range(6):
                acc.box(steel, (0.03, 0.34, 0.02), (bx - 1.25 + k * 0.5, DECK + DOOR_H - 0.18, HALL_Z1 - 0.07))
            for s in (-1, 1):
                acc.cyl(steel, 0.09, 0.12, (bx + s * 1.5, DECK + DOOR_H - 0.18, HALL_Z1 - 0.26), axis="x", sides=8)
        else:
            ph = DOOR_H / 4
            zf = HALL_Z1 - 0.26 + 0.04
            for i in range(4):
                y = DECK + ph * (i + 0.5)
                for k in range(3 if i != 2 else 0):
                    nd.frustum(acc, M["redDeep"], 0.86, ph - 0.16, 0.02, 0.03, pos=(bx - 0.98 + k * 0.98, y, zf))
                for s in (-1.4, 1.4):
                    acc.cyl(steel, 0.028, 0.02, (bx + s, y - ph / 2 + 0.01, zf + 0.012), axis="z", sides=8)
                acc.box(steel, (2.98, 0.02, 0.02), (bx, y - ph / 2, zf + 0.008))
            acc.box(steel, (0.2, 0.05, 0.05), (bx, DECK + 0.9, zf + 0.06))
            acc.box(dark, (0.06, 0.06, 0.02), (bx + 1.25, DECK + 1.2, zf + 0.02))
        # The wall lamp over each bay gets a cage.
        for sx in (-1, 1):
            acc.box(steel, (0.02, 0.14, 0.02), (bx + sx * 0.13, DECK + DOOR_H + 0.38, HALL_Z1 + 0.35))
    # The stand-off letters on the parapet either side of the badge.
    with acc.at((x, 0, HALL_Z1 + 0.1)):
        nd.letters(acc, trim, "FIRE", 0.24, pos=(-width / 2 + 0.85, top + 0.08, 0.0), depth=0.03)
        nd.letters(acc, trim, "DEPT", 0.24, pos=(width / 2 - 0.85, top + 0.08, 0.0), depth=0.03)
    # Downpipes at the back corners, round and bracketed.
    for s in (-1, 1):
        nd.downpipe(acc, metal, x + s * (width / 2 + 0.11), HALL_Z0 + 0.25, DECK, top - 0.1, yaw=s * math.pi / 2)
    # The crew door: panels, a push plate and a canopy fascia.
    dx0 = x - width / 2
    with acc.at((dx0 + 0.02, DECK + 1.1, -2.6), -math.pi / 2):
        for j in range(2):
            nd.frustum(acc, red, 0.7, 0.8, 0.025, 0.05, pos=(0, -0.55 + j * 1.1 - 0.0, 0.03))
        acc.box(metal, (0.12, 0.18, 0.012), (0.36, 0.0, 0.03))
        acc.rect_frame(trim, -0.5, 0.5, -1.07, 1.1, [(0, 0), (0, 0.04), (0.08, 0.04), (0.08, 0)], z=0.02)
    # Roof: solar cells, fan blades, drains and a hatch.
    mid_top = top - 0.02
    for i in range(2):
        ux = x - 1.4 + i * 2.8
        for k in range(6):
            a = k * math.pi / 3
            with acc.at((ux, top + 0.545, mid_z - 1.6), a):
                acc.box(dark, (0.24, 0.012, 0.05), (0.14, 0, 0))
        for s in (-1, 1):
            acc.box(steel, (0.02, 0.4, 0.03), (ux + s * 0.4, top + 0.27, mid_z - 1.6 + 0.46))
        with acc.at((ux, top + 0.3, mid_z - 1.6 + 0.455)):
            nd.louvre_panel(acc, steel, 0.8, 0.36, slat=0.07, tilt=0.4, depth=0.03)
    sy = top + 0.35
    for dx in ([-2.3, 0, 2.3] if level >= 2 else [-0.95, 0.95]):
        with acc.at((x + dx, sy + 0.05, mid_z + 1.45), rot=(0.22, 0, 0)):
            for c in range(1, 8):
                acc.box(steel, (0.012, 0.012, 1.2), (-0.8 + c * 0.2, 0.026, 0))
            for r in range(1, 5):
                acc.box(steel, (1.6, 0.012, 0.012), (0, 0.026, -0.6 + r * 0.24))
    # Gravel ballast over the membrane, kept off the plant and the solar frames.
    roof_free = nkit.ground_free(hall, top + 0.02)
    nd.pebbles(acc, M["apron"], x - width / 2 + 0.3, x + width / 2 - 0.3, HALL_Z0 + 0.3, HALL_Z1 - 0.3, top + 0.02, 1000, size=0.045, seed=8, keep=roof_free)
    for hx in (x - 1.0, x + 1.0):
        acc.box(dark, (0.6, 0.06, 0.6), (hx, top + 0.03, mid_z + 0.2))
        acc.box(steel, (0.5, 0.05, 0.5), (hx, top + 0.085, mid_z + 0.2))
    for sx in (-1, 1):
        acc.cyl(steel, 0.07, 0.06, (x + sx * (width / 2 - 0.5), top + 0.03, mid_z + depth / 2 - 0.5), sides=8)


def tower_details(acc, M, tx):
    steel, metal, trim = M["steel"], M["metal"], M["trim"]
    height, tz = 7.4, -1.4
    # Cage hoops up the ladder on the tower's outer face.
    lx = tx + 1.36
    for i in range(8):
        y = DECK + 2.2 + i * 0.6
        for a in range(7):
            t0 = -math.pi / 2 + math.pi * a / 7
            t1 = -math.pi / 2 + math.pi * (a + 1) / 7
            acc.bar(metal, (lx + math.cos(t0) * 0.4, y, tz + math.sin(t0) * 0.45), (lx + math.cos(t1) * 0.4, y, tz + math.sin(t1) * 0.45), 0.03)
    # Louvre slats across the open loft.
    for face, yaw in (("+z", 0.0), ("-z", math.pi), ("+x", math.pi / 2), ("-x", -math.pi / 2)):
        with acc.at((tx, DECK + height - 1.25, tz), yaw):
            for k in range(-3, 4):
                acc.box(trim, (1.4, 0.03, 0.05), (0, k * 0.15, 1.3), rot=(-0.3, 0, 0))
            acc.box(steel, (0.06, 1.2, 0.06), (-0.72, 0, 1.3))
            acc.box(steel, (0.06, 1.2, 0.06), (0.72, 0, 1.3))
    # Hose hooks and a flag halyard pulley on the finial.
    for hx in (-0.35, 0.0, 0.35):
        acc.rod(metal, (tx + hx, DECK + height - 0.85, tz), (tx + hx, DECK + height - 0.75, tz), 0.012, sides=4)
        acc.cyl(M["redDeep"], 0.045, 0.08, (tx + hx, DECK + height - 1.95, tz), sides=8)
    acc.sphere(metal, 0.06, (tx, DECK + height + 1.68, tz), sides=8, rings=5)


def plot_details(acc, M, level):
    S = lean.S
    steel, metal, trim, dark = M["steel"], M["metal"], M["trim"], M["dark"]
    x, width = lean.hall_centre(level), lean.hall_width(level)
    apron_w = width + 2.4
    # Kerb stones round the apron, drain grates and a manhole.
    n = int(apron_w / 0.6)
    for i in range(n):
        acc.box(S("deck", 1.05), (apron_w / n - 0.02, 0.05, 0.16), (x - apron_w / 2 + (i + 0.5) * apron_w / n, DECK + 0.055, 7.42), skip=("ny",))
    for gx in (x - 1.0, x + 1.2):
        acc.box(dark, (0.7, 0.02, 0.36), (gx, DECK + 0.07, 6.6))
        for k in range(8):
            acc.box(steel, (0.03, 0.02, 0.34), (gx - 0.28 + k * 0.08, DECK + 0.085, 6.6))
    acc.cyl(steel, 0.32, 0.03, (x + 0.2, DECK + 0.075, 5.5), sides=14)
    for k in range(3):
        acc.box(dark, (0.5, 0.012, 0.02), (x + 0.2, DECK + 0.095, 5.4 + k * 0.1))
    # Bollards: reflective bands and rings.
    for bx in (x - apron_w / 2 - 0.35, x + apron_w / 2 + 0.35):
        for bz in (4.2, 6.8):
            acc.cyl(M["trim"], 0.128, 0.09, (bx, DECK + 0.6, bz), sides=8)
            acc.cyl(steel, 0.135, 0.02, (bx, DECK + 0.68, bz), sides=8)
    # The hydrant: bolts round its cap, a chained nozzle cap and a hand wheel.
    hx = x - apron_w / 2 - 0.35
    for a in range(6):
        t = a * math.tau / 6
        acc.cyl(metal, 0.014, 0.03, (hx + math.cos(t) * 0.14, DECK + 0.68, 5.5 + math.sin(t) * 0.14), sides=6)
    acc.cyl(metal, 0.06, 0.06, (hx - 0.22, DECK + 0.4, 5.5), axis="x", sides=8)
    acc.cyl(metal, 0.06, 0.06, (hx + 0.22, DECK + 0.4, 5.5), axis="x", sides=8)
    acc.cyl(M["red"], 0.025, 0.05, (hx, DECK + 0.72, 5.5), sides=6)
    acc.sphere(M["red"], 0.05, (hx, DECK + 0.76, 5.5), sides=8, rings=4)
    # Shrubs in leaf.
    for i, (sx, sz) in enumerate(((-6.5, -6.2), (-3.2, -6.4), (2.6, -6.0), (6.8, -6.3))):
        nd.foliage(acc, M["leaf"], (sx, DECK + 0.1 + 0.55 * 0.7, sz), 0.55, 90, size=0.1, seed=10 + i, squash=0.75, dark=M["green"])


def flag_details(acc, M, level):
    metal, trim = M["metal"], M["trim"]
    fx = lean.hall_centre(level) - lean.hall_width(level) / 2 - 1.1
    fz = 2.0
    acc.cyl(trim, 0.28, 0.08, (fx, DECK + 0.34, fz), sides=8)
    for y in (1.0, 2.4, 4.4):
        acc.cyl(metal, 0.085, 0.05, (fx, DECK + y, fz), sides=8)
    # A waving cloth of twelve leaves, with a halyard and two cleats.
    for k in range(12):
        w = 0.13
        wave = math.sin(k * 0.7) * 0.07
        acc.box(M["red"], (w, 0.9 - k * 0.014, 0.025), (fx + 0.06 + w * (k + 0.5), DECK + 6.08 - k * 0.006, fz + wave), rot=(0, math.cos(k * 0.7) * 0.3, 0))
    acc.rod(metal, (fx + 0.04, DECK + 5.7, fz + 0.05), (fx + 0.04, DECK + 1.4, fz + 0.05), 0.006, sides=3)
    for y in (1.3, 1.5):
        acc.box(metal, (0.12, 0.03, 0.03), (fx + 0.08, DECK + y, fz))


def yard_details(acc, M):
    steel, metal, trim, red = M["steel"], M["metal"], M["trim"], M["red"]
    # The drill tower: frames round the cut windows, rungs up the face, a coping drip.
    for wx in (-0.6, 0.6):
        with acc.at((6.6 + wx, DECK + 1.9, 2.9 + 0.15)):
            acc.rect_frame(trim, -0.35, 0.35, -0.4, 0.4, [(0, 0), (0, 0.04), (0.07, 0.04), (0.07, 0)])
            for k in range(1, 3):
                acc.box(trim, (0.03, 0.8, 0.03), (-0.35 + k * 0.233, 0, 0.02))
            acc.box(trim, (0.7, 0.03, 0.03), (0, 0, 0.02))
    for k in range(6):
        acc.box(steel, (0.4, 0.03, 0.05), (6.6, DECK + 0.4 + k * 0.3, 3.08))
    # Hurdles: a second bar and cross ties; the hose reel's coiled hose and crank.
    for i in range(2):
        hx = 5.6 + i * 2.0
        acc.box(red, (0.12, 0.1, 1.6), (hx, DECK + 0.72, 5.2))
        for s in (-0.7, 0.7):
            acc.box(steel, (0.16, 0.05, 0.2), (hx, DECK + 0.03, 5.2 + s))
            acc.bar(metal, (hx, DECK + 0.1, 5.2 + s * 0.95), (hx, DECK + 0.7, 5.2 + s * 0.6), 0.05)
    for k in range(5):
        r = 0.46 - k * 0.05
        acc.cyl(M["redDeep"], r, 0.44 - k * 0.02, (8.0, DECK + 0.62, 6.4), axis="x", sides=14)
    for s in (-1, 1):
        acc.cyl(steel, 0.52, 0.03, (8.0 + s * 0.26, DECK + 0.62, 6.4), axis="x", sides=14)
    acc.rod(metal, (8.3, DECK + 0.62, 6.4), (8.45, DECK + 0.62, 6.4), 0.02, sides=5)
    acc.bar(metal, (8.45, DECK + 0.62, 6.4), (8.45, DECK + 0.95, 6.55), 0.03)
    acc.cyl(steel, 0.04, 0.12, (8.45, DECK + 0.95, 6.6), axis="x", sides=6)
    # The hose laid out across the yard, in short rods.
    prev = None
    for k in range(18):
        t = k / 17
        p = (8.0 - t * 4.8, DECK + 0.05, 6.9 - math.sin(t * math.pi * 1.6) * 0.5 - t * 0.6)
        if prev:
            acc.rod(M["redDeep"], prev, p, 0.05, sides=6)
        prev = p
    # Cones: reflective collars.
    for cx, cz in ((5.0, 3.8), (8.2, 3.8), (5.0, 6.6)):
        acc.cyl(trim, 0.105, 0.06, (cx, DECK + 0.3, cz), sides=8, r2=0.095)
        acc.cyl(trim, 0.135, 0.05, (cx, DECK + 0.21, cz), sides=8, r2=0.125)


def station_near(M, level):
    parts = nkit.drop(lean.station(M, level), *REPLACED)
    hall = finish(parts, f"Station{level}Lean")
    acc = nkit.Acc()
    station_details(acc, hall, M, level)
    plot_details(acc, M, level)
    flag_details(acc, M, level)
    if level >= 2:
        tower_details(acc, M, lean.tower_x(level))
    if level >= 3:
        yard_details(acc, M)
    return nkit.rejoin(hall, acc.objects(), f"Station{level}Near")


def build(levels=(1, 2, 3)):
    kit.reset()
    M = lean.palette()
    made = []
    for level in levels:
        made.append(station_near(M, level))
        _bake_alone(made[-1], made, distance=1.2)
    made.append(engine_near())
    _bake_alone(made[-1], made, distance=0.5)
    return made


def _bake_alone(obj, others, distance):
    hidden = [o for o in others if o is not obj]
    for o in hidden:
        o.hide_render = True
    # Sixteen samples: the near level is dense, and the floor keeps the noise dark-free.
    kit.bake_ao([obj], distance=distance, samples=16, floor=0.55)
    for o in hidden:
        o.hide_render = False


def preview(level):
    """One level with its near engines parked, for the stage renders."""
    import bpy

    if level == 0:
        kit.reset()
        made = [engine_near()]
        _bake_alone(made[0], made, distance=0.5)
        return made
    objs = build((level,))
    engine_obj = next(o for o in objs if o.name == "EngineNear")
    keep = [o for o in objs if o.name == f"Station{level}Near"]
    for i in lean.open_bays(level):
        copy = bpy.data.objects.new(f"engine@{i}", engine_obj.data)
        copy.location = kit.B((lean.bay_centres(level)[i], lean.DECK, lean.ENGINE_Z))
        bpy.context.scene.collection.objects.link(copy)
        keep.append(copy)
    for obj in objs:
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    return keep
