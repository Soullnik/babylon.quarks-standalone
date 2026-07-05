import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Vector2 as BVector2} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Matrix4, Quaternion, RecordState, TrailParticle, Vector3} from 'quarks.core';
import {VFXBatch, RenderMode} from './VFXBatch';
import {VFXBatchSettings} from './BatchedRenderer';
import trail_vert from './shaders/trail_vert.glsl';
import trail_frag from './shaders/trail_frag.glsl';

export class TrailBatch extends VFXBatch {
    private positionBuffer!: Float32Array;
    private previousBuffer!: Float32Array;
    private nextBuffer!: Float32Array;
    private uvBuffer!: Float32Array;
    private sideBuffer!: Float32Array;
    private widthBuffer!: Float32Array;
    private colorBuffer!: Float32Array;
    private indexBuffer!: Uint32Array;
    private previousVB!: VertexBuffer;
    private nextVB!: VertexBuffer;
    private sideVB!: VertexBuffer;
    private widthVB!: VertexBuffer;

    private getTrailHistoryCount(particle: TrailParticle): number {
        const trailAny = particle as any;
        const fastHistoryCount = trailAny._trailHistoryCount;
        if (typeof fastHistoryCount === 'number') {
            return fastHistoryCount;
        }
        return particle.previous.length;
    }

    constructor(settings: VFXBatchSettings, scene: Scene) {
        super(settings, scene);
        this.maxParticles = 10000;
        this.setupBuffers();
        this.rebuildMaterial();
        this.mesh.setEnabled(false);
    }

    setupBuffers(): void {
        this.mesh.dispose();
        this.mesh = new Mesh('trailBatch', this.scene);
        this.mesh.alwaysSelectAsActiveMesh = true;

        this.positionBuffer = new Float32Array(this.maxParticles * 6);
        this.previousBuffer = new Float32Array(this.maxParticles * 6);
        this.nextBuffer = new Float32Array(this.maxParticles * 6);
        this.uvBuffer = new Float32Array(this.maxParticles * 4);
        this.sideBuffer = new Float32Array(this.maxParticles * 2);
        this.widthBuffer = new Float32Array(this.maxParticles * 2);
        this.colorBuffer = new Float32Array(this.maxParticles * 8);
        this.indexBuffer = new Uint32Array(this.maxParticles * 6);

        // Initialize with full-capacity buffers (updatable) and a dummy triangle
        this.positionBuffer[0] = 0; this.positionBuffer[1] = 0; this.positionBuffer[2] = 0;
        this.positionBuffer[3] = 1; this.positionBuffer[4] = 0; this.positionBuffer[5] = 0;
        this.positionBuffer[6] = 0; this.positionBuffer[7] = 1; this.positionBuffer[8] = 0;
        this.positionBuffer[9] = 1; this.positionBuffer[10] = 1; this.positionBuffer[11] = 0;
        this.indexBuffer[0] = 0; this.indexBuffer[1] = 1; this.indexBuffer[2] = 2;
        this.indexBuffer[3] = 1; this.indexBuffer[4] = 3; this.indexBuffer[5] = 2;

        // Set standard vertex data with full buffer capacity (updatable)
        this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positionBuffer, true);
        this.mesh.setVerticesData(VertexBuffer.UVKind, this.uvBuffer, true);
        this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colorBuffer, true, 4);
        this.mesh.setIndices(this.indexBuffer.subarray(0, 6), null, true);
        const engine = this.scene.getEngine();
        this.previousVB = new VertexBuffer(engine, this.previousBuffer, 'previous', true, false, 3, false);
        this.nextVB = new VertexBuffer(engine, this.nextBuffer, 'next', true, false, 3, false);
        this.sideVB = new VertexBuffer(engine, this.sideBuffer, 'side', true, false, 1, false);
        this.widthVB = new VertexBuffer(engine, this.widthBuffer, 'width', true, false, 1, false);
        this.mesh.setVerticesBuffer(this.previousVB);
        this.mesh.setVerticesBuffer(this.nextVB);
        this.mesh.setVerticesBuffer(this.sideVB);
        this.mesh.setVerticesBuffer(this.widthVB);

        // Disable bounding info recomputation
        this.mesh.doNotSyncBoundingInfo = true;
        const min = new BVector3(-10000, -10000, -10000);
        const max = new BVector3(10000, 10000, 10000);
        this.mesh.setBoundingInfo(new BoundingInfo(min, max));
        if (this.mesh.subMeshes) {
            for (const sub of this.mesh.subMeshes) {
                (sub as any)._boundingInfo = this.mesh.getBoundingInfo();
            }
        }

    }

    expandBuffers(target: number): void {
        while (target >= this.maxParticles) {
            this.maxParticles *= 2;
        }
        this.setupBuffers();
        this.rebuildMaterial();
    }

    private static nextMaterialId = 0;

    rebuildMaterial(): void {
        const shaderName = `quarksTrail_${TrailBatch.nextMaterialId++}`;
        const defines: string[] = [];

        if (this.settings.texture) {
            defines.push('USE_MAP');
        }

        Effect.ShadersStore[shaderName + 'VertexShader'] = trail_vert;
        Effect.ShadersStore[shaderName + 'FragmentShader'] = trail_frag;

        const attributes = ['position', 'previous', 'next', 'side', 'width', 'uv', 'color'];
        const uniforms = ['world', 'view', 'projection', 'worldViewProjection', 'lineWidth', 'resolution', 'sizeAttenuation'];
        const samplers: string[] = [];

        if (this.settings.texture) {
            samplers.push('map');
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
        const engine = this.scene.getEngine();
        mat.setFloat('lineWidth', 1);
        mat.setVector2('resolution', new BVector2(engine.getRenderWidth(), engine.getRenderHeight()));
        mat.setFloat('sizeAttenuation', 1);
        mat.onBindObservable.add(() => {
            const renderEngine = this.scene.getEngine();
            mat.setVector2('resolution', new BVector2(renderEngine.getRenderWidth(), renderEngine.getRenderHeight()));
        });

        mat.backFaceCulling = false;

        if (this.settings.materialTransparent) {
            mat.alphaMode = this.settings.materialBlendMode;
        } else {
            mat.alphaMode = Constants.ALPHA_DISABLE;
        }
        mat.needDepthPrePass = this.settings.materialDepthWrite;
        mat.forceDepthWrite = this.settings.materialDepthWrite;
        mat.disableDepthWrite = !this.settings.materialDepthWrite;

        const previous = this.mesh.material;
        this.mesh.material = mat;
        if (previous) {
            this.scene.onAfterRenderObservable.addOnce(() => previous.dispose());
        }
    }

    private vector_ = new Vector3();
    private vector2_ = new Vector3();
    private vector3_ = new Vector3();
    private quaternion_ = new Quaternion();

    update(): void {
        let index = 0;
        let triangles = 0;

        let particleCount = 0;
        const visibleSystems = this.getVisibleSystems();
        for (const system of visibleSystems) {
            for (let j = 0; j < system.particleNum; j++) {
                particleCount += this.getTrailHistoryCount(system.particles[j] as TrailParticle) * 2;
            }
        }
        if (particleCount > this.maxParticles) {
            this.expandBuffers(particleCount);
        }

        for (const system of visibleSystems) {
            // Ensure world matrix is up to date
            if ((system.emitter as any).computeWorldMatrix) {
                (system.emitter as any).computeWorldMatrix(true);
            }
            const rotation = this.quaternion_;
            const translation = this.vector2_;
            const scale = this.vector3_;
            system.emitter.matrixWorld.decompose(translation, rotation, scale);

            const particles = system.particles;
            const particleNum = system.particleNum;
            const uTileCount = this.settings.uTileCount;
            const vTileCount = this.settings.vTileCount;
            const tileWidth = 1 / uTileCount;
            const tileHeight = 1 / vTileCount;
            const systemWorldSpace = system.worldSpace;
            const objectScale = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;

            for (let j = 0; j < particleNum; j++) {
                const particle = particles[j] as TrailParticle;
                const particleAny = particle as any;
                const fastHistoryCount = particleAny._trailHistoryCount as number | undefined;
                const fastHistoryCapacity = particleAny._trailHistoryCapacity as number | undefined;
                const fastHistoryHead = particleAny._trailHistoryHead as number | undefined;
                const fastHistoryPositions = particleAny._trailHistoryPositions as Float32Array | undefined;
                const fastHistorySizes = particleAny._trailHistorySizes as Float32Array | undefined;
                const fastHistoryColors = particleAny._trailHistoryColors as Float32Array | undefined;
                const hasFastHistory =
                    typeof fastHistoryCount === 'number' &&
                    fastHistoryCount > 0 &&
                    typeof fastHistoryCapacity === 'number' &&
                    typeof fastHistoryHead === 'number' &&
                    fastHistoryPositions instanceof Float32Array &&
                    fastHistorySizes instanceof Float32Array &&
                    fastHistoryColors instanceof Float32Array;
                const historyCapacity = hasFastHistory ? (fastHistoryCapacity as number) : 0;
                const historyHead = hasFastHistory ? (fastHistoryHead as number) : 0;
                const historyPositions = fastHistoryPositions as Float32Array;
                const historySizes = fastHistorySizes as Float32Array;
                const historyColors = fastHistoryColors as Float32Array;
                const particleHistory = particle.previous;
                const particleHistoryLength = hasFastHistory ? fastHistoryCount : particleHistory.length;
                if (particleHistoryLength === 0) {
                    continue;
                }
                const col = particle.uvTile % vTileCount;
                const row = Math.floor(particle.uvTile / vTileCount + 0.001);
                const particleMatrix = particle.parentMatrix as unknown as Matrix4 | undefined;
                const matrixToUse = particleMatrix ?? system.emitter.matrixWorld;

                let previousNode = particleHistory.head;
                let currentNode = previousNode;
                let nextNode = currentNode?.next ?? currentNode;
                const oldestFastHistoryIndex = hasFastHistory
                    ? (historyHead - particleHistoryLength + historyCapacity) % historyCapacity
                    : 0;

                for (let i = 0; i < particleHistoryLength; i++, index += 2) {
                    let currentX: number;
                    let currentY: number;
                    let currentZ: number;
                    let currentSize: number;
                    let currentColorX: number;
                    let currentColorY: number;
                    let currentColorZ: number;
                    let currentColorW: number;
                    let previousX: number;
                    let previousY: number;
                    let previousZ: number;
                    let nextX: number;
                    let nextY: number;
                    let nextZ: number;

                    if (hasFastHistory) {
                        const currentHistoryIndex = (oldestFastHistoryIndex + i) % historyCapacity;
                        const previousHistoryIndex = i === 0 ? currentHistoryIndex : (oldestFastHistoryIndex + i - 1) % historyCapacity;
                        const nextHistoryIndex =
                            i + 1 < particleHistoryLength
                                ? (oldestFastHistoryIndex + i + 1) % historyCapacity
                                : currentHistoryIndex;

                        const currentPosIndex = currentHistoryIndex * 3;
                        const previousPosIndex = previousHistoryIndex * 3;
                        const nextPosIndex = nextHistoryIndex * 3;

                        currentX = historyPositions[currentPosIndex];
                        currentY = historyPositions[currentPosIndex + 1];
                        currentZ = historyPositions[currentPosIndex + 2];
                        previousX = historyPositions[previousPosIndex];
                        previousY = historyPositions[previousPosIndex + 1];
                        previousZ = historyPositions[previousPosIndex + 2];
                        nextX = historyPositions[nextPosIndex];
                        nextY = historyPositions[nextPosIndex + 1];
                        nextZ = historyPositions[nextPosIndex + 2];

                        currentSize = historySizes[currentHistoryIndex];
                        const currentColorIndex = currentHistoryIndex * 4;
                        currentColorX = historyColors[currentColorIndex];
                        currentColorY = historyColors[currentColorIndex + 1];
                        currentColorZ = historyColors[currentColorIndex + 2];
                        currentColorW = historyColors[currentColorIndex + 3];
                    } else {
                        const previous = previousNode!.data as RecordState;
                        const current = currentNode!.data as RecordState;
                        const next = nextNode!.data as RecordState;
                        currentX = current.position.x;
                        currentY = current.position.y;
                        currentZ = current.position.z;
                        previousX = previous.position.x;
                        previousY = previous.position.y;
                        previousZ = previous.position.z;
                        nextX = next.position.x;
                        nextY = next.position.y;
                        nextZ = next.position.z;
                        currentSize = current.size;
                        currentColorX = current.color.x;
                        currentColorY = current.color.y;
                        currentColorZ = current.color.z;
                        currentColorW = current.color.w;
                    }

                    if (!systemWorldSpace) {
                        this.vector_.set(currentX, currentY, currentZ).applyMatrix4(matrixToUse);
                        currentX = this.vector_.x;
                        currentY = this.vector_.y;
                        currentZ = this.vector_.z;
                        this.vector_.set(previousX, previousY, previousZ).applyMatrix4(matrixToUse);
                        previousX = this.vector_.x;
                        previousY = this.vector_.y;
                        previousZ = this.vector_.z;
                        this.vector_.set(nextX, nextY, nextZ).applyMatrix4(matrixToUse);
                        nextX = this.vector_.x;
                        nextY = this.vector_.y;
                        nextZ = this.vector_.z;
                    }

                    const pi = index * 3;
                    this.positionBuffer[pi] = currentX;
                    this.positionBuffer[pi + 1] = currentY;
                    this.positionBuffer[pi + 2] = currentZ;
                    this.positionBuffer[pi + 3] = currentX;
                    this.positionBuffer[pi + 4] = currentY;
                    this.positionBuffer[pi + 5] = currentZ;

                    this.previousBuffer[pi] = previousX;
                    this.previousBuffer[pi + 1] = previousY;
                    this.previousBuffer[pi + 2] = previousZ;
                    this.previousBuffer[pi + 3] = previousX;
                    this.previousBuffer[pi + 4] = previousY;
                    this.previousBuffer[pi + 5] = previousZ;

                    this.nextBuffer[pi] = nextX;
                    this.nextBuffer[pi + 1] = nextY;
                    this.nextBuffer[pi + 2] = nextZ;
                    this.nextBuffer[pi + 3] = nextX;
                    this.nextBuffer[pi + 4] = nextY;
                    this.nextBuffer[pi + 5] = nextZ;

                    this.sideBuffer[index] = 1;
                    this.sideBuffer[index + 1] = -1;

                    if (systemWorldSpace || particle.parentMatrix) {
                        this.widthBuffer[index] = currentSize;
                        this.widthBuffer[index + 1] = currentSize;
                    } else {
                        this.widthBuffer[index] = currentSize * objectScale;
                        this.widthBuffer[index + 1] = currentSize * objectScale;
                    }

                    const ui = index * 2;
                    this.uvBuffer[ui] = (i / particleHistoryLength + col) * tileWidth;
                    this.uvBuffer[ui + 1] = (vTileCount - row - 1) * tileHeight;
                    this.uvBuffer[ui + 2] = (i / particleHistoryLength + col) * tileWidth;
                    this.uvBuffer[ui + 3] = (vTileCount - row) * tileHeight;

                    const cci = index * 4;
                    this.colorBuffer[cci] = currentColorX;
                    this.colorBuffer[cci + 1] = currentColorY;
                    this.colorBuffer[cci + 2] = currentColorZ;
                    this.colorBuffer[cci + 3] = currentColorW;
                    this.colorBuffer[cci + 4] = currentColorX;
                    this.colorBuffer[cci + 5] = currentColorY;
                    this.colorBuffer[cci + 6] = currentColorZ;
                    this.colorBuffer[cci + 7] = currentColorW;

                    if (i + 1 < particleHistoryLength) {
                        this.indexBuffer[triangles * 3] = index;
                        this.indexBuffer[triangles * 3 + 1] = index + 1;
                        this.indexBuffer[triangles * 3 + 2] = index + 2;
                        triangles++;
                        this.indexBuffer[triangles * 3] = index + 2;
                        this.indexBuffer[triangles * 3 + 1] = index + 1;
                        this.indexBuffer[triangles * 3 + 2] = index + 3;
                        triangles++;
                    }

                    if (!hasFastHistory) {
                        previousNode = currentNode;
                        currentNode = nextNode;
                        nextNode = nextNode?.next ?? nextNode;
                    }
                }
            }
        }

        if (index > 0 && triangles > 0) {
            this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positionBuffer);
            this.mesh.updateVerticesData(VertexBuffer.UVKind, this.uvBuffer);
            this.mesh.updateIndices(this.indexBuffer.subarray(0, triangles * 3));
            this.previousVB.update(this.previousBuffer);
            this.nextVB.update(this.nextBuffer);
            this.sideVB.update(this.sideBuffer);
            this.widthVB.update(this.widthBuffer);

            const colorVB = this.mesh.getVertexBuffer(VertexBuffer.ColorKind);
            if (colorVB) colorVB.update(this.colorBuffer);

            this.mesh.setEnabled(true);
            if (this.mesh.subMeshes && this.mesh.subMeshes.length > 0) {
                const meshBoundingInfo = this.mesh.getBoundingInfo();
                for (const subMesh of this.mesh.subMeshes) {
                    (subMesh as any)._boundingInfo = meshBoundingInfo;
                }
                this.mesh.subMeshes[0].indexCount = triangles * 3;
                this.mesh.subMeshes[0].verticesCount = index;
            }
        } else {
            this.mesh.setEnabled(false);
        }
    }

    dispose(): void {
        if (this.mesh.material) {
            this.mesh.material.dispose();
        }
        super.dispose();
    }
}
