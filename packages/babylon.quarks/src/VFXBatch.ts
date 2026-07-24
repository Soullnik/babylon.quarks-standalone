import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo';
import {Vector3 as BVector3, Matrix} from '@babylonjs/core/Maths/math.vector';
import {IParticleSystem} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';

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
    layerMask: number;
}

export abstract class VFXBatch {
    mesh: Mesh;
    systems: Set<IParticleSystem>;
    settings: StoredBatchSettings;
    protected maxParticles: number;
    protected scene: Scene;

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
            layerMask: settings.layerMask,
        };
        this.mesh = new Mesh('vfxBatch', scene);
        this.mesh.alwaysSelectAsActiveMesh = true;
    }

    addSystem(system: IParticleSystem) {
        this.systems.add(system);
    }

    removeSystem(system: IParticleSystem) {
        this.systems.delete(system);
    }

    getVisibleSystems(): IParticleSystem[] {
        const visibleSystems: IParticleSystem[] = [];
        for (const system of this.systems) {
            if (system.emitter.visible) {
                visibleSystems.push(system);
            }
        }
        return visibleSystems;
    }

    applyDepthTexture(depthTexture: BaseTexture | null): void {
        const material = this.mesh.material;
        if (material && material instanceof ShaderMaterial) {
            material.setTexture('depthTexture', depthTexture);
        }
    }

    private boundingInfo_ = new BoundingInfo(BVector3.Zero(), BVector3.Zero());
    private invWorld_ = Matrix.Identity();
    private boundsLocalMin_ = new BVector3();
    private boundsLocalMax_ = new BVector3();
    private boundsCorner_ = new BVector3();

    /**
     * Rebuilds the mesh's bounding info from a world-space AABB so Babylon's
     * transparent-mesh depth sort (distance to camera) reflects where the
     * instanced/generated geometry actually is, instead of the mesh's own
     * (near-empty) template geometry. Called once per batch per frame from
     * each subclass's update(), after it has walked every particle anyway to
     * fill vertex buffers — the min/max accumulation there is nearly free.
     */
    protected updateBoundingInfoFromWorldBounds(
        hasContent: boolean,
        minX: number, minY: number, minZ: number,
        maxX: number, maxY: number, maxZ: number
    ): void {
        const mesh = this.mesh;
        mesh.computeWorldMatrix(true);
        mesh.getWorldMatrix().invertToRef(this.invWorld_);

        if (!hasContent) {
            BVector3.TransformCoordinatesFromFloatsToRef(0, 0, 0, this.invWorld_, this.boundsLocalMin_);
            this.boundsLocalMax_.copyFrom(this.boundsLocalMin_);
        } else {
            this.boundsLocalMin_.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
            this.boundsLocalMax_.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
            // Transform the 8 corners of the world AABB into mesh-local space
            // and take their min/max — correct for any parent rotation/scale,
            // not just translation.
            for (let i = 0; i < 8; i++) {
                const x = i & 1 ? maxX : minX;
                const y = i & 2 ? maxY : minY;
                const z = i & 4 ? maxZ : minZ;
                BVector3.TransformCoordinatesFromFloatsToRef(x, y, z, this.invWorld_, this.boundsCorner_);
                this.boundsLocalMin_.minimizeInPlaceFromFloats(this.boundsCorner_.x, this.boundsCorner_.y, this.boundsCorner_.z);
                this.boundsLocalMax_.maximizeInPlaceFromFloats(this.boundsCorner_.x, this.boundsCorner_.y, this.boundsCorner_.z);
            }
        }

        this.boundingInfo_.reConstruct(this.boundsLocalMin_, this.boundsLocalMax_);
        mesh.setBoundingInfo(this.boundingInfo_);
        if (mesh.subMeshes) {
            const info = mesh.getBoundingInfo();
            for (const sub of mesh.subMeshes) {
                (sub as any)._boundingInfo = info;
            }
        }
    }

    abstract setupBuffers(): void;
    abstract expandBuffers(target: number): void;
    abstract rebuildMaterial(): void;
    abstract update(): void;

    dispose(): void {
        this.mesh.dispose();
    }
}
