"""Moves the field positions of one sheet onto a lookalike sheet that has no form fields.
Usage: match_layout.py reference.pdf target.pdf layout.json out.json [pages]
Each field's surroundings are looked up in the target page image, and the field is placed where they match best."""
import json, subprocess, sys, os, tempfile
import numpy as np
from PIL import Image

ref_pdf, tgt_pdf, layout_json, out_json = sys.argv[1:5]
S = 2  # pixels per point
tmp = tempfile.mkdtemp()
def render(pdf, tag):
    subprocess.run(["pdftoppm", "-r", str(72 * S), "-gray", "-png", pdf, f"{tmp}/{tag}"], check=True, capture_output=True)
    files = sorted(f for f in os.listdir(tmp) if f.startswith(tag))
    return [np.asarray(Image.open(f"{tmp}/{f}"), dtype=np.float32) for f in files]
ref, tgt = render(ref_pdf, "ref"), render(tgt_pdf, "tgt")
widgets = json.load(open(layout_json))
H = ref[0].shape[0]
out = []
for w in widgets:
    p = w["p"]
    if p >= len(tgt) or p >= len(ref):
        continue
    x0, x1 = int(w["x"] * S), int((w["x"] + w["w"]) * S)
    y0, y1 = int(H - (w["y"] + w["h"]) * S), int(H - w["y"] * S)
    m = 14 * S
    a, b, c, d = max(0, x0 - m), min(ref[p].shape[1], x1 + m), max(0, y0 - m), min(H, y1 + m)
    patch = ref[p][c:d, a:b]
    best = (1e18, 0, 0)
    R = 60 * S
    for dy in range(-R, R + 1, 2):
        for dx in range(-R, R + 1, 2):
            ya, xa = c + dy, a + dx
            if ya < 0 or xa < 0 or ya + patch.shape[0] > tgt[p].shape[0] or xa + patch.shape[1] > tgt[p].shape[1]:
                continue
            err = np.abs(tgt[p][ya:ya + patch.shape[0], xa:xa + patch.shape[1]] - patch).mean()
            if err < best[0]:
                best = (err, dx, dy)
    # refine to single pixels
    err0, dx0, dy0 = best
    for dy in range(dy0 - 2, dy0 + 3):
        for dx in range(dx0 - 2, dx0 + 3):
            ya, xa = c + dy, a + dx
            if ya < 0 or xa < 0 or ya + patch.shape[0] > tgt[p].shape[0] or xa + patch.shape[1] > tgt[p].shape[1]:
                continue
            err = np.abs(tgt[p][ya:ya + patch.shape[0], xa:xa + patch.shape[1]] - patch).mean()
            if err < best[0]:
                best = (err, dx, dy)
    n = dict(w)
    n["x"] = round(w["x"] + best[1] / S, 1)
    n["y"] = round(w["y"] - best[2] / S, 1)
    n["e"] = round(float(best[0]), 1)
    out.append(n)
json.dump(out, open(out_json, "w"), separators=(",", ":"))
print(len(out), "fields placed; worst match error", max(o["e"] for o in out))
