"""Textures for the Pixel FX gallery's mesh and flipbook effects, written to public/textures/pixelfx/.

    python3 examples/scripts/pixelfx/make_textures.py [--flame <torch-flame.png> <torch-flame.json>]

Needs numpy and Pillow. Two kinds of texture come out of it:

* Flipbooks traced from pixelfx (https://github.com/patch-gg/pixelfx, MIT). `parts/torch-flame.js` is the
  torch's own flame with everything but the tongues turned off; render it with pixelfx's tools
  (`node tools/render.mjs parts/torch-flame --sheet` after copying it to src/fx/parts/) and pass the sheet
  with --flame. Each frame is de-pixelized: premultiplied, upscaled, blurred by about half a source pixel,
  then its alpha edge tightened so the outlines come out as clean curves in the original colours.
* Maps drawn here from the same formulas the pixel effects use, at full resolution: the fire tornado's
  spiral band (pixelfx fire/fire-tornado), the force field's hex shell (pixelfx scifi/force-field, after
  Sprite Fusion's shield, https://www.spritefusion.com/pixel-art-vfx/shield, MIT) and a wrapping noise.

Without --flame the flipbook already in public/ is left alone.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'textures', 'pixelfx')
TAU = np.pi * 2


def hexrgb(h):
    v = int(h.lstrip('#'), 16)
    return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255], np.float32) / 255


def save(name, rgba):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, optimize=True)
    print(path, rgba.shape[1], 'x', rgba.shape[0])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, s, wrap=False):
    """Separable Gaussian, numpy only; `wrap` treats the image as tiling."""
    r = int(s * 3) + 1
    x = np.arange(-r, r + 1)
    g = np.exp(-(x * x) / (2 * s * s))
    g /= g.sum()
    for axis in (0, 1):
        if wrap:
            a = sum(w * np.roll(a, int(k), axis) for k, w in zip(x, g))
        else:
            a = np.apply_along_axis(lambda v: np.convolve(v, g, 'same'), axis, a)
    return a


# ---- flipbooks from pixel art ----


def flame_atlas(png, meta, scale=8, soft=0.25):
    """The torch flame, each frame padded to a square (bottom-aligned) and de-pixelized."""
    img = np.asarray(Image.open(png).convert('RGBA')).astype(np.float32) / 255
    info = json.load(open(meta))['meta']['pixelfx']
    fw, fh = info['frameSize']
    cols, n = info['columns'], info['frames']
    # Crop every frame to the union of what any frame draws, centred on the pivot's column, foot kept.
    frames = [img[(i // cols) * fh:(i // cols + 1) * fh, (i % cols) * fw:(i % cols + 1) * fw] for i in range(n)]
    drawn = np.max([f[..., 3] for f in frames], 0) > 0
    ys, xs = np.nonzero(drawn)
    px = info['pivot'][0]
    half = int(max(px - xs.min(), xs.max() + 1 - px))
    top, foot = int(ys.min()), int(ys.max()) + 1
    fw, fh = 2 * half, foot - top
    frames = [np.pad(f, ((0, 0), (half, half), (0, 0)))[top:foot, px:px + 2 * half] for f in frames]
    side = max(fw, fh) + 2
    print('flame frame', fw, 'x', fh, '->', side)
    out_cols = cols
    rows = (n + out_cols - 1) // out_cols
    k = scale
    pad = 2
    res = np.zeros((rows * side * k, out_cols * side * k, 4), np.float32)
    for i in range(n):
        frame = np.zeros((side, side, 4), np.float32)
        ox = (side - fw) // 2
        frame[side - fh - 1:side - 1, ox:ox + fw] = frames[i]
        f = np.pad(frame, ((pad, pad), (pad, pad), (0, 0)))
        pm = f[..., :3] * f[..., 3:4]
        big = lambda a: np.kron(a, np.ones((k, k)))
        sig = k * 0.55
        A = blur(big(f[..., 3]), sig)
        C = np.stack([blur(big(pm[..., c]), sig) for c in range(3)], -1)
        rgb = C / np.maximum(A[..., None], 1e-4)
        A2 = smoothstep(0.5 - soft, 0.5 + soft, A)
        o = np.concatenate([np.clip(rgb, 0, 1), A2[..., None]], -1)[pad * k:-pad * k, pad * k:-pad * k]
        r, c = i // out_cols, i % out_cols
        res[r * side * k:(r + 1) * side * k, c * side * k:(c + 1) * side * k] = o
    save('torch-flame.png', res)


# ---- maps drawn from the effects' formulas ----


def wrap_noise(w, h, scale, seed):
    """Smooth noise in [0, 1] that tiles both ways: white noise blurred on a torus."""
    rng = np.random.default_rng(seed)
    n = blur(rng.random((h, w)).astype(np.float32), scale, wrap=True)
    n -= n.min()
    return n / n.max()


def noise_map():
    """Red and green: two independent wrapping noises around 0.5, for UV distortion."""
    r = wrap_noise(128, 128, 6, 1)
    g = wrap_noise(128, 128, 6, 2)
    save('noise.png', np.stack([r, g, np.full_like(r, 0.5), np.ones_like(r)], -1))


# Fire, hottest first, and the heat each colour stands for in fire-tornado.js's thresholds.
FIRE = ['#ffffff', '#fff3a6', '#ffe26b', '#ffc23d', '#ff8a2a', '#f2561d', '#c9281f', '#8a1f17', '#4a1712']
FIRE_HEAT = [1.0, 0.885, 0.76, 0.64, 0.52, 0.40, 0.27, 0.15, 0.0]


def fire_colour(heat):
    stops = np.array(FIRE_HEAT[::-1])
    cols = np.stack([hexrgb(c) for c in FIRE[::-1]])
    return np.stack([np.interp(heat, stops, cols[:, c]) for c in range(3)], -1)


def tornado_band(w=512, h=512):
    """The funnel's surface: U runs once round it, V up it (0 at the foot, 1 at 1.2× the height).

    As in fire-tornado.js: three spiral bands twisted up the column, a darker body with bright
    streaks, cooling with height, coming apart into strands near the top. U wraps; scroll U to spin.
    """
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h)[::-1] + 0.5) / h  # row 0 is the top of the image
    U, V = np.meshgrid(u, v)
    hv = V * 1.2  # height in funnel heights
    vv = np.minimum(1, hv)
    ns = wrap_noise(w, h, 10, 7) - 0.5
    tear = 0.5 * ns + 0.25 * np.sin(TAU * (2 * U + 3 * hv))
    band = 0.5 + 0.5 * np.sin((TAU * U + hv * 5.5 + tear) * 3)
    streak = band ** 3
    cut = np.clip((hv - 0.72) / 0.42, 0, 1)
    heat = 0.56 + 0.5 * streak - 0.22 * vv + 0.1 * (1 - vv) - 0.25 * cut + 0.1 * ns
    rgb = fire_colour(np.clip(heat, 0, 1))
    keep = band - (0.35 + cut * 0.6 + 0.2 * (wrap_noise(w, h, 4, 9) - 0.5))
    strands = smoothstep(0, 0.6, cut)
    alpha = 1 - strands + strands * smoothstep(-0.03, 0.03, keep)
    alpha *= smoothstep(0, 0.03, V) * smoothstep(1.2, 1.1, hv)
    save('tornado-band.png', np.concatenate([rgb, alpha[..., None]], -1))


def hex_cells(gx, gy):
    """Sprite Fusion shield.ts `cell()`: a hash per hex, and 0 at a hex's centre to 1 at its edge."""
    s3 = np.sqrt(3)
    q = (s3 / 3) * gx - gy / 3
    r = (2 / 3) * gy
    s = -q - r
    rq, rr, rs = np.round(q), np.round(r), np.round(s)
    dq, dr, ds = np.abs(rq - q), np.abs(rr - r), np.abs(rs - s)
    a = (dq > dr) & (dq > ds)
    b = ~a & (dr > ds)
    rq = np.where(a, -rr - rs, rq)
    rr = np.where(b, -rq - rs, rr)
    hx = s3 * (rq + rr / 2)
    hy = 1.5 * rr
    dx = np.abs(gx - hx)
    dy = gy - hy
    e = np.maximum.reduce([dx, np.abs(dx / 2 + dy * s3 / 2), np.abs(dx / 2 - dy * s3 / 2)]) / (s3 / 2)
    return rq, rr, e


def hex_shell(w=1024, h=512, columns=22):
    """The dome's hex plates over longitude (U, wrapping) and latitude (V, 0 at the ground, 1 at the top).

    `shell`: bright plate edges over faint glass, with a bright foot ring. `plates`: each plate's face
    at its own brightness, for glints. The grid has a whole number of columns round the dome so U wraps.
    """
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h)[::-1] + 0.5) / h
    U, V = np.meshgrid(u, v)
    grid = np.sqrt(3) * columns / TAU
    lon, lat = U * TAU, V * np.pi / 2
    rq, rr, e = hex_cells(lon * grid, lat * grid * 1.15)
    rq = np.mod(rq + (rr - np.mod(rr, 2)) / 2, columns)  # wrap the axial column round the dome
    # Near the pole the longitude cells crowd together; the plates fade into plain glass there.
    edge = smoothstep(0.8, 0.9, e) * smoothstep(0.92, 0.7, V)
    glass = 0.035 + 0.05 * V
    foot = smoothstep(0.035, 0.0, V)
    a = np.maximum(edge, glass)
    a = np.maximum(a, foot)
    light, deep = hexrgb('#8ae8ff'), hexrgb('#2582d2')
    rgb = deep * (1 - edge[..., None]) + light * edge[..., None]
    rgb = rgb * (1 - foot[..., None]) + hexrgb('#d4fbff') * foot[..., None]
    save('hex-shell.png', np.concatenate([rgb, a[..., None]], -1))
    hashv = np.mod(np.sin(rq * 12.9898 + rr * 78.233) * 43758.5453, 1)
    face = (1 - smoothstep(0.66, 0.78, e)) * (0.35 + 0.65 * hashv) * smoothstep(0.92, 0.7, V)
    save('hex-plates.png', np.stack([np.ones_like(face)] * 3 + [face], -1))


def sweep(w=256, h=128):
    """A soft diagonal band in red, wrapping both ways: an erosion mask that, scrolled, sweeps a glint."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h)[::-1] + 0.5) / h
    U, V = np.meshgrid(u, v)
    d = np.abs(np.mod(U + V, 1) - 0.5) * 2  # 1 on the band, 0 halfway between
    r = smoothstep(0.75, 1, 1 - d) * 0.55 + smoothstep(0.0, 1, 1 - d) * 0.45
    save('sweep.png', np.stack([r, r, r, np.ones_like(r)], -1))


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--flame']:
        flame_atlas(args[1], args[2])
    noise_map()
    tornado_band()
    hex_shell()
    sweep()
