import {Buffer, VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import type {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Vector2 as BVector2, Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import type {Color4Like, IParticleSystem} from 'quarks.core';
import {
    IParticle,
    Matrix3,
    Matrix4,
    ParticleStore,
    Quaternion,
    SpriteParticle,
    StretchedBillBoardSettings,
    Vector3,
} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import {alignsBillboards, hasSizeLimits, takesPivotAndSizeLimits, tilesSheet} from './batchKey';
import {STRETCHED_LENGTH_FACTOR} from './batchSettings';
import {InstanceAttribute, InstanceRun, STRETCH_ATTRIBUTE} from './instanceRun';
import {gather, sortByKey, SortScratch} from './instanceSort';
import type {ParticleEmitter} from './ParticleEmitter';
import type {ParticleSystem} from './ParticleSystem';
import {copyPrefix, copyRange, PrefixViews} from './prefixViews';
import {drawsAlongVelocity, shaderProgram} from './shaderProgram';
import {registerShaders, shaderLanguageFor} from './shaders/shaderLanguageSupport';
import type {DepthBinding} from './softDepth';
import {clearDrawOrder, setDrawOrder} from './transparentSort';
import {defaultMeshLighting, MeshLightingSettings, RenderMode, VFXBatch} from './VFXBatch';

/** The speed factor a stretched billboard with a speed factor of 0 is drawn with, see `update`. */
const STRETCH_DIRECTION_ONLY = 1e-4;

/** How far toward its geometry a mesh system's sorting centre moves, see `sortCentre`. */
const SORT_NUDGE = 1e-3;

/** The batch of billboard, stretched, mesh and beam particles. @internal */
export class SpriteBatch extends VFXBatch {
    private static whiteTextureByScene = new WeakMap<Scene, RawTexture>();

    /** 1×1 white map so mesh batches always have a sampler2D (iOS WebKit). */
    private static whiteTexture(scene: Scene): RawTexture {
        let texture = SpriteBatch.whiteTextureByScene.get(scene);
        if (!texture) {
            texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
            texture.name = 'quarksMeshWhite';
            SpriteBatch.whiteTextureByScene.set(scene, texture);
            // Disposed from outside (a scene-wide texture sweep): the next batch makes a new one.
            const made = texture;
            texture.onDisposeObservable.addOnce(() => {
                if (SpriteBatch.whiteTextureByScene.get(scene) === made) {
                    SpriteBatch.whiteTextureByScene.delete(scene);
                }
            });
        }
        return texture;
    }
    private offsetBuffer!: Float32Array;
    /** The centre of the mesh's bounds in its own space; zero for a mesh centred on its pivot. */
    private readonly meshCenter = new Vector3();
    private rotationBuffer!: Float32Array;
    private sizeBuffer!: Float32Array;
    private colorBuffer!: Float32Array;
    private uvTileBuffer!: Float32Array;
    private velocityBuffer?: Float32Array;
    /**
     * Each mesh instance's stretch, its three columns one after another (see {@link meshStretch}):
     * what the vertex shader applies after the particle's turn. Mesh batches only.
     */
    private stretchBuffer?: Float32Array;

    /** Concretely typed handle on the batch material, for the lighting and live-parameter writes. */
    private shaderMaterial: ShaderMaterial | null = null;
    /** Cancels the pending rebuild for an env atlas that has not loaded yet. */
    private cancelAtlasRebuild: (() => void) | null = null;
    private disposed = false;
    /** The `'fixed'` mesh light, as shader uniforms; see applyMeshLighting. */
    private readonly fixedLightDirection = new BVector3();
    private readonly fixedLightColor = new BVector3();
    private readonly fixedAmbientColor = new BVector3();

    private offsetVB!: VertexBuffer;
    private rotationVB!: VertexBuffer;
    private sizeVB!: VertexBuffer;
    private colorVB!: VertexBuffer;
    private uvTileVB!: VertexBuffer;
    private velocityVB?: VertexBuffer;
    /**
     * The GPU side of {@link stretchBuffer}: one buffer the three columns are views of, so WebGPU
     * binds them once.
     */
    private stretchGPUBuffer?: Buffer;
    /** The batch's geometry, interleaved; see {@link setupBuffers}. */
    private geometryBuffer?: Buffer;
    /** The geometry's vertex buffers in {@link geometryBuffer}: kind, offset and size in floats. */
    private readonly geometryLayout: Array<[kind: string, offset: number, size: number]> = [];
    private vertexCount = 0;
    /** The instance attributes, in the order of {@link instanceSources}. */
    private instanceLayout: InstanceAttribute[] = [];
    /** The instance arrays in the order of {@link instanceLayout}, gathered each frame a run draws. */
    private readonly instanceSources: Array<Float32Array | undefined> = [];
    /** The meshes of the runs after the first (see `runCount`), kept while the geometry is. */
    private readonly runs: InstanceRun[] = [];
    /** Where each filled system's instances start, and past the last one where they end. */
    private readonly systemStarts: number[] = [];
    /** Instances the last fill wrote, over all runs. */
    private filledInstances = 0;
    /**
     * For a batch of meshes that lie off their pivot, where each system's meshes were drawn on
     * average in the last fill, in the world; see {@link sortCentre}.
     */
    private readonly geometryCentres = new Map<IParticleSystem, Vector3>();

    constructor(settings: VFXBatchSettings, scene: Scene, depth: DepthBinding | null = null) {
        super(settings, scene, depth);
        this.storeFixedLighting(defaultMeshLighting());
        this.maxParticles = this.initialCapacity;
        this.setupBuffers();
        this.rebuildMaterial();
    }

    /**
     * Whether each instance turns by a quaternion rather than an angle: a mesh, or a billboard
     * laid along the world's or the emitter's axes (see `RenderAlignment`).
     */
    private turnsByQuaternion(): boolean {
        return this.settings.renderMode === RenderMode.Mesh || alignsBillboards(this.settings);
    }

    /** Sets {@link meshCenter} from the mesh's vertices. */
    private measureMeshCenter(positions: ArrayLike<number>, vertexCount: number): void {
        if (this.settings.renderMode !== RenderMode.Mesh || vertexCount === 0) {
            this.meshCenter.set(0, 0, 0);
            return;
        }
        let minX = Infinity,
            minY = Infinity,
            minZ = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity,
            maxZ = -Infinity;
        for (let v = 0; v < vertexCount; v++) {
            const x = positions[v * 3],
                y = positions[v * 3 + 1],
                z = positions[v * 3 + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        this.meshCenter.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        // A centre within a thousandth of the mesh's size of its pivot counts as on it.
        const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        if (this.meshCenter.length() <= extent * 1e-3) {
            this.meshCenter.set(0, 0, 0);
        }
    }

    /**
     * The mean of where the instances from `first` to `end` draw their mesh's centre, in the
     * world, into `out`: each one's offset plus its mesh centre scaled by its size, turned by its
     * rotation and stretched by its stretch, as the vertex shader places it.
     */
    private meanGeometryCenter(first: number, end: number, out: Vector3): Vector3 {
        const c = this.meshCenter;
        const offsets = this.offsetBuffer;
        const sizes = this.sizeBuffer;
        const rotations = this.rotationBuffer;
        const stretches = this.stretchBuffer!;
        let sx = 0,
            sy = 0,
            sz = 0;
        for (let i = first; i < end; i++) {
            const i3 = i * 3;
            const i4 = i * 4;
            const i9 = i * 9;
            const vx = c.x * sizes[i3],
                vy = c.y * sizes[i3 + 1],
                vz = c.z * sizes[i3 + 2];
            const qx = rotations[i4],
                qy = rotations[i4 + 1],
                qz = rotations[i4 + 2],
                qw = rotations[i4 + 3];
            // v + 2w(u × v) + 2u × (u × v), u the vector part.
            const tx = 2 * (qy * vz - qz * vy),
                ty = 2 * (qz * vx - qx * vz),
                tz = 2 * (qx * vy - qy * vx);
            const rx = vx + qw * tx + (qy * tz - qz * ty);
            const ry = vy + qw * ty + (qz * tx - qx * tz);
            const rz = vz + qw * tz + (qx * ty - qy * tx);
            sx += offsets[i3] + stretches[i9] * rx + stretches[i9 + 3] * ry + stretches[i9 + 6] * rz;
            sy += offsets[i3 + 1] + stretches[i9 + 1] * rx + stretches[i9 + 4] * ry + stretches[i9 + 7] * rz;
            sz += offsets[i3 + 2] + stretches[i9 + 2] * rx + stretches[i9 + 5] * ry + stretches[i9 + 8] * rz;
        }
        const count = end - first;
        return out.set(sx / count, sy / count, sz / count);
    }

    /**
     * Records each filled system's {@link geometryCentres} entry, for a batch of meshes that lie
     * off their pivot and are not turned to face the camera.
     */
    private measureGeometryCentres(systems: IParticleSystem[]): void {
        if (this.settings.renderAlignment === 'view' || this.meshCenter.lengthSq() === 0) {
            this.geometryCentres.clear();
            return;
        }
        const starts = this.systemStarts;
        for (let s = 0; s < systems.length; s++) {
            const first = starts[s];
            const end = starts[s + 1];
            if (end === first) {
                continue;
            }
            const system = systems[s];
            let centre = this.geometryCentres.get(system);
            if (centre === undefined) {
                centre = new Vector3();
                this.geometryCentres.set(system, centre);
            }
            this.meanGeometryCenter(first, end, centre);
        }
    }

    /**
     * The centre of `system`'s bounds, moved a thousandth of the way toward where its meshes are
     * drawn when they lie off their pivot. Unity sorts renderers by the centre of their bounds,
     * which for mesh particles is where the particles are. Two systems emitting at one point tie,
     * and Unity breaks the tie by internal ids, so a dark copy laid behind a light one could
     * be drawn over it. Moving the centre
     * toward the geometry breaks the tie by it, the farther drawn first, also as the meshes turn,
     * and changes no order that is not a tie.
     */
    protected override sortCentre(system: ParticleSystem, out: Vector3): Vector3 {
        super.sortCentre(system, out);
        const geometry = this.geometryCentres.get(system);
        if (geometry !== undefined) {
            out.x += (geometry.x - out.x) * SORT_NUDGE;
            out.y += (geometry.y - out.y) * SORT_NUDGE;
            out.z += (geometry.z - out.z) * SORT_NUDGE;
        }
        return out;
    }

    /** @internal */
    override removeSystem(system: IParticleSystem): void {
        super.removeSystem(system);
        this.geometryCentres.delete(system);
    }

    /** @internal */
    setupBuffers(): void {
        this.disposeRuns();
        this.mesh?.dispose();
        this.geometryBuffer?.dispose();
        this.mesh = new Mesh('spriteBatch', this.scene);
        this.configureMesh();

        const positions = this.settings.instancingGeometry;
        const vertexCount = positions.length / 3;
        this.measureMeshCenter(positions, vertexCount);
        const uvs = this.settings.instancingUVs;
        const normals = this.settings.instancingNormals;
        const uvs2 = this.meshUV2() ? this.settings.instancingUVs2! : null;
        const colors = this.meshColors() ? this.settings.instancingColors! : null;
        // The geometry goes up as one interleaved buffer, position, uv, then normal, the second
        // UV set and the vertex colours when the batch has them: one vertex buffer binding instead
        // of up to five. WebGPU allows 8 by default, and a batch also binds five per-instance
        // buffers (six drawn along velocity); four geometry buffers took a mesh with a second UV
        // set to 9, and no pipeline could be made for it.
        const parts: Array<[string, ArrayLike<number> | null, number]> = [
            [VertexBuffer.PositionKind, positions, 3],
            // WebGL (especially iOS) raises INVALID_OPERATION if the shader reads
            // `attribute vec2 uv` but the buffer is missing or shorter than vertices.
            [VertexBuffer.UVKind, uvs && uvs.length >= vertexCount * 2 ? uvs : null, 2],
        ];
        if (normals) {
            parts.push([VertexBuffer.NormalKind, normals, 3]);
        }
        if (uvs2) {
            parts.push([VertexBuffer.UV2Kind, uvs2, 2]);
        }
        if (colors) {
            parts.push(['meshColor', colors, 4]);
        }
        const stride = parts.reduce((sum, [, , size]) => sum + size, 0);
        const data = new Float32Array(vertexCount * stride);
        let offset = 0;
        for (const [, values, size] of parts) {
            if (values) {
                for (let v = 0; v < vertexCount; v++) {
                    for (let c = 0; c < size; c++) {
                        data[v * stride + offset + c] = values[v * size + c] ?? 0;
                    }
                }
            }
            offset += size;
        }
        const engine = this.scene.getEngine();
        this.geometryBuffer = new Buffer(engine, data, false, stride);
        this.geometryLayout.length = 0;
        this.vertexCount = vertexCount;
        offset = 0;
        for (const [kind, , size] of parts) {
            this.geometryLayout.push([kind, offset, size]);
            offset += size;
        }
        this.bindGeometry(this.mesh);

        this.buildExpandableBuffers();
    }

    /** Binds the batch's geometry, its shared vertex buffer and its indices, to `mesh`. */
    private bindGeometry(mesh: Mesh): void {
        for (const [kind, offset, size] of this.geometryLayout) {
            mesh.setVerticesBuffer(this.geometryBuffer!.createVertexBuffer(kind, offset, size), true, this.vertexCount);
        }
        mesh.setIndices(this.settings.instancingIndices, this.vertexCount);
    }

    /** The mesh of the `index`th run after the first, made over the batch's geometry the first time. */
    private runAt(index: number): InstanceRun {
        let run = this.runs[index];
        if (run === undefined) {
            const mesh = new Mesh('spriteBatchRun', this.scene);
            this.configureDrawMesh(mesh);
            this.bindGeometry(mesh);
            run = new InstanceRun(mesh);
            this.runs[index] = run;
        }
        return run;
    }

    private disposeRuns(): void {
        for (const run of this.runs) {
            run.dispose();
        }
        this.runs.length = 0;
    }

    /**
     * True when a mesh batch reads UV channel 1 and has a second UV set to
     * read it from, two values per vertex. A set of any other length is left
     * out with a warning, and channel 1 then reads the first set.
     */
    private warnedUV2 = false;

    private meshUV2(): boolean {
        const uvs2 = this.settings.instancingUVs2;
        if (this.settings.renderMode !== RenderMode.Mesh || !uvs2 || !this.usesUV1()) {
            return false;
        }
        const expected = (this.settings.instancingGeometry.length / 3) * 2;
        if (uvs2.length !== expected) {
            if (this.warnedUV2) {
                return false;
            }
            this.warnedUV2 = true;
            console.warn(
                `[babylon.quarks] instancingUVs2 has ${uvs2.length} values for ${expected / 2} vertices ` +
                    '(two per vertex expected); UV channel 1 reads the first UV set instead.'
            );
            return false;
        }
        return true;
    }

    private warnedColors = false;

    /**
     * True when a mesh batch has vertex colours, four values per vertex. A set of any other length
     * is left out with a warning, and the mesh is drawn without them.
     */
    private meshColors(): boolean {
        const colors = this.settings.instancingColors;
        if (this.settings.renderMode !== RenderMode.Mesh || !colors) {
            return false;
        }
        const expected = (this.settings.instancingGeometry.length / 3) * 4;
        if (colors.length !== expected) {
            if (!this.warnedColors) {
                this.warnedColors = true;
                console.warn(
                    `[babylon.quarks] instancingColors has ${colors.length} values for ${expected / 4} vertices ` +
                        '(four per vertex expected); the mesh is drawn without vertex colours.'
                );
            }
            return false;
        }
        return true;
    }

    /** Releases the instance vertex buffers so a resize does not leak GPU memory. */
    private disposeExpandableBuffers(): void {
        this.offsetVB?.dispose();
        this.colorVB?.dispose();
        this.sizeVB?.dispose();
        this.uvTileVB?.dispose();
        this.rotationVB?.dispose();
        this.velocityVB?.dispose();
        this.velocityVB = undefined;
        this.velocityBuffer = undefined;
        // The column views do not own the buffer they read.
        this.stretchGPUBuffer?.dispose();
        this.stretchGPUBuffer = undefined;
        this.stretchBuffer = undefined;
    }

    private buildExpandableBuffers(): void {
        const engine = this.scene.getEngine();

        this.offsetBuffer = new Float32Array(this.maxParticles * 3);
        this.offsetVB = new VertexBuffer(engine, this.offsetBuffer, 'offset', true, false, 3, true);
        this.mesh.setVerticesBuffer(this.offsetVB);

        this.colorBuffer = new Float32Array(this.maxParticles * 4);
        this.colorVB = new VertexBuffer(engine, this.colorBuffer, 'color', true, false, 4, true);
        this.mesh.setVerticesBuffer(this.colorVB);

        this.sizeBuffer = new Float32Array(this.maxParticles * 3);
        this.sizeVB = new VertexBuffer(engine, this.sizeBuffer, 'size', true, false, 3, true);
        this.mesh.setVerticesBuffer(this.sizeVB);

        this.uvTileBuffer = new Float32Array(this.maxParticles);
        this.uvTileVB = new VertexBuffer(engine, this.uvTileBuffer, 'uvTile', true, false, 1, true);
        this.mesh.setVerticesBuffer(this.uvTileVB);

        if (this.turnsByQuaternion()) {
            this.rotationBuffer = new Float32Array(this.maxParticles * 4);
            this.rotationVB = new VertexBuffer(engine, this.rotationBuffer, 'rotation', true, false, 4, true);
        } else {
            this.rotationBuffer = new Float32Array(this.maxParticles);
            this.rotationVB = new VertexBuffer(engine, this.rotationBuffer, 'rotation', true, false, 1, true);
        }
        this.mesh.setVerticesBuffer(this.rotationVB);

        if (drawsAlongVelocity(this.settings.renderMode)) {
            this.velocityBuffer = new Float32Array(this.maxParticles * 4);
            this.velocityVB = new VertexBuffer(engine, this.velocityBuffer, 'velocity', true, false, 4, true);
            this.mesh.setVerticesBuffer(this.velocityVB);
        }

        if (this.settings.renderMode === RenderMode.Mesh) {
            this.stretchBuffer = new Float32Array(this.maxParticles * 9);
            this.stretchGPUBuffer = new Buffer(engine, this.stretchBuffer, true, 9, false, true);
            for (const [kind, offset, size] of STRETCH_ATTRIBUTE[2]!) {
                this.mesh.setVerticesBuffer(this.stretchGPUBuffer.createVertexBuffer(kind, offset, size));
            }
        }

        this.instanceLayout = [
            ['offset', 3],
            ['size', 3],
            ['color', 4],
            ['uvTile', 1],
            ['rotation', this.turnsByQuaternion() ? 4 : 1],
        ];
        // A mesh draws along no velocity, so a batch has one or the other, in the next slot.
        if (this.velocityBuffer) {
            this.instanceLayout.push(['velocity', 4]);
        }
        if (this.stretchBuffer) {
            this.instanceLayout.push(STRETCH_ATTRIBUTE);
        }

        this.mesh.forcedInstanceCount = 0;
        this.mesh.doNotSyncBoundingInfo = true;
    }

    /** @internal */
    protected readonly initialCapacity = 1000;

    /** @internal */
    expandBuffers(target: number): void {
        while (target >= this.maxParticles) {
            this.maxParticles *= 2;
        }
        this.resizeBuffers();
    }

    /** @internal */
    protected resizeBuffers(): void {
        this.disposeExpandableBuffers();
        this.buildExpandableBuffers();
        this.sortScratch = undefined;
        this.gatherScratch.length = 0;
    }

    /** The screen-size limits as a uniform value, or null when the batch has none that apply. */
    private sizeLimits(): BVector2 | null {
        const {minParticleSize, maxParticleSize} = this.settings;
        if (!takesPivotAndSizeLimits(this.settings.renderMode) || !hasSizeLimits(this.settings)) {
            return null;
        }
        // The shader clamps; an unlimited maximum is just a very large one.
        return new BVector2(Math.max(0, minParticleSize), Math.min(maxParticleSize, 1e9));
    }

    private sortScratch?: SortScratch;
    /** One spare array per attribute buffer, gathered into and swapped in; indexed by buffer slot. */
    private readonly gatherScratch: Float32Array[] = [];

    /**
     * Reorders each filled system's instances by the batch's sort mode, so that the later
     * (covering) draws are the nearer or the chosen-age particles. Unity sorts the particles of
     * each system among themselves; the systems are drawn in the renderer's order. Each order is
     * computed as a permutation and every attribute buffer is gathered through it into a spare
     * array, which then takes its place.
     */
    private sortInstances(
        systems: IParticleSystem[],
        count: number,
        turnsByQuaternion: boolean,
        usesVelocity: boolean
    ): void {
        if (count < 2) {
            return;
        }
        const mode = this.settings.sortMode;
        let ex = 0;
        let ey = 0;
        let ez = 0;
        if (mode === 'distance') {
            const camera = this.scene.activeCameras?.[0] ?? this.scene.activeCamera;
            if (!camera) {
                return;
            }
            const eye = camera.globalPosition;
            ex = eye.x;
            ey = eye.y;
            ez = eye.z;
        }
        const scratch = (this.sortScratch ??= new SortScratch(this.maxParticles));
        scratch.ensure(count);
        const keys = scratch.keys;
        const offsets = this.offsetBuffer;
        const spares = this.spares;
        spares[0] = this.spareFor(0, this.offsetBuffer);
        spares[1] = this.spareFor(1, this.sizeBuffer);
        spares[2] = this.spareFor(2, this.colorBuffer);
        spares[3] = this.spareFor(3, this.uvTileBuffer);
        spares[4] = this.spareFor(4, this.rotationBuffer);
        const sortsVelocity = usesVelocity && this.velocityBuffer !== undefined;
        if (sortsVelocity) {
            spares[5] = this.spareFor(5, this.velocityBuffer!);
        }
        const sortsStretch = this.stretchBuffer !== undefined;
        if (sortsStretch) {
            spares[6] = this.spareFor(6, this.stretchBuffer!);
        }
        const rotationStride = turnsByQuaternion ? 4 : 1;
        const starts = this.systemStarts;
        for (let s = 0; s < systems.length; s++) {
            const first = starts[s];
            const n = starts[s + 1] - first;
            if (n === 0) {
                continue;
            }
            let sorted = n > 1;
            if (sorted && mode === 'distance') {
                // Farthest first: the nearer particle is drawn last and covers.
                for (let i = 0, o = first * 3; i < n; i++, o += 3) {
                    const dx = offsets[o] - ex;
                    const dy = offsets[o + 1] - ey;
                    const dz = offsets[o + 2] - ez;
                    keys[i] = scratch.floatKey(dx * dx + dy * dy + dz * dz, true);
                }
            } else if (sorted) {
                sorted = this.ageKeys(systems[s], n, scratch, mode === 'youngestInFront');
            }
            if (sorted) {
                const order = sortByKey(scratch, n);
                gather(this.offsetBuffer, spares[0], order, n, 3, first);
                gather(this.sizeBuffer, spares[1], order, n, 3, first);
                gather(this.colorBuffer, spares[2], order, n, 4, first);
                gather(this.uvTileBuffer, spares[3], order, n, 1, first);
                gather(this.rotationBuffer, spares[4], order, n, rotationStride, first);
                if (sortsVelocity) {
                    gather(this.velocityBuffer!, spares[5], order, n, 4, first);
                }
                if (sortsStretch) {
                    gather(this.stretchBuffer!, spares[6], order, n, 9, first);
                }
            } else {
                copyRange(spares[0], first * 3, this.offsetBuffer, first * 3, (first + n) * 3);
                copyRange(spares[1], first * 3, this.sizeBuffer, first * 3, (first + n) * 3);
                copyRange(spares[2], first * 4, this.colorBuffer, first * 4, (first + n) * 4);
                copyRange(spares[3], first, this.uvTileBuffer, first, first + n);
                copyRange(
                    spares[4],
                    first * rotationStride,
                    this.rotationBuffer,
                    first * rotationStride,
                    (first + n) * rotationStride
                );
                if (sortsVelocity) {
                    copyRange(spares[5], first * 4, this.velocityBuffer!, first * 4, (first + n) * 4);
                }
                if (sortsStretch) {
                    copyRange(spares[6], first * 9, this.stretchBuffer!, first * 9, (first + n) * 9);
                }
            }
        }
        this.offsetBuffer = this.swapSpare(0, this.offsetBuffer);
        this.sizeBuffer = this.swapSpare(1, this.sizeBuffer);
        this.colorBuffer = this.swapSpare(2, this.colorBuffer);
        this.uvTileBuffer = this.swapSpare(3, this.uvTileBuffer);
        this.rotationBuffer = this.swapSpare(4, this.rotationBuffer);
        if (sortsVelocity) {
            this.velocityBuffer = this.swapSpare(5, this.velocityBuffer!);
        }
        if (sortsStretch) {
            this.stretchBuffer = this.swapSpare(6, this.stretchBuffer!);
        }
    }

    /** The spare arrays the sort gathers into this frame, by buffer slot. */
    private readonly spares: Float32Array[] = [];

    /**
     * Writes the sort keys of `system`'s `n` particles by age, in the order the fill wrote them,
     * which is the store's. False when the fill wrote a different count, which leaves them as is.
     */
    private ageKeys(system: IParticleSystem, n: number, scratch: SortScratch, youngestInFront: boolean): boolean {
        if (system.particleNum !== n) {
            return false;
        }
        const keys = scratch.keys;
        const store = system.store;
        if (store === undefined) {
            const particles = system.particles;
            for (let j = 0; j < n; j++) {
                keys[j] = scratch.floatKey(particles[j].age, youngestInFront);
            }
            return true;
        }
        const scalars = store.scalars;
        const stride = ParticleStore.SCALAR_STRIDE;
        for (let j = 0, a = ParticleStore.AGE; j < n; j++, a += stride) {
            keys[j] = scratch.floatKey(scalars[a], youngestInFront);
        }
        return true;
    }

    /** The spare array of `slot`, as long as `source`. */
    private spareFor(slot: number, source: Float32Array): Float32Array {
        let spare = this.gatherScratch[slot];
        if (spare === undefined || spare.length !== source.length) {
            spare = new Float32Array(source.length);
            this.gatherScratch[slot] = spare;
        }
        return spare;
    }

    /** Returns the spare of `slot`, now holding the sorted instances; `source` becomes the spare. */
    private swapSpare(slot: number, source: Float32Array): Float32Array {
        const sorted = this.gatherScratch[slot];
        this.gatherScratch[slot] = source;
        return sorted;
    }

    /** @internal */
    rebuildMaterial(): void {
        const isMesh = this.settings.renderMode === RenderMode.Mesh;
        // Mesh batches without a diffuse map still need a sampler2D on iOS WebKit —
        // a zero-sampler particle mesh effect often never becomes drawable there.
        const mapTexture = this.settings.texture ?? (isMesh ? SpriteBatch.whiteTexture(this.scene) : null);
        const atlas = this.settings.reflectionAtlas;
        const atlasPending = isMesh && !!atlas && !atlas.isReady();
        this.cancelAtlasRebuild?.();
        this.cancelAtlasRebuild = null;
        if (atlasPending && atlas) {
            const onLoad = (
                atlas as {
                    onLoadObservable?: {addOnce: (cb: () => void) => unknown; remove: (observer: unknown) => boolean};
                }
            ).onLoadObservable;
            if (onLoad) {
                const observer = onLoad.addOnce(() => {
                    this.cancelAtlasRebuild = null;
                    if (!this.disposed) {
                        this.rebuildMaterial();
                    }
                });
                this.cancelAtlasRebuild = () => onLoad.remove(observer);
            }
        }
        const useEnvAtlas = this.usesEnvAtlas();
        const imageProcessing = this.imageProcessing();
        const program = shaderProgram(this.settings, {
            depth: this.depth,
            envAtlasReady: useEnvAtlas,
            meshUV2: this.meshUV2(),
            meshColors: this.meshColors(),
            imageProcessing,
        });
        const {defines, attributes, uniforms, samplers} = program;
        const shaderName = program.name;
        const lighting = this.settings.lighting ?? 'fixed';
        const lit = isMesh && lighting !== 'unlit';
        const rim = isMesh ? this.settings.rim : undefined;
        const needsEyePosition = useEnvAtlas || !!rim;

        const shaderLanguage = shaderLanguageFor(this.scene.getEngine());
        registerShaders(shaderName, program.vertex, program.fragment, shaderLanguage);

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

        if (mapTexture) {
            mat.setTexture('map', mapTexture);
        }
        if (useEnvAtlas && atlas) {
            mat.setTexture('envAtlas', atlas);
        }
        if (needsEyePosition) {
            const eyePosition = new BVector3();
            mat.setVector3('eyePosition', eyePosition);
            mat.onBindObservable.add(() => {
                const camera = this.scene.activeCamera;
                if (!camera) {
                    return;
                }
                eyePosition.copyFrom(camera.globalPosition);
                VFXBatch.writeBound(mat, (target) => target.setVector3('eyePosition', eyePosition));
            });
        }
        if (tilesSheet(this.settings)) {
            mat.setFloat('tileCountX', this.settings.uTileCount);
            mat.setFloat('tileCountY', this.settings.vTileCount);
        }
        this.bindSoft(mat);
        this.writeSpriteParams(mat, useEnvAtlas);
        if (lit) {
            this.writeFixedLighting(mat);
            if (lighting === 'scene') {
                const direction = new BVector3();
                const color = new BVector3();
                const ambient = new BVector3();
                mat.onBindObservable.add(() => {
                    const found = SpriteBatch.readSceneLight(this.scene, direction, color, ambient);
                    VFXBatch.writeBound(mat, (target) =>
                        found
                            ? target
                                  .setVector3('lightDirection', direction)
                                  .setVector3('lightColor', color)
                                  .setVector3('ambientColor', ambient)
                            : this.writeFixedLighting(target)
                    );
                });
            }
        }

        this.bindFog(mat);
        this.bindImageProcessing(mat, imageProcessing);
        this.bindSurface(mat);
        // Billboards, beams and the like are flat sheets: both faces, whatever the setting says.
        mat.backFaceCulling = this.settings.renderFace !== 'both';
        mat.cullBackFaces = this.settings.renderFace !== 'back';

        if (this.settings.materialTransparent) {
            mat.alphaMode = this.settings.materialBlendMode;
        } else {
            mat.alphaMode = Constants.ALPHA_DISABLE;
        }
        // A transparent surface that writes depth is drawn into the depth buffer first, so its own
        // overlapping pieces do not fight; an opaque one writes depth as it draws.
        mat.needDepthPrePass = this.settings.materialDepthWrite && this.settings.materialTransparent;
        mat.forceDepthWrite = this.settings.materialDepthWrite;
        mat.disableDepthWrite = !this.settings.materialDepthWrite;
        // 0 keeps the engine's depth function (LEQUAL); ALWAYS draws over everything, like ZTest Always.
        mat.depthFunction = this.settings.materialDepthTest ? 0 : Constants.ALWAYS;

        // A rebuild (an env atlas that finished loading) replaces the material; the old one and its
        // bind observers go with it. Textures belong to the settings, so they stay.
        this.shaderMaterial?.dispose(false, false);
        this.mesh.material = mat;
        this.shaderMaterial = mat;
    }

    /** Writes the live parameters only sprite and mesh batches have: reflection level, rim, pivot and size limits. */
    private writeSpriteParams(material: ShaderMaterial, envAtlas: boolean): void {
        if (envAtlas) {
            material.setFloat('reflectionLevel', this.settings.reflectionLevel);
        }
        const rim = this.settings.renderMode === RenderMode.Mesh ? this.settings.rim : undefined;
        if (rim) {
            material.setVector3('rimColor', new BVector3(rim.color[0], rim.color[1], rim.color[2]));
            material.setVector2('rimParams', new BVector2(rim.power, rim.strength));
        }
        const pivot = takesPivotAndSizeLimits(this.settings.renderMode) ? this.settings.pivot : undefined;
        if (pivot) {
            material.setVector3('pivot', new BVector3(pivot.x, pivot.y, pivot.z));
        }
        const sizeLimits = this.sizeLimits();
        if (sizeLimits) {
            material.setVector2('sizeLimits', sizeLimits);
        }
    }

    protected override writeLiveUniforms(material: ShaderMaterial): void {
        super.writeLiveUniforms(material);
        this.writeSpriteParams(material, this.usesEnvAtlas());
    }

    /** True when the material samples the env atlas: a mesh batch whose atlas has loaded. */
    private usesEnvAtlas(): boolean {
        const atlas = this.settings.reflectionAtlas;
        return this.settings.renderMode === RenderMode.Mesh && !!atlas && atlas.isReady();
    }

    applyMeshLighting(lighting: MeshLightingSettings): void {
        this.storeFixedLighting(lighting);
        const material = this.shaderMaterial;
        if (material !== null && this.settings.renderMode === RenderMode.Mesh && this.settings.lighting !== 'unlit') {
            this.writeFixedLighting(material);
        }
    }

    private storeFixedLighting(lighting: MeshLightingSettings): void {
        this.fixedLightDirection.copyFrom(lighting.direction);
        this.fixedLightColor.set(lighting.color.r, lighting.color.g, lighting.color.b);
        this.fixedAmbientColor.set(lighting.ambient.r, lighting.ambient.g, lighting.ambient.b);
    }

    private writeFixedLighting(material: ShaderMaterial | Effect): void {
        material.setVector3('lightDirection', this.fixedLightDirection);
        material.setVector3('lightColor', this.fixedLightColor);
        material.setVector3('ambientColor', this.fixedAmbientColor);
    }

    /**
     * Reads the scene's key light for `'scene'` mesh lighting: the first
     * enabled directional or hemispheric light, its diffuse colour times its
     * intensity, plus the scene's ambient colour. A hemispheric light lights
     * from its `direction` (which points at the sky) and adds its ground colour
     * to the ambient, which approximates its sky-to-ground blend with the one
     * directional term the shader has. False when there is no such light.
     */
    static readSceneLight(scene: Scene, direction: BVector3, color: BVector3, ambient: BVector3): boolean {
        const lights = scene.lights;
        for (let i = 0; i < lights.length; i++) {
            const light = lights[i];
            const kind = light.getClassName();
            if ((kind !== 'DirectionalLight' && kind !== 'HemisphericLight') || !light.isEnabled()) {
                continue;
            }
            const intensity = light.intensity;
            const diffuse = light.diffuse;
            const sceneAmbient = scene.ambientColor;
            color.set(diffuse.r * intensity, diffuse.g * intensity, diffuse.b * intensity);
            ambient.set(sceneAmbient.r, sceneAmbient.g, sceneAmbient.b);
            const lightDirection = (light as unknown as {direction: BVector3}).direction;
            if (kind === 'DirectionalLight') {
                direction.copyFrom(lightDirection);
            } else {
                direction.copyFrom(lightDirection).scaleInPlace(-1);
                const ground = (light as unknown as {groundColor?: {r: number; g: number; b: number}}).groundColor;
                if (ground) {
                    ambient.x += ground.r * intensity;
                    ambient.y += ground.g * intensity;
                    ambient.z += ground.b * intensity;
                }
            }
            return true;
        }
        return false;
    }

    private vector_ = new Vector3();
    private vector2_ = new Vector3();
    private vector3_ = new Vector3();
    private quaternion_ = new Quaternion();
    private quaternion2_ = new Quaternion();
    private quaternion3_ = new Quaternion();
    private quaternion4_ = new Quaternion();
    private quaternion5_ = new Quaternion();
    private quaternion6_ = new Quaternion();
    private rotationMat_ = new Matrix3();
    private rotationMat2_ = new Matrix3();
    /** Slot 0 holds the zero-alpha instance since the batch last went empty. */
    private clearedInstanceUploaded = false;
    /** The filled start of each instance buffer, as uploaded; see {@link PrefixViews}. */
    private readonly uploadViews = {
        offset: new PrefixViews(),
        size: new PrefixViews(),
        color: new PrefixViews(),
        uvTile: new PrefixViews(),
        rotation: new PrefixViews(),
        velocity: new PrefixViews(),
        stretch: new PrefixViews(),
    };
    /** The stretch of the system being filled, three columns; see {@link meshStretch}. */
    private readonly stretch_ = new Float64Array(9);

    /** @internal */
    update(): void {
        let index = 0;
        let particleCount = 0;
        const renderMode = this.settings.renderMode;
        const isMeshRender = renderMode === RenderMode.Mesh;
        const isStretchedRender = renderMode === RenderMode.StretchedBillBoard;
        const isBeamRender = renderMode === RenderMode.Beam;
        const usesVelocity = isStretchedRender || isBeamRender;
        const flipsSprites = takesPivotAndSizeLimits(renderMode);
        const alignment = this.settings.renderAlignment;
        // Billboards laid along the world's or the emitter's axes turn by a quaternion, as meshes.
        const alignsQuads = alignsBillboards(this.settings);
        const turnsByQuaternion = isMeshRender || alignsQuads;

        const visibleSystems = this.systemsToFill();
        for (let i = 0; i < visibleSystems.length; i++) {
            particleCount += visibleSystems[i].particleNum;
        }
        this.fitBuffers(particleCount);
        const starts = this.systemStarts;

        for (let s = 0; s < visibleSystems.length; s++) {
            const system = visibleSystems[s];
            const particleNum = system.particleNum;
            starts[s] = index;
            // A finished or between-bursts system adds nothing to the batch. With many effects
            // loaded most systems are idle at any moment, so skip their per-system setup.
            if (particleNum === 0) {
                continue;
            }
            const particles = system.particles;
            const rotation = this.quaternion2_;
            const translation = this.vector2_;
            const scale = this.vector3_;
            const systemWorldSpace = system.worldSpace;
            const emitterMatrix = system.emitter.matrixWorld;
            // Whether a mesh's rotation is measured in the emitter's axes (see RenderAlignment):
            // always for 'local', and for 'simulation' when the system simulates in local space.
            // 'world' and 'view' write the particle's own turn; the shader turns 'view' to the camera.
            const turnsWithEmitter = alignment === 'local' || (alignment === 'simulation' && !systemWorldSpace);
            // Only a mesh that turns with the emitter, or a billboard laid along its axes, needs the
            // emitter's turn as a quaternion, and only a local-space stretched billboard its
            // rotation matrix. Everything else needs at most the scale, which the basis column
            // lengths give without a full decompose.
            const quadsTurnWithEmitter = alignsQuads && alignment === 'local';
            if ((isMeshRender && turnsWithEmitter) || quadsTurnWithEmitter) {
                emitterMatrix.decompose(translation, rotation, scale);
                // A skewed matrix's columns are not square to each other, and the turn read from
                // them not quite of length 1; a mesh's stretch makes up the rest (meshStretch).
                rotation.normalize();
            } else {
                const e = emitterMatrix.elements;
                scale.set(
                    Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]),
                    Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]),
                    Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10])
                );
            }
            if (isStretchedRender && !systemWorldSpace) {
                this.rotationMat_.setFromMatrix4(emitterMatrix);
            }
            // Unity draws a mesh mirrored when the scale of its scaling mode mirrors the system
            // (see ParticleEmitter.mirrored): one turning with the emitter is laid by the emitter's
            // whole matrix, its mirror included, with the particle's own turn inside the mirror, so
            // a spin turns the other way on screen (measured in Unity 6). The emitter's turn comes
            // from `decompose`, which leaves the mirror on the X scale: the particle's turn is
            // mirrored along X (mirrorTurn) and the X size made negative. Particles that carry
            // their own parent transform are laid by that instead.
            const mirrorsMeshes =
                isMeshRender &&
                turnsWithEmitter &&
                system.onlyUsedByOther !== true &&
                (system.emitter as {mirrored?: boolean}).mirrored === true;
            const absScaleX = Math.abs(scale.x);
            const absScaleY = Math.abs(scale.y);
            const absScaleZ = Math.abs(scale.z);
            // A mesh of a local-space system takes the emitter's scale after its turn, as its
            // stretch, and keeps its own size; see meshStretch.
            const stretchesMesh = isMeshRender && !systemWorldSpace;
            if (isMeshRender) {
                SpriteBatch.meshStretch(
                    stretchesMesh ? emitterMatrix : null,
                    turnsWithEmitter ? rotation : null,
                    turnsWithEmitter || !stretchesMesh
                        ? null
                        : ((system.emitter as Partial<ParticleEmitter>).alignedScale ?? null),
                    this.stretch_
                );
            }
            // Stretched-billboard settings are per system, not per particle.
            const stretchedSettings = isStretchedRender
                ? (system.rendererEmitterSettings as StretchedBillBoardSettings)
                : undefined;
            // A speed factor of 0 adds no length but still points the streak along the velocity:
            // the shader takes its direction from what it is sent, so it is sent a tiny one,
            // whose length (a ten-thousandth of the speed) does not show.
            const speedFactor =
                stretchedSettings === undefined || stretchedSettings.speedFactor === 0
                    ? STRETCH_DIRECTION_ONLY
                    : stretchedSettings.speedFactor;
            // The shader takes the streak's way from the velocity it is sent, which a negative speed
            // factor turns round; the length factor is sent turned round with it, so the length
            // still runs along the particle's own way, as Unity's.
            const lengthFactor =
                (stretchedSettings?.lengthFactor ?? STRETCHED_LENGTH_FACTOR) * (speedFactor < 0 ? -1 : 1);

            // Live particles occupy store rows [0, particleNum) in the same order
            // this loop writes them, so attributes that need no per-particle
            // transform can be copied as one range instead of gathered.
            const store = system.store;
            const copiedColor = store !== undefined;
            // Particles only carry their own parent transform when the system
            // emits through another one; otherwise the whole range shares the
            // emitter's matrix and can be transformed in place after the copy.
            const sharedTransform = store !== undefined && system.onlyUsedByOther !== true;
            // The simulation runs on a fixed step that the display does not
            // share, so the last step is usually in the past by the time the
            // frame is drawn. Continuing the motion that step produced puts each
            // particle where it belongs now; without it they visibly stutter on
            // any display that is not exactly 60Hz and in phase.
            //
            // The motion is measured, not predicted from velocity: plenty of
            // behaviors move a particle by writing its position — orbits, noise,
            // turbulence, anything a plugin does — and a velocity based guess
            // leaves every one of those stuttering exactly as before.
            const residual = system.simulationResidual ?? 0;
            const stepFraction = residual === 0 ? 0 : residual / (system.simulationStep ?? residual);
            if (copiedColor) {
                // An aliased previous column means nothing changed since the
                // step; the copy is then the carried value.
                if (stepFraction !== 0 && particleNum > 0 && store!.previousColor !== store!.color) {
                    SpriteBatch.continueColor(this.colorBuffer, index * 4, store!, particleNum, stepFraction);
                } else {
                    copyPrefix(this.colorBuffer, index * 4, store!.color, particleNum * 4);
                }
            }
            let copiedPositionAndSize = false;
            if (store !== undefined && systemWorldSpace) {
                if (stepFraction !== 0 && particleNum > 0) {
                    SpriteBatch.extrapolate(this.offsetBuffer, index * 3, store, particleNum, stepFraction);
                } else {
                    copyPrefix(this.offsetBuffer, index * 3, store.position, particleNum * 3);
                }
                if (stepFraction !== 0 && particleNum > 0 && store.previousSize !== store.size) {
                    SpriteBatch.continueVector3(
                        this.sizeBuffer,
                        index * 3,
                        store.size,
                        store.previousSize,
                        particleNum,
                        stepFraction
                    );
                } else {
                    copyPrefix(this.sizeBuffer, index * 3, store.size, particleNum * 3);
                }
                copiedPositionAndSize = true;
            } else if (sharedTransform && particleNum > 0) {
                const base = index * 3;
                const end = base + particleNum * 3;
                const offsets = this.offsetBuffer;
                if (stepFraction !== 0) {
                    SpriteBatch.extrapolate(offsets, base, store!, particleNum, stepFraction);
                } else {
                    copyPrefix(offsets, base, store!.position, particleNum * 3);
                }
                const me = emitterMatrix.elements;
                const m00 = me[0],
                    m01 = me[1],
                    m02 = me[2],
                    m03 = me[3];
                const m10 = me[4],
                    m11 = me[5],
                    m12 = me[6],
                    m13 = me[7];
                const m20 = me[8],
                    m21 = me[9],
                    m22 = me[10],
                    m23 = me[11];
                const m30 = me[12],
                    m31 = me[13],
                    m32 = me[14],
                    m33 = me[15];
                for (let o = base; o < end; o += 3) {
                    const px = offsets[o];
                    const py = offsets[o + 1];
                    const pz = offsets[o + 2];
                    const w = 1 / (m03 * px + m13 * py + m23 * pz + m33);
                    offsets[o] = (m00 * px + m10 * py + m20 * pz + m30) * w;
                    offsets[o + 1] = (m01 * px + m11 * py + m21 * pz + m31) * w;
                    offsets[o + 2] = (m02 * px + m12 * py + m22 * pz + m32) * w;
                }
                const sizes = this.sizeBuffer;
                if (stepFraction !== 0 && store!.previousSize !== store!.size) {
                    SpriteBatch.continueVector3(
                        sizes,
                        base,
                        store!.size,
                        store!.previousSize,
                        particleNum,
                        stepFraction
                    );
                } else {
                    copyPrefix(sizes, base, store!.size, particleNum * 3);
                }
                if (!stretchesMesh) {
                    for (let o = base; o < end; o += 3) {
                        sizes[o] *= absScaleX;
                        sizes[o + 1] *= absScaleY;
                        sizes[o + 2] *= absScaleZ;
                    }
                }
                copiedPositionAndSize = true;
            }

            const firstIndex = index;
            // Every particle of a system that emits for itself shares the emitter's transform and,
            // outside mesh mode, rotates by an angle: its scalar attributes are then store columns
            // and go to the buffers as ranges. Only meshes (quaternion rotations) and particles that
            // carry their own parent transform still need to be visited one by one.
            if (sharedTransform && !isMeshRender) {
                const columns = store!;
                copyPrefix(this.uvTileBuffer, firstIndex, columns.uvTile, particleNum);
                const rotations = this.rotationBuffer;
                if (alignsQuads) {
                    SpriteBatch.writeQuadTurns(
                        rotations,
                        firstIndex * 4,
                        columns,
                        particleNum,
                        residual,
                        quadsTurnWithEmitter ? rotation : null
                    );
                } else {
                    copyPrefix(rotations, firstIndex, columns.rotation, particleNum);
                }
                if (residual !== 0 && !alignsQuads) {
                    // Carry the spin on by the time since the last step, as the
                    // per-particle path does.
                    const rates = columns.angularVelocity;
                    for (let j = 0; j < particleNum; j++) {
                        rotations[firstIndex + j] += rates[j] * residual;
                    }
                }
                if (isStretchedRender && this.velocityBuffer) {
                    SpriteBatch.writeVelocities(
                        this.velocityBuffer,
                        firstIndex * 4,
                        columns,
                        particleNum,
                        stepFraction,
                        systemWorldSpace ? null : this.rotationMat_,
                        speedFactor,
                        lengthFactor
                    );
                }
                index += particleNum;
            } else if (sharedTransform && store!.rotationQuaternion.length > 0) {
                // Meshes rotate by quaternion, kept in the store too: turn them in
                // bulk, by the emitter's rotation when they turn with it.
                const columns = store!;
                copyPrefix(this.uvTileBuffer, firstIndex, columns.uvTile, particleNum);
                SpriteBatch.writeQuaternions(
                    this.rotationBuffer,
                    firstIndex * 4,
                    columns,
                    particleNum,
                    stepFraction,
                    turnsWithEmitter ? rotation : null,
                    mirrorsMeshes
                );
                index += particleNum;
            } else {
                for (let j = 0; j < particleNum; j++, index++) {
                    const particle = particles[j] as SpriteParticle;

                    if (isMeshRender) {
                        // Turning behaviors leave the last step's turn on the
                        // particle; a fraction of it carries the mesh the rest of
                        // the way to now.
                        let own = particle.rotation as Quaternion;
                        const step = particle.angularVelocity;
                        if (stepFraction !== 0 && step instanceof Quaternion) {
                            own = this.quaternion4_
                                .copy(own)
                                .multiply(SpriteBatch.partialTurn(step, stepFraction, this.quaternion5_));
                        }
                        if (mirrorsMeshes) {
                            own = SpriteBatch.mirrorTurn(own, this.quaternion6_);
                        }
                        let q: Quaternion;
                        if (!turnsWithEmitter) {
                            q = own;
                        } else {
                            let parentQ: Quaternion;
                            if (particle.parentMatrix) {
                                parentQ = this.quaternion3_.setFromRotationMatrix(particle.parentMatrix);
                            } else {
                                parentQ = rotation;
                            }
                            q = this.quaternion_;
                            q.copy(parentQ).multiply(own);
                        }
                        const ri = index * 4;
                        this.rotationBuffer[ri] = q.x;
                        this.rotationBuffer[ri + 1] = q.y;
                        this.rotationBuffer[ri + 2] = q.z;
                        this.rotationBuffer[ri + 3] = q.w;
                    } else {
                        const spin = particle.angularVelocity;
                        const angle = (particle.rotation as number) + (typeof spin === 'number' ? spin * residual : 0);
                        if (alignsQuads) {
                            let frame: Quaternion | null = null;
                            if (quadsTurnWithEmitter) {
                                frame = particle.parentMatrix
                                    ? this.quaternion3_.setFromRotationMatrix(particle.parentMatrix)
                                    : rotation;
                            }
                            SpriteBatch.writeQuadTurn(this.rotationBuffer, index * 4, angle, frame);
                        } else {
                            this.rotationBuffer[index] = angle;
                        }
                    }

                    if (!copiedPositionAndSize) {
                        const position = particle.position;
                        const previous = particle.previousPosition;
                        let px = position.x + (position.x - previous.x) * stepFraction;
                        let py = position.y + (position.y - previous.y) * stepFraction;
                        let pz = position.z + (position.z - previous.z) * stepFraction;
                        if (!systemWorldSpace) {
                            // Inlined point transform: this is the default (local space)
                            // path and runs for every particle every frame.
                            const me = (particle.parentMatrix ?? emitterMatrix).elements;
                            const w = 1 / (me[3] * px + me[7] * py + me[11] * pz + me[15]);
                            const tx = (me[0] * px + me[4] * py + me[8] * pz + me[12]) * w;
                            const ty = (me[1] * px + me[5] * py + me[9] * pz + me[13]) * w;
                            pz = (me[2] * px + me[6] * py + me[10] * pz + me[14]) * w;
                            px = tx;
                            py = ty;
                        }

                        const oi = index * 3;
                        this.offsetBuffer[oi] = px;
                        this.offsetBuffer[oi + 1] = py;
                        this.offsetBuffer[oi + 2] = pz;

                        const size = particle.size;
                        const si = index * 3;
                        // Particle size is already in world units when the system is in world
                        // space or the particle carries its own parent transform, and a mesh
                        // takes the emitter's scale as its stretch.
                        if (systemWorldSpace || particle.parentMatrix || isMeshRender) {
                            this.sizeBuffer[si] = size.x;
                            this.sizeBuffer[si + 1] = size.y;
                            this.sizeBuffer[si + 2] = size.z;
                        } else {
                            this.sizeBuffer[si] = size.x * absScaleX;
                            this.sizeBuffer[si + 1] = size.y * absScaleY;
                            this.sizeBuffer[si + 2] = size.z * absScaleZ;
                        }
                    }

                    if (!copiedColor) {
                        const color = particle.color;
                        const ci = index * 4;
                        this.colorBuffer[ci] = color.x;
                        this.colorBuffer[ci + 1] = color.y;
                        this.colorBuffer[ci + 2] = color.z;
                        this.colorBuffer[ci + 3] = color.w;
                    }

                    this.uvTileBuffer[index] = particle.uvTile;

                    if (isStretchedRender && this.velocityBuffer) {
                        // The streak points along the velocity and is as long as it,
                        // so a velocity frozen between steps makes the sprite's
                        // outline pop at the step rate while its position glides.
                        const velocity = particle.velocity;
                        const previousVelocity = particle.previousVelocity;
                        const vx = velocity.x + (velocity.x - previousVelocity.x) * stepFraction;
                        const vy = velocity.y + (velocity.y - previousVelocity.y) * stepFraction;
                        const vz = velocity.z + (velocity.z - previousVelocity.z) * stepFraction;
                        const vel: Vector3 = this.vector_;
                        vel.set(vx, vy, vz);
                        // Drawn along the total velocity, as Unity draws along totalVelocity, the
                        // behaviors' direct moves carried on between steps as the velocity is.
                        if (particle.animatedVelocity !== undefined) {
                            const animated = particle.store.animatedVelocity;
                            const previous = particle.store.previousAnimatedVelocity;
                            const o = particle.storeIndex * 3;
                            vel.x += animated[o] + (animated[o] - previous[o]) * stepFraction;
                            vel.y += animated[o + 1] + (animated[o + 1] - previous[o + 1]) * stepFraction;
                            vel.z += animated[o + 2] + (animated[o + 2] - previous[o + 2]) * stepFraction;
                        }
                        if (!systemWorldSpace) {
                            if (particle.parentMatrix) {
                                this.rotationMat2_.setFromMatrix4(particle.parentMatrix);
                                vel.applyMatrix3(this.rotationMat2_);
                            } else {
                                vel.applyMatrix3(this.rotationMat_);
                            }
                        }
                        const vi = index * 4;
                        this.velocityBuffer[vi] = vel.x * speedFactor;
                        this.velocityBuffer[vi + 1] = vel.y * speedFactor;
                        this.velocityBuffer[vi + 2] = vel.z * speedFactor;
                        this.velocityBuffer[vi + 3] = lengthFactor;
                    }
                }
            }

            if (isMeshRender) {
                this.writeMeshStretch(firstIndex, index, sharedTransform ? null : particles);
            }
            const tint = (system as ParticleSystem).tint;
            if (tint !== undefined && index > firstIndex) {
                SpriteBatch.applyTint(this.colorBuffer, firstIndex * 4, index - firstIndex, tint);
            }
            if (flipsSprites && system.flip !== undefined) {
                if (store !== undefined) {
                    SpriteBatch.applyFlip(this.sizeBuffer, firstIndex * 3, store.flip, particleNum);
                } else {
                    SpriteBatch.applyFlipFromParticles(this.sizeBuffer, firstIndex * 3, particles, particleNum);
                }
            }
            if (mirrorsMeshes) {
                const sizes = this.sizeBuffer;
                for (let o = firstIndex * 3; o < index * 3; o += 3) {
                    sizes[o] = -sizes[o];
                }
            }
            if (isBeamRender && this.velocityBuffer) {
                this.writeBeams(system as ParticleSystem, firstIndex, index - firstIndex);
            }
        }

        starts[visibleSystems.length] = index;
        starts.length = visibleSystems.length + 1;
        this.filledInstances = index;
        if (isMeshRender) {
            this.measureGeometryCentres(visibleSystems);
        }

        if (index === 0) {
            // Keep the mesh enabled even when count is 0 — toggling visibility off for a
            // single frame (common with short lifetimes + low emission overlap) causes flicker.
            this.mesh.forcedInstanceCount = 0;
            this.hideRunsFrom(0);
            // Slot 0 only needs clearing once per stretch of empty frames; re-uploading it every
            // frame cost five buffer uploads per idle batch per frame.
            if (!this.clearedInstanceUploaded) {
                this.uploadClearedInstance(turnsByQuaternion, usesVelocity);
                this.clearedInstanceUploaded = true;
            }
            return;
        }
        this.clearedInstanceUploaded = false;

        if (this.settings.sortMode !== 'none') {
            this.sortInstances(visibleSystems, index, turnsByQuaternion, usesVelocity);
        }
        this.drawRuns(turnsByQuaternion, usesVelocity);
    }

    /**
     * Draws each run of the filled systems that has instances (see `runCount`): the first with
     * the batch mesh, from the start of the buffers, each later one with a run mesh of its own,
     * and gives each draw the run's bounds and its place in the renderer's order.
     */
    private drawRuns(turnsByQuaternion: boolean, usesVelocity: boolean): void {
        const starts = this.systemStarts;
        const sources = this.instanceSources;
        let draws = 0;
        let fromSystem = 0;
        for (let r = 0; r < this.runCount; r++) {
            const toSystem = this.runEnds[r];
            const first = starts[fromSystem];
            const end = starts[toSystem];
            const runFrom = fromSystem;
            fromSystem = toSystem;
            if (end === first) {
                continue;
            }
            let mesh: Mesh;
            if (draws === 0) {
                // Every run before this one is empty, so this one starts at instance 0.
                mesh = this.mesh;
                mesh.forcedInstanceCount = end;
                this.uploadInstances(end, turnsByQuaternion, usesVelocity);
            } else {
                const run = this.runAt(draws - 1);
                mesh = run.mesh;
                sources[0] = this.offsetBuffer;
                sources[1] = this.sizeBuffer;
                sources[2] = this.colorBuffer;
                sources[3] = this.uvTileBuffer;
                sources[4] = this.rotationBuffer;
                // The layout's next slot: the velocity or the stretch, as no batch has both.
                sources[5] = this.velocityBuffer ?? this.stretchBuffer;
                run.write(sources, this.instanceLayout, first, end - first);
                this.syncDrawMesh(mesh);
                mesh.isVisible = true;
            }
            this.refreshBoundingInfo(mesh, runFrom, toSystem);
            const key = this.runKeys[r];
            if (Number.isNaN(key)) {
                clearDrawOrder(mesh.subMeshes[0]);
            } else {
                setDrawOrder(mesh.subMeshes[0], key, this.runSequences[r]);
            }
            draws++;
        }
        this.hideRunsFrom(Math.max(0, draws - 1));
    }

    /** Stops drawing the run meshes from `index` on. */
    private hideRunsFrom(index: number): void {
        for (let i = index; i < this.runs.length; i++) {
            this.runs[i].mesh.isVisible = false;
        }
    }

    /** Uploads the first `count` instances to the batch mesh's buffers. */
    private uploadInstances(count: number, turnsByQuaternion: boolean, usesVelocity: boolean): void {
        // Upload only the slots filled this frame, to the next whole chunk: the buffers are sized
        // for the high-water mark and are usually far larger than the live count.
        this.offsetVB.update(this.uploadViews.offset.of(this.offsetBuffer, count * 3));
        this.sizeVB.update(this.uploadViews.size.of(this.sizeBuffer, count * 3));
        this.colorVB.update(this.uploadViews.color.of(this.colorBuffer, count * 4));
        this.uvTileVB.update(this.uploadViews.uvTile.of(this.uvTileBuffer, count));
        this.rotationVB.update(
            this.uploadViews.rotation.of(this.rotationBuffer, turnsByQuaternion ? count * 4 : count)
        );
        if (usesVelocity && this.velocityVB && this.velocityBuffer) {
            this.velocityVB.update(this.uploadViews.velocity.of(this.velocityBuffer, count * 4));
        }
        if (this.stretchGPUBuffer && this.stretchBuffer) {
            this.stretchGPUBuffer.update(this.uploadViews.stretch.of(this.stretchBuffer, count * 9));
        }
    }

    /** @internal */
    override drawnInstances(): number {
        return this.filledInstances;
    }

    private readonly beamEnd_ = new Vector3();

    /**
     * Writes, for the `count` instances from `first`, the world vector from
     * each one's drawn position to the system's beam end into the velocity
     * buffer, which the stretched shader under `BEAM` lays the quad along. A
     * beam without an end gets no length.
     */
    private writeBeams(system: ParticleSystem, first: number, count: number): void {
        const velocities = this.velocityBuffer!;
        const offsets = this.offsetBuffer;
        const end = this.beamEnd_;
        const hasEnd = typeof system.getBeamEnd === 'function' && system.getBeamEnd(end);
        for (let i = first; i < first + count; i++) {
            const o = i * 3;
            const v = i * 4;
            velocities[v] = hasEnd ? end.x - offsets[o] : 0;
            velocities[v + 1] = hasEnd ? end.y - offsets[o + 1] : 0;
            velocities[v + 2] = hasEnd ? end.z - offsets[o + 2] : 0;
            velocities[v + 3] = 0;
        }
    }

    /** Multiplies `count` RGBA colours starting at `base` by a system's {@link ParticleSystem.tint}. */
    private static applyTint(colors: Float32Array, base: number, count: number, tint: Color4Like): void {
        for (let j = 0, o = base; j < count; j++, o += 4) {
            colors[o] *= tint.r;
            colors[o + 1] *= tint.g;
            colors[o + 2] *= tint.b;
            colors[o + 3] *= tint.a;
        }
    }

    /**
     * Negates the size of each flipped particle along the axes it flips on,
     * starting at `base` in `sizes`. The billboard shader scales the quad by
     * the size, so a negative one mirrors it — and with it the texture, the
     * quad being centred — the way Unity's renderer Flip mirrors U and V. The
     * stretched shader reads the sign and mirrors the texture coordinates.
     */
    private static applyFlip(sizes: Float32Array, base: number, flips: Uint8Array, count: number): void {
        for (let j = 0, o = base; j < count; j++, o += 3) {
            const flip = flips[j];
            if (flip !== 0) {
                if (flip & 1) sizes[o] = -sizes[o];
                if (flip & 2) sizes[o + 1] = -sizes[o + 1];
            }
        }
    }

    /** The same for a system without a store, read off the particles. */
    private static applyFlipFromParticles(
        sizes: Float32Array,
        base: number,
        particles: IParticle[],
        count: number
    ): void {
        for (let j = 0, o = base; j < count; j++, o += 3) {
            const flip = (particles[j] as SpriteParticle).flip;
            if (flip !== 0) {
                if (flip & 1) sizes[o] = -sizes[o];
                if (flip & 2) sizes[o + 1] = -sizes[o + 1];
            }
        }
    }

    /**
     * Writes the turns of rows `[0, count)` of a store's aligned billboards from `base` on, one
     * quaternion each (see {@link writeQuadTurn}): each row's angle carried on by its spin over
     * the `residual` seconds since the last step, as a camera-facing billboard's angle is.
     */
    private static writeQuadTurns(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        residual: number,
        frame: Quaternion | null
    ): void {
        const angles = store.rotation;
        const rates = store.angularVelocity;
        for (let i = 0, t = base; i < count; i++, t += 4) {
            SpriteBatch.writeQuadTurn(target, t, residual === 0 ? angles[i] : angles[i] + rates[i] * residual, frame);
        }
    }

    /**
     * Writes the turn of an aligned billboard's quad at `target[base]`, as a quaternion: `frame`,
     * the emitter's turn for `'local'` (null for `'world'`, the world's axes), times a spin of
     * `angle` about Z, which turns the quad in its plane as a camera-facing billboard's angle does.
     */
    private static writeQuadTurn(target: Float32Array, base: number, angle: number, frame: Quaternion | null): void {
        const sz = Math.sin(angle / 2);
        const sw = Math.cos(angle / 2);
        if (frame === null) {
            target[base] = 0;
            target[base + 1] = 0;
            target[base + 2] = sz;
            target[base + 3] = sw;
            return;
        }
        // frame * (0, 0, sz, sw)
        target[base] = frame.x * sw + frame.y * sz;
        target[base + 1] = frame.y * sw - frame.x * sz;
        target[base + 2] = frame.z * sw + frame.w * sz;
        target[base + 3] = frame.w * sw - frame.z * sz;
    }

    /**
     * A particle's turn `q` as it shows in a frame mirrored along its X axis: the
     * same turn seen in a mirror, X·q·X, which keeps the axis's X and turns the
     * other way, into `out`. A mesh in a mirrored emitter is drawn as Unity
     * draws it, its own turn inside the mirror: the emitter's turn, then this,
     * then the mirror on the X size (see `mirrorsMeshes`).
     */
    private static mirrorTurn(q: Quaternion, out: Quaternion): Quaternion {
        return out.set(q.x, -q.y, -q.z, q.w);
    }

    /**
     * Writes the mesh rotations for rows `[0, count)` of a store: each
     * particle's quaternion, carried on by `fraction` of its last turn (see
     * {@link partialTurn}), mirrored by {@link mirrorTurn} when `mirror` is
     * set and, for a local-space system, turned by the emitter's rotation
     * `parent`.
     */
    /**
     * The stretch of a system's mesh particles, into `out` as three columns: the linear map the
     * vertex shader applies to a mesh after its size and its rotation (the emitter's turn and the
     * particle's own, or its own alone). Unity applies the emitter's scale outside the particle's
     * rotation, along the axes of the render alignment: a mesh turned 30, 40 and 50 degrees under
     * an emitter scaled 2, 2 and 1 is stretched along the emitter's axes, not its own (measured in
     * Unity 6 with `BakeMesh`, every scaling mode, both simulation spaces). A flat ring spun about
     * its Z under an emitter squashed in Y then stays an upright ellipse as it turns, where scaling
     * its size would spin the ellipse with it.
     *
     * - `matrix` and `turn`, a mesh that turns with the emitter (`'local'`, or `'simulation'` in a
     *   local-space system): the emitter's matrix times the inverse of the turn its rotation already
     *   carries, `L·Qᵀ`, so the mesh is drawn by `L·R`, as Unity's Local alignment, skew and all. A
     *   mirrored emitter does not mirror its meshes, as before.
     * - `matrix` and `scale` (`'world'` and `'view'`): the emitter's scale along the world's or the
     *   camera's axes, `diag(scale)`, as Unity's World and View alignments, `scale` the emitter's
     *   {@link ParticleEmitter.alignedScale}.
     * - neither: none, for a world-space system, whose particles took the emitter's scale in their
     *   size at birth.
     * @internal
     */
    static meshStretch(
        matrix: Matrix4 | null,
        turn: Quaternion | null,
        scale: Vector3 | null,
        out: Float64Array
    ): void {
        out.fill(0);
        if (matrix === null) {
            out[0] = out[4] = out[8] = 1;
            return;
        }
        const e = matrix.elements;
        if (turn === null) {
            // An emitter that does not give it: the lengths of the matrix's axes, which it is
            // unless the matrix is skewed.
            out[0] = scale ? scale.x : Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
            out[4] = scale ? scale.y : Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
            out[8] = scale ? scale.z : Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
            return;
        }
        const {x, y, z, w} = turn;
        // The turn as a matrix, row by row.
        const rows = SpriteBatch.turnRows;
        rows[0] = 1 - 2 * (y * y + z * z);
        rows[1] = 2 * (x * y - z * w);
        rows[2] = 2 * (x * z + y * w);
        rows[3] = 2 * (x * y + z * w);
        rows[4] = 1 - 2 * (x * x + z * z);
        rows[5] = 2 * (y * z - x * w);
        rows[6] = 2 * (x * z - y * w);
        rows[7] = 2 * (y * z + x * w);
        rows[8] = 1 - 2 * (x * x + y * y);
        // Column j of L·Qᵀ is L times row j of Q.
        for (let j = 0; j < 3; j++) {
            const a = rows[j * 3],
                b = rows[j * 3 + 1],
                c = rows[j * 3 + 2];
            for (let r = 0; r < 3; r++) {
                out[j * 3 + r] = e[r] * a + e[4 + r] * b + e[8 + r] * c;
            }
        }
        const det =
            out[0] * (out[4] * out[8] - out[5] * out[7]) -
            out[3] * (out[1] * out[8] - out[2] * out[7]) +
            out[6] * (out[1] * out[5] - out[2] * out[4]);
        if (det < 0) {
            // Mirrored along the turn's X, where the decomposition puts a negative scale: reflect
            // it back, S·(I − 2aaᵀ) with a that axis, the turn's first column.
            const ax = rows[0],
                ay = rows[3],
                az = rows[6];
            for (let r = 0; r < 3; r++) {
                const sa = out[r] * ax + out[3 + r] * ay + out[6 + r] * az;
                out[r] -= 2 * sa * ax;
                out[3 + r] -= 2 * sa * ay;
                out[6 + r] -= 2 * sa * az;
            }
        }
    }

    /** Scratch for {@link meshStretch}: a turn's matrix, row by row. */
    private static readonly turnRows = new Float64Array(9);

    /**
     * Writes the stretch {@link meshStretch} left in {@link stretch_} to the instances from `first`
     * to `end`; one whose particle carries its own parent transform, whose size is in world units,
     * takes none. `particles` is null when none of them can.
     */
    private writeMeshStretch(first: number, end: number, particles: ReadonlyArray<IParticle> | null): void {
        const m = this.stretch_;
        const target = this.stretchBuffer!;
        for (let i = first, o = first * 9; i < end; i++, o += 9) {
            const own = particles !== null && !!(particles[i - first] as SpriteParticle).parentMatrix;
            for (let k = 0; k < 9; k++) {
                target[o + k] = own ? (k % 4 === 0 ? 1 : 0) : m[k];
            }
        }
    }

    private static writeQuaternions(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        fraction: number,
        parent: Quaternion | null,
        mirror = false
    ): void {
        const rotations = store.rotationQuaternion;
        const turns = store.angularVelocityQuaternion;
        const hasParent = parent !== null;
        const px = hasParent ? parent.x : 0;
        const py = hasParent ? parent.y : 0;
        const pz = hasParent ? parent.z : 0;
        const pw = hasParent ? parent.w : 1;
        for (let i = 0, o = 0, t = base; i < count; i++, o += 4, t += 4) {
            let x = rotations[o];
            let y = rotations[o + 1];
            let z = rotations[o + 2];
            let w = rotations[o + 3];
            if (fraction !== 0) {
                // The fraction of the step's turn, as a normalised lerp from no
                // rotation, then own = own * turn.
                const sx = turns[o] * fraction;
                const sy = turns[o + 1] * fraction;
                const sz = turns[o + 2] * fraction;
                const sw = 1 + (turns[o + 3] - 1) * fraction;
                const inverseLength = 1 / Math.sqrt(sx * sx + sy * sy + sz * sz + sw * sw);
                const tx = sx * inverseLength;
                const ty = sy * inverseLength;
                const tz = sz * inverseLength;
                const tw = sw * inverseLength;
                const nx = x * tw + w * tx + y * tz - z * ty;
                const ny = y * tw + w * ty + z * tx - x * tz;
                const nz = z * tw + w * tz + x * ty - y * tx;
                w = w * tw - x * tx - y * ty - z * tz;
                x = nx;
                y = ny;
                z = nz;
            }
            if (mirror) {
                y = -y;
                z = -z;
            }
            if (hasParent) {
                // q = parent * own
                const nx = px * w + pw * x + py * z - pz * y;
                const ny = py * w + pw * y + pz * x - px * z;
                const nz = pz * w + pw * z + px * y - py * x;
                w = pw * w - px * x - py * y - pz * z;
                x = nx;
                y = ny;
                z = nz;
            }
            target[t] = x;
            target[t + 1] = y;
            target[t + 2] = z;
            target[t + 3] = w;
        }
    }

    /**
     * Writes the stretched billboards' velocity attribute for rows `[0, count)`
     * of a store: the velocity carried on by `fraction` of the last step (see
     * {@link extrapolate}), turned into world space by `rotation` when the
     * system simulates locally, scaled by the speed factor, with the length
     * factor in `w`.
     */
    private static writeVelocities(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        fraction: number,
        rotation: Matrix3 | null,
        speedFactor: number,
        lengthFactor: number
    ): void {
        const velocities = store.velocity;
        // Empty until the first stretched step has run; the velocity then has no history yet.
        const previous = store.previousVelocity.length >= count * 3 ? store.previousVelocity : velocities;
        // The velocity of the behaviors' direct moves, added as Unity adds animatedVelocity.
        const animated = store.animatedVelocity.length >= count * 3 ? store.animatedVelocity : null;
        const previousAnimated = store.previousAnimatedVelocity;
        const e = rotation !== null ? rotation.elements : null;
        for (let i = 0, o = 0, t = base; i < count; i++, o += 3, t += 4) {
            let vx = velocities[o];
            let vy = velocities[o + 1];
            let vz = velocities[o + 2];
            if (fraction !== 0) {
                vx += (vx - previous[o]) * fraction;
                vy += (vy - previous[o + 1]) * fraction;
                vz += (vz - previous[o + 2]) * fraction;
            }
            if (animated !== null) {
                vx += animated[o] + (animated[o] - previousAnimated[o]) * fraction;
                vy += animated[o + 1] + (animated[o + 1] - previousAnimated[o + 1]) * fraction;
                vz += animated[o + 2] + (animated[o + 2] - previousAnimated[o + 2]) * fraction;
            }
            if (e !== null) {
                const x = e[0] * vx + e[3] * vy + e[6] * vz;
                const y = e[1] * vx + e[4] * vy + e[7] * vz;
                vz = e[2] * vx + e[5] * vy + e[8] * vz;
                vx = x;
                vy = y;
            }
            target[t] = vx * speedFactor;
            target[t + 1] = vy * speedFactor;
            target[t + 2] = vz * speedFactor;
            target[t + 3] = lengthFactor;
        }
    }

    /**
     * The fraction `f` of a turn, as a normalised lerp from no rotation toward
     * `step`, written into `out`.
     *
     * A true slerp would be exact, but `step` is one simulation step of turning
     * and `f` is below 1, so the arc being split is small enough that the lerp
     * is within a rounding error of it and costs a fraction as much.
     */
    private static partialTurn(step: Quaternion, f: number, out: Quaternion): Quaternion {
        const x = step.x * f;
        const y = step.y * f;
        const z = step.z * f;
        const w = 1 + (step.w - 1) * f;
        const inverseLength = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
        out.x = x * inverseLength;
        out.y = y * inverseLength;
        out.z = z * inverseLength;
        out.w = w * inverseLength;
        return out;
    }

    /**
     * Continues a three-component column by `fraction` of the step it just took,
     * never below zero.
     *
     * Size fades to nothing at the end of a life, so the last step before death
     * can point past zero; a negative size turns a sprite inside out.
     */
    private static continueVector3(
        target: Float32Array,
        base: number,
        current: Float32Array,
        previous: Float32Array,
        count: number,
        fraction: number
    ): void {
        for (let i = 0, o = 0; i < count; i++, o += 3) {
            const x = current[o] + (current[o] - previous[o]) * fraction;
            const y = current[o + 1] + (current[o + 1] - previous[o + 1]) * fraction;
            const z = current[o + 2] + (current[o + 2] - previous[o + 2]) * fraction;
            target[base + o] = x > 0 ? x : 0;
            target[base + o + 1] = y > 0 ? y : 0;
            target[base + o + 2] = z > 0 ? z : 0;
        }
    }

    /** The same for colour, whose alpha runs out at the end of a life too. */
    private static continueColor(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        fraction: number
    ): void {
        const current = store.color;
        const previous = store.previousColor;
        for (let i = 0, o = 0; i < count; i++, o += 4) {
            const r = current[o] + (current[o] - previous[o]) * fraction;
            const g = current[o + 1] + (current[o + 1] - previous[o + 1]) * fraction;
            const b = current[o + 2] + (current[o + 2] - previous[o + 2]) * fraction;
            const a = current[o + 3] + (current[o + 3] - previous[o + 3]) * fraction;
            target[base + o] = r > 0 ? r : 0;
            target[base + o + 1] = g > 0 ? g : 0;
            target[base + o + 2] = b > 0 ? b : 0;
            target[base + o + 3] = a > 0 ? a : 0;
        }
    }

    /**
     * Writes rows `[0, count)` of the store's positions into `target` at `base`,
     * each carried on by `fraction` of the step it just took.
     *
     * Continuing the measured last step covers every way a particle can move —
     * velocity integration, an orbit, noise, a plugin's own behavior — because
     * it reads what happened rather than predicting from one term of it. Over
     * less than a step it is a straight line through a path that may curve,
     * which for a sixtieth of a second is well under a pixel.
     *
     * A particle born during the step has the same position on both sides and
     * so does not move at all, which is what puts it at the emitter rather than
     * a step's travel away from it.
     */
    private static extrapolate(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        fraction: number
    ): void {
        const positions = store.position;
        const previous = store.previousPosition;
        for (let i = 0, o = 0; i < count; i++, o += 3) {
            const x = positions[o];
            const y = positions[o + 1];
            const z = positions[o + 2];
            target[base + o] = x + (x - previous[o]) * fraction;
            target[base + o + 1] = y + (y - previous[o + 1]) * fraction;
            target[base + o + 2] = z + (z - previous[o + 2]) * fraction;
        }
    }

    /** Pushes a zero-alpha instance so stale instancing data cannot linger on screen. */
    private uploadClearedInstance(turnsByQuaternion: boolean, isStretchedRender: boolean): void {
        this.colorBuffer[3] = 0;
        this.sizeBuffer[0] = 0;
        this.sizeBuffer[1] = 0;
        this.sizeBuffer[2] = 0;
        this.colorVB.update(this.uploadViews.color.of(this.colorBuffer, 4));
        this.sizeVB.update(this.uploadViews.size.of(this.sizeBuffer, 3));
        this.offsetVB.update(this.uploadViews.offset.of(this.offsetBuffer, 3));
        this.uvTileVB.update(this.uploadViews.uvTile.of(this.uvTileBuffer, 1));
        if (turnsByQuaternion) {
            this.rotationVB.update(this.uploadViews.rotation.of(this.rotationBuffer, 4));
        } else {
            this.rotationVB.update(this.uploadViews.rotation.of(this.rotationBuffer, 1));
        }
        if (isStretchedRender && this.velocityVB && this.velocityBuffer) {
            this.velocityVB.update(this.uploadViews.velocity.of(this.velocityBuffer, 4));
        }
        if (this.stretchGPUBuffer && this.stretchBuffer) {
            this.stretchGPUBuffer.update(this.uploadViews.stretch.of(this.stretchBuffer, 9));
        }
    }

    /** @internal */
    dispose(): void {
        this.disposed = true;
        this.cancelAtlasRebuild?.();
        this.cancelAtlasRebuild = null;
        if (this.mesh.material) {
            this.mesh.material.dispose();
        }
        this.disposeRuns();
        super.dispose();
        // The mesh's vertex buffers are views of it and do not own it.
        this.geometryBuffer?.dispose();
        this.geometryBuffer = undefined;
    }
}
