/**
 * Browser side of the parity comparison: renders an exported effect with babylon.quarks through
 * the camera Unity captured it with, and measures images. Bundled and driven by compare.mts.
 */
// The whole of Babylon, for its side-effect registrations — this page is a dev tool, not shipped.
import '@babylonjs/core';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Engine} from '@babylonjs/core/Engines/engine';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {RenderTargetTexture} from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {BatchedRenderer, ParticleEmitter, ParticleSystem, QuarksLoader, QuarksUtil} from 'babylon.quarks';

/** The fields of the capture's camera.json this page uses. */
export interface UnityCamera {
    position: [number, number, number];
    rotation: [number, number, number, number];
    verticalFieldOfView: number;
    near: number;
    far: number;
}

export interface RenderRequest {
    effectUrl: string;
    camera: UnityCamera;
    times: number[];
    /** Clear colour as the displayed sRGB value, as Unity's camera background is given. */
    background: [number, number, number, number];
    /** Fixed simulation step in seconds — Unity's capture steps with its fixedDeltaTime. */
    step: number;
    size: number;
    /**
     * Blend in linear space, as a Unity project in Linear colour space does: renders into an
     * 8-bit sRGB target, as Unity's capture does, so particle colour leaves the shaders linear
     * and is clamped and encoded on write. Off, Babylon's default: everything in gamma space.
     */
    linear: boolean;
}

export interface SystemStats {
    name: string;
    count: number;
    /** World-space mean / min / max particle position. */
    mean: number[];
    min: number[];
    max: number[];
    meanSize: number[];
    meanColor: number[];
}

export interface RenderedFrame {
    time: number;
    png: string;
    systems: SystemStats[];
}

export interface ImageStats {
    /** Mean of each channel over the whole frame, 0–1 display values. */
    mean: number[];
    /** Fraction of pixels whose brightest channel differs from the background by more than 2%. */
    coverage: number;
    /** Fraction of pixels with a channel at or above 0.98. */
    clipped: number;
    /** Sum over pixels of |pixel − background| (brightest channel), divided by the pixel count. */
    energy: number;
    /** Centroid of that difference, in pixels from the top-left. */
    centroid: number[];
    /** 5th–95th percentile extent of that difference along x and y, in pixels. */
    extent: number[];
    /** Mean colour of covered pixels. */
    coveredColor: number[];
}

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
let engine: Engine | null = null;

/** The engine, created on first use. */
function getEngine(size: number): Engine {
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    if (!engine) {
        engine = new Engine(canvas, false, {
            preserveDrawingBuffer: true,
            alpha: false,
            premultipliedAlpha: false,
            stencil: true,
            antialias: false,
        });
    }
    engine.setSize(size, size);
    return engine;
}

async function whenTexturesReady(scene: Scene): Promise<void> {
    await scene.whenReadyAsync();
    const pending = scene.textures.filter((t) => !t.isReady());
    if (pending.length > 0) {
        await new Promise<void>((resolve) => BaseTexture.WhenAllReady(pending, resolve));
    }
}

function systemStats(system: ParticleSystem): SystemStats {
    const count = system.particleNum;
    const toWorld: Matrix | null = system.worldSpace ? null : system.emitter.getWorldMatrix();
    const mean = [0, 0, 0];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const meanSize = [0, 0, 0];
    const meanColor = [0, 0, 0, 0];
    const p = new Vector3();
    for (let i = 0; i < count; i++) {
        const particle = system.particles[i];
        p.set(particle.position.x, particle.position.y, particle.position.z);
        if (toWorld) Vector3.TransformCoordinatesToRef(p, toWorld, p);
        const xyz = [p.x, p.y, p.z];
        for (let a = 0; a < 3; a++) {
            mean[a] += xyz[a] / count;
            min[a] = Math.min(min[a], xyz[a]);
            max[a] = Math.max(max[a], xyz[a]);
        }
        meanSize[0] += particle.size.x / count;
        meanSize[1] += particle.size.y / count;
        meanSize[2] += particle.size.z / count;
        meanColor[0] += particle.color.x / count;
        meanColor[1] += particle.color.y / count;
        meanColor[2] += particle.color.z / count;
        meanColor[3] += particle.color.w / count;
    }
    return {
        name: system.emitter.name,
        count,
        mean,
        min: count ? min : [0, 0, 0],
        max: count ? max : [0, 0, 0],
        meanSize,
        meanColor,
    };
}

/** mulberry32: a small seeded generator standing in for Math.random. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Loads the effect into a fresh left-handed scene — the exporter writes Unity's coordinates
 * unchanged, and Babylon's default handedness is Unity's — steps it with a fixed step and
 * renders a frame at each requested time.
 */
async function render(request: RenderRequest): Promise<RenderedFrame[]> {
    const eng = getEngine(request.size);
    const scene = new Scene(eng);
    try {
        const background = new Color4(...request.background);
        // Rendering linear, the clear colour is encoded back to sRGB with everything else.
        scene.clearColor = request.linear ? background.toLinearSpace(true) : background;
        const cam = request.camera;
        const camera = new FreeCamera('parity-camera', Vector3.FromArray(cam.position), scene);
        camera.rotationQuaternion = new Quaternion(...cam.rotation);
        camera.fov = (cam.verticalFieldOfView * Math.PI) / 180;
        camera.fovMode = FreeCamera.FOVMODE_VERTICAL_FIXED;
        camera.minZ = cam.near;
        camera.maxZ = cam.far;

        // Unity's capture renders into an 8-bit sRGB render texture, and URP takes an offscreen
        // camera's colour format from its target — so every variant of it, allowHDR or not, clamps
        // each fragment to 0–1 before blending and blends in linear space. The same target here:
        // the shaders leave colour linear (image processing is flagged as a post-process, which
        // is what they read) and the target encodes it, clamped, on write.
        let output: RenderTargetTexture | null = null;
        if (request.linear) {
            scene.imageProcessingConfiguration.applyByPostProcess = true;
            output = new RenderTargetTexture('parity-target', request.size, scene, {
                generateMipMaps: false,
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
                format: Constants.TEXTUREFORMAT_RGBA,
                samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
                generateDepthBuffer: true,
                useSRGBBuffer: true,
            });
            if (!output.getInternalTexture()?._useSRGBBuffer) {
                throw new Error('this browser has no sRGB render targets');
            }
            camera.outputRenderTarget = output;
        }

        const renderer = new BatchedRenderer('parity-renderer', scene);
        const json = await (await fetch(request.effectUrl)).json();
        // The same random numbers for every render — noise fields built while loading, then the
        // simulation — so two exports of one effect compare like for like and a run repeats.
        Math.random = seededRandom(1);
        const root = new QuarksLoader(scene).parse(json, '');
        root.parent = renderer;
        const systems: ParticleSystem[] = [];
        QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
            renderer.addSystem(emitter.system);
            systems.push(emitter.system as ParticleSystem);
        });
        Math.random = seededRandom(2);
        QuarksUtil.restart(root);
        QuarksUtil.play(root);

        scene.render();
        await whenTexturesReady(scene);

        const frames: RenderedFrame[] = [];
        let time = 0;
        for (const target of request.times) {
            while (time + request.step * 0.5 < target) {
                renderer.update(request.step);
                time += request.step;
            }
            scene.render();
            const png = output ? await targetPng(output, request.size) : canvas.toDataURL('image/png');
            frames.push({time, png, systems: systems.map(systemStats)});
        }
        return frames;
    } finally {
        scene.dispose();
    }
}

/** The target's stored (sRGB-encoded) bytes as a PNG, top row first. */
async function targetPng(target: RenderTargetTexture, size: number): Promise<string> {
    const bytes = new Uint8Array((await target.readPixels())!.buffer);
    const image = new ImageData(size, size);
    const row = size * 4;
    for (let y = 0; y < size; y++) {
        image.data.set(bytes.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    }
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
    const c = new OffscreenCanvas(size, size);
    c.getContext('2d')!.putImageData(image, 0, 0);
    const blob = await c.convertToBlob({type: 'image/png'});
    return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}

async function pixels(url: string): Promise<ImageData> {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d', {willReadFrequently: true})!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function percentile(histogram: Float64Array, total: number, q: number): number {
    let sum = 0;
    for (let i = 0; i < histogram.length; i++) {
        sum += histogram[i];
        if (sum >= total * q) return i;
    }
    return histogram.length - 1;
}

async function imageStats(url: string, background: number[]): Promise<ImageStats> {
    const img = await pixels(url);
    const {width, height, data} = img;
    const n = width * height;
    const mean = [0, 0, 0];
    const coveredColor = [0, 0, 0];
    let covered = 0;
    let clipped = 0;
    let energy = 0;
    let cx = 0;
    let cy = 0;
    const hx = new Float64Array(width);
    const hy = new Float64Array(height);
    const bg = background.map((v) => v * 255);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            mean[0] += r;
            mean[1] += g;
            mean[2] += b;
            const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) / 255;
            if (Math.max(r, g, b) >= 250) clipped++;
            if (d > 0.02) {
                covered++;
                coveredColor[0] += r;
                coveredColor[1] += g;
                coveredColor[2] += b;
            }
            energy += d;
            cx += d * x;
            cy += d * y;
            hx[x] += d;
            hy[y] += d;
        }
    }
    return {
        mean: mean.map((v) => v / n / 255),
        coverage: covered / n,
        clipped: clipped / n,
        energy: energy / n,
        centroid: energy > 0 ? [cx / energy, cy / energy] : [width / 2, height / 2],
        extent:
            energy > 0
                ? [
                      percentile(hx, energy, 0.95) - percentile(hx, energy, 0.05),
                      percentile(hy, energy, 0.95) - percentile(hy, energy, 0.05),
                  ]
                : [0, 0],
        coveredColor: covered > 0 ? coveredColor.map((v) => v / covered / 255) : [0, 0, 0],
    };
}

export interface SheetRow {
    label: string;
    urls: string[];
}

/** Lays rows of frames out in a grid with a label column. */
async function sheet(rows: SheetRow[], thumb: number, columnLabels: string[]): Promise<string> {
    const labelWidth = 120;
    const header = 18;
    const columns = Math.max(...rows.map((r) => r.urls.length));
    const c = new OffscreenCanvas(labelWidth + columns * thumb, header + rows.length * thumb);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e0e0e0';
    columnLabels.forEach((label, i) => ctx.fillText(label, labelWidth + i * thumb + 4, 13));
    for (let r = 0; r < rows.length; r++) {
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(rows[r].label, 6, header + r * thumb + thumb / 2);
        for (let i = 0; i < rows[r].urls.length; i++) {
            const bitmap = await createImageBitmap(await (await fetch(rows[r].urls[i])).blob());
            ctx.drawImage(bitmap, labelWidth + i * thumb, header + r * thumb, thumb, thumb);
        }
    }
    const blob = await c.convertToBlob({type: 'image/png'});
    return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}

declare global {
    interface Window {
        parity: {
            render: typeof render;
            imageStats: typeof imageStats;
            sheet: typeof sheet;
        };
    }
}

window.parity = {render, imageStats, sheet};
