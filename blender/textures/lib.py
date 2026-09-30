"""
Tools for baking the city's tiling surface textures in Blender.

A layer is MODELLED as real triangle meshes (heightfield pieces: a brick, a
plank, a roof tile, a leaf) laid out on a tile of a given physical size in
metres, then the tile's 3x3 neighbourhood is instanced by copying every piece
that reaches past an edge, so ambient occlusion, overlaps and depth are
correct across the seam. Cycles then renders the tile straight down through an
orthographic camera three times:

    height   Z / hmax  (the relief channel; hmax is the shader's bump range)
    ao       ambient occlusion
    params   per-vertex tone / roughness / metalness written by the pieces

`finish()` combines them into the layout the shaders sample. Everything is
periodic by construction: noise is a sum of integer harmonics over the tile,
scatters hash cell ids modulo the tile's cell count, and pieces are copied
across edges.
"""

import math
import os

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "blender", "out", "textures")
RES = 1024
MIN_WAVELENGTH = [0.0]  # set by Tile: shorter waves than this alias in the mesh
HIDDEN = -0.05  # metres below the tile: vertices of a piece's padding ring


# ---------------------------------------------------------------------------
# Numpy helpers: periodic noise, hashing, shapes
# ---------------------------------------------------------------------------

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def pnoise(X, Y, w, h, seed, octaves=4, f0=2.0, gain=0.55, lac=2.0, comps=10, stretch=(1.0, 1.0)):
    """Smooth noise with unit standard deviation that tiles over w x h.

    Low octaves are sums of integer harmonics of the tile (they wrap exactly);
    fine octaves are periodic value noise, because a handful of plane waves
    shows up as hatching. `f0` is the number of features across the tile at
    the first octave; harmonics finer than the mesh can resolve are folded
    down to what it can."""
    rng = np.random.default_rng(seed)
    kmax = 1.0 / MIN_WAVELENGTH[0]  # cycles per metre the mesh can resolve
    out = np.zeros(X.shape, np.float32)
    total = 0.0
    amp = 1.0
    f = f0
    tx = (2 * math.pi / w) * X.astype(np.float32)
    ty = (2 * math.pi / h) * Y.astype(np.float32)
    for octave in range(octaves):
        if f >= 20:
            nx = max(2, min(int(round(f * stretch[0] * 1.3)), int(w * kmax * 1.3)))
            ny = max(2, min(int(round(f * stretch[1] * 1.3)), int(h * kmax * 1.3)))
            field = vnoise(X, Y, w, h, seed * 131 + octave, nx, ny) / 0.43
        else:
            field = np.zeros(X.shape, np.float32)
            for _ in range(comps):
                ang = rng.uniform(0, 2 * math.pi)
                a = int(round(f * stretch[0] * math.cos(ang)))
                b = int(round(f * stretch[1] * math.sin(ang)))
                if a == 0 and b == 0:
                    a = 1
                freq = math.hypot(a / w, b / h)
                if freq > kmax:
                    a, b = int(round(a * kmax / freq)), int(round(b * kmax / freq))
                    if a == 0 and b == 0:
                        a = 1
                field += np.sin(a * tx + b * ty + rng.uniform(0, 2 * math.pi))
            field /= math.sqrt(comps / 2)
        out += amp * field
        total += amp * amp
        amp *= gain
        f *= lac
    return out / math.sqrt(total)


def vnoise(X, Y, w, h, seed, nx, ny):
    """Periodic value noise on an nx x ny lattice, smoothstep-interpolated.
    Standard deviation about 0.43."""
    gx = X.astype(np.float32) * (nx / w)
    gy = Y.astype(np.float32) * (ny / h)
    fx, fy = np.floor(gx), np.floor(gy)
    tx, ty = gx - fx, gy - fy
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    ix0, iy0 = np.mod(fx, nx), np.mod(fy, ny)
    ix1, iy1 = np.mod(fx + 1, nx), np.mod(fy + 1, ny)
    c = lambda i, j: hash01(i, j, seed, 3) * 2.0 - 1.0
    top = c(ix0, iy0) * (1 - tx) + c(ix1, iy0) * tx
    bottom = c(ix0, iy1) * (1 - tx) + c(ix1, iy1) * tx
    return top * (1 - ty) + bottom * ty


def hash01(ix, iy, seed, k=0):
    """Deterministic hash of integer cell ids to [0, 1)."""
    with np.errstate(over="ignore"):
        x = (
            np.asarray(ix).astype(np.uint32) * np.uint32(374761393)
            + np.asarray(iy).astype(np.uint32) * np.uint32(668265263)
            + np.uint32((seed * 2246822519 + k * 3266489917) & 0xFFFFFFFF)
        )
        x = (x ^ (x >> np.uint32(13))) * np.uint32(1274126177)
        x = x ^ (x >> np.uint32(16))
        x = x * np.uint32(2246822519)
        x = x ^ (x >> np.uint32(15))
    return (x.astype(np.float64) / 4294967296.0).astype(np.float32)


def rrect(X, Y, cx, cy, hw, hh, r=0.0):
    """Distance to the edge of a rounded rectangle, positive inside."""
    qx = np.abs(X - cx) - (hw - r)
    qy = np.abs(Y - cy) - (hh - r)
    outside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return -outside


def rounded(d, b):
    """A quarter-round edge: 0 at the edge, 1 once `b` inside it."""
    p = np.clip(d / b, 0.0, 1.0)
    return np.sqrt(1.0 - (1.0 - p) ** 2)


def chamfer(d, b):
    return np.clip(d / b, 0.0, 1.0)


def dome(r2, power=1.0):
    """1 at the centre, 0 at r2 = 1 (r2 is squared normalised radius)."""
    return np.clip(1.0 - r2, 0.0, 1.0) ** power


def seg_dist(X, Y, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    l2 = dx * dx + dy * dy + 1e-12
    t = np.clip(((X - x0) * dx + (Y - y0) * dy) / l2, 0, 1)
    return np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))


def polyline_dist(X, Y, pts):
    d = np.full(X.shape, 1e9, np.float32)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        d = np.minimum(d, seg_dist(X, Y, x0, y0, x1, y1))
    return d


def polyline_local(X, Y, pts, reach):
    """Like polyline_dist but only evaluated near each segment (distance is
    `reach` far from every segment), so long cracks stay cheap."""
    out = np.full(X.shape, reach, np.float32)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        m = (X > min(x0, x1) - reach) & (X < max(x0, x1) + reach) & (Y > min(y0, y1) - reach) & (Y < max(y0, y1) + reach)
        if m.any():
            d = seg_dist(X[m], Y[m], x0, y0, x1, y1)
            out[m] = np.minimum(out[m], d)
    return out


def wrapped_polyline(X, Y, pts, w, h, reach):
    """Distance to a polyline drawn in unwrapped coordinates, tiled over w x h."""
    out = np.full(X.shape, reach, np.float32)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            sh = [(x + i * w, y + j * h) for x, y in pts]
            if max(x for x, _ in sh) < -reach or min(x for x, _ in sh) > w + reach:
                continue
            if max(y for _, y in sh) < -reach or min(y for _, y in sh) > h + reach:
                continue
            out = np.minimum(out, polyline_local(X, Y, sh, reach))
    return out


def random_walk(rng, x, y, angle, length, step, wobble=0.35, drift=0.0):
    pts = [(x, y)]
    n = int(length / step)
    for _ in range(n):
        angle += rng.normal(drift, wobble)
        x += step * math.cos(angle)
        y += step * math.sin(angle)
        pts.append((x, y))
    return pts


def cells(X, Y, size, w, h, seed):
    """Hash-scatter frame: each point's own cell of a periodic grid.

    Returns (lx, ly, r) with local coordinates from the cell centre and r a
    function r(k) giving hashed values in [0, 1) for that cell."""
    nx = int(round(w / size))
    ny = int(round(h / size))
    sx, sy = w / nx, h / ny
    fx = np.floor(X / sx)
    fy = np.floor(Y / sy)
    ix = np.mod(fx, nx)
    iy = np.mod(fy, ny)
    lx = X - (fx + 0.5) * sx
    ly = Y - (fy + 0.5) * sy
    return lx, ly, (lambda k: hash01(ix, iy, seed, k)), (sx, sy)


def worley(X, Y, size, w, h, seed):
    """Distances to the nearest and second-nearest feature point of a periodic
    jittered grid; F2 - F1 is small along the borders of the cells."""
    n, m = int(round(w / size)), int(round(h / size))
    sx, sy = w / n, h / m
    fx, fy = np.floor(X / sx), np.floor(Y / sy)
    f1 = np.full(X.shape, 1e9, np.float32)
    f2 = np.full(X.shape, 1e9, np.float32)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cx, cy = fx + dx, fy + dy
            ix, iy = np.mod(cx, n), np.mod(cy, m)
            px = (cx + 0.1 + 0.8 * hash01(ix, iy, seed, 0)) * sx
            py = (cy + 0.1 + 0.8 * hash01(ix, iy, seed, 1)) * sy
            d = np.hypot(X - px, Y - py)
            f2 = np.minimum(f2, np.maximum(f1, d))
            f1 = np.minimum(f1, d)
    return f1, f2


def wrap_delta(a, b, period):
    d = a - b
    return d - period * np.round(d / period)


# ---------------------------------------------------------------------------
# The tile: pieces in, one mesh out
# ---------------------------------------------------------------------------

class Tile:
    """A w x h metre tile to model. `hmax` is the height (metres) that maps to
    1.0 in the relief channel: the shader's bump range for the layer."""

    def __init__(self, name, w, h, hmax, margin=0.05, res=RES, seed=1, density=1.4, ao_distance=None):
        self.name = name
        self.w, self.h, self.hmax = w, h, hmax
        self.res = res
        # Render at the final resolution across each side, up to 1.5x it along a
        # long one (the last step is a box filter down to the square file).
        self.rx = res if h >= w else int(min(res * w / h, res * 1.5))
        self.ry = res if w >= h else int(min(res * h / w, res * 1.5))
        self.px = w / self.rx  # metres per rendered pixel, across
        self.py = h / self.ry
        self.step = self.px * density
        self.step_y = self.py * density
        MIN_WAVELENGTH[0] = max(self.step, self.step_y) * 4.0
        self.mx, self.my = margin * w, margin * h
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self.ao_distance = ao_distance or hmax * 1.6
        self._verts = []
        self._quads = []
        self._count = 0

    # -- pieces -----------------------------------------------------------

    def _emit(self, X, Y, z, tone, rough, metal, shifts):
        ny, nx = X.shape
        visible = ~np.isnan(z)
        z = np.where(visible, z, HIDDEN).astype(np.float32)
        tone = np.broadcast_to(np.asarray(tone, np.float32), X.shape)
        rough = np.broadcast_to(np.asarray(rough, np.float32), X.shape)
        metal = np.broadcast_to(np.asarray(metal, np.float32), X.shape)
        vid = np.arange(nx * ny, dtype=np.int32).reshape(ny, nx)
        quad = np.stack([vid[:-1, :-1], vid[:-1, 1:], vid[1:, 1:], vid[1:, :-1]], axis=-1).reshape(-1, 4)
        vis = visible.ravel()
        keep = vis[quad].any(axis=1)
        quad = quad[keep]
        base = np.stack([X.ravel(), Y.ravel(), z.ravel(), tone.ravel(), rough.ravel(), metal.ravel()], axis=1).astype(np.float32)
        for sx, sy in shifts:
            v = base.copy()
            v[:, 0] += sx
            v[:, 1] += sy
            self._verts.append(v)
            self._quads.append(quad + self._count)
            self._count += len(v)

    def _shifts(self, xmin, xmax, ymin, ymax, wrap):
        if not wrap:
            return [(0.0, 0.0)]
        out = []
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                if (
                    xmax + i * self.w >= -self.mx and xmin + i * self.w <= self.w + self.mx
                    and ymax + j * self.h >= -self.my and ymin + j * self.h <= self.h + self.my
                ):
                    out.append((i * self.w, j * self.h))
        return out

    def piece(self, x0, y0, x1, y1, fn, wrap=True, step=None):
        """A heightfield over the box. fn(X, Y) -> (z, tone, rough, metal);
        z is NaN where the piece is absent. Copied across edges when it
        reaches them. The box is padded by one cell so the piece closes."""
        s = step or self.step
        sy_ = step or self.step_y
        nx = max(3, int(math.ceil((x1 - x0) / s)) + 3)
        ny = max(3, int(math.ceil((y1 - y0) / sy_)) + 3)
        sx = (x1 - x0) / (nx - 3)
        sy = (y1 - y0) / (ny - 3)
        xs = x0 - sx + np.arange(nx) * sx
        ys = y0 - sy + np.arange(ny) * sy
        X, Y = np.meshgrid(xs, ys)
        z, tone, rough, metal = fn(X, Y)
        pad = np.zeros(X.shape, bool)
        pad[0, :] = pad[-1, :] = pad[:, 0] = pad[:, -1] = True
        z = np.where(pad, np.nan, z)
        self._emit(X, Y, z, tone, rough, metal, self._shifts(x0, x1, y0, y1, wrap))

    def oriented(self, cx, cy, angle, lx, ly, fn, wrap=True, step=None):
        """A piece in its own frame: fn(U, V) with U along the piece (length
        lx), V across it (width ly), centred on (cx, cy), turned by `angle`."""
        s = step or max(self.step, self.step_y)
        nx = max(3, int(math.ceil(lx / s)) + 3)
        ny = max(3, int(math.ceil(ly / s)) + 3)
        sx = lx / (nx - 3)
        sy = ly / (ny - 3)
        us = -lx / 2 - sx + np.arange(nx) * sx
        vs = -ly / 2 - sy + np.arange(ny) * sy
        U, V = np.meshgrid(us, vs)
        z, tone, rough, metal = fn(U, V)
        pad = np.zeros(U.shape, bool)
        pad[0, :] = pad[-1, :] = pad[:, 0] = pad[:, -1] = True
        z = np.where(pad, np.nan, z)
        c, sn = math.cos(angle), math.sin(angle)
        X = cx + U * c - V * sn
        Y = cy + U * sn + V * c
        reach = 0.5 * math.hypot(lx, ly)
        self._emit(X, Y, z, tone, rough, metal, self._shifts(cx - reach, cx + reach, cy - reach, cy + reach, wrap))

    def base(self, fn):
        """The whole tile plus its margin, evaluated once (fn must be periodic)."""
        x0, x1 = -self.mx, self.w + self.mx
        y0, y1 = -self.my, self.h + self.my
        nx = int(math.ceil((x1 - x0) / self.step)) + 1
        ny = int(math.ceil((y1 - y0) / self.step_y)) + 1
        X, Y = np.meshgrid(np.linspace(x0, x1, nx), np.linspace(y0, y1, ny))
        z, tone, rough, metal = fn(X, Y)
        self._emit(X, Y, z, tone, rough, metal, [(0.0, 0.0)])

    # -- rendering --------------------------------------------------------

    def build_mesh(self):
        V = np.concatenate(self._verts)
        Q = np.concatenate(self._quads)
        self._verts.clear()
        self._quads.clear()
        print(f"[{self.name}] {len(V):,} vertices, {len(Q):,} quads")
        mesh = bpy.data.meshes.new(self.name)
        mesh.vertices.add(len(V))
        mesh.vertices.foreach_set("co", V[:, :3].ravel())
        mesh.loops.add(len(Q) * 4)
        mesh.polygons.add(len(Q))
        mesh.loops.foreach_set("vertex_index", Q.ravel())
        mesh.polygons.foreach_set("loop_start", np.arange(0, len(Q) * 4, 4, dtype=np.int32))
        mesh.update(calc_edges=True)
        attr = mesh.color_attributes.new("TP", "FLOAT_COLOR", "POINT")
        rgba = np.ones((len(V), 4), np.float32)
        rgba[:, :3] = V[:, 3:6]
        attr.data.foreach_set("color", rgba.ravel())
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    def render_all(self):
        obj = self.build_mesh()
        scene = bpy.context.scene
        setup_scene(scene, self)
        results = {}
        for kind in ("height", "ao", "params"):
            mat = pass_material(kind, self)
            obj.data.materials.clear()
            obj.data.materials.append(mat)
            path = os.path.join(OUT, f"{self.name}-{kind}.exr")
            scene.render.filepath = path
            scene.cycles.samples = {"height": 24, "params": 24, "ao": self.ao_samples}[kind]
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            w, h = img.size
            px = np.empty(w * h * 4, np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            results[kind] = px.reshape(h, w, 4)[:, :, :3]
        bpy.data.objects.remove(obj)
        return results

    ao_samples = 40


def setup_scene(scene, tile):
    scene.render.engine = "CYCLES"
    cy = scene.cycles
    cy.device = "GPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
    except Exception as e:  # falls back to CPU
        print("GPU unavailable:", e)
        cy.device = "CPU"
    cy.use_denoising = False
    cy.max_bounces = 0
    cy.filter_width = 1.2
    scene.render.resolution_x = tile.rx
    scene.render.resolution_y = tile.ry
    # Non-square pixels when one side is capped: the frame stays w : h.
    scene.render.pixel_aspect_x = max(1.0, tile.px / tile.py)
    scene.render.pixel_aspect_y = max(1.0, tile.py / tile.px)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Raw"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(tile.w, tile.h)
    cam_data.clip_start = 0.01
    cam_data.clip_end = 20
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (tile.w / 2, tile.h / 2, 5.0)
    cam.rotation_euler = (0, 0, 0)
    bpy.context.scene.collection.objects.link(cam)
    scene.camera = cam


def pass_material(kind, tile):
    mat = bpy.data.materials.new(f"{tile.name}-{kind}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    if kind == "height":
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 1.0 / tile.hmax
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
        nt.links.new(sep.outputs["Z"], mul.inputs[0])
        for name in ("X", "Y", "Z"):
            nt.links.new(mul.outputs["Value"], comb.inputs[name])
        nt.links.new(comb.outputs["Vector"], emit.inputs["Color"])
    elif kind == "ao":
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Distance"].default_value = tile.ao_distance
        ao.samples = 4
        nt.links.new(ao.outputs["Color"], emit.inputs["Color"])
        ao.inputs["Color"].default_value = (1, 1, 1, 1)
    else:
        col = nt.nodes.new("ShaderNodeVertexColor")
        col.layer_name = "TP"
        nt.links.new(col.outputs["Color"], emit.inputs["Color"])
    return mat


# ---------------------------------------------------------------------------
# Combining the passes into the shaders' channel layout
# ---------------------------------------------------------------------------

def resample_axis(a, n_out, axis):
    """Box-filter (area average) resample of one axis to n_out samples."""
    n_in = a.shape[axis]
    if n_in == n_out:
        return a
    edges_in = np.linspace(0, n_in, n_in + 1)
    edges_out = np.linspace(0, n_in, n_out + 1)
    W = np.zeros((n_out, n_in), np.float64)
    for i in range(n_out):
        lo, hi = edges_out[i], edges_out[i + 1]
        j0, j1 = int(math.floor(lo)), int(math.ceil(hi))
        for j in range(j0, min(j1, n_in)):
            W[i, j] = max(0.0, min(hi, j + 1) - max(lo, j))
    W /= W.sum(axis=1, keepdims=True)
    return np.moveaxis(np.tensordot(W, np.moveaxis(a, axis, 0), axes=(1, 0)), 0, axis)


def to_square(a):
    a = resample_axis(a, RES, 0)
    return resample_axis(a, RES, 1)


def save_png(path, rgb01):
    """rgb01: (RES, RES, 3) floats in [0, 1], row 0 = TOP of the image."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    arr = np.clip(np.round(rgb01[::-1] * 255.0), 0, 255).astype(np.uint8)
    np.save(path[:-4] + ".npy", arr)


def finish_model(passes, stats, ao_strength=0.4, tone_range=(0.70, 0.995), grain=0.004, seed=7):
    """Returns (rgb uint-ish float array in file layout, diagnostics).

    file layout: R = albedo multiplier, G = roughness, B = height."""
    H = to_square(passes["height"][:, :, 0])
    AO = to_square(passes["ao"][:, :, 0])
    P = to_square(passes["params"])
    yy, xx = np.mgrid[0:RES, 0:RES].astype(np.float32)
    g = pnoise(xx / RES, yy / RES, 1.0, 1.0, seed, octaves=2, f0=180, gain=0.9)
    tone = P[:, :, 0] * (1.0 - ao_strength * (1.0 - AO)) * (1.0 + grain * g)
    rough = P[:, :, 1] * (1.0 + 0.10 * (1.0 - AO))
    metal = P[:, :, 2]
    return H, tone, rough, metal, AO


def match_mean(x, target, lo, hi):
    y = np.clip(x, lo, hi)
    for _ in range(8):  # clipping moves the mean; walk it back
        x = x + (target - y.mean())
        y = np.clip(x, lo, hi)
    return y
