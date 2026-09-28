"""
The construction site's equipment, modelled by script (spike: Blender assets
vs procedural): the mixer, the excavator, the site hut and the stacked
materials from `constructionDecor.ts`, each in its own frame at the
procedural one's size, as nodes the site places and turns:

  Mixer       a towed drum mixer, origin on the ground under its axle's
              middle, tow bar to +z
  Excavator   a small tracked excavator, origin on the ground under the
              turntable, its arm folded forward (+z) as a parked machine's is
  SiteHut     a portable cabin, origin on the ground under its centre, door
              and window on the +z face
  Materials   bundled timber on bearers, a stack of pipes behind it (-z)
              and a sand pile off to +x, origin under the timber's centre

Colours are the procedural ones (timber `#b59a6f`, pipes `#9aa0a6`, sand
`#c2b08a`, the excavator's `#e0b750`, the mixer's warning orange, the hut's
`#8fa3a8` and `#5f6a6d`), so the site can repaint them for an abandoned
site as the procedural builders do.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import kit  # noqa: E402
from incident_props import bake_apart  # noqa: E402
from kit import box, cut, cyl, finish, plan_prism, prism, rounded_rect, strut  # noqa: E402


def palette():
    m = kit.material
    return {
        "orange": m("drum", "#e8853c", "metal", 0.5),
        "frame": m("frame", "#9aa0a6", "metal", 0.45, 0.3),
        "yellow": m("body", "#e0b750", "metal", 0.5),
        "metal": m("metal", "#6b6f6d", "metal", 0.5, 0.3),
        "track": m("track", "#3a3d42", "metal", 0.75),
        "tyre": m("tyre", "#2f3134", "fabric", 0.9),
        "dark": m("dark", "#2b2d31", "metal", 0.6),
        "chrome": m("chrome", "#c9ccd1", "metal", 0.25, 0.6),
        "glass": m("glass", "#536c7a", "glass", 0.15),
        "wall": m("wall", "#8fa3a8", "metal", 0.55),
        "roof": m("roof", "#5f6a6d", "metal", 0.6),
        "trim": m("trimLight", "#d0d3cd", "metal", 0.5),
        "timber": m("timber", "#b59a6f", "timber", 0.8),
        "pipe": m("pipe", "#9aa0a6", "metal", 0.45, 0.3),
        "sand": m("sand", "#c2b08a", "concrete", 0.95),
        "sign": m("warn", "#f0c23b", "metal", 0.5),
    }


def mixer(M):
    parts = []
    # Axle, wheels and the frame: two rails, a tow bar forward to the hitch
    # and a prop stand under it.
    for side in (-1, 1):
        parts.append(cyl("tyre", 0.26, 0.16, (side * 0.5, 0.26, 0), M["tyre"], verts=10, bev=0.0))
        parts.append(cyl("hub", 0.13, 0.18, (side * 0.5, 0.26, 0), M["frame"], verts=8))
        parts.append(box("rail", (0.08, 0.1, 1.3), (side * 0.3, 0.46, -0.05), M["frame"], bev=0.0))
        parts.append(box("guard", (0.2, 0.03, 0.62), (side * 0.5, 0.56, 0), M["orange"], bev=0.0))
    parts.append(cyl("axle", 0.04, 1.0, (0, 0.26, 0), M["dark"], verts=6))
    for z in (0.55, -0.62):
        parts.append(box("cross", (0.7, 0.08, 0.08), (0, 0.46, z), M["frame"], bev=0.0))
    parts.append(strut("towBar", (0, 0.46, 0.55), (0, 0.4, 1.12), (0.07, 0.07), M["frame"]))
    parts.append(cyl("hitch", 0.07, 0.04, (0, 0.4, 1.16), M["dark"], axis="y", verts=8))
    parts.append(box("stand", (0.05, 0.36, 0.05), (0, 0.2, 1.0), M["dark"], bev=0.0))
    # The engine box at the back, and the yoke the drum turns in.
    parts.append(box("engine", (0.52, 0.34, 0.4), (0, 0.68, -0.48), M["orange"], bev=0.03))
    for x in (-0.15, 0, 0.15):
        parts.append(box("vent", (0.1, 0.02, 0.3), (x, 0.855, -0.48), M["dark"], bev=0.0))
    for side in (-1, 1):
        parts.append(strut("yoke", (side * 0.3, 0.5, 0.2), (side * 0.66, 1.05, 0.08), (0.07, 0.07), M["frame"]))
        parts.append(strut("yokeB", (side * 0.3, 0.5, -0.3), (side * 0.66, 1.05, 0.08), (0.07, 0.07), M["frame"]))
        parts.append(box("trunnion", (0.08, 0.14, 0.14), (side * 0.66, 1.08, 0.08), M["dark"], bev=0.0))

    # The drum, tilted mouth-up towards +z: a lathed shell in frustums.
    tilt = 0.5
    centre = (0.0, 1.15, 0.0)
    u = (0.0, math.cos(tilt), math.sin(tilt))
    at = lambda t: tuple(centre[i] + u[i] * t for i in range(3))  # noqa: E731

    def ring(name, t0, t1, r0, r1, mat, verts=10):
        return cyl(name, r0, t1 - t0, at((t0 + t1) / 2), mat, verts=verts, radius2=r1, rot=(tilt, 0, 0))

    parts += [
        ring("drumBack", -0.78, -0.45, 0.36, 0.6, M["orange"]),
        ring("drumBelly", -0.45, 0.05, 0.6, 0.6, M["orange"]),
        ring("drumFront", 0.05, 0.6, 0.6, 0.33, M["orange"]),
        ring("mouth", 0.6, 0.7, 0.35, 0.35, M["dark"]),
        ring("gear", -0.24, -0.16, 0.64, 0.64, M["dark"]),
    ]
    # The hand wheel that tips it.
    parts.append(cyl("wheel", 0.2, 0.03, (-0.72, 1.08, 0.08), M["dark"], verts=10))
    parts.append(cyl("wheelHub", 0.05, 0.1, (-0.7, 1.08, 0.08), M["frame"], verts=6))
    return parts


def excavator(M):
    parts = []
    # Tracks: a rounded side profile each, pads across the top, rollers,
    # a sprocket at the back and an idler at the front.
    profile = [(-1.2, 0.13), (-1.08, 0.02), (1.08, 0.02), (1.2, 0.13), (1.2, 0.3), (1.08, 0.42), (-1.08, 0.42), (-1.2, 0.3)]
    for side in (-1, 1):
        x = side * 0.62
        parts.append(prism("track", profile, 0.42, M["track"], x=x, bev=0.02))
        for i in range(8):
            z = -0.98 + i * 0.28
            parts.append(box("pad", (0.44, 0.03, 0.09), (x, 0.43, z), M["dark"], bev=0.0))
        xo = side * 0.84
        for z in (-0.5, 0, 0.5):
            parts.append(cyl("roller", 0.1, 0.04, (xo, 0.16, z), M["metal"], verts=8))
        parts.append(cyl("sprocket", 0.17, 0.05, (xo, 0.24, -0.98), M["metal"], verts=10))
        parts.append(cyl("idler", 0.16, 0.05, (xo, 0.24, 0.98), M["metal"], verts=10))
    parts.append(box("frame", (0.84, 0.22, 1.5), (0, 0.42, 0), M["track"], bev=0.02))
    # A dozer blade across the front of the tracks.
    parts.append(box("blade", (1.66, 0.3, 0.08), (0, 0.24, 1.36), M["yellow"], bev=0.02))
    for side in (-1, 1):
        parts.append(strut("bladeArm", (side * 0.35, 0.3, 1.32), (side * 0.35, 0.42, 0.7), (0.08, 0.08), M["yellow"]))
    parts.append(cyl("turntable", 0.56, 0.1, (0, 0.58, 0), M["metal"], axis="y", verts=14))

    # The upper house: a rounded counterweight at the back, the engine cover
    # to the right, the cab to the left.
    parts.append(plan_prism("house", rounded_rect(-0.76, 0.76, -1.0, 0.9, (0.06, 0.06, 0.42, 0.42), 3), 0.63, 1.02, M["yellow"], bev=0.03))
    parts.append(plan_prism("weight", rounded_rect(-0.78, 0.78, -1.06, -0.55, (0, 0, 0.44, 0.44), 3), 0.62, 0.9, M["metal"], bev=0.02))
    parts.append(box("cover", (0.74, 0.3, 0.9), (0.36, 1.17, -0.48), M["yellow"], bev=0.04))
    for z in (-0.72, -0.6, -0.48, -0.36, -0.24):
        parts.append(box("louvre", (0.02, 0.16, 0.06), (0.735, 1.16, z), M["dark"], bev=0.0))
    parts.append(cyl("exhaust", 0.045, 0.4, (0.55, 1.5, -0.3), M["dark"], axis="y", verts=8))

    # The cab: a yellow shell round a glass core, windows cut through.
    x0, x1, z0, z1, y0, y1 = -0.74, 0.02, -0.4, 0.72, 1.0, 2.02
    parts.append(box("cabGlass", (x1 - x0 - 0.06, y1 - y0 - 0.06, z1 - z0 - 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), M["glass"], bev=0.0))
    shell = box("cab", (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), M["yellow"], bev=0.03)
    cutters = [
        box("front", (0.58, 0.7, 0.3), ((x0 + x1) / 2, 1.55, z1), M["glass"], bev=0.0),
        box("sideL", (0.3, 0.62, 0.86), (x0, 1.6, 0.18), M["glass"], bev=0.0),
        box("sideR", (0.3, 0.62, 0.5), (x1, 1.6, 0.34), M["glass"], bev=0.0),
        box("back", (0.52, 0.46, 0.3), ((x0 + x1) / 2, 1.66, z0), M["glass"], bev=0.0),
    ]
    for c in cutters:
        cut(shell, c)
    parts.append(shell)
    parts.append(box("cabRoof", (x1 - x0 + 0.06, 0.05, z1 - z0 + 0.1), ((x0 + x1) / 2, y1 + 0.02, (z0 + z1) / 2 + 0.03), M["metal"], bev=0.0))
    parts.append(box("rail", (0.03, 0.03, 0.9), (x0 - 0.04, 1.3, 0.15), M["dark"], bev=0.0))
    parts.append(box("light", (0.1, 0.08, 0.06), (x1 - 0.1, y1 + 0.08, z1 - 0.05), M["dark"], bev=0.0))

    # The arm, folded: boom up from beside the cab, dipper down to the
    # bucket resting on the ground, and the rams that hold them.
    ax = 0.4
    foot, knee, wrist = (ax, 1.02, 0.55), (ax, 2.25, 1.85), (ax, 0.8, 2.72)
    parts.append(box("boomFoot", (0.34, 0.26, 0.34), (ax, 0.98, 0.55), M["metal"], bev=0.03))
    parts.append(strut("boom", foot, knee, (0.24, 0.3), M["yellow"], bev=0.03))
    parts.append(strut("dipper", (ax, 2.36, 1.74), wrist, (0.2, 0.24), M["yellow"], bev=0.03))
    parts.append(cyl("pin", 0.07, 0.3, knee, M["metal"], verts=8))
    parts.append(strut("boomRam", (ax, 0.85, 0.85), (ax, 1.72, 1.36), (0.09, 0.09), M["chrome"]))
    parts.append(strut("boomRamBody", (ax, 0.85, 0.85), (ax, 1.3, 1.1), (0.13, 0.13), M["metal"]))
    parts.append(strut("dipRam", (ax, 1.9, 1.2), (ax, 2.4, 1.7), (0.08, 0.08), M["chrome"]))
    parts.append(strut("bucketRam", (ax, 2.0, 2.05), (ax, 1.0, 2.62), (0.08, 0.08), M["chrome"]))
    # The bucket: a scoop in side profile, teeth on its lip.
    scoop = [(2.62, 0.9), (2.9, 0.88), (3.05, 0.6), (3.02, 0.14), (2.82, 0.08), (2.62, 0.38)]
    parts.append(prism("bucket", scoop, 0.52, M["metal"], x=ax, bev=0.02))
    for i in range(4):
        parts.append(box("tooth", (0.06, 0.05, 0.1), (ax - 0.18 + i * 0.12, 0.1, 3.08), M["dark"], bev=0.0))
    return parts


def hut(M):
    parts = []
    w, d = 2.6, 1.8
    y0, y1 = 0.12, 1.62
    # Skids under it, the box, and the roof lid.
    for x in (-0.95, 0.95):
        parts.append(box("skid", (0.14, 0.12, d + 0.1), (x, 0.06, 0), M["dark"], bev=0.0))
    body = box("hut", (w, y1 - y0, d), (0, (y0 + y1) / 2, 0), M["wall"], bev=0.025, cell=0.7)
    # The door and window openings, recessed.
    cut(body, box("doorCut", (0.64, 1.14, 0.2), (0.7, y0 + 0.6, d / 2), M["roof"], bev=0.0))
    cut(body, box("winCut", (0.8, 0.58, 0.2), (-0.55, 1.05, d / 2), M["trim"], bev=0.0))
    cut(body, box("sideWin", (0.2, 0.46, 0.6), (-w / 2, 1.1, -0.1), M["trim"], bev=0.0))
    parts.append(body)
    parts.append(box("door", (0.6, 1.1, 0.04), (0.7, y0 + 0.58, d / 2 - 0.06), M["roof"], bev=0.01))
    parts.append(box("handle", (0.1, 0.03, 0.04), (0.9, y0 + 0.55, d / 2 - 0.03), M["trim"], bev=0.0))
    parts.append(box("pane", (0.76, 0.54, 0.03), (-0.55, 1.05, d / 2 - 0.07), M["glass"], bev=0.0))
    parts.append(box("sidePane", (0.03, 0.42, 0.56), (-w / 2 + 0.07, 1.1, -0.1), M["glass"], bev=0.0))
    for x in (-0.75, -0.55, -0.35):
        parts.append(box("bar", (0.025, 0.54, 0.025), (x, 1.05, d / 2 - 0.02), M["roof"], bev=0.0))
    parts.append(box("sill", (0.9, 0.04, 0.1), (-0.55, 0.74, d / 2 + 0.02), M["trim"], bev=0.0))
    # Steel corner posts and the corrugation: ribs down the flanks and back.
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2):
            parts.append(box("corner", (0.09, y1 - y0 + 0.02, 0.09), (x, (y0 + y1) / 2, z), M["roof"], bev=0.0))
    for i in range(9):
        parts.append(box("rib", (0.04, y1 - y0 - 0.2, 0.025), (-1.12 + i * 0.28, (y0 + y1) / 2, -d / 2 - 0.012), M["wall"], bev=0.0))
    for side in (-1, 1):
        for i in range(5):
            z = -0.62 + i * 0.31
            if side < 0 and -0.45 < z < 0.25:
                continue
            parts.append(box("rib", (0.025, y1 - y0 - 0.2, 0.04), (side * (w / 2 + 0.012), (y0 + y1) / 2, z), M["wall"], bev=0.0))
    parts.append(box("roof", (w + 0.2, 0.12, d + 0.2), (0, y1 + 0.06, 0), M["roof"], bev=0.03))
    # A step at the door and the site notice beside it.
    parts.append(box("step", (0.7, 0.14, 0.36), (0.7, 0.07, d / 2 + 0.2), M["metal"], bev=0.02))
    parts.append(box("notice", (0.36, 0.26, 0.02), (0.06, 1.2, d / 2 + 0.01), M["sign"], bev=0.0))
    parts.append(box("noticeBar", (0.26, 0.04, 0.01), (0.06, 1.24, d / 2 + 0.022), M["dark"], bev=0.0))
    return parts


def materials(M):
    parts = []
    # Bundled timber on bearers: two stacks, the upper one set back, each in
    # its courses with steel straps round it.
    for x in (-0.8, 0, 0.8):
        parts.append(box("bearer", (0.12, 0.1, 1.36), (x, 0.05, 0), M["dark"], bev=0.0))
    parts.append(box("stackA", (2.2, 0.58, 1.3), (0, 0.39, 0), M["timber"], bev=0.03, cell=0.8))
    for x in (-0.55, 0.55):
        parts.append(box("spacer", (0.08, 0.06, 1.2), (x, 0.71, 0.06), M["dark"], bev=0.0))
    parts.append(box("stackB", (1.9, 0.44, 1.1), (0, 0.96, 0.06), M["timber"], bev=0.03, cell=0.8))
    for y, h, z in ((0.39, 0.58, 0.66), (0.96, 0.44, 0.62)):
        for dy in (-h / 4, h / 4):
            parts.append(box("course", (2.0 if h > 0.5 else 1.72, 0.012, 0.012), (0, y + dy, z), M["dark"], bev=0.0))
    for x in (-0.6, 0.6):
        parts.append(box("strap", (0.04, 0.6, 1.32), (x, 0.39, 0), M["pipe"], bev=0.0))
        parts.append(box("strapB", (0.04, 0.46, 1.12), (x * 0.9, 0.96, 0.06), M["pipe"], bev=0.0))

    # The pipes: three on chocks and two on them, hollow ends dark.
    # Short enough to stay inside the hoarding the stock stands against.
    for x in (-1.85, -0.55):
        parts.append(box("chock", (0.14, 0.08, 1.0), (x, 0.04, -1.4), M["timber"], bev=0.0))
    for y, zs in ((0.3, (-1.8, -1.4, -1.0)), (0.64, (-1.6, -1.2))):
        for z in zs:
            parts.append(cyl("pipe", 0.2, 1.8, (-1.2, y, z), M["pipe"], verts=8))
            parts.append(cyl("bore", 0.14, 1.82, (-1.2, y, z), M["dark"], verts=8))

    # The sand pile, lumpy, with a shovel in it.
    parts.append(cyl("sand", 1.15, 1.0, (2.6, 0.5, -0.6), M["sand"], axis="y", verts=12, radius2=0.18))
    parts.append(cyl("sandB", 0.7, 0.55, (3.25, 0.27, -0.05), M["sand"], axis="y", verts=10, radius2=0.12))
    parts.append(strut("shaft", (2.55, 0.75, -0.2), (2.4, 1.55, 0.05), (0.04, 0.04), M["timber"]))
    parts.append(box("spade", (0.2, 0.26, 0.03), (2.58, 0.66, -0.22), M["metal"], bev=0.0, rot=(0.3, 0, 0.18)))
    return parts


def build():
    kit.reset()
    M = palette()
    objs = [
        finish(mixer(M), "Mixer"),
        finish(excavator(M), "Excavator"),
        finish(hut(M), "SiteHut"),
        finish(materials(M), "Materials"),
    ]
    bake_apart(objs)
    return objs


def preview(n):
    """0: all four in a row; 1: the mixer and the excavator; 2: the hut and
    the materials."""
    import bpy

    objs = build()
    keep = {0: objs, 1: objs[:2], 2: objs[2:]}[n]
    for obj in objs:
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    xs = {0: [0, 3.2, 7.6, 13.5], 1: [0, 3.0], 2: [0, 5.0]}[n]
    for obj, x in zip(keep, xs):
        obj.location.x = x
    return keep
