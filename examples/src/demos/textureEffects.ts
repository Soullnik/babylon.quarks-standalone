import {Constants} from '@babylonjs/core/Engines/constants';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    PointEmitter,
    RenderMode,
    SphereEmitter,
} from 'babylon.quarks';
import {createColorOverLifeGradient, createSharedTexture, SHARED_ASSETS} from '../shared/common';
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

/** Soft diagonal energy streaks that tile, white on transparent. */
function streaks(ctx: CanvasRenderingContext2D, size: number): void {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const band = 0.5 + 0.5 * Math.sin(((x + y * 2) / size) * Math.PI * 6);
            const fadeX = Math.sin((x / size) * Math.PI);
            const a = Math.pow(band, 3) * fadeX;
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
            image.data[i + 3] = Math.round(a * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** A radial greyscale blob: red runs from 1 at the centre to 0 at the rim, alpha follows. */
function blob(ctx: CanvasRenderingContext2D, size: number): void {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const dy = (y + 0.5) / size - 0.5;
            const v = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(v * 255);
            image.data[i + 3] = Math.round(Math.min(1, v * 2) * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** Fire ramp along U: dark red, orange, yellow, white. */
function fireRamp(ctx: CanvasRenderingContext2D, size: number): void {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, 'rgba(60, 0, 0, 0)');
    gradient.addColorStop(0.3, 'rgba(200, 30, 0, 1)');
    gradient.addColorStop(0.6, 'rgba(255, 150, 20, 1)');
    gradient.addColorStop(0.85, 'rgba(255, 240, 120, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
}

/** Bright at U 0 fading to dark at U 1: an erosion mask that reveals from U 0 first. */
function reach(ctx: CanvasRenderingContext2D, size: number): void {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
}

/** Four jagged bolts stacked in rows, each running along U: a 1×4 sheet for a flickering beam. */
function bolts(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.clearRect(0, 0, size, size);
    let seed = 3;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const rows = 4;
    const rowHeight = size / rows;
    for (let r = 0; r < rows; r++) {
        const mid = rowHeight * (r + 0.5);
        for (const [width, alpha] of [
            [6, 0.25],
            [2, 1],
        ]) {
            seed = 3 + r * 101;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            for (let x = 8; x <= size; x += 8) {
                ctx.lineTo(x, mid + (random() - 0.5) * rowHeight * 0.7 * Math.sin((x / size) * Math.PI));
            }
            ctx.stroke();
        }
    }
}

/** Smooth value noise in the red channel, for a dissolve mask. */
function noise(ctx: CanvasRenderingContext2D, size: number): void {
    const cells = 8;
    const grid: number[] = [];
    let seed = 7;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    for (let i = 0; i < (cells + 1) * (cells + 1); i++) grid.push(random());
    const at = (gx: number, gy: number) => grid[(gy % cells) * (cells + 1) + (gx % cells)];
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const fx = (x / size) * cells;
            const fy = (y / size) * cells;
            const ix = Math.floor(fx);
            const iy = Math.floor(fy);
            const tx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
            const ty = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
            const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
            const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
            const v = top * (1 - ty) + bottom * ty;
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(v * 255);
            image.data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
}

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 3, 16));
    camera.setTarget(new BVector3(0, 1.5, 0));

    // UV scroll: one standing quad whose streak texture flows upward.
    const flow = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(3),
        startColor: new ConstantColor(new Color4(0.4, 0.8, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.VerticalBillBoard,
        texture: canvasTexture(scene, 'streaks', 128, true, streaks),
        blendMode: Constants.ALPHA_ADD,
        mapUV: {scroll: [0, -0.6]},
    });
    flow.emitter.position = new BVector3(-5, 1.5, 0);

    // Gradient map: a greyscale blob recoloured through a fire ramp, animated sheet-free.
    const embers = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(1, 1.6),
        startSpeed: new IntervalValue(1, 2),
        startSize: new IntervalValue(0.8, 1.4),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(18),
        shape: new ConeEmitter({radius: 0.3, angle: 0.2}),
        texture: canvasTexture(scene, 'blob', 64, false, blob),
        blendMode: Constants.ALPHA_ADD,
        gradientMap: {ramp: canvasTexture(scene, 'fireRamp', 64, false, fireRamp)},
    });
    embers.addBehavior(createColorOverLifeGradient(new Color4(1, 1, 1, 1), new Color4(0.5, 0.5, 0.5, 1)));
    embers.emitter.position = new BVector3(0, 0, 0);
    embers.emitter.rotation.x = -Math.PI / 2;

    // Alpha erosion: smoke that dissolves through noise with a hot edge as its alpha fades.
    const smoke = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(1.5, 2.2),
        startSpeed: new IntervalValue(0.3, 0.8),
        startSize: new IntervalValue(1.5, 2.2),
        startColor: new ConstantColor(new Color4(0.35, 0.3, 0.45, 1)),
        emissionOverTime: new ConstantValue(6),
        shape: new SphereEmitter({radius: 0.5}),
        texture: createSharedTexture(scene, SHARED_ASSETS.smoke),
        uTileCount: 2,
        vTileCount: 2,
        startTileIndex: new IntervalValue(0, 4),
        blendMode: Constants.ALPHA_COMBINE,
        erosion: {
            mask: canvasTexture(scene, 'noise', 128, true, noise),
            softness: 0.08,
            edgeWidth: 0.06,
            edgeColor: [1.5, 0.6, 0.1],
        },
    });
    smoke.addBehavior(createColorOverLifeGradient(new Color4(1, 1, 1, 1), new Color4(1, 1, 1, 0)));
    smoke.emitter.position = new BVector3(5, 1.5, 0);

    // Beam: a bolt laid from the emitter to a moving node, flickering between the sheet's rows,
    // and reaching out and back: a gradient mask on UV channel 1 runs once along the whole beam,
    // whichever row the sheet shows, and the system's tint sets how far it has reached.
    const target = new TransformNode('beamTarget', scene);
    const bolt = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1000),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.8),
        startColor: new ConstantColor(new Color4(0.6, 0.8, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Beam,
        texture: canvasTexture(scene, 'bolts', 256, false, bolts),
        uTileCount: 1,
        vTileCount: 4,
        blendMode: Constants.ALPHA_ADD,
        erosion: {mask: canvasTexture(scene, 'reach', 64, false, reach), maskUV: {channel: 1}, softness: 0.08},
    });
    bolt.tint = new Color4(1, 1, 1, 1);
    bolt.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 14, frameCount: 4}));
    bolt.emitter.position = new BVector3(-3, -1.5, 0);
    bolt.beamEnd = target;
    let t = 0;
    scene.onBeforeRenderObservable.add(() => {
        t += scene.getEngine().getDeltaTime() / 1000;
        target.position.set(3 + Math.cos(t) * 0.8, -1.5 + Math.sin(t * 1.3) * 0.8, Math.sin(t) * 0.5);
        bolt.tint!.a = Math.min(1, 0.6 + 0.6 * Math.sin(t * 1.7));
    });

    for (const system of [flow, embers, smoke, bolt]) {
        batchRenderer.addSystem(system);
        systems.push(system);
    }
}
