import {Constants} from '@babylonjs/core/Engines/constants';
import type {ImageProcessingConfiguration} from '@babylonjs/core/Materials/imageProcessingConfiguration';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Vector4} from '@babylonjs/core/Maths/math.vector';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {Observer} from '@babylonjs/core/Misc/observable';
import {PrecisionDate} from '@babylonjs/core/Misc/precisionDate';
import {Scene} from '@babylonjs/core/scene';
import type {Nullable} from '@babylonjs/core/types';
import {IParticleSystem} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import type {MaterialGraph} from './materialGraph';

export enum RenderMode {
    BillBoard = 0,
    StretchedBillBoard = 1,
    Mesh = 2,
    Trail = 3,
    HorizontalBillBoard = 4,
    VerticalBillBoard = 5,
}

export interface StoredBatchSettings {
    instancingGeometry: Float32Array;
    instancingIndices: Uint32Array | Uint16Array;
    instancingUVs?: Float32Array;
    instancingNormals?: Float32Array;
    renderMode: RenderMode;
    renderOrder: number;
    uTileCount: number;
    vTileCount: number;
    blendTiles: boolean;
    softParticles: boolean;
    softNearFade: number;
    softFarFade: number;
    materialBlendMode: number;
    materialTransparent: boolean;
    materialDepthTest: boolean;
    materialDepthWrite: boolean;
    materialAlphaTest: number;
    texture: any;
    reflectionTexture: BaseTexture | null;
    reflectionLevel: number;
    reflectionFaces: BaseTexture[] | null;
    reflectionAtlas: BaseTexture | null;
    layerMask: number;
    stretchFreeform: boolean;
    materialTint: [number, number, number, number];
    vertexColorLinear: boolean;
    vertexAlphaSquared: boolean;
    meshAlignment: 'local' | 'world' | 'view';
    materialGraph: MaterialGraph | null;
}

export abstract class VFXBatch {
    /** Every mesh a batch has rendered through, so hosts can tell them from scene meshes. */
    private static readonly batchMeshes = new WeakSet<AbstractMesh>();

    /**
     * Whether `mesh` is one of the renderer's own batch meshes rather than a mesh in the scene —
     * known by identity, whatever the mesh happens to be called.
     */
    static isBatchMesh(mesh: AbstractMesh): boolean {
        return VFXBatch.batchMeshes.has(mesh);
    }

    mesh: Mesh;
    systems: Set<IParticleSystem>;
    settings: StoredBatchSettings;
    protected maxParticles: number;
    protected scene: Scene;
    private readonly visibleSystems: IParticleSystem[] = [];

    protected constructor(settings: VFXBatchSettings, scene: Scene) {
        this.scene = scene;
        this.maxParticles = 1000;
        this.systems = new Set<IParticleSystem>();
        this.settings = {
            instancingGeometry: settings.instancingGeometry,
            instancingIndices: settings.instancingIndices,
            instancingUVs: settings.instancingUVs,
            instancingNormals: settings.instancingNormals,
            renderMode: settings.renderMode,
            renderOrder: settings.renderOrder,
            uTileCount: settings.uTileCount,
            vTileCount: settings.vTileCount,
            blendTiles: settings.blendTiles,
            softParticles: settings.softParticles,
            softNearFade: settings.softNearFade,
            softFarFade: settings.softFarFade,
            materialBlendMode: settings.materialBlendMode,
            materialTransparent: settings.materialTransparent,
            materialDepthTest: settings.materialDepthTest,
            materialDepthWrite: settings.materialDepthWrite,
            materialAlphaTest: settings.materialAlphaTest,
            texture: settings.texture,
            reflectionTexture: settings.reflectionTexture ?? null,
            reflectionLevel: settings.reflectionLevel ?? 1,
            reflectionFaces: settings.reflectionFaces ?? null,
            reflectionAtlas: settings.reflectionAtlas ?? null,
            layerMask: settings.layerMask,
            stretchFreeform: settings.stretchFreeform ?? false,
            materialTint: settings.materialTint ? [...settings.materialTint] : [1, 1, 1, 1],
            vertexColorLinear: settings.vertexColorLinear ?? false,
            vertexAlphaSquared: settings.vertexAlphaSquared ?? false,
            meshAlignment: settings.meshAlignment ?? 'local',
            materialGraph: settings.materialGraph ?? null,
        };
        this.mesh = this.createBatchMesh('vfxBatch');
        this.imageProcessingObserver = scene.imageProcessingConfiguration.onUpdateParameters.add(() => {
            if (VFXBatch.outputsLinear(this.scene) !== this.linearOutput) {
                const previous = this.mesh.material;
                this.rebuildMaterial();
                if (previous && previous !== this.mesh.material) {
                    previous.dispose();
                }
            }
        });
    }

    /**
     * Whether particle colour should leave the shader in linear space: when the scene's image
     * processing runs as a post-process, which expects linear input and converts to gamma itself
     * (a DefaultRenderingPipeline with image processing on, say). Otherwise colours go out in
     * gamma space, as the canvas expects.
     */
    static outputsLinear(scene: Scene): boolean {
        const config = scene.imageProcessingConfiguration;
        return config.applyByPostProcess && config.isEnabled;
    }

    /** The colour-space state the current material was built for. */
    protected linearOutput = false;
    private imageProcessingObserver: Nullable<Observer<ImageProcessingConfiguration>>;

    /** Adds the tint and output colour-space defines and uniforms the fragment shaders share. */
    protected addColorDefines(defines: string[], uniforms: string[]): void {
        this.linearOutput = VFXBatch.outputsLinear(this.scene);
        if (this.linearOutput) {
            defines.push('LINEAR_OUTPUT');
        }
        if (this.hasTint()) {
            defines.push('USE_TINT');
            uniforms.push('tint');
        }
        if (this.settings.vertexColorLinear) {
            defines.push('LINEAR_VERTEX_COLOR');
        }
        if (this.settings.materialTransparent && this.settings.materialBlendMode === Constants.ALPHA_PREMULTIPLIED) {
            defines.push('PREMULTIPLY_VERTEX_ALPHA');
        }
        if (this.settings.vertexAlphaSquared) {
            defines.push('SQUARE_VERTEX_ALPHA');
        }
    }

    /** Sets the uniforms {@link addColorDefines} declared. */
    protected bindColorUniforms(material: ShaderMaterial): void {
        if (this.hasTint()) {
            const [r, g, b, a] = this.settings.materialTint;
            material.setVector4('tint', new Vector4(r, g, b, a));
        }
    }

    private hasTint(): boolean {
        const t = this.settings.materialTint;
        return t[0] !== 1 || t[1] !== 1 || t[2] !== 1 || t[3] !== 1;
    }

    /** Creates a mesh for this batch to render through and records it as a batch mesh. */
    protected createBatchMesh(name: string): Mesh {
        const mesh = new Mesh(name, this.scene);
        mesh.alwaysSelectAsActiveMesh = true;
        // The systems' layers: a camera draws the batch only when its layerMask shares a bit.
        mesh.layerMask = this.settings.layerMask;
        VFXBatch.batchMeshes.add(mesh);
        return mesh;
    }

    addSystem(system: IParticleSystem) {
        this.systems.add(system);
    }

    removeSystem(system: IParticleSystem) {
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
            if (system.emitter.visible) {
                visibleSystems[count++] = system;
            }
        }
        visibleSystems.length = count;
        return visibleSystems;
    }

    /** The scene depth the renderer handed over, for soft particles and material graphs. */
    protected depthTexture: BaseTexture | null = null;

    /** Seconds since the first material graph asked — the clock a graph's Time node reads. */
    static graphTime(): number {
        const now = PrecisionDate.Now / 1000;
        if (VFXBatch.graphClockStart < 0) VFXBatch.graphClockStart = now;
        return now - VFXBatch.graphClockStart;
    }

    private static graphClockStart = -1;

    applyDepthTexture(depthTexture: BaseTexture | null): void {
        this.depthTexture = depthTexture;
        const material = this.mesh.material;
        if (material && material instanceof ShaderMaterial) {
            material.setTexture('depthTexture', depthTexture);
        }
    }

    abstract setupBuffers(): void;
    abstract expandBuffers(target: number): void;
    abstract rebuildMaterial(): void;
    abstract update(): void;

    dispose(): void {
        this.scene.imageProcessingConfiguration.onUpdateParameters.remove(this.imageProcessingObserver);
        this.mesh.dispose();
    }
}
