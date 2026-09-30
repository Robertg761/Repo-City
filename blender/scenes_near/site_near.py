"""
The construction site's kit, NEAR level (`site-kit.glb`'s detailed twin):
hoarding, scaffold, the warning sign, the finished building's forecourt and
the crew's gear, as the same pieces the site lays out at real size
(`siteKit.ts`), with the same node names, origins and outlines as
`blender/incidents2/site_kit.py`.

What a close camera reads: hoarding of plywood sheets on timber rails with
screws, bolted top rails, kicker boards and concrete feet with their clamps;
scaffold standards with jacks, sole plates and spigot joints, ledgers with
forged couplers and bolts, braces on swivel couplers, decks of separate
boards with guard rails and toe boards, and a ladder between the lifts; the
forecourt's individual slabs and kerb stones, a fuller tree and a bench with
armrests; a hard hat with its suspension and a reflective vest.

    blender -b --python blender/export.py -- blender/scenes_near/site_near.py site-kit-near
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit_near  # noqa: E402

kit_near.refine()

import kit  # noqa: E402
import site_kit as lean  # noqa: E402
from helpers import bake_spread  # noqa: E402
from kit import box, cyl, finish  # noqa: E402
from kit_near import Acc  # noqa: E402

BAY, LIFT, POLE = lean.BAY, lean.LIFT, lean.POLE
BOARD_TOP, RAIL_TOP = lean.BOARD_TOP, lean.RAIL_TOP
TUBE = 0.0555  # a scaffold tube's radius: the lean bar is 0.11 square


def palette():
    M = lean.palette()
    m = kit.material
    M["screw"] = m("post", "#6b6f6d", "metal", 0.4, 0.4)
    M["galv"] = m("steel", "#9aa0a6", "metal", 0.35, 0.5)
    M["coupler"] = m("steel", "#9aa0a6", "metal", 0.5, 0.4, tone=0.75)
    M["concrete"] = m("foot", "#8f8b80", "concrete", 0.9)
    M["boardDark"] = m("board", "#bdb6a4", "timber", 0.85, tone=0.66)
    M["boardLight"] = m("board", "#bdb6a4", "timber", 0.85, tone=1.0)
    M["hatDark"] = m("helmet", "#f0d44a", "metal", 0.45, tone=0.8)
    M["strapBlack"] = m("hatStrap", "#2b2d31", "fabric", 0.8)
    M["reflect"] = m("band", "#ebe4ba", "fabric", 0.5)
    M["reflectDark"] = m("band", "#ebe4ba", "fabric", 0.5, tone=0.85)
    M["sky"] = m("leaf", "#7fa46a", "foliage", 0.8, tone=0.85)
    return M


# --- Fence -----------------------------------------------------------------


def sheet(M, length, name):
    """Hoarding `length` long, x centred, the outside facing +z: plywood sheets
    on timber rails, screwed, a bolted rail on top, kicker board and feet."""
    y0, y1 = 0.1, BOARD_TOP
    h = y1 - y0
    a = Acc()
    parts = [
        box("board", (length, h, 0.12), (0, (y0 + y1) / 2, 0), M["board"], bev=0.012, seg=2, cell=0.8),
        box("rail", (length, 0.16, 0.16), (0, RAIL_TOP - 0.08, 0), M["rail"], bev=0.018, seg=2),
    ]
    # Plywood sheets 1.2 wide: the butt joint and the timber rails behind it.
    if length > 2:
        a.box((0.012, h - 0.18, 0.012), (-length / 2 + 1.2, (y0 + y1) / 2 - 0.08, 0.066), M["boardDark"])
    for y in (0.5, 1.4):
        a.box((length - 0.02, 0.012, 0.01), (0, y, 0.064), M["boardDark"])
    # Screws along the middle rail.
    n = max(2, int(length / 0.45))
    for k in range(n):
        a.hexnut((-length / 2 + (k + 0.5) * length / n, 0.95, 0.066), 0.011, 0.012, M["screw"], "z")
    # Kicker board along the foot, and the battens the lean sheet carries.
    a.box((length - 0.02, 0.12, 0.03), (0, 0.16, 0.072), M["boardDark"])
    a.box((0.12, h - 0.2, 0.028), (0, (y0 + y1) / 2 - 0.03, 0.074), M["boardLight"])
    a.box((0.12, h - 0.2, 0.028), (0, (y0 + y1) / 2 - 0.03, -0.074), M["boardLight"])
    # Concrete feet on the inside face and their steel clamps, by the ends.
    for x in (-length / 2 + 0.2, length / 2 - 0.2):
        a.box((0.14, 0.14, 0.45), (x, 0.07, -0.3), M["concrete"])
        a.box((0.03, 0.34, 0.03), (x, 0.24, -0.075), M["screw"])
    return finish(parts + a.objects(name + "Fit"), name)


def post(M):
    a = Acc()
    h = RAIL_TOP + 0.1
    parts = [box("post", (0.26, h, 0.26), (0, h / 2, 0), M["post"], bev=0.015, seg=2)]
    a.box((0.32, 0.03, 0.32), (0, 0.015, 0), M["post"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.hexnut((sx * 0.11, 0.03, sz * 0.11), 0.017, 0.012, M["screw"], "y")
    for y in (0.5, 1.2):
        a.box((0.18, 0.05, 0.02), (0, y, 0.138), M["screw"])
    a.box((0.28, 0.04, 0.28), (0, h + 0.02, 0), M["post"])
    return finish(parts + a.objects("postFit"), "FencePost")


# --- Scaffold --------------------------------------------------------------


def _coupler(a, p, along, M):
    """A right-angle drop-forged coupler at `p`: a collar round the tube, a
    body with its bolt and nut. `along` is the axis of the tube it clamps."""
    x, y, z = p
    r = TUBE + 0.012
    a.disc(p, r, 0.07, M["coupler"], along, 6, caps=(False, False))
    a.box((0.05, 0.05, 0.05), (x, y + 0.04, z), M["coupler"])
    a.hexnut((x, y + 0.075, z), 0.017, 0.03, M["screw"], "y")


def standard(M, height, name, foot=False):
    a = Acc()
    a.tube((0, 0.03 if foot else 0, 0), (0, height, 0), TUBE, TUBE, M["steel"], 8)
    if foot:
        # Base plate, its screw jack with the adjusting nut, and the sole board.
        a.box((0.26, 0.03, 0.26), (0, 0.015, 0), M["steel"])
        for sx in (-1, 1):
            for sz in (-1, 1):
                a.hexnut((sx * 0.1, 0.034, sz * 0.1), 0.012, 0.008, M["screw"], "y")
        a.disc((0, 0.16, 0), 0.02, 0.26, M["galv"], "y", 6)
        a.hexnut((0, 0.19, 0), 0.05, 0.05, M["screw"], "y")
        # The sole board under it.
        a.box((0.32, 0.04, 0.32), (0, -0.0, 0), M["plank"])
    # A spigot band where lifts join, and the lift's ledger seat.
    a.disc((0, height - 0.28, 0), TUBE + 0.006, 0.12, M["galv"], "y", 8, caps=(False, False))
    a.disc((0, height - 0.22, 0), TUBE + 0.011, 0.014, M["galv"], "y", 8, caps=(False, False))
    return finish(a.objects(name + "Fit"), name)


def stub(M, cm):
    h = cm / 100
    a = Acc()
    a.tube((0, 0, 0), (0, h, 0), TUBE, TUBE, M["steel"], 8, cap1=True)
    a.disc((0, min(h - 0.03, 0.12), 0), TUBE + 0.006, 0.05, M["galv"], "y", 8, caps=(False, False))
    return finish(a.objects(f"stub{cm}Fit"), f"ScaffoldStub{cm}")


def ledger(M):
    a = Acc()
    a.tube((-BAY / 2, 0, 0), (BAY / 2, 0, 0), 0.04, 0.04, M["steel"], 8)
    for s in (-1, 1):
        _coupler(a, (s * (BAY / 2 - 0.04), 0, 0), "x", M)
    # A second coupler where a transom sits on the ledger, mid bay.
    for x in (-BAY * 0.32, BAY * 0.32):
        a.disc((x, 0, 0), 0.05, 0.03, M["coupler"], "x", 6, caps=(False, False))
    return finish(a.objects("ledgerFit"), "ScaffoldLedger")


def brace(M):
    a = Acc()
    p0, p1 = (-BAY / 2, 0.05, 0), (BAY / 2, LIFT - 0.05, 0)
    a.tube(p0, p1, 0.03, 0.03, M["steel"], 6)
    for p in (p0, p1):
        a.disc(p, 0.05, 0.05, M["coupler"], "z", 6, caps=(False, False))
        a.hexnut((p[0], p[1], 0.065), 0.026, 0.04, M["screw"], "z")
    return finish(a.objects("braceFit"), "ScaffoldBrace")


def deck(M):
    """A bay of working platform: boards with gaps, transoms under them, a
    toe board and two guard rails on the outer edge, end hooks."""
    a = Acc()
    parts = []
    for z in (-0.17, 0.17):
        parts.append(box("board", (BAY, 0.05, 0.32), (0, 0.015, z), M["plank"], bev=0.008, seg=2))
    parts.append(box("toe", (BAY, 0.15, 0.03), (0, 0.1, 0.335), M["plankDark"], bev=0.006, seg=2))
    # Transoms under the boards, board end straps, and the hook-on brackets.
    for x in (-BAY / 2 + 0.2, BAY / 2 - 0.2):
        a.tube((x, -0.05, -0.32), (x, -0.05, 0.32), 0.035, 0.035, M["steel"], 6)
    for s in (-1, 1):
        a.box((0.03, 0.06, 0.66), (s * (BAY / 2 - 0.03), 0.02, 0), M["screw"])
        a.box((0.04, 0.09, 0.05), (s * (BAY / 2 - 0.06), -0.02, 0.37), M["coupler"])
    # Guard rails: two on the outer face, posts at the bay's ends and middle.
    for y in (0.55, 1.05):
        a.tube((-BAY / 2, y, 0.36), (BAY / 2, y, 0.36), 0.024, 0.024, M["steel"], 8)
    for x in (-BAY / 2 + 0.06, BAY / 2 - 0.06):
        a.tube((x, 0.04, 0.36), (x, 1.08, 0.36), 0.022, 0.022, M["steel"], 6)
        for y in (0.55, 1.05):
            a.disc((x, y, 0.36), 0.036, 0.04, M["coupler"], "y", 6, caps=(False, False))
    # Board grain: a nail at each end of every board.
    return finish(parts + a.objects("deckFit"), "ScaffoldDeck")


def ladder(M):
    """A scaffold ladder, leaning 1.9 up and 0.5 back, origin at its foot."""
    a = Acc()
    top = (0, LIFT + 0.9, -0.5)
    for s in (-1, 1):
        x = s * 0.22
        a.tube((x, 0, 0), (x, top[1], top[2]), 0.02, 0.02, M["galv"], 8)
    n = 10
    for k in range(1, n + 1):
        t = k / (n + 0.4)
        y, z = top[1] * t, top[2] * t
        a.tube((-0.22, y, z), (0.22, y, z), 0.013, 0.013, M["galv"], 6)
    a.box((0.5, 0.03, 0.03), (0, top[1], top[2]), M["screw"])
    for s in (-1, 1):
        a.box((0.06, 0.04, 0.08), (s * 0.22, 0.02, 0.0), M["rubberBlack"] if "rubberBlack" in M else M["strapBlack"])
        a.tube((s * 0.22, top[1] - 0.05, top[2]), (s * 0.22, top[1] + 0.12, top[2] - 0.02), 0.02, 0.02, M["galv"], 8)
    return finish(a.objects("ladderFit"), "ScaffoldLadder")


# --- Sign ------------------------------------------------------------------


def sign(M):
    a = Acc()
    parts = [
        cyl("post", 0.1, 2.6, (0, 1.3, 0), M["signPost"], axis="y", verts=8, radius2=0.085),
        box("footing", (0.3, 0.1, 0.3), (0, 0.05, 0), M["signPost"], bev=0.015, seg=2),
        box("board", (2.0, 1.3, 0.1), (0, 2.5, 0.09), M["sign"], bev=0.03, seg=3),
    ]
    for w, hh, x, y in ((1.8, 0.07, 0, 3.05), (1.8, 0.07, 0, 1.95), (0.07, 1.04, -0.9, 2.5), (0.07, 1.04, 0.9, 2.5)):
        a.box((w, hh, 0.014), (x, y, 0.147), M["signWhite"])
    a.rod((-0.62, 2.14, 0.158), (0.62, 2.86, 0.158), 0.16, 0.014, M["signDark"], ends=True)
    # A worker pictogram at the sign's left and right, and rivets round the border.
    for x in (-0.6, 0.6):
        a.disc((x, 2.92 if x < 0 else 2.08, 0.16), 0.03, 0.02, M["signPost"], "z", 8)
    for k in range(9):
        for y in (3.0, 2.0):
            a.disc((-0.84 + k * 0.21, y, 0.153), 0.012, 0.01, M["signPost"], "z", 6)
    for y in (2.15, 2.85):
        a.box((1.6, 0.06, 0.04), (0, y, 0.01), M["signPost"])
    # Clamp bands round the post at the board's braces, a cap on top, foot bolts.
    for y in (2.15, 2.85):
        a.disc((0, y, 0.0), 0.11, 0.05, M["signPost"], "y", 10, caps=(False, False))
        a.box((0.06, 0.06, 0.05), (0, y, 0.075), M["signPost"])
    a.disc((0, 2.61, 0), 0.085, 0.02, M["signPost"], "y", 8)
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.hexnut((sx * 0.11, 0.115, sz * 0.11), 0.018, 0.02, M["signPost"], "y")
    return finish(parts + a.objects("signFit"), "SiteSign")


# --- The finished building's forecourt -------------------------------------


def yard(M):
    px, pz = lean.SHELL_X, lean.SHELL_Z + 4
    a = Acc()
    parts = []
    # Paving: separate slabs (each with a soft edge) and the kerb in blocks.
    for i in range(4):
        for j in range(2):
            x = px - 3.2 + 6.4 * (i + 0.5) / 4
            z = pz - 1.2 + 2.4 * (j + 0.5) / 2
            a.box((6.4 / 4 - 0.02, 0.08, 1.2 - 0.02), (x, 0.09, z), M["paving"])
            a.box((6.4 / 4 - 0.1, 0.006, 1.2 - 0.1), (x, 0.133, z), M["joint"])
    for k in range(13):
        x = px - 3.25 + k * 0.5
        a.box((0.49, 0.1, 0.14), (x + 0.25, 0.1, pz + 1.27), M["kerb"])
        a.box((0.47, 0.006, 0.12), (x + 0.25, 0.152, pz + 1.27), M["paving"])

    # The ribbon across the doors on two stanchions, sagging, folded.
    rz = lean.SHELL_Z + 3
    for s in (-1, 1):
        x = px + s * 2.9
        a.disc((x, 0.145, rz), 0.2, 0.05, M["benchFrame"], "y", 14)
        a.disc((x, 0.18, rz), 0.1, 0.03, M["benchFrame"], "y", 12)
        a.tube((x, 0.15, rz), (x, 2.2, rz), 0.07, 0.055, M["benchFrame"], 12)
        a.lathe((x, 2.2, rz), [(0, 0.08), (0.05, 0.11), (0.1, 0.09), (0.16, 0.0)], M["benchFrame"], "y", 12, cap_first=True, cap_last=False)
        a.ring((x, 1.92, rz), 0.03, 0.008, M["benchFrame"], "z", 8, 4)
    w, sag = 5.8, 0.14
    n = 24
    prev = None
    for k in range(n + 1):
        t = k / n
        x = px - w / 2 + w * t
        top = 1.92 - sag * (1 - (2 * t - 1) ** 2) + 0.012 * math.sin(k * 1.7)
        cur = (x, top)
        if prev:
            (x0, y0), (x1, y1) = prev, cur
            fold = 0.012 * (1 if k % 2 else -1)
            a.box((w / n + 0.004, 0.34, 0.03), ((x0 + x1) / 2, (y0 + y1) / 2 - 0.17, rz + fold), M["ribbon"], rot=(0, 0, math.atan2(y1 - y0, x1 - x0)))
        prev = cur
    bx, by = px - 0.6, 1.75
    for s in (-1, 1):
        a.box((0.34, 0.26, 0.04), (bx + s * 0.22, by + 0.05, rz - 0.03), M["bow"], rot=(0, 0, s * 0.3))
        a.box((0.06, 0.66, 0.03), (bx + s * 0.13, by - 0.36, rz - 0.03), M["bow"], rot=(0, 0, -s * 0.2))
        a.box((0.08, 0.5, 0.025), (bx + s * 0.22, by - 0.32, rz - 0.035), M["bow"], rot=(0, 0, -s * 0.34))
    a.box((0.14, 0.16, 0.09), (bx, by, rz - 0.03), M["bow"])

    # A young tree in its pit: a ringed kerb, soil, a stake and ties, a
    # trunk with forks, and leaf clusters.
    tx, tz = lean.SHELL_X - 4.1, lean.SHELL_Z + 3.4
    ring = [(tx + math.cos(t) * 0.7, tz + math.sin(t) * 0.7) for t in [i * math.pi / 12 + math.pi / 24 for i in range(24)]]
    a.slab(ring, 0, 0.1, M["kerb"])
    ring2 = [(tx + math.cos(t) * 0.58, tz + math.sin(t) * 0.58) for t in [i * math.pi / 12 for i in range(24)]]
    a.slab(ring2, 0.09, 0.115, M["soil"])
    rng = random.Random(6)
    for k in range(12):
        ang = rng.random() * 6.28
        r = 0.15 + rng.random() * 0.4
        a.box((0.06, 0.04, 0.05), (tx + math.cos(ang) * r, 0.135, tz + math.sin(ang) * r), M["kerb"], rot=(0, ang, 0))
    a.tube((tx, 0.1, tz), (tx + 0.04, 1.35, tz), 0.11, 0.06, M["bark"], 10)
    a.tube((tx + 0.3, 0.1, tz + 0.1), (tx + 0.3, 1.5, tz + 0.1), 0.025, 0.02, M["bench"], 6)
    for y in (0.6, 1.1):
        a.tube((tx + 0.3, y, tz + 0.1), (tx + 0.04, y, tz), 0.008, 0.008, M["strapBlack"], 4)
    branches = [((0.04, 1.3, 0), (0.55, 1.85, 0.3)), ((0.04, 1.3, 0), (-0.5, 1.8, -0.35)), ((0.04, 1.35, 0), (0.05, 2.3, -0.1)),
                ((0.04, 1.3, 0), (0.1, 1.9, 0.5)), ((0.04, 1.3, 0), (-0.3, 1.7, 0.4))]
    for (p0, p1) in branches:
        a.tube((tx + p0[0], p0[1], tz + p0[2]), (tx + p1[0], p1[1], tz + p1[2]), 0.045, 0.02, M["bark"], 6)
    clusters = ((0, 1.85, 0, 0.9), (0.55, 1.5, 0.3, 0.6), (-0.5, 1.55, -0.35, 0.58), (0.1, 2.35, -0.1, 0.5), (0.1, 1.7, 0.5, 0.45), (-0.3, 1.6, 0.4, 0.42))
    for i, (dx, dy, dz, r) in enumerate(clusters):
        for k in range(5):
            ang = k * 1.26 + i
            c = (tx + dx + math.cos(ang) * r * 0.45, dy + math.sin(ang * 1.7) * r * 0.25, tz + dz + math.sin(ang) * r * 0.45)
            a.lump(c, r * 0.55, M["leaf"] if k % 2 else M["sky"], seed=i * 7 + k)

    # A bench: slatted seat and back on two cast frames, armrests, bolts.
    bx0, bz0 = lean.SHELL_X + 4.2, lean.SHELL_Z + 3.2
    for z in (-0.13, 0.0, 0.13):
        a.box((1.6, 0.04, 0.1), (bx0, 0.46, bz0 + z), M["bench"])
    for y in (0.72, 0.84):
        a.box((1.6, 0.09, 0.03), (bx0, y, bz0 - 0.26), M["bench"])
    a.box((1.6, 0.09, 0.03), (bx0, 0.6, bz0 - 0.26), M["bench"])
    for s in (-1, 1):
        x = bx0 + s * 0.7
        a.box((0.06, 0.44, 0.5), (x, 0.22, bz0), M["benchFrame"])
        a.box((0.06, 0.42, 0.05), (x, 0.66, bz0 - 0.26), M["benchFrame"])
        a.box((0.06, 0.05, 0.42), (x + s * 0.0, 0.66, bz0 - 0.03), M["benchFrame"])
        a.tube((x, 0.46, bz0 + 0.2), (x, 0.66, bz0 + 0.18), 0.02, 0.02, M["benchFrame"], 6)
        a.box((0.08, 0.02, 0.1), (x, 0.01, bz0 + 0.2), M["benchFrame"])
        a.box((0.08, 0.02, 0.1), (x, 0.01, bz0 - 0.2), M["benchFrame"])
        for z in (-0.13, 0.0, 0.13):
            a.disc((x - s * 0.0, 0.485, bz0 + z), 0.012, 0.01, M["screw"], "y", 6)
    # A litter bin beside the bench and a planted bed at the ribbon's foot.
    a.disc((bx0 - 1.25, 0.42, bz0 - 0.1), 0.19, 0.84, M["benchFrame"], "y", 14, radius2=0.16)
    a.disc((bx0 - 1.25, 0.86, bz0 - 0.1), 0.2, 0.03, M["benchFrame"], "y", 14)
    return finish(a.objects("yardFit"), "CompletedYard")


# --- The crew's gear -------------------------------------------------------


def gear(M):
    """A hard hat with its ridges, peak and suspension strap, and the vest's
    reflective bands and shoulder straps on the near walker's torso."""
    import bmesh
    import walker_near

    a = Acc()
    parts = []
    dome = [(0.985, 0.168), (1.03, 0.166), (1.07, 0.152), (1.11, 0.122), (1.145, 0.075), (1.165, 0.0)]
    for (y0, r0), (y1, r1) in zip(dome, dome[1:]):
        a.tube((0, y0, 0), (0, y1, 0), r0, r1, M["helmet"], 10, cap0=False)
    # Ridges over the crown, a peak, a full brim, and the chin strap.
    for ang in (-0.5, 0.0, 0.5):
        pts = [(math.sin(ang) * 0.06 * (t + 0.3) * 3, 1.0 + 0.155 * math.sin(t * 1.4), 0.17 * math.cos(t * 1.4 - 1.3)) for t in [k / 6 for k in range(7)]]
    a.box((0.04, 0.02, 0.32), (0, 1.155, 0), M["helmet"])
    a.box((0.04, 0.02, 0.28), (-0.06, 1.14, 0), M["helmet"], rot=(0, 0.15, 0))
    a.box((0.04, 0.02, 0.28), (0.06, 1.14, 0), M["helmet"], rot=(0, -0.15, 0))
    brim = [(-0.19, 0.0), (-0.13, -0.19), (0.13, -0.19), (0.19, 0.0), (0.14, 0.17), (0.06, 0.245), (-0.06, 0.245), (-0.14, 0.17)]
    a.slab(brim, 0.978, 0.992, M["helmet"], bottom=True)
    a.box((0.19, 0.012, 0.09), (0, 0.994, 0.235), M["hatDark"])
    a.box((0.02, 0.012, 0.3), (0, 1.0, -0.11), M["hatDark"])
    a.tube((-0.15, 0.985, 0.03), (-0.13, 0.86, 0.06), 0.008, 0.008, M["strapBlack"], 4)
    a.tube((0.15, 0.985, 0.03), (0.13, 0.86, 0.06), 0.008, 0.008, M["strapBlack"], 4)
    a.tube((-0.13, 0.86, 0.06), (0.13, 0.86, 0.06), 0.008, 0.008, M["strapBlack"], 4)
    # A head torch clip on the front and a rear reflective sticker.
    a.box((0.05, 0.035, 0.014), (0, 1.07, 0.167), M["strapBlack"])
    a.box((0.06, 0.035, 0.012), (0, 1.07, -0.165), M["reflect"])
    # The vest: bands round the waist and chest following the near torso.
    scale = 1.06
    T = walker_near.TORSO
    def at(y):
        for (y0, rx0, rz0, _, _), (y1, rx1, rz1, _, _) in zip(T, T[1:]):
            if y0 <= y <= y1:
                t = (y - y0) / (y1 - y0)
                return rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t
        return T[-1][1], T[-1][2]
    for y0, y1, mat in ((-0.02, 0.05, M["reflect"]), (0.135, 0.205, M["reflect"])):
        ys = [y0, (y0 + y1) / 2, y1]
        for (ya, yb) in zip(ys, ys[1:]):
            (rxa, rza), (rxb, rzb) = at(ya), at(yb)
            _elliptic_band(a, 0.44, ya, yb, rxa * scale, rza * scale, rxb * scale, rzb * scale, mat, 12)
    # Shoulder straps over the chest, front and back.
    for s in (-1, 1):
        a.box((0.04, 0.22, 0.012), (s * 0.075, 0.44 + 0.24, at(0.24)[1] * 1.03), M["reflect"], rot=(0.15, 0, s * 0.2))
        a.box((0.04, 0.22, 0.012), (s * 0.075, 0.44 + 0.24, -at(0.24)[1] * 1.03), M["reflect"], rot=(-0.15, 0, -s * 0.2))
    return finish(parts + a.objects("gearFit"), "CrewGear")


def _elliptic_band(a, base, y0, y1, rx0, rz0, rx1, rz1, mat, sides):
    """A band of an ellipse-section body between two heights (figure frame,
    `base` up from the feet), open top and bottom."""
    bm = a._bm(mat)
    rings = []
    for y, rx, rz in ((y0, rx0, rz0), (y1, rx1, rz1)):
        rings.append([bm.verts.new(kit.B((math.cos(2 * math.pi * i / sides + math.pi / 12) * rx, base + y, math.sin(2 * math.pi * i / sides + math.pi / 12) * rz))) for i in range(sides)])
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))


def build():
    kit.reset()
    M = palette()
    objs = [
        sheet(M, lean.SHEET, "FenceSheet"),
        sheet(M, lean.SHEET / 2, "FenceHalf"),
        post(M),
        standard(M, 2 * LIFT, "ScaffoldFoot", foot=True),
        standard(M, LIFT, "ScaffoldPole"),
        *[stub(M, cm) for cm in lean.STUBS_CM],
        ledger(M),
        brace(M),
        deck(M),
        ladder(M),
        sign(M),
        yard(M),
        gear(M),
    ]
    bake_spread(objs, gap=1.0, floor=0.55)
    return objs


def preview(n):
    import bpy

    objs = build()
    by = {o.name: o for o in objs}
    if n == 2:
        keep = [by["CompletedYard"]]
    elif n == 0:
        keep = [by["FenceSheet"], by["FenceHalf"], by["FencePost"], by["SiteSign"]]
    elif n == 1:
        keep = [by["ScaffoldFoot"], by["ScaffoldPole"], by["ScaffoldStub40"], by["ScaffoldLedger"], by["ScaffoldBrace"], by["ScaffoldDeck"], by["ScaffoldLadder"]]
    else:
        keep = [by["CrewGear"]]
    for o in objs:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    if n == 3:
        import runpy

        walker = runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props", "walker_near.py"))
        body, head = walker["build"]()
        body.location.z, head.location.z = 0.44, 0.94
        return keep + [body, head]
    if n != 2:
        x = 0.0
        for o in keep:
            xs = [c[0] for c in o.bound_box]
            o.location.x = x - min(xs)
            x += max(xs) - min(xs) + 0.8
    return keep
