"""
Near level of `lowrise-parapet` (see lowrise_parapet.py): the shop and two
storeys over it with what a close camera sees added -- a shopfront in a stone
stallriser and pilasters with mullions and a transom, a signboard with its
lettering, a panelled door with a glazed light and steps, framed windows with
glazing bars, sills and lintels, a string course between the storeys, quoins,
a dentilled cornice under a jointed coping, a roof hatch and vents kept off the
roof pad, and rainwater pipes down the corners.

    blender -b --python blender/export.py -- blender/buildings/parapet_near.py building-lowrise-parapet-near
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import nearkit  # noqa: E402
from lowrise_parapet import CROWN, DEPTH, HW, PLINTH, SCALE, TOP  # noqa: E402


# The stallriser's top: the wall grid's own line under the shop windows' sills.
RISER = 0.11 - 0.11 / SCALE[1]


def stack(d, x, z, y):
    """A stubby brick stack on the roof (no taller than the hatch): a banded
    shaft, corbelled courses, a cap and two pots."""
    det = d.det
    w, dd = 0.1, 0.075
    d.box(x, y, z, w, det.V(0.14), dd, "wallSoft", skip=("+y",))
    d.box(x, y + det.V(0.05), z, w + 2 * det.X(0.03), det.V(0.07), dd + 2 * det.Z(0.03), "brick")
    for k, grow in enumerate((0.04, 0.075, 0.11)):
        d.box(x, y + det.V(0.14) + det.V(0.05) * k, z, w + 2 * det.X(grow), det.V(0.05), dd + 2 * det.Z(grow), "trim" if k == 2 else "brick")
    yy = y + det.V(0.29)
    d.box(x, yy, z, w + 2 * det.X(0.15), det.V(0.05), dd + 2 * det.Z(0.15), "trim", bottom=True)
    yy += det.V(0.05)
    for dx in (-0.16, 0.16):
        det.cyl(x + det.X(dx), z, yy, yy + det.V(0.08), 0.06, "roofLight", n=10, r1=0.075)
        det.cyl(x + det.X(dx), z, yy + det.V(0.08), yy + det.V(0.11), 0.082, "roofLight", n=10, r1=0.065, top_mat="window")


def make():
    d = nearkit.NearDraft(SCALE)
    det = d.det
    d.vlines = [0.5955 - det.V(0.1), 0.6145 + det.V(0.1), TOP - det.V(0.25)]
    d.vlines.append(0.33 + 0.05 + 0.075 / 5.6)
    d.box(0, 0, 0, 1.0, PLINTH, 1.0, "plinth")
    cols = bkit.spread(3, HW * 2 * 0.62)
    win = dict(w=0.16, h=0.13, depth=DEPTH, glass="window", sill="trim")
    upper = bkit.grid(cols, [0.49, 0.71], sill="trim", **{k: v for k, v in win.items() if k != "sill"})
    head = 0.33
    shop = dict(v=(0.11 + head) / 2, h=head - 0.11, depth=DEPTH + 0.01, glass="window", sill="plinth",
                near={"bars": (3, 2), "lintel": False, "jambs": False, "sill": 0.05, "fw": 0.045, "sill_ext": 0.0})
    door = dict(u=0, v=(PLINTH + head) / 2, w=0.15, h=head - PLINTH, depth=DEPTH + 0.018, glass="door", lit=False, sill_face=False,
                near={"door": {"head": False, "from_o": 0.5 - HW, "glazed": "glass", "panels": (2, 3), "surround": True}})
    side = bkit.grid(cols, [0.49, 0.71], sill="trim", **{k: v for k, v in win.items() if k != "sill"})
    front = [dict(shop, u=-0.25, w=0.28), door, dict(shop, u=0.25, w=0.28)] + upper
    back = [dict(shop, u=0, w=0.62)] + bkit.grid(cols, [0.49, 0.71], sill="trim", **{k: v for k, v in win.items() if k != "sill"})
    bkit.volume(d, PLINTH, TOP, HW, HW, {"+z": front, "-z": back, "+x": side, "-x": side}, DEPTH + 0.018)

    # The fascia over the shop, on +z and -z, and its signboard lettering.
    for s in (1, -1):
        d.box(0, head + 0.01, s * (HW + 0.0125), 0.76, 0.04, 0.025, "trim", bottom=True)
    letters = [0.09, 0.12, 0.09, 0.12, 0.1, 0.13, 0.09, 0.11]
    total = sum(letters) + 0.05 * (len(letters) - 1)
    for s in (1, -1):
        u = -det.X(total) / 2
        for w_m in letters:
            w = det.X(w_m)
            d.box(u + w / 2, head + 0.0185, s * (HW + 0.025 + det.Z(0.012)), w, det.V(0.15), det.Z(0.024), "door@72", skip=("-z",) if s > 0 else ("+z",))
            u += w + det.X(0.05)
    # Pilasters either side of the shopfront and a stone base to the stallriser.
    gaps = {"+z": [(-0.105, 0.105)]}
    det.band(HW, HW, PLINTH, RISER, 0.024, "plinth", gaps=gaps)
    for facing in ("+z", "-z"):
        for u in (-0.44, 0.44):
            det.wbox(facing, HW, u - det.U(facing, 0.09), u + det.U(facing, 0.09), 0.108, head - det.V(0.19), 0.0, det.O(facing, 0.05), "trim")

    # Raised panels on the stone stallriser, under each shop window.
    riser_top = RISER
    for facing, spans in (("+z", [(-0.25, 0.28), (0.25, 0.28)]), ("-z", [(0.0, 0.62)])):
        for uc, w in spans:
            n = max(2, int(w * SCALE[0] / 0.5))
            pw = (w * 0.94) / n
            for k in range(n):
                ua = uc - w * 0.47 + pw * k
                det.wbox(facing, HW, ua + det.U(facing, 0.05), ua + pw - det.U(facing, 0.05), PLINTH + det.V(0.05), riser_top - det.V(0.05),
                         det.O(facing, 0.124), det.O(facing, 0.15), "plinth", skip=("back",))
    # Scrolled consoles over the pilasters, and a cornice capping the fascia.
    console = [(0.0, 0.0), (0.055, 0.0), (0.055, 0.05), (0.13, 0.12), (0.13, 0.19), (0.0, 0.19)]
    for facing in ("+z", "-z"):
        for u in (-0.44, 0.44):
            det.profile(facing, HW, u - det.U(facing, 0.09), u + det.U(facing, 0.09), head - det.V(0.19), console, "trim", skip=(5,))
        det.profile(facing, HW, -0.385, 0.385, head + 0.05, [(0.0, 0.0), (0.175, 0.0), (0.175, 0.022), (0.15, 0.04), (0.15, 0.075), (0.0, 0.075)], "trim", skip=(5,))
    # Belt course between the storeys, quoins over the upper floors.
    belt = [(0.0, 0.0), (0.05, 0.0), (0.05, 0.028), (0.03, 0.044), (0.03, 0.066), (0.052, 0.08), (0.052, 0.106), (0.0, 0.106)]
    det.profile_band(HW, HW, 0.5955, belt, "trim", corner_gap=0.5)
    det.quoins(HW, HW, 0.4, TOP - det.V(0.17), proj=0.024, height=0.24, long_=0.36, short=0.22)
    deck, ix, iz = bkit.crown(d, TOP, HW, HW, *CROWN, inset=0)
    d.pad(0, 0, deck, 0.62, 0.62)

    # Dentils under the cornice.
    oh = 0.022
    for facing in ("+z", "-z", "+x", "-x"):
        span = HW - det.U(facing, 0.4)
        n = int(2 * span * SCALE[0] / 0.27)
        step = 2 * span / n
        for k in range(n + 1):
            u = -span + step * k
            det.wbox(facing, HW, u - det.U(facing, 0.05), u + det.U(facing, 0.05), TOP - det.V(0.12), TOP, 0.0, det.O(facing, 0.075), "trim", skip=("back", "top"))

    # On the roof, off the pad: an access hatch, two vent pipes, a scupper.
    hy = deck
    d.box(-0.385, hy, 0.385, det.X(0.66), det.V(0.4), det.Z(0.66), "wall")
    d.box(-0.385, hy + det.V(0.4), 0.385, det.X(0.74), det.V(0.05), det.Z(0.74), "trim", bottom=True)
    for x, z in ((0.385, -0.385), (-0.385, -0.385)):
        det.cyl(x, z, hy, hy + det.V(0.3), 0.06, "mech", n=8)
        det.cyl(x, z, hy + det.V(0.3), hy + det.V(0.345), 0.09, "mech", n=8)
    # A chimney stack in the last corner of the roof, and a dish on a mast.
    stack(d, 0.385, 0.385, hy)
    det.dish_roof("+z", -0.385, hy, -0.06, r=0.19, mast=0.22, feed=0.14, dep=0.06)
    # Rainwater pipes down two corners (through the quoins, as the lean model's are).
    for x, z in ((HW - det.X(0.2), HW + det.Z(0.05)), (-(HW - det.X(0.2)), -(HW + det.Z(0.05)))):
        det.downpipe(x, z, PLINTH, TOP - det.V(0.03), r=0.04)
    return d


def build():
    return nearkit.build_near(make, SCALE, "BuildingNear", distance=1.6, lean_glb="building-lowrise-parapet.glb")
