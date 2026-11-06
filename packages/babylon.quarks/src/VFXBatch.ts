import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {Effect} from '@babylonjs/core/Materials/effect';
import type {ImageProcessingConfiguration} from '@babylonjs/core/Materials/imageProcessingConfiguration';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector2 as BVector2, Vector3 as BVector3, Vector4 as BVector4, Matrix} from '@babylonjs/core/Maths/math.vector';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {Observer} from '@babylonjs/core/Misc/observable';
import type {Node} from '@babylonjs/core/node';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Vector3} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import type {ParticleSystem} from './ParticleSystem';
import {storedBatchSettings} from './batchKey';
import {GRADIENT_MAP_WEIGHTS, MeshLightingSettings, readsUV1, StoredBatchSettings, TextureUV} from './batchSettings';
import {imageProcessingParts, ShaderImageProcessing} from './shaderProgram';
import {DepthBinding, softDepthParams} from './softDepth';
import {installTransparentSort, setSortingFudge} from './transparentSort';

export * from './batchSettings';

/**
 * One draw call of a {@link BatchedRenderer}: the systems that share a material, texture and
 * geometry, drawn together from one instanced mesh. The renderer makes and frees batches as
 * systems are added and their settings change; read them through `renderer.batches` to inspect
 * what is drawn, not to change it.
 */
export abstract class VFXBatch {
    /**
     * The Babylon mesh the batch draws with. Its world matrix is frozen at identity: the instance
     * data is already in world space, so no parent's transform moves the particles again.
     */
    mesh!: Mesh;
    /** The node the batch mesh lives under, kept across the meshes the batch rebuilds. */
    private parentNode: Node | null = null;
    /** The systems drawn by this batch. */
    systems: Set<IParticleSystem>;
    /** The settings every system in the batch shares, with what the render mode ignores at its default. */
    settings: StoredBatchSettings;
    /** @internal */
    protected maxParticles: number;
    /** @internal */
    protected scene: Scene;
    /** @internal */
    protected readonly visibleSystems: IParticleSystem[] = [];
    /**
     * The depth texture soft particles read, from {@link BatchedRenderer.setDepthTexture}.
     * @internal
     */
    protected depth: DepthBinding | null;

    /** @internal */
    protected constructor(settings: VFXBatchSettings, scene: Scene, depth: DepthBinding | null = null) {
        this.scene = scene;
        this.depth = depth;
        this.maxParticles = 0;
        this.systems = new Set<IParticleSystem>();
        this.settings = storedBatchSettings(settings);
        // The subclass builds the mesh, in setupBuffers.
    }

    /**
     * Puts the batch mesh under `node` (the renderer), for the scene graph and the node's enabled
     * state; the node's transform does not reach the particles.
     * @internal
     */
    attachTo(node: Node | null): void {
        this.parentNode = node;
        this.mesh.parent = node;
    }

    /**
     * Applies the batch-level scene settings to {@link mesh}. Called on every
     * mesh the batch creates, since the buffers rebuild it.
     *
     * `alphaIndex` from the system's render order puts the batch where the
     * author said among the scene's transparent meshes, and the rendering
     * group and layer mask reach the mesh at all (they used to stop at the
     * settings).
     */
    protected configureMesh(): void {
        this.configureDrawMesh(this.mesh);
        this.applySortingFudge();
    }

    /**
     * Sets up `mesh`, the batch mesh or a mesh drawing a later run of the batch's systems (see
     * {@link runCount}), as a draw of world-space instance data.
     * @internal
     */
    protected configureDrawMesh(mesh: Mesh): void {
        // Until the first fill measures the particles, the batch has no bounds
        // to cull by and is drawn regardless. The instance data is already in
        // world space, so the bounds never need the mesh's own matrix.
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        mesh.parent = this.parentNode;
        // World-space instance data: the parent's transform must not apply, nor the bounds move
        // with it. Frozen at identity, and kept there: a parent's markAsDirty would otherwise make
        // the frozen mesh recompute from its parents once.
        mesh.freezeWorldMatrix(Matrix.Identity());
        const world = mesh.getWorldMatrix();
        mesh.computeWorldMatrix = () => world;
        mesh.setBoundingInfo(new BoundingInfo(BVector3.Zero(), BVector3.Zero()));
        mesh.layerMask = this.settings.layerMask;
        mesh.renderingGroupId = this.settings.renderingGroupId;
        mesh.alphaIndex = this.settings.renderOrder;
        // The shaders fog themselves; Babylon's own fog pass does not apply to a ShaderMaterial.
        mesh.applyFog = false;
        // Its geometry is one quad or mesh at the origin, not the particles, so a pick or a
        // collision against it would hit nothing that is drawn. The renderer rebuilds batches
        // from its systems, so a scene serializer has nothing to write either.
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        mesh.doNotSerialize = true;
    }

    /**
     * Gives `mesh`, a mesh drawing a later run of the batch's systems, the batch mesh's place in
     * the scene and its material, which the batch mesh may have changed since. Called each frame
     * the run is drawn.
     * @internal
     */
    protected syncDrawMesh(mesh: Mesh): void {
        const batchMesh = this.mesh;
        if (mesh.parent !== batchMesh.parent) {
            mesh.parent = batchMesh.parent;
        }
        mesh.layerMask = batchMesh.layerMask;
        mesh.renderingGroupId = batchMesh.renderingGroupId;
        mesh.alphaIndex = batchMesh.alphaIndex;
        if (mesh.material !== batchMesh.material) {
            mesh.material = batchMesh.material;
        }
    }

    /**
     * Sorts the batch mesh with its systems' sorting fudge (see `ParticleSystem.sortingFudge`)
     * until the renderer orders it, and sets the renderer's transparent compare on the rendering
     * group of a transparent batch, which is drawn in the order of its systems.
     */
    private applySortingFudge(): void {
        setSortingFudge(this.mesh, this.settings.sortingFudge);
        if (this.settings.materialTransparent) {
            installTransparentSort(this.mesh.getScene(), this.settings.renderingGroupId);
        }
    }

    /** Scratch bounds, and what {@link measureSystems} measured. @internal */
    protected readonly boundsMin_ = new Vector3();
    /** See {@link boundsMin_}. @internal */
    protected readonly boundsMax_ = new Vector3();

    /**
     * Sets `mesh`'s bounds to the union of the world bounds of the systems from `from` to `to` among
     * those the batch draws this frame, so Babylon skips the draw when none of them is in view: the
     * batch mesh over the systems it draws, a run's mesh over its own. Called after each fill. A
     * draw whose systems have no measured bounds stays always drawn.
     */
    protected refreshBoundingInfo(
        mesh: AbstractMesh = this.mesh,
        from = 0,
        to: number = this.visibleSystems.length
    ): void {
        const measured = this.measureSystems(from, to);
        if (measured === 'unmeasured') {
            // Drawn but not measured: the mesh cannot be culled this frame.
            mesh.alwaysSelectAsActiveMesh = true;
            return;
        }
        if (measured === 'empty') {
            return;
        }
        this.writeBounds(mesh.getBoundingInfo());
        mesh.alwaysSelectAsActiveMesh = false;
    }

    /**
     * Measures the union of the world bounds of the drawing systems from `from` to `to` in
     * {@link visibleSystems} into {@link boundsMin_} and {@link boundsMax_}: `'empty'` when none
     * draws, `'unmeasured'` when one has no bounds yet.
     * @internal
     */
    protected measureSystems(from: number, to: number): 'measured' | 'empty' | 'unmeasured' {
        const min = this.boundsMin_;
        const max = this.boundsMax_;
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        let any = false;
        const systems = this.visibleSystems;
        for (let i = from; i < to; i++) {
            const system = systems[i] as ParticleSystem;
            if (system.particleNum === 0 || typeof system.getWorldBounds !== 'function') {
                continue;
            }
            if (!system.getWorldBounds(min, max)) {
                return 'unmeasured';
            }
            any = true;
            if (min.x < minX) minX = min.x;
            if (min.y < minY) minY = min.y;
            if (min.z < minZ) minZ = min.z;
            if (max.x > maxX) maxX = max.x;
            if (max.y > maxY) maxY = max.y;
            if (max.z > maxZ) maxZ = max.z;
        }
        if (!any) {
            return 'empty';
        }
        min.set(minX, minY, minZ);
        max.set(maxX, maxY, maxZ);
        return 'measured';
    }

    /** Writes the bounds {@link measureSystems} measured into `info`, when they changed. @internal */
    protected writeBounds(info: BoundingInfo): void {
        const min = this.boundsMin_;
        const max = this.boundsMax_;
        const bmin = info.minimum;
        const bmax = info.maximum;
        if (
            bmin.x !== min.x ||
            bmin.y !== min.y ||
            bmin.z !== min.z ||
            bmax.x !== max.x ||
            bmax.y !== max.y ||
            bmax.z !== max.z
        ) {
            bmin.set(min.x, min.y, min.z);
            bmax.set(max.x, max.y, max.z);
            info.reConstruct(bmin, bmax);
        }
    }

    /**
     * Writes a uniform that changes per bind, such as one read off the active camera, to the
     * material for the next bind and to its bound effect for this one: ShaderMaterial uploads its
     * stored values before the bind observers run, so a value written only to the material would
     * reach the GPU one draw late, and with two cameras it would always be the other camera's.
     */
    protected static writeBound(material: ShaderMaterial, write: (target: ShaderMaterial | Effect) => void): void {
        write(material);
        // An effect still compiling has no pipeline context to write to; it gets the stored value
        // when it is first bound. A sub mesh's effect override is not reached here.
        const effect = material.getEffect();
        if (effect?.isReady()) {
            write(effect);
        }
    }

    /**
     * The per-bind upload of the scene's current fog. Mode 0 (none) when the scene has fog
     * disabled, so toggling fog at runtime needs no recompile.
     * @internal
     */
    protected bindFog(material: ShaderMaterial): void {
        if (!this.settings.applyFog) {
            return;
        }
        const scene = this.scene;
        material.onBindObservable.add(() => {
            const effect = material.getEffect();
            if (!effect) {
                return;
            }
            const mode = scene.fogEnabled ? scene.fogMode : Scene.FOGMODE_NONE;
            effect.setFloat4('vFogInfos', mode, scene.fogStart, scene.fogEnd, scene.fogDensity);
            effect.setColor3('vFogColor', scene.fogColor);
        });
    }

    /** The observer of the scene's image processing that rebuilds the material when its defines change. */
    private imageProcessingObserver: Observer<ImageProcessingConfiguration> | null = null;

    /**
     * The scene's image processing as the material compiles it, see {@link ShaderContext.imageProcessing}:
     * null when the batch does not apply it.
     * @internal
     */
    protected imageProcessing(): ShaderImageProcessing | null {
        if (this.settings.applyImageProcessing === false) {
            return null;
        }
        const defines: ShaderImageProcessing = {
            IMAGEPROCESSING: false,
            WHITEBALANCE: false,
            VIGNETTE: false,
            VIGNETTEBLENDMODEMULTIPLY: false,
            VIGNETTEBLENDMODEOPAQUE: false,
            TONEMAPPING: 0,
            CONTRAST: false,
            EXPOSURE: false,
            COLORCURVES: false,
            COLORGRADING: false,
            COLORGRADING3D: false,
            SAMPLER3DGREENDEPTH: false,
            SAMPLER3DBGRMAP: false,
            DITHER: false,
            IMAGEPROCESSINGPOSTPROCESS: false,
            SKIPFINALCOLORCLAMP: false,
        };
        this.scene.imageProcessingConfiguration.prepareDefines(defines);
        return defines;
    }

    /**
     * Binds the scene's image processing to a material compiled with `compiled`: its values on every
     * bind, unless a post process applies them, and the material's defines, uniforms and samplers
     * swapped in place whenever the configuration changes what it has to compile (tone mapping
     * switched on, a vignette, a colour grading texture, a post process taking over). The material
     * stays the same one: a configuration that flips back and forth within a frame, as a reflection
     * probe rendering in linear space does, only switches between the effects the engine has
     * cached for each set of defines. A colour grading texture is set on the material too, so
     * that the batch, like Babylon's own materials, is not drawn before it has loaded.
     * @internal
     */
    protected bindImageProcessing(material: ShaderMaterial, compiled: ShaderImageProcessing | null): void {
        this.releaseImageProcessing();
        if (this.settings.applyImageProcessing === false) {
            return;
        }
        const config = this.scene.imageProcessingConfiguration;
        let current = compiled;
        let parts = imageProcessingParts(this.settings, current);
        let key = parts.defines.join('\n');
        const grading = () => {
            if (parts.samplers.includes('txColorTransform') && config.colorGradingTexture) {
                material.setTexture('txColorTransform', config.colorGradingTexture);
            } else {
                material.removeTexture('txColorTransform');
            }
        };
        grading();
        this.imageProcessingObserver = config.onUpdateParameters.add(() => {
            const next = this.imageProcessing();
            const nextParts = imageProcessingParts(this.settings, next);
            const nextKey = nextParts.defines.join('\n');
            if (nextKey !== key) {
                const options = material.options;
                swapEntries(options.defines as string[], parts.defines, nextParts.defines);
                swapEntries(options.uniforms, parts.uniforms, nextParts.uniforms);
                swapEntries(options.samplers, parts.samplers, nextParts.samplers);
                current = next;
                parts = nextParts;
                key = nextKey;
            }
            grading();
        });
        material.onBindObservable.add(() => {
            if (!current?.IMAGEPROCESSING || current.IMAGEPROCESSINGPOSTPROCESS || parts.defines.length === 0) {
                return;
            }
            const effect = material.getEffect();
            if (effect) {
                config.bind(effect);
            }
        });
    }

    /** Stops following the scene's image processing. @internal */
    protected releaseImageProcessing(): void {
        this.imageProcessingObserver?.remove();
        this.imageProcessingObserver = null;
    }

    /**
     * Seconds of renderer time, set by the renderer before each fill; what UV
     * and erosion mask scrolling advance by.
     */
    time = 0;

    /** True when a texture effect of this batch samples UV channel 1, see {@link UVChannel}. */
    protected usesUV1(): boolean {
        return readsUV1(this.settings);
    }

    /**
     * Sets the material colour, the texture effects' textures and constants, and advances their
     * scrolling on every bind.
     */
    protected bindSurface(material: ShaderMaterial): void {
        this.writeMaterialColor(material);
        const {mapUV, uvDistortion, gradientMap, erosion} = this.settings;
        if (uvDistortion?.map) {
            material.setTexture('distortionMap', uvDistortion.map);
        }
        if (gradientMap?.ramp) {
            material.setTexture('gradientMap', gradientMap.ramp);
        }
        if (erosion?.mask) {
            material.setTexture('erosionMask', erosion.mask);
        }
        this.writeSurfaceParams(material);
        if (!mapUV && !uvDistortion && !erosion?.mask && !gradientMap) {
            return;
        }
        // Wrapped on the CPU: a raw speed × time grows until float32 UVs lose their fraction.
        // Over two repeats, not one: a mirrored texture repeats every two, and
        // wrapped over one it jumped to its mirror image at every wrap.
        const wrap = (value: number) => value - 2 * Math.floor(value / 2);
        const mapTransform = new BVector4();
        const distortionTransform = new BVector4();
        const maskTransform = new BVector4();
        const gradientRange = new BVector2(0, 1);
        // Only the scroll is wrapped: an offset is kept as given, so a clamped
        // texture moved off its edge stays moved.
        const transform = (uv: TextureUV, time: number, out: BVector4) =>
            out.set(
                uv.tiling[0],
                uv.tiling[1],
                uv.offset[0] + wrap(uv.scroll[0] * time),
                uv.offset[1] + wrap(uv.scroll[1] * time)
            );
        // Written to the material for the next bind and to the bound effect for
        // this one: ShaderMaterial uploads its values before the bind observers run.
        // The layouts are read off the settings on every bind, so a live change
        // to a tiling or scroll reaches the next draw.
        const write = () => {
            const time = this.time;
            const effect = material.getEffect();
            const {mapUV, uvDistortion, gradientMap, erosion} = this.settings;
            if (mapUV) {
                transform(mapUV, time, mapTransform);
                material.setVector4('mapTransform', mapTransform);
                effect?.setVector4('mapTransform', mapTransform);
            }
            if (uvDistortion) {
                transform(uvDistortion.mapUV, time, distortionTransform);
                material.setVector4('distortionTransform', distortionTransform);
                effect?.setVector4('distortionTransform', distortionTransform);
            }
            if (erosion?.mask) {
                transform(erosion.maskUV, time, maskTransform);
                material.setVector4('erosionMaskTransform', maskTransform);
                effect?.setVector4('erosionMaskTransform', maskTransform);
            }
            if (gradientMap?.ramp) {
                // Texel centres of the first and last texel, so a repeating
                // ramp does not blend its two ends at black and white.
                const width = gradientMap.ramp.getSize().width;
                const half = width > 0 ? 0.5 / width : 0;
                gradientRange.set(half, 1 - half);
                material.setVector2('gradientMapRange', gradientRange);
                effect?.setVector2('gradientMapRange', gradientRange);
            }
        };
        write();
        material.onBindObservable.add(write);
    }

    /** Writes the material colour and its scale, see {@link VFXBatchSettings.materialColor}. */
    private writeMaterialColor(material: ShaderMaterial): void {
        const [r, g, b, a] = this.settings.materialColor;
        material.setVector4('materialColor', new BVector4(r, g, b, a));
        material.setFloat('materialColorScale', this.settings.materialColorScale);
    }

    /** Writes the texture effects' constants (the uniforms their live parameters set). */
    private writeSurfaceParams(material: ShaderMaterial): void {
        const {uvDistortion, gradientMap, erosion} = this.settings;
        if (uvDistortion?.map) {
            material.setFloat('distortionStrength', uvDistortion.strength);
        }
        if (gradientMap?.ramp) {
            const [r, g, b, a] = GRADIENT_MAP_WEIGHTS[gradientMap.channel];
            material.setVector4('gradientMapChannel', new BVector4(r, g, b, a));
        }
        if (erosion) {
            material.setVector2('erosionParams', new BVector2(erosion.softness, erosion.edgeWidth));
            material.setVector3(
                'erosionEdgeColor',
                new BVector3(erosion.edgeColor[0], erosion.edgeColor[1], erosion.edgeColor[2])
            );
        }
    }

    /**
     * Takes new live parameters (see {@link BatchedRenderer.updateSystem}): settings with the same
     * shader key as the batch's, whose uniform values differ. They are copied into the batch's
     * settings and written to its material, which is kept.
     * @internal
     */
    applyLiveSettings(settings: StoredBatchSettings): void {
        Object.assign(this.settings, settings);
        this.applySortingFudge();
        const material = this.mesh.material;
        if (material instanceof ShaderMaterial) {
            this.writeLiveUniforms(material);
        }
    }

    /**
     * Writes every uniform a live parameter sets, from the batch's settings. The base writes the
     * ones every render mode has; a mode adds its own.
     * @internal
     */
    protected writeLiveUniforms(material: ShaderMaterial): void {
        this.writeMaterialColor(material);
        this.writeSoftParams(material);
        this.writeSurfaceParams(material);
    }

    /** @internal */
    addSystem(system: IParticleSystem): void {
        this.systems.add(system);
    }

    /** @internal */
    removeSystem(system: IParticleSystem): void {
        this.systems.delete(system);
    }

    /**
     * Visible systems of this batch, written into a buffer owned by the batch.
     * Called once per frame per batch, so the result is reused rather than
     * reallocated; treat it as valid only until the next call.
     */
    getVisibleSystems(): IParticleSystem[] {
        const visibleSystems = this.visibleSystems;
        let count = 0;
        for (const system of this.systems) {
            // A culled system's particles are off every camera's screen; filling
            // them in would only cost the copy and widen the batch's bounds.
            if (system.emitter.visible && (system as ParticleSystem).culled !== true) {
                visibleSystems[count++] = system;
            }
        }
        visibleSystems.length = count;
        return visibleSystems;
    }

    /**
     * How many draws the coming fill makes: the runs of {@link visibleSystems} that the renderer's
     * back-to-front order of all its transparent systems puts one after another. Unity draws each
     * particle system as a renderer of its own, sorted back to front by the distance from the
     * camera to the centre of its bounds plus its sorting fudge, and draws consecutive renderers
     * of one material together. When a system of another batch comes between two of this batch's,
     * the batch draws twice: once under the other batch's system and once over it. A batch the
     * renderer has not ordered (it is not transparent, or there is no camera) is one run.
     * @internal
     */
    protected runCount = 0;
    /** For each run, the index into {@link visibleSystems} past its last system. @internal */
    protected readonly runEnds: number[] = [];
    /**
     * For each run, the sort key of its first system (see {@link drawKey}); NaN when the renderer
     * did not order the batch. @internal
     */
    protected readonly runKeys: number[] = [];
    /** For each run, its place in the renderer's order of draws this frame. @internal */
    protected readonly runSequences: number[] = [];
    /** Whether the renderer has set this frame's order, for the coming fill. */
    private ordered = false;

    /** Starts the renderer's order for the coming fill: no systems, no runs. @internal */
    beginDrawOrder(): void {
        this.visibleSystems.length = 0;
        this.runCount = 0;
        this.ordered = true;
    }

    /** Starts a run that comes `sequence`th in the renderer's order, its first system at `key`. @internal */
    startRun(key: number, sequence: number): void {
        const run = this.runCount++;
        this.runKeys[run] = key;
        this.runSequences[run] = sequence;
        this.runEnds[run] = this.visibleSystems.length;
    }

    /** Adds `system` to the run last started. @internal */
    addToRun(system: IParticleSystem): void {
        this.visibleSystems.push(system);
        this.runEnds[this.runCount - 1] = this.visibleSystems.length;
    }

    /** Adds a visible system with no particles, which draws nothing, after the runs. @internal */
    addIdle(system: IParticleSystem): void {
        this.visibleSystems.push(system);
    }

    /**
     * The systems to fill, in {@link visibleSystems}, with the runs they are drawn in: the
     * renderer's order when it set one for this fill, else every visible system as one run.
     * @internal
     */
    protected systemsToFill(): IParticleSystem[] {
        if (!this.ordered) {
            this.getVisibleSystems();
            this.runCount = 0;
        }
        this.ordered = false;
        const systems = this.visibleSystems;
        if (this.runCount === 0) {
            this.runCount = 1;
            this.runKeys[0] = NaN;
            this.runSequences[0] = 0;
        }
        // Systems without particles come after the last run's and draw nothing.
        this.runEnds[this.runCount - 1] = systems.length;
        return systems;
    }

    /**
     * The key `system` is sorted by among the renderer's transparent systems, back to front: the
     * distance from `eye` to the centre of its world bounds (where its emitter is until it has
     * any) plus the batch's sorting fudge.
     * @internal
     */
    drawKey(system: IParticleSystem, eye: BVector3): number {
        const centre = this.sortCentre(system as ParticleSystem, this.sortCentre_);
        const dx = centre.x - eye.x;
        const dy = centre.y - eye.y;
        const dz = centre.z - eye.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) + this.settings.sortingFudge;
    }

    private readonly sortCentre_ = new Vector3();

    /** The point `system` is sorted by, into `out`: the centre of its world bounds. @internal */
    protected sortCentre(system: ParticleSystem, out: Vector3): Vector3 {
        const min = this.boundsMin_;
        const max = this.boundsMax_;
        if (typeof system.getWorldBounds === 'function' && system.getWorldBounds(min, max)) {
            return out.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
        }
        const e = system.emitter.matrixWorld.elements;
        return out.set(e[12], e[13], e[14]);
    }

    /**
     * Sets the depth texture soft particles read. Soft particles are compiled in only while there
     * is one, as Unity turns them off for a camera without a depth texture, so attaching or
     * removing it, or changing how it is packed, rebuilds a soft batch's material.
     *
     * @param depth - The binding, or a bare texture, read as `'linear'` and unpacked.
     * @internal Use {@link BatchedRenderer.setDepthTexture}.
     */
    applyDepthTexture(depth: DepthBinding | BaseTexture | null): void {
        if (depth instanceof BaseTexture) {
            depth = {texture: depth, encoding: 'linear', packed: false};
        }
        const previous = this.depth;
        this.depth = depth;
        if (!this.settings.softParticles) {
            return;
        }
        if (!previous !== !depth || previous?.packed !== depth?.packed) {
            this.rebuildMaterial();
            return;
        }
        const material = this.mesh.material;
        if (depth && material instanceof ShaderMaterial) {
            material.setTexture('depthTexture', depth.texture);
        }
    }

    /**
     * Sets the soft-particle and alpha-test values on a material, and decodes the depth for the
     * camera of each draw.
     */
    protected bindSoft(material: ShaderMaterial): void {
        this.writeSoftParams(material);
        if (this.drawsSoft()) {
            material.setTexture('depthTexture', this.depth!.texture);
            // Reused across binds: this runs on every draw call.
            const projParams = new BVector4(1, 0, 0, 1);
            material.onBindObservable.add(() => {
                const camera = this.scene.activeCamera;
                if (camera && this.depth) {
                    softDepthParams(camera, this.depth.encoding, projParams);
                    VFXBatch.writeBound(material, (target) => target.setVector4('projParams', projParams));
                }
            });
        }
    }

    /** Writes the soft-particle fade and the alpha cutoff, the live parameters every mode shares. */
    private writeSoftParams(material: ShaderMaterial): void {
        if (this.drawsSoft()) {
            material.setVector2(
                'softParams',
                new BVector2(
                    this.settings.softNearFade,
                    1.0 / Math.max(this.settings.softFarFade - this.settings.softNearFade, 0.0001)
                )
            );
        }
        if (this.settings.materialAlphaTest > 0) {
            material.setFloat('alphaTest', this.settings.materialAlphaTest);
        }
    }

    /** True when this batch draws soft particles: they are on and a depth texture is attached. */
    protected drawsSoft(): boolean {
        return this.settings.softParticles && this.depth !== null;
    }

    /**
     * Sets the light `'fixed'` mesh particles are lit by. Batches that draw no meshes ignore it.
     * @internal Use {@link BatchedRenderer.setMeshLighting}.
     */
    applyMeshLighting(_lighting: MeshLightingSettings): void {}

    /** @internal */
    abstract setupBuffers(): void;
    /** @internal */
    abstract expandBuffers(target: number): void;

    /** Rebuilds the instance buffers at the current {@link maxParticles}, after a shrink. @internal */
    protected abstract resizeBuffers(): void;

    /** The capacity a batch starts with and never shrinks below. @internal */
    protected abstract readonly initialCapacity: number;

    /** Fills in a row that used under a quarter of the buffers. */
    private underusedFills = 0;

    /**
     * How many fills in a row a batch may use under a quarter of its buffers before it halves
     * them: about five seconds at 60 frames per second. A burst that grew the buffers does not
     * hold that memory for the rest of the session, and a batch whose count swings does not
     * reallocate every few frames.
     */
    static readonly SHRINK_AFTER_FILLS = 300;

    /**
     * Grows the buffers to hold `count`, or halves them once the batch has used under a quarter of
     * them for {@link SHRINK_AFTER_FILLS} fills, never below {@link initialCapacity}. Called by each
     * fill with what it is about to write. @internal
     */
    protected fitBuffers(count: number): void {
        if (count > this.maxParticles) {
            this.underusedFills = 0;
            this.expandBuffers(count);
            return;
        }
        if (this.maxParticles > this.initialCapacity && count < this.maxParticles / 4) {
            if (++this.underusedFills >= VFXBatch.SHRINK_AFTER_FILLS) {
                this.underusedFills = 0;
                this.maxParticles = Math.max(this.initialCapacity, this.maxParticles / 2);
                this.resizeBuffers();
            }
            return;
        }
        this.underusedFills = 0;
    }

    /** Instances the last fill drew, over all its draws; 0 for a batch that draws no instances. @internal */
    drawnInstances(): number {
        return this.mesh.forcedInstanceCount ?? 0;
    }

    /** @internal */
    abstract rebuildMaterial(): void;
    /** @internal */
    abstract update(): void;

    /** @internal */
    dispose(): void {
        this.releaseImageProcessing();
        this.mesh.dispose();
    }
}

/**
 * Replaces, in a material option list, the entries `previous` added with those of `next`: one
 * occurrence each, so an entry the rest of the program also lists is kept.
 */
function swapEntries(list: string[], previous: readonly string[], next: readonly string[]): void {
    for (const entry of previous) {
        const at = list.lastIndexOf(entry);
        if (at !== -1) {
            list.splice(at, 1);
        }
    }
    list.push(...next);
}
