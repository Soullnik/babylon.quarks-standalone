import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Vector2 as BVector2, Vector3 as BVector3, Vector4 as BVector4} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Scene} from '@babylonjs/core/scene';
import {
    IParticle,
    IParticleSystem,
    Matrix3,
    ParticleStore,
    Quaternion,
    SpriteParticle,
    StretchedBillBoardSettings,
    Vector3,
} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import {gather, sortByKey, SortScratch} from './instanceSort';
import local_particle_physics_vert from './shaders/local_particle_physics_vert.glsl';
import local_particle_physics_vert_wgsl from './shaders/local_particle_physics_vert.wgsl';
import particle_frag from './shaders/particle_frag.glsl';
import particle_frag_wgsl from './shaders/particle_frag.wgsl';
import particle_physics_frag from './shaders/particle_physics_frag.glsl';
import particle_physics_frag_wgsl from './shaders/particle_physics_frag.wgsl';
import particle_vert from './shaders/particle_vert.glsl';
import particle_vert_wgsl from './shaders/particle_vert.wgsl';
import {registerShaders, shaderLanguageFor, ShaderSources} from './shaders/shaderLanguageSupport';
import stretched_bb_particle_vert from './shaders/stretched_bb_particle_vert.glsl';
import stretched_bb_particle_vert_wgsl from './shaders/stretched_bb_particle_vert.wgsl';
import {defaultMeshLighting, MeshLightingSettings, RenderMode, VFXBatch} from './VFXBatch';

export class SpriteBatch extends VFXBatch {
    private static whiteTextureByScene = new WeakMap<Scene, RawTexture>();

    /** 1×1 white map so mesh batches always have a sampler2D (iOS WebKit). */
    private static whiteTexture(scene: Scene): RawTexture {
        let texture = SpriteBatch.whiteTextureByScene.get(scene);
        if (!texture) {
            texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
            texture.name = 'quarksMeshWhite';
            SpriteBatch.whiteTextureByScene.set(scene, texture);
        }
        return texture;
    }
    private offsetBuffer!: Float32Array;
    private rotationBuffer!: Float32Array;
    private sizeBuffer!: Float32Array;
    private colorBuffer!: Float32Array;
    private uvTileBuffer!: Float32Array;
    private velocityBuffer?: Float32Array;

    /** Concretely typed handle on the batch material, see syncStretchedSpeedFactor. */
    private shaderMaterial: ShaderMaterial | null = null;
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

    constructor(settings: VFXBatchSettings, scene: Scene) {
        super(settings, scene);
        this.storeFixedLighting(defaultMeshLighting());
        this.maxParticles = 1000;
        this.setupBuffers();
        this.rebuildMaterial();
    }

    setupBuffers(): void {
        this.mesh.dispose();
        this.mesh = new Mesh('spriteBatch', this.scene);
        this.configureMesh();

        const vertexData = new VertexData();
        vertexData.positions = this.settings.instancingGeometry;
        vertexData.indices = this.settings.instancingIndices;
        const vertexCount = this.settings.instancingGeometry.length / 3;
        const uvs = this.settings.instancingUVs;
        // WebGL (especially iOS) raises INVALID_OPERATION if the shader reads
        // `attribute vec2 uv` but the buffer is missing or shorter than vertices.
        if (uvs && uvs.length >= vertexCount * 2) {
            vertexData.uvs = uvs;
        } else {
            vertexData.uvs = new Float32Array(vertexCount * 2);
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
        this.sortScratch = undefined;
        this.gatherScratch.length = 0;
    }

    /** The screen-size limits as a uniform value, or null when the batch has none that apply. */
    private sizeLimits(): BVector2 | null {
        const {minParticleSize, maxParticleSize} = this.settings;
        if (!SpriteBatch.takesPivotAndFlip(this.settings.renderMode)) {
            return null;
        }
        if (minParticleSize <= 0 && maxParticleSize === Infinity) {
            return null;
        }
        // The shader clamps; an unlimited maximum is just a very large one.
        return new BVector2(Math.max(0, minParticleSize), Math.min(maxParticleSize, 1e9));
    }

    private sortScratch?: SortScratch;
    /** One spare array per attribute buffer, gathered into and swapped in; indexed by buffer slot. */
    private readonly gatherScratch: Float32Array[] = [];

    /**
     * Reorders the `count` filled instances by the batch's sort mode, so that
     * the later (covering) draws are the nearer or the chosen-age particles.
     * The order is computed once as a permutation and every attribute buffer
     * is gathered through it into a spare array that then takes its place.
     */
    private sortInstances(count: number, isMeshRender: boolean, isStretchedRender: boolean): void {
        if (count < 2) {
            return;
        }
        const scratch = (this.sortScratch ??= new SortScratch(this.maxParticles));
        scratch.ensure(count);
        const keys = scratch.keys;
        const mode = this.settings.sortMode;
        if (mode === 'distance') {
            const camera = this.scene.activeCameras?.[0] ?? this.scene.activeCamera;
            if (!camera) {
                return;
            }
            const eye = camera.globalPosition;
            const ex = eye.x;
            const ey = eye.y;
            const ez = eye.z;
            const offsets = this.offsetBuffer;
            // Farthest first: the nearer particle is drawn last and covers.
            for (let i = 0, o = 0; i < count; i++, o += 3) {
                const dx = offsets[o] - ex;
                const dy = offsets[o + 1] - ey;
                const dz = offsets[o + 2] - ez;
                keys[i] = scratch.floatKey(dx * dx + dy * dy + dz * dz, true);
            }
        } else {
            // Ages in the order the systems were filled, which is the instance order.
            const youngestInFront = mode === 'youngestInFront';
            const systems = this.visibleSystems;
            let i = 0;
            for (let s = 0; s < systems.length; s++) {
                const system = systems[s];
                const particleNum = system.particleNum;
                const store = system.store;
                if (particleNum === 0) {
                    continue;
                }
                if (store === undefined) {
                    const particles = system.particles;
                    for (let j = 0; j < particleNum; j++) {
                        keys[i++] = scratch.floatKey(particles[j].age, youngestInFront);
                    }
                    continue;
                }
                const scalars = store.scalars;
                const stride = ParticleStore.SCALAR_STRIDE;
                for (let j = 0, a = ParticleStore.AGE; j < particleNum; j++, a += stride) {
                    keys[i++] = scratch.floatKey(scalars[a], youngestInFront);
                }
            }
            if (i !== count) {
                return;
            }
        }
        const order = sortByKey(scratch, count);
        this.offsetBuffer = this.gatherInto(0, this.offsetBuffer, order, count, 3);
        this.sizeBuffer = this.gatherInto(1, this.sizeBuffer, order, count, 3);
        this.colorBuffer = this.gatherInto(2, this.colorBuffer, order, count, 4);
        this.uvTileBuffer = this.gatherInto(3, this.uvTileBuffer, order, count, 1);
        this.rotationBuffer = this.gatherInto(4, this.rotationBuffer, order, count, isMeshRender ? 4 : 1);
        if (isStretchedRender && this.velocityBuffer) {
            this.velocityBuffer = this.gatherInto(5, this.velocityBuffer, order, count, 4);
        }
    }

    /** Gathers `source` in `order` into the spare array of `slot` and returns it; the source becomes the spare. */
    private gatherInto(
        slot: number,
        source: Float32Array,
        order: Uint32Array,
        count: number,
        stride: number
    ): Float32Array {
        let spare = this.gatherScratch[slot];
        if (spare === undefined || spare.length !== source.length) {
            spare = new Float32Array(source.length);
        }
        gather(source, spare, order, count, stride);
        this.gatherScratch[slot] = source;
        return spare;
    }

    rebuildMaterial(): void {
        // The shader sources only depend on the render mode, so the store entry is
        // registered once per mode. A unique name per rebuild would leak entries in
        // Effect.ShadersStore and defeat Babylon's compiled-effect cache.
        const shaderName = `quarksParticle_${this.settings.renderMode}`;
        this.lastStretchedSpeedFactor = Number.NaN;
        const defines: string[] = this.fogDefines();

        let vertexShader: ShaderSources;
        let fragmentShader: ShaderSources;
        if (this.settings.renderMode === RenderMode.Mesh) {
            vertexShader = {glsl: local_particle_physics_vert, wgsl: local_particle_physics_vert_wgsl};
            fragmentShader = {glsl: particle_physics_frag, wgsl: particle_physics_frag_wgsl};
        } else if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            vertexShader = {glsl: stretched_bb_particle_vert, wgsl: stretched_bb_particle_vert_wgsl};
            fragmentShader = {glsl: particle_frag, wgsl: particle_frag_wgsl};
        } else {
            vertexShader = {glsl: particle_vert, wgsl: particle_vert_wgsl};
            fragmentShader = {glsl: particle_frag, wgsl: particle_frag_wgsl};
        }

        // Mesh batches without a diffuse map still need a sampler2D on iOS WebKit —
        // a zero-sampler particle mesh effect often never becomes drawable there.
        const mapTexture =
            this.settings.texture ??
            (this.settings.renderMode === RenderMode.Mesh ? SpriteBatch.whiteTexture(this.scene) : null);
        if (mapTexture) {
            defines.push('USE_MAP');
        }
        const atlas = this.settings.reflectionAtlas;
        const atlasPending = this.settings.renderMode === RenderMode.Mesh && !!atlas && !atlas.isReady();
        if (atlasPending && atlas) {
            const onLoad = (atlas as {onLoadObservable?: {addOnce: (cb: () => void) => void}}).onLoadObservable;
            onLoad?.addOnce(() => {
                this.rebuildMaterial();
            });
        }
        const useEnvAtlas = this.settings.renderMode === RenderMode.Mesh && !!atlas && atlas.isReady();
        if (useEnvAtlas) {
            defines.push('USE_ENVMAP_ATLAS');
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
        const pivot = SpriteBatch.takesPivotAndFlip(this.settings.renderMode) ? this.settings.pivot : undefined;
        if (pivot) {
            defines.push('PIVOT');
        }
        const sizeLimits = this.sizeLimits();
        if (sizeLimits) {
            defines.push('SIZE_LIMITS');
        }
        const isMesh = this.settings.renderMode === RenderMode.Mesh;
        const lighting = this.settings.lighting ?? 'fixed';
        const lit = isMesh && lighting !== 'unlit';
        if (isMesh && !lit) {
            defines.push('MESH_UNLIT');
        }
        const rim = isMesh ? this.settings.rim : undefined;
        if (rim) {
            defines.push('MESH_RIM');
            if (rim.mode === 'mix') {
                defines.push('MESH_RIM_MIX');
            }
        }
        const needsEyePosition = useEnvAtlas || !!rim;
        defines.push(...this.surfaceDefines());

        const shaderLanguage = shaderLanguageFor(this.scene.getEngine());
        registerShaders(shaderName, vertexShader, fragmentShader, shaderLanguage);

        const attributes = ['position', 'uv', 'offset', 'color', 'size', 'rotation', 'uvTile'];
        if (this.settings.renderMode === RenderMode.Mesh) {
            attributes.push('normal');
        }
        if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            attributes.push('velocity');
        }

        const uniforms = ['world', 'view', 'projection', 'worldView', 'worldViewProjection', ...VFXBatch.FOG_UNIFORMS];
        const samplers: string[] = [];

        if (this.settings.uTileCount > 1 || this.settings.vTileCount > 1) {
            uniforms.push('tileCountX');
            uniforms.push('tileCountY');
        }
        if (mapTexture) {
            samplers.push('map');
        }
        if (useEnvAtlas) {
            samplers.push('envAtlas');
            uniforms.push('reflectionLevel');
        }
        if (needsEyePosition) {
            uniforms.push('eyePosition');
        }
        if (rim) {
            uniforms.push('rimColor');
            uniforms.push('rimParams');
        }
        this.surfaceUniforms(uniforms, samplers);
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
        if (pivot) {
            uniforms.push('pivot');
        }
        if (sizeLimits) {
            uniforms.push('sizeLimits');
        }
        if (lit) {
            uniforms.push('lightDirection');
            uniforms.push('lightColor');
            uniforms.push('ambientColor');
        }

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
            mat.setFloat('reflectionLevel', this.settings.reflectionLevel);
        }
        if (rim) {
            mat.setVector3('rimColor', new BVector3(rim.color[0], rim.color[1], rim.color[2]));
            mat.setVector2('rimParams', new BVector2(rim.power, rim.strength));
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
                mat.setVector3('eyePosition', eyePosition);
            });
        }
        if (this.settings.uTileCount > 1 || this.settings.vTileCount > 1) {
            mat.setFloat('tileCountX', this.settings.uTileCount);
            mat.setFloat('tileCountY', this.settings.vTileCount);
        }
        if (this.settings.renderMode === RenderMode.StretchedBillBoard) {
            mat.setFloat('speedFactor', this.settings.softNearFade > 0 ? this.settings.softNearFade : 1.0);
        }
        if (this.settings.softParticles) {
            mat.setVector2(
                'softParams',
                new BVector2(
                    this.settings.softNearFade,
                    1.0 / Math.max(this.settings.softFarFade - this.settings.softNearFade, 0.0001)
                )
            );
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
        if (pivot) {
            mat.setVector3('pivot', new BVector3(pivot.x, pivot.y, pivot.z));
        }
        if (sizeLimits) {
            mat.setVector2('sizeLimits', sizeLimits);
        }
        if (lit) {
            this.writeFixedLighting(mat);
            if (lighting === 'scene') {
                const direction = new BVector3();
                const color = new BVector3();
                const ambient = new BVector3();
                mat.onBindObservable.add(() => {
                    if (SpriteBatch.readSceneLight(this.scene, direction, color, ambient)) {
                        mat.setVector3('lightDirection', direction);
                        mat.setVector3('lightColor', color);
                        mat.setVector3('ambientColor', ambient);
                    } else {
                        this.writeFixedLighting(mat);
                    }
                });
            }
        }

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

        this.mesh.material = mat;
        this.shaderMaterial = mat;
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

    private writeFixedLighting(material: ShaderMaterial): void {
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
    private rotationMat_ = new Matrix3();
    private rotationMat2_ = new Matrix3();
    private lastStretchedSpeedFactor = Number.NaN;
    /** Slot 0 holds the zero-alpha instance since the batch last went empty. */
    private clearedInstanceUploaded = false;

    update(): void {
        let index = 0;
        let particleCount = 0;
        const renderMode = this.settings.renderMode;
        const isMeshRender = renderMode === RenderMode.Mesh;
        const isStretchedRender = renderMode === RenderMode.StretchedBillBoard;
        const flipsSprites = SpriteBatch.takesPivotAndFlip(renderMode);

        const visibleSystems = this.getVisibleSystems();
        for (let i = 0; i < visibleSystems.length; i++) {
            particleCount += visibleSystems[i].particleNum;
        }
        if (particleCount > this.maxParticles) {
            this.expandBuffers(particleCount);
        }

        for (let s = 0; s < visibleSystems.length; s++) {
            const system = visibleSystems[s];
            const particleNum = system.particleNum;
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
            // Only a local-space mesh needs the emitter's turn as a quaternion, and only a
            // local-space stretched billboard its rotation matrix. Everything else needs at most
            // the scale, which the basis column lengths give without a full decompose.
            if (isMeshRender && !systemWorldSpace) {
                emitterMatrix.decompose(translation, rotation, scale);
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
                    this.colorBuffer.set(store!.color.subarray(0, particleNum * 4), index * 4);
                }
            }
            let copiedPositionAndSize = false;
            if (store !== undefined && systemWorldSpace) {
                if (stepFraction !== 0 && particleNum > 0) {
                    SpriteBatch.extrapolate(this.offsetBuffer, index * 3, store, particleNum, stepFraction);
                } else {
                    this.offsetBuffer.set(store.position.subarray(0, particleNum * 3), index * 3);
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
                    this.sizeBuffer.set(store.size.subarray(0, particleNum * 3), index * 3);
                }
                copiedPositionAndSize = true;
            } else if (sharedTransform && particleNum > 0) {
                const base = index * 3;
                const end = base + particleNum * 3;
                const offsets = this.offsetBuffer;
                if (stepFraction !== 0) {
                    SpriteBatch.extrapolate(offsets, base, store!, particleNum, stepFraction);
                } else {
                    offsets.set(store!.position.subarray(0, particleNum * 3), base);
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
                    sizes.set(store!.size.subarray(0, particleNum * 3), base);
                }
                for (let o = base; o < end; o += 3) {
                    sizes[o] *= absScaleX;
                    sizes[o + 1] *= absScaleY;
                    sizes[o + 2] *= absScaleZ;
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
                this.uvTileBuffer.set(columns.uvTile.subarray(0, particleNum), firstIndex);
                const rotations = this.rotationBuffer;
                rotations.set(columns.rotation.subarray(0, particleNum), firstIndex);
                if (residual !== 0) {
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
                // bulk, by the emitter's rotation when the system is local.
                const columns = store!;
                this.uvTileBuffer.set(columns.uvTile.subarray(0, particleNum), firstIndex);
                SpriteBatch.writeQuaternions(
                    this.rotationBuffer,
                    firstIndex * 4,
                    columns,
                    particleNum,
                    stepFraction,
                    systemWorldSpace ? null : rotation
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
                        // The streak points along the velocity and is as long as it,
                        // so a velocity frozen between steps makes the sprite's
                        // outline pop at the step rate while its position glides.
                        const velocity = particle.velocity;
                        const previousVelocity = particle.previousVelocity;
                        const vx = velocity.x + (velocity.x - previousVelocity.x) * stepFraction;
                        const vy = velocity.y + (velocity.y - previousVelocity.y) * stepFraction;
                        const vz = velocity.z + (velocity.z - previousVelocity.z) * stepFraction;
                        let vel: Vector3 = this.vector_;
                        vel.set(vx, vy, vz);
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

            if (flipsSprites && system.flip !== undefined) {
                if (store !== undefined) {
                    SpriteBatch.applyFlip(this.sizeBuffer, firstIndex * 3, store.flip, particleNum);
                } else {
                    SpriteBatch.applyFlipFromParticles(this.sizeBuffer, firstIndex * 3, particles, particleNum);
                }
            }
        }

        if (isStretchedRender && visibleSystems.length > 0) {
            this.syncStretchedSpeedFactor(visibleSystems[0]);
        }

        // Keep the mesh enabled even when count is 0 — toggling visibility off for a
        // single frame (common with short lifetimes + low emission overlap) causes flicker.
        this.mesh.forcedInstanceCount = index;
        this.refreshBoundingInfo();

        if (index === 0) {
            // Slot 0 only needs clearing once per stretch of empty frames; re-uploading it every
            // frame cost five buffer uploads per idle batch per frame.
            if (!this.clearedInstanceUploaded) {
                this.uploadClearedInstance(isMeshRender, isStretchedRender);
                this.clearedInstanceUploaded = true;
            }
            return;
        }
        this.clearedInstanceUploaded = false;

        if (this.settings.sortMode !== 'none') {
            this.sortInstances(index, isMeshRender, isStretchedRender);
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

    /** The quads that take a pivot and flip: every billboard kind, stretched included, but not meshes. */
    private static takesPivotAndFlip(renderMode: RenderMode): boolean {
        return (
            renderMode === RenderMode.BillBoard ||
            renderMode === RenderMode.StretchedBillBoard ||
            renderMode === RenderMode.VerticalBillBoard ||
            renderMode === RenderMode.HorizontalBillBoard
        );
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
     * Writes the mesh rotations for rows `[0, count)` of a store: each
     * particle's quaternion, carried on by `fraction` of its last turn (see
     * {@link partialTurn}) and, for a local-space system, turned by the
     * emitter's rotation `parent`.
     */
    private static writeQuaternions(
        target: Float32Array,
        base: number,
        store: ParticleStore,
        count: number,
        fraction: number,
        parent: Quaternion | null
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
