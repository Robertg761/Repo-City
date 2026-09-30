"""
The thirteen model-surface layers, modelled at the scale the shader tiles them
(metres; see SURFACE_SAMPLE in components/city/textures/model-detail.ts).

Each layer function returns (tile, options). Heights are metres above the
tile's floor and `hmax` is the shader's bump range for that layer, so the
relief channel carries real proportions: a brick's mortar joint is recessed by
the amount it would be on a wall.
"""

import math

import numpy as np

from lib import (
    Tile, cells, chamfer, dome, hash01, pnoise, random_walk, rounded, rrect, sstep, wrap_delta, wrapped_polyline,
)

LAYERS = {}


def layer(fn):
    LAYERS[fn.__name__] = fn
    return fn


def partition(rng, total, lo, hi):
    """Random widths in [lo, hi] that add up to `total` exactly."""
    n = max(1, int(round(total / ((lo + hi) / 2))))
    w = rng.uniform(lo, hi, n)
    return w * (total / w.sum())


# ---------------------------------------------------------------------------
# Plaster: sand-float grain, faint float arcs, sand grain, pinholes, hairline cracks, flaked patches
# ---------------------------------------------------------------------------

@layer
def plaster():
    W = 2.0
    t = Tile("plaster", W, W, 0.012, seed=21, ao_distance=0.02)
    rng = t.rng
    z0 = 0.0045
    cracks = [random_walk(rng, rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0, 6.28), rng.uniform(0.5, 1.1), 0.03, 0.30) for _ in range(4)]
    flakes = [(rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0.07, 0.15)) for _ in range(3)]

    def base(X, Y):
        broad = pnoise(X, Y, W, W, 301, octaves=3, f0=3)
        grain = pnoise(X, Y, W, W, 302, octaves=2, f0=320, gain=0.9)
        mid = pnoise(X, Y, W, W, 303, octaves=2, f0=40, gain=0.7)
        # Faint horizontal float arcs: small, low, no edges.
        float_a = pnoise(X, Y, W, W, 304, octaves=2, f0=8, gain=0.5, stretch=(0.4, 1.6))
        float_b = pnoise(X, Y, W, W, 305, octaves=2, f0=14, gain=0.5, stretch=(0.35, 1.5))
        arcs = 0.65 * float_a + 0.35 * float_b
        z = z0 + 0.0004 * broad + 0.00045 * grain + 0.00025 * mid + 0.00018 * arcs
        tone = 0.965 + 0.006 * broad + 0.008 * grain + 0.0035 * arcs
        rough = np.full(X.shape, 0.90, np.float32) + 0.03 * grain
        # Pinholes: shallow bubbles that burst in the render.
        lx, ly, r, (sx, sy) = cells(X, Y, 0.045, W, W, 33)
        has = r(0) < 0.32
        ox = (r(1) - 0.5) * sx * 0.5
        oy = (r(2) - 0.5) * sy * 0.5
        rad = 0.0018 + 0.0035 * r(3)
        d2 = ((lx - ox) ** 2 + (ly - oy) ** 2) / rad ** 2
        hole = np.where(has, dome(d2, 0.8), 0.0)
        z = z - 0.0022 * hole
        tone = tone - 0.03 * hole
        # Flaked patches show the darker coat underneath.
        for fx, fy, fr in flakes:
            for i in (-1, 0, 1):
                for j in (-1, 0, 1):
                    dx, dy = X - (fx + i * W), Y - (fy + j * W)
                    rr = np.hypot(dx, dy)
                    if rr.min() > fr * 2.2:
                        continue
                    mask = sstep(0.0, 0.03, fr * (1 + 0.45 * broad + 0.3 * mid) - rr)
                    z = z - 0.0034 * mask
                    tone = tone - 0.04 * mask
                    rough = rough + 0.05 * mask
        for pts in cracks:
            dist = wrapped_polyline(X, Y, pts, W, W, 0.01)
            v = 1 - sstep(0.0004, 0.0032, dist)
            z = z - 0.0016 * v
            tone = tone - 0.05 * v
        return z, tone, rough, 0.0

    t.base(base)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.80, 0.995)}


# ---------------------------------------------------------------------------
# Brick: running bond, recessed mortar, chipped and burnt bricks
# ---------------------------------------------------------------------------

@layer
def brick():
    W = 2.0
    t = Tile("brick", W, W, 0.025, seed=11, ao_distance=0.03)
    rng = t.rng
    rows, cols = 24, 9
    ph, pw = W / rows, W / cols
    joint = 0.010
    bh, bw = ph - joint, pw - joint
    z_mortar = 0.0075

    def mortar(X, Y):
        n = pnoise(X, Y, W, W, 101, octaves=4, f0=7)
        fine = pnoise(X, Y, W, W, 102, octaves=2, f0=320, gain=0.9)
        z = z_mortar + 0.0007 * n + 0.0005 * fine
        return z, 0.86 + 0.025 * n, 0.95, 0.0

    t.base(mortar)
    for r in range(rows):
        off = (r % 2) * pw / 2
        for c in range(cols):
            idx = r * cols + c
            cx = c * pw + pw / 2 + off + rng.normal(0, 0.0012)
            cy = r * ph + ph / 2 + rng.normal(0, 0.0008)
            roll = rng.random()
            tone_b = float(np.clip(rng.normal(0.945, 0.03), 0.87, 0.995))
            if roll < 0.07:
                tone_b = rng.uniform(0.80, 0.86)  # over-burnt
            elif roll < 0.12:
                tone_b = rng.uniform(0.985, 0.995)
            ztop = 0.0195 + rng.normal(0, 0.0011)
            if rng.random() < 0.035:
                ztop -= rng.uniform(0.004, 0.007)  # spalled face
            tilt = rng.normal(0, 0.006, 2)
            chip = rng.uniform(0.15, 1.0) ** 2
            rough_b = 0.80 + rng.uniform(-0.04, 0.06)
            s0 = 200 + idx

            def fn(X, Y, cx=cx, cy=cy, ztop=ztop, tilt=tilt, chip=chip, tone_b=tone_b, rough_b=rough_b, s0=s0):
                edge_noise = pnoise(X, Y, W, W, s0, octaves=3, f0=38, gain=0.55)
                d = rrect(X, Y, cx, cy, bw / 2, bh / 2, 0.004) + 0.0030 * chip * edge_noise
                face = pnoise(X, Y, W, W, s0 + 5000, octaves=3, f0=45, gain=0.7)
                sand = pnoise(X, Y, W, W, s0 + 9000, octaves=2, f0=300, gain=0.8)
                pit = sstep(1.7, 2.6, pnoise(X, Y, W, W, s0 + 13000, octaves=2, f0=160, gain=0.8))
                top = ztop + tilt[0] * (X - cx) + tilt[1] * (Y - cy) + 0.0004 * face + 0.00018 * sand - 0.0012 * pit
                z = z_mortar + (top - z_mortar) * rounded(d, 0.0045)
                z = np.where(d > 0, z, np.nan)
                tone = tone_b * (1.0 + 0.018 * face - 0.03 * pit)
                return z, tone, rough_b + 0.04 * sand, 0.0

            t.piece(cx - bw / 2 - 0.004, cy - bh / 2 - 0.004, cx + bw / 2 + 0.004, cy + bh / 2 + 0.004, fn)
    return t, {"finish": {"ao_strength": 0.55}, "tone_range": (0.70, 0.995)}


# ---------------------------------------------------------------------------
# Stone: dressed ashlar, chiselled drafts, pitted faces, mineral veining
# ---------------------------------------------------------------------------

@layer
def stone():
    W = 2.0
    t = Tile("stone", W, W, 0.025, seed=31, ao_distance=0.035)
    rng = t.rng
    heights = [0.42, 0.58, 0.46, 0.54]
    z_joint = 0.006

    def joint(X, Y):
        n = pnoise(X, Y, W, W, 401, octaves=4, f0=6)
        fine = pnoise(X, Y, W, W, 402, octaves=2, f0=300, gain=0.9)
        return z_joint + 0.0008 * n + 0.0005 * fine, 0.86 + 0.02 * n, 0.95, 0.0

    t.base(joint)
    y = 0.0
    idx = 0
    gap = 0.018
    for ch in heights:
        widths = partition(rng, W, 0.38, 0.85)
        x = rng.uniform(0, 0.3)
        for bw in widths:
            idx += 1
            cx, cy = x + bw / 2, y + ch / 2
            x += bw
            hw, hh = bw / 2 - gap / 2, ch / 2 - gap / 2
            tone_b = float(np.clip(rng.normal(0.955, 0.028), 0.88, 0.995))
            ztop = 0.0205 + rng.normal(0, 0.0008)
            chip = rng.uniform(0.2, 1.0) ** 2
            tool = rng.random() < 0.6
            tool_angle = rng.uniform(0.4, 1.2)
            s0 = 500 + idx * 7
            vein_amp = rng.uniform(0, 0.03)

            def fn(X, Y, cx=cx, cy=cy, hw=hw, hh=hh, ztop=ztop, tone_b=tone_b, chip=chip, tool=tool, ta=tool_angle, s0=s0, va=vein_amp):
                edge_noise = pnoise(X, Y, W, W, s0, octaves=3, f0=28, gain=0.6)
                d = rrect(X, Y, cx, cy, hw, hh, 0.012) + 0.0055 * chip * edge_noise
                undul = pnoise(X, Y, W, W, s0 + 1, octaves=3, f0=9, gain=0.6)
                pit = pnoise(X, Y, W, W, s0 + 2, octaves=2, f0=170, gain=0.85)
                pits = sstep(1.2, 2.3, pit)
                top = ztop + 0.0012 * undul - 0.0009 * pits
                top = top - 0.0012 * sstep(0.028, 0.012, d)  # chiselled draft margin
                if tool:
                    top = top + 0.00028 * np.sin(2 * math.pi * (X * math.cos(ta) + Y * math.sin(ta)) / 0.0085) * sstep(0.02, 0.05, d)
                z = z_joint + (top - z_joint) * rounded(d, 0.008)
                z = np.where(d > 0, z, np.nan)
                vein = np.sin(2 * math.pi * (X * 2.2 + Y * 0.7) + 1.4 * undul) ** 10
                tone = tone_b * (1 + 0.012 * undul - 0.05 * pits) - va * vein - 0.03 * sstep(0.10, 0.0, (Y - (cy - hh)))
                return z, tone, 0.78 + 0.05 * pit, 0.0

            t.piece(cx - hw - 0.01, cy - hh - 0.01, cx + hw + 0.01, cy + hh + 0.01, fn)
        y += ch
    return t, {"finish": {"ao_strength": 0.5}, "tone_range": (0.68, 0.995)}


# ---------------------------------------------------------------------------
# Wood: vertical boards with grain, knots, butt joints, nail heads
# ---------------------------------------------------------------------------

@layer
def wood():
    W, H = 2.0 / 1.5, 2.0 / 0.8
    t = Tile("wood", W, H, 0.008, seed=41, ao_distance=0.006)
    rng = t.rng
    n_boards = 8
    pitch = W / n_boards
    gap = 0.004
    bw = pitch - gap
    z_gap = 0.0006
    z_top = 0.0056

    def floor(X, Y):
        n = pnoise(X, Y, W, H, 601, octaves=3, f0=5)
        return z_gap + 0.0002 * n, 0.55, 0.9, 0.0

    t.base(floor)
    nail_rows = [0.30, 1.55]
    for b in range(n_boards):
        cx = b * pitch + pitch / 2
        cut = rng.uniform(0.35, 0.65) * H
        y0 = rng.uniform(0, H)
        segments = [(y0 + gap / 2, y0 + cut - gap / 2), (y0 + cut + gap / 2, y0 + H - gap / 2)]
        knots = [(cx + rng.uniform(-0.03, 0.03), y0 + rng.uniform(0, H), rng.uniform(0.018, 0.034), rng.uniform(0.04, 0.08)) for _ in range(rng.integers(0, 3))]
        tone_b = float(np.clip(rng.normal(0.93, 0.05), 0.80, 0.99))
        ring_scale = rng.uniform(38, 70)
        s0 = 700 + b * 11
        nails = []
        for ny in nail_rows:
            for k in (-1, 1):
                nails.append((cx + k * 0.045, ny + rng.normal(0, 0.006)))
        cupping = rng.uniform(0.0004, 0.0009)
        for (ya, yb) in segments:
            tint = rng.normal(0, 0.012)

            def fn(X, Y, cx=cx, ya=ya, yb=yb, knots=knots, tone_b=tone_b, ring_scale=ring_scale, s0=s0, nails=nails, cupping=cupping, tint=tint):
                across = (X - cx) / (bw / 2)
                # Distance in from the board's edges (arris), along and across.
                dx = bw / 2 - np.abs(X - cx)
                dy = np.minimum(Y - ya, yb - Y)
                d = np.minimum(dx, dy)
                wob = pnoise(X, Y, W, H, s0, octaves=2, f0=2.5, gain=0.5)
                phase = (X - cx) * ring_scale + 0.9 * wob
                kz = np.zeros(X.shape, np.float32)
                kt = np.zeros(X.shape, np.float32)
                for kx, ky, rx, ry in knots:
                    ddx = wrap_delta(X, kx, W)
                    ddy = wrap_delta(Y, ky, H)
                    r2 = (ddx / rx) ** 2 + (ddy / ry) ** 2
                    infl = dome(r2 / 3.2, 1.5)
                    phase = phase + 3.0 * infl * np.sign(ddx) * np.sqrt(np.clip(r2, 0, 3.2))
                    kz = kz + 0.00035 * dome(r2, 1.0) - 0.0004 * sstep(0.7, 1.0, np.sqrt(r2)) * (1 - sstep(1.0, 1.3, np.sqrt(r2)))
                    kt = kt + 0.07 * dome(r2, 0.9) + 0.03 * np.exp(-((np.sqrt(r2) - 1.0) / 0.12) ** 2)
                ring = np.sin(2 * math.pi * phase)
                fibre = pnoise(X, Y, W, H, s0 + 1, octaves=3, f0=95, gain=0.7, stretch=(1.0, 0.06))
                pores = sstep(1.6, 2.4, pnoise(X, Y, W, H, s0 + 2, octaves=2, f0=90, gain=0.8, stretch=(1.0, 0.1)))
                z = z_top - cupping * across ** 2 + 0.00028 * ring + 0.00022 * fibre - 0.0003 * pores + kz
                z = z_gap + (z - z_gap) * rounded(d, 0.0022)
                tone = tone_b + tint + 0.018 * ring + 0.012 * fibre - 0.04 * pores - kt
                for nx_, ny_ in nails:
                    tone = tone - 0.06 * np.exp(-(((X - nx_) ** 2 + (Y - ny_) ** 2) / 0.012 ** 2))
                z = np.where(d > 0, z, np.nan)
                return z, tone, 0.70 + 0.05 * fibre - 0.03 * ring, 0.0

            t.piece(cx - bw / 2, ya, cx + bw / 2, yb, fn)
        for nx_, ny_ in nails:
            def head(U, V, cx0=nx_):
                r2 = (U ** 2 + V ** 2) / 0.0046 ** 2
                z = z_top + 0.0007 + 0.0011 * np.sqrt(np.clip(1 - r2, 0, 1)) * (r2 < 1)
                z = np.where(r2 < 1, z, np.nan)
                return z, 0.55, 0.5, 0.6

            t.oriented(nx_, ny_, 0.0, 0.0092, 0.0092, head)
    return t, {"finish": {"ao_strength": 0.55}, "tone_range": (0.55, 0.995), "metal": False}


# ---------------------------------------------------------------------------
# Roof tile: interlocking clay pantiles, lapped courses, chipped nibs
# ---------------------------------------------------------------------------

def lapped_courses(t, name, rows, per_row_widths, tile_len, lift, floor_z, ease, rng, tone_fn, chip_scale, wave=0.0, seed0=0, stagger=0.0, random_start=False):
    W, H = t.w, t.h
    p = H / rows
    idx = 0
    for r in range(rows):
        y0 = r * p
        widths = per_row_widths(r)
        x = (r % 2) * stagger + (rng.uniform(0, W) if random_start else 0.0)
        for bw in widths:
            idx += 1
            cx = x + bw / 2
            x += bw
            tone_b = tone_fn(rng)
            chip = rng.uniform(0.1, 1.0) ** 2
            tilt = rng.normal(0, 0.004)
            s0 = seed0 + idx * 3
            wave_phase = rng.uniform(0, 6.28)
            jit = rng.normal(0, 0.0012)

            def fn(X, Y, cx=cx, bw=bw, y0=y0, tone_b=tone_b, chip=chip, tilt=tilt, s0=s0, jit=jit):
                edge_noise = pnoise(X, Y, W, H, s0, octaves=3, f0=34, gain=0.55)
                v = Y - y0
                u = X - cx
                dx = bw / 2 - 0.0015 - np.abs(u) + 0.0032 * chip * edge_noise
                dy = v + 0.0025 * chip * edge_noise
                dback = tile_len - v
                d = np.minimum(np.minimum(dx, dy), dback)
                local = np.clip(v / p, 0, 3)
                slope = lift * (1 - np.clip(local, 0, 1.4)) ** ease
                pan = wave * (np.abs(u) / (bw / 2)) ** 2 if wave else 0.0
                surf = pnoise(X, Y, W, H, s0 + 9000, octaves=3, f0=60, gain=0.6, stretch=(1.0, 1.0))
                fine = pnoise(X, Y, W, H, s0 + 9100, octaves=2, f0=280, gain=0.8)
                top = floor_z + slope + pan + tilt * u + jit + 0.0004 * surf + 0.00015 * fine
                z = floor_z - 0.004 + (top - (floor_z - 0.004)) * rounded(d, 0.0032)
                z = np.where(d > 0, z, np.nan)
                return z, tone_b * (1 + 0.016 * surf) - 0.02 * sstep(0.02, 0.0, d), 0.72 + 0.05 * fine, 0.0

            t.piece(cx - bw / 2 - 0.004, y0 - 0.004, cx + bw / 2 + 0.004, y0 + tile_len + 0.002, fn)


@layer
def roof():
    W = 2.0
    t = Tile("roof", W, W, 0.021, seed=51, ao_distance=0.03)
    rng = t.rng
    rows = 16
    tile_w = W / 10

    def floor(X, Y):
        return np.full(X.shape, 0.0, np.float32) - 0.001, 0.5, 0.9, 0.0

    t.base(floor)
    lapped_courses(
        t, "roof", rows, lambda r: [tile_w] * 10, 0.20, 0.0125, 0.0035, 1.4, rng,
        lambda g: float(np.clip(g.normal(0.935, 0.035), 0.83, 0.995)) - (0.09 if g.random() < 0.05 else 0.0),
        1.0, wave=0.0045, seed0=800, stagger=0.02,
    )
    return t, {"finish": {"ao_strength": 0.55}, "tone_range": (0.62, 0.995)}


# ---------------------------------------------------------------------------
# Slate: split slates, ragged tails, cleavage striations
# ---------------------------------------------------------------------------

@layer
def slate():
    W = 2.0
    t = Tile("slate", W, W, 0.021, seed=61, ao_distance=0.02)
    rng = t.rng
    rows = 20

    def floor(X, Y):
        return np.full(X.shape, -0.001, np.float32), 0.4, 0.9, 0.0

    t.base(floor)
    rows_w = [partition(rng, W, 0.20, 0.34) for _ in range(rows)]
    lapped_courses(
        t, "slate", rows, lambda r: rows_w[r], 0.30, 0.0075, 0.004, 1.6, rng,
        lambda g: float(np.clip(g.normal(0.93, 0.04), 0.82, 0.995)) + (0.05 if g.random() < 0.08 else 0.0),
        1.0, wave=0.0, seed0=1200, stagger=0.0, random_start=True,
    )
    return t, {"finish": {"ao_strength": 0.55}, "tone_range": (0.62, 0.995)}


# ---------------------------------------------------------------------------
# Thatch: bundles of straw, cut butt ends, binding courses
# ---------------------------------------------------------------------------

@layer
def thatch():
    W = 2.0
    t = Tile("thatch", W, W, 0.021, seed=71, ao_distance=0.014)
    rng = t.rng
    courses = 8
    p = W / courses
    strands = 200
    sw = W / strands

    def floor(X, Y):
        return np.full(X.shape, -0.001, np.float32), 0.45, 0.95, 0.0

    t.base(floor)
    for c in range(courses):
        y0 = c * p
        sway = rng.uniform(0, 6.28)
        length = p * 1.9
        bulge_phase = rng.uniform(0, 1)
        s0 = 900 + c * 13

        def fn(X, Y, y0=y0, sway=sway, bulge_phase=bulge_phase, s0=s0, c=c):
            v = Y - y0
            wob = 0.006 * np.sin(2 * math.pi * v / (0.5) + sway) + 0.012 * v
            fx = (X - wob) / sw
            ids = np.floor(fx)
            f = fx - ids
            iid = np.mod(ids, strands)
            r = lambda k: hash01(iid, c, s0, k)
            ridge = np.sqrt(np.clip(1 - (2 * f - 1) ** 2, 0, 1)) ** 0.7
            # Cut ends: each strand stops at its own height in the course.
            start = 0.02 * r(0) ** 2
            bundle = 0.5 + 0.5 * np.cos(2 * math.pi * (X / (W / 8) + bulge_phase))
            lift = 0.0105 * (1 - np.clip(v / p, 0, 1.3)) ** 1.5
            top = 0.0035 + lift + 0.0032 * bundle * (1 - np.clip(v / p, 0, 1)) + 0.0021 * (r(1) - 0.5) + 0.0036 * ridge
            # binding: a twisted rope across the course
            rope_d = np.abs(v - p * 0.62) / 0.012
            rope = (rope_d < 1) * np.sqrt(np.clip(1 - rope_d ** 2, 0, 1)) * (0.6 + 0.4 * np.sin(2 * math.pi * (X / 0.02 + v / 0.016)))
            top = top + 0.0022 * rope
            valid = (v > start) & (v < length)
            z = np.where(valid, top, np.nan)
            bid = np.floor(X / (W / 8))
            tone = 0.915 + 0.11 * (r(2) - 0.5) + 0.045 * ridge - 0.03 * rope + 0.05 * (hash01(bid, c, s0, 9) - 0.5) - 0.09 * (1 - ridge) ** 2
            return z, tone, 0.95 + 0.03 * ridge, 0.0

        t.piece(0.0, y0, W, y0 + length, fn)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.70, 0.995)}


# ---------------------------------------------------------------------------
# Metal: standing seams, pressed flutes, screws, laps, scratches, oxidation
# ---------------------------------------------------------------------------

@layer
def metal():
    W = 2.0
    t = Tile("metal", W, W, 0.003, seed=81, ao_distance=0.004)
    rng = t.rng
    panel_w = 0.5
    z_sheet = 0.0008
    scratches = [random_walk(rng, rng.uniform(0, W), rng.uniform(0, W), rng.uniform(1.3, 1.8), rng.uniform(0.15, 0.6), 0.03, 0.05) for _ in range(46)]
    lap_y = [0.0, 1.0]

    def sheet(X, Y):
        wav = pnoise(X, Y, W, W, 1001, octaves=3, f0=4)
        fine = pnoise(X, Y, W, W, 1002, octaves=2, f0=300, gain=0.85)
        oxide_n = pnoise(X, Y, W, W, 1003, octaves=3, f0=5)
        ox = sstep(0.55, 1.25, oxide_n)
        u = np.mod(X, panel_w) / panel_w  # 0..1 across a panel
        seam = np.exp(-(np.minimum(u, 1 - u) * panel_w / 0.02) ** 2)  # standing seam
        seam_top = rounded(0.0125 - np.minimum(u, 1 - u) * panel_w, 0.006) * (np.minimum(u, 1 - u) * panel_w < 0.0125)
        flute = 0.00042 * np.cos(2 * math.pi * (u * 3)) ** 2 * sstep(0.04, 0.09, np.minimum(u, 1 - u))
        z = z_sheet + 0.00018 * wav + 0.00004 * fine + flute + 0.0018 * seam_top
        # horizontal laps: the upper sheet steps up across the joint
        for ly in lap_y:
            dyl = wrap_delta(Y, ly, W)
            z = z + np.where((dyl > 0) & (dyl < 0.10), 0.0006 * (1 - np.clip(dyl / 0.10, 0, 1)) ** 1.5, 0.0)
            z = z + 0.0002 * np.exp(-(dyl / 0.003) ** 2)
        tone = 0.975 + 0.012 * wav - 0.04 * ox - 0.07 * seam
        panel_id = np.floor(X / panel_w)
        tone = tone + 0.012 * (hash01(panel_id, np.floor(Y / 1.0), 5, 1) - 0.5)
        metal_v = np.full(X.shape, 0.30, np.float32) - 0.26 * ox
        rough = 0.30 + 0.30 * ox + 0.02 * fine
        for pts in scratches:
            d = wrapped_polyline(X, Y, pts, W, W, 0.01)
            s = 1 - sstep(0.0003, 0.0011, d)
            z = z - 0.00012 * s
            tone = tone + 0.012 * s
            metal_v = metal_v + 0.35 * s
            rough = rough - 0.1 * s
        return z, tone, rough, np.clip(metal_v, 0, 1)

    t.base(sheet)
    # Screws with washers: two rows beside every seam, every 0.25 m.
    for i in range(4):
        for j in range(8):
            for side in (-1, 1):
                sx = i * panel_w + side * 0.036
                sy = j * 0.25 + 0.125 + rng.normal(0, 0.002)

                def head(U, V):
                    r = np.sqrt(U ** 2 + V ** 2)
                    z = np.where(r < 0.0075, z_sheet + 0.0010 + 0.0007 * np.sqrt(np.clip(1 - (r / 0.0075) ** 2, 0, 1)), np.nan)
                    z = np.where((r < 0.0035), z + 0.0003, z)
                    return z, np.where(r < 0.0035, 0.78, 0.9), 0.35, 0.55

                t.oriented(sx, sy, 0.0, 0.017, 0.017, head)
    return t, {"finish": {"ao_strength": 0.45}, "tone_range": (0.78, 0.995), "metal": True}


# ---------------------------------------------------------------------------
# Glass: float-glass waviness, water spots, dust, squeegee arcs
# ---------------------------------------------------------------------------

@layer
def glass():
    W = 2.0
    t = Tile("glass", W, W, 0.002, seed=91, ao_distance=0.003)
    rng = t.rng
    arcs = [(rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0.35, 0.8), rng.uniform(0.02, 0.05)) for _ in range(9)]

    def pane(X, Y):
        wav = pnoise(X, Y, W, W, 1101, octaves=3, f0=3, gain=0.5)
        roll = pnoise(X, Y, W, W, 1102, octaves=2, f0=14, gain=0.4, stretch=(0.15, 1.0))
        dust = pnoise(X, Y, W, W, 1103, octaves=3, f0=4)
        dusty = sstep(0.6, 1.5, dust)
        z = 0.0009 + 0.00035 * wav + 0.0001 * roll
        lx, ly, r, (sx, sy) = cells(X, Y, 0.085, W, W, 44)
        has = r(0) < 0.3
        rad = 0.0018 + 0.0032 * r(3)
        d2 = ((lx - (r(1) - 0.5) * sx * 0.6) ** 2 + (ly - (r(2) - 0.5) * sy * 0.6) ** 2) / rad ** 2
        spot = np.where(has, dome(d2, 0.5), 0.0)
        z = z + 0.0007 * spot
        tone = 0.992 - 0.022 * dusty - 0.006 * spot
        rough = 0.10 + 0.22 * dusty + 0.03 * spot
        for cx, cy, R, wdt in arcs:
            rr = np.hypot(wrap_delta(X, cx, W), wrap_delta(Y, cy, W))
            band = np.exp(-((rr - R) / wdt) ** 2)
            tone = tone - 0.007 * band
            rough = rough + 0.08 * band
        return z, tone, rough, 0.0

    t.base(pane)
    return t, {"finish": {"ao_strength": 0.0, "grain": 0.0015}, "tone_range": (0.93, 0.999)}


# ---------------------------------------------------------------------------
# Foliage: layered leaves folded along the midrib, dark gaps between
# ---------------------------------------------------------------------------

@layer
def foliage():
    W = 2.0 / 1.25
    t = Tile("foliage", W, W, 0.012, seed=101, ao_distance=0.014)
    rng = t.rng

    def gaps(X, Y):
        n = pnoise(X, Y, W, W, 1201, octaves=3, f0=6)
        return np.full(X.shape, 0.0, np.float32) + 0.0003 * n, 0.74 + 0.02 * n, 0.9, 0.0

    t.base(gaps)
    for k in range(1150):
        cx, cy = rng.uniform(0, W), rng.uniform(0, W)
        ang = rng.uniform(0, 2 * math.pi)
        L = rng.uniform(0.085, 0.14)
        Wd = L * rng.uniform(0.40, 0.52)
        zl = rng.uniform(0.0008, 0.0092) ** 1.0
        tilt = rng.normal(0, 0.022)
        curl = rng.uniform(0.002, 0.008)
        tone_b = float(np.clip(0.905 + 0.075 * (zl / 0.0092) + rng.normal(0, 0.022), 0.82, 0.995))

        def fn(U, V, L=L, Wd=Wd, zl=zl, tilt=tilt, curl=curl, tone_b=tone_b):
            s = (U + L / 2) / L
            hw = 0.5 * Wd * np.sin(np.pi * np.clip(s, 0, 1) ** 0.72) ** 0.85
            inside = (s > 0) & (s < 1) & (np.abs(V) < hw)
            edge = np.clip((hw - np.abs(V)) / 0.0035, 0, 1)
            rel = np.abs(V) / np.maximum(hw, 1e-4)
            fold = 0.0035 * rel
            midrib = -0.00055 * np.exp(-(V / 0.0022) ** 2)
            veins = 0.00018 * np.sin(2 * math.pi * (s * 9 - rel * 1.1)) * (1 - rel)
            z = zl + tilt * (U) + fold - curl * s ** 2 + midrib + veins
            z = 0.0 + (z) * np.sqrt(edge) + 0.0002
            tone = tone_b + 0.02 * np.exp(-(V / 0.003) ** 2) + 0.012 * veins / 0.00018 * 0.3 - 0.02 * rel ** 2
            return np.where(inside, z, np.nan), tone, 0.88 - 0.05 * np.exp(-(V / 0.003) ** 2), 0.0

        t.oriented(cx, cy, ang, L, Wd, fn)
    return t, {"finish": {"ao_strength": 0.75}, "tone_range": (0.64, 0.995)}


# ---------------------------------------------------------------------------
# Fabric: plain weave, thread by thread
# ---------------------------------------------------------------------------

@layer
def fabric():
    W = 0.25
    t = Tile("fabric", W, W, 0.0015, seed=111, ao_distance=0.0018)
    n_threads = 32
    p = W / n_threads

    def weave(X, Y):
        sx, sy = X / p, Y / p
        i, j = np.floor(sx), np.floor(sy)
        fu, fv = sx - i, sy - j
        ii, jj = np.mod(i, n_threads), np.mod(j, n_threads)
        ridge_u = np.sqrt(np.clip(1 - (2 * fu - 1) ** 2, 0, 1)) ** 0.75
        ridge_v = np.sqrt(np.clip(1 - (2 * fv - 1) ** 2, 0, 1)) ** 0.75
        warp_h = 0.5 + 0.5 * np.sin(np.pi * (sy + i))
        weft_h = 0.5 - 0.5 * np.sin(np.pi * (sx + j))
        thick_w = 0.0009 + 0.00018 * (hash01(ii, 0, 3, 0) - 0.5)
        thick_f = 0.0009 + 0.00018 * (hash01(jj, 0, 4, 0) - 0.5)
        zw = 0.00035 + thick_w * (0.25 + 0.75 * warp_h) * ridge_u
        zf = 0.00035 + thick_f * (0.25 + 0.75 * weft_h) * ridge_v
        z = np.maximum(zw, zf)
        fuzz = pnoise(X, Y, W, W, 1301, octaves=2, f0=180, gain=0.9)
        z = z + 0.00005 * fuzz
        worn = pnoise(X, Y, W, W, 1302, octaves=3, f0=3)
        warp_on_top = zw >= zf
        tone = np.where(warp_on_top, 0.962 + 0.03 * (hash01(ii, 1, 5, 0) - 0.5), 0.972 + 0.03 * (hash01(jj, 1, 6, 0) - 0.5))
        tone = tone + 0.01 * worn + 0.006 * fuzz - 0.02 * (1 - np.maximum(ridge_u, ridge_v)) ** 2
        return z, tone, 0.92 + 0.02 * fuzz, 0.0

    t.base(weave)
    return t, {"finish": {"ao_strength": 0.5, "grain": 0.006}, "tone_range": (0.85, 0.995)}


# ---------------------------------------------------------------------------
# Concrete: board-marked with tie holes, fins, bugholes, a control joint
# ---------------------------------------------------------------------------

@layer
def concrete():
    W = 2.0
    t = Tile("concrete", W, W, 0.012, seed=121, ao_distance=0.014)
    rng = t.rng
    boards = 16
    bp = W / boards
    steps = rng.normal(0, 0.00045, boards)
    seam_x = rng.uniform(0, W, boards)
    cracks = [random_walk(rng, rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0, 6.28), rng.uniform(0.4, 0.9), 0.03, 0.3) for _ in range(2)]
    ties = [(0.25 + 0.5 * i, 0.25 + 0.5 * j) for i in range(4) for j in range(4)]

    def wall(X, Y):
        b = np.floor(Y / bp).astype(np.int64)
        bi = np.mod(b, boards)
        yb = Y - (b + 0.5) * bp
        step = steps[bi]
        grain = pnoise(X, Y, W, W, 1401, octaves=4, f0=70, gain=0.7, stretch=(0.05, 1.0))
        grain2 = pnoise(X, Y, W, W, 1402, octaves=3, f0=150, gain=0.75, stretch=(0.06, 1.0))
        broad = pnoise(X, Y, W, W, 1403, octaves=3, f0=4)
        fine = pnoise(X, Y, W, W, 1404, octaves=2, f0=300, gain=0.85)
        z = 0.0062 + step + 0.00032 * grain + 0.00018 * grain2 + 0.0002 * broad + 0.00012 * fine
        # fins at the board edges, butt joints where a board ends
        fin = np.exp(-((np.abs(yb) - bp / 2) / 0.0012) ** 2)
        z = z + 0.0011 * fin
        bx = np.abs(wrap_delta(X, seam_x[bi], W))
        z = z + 0.0007 * np.exp(-(bx / 0.0012) ** 2) - 0.0005 * (bx < 0.003) * (bx > 0.0015)
        # control joints: V grooves
        for gy in (0.0, 1.0):
            g = np.abs(wrap_delta(Y, gy, W))
            z = z - 0.0055 * (1 - sstep(0.0, 0.0085, g))
        tone = 0.955 + 0.014 * broad + 0.01 * grain + 0.006 * fine - 0.02 * fin
        rough = 0.88 + 0.03 * grain2
        # tie holes
        for tx, ty in ties:
            dx, dy = wrap_delta(X, tx, W), wrap_delta(Y, ty, W)
            rr = np.hypot(dx, dy)
            if rr.min() > 0.05:
                continue
            cone = np.clip(1 - rr / 0.0125, 0, 1)
            z = z - 0.010 * cone ** 0.9 - 0.0006 * (rr < 0.018) * (rr > 0.0125) * 0
            tone = tone - 0.07 * cone - 0.035 * np.exp(-(rr / 0.03) ** 2)
        # bugholes
        lx, ly, r, (sx, sy) = cells(X, Y, 0.038, W, W, 55)
        has = r(0) < 0.22
        rad = 0.0009 + 0.0032 * r(3) ** 1.5
        d2 = ((lx - (r(1) - 0.5) * sx * 0.6) ** 2 + (ly - (r(2) - 0.5) * sy * 0.6) ** 2) / rad ** 2
        bug = np.where(has, dome(d2, 0.6), 0.0)
        z = z - 0.0028 * bug
        tone = tone - 0.05 * bug
        for pts in cracks:
            d = wrapped_polyline(X, Y, pts, W, W, 0.01)
            v = 1 - sstep(0.0004, 0.003, d)
            z = z - 0.0014 * v
            tone = tone - 0.04 * v
        return z, tone, rough, 0.0

    t.base(wall)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.72, 0.995)}


# ---------------------------------------------------------------------------
# Bark: raised plates split by fissures, cross-checks, a branch scar
# ---------------------------------------------------------------------------

@layer
def bark():
    W, H = 2.0 / 4.0, 2.0 / 1.2
    t = Tile("bark", W, H, 0.012, seed=131, ao_distance=0.012)
    rng = t.rng

    def fissure(X, Y):
        n = pnoise(X, Y, W, H, 1501, octaves=3, f0=5)
        return 0.0012 + 0.0004 * n, 0.72 + 0.02 * n, 0.95, 0.0

    t.base(fissure)
    x = 0.0
    idx = 0
    widths = partition(rng, W, 0.035, 0.085)
    for col, cw in enumerate(widths):
        cx0 = x + cw / 2
        x += cw
        k = int(rng.integers(1, 3))
        sway_amp = rng.uniform(0.004, 0.011)
        sway_ph = rng.uniform(0, 6.28)
        y = rng.uniform(0, H)
        lengths = partition(rng, H, 0.16, 0.5)
        for L in lengths:
            idx += 1
            y_a, y_b = y, y + L
            y += L
            tone_b = float(np.clip(rng.normal(0.93, 0.04), 0.83, 0.995))
            ztop = 0.0088 + rng.normal(0, 0.0014)
            s0 = 1600 + idx * 5

            def fn(X, Y, cx0=cx0, cw=cw, k=k, sway_amp=sway_amp, sway_ph=sway_ph, y_a=y_a, y_b=y_b, tone_b=tone_b, ztop=ztop, s0=s0):
                cxy = cx0 + sway_amp * np.sin(2 * math.pi * k * Y / H + sway_ph)
                hw = cw / 2 - 0.0035
                u = np.abs(X - cxy)
                edge = pnoise(X, Y, W, H, s0, octaves=3, f0=30, gain=0.6, stretch=(1.0, 0.4))
                dx = hw - u + 0.0022 * edge
                dy = np.minimum(Y - y_a, y_b - Y) + 0.004 * edge
                d = np.minimum(dx, dy * 0.6)
                ridge = np.sqrt(np.clip(1 - (u / hw) ** 2, 0, 1)) ** 0.6
                rough_n = pnoise(X, Y, W, H, s0 + 1, octaves=3, f0=55, gain=0.7, stretch=(1.0, 0.25))
                scale = pnoise(X, Y, W, H, s0 + 2, octaves=2, f0=160, gain=0.8, stretch=(0.5, 1.0))
                top = ztop * (0.55 + 0.45 * ridge) + 0.0011 * rough_n + 0.0004 * scale
                z = 0.0012 + (top - 0.0012) * rounded(d, 0.004)
                z = np.where(d > 0, z, np.nan)
                return z, tone_b * (1 + 0.02 * rough_n) - 0.03 * (1 - ridge), 0.94 + 0.03 * scale, 0.0

            t.piece(cx0 - cw / 2 - 0.02, y_a - 0.01, cx0 + cw / 2 + 0.02, y_b + 0.01, fn)
    # A branch scar: raised concentric callus rings over the plates.
    sx, sy = W * 0.45, H * 0.35

    def scar(U, V):
        r2 = (U / 0.11) ** 2 + (V / 0.06) ** 2
        r = np.sqrt(r2)
        z = 0.0100 + 0.0022 * np.sin(r * 30) * (r < 1) * 0 + 0.0016 * np.cos(r * 24) * (1 - r) - 0.0045 * dome(r2 * 9, 1.0)
        z = np.where(r < 1, z * np.sqrt(np.clip(1 - r2, 0, 1)) ** 0.25, np.nan)
        tone = 0.9 - 0.12 * dome(r2 * 9, 1.0) + 0.02 * np.cos(r * 24)
        return z, tone, 0.96, 0.0

    t.oriented(sx, sy, math.pi / 2, 0.22, 0.12, scar)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.62, 0.995)}
