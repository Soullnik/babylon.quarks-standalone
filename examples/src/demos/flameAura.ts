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
    CircleEmitter,
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
    type ParticleSystemParameters,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    Vector3Function,
} from 'babylon.quarks';
import type {DemoContext} from '../types';

/*
 * A teal flame aura around a standing figure: masses of fire standing off the
 * body's surface, a thin plume rising off the head into dark smoke, a soft
 * halo and a glow pooled on the ground with flames splashing round the feet.
 * Every texture is painted below, so the effect needs no asset files.
 *
 * The fire is the masked panner of Unity's and Unreal's flame materials:
 * tongues of flame painted as noise scroll up and waver (`mapUV` scroll, UV
 * distortion) through a still flame silhouette (`mask`); the gradient map
 * colours the product and the particle's alpha wears it away from its faint
 * edges (`erosion`). A random start tile gives every sheet its own stretch of
 * the noise, as a random UV offset per particle does in those engines.
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
    texture.update(false);
    const mode = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    texture.wrapU = mode;
    texture.wrapV = mode;
    return texture;
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

/** High-contrast tileable noise in red, the order an erosion eats a flame away in. */
function erosionNoise(image: ImageData, size: number): void {
    const n = fractalNoise(33, 4, 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const v = smoothstep(0.25, 0.75, n(x / size, y / size));
            put(image, size, x, y, v, v, v, 1);
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
 * Tongues of flame as tileable noise in every channel: streaks stretched
 * upward and bent sideways by a second noise, bright where they gather and
 * clear between them.
 */
function tongueNoise(image: ImageData, size: number): void {
    const n = streakNoise(81, 5, 2, 4);
    const warp = streakNoise(23, 3, 2, 3);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            const bent = u + (warp(u, v) - 0.5) * 0.5;
            const ridge = 1 - Math.abs(n(bent, v) * 2 - 1);
            const a = smoothstep(0.35, 0.9, ridge) * smoothstep(0.15, 0.55, n(bent + 0.5, v + 0.5));
            put(image, size, x, y, a, a, a, a);
        }
    }
}

/** A flame's silhouette in red: full at its broad foot and along its middle, falling off to its sides and tip. */
function flameMask(image: ImageData, size: number): void {
    for (let y = 0; y < size; y++) {
        const v = 1 - (y + 0.5) / size;
        for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size;
            const half = 0.5 * Math.pow(1 - v, 0.6);
            const across = half > 0 ? Math.abs(u - 0.5) / half : 1;
            const m = Math.max(0, 1 - across * across) * Math.pow(1 - v, 0.5) * smoothstep(0, 0.2, v);
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

/** A blotchy patch of fire seen from above: noise inside a soft disc, red as heat. */
function groundSplash(image: ImageData, size: number): void {
    const n = fractalNoise(71, 3, 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const dy = (y + 0.5) / size - 0.5;
            const r = Math.hypot(dx, dy) * 2;
            const heat = smoothstep(0.35, 0.8, n(x / size, y / size) * (1.25 - r));
            put(image, size, x, y, heat, heat, heat, smoothstep(0, 0.4, heat));
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
    const erosion = canvasTexture(scene, 'erosionNoise', 128, true, erosionNoise);
    const ramp = canvasTexture(scene, 'tealRamp', 64, false, tealRamp);
    const glow = canvasTexture(scene, 'softGlow', 256, false, softGlow);

    // Flame sheets standing round the body: tongues of flame (the map) lick
    // upward through a flame silhouette (the mask), and the ramp colours their
    // product. The particle's alpha is the erosion level that trims their
    // faint edges. The map is laid out as a 4 by 4 flipbook of the same
    // tiling noise and each sheet starts on a random tile, so every sheet
    // shows its own stretch of the noise rather than all moving in step.
    const tongues = canvasTexture(scene, 'tongueNoise', 256, true, tongueNoise);
    const silhouette = canvasTexture(scene, 'flameMask', 128, false, flameMask);
    const sheetMaterial: Partial<ParticleSystemParameters> = {
        texture: tongues,
        uTileCount: 4,
        vTileCount: 4,
        startTileIndex: new IntervalValue(0, 16),
        mapUV: {tiling: [4 * 0.9, 4 * 0.6], scroll: [0, -0.9]},
        blendMode: Constants.ALPHA_ADD,
        mask: {map: silhouette, mapUV: {channel: 1}},
        gradientMap: {ramp, channel: 'a'},
        uvDistortion: {map: distortion, strength: 0.12, mapUV: {channel: 1, tiling: [0.7, 0.5], scroll: [0, -0.5]}},
        erosion: {softness: 0.35},
    };
    const surface = new MeshSurfaceEmitter();
    surface.mesh = body;
    const sheets = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.7, 1.1),
        startSpeed: new ConstantValue(0.04),
        startSize: new Vector3Function(
            new IntervalValue(0.22, 0.34),
            new IntervalValue(0.45, 0.8),
            new ConstantValue(1)
        ),
        startRotation: new IntervalValue(-0.15, 0.15),
        startColor: new ConstantColor(new Color4(0.4, 0.62, 0.52, 1)),
        emissionOverTime: new ConstantValue(70),
        shape: surface,
        renderMode: RenderMode.VerticalBillBoard,
        pivot: new BVector3(0, 0.15, 0),
        ...sheetMaterial,
    });
    sheets.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(0.6), new ConstantValue(0)));
    sheets.addBehavior(
        overLife(
            [
                [1, 1, 1],
                [1, 1, 1],
            ],
            [0, 0.75, 0.6, 0]
        )
    );

    // A tall thin tongue of flame licking up off the crown of the head.
    const crest = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.5, 0.8),
        startSpeed: new IntervalValue(0.6, 0.9),
        startSize: new Vector3Function(
            new IntervalValue(0.14, 0.22),
            new IntervalValue(0.6, 0.9),
            new ConstantValue(1)
        ),
        startRotation: new IntervalValue(-0.08, 0.08),
        startColor: new ConstantColor(new Color4(0.4, 0.62, 0.52, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new ConeEmitter({radius: 0.05, angle: 0.05}),
        renderMode: RenderMode.VerticalBillBoard,
        pivot: new BVector3(0, 0.3, 0),
        ...sheetMaterial,
    });
    crest.emitter.position = new BVector3(0, 1.75, 0);
    crest.emitter.rotation.x = -Math.PI / 2;
    crest.addBehavior(
        overLife(
            [
                [1, 1, 1],
                [1, 1, 1],
            ],
            [0, 0.75, 0.55, 0]
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
            [0, 0.5, 0]
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

    // Fire splashing on the floor round the feet, turning as it dissolves.
    const splash = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        worldSpace: true,
        startLife: new IntervalValue(0.5, 0.9),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.5, 0.9),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(18),
        shape: new CircleEmitter({radius: 0.3}),
        renderMode: RenderMode.HorizontalBillBoard,
        texture: canvasTexture(scene, 'groundSplash', 128, false, groundSplash),
        blendMode: Constants.ALPHA_ADD,
        gradientMap: {ramp},
        uvDistortion: {map: distortion, strength: 0.04, mapUV: {scroll: [0.2, -0.3]}},
        erosion: {mask: erosion, maskUV: {channel: 1, tiling: [1.5, 1.5]}, softness: 0.12},
    });
    splash.emitter.position = new BVector3(0, 0.02, 0.05);
    splash.emitter.rotation.x = -Math.PI / 2;
    splash.addBehavior(new RotationOverLife(new IntervalValue(-0.6, 0.6)));
    splash.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.7, 1, 1.1, 1.2), 0]])));
    splash.addBehavior(
        overLife(
            [
                [1, 1, 1],
                [1, 1, 1],
            ],
            [0.5, 1, 0]
        )
    );

    for (const system of [pool, splash, halo, plume, sheets, crest]) {
        batchRenderer.addSystem(system);
        systems.push(system);
    }
}
