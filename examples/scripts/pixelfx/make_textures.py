"""Textures for the Pixel FX gallery's mesh and flipbook effects, written to public/textures/pixelfx/.

    python3 examples/scripts/pixelfx/make_textures.py [--part|--heat <name> <sheet.png> <sheet.json>]...

Needs numpy and Pillow. Two kinds of texture come out of it:

* Flipbooks traced from pixelfx (https://github.com/patch-gg/pixelfx, MIT). Each file in `parts/` is one
  element of a pixelfx effect with the rest turned off (the torch's flame, the spirit flame's body). Copy
  it to pixelfx's src/fx/parts/, render it with `node tools/render.mjs parts/<name> --sheet --bg none
  --no-actor`, and pass the sheet: `--part torch-flame <png> <json> --heat flame-heat <png> <json>
  --part spirit-flame <png> <json>`. Each frame is de-pixelized: premultiplied, upscaled, blurred by about half a source pixel,
  then its alpha edge tightened so the outlines come out as clean curves in the original colours.
* Maps drawn here from the same formulas the pixel effects use, at full resolution: the fire tornado's
  spiral band (pixelfx fire/fire-tornado), the force field's hex shell (pixelfx scifi/force-field, after
  Sprite Fusion's shield, https://www.spritefusion.com/pixel-art-vfx/shield, MIT) and a wrapping noise.

Without --part or --heat the flipbooks already in public/ are left alone.
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


def part_atlas(name, png, meta, scale=None, soft=0.25, heat=False):
    """A pixelfx part's sheet, each frame cropped to what any frame draws, padded to a square with its
    foot at the bottom, and de-pixelized; with `heat`, its fire colours turned to heat first."""
    img = np.asarray(Image.open(png).convert('RGBA')).astype(np.float32) / 255
    if heat:
        img = to_heat(img)
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
    scale = scale or min(8, 256 // side)  # tiles of at most 256 px
    print(name, 'frame', fw, 'x', fh, '->', side)
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
    save(name + '.png', res)


def to_heat(img):
    """Each pixel's fire colour as its heat, grey in RGB: 1 white-hot to 0 the darkest red. Through a
    gradient map the same flipbook then burns in any ramp: fire, spirit flame, poison."""
    cols = np.stack([hexrgb(c) for c in FIRE])
    d = ((img[..., None, :3] - cols[None, None]) ** 2).sum(-1)
    h = np.asarray(FIRE_HEAT)[d.argmin(-1)]
    return np.concatenate([np.repeat(h[..., None], 3, -1), img[..., 3:4]], -1).astype(np.float32)


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


ICE = ['#151a3d', '#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#a6ecff', '#dcfbff', '#ffffff']


def ice_colour(level):
    """pixelfx's ice palette (ice/blizzard-vortex.js), dark to white, at level 0..1."""
    stops = np.linspace(0, 1, len(ICE))
    cols = np.stack([hexrgb(c) for c in ICE])
    return np.stack([np.interp(level, stops, cols[:, c]) for c in range(3)], -1)


def blizzard_band(w=512, h=512):
    """The snow funnel's surface: U once round it, V up it (0 at the foot, 1 at 1.1x the height).

    As in blizzard-vortex.js's body: thin snow-filled air with three swirls twisted up the column and
    bright wind streaks along them, fading out over the top 30% and at the foot. The mesh's rim adds
    the denser edges. U wraps; scroll U to spin.
    """
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h)[::-1] + 0.5) / h
    U, V = np.meshgrid(u, v)
    hv = V * 1.1
    ns = wrap_noise(w, h, 8, 21) - 0.5
    swirl = 0.5 + 0.5 * np.sin(TAU * (3 * U) + hv * 14 + 1.2 * ns)
    streak = smoothstep(0.82, 0.97, 0.5 + 0.5 * np.sin(TAU * (5 * U) + hv * 22 + 2.5 * ns))
    level = 0.55 + 0.25 * swirl + 0.45 * streak
    rgb = ice_colour(np.clip(level, 0, 1))
    alpha = 0.16 + 0.22 * swirl + 0.55 * streak
    alpha *= smoothstep(0, 0.05, hv) * np.clip((1 - hv) / 0.3 + 0.35, 0, 1) * smoothstep(1.1, 0.95, hv)
    save('blizzard-band.png', np.concatenate([rgb, np.clip(alpha, 0, 1)[..., None]], -1))


def pillar_band(w=256, h=256):
    """The flame pillar's surface: U runs once round the column, V up one pulse of it; wraps both ways.

    As in flame-pillar.js: seven hotter strands running up the column, wavering, and a bright pulse
    racing up it (scroll V); a white-hot body whose edges the mesh's rim reddens.
    """
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h)[::-1] + 0.5) / h
    U, V = np.meshgrid(u, v)
    rng = np.random.default_rng(5)
    heat = 0.66 + 0.12 * (wrap_noise(w, h, 8, 11) - 0.5)
    for k in range(7):
        o, wd, f = rng.random(), 0.025 + 0.03 * rng.random(), rng.integers(1, 3)
        d = np.abs(((U - o - 0.03 * np.sin(TAU * (f * V + k / 7))) + 0.5) % 1 - 0.5)
        heat += 0.22 * smoothstep(wd, wd * 0.3, d)
    p = np.abs(((V - 0.05) + 0.5) % 1 - 0.5)
    heat += 0.2 * smoothstep(0.06, 0.02, p)
    rgb = fire_colour(np.clip(heat, 0, 1))
    save('pillar-band.png', np.concatenate([rgb, np.ones_like(heat)[..., None]], -1))


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
    return rq, rr, e, gx - hx, dy


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
    rq, rr, e, ox, oy = hex_cells(lon * grid, lat * grid * 1.15)
    rq = np.mod(rq + (rr - np.mod(rr, 2)) / 2, columns)  # wrap the axial column round the dome
    # Near the pole the longitude cells crowd together; the plates fade into plain glass there.
    keep = smoothstep(0.86, 0.6, V)
    edge = smoothstep(0.8, 0.9, e) * keep
    # Each plate's lit top-left edge (force-field.js `bevel`): a thin band inside the seam facing up-left.
    facing = np.clip((-ox * 0.5 + oy * 0.87) / np.maximum(np.hypot(ox, oy), 1e-4), 0, 1)
    bevel = smoothstep(0.62, 0.72, e) * (1 - smoothstep(0.74, 0.8, e)) * facing * keep
    glass = 0.035 + 0.05 * V
    foot = smoothstep(0.035, 0.0, V)
    a = np.maximum.reduce([edge, glass, foot, bevel * 0.35])
    light, deep, lit = hexrgb('#8ae8ff'), hexrgb('#2582d2'), hexrgb('#36b9ee')
    rgb = deep * (1 - edge[..., None]) + light * edge[..., None]
    rgb = rgb * (1 - bevel[..., None]) + lit * bevel[..., None]
    rgb = rgb * (1 - foot[..., None]) + hexrgb('#d4fbff') * foot[..., None]
    save('hex-shell.png', np.concatenate([rgb, a[..., None]], -1))
    hashv = np.mod(np.sin(rq * 12.9898 + rr * 78.233) * 43758.5453, 1)
    inside = 1 - smoothstep(0.66, 0.78, e)
    face = inside * (0.35 + 0.65 * hashv) * keep
    save('hex-plates.png', np.stack([np.ones_like(face)] * 3 + [face], -1))
    # When each plate glints: one plate in five gets a time in 0.2..1 (an erosion level), the rest none.
    pick = np.mod(np.sin(rq * 39.346 + rr * 11.135) * 24634.6345, 1)
    when = np.mod(np.sin(rq * 73.156 + rr * 52.235) * 13758.937, 1)
    glint = np.where(pick < 0.2, 0.2 + 0.8 * when, 0) * (inside > 0.5) * keep
    save('hex-glint.png', np.stack([glint] * 3 + [np.ones_like(glint)], -1))


def diamond_shell(w=512, h=512, columns=12, rows=8):
    """A diamond lattice over a surface (pixelfx impacts/shield-block): U across, V up, both 0..1.

    `diamond-shell`: bright lattice lines over faint glass, a bright foot. `diamond-cells`: an erosion
    mask with one random value per cell, so a falling level blinks the cells out one by one.
    """
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h)[::-1] + 0.5) / h
    U, V = np.meshgrid(u, v)
    a = U * columns + V * rows
    b = U * columns - V * rows
    fa, fb = a - np.floor(a), b - np.floor(b)
    e = np.minimum.reduce([fa, 1 - fa, fb, 1 - fb])  # 0 on a line, 0.5 at a cell's middle
    line = smoothstep(0.07, 0.02, e)
    glass = 0.06 + 0.06 * V
    foot = smoothstep(0.04, 0.0, V)
    alpha = np.maximum.reduce([line, glass, foot])
    light, deep = hexrgb('#a6ecff'), hexrgb('#2c58aa')
    rgb = deep * (1 - line[..., None]) + light * line[..., None]
    rgb = rgb * (1 - foot[..., None]) + hexrgb('#dcfbff') * foot[..., None]
    save('diamond-shell.png', np.concatenate([rgb, alpha[..., None]], -1))
    ca, cb = np.floor(a), np.floor(b)
    cell = np.mod(np.sin(ca * 12.9898 + cb * 78.233) * 43758.5453, 1)
    mask = 0.04 + 0.92 * cell
    save('diamond-cells.png', np.stack([mask] * 3 + [np.ones_like(mask)], -1))


def gradient(size=128):
    """Red from 1 at V 0 (the bottom) to 0 at V 1: an erosion mask whose cut climbs a surface."""
    v = (np.arange(size)[::-1] + 0.5) / size
    g = np.repeat((1 - v)[:, None], 4, 1)
    save('gradient.png', np.stack([g, g, g, np.ones_like(g)], -1))


def disc_layer(img, cx, cy, r, rgb, a, aa=1.2, wob=0.0, seed=0):
    """Composites an antialiased disc over `img` (premultiplied RGBA), `aa` pixels of soft edge. `wob`
    ruffles its rim by that fraction of the radius, so a ball of flame or smoke reads as billowing."""
    h, w = img.shape[:2]
    y, x = np.mgrid[0:h, 0:w]
    d = np.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2)
    if wob:
        th = np.arctan2(y + 0.5 - cy, x + 0.5 - cx)
        rng = np.random.default_rng(seed)
        ruffle = sum(np.sin(th * f + rng.uniform(0, TAU)) / f ** 0.7 for f in (3, 5, 7, 11))
        d = d - r * wob * ruffle / 2.2
    cov = np.clip((r - d) / aa + 0.5, 0, 1) * a
    img[..., :3] = img[..., :3] * (1 - cov[..., None]) + np.asarray(rgb)[None, None, :] * cov[..., None]
    img[..., 3] = img[..., 3] * (1 - cov) + cov


def unpremultiply(img):
    out = img.copy()
    out[..., :3] = img[..., :3] / np.maximum(img[..., 3:4], 1e-4)
    return out


def puff_sheet(name, draw, frames=16, cols=4, tile=128):
    """A sheet of `frames` tiles, frame i drawn by draw(img, cx, cy, k) with k the life left (1 to 0)."""
    rows = (frames + cols - 1) // cols
    sheet = np.zeros((rows * tile, cols * tile, 4), np.float32)
    for i in range(frames):
        img = np.zeros((tile, tile, 4), np.float32)
        draw(img, tile / 2, tile * 0.56, 1 - i / (frames - 1) * 0.999)
        r, c = i // cols, i % cols
        sheet[r * tile:(r + 1) * tile, c * tile:(c + 1) * tile] = unpremultiply(img)
    save(name + '.png', sheet)


def fire_puff_frame(img, x, y, k, size=30, heat=False):
    """pixelfx fire/_lib.js `firePuff`, drawn at full resolution: a ball of flame cooling down the ramp as it
    ages, a darker rim, a lit core up and to the left, a tongue on top and a hot heart while young."""
    H = [np.full(3, h, np.float32) for h in FIRE_HEAT] if heat else [hexrgb(c) for c in FIRE]
    n = len(H)
    age = 1 - k
    heat = min(0.999, age ** 0.62 + 0.03)
    idx = min(n - 2, int(heat * (n - 1)))
    r = size * (0.55 + 0.45 * min(1, age * 7)) * (1 - age * 0.55)
    c = H[idx]
    if idx >= n - 2:
        disc_layer(img, x, y, r, c, min(1, k * 3) * 0.85, aa=r * 0.5)
        return
    disc_layer(img, x, y, r, H[min(n - 1, idx + 2)], 1, wob=0.14, seed=1)
    disc_layer(img, x - r * 0.16, y - r * 0.22, r * 0.78, c, 1, wob=0.12, seed=2)
    disc_layer(img, x, y - r * 0.9, r * 0.42, c, 1, wob=0.1, seed=3)
    if idx <= 3:
        disc_layer(img, x - r * 0.28, y - r * 0.34, r * 0.36, H[max(0, idx - 1)], 1, wob=0.1, seed=4)


SMOKE = ['#7b6f72', '#5d5660', '#433d48', '#2b2630', '#1a171e']


def smoke_puff_frame(img, x, y, k, size=26):
    """pixelfx fire/_lib.js `smokePuff` (big), drawn at full resolution: a body, a denser core sitting low
    and a lit cap while young, swelling and thinning. Shaded relative to the ramp's lightest grey, so the
    particle colour sets the smoke's own."""
    age = 1 - k
    r = size * (0.65 + min(1, age * 2.5) * 0.45 + age * 0.5)
    a = min(1, age * 12) * min(1, k * 2.4) * 0.7
    top = hexrgb(SMOKE[0])
    grey = hexrgb(SMOKE[min(4, int(age * 1.05 * 5))]) / top
    soft = r * 0.35
    disc_layer(img, x, y, r, grey, a * 0.45, aa=soft, wob=0.12, seed=5)
    disc_layer(img, x + r * 0.05, y + r * 0.06, r * 0.74, grey, a * 0.62, aa=soft, wob=0.12, seed=6)
    if age < 0.5:
        disc_layer(img, x - r * 0.22, y - r * 0.3, r * 0.5, np.minimum(1, grey * 1.15), a * 0.4 * (1 - age * 2), aa=soft)


def radial(size=128):
    """Red 1 at the centre falling linearly to 0 at the rim, 0 outside and on the border: an erosion
    mask that, laid over a surface by tiling and offset, spreads a cut outward from one point."""
    c = (np.arange(size) + 0.5) / size * 2 - 1
    X, Y = np.meshgrid(c, c)
    r = np.clip(1 - np.sqrt(X * X + Y * Y) / 0.97, 0, 1)
    save('radial.png', np.stack([r, r, r, np.ones_like(r)], -1))


if __name__ == '__main__':
    # Flipbooks from pixelfx parts, rendered first with pixelfx's tools (see the module docstring):
    #   --part <name> <sheet.png> <sheet.json>   colour flipbook public/textures/pixelfx/<name>.png
    #   --heat <name> <sheet.png> <sheet.json>   the same as heat, for a gradient map
    args = sys.argv[1:]
    while args and args[0] in ('--part', '--heat'):
        part_atlas(args[1], args[2], args[3], heat=args[0] == '--heat')
        args = args[4:]
    noise_map()
    tornado_band()
    pillar_band()
    blizzard_band()
    hex_shell()
    diamond_shell()
    radial()
    gradient()
    puff_sheet('fire-puff-heat', lambda *a: fire_puff_frame(*a, heat=True))
    puff_sheet('smoke-puff', smoke_puff_frame)
