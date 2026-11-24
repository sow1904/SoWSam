# Cuts the map icons of the fourth painting (map4, ink and colour) out of
# resources/map4_assets.png (the author's sheet, made with Gemini; kept out
# of the repository) into assets/map4/icons/{cities,forts,ui}. The sheet is
# drawn on a lighter chroma green than the first (tools/cut_assets.py): the
# ground is about 78 greener than red and blue, grass in the art at most
# about 35. Each icon is trimmed and halved in size.
# usage: python tools/cut_assets4.py
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import pngio  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
GREEN = np.array([143, 221, 110], float)
GROUND, SOLID = 72, 35

COLS = [(0, 448), (448, 896), (896, 1344), (1344, 1792)]
ROWS = [(0, 410), (480, 855), (948, 1330), (1425, 1805)]
GRID = [
    ["forts/fort", "forts/fort_ruin", "forts/pass", "forts/pass_ruin"],
    ["cities/c1", "cities/c1_ruin", "cities/c2", "cities/c2_ruin"],
    ["cities/c3", "cities/c3_ruin", "cities/c4", "cities/c4_ruin"],
    ["cities/c5", "cities/c5_ruin", "cities/palace", "cities/palace_ruin"],
]
# name: (left, right), (top, bottom) on the 1792 x 2400 sheet
BOXES = {name: (COLS[c], ROWS[r]) for r, row in enumerate(GRID) for c, name in enumerate(row)}
BOXES["forts/pass"] = ((920, 1344), ROWS[0])  # clear of the ruined fort's smoke
BOXES.update({
    "cities/port": ((40, 610), (1905, 2305)),
    "forts/site": ((660, 1145), (1905, 2305)),
    "ui/flag_white": ((1370, 1745), (1905, 2290)),
})
SMOKY = {"forts/fort_ruin", "forts/pass_ruin", "cities/c2_ruin", "cities/c3_ruin", "cities/c4_ruin", "cities/c5_ruin", "cities/palace_ruin"}
# The generator's mark in the lower right corner, beside the white flag.
MARK = (1620, 2225, 1750, 2345)


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
    fg = (rgb - (1 - a[..., None]) * GREEN) / np.maximum(a[..., None], 1e-3)
    soft = np.ones_like(a, bool) if smoky else a < 1
    g = fg[..., 1]
    fg[..., 1] = np.where(soft, np.minimum(g, np.maximum(fg[..., 0], fg[..., 2])), g)
    out = np.zeros(px.shape, float)
    out[..., :3] = np.clip(fg, 0, 255)
    out[..., 3] = a * 255
    return np.round(out).astype(np.uint8)


def main():
    sheet = pngio.read_png(os.path.join(ROOT, "resources", "map4_assets.png"))
    x0, y0, x1, y1 = MARK
    sheet[y0:y1, x0:x1, :3] = GREEN
    for name, ((l, r), (t, b)) in BOXES.items():
        px = key(sheet[t:b, l:r], name in SMOKY)
        keep = px[..., 3] > 60
        ys = np.where(keep.sum(axis=1) > 3)[0]
        xs = np.where(keep.sum(axis=0) > 3)[0]
        px = px[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
        out = halve(px)
        path = os.path.join(ROOT, "assets", "map4", "icons", name + ".png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        pngio.write_png(path, out)
        print(name, out.shape[1], "x", out.shape[0], os.path.getsize(path) // 1024, "KB")


main()
