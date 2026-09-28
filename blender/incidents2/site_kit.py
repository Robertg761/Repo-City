"""
The construction site's kit (spike: Blender assets vs procedural): what
`constructionDecor.ts` drew from primitives, as PIECES the site lays out at
their real size, the way `civic.ts` assembles its kit and `forms.ts` its
hoarding. Nothing here stretches: a fence run is five whole sheets, a
scaffold face is two whole bays, and `siteKit.ts` counts and places them.

  Fence
    FenceSheet      2.2 m of boarding, +z the outside, in the site's fence
                    colour, two battens a side and the warning rail on top
    FenceHalf       a half sheet (1.1 m), for the boards that came down
    FencePost       the corner post, 0.24 square

  Scaffold (bay 3.15 wide, lift 1.9 high, standards of whole lifts)
    ScaffoldFoot    a base plate under a two-lift standard (3.8)
    ScaffoldPole    a one-lift standard (1.9)
    ScaffoldStub30, ScaffoldStub40, ScaffoldStub110
                    the capped top of a standard, in centimetres
    ScaffoldLedger  a bay long along x (turned for the other faces)
    ScaffoldBrace   the diagonal across one bay and one lift
    ScaffoldDeck    a bay of working platform, 0.7 deep, with its toe board

  Site
    SiteSign        a warning sign on its post, straight (the site leans it)
    CompletedYard   the finished building's forecourt in the site frame: paving,
                    kerb, the ribbon on two stanchions, a young tree, a bench
    CrewGear        a hard hat and the reflective bands of a hi-vis vest, on
                    the walker (feet at 0), in the figure's own frame

Colours are the procedural ones, so the site shades them as it did.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from helpers import (  # noqa: E402
    B, bake_spread, blob, kit, lathe, lp, open_box, plan_slab, rod,
)
from kit import box, cyl, finish, marker  # noqa: E402
from incident_props import face_prism  # noqa: E402

SITE = 11
SHEET = 2.2
SHELL_X, SHELL_Z = SITE * 0.12, SITE * 0.1
BAY = 5.4 / 2 + 0.45  # a scaffold bay's width
LIFT = 1.9
BOARD_TOP = 1.7
RAIL_TOP = 1.78
STUBS_CM = (30, 40, 110)


def palette():
    m = kit.material
    return {
        "board": m("board", "#bdb6a4", "timber", 0.85),
        "batten": m("board", "#bdb6a4", "timber", 0.85, tone=0.82),
        "rail": m("rail", "#e8853c", "metal", 0.55),
        "post": m("post", "#6b6f6d", "metal", 0.6),
        "steel": m("steel", "#9aa0a6", "metal", 0.45, 0.35),
        "plank": m("plank", "#b59a6f", "timber", 0.85),
        "plankDark": m("plank", "#b59a6f", "timber", 0.85, tone=0.85),
        "sign": m("sign", "#e8853c", "metal", 0.55),
        "signWhite": m("stripe", "#e8e3d6", "metal", 0.55),
        "signDark": m("mark", "#2f3330", "metal", 0.6),
        "signPost": m("signPost", "#6b6f6d", "metal", 0.5, 0.3),
        # The forecourt.
        "paving": m("paving", "#d9d3c4", "concrete", 0.9),
        "joint": m("joint", "#d9d3c4", "concrete", 0.9, tone=0.8),
        "kerb": m("kerb", "#8f8b80", "concrete", 0.85),
        "soil": m("soil", "#4a3b2e", "fabric", 0.95),
        "ribbon": m("ribbon", "#c8493c", "fabric", 0.6),
        "bow": m("bow", "#d85c4c", "fabric", 0.6),
        "bark": m("bark", "#8a6d52", "timber", 0.85),
        "leaf": m("leaf", "#7fa46a", "foliage", 0.8),
        "bench": m("bench", "#9a7c58", "timber", 0.8),
        "benchFrame": m("benchFrame", "#5f6466", "metal", 0.5, 0.3),
        # The crew's gear.
        "helmet": m("helmet", "#f0d44a", "metal", 0.45),
        "band": m("band", "#ebe4ba", "fabric", 0.5),
    }


# --- Fence -----------------------------------------------------------------


def sheet(M, length, name):
    """Boarding `length` long, x centred, the outside facing +z. It is
    1.6 tall off the ground (the procedural boards float at 0.2, but a board
    that stands on the ground is what a hoarding is)."""
    y0, y1 = 0.1, BOARD_TOP
    h = y1 - y0
    parts = [
        open_box("board", (length, h, 0.12), (0, (y0 + y1) / 2, 0), M["board"], drop=("bottom",)),
        open_box("rail", (length, 0.16, 0.16), (0, RAIL_TOP - 0.08, 0), M["rail"], drop=("bottom", "left", "right")),
    ]
    # One batten down the middle of each sheet, both faces.
    parts.append(open_box("batten", (0.12, h - 0.16, 0.156), (0, (y0 + y1) / 2 - 0.03, 0),
                          M["batten"], drop=("bottom", "left", "right")))
    return finish(parts, name)


def post(M):
    parts = [open_box("post", (0.26, RAIL_TOP + 0.1, 0.26), (0, (RAIL_TOP + 0.1) / 2, 0), M["post"], drop=("bottom",))]
    return finish(parts, "FencePost")


# --- Scaffold --------------------------------------------------------------

POLE = 0.11


def standard(M, height, name, foot=False):
    parts = [rod("pole", (0, 0, 0), (0, height, 0), POLE, POLE, M["steel"])]
    if foot:
        parts.append(open_box("plate", (0.26, 0.03, 0.26), (0, 0.015, 0), M["steel"],
                              drop=("bottom", "left", "right", "front", "back")))
    return finish(parts, name)


def stub(M, cm):
    h = cm / 100
    return finish([open_box("stub", (POLE, h, POLE), (0, h / 2, 0), M["steel"], drop=("bottom",))], f"ScaffoldStub{cm}")


def ledger(M):
    return finish([rod("ledger", (-BAY / 2, 0, 0), (BAY / 2, 0, 0), 0.08, 0.08, M["steel"])], "ScaffoldLedger")


def brace(M):
    # From the bay's foot corner to the next lift's head corner; the poles it
    # crosses hide its ends.
    return finish([rod("brace", (-BAY / 2, 0.05, 0), (BAY / 2, LIFT - 0.05, 0), 0.05, 0.05, M["steel"])], "ScaffoldBrace")


def deck(M):
    """A bay of working platform: two boards, the transoms under them, and a
    toe board along the outer edge. Its origin is on the standards' line,
    the deck's top at 0.04."""
    parts = []
    for z in (-0.17, 0.17):
        parts.append(open_box("board", (BAY, 0.05, 0.32), (0, 0.015, z), M["plank"], drop=("bottom",)))
    parts.append(open_box("toe", (BAY, 0.15, 0.03), (0, 0.1, 0.335), M["plankDark"], drop=("bottom",)))
    return finish(parts, "ScaffoldDeck")


# --- Sign ------------------------------------------------------------------


def sign(M):
    parts = [
        cyl("post", 0.1, 2.6, (0, 1.3, 0), M["signPost"], axis="y", verts=6, radius2=0.085),
        open_box("footing", (0.3, 0.1, 0.3), (0, 0.05, 0), M["signPost"], drop=("bottom",)),
        open_box("board", (2.0, 1.3, 0.1), (0, 2.5, 0.09), M["sign"], drop=("back",)),
    ]
    for w, h, x, y in ((1.8, 0.07, 0, 3.05), (1.8, 0.07, 0, 1.95), (0.07, 1.04, -0.9, 2.5), (0.07, 1.04, 0.9, 2.5)):
        parts.append(open_box("border", (w, h, 0.014), (x, y, 0.147), M["signWhite"], drop=("bottom", "back")))
    # A diagonal bar across it: no entry.
    parts.append(rod("bar", (-0.62, 2.14, 0.156), (0.62, 2.86, 0.156), 0.16, 0.014, M["signDark"], ends=True))
    for x in (-0.6, 0.6):
        parts.append(open_box("bolt", (0.06, 0.06, 0.03), (x, 2.92 if x < 0 else 2.08, 0.155), M["signPost"], drop=("bottom",)))
    for y in (2.15, 2.85):
        parts.append(open_box("brace", (1.6, 0.06, 0.04), (0, y, 0.01), M["signPost"], drop=("bottom",)))
    return finish(parts, "SiteSign")


# --- The finished building's forecourt -------------------------------------


def yard(M):
    px, pz = SHELL_X, SHELL_Z + 4
    parts = []
    # Paving: laid in slabs, with joints and a kerb along its front.
    parts.append(open_box("paving", (6.4, 0.08, 2.4), (px, 0.09, pz), M["paving"], drop=("bottom",)))
    for i in range(1, 4):
        x = px - 3.2 + 6.4 * i / 4
        parts.append(open_box("joint", (0.03, 0.008, 2.38), (x, 0.134, pz), M["joint"], drop=("bottom", "left", "right", "front", "back")))
    parts.append(open_box("joint", (6.38, 0.008, 0.03), (px, 0.134, pz), M["joint"], drop=("bottom", "left", "right", "front", "back")))
    parts.append(open_box("kerb", (6.5, 0.1, 0.14), (px, 0.1, pz + 1.27), M["kerb"], drop=("bottom",)))

    # The ribbon across the doors on two stanchions, sagging a little.
    rz = SHELL_Z + 3
    for s in (-1, 1):
        x = px + s * 2.9
        parts.append(cyl("base", 0.2, 0.05, (x, 0.145, rz), M["benchFrame"], axis="y", verts=8))
        parts.append(cyl("stanchion", 0.07, 2.2, (x, 1.1, rz), M["benchFrame"], axis="y", verts=6))
        parts.append(blob("finial", 0.1, (x, 2.24, rz), M["benchFrame"]))
    w, sag = 5.8, 0.14
    top = [(px - w / 2 + w * i / 6, 1.92 - sag * (1 - (2 * i / 6 - 1) ** 2)) for i in range(7)]
    outline = [(x, y) for x, y in top] + [(x, y - 0.34) for x, y in reversed(top)]
    parts.append(face_prism("ribbon", outline, rz, 0.05, M["ribbon"]))
    # The bow, off centre the way a ribbon actually hangs.
    bx, by = px - 0.6, 1.75 - 0.14 * (1 - (2 * 2.4 / 6 - 1) ** 2) * 0
    for s in (-1, 1):
        parts.append(face_prism("loop", [(bx, by), (bx + s * 0.4, by + 0.26), (bx + s * 0.4, by - 0.26)], rz - 0.03, 0.04, M["bow"]))
        parts.append(face_prism("tail", [(bx - 0.03, by - 0.1), (bx + 0.03, by - 0.1), (bx + s * 0.14, by - 0.7), (bx + s * 0.26, by - 0.64)], rz - 0.03, 0.03, M["bow"]))
    parts.append(open_box("knot", (0.14, 0.16, 0.09), (bx, by, rz - 0.03), M["bow"], drop=("bottom",)))

    # A young tree in its pit.
    tx, tz = SHELL_X - 4.1, SHELL_Z + 3.4
    parts.append(plan_slab("pit", [(tx + math.cos(a) * 0.7, tz + math.sin(a) * 0.7) for a in [i * math.pi / 4 + math.pi / 8 for i in range(8)]], 0, 0.1, M["kerb"]))
    parts.append(plan_slab("soil", [(tx + math.cos(a) * 0.58, tz + math.sin(a) * 0.58) for a in [i * math.pi / 4 + math.pi / 8 for i in range(8)]], 0.09, 0.115, M["soil"]))
    parts.append(lp.tube("trunk", (tx, 0.1, tz), (tx + 0.04, 1.35, tz), 0.19, 0.11, M["bark"], sides=6))
    for i, (dx, dy, dz, r) in enumerate(((0, 1.85, 0, 0.9), (0.55, 1.5, 0.3, 0.6), (-0.5, 1.55, -0.35, 0.58), (0.1, 2.35, -0.1, 0.5))):
        parts.append(blob("crown", r, (tx + dx, dy, tz + dz), M["leaf"], wobble=0.1, seed=i * 2.3, bottom=False))

    # A bench: slatted seat and back on two frames.
    bx, bz = SHELL_X + 4.2, SHELL_Z + 3.2
    for z in (-0.13, 0.0, 0.13):
        parts.append(open_box("slat", (1.6, 0.04, 0.11), (bx, 0.46, bz + z), M["bench"], drop=("bottom",)))
    for z, y in ((-0.26, 0.72), (-0.26, 0.84)):
        parts.append(open_box("back", (1.6, 0.09, 0.03), (bx, y, bz + z), M["bench"], drop=("bottom",)))
    for s in (-1, 1):
        parts.append(open_box("frame", (0.06, 0.44, 0.5), (bx + s * 0.7, 0.22, bz), M["benchFrame"], drop=("bottom", "right" if s < 0 else "left")))
        parts.append(open_box("backpost", (0.06, 0.42, 0.05), (bx + s * 0.7, 0.66, bz - 0.26), M["benchFrame"], drop=("bottom",)))
    return finish(parts, "CompletedYard")


# --- The crew's gear -------------------------------------------------------

# The walker's torso (blender/props/walker.py), in the figure's frame.
TORSO = [(-0.13, 0.115, 0.085), (0.02, 0.118, 0.085), (0.19, 0.15, 0.1), (0.28, 0.14, 0.095), (0.34, 0.06, 0.06)]
CHEST = 0.44


def torso_at(y):
    for (y0, rx0, rz0), (y1, rx1, rz1) in zip(TORSO, TORSO[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            return rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t
    return TORSO[-1][1:]


def gear(M):
    parts = []
    # The hat: a six-sided dome over the head (its centre is 0.94 up, its
    # crown at 1.09) with a brim all round and a peak to the front.
    dome = [(0.985, 0.168, 0.168, 0, 0), (1.045, 0.16, 0.16, 0, 0), (1.105, 0.125, 0.125, 0, 0), (1.145, 0.07, 0.07, 0, 0)]
    parts.append(lathe("dome", dome, M["helmet"], sides=6, tip=(0, 1.165, 0)))
    brim = [(-0.19, 0.0), (-0.1, -0.18), (0.1, -0.18), (0.19, 0.0), (0.12, 0.17), (0.0, 0.26), (-0.12, 0.17)]
    parts.append(plan_slab("brim", [(x, z) for x, z in brim], 0.978, 0.99, M["helmet"]))
    # The vest's reflective bands round the waist and chest, following the
    # torso's own six faces a little proud, and two straps over the front.
    scale = 1.07
    for y0, y1 in ((0.0, 0.055), (0.145, 0.2)):
        ys = [y0] + [y for y in (0.19,) if y0 < y < y1] + [y1]
        rings = [(CHEST + y, torso_at(y)[0] * scale, torso_at(y)[1] * scale, 0, 0) for y in ys]
        parts.append(lathe("band", rings, M["band"], sides=6, turn=math.pi / 6))
    return finish(parts, "CrewGear")


def build():
    kit.reset()
    M = palette()
    objs = [
        sheet(M, SHEET, "FenceSheet"),
        sheet(M, SHEET / 2, "FenceHalf"),
        post(M),
        standard(M, 2 * LIFT, "ScaffoldFoot", foot=True),
        standard(M, LIFT, "ScaffoldPole"),
        *[stub(M, cm) for cm in STUBS_CM],
        ledger(M),
        brace(M),
        deck(M),
        sign(M),
        yard(M),
        gear(M),
    ]
    bake_spread(objs, gap=1.0, floor=0.55)
    return objs


def preview(n):
    """0: the fence kit; 1: a scaffold bay; 2: the forecourt; 3: the gear on a walker."""
    objs = build()
    by = {o.name: o for o in objs}
    if n == 2:
        keep = [by["CompletedYard"]]
    elif n == 0:
        keep = [by["FenceSheet"], by["FenceHalf"], by["FencePost"], by["SiteSign"]]
    elif n == 1:
        keep = [by["ScaffoldFoot"], by["ScaffoldPole"], by["ScaffoldStub40"], by["ScaffoldLedger"], by["ScaffoldBrace"], by["ScaffoldDeck"]]
    else:
        keep = [by["CrewGear"]]
    for o in objs:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    if n == 3:
        import runpy

        walker = runpy.run_path(os.path.join(os.path.dirname(HERE), "props", "walker.py"))
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
