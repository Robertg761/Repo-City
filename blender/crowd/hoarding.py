"""
The hoarding KIT (spike: Blender assets vs procedural). A hoarding fences a
plot of whatever size the plot is, so it is not one mesh stretched to fit:
`hoardingKit` in forms.ts lays these pieces along each side at the side's
real length, the way `civic.ts` assembles its kit. Every piece is modelled
in its own frame, origin at 0:

  HoardSheet, HoardSheetAlt  one boarding sheet, 1 m along x, both faces, in
                        paint slot 1 (the contractor's colour); Alt a good deal
                        darker, so neighbouring sheets read as sheets
  HoardBand             the white capping rail over the sheets, 1 m along x
  HoardPost             a corner post
  HoardGate             a steel mesh gate, 1 m along x, in place of a sheet
  HoardNotice           the planning notice, facing +z
  HoardGround           the plot's dirt, 1 m square
  HoardWorker, HoardBeacon, HoardStop, HoardFlag   the optional parts

Sheets and bands stretch along their length only (a board is a board at any
length); posts, gate height, notice and the optional parts never stretch.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "props"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import crowdkit as ck  # noqa: E402
import kit  # noqa: E402
import lowpoly as lp  # noqa: E402
from kit import finish  # noqa: E402

SHEET_TOP = 1.25
BAND_TOP = 1.39


def palette():
    m = kit.material
    return {
        "sheet": m("paintA", "#ffffff", "timber", 0.8),
        "sheetAlt": m("paintA", "#ffffff", "timber", 0.8, tone=0.8),
        "band": m("band", "#eeeae1", "timber", 0.7),
        "hoardPost": m("hoardPost", "#4a4f4c", "metal", 0.6),
        "gate": m("gate", "#5c6266", "metal", 0.5),
        "notice": m("notice", "#eeeae2", "metal", 0.6),
        "dirt": m("dirt", "#8d7a5e", "concrete", 1.0),
    }


def sheet(M, key, name):
    return finish([
        lp.panel("front", 1.0, SHEET_TOP - 0.03, (0, (SHEET_TOP + 0.03) / 2, 0.004), M[key]),
        lp.panel("back", 1.0, SHEET_TOP - 0.03, (0, (SHEET_TOP + 0.03) / 2, -0.004), M[key], rot=(0, math.pi, 0)),
    ], name)


def build(M):
    band = kit.box("band", (1.0, BAND_TOP - SHEET_TOP, 0.1), (0, (BAND_TOP + SHEET_TOP) / 2, 0), M["band"], bev=0)
    band = lp_drop(band, lambda n: n.z < -0.9 or abs(n.x) > 0.9)
    gate = finish([
        lp.panel("front", 1.0, SHEET_TOP - 0.06, (0, (SHEET_TOP + 0.06) / 2, 0.004), M["gate"]),
        lp.panel("back", 1.0, SHEET_TOP - 0.06, (0, (SHEET_TOP + 0.06) / 2, -0.004), M["gate"], rot=(0, math.pi, 0)),
    ], "HoardGate")
    pieces = [
        sheet(M, "sheet", "HoardSheet"),
        sheet(M, "sheetAlt", "HoardSheetAlt"),
        finish([band], "HoardBand"),
        finish([lp.tube("post", (0, 0, 0), (0, BAND_TOP + 0.03, 0), 0.06, 0.06, M["hoardPost"], sides=4, cap1=True,
                        turn=math.pi / 4)], "HoardPost"),
        gate,
        finish([
            lp.panel("notice", 0.64, 0.46, (0, 0.9, 0.003), M["notice"]),
            lp.panel("noticeBack", 0.64, 0.46, (0, 0.9, -0.003), M["notice"], rot=(0, math.pi, 0)),
        ], "HoardNotice"),
        finish([lp.panel("dirt", 1.0, 1.0, (0, 0.015, 0), M["dirt"], rot=(-math.pi / 2, 0, 0))], "HoardGround"),
        finish(ck.worker(M, 0, 0), "HoardWorker"),
        # Modelled standing on the ground (the bake has a ground plane);
        # forms.ts lifts them to where they hang.
        finish(ck.beacon(M, (0, 0.11, 0)), "HoardBeacon"),
        finish([kit.box("board", (0.04, 0.54, 0.54), (0, 0.27, 0), M["board"], bev=0)], "HoardStop"),
        finish(ck.flag(M, 0, 0, 0, 2.3), "HoardFlag"),
    ]
    return pieces


def lp_drop(obj, test):
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if test(f.normal)], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return obj
