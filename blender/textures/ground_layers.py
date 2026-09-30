"""
The ground surfaces, modelled at the size the app tiles them: asphalt, paving
slabs, setts, concrete, gravel, soil and the three grasses. Same conventions
as model_layers.py (metres; hmax is the surface's SURFACE_BUMP).
"""

import math

import numpy as np

from lib import (
    Tile, cells, dome, hash01, pnoise, random_walk, rounded, rrect, sstep, wrap_delta, wrapped_polyline, worley,
)

LAYERS = {}


def layer(fn):
    LAYERS[fn.__name__] = fn
    return fn


def stones(X, Y, W, c, seed, hlo, hhi, cover, shape=0.18, power=0.7, jitter=0.35):
    """One grid of irregular domed stones/tufts. Returns (z, id01, mask)."""
    lx, ly, r, (sx, sy) = cells(X, Y, c, W, W, seed)
    ox = (r(1) - 0.5) * sx * jitter * 2
    oy = (r(2) - 0.5) * sy * jitter * 2
    dx, dy = lx - ox, ly - oy
    rad = c * (0.34 + 0.16 * r(3))
    ang = np.arctan2(dy, dx)
    deform = 1 + shape * np.sin(3 * ang + r(4) * 6.28) + shape * 0.55 * np.sin(5 * ang + r(5) * 6.28)
    rho = np.hypot(dx, dy) / (rad * deform)
    has = r(0) < cover
    body = np.sqrt(np.clip(1 - rho ** 2, 0, 1)) ** power
    h = hlo + (hhi - hlo) * r(6)
    z = np.where(has & (rho < 1), h * body, np.nan)
    return z, r(7), has & (rho < 1)


def layered_stones(X, Y, W, grids, base_z=0.0):
    """Several grids, later ones lying on top where they are higher."""
    z = np.full(X.shape, np.nan, np.float32)
    ident = np.zeros(X.shape, np.float32)
    for k, (c, hlo, hhi, cover, kw) in enumerate(grids):
        zz, idv, m = stones(X, Y, W, c, 300 + k * 17, hlo, hhi, cover, **kw)
        zz = zz + base_z
        take = m & (np.isnan(z) | (zz > z))
        z = np.where(take, zz, z)
        ident = np.where(take, idv, ident)
    return z, ident


# ---------------------------------------------------------------------------
# Asphalt
# ---------------------------------------------------------------------------

@layer
def asphalt():
    W = 9.0
    t = Tile("g-asphalt", W, W, 0.018, seed=211, ao_distance=0.02)
    rng = t.rng
    patches = [(rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0.7, 1.7), rng.uniform(0.5, 1.1)) for _ in range(4)]
    cracks = [random_walk(rng, rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0, 6.28), rng.uniform(1.5, 3.2), 0.08, 0.25) for _ in range(7)]
    seams = [W * 0.31, W * 0.79]
    dents = [(rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0.25, 0.45)) for _ in range(2)]

    def road(X, Y):
        broad = pnoise(X, Y, W, W, 2101, octaves=4, f0=4)
        mid = pnoise(X, Y, W, W, 2102, octaves=3, f0=40, gain=0.6)
        fine = pnoise(X, Y, W, W, 2103, octaves=2, f0=480, gain=0.9)
        z = 0.0085 + 0.0013 * broad + 0.0005 * mid + 0.0004 * fine
        tone = 0.925 + 0.02 * broad + 0.014 * mid + 0.01 * fine
        rough = 0.86 + 0.04 * fine
        zs, idv, m = stones(X, Y, W, 0.03, 2110, 0.0015, 0.0055, 0.85, shape=0.25, power=0.6)
        z = np.where(m, np.maximum(z, 0.0055 + zs), z)
        tone = np.where(m, 0.95 + 0.045 * idv, tone)
        rough = np.where(m, 0.8, rough)
        # Loose chippings lying on the surface.
        zc, idc, mc = stones(X, Y, W, 0.09, 2120, 0.004, 0.009, 0.20, shape=0.3, power=0.55)
        z = np.where(mc, 0.009 + zc, z)
        tone = np.where(mc, 0.95 + 0.045 * idc, tone)
        for px, py, hw, hh in patches:
            dx, dy = wrap_delta(X, px, W), wrap_delta(Y, py, W)
            d = rrect(dx, dy, 0, 0, hw / 2, hh / 2, 0.06)
            inside = sstep(0.0, 0.02, d)
            bead = np.exp(-((d - 0.03) / 0.028) ** 2)
            z = z + 0.0022 * inside + 0.0028 * bead - 0.0009 * inside * mid
            tone = tone - 0.05 * inside - 0.09 * bead
            rough = rough - 0.03 * inside + 0.04 * bead
        for sx in seams:
            dx = X - sx - 0.06 * np.sin(2 * math.pi * Y / W * 3 + sx)
            band = np.exp(-(dx / 0.03) ** 2)
            z = z + 0.0018 * band
            tone = tone - 0.11 * band
        for dxc, dyc, rr in dents:
            r2 = (wrap_delta(X, dxc, W) ** 2 + wrap_delta(Y, dyc, W) ** 2) / rr ** 2
            z = z - 0.0055 * dome(r2, 0.7) * (0.8 + 0.2 * mid)
            tone = tone - 0.04 * dome(r2, 0.7)
        for pts in cracks:
            d = wrapped_polyline(X, Y, pts, W, W, 0.08)
            v = 1 - sstep(0.004, 0.018, d + 0.006 * mid)
            z = z - 0.0062 * v
            tone = tone - 0.24 * v
            rough = rough - 0.1 * v
        return z, tone, rough, 0.0

    t.base(road)
    return t, {"finish": {"ao_strength": 0.5}, "tone_range": (0.55, 0.995)}


# ---------------------------------------------------------------------------
# Paving slabs (four across the 1.2 m pavement, eight along the 3.6 m tile)
# ---------------------------------------------------------------------------

@layer
def pavers():
    W, H = 1.2, 3.6
    t = Tile("g-pavers", W, H, 0.028, seed=221, ao_distance=0.025)
    rng = t.rng
    cols, rows = 4, 8
    pw, ph = W / cols, H / rows
    gap = 0.009
    z_j = 0.0045

    def sand(X, Y):
        n = pnoise(X, Y, W, H, 2201, octaves=4, f0=5)
        fine = pnoise(X, Y, W, H, 2202, octaves=2, f0=200, gain=0.9)
        return z_j + 0.0005 * n + 0.0004 * fine, 0.86 + 0.03 * n, 0.95, 0.0

    t.base(sand)
    idx = 0
    for r in range(rows):
        for c in range(cols):
            idx += 1
            cx, cy = c * pw + pw / 2, r * ph + ph / 2
            hw, hh = pw / 2 - gap / 2, ph / 2 - gap / 2
            ztop = 0.0225 + rng.normal(0, 0.0012)
            tilt = rng.normal(0, 0.008, 2)
            tone_b = float(np.clip(rng.normal(0.945, 0.03), 0.86, 0.995))
            chip = rng.uniform(0.1, 1) ** 2
            s0 = 2300 + idx * 3
            crack = rng.random() < 0.12
            cpts = random_walk(rng, cx + rng.uniform(-hw, hw), cy - hh * 0.9, math.pi / 2 + rng.normal(0, 0.5), hh * 1.8, 0.03, 0.4) if crack else None
            sunk = rng.random() < 0.08

            def fn(X, Y, cx=cx, cy=cy, hw=hw, hh=hh, ztop=ztop, tilt=tilt, tone_b=tone_b, chip=chip, s0=s0, cpts=cpts, sunk=sunk):
                edge_n = pnoise(X, Y, W, H, s0, octaves=3, f0=30, gain=0.6)
                d = rrect(X, Y, cx, cy, hw, hh, 0.012) + 0.0032 * chip * edge_n
                face = pnoise(X, Y, W, H, s0 + 1, octaves=3, f0=16, gain=0.55)
                grit = pnoise(X, Y, W, H, s0 + 2, octaves=2, f0=200, gain=0.85)
                pit = sstep(1.5, 2.4, pnoise(X, Y, W, H, s0 + 3, octaves=2, f0=90, gain=0.8))
                top = ztop - (0.0035 if sunk else 0) + tilt[0] * (X - cx) + tilt[1] * (Y - cy) + 0.0006 * face + 0.0003 * grit - 0.0008 * pit
                z = z_j + (top - z_j) * rounded(d, 0.006)
                tone = tone_b * (1 + 0.02 * face - 0.03 * pit)
                if cpts is not None:
                    from lib import polyline_local
                    dist = polyline_local(X, Y, cpts, 0.02)
                    v = 1 - sstep(0.0008, 0.0045, dist)
                    z = z - 0.004 * v
                    tone = tone - 0.08 * v
                return np.where(d > 0, z, np.nan), tone, 0.84 + 0.05 * grit, 0.0

            t.piece(cx - hw - 0.01, cy - hh - 0.01, cx + hw + 0.01, cy + hh + 0.01, fn)
    return t, {"finish": {"ao_strength": 0.5}, "tone_range": (0.62, 0.995)}


# ---------------------------------------------------------------------------
# Setts: small granite cobbles laid in staggered rows
# ---------------------------------------------------------------------------

@layer
def setts():
    W = 4.0
    t = Tile("g-setts", W, W, 0.04, seed=231, ao_distance=0.04)
    rng = t.rng
    cols, rows = 16, 24
    pw, ph = W / cols, W / rows
    z_j = 0.006
    gap = 0.014

    def bed(X, Y):
        n = pnoise(X, Y, W, W, 2401, octaves=4, f0=8)
        fine = pnoise(X, Y, W, W, 2402, octaves=2, f0=320, gain=0.9)
        return z_j + 0.0009 * n + 0.0005 * fine, 0.85 + 0.03 * n, 0.95, 0.0

    t.base(bed)
    idx = 0
    for r in range(rows):
        off = (r % 2) * pw / 2
        for c in range(cols):
            idx += 1
            cx = c * pw + pw / 2 + off + rng.normal(0, 0.004)
            cy = r * ph + ph / 2 + rng.normal(0, 0.004)
            ang = rng.normal(0, 0.05)
            hw, hh = pw / 2 - gap / 2 - rng.uniform(0, 0.012), ph / 2 - gap / 2 - rng.uniform(0, 0.008)
            ztop = 0.034 + rng.normal(0, 0.0025)
            tone_b = float(np.clip(rng.normal(0.92, 0.045), 0.80, 0.995))
            worn = rng.uniform(0, 1)
            chip = rng.uniform(0.1, 1) ** 2
            s0 = 2500 + idx * 3

            def fn(U, V, hw=hw, hh=hh, ztop=ztop, tone_b=tone_b, worn=worn, chip=chip, s0=s0):
                edge_n = pnoise(U + 0.7, V + 0.3, 100.0, 100.0, s0, octaves=3, f0=2400, gain=0.6)
                d = rrect(U, V, 0, 0, hw, hh, 0.025) + 0.006 * chip * edge_n
                crown = 1 - 0.22 * ((U / hw) ** 2 + (V / hh) ** 2) * 0.5
                pitch = pnoise(U + 5, V + 5, 100.0, 100.0, s0 + 1, octaves=3, f0=1500, gain=0.7)
                top = ztop * crown + 0.0011 * pitch
                z = z_j + (top - z_j) * rounded(d, 0.018)
                tone = tone_b * (1 + 0.016 * pitch) + 0.02 * worn * dome(((U / hw) ** 2 + (V / hh) ** 2) * 0.6, 1.0)
                rough = 0.80 - 0.10 * worn * dome(((U / hw) ** 2 + (V / hh) ** 2) * 0.6, 1.0) + 0.04 * pitch
                return np.where(d > 0, z, np.nan), tone, rough, 0.0

            t.oriented(cx, cy, ang, 2 * hw + 0.02, 2 * hh + 0.02, fn)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.58, 0.995)}


# ---------------------------------------------------------------------------
# Gravel, soil
# ---------------------------------------------------------------------------

@layer
def gravel():
    W = 3.6
    t = Tile("g-gravel", W, W, 0.03, seed=241, ao_distance=0.03)

    def bed(X, Y):
        n = pnoise(X, Y, W, W, 2601, octaves=4, f0=6)
        fine = pnoise(X, Y, W, W, 2602, octaves=2, f0=300, gain=0.9)
        z = 0.002 + 0.0008 * n + 0.0004 * fine
        tone = 0.78 + 0.03 * n + 0.02 * fine
        zs, ident = layered_stones(
            X, Y, W,
            [(0.030, 0.008, 0.016, 0.9, {"shape": 0.22, "power": 0.65}),
             (0.036, 0.008, 0.018, 0.75, {"shape": 0.2, "power": 0.6}),
             (0.045, 0.006, 0.015, 0.5, {"shape": 0.18, "power": 0.6})],
            base_z=0.002,
        )
        m = ~np.isnan(zs)
        # Stones sit on each other: later grids get a lift proportional to their layer.
        z = np.where(m, np.maximum(zs, z), z)
        tone = np.where(m, 0.86 + 0.135 * ident, tone)
        rough = np.where(m, 0.82 + 0.08 * ident, 0.95)
        return z, tone, rough, 0.0

    t.base(bed)
    return t, {"finish": {"ao_strength": 0.7}, "tone_range": (0.5, 0.995)}


@layer
def soil():
    W = 4.0
    t = Tile("g-soil", W, W, 0.03, seed=251, ao_distance=0.03)

    def field(X, Y):
        broad = pnoise(X, Y, W, W, 2701, octaves=4, f0=3)
        mid = pnoise(X, Y, W, W, 2702, octaves=3, f0=30, gain=0.6)
        fine = pnoise(X, Y, W, W, 2703, octaves=2, f0=300, gain=0.9)
        f1, f2 = worley(X, Y, 0.30, W, W, 2704)
        crack = 1 - sstep(0.004, 0.016, (f2 - f1) * 1.0 + 0.004 * mid)
        z = 0.008 + 0.003 * broad + 0.0016 * mid + 0.0005 * fine - 0.0035 * crack
        tone = 0.94 + 0.03 * broad + 0.014 * mid - 0.12 * crack + 0.012 * fine
        zc, idc, m = stones(X, Y, W, 0.055, 2710, 0.005, 0.02, 0.85, shape=0.3, power=0.75, jitter=0.5)
        z = np.where(m, 0.006 + zc + 0.0012 * mid, z)
        tone = np.where(m, 0.9 + 0.09 * idc - 0.0 * crack, tone)
        zp, idp, mp = stones(X, Y, W, 0.11, 2720, 0.006, 0.014, 0.16, shape=0.2, power=0.5)
        z = np.where(mp, 0.010 + zp, z)
        tone = np.where(mp, 0.96 + 0.035 * idp, tone)
        return z, tone, 0.9 - 0.06 * crack + 0.04 * fine, 0.0

    t.base(field)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.55, 0.995)}


# ---------------------------------------------------------------------------
# Concrete pavement: 1.2 m slabs with sawn joints
# ---------------------------------------------------------------------------

@layer
def concrete():
    W = 3.6
    t = Tile("g-concrete", W, W, 0.014, seed=261, ao_distance=0.015)
    rng = t.rng
    n = 3
    ps = W / n
    gap = 0.008
    z_j = 0.0025
    idx = 0
    cracks = [random_walk(rng, rng.uniform(0, W), rng.uniform(0, W), rng.uniform(0, 6.28), rng.uniform(0.5, 1.1), 0.03, 0.3) for _ in range(4)]

    def joint(X, Y):
        nn = pnoise(X, Y, W, W, 2801, octaves=3, f0=8)
        return z_j + 0.0004 * nn, 0.72 + 0.03 * nn, 0.95, 0.0

    t.base(joint)
    for r in range(n):
        for c in range(n):
            idx += 1
            cx, cy = c * ps + ps / 2, r * ps + ps / 2
            hw = ps / 2 - gap / 2
            ztop = 0.0115 + rng.normal(0, 0.0007)
            tilt = rng.normal(0, 0.0018, 2)
            tone_b = 0.955 + rng.normal(0, 0.015)
            s0 = 2900 + idx * 3

            def fn(X, Y, cx=cx, cy=cy, hw=hw, ztop=ztop, tilt=tilt, tone_b=tone_b, s0=s0):
                d = rrect(X, Y, cx, cy, hw, hw, 0.006)
                trowel = pnoise(X, Y, W, W, s0, octaves=3, f0=9, gain=0.6)
                grit = pnoise(X, Y, W, W, s0 + 1, octaves=2, f0=280, gain=0.85)
                zg, idg, mg = stones(X, Y, W, 0.028, s0 + 2, 0.0004, 0.0012, 0.6, shape=0.3, power=0.5)
                top = ztop + tilt[0] * (X - cx) + tilt[1] * (Y - cy) + 0.0004 * trowel + 0.00025 * grit
                top = np.where(mg, top + zg, top)
                z = z_j + (top - z_j) * rounded(d, 0.005)
                tone = tone_b * (1 + 0.018 * trowel + 0.01 * grit) + np.where(mg, 0.012 * idg, 0)
                return np.where(d > 0, z, np.nan), tone, 0.86 + 0.04 * grit, 0.0

            t.piece(cx - hw - 0.006, cy - hw - 0.006, cx + hw + 0.006, cy + hw + 0.006, fn)
    return t, {"finish": {"ao_strength": 0.55}, "tone_range": (0.62, 0.995)}


# ---------------------------------------------------------------------------
# Grass: lawn (12 m), turf (31 m), meadow (52 m)
# ---------------------------------------------------------------------------

def grass_tile(name, W, seed, c1, c2, h1, h2, mow=0, clumps=None, flowers=False):
    t = Tile(name, W, W, 0.025 if name != "g-turf" else 0.015, seed=seed, ao_distance=0.03)
    rng = t.rng
    hmax = t.hmax

    def field(X, Y):
        broad = pnoise(X, Y, W, W, seed + 1, octaves=4, f0=6)
        mid = pnoise(X, Y, W, W, seed + 2, octaves=3, f0=W / 0.6, gain=0.6)
        fine = pnoise(X, Y, W, W, seed + 3, octaves=2, f0=W / 0.06, gain=0.9)
        z = 0.0025 + 0.0015 * broad
        tone = 0.90 + 0.012 * broad
        rough = 0.9 + 0.03 * fine
        if mow:
            stripe = np.sin(2 * math.pi * mow * X / W + 0.6 * broad)
            tone = tone + 0.018 * np.tanh(3 * stripe)
        zs, ids = layered_stones(
            X, Y, W,
            [(c1, h1 * 0.6, h1, 0.96, {"shape": 0.3, "power": 0.55, "jitter": 0.5}),
             (c2, h1 * 0.5, h2, 0.8, {"shape": 0.35, "power": 0.5, "jitter": 0.5})]
            + ([(clumps, h2 * 0.9, h2 * 1.5, 0.35, {"shape": 0.3, "power": 0.8, "jitter": 0.4})] if clumps else []),
            base_z=0.002,
        )
        m = ~np.isnan(zs)
        # Blades: fine streaks along each tuft.
        blade = 0.5 + 0.5 * np.sin(2 * math.pi * (X + 0.3 * Y) / (c1 * 0.22) + 5 * fine)
        z = np.where(m, np.maximum(zs * (0.86 + 0.14 * blade), z), z)
        tone = np.where(m, 0.93 + 0.062 * ids + 0.01 * blade + 0.012 * mid, tone)
        thin = sstep(0.9, 1.6, pnoise(X, Y, W, W, seed + 9, octaves=3, f0=W / 2.0, gain=0.6))
        tone = tone - 0.035 * thin
        z = z - thin * 0.004
        if flowers:
            lx, ly, r, (sx, sy) = cells(X, Y, 0.55, W, W, seed + 11)
            has = r(0) < 0.16
            rr = np.hypot(lx - (r(1) - 0.5) * sx * 0.6, ly - (r(2) - 0.5) * sy * 0.6)
            fl = has & (rr < 0.035)
            z = np.where(fl, z + 0.006, z)
            tone = np.where(fl, 0.995, tone)
        return z, tone, rough, 0.0

    t.base(field)
    return t, {"finish": {"ao_strength": 0.6}, "tone_range": (0.55, 0.995)}


@layer
def lawn():
    return grass_tile("g-lawn", 12.0, 3100, 0.10, 0.14, 0.014, 0.024, mow=4)


@layer
def turf():
    return grass_tile("g-turf", 31.0, 3200, 0.31, 0.41, 0.010, 0.016)


@layer
def meadow():
    return grass_tile("g-meadow", 52.0, 3300, 0.5, 0.69, 0.014, 0.025, clumps=1.3, flowers=True)
