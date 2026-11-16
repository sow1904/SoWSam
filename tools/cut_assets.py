# Cuts the map icons out of resources/assets.png (the author's sheet, made
# with Gemini; kept out of the repository) into assets/cities and assets/forts.
# The sheet has no transparency: the dark navy ground, its grid and its fake
# checkerboard are removed by flooding in from the edge of each box, so dark
# roofs inside an outline stay. Each icon is trimmed and halved in size.
# usage: python tools/cut_assets.py
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import pngio  # noqa: E402

NEAR = int(os.environ.get("NEAR", 7))
LINE = int(os.environ.get("LINE", 3))

ROOT = os.path.join(os.path.dirname(__file__), "..")
# name: (left, top, right, bottom) on the 2400 x 1792 sheet
BOXES = {
    "forts/fort": (40, 70, 560, 462),
    "cities/small": (650, 120, 1150, 462),
    "cities/large": (1215, 30, 1815, 462),
    "cities/palace": (1860, 30, 2370, 462),
    "forts/pass": (55, 550, 560, 975),
    "cities/port": (640, 580, 1160, 975),
    "cities/ruin": (1250, 590, 1760, 975),
    "forts/site": (1840, 620, 2360, 940),
}


# The sheet's ground: dark navy, its grid lines and the two tones of its fake
# checkerboard. Only colours close to one of these count, so slate roofs stay.
GROUND = np.array([(21, 25, 34), (35, 40, 46), (18, 22, 31), (24, 26, 38), (28, 32, 40)])


def ground(px, near=NEAR):
    rgb = px[..., :3].astype(int)
    d = np.abs(rgb[..., None, :] - GROUND[None, None, :, :]).max(axis=-1).min(axis=-1)
    return d <= near


def flood(cand):
    mask = np.zeros_like(cand)
    mask[0, :], mask[-1, :], mask[:, 0], mask[:, -1] = cand[0, :], cand[-1, :], cand[:, 0], cand[:, -1]
    while True:
        grow = mask.copy()
        grow[1:, :] |= mask[:-1, :]
        grow[:-1, :] |= mask[1:, :]
        grow[:, 1:] |= mask[:, :-1]
        grow[:, :-1] |= mask[:, 1:]
        grow &= cand
        if (grow == mask).all():
            return mask
        mask = grow


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


def main():
    sheet = pngio.read_png(os.path.join(ROOT, "resources", "assets.png"))
    for name, (x0, y0, x1, y1) in BOXES.items():
        px = sheet[y0:y1, x0:x1].copy()
        gone = flood(ground(px))
        # The grid lines vary more in colour than the ground. Eat a few pixels
        # further through anything dark and bluish: enough for a line, too
        # little to hollow a roof.
        rgb = px[..., :3].astype(int)
        r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        loose = (r < 60) & (g < 64) & (bl < 74) & (bl - r >= 3) & (bl - r <= 28) & (abs(g - r) <= 10)
        for _ in range(LINE):
            grow = gone.copy()
            grow[1:, :] |= gone[:-1, :]
            grow[:-1, :] |= gone[1:, :]
            grow[:, 1:] |= gone[:, :-1]
            grow[:, :-1] |= gone[:, 1:]
            gone |= grow & loose
        px[gone, 3] = 0
        keep = px[..., 3] > 0
        # Drop specks: keep rows and columns with a fair number of pixels.
        ys = np.where(keep.sum(axis=1) > 3)[0]
        xs = np.where(keep.sum(axis=0) > 3)[0]
        px = px[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
        out = halve(px)
        path = os.path.join(ROOT, "assets", name + ".png")
        pngio.write_png(path, out)
        print(name, out.shape[1], "x", out.shape[0], os.path.getsize(path) // 1024, "KB")


main()
