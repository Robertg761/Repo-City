"""
The traffic fleet's near (detailed) models, modelled by script.

The street draws the lean fleet (`fleet.py`) for every car; the few cars close
to the camera are drawn from these instead (`LodInstances`, `Traffic.tsx`,
`Overflow.tsx`). Same frame, footprint, wheel and lamp points, paint roles and
outline as the lean bodies: only the detail is new.

    blender -b --python blender/export.py -- blender/fleet/near.py fleet-near

Nodes (all in the lean models' frames):
  <Body>Near     Hatchback, Sedan, Taxi, Van, Pickup, Bus: the lean loft's
                 sections lofted finer with every corner rounded, wheel arches
                 with painted lips, door shut lines, handles, window frames,
                 mirrors, grilles, plates, wipers and so on.
  TractorNear    the tractor, on the same terms.
  WheelNear      the spinning wheel: rounded tyre with tread grooves and a
                 sidewall, a rim with a lip, five spokes and a hub cap.
  Lamps<Body>Near, LampsTractorNear
                 the lit lamps, with housings, layered lenses and reflectors.

Budget: at most 8,000 triangles a car, its body, four wheels and lamps together.
"""

import os
import sys

from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vehicles2"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import fleet  # noqa: E402
import kit  # noqa: E402
import nearkit  # noqa: E402
import parts as parts_mod  # noqa: E402
import parts_near  # noqa: E402
import tractor as tractor_mod  # noqa: E402
from kit import B  # noqa: E402
from nearkit import (  # noqa: E402
    Skin,
    arch_near,
    bead_on_deck,
    bead_on_flank,
    deck,
    flank,
    nose,
)

SPECS = fleet.SPECS
BODIES = fleet.BODIES
NODE = fleet.NODE


def materials():
    M = carkit.palette()
    m = kit.material
    M["seal"] = m("trim", "#3d4045", "metal", 0.6)
    M["bar"] = M["hub"]
    return M


def add(parts, *items):
    for item in items:
        if item is None:
            continue
        if isinstance(item, (list, tuple)):
            add(parts, *item)
        else:
            parts.append(item)


def glass_paths(sections, segs, lo=2, hi=3):
    """The side glass's top and bottom edges as (z, y) polylines, from the lean
    sections: the knots of the segments `segs`, waist point `lo`, roof-edge
    point `hi`."""
    knots = sorted({s for s in segs} | {s + 1 for s in segs})
    top = [(sections[i][0], sections[i][1][hi][1]) for i in knots]
    bottom = [(sections[i][0], sections[i][1][lo][1]) for i in knots]
    return top, bottom


def _samples(path, step=0.22):
    out = []
    for (za, ya), (zb, yb) in zip(path, path[1:]):
        n = max(1, round(abs(zb - za) / step) if abs(zb - za) > abs(yb - ya) else round(abs(yb - ya) / step))
        for i in range(n):
            t = i / n
            out.append((za + (zb - za) * t, ya + (yb - ya) * t))
    out.append(path[-1])
    return out


def frame_runs(skin, name, mat, side, path, half, lift):
    """A moulding along a (z, y) polyline on a flank, one bead per run."""
    parts = []
    for a, b in zip(path, path[1:]):
        parts.append(bead_on_flank(skin, name, mat, side, _samples([a, b]), half, lift))
    return parts


def _clip(path, trim, tail=None):
    """`path` (a (z, y) polyline rising in z) without its first `trim` and last `tail`."""
    z0, z1 = path[0][0] + trim, path[-1][0] - (trim if tail is None else tail)

    def y_at(z):
        for (za, ya), (zb, yb) in zip(path, path[1:]):
            if za <= z <= zb:
                return ya + (yb - ya) * (z - za) / (zb - za)
        return path[-1][1]

    return [(z0, y_at(z0))] + [p for p in path if z0 < p[0] < z1] + [(z1, y_at(z1))]


def window_frame(skin, M, side, top, bottom, inset=0.045, half=0.011, lift=0.006, clip=0.05, belt_tail=0.12, belt=True):
    """Seals round the side glass: along the belt, up the pillars and along the
    roof rail. `top`/`bottom` are the glass's edges; the frame sits `inset`
    inside them so the ray meets the flank, not the rounded roof edge."""
    parts = []
    # Where the glass runs out (an A-pillar's foot) the belt stays on the flank.
    gaps = [ty - by for (_, ty), (_, by) in zip(top, bottom)]
    belt_path = _clip([(z, y + min(0.012, g * 0.2)) for (z, y), g in zip(bottom, gaps)], clip, belt_tail)
    belt_line = belt
    if belt_line:
        parts += frame_runs(skin, "belt", M["seal"], side, belt_path, 0.014, 0.006)
    rail = _clip([(z, y - inset) for z, y in top], clip)
    parts += frame_runs(skin, "rail", M["seal"], side, rail, half, lift)
    return parts


def mirror_near(side, x, y, z, M, reach):
    """A door mirror: a rounded housing on a short stalk, its glass facing
    back. The tip stays inside the body-width limit (`fleet.mirrors`)."""
    s = side
    parts = []
    hx = x + reach / 2 + 0.004
    parts.append(kit.box("mirror", (reach, 0.056, 0.1), (s * hx, y, z), M["paint"], bev=0.013, seg=1))
    stalk = reach * 0.6 + 0.01  # never past the housing's tip
    parts.append(kit.box("stalk", (stalk, 0.02, 0.04), (s * (x - 0.01 + stalk / 2), y - 0.018, z + 0.018), M["seal"], bev=0.0))
    parts.append(carkit.face_panel("mirrorGlass", s * hx, y, z - 0.0545, reach * 0.8, 0.04, M["glass"], -1))
    return parts


def wheel_arches(spec, bottom, M, lip=True):
    r = spec["wheelRadius"]
    front, rear = spec["wheels"][0][1], spec["wheels"][2][1]
    half = spec["width"] / 2 + 0.014
    parts = []
    for z in (front, rear):
        parts += arch_near("arch", z, r, bottom, half, M["arch"], M["paint"])
    return parts


def front_end(skin, spec, M, grille, plate_y, fog=None):
    """Grille, badge, indicators, number plate and (where given) fog lamps on
    the nose. `grille` is (y, width, height)."""
    h = spec["length"] / 2
    parts = []
    gy, gw, gh = grille
    parts.append(nose(skin, "grilleFrame", M["seal"], 1, -gw / 2 - 0.012, gw / 2 + 0.012, gy - gh / 2 - 0.012, gy + gh / 2 + 0.012, 0.006, nx=4, ny=1))
    parts.append(nose(skin, "grille", M["arch"], 1, -gw / 2, gw / 2, gy - gh / 2, gy + gh / 2, 0.012, nx=4, ny=1))
    bars = 4 if gh < 0.12 else 6
    # Slats stay clear of the grille's own edge, or their skirts would share its plane.
    usable = gh - 0.016
    half = min(0.006, usable / bars / 3)
    for i in range(bars):
        y = gy - usable / 2 + usable * (i + 0.5) / bars
        parts.append(nose(skin, "slat", M["bar"], 1, -gw / 2 + 0.01, gw / 2 - 0.01, y - half, y + half, 0.02, nx=3))
    parts.append(nose(skin, "badge", M["bar"], 1, -0.022, 0.022, gy - 0.014, gy + 0.014, 0.030))
    if fog:
        fx, fy = fog
        for s in (-1, 1):
            parts.append(nose(skin, "fogRim", M["seal"], 1, s * fx - 0.036, s * fx + 0.036, fy - 0.03, fy + 0.03, 0.006))
            parts.append(nose(skin, "fog", M["hub"], 1, s * fx - 0.026, s * fx + 0.026, fy - 0.021, fy + 0.021, 0.012))
    parts += plate(skin, M, 1, plate_y)
    parts += lamp_surrounds(skin, spec, M)
    return parts


def lamp_surrounds(skin, spec, M):
    """A dark recess round every head and tail lamp, so the lit lens (drawn as
    its own instance at the spec's point) sits in the bodywork, not on it."""
    parts = []
    lw, lh = spec["lamp"]
    for lamps, end in ((spec["headlights"], 1), (spec["taillights"], -1)):
        for x, y, _ in lamps:
            parts.append(nose(skin, "lampRecess", M["seal"], end, x - lw / 2 - 0.016, x + lw / 2 + 0.016, y - lh / 2 - 0.016, y + lh / 2 + 0.016, 0.006, nx=2))
    return parts


def plate(skin, M, end, y):
    """The number plate in its recess: a dark frame, the plate, its two screws."""
    parts = [
        nose(skin, "plateFrame", M["seal"], end, -0.125, 0.125, y - 0.043, y + 0.043, 0.006),
        nose(skin, "plate", M["plate"], end, -0.11, 0.11, y - 0.032, y + 0.032, 0.012),
    ]
    for s in (-1, 1):
        parts.append(nose(skin, "screw", M["bar"], end, s * 0.09 - 0.005, s * 0.09 + 0.005, y - 0.005, y + 0.005, 0.019))
    return parts


def rear_end(skin, spec, M, plate_y, reflector, exhaust=None, seam=None):
    parts = []
    parts += plate(skin, M, -1, plate_y)
    rx, ry, rw, rh = reflector
    for s in (-1, 1):
        parts.append(nose(skin, "reflector", M["reflector"], -1, s * rx - rw / 2, s * rx + rw / 2, ry - rh / 2, ry + rh / 2, 0.013, nx=2))
        parts.append(nose(skin, "reflectorRim", M["seal"], -1, s * rx - rw / 2 - 0.008, s * rx + rw / 2 + 0.008, ry - rh / 2 - 0.008, ry + rh / 2 + 0.008, 0.005, nx=2))
    if exhaust:
        ex, ey, ez = exhaust
        parts.append(kit.cyl("exhaust", 0.03, 0.06, (ex, ey, -spec["length"] / 2 + 0.01), M["hub"], axis="z", verts=10))
        parts.append(kit.cyl("exhaustMouth", 0.02, 0.068, (ex, ey, -spec["length"] / 2 + 0.01), M["arch"], axis="z", verts=10))
    if seam:
        parts.append(nose(skin, "tailSeam", M["seal"], -1, -seam[0], seam[0], seam[1] - 0.005, seam[1] + 0.005, 0.005, nx=6))
    return parts


def door_lines(skin, M, side, seams, y0, y1, handles, hy=0.555):
    parts = []
    for z in seams:
        parts.append(flank(skin, "seam", M["arch"], side, z - 0.005, z + 0.005, y0, y1, lift=0.012, ny=2))
    for z in handles:
        parts.append(flank(skin, "pocket", M["arch"], side, z - 0.085, z + 0.085, hy - 0.03, hy + 0.028, lift=0.012, nz=2))
        parts.append(flank(skin, "handle", M["bar"], side, z - 0.07, z + 0.07, hy - 0.011, hy + 0.011, lift=0.019, nz=2))
    return parts


def repeater(skin, M, side, z, y):
    """The amber side repeater on the front wing."""
    return [
        flank(skin, "repeaterRim", M["seal"], side, z - 0.038, z + 0.038, y - 0.02, y + 0.02, lift=0.006),
        flank(skin, "repeater", M["amber"], side, z - 0.03, z + 0.03, y - 0.012, y + 0.012, lift=0.012),
    ]


def crease(skin, M, side, y, z0, z1, lift=0.006, half=0.009):
    return [bead_on_flank(skin, "crease", M["paint"], side, _samples([(z0, y), (z1, y)], 0.25), half, lift)]


def wipers(skin, M, foot, top, half, t=0.1):
    """Two wipers on a windscreen from `foot` to `top` (both (z, y)), as
    beads on the glass cast down onto it."""
    (zf, yf), (zt, yt) = foot, top
    parts = []
    for s in (-1, 1):
        rows = []
        for u0, u1 in ((0.1, 0.1), (0.108, 0.108)):
            pass
        path = []
        for i in range(5):
            u = t + 0.05 + 0.09 * i / 4
            path.append((s * (0.05 + (half - 0.05) * i / 4), zf + (zt - zf) * u))
        parts.append(bead_on_deck(skin, "wiper", M["seal"], path, 0.009, 0.009))
    return parts


def roof_fin(M, y, z):
    return [kit.box("fin", (0.03, 0.05, 0.12), (0, y + 0.025, z), M["seal"], bev=0.008)]


def finish(parts, node):
    """Join the parts; a relief that missed the skin is None and is left out
    (it has already said so)."""
    return kit.finish([p for p in parts if p is not None], node)


# ---------------------------------------------------------------------------
# Sedan and taxi
# ---------------------------------------------------------------------------


def sedan(M, taxi=False):
    spec = SPECS["sedan"]
    h = spec["length"] / 2
    ROOF_Y = 1.065
    shell = fleet.sedan_shell()
    body, tree = nearkit.near_loft("body", shell, M, radius=lambda k: 0.075 if k == 3 else 0.04)
    skin = Skin([tree])
    parts = [body]
    parts += wheel_arches(spec, 0.18, M)
    top, bottom = glass_paths(shell[0], (2, 3, 4))
    for s in (-1, 1):
        parts += door_lines(skin, M, s, (0.58, -0.27, -0.62), 0.34, 0.6, () if taxi else (0.05, -0.5))
        parts += repeater(skin, M, s, h - 0.16, 0.4)
        if not taxi:
            parts += crease(skin, M, s, 0.47, -1.15, 1.1)
        parts += window_frame(skin, M, s, top, bottom)
        # The B-pillar, blacked out, from the belt to the roof rail.
        parts.append(flank(skin, "pillarB", M["seal"], s, -0.3, -0.19, 0.63, ROOF_Y - 0.05, lift=0.016, ny=3))
        parts += mirror_near(s, 0.55, 0.68, 0.55, M, 0.04)
        parts.append(flank(skin, "sillTrim", M["seal"], s, -0.55, 0.55, 0.335, 0.36, lift=0.006, nz=4))
    parts += front_end(skin, spec, M, (0.35, 0.4, 0.05), 0.26, fog=(0.385, 0.27))
    parts += rear_end(skin, spec, M, 0.26, (0.36, 0.28, 0.1, 0.03), exhaust=(0.3, 0.215, 0), seam=(0.22, 0.5))
    # Bonnet: two creases, and the washer jets.
    for s in (-1, 1):
        parts.append(bead_on_deck(skin, "bonnetLine", M["paint"], [(s * 0.24, 0.72), (s * 0.24, 1.0), (s * 0.2, 1.3)], 0.011, 0.005))
    parts += wipers(skin, M, (0.64, 0.63), (0.14, ROOF_Y), 0.33)
    parts.append(deck(skin, "bootSeam", M["arch"], -0.4, 0.4, -1.06, -1.05, lift=0.004, nx=6))
    parts += roof_fin(M, ROOF_Y - 0.01, -0.62)
    parts.append(kit.cyl("fuelFlap", 0.04, 0.02, (0.548, 0.5, -0.9), M["seal"], axis="x", verts=10))
    if taxi:
        parts.append(carkit.lidless_box("signBase", (0.44, 0.05, 0.22), (0, ROOF_Y + 0.025, -0.23), M["trim"]))
        for s in (-1, 1):
            parts.append(flank(skin, "band", M["trim"], s, -1.0, 0.64, 0.47, 0.53, lift=0.006, nz=6))
    return parts


# ---------------------------------------------------------------------------
# Hatchback
# ---------------------------------------------------------------------------


def hatchback(M):
    spec = SPECS["hatchback"]
    h = spec["length"] / 2
    ROOF_Y = 1.1
    shell = fleet.hatchback_shell()
    body, tree = nearkit.near_loft("body", shell, M, radius=lambda k: 0.07 if k == 3 else 0.04)
    skin = Skin([tree])
    parts = [body]
    parts += wheel_arches(spec, 0.17, M)
    top, bottom = glass_paths(shell[0], (1, 2))
    for s in (-1, 1):
        parts += door_lines(skin, M, s, (0.45, -0.27), 0.33, 0.64, (0.02, -0.5), hy=0.585)
        parts += crease(skin, M, s, 0.47, -1.05, 1.0)
        parts += repeater(skin, M, s, h - 0.13, 0.4)
        parts += window_frame(skin, M, s, top, bottom)
        parts.append(flank(skin, "pillarB", M["seal"], s, -0.3, -0.19, 0.66, ROOF_Y - 0.05, lift=0.012, ny=3))
        # The C-pillar, a wide painted post behind the glass.
        parts.append(flank(skin, "pillarC", M["paint"], s, -1.06, -0.84, 0.66, ROOF_Y - 0.05, lift=0.016, ny=3))
        parts += mirror_near(s, 0.51, 0.72, 0.46, M, 0.05)
        parts.append(flank(skin, "sillTrim", M["seal"], s, -0.5, 0.5, 0.325, 0.35, lift=0.006, nz=4))
    parts += front_end(skin, spec, M, (0.355, 0.36, 0.05), 0.26, fog=(0.37, 0.27))
    parts += rear_end(skin, spec, M, 0.4, (0.33, 0.28, 0.1, 0.03), exhaust=(0.28, 0.215, 0))
    # The tailgate: its outline, latch and wiper.
    for x in (-0.4, 0.4):
        parts.append(nose(skin, "gateSeam", M["arch"], -1, x - 0.005, x + 0.005, 0.36, 0.64, 0.004, ny=2))
    parts.append(nose(skin, "gateSeam", M["arch"], -1, -0.4, 0.4, 0.335, 0.345, 0.004, nx=6))
    parts.append(nose(skin, "gateHandle", M["bar"], -1, -0.07, 0.07, 0.585, 0.605, 0.014, nx=2))
    for s in (-1, 1):
        parts.append(bead_on_deck(skin, "bonnetLine", M["paint"], [(s * 0.22, 0.6), (s * 0.22, 0.85), (s * 0.19, 1.05)], 0.011, 0.005))
    parts += wipers(skin, M, (0.54, 0.665), (0.06, ROOF_Y), 0.3)
    parts += roof_fin(M, ROOF_Y - 0.01, -0.7)
    parts.append(kit.cyl("fuelFlap", 0.04, 0.02, (0.508, 0.5, -0.85), M["seal"], axis="x", verts=10))
    return parts


# ---------------------------------------------------------------------------
# Van
# ---------------------------------------------------------------------------


def van(M):
    spec = SPECS["van"]
    h = spec["length"] / 2
    TOP = 1.52
    shell = fleet.van_shell()
    body, tree = nearkit.near_loft("body", shell, M, radius=lambda k: 0.06 if k == 4 else 0.04)
    skin = Skin([tree])
    parts = [body]
    parts += wheel_arches(spec, 0.2, M)
    top, bottom = glass_paths(shell[0], (2, 3))
    for s in (-1, 1):
        # Cab door and the sliding door behind it, with its runner.
        for z in (1.24, 0.46, -0.32):
            parts.append(flank(skin, "seam", M["arch"], s, z - 0.005, z + 0.005, 0.62 if z > 1 else 0.4, 1.42 if z < 1 else 0.92, lift=0.010, ny=3))
        for y in (0.42, 1.44):
            parts.append(flank(skin, "runner", M["seal"], s, -0.3, 0.46, y - 0.012, y + 0.012, lift=0.008, nz=4))
        parts.append(flank(skin, "stripe", M["panel"], s, -1.47, 0.44, 0.97, 1.07, lift=0.006, nz=8))
        parts += repeater(skin, M, s, h - 0.13, 0.5)
        parts += door_lines(skin, M, s, (), 0, 0, (0.24,), hy=0.735)
        parts += door_lines(skin, M, s, (), 0, 0, (0.72,), hy=0.78)
        parts += window_frame(skin, M, s, top, bottom, inset=0.05, belt=False)
        parts += mirror_near(s, 0.58, 0.9, 1.25, M, 0.012)
        parts.append(flank(skin, "sillTrim", M["seal"], s, -1.1, 1.1, 0.375, 0.4, lift=0.006, nz=8))
    parts += front_end(skin, spec, M, (0.44, 0.56, 0.13), 0.28)
    parts += rear_end(skin, spec, M, 0.28, (0.35, 0.29, 0.1, 0.03))
    # The rear doors: the seam between them, their outlines, handle and a step.
    parts.append(nose(skin, "doorSeam", M["arch"], -1, -0.008, 0.008, 0.4, 1.43, 0.005, ny=4))
    for x in (-0.5, 0.5):
        parts.append(nose(skin, "doorEdge", M["arch"], -1, x - 0.005, x + 0.005, 0.4, 1.43, 0.005, ny=4))
    parts.append(nose(skin, "doorEdge", M["arch"], -1, -0.5, 0.5, 1.435, 1.445, 0.005, nx=6))
    parts.append(nose(skin, "handle", M["bar"], -1, 0.04, 0.16, 0.88, 0.92, 0.016, nx=2))
    parts.append(kit.box("step", (1.0, 0.045, 0.07), (0, 0.395, -h), M["seal"], bev=0.01))
    # The roof rack: rails along the roof and the crossbars between them.
    for z in (-1.05, -0.3):
        parts.append(carkit.lidless_box("roofBar", (1.04, 0.035, 0.07), (0, TOP + 0.03, z), M["trim"]))
    for x in (-0.46, 0.46):
        parts.append(carkit.lidless_box("roofRail", (0.03, 0.03, 1.0), (x, TOP + 0.05, -0.68), M["trim"]))
        for z in (-1.05, -0.3):
            parts.append(carkit.lidless_box("foot", (0.05, 0.03, 0.09), (x, TOP + 0.012, z), M["seal"]))
    parts += wipers(skin, M, (1.36, 0.79), (0.95, 1.42), 0.36, t=0.12)
    return parts


# ---------------------------------------------------------------------------
# Pickup
# ---------------------------------------------------------------------------


def pickup(M):
    spec = SPECS["pickup"]
    h = spec["length"] / 2
    ROOF_Y = 1.24
    BED = 0.74
    RAIL = 1.02
    back = fleet.PICKUP_BACK
    cab_shell = fleet.pickup_shell()
    cab, cab_tree = nearkit.near_loft("cab", cab_shell, M, radius=lambda k: 0.07 if k == 3 else 0.04)
    tub, tub_tree = nearkit.near_loft("tub", fleet.pickup_tub_shell(), M, radius=lambda k: 0.03)
    skin = Skin([cab_tree, tub_tree])
    parts = [cab, tub]
    # The inside of the bed: walls, the tailgate's inner face, a ribbed floor,
    # and the wheel arches that intrude on it.
    inner = 0.5
    for s in (-1, 1):
        parts.append(carkit.quad("wall", [(s * inner, BED, -h + 0.08), (s * inner, BED, back), (s * inner, RAIL, back), (s * inner, RAIL, -h + 0.08)], M["paint"], (-s, 0, 0)))
        parts.append(carkit.lidless_box("bedArch", (0.13, 0.13, 0.6), (s * 0.435, BED + 0.065, -0.98), M["paint"]))
    parts.append(carkit.quad("gateIn", [(-inner, BED, -h + 0.08), (inner, BED, -h + 0.08), (inner, RAIL, -h + 0.08), (-inner, RAIL, -h + 0.08)], M["paint"], (0, 0, 1)))
    parts.append(carkit.quad("floor", [(-inner, BED, -h + 0.08), (inner, BED, -h + 0.08), (inner, BED, back), (-inner, BED, back)], M["trim"], (0, 1, 0)))
    for x in (-0.3, -0.1, 0.1, 0.3):
        parts.append(carkit.lidless_box("rib", (0.024, 0.014, back + h - 0.16 + 0.0), (x, BED + 0.007, (back + -h + 0.1) / 2 - 0.01), M["hub"]))
    # The bulkhead behind the cab, with its window frame and glass.
    parts.append(carkit.quad("bulkhead", [(-inner, BED, back + 0.002), (inner, BED, back + 0.002), (inner, RAIL, back + 0.002), (-inner, RAIL, back + 0.002)], M["paint"], (0, 0, -1)))
    parts += wheel_arches(spec, 0.2, M)
    top, bottom = glass_paths(cab_shell[0], (0, 1))
    for s in (-1, 1):
        parts += door_lines(skin, M, s, (0.5, -0.3), 0.36, 0.72, (-0.16,), hy=0.635)
        parts += crease(skin, M, s, 0.5, -1.4, 1.2)
        parts += repeater(skin, M, s, h - 0.13, 0.43)
        parts += window_frame(skin, M, s, top, bottom)
        parts += mirror_near(s, 0.57, 0.8, 0.52, M, 0.02)
        parts.append(flank(skin, "sillTrim", M["seal"], s, 0.3, 1.0, 0.375, 0.4, lift=0.006, nz=3))
        # The bed's rail cap, a raised strip along each wall, and tie-down cleats.
        parts.append(deck(skin, "railCap", M["hub"], s * 0.515, s * 0.545, -1.42, -0.4, lift=0.008, nz=6))
        for z in (-1.25, -0.6):
            parts.append(kit.box("cleat", (0.03, 0.03, 0.06), (s * 0.49, RAIL - 0.05, z), M["seal"], bev=0.006))
    parts += front_end(skin, spec, M, (0.405, 0.5, 0.085), 0.29, fog=(0.4, 0.28))
    parts += rear_end(skin, spec, M, 0.29, (0.36, 0.3, 0.1, 0.03), exhaust=(0.3, 0.2, 0))
    # The tailgate: outline and latch handle.
    for x in (-0.46, 0.46):
        parts.append(nose(skin, "gateSeam", M["arch"], -1, x - 0.005, x + 0.005, 0.4, 0.99, 0.004, ny=3))
    parts.append(nose(skin, "gateSeam", M["arch"], -1, -0.46, 0.46, 0.395, 0.405, 0.004, nx=6))
    parts.append(nose(skin, "gateHandle", M["bar"], -1, -0.09, 0.09, 0.92, 0.95, 0.016, nx=2))
    # The cab's back window, seen from the bed.
    parts.append(nose(skin, "backFrame", M["seal"], -1, -0.31, 0.31, 0.85, 1.17, 0.005, nx=3, reach=0.8))
    parts.append(nose(skin, "backGlass", M["glass"], -1, -0.28, 0.28, 0.88, 1.14, 0.009, nx=3, reach=0.8))
    parts += wipers(skin, M, (0.62, 0.73), (0.26, ROOF_Y), 0.34)
    for s in (-1, 1):
        parts.append(bead_on_deck(skin, "bonnetLine", M["paint"], [(s * 0.2, 0.75), (s * 0.2, 1.0), (s * 0.17, 1.3)], 0.011, 0.005))
    parts += roof_fin(M, ROOF_Y - 0.01, 0.0)
    return parts


# ---------------------------------------------------------------------------
# Bus
# ---------------------------------------------------------------------------


def bus(M):
    spec = SPECS["bus"]
    h = spec["length"] / 2
    W = 0.58
    shell = fleet.bus_shell()
    body, tree = nearkit.near_loft("body", shell, M, radius=lambda k: 0.06 if k == 4 else 0.045, spacing=0.22)
    skin = Skin([tree])
    parts = [body]
    parts += wheel_arches(spec, 0.22, M)
    top, bottom = glass_paths(shell[0], (0, 1, 2))
    for s in (-1, 1):
        parts += window_frame(skin, M, s, top, bottom, inset=0.05, half=0.014, clip=0.15)
        # Window pillars: raised posts between the panes.
        for z in (-1.75, -1.4, -1.05, -0.7, -0.35, 0.0, 0.35, 0.7, 1.05):
            if s < 0 and 0.45 < z < 1.15:
                continue  # the door
            parts.append(flank(skin, "pillar", M["paint"], s, z - 0.04, z + 0.04, 1.045, 1.55, lift=0.014, ny=2))
        # Body panel seams down the skirt.
        for z in (-1.75, -1.05, -0.35, 0.35, 1.05, 1.75):
            if s < 0 and 0.4 < z < 1.2:
                continue
            parts.append(flank(skin, "seam", M["arch"], s, z - 0.005, z + 0.005, 0.46, 1.03, lift=0.012, ny=2))
        parts.append(flank(skin, "beltLine", M["seal"], s, -2.0, 2.0, 0.445, 0.47, lift=0.006, nz=10))
        # Engine louvres on the rear quarter.
        for z0 in (-1.84, -1.68, -1.52):
            parts.append(flank(skin, "louvreFrame", M["seal"], s, z0 - 0.024, z0 + 0.024, 0.62, 0.92, lift=0.006))
            for y in (0.68, 0.75, 0.82, 0.88):
                parts.append(flank(skin, "louvre", M["arch"], s, z0 - 0.018, z0 + 0.018, y - 0.008, y + 0.008, lift=0.014))
        parts += mirror_near(s, W, 1.35, 2.1, M, 0.012)
    # The door on the kerb side: frame, two leaves with panes, handrail, step.
    parts.append(flank(skin, "doorFrame", M["seal"], -1, 0.44, 1.16, 0.3, 1.24, lift=0.012, nz=2, ny=6))
    for z0, z1 in ((0.47, 0.79), (0.81, 1.13)):
        parts.append(flank(skin, "doorPane", M["glass"], -1, z0 + 0.02, z1 - 0.02, 0.55, 1.2, lift=0.018, ny=6))
        parts.append(flank(skin, "doorLeaf", M["paint"], -1, z0 + 0.01, z1 - 0.01, 0.31, 0.53, lift=0.018))
    parts.append(kit.box("doorStep", (0.06, 0.03, 0.76), (-0.57, 0.29, 0.8), M["seal"], bev=0.008))
    parts.append(kit.cyl("handrail", 0.012, 0.6, (-W + 0.03, 0.85, 0.79), M["hub"], axis="y", verts=6))
    parts += front_end_bus(skin, spec, M)
    parts += rear_end(skin, spec, M, 0.43, (0.44, 0.35, 0.1, 0.04), exhaust=(0.32, 0.27, 0))
    # The engine grille and hatch on the tail, and the rear panel's seams.
    parts.append(nose(skin, "engineFrame", M["seal"], -1, -0.31, 0.31, 0.6, 1.05, 0.006, nx=3, ny=2))
    for i in range(7):
        y = 0.64 + i * 0.058
        parts.append(nose(skin, "engineSlat", M["arch"], -1, -0.28, 0.28, y - 0.015, y + 0.015, 0.012, nx=2))
    parts.append(nose(skin, "rearWindow", M["glass"], -1, -0.36, 0.36, 1.12, 1.52, 0.006, nx=3, ny=1))
    # The roof: the pod's vents, and two hatches.
    parts.append(kit.box("pod", (0.72, 0.14, 1.1), (0, 1.9, -0.9), M["panel"], bev=0.02))
    for z in (-1.2, -0.6):
        parts.append(kit.box("podVent", (0.4, 0.018, 0.12), (0, 1.975, z), M["arch"], bev=0.0))
    for z in (0.3, 1.2):
        parts.append(deck(skin, "hatch", M["arch"], -0.25, 0.25, z - 0.25, z + 0.25, lift=0.012, nx=2, nz=2))
    parts += wipers_bus(skin, M)
    return parts


def front_end_bus(skin, spec, M):
    parts = []
    parts.append(nose(skin, "grilleFrame", M["seal"], 1, -0.27, 0.27, 0.45, 0.6, 0.006, nx=4, ny=1))
    parts.append(nose(skin, "grille", M["arch"], 1, -0.25, 0.25, 0.465, 0.585, 0.012, nx=4, ny=1))
    for i in range(6):
        y = 0.47 + i * 0.02
        parts.append(nose(skin, "slat", M["bar"], 1, -0.24, 0.24, y - 0.004, y + 0.004, 0.02, nx=3))
    parts.append(nose(skin, "badge", M["bar"], 1, -0.03, 0.03, 0.62, 0.66, 0.02))
    parts += plate(skin, M, 1, 0.33)
    parts += lamp_surrounds(skin, spec, M)
    # The bumper: a dark lip across the nose under the plate.
    parts.append(nose(skin, "bumperLip", M["seal"], 1, -0.5, 0.5, 0.25, 0.285, 0.014, nx=6))
    return parts


def wipers_bus(skin, M):
    parts = []
    for s in (-1, 1):
        x0, x1 = (0.06, 0.28) if s > 0 else (-0.28, -0.06)
        parts.append(nose(skin, "wiper", M["seal"], 1, x0, x1, 0.98, 1.0, 0.012, nx=3))
    return parts


# ---------------------------------------------------------------------------
# Tractor
# ---------------------------------------------------------------------------


def tractor_near(M):
    T = tractor_mod
    CAB_Z = T.CAB_Z
    NOSE = T.NOSE
    bonnet, btree = nearkit.near_loft("bonnet", T.bonnet_shell(), M, radius=lambda k: 0.05, spacing=0.2)
    roof, rtree = nearkit.near_loft("roof", T.roof_shell(), M, radius=lambda k: 0.03, spacing=0.2, end_round=0.02)
    skin = Skin([btree])
    parts = [bonnet, roof]
    parts.append(carkit.lidless_box("chassis", (0.5, 0.3, 1.96), (0, 0.55, 0.28), M["trim"]))
    # Grille: a dark frame, slats between the lamps, a badge; rims round the lamps.
    parts.append(nose(skin, "grilleFrame", M["seal"], 1, -0.115, 0.115, 0.66, 0.98, 0.004, nx=2, ny=2))
    for i in range(7):
        y = 0.685 + i * 0.043
        parts.append(nose(skin, "slat", M["hub"], 1, -0.1, 0.1, y - 0.009, y + 0.009, 0.014, nx=2))
    parts.append(nose(skin, "badge", M["bar"], 1, -0.025, 0.025, 0.995, 0.999, 0.02))
    for s in (-1, 1):
        parts.append(nose(skin, "lampRim", M["seal"], 1, s * 0.2 - 0.078, s * 0.2 + 0.078, 0.86 - 0.065, 0.86 + 0.065, 0.008, nx=2, ny=1))
    for s in (-1, 1):
        # Vents down the bonnet's flanks, each a frame with slats.
        for z in (0.35, 0.55, 0.75):
            parts.append(flank(skin, "ventFrame", M["seal"], s, z - 0.07, z + 0.07, 0.74, 1.0, lift=0.004, nz=1, ny=2))
            for i in range(5):
                y = 0.78 + i * 0.045
                parts.append(flank(skin, "ventSlat", M["arch"], s, z - 0.055, z + 0.055, y - 0.011, y + 0.011, lift=0.012))
        parts.append(flank(skin, "hoodSeam", M["arch"], s, -0.05, 1.28, 0.985, 0.995, lift=0.010, nz=5))
        parts.append(flank(skin, "sideSeam", M["arch"], s, -0.05, 1.28, 0.7, 0.71, lift=0.010, nz=5))
    parts.append(bead_on_deck(skin, "hinge", M["seal"], [(0.0, 0.0), (0.0, 0.5), (0.0, 1.0), (0.0, 1.26)], 0.008, 0.004))
    # Front weights (two slotted blocks), the axle with its hubs, steering rods.
    parts.append(carkit.lidless_box("weightA", (0.62, 0.1, 0.2), (0, 0.5, 1.24), M["trim"]))
    parts.append(carkit.lidless_box("weightB", (0.56, 0.1, 0.18), (0, 0.38, 1.24), M["trim"]))
    for x in (-0.18, 0.0, 0.18):
        parts.append(carkit.lidless_box("weightSlot", (0.05, 0.06, 0.02), (x, 0.45, 1.345), M["arch"]))
    parts.append(kit.cyl("axle", 0.05, 0.92, (0, 0.3, 0.82), M["trim"], axis="x", verts=10))
    parts.append(kit.cyl("rearAxle", 0.06, 0.6, (0, 0.5, -0.62), M["trim"], axis="x", verts=10))
    for s in (-1, 1):
        parts.append(kit.cyl("hub", 0.075, 0.09, (s * 0.365, 0.3, 0.82), M["hub"], axis="x", verts=10))
        parts.append(kit.strut("steer", (s * 0.3, 0.3, 0.9), (s * 0.05, 0.36, 1.0), (0.02, 0.02), M["seal"]))
    # The exhaust stack, ahead of the cab, with a collar and a rain cap.
    parts.append(kit.cyl("exhaust", 0.04, 0.8, (0.2, 1.5, 0.35), M["trim"], axis="y", verts=10))
    parts.append(kit.cyl("exhaustCollar", 0.055, 0.05, (0.2, 1.14, 0.35), M["seal"], axis="y", verts=10))
    parts.append(kit.cyl("exhaustCap", 0.05, 0.04, (0.2, 1.91, 0.35), M["hub"], axis="y", verts=10, radius2=0.035))
    parts.append(kit.cyl("airFilter", 0.05, 0.3, (-0.2, 1.2, 0.5), M["trim"], axis="y", verts=10))
    parts.append(kit.cyl("airFilterCap", 0.06, 0.03, (-0.2, 1.365, 0.5), M["seal"], axis="y", verts=10))
    # The cab: floor pan, glass all round, posts, a door on each side.
    parts.append(carkit.lidless_box("pan", (0.58, 0.2, 1.0), (0, 0.95, CAB_Z), M["paint"]))
    parts.append(carkit.drop_faces(kit.box("glass", (0.54, 0.74, 0.92), (0, 1.42, CAB_Z), M["glass"], bev=0.0), lambda n: abs(n.z) > 0.9))
    for x, z in ((0.28, 0.04), (-0.28, 0.04), (0.28, -0.94), (-0.28, -0.94)):
        parts.append(carkit.drop_faces(kit.box("post", (0.06, 0.78, 0.06), (x, 1.42, z), M["paint"], bev=0.01, seg=1), lambda n: abs(n.z) > 0.9))
    for s in (-1, 1):
        # Belt and rail across each side, a middle post and the door's seams.
        for y in (1.06, 1.78):
            parts.append(kit.box("beam", (0.014, 0.03, 0.92), (s * 0.276, y - (0.015 if y > 1.5 else 0), CAB_Z), M["seal"], bev=0.0))
        parts.append(kit.box("midPost", (0.02, 0.72, 0.03), (s * 0.276, 1.42, CAB_Z - 0.2), M["seal"], bev=0.0))
        parts.append(kit.box("handle", (0.03, 0.02, 0.1), (s * 0.29, 1.28, CAB_Z + 0.32), M["hub"], bev=0.005))
        # A step under the door and the fuel tank below it.
        parts.append(carkit.lidless_box("step", (0.14, 0.025, 0.36), (s * 0.36, 0.78, CAB_Z + 0.35), M["seal"]))
        parts.append(kit.cyl("tank", 0.075, 0.4, (s * 0.38, 0.62, -0.02), M["trim"], axis="z", verts=10))
        parts.append(kit.cyl("tankCap", 0.02, 0.03, (s * 0.38, 0.66, 0.16), M["hub"], axis="y", verts=8))
        # The mirror on its arm.
        parts.append(kit.box("mirrorArm", (0.16, 0.015, 0.015), (s * 0.35, 1.72, -0.02), M["seal"], bev=0.0))
        parts.append(kit.box("mirror", (0.03, 0.1, 0.06), (s * 0.43, 1.72, -0.02), M["paint"], bev=0.008, seg=1))
        parts.append(carkit.face_panel("mirrorGlass", s * 0.43, 1.72, -0.0545, 0.024, 0.08, M["glass"], -1))
        parts.append(T.mudguard(s, M, degrees=range(10, 171, 13)))
        parts.append(carkit.lidless_box("bracket", (0.18, 0.14, 0.08), (s * 0.4, 0.95, -1.03), M["trim"]))
        parts.append(kit.strut("liftArm", (s * 0.22, 0.6, -0.9), (s * 0.4, 0.78, -1.25), (0.03, 0.03), M["trim"]))
        # A work lamp at each front corner of the roof.
        parts.append(kit.box("workLamp", (0.1, 0.05, 0.05), (s * 0.28, 1.9, CAB_Z + 0.5), M["seal"], bev=0.01, seg=1))
        parts.append(carkit.face_panel("workLens", s * 0.28, 1.9, CAB_Z + 0.5 + 0.0295, 0.08, 0.035, M["hub"], 1))
    # Wipers on the windscreen, a roof vent and a rear window seal.
    for s in (-1, 1):
        parts.append(kit.box("wiper", (0.2, 0.012, 0.006), (s * 0.13, 1.38, CAB_Z + 0.465), M["seal"], bev=0.0, rot=(0, 0, s * 0.12)))
    parts.append(kit.box("roofVent", (0.3, 0.03, 0.3), (0, 1.885, CAB_Z - 0.25), M["seal"], bev=0.01, seg=1))
    # The hitch: drawbar, pin and the power take-off stub.
    parts.append(carkit.lidless_box("hitch", (0.2, 0.12, 0.3), (0, 0.5, -1.2), M["trim"]))
    parts.append(kit.cyl("hitchPin", 0.018, 0.16, (0, 0.53, -1.28), M["hub"], axis="y", verts=8))
    parts.append(kit.cyl("pto", 0.022, 0.1, (0, 0.62, -1.1), M["hub"], axis="z", verts=8))
    return parts


BUILDERS = {
    "hatchback": hatchback,
    "sedan": lambda M: sedan(M),
    "taxi": lambda M: sedan(M, taxi=True),
    "van": van,
    "pickup": pickup,
    "bus": bus,
}


def make(kind, M):
    return finish(BUILDERS[kind](M), NODE[kind] + "Near")


def build():
    kit.reset()
    M = materials()
    PM = parts_mod.materials()
    objs = [make(kind, M) for kind in BODIES]
    objs.append(finish(tractor_near(M), "TractorNear"))
    # Baked apart, so no car darkens its neighbour.
    for i, obj in enumerate(objs):
        obj.location.x = (i - (len(objs) - 1) / 2) * 3.2
    kit.bake_ao(objs, distance=0.4, samples=16, floor=0.55)
    for obj in objs:
        obj.location.x = 0
    # The wheel is built with its hub 1 up, standing on the bake's ground, and
    # its node's origin there: the runtime reads it centred on 0.
    wheel = kit.finish([parts_near.lifted_wheel(PM)], "WheelNear", origin=(0, 1, 0))
    kit.bake_ao([wheel], distance=0.45, samples=16, floor=0.62)
    lamps = [kit.finish(parts_near.fleet_lamps(kind, PM), f"Lamps{kind}Near") for kind in parts_mod.FLEET]
    lamps.append(kit.finish(parts_near.tractor_lamps(PM), "LampsTractorNear"))
    out = objs + [wheel] + lamps
    for obj in out:
        print("TRIS", obj.name, carkit.triangles(obj))
    return out


TINTS = {"hatchback": "#c26a58", "sedan": "#5f8fb0", "taxi": "#e8b53a", "van": "#e9e6dc", "pickup": "#7f9e77", "bus": "#5f8fb0", "tractor": "#4f8a3e"}


def preview(n):
    """Car `n` of BODIES (6 is the tractor) as the street draws it: the near
    body, the near wheel at each wheel point and the near lamps, painted."""
    kit.reset()
    M = materials()
    PM = parts_mod.materials()
    if n == 7:
        # The wheel on its own at four spins, radius 1, beside `parts.py@7`.
        objs = []
        for i, spin in enumerate((0, 0.4, 0.8, 1.2)):
            w = parts_near.wheel(PM)
            w.data.transform(Matrix.Rotation(-spin, 4, "X"))
            w.data.transform(Matrix.Translation(B((i * 2.4, 1, 0))))
            objs.append(w)
        return [kit.finish(objs, "Wheels")]
    if n < 6:
        kind = BODIES[n]
        body = make(kind, M)
        spec = SPECS[kind]
        wheels = [(x, z, spec["wheelRadius"]) for x, z in spec["wheels"]]
        lamps = parts_near.fleet_lamps(NODE[kind], PM)
    else:
        kind = "tractor"
        body = finish(tractor_near(M), "TractorNear")
        spec = tractor_mod.SPEC
        wheels = [(x, z, r) for (x, z), r in zip(spec["wheels"], spec["wheelRadii"])]
        lamps = parts_near.tractor_lamps(PM)
    kit.bake_ao([body], distance=0.4, samples=16, floor=0.55)
    print("TRIS", body.name, carkit.triangles(body))
    carkit.tint([body], TINTS[kind])
    objs = list(lamps)
    for x, z, r in wheels:
        w = parts_near.wheel(PM)
        w.data.transform(Matrix.Scale(r, 4))
        w.data.transform(Matrix.Translation(B((x, r, z))))
        objs.append(w)
    street = kit.finish(objs, "Street")
    print("TRIS street", carkit.triangles(street))
    return [body, street]
