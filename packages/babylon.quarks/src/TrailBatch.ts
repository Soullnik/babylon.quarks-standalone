import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Vector2 as BVector2} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {IParticleSystem, Matrix4, Quaternion, TrailParticle, TrailSettings, Vector3} from 'quarks.core';
import {VFXBatch, RenderMode} from './VFXBatch';
import {VFXBatchSettings} from './BatchedRenderer';
import trail_vert from './shaders/trail_vert.glsl';
import trail_frag from './shaders/trail_frag.glsl';
import trail_vert_wgsl from './shaders/trail_vert.wgsl';
import trail_frag_wgsl from './shaders/trail_frag.wgsl';
import {registerShaders, shaderLanguageFor} from './shaders/shaderLanguageSupport';

export class TrailBatch extends VFXBatch {
    private positionBuffer!: Float32Array;
    private previousBuffer!: Float32Array;
    private nextBuffer!: Float32Array;
    private uvBuffer!: Float32Array;
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

    constructor(settings: VFXBatchSettings, scene: Scene) {
        super(settings, scene);
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
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.buildGeometryBuffers();
    }

    private buildGeometryBuffers(): void {
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
        const defines: string[] = [];

        if (this.settings.texture) {
            defines.push('USE_MAP');
        }

        const shaderLanguage = shaderLanguageFor(this.scene.getEngine());
        registerShaders(
            shaderName,
            {glsl: trail_vert, wgsl: trail_vert_wgsl},
            {glsl: trail_frag, wgsl: trail_frag_wgsl},
            shaderLanguage
        );

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
                mat.setVector2('resolution', resolution);
            }
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

        this.mesh.material = mat;
    }

    private vector_ = new Vector3();
    private vector2_ = new Vector3();
    private vector3_ = new Vector3();
    private quaternion_ = new Quaternion();

    /** Forces the emitter's world matrix to be current before sampling it. */
    private static ensureWorldMatrix(system: IParticleSystem): void {
        const emitter = system.emitter as {computeWorldMatrix?: (force: boolean) => void};
        if (emitter.computeWorldMatrix) {
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
            for (let j = 0; j < system.particleNum; j++) {
                const historyCount = (particles[j] as TrailParticle).historyCount;
                if (historyCount === 0) {
                    continue;
                }
                // +2 reserves the live tip vertex pair that frames between
                // simulation steps append ahead of the recorded head.
                particleCount += historyCount * 2 + 2;
            }
        }
        if (particleCount > this.maxParticles) {
            this.expandBuffers(particleCount);
        }

        for (let s = 0; s < visibleSystems.length; s++) {
            const system = visibleSystems[s];
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
            const residual = (system.rendererEmitterSettings as TrailSettings).followLocalOrigin
                ? 0
                : (system.simulationResidual ?? 0);
            // Measured from the step the particle just took, not from its
            // velocity: a trail pulled along by an orbit or by a plugin's own
            // behavior has motion no velocity term describes.
            const stepFraction = residual === 0 ? 0 : residual / (system.simulationStep ?? residual);

            for (let j = 0; j < particleNum; j++) {
                const particle = particles[j] as TrailParticle;
                const particleHistoryLength = particle.historyCount;
                if (particleHistoryLength === 0) {
                    continue;
                }
                const historyCapacity = particle.historyCapacity;
                const historyPositions = particle.historyPositions;
                const historySizes = particle.historySizes;
                const historyColors = particle.historyColors;
                const col = particle.uvTile % vTileCount;
                const row = Math.floor(particle.uvTile / vTileCount + 0.001);
                const particleMatrix = particle.parentMatrix as unknown as Matrix4 | undefined;
                const me = (particleMatrix ?? emitterMatrix).elements;
                const m00 = me[0], m01 = me[1], m02 = me[2], m03 = me[3];
                const m10 = me[4], m11 = me[5], m12 = me[6], m13 = me[7];
                const m20 = me[8], m21 = me[9], m22 = me[10], m23 = me[11];
                const m30 = me[12], m31 = me[13], m32 = me[14], m33 = me[15];
                const invHistoryLength = 1 / particleHistoryLength;

                // Walk the ring buffer oldest-first with hand-rolled wrapping so the
                // inner loop stays free of modulo operations.
                let currentSlot = particle.getHistoryIndex(0);
                let previousSlot = currentSlot;

                for (let i = 0; i < particleHistoryLength; i++, index += 2) {
                    const nextSlot =
                        i + 1 < particleHistoryLength
                            ? currentSlot + 1 === historyCapacity
                                ? 0
                                : currentSlot + 1
                            : currentSlot;

                    const currentPosIndex = currentSlot * 3;
                    const previousPosIndex = previousSlot * 3;
                    const nextPosIndex = nextSlot * 3;

                    let currentX = historyPositions[currentPosIndex];
                    let currentY = historyPositions[currentPosIndex + 1];
                    let currentZ = historyPositions[currentPosIndex + 2];
                    let previousX = historyPositions[previousPosIndex];
                    let previousY = historyPositions[previousPosIndex + 1];
                    let previousZ = historyPositions[previousPosIndex + 2];
                    let nextX = historyPositions[nextPosIndex];
                    let nextY = historyPositions[nextPosIndex + 1];
                    let nextZ = historyPositions[nextPosIndex + 2];

                    const currentSize = historySizes[currentSlot];
                    const currentColorIndex = currentSlot * 4;
                    const currentColorX = historyColors[currentColorIndex];
                    const currentColorY = historyColors[currentColorIndex + 1];
                    const currentColorZ = historyColors[currentColorIndex + 2];
                    const currentColorW = historyColors[currentColorIndex + 3];

                    previousSlot = currentSlot;
                    currentSlot = nextSlot;

                    if (!systemWorldSpace) {
                        // Inlined point transforms — three per trail sample.
                        let w = 1 / (m03 * currentX + m13 * currentY + m23 * currentZ + m33);
                        let tx = (m00 * currentX + m10 * currentY + m20 * currentZ + m30) * w;
                        let ty = (m01 * currentX + m11 * currentY + m21 * currentZ + m31) * w;
                        currentZ = (m02 * currentX + m12 * currentY + m22 * currentZ + m32) * w;
                        currentX = tx;
                        currentY = ty;

                        w = 1 / (m03 * previousX + m13 * previousY + m23 * previousZ + m33);
                        tx = (m00 * previousX + m10 * previousY + m20 * previousZ + m30) * w;
                        ty = (m01 * previousX + m11 * previousY + m21 * previousZ + m31) * w;
                        previousZ = (m02 * previousX + m12 * previousY + m22 * previousZ + m32) * w;
                        previousX = tx;
                        previousY = ty;

                        w = 1 / (m03 * nextX + m13 * nextY + m23 * nextZ + m33);
                        tx = (m00 * nextX + m10 * nextY + m20 * nextZ + m30) * w;
                        ty = (m01 * nextX + m11 * nextY + m21 * nextZ + m31) * w;
                        nextZ = (m02 * nextX + m12 * nextY + m22 * nextZ + m32) * w;
                        nextX = tx;
                        nextY = ty;
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
                    const u = (i * invHistoryLength + col) * tileWidth;
                    this.uvBuffer[ui] = u;
                    this.uvBuffer[ui + 1] = (vTileCount - row - 1) * tileHeight;
                    this.uvBuffer[ui + 2] = u;
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
                }

                // Live tip: same place a sprite would be drawn this frame, past
                // the last recorded sample. The recorded ribbon stays put.
                if (stepFraction !== 0) {
                    const previousHead = particle.previousPosition;
                    const position = particle.position;
                    let tipX = position.x + (position.x - previousHead.x) * stepFraction;
                    let tipY = position.y + (position.y - previousHead.y) * stepFraction;
                    let tipZ = position.z + (position.z - previousHead.z) * stepFraction;
                    const headIndex = index - 2;
                    let headX = this.positionBuffer[headIndex * 3];
                    let headY = this.positionBuffer[headIndex * 3 + 1];
                    let headZ = this.positionBuffer[headIndex * 3 + 2];

                    if (!systemWorldSpace) {
                        const w = 1 / (m03 * tipX + m13 * tipY + m23 * tipZ + m33);
                        const tx = (m00 * tipX + m10 * tipY + m20 * tipZ + m30) * w;
                        const ty = (m01 * tipX + m11 * tipY + m21 * tipZ + m31) * w;
                        tipZ = (m02 * tipX + m12 * tipY + m22 * tipZ + m32) * w;
                        tipX = tx;
                        tipY = ty;
                    }

                    const tipPi = index * 3;
                    this.positionBuffer[tipPi] = tipX;
                    this.positionBuffer[tipPi + 1] = tipY;
                    this.positionBuffer[tipPi + 2] = tipZ;
                    this.positionBuffer[tipPi + 3] = tipX;
                    this.positionBuffer[tipPi + 4] = tipY;
                    this.positionBuffer[tipPi + 5] = tipZ;

                    this.previousBuffer[tipPi] = headX;
                    this.previousBuffer[tipPi + 1] = headY;
                    this.previousBuffer[tipPi + 2] = headZ;
                    this.previousBuffer[tipPi + 3] = headX;
                    this.previousBuffer[tipPi + 4] = headY;
                    this.previousBuffer[tipPi + 5] = headZ;

                    this.nextBuffer[tipPi] = tipX;
                    this.nextBuffer[tipPi + 1] = tipY;
                    this.nextBuffer[tipPi + 2] = tipZ;
                    this.nextBuffer[tipPi + 3] = tipX;
                    this.nextBuffer[tipPi + 4] = tipY;
                    this.nextBuffer[tipPi + 5] = tipZ;

                    // The recorded head's `next` was itself; point it at the tip
                    // so the shader builds the live segment from one version of
                    // each endpoint.
                    const headPi = headIndex * 3;
                    this.nextBuffer[headPi] = tipX;
                    this.nextBuffer[headPi + 1] = tipY;
                    this.nextBuffer[headPi + 2] = tipZ;
                    this.nextBuffer[headPi + 3] = tipX;
                    this.nextBuffer[headPi + 4] = tipY;
                    this.nextBuffer[headPi + 5] = tipZ;

                    this.sideBuffer[index] = 1;
                    this.sideBuffer[index + 1] = -1;

                    const tipSize = particle.size.x;
                    if (systemWorldSpace || particle.parentMatrix) {
                        this.widthBuffer[index] = tipSize;
                        this.widthBuffer[index + 1] = tipSize;
                    } else {
                        this.widthBuffer[index] = tipSize * objectScale;
                        this.widthBuffer[index + 1] = tipSize * objectScale;
                    }

                    const tipUi = index * 2;
                    const tipU = (1 + col) * tileWidth;
                    this.uvBuffer[tipUi] = tipU;
                    this.uvBuffer[tipUi + 1] = (vTileCount - row - 1) * tileHeight;
                    this.uvBuffer[tipUi + 2] = tipU;
                    this.uvBuffer[tipUi + 3] = (vTileCount - row) * tileHeight;

                    const tipColor = particle.color;
                    const tipCi = index * 4;
                    this.colorBuffer[tipCi] = tipColor.x;
                    this.colorBuffer[tipCi + 1] = tipColor.y;
                    this.colorBuffer[tipCi + 2] = tipColor.z;
                    this.colorBuffer[tipCi + 3] = tipColor.w;
                    this.colorBuffer[tipCi + 4] = tipColor.x;
                    this.colorBuffer[tipCi + 5] = tipColor.y;
                    this.colorBuffer[tipCi + 6] = tipColor.z;
                    this.colorBuffer[tipCi + 7] = tipColor.w;

                    this.indexBuffer[triangles * 3] = headIndex;
                    this.indexBuffer[triangles * 3 + 1] = headIndex + 1;
                    this.indexBuffer[triangles * 3 + 2] = index;
                    triangles++;
                    this.indexBuffer[triangles * 3] = index;
                    this.indexBuffer[triangles * 3 + 1] = headIndex + 1;
                    this.indexBuffer[triangles * 3 + 2] = index + 1;
                    triangles++;

                    index += 2;
                }
            }
        }

        this.uploadGeometry(index, triangles);
    }

    /**
     * Uploads the vertex data written by `update` and resizes the sub mesh.
     *
     * Split out of `update` on purpose: the Babylon mesh/sub-mesh plumbing here
     * runs a handful of times per frame, and folding it into the per-vertex loop
     * costs that loop its optimised code.
     */
    private uploadGeometry(index: number, triangles: number): void {
        if (index > 0 && triangles > 0) {
            // Upload only the vertices written this frame; the buffers are sized for
            // the high-water mark of every system in the batch.
            this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positionBuffer.subarray(0, index * 3));
            this.mesh.updateVerticesData(VertexBuffer.UVKind, this.uvBuffer.subarray(0, index * 2));
            this.mesh.updateIndices(this.indexBuffer.subarray(0, triangles * 3));
            this.previousVB.update(this.previousBuffer.subarray(0, index * 3));
            this.nextVB.update(this.nextBuffer.subarray(0, index * 3));
            this.sideVB.update(this.sideBuffer.subarray(0, index));
            this.widthVB.update(this.widthBuffer.subarray(0, index));

            const colorVB = this.mesh.getVertexBuffer(VertexBuffer.ColorKind);
            if (colorVB) colorVB.update(this.colorBuffer.subarray(0, index * 4));

            if (this.mesh.subMeshes && this.mesh.subMeshes.length > 0) {
                this.adoptMeshBounds();
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
                this.mesh.updateIndices(this.indexBuffer.subarray(0, 6));
                this.adoptMeshBounds();
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
