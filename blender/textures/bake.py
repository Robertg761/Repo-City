"""
Bakes the tiling surface textures.

    blender -b --python blender/textures/bake.py -- brick stone ...   (or `models` / `ground` / `all`)

Writes blender/out/textures/<set>/<name>.npy (uint8 RGB, row 0 = top); the
system-Python `pack.py` turns those into the PNGs under public/textures.
Model layers are R = albedo multiplier (AO included), G = roughness,
B = height, with the metalness of the few layers that have any as a second
grey plane.
"""

import json
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib

import lib
import model_layers
import ground_layers

importlib.reload(lib)

STATS = json.load(open(os.path.join(lib.ROOT, "blender", "textures", "procedural-stats.json")))


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def report(name, arrs):
    print("REPORT", name, {k: (round(float(v.mean()), 3), round(float(v.std()), 3)) for k, v in arrs.items()})


def bake_model(name):
    fresh()
    tile, opts = model_layers.LAYERS[name]()
    passes = tile.render_all()
    H, tone, rough, metal, AO = lib.finish_model(passes, STATS, **opts.get("finish", {}))
    st = STATS["model"][name]
    lo, hi = opts.get("tone_range", (0.70, 0.995))
    tone = lib.match_mean(tone, st["mean"][0], lo, hi)
    rough = lib.match_mean(rough, st["mean"][1], 0.03, 1.0)
    height = np.clip(H, 0, 1)
    report(name, {"tone": tone, "rough": rough, "height": height, "ao": AO, "metal": metal})
    rgb = np.stack([tone, rough, height], axis=-1)
    os.makedirs(os.path.join(lib.OUT, "model"), exist_ok=True)
    lib.save_png(os.path.join(lib.OUT, "model", name + ".png"), rgb)
    if opts.get("metal"):
        m = np.clip(metal, 0, 1)
        lib.save_png(os.path.join(lib.OUT, "model", name + ".metal.png"), np.stack([m, m, m], axis=-1))


def bake_ground(name):
    fresh()
    tile, opts = ground_layers.LAYERS[name]()
    passes = tile.render_all()
    H, tone, rough, metal, AO = lib.finish_model(passes, STATS, **opts.get("finish", {}))
    st = STATS["ground"][name]
    lo, hi = opts.get("tone_range", (0.62, 0.995))
    tone = lib.match_mean(tone, float(np.mean(st["color"]["mean"][:3])), lo, hi)
    # Relief roughness is a multiplier on the material's roughness.
    rough = lib.match_mean(rough, st["relief"]["mean"][1], 0.4, 1.0)
    height = np.clip(H, 0, 1)
    report(name, {"tone": tone, "rough": rough, "height": height, "ao": AO})
    rgb = np.stack([tone, rough, height], axis=-1)
    os.makedirs(os.path.join(lib.OUT, "ground"), exist_ok=True)
    lib.save_png(os.path.join(lib.OUT, "ground", name + ".png"), rgb)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    names = []
    for a in args:
        if a in ("models", "all"):
            names += [("model", n) for n in model_layers.LAYERS]
        if a in ("ground", "all"):
            names += [("ground", n) for n in ground_layers.LAYERS]
        if a in model_layers.LAYERS:
            names.append(("model", a))
        if a.startswith("g:") and a[2:] in ground_layers.LAYERS:
            names.append(("ground", a[2:]))
    for kind, n in names:
        (bake_model if kind == "model" else bake_ground)(n)


main()
