"""
Near level of `warehouse-sawtooth` (see warehouse.py): the shed with what a
close camera sees added -- ribbed cladding, framed high windows with bars, roll-
up doors made of slats between guide rails under a coil housing and a braced
canopy, a personnel door with a step, sawtooth glazing divided by mullions and
a transom, standing seams on the roof slopes, valley gutters, vents with rain
hats, and downpipes.

    blender -b --python blender/export.py -- blender/buildings/warehouse_near.py building-warehouse-sawtooth-near
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import nearkit  # noqa: E402
from warehouse import DEPTH, HW, PLINTH, SCALE, TOP  # noqa: E402


def ribs(d, face, openings, half, y0, y1, pitch=0.36, proj=0.022, width=0.055):
    """Vertical ribs of the cladding across a wall, cut where an opening (and
    its dressing) is."""
    det = d.det
    n = int(2 * half * (SCALE[0] if face in ("+z", "-z") else SCALE[2]) / pitch)
    for k in range(n):
        u = -half + (k + 0.5) * 2 * half / n
        spans = [(y0, y1)]
        for o in openings:
            ow = o["w"] / 2 + det.U(face, 0.22)
            if abs(u - o["u"]) < ow + det.U(face, width):
                lo, hi = o["v"] - o["h"] / 2 - det.V(0.14), o["v"] + o["h"] / 2 + det.V(0.3)
                spans = [s for a, b in spans for s in ((a, min(b, lo)), (max(a, hi), b)) if s[1] - s[0] > det.V(0.15)]
        for a, b in spans:
            det.wbox(face, HW, u - det.U(face, width) / 2, u + det.U(face, width) / 2, a, b, 0.0, det.O(face, proj), "wall", skip=("back", "top", "bottom"))


def roll_up(d, face, o):
    """The slats of a roll-up door between guide rails, under a coil
    housing, with a row of vision panels and a bottom bar."""
    det = d.det
    u0, u1 = o["u"] - o["w"] / 2, o["u"] + o["w"] / 2
    v0, v1 = o["v"] - o["h"] / 2, o["v"] + o["h"] / 2
    g = -o["depth"]
    W = lambda a0, a1, b0, b1, oo0, oo1, m, skip=("back",): det.wbox(face, HW, a0, a1, b0, b1, oo0, oo1, m, 0.0, 0.0, skip)  # noqa: E731
    rail = det.U(face, 0.12)
    n = max(6, int((v1 - v0 - det.V(0.12)) * SCALE[1] / 0.085))
    h = (v1 - v0 - det.V(0.12)) / n
    for k in range(n):
        ya = v0 + det.V(0.12) + h * k
        W(u0 + rail, u1 - rail, ya, ya + h * 0.92, g, g + det.O(face, 0.024), "mech", ("back", "left", "right", "bottom"))
    # Vision panels in the top slats.
    top = v1 - h * 1.9
    for k in range(5):
        ua = u0 + rail + (u1 - u0 - 2 * rail) * (0.1 + 0.17 * k)
        W(ua, ua + det.U(face, 0.22), top, top + h * 0.6, g + det.O(face, 0.024), g + det.O(face, 0.05), "window")
    W(u0 + rail, u1 - rail, v0, v0 + det.V(0.12), g, g + det.O(face, 0.05), "mech")
    # Guide rails at both sides, inside the opening.
    for u_a, u_b in ((u0, u0 + rail), (u1 - rail, u1)):
        W(u_a, u_b, v0, v1, g, g + det.O(face, 0.07), "trim", ("back", "bottom", "left", "right"))
    W(u0, u0 + rail, v0, v1, g, g + det.O(face, 0.07), "trim", ("back", "bottom", "left"))
    W(u1 - rail, u1, v0, v1, g, g + det.O(face, 0.07), "trim", ("back", "bottom", "right"))
    # A header beam over the door, and a bumper post either side.
    W(u0 - det.U(face, 0.16), u1 + det.U(face, 0.16), v1, v1 + det.V(0.12), 0.0, det.O(face, 0.05), "trim", ("back",))
    for s in (-1, 1):
        ua = o["u"] + s * (o["w"] / 2 + det.U(face, 0.5))
        W(ua - det.U(face, 0.1), ua + det.U(face, 0.1), PLINTH, PLINTH + det.V(0.45), 0.0, det.O(face, 0.12), "mech", ("back", "bottom"))


def make():
    d = nearkit.NearDraft(SCALE)
    det = d.det
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    high = dict(w=0.14, h=0.09, depth=DEPTH, glass="window", sill="trim", near={"bars": (2, 1), "fw": 0.045})
    door = dict(u=0, v=(PLINTH + 0.4) / 2, w=0.38, h=0.4 - PLINTH, depth=0.06, glass="door", lit=False, sill_face=False, sill="plinth",
                near={"plain_door": True})
    ends = [door] + bkit.grid([-0.33, 0.33], [0.52], **high)
    sides = bkit.grid(bkit.spread(3, 0.6), [0.5], **high)
    # A personnel door on the +x wall, a step up.
    ped = dict(u=0.4, v=(PLINTH + 0.34) / 2, w=0.1, h=0.34 - PLINTH, depth=0.04, glass="door", lit=False, sill_face=False,
               near={"door": {"head": False, "from_o": 0.5 - HW, "limit": 0.54, "panels": (1, 3), "step_reach": 0.5}})
    side_x = sides + [ped]
    d.vlines = [0.365, 0.5 + det.V(0.5)]
    bkit.volume(d, PLINTH, TOP, HW, HW, {"+z": ends, "-z": ends, "+x": side_x, "-x": sides}, 0.07)
    for face, ops in (("+z", ends), ("-z", ends), ("+x", side_x), ("-x", sides)):
        ribs(d, face, ops, HW, PLINTH + det.V(0.05), TOP - det.V(0.02))
    # The roll-up doors and a braced canopy over each.
    for face in ("+z", "-z"):
        roll_up(d, face, door)
        s = 1 if face == "+z" else -1
        d.box(0, 0.43, s * (HW + 0.05), 0.5, 0.014, 0.1, "trim", bottom=True, skip=("-z",) if s > 0 else ("+z",))
        for u in (-0.2, 0.2):
            # A brace from the wall to the canopy's lip.
            d.box(u, 0.43 - det.V(0.36), s * (HW + det.Z(0.05)), det.X(0.05), det.V(0.36), det.Z(0.05), "mech", skip=("-z",) if s > 0 else ("+z",))
    # The eaves band, then five teeth on it covering it exactly.
    band_h = 0.025
    d.box(0, TOP, 0, 1.0, band_h, 1.0, "trim", bottom=True, skip=("+y",))
    y0 = TOP + band_h
    teeth, rise = 5, 0.13
    w = 1.0 / teeth
    for i in range(teeth):
        x0, x1 = -0.5 + w * i, -0.5 + w * (i + 1)
        d.poly([(x0, y0, 0.5), (x1, y0 + rise, 0.5), (x1, y0 + rise, -0.5), (x0, y0, -0.5)], "roof", (-1, 1, 0))
        d.poly([(x1, y0, 0.5), (x1, y0 + rise, 0.5), (x1, y0 + rise, -0.5), (x1, y0, -0.5)], "glass", (1, 0, 0))
        for z in (0.5, -0.5):
            d.poly([(x0, y0, z), (x1, y0, z), (x1, y0 + rise, z)], "wall", (0, 0, z))
        d.box(x1 - 0.012, y0 + rise - 0.003, 0, 0.04, 0.012, 0.97, "trim", bottom=True)
        # Glazing bars standing in front of the roof light: mullions every
        # ninety centimetres, a transom across the middle, a sill rail.
        gy0, gy1 = y0 + det.V(0.06), y0 + rise - 0.003
        base = y0 + det.V(0.1)
        po = max(det.O("+x", 0.04), 0.0095)
        cols = int(0.97 * SCALE[2] / 0.9)
        for k in range(cols + 1):
            u = -0.485 + 0.97 * k / cols
            mid = (base + gy1) / 2
            for a, b in ((base + det.V(0.05), mid), (mid + det.V(0.05), gy1 - det.V(0.05))):
                det.wbox("+x", x1, u - det.U("+x", 0.03), u + det.U("+x", 0.03), a, b, 0.0, po, "frame", skip=("back", "top", "bottom"))
        for v in (base, (base + gy1) / 2, gy1 - det.V(0.05)):
            det.wbox("+x", x1, -0.485, 0.485, v, v + det.V(0.05), 0.0, po, "frame", skip=("back", "left", "right"))
        # Standing seams on the slope, and the valley gutter at its foot.
        seams = int(SCALE[2] / 0.42)
        for k in range(seams):
            z = -0.49 + 0.98 * (k + 0.5) / seams
            hz = det.Z(0.03)
            hh = 0.006
            a, b = (x0 + 0.2 * w, y0 + 0.2 * rise), (x1 - 0.004, y0 + rise - 0.004 * rise / w)
            # A closed rib: base on the slope, a narrower top, both ends capped.
            base = [(a, -hz), (a, hz), (b, hz), (b, -hz)]
            (xa, ya), (xb, yb) = a, b
            for sgn in (-1, 1):
                d.poly([(xa, ya, z + sgn * hz), (xb, yb, z + sgn * hz), (xb, yb + hh, z + sgn * hz * 0.55), (xa, ya + hh, z + sgn * hz * 0.55)], "roofLight", (-0.3, 0.6, sgn))
            d.poly([(xa, ya + hh, z - hz * 0.55), (xb, yb + hh, z - hz * 0.55), (xb, yb + hh, z + hz * 0.55), (xa, ya + hh, z + hz * 0.55)], "roofLight", (-0.3, 1, 0))
            d.poly([(xa, ya, z - hz), (xa, ya, z + hz), (xa, ya + hh, z + hz * 0.55), (xa, ya + hh, z - hz * 0.55)], "roofLight", (-1, 0, 0))
            d.poly([(xb, yb, z - hz), (xb, yb, z + hz), (xb, yb + hh, z + hz * 0.55), (xb, yb + hh, z - hz * 0.55)], "roofLight", (1, 0, 0))
            del base
        if i:
            d.box(x0 + det.X(0.08), y0, 0, det.X(0.16), det.V(0.05), 0.96, "mech", skip=("-y",))
    # Two vents with rain hats, stood on the middle of a slope.
    for tooth, z in ((1, 0.28), (3, -0.26)):
        x = -0.5 + w * (tooth + 0.5)
        foot = y0 + rise * 0.5 - det.V(0.06)
        det.cyl(x, z, foot, foot + det.V(0.08), 0.19, "mech", n=10)
        det.cyl(x, z, foot + det.V(0.08), y0 + 0.19, 0.13, "mech", n=10)
        det.cyl(x, z, y0 + 0.19, y0 + 0.225, 0.2, "mech", n=10, r1=0.13)
    # Downpipes at the front corners, on the ends' walls.
    for sx, sz in ((1, 1), (-1, -1)):
        det.downpipe(sx * (HW - det.X(0.25)), sz * (HW + det.Z(0.03)), PLINTH, TOP, r=0.05)
    return d


def build():
    return nearkit.build_near(make, SCALE, "BuildingNear", distance=1.6)
