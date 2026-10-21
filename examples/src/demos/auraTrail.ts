import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {
    AxisAngleGenerator,
    Bezier,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    SizeOverLife,
    Vector3,
    Vector3Function,
    Vector4,
    VelocityOverLife,
} from 'babylon.quarks';
import {createColorOverLifeGradient} from '../shared/common';
import type {DemoContext} from '../types';

/** A square canvas texture painted by `paint`, wrapping or clamped. */
function canvasTexture(
    scene: Scene,
    name: string,
    size: number,
    wrap: boolean,
    paint: (ctx: CanvasRenderingContext2D, size: number) => void
): DynamicTexture {
    const texture = new DynamicTexture(name, {width: size, height: size}, scene, false);
    paint(texture.getContext() as unknown as CanvasRenderingContext2D, size);
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

/** Spiky pillars standing up off a bright foot, tiling along U: what a crown of light is drawn from. */
function pillars(ctx: CanvasRenderingContext2D, size: number): void {
    const image = ctx.createImageData(size, size);
    const random = seeded(11);
    const heights = Array.from({length: 8}, () => 0.45 + random() * 0.5);
    for (let y = 0; y < size; y++) {
        // Canvas rows run top down; the foot is the bottom row.
        const v = 1 - y / size;
        for (let x = 0; x < size; x++) {
            const u = (x / size) * heights.length;
            const column = Math.floor(u);
            const across = Math.sin((u - column) * Math.PI);
            const top = heights[column];
            const pillar = Math.max(0, 1 - v / top) * Math.pow(across, 2);
            const foot = Math.exp(-v * 9);
            const a = Math.min(1, pillar + foot);
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
            image.data[i + 3] = Math.round(a * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** A soft band across V, for rings travelling up a figure. */
function band(ctx: CanvasRenderingContext2D, size: number): void {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        const across = Math.abs(y / size - 0.5) * 2;
        const a = Math.exp(-across * across * 6);
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
            image.data[i + 3] = Math.round(a * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** Smooth value noise in red and green, wrapping, for UV distortion. */
function noise(ctx: CanvasRenderingContext2D, size: number): void {
    const cells = 6;
    const random = seeded(5);
    const gridR = Array.from({length: cells * cells}, random);
    const gridG = Array.from({length: cells * cells}, random);
    const sample = (grid: number[], fx: number, fy: number) => {
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const ty = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const at = (gx: number, gy: number) => grid[(gy % cells) * cells + (gx % cells)];
        const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
        const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
        return top * (1 - ty) + bottom * ty;
    };
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const fx = (x / size) * cells;
            const fy = (y / size) * cells;
            const i = (y * size + x) * 4;
            image.data[i] = Math.round(sample(gridR, fx, fy) * 255);
            image.data[i + 1] = Math.round(sample(gridG, fx, fy) * 255);
            image.data[i + 2] = 128;
            image.data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** Six jagged strikes stacked in rows, each running along U, the last row left empty: a gap in the flicker. */
function strikes(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.clearRect(0, 0, size, size);
    const rows = 6;
    const height = size / rows;
    for (let r = 0; r < rows - 1; r++) {
        const mid = height * (r + 0.5);
        for (const [lineWidth, alpha] of [
            [5, 0.25],
            [1.6, 1],
        ]) {
            const random = seeded(7 + r * 31);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            for (let x = 8; x <= size; x += 8) {
                ctx.lineTo(x, mid + (random() - 0.5) * height * 0.7 * Math.sin((x / size) * Math.PI));
            }
            ctx.stroke();
        }
    }
}

/** A blade's smear: bright at its tip (V 1), fading to the grip, and along U from the blade back. */
function smear(ctx: CanvasRenderingContext2D, size: number): void {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        const v = 1 - y / size;
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const a = Math.pow(v, 2) * u;
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
            image.data[i + 3] = Math.round(a * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** An open tube, `radius` wide and one tall from its foot, as the geometry a mesh particle draws. */
function tube(scene: Scene, radius: number, tessellation = 48) {
    const mesh = CreateCylinder('tube', {height: 1, diameter: radius * 2, tessellation, cap: 0}, scene);
    mesh.bakeTransformIntoVertices(
        mesh
            .computeWorldMatrix(true)
            .clone()
            .setTranslation(new BVector3(0, 0.5, 0))
    );
    const geometry = {
        instancingGeometry: new Float32Array(mesh.getVerticesData(VertexBuffer.PositionKind)!),
        instancingNormals: new Float32Array(mesh.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(mesh.getVerticesData(VertexBuffer.UVKind)!),
        instancingIndices: new Uint32Array(mesh.getIndices()!),
    };
    mesh.dispose();
    return geometry;
}

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 3, 12));
    camera.setTarget(new BVector3(0, 1.2, 0));
    const distortionMap = canvasTexture(scene, 'noise', 128, true, noise);

    // A crown of light: a tube of pillars turning round, breathing through
    // UV distortion, its faces fading so it reads thick along its edges.
    const crown = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 0.8, 0.35, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Mesh,
        ...tube(scene, 0.8),
        lighting: 'unlit',
        texture: canvasTexture(scene, 'pillars', 256, true, pillars),
        blendMode: Constants.ALPHA_ADD,
        mapUV: {scroll: [0.05, 0]},
        uvDistortion: {map: distortionMap, strength: 0.04, mapUV: {tiling: [1.5, 1.5], scroll: [0, -0.6]}},
        rim: {mode: 'fade', strength: 0.6, power: 1},
    });
    crown.emitter.position = new BVector3(-3.5, 0, 0);

    // Rings travelling up the same spot, closing in as they climb.
    const rings = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1.4),
        // Still at birth, each turned its own way about the tube's axis: a
        // point emitter would fling them, and face them, any which way.
        startSpeed: new ConstantValue(0),
        startRotation: new AxisAngleGenerator(new Vector3(0, 1, 0), new IntervalValue(0, Math.PI * 2)),
        startSize: new Vector3Function(new ConstantValue(1), new ConstantValue(0.12), new ConstantValue(1)),
        startColor: new ConstantColor(new Vector4(1, 0.9, 0.5, 1)),
        emissionOverTime: new ConstantValue(1.5),
        shape: new PointEmitter(),
        renderMode: RenderMode.Mesh,
        ...tube(scene, 0.9),
        lighting: 'unlit',
        texture: canvasTexture(scene, 'band', 64, true, band),
        blendMode: Constants.ALPHA_ADD,
        rim: {mode: 'fade', strength: 0.5, power: 1},
    });
    rings.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.75, 0.65), 0]])));
    rings.addBehavior(createColorOverLifeGradient(new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 0)));
    rings.addBehavior(new VelocityOverLife(new ConstantValue(0), new ConstantValue(1.6)));
    rings.emitter.position = new BVector3(-3.5, 0, 0);

    // A standing strike flickering between the sheet's rows, now and then a
    // gap: U runs up the beam, from the ground to the ball.
    const ball = new TransformNode('ball', scene);
    const strike = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(0.6, 0.8, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Beam,
        texture: canvasTexture(scene, 'strikes', 256, false, strikes),
        uTileCount: 1,
        vTileCount: 6,
        blendMode: Constants.ALPHA_ADD,
    });
    strike.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 16, frameCount: 6, random: true}));
    strike.emitter.position = new BVector3(0, 0, 0);
    strike.beamEnd = ball;

    // A blade slashing to and fro: its trail sweeps along the blade's axis,
    // the surface the blade passed through, curved between frames.
    const pivot = new TransformNode('pivot', scene);
    pivot.position = new BVector3(3.5, 1, 0);
    const bladeNode = new TransformNode('blade', scene);
    bladeNode.parent = pivot;
    bladeNode.position = new BVector3(1, 0, 0);
    const swing = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1.2),
        startColor: new ConstantColor(new Vector4(1, 0.55, 0.2, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        worldSpace: true,
        texture: canvasTexture(scene, 'smear', 64, false, smear),
        blendMode: Constants.ALPHA_ADD,
        rendererEmitterSettings: {
            startLength: new ConstantValue(18),
            followLocalOrigin: true,
            sideAxis: new Vector3(1, 0, 0),
            // A fast swing moves far between frames: curve the trail through
            // its samples so it stays round instead of showing their corners.
            tessellation: 6,
        },
    });
    swing.emitter.parent = bladeNode;

    let t = 0;
    scene.onBeforeRenderObservable.add(() => {
        t += scene.getEngine().getDeltaTime() / 1000;
        ball.position.set(Math.sin(t * 0.7) * 0.4, 3 + Math.sin(t * 1.3) * 0.6, 0);
        pivot.rotation.y = Math.sin(t * 5) * 1.4;
    });

    for (const system of [crown, rings, strike, swing]) {
        batchRenderer.addSystem(system);
        systems.push(system);
    }
}
