import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector2 as BVector2, Vector3 as BVector3, Vector4 as BVector4} from '@babylonjs/core/Maths/math.vector';
import {
    Vector3,
    Vector4,
    Quaternion,
    Matrix3,
    SpriteParticle,
    StretchedBillBoardSettings,
    IParticleSystem,
    ParticleStore,
} from 'quarks.core';
import {VFXBatch, RenderMode} from './VFXBatch';
import {VFXBatchSettings} from './BatchedRenderer';
import particle_vert from './shaders/particle_vert.glsl';
import particle_frag from './shaders/particle_frag.glsl';
import particle_physics_frag from './shaders/particle_physics_frag.glsl';
import stretched_bb_particle_vert from './shaders/stretched_bb_particle_vert.glsl';
import local_particle_physics_vert from './shaders/local_particle_physics_vert.glsl';

export class SpriteBatch extends VFXBatch {
    private offsetBuffer!: Float32Array;
    private rotationBuffer!: Float32Array;
    private sizeBuffer!: Float32Array;
    private colorBuffer!: Float32Array;
    private uvTileBuffer!: Float32Array;
    private velocityBuffer?: Float32Array;

    /** Concretely typed handle on the batch material, see syncStretchedSpeedFactor. */
    private shaderMaterial: ShaderMaterial | null = null;

    private offsetVB!: VertexBuffer;
    private rotationVB!: VertexBuffer;
    private sizeVB!: VertexBuffer;
    private colorVB!: VertexBuffer;
    private uvTileVB!: VertexBuffer;
    private velocityVB?: VertexBuffer;

    constructor(settings: VFXBatchSettings, scene: Scene) {
        super(settings, scene);
        this.maxParticles = 1000;
        this.setupBuffers();
        this.rebuildMaterial();
    }

    setupBuffers(): void {
        this.mesh.dispose();
        this.mesh = new Mesh('spriteBatch', this.scene);
        this.mesh.alwaysSelectAsActiveMesh = true;

        const vertexData = new VertexData();
        vertexData.positions = this.settings.instancingGeometry;
        vertexData.indices = this.settings.instancingIndices;
        if (this.settings.instancingUVs) {
            vertexData.uvs = this.settings.instancingUVs;
        }
        if (this.settings.instancingNormals) {
            vertexData.normals = this.settings.instancingNormals;
        }
        vertexData.applyToMesh(this.mesh, false);

        this.buildExpandableBuffers();
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

        if (this.settings.renderMode === RenderMode.Mesh) {
            this.rotationBuffer = new Float32Array(this.maxParticles * 4);
            this.rotationVB = new VertexBuffer(engine, this.rotationBuffer, 'rotation', true, false, 4, true);
        } else {
            this.rotationBuffer = new Float32Array(this.maxParticles);
            this.rotationVB = new VertexBuffer(engine, this.rotationBuffer, 'rotation', true, false, 1, true);
        }
        this.mesh.setVerticesBuffer(this.rotationVB);

        if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            this.velocityBuffer = new Float32Array(this.maxParticles * 4);
            this.velocityVB = new VertexBuffer(engine, this.velocityBuffer, 'velocity', true, false, 4, true);
            this.mesh.setVerticesBuffer(this.velocityVB);
        }

        this.mesh.forcedInstanceCount = 0;
        this.mesh.doNotSyncBoundingInfo = true;
    }

    expandBuffers(target: number): void {
        while (target >= this.maxParticles) {
            this.maxParticles *= 2;
        }
        this.disposeExpandableBuffers();
        this.buildExpandableBuffers();
    }

    rebuildMaterial(): void {
        // The shader sources only depend on the render mode, so the store entry is
        // registered once per mode. A unique name per rebuild would leak entries in
        // Effect.ShadersStore and defeat Babylon's compiled-effect cache.
        const shaderName = `quarksParticle_${this.settings.renderMode}`;
        this.lastStretchedSpeedFactor = Number.NaN;
        let vertexShader: string;
        let fragmentShader: string;
        const defines: string[] = [];

        if (this.settings.renderMode === RenderMode.Mesh) {
            vertexShader = local_particle_physics_vert;
            fragmentShader = particle_physics_frag;
        } else if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            vertexShader = stretched_bb_particle_vert;
            fragmentShader = particle_frag;
        } else {
            vertexShader = particle_vert;
            fragmentShader = particle_frag;
        }

        if (this.settings.texture) {
            defines.push('USE_MAP');
        }
        if (this.settings.uTileCount > 1 || this.settings.vTileCount > 1) {
            defines.push('UV_TILE');
        }
        if (this.settings.blendTiles) {
            defines.push('TILE_BLEND');
        }
        if (this.settings.softParticles) {
            defines.push('SOFT_PARTICLES');
        }
        if (this.settings.materialAlphaTest > 0) {
            defines.push('USE_ALPHATEST');
        }
        if (this.settings.renderMode === RenderMode.VerticalBillBoard) {
            defines.push('VERTICAL');
        }
        if (this.settings.renderMode === RenderMode.HorizontalBillBoard) {
            defines.push('HORIZONTAL');
        }

        Effect.ShadersStore[shaderName + 'VertexShader'] = vertexShader;
        Effect.ShadersStore[shaderName + 'FragmentShader'] = fragmentShader;

        const attributes = ['position', 'uv', 'offset', 'color', 'size', 'rotation', 'uvTile'];
        if (this.settings.renderMode === RenderMode.Mesh) {
            attributes.push('normal');
        }
        if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            attributes.push('velocity');
        }

        const uniforms = ['world', 'view', 'projection', 'worldView', 'worldViewProjection'];
        const samplers: string[] = [];

        if (this.settings.uTileCount > 1 || this.settings.vTileCount > 1) {
            uniforms.push('tileCountX');
            uniforms.push('tileCountY');
        }
        if (this.settings.texture) {
            samplers.push('map');
        }
        if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            uniforms.push('speedFactor');
        }
        if (this.settings.softParticles) {
            uniforms.push('softParams');
            uniforms.push('projParams');
            samplers.push('depthTexture');
        }
        if (this.settings.materialAlphaTest > 0) {
            uniforms.push('alphaTest');
        }
        if (this.settings.renderMode === RenderMode.Mesh) {
            uniforms.push('lightDirection');
            uniforms.push('lightColor');
            uniforms.push('ambientColor');
        }

        const mat = new ShaderMaterial(shaderName, this.scene,
            {vertex: shaderName, fragment: shaderName},
            {
                attributes,
                uniforms,
                samplers,
                defines,
                needAlphaBlending: this.settings.materialTransparent,
            }
        );

        if (this.settings.texture) {
            mat.setTexture('map', this.settings.texture);
        }
        if (this.settings.uTileCount > 1 || this.settings.vTileCount > 1) {
            mat.setFloat('tileCountX', this.settings.uTileCount);
            mat.setFloat('tileCountY', this.settings.vTileCount);
        }
        if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            mat.setFloat('speedFactor', this.settings.softNearFade > 0 ? this.settings.softNearFade : 1.0);
        }
        if (this.settings.softParticles) {
            mat.setVector2('softParams', new BVector2(this.settings.softNearFade, 1.0 / Math.max(this.settings.softFarFade - this.settings.softNearFade, 0.0001)));
            // Reused across binds: this runs on every draw call.
            const projParams = new BVector4(0, 0, 0, 0);
            mat.onBindObservable.add(() => {
                const camera = this.scene.activeCamera;
                if (camera) {
                    projParams.x = camera.minZ;
                    projParams.y = camera.maxZ;
                    mat.setVector4('projParams', projParams);
                }
            });
        }
        if (this.settings.materialAlphaTest > 0) {
            mat.setFloat('alphaTest', this.settings.materialAlphaTest);
        }
        if (this.settings.renderMode === RenderMode.Mesh) {
            mat.setVector3('lightDirection', new BVector3(0.4, -1, 0.6));
            mat.setVector3('lightColor', new BVector3(1, 1, 1));
            mat.setVector3('ambientColor', new BVector3(0.35, 0.35, 0.35));
        }

        mat.backFaceCulling = false;

        if (this.settings.materialTransparent) {
            mat.alphaMode = this.settings.materialBlendMode;
        } else {
            mat.alphaMode = Constants.ALPHA_DISABLE;
        }
        mat.needDepthPrePass = this.settings.materialDepthWrite;
        mat.forceDepthWrite = this.settings.materialDepthWrite;
        mat.disableDepthWrite = !this.settings.materialDepthWrite;

        this.mesh.material = mat;
        this.shaderMaterial = mat;
    }

    private vector_ = new Vector3();
    private vector2_ = new Vector3();
    private vector3_ = new Vector3();
    private quaternion_ = new Quaternion();
    private quaternion2_ = new Quaternion();
    private quaternion3_ = new Quaternion();
    private quaternion4_ = new Quaternion();
    private quaternion5_ = new Quaternion();
    private rotationMat_ = new Matrix3();
    private rotationMat2_ = new Matrix3();
    private lastStretchedSpeedFactor = Number.NaN;

    update(): void {
        let index = 0;
        let particleCount = 0;
        const renderMode = this.settings.renderMode;
        const isMeshRender = renderMode === RenderMode.Mesh;
        const isStretchedRender = renderMode === RenderMode.StretchedBillBoard;

        const visibleSystems = this.getVisibleSystems();
        for (let i = 0; i < visibleSystems.length; i++) {
            particleCount += visibleSystems[i].particleNum;
        }
        if (particleCount > this.maxParticles) {
            this.expandBuffers(particleCount);
        }

        for (let s = 0; s < visibleSystems.length; s++) {
            const system = visibleSystems[s];
            const particles = system.particles;
            const particleNum = system.particleNum;
            const rotation = this.quaternion2_;
            const translation = this.vector2_;
            const scale = this.vector3_;
            const systemWorldSpace = system.worldSpace;
            const emitterMatrix = system.emitter.matrixWorld;
            emitterMatrix.decompose(translation, rotation, scale);
            this.rotationMat_.setFromMatrix4(emitterMatrix);
            const absScaleX = Math.abs(scale.x);
            const absScaleY = Math.abs(scale.y);
            const absScaleZ = Math.abs(scale.z);
            // Stretched-billboard settings are per system, not per particle.
            const stretchedSettings = isStretchedRender
                ? (system.rendererEmitterSettings as StretchedBillBoardSettings)
                : undefined;
            const speedFactor =
                stretchedSettings === undefined || stretchedSettings.speedFactor === 0
                    ? 0.001
                    : stretchedSettings.speedFactor;
            const lengthFactor = stretchedSettings?.lengthFactor ?? 0;

            // Live particles occupy store rows [0, particleNum) in the same order
            // this loop writes them, so attributes that need no per-particle
            // transform can be copied as one range instead of gathered.
            const store = system.store;
            const copiedColor = store !== undefined;
            if (copiedColor) {
                this.colorBuffer.set(store!.color.subarray(0, particleNum * 4), index * 4);
            }
            // Particles only carry their own parent transform when the system
            // emits through another one; otherwise the whole range shares the
            // emitter's matrix and can be transformed in place after the copy.
            const sharedTransform = store !== undefined && system.onlyUsedByOther !== true;
            // The simulation runs on a fixed step that the display does not
            // share, so the last step is usually in the past by the time the
            // frame is drawn. Carrying each particle along its own velocity for
            // the leftover time puts it where it belongs now; without it the
            // particles visibly stutter on any display that is not exactly 60Hz.
            const residual = system.simulationResidual ?? 0;
            // Turning is recorded per step rather than per second, so it is
            // carried by the fraction of a step the frame is past, not by time.
            const stepFraction = residual === 0 ? 0 : residual / (system.simulationStep ?? residual);
            let copiedPositionAndSize = false;
            if (store !== undefined && systemWorldSpace) {
                if (residual > 0 && particleNum > 0) {
                    SpriteBatch.extrapolate(this.offsetBuffer, index * 3, store, particleNum, residual);
                } else {
                    this.offsetBuffer.set(store.position.subarray(0, particleNum * 3), index * 3);
                }
                this.sizeBuffer.set(store.size.subarray(0, particleNum * 3), index * 3);
                copiedPositionAndSize = true;
            } else if (sharedTransform && particleNum > 0) {
                const base = index * 3;
                const end = base + particleNum * 3;
                const offsets = this.offsetBuffer;
                if (residual > 0) {
                    SpriteBatch.extrapolate(offsets, base, store!, particleNum, residual);
                } else {
                    offsets.set(store!.position.subarray(0, particleNum * 3), base);
                }
                const me = emitterMatrix.elements;
                const m00 = me[0], m01 = me[1], m02 = me[2], m03 = me[3];
                const m10 = me[4], m11 = me[5], m12 = me[6], m13 = me[7];
                const m20 = me[8], m21 = me[9], m22 = me[10], m23 = me[11];
                const m30 = me[12], m31 = me[13], m32 = me[14], m33 = me[15];
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
                sizes.set(store!.size.subarray(0, particleNum * 3), base);
                for (let o = base; o < end; o += 3) {
                    sizes[o] *= absScaleX;
                    sizes[o + 1] *= absScaleY;
                    sizes[o + 2] *= absScaleZ;
                }
                copiedPositionAndSize = true;
            }

            for (let j = 0; j < particleNum; j++, index++) {
                const particle = particles[j] as SpriteParticle;

                if (isMeshRender) {
                    // Turning behaviors leave the last step's turn on the
                    // particle; a fraction of it carries the mesh the rest of
                    // the way to now.
                    let own = particle.rotation as Quaternion;
                    const step = particle.angularVelocity;
                    if (stepFraction !== 0 && step instanceof Quaternion) {
                        own = this.quaternion4_.copy(own).multiply(
                            SpriteBatch.partialTurn(step, stepFraction, this.quaternion5_)
                        );
                    }
                    let q: Quaternion;
                    if (systemWorldSpace) {
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
                    this.rotationBuffer[index] =
                        (particle.rotation as number) + (typeof spin === 'number' ? spin * residual : 0);
                }

                if (!copiedPositionAndSize) {
                    const position = particle.position;
                    const velocity = particle.velocity;
                    const advance = residual * particle.speedModifier;
                    let px = position.x + velocity.x * advance;
                    let py = position.y + velocity.y * advance;
                    let pz = position.z + velocity.z * advance;
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
                    // space or the particle carries its own parent transform.
                    if (systemWorldSpace || particle.parentMatrix) {
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
                    let vel: Vector3;
                    if (systemWorldSpace) {
                        vel = particle.velocity;
                    } else {
                        vel = this.vector_;
                        if (particle.parentMatrix) {
                            this.rotationMat2_.setFromMatrix4(particle.parentMatrix);
                            vel.copy(particle.velocity).applyMatrix3(this.rotationMat2_);
                        } else {
                            vel.copy(particle.velocity).applyMatrix3(this.rotationMat_);
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

        if (isStretchedRender && visibleSystems.length > 0) {
            this.syncStretchedSpeedFactor(visibleSystems[0]);
        }

        // Keep the mesh enabled even when count is 0 — toggling visibility off for a
        // single frame (common with short lifetimes + low emission overlap) causes flicker.
        this.mesh.forcedInstanceCount = index;

        if (index === 0) {
            this.uploadClearedInstance(isMeshRender, isStretchedRender);
            return;
        }

        // Upload only the slots actually filled this frame: the buffers are sized
        // for the high-water mark and are usually far larger than the live count.
        this.offsetVB.update(this.offsetBuffer.subarray(0, index * 3));
        this.sizeVB.update(this.sizeBuffer.subarray(0, index * 3));
        this.colorVB.update(this.colorBuffer.subarray(0, index * 4));
        this.uvTileVB.update(this.uvTileBuffer.subarray(0, index));
        this.rotationVB.update(this.rotationBuffer.subarray(0, isMeshRender ? index * 4 : index));
        if (isStretchedRender && this.velocityVB && this.velocityBuffer) {
            this.velocityVB.update(this.velocityBuffer.subarray(0, index * 4));
        }
    }

    /**
     * Pushes the stretched-billboard speed factor to the shader when it changed.
     *
     * Deliberately kept out of `update`: touching the loosely typed
     * `mesh.material` from inside that function gives V8 a generic property
     * access it has no feedback for, which knocks the whole particle loop out of
     * optimised code on every frame.
     */
    private syncStretchedSpeedFactor(system: IParticleSystem): void {
        const material = this.shaderMaterial;
        if (material === null) {
            return;
        }
        const speedFactor = (system.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor ?? 1.0;
        const clampedSpeedFactor = speedFactor === 0 ? 0.001 : speedFactor;
        if (clampedSpeedFactor !== this.lastStretchedSpeedFactor) {
            material.setFloat('speedFactor', clampedSpeedFactor);
            this.lastStretchedSpeedFactor = clampedSpeedFactor;
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
     * Writes rows `[0, count)` of the store's positions into `target` at
     * `base`, each carried along its own velocity for `residual` seconds.
     *
     * This is the same integration the next simulation step performs, so for a
     * particle under constant velocity the drawn path is exactly the continuous
     * one. A particle whose motion comes from somewhere else — a force about to
     * change its velocity, a behavior that displaces it directly — is off by
     * whatever that adds over less than one step.
     */
    private static extrapolate(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        residual: number
    ): void {
        const positions = store.position;
        const velocities = store.velocity;
        const scalars = store.scalars;
        const stride = ParticleStore.SCALAR_STRIDE;
        for (let i = 0, o = 0, s = ParticleStore.SPEED_MODIFIER; i < count; i++, o += 3, s += stride) {
            const advance = residual * scalars[s];
            target[base + o] = positions[o] + velocities[o] * advance;
            target[base + o + 1] = positions[o + 1] + velocities[o + 1] * advance;
            target[base + o + 2] = positions[o + 2] + velocities[o + 2] * advance;
        }
    }

    /** Pushes a zero-alpha instance so stale instancing data cannot linger on screen. */
    private uploadClearedInstance(isMeshRender: boolean, isStretchedRender: boolean): void {
        this.colorBuffer[3] = 0;
        this.sizeBuffer[0] = 0;
        this.sizeBuffer[1] = 0;
        this.sizeBuffer[2] = 0;
        this.colorVB.update(this.colorBuffer.subarray(0, 4));
        this.sizeVB.update(this.sizeBuffer.subarray(0, 3));
        this.offsetVB.update(this.offsetBuffer.subarray(0, 3));
        this.uvTileVB.update(this.uvTileBuffer.subarray(0, 1));
        if (isMeshRender) {
            this.rotationVB.update(this.rotationBuffer.subarray(0, 4));
        } else {
            this.rotationVB.update(this.rotationBuffer.subarray(0, 1));
        }
        if (isStretchedRender && this.velocityVB && this.velocityBuffer) {
            this.velocityVB.update(this.velocityBuffer.subarray(0, 4));
        }
    }

    dispose(): void {
        if (this.mesh.material) {
            this.mesh.material.dispose();
        }
        super.dispose();
    }
}
