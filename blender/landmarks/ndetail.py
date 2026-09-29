"""
Architectural pieces the landmarks' near levels share, all written in a local
frame (`nkit.Acc.at`): +x across, +y up, +z outward from the wall they sit on.
Each takes the materials it needs as plain arguments, so every landmark
paints them with its own colour slots.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mathutils import Vector  # noqa: E402

import nkit  # noqa: E402

# ---------------------------------------------------------------- small solids


def frustum(acc, mat, sx, sy, depth, inset, pos=(0, 0, 0), skip_back=True):
    """A block whose front face is `inset` smaller all round than its back
    (which sits on z = 0): a rusticated stone, a panel, a keystone."""
    hx, hy = sx / 2, sy / 2
    fx, fy = max(0.001, hx - inset), max(0.001, hy - inset)
    verts = [(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0), (-fx, -fy, depth), (fx, -fy, depth), (fx, fy, depth), (-fx, fy, depth)]
    faces = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if not skip_back:
        faces.append((0, 3, 2, 1))
    with acc.at(pos):
        acc.add(mat, verts, faces, "convex")


def wedge(acc, mat, w, h, d, pos=(0, 0, 0)):
    """A bracket-shaped wedge: `w` across, `h` tall at the wall, sloping to a
    point at `d` out (corbels, sill brackets)."""
    acc.prism(mat, [(0, 0), (-d, 0), (0, h)], w, pos=pos, rot=(0, math.pi / 2, 0), skip_back=False)


# ---------------------------------------------------------------- windows

ARCHITRAVE = [(0.0, 0.0), (0.0, 0.05), (0.025, 0.05), (0.025, 0.075), (0.07, 0.075), (0.07, 0.05), (0.105, 0.035), (0.105, 0.0)]
PLAIN_SURROUND = [(0.0, 0.0), (0.0, 0.05), (0.09, 0.05), (0.09, 0.0)]


def window(acc, w, h, wall, mats, glass_front=0.03, style="civic", bars=None, sill=True, lintel=True, surround=None):
    """One window, its glass centred on the local origin and its outer face
    `glass_front` proud of it; `wall` is how far out the wall face is. `mats`
    needs `frame` (the sash), `trim` (surround, sill and lintel). `style`:

      civic   an architrave, a keystoned lintel, a corbelled sill
      plain   a flat surround and a sill
      steel   a thin steel frame, no surround (sheds and stations)
    """
    frame, trim = mats["frame"], mats["trim"]
    gf = glass_front
    nx, ny = bars if bars else (max(1, round(w / 0.5)), max(1, round(h / 0.55)))
    # The sash: a frame round the glass, a meeting rail, and the bars.
    t = 0.05 if style != "steel" else 0.04
    for sx in (-1, 1):
        acc.box(frame, (t, h, 0.04), (sx * (w / 2 - t / 2), 0, gf + 0.025), skip=("nz",))
    for sy in (-1, 1):
        acc.box(frame, (w - 2 * t, t, 0.04), (0, sy * (h / 2 - t / 2), gf + 0.025), skip=("nz",))
    bw = 0.028
    for i in range(1, nx):
        x = -w / 2 + t + (w - 2 * t) * i / nx
        acc.box(frame, (bw, h - 2 * t, 0.03), (x, 0, gf + 0.02), skip=("nz",))
    for j in range(1, ny):
        y = -h / 2 + t + (h - 2 * t) * j / ny
        acc.box(frame, (w - 2 * t, bw, 0.03), (0, y, gf + 0.02), skip=("nz",))
    if style == "steel":
        return
    out = max(wall, gf)
    prof = surround or (ARCHITRAVE if style == "civic" else PLAIN_SURROUND)
    # The surround stands on the wall face; the profile runs outward from
    # the opening's edge.
    acc.rect_frame(trim, -w / 2, w / 2, -h / 2, h / 2, prof, z=out)
    if sill:
        sd = 0.13
        # The sill under the surround's foot, with a drip under it.
        acc.box(trim, (w + 0.34, 0.06, sd + 0.02), (0, -h / 2 - 0.135, out + sd / 2), skip=("nz",))
        acc.box(trim, (w + 0.22, 0.04, sd - 0.06), (0, -h / 2 - 0.185, out + (sd - 0.06) / 2), skip=("nz",))
        if style == "civic":
            for sx in (-1, 1):
                wedge(acc, trim, 0.09, 0.14, 0.11, pos=(sx * (w / 2 + 0.05), -h / 2 - 0.2, out))
    if lintel:
        ly = h / 2 + 0.105
        if style == "civic":
            acc.box(trim, (w + 0.34, 0.12, 0.13), (0, ly + 0.05, out + 0.05), skip=("nz",))
            frustum(acc, trim, 0.2, 0.3, 0.06, 0.03, pos=(0, ly + 0.09, out + 0.1))
            acc.box(trim, (w + 0.42, 0.05, 0.16), (0, ly + 0.145, out + 0.06), skip=("nz",))
        else:
            acc.box(trim, (w + 0.3, 0.08, 0.1), (0, ly + 0.03, out + 0.03), skip=("nz",))


# ---------------------------------------------------------------- roofs


def slates(acc, slope, mat, width=0.3, exposure=0.19, thick=0.014, gap=0.006, shift=0.5):
    """Individual slates over one lean roof face (`nkit.slopes` entry): rows
    from the eave up, each course shifted half a slate, every slate tilted
    a touch so its tail stands off the one below."""
    pts = slope["points"]
    us = [p[0] for p in pts]
    vs = [p[1] for p in pts]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    row = 0
    length = exposure + 0.07
    with acc.basis(slope["origin"], slope["along"], slope["up"], slope["out"]):
        v = v0 + exposure * 0.5
        while v < v1 - 0.02:
            offset = (row % 2) * width * shift
            # The course's slate edges on a grid shifted half a slate each row,
            # clipped to the face so nothing hangs past a gable or the ridge.
            lo = v - length / 2 + 0.02
            hi = min(lo + length, v1)
            k = -1
            while True:
                a = u0 - offset + k * width
                b = a + width
                k += 1
                if b < u0 + 0.05:
                    continue
                if a > u1 - 0.05:
                    break
                a, b = max(a, u0), min(b, u1)
                if b - a < 0.06:
                    continue
                if not all(nkit.inside(pts, x, v) for x in (a + 0.01, (a + b) / 2, b - 0.01)):
                    continue
                acc.box(mat, (b - a - gap, hi - lo, thick), ((a + b) / 2, (lo + hi) / 2, thick / 2 + 0.006 + row % 3 * 0.001), rot=(-0.055, 0, 0), skip=("nz", "py"))
            v += exposure
            row += 1


# ---------------------------------------------------------------- balusters, columns


def baluster(acc, mat, pos, height, r, sides=6):
    """A turned baluster standing on `pos` (its foot): a foot, a swelling
    body, a neck and a cap, as one lathe."""
    k = height
    prof = [
        (0.0, 0.0), (r * 0.9, 0.0), (r * 0.9, 0.08 * k), (r * 0.5, 0.12 * k), (r * 0.42, 0.2 * k),
        (r * 1.0, 0.36 * k), (r * 1.05, 0.5 * k), (r * 0.7, 0.66 * k), (r * 0.42, 0.74 * k), (r * 0.5, 0.82 * k),
        (r * 0.85, 0.88 * k), (r * 0.85, 1.0 * k), (0.0, 1.0 * k),
    ]
    acc.lathe(mat, prof, sides=sides, pos=pos, closed=False)


def fluted_column(acc, mat, r0, r1, y0, y1, ribs=16, sides=3):
    """Reeding up a column shaft: `ribs` half-round strips over its taper,
    each a slim prism, so the shaft reads as fluted in the light."""
    for i in range(ribs):
        a = math.tau * i / ribs
        c, s = math.cos(a), math.sin(a)
        acc.rod(mat, (c * r0 * 0.985, y0, s * r0 * 0.985), (c * r1 * 0.985, y1, s * r1 * 0.985), 0.028 * (r0 / 0.3), sides=sides, caps=False)


def dentils(acc, mat, path, y, size=(0.09, 0.1, 0.09), pitch=0.2):
    """A row of dentils along a closed plan path [(x, z), ...] (wall side
    inward, mitred by the simple rule of stepping along each edge), at
    height y, `size` (across, tall, deep). They stand on the path's line."""
    n = len(path)
    area = sum(path[i][0] * path[(i + 1) % n][1] - path[(i + 1) % n][0] * path[i][1] for i in range(n))
    for i in range(n):
        a, b = path[i], path[(i + 1) % n]
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        # Outward normal for a counter-clockwise path (x right, z toward the viewer).
        nx, nz = (dz / length, -dx / length) if area > 0 else (-dz / length, dx / length)
        yaw = math.atan2(nx, nz)
        count = max(1, int((length - size[0]) / pitch))
        for k in range(count + 1):
            t = (size[0] * 0.5 + (length - size[0]) * k / count) / length
            x, z = a[0] + dx * t, a[1] + dz * t
            with acc.at((x, y, z), yaw):
                acc.box(mat, size, (0, 0, size[2] / 2), skip=("nz",))


# ---------------------------------------------------------------- clocks and letters

_ROMAN = ["I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


def _strokes(text, h, thick):
    """Roman numeral strokes as ((x0, y0), (x1, y1)) in a box `h` tall, the
    string centred on the origin."""
    widths = {"I": thick * 1.4, "V": h * 0.62, "X": h * 0.62}
    gap = thick * 0.9
    total = sum(widths[c] for c in text) + gap * (len(text) - 1)
    x = -total / 2
    out = []
    for c in text:
        w = widths[c]
        cx = x + w / 2
        if c == "I":
            out.append(((cx, -h / 2), (cx, h / 2)))
        elif c == "V":
            out.append(((cx - w / 2, h / 2), (cx, -h / 2)))
            out.append(((cx + w / 2, h / 2), (cx, -h / 2)))
        else:
            out.append(((cx - w / 2, h / 2), (cx + w / 2, -h / 2)))
            out.append(((cx - w / 2, -h / 2), (cx + w / 2, h / 2)))
        x += w + gap
    return out


def clock(acc, r, mats, pos=(0, 0, 0), yaw=0.0, minutes=60, hour=10, minute=10):
    """A clock face on a wall, its centre at `pos` facing local +z: a moulded
    bezel, a dial, twelve roman numerals, a minute track, two spade-and-needle
    hands and a boss. `mats`: rim, dial, ink (numerals, ticks, hands)."""
    rim, dial, ink = mats["rim"], mats["dial"], mats["ink"]
    with acc.at(pos, yaw):
        acc.cyl(rim, r * 1.16, 0.05, (0, 0, 0.025), axis="z", sides=32)
        acc.cyl(rim, r * 1.08, 0.04, (0, 0, 0.065), axis="z", sides=32)
        acc.cyl(dial, r * 1.0, 0.03, (0, 0, 0.085), axis="z", sides=32)
        z = 0.125
        for i in range(12):
            ang = math.tau * i / 12
            dx, dy = math.sin(ang), math.cos(ang)
            cx, cy = dx * r * 0.78, dy * r * 0.78
            h, t = r * 0.2, r * 0.032
            # Numerals stand upright on their radius: turned to it, feet to the centre.
            for (x0, y0), (x1, y1) in _strokes(_ROMAN[(i - 1) % 12], h, t):
                # rotate glyph space by -ang so its up is away from the centre
                def rot(px, py):
                    return (cx + px * math.cos(ang) + py * math.sin(ang), cy - px * math.sin(ang) + py * math.cos(ang))

                a, b = rot(x0, y0), rot(x1, y1)
                acc.bar(ink, (a[0], a[1], z), (b[0], b[1], z), t, 0.012, skip=("nz",))
        for i in range(minutes):
            if i % 5 == 0:
                continue
            ang = math.tau * i / minutes
            dx, dy = math.sin(ang), math.cos(ang)
            a = (dx * r * 0.9, dy * r * 0.9, z)
            b = (dx * r * 0.96, dy * r * 0.96, z)
            acc.bar(ink, a, b, r * 0.012, 0.01, skip=("nz",))
        # Hands: a spade hour hand and a needle minute hand, one plane apart.
        ha = math.tau * ((hour % 12) + minute / 60) / 12
        ma = math.tau * minute / 60

        def hand(angle, length, width, zz, spade):
            dx, dy = math.sin(angle), math.cos(angle)
            px, py = dy, -dx
            tail = (-dx * length * 0.18, -dy * length * 0.18)
            tip = (dx * length, dy * length)
            body = [
                (tail[0] + px * width * 0.4, tail[1] + py * width * 0.4),
                (dx * length * (0.35 if spade else 0.2) + px * width * (1.0 if spade else 0.5), dy * length * (0.35 if spade else 0.2) + py * width * (1.0 if spade else 0.5)),
                tip,
                (dx * length * (0.35 if spade else 0.2) - px * width * (1.0 if spade else 0.5), dy * length * (0.35 if spade else 0.2) - py * width * (1.0 if spade else 0.5)),
                (tail[0] - px * width * 0.4, tail[1] - py * width * 0.4),
            ]
            acc.prism(ink, body, 0.012, pos=(0, 0, zz), skip_back=True)

        hand(ha, r * 0.5, r * 0.07, 0.15, True)
        hand(ma, r * 0.76, r * 0.035, 0.172, False)
        acc.cyl(ink, r * 0.06, 0.03, (0, 0, 0.2), axis="z", sides=10)


_FONT = {
    "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"],
    "D": ["110", "101", "101", "101", "110"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
    "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"],
    "L": ["100", "100", "100", "100", "111"], "M": ["10001", "11011", "10101", "10001", "10001"], "N": ["101", "111", "111", "111", "101"],
    "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"], "R": ["110", "101", "110", "101", "101"],
    "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"], "U": ["101", "101", "101", "101", "111"],
    "V": ["101", "101", "101", "101", "010"], "W": ["10001", "10001", "10101", "11011", "10001"], "Y": ["101", "101", "010", "010", "010"],
    "K": ["101", "101", "110", "101", "101"], "1": ["010", "110", "010", "010", "111"], "2": ["110", "001", "010", "100", "111"],
    "3": ["110", "001", "010", "001", "110"], " ": ["0", "0", "0", "0", "0"],
}


def letters(acc, mat, text, height, pos=(0, 0, 0), depth=0.03, spacing=0.4):
    """Block capitals on a 3 x 5 grid (5 wide for M and W) standing `depth`
    proud of the wall, the string centred on `pos`, facing local +z. Runs of
    pixels along a row are one bar."""
    unit = height / 5
    widths = [len(_FONT[c][0]) for c in text]
    total = sum(w * unit for w in widths) + spacing * unit * (len(text) - 1)
    x = -total / 2
    for c, gw in zip(text, widths):
        rows = _FONT[c]
        for ry, row in enumerate(rows):
            run = None
            for cx in range(gw + 1):
                on = cx < gw and row[cx] == "1"
                if on and run is None:
                    run = cx
                if not on and run is not None:
                    x0 = x + run * unit
                    x1 = x + cx * unit
                    y = height / 2 - (ry + 0.5) * unit
                    acc.box(mat, (x1 - x0, unit, depth), (pos[0] + (x0 + x1) / 2, pos[1] + y, pos[2] + depth / 2), skip=("nz",))
                    run = None
        x += (gw + spacing) * unit


# ---------------------------------------------------------------- street furniture


def lamp_standard(acc, mats, pos, height=3.0, yaw=0.0):
    """A cast-iron lamp standard: a moulded base, a fluted post with collars,
    a curled bracket and a glazed lantern with cage bars and a finialled
    hat. `mats`: iron, glass."""
    iron, glass = mats["iron"], mats["glass"]
    x, y, z = pos
    with acc.at((x, y, z), yaw):
        acc.lathe(iron, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.06), (0.15, 0.1), (0.15, 0.18), (0.11, 0.24), (0.11, 0.5), (0.0, 0.5)], sides=8, closed=False)
        acc.cyl(iron, 0.06, height - 0.55, (0, 0.5 + (height - 0.55) / 2, 0), sides=8, r2=0.045)
        for yy in (0.62, height * 0.45, height - 0.42):
            acc.cyl(iron, 0.085, 0.05, (0, yy, 0), sides=8)
        for a in (0.0, math.pi / 2, math.pi, math.pi * 1.5):
            c, s = math.cos(a), math.sin(a)
            acc.rod(iron, (c * 0.1, 0.6, s * 0.1), (c * 0.06, 0.95, s * 0.06), 0.012, sides=4)
        top = height
        acc.cyl(iron, 0.14, 0.05, (0, top - 0.25, 0), sides=8, r2=0.1)
        acc.box(glass, (0.24, 0.3, 0.24), (0, top - 0.06, 0), skip=("ny",))
        for sx in (-1, 1):
            for sz in (-1, 1):
                acc.box(iron, (0.024, 0.32, 0.024), (sx * 0.125, top - 0.06, sz * 0.125))
        acc.cyl(iron, 0.22, 0.12, (0, top + 0.15, 0), sides=4, r2=0.04, phase=math.pi / 4)
        acc.cyl(iron, 0.02, 0.24, (0, top + 0.32, 0), sides=5)
        acc.sphere(iron, 0.045, (0, top + 0.46, 0), sides=6, rings=4)


def bench(acc, mats, pos, yaw=0.0, length=1.8, slats=5):
    """A slatted park bench with cast ends and armrests, facing local +z."""
    wood, iron = mats["wood"], mats["iron"]
    with acc.at(pos, yaw):
        for k in range(slats):
            acc.box(wood, (length, 0.04, 0.075), (0, 0.44, -0.16 + k * 0.085), skip=("ny",))
        for k in range(3):
            acc.box(wood, (length, 0.075, 0.03), (0, 0.66 + k * 0.1, -0.24 - k * 0.03), rot=(0.18, 0, 0), skip=("nz",))
        for sx in (-1, 1):
            x = sx * (length / 2 - 0.08)
            acc.box(iron, (0.05, 0.44, 0.05), (x, 0.22, 0.18))
            acc.box(iron, (0.05, 0.44, 0.05), (x, 0.22, -0.22))
            acc.box(iron, (0.05, 0.05, 0.46), (x, 0.44, -0.02))
            acc.bar(iron, (x, 0.44, -0.2), (x, 0.9, -0.3), 0.045)
            acc.box(iron, (0.05, 0.04, 0.46), (x, 0.62, 0.0))
            acc.bar(iron, (x, 0.46, 0.17), (x, 0.66, 0.17), 0.035)


def chain(acc, mat, a, b, sag=0.09, links=14, size=0.05):
    """Chain links hung between two points: alternate links stand in the
    plane of the run and across it."""
    a, b = Vector(a), Vector(b)
    for i in range(links):
        t0, t1 = i / links, (i + 1) / links
        p0 = a + (b - a) * t0
        p1 = a + (b - a) * t1
        p0.y -= sag * 4 * t0 * (1 - t0)
        p1.y -= sag * 4 * t1 * (1 - t1)
        mid = (p0 + p1) / 2
        d = p1 - p0
        length = d.length
        if i % 2 == 0:
            acc.bar(mat, mid - d / 2 * 0.92, mid + d / 2 * 0.92, size * 0.5, size)
        else:
            acc.bar(mat, mid - d / 2 * 0.92, mid + d / 2 * 0.92, size, size * 0.5)


def paving(acc, mat, x0, x1, z0, z1, y, size=0.75, gap=0.012, thick=0.02, keep=None):
    """Loose slabs over a plan rectangle, each a hair proud with a joint
    round it, courses staggered."""
    nx = max(1, round((x1 - x0) / size))
    nz = max(1, round((z1 - z0) / size))
    sx, sz = (x1 - x0) / nx, (z1 - z0) / nz
    for j in range(nz):
        for i in range(nx):
            shift = (sx * 0.5) if j % 2 else 0.0
            cx = x0 + (i + 0.5) * sx + shift
            w = sx - gap
            if cx + w / 2 > x1 + 1e-6:
                w = (x1 - (cx - w / 2)) - gap / 2
                if w < 0.1:
                    continue
                cx = x1 - w / 2 - gap / 2
            if cx - w / 2 < x0 - 1e-6:
                w = (cx + w / 2 - x0) - gap / 2
                if w < 0.1:
                    continue
                cx = x0 + w / 2 + gap / 2
            cz = z0 + (j + 0.5) * sz
            if keep and not all(keep(cx + a * (w / 2 + 0.06), cz + b * (sz / 2 + 0.06)) for a in (-1, 0, 1) for b in (-1, 0, 1)):
                continue
            acc.box(mat, (w, thick, sz - gap), (cx, y + thick / 2, cz), skip=("ny",))


def pebbles(acc, mat, x0, x1, z0, z1, y, count, size=0.07, seed=1, keep=None):
    """A scatter of small stones (octahedra) over a plan rectangle, for
    gravel, ballast and beds. `keep(x, z)` can veto a spot."""
    rng = random.Random(seed)
    made = 0
    tries = 0
    while made < count and tries < count * 4:
        tries += 1
        x, z = rng.uniform(x0, x1), rng.uniform(z0, z1)
        if keep and not keep(x, z):
            continue
        s = size * rng.uniform(0.6, 1.3)
        a = rng.uniform(0, math.tau)
        with acc.at((x, y + s * 0.25, z), a):
            verts = [(s, 0, 0), (-s, 0, 0), (0, s * 0.55, 0), (0, -s * 0.2, 0), (0, 0, s * 0.8), (0, 0, -s * 0.8)]
            faces = [(0, 2, 4), (4, 2, 1), (1, 2, 5), (5, 2, 0)]
            acc.add(mat, verts, faces, "none")
        made += 1


# ---------------------------------------------------------------- planting, pipes, gutters


def leaf(acc, mat, pos, size, turn):
    """One leaf: a flat diamond with a thickness, a closed solid."""
    with acc.at(pos, turn):
        s = size
        verts = [(-s, 0, 0), (s, 0, 0), (0, 0, -s * 0.55), (0, 0, s * 0.55), (0, s * 0.16, 0), (0, -s * 0.12, 0)]
        faces = [(4, 0, 2), (4, 2, 1), (4, 1, 3), (4, 3, 0), (5, 2, 0), (5, 1, 2), (5, 3, 1), (5, 0, 3)]
        acc.add(mat, verts, faces, "convex")


def foliage(acc, mat, centre, radius, count, size=0.09, seed=3, squash=0.8, dark=None):
    """A clump of leaves over a shrub: `count` leaves on a shell about
    `centre`, scattered by a fixed seed. `dark` alternates a second material."""
    rng = random.Random(seed)
    for i in range(count):
        u = rng.uniform(-1, 1)
        a = rng.uniform(0, math.tau)
        r = radius * rng.uniform(0.82, 1.02)
        rr = math.sqrt(1 - u * u)
        p = (centre[0] + math.cos(a) * rr * r, centre[1] + u * r * squash, centre[2] + math.sin(a) * rr * r)
        m = dark if (dark and i % 3 == 0) else mat
        leaf(acc, m, p, size * rng.uniform(0.75, 1.25), rng.uniform(0, math.tau))


def downpipe(acc, mat, x, z, y0, y1, yaw=0.0, r=0.04, hopper=True):
    """A round downpipe standing on (x, z): brackets every metre, a hopper
    head and a shoe. `yaw` turns local +z to the side away from the wall."""
    with acc.at((x, 0, z), yaw):
        acc.cyl(mat, r, y1 - y0, (0, (y0 + y1) / 2, 0), sides=8)
        k = y0 + 0.5
        while k < y1 - 0.2:
            acc.box(mat, (r * 2.6, 0.04, r * 2.6), (0, k, -r * 0.3))
            acc.box(mat, (0.03, 0.03, r * 1.6), (0, k, -r * 1.4))
            k += 1.1
        if hopper:
            acc.box(mat, (r * 4.6, 0.16, r * 4.0), (0, y1 - 0.05, 0), taper=(1.3, 1.3))
        acc.cyl(mat, r * 1.15, 0.05, (0, y0 + 0.14, 0), sides=8)
        acc.rod(mat, (0, y0 + 0.1, 0), (0, y0 + 0.03, r * 3.2), r * 0.95, sides=8)


def gutter(acc, mat, a, b, y, half=0.07):
    """A half-round gutter from local (x, z) `a` to `b`, its rim at height y,
    a bracket every 0.8 m."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    if length < 0.1:
        return
    d = (dx / length, 0.0, dz / length)
    across = (d[2], 0.0, -d[0])
    outline = []
    steps = 6
    for i in range(steps + 1):
        t = math.pi * i / steps
        outline.append((-math.cos(t) * half, y - math.sin(t) * half))
    thin = [(u * 0.86, y + (v - y) * 0.86 - 0.008) for u, v in reversed(outline)]
    mid = ((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2)
    with acc.basis(mid, across, (0, 1, 0), d):
        acc.prism(mat, [(u, v - y) for u, v in outline] + [(u, v - y) for u, v in thin], length)
    n = max(1, int(length / 0.8))
    for k in range(n + 1):
        t = k / n
        p = (a[0] + dx * t, y, a[1] + dz * t)
        with acc.basis(p, across, (0, 1, 0), d):
            acc.box(mat, (half * 2.3, 0.02, 0.025), (0, -half * 0.55, 0))


def louvre_panel(acc, mat, w, h, slat=0.09, tilt=0.5, depth=0.06):
    """A louvred vent: angled slats across a `w` by `h` opening centred on the
    origin, facing +z."""
    n = max(2, int(h / slat))
    for i in range(n):
        y = -h / 2 + (i + 0.5) * h / n
        acc.box(mat, (w, slat * 0.7, 0.012), (0, y, depth / 2), rot=(-tilt, 0, 0))
    acc.box(mat, (0.03, h, depth), (-w / 2 + 0.015, 0, depth / 2))
    acc.box(mat, (0.03, h, depth), (w / 2 - 0.015, 0, depth / 2))
    acc.box(mat, (w, 0.03, depth), (0, h / 2 - 0.015, depth / 2))
    acc.box(mat, (w, 0.03, depth), (0, -h / 2 + 0.015, depth / 2))


def guardrail(acc, mat, points, y, height=1.1, post_every=1.4, rails=3, kick=0.1, closed=False, gaps=()):
    """An industrial guard rail along local (x, z) points: posts, `rails`
    horizontal tubes, a kick plate. `gaps` are (a, b) index pairs of segments
    to leave open."""
    segs = list(zip(points, points[1:]))
    if closed:
        segs.append((points[-1], points[0]))
    for k, (a, b) in enumerate(segs):
        if k in gaps:
            continue
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        if length < 0.05:
            continue
        m = max(1, round(length / post_every))
        for i in range(m + 1):
            t = i / m
            acc.box(mat, (0.05, height, 0.05), (a[0] + dx * t, y + height / 2, a[1] + dz * t))
        for r in range(rails):
            yy = y + height * (1 - r * 0.4 / max(1, rails - 1)) if rails > 1 else y + height
            acc.bar(mat, (a[0], yy, a[1]), (b[0], yy, b[1]), 0.035, 0.035)
        acc.bar(mat, (a[0], y + kick / 2, a[1]), (b[0], y + kick / 2, b[1]), 0.012, kick)


def ring_band(acc, mat, profile_fn, y0, y1, sides=16, pos=(0, 0, 0), lift=0.03):
    """A thin band round a surface of revolution at height y0..y1: `profile_fn(y)`
    is the shell's radius there."""
    r0, r1 = profile_fn(y0), profile_fn(y1)
    acc.lathe(mat, [(r0 + lift * 0.3, y0), (r0 + lift, y0 + 0.01), (r1 + lift, y1 - 0.01), (r1 + lift * 0.3, y1)], sides=sides, pos=pos)


# ---------------------------------------------------------------- grass, seams, lancets


def grass(acc, mat, x0, x1, z0, z1, y, count, seed=1, keep=None, height=0.11):
    """Tufts of grass: three tapering blades each, leaning a little, over a
    plan rectangle. `keep(x, z)` vetoes a spot."""
    rng = random.Random(seed)
    made = 0
    tries = 0
    while made < count and tries < count * 4:
        tries += 1
        x, z = rng.uniform(x0, x1), rng.uniform(z0, z1)
        if keep and not keep(x, z):
            continue
        for _ in range(3):
            h = height * rng.uniform(0.6, 1.3)
            bx, bz = x + rng.uniform(-0.03, 0.03), z + rng.uniform(-0.03, 0.03)
            acc.cyl(mat, 0.009, h, (bx, y + h / 2, bz), sides=3, r2=0.002, caps=False, rot=(rng.uniform(-0.45, 0.45), 0, rng.uniform(-0.45, 0.45)))
        made += 1


def seams(acc, slope, mat, pitch=0.25, w=0.03, h=0.035):
    """Standing seams or corrugations running up a rectangular roof face
    (`nkit.slopes` entry), every `pitch` across."""
    pts = slope["points"]
    u0, u1 = min(p[0] for p in pts), max(p[0] for p in pts)
    v0, v1 = min(p[1] for p in pts), max(p[1] for p in pts)
    with acc.basis(slope["origin"], slope["along"], slope["up"], slope["out"]):
        u = u0 + pitch * 0.5
        while u < u1:
            acc.box(mat, (w, v1 - v0, h), (u, (v0 + v1) / 2, h / 2), skip=("nz",))
            u += pitch


def lancet_points(w, spring, steps=5):
    """The pointed outline as one loop, counter-clockwise from the bottom left."""
    hw = w / 2
    pts = [(-hw, 0.0), (hw, 0.0), (hw, spring)]
    # Right arc, centre (-hw, spring) radius w, from angle 0 up to 60 degrees.
    for i in range(1, steps + 1):
        a = (math.pi / 3) * i / steps
        pts.append((-hw + w * math.cos(a), spring + w * math.sin(a)))
    # Left arc, centre (hw, spring), from 120 degrees round to 180.
    for i in range(1, steps):
        a = math.pi / 3 * 2 + (math.pi / 3) * i / steps
        pts.append((hw + w * math.cos(a), spring + w * math.sin(a)))
    pts.append((-hw, spring))
    return pts


def lancet(acc, w, spring, wall, mats, bars=True, glass_front=0.03):
    """A lancet window on its bottom-centre origin, +z out: a moulded stone
    surround swept round the pointed outline, a mullion, a saddle bar, and
    leaded diamonds across the straight part. `wall` is how far out the wall
    face stands from the glass. `mats`: frame (the leading), trim (stone)."""
    trim, frame = mats["trim"], mats["frame"]
    loop = lancet_points(w, spring)
    prof = [(0.0, 0.0), (0.0, 0.05), (0.03, 0.05), (0.03, 0.075), (0.09, 0.075), (0.09, 0.03), (0.12, 0.03), (0.12, 0.0)]
    acc.sweep(trim, loop, prof, plane="xy", at=wall)
    hw = w / 2
    gf = glass_front
    acc.box(frame, (0.035, spring, 0.03), (0, spring / 2, gf + 0.005), skip=("nz",))
    acc.box(frame, (w, 0.035, 0.03), (0, spring * 0.62, gf + 0.005), skip=("nz",))
    apex = spring + w * math.sin(math.pi / 3)
    acc.box(frame, (0.035, apex - spring - 0.05, 0.03), (0, spring + (apex - spring) / 2 - 0.02, gf + 0.005), skip=("nz",))
    if not bars:
        return
    # Leaded diamonds across the straight part of the lights.
    step = 0.17
    for sign in (1, -1):
        c = -spring - hw * 2
        while c < spring + hw * 2:
            # The line u = sign * (v - c), clipped to the rectangle [-hw, hw] x [0, spring].
            lo, hi = 0.0, spring
            v_at = lambda u: c + sign * u  # noqa: E731
            a, b = v_at(-hw), v_at(hw)
            if max(a, b) > 0 and min(a, b) < spring:
                pa, pb = [-hw, a], [hw, b]
                for p, q in ((pa, pb), (pb, pa)):
                    if p[1] < lo:
                        t = (lo - p[1]) / (q[1] - p[1])
                        p[0] += (q[0] - p[0]) * t
                        p[1] = lo
                    if p[1] > hi:
                        t = (hi - p[1]) / (q[1] - p[1])
                        p[0] += (q[0] - p[0]) * t
                        p[1] = hi
                if abs(pa[0] - pb[0]) > 0.05:
                    acc.bar(frame, (pa[0], pa[1], gf), (pb[0], pb[1], gf), 0.014, 0.02)
            c += step
    # A small rose in the head.
    r = 0.09
    cy = spring + w * 0.5
    for k in range(8):
        a0 = math.tau * k / 8
        a1 = math.tau * (k + 1) / 8
        acc.bar(frame, (math.cos(a0) * r, cy + math.sin(a0) * r, gf), (math.cos(a1) * r, cy + math.sin(a1) * r, gf), 0.02, 0.02)
        acc.bar(frame, (0, cy, gf), (math.cos(a0) * r, cy + math.sin(a0) * r, gf), 0.012, 0.016)
