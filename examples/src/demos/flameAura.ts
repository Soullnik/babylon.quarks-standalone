import {Constants} from '@babylonjs/core/Engines/constants';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import {FresnelParameters} from '@babylonjs/core/Materials/fresnelParameters';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {CreateCapsule} from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import {CreateGround} from '@babylonjs/core/Meshes/Builders/groundBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    ForceOverLife,
    Gradient,
    IntervalValue,
    MeshSurfaceEmitter,
    Noise,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    Vector3Function,
} from 'babylon.quarks';
import type {DemoContext} from '../types';

/*
 * A teal flame aura around a standing figure: wisps of flame wrapped round
 * the body, spinning as they grow and climb off it, gathering into a thin
 * column over the head that cools into dark smoke, with sparks, a soft halo
 * and energy pooling on the ground round the feet. Every texture is painted
 * below, so the effect needs no asset files.
 *
 * The wisps are plain Shuriken work: sprites born on the body's surface
 * (`MeshSurfaceEmitter`) at a random angle, turning at a constant rate
 * (`RotationOverLife`), growing from nothing (`SizeOverLife`) and fading as
 * they rise, each showing one of four drawn wisps (a random flipbook tile).
 * The floor's energy is the masked panner: smoky noise scrolling through a
 * soft disc (`mask`), coloured by a gradient map.
 */

/** A square canvas texture painted by `paint`, wrapping or clamped. */
function canvasTexture(
    scene: Scene,
    name: string,
    size: number,
    wrap: boolean,
    paint: (image: ImageData, size: number) => void
): DynamicTexture {
    const texture = new DynamicTexture(name, {width: size, height: size}, scene, false);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const image = ctx.createImageData(size, size);
    paint(image, size);
    ctx.putImageData(image, 0, 0);
    // Row 0 of the canvas is the top of the picture (V = 1).
    texture.update(true);
    const mode = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    texture.wrapU = mode;
    texture.wrapV = mode;
    return texture;
}

/** A square canvas texture drawn with the 2D canvas API by `draw`, clamped. */
function drawnTexture(
    scene: Scene,
    name: string,
    size: number,
    draw: (ctx: CanvasRenderingContext2D, size: number) => void
): DynamicTexture {
    const texture = new DynamicTexture(name, {width: size, height: size}, scene, true);
    draw(texture.getContext() as unknown as CanvasRenderingContext2D, size);
    texture.update(true);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}

/**
 * A wisp of flame drawn into the `cell`-sized square at (`left`, `top`): a few
 * translucent sheets rising and swaying, each brighter along its folded edges,
 * softened and faded towards the square's rim so a spinning sprite shows no
 * corners.
 */
function drawWisp(ctx: CanvasRenderingContext2D, left: number, top: number, cell: number, seed: number): void {
    const random = seeded(seed);
    const layer = document.createElement('canvas');
    layer.width = layer.height = cell;
    const g = layer.getContext('2d')!;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
        const x0 = 0.3 + random() * 0.4;
        const sway = 0.05 + random() * 0.1;
        const turns = 0.5 + random() * 0.8;
        const phase = random() * Math.PI * 2;
        const curl = (random() - 0.5) * 0.6;
        const width = 0.05 + random() * 0.09;
        const foot = 0.82 + random() * 0.1;
        const tip = 0.08 + random() * 0.2;
        const points: [number, number, number][] = [];
        for (let k = 0; k <= 40; k++) {
            const t = k / 40;
            const x = x0 + Math.sin(turns * t * Math.PI * 2 + phase) * sway * (0.4 + t) + curl * t * t;
            const w = width * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1.2 - t * 0.6);
            points.push([x, foot + (tip - foot) * t, w]);
        }
        // The sheet: a faint fill between its two edges.
        g.beginPath();
        points.forEach(([x, y, w], k) => (k ? g.lineTo : g.moveTo).call(g, (x - w) * cell, y * cell));
        for (let k = points.length - 1; k >= 0; k--)
            g.lineTo((points[k][0] + points[k][2]) * cell, points[k][1] * cell);
        g.closePath();
        g.fillStyle = `rgba(255,255,255,${0.1 + random() * 0.12})`;
        g.fill();
        // Its folds: the two edges, brighter.
        for (const side of [-1, 1]) {
            g.beginPath();
            points.forEach(([x, y, w], k) => (k ? g.lineTo : g.moveTo).call(g, (x + side * w) * cell, y * cell));
            g.strokeStyle = `rgba(255,255,255,${0.3 + random() * 0.4})`;
            g.lineWidth = cell * (0.004 + random() * 0.006);
            g.stroke();
        }
    }
    g.globalCompositeOperation = 'destination-in';
    const rim = g.createRadialGradient(cell / 2, cell / 2, 0, cell / 2, cell / 2, cell / 2);
    rim.addColorStop(0, 'rgba(0,0,0,1)');
    rim.addColorStop(0.6, 'rgba(0,0,0,1)');
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rim;
    g.fillRect(0, 0, cell, cell);
    ctx.save();
    ctx.filter = `blur(${cell / 160}px)`;
    ctx.drawImage(layer, left, top);
    ctx.restore();
}

/** Four different wisps of flame, white, as a 2 by 2 flipbook. */
function drawWisps(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.clearRect(0, 0, size, size);
    const cell = size / 2;
    [7, 20, 33, 46].forEach((seed, i) => drawWisp(ctx, (i % 2) * cell, Math.floor(i / 2) * cell, cell, seed));
}

/** A tiny seeded generator, so the pictures are the same every run. */
function seeded(seed: number): () => number {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
}

/** Tileable fractal value noise over 0…1², `octaves` layers from `cells` cells, about 0…1. */
function fractalNoise(seed: number, cells: number, octaves: number): (x: number, y: number) => number {
    const random = seeded(seed);
    const layers = Array.from({length: octaves}, (_, o) => {
        const n = cells << o;
        return {n, grid: Array.from({length: n * n}, random)};
    });
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return (x, y) => {
        let sum = 0;
        let weight = 0;
        let amplitude = 1;
        for (const {n, grid} of layers) {
            const fx = (((x % 1) + 1) % 1) * n;
            const fy = (((y % 1) + 1) % 1) * n;
            const ix = Math.floor(fx);
            const iy = Math.floor(fy);
            const tx = smooth(fx - ix);
            const ty = smooth(fy - iy);
            const at = (gx: number, gy: number) => grid[(gy % n) * n + (gx % n)];
            const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
            const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
            sum += (top * (1 - ty) + bottom * ty) * amplitude;
            weight += amplitude;
            amplitude *= 0.5;
        }
        return sum / weight;
    };
}

/** Writes one texel; channels are 0…1. */
function put(image: ImageData, size: number, x: number, y: number, r: number, g: number, b: number, a: number) {
    const i = (y * size + x) * 4;
    image.data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    image.data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    image.data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
    image.data[i + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
}

const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Smooth tileable noise in red and green around 0.5, for UV distortion. */
function distortionNoise(image: ImageData, size: number): void {
    const nr = fractalNoise(5, 4, 3);
    const ng = fractalNoise(9, 4, 3);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            put(image, size, x, y, nr(x / size, y / size), ng(x / size, y / size), 0.5, 1);
        }
    }
}

/**
 * Tileable fractal value noise stretched along V: `cellsX` by `cellsY` cells
 * in its first octave, so its features run upward like licks of flame.
 */
function streakNoise(seed: number, cellsX: number, cellsY: number, octaves: number): (x: number, y: number) => number {
    const random = seeded(seed);
    const layers = Array.from({length: octaves}, (_, o) => {
        const nx = cellsX << o;
        const ny = cellsY << o;
        return {nx, ny, grid: Array.from({length: nx * ny}, random)};
    });
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return (x, y) => {
        let sum = 0;
        let weight = 0;
        let amplitude = 1;
        for (const {nx, ny, grid} of layers) {
            const fx = (((x % 1) + 1) % 1) * nx;
            const fy = (((y % 1) + 1) % 1) * ny;
            const ix = Math.floor(fx);
            const iy = Math.floor(fy);
            const tx = smooth(fx - ix);
            const ty = smooth(fy - iy);
            const at = (gx: number, gy: number) => grid[(gy % ny) * nx + (gx % nx)];
            const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
            const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
            sum += (top * (1 - ty) + bottom * ty) * amplitude;
            weight += amplitude;
            amplitude *= 0.55;
        }
        return sum / weight;
    };
}

/**
 * Smoky energy as tileable noise in every channel: fractal noise whose domain
 * is warped by a second noise, so it curls like smoke, cut into bright
 * blotches with clear gaps, and laced with the thin ridges where it crosses
 * its middle value.
 */
function smokeNoise(image: ImageData, size: number): void {
    const n = streakNoise(81, 4, 4, 5);
    const wx = streakNoise(23, 3, 3, 3);
    const wy = streakNoise(57, 3, 3, 3);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            const value = n(u + (wx(u, v) - 0.5) * 0.45, v + (wy(u, v) - 0.5) * 0.45);
            const blotch = smoothstep(0.5, 0.76, value);
            const ridge = Math.pow(1 - Math.abs(value * 2 - 1), 8) * 0.5;
            const a = Math.min(1, blotch + ridge);
            put(image, size, x, y, a, a, a, a);
        }
    }
}

/** In every channel: full in the middle, fading to nothing at the edge of the disc. */
function discMask(image: ImageData, size: number): void {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
            const m = smoothstep(1, 0.3, r);
            put(image, size, x, y, m, m, m, 1);
        }
    }
}

/** A soft round glow: white, alpha falling off as a Gaussian, dithered so a faint glow does not band. */
function softGlow(image: ImageData, size: number): void {
    const random = seeded(3);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const dy = (y + 0.5) / size - 0.5;
            const a = Math.exp(-(dx * dx + dy * dy) * 18) * smoothstep(0.5, 0.42, Math.hypot(dx, dy));
            put(image, size, x, y, 1, 1, 1, a + (random() - 0.5) / 255);
        }
    }
}

/** A thin wisp running up V, ragged along its sides: the plume's smoke. */
function wisp(image: ImageData, size: number): void {
    const n = fractalNoise(57, 3, 4);
    for (let y = 0; y < size; y++) {
        const v = 1 - (y + 0.5) / size;
        for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size;
            const centre = 0.5 + (n(0.3, v) - 0.5) * 0.25;
            const across = Math.abs(u - centre) / 0.3;
            const ends = smoothstep(0, 0.25, v) * smoothstep(1, 0.6, v);
            const a = Math.pow(Math.max(0, 1 - across - (n(u, v) - 0.5) * 0.5), 1.5) * ends;
            put(image, size, x, y, a, a, a, smoothstep(0, 0.6, a));
        }
    }
}

/** The aura's colour ramp along U: clear deep teal, teal, cyan, an almost white core. */
function tealRamp(image: ImageData, size: number): void {
    const stops: [number, number, number, number, number][] = [
        [0, 0.0, 0.25, 0.22, 0],
        [0.25, 0.0, 0.5, 0.38, 0.8],
        [0.55, 0.0, 0.85, 0.6, 1],
        [0.82, 0.1, 1, 0.8, 1],
        [1, 0.6, 1, 0.92, 1],
    ];
    for (let x = 0; x < size; x++) {
        const u = x / (size - 1);
        let i = 0;
        while (i < stops.length - 2 && u > stops[i + 1][0]) i++;
        const [u0, r0, g0, b0, a0] = stops[i];
        const [u1, r1, g1, b1, a1] = stops[i + 1];
        const t = (u - u0) / (u1 - u0);
        for (let y = 0; y < size; y++) {
            put(image, size, x, y, r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t);
        }
    }
}

/**
 * A plain standing mannequin from capsules and spheres, about 1.8 tall with
 * its feet on the ground, merged into one mesh so a `MeshSurfaceEmitter` can
 * emit from all of it.
 */
function mannequin(scene: Scene): Mesh {
    const parts: Mesh[] = [];
    const capsule = (
        radius: number,
        height: number,
        x: number,
        y: number,
        z = 0,
        scale: [number, number, number] = [1, 1, 1],
        tilt = 0,
        pitch = 0
    ) => {
        const mesh = CreateCapsule('part', {radius, height, tessellation: 16, subdivisions: 2}, scene);
        mesh.position.set(x, y, z);
        mesh.scaling.set(...scale);
        mesh.rotation.set(pitch, 0, tilt);
        parts.push(mesh);
    };
    const ball = (diameter: number, x: number, y: number, z = 0, scale: [number, number, number] = [1, 1, 1]) => {
        const mesh = CreateSphere('part', {diameter, segments: 12}, scene);
        mesh.position.set(x, y, z);
        mesh.scaling.set(...scale);
        parts.push(mesh);
    };
    ball(0.23, 0, 1.66, 0, [0.9, 1.15, 1]);
    capsule(0.05, 0.16, 0, 1.52);
    capsule(0.16, 0.42, 0, 1.31, 0, [1.3, 1, 0.72]);
    capsule(0.13, 0.32, 0, 1.06, 0, [1.15, 1, 0.75]);
    capsule(0.15, 0.26, 0, 0.93, 0, [1.2, 1, 0.8]);
    for (const side of [-1, 1]) {
        ball(0.16, side * 0.25, 1.43, 0, [1.1, 0.9, 1]);
        capsule(0.055, 0.32, side * 0.28, 1.25, 0, [1, 1, 1], side * 0.12);
        capsule(0.045, 0.3, side * 0.315, 0.98, 0.02, [1, 1, 1], side * 0.05);
        ball(0.09, side * 0.325, 0.79, 0.02, [0.8, 1.2, 1]);
        capsule(0.085, 0.46, side * 0.11, 0.62, 0, [1, 1, 1], side * -0.04);
        capsule(0.06, 0.44, side * 0.12, 0.25);
        capsule(0.045, 0.22, side * 0.12, 0.045, 0.05, [1.1, 1, 0.8], 0, Math.PI / 2);
    }
    const body = Mesh.MergeMeshes(parts, true, true)!;
    body.name = 'mannequin';
    return body;
}

/** Colour over life: the colour and alpha keys spread evenly over the particle's life. */
function overLife(colors: [number, number, number][], alphas: number[]): ColorOverLife {
    return new ColorOverLife(
        new Gradient(
            colors.map((c, i) => [new Color3(c[0], c[1], c[2]), i / Math.max(1, colors.length - 1)]),
            alphas.map((a, i) => [a, i / Math.max(1, alphas.length - 1)])
        )
    );
}

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    // The reference's studio: a flat grey floor and backdrop, lit from the front left.
    scene.clearColor = new Color4(0.29, 0.31, 0.34, 1);
    // The floor fades into the backdrop, as in a studio with no horizon.
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.06;
    scene.fogColor = new Color3(0.29, 0.31, 0.34);
    camera.setPosition(new BVector3(0, 3.5, 5.4));
    camera.setTarget(new BVector3(0, 1.35, 0));

    const ground = CreateGround('ground', {width: 60, height: 60}, scene);
    const groundMaterial = new StandardMaterial('groundMaterial', scene);
    groundMaterial.diffuseColor = new Color3(0.2, 0.21, 0.23);
    groundMaterial.specularColor = Color3.Black();
    ground.material = groundMaterial;
    ground.receiveShadows = true;

    const sun = new DirectionalLight('sun', new BVector3(0.5, -1, -0.6), scene);
    sun.position = new BVector3(-3, 6, 4);
    sun.intensity = 0.6;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = 16;
    shadows.darkness = 0.35;

    // The figure glows from within: pale cyan, brighter toward its silhouette.
    const body = mannequin(scene);
    const skin = new StandardMaterial('skin', scene);
    skin.diffuseColor = new Color3(0.75, 0.9, 0.9);
    skin.emissiveColor = new Color3(0.35, 0.55, 0.55);
    skin.specularColor = new Color3(0.2, 0.25, 0.25);
    skin.emissiveFresnelParameters = new FresnelParameters({
        leftColor: new Color3(0.5, 1, 0.95),
        rightColor: new Color3(0.3, 0.5, 0.5),
        power: 2,
        bias: 0.1,
    });
    body.material = skin;
    shadows.addShadowCaster(body);

    const distortion = canvasTexture(scene, 'distortionNoise', 128, true, distortionNoise);
    const ramp = canvasTexture(scene, 'tealRamp', 64, false, tealRamp);
    const glow = canvasTexture(scene, 'softGlow', 256, false, softGlow);

    // The aura: wisps of flame wrapped round the body. Each is drawn on a
    // camera-facing sprite born on the body's surface at a random angle,
    // spinning as it grows from nothing to full size and rising slowly, so
    // the overlapping wisps swirl round the figure and climb off it. A
    // random tile of the flipbook gives every sprite one of four wisps.
    const surface = new MeshSurfaceEmitter();
    surface.mesh = body;
    const wisps = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.8, 1.2),
        startSpeed: new IntervalValue(0.05, 0.15),
        startSize: new IntervalValue(0.55, 0.8),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(0.02, 1.8, 1.05, 1)),
        emissionOverTime: new ConstantValue(90),
        shape: surface,
        texture: drawnTexture(scene, 'flameWisps', 512, drawWisps),
        uTileCount: 2,
        vTileCount: 2,
        startTileIndex: new IntervalValue(0, 4),
        blendMode: Constants.ALPHA_ADD,
    });
    wisps.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(0.35), new ConstantValue(0)));
    wisps.addBehavior(new RotationOverLife(new ConstantValue(Math.PI / 4)));
    wisps.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 1 / 3, 2 / 3, 1), 0]])));
    wisps.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 1],
                ],
                [
                    [0.8, 0],
                    [0.95, 0.38],
                    [0.08, 1],
                ]
            )
        )
    );

    // Above the head the wisps gather into a thin column licking upward.
    const crown = wisps.clone();
    crown.emitterShape = new ConeEmitter({radius: 0.08, angle: 0.12});
    crown.emitter.rotation.x = -Math.PI / 2;
    crown.emitter.position = new BVector3(0, 1.78, 0);
    crown.startSpeed = new IntervalValue(0.5, 0.8);
    crown.startSize = new IntervalValue(0.3, 0.45);
    crown.emissionOverTime = new ConstantValue(20);

    // Sparks: points of light drifting up off the body.
    const sparks = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.8, 1.4),
        startSpeed: new IntervalValue(0.1, 0.3),
        startSize: new IntervalValue(0.03, 0.07),
        startColor: new ConstantColor(new Color4(0.4, 1, 0.85, 1)),
        emissionOverTime: new ConstantValue(14),
        shape: surface,
        texture: glow,
        blendMode: Constants.ALPHA_ADD,
    });
    sparks.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(1.2), new ConstantValue(0)));
    sparks.addBehavior(new Noise(new ConstantValue(1.5), new ConstantValue(0.4)));
    sparks.addBehavior(
        overLife(
            [
                [1, 1, 1],
                [1, 1, 1],
            ],
            [0, 1, 0]
        )
    );

    // The plume: thin wisps shooting up off the head, cooling from teal into
    // dark smoke over the scene, alpha blended so they darken what they cross.
    const plume = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.6, 0.9),
        startSpeed: new IntervalValue(1.8, 2.4),
        startSize: new Vector3Function(new IntervalValue(0.1, 0.16), new IntervalValue(1.2, 1.6), new ConstantValue(1)),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(12),
        shape: new ConeEmitter({radius: 0.03, angle: 0.03}),
        renderMode: RenderMode.VerticalBillBoard,
        texture: canvasTexture(scene, 'wisp', 128, false, wisp),
        blendMode: Constants.ALPHA_COMBINE,
        uvDistortion: {map: distortion, strength: 0.05, mapUV: {tiling: [1, 0.5], scroll: [0, -0.6]}},
    });
    plume.emitter.position = new BVector3(0, 2.3, 0);
    plume.emitter.rotation.x = -Math.PI / 2;
    plume.addBehavior(
        overLife(
            [
                [0.1, 0.5, 0.46],
                [0.1, 0.3, 0.3],
                [0.14, 0.2, 0.22],
            ],
            [0, 0.18, 0.12, 0]
        )
    );
    plume.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.8, 1, 1.2, 1.4), 0]])));
    plume.addBehavior(new Noise(new ConstantValue(0.8), new ConstantValue(0.25)));

    // A soft teal halo hugging the figure, the glow the flames give off.
    const halo = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.8, 1.2),
        startSpeed: new ConstantValue(0.05),
        startSize: new IntervalValue(1, 1.5),
        startColor: new ConstantColor(new Color4(0.03, 0.22, 0.19, 1)),
        emissionOverTime: new ConstantValue(40),
        shape: surface,
        texture: glow,
        blendMode: Constants.ALPHA_ADD,
    });
    halo.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(0.8), new ConstantValue(0)));
    halo.addBehavior(
        overLife(
            [
                [1, 1, 1],
                [1, 1, 1],
            ],
            [0, 0.2, 0]
        )
    );

    // Light pooled on the floor round the feet, wide and faint.
    const pool = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(5),
        startColor: new ConstantColor(new Color4(0.06, 0.28, 0.22, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        // One pool: the burst fires every loop, but never past this.
        maxParticles: 1,
        shape: new PointEmitter(),
        renderMode: RenderMode.HorizontalBillBoard,
        texture: glow,
        blendMode: Constants.ALPHA_ADD,
    });
    pool.emitter.position = new BVector3(0, 0.01, 0.1);

    // Energy pooling on the floor round the feet: smoky noise in a soft
    // disc, laid flat and turning as they fade.
    const splash = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(1, 1.4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.8, 1.05),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(0.35, 0.7, 0.58, 1)),
        emissionOverTime: new ConstantValue(2.5),
        shape: new PointEmitter(),
        renderMode: RenderMode.HorizontalBillBoard,
        texture: canvasTexture(scene, 'smokeNoise', 256, true, smokeNoise),
        uTileCount: 4,
        vTileCount: 4,
        startTileIndex: new IntervalValue(0, 16),
        mapUV: {tiling: [4 * 1.2, 4 * 1.2], scroll: [0.05, -0.15]},
        blendMode: Constants.ALPHA_ADD,
        mask: {map: canvasTexture(scene, 'discMask', 128, false, discMask), mapUV: {channel: 1}},
        gradientMap: {ramp, channel: 'a'},
        uvDistortion: {map: distortion, strength: 0.05, mapUV: {channel: 1, scroll: [0.1, -0.2]}},
    });
    splash.emitter.position = new BVector3(0, 0.015, 0.05);
    splash.addBehavior(new RotationOverLife(new IntervalValue(-0.3, 0.3)));
    splash.addBehavior(
        overLife(
            [
                [1, 1, 1],
                [1, 1, 1],
            ],
            [0, 1, 1, 0]
        )
    );

    for (const system of [pool, splash, halo, wisps, crown, sparks, plume]) {
        batchRenderer.addSystem(system);
        systems.push(system);
    }
}

/** One turn of the camera round the figure every 4.6 seconds, as the reference's turntable. */
const ORBIT_SPEED = (Math.PI * 2) / 4.6;

export function update({camera}: DemoContext, delta: number) {
    camera.alpha += ORBIT_SPEED * delta;
}
