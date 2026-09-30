"""
Lit previews of baked layers (system Python): albedo multiplier x a palette
colour, relief lit from the upper left through the height channel, roughness
as a sheen. Usage: python3 preview.py <out.png> <bump metres> <tile metres> <colour hex> <a.png> [b.png ...]
Tiles each image 2x2 and puts them side by side.
"""
import sys

import numpy as np
from PIL import Image


def shade(path, bump, tile, colour, reps=2, size=512):
    a = np.asarray(Image.open(path).convert("RGB"), np.float32) / 255.0
    if a.shape[0] != size:
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((size, size), Image.BOX), np.float32) / 255.0
    a = np.tile(a, (reps, reps, 1))
    tone, rough, height = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    px = tile / size  # metres per pixel
    gy, gx = np.gradient(height * bump, px)
    n = np.stack([-gx, gy, np.ones_like(gx)], axis=-1)  # image y is down
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    light = np.array([-0.5, 0.6, 0.62]); light /= np.linalg.norm(light)
    lam = np.clip(n @ light, 0, 1)
    h = (light + np.array([0, 0, 1.0])); h /= np.linalg.norm(h)
    spec = np.clip(n @ h, 0, 1) ** (2 + 60 * (1 - rough)) * (1 - rough) * 0.4
    col = np.array([int(colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]) ** 2.2
    img = (col[None, None, :] * tone[:, :, None]) * (0.35 + 0.75 * lam[:, :, None]) + spec[:, :, None]
    return np.clip(img, 0, 1) ** (1 / 2.2)


def main():
    out, bump, tile, colour, *paths = sys.argv[1:]
    tiles = [shade(p, float(bump), float(tile), colour) for p in paths]
    sheet = np.concatenate(tiles, axis=1)
    Image.fromarray((sheet * 255).astype(np.uint8)).save(out)


main()
