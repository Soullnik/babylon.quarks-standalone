"""Fire flipbooks for the Pixel FX gallery, drawn from noise and written to public/textures/pixelfx/.

    python3 examples/scripts/pixelfx/make_fire.py

Needs numpy and Pillow. Every sheet is heat: grey from 0 (dark red) to 1 (white-hot) for a gradient
map to colour in any ramp, and alpha for coverage. All are drawn here from seeded noise, so they are
ours to ship under the repository's licence.

* `fire-loop-heat`: a whole flame burning on the spot, 64 frames (8 x 8) that loop seamlessly: a
  wide hot foot, tongues licking up out of it and tearing off its tip. One particle plays it as the
  body of a torch or a campfire, the way Unity's and Unreal's fire sheets are used.
* `flame-tongue-heat`: one tongue over its life, 24 frames (6 x 4) played once: it flares up, stretches,
  splits at the tip and burns out from the foot. Many of them, each starting at birth, make a fire
  whose tongues are born, lick up and die instead of all looping the same frames.
* `fire-comet-heat`: a ball of flame flying right with its fire streaming back to the left, 16 frames
  (4 x 4) that loop: for a fireball or a meteor, the texture laid along the flight.
* `fire-puff-heat` and `smoke-puff`: a ball of flame, and a puff of smoke, billowing out over their
  life, 16 frames (4 x 4) played once: the flame cools and burns into holes, the smoke swells and thins.

The flames move by scrolling periodic noise through a fixed shape; the noise repeats over the loop,
so the last frame runs into the first.
"""
import os

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'textures', 'pixelfx')


def periodic_noise(h, w, beta, low, seed):
    """Fractal noise that tiles in both axes (it is made in frequency space), scaled to 0..1."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1
    spectrum = (rng.normal(size=(h, w)) + 1j * rng.normal(size=(h, w))) / f**beta
    spectrum[f < low] = 0
    n = np.real(np.fft.ifft2(spectrum))
    n -= n.min()
    return n / n.max()


def sample(field, y, x):
    """Bilinear sample of a tiling field at fractional pixel coordinates (wrapping)."""
    h, w = field.shape
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    tx = x - x0
    ty = y - y0
    x0 %= w
    y0 %= h
    x1 = (x0 + 1) % w
    y1 = (y0 + 1) % h
    a = field[y0, x0] * (1 - tx) + field[y0, x1] * tx
    b = field[y1, x0] * (1 - tx) + field[y1, x1] * tx
    return a * (1 - ty) + b * ty


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def sheet(frames, cols):
    rows = (len(frames) + cols - 1) // cols
    h, w = frames[0].shape[:2]
    out = np.zeros((rows * h, cols * w, 4), np.float32)
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        # Rows run top to bottom in the image, as the renderer reads tiles from the top left.
        out[r * h : (r + 1) * h, c * w : (c + 1) * w] = f
    return out


def save(name, rgba):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, optimize=True)
    print(path, rgba.shape[1], 'x', rgba.shape[0])


def heat_frame(heat, soft=0.06):
    """Grey heat in RGB, coverage in alpha: an edge `soft` wide in heat, so outlines stay crisp."""
    alpha = smoothstep(0.0, soft, heat)
    grey = np.clip(heat, 0, 1) ** 1.6
    return np.dstack([grey, grey, grey, alpha]).astype(np.float32)


# Two octaves of rising noise and a warp, shared by the upright flames. Their heights are periods the
# loops scroll through a whole number of times.
PERIOD = 512
BIG = periodic_noise(PERIOD, 256, 1.6, 2, 11)
FINE = periodic_noise(PERIOD, 256, 1.2, 6, 12)
WARP = periodic_noise(PERIOD, 256, 2.0, 1, 13) - 0.5


def flame(size, phase, tall=1.0, burn=0.0, size_scale=1.0):
    """One upright flame at `phase` (0..1 round the loop): u across (-1..1), v up (0 foot, 1 tip).

    The classic shader flame: distance from a point near the foot, squeezed so the shape is a tall
    teardrop, minus rising noise that grows with height, so tongues tear off the top. `tall` scales
    its reach, `burn` eats it away (0 whole, 1 gone) and `size_scale` its width.
    """
    v, u = np.mgrid[0:size, 0:size].astype(np.float32)
    v = 1 - (v + 0.5) / size
    u = (u + 0.5) / size * 2 - 1
    px = (u * 0.5 + 0.5) * 255
    rise = phase * PERIOD
    # Sway: the warp pushes the flame sideways, more the higher it is.
    sway = sample(WARP, v * 160 - rise, px * 0.4) * 0.5 * v**1.5
    # The flame's own frame, stretched so the shape below fills the tile.
    uw = (u - sway) * 0.45 / size_scale
    q = v * 0.8 / tall - 0.1
    # Noise stretched upward (finer across than along), rising through the flame.
    n = 0.8 * sample(BIG, v * 150 - rise, px * 1.0) + 0.2 * sample(FINE, v * 220 - rise * 2, px * 1.8)
    d = np.sqrt((uw * (2.0 + q * 3.0)) ** 2 + (q * 1.2) ** 2)
    heat = 1 - 3.0 * np.maximum(0, d - n * np.maximum(0, q + 0.25) * 0.9) ** 1.15
    heat -= burn * (0.6 + n * 0.8)
    # Nothing touches the tile's edges: the tip fades out under the top, the foot rounds off above
    # the bottom, the sides stay clear.
    heat -= smoothstep(0.82, 1.0, v) * 1.2 + smoothstep(0.05, 0.0, v) * 1.2 + smoothstep(0.85, 1.0, np.abs(u)) * 1.2
    return heat - 0.02


def fire_loop():
    frames = [heat_frame(flame(256, f / 64)) for f in range(64)]
    save('fire-loop-heat.png', sheet(frames, 8))


def flame_tongue():
    frames = []
    n = 24
    for f in range(n):
        t = f / (n - 1)
        # Flares up from a low lick, stretches, then thins and burns away.
        grow = smoothstep(0.0, 0.3, t)
        die = smoothstep(0.4, 1.0, t)
        heat = flame(192, t * 0.35, tall=0.55 + 0.45 * grow, burn=die, size_scale=0.75 - 0.25 * die)
        frames.append(heat_frame(heat))
    save('flame-tongue-heat.png', sheet(frames, 6))


def fire_comet():
    # The upright flame laid on its side, tip to the left, with a round white-hot head over its foot.
    size = 256
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    x = (x + 0.5) / size
    y = (y + 0.5) / size * 2 - 1
    frames = []
    for f in range(16):
        tail = np.rot90(flame(size, f / 16, size_scale=0.55), 1)
        # The flame's flat foot is cut off in front of the head's centre, so the nose is the head.
        tail -= smoothstep(0.66, 0.8, x) * 2
        head = 1 - np.sqrt(((x - 0.74) / 0.2) ** 2 + (y / 0.3) ** 2)
        # Soft union, so the head runs into the tail without a seam.
        heat = np.logaddexp(tail * 8, head * 2.2 * 8) / 8
        frames.append(heat_frame(heat))
    save('fire-comet-heat.png', sheet(frames, 4))


def puff_field(size, t, seed_big, seed_fine, seed=5):
    """A billowing ball at age `t` (0..1): a cauliflower of round lumps swelling outward.

    Returns how far inside it each pixel is (0 at the edge, up to 1), the noise, a top-lit shade from
    the lump each pixel lies on (1 facing the light, 0 away from it) and the depth into the whole ball.
    """
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    x = (x + 0.5) / size * 2 - 1
    y = (y + 0.5) / size * 2 - 1
    rng = np.random.default_rng(seed)
    inside = np.full(x.shape, -9.0, np.float32)
    shade = np.zeros(x.shape, np.float32)
    lumps = [(0.0, 0.0, 0.5)]
    for k in range(9):
        a = k / 9 * np.pi * 2 + rng.uniform(-0.3, 0.3)
        d = rng.uniform(0.3, 0.42)
        lumps.append((np.cos(a) * d, np.sin(a) * d, rng.uniform(0.24, 0.34)))
    grow = 0.62 + 0.38 * t
    px = (x * 0.5 + 0.5) * 255
    py = (y * 0.5 + 0.5) * 255
    n = 0.7 * sample(seed_big, py * 0.7 + t * 60, px * 0.7) + 0.3 * sample(seed_fine, py * 1.4 - t * 40, px * 1.4)
    light = np.array([-0.45, -0.6, 0.66])
    for cx, cy, r in lumps:
        cx, cy, r = cx * grow, cy * grow, r * grow
        dx = (x - cx) / r
        dy = (y - cy) / r
        k = 1 - np.sqrt(dx**2 + dy**2)
        nz = np.sqrt(np.clip(1 - dx**2 - dy**2, 0, 1))
        lit = np.clip(dx * light[0] + dy * light[1] + nz * light[2], 0, 1)
        # The lump in front (nearest its own centre) gives the shade.
        front = k > inside
        shade = np.where(front, lit, shade)
        inside = np.maximum(inside, k)
    core = 1 - np.sqrt(x**2 + y**2) / (0.85 * grow)
    return inside + (n - 0.5) * 0.25, n, shade, core


PUFF_BIG = periodic_noise(256, 256, 1.7, 2, 31)
PUFF_FINE = periodic_noise(256, 256, 1.2, 5, 32)


def fire_puff():
    frames = []
    for f in range(16):
        t = f / 15
        body, n, shade, core = puff_field(256, t, PUFF_BIG, PUFF_FINE)
        # Hot at the heart of the whole ball, cooling with age; the noise eats holes into it as it burns.
        heat = (np.clip(core, 0, 1) * 0.9 + shade * 0.2 + 0.1) * (1.3 - 0.85 * t) - t**1.5 * (0.3 + 0.5 * n)
        heat = np.where(body > 0, heat, body)
        frames.append(heat_frame(heat, 0.05))
    save('fire-puff-heat.png', sheet(frames, 4))


def smoke_puff():
    frames = []
    for f in range(16):
        t = f / 15
        body, n, shade, _ = puff_field(256, t, PUFF_FINE, PUFF_BIG, seed=7)
        cover = smoothstep(0.0, 0.12, body - t * 0.3 * n) * (1 - smoothstep(0.55, 1.0, t))
        # Lit from above: each lump lighter where it faces the light, darker in the folds between.
        grey = np.clip(0.5 + shade * 0.5 + (n - 0.5) * 0.2, 0, 1)
        frames.append(np.dstack([grey, grey, grey, cover * 0.95]).astype(np.float32))
    save('smoke-puff.png', sheet(frames, 4))


if __name__ == '__main__':
    fire_loop()
    flame_tongue()
    fire_comet()
    fire_puff()
    smoke_puff()
