"""
The traffic fleet, modelled by script (spike: Blender assets vs procedural).

Six bodies -- hatchback, sedan, taxi, van, pickup, bus -- one object each,
with the same frame, footprint, wheel positions and lamp positions as
`BODY_SPECS` in `components/city/models/vehicles/shapes.ts`: the street still
draws the wheels and the lamps as their own instances at the spec's points, so
the body only has to leave room for them. Every body is one loft (see
`carkit.py`) plus a pair of arches and a few quads of detail, inside the
procedural body's triangle budget.

    blender -b --python blender/export.py -- blender/fleet/fleet.py fleet
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import carkit  # noqa: E402
import kit  # noqa: E402
from carkit import arch, build_loft, face_panel, flank_panel  # noqa: E402


def pair(x, y, z):
    return [(x, y, z), (-x, y, z)]


def wheel_set(x, front, rear):
    return [(x, front), (-x, front), (x, -rear), (-x, -rear)]


SEDAN = dict(
    length=2.85, width=1.1, wheelRadius=0.25, wheels=wheel_set(0.5, 0.92, 0.92),
    headlights=pair(0.36, 0.37, 1.415), taillights=pair(0.38, 0.44, -1.415), lamp=(0.24, 0.1),
)
SPECS = {
    "hatchback": dict(
        length=2.35, width=1.02, wheelRadius=0.24, wheels=wheel_set(0.47, 0.74, 0.72),
        headlights=pair(0.32, 0.38, 1.165), taillights=pair(0.34, 0.55, -1.165), lamp=(0.2, 0.1),
    ),
    "sedan": SEDAN,
    "taxi": SEDAN,
    "van": dict(
        length=3.1, width=1.16, wheelRadius=0.26, wheels=wheel_set(0.54, 1.02, 1.0),
        headlights=pair(0.4, 0.42, 1.545), taillights=pair(0.44, 0.66, -1.545), lamp=(0.18, 0.2),
    ),
    "pickup": dict(
        length=3.0, width=1.14, wheelRadius=0.27, wheels=wheel_set(0.52, 0.95, 0.98),
        headlights=pair(0.38, 0.4, 1.495), taillights=pair(0.42, 0.6, -1.495), lamp=(0.18, 0.14),
    ),
    "bus": dict(
        length=4.5, width=1.16, wheelRadius=0.3, wheels=wheel_set(0.54, 1.55, 1.4),
        headlights=pair(0.4, 0.48, 2.245), taillights=pair(0.44, 0.62, -2.245), lamp=(0.2, 0.14),
    ),
}
BODIES = ["hatchback", "sedan", "taxi", "van", "pickup", "bus"]
NODE = {k: k[0].upper() + k[1:] for k in BODIES}


def loft_of(name, shell, M):
    sections, side, caps, centre_y = shell
    return build_loft(name, sections, side, caps, M, centre_y)


def sec(z, *pts):
    """A section: z, then (x, y) pairs from the sill up."""
    return (z, [(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)])


def lerp_x(a, b):
    """The flank's half width at height y, between two outline points."""
    (xa, ya), (xb, yb) = a, b
    return lambda y: xa + (xb - xa) * (y - ya) / (yb - ya)


def arches(spec, bottom, top, M):
    r = spec["wheelRadius"]
    front, rear = spec["wheels"][0][1], spec["wheels"][2][1]
    half = spec["width"] / 2 + 0.014
    return [arch("archF", front, r, bottom, half, M["arch"], top), arch("archR", rear, r, bottom, half, M["arch"], top)]


def plates(spec, y_front, y_rear, M):
    h = spec["length"] / 2
    return [
        face_panel("plateF", 0, y_front, h + 0.004, 0.22, 0.065, M["plate"], 1),
        face_panel("plateR", 0, y_rear, -h - 0.004, 0.22, 0.065, M["plate"], -1),
    ]


def screen_line(name, foot, top, x0, x1, t, rise, mat, width=0.02):
    """A wiper: a thin quad lying on a windscreen whose centre line runs from
    `foot` to `top` (both `(z, y)`), `t` of the way up, from x0 out to x1."""
    (zf, yf), (zt, yt) = foot, top
    dz, dy = zt - zf, yt - yf
    length = (dz * dz + dy * dy) ** 0.5
    nz, ny = dy / length, -dz / length  # up and forward, off the glass

    def at(x, u):
        return (x, yf + dy * u + ny * 0.009, zf + dz * u + nz * 0.009)

    w = width / length
    corners = [at(x0, t), at(x1, t + rise), at(x1, t + rise + w), at(x0, t + w)]
    return carkit.quad(name, corners, mat, (0, ny, nz))


def wipers(foot, top, half, M):
    return [
        screen_line("wiper", foot, top, s * 0.04, s * half, 0.12, 0.1, M["trim"])
        for s in (-1, 1)
    ]


def mirrors(x, y, z, M):
    # No further out than 0.59: the widest body with its mirrors is 1.2
    # (`MAX_BODY_WIDTH`), so on the wide bodies they sit nearly flat.
    reach = max(0.012, min(0.05, 0.59 - x))
    return [carkit.mirror("mirror", s, x, y, z, M["trim"], reach=reach) for s in (-1, 1)]


def side_mats(glass_flank, top, lower="trim", flank="paint", shoulder="paint"):
    """Materials for a four-point outline: sill band, flank, glass band, top."""

    def side(s, strip):
        if strip == 0:
            return lower(s) if callable(lower) else lower
        if strip == 1:
            return flank
        if strip == 2:
            return "glass" if s in glass_flank else shoulder
        return top[s]

    return side


def bumper_caps(end, band):
    return "trim" if band == 0 else "paint"


# ---------------------------------------------------------------------------
# Hatchback: two boxes, a short bonnet and a near-upright tailgate.
# ---------------------------------------------------------------------------


def hatchback_shell():
    """The body's loft: `(sections, side_mat, cap_mat, centre_y)`, shared with
    the near model (`near.py`), which lofts the same sections finer."""
    spec = SPECS["hatchback"]
    h = spec["length"] / 2
    ROOF_Y = 1.1
    sill, bump = (0.495, 0.19), (0.51, 0.33)
    sections = [
        sec(-h, 0.465, 0.2, 0.485, 0.33, 0.48, 0.62, 0.41, 0.66),
        sec(-1.07, *sill, *bump, 0.51, 0.66, 0.39, ROOF_Y),
        sec(0.06, *sill, *bump, 0.51, 0.65, 0.39, ROOF_Y),
        sec(0.54, *sill, *bump, 0.51, 0.63, 0.44, 0.665),
        sec(1.05, *sill, *bump, 0.51, 0.56, 0.44, 0.6),
        sec(h, 0.465, 0.2, 0.485, 0.3, 0.48, 0.43, 0.4, 0.45),
    ]
    top = {0: "glass", 1: "roof", 2: "glass", 3: "paint", 4: "paint"}
    return sections, side_mats({1, 2}, top), bumper_caps, 0.6


def hatchback(M):
    spec = SPECS["hatchback"]
    h = spec["length"] / 2
    ROOF_Y = 1.1
    parts = [loft_of("body", hatchback_shell(), M)]
    parts += arches(spec, 0.17, 0.54, M)
    upper = lerp_x((0.51, 0.66), (0.39, ROOF_Y))
    for s in (-1, 1):
        parts.append(flank_panel("pillarB", upper, -0.3, -0.2, 0.66, ROOF_Y, M["paint"], s, 0.004))
        parts.append(flank_panel("pillarC", upper, -1.07, -0.82, 0.66, ROOF_Y, M["paint"], s, 0.004))
        parts.append(flank_panel("handle", lambda y: 0.51, -0.07, 0.07, 0.56, 0.59, M["hub"], s, 0.004))
        parts.append(face_panel("indicator", s * 0.45, 0.38, h + 0.006, 0.05, 0.05, M["amber"], 1))
        parts.append(face_panel("reflector", s * 0.33, 0.28, -h - 0.007, 0.1, 0.03, M["reflector"], -1))
    parts.append(face_panel("grille", 0, 0.38, h + 0.006, 0.36, 0.07, M["arch"], 1))
    parts += plates(spec, 0.26, 0.4, M)
    parts += mirrors(0.51, 0.72, 0.46, M)
    parts += wipers((0.54, 0.665), (0.06, ROOF_Y), 0.3, M)
    return parts


# ---------------------------------------------------------------------------
# Sedan and taxi: three boxes, bonnet, cabin, boot.
# ---------------------------------------------------------------------------


def sedan_shell():
    spec = SPECS["sedan"]
    h = spec["length"] / 2
    ROOF_Y = 1.065
    sill, bump = (0.535, 0.19), (0.555, 0.33)
    sections = [
        sec(-h, 0.5, 0.2, 0.52, 0.33, 0.51, 0.47, 0.43, 0.5),
        sec(-1.3, *sill, *bump, 0.55, 0.58, 0.46, 0.63),
        sec(-1.0, *sill, *bump, 0.55, 0.62, 0.46, 0.66),
        sec(-0.6, *sill, *bump, 0.55, 0.62, 0.42, ROOF_Y),
        sec(0.14, *sill, *bump, 0.55, 0.61, 0.42, ROOF_Y),
        sec(0.64, *sill, *bump, 0.55, 0.6, 0.47, 0.63),
        sec(1.28, *sill, *bump, 0.55, 0.53, 0.46, 0.575),
        sec(h, 0.5, 0.2, 0.52, 0.31, 0.51, 0.41, 0.42, 0.43),
    ]
    top = {0: "paint", 1: "paint", 2: "glass", 3: "roof", 4: "glass", 5: "paint", 6: "paint"}
    return sections, side_mats({2, 3, 4}, top), bumper_caps, 0.6


def sedan(M, taxi=False):
    spec = SPECS["sedan"]
    h = spec["length"] / 2
    ROOF_Y = 1.065
    parts = [loft_of("body", sedan_shell(), M)]
    parts += arches(spec, 0.18, 0.56, M)
    upper = lerp_x((0.55, 0.62), (0.42, ROOF_Y))
    for s in (-1, 1):
        # The B-pillar, painted across the glass band.
        parts.append(flank_panel("pillarB", upper, -0.3, -0.2, 0.62, ROOF_Y, M["paint"], s, 0.004))
        # Door handles; the taxi spends these on its band (budget: body +
        # lamps + four wheels < 520, and its lamps carry the sign).
        for z in () if taxi else (0.05, -0.55):
            parts.append(flank_panel("handle", lambda y: 0.55, z - 0.07, z + 0.07, 0.54, 0.57, M["hub"], s, 0.004))
        parts.append(face_panel("indicator", s * 0.47, 0.37, h + 0.006, 0.05, 0.05, M["amber"], 1))
        parts.append(face_panel("reflector", s * 0.36, 0.28, -h - 0.007, 0.1, 0.03, M["reflector"], -1))
    parts.append(face_panel("grille", 0, 0.37, h + 0.006, 0.4, 0.08, M["arch"], 1))
    parts += plates(spec, 0.26, 0.26, M)
    parts += mirrors(0.55, 0.68, 0.55, M)
    parts += wipers((0.64, 0.63), (0.14, ROOF_Y), 0.33, M)
    if taxi:
        # The sign's lit face is in the lamps (shapes.ts `lightsGeometry`);
        # this is its base, and a dark band down each flank.
        parts.append(carkit.lidless_box("signBase", (0.44, 0.05, 0.22), (0, ROOF_Y + 0.025, -0.23), M["trim"]))
        for s in (-1, 1):
            parts.append(flank_panel("band", lambda y: 0.55, -1.0, 0.64, 0.47, 0.53, M["trim"], s, 0.004))
    return parts


# ---------------------------------------------------------------------------
# Van: a high-roofed delivery van, a stub of a bonnet and a blind load box.
# ---------------------------------------------------------------------------


def van_shell():
    spec = SPECS["van"]
    h = spec["length"] / 2
    TOP = 1.52
    # Sill, bumper line, waist, roof shoulder, roof edge.
    sill, bump = (0.565, 0.21), (0.58, 0.36)
    sections = [
        sec(-h, 0.55, 0.22, 0.565, 0.36, 0.565, 0.8, 0.565, 1.46, 0.51, TOP),
        sec(-1.47, *sill, *bump, 0.58, 0.8, 0.58, 1.47, 0.52, TOP + 0.01),
        sec(0.5, *sill, *bump, 0.58, 0.8, 0.58, 1.46, 0.52, TOP),
        sec(0.95, *sill, *bump, 0.58, 0.8, 0.53, 1.38, 0.5, 1.42),
        sec(1.36, *sill, *bump, 0.58, 0.77, 0.52, 0.79, 0.52, 0.79),
        sec(h, 0.54, 0.22, 0.555, 0.34, 0.54, 0.54, 0.48, 0.57, 0.48, 0.57),
    ]

    def side(s, strip):
        if strip == 0:
            return "trim"
        if strip == 1:
            return "paint"
        if strip == 2:
            return "glass" if s in (2, 3) else "paint"
        if strip == 3:
            return "roof" if s <= 2 else ("glass" if s == 3 else "paint")
        return {0: "roof", 1: "roof", 2: "roof", 3: "glass", 4: "paint"}[s]

    def caps(end, band):
        return "trim" if band == 0 else ("roof" if band == 3 else "paint")

    return sections, side, caps, 0.8


def van(M):
    spec = SPECS["van"]
    h = spec["length"] / 2
    TOP = 1.52
    parts = [loft_of("body", van_shell(), M)]
    parts += arches(spec, 0.2, 0.6, M)
    for s in (-1, 1):
        # The stripe down the load box: the ambulance's is red.
        parts.append(flank_panel("stripe", lambda y: 0.58, -1.47, 0.46, 0.97, 1.07, M["panel"], s, 0.006))
        # The sliding door's seam and handle, behind the cab.
        parts.append(flank_panel("seam", lambda y: 0.58, 0.44, 0.46, 0.4, 1.4, M["trim"], s, 0.011))
        parts.append(flank_panel("handle", lambda y: 0.58, 0.18, 0.32, 0.72, 0.75, M["hub"], s, 0.004))
        parts.append(face_panel("indicator", s * 0.46, 0.49, h + 0.006, 0.05, 0.05, M["amber"], 1))
        parts.append(face_panel("reflector", s * 0.35, 0.29, -h - 0.007, 0.1, 0.03, M["reflector"], -1))
    # The seam between the rear doors, and the roof bars.
    parts.append(face_panel("doorSeam", 0, 1.1, -h - 0.004, 0.03, 0.66, M["trim"], -1))
    for z in (-1.05, -0.3):
        parts.append(carkit.lidless_box("roofBar", (1.04, 0.035, 0.07), (0, TOP + 0.03, z), M["trim"]))
    parts.append(face_panel("grille", 0, 0.44, h + 0.006, 0.58, 0.14, M["arch"], 1))
    parts += plates(spec, 0.28, 0.28, M)
    parts += mirrors(0.58, 0.9, 1.25, M)
    parts += wipers((1.36, 0.79), (0.95, 1.42), 0.36, M)
    return parts


# ---------------------------------------------------------------------------
# Pickup: a cab forward of an open bed.
# ---------------------------------------------------------------------------


PICKUP_BACK = -0.36


def pickup_shell():
    """The cab's loft; the bed's tub is `pickup_tub_shell`."""
    spec = SPECS["pickup"]
    h = spec["length"] / 2
    ROOF_Y = 1.24
    back = PICKUP_BACK
    sill, bump = (0.555, 0.23), (0.57, 0.37)
    sections = [
        # The cab only: its back wall stands on the bed's front.
        sec(back, *sill, *bump, 0.57, 0.72, 0.43, ROOF_Y),
        sec(0.26, *sill, *bump, 0.57, 0.71, 0.43, ROOF_Y),
        sec(0.62, *sill, *bump, 0.57, 0.7, 0.49, 0.73),
        sec(1.3, *sill, *bump, 0.57, 0.64, 0.49, 0.68),
        sec(h, 0.53, 0.23, 0.55, 0.34, 0.54, 0.46, 0.45, 0.49),
    ]
    top = {0: "roof", 1: "glass", 2: "paint", 3: "paint"}

    def caps(end, band):
        if end == 0:
            return "paint"
        return "trim" if band == 0 else "paint"

    return sections, side_mats({0, 1}, top), caps, 0.6


def pickup_tub_shell():
    spec = SPECS["pickup"]
    h = spec["length"] / 2
    RAIL = 1.02
    back = PICKUP_BACK
    sill, bump = (0.555, 0.23), (0.57, 0.37)
    tub = [
        sec(-h, 0.55, 0.23, 0.57, 0.37, 0.57, RAIL, 0.5, RAIL),
        sec(-h + 0.08, *sill, *bump, 0.57, RAIL, 0.5, RAIL),
        sec(back, *sill, *bump, 0.57, RAIL, 0.5, RAIL),
    ]

    def tub_side(s, strip):
        if strip == 0:
            return "trim"
        if strip in (1, 2):
            return "paint"  # the flank, then the rail's top
        return "paint" if s == 0 else None  # the tailgate's top; open over the bed

    def tub_caps(end, band):
        if end == 1:
            return None
        return "trim" if band == 0 else ("paint" if band == 1 else None)

    return tub, tub_side, tub_caps, 0.6


def pickup(M):
    spec = SPECS["pickup"]
    h = spec["length"] / 2
    ROOF_Y = 1.24
    BED = 0.74
    RAIL = 1.02
    back = PICKUP_BACK
    parts = [loft_of("cab", pickup_shell(), M)]
    # The bed: a tub whose walls have inner faces, on the same sill line.
    parts.append(loft_of("tub", pickup_tub_shell(), M))
    # The inner walls, the tailgate's inner face and the floor; the cab's back
    # wall is the bulkhead.
    inner = 0.5
    for s in (-1, 1):
        parts.append(carkit.quad("wall", [(s * inner, BED, -h + 0.08), (s * inner, BED, back), (s * inner, RAIL, back), (s * inner, RAIL, -h + 0.08)], M["paint"], (-s, 0, 0)))
    parts.append(carkit.quad("gateIn", [(-inner, BED, -h + 0.08), (inner, BED, -h + 0.08), (inner, RAIL, -h + 0.08), (-inner, RAIL, -h + 0.08)], M["paint"], (0, 0, 1)))
    parts.append(carkit.quad("floor", [(-inner, BED, -h + 0.08), (inner, BED, -h + 0.08), (inner, BED, back), (-inner, BED, back)], M["trim"], (0, 1, 0)))
    for x in (-0.3, -0.1, 0.1, 0.3):
        parts.append(carkit.quad("rib", [(x - 0.012, BED + 0.004, -h + 0.1), (x + 0.012, BED + 0.004, -h + 0.1), (x + 0.012, BED + 0.004, back - 0.02), (x - 0.012, BED + 0.004, back - 0.02)], M["hub"], (0, 1, 0)))
    parts += arches(spec, 0.2, 0.62, M)
    upper = lerp_x((0.57, 0.72), (0.43, ROOF_Y))
    for s in (-1, 1):
        parts.append(flank_panel("pillarB", upper, back, back + 0.1, 0.72, ROOF_Y, M["paint"], s, 0.004))
        parts.append(flank_panel("handle", lambda y: 0.57, -0.05, 0.09, 0.62, 0.65, M["hub"], s, 0.004))
        parts.append(face_panel("indicator", s * 0.46, 0.4, h + 0.006, 0.05, 0.05, M["amber"], 1))
        parts.append(face_panel("reflector", s * 0.36, 0.3, -h - 0.007, 0.1, 0.03, M["reflector"], -1))
    parts.append(face_panel("grille", 0, 0.42, h + 0.006, 0.52, 0.1, M["arch"], 1))
    parts += plates(spec, 0.29, 0.29, M)
    parts += mirrors(0.57, 0.8, 0.52, M)
    parts += wipers((0.62, 0.73), (0.26, ROOF_Y), 0.34, M)
    return parts


# ---------------------------------------------------------------------------
# Bus: a painted skirt, a band of glass the full length, a roof and its pod.
# ---------------------------------------------------------------------------


def bus_shell():
    spec = SPECS["bus"]
    h = spec["length"] / 2
    W = 0.58
    # Sill, skirt top, waist, glass top, roof edge.
    sections = [
        sec(-h, 0.55, 0.25, 0.555, 0.44, 0.555, 1.04, 0.545, 1.6, 0.5, 1.85),
        sec(-h + 0.1, 0.58, 0.24, W, 0.44, W, 1.04, 0.57, 1.6, 0.52, 1.86),
        sec(h - 0.14, 0.58, 0.24, W, 0.44, W, 1.04, 0.57, 1.6, 0.52, 1.86),
        sec(h, 0.55, 0.25, 0.555, 0.44, 0.55, 0.78, 0.53, 1.6, 0.49, 1.84),
    ]

    def side(s, strip):
        return ["panel", "paint", "glass", "roof", "roof"][strip]

    def caps(end, band):
        if end == 1:
            return ["panel", "paint", "glass", "roof"][band]
        return ["panel", "paint", "glass", "roof"][band]

    return sections, side, caps, 1.0


def bus(M):
    spec = SPECS["bus"]
    h = spec["length"] / 2
    W = 0.58
    parts = [loft_of("body", bus_shell(), M)]
    parts += arches(spec, 0.22, 0.68, M)
    upper = lerp_x((W, 1.04), (0.57, 1.6))
    for s in (-1, 1):
        for z in (-1.75, -1.05, -0.35, 0.35, 1.05):
            parts.append(flank_panel("pillar", upper, z - 0.05, z + 0.05, 1.04, 1.6, M["paint"], s, 0.004))
        for z in (-1.84, -1.68, -1.52):
            parts.append(flank_panel("vent", lambda y: W, z - 0.018, z + 0.018, 0.64, 0.9, M["trim"], s, 0.004))
        parts.append(face_panel("reflector", s * 0.44, 0.35, -h - 0.007, 0.1, 0.04, M["reflector"], -1))
    # The rear window is painted over the engine bay, as a bus's is.
    parts.append(face_panel("rearPanel", 0, 1.32, -h - 0.004, 0.84, 0.5, M["paint"], -1))
    # The door, on the kerb side (-x), just behind the front axle.
    parts.append(flank_panel("door", lambda y: W, 0.49, 1.11, 0.3, 1.2, M["glass"], -1, 0.006))
    parts.append(flank_panel("doorSeam", lambda y: W, 0.79, 0.81, 0.3, 1.2, M["trim"], -1, 0.011))
    parts.append(carkit.lidless_box("pod", (0.72, 0.14, 1.1), (0, 1.9, -0.9), M["panel"]))
    parts.append(face_panel("grille", 0, 0.52, h + 0.006, 0.5, 0.1, M["arch"], 1))
    parts += plates(spec, 0.33, 0.43, M)
    parts += mirrors(W, 1.35, 2.1, M)
    parts += wipers((h, 0.9), (h + 0.001, 1.55), 0.38, M)
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
    parts = BUILDERS[kind](M)
    return kit.finish(parts, NODE[kind])


def build():
    kit.reset()
    M = carkit.palette()
    objs = [make(kind, M) for kind in BODIES if kind in BUILDERS]
    # Baked apart, so no car darkens its neighbour.
    for i, obj in enumerate(objs):
        obj.location.x = (i - (len(objs) - 1) / 2) * 3.2
    kit.bake_ao(objs, distance=0.4, samples=128, floor=0.55)
    for obj in objs:
        obj.location.x = 0
        print("TRIS", obj.name, carkit.triangles(obj))
    return objs


def preview(n):
    """Body `n` of BODIES with its street wheels and lamps, painted."""
    kit.reset()
    M = carkit.palette()
    kind = BODIES[n]
    obj = make(kind, M)
    kit.bake_ao([obj], distance=0.4, samples=128, floor=0.55)
    print("TRIS", obj.name, carkit.triangles(obj))
    tints = {"hatchback": "#c26a58", "sedan": "#5f8fb0", "taxi": "#e8b53a", "van": "#e9e6dc",
             "pickup": "#7f9e77", "bus": "#5f8fb0"}
    carkit.tint([obj], tints[kind])
    extras = []
    sign = kit.material("sign", "#ffd66b", "glass", 0.3, emission=0.3)
    if kind == "taxi":
        extras.append(kit.box("sign", (0.4, 0.13, 0.18), (0, 1.18, -0.23), sign, bev=0.0))
    if kind == "bus":
        extras.append(kit.box("board", (1.16 * 0.66, 0.14, 0.03), (0, 1.73, 2.26), sign, bev=0.0))
    return [obj, kit.finish(carkit.preview_wheels(SPECS[kind], M) + extras, "Wheels")]
