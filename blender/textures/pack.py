"""
Turns the baked .npy planes into the images the app loads (system Python + Pillow):
512 px JPEGs with full-resolution chroma, since R, G and B are separate data
channels that chroma subsampling would bleed into each other. The 1024 px
masters stay in blender/out/textures/masters as PNGs.

    python3 blender/textures/pack.py            # everything under blender/out/textures
    python3 blender/textures/pack.py --contact   # also a contact sheet for a look
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "blender", "out", "textures")
DST = os.path.join(ROOT, "public", "textures")
MASTERS = os.path.join(SRC, "masters")
SHIPPED = 512


def main():
    total = 0
    for group, target in (("model", "surfaces"), ("ground", "ground")):
        folder = os.path.join(SRC, group)
        if not os.path.isdir(folder):
            continue
        for f in sorted(os.listdir(folder)):
            if not f.endswith(".npy"):
                continue
            arr = np.load(os.path.join(folder, f))
            out = os.path.join(DST, target)
            os.makedirs(out, exist_ok=True)
            name = f[:-4]
            if name.endswith(".png"):
                name = name[:-4]
            if name.endswith(".metal"):
                base, img = name[: -len(".metal")] + ".metalness", Image.fromarray(arr[:, :, 0], "L")
            else:
                base, img = name, Image.fromarray(arr, "RGB")
            os.makedirs(os.path.join(MASTERS, target), exist_ok=True)
            img.save(os.path.join(MASTERS, target, base + ".png"), optimize=True)
            path = os.path.join(out, base + ".jpg")
            img.resize((SHIPPED, SHIPPED), Image.BOX).save(path, "JPEG", quality=92, subsampling=0, optimize=True)
            size = os.path.getsize(path)
            total += size
            print(f"{os.path.relpath(path, ROOT)}  {size / 1024:.0f} KB")
    print(f"total {total / 1024 / 1024:.2f} MB")


main()
