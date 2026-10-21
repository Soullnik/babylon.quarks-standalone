import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector2 as BVector2} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Matrix4, Quaternion, TrailParticle, TrailSettings, Vector3} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import type {ParticleSystem} from './ParticleSystem';
import {registerShaders, shaderLanguageFor} from './shaders/shaderLanguageSupport';
import trail_frag from './shaders/trail_frag.glsl';
import trail_frag_wgsl from './shaders/trail_frag.wgsl';
import trail_vert from './shaders/trail_vert.glsl';
import trail_vert_wgsl from './shaders/trail_vert.wgsl';
import type {DepthBinding} from './softDepth';
import {trailCurveTension, trailTessellation} from './trailCurve';
import {VFXBatch} from './VFXBatch';

/**
 * One trail's points for a frame, in world space: where each lies, its side
 * when the trail is swept, its width and its color. Grown as needed and kept,
 * so drawing a trail allocates nothing.
 */
class TrailSamples {
    position = new Float32Array(0);
    side = new Float32Array(0);
    size = new Float32Array(0);
    color = new Float32Array(0);

    reserve(count: number): this {
        if (count > this.size.length) {
            const capacity = Math.max(count, this.size.length * 2, 64);
            this.position = new Float32Array(capacity * 3);
            this.side = new Float32Array(capacity * 3);
            this.size = new Float32Array(capacity);
            this.color = new Float32Array(capacity * 4);
        }
        return this;
    }

    /** Sample `i` at the point, carried by the matrix `m` (column-major elements) when given. */
    writePoint(i: number, x: number, y: number, z: number, m: ArrayLike<number> | null): void {
        const o = i * 3;
        if (m) {
            const w = 1 / (m[3] * x + m[7] * y + m[11] * z + m[15]);
            this.position[o] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * w;
            this.position[o + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * w;
            this.position[o + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * w;
        } else {
            this.position[o] = x;
            this.position[o + 1] = y;
            this.position[o + 2] = z;
        }
    }

    /** Sample `i`'s side, a direction turned (and scaled) by `m` when given. */
    writeSide(i: number, x: number, y: number, z: number, m: ArrayLike<number> | null): void {
        const o = i * 3;
        if (m) {
            this.side[o] = m[0] * x + m[4] * y + m[8] * z;
            this.side[o + 1] = m[1] * x + m[5] * y + m[9] * z;
            this.side[o + 2] = m[2] * x + m[6] * y + m[10] * z;
        } else {
            this.side[o] = x;
            this.side[o + 1] = y;
            this.side[o + 2] = z;
        }
    }

    writeColor(i: number, r: number, g: number, b: number, a: number): void {
        const o = i * 4;
        this.color[o] = r;
        this.color[o + 1] = g;
        this.color[o + 2] = b;
        this.color[o + 3] = a;
    }
}

export class TrailBatch extends VFXBatch {
    private positionBuffer!: Float32Array;
    private previousBuffer!: Float32Array;
    private nextBuffer!: Float32Array;
    private uvBuffer!: Float32Array;
    /** UV channel 1: along the trail and across it, without the sheet's cell; only when a texture reads it. */
    private uv1Buffer: Float32Array | null = null;
    private sideBuffer!: Float32Array;
    private widthBuffer!: Float32Array;
    private colorBuffer!: Float32Array;
    private indexBuffer!: Uint32Array;
    /** True while the batch is parked on the degenerate draw, see uploadGeometry. */
    private drawsNothing = false;
    private previousVB!: VertexBuffer;
    private nextVB!: VertexBuffer;
    private sideVB!: VertexBuffer;
    private widthVB!: VertexBuffer;

    constructor(settings: VFXBatchSettings, scene: Scene, depth: DepthBinding | null = null) {
        super(settings, scene, depth);
        // Trail buffers hold two vertices per recorded sample and are the largest
        // per-batch allocation in the library, so start small and let
        // expandBuffers grow to whatever the batch actually needs.
        this.maxParticles = 1024;
        this.setupBuffers();
        this.rebuildMaterial();
    }

    setupBuffers(): void {
        this.mesh.dispose();
        this.mesh = new Mesh('trailBatch', this.scene);
        this.configureMesh();
        this.buildGeometryBuffers();
    }

    private buildGeometryBuffers(): void {
        this.positionBuffer = new Float32Array(this.maxParticles * 6);
        this.previousBuffer = new Float32Array(this.maxParticles * 6);
        this.nextBuffer = new Float32Array(this.maxParticles * 6);
        this.uvBuffer = new Float32Array(this.maxParticles * 4);
        this.uv1Buffer = this.usesUV1() ? new Float32Array(this.maxParticles * 4) : null;
        this.sideBuffer = new Float32Array(this.maxParticles * 2);
        this.widthBuffer = new Float32Array(this.maxParticles * 2);
        this.colorBuffer = new Float32Array(this.maxParticles * 8);
        this.indexBuffer = new Uint32Array(this.maxParticles * 6);
        // Vertices come in pairs, one per side of the ribbon, so the side never
        // changes: written once here and never uploaded again.
        for (let i = 0; i < this.sideBuffer.length; i += 2) {
            this.sideBuffer[i] = 1;
            this.sideBuffer[i + 1] = -1;
        }

        // Initialize with full-capacity buffers (updatable) and a dummy triangle
        this.positionBuffer[0] = 0;
        this.positionBuffer[1] = 0;
        this.positionBuffer[2] = 0;
        this.positionBuffer[3] = 1;
        this.positionBuffer[4] = 0;
        this.positionBuffer[5] = 0;
        this.positionBuffer[6] = 0;
        this.positionBuffer[7] = 1;
        this.positionBuffer[8] = 0;
        this.positionBuffer[9] = 1;
        this.positionBuffer[10] = 1;
        this.positionBuffer[11] = 0;
        this.indexBuffer[0] = 0;
        this.indexBuffer[1] = 1;
        this.indexBuffer[2] = 2;
        this.indexBuffer[3] = 1;
        this.indexBuffer[4] = 3;
        this.indexBuffer[5] = 2;

        // Set standard vertex data with full buffer capacity (updatable)
        this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positionBuffer, true);
        this.mesh.setVerticesData(VertexBuffer.UVKind, this.uvBuffer, true);
        if (this.uv1Buffer) {
            this.mesh.setVerticesData(VertexBuffer.UV2Kind, this.uv1Buffer, true);
        }
        this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colorBuffer, true, 4);
        // The whole array, not just the dummy triangle: this call is what sizes
        // the GPU index buffer, and updateIndices later writes into it without
        // resizing it. Handing it six indices here left a 24 byte buffer that
        // every later frame overran — WebGL tolerated it, WebGPU rejects the
        // draw outright ("index range does not fit in index buffer size").
        // The vertex buffers above are already created at full capacity; this
        // was the one that was not.
        this.mesh.setIndices(this.indexBuffer, null, true);
        this.drawsNothing = false;
        if (this.mesh.subMeshes && this.mesh.subMeshes.length > 0) {
            // Until the first update, only the dummy triangle is real.
            this.mesh.subMeshes[0].indexCount = 6;
        }
        const engine = this.scene.getEngine();
        this.previousVB = new VertexBuffer(engine, this.previousBuffer, 'previous', true, false, 3, false);
        this.nextVB = new VertexBuffer(engine, this.nextBuffer, 'next', true, false, 3, false);
        this.sideVB = new VertexBuffer(engine, this.sideBuffer, 'side', true, false, 1, false);
        this.widthVB = new VertexBuffer(engine, this.widthBuffer, 'width', true, false, 1, false);
        this.mesh.setVerticesBuffer(this.previousVB);
        this.mesh.setVerticesBuffer(this.nextVB);
        this.mesh.setVerticesBuffer(this.sideVB);
        this.mesh.setVerticesBuffer(this.widthVB);

        // The bounds come from the ribbons each fill writes (configureMesh set
        // the placeholder); the sub meshes have to share them.
        if (this.mesh.subMeshes) {
            this.adoptMeshBounds();
        }
    }

    expandBuffers(target: number): void {
        while (target >= this.maxParticles) {
            this.maxParticles *= 2;
        }
        // Release the previous custom attribute buffers; setVerticesBuffer only
        // replaces the reference, so skipping this leaks GPU memory on every grow.
        this.previousVB?.dispose();
        this.nextVB?.dispose();
        this.sideVB?.dispose();
        this.widthVB?.dispose();
        this.buildGeometryBuffers();
    }

    rebuildMaterial(): void {
        // Stable name: the trail shader source never varies, so registering it once
        // keeps Effect.ShadersStore bounded and lets Babylon reuse compiled effects.
        const shaderName = 'quarksTrail';
        const defines: string[] = this.fogDefines();

        if (this.settings.texture) {
            defines.push('USE_MAP');
        }
        defines.push(...this.surfaceDefines());

        const shaderLanguage = shaderLanguageFor(this.scene.getEngine());
        registerShaders(
            shaderName,
            {glsl: trail_vert, wgsl: trail_vert_wgsl},
            {glsl: trail_frag, wgsl: trail_frag_wgsl},
            shaderLanguage
        );

        const attributes = ['position', 'previous', 'next', 'side', 'width', 'uv', 'color'];
        if (this.uv1Buffer) {
            attributes.push('uv2');
        }
        const uniforms = [
            'world',
            'view',
            'projection',
            'worldViewProjection',
            'lineWidth',
            'resolution',
            'sizeAttenuation',
            ...VFXBatch.FOG_UNIFORMS,
        ];
        const samplers: string[] = [];

        if (this.settings.texture) {
            samplers.push('map');
        }
        this.surfaceUniforms(uniforms, samplers);

        const mat = new ShaderMaterial(
            shaderName,
            this.scene,
            {vertex: shaderName, fragment: shaderName},
            {
                attributes,
                uniforms,
                samplers,
                defines,
                needAlphaBlending: this.settings.materialTransparent,
                shaderLanguage,
            }
        );

        if (this.settings.texture) {
            mat.setTexture('map', this.settings.texture);
        }
        const engine = this.scene.getEngine();
        mat.setFloat('lineWidth', 1);
        // Reused across binds, and only re-uploaded when the render target resizes.
        const resolution = new BVector2(engine.getRenderWidth(), engine.getRenderHeight());
        mat.setVector2('resolution', resolution);
        mat.setFloat('sizeAttenuation', 1);
        mat.onBindObservable.add(() => {
            const renderEngine = this.scene.getEngine();
            const width = renderEngine.getRenderWidth();
            const height = renderEngine.getRenderHeight();
            if (resolution.x !== width || resolution.y !== height) {
                resolution.x = width;
                resolution.y = height;
                VFXBatch.writeBound(mat, (target) => target.setVector2('resolution', resolution));
            }
        });

        this.bindFog(mat);
        this.bindSurface(mat);
        mat.backFaceCulling = false;

        if (this.settings.materialTransparent) {
            mat.alphaMode = this.settings.materialBlendMode;
        } else {
            mat.alphaMode = Constants.ALPHA_DISABLE;
        }
        mat.needDepthPrePass = this.settings.materialDepthWrite;
        mat.forceDepthWrite = this.settings.materialDepthWrite;
        mat.disableDepthWrite = !this.settings.materialDepthWrite;
        // 0 keeps the engine's depth function (LEQUAL); ALWAYS draws over everything, like ZTest Always.
        mat.depthFunction = this.settings.materialDepthTest ? 0 : Constants.ALWAYS;

        this.mesh.material = mat;
    }

    private vector_ = new Vector3();
    private vector2_ = new Vector3();
    private vector3_ = new Vector3();
    private quaternion_ = new Quaternion();

    /**
     * Brings the emitter's world matrix up to date when its transform changed.
     *
     * Babylon only recomputes a world matrix once per render id, so a frame that
     * moves the emitter after that (or a step driven without rendering) would
     * draw the ribbon against the old one. Recomputing unconditionally every
     * frame costs a matrix compose per system; checking the transform cache
     * first makes a still emitter free.
     */
    private readonly samples_ = new TrailSamples();
    private readonly curve_ = new TrailSamples();

    /** The scratch a trail's samples are gathered into, room for `count`. */
    private trailSamples(count: number): TrailSamples {
        return this.samples_.reserve(count);
    }

    /**
     * The curve through a trail's `count` samples, each segment drawn as
     * `steps + 1`: through the first `curved` (the recorded samples) a
     * centripetal cardinal spline (Catmull-Rom at tension 0, straight at 1),
     * the same through the sides of a swept trail with each side's length
     * eased between its ends'; past them (the live tip) a straight segment,
     * so the recorded part does not move as the tip does. Widths and colors
     * are eased along. The curve passes through every sample, so the trail
     * keeps its shape and only loses its corners; centripetal spacing keeps
     * it from overshooting where samples lie unevenly apart.
     */
    private tessellate(
        samples: TrailSamples,
        curved: number,
        count: number,
        steps: number,
        tension: number,
        swept: boolean
    ): TrailSamples {
        const out = this.curve_.reserve((count - 1) * (steps + 1) + 1);
        const p = samples.position;
        const sd = samples.side;
        const op = out.position;
        const os = out.side;
        const tangent = 1 - tension;
        // Knot spacing: the square root of a segment's length.
        const knot = (from: number, to: number) =>
            Math.sqrt(
                Math.sqrt((p[to] - p[from]) ** 2 + (p[to + 1] - p[from + 1]) ** 2 + (p[to + 2] - p[from + 2]) ** 2)
            );
        let k = 0;
        for (let i = 0; i + 1 < count; i++) {
            const a = i * 3;
            const b = a + 3;
            // Each end's tangent, as weights of the neighbouring differences
            // (Yuksel et al., parameterization of Catmull-Rom curves).
            let w1a = 0;
            let w1b = 0;
            let w1c = 0;
            let w2a = 0;
            let w2b = 0;
            let w2c = 0;
            let before = a;
            let after = b;
            if (i + 1 < curved) {
                before = (i > 0 ? i - 1 : i) * 3;
                after = (i + 2 < curved ? i + 2 : i + 1) * 3;
                const t12 = knot(a, b);
                if (t12 > 1e-6) {
                    const t01 = knot(before, a);
                    const t23 = knot(b, after);
                    w1c = tangent;
                    w2a = tangent;
                    if (t01 > 1e-6) {
                        w1a = (tangent * t12) / t01;
                        w1b = (-tangent * t12) / (t01 + t12);
                    }
                    if (t23 > 1e-6) {
                        w2b = (-tangent * t12) / (t12 + t23);
                        w2c = (tangent * t12) / t23;
                    }
                }
            }
            // m1 = w1a (A - Before) + w1b (B - Before) + w1c (B - A);
            // m2 = w2a (B - A) + w2b (After - A) + w2c (After - B).
            const la = swept ? Math.sqrt(sd[a] * sd[a] + sd[a + 1] * sd[a + 1] + sd[a + 2] * sd[a + 2]) : 0;
            const lb = swept ? Math.sqrt(sd[b] * sd[b] + sd[b + 1] * sd[b + 1] + sd[b + 2] * sd[b + 2]) : 0;
            for (let step = 0; step <= steps; step++, k++) {
                const t = step / (steps + 1);
                const t2 = t * t;
                const t3 = t2 * t;
                const h00 = 2 * t3 - 3 * t2 + 1;
                const h10 = t3 - 2 * t2 + t;
                const h01 = -2 * t3 + 3 * t2;
                const h11 = t3 - t2;
                const o = k * 3;
                for (let c = 0; c < 3; c++) {
                    const A = p[a + c];
                    const B = p[b + c];
                    const m1 = w1a * (A - p[before + c]) + w1b * (B - p[before + c]) + w1c * (B - A);
                    const m2 = w2a * (B - A) + w2b * (p[after + c] - A) + w2c * (p[after + c] - B);
                    op[o + c] = h00 * A + h10 * m1 + h01 * B + h11 * m2;
                }
                if (swept) {
                    let x = 0;
                    let y = 0;
                    let z = 0;
                    for (let c = 0; c < 3; c++) {
                        const A = sd[a + c];
                        const B = sd[b + c];
                        const m1 = w1a * (A - sd[before + c]) + w1b * (B - sd[before + c]) + w1c * (B - A);
                        const m2 = w2a * (B - A) + w2b * (sd[after + c] - A) + w2c * (sd[after + c] - B);
                        const v = h00 * A + h10 * m1 + h01 * B + h11 * m2;
                        if (c === 0) x = v;
                        else if (c === 1) y = v;
                        else z = v;
                    }
                    // A side turning with the blade keeps its length on the way round.
                    let length = Math.sqrt(x * x + y * y + z * z);
                    if (length <= 1e-6 * Math.max(la, lb, 1e-6)) {
                        // Turned half round in one step: no way round to follow, so
                        // hold the nearer end's side rather than pinch to nothing.
                        const from = t < 0.5 ? a : b;
                        x = sd[from];
                        y = sd[from + 1];
                        z = sd[from + 2];
                        length = t < 0.5 ? la : lb;
                    }
                    const fit = length > 0 ? (la + (lb - la) * t) / length : 0;
                    os[o] = x * fit;
                    os[o + 1] = y * fit;
                    os[o + 2] = z * fit;
                }
                out.size[k] = samples.size[i] + (samples.size[i + 1] - samples.size[i]) * t;
                const ca = i * 4;
                const co = k * 4;
                for (let c = 0; c < 4; c++) {
                    out.color[co + c] = samples.color[ca + c] + (samples.color[ca + 4 + c] - samples.color[ca + c]) * t;
                }
            }
        }
        // The last sample, as it is.
        const last = (count - 1) * 3;
        const o = k * 3;
        for (let c = 0; c < 3; c++) {
            op[o + c] = p[last + c];
            os[o + c] = sd[last + c];
        }
        out.size[k] = samples.size[count - 1];
        for (let c = 0; c < 4; c++) out.color[k * 4 + c] = samples.color[(count - 1) * 4 + c];
        return out;
    }

    /**
     * Writes a swept ribbon's vertex pair at `pi`: the sample at (x, y, z)
     * pushed `half` widths along its side (sx, sy, sz) one way for the first
     * vertex and the other way for the second.
     */
    private writeSweptPair(
        pi: number,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        half: number
    ): void {
        const positions = this.positionBuffer;
        positions[pi] = x + sx * half;
        positions[pi + 1] = y + sy * half;
        positions[pi + 2] = z + sz * half;
        positions[pi + 3] = x - sx * half;
        positions[pi + 4] = y - sy * half;
        positions[pi + 5] = z - sz * half;
    }

    private static ensureWorldMatrix(system: IParticleSystem): void {
        const emitter = system.emitter as {
            computeWorldMatrix?: (force: boolean) => void;
            isSynchronized?: () => boolean;
        };
        if (emitter.computeWorldMatrix && (!emitter.isSynchronized || !emitter.isSynchronized())) {
            emitter.computeWorldMatrix(true);
        }
    }

    update(): void {
        let index = 0;
        let triangles = 0;

        let particleCount = 0;
        const visibleSystems = this.getVisibleSystems();
        for (let s = 0; s < visibleSystems.length; s++) {
            const system = visibleSystems[s];
            const particles = system.particles;
            const tessellation = trailTessellation(system.rendererEmitterSettings as TrailSettings);
            for (let j = 0; j < system.particleNum; j++) {
                const historyCount = (particles[j] as TrailParticle).historyCount;
                if (historyCount === 0) {
                    continue;
                }
                // +1 reserves the live tip that frames between simulation
                // steps append ahead of the recorded head; a tessellated trail
                // draws each segment as several.
                particleCount += (historyCount * (tessellation + 1) + 1) * 2;
            }
        }
        if (particleCount > this.maxParticles) {
            this.expandBuffers(particleCount);
        }

        for (let s = 0; s < visibleSystems.length; s++) {
            const system = visibleSystems[s];
            const firstVertex = index;
            TrailBatch.ensureWorldMatrix(system);
            const rotation = this.quaternion_;
            const translation = this.vector2_;
            const scale = this.vector3_;
            const emitterMatrix = system.emitter.matrixWorld;
            emitterMatrix.decompose(translation, rotation, scale);

            const particles = system.particles;
            const particleNum = system.particleNum;
            const uTileCount = this.settings.uTileCount;
            const vTileCount = this.settings.vTileCount;
            const tileWidth = 1 / uTileCount;
            const tileHeight = 1 / vTileCount;
            const systemWorldSpace = system.worldSpace;
            const objectScale = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;
            // A ribbon's samples were recorded at past steps and stay where they
            // were. The particle itself has moved on since the step that wrote
            // the newest sample, so frames that run no step would freeze the
            // whole trail if that head were left behind. Moving the recorded
            // head forward to catch up stretches the last segment from one
            // step of travel to almost two, then snaps it back when the next
            // step lands — a rubber-band the eye reads as lost smoothness,
            // especially at 120Hz where every other frame is between steps.
            // Appending a live tip ahead of the recorded samples keeps the
            // body still and the tip moving without that pulse. A trail pinned
            // to the emitter's origin is driven by the emitter's transform
            // rather than by the particle's velocity, so it is left alone.
            const trailSettings = system.rendererEmitterSettings as TrailSettings;
            const uvFromHead = Boolean(trailSettings.uvFromHead);
            const uv1 = this.uv1Buffer;
            const colorFromParticle = Boolean(trailSettings.colorFromParticle);
            // Recorded samples already sit in world space; the live tip still comes
            // from the particle's own (local) position.
            const samplesInWorld = systemWorldSpace || Boolean(trailSettings.recordWorldSpace);
            // A swept trail spans each sample's recorded side instead of facing
            // the camera: its vertices are laid out here, and a zero width
            // keeps the shader from pushing them.
            const sideAxis = trailSettings.sideAxis;
            const residual = trailSettings.followLocalOrigin ? 0 : (system.simulationResidual ?? 0);
            // Measured from the step the particle just took, not from its
            // velocity: a trail pulled along by an orbit or by a plugin's own
            // behavior has motion no velocity term describes.
            const stepFraction = residual === 0 ? 0 : residual / (system.simulationStep ?? residual);

            const tessellation = trailTessellation(trailSettings);
            const curveTension = trailCurveTension(trailSettings);

            for (let j = 0; j < particleNum; j++) {
                const particle = particles[j] as TrailParticle;
                const particleHistoryLength = particle.historyCount;
                if (particleHistoryLength === 0) {
                    continue;
                }
                const historyCapacity = particle.historyCapacity;
                const historyPositions = particle.historyPositions;
                const historySizes = particle.historySizes;
                const historySides = particle.historySides;
                const swept = sideAxis !== undefined && historySides.length === historyCapacity * 3;
                // Every sample takes its color from one place: its own recorded slot, or
                // the particle's current row in the store.
                const colors = colorFromParticle ? particle.store.color : particle.historyColors;
                const particleColorIndex = particle.storeIndex * 4;
                // The same cell as the sprite shader: frames run along the rows, uTileCount per row,
                // with floor and a positive modulo, as the shader's floor() and mod().
                const tile = Math.floor(particle.uvTile);
                const col = ((tile % uTileCount) + uTileCount) % uTileCount;
                const row = Math.floor(tile / uTileCount);
                const particleMatrix = particle.parentMatrix as unknown as Matrix4 | undefined;
                const me = (particleMatrix ?? emitterMatrix).elements;
                const widthScale = systemWorldSpace || particle.parentMatrix ? 1 : objectScale;
                const sampleCount = particleHistoryLength + (stepFraction !== 0 ? 1 : 0);
                const samples = this.trailSamples(sampleCount);

                // The recorded samples, oldest first, brought into world space once.
                let slot = particle.getHistoryIndex(0);
                for (let i = 0; i < particleHistoryLength; i++) {
                    const p = historyPositions;
                    samples.writePoint(i, p[slot * 3], p[slot * 3 + 1], p[slot * 3 + 2], samplesInWorld ? null : me);
                    if (swept) {
                        const s = historySides;
                        samples.writeSide(i, s[slot * 3], s[slot * 3 + 1], s[slot * 3 + 2], samplesInWorld ? null : me);
                    }
                    samples.size[i] = historySizes[slot];
                    const ci = colorFromParticle ? particleColorIndex : slot * 4;
                    samples.writeColor(i, colors[ci], colors[ci + 1], colors[ci + 2], colors[ci + 3]);
                    slot = slot + 1 === historyCapacity ? 0 : slot + 1;
                }

                // Live tip: same place a sprite would be drawn this frame, past
                // the last recorded sample. The recorded ribbon stays put.
                if (stepFraction !== 0) {
                    const previousHead = particle.previousPosition;
                    const position = particle.position;
                    const tip = particleHistoryLength;
                    samples.writePoint(
                        tip,
                        position.x + (position.x - previousHead.x) * stepFraction,
                        position.y + (position.y - previousHead.y) * stepFraction,
                        position.z + (position.z - previousHead.z) * stepFraction,
                        systemWorldSpace ? null : me
                    );
                    if (swept) {
                        // The side as the emitter holds it now.
                        samples.writeSide(tip, sideAxis!.x, sideAxis!.y, sideAxis!.z, me);
                    }
                    samples.size[tip] = particle.size.x;
                    const tipColor = particle.color;
                    samples.writeColor(tip, tipColor.x, tipColor.y, tipColor.z, tipColor.w);
                }

                // Curved through the samples (see TrailSettings.tessellation),
                // or drawn through them as they are.
                const drawn =
                    tessellation > 0
                        ? this.tessellate(
                              samples,
                              particleHistoryLength,
                              sampleCount,
                              tessellation,
                              curveTension,
                              swept
                          )
                        : samples;
                const drawnCount = tessellation > 0 ? (sampleCount - 1) * (tessellation + 1) + 1 : sampleCount;
                // The texture spans the ribbon end to end.
                const invLength = 1 / Math.max(1, drawnCount - 1);
                const dp = drawn.position;
                const vTop = (vTileCount - row - 1) * tileHeight;
                const vBottom = (vTileCount - row) * tileHeight;

                for (let k = 0; k < drawnCount; k++, index += 2) {
                    const o = k * 3;
                    const prev = k > 0 ? o - 3 : o;
                    const next = k + 1 < drawnCount ? o + 3 : o;
                    const x = dp[o];
                    const y = dp[o + 1];
                    const z = dp[o + 2];
                    const size = drawn.size[k];

                    const pi = index * 3;
                    if (swept) {
                        const ds = drawn.side;
                        this.writeSweptPair(pi, x, y, z, ds[o], ds[o + 1], ds[o + 2], size * 0.5);
                        // A zero width keeps the shader from pushing the pair.
                        this.widthBuffer[index] = 0;
                        this.widthBuffer[index + 1] = 0;
                    } else {
                        this.positionBuffer[pi] = x;
                        this.positionBuffer[pi + 1] = y;
                        this.positionBuffer[pi + 2] = z;
                        this.positionBuffer[pi + 3] = x;
                        this.positionBuffer[pi + 4] = y;
                        this.positionBuffer[pi + 5] = z;
                        this.widthBuffer[index] = size * widthScale;
                        this.widthBuffer[index + 1] = size * widthScale;
                    }

                    this.previousBuffer[pi] = dp[prev];
                    this.previousBuffer[pi + 1] = dp[prev + 1];
                    this.previousBuffer[pi + 2] = dp[prev + 2];
                    this.previousBuffer[pi + 3] = dp[prev];
                    this.previousBuffer[pi + 4] = dp[prev + 1];
                    this.previousBuffer[pi + 5] = dp[prev + 2];

                    this.nextBuffer[pi] = dp[next];
                    this.nextBuffer[pi + 1] = dp[next + 1];
                    this.nextBuffer[pi + 2] = dp[next + 2];
                    this.nextBuffer[pi + 3] = dp[next];
                    this.nextBuffer[pi + 4] = dp[next + 1];
                    this.nextBuffer[pi + 5] = dp[next + 2];

                    const ui = index * 2;
                    const along = k * invLength;
                    const u1 = uvFromHead ? 1 - along : along;
                    const u = (u1 + col) * tileWidth;
                    this.uvBuffer[ui] = u;
                    this.uvBuffer[ui + 1] = vTop;
                    this.uvBuffer[ui + 2] = u;
                    this.uvBuffer[ui + 3] = vBottom;
                    if (uv1) {
                        uv1[ui] = u1;
                        uv1[ui + 1] = 0;
                        uv1[ui + 2] = u1;
                        uv1[ui + 3] = 1;
                    }

                    const dc = drawn.color;
                    const c = k * 4;
                    const cci = index * 4;
                    this.colorBuffer[cci] = dc[c];
                    this.colorBuffer[cci + 1] = dc[c + 1];
                    this.colorBuffer[cci + 2] = dc[c + 2];
                    this.colorBuffer[cci + 3] = dc[c + 3];
                    this.colorBuffer[cci + 4] = dc[c];
                    this.colorBuffer[cci + 5] = dc[c + 1];
                    this.colorBuffer[cci + 6] = dc[c + 2];
                    this.colorBuffer[cci + 7] = dc[c + 3];

                    if (k + 1 < drawnCount) {
                        this.indexBuffer[triangles * 3] = index;
                        this.indexBuffer[triangles * 3 + 1] = index + 1;
                        this.indexBuffer[triangles * 3 + 2] = index + 2;
                        triangles++;
                        this.indexBuffer[triangles * 3] = index + 2;
                        this.indexBuffer[triangles * 3 + 1] = index + 1;
                        this.indexBuffer[triangles * 3 + 2] = index + 3;
                        triangles++;
                    }
                }
            }
            const tint = (system as ParticleSystem).tint;
            if (tint !== undefined) {
                // As SpriteBatch does: the system's tint over its ribbons' vertices.
                const colors = this.colorBuffer;
                for (let o = firstVertex * 4, end = index * 4; o < end; o += 4) {
                    colors[o] *= tint.x;
                    colors[o + 1] *= tint.y;
                    colors[o + 2] *= tint.z;
                    colors[o + 3] *= tint.w;
                }
            }
            this.measureSystemBounds(system as ParticleSystem, firstVertex, index);
        }

        this.refreshBoundingInfo();
        this.uploadGeometry(index, triangles);
    }

    /**
     * Records a system's world bounds from the ribbon vertices just written for
     * it, padded by the widest ribbon. The store only holds each trail's head,
     * so this is where a trail's extent is known.
     */
    private measureSystemBounds(system: ParticleSystem, fromVertex: number, toVertex: number): void {
        if (toVertex <= fromVertex || typeof system.setWorldBounds !== 'function') {
            return;
        }
        const positions = this.positionBuffer;
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        // Both of each pair: a swept ribbon's edges lie apart, a facing one's coincide.
        for (let o = fromVertex * 3, end = toVertex * 3; o < end; o += 3) {
            const x = positions[o];
            const y = positions[o + 1];
            const z = positions[o + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        const widths = this.widthBuffer;
        let maxWidth = 0;
        for (let v = fromVertex; v < toVertex; v += 2) {
            const w = widths[v];
            if (w > maxWidth) maxWidth = w;
        }
        system.setWorldBounds(minX, minY, minZ, maxX, maxY, maxZ, maxWidth);
    }

    /**
     * Uploads the vertex data written by `update` and resizes the sub mesh.
     *
     * Split out of `update` on purpose: the Babylon mesh/sub-mesh plumbing here
     * runs a handful of times per frame, and folding it into the per-vertex loop
     * costs that loop its optimised code.
     */
    private uploadGeometry(index: number, triangles: number): void {
        const geometry = this.mesh.geometry;
        const indexBuffer = geometry?.getIndexBuffer();
        if (index > 0 && triangles > 0) {
            // Upload only the vertices written this frame; the buffers are sized for
            // the high-water mark of every system in the batch.
            this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positionBuffer.subarray(0, index * 3));
            this.mesh.updateVerticesData(VertexBuffer.UVKind, this.uvBuffer.subarray(0, index * 2));
            if (this.uv1Buffer) {
                this.mesh.updateVerticesData(VertexBuffer.UV2Kind, this.uv1Buffer.subarray(0, index * 2));
            }
            // Straight to the GPU buffer. Going through `mesh.updateIndices` with a
            // range whose length changes every frame makes Babylon copy the
            // indices, rebuild the sub mesh and recompute its bounds from the
            // whole position buffer, all of which this batch then undoes.
            if (indexBuffer) {
                this.scene
                    .getEngine()
                    .updateDynamicIndexBuffer(indexBuffer, this.indexBuffer.subarray(0, triangles * 3), 0);
            }
            this.previousVB.update(this.previousBuffer.subarray(0, index * 3));
            this.nextVB.update(this.nextBuffer.subarray(0, index * 3));
            this.widthVB.update(this.widthBuffer.subarray(0, index));

            const colorVB = this.mesh.getVertexBuffer(VertexBuffer.ColorKind);
            if (colorVB) colorVB.update(this.colorBuffer.subarray(0, index * 4));

            if (this.mesh.subMeshes && this.mesh.subMeshes.length > 0) {
                this.mesh.subMeshes[0].indexCount = triangles * 3;
                this.mesh.subMeshes[0].verticesCount = index;
            }
            this.drawsNothing = false;
        } else if (this.mesh.subMeshes && this.mesh.subMeshes.length > 0) {
            // Nothing to draw. Leaving the count at zero still submits the draw,
            // and WebGPU complains about it once per frame for as long as the
            // batch stays empty — which, for a looping effect, is every gap
            // between passes. Disabling the mesh instead costs a frame coming
            // back, the flicker the sprite batch already works around.
            //
            // So draw a triangle whose corners are all the same vertex: it is a
            // legal draw that rasterises nothing, whatever stale geometry is
            // still in the buffers. Only written on the way into empty, not on
            // every empty frame.
            if (!this.drawsNothing) {
                this.indexBuffer.fill(0, 0, 6);
                if (indexBuffer) {
                    this.scene.getEngine().updateDynamicIndexBuffer(indexBuffer, this.indexBuffer.subarray(0, 6), 0);
                }
                this.drawsNothing = true;
            }
            this.mesh.subMeshes[0].indexCount = 6;
            this.mesh.subMeshes[0].verticesCount = 1;
        }
    }

    /**
     * Points every sub mesh at the mesh's own bounds.
     *
     * Updating indices rebuilds the sub meshes, and a fresh one computes its
     * bounds from the vertex data — which this batch keeps deliberately stale
     * beyond the range it draws. Transparent sorting reads those bounds every
     * frame, so they have to be replaced again after every index update, not
     * only when the geometry is built.
     */
    private adoptMeshBounds(): void {
        const meshBoundingInfo = this.mesh.getBoundingInfo();
        for (const subMesh of this.mesh.subMeshes) {
            (subMesh as any)._boundingInfo = meshBoundingInfo;
        }
    }

    dispose(): void {
        if (this.mesh.material) {
            this.mesh.material.dispose();
        }
        super.dispose();
    }
}
