# Cuts the map icons out of resources/assets_ver2.png (the author's sheet, made
# with Gemini; kept out of the repository) into assets/cities and assets/forts.
# The sheet is drawn on a flat chroma green. Each pixel's opacity comes from
# how much greener it is than red and blue (the ground is about 150 greener,
# grass in the art at most about 40), and partly see-through pixels (smoke,
# edges) have the green taken back out of their colour. Each icon is trimmed and
# halved in size.
# usage: python tools/cut_assets.py
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import pngio  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
GREEN = np.array([8, 190, 36], float)
# Greenness (green less the brighter of red and blue): at or above GROUND
# the pixel is ground, at or below SOLID it is fully drawn.
GROUND, SOLID = 150, 40

ROW1, ROW2, ROW3 = (40, 445), (685, 1072), (1318, 1660)
# name: (left, right), (top, bottom) on the 2400 x 1792 sheet
BOXES = {
    "forts/fort": ((15, 546), ROW1),
    "forts/fort_ruin": ((572, 1010), ROW1),
    "forts/pass": ((1035, 1384), ROW1),
    "cities/port": ((1472, 1890), ROW1),
    "forts/site": ((1978, 2324), ROW1),
    "cities/c1": ((65, 366), ROW2),
    "cities/c2": ((413, 790), ROW2),
    "cities/c3": ((814, 1186), ROW2),
    "cities/c4": ((1214, 1587), ROW2),
    "cities/c5": ((1612, 1987), ROW2),
    "cities/palace": ((2008, 2389), ROW2),
    "cities/c1_ruin": ((39, 365), ROW3),
    "cities/c2_ruin": ((414, 790), ROW3),
    "cities/c3_ruin": ((814, 1184), ROW3),
    "cities/c4_ruin": ((1216, 1585), ROW3),
    "cities/c5_ruin": ((1618, 1986), ROW3),
    "cities/palace_ruin": ((2012, 2389), ROW3),
}
# Smoke drawn with a green cast: on these, every pixel loses its spill.
SMOKY = {"forts/fort_ruin", "cities/c5_ruin", "cities/palace_ruin"}
# The generator's mark in the lower right corner, beside the ruined palace.
MARK = (2225, 1612, 2340, 1720)


def halve(img):
    h, w = img.shape[0] // 2 * 2, img.shape[1] // 2 * 2
    f = img[:h, :w].astype(float)
    a = f[..., 3:4] / 255
    rgb = (f[..., :3] * a).reshape(h // 2, 2, w // 2, 2, 3).sum(axis=(1, 3))
    al = a.reshape(h // 2, 2, w // 2, 2, 1).sum(axis=(1, 3))
    out = np.zeros((h // 2, w // 2, 4))
    out[..., :3] = np.where(al > 0, rgb / np.maximum(al, 1e-6), 0)
    out[..., 3] = al[..., 0] / 4 * 255
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def key(px, smoky=False):
    rgb = px[..., :3].astype(float)
    gs = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    a = np.clip((GROUND - gs) / (GROUND - SOLID), 0, 1)
    # Take the green back out: c = a * fg + (1 - a) * green.
    fg = (rgb - (1 - a[..., None]) * GREEN) / np.maximum(a[..., None], 1e-3)
    # What is left of the green in a see-through pixel is spill: no channel
    # of it may be greener than the brighter of red and blue.
    soft = np.ones_like(a, bool) if smoky else a < 1
    g = fg[..., 1]
    fg[..., 1] = np.where(soft, np.minimum(g, np.maximum(fg[..., 0], fg[..., 2])), g)
    out = np.zeros(px.shape, float)
    out[..., :3] = np.clip(fg, 0, 255)
    out[..., 3] = a * 255
    return np.round(out).astype(np.uint8)


def main():
    sheet = pngio.read_png(os.path.join(ROOT, "resources", "assets_ver2.png"))
    x0, y0, x1, y1 = MARK
    sheet[y0:y1, x0:x1, :3] = GREEN
    for name, ((l, r), (t, b)) in BOXES.items():
        px = key(sheet[t:b, l:r], name in SMOKY)
        keep = px[..., 3] > 60
        ys = np.where(keep.sum(axis=1) > 3)[0]
        xs = np.where(keep.sum(axis=0) > 3)[0]
        px = px[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
        out = halve(px)
        path = os.path.join(ROOT, "assets", name + ".png")
        pngio.write_png(path, out)
        print(name, out.shape[1], "x", out.shape[0], os.path.getsize(path) // 1024, "KB")


main()
