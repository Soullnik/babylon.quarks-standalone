import {Scene} from '@babylonjs/core/scene';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Constants} from '@babylonjs/core/Engines/constants';
import {
    AxisAngleGenerator,
    ColorGenerator,
    ColorGeneratorFromJSON,
    ConstantColor,
    ConstantValue,
    FunctionColorGenerator,
    FunctionJSON,
    FunctionValueGenerator,
    GeneratorFromJSON,
    ValueGenerator,
    ValueGeneratorFromJSON,
    Behavior,
    BehaviorFromJSON,
    Particle,
    SpriteParticle,
    TrailParticle,
    EmitterFromJSON,
    EmitterShape,
    SphereEmitter,
    RendererEmitterSettings,
    RotationGenerator,
    IParticleSystem,
    EmissionState,
    GeneratorMemory,
    TrailSettings,
    StretchedBillBoardSettings,
    SerializationOptions,
    Vector3,
    Vector4,
    Matrix3,
    Matrix4,
    Quaternion,
    Vector3Generator,
    ParticleSystemEvent,
    ParticleSystemEventType,
} from 'quarks.core';
import {ParticleEmitter} from './ParticleEmitter';
import {RenderMode} from './VFXBatch';
import {BatchedRenderer, VFXBatchSettings} from './BatchedRenderer';

export interface BurstParameters {
    time: number;
    count: ValueGenerator | FunctionValueGenerator;
    cycle: number;
    interval: number;
    probability: number;
}

const UP = new Vector3(0, 0, 1);
const tempQ = new Quaternion();
const tempV = new Vector3();
const tempV2 = new Vector3();
const PREWARM_FPS = 60;

const DEFAULT_POSITIONS = new Float32Array([
    -0.5, -0.5, 0,
     0.5, -0.5, 0,
     0.5,  0.5, 0,
    -0.5,  0.5, 0,
]);
const DEFAULT_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const DEFAULT_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);

export interface ParticleSystemParameters {
    autoDestroy?: boolean;
    looping?: boolean;
    prewarm?: boolean;
    duration?: number;
    shape?: EmitterShape;
    startLife?: ValueGenerator | FunctionValueGenerator;
    startSpeed?: ValueGenerator | FunctionValueGenerator;
    startRotation?: ValueGenerator | FunctionValueGenerator | RotationGenerator;
    startSize?: ValueGenerator | FunctionValueGenerator | Vector3Generator;
    startLength?: ValueGenerator | FunctionValueGenerator;
    startColor?: ColorGenerator | FunctionColorGenerator;
    emissionOverTime?: ValueGenerator | FunctionValueGenerator;
    emissionOverDistance?: ValueGenerator | FunctionValueGenerator;
    emissionBursts?: Array<BurstParameters>;
    onlyUsedByOther?: boolean;
    behaviors?: Array<Behavior>;
    instancingGeometry?: Float32Array;
    instancingIndices?: Uint32Array | Uint16Array;
    instancingUVs?: Float32Array;
    instancingNormals?: Float32Array;
    renderMode?: RenderMode;
    rendererEmitterSettings?: RendererEmitterSettings;
    speedFactor?: number;
    material?: any;
    texture?: Texture | null;
    startTileIndex?: ValueGenerator;
    uTileCount?: number;
    vTileCount?: number;
    blendTiles?: boolean;
    softParticles?: boolean;
    softFarFade?: number;
    softNearFade?: number;
    renderOrder?: number;
    worldSpace?: boolean;
    blendMode?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    alphaTest?: number;
    layerMask?: number;
    scene?: Scene;
}

export interface BurstParametersJSON {
    time: number;
    count: FunctionJSON | number;
    cycle: number;
    interval: number;
    probability: number;
}

export interface ParticleSystemJSONParameters {
    version: string;
    autoDestroy: boolean;
    looping: boolean;
    prewarm: boolean;
    duration: number;
    shape: any;
    startLife: FunctionJSON;
    startSpeed: FunctionJSON;
    startRotation: FunctionJSON;
    startSize: FunctionJSON;
    startColor: FunctionJSON;
    emissionOverTime: FunctionJSON;
    emissionOverDistance: FunctionJSON;
    emissionBursts?: Array<BurstParametersJSON>;
    onlyUsedByOther: boolean;
    rendererEmitterSettings: RendererEmitterSettings;
    instancingGeometry?: any;
    renderMode: number;
    renderOrder?: number;
    speedFactor?: number;
    texture?: string;
    material?: string;
    layers?: number;
    startTileIndex: FunctionJSON | number;
    uTileCount: number;
    vTileCount: number;
    blendTiles?: boolean;
    softParticles?: boolean;
    softFarFade?: number;
    softNearFade?: number;
    blending?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    alphaTest?: number;
    behaviors: Array<any>;
    worldSpace: boolean;
}

export interface BabylonMetaData {
    textures: {[uuid: string]: Texture | null};
    materials: {[uuid: string]: any};
    geometries: {[uuid: string]: any};
    images?: {[uuid: string]: any};
    shapes?: {[uuid: string]: any};
    skeletons?: {[uuid: string]: any};
    animations?: {[uuid: string]: any};
    nodes?: {[uuid: string]: any};
}

export class ParticleSystem implements IParticleSystem {
    private static serializationCounter = 0;

    autoDestroy: boolean;
    prewarm: boolean;
    looping: boolean;
    duration: number;
    startLife: ValueGenerator | FunctionValueGenerator;
    startSpeed: ValueGenerator | FunctionValueGenerator;
    startRotation: ValueGenerator | FunctionValueGenerator | RotationGenerator;
    startSize: ValueGenerator | FunctionValueGenerator | Vector3Generator;
    startColor: ColorGenerator | FunctionColorGenerator;
    startTileIndex: ValueGenerator;
    rendererEmitterSettings: RendererEmitterSettings;
    emissionOverTime: ValueGenerator | FunctionValueGenerator;
    emissionOverDistance: ValueGenerator | FunctionValueGenerator;
    emissionBursts: Array<BurstParameters>;
    onlyUsedByOther: boolean;
    worldSpace: boolean;
    particleNum: number;
    paused: boolean;
    particles: Array<Particle>;
    emitterShape: EmitterShape;
    emitter: ParticleEmitter;
    rendererSettings: VFXBatchSettings;
    neededToUpdateRender: boolean;
    behaviors: Array<Behavior>;
    emissionState: EmissionState;

    private prewarmed: boolean;
    private emitEnded: boolean;
    private markForDestroy: boolean;
    private temp: Vector3 = new Vector3();
    private normalMatrix: Matrix3 = new Matrix3();
    private memory: GeneratorMemory = [];
    private listeners: {[event: string]: Array<(event: ParticleSystemEvent) => void>} = {};
    private readonly layerMaskProxy: {mask: number};
    private materialRef: any = null;
    /** @internal **/
    _renderer?: BatchedRenderer;

    set time(time: number) {
        this.emissionState.time = time;
    }

    get time(): number {
        return this.emissionState.time;
    }

    get layers() {
        return this.layerMaskProxy;
    }

    get texture() {
        return this.rendererSettings.texture;
    }

    set texture(texture: Texture | null) {
        this.rendererSettings.texture = texture;
        this.neededToUpdateRender = true;
    }

    get material() {
        return this.materialRef;
    }

    set material(material: any) {
        this.materialRef = material;
        this.applyMaterialSettings(material);
    }

    get uTileCount() {
        return this.rendererSettings.uTileCount;
    }

    set uTileCount(u: number) {
        this.rendererSettings.uTileCount = u;
        this.neededToUpdateRender = true;
    }

    get vTileCount() {
        return this.rendererSettings.vTileCount;
    }

    set vTileCount(v: number) {
        this.rendererSettings.vTileCount = v;
        this.neededToUpdateRender = true;
    }

    get blendTiles() {
        return this.rendererSettings.blendTiles;
    }

    set blendTiles(v: boolean) {
        this.rendererSettings.blendTiles = v;
        this.neededToUpdateRender = true;
    }

    get softParticles() {
        return this.rendererSettings.softParticles;
    }

    set softParticles(v: boolean) {
        this.rendererSettings.softParticles = v;
        this.neededToUpdateRender = true;
    }

    get softNearFade() {
        return this.rendererSettings.softNearFade;
    }

    set softNearFade(v: number) {
        this.rendererSettings.softNearFade = v;
        this.neededToUpdateRender = true;
    }

    get softFarFade() {
        return this.rendererSettings.softFarFade;
    }

    set softFarFade(v: number) {
        this.rendererSettings.softFarFade = v;
        this.neededToUpdateRender = true;
    }

    get instancingGeometry(): Float32Array {
        return this.rendererSettings.instancingGeometry;
    }

    set instancingGeometry(geometry: Float32Array) {
        this.restart();
        this.particles.length = 0;
        this.rendererSettings.instancingGeometry = geometry;
        this.neededToUpdateRender = true;
    }

    get blending() {
        return this.rendererSettings.materialBlendMode;
    }

    set blending(blending: number) {
        this.rendererSettings.materialBlendMode = blending;
        this.neededToUpdateRender = true;
    }

    get renderMode(): RenderMode {
        return this.rendererSettings.renderMode;
    }

    set renderMode(renderMode: RenderMode) {
        if (this.rendererSettings.renderMode !== renderMode) {
            let needRestart = false;
            if (this.rendererSettings.renderMode === RenderMode.Trail) {
                needRestart = true;
            }
            if (this.rendererSettings.renderMode === RenderMode.Mesh) {
                this.startRotation = new ConstantValue(0);
            }
            switch (renderMode) {
                case RenderMode.Trail:
                    this.rendererEmitterSettings = {startLength: new ConstantValue(30), followLocalOrigin: false};
                    needRestart = true;
                    break;
                case RenderMode.Mesh:
                    this.rendererEmitterSettings = {};
                    this.startRotation = new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(0));
                    break;
                case RenderMode.StretchedBillBoard:
                    this.rendererEmitterSettings = {speedFactor: 0, lengthFactor: 2};
                    break;
                case RenderMode.BillBoard:
                case RenderMode.VerticalBillBoard:
                case RenderMode.HorizontalBillBoard:
                    this.rendererEmitterSettings = {};
                    break;
            }
            this.rendererSettings.renderMode = renderMode;
            if (needRestart) {
                this.restart();
                this.particles.length = 0;
            }
            this.neededToUpdateRender = true;
        }
    }

    get renderOrder(): number {
        return this.rendererSettings.renderOrder;
    }

    set renderOrder(renderOrder: number) {
        this.rendererSettings.renderOrder = renderOrder;
        this.neededToUpdateRender = true;
    }

    constructor(parameters: ParticleSystemParameters) {
        this.layerMaskProxy = {mask: parameters.layerMask ?? 0x0FFFFFFF};
        Object.defineProperty(this.layerMaskProxy, 'mask', {
            enumerable: true,
            get: () => this.rendererSettings.layerMask,
            set: (mask: number) => {
                this.rendererSettings.layerMask = mask;
                this.neededToUpdateRender = true;
            },
        });

        this.autoDestroy = parameters.autoDestroy ?? false;
        this.duration = parameters.duration ?? 1;
        this.looping = parameters.looping ?? true;
        this.prewarm = parameters.prewarm ?? false;
        this.startLife = parameters.startLife ?? new ConstantValue(5);
        this.startSpeed = parameters.startSpeed ?? new ConstantValue(0);
        this.startRotation = parameters.startRotation ?? new ConstantValue(0);
        this.startSize = parameters.startSize ?? new ConstantValue(1);
        this.startColor = parameters.startColor ?? new ConstantColor(new Vector4(1, 1, 1, 1));
        this.emissionOverTime = parameters.emissionOverTime ?? new ConstantValue(10);
        this.emissionOverDistance = parameters.emissionOverDistance ?? new ConstantValue(0);
        this.emissionBursts = parameters.emissionBursts ?? [];
        this.onlyUsedByOther = parameters.onlyUsedByOther ?? false;
        this.emitterShape = parameters.shape ?? new SphereEmitter();
        this.behaviors = parameters.behaviors ?? [];
        this.worldSpace = parameters.worldSpace ?? false;
        this.rendererEmitterSettings = parameters.rendererEmitterSettings ?? {};

        if (parameters.renderMode === RenderMode.StretchedBillBoard) {
            const settings = this.rendererEmitterSettings as StretchedBillBoardSettings;
            if (parameters.speedFactor !== undefined) {
                settings.speedFactor = parameters.speedFactor;
            }
            settings.speedFactor = settings.speedFactor ?? 0;
            settings.lengthFactor = settings.lengthFactor ?? 0;
        }

        this.rendererSettings = {
            instancingGeometry: parameters.instancingGeometry ?? DEFAULT_POSITIONS,
            instancingIndices: parameters.instancingIndices ?? DEFAULT_INDICES,
            instancingUVs: parameters.instancingUVs ?? DEFAULT_UVS,
            instancingNormals: parameters.instancingNormals,
            renderMode: parameters.renderMode ?? RenderMode.BillBoard,
            renderOrder: parameters.renderOrder ?? 0,
            uTileCount: parameters.uTileCount ?? 1,
            vTileCount: parameters.vTileCount ?? 1,
            blendTiles: parameters.blendTiles ?? false,
            softParticles: parameters.softParticles ?? false,
            softNearFade: parameters.softNearFade ?? 0,
            softFarFade: parameters.softFarFade ?? 0,
            materialBlendMode: parameters.blendMode ?? Constants.ALPHA_ADD,
            materialTransparent: parameters.transparent ?? true,
            materialDepthTest: parameters.depthTest ?? true,
            materialDepthWrite: parameters.depthWrite ?? false,
            materialAlphaTest: parameters.alphaTest ?? 0,
            texture: parameters.texture ?? null,
            layerMask: parameters.layerMask ?? 0x0FFFFFFF,
        };
        if (this.rendererSettings.renderMode === RenderMode.Mesh && !this.rendererSettings.instancingNormals) {
            this.rendererSettings.instancingNormals = ParticleSystem.createFallbackNormals(this.rendererSettings.instancingGeometry);
        }

        this.materialRef = parameters.material ?? null;
        this.applyMaterialSettings(this.materialRef, {
            blendMode: parameters.blendMode,
            transparent: parameters.transparent,
            depthTest: parameters.depthTest,
            depthWrite: parameters.depthWrite,
            alphaTest: parameters.alphaTest,
            texture: parameters.texture,
            layerMask: parameters.layerMask,
        });
        this.neededToUpdateRender = true;

        this.particles = [];
        this.startTileIndex = parameters.startTileIndex || new ConstantValue(0);
        this.emitter = new ParticleEmitter(this, parameters.scene);

        this.paused = false;
        this.particleNum = 0;
        this.emissionState = {
            isBursting: false,
            burstParticleIndex: 0,
            burstParticleCount: 0,
            burstIndex: 0,
            burstWaveIndex: 0,
            time: 0,
            waitEmiting: 0,
            travelDistance: 0,
        };

        this.emissionBursts.forEach((burst) => burst.count.startGen(this.memory));
        this.emissionOverDistance.startGen(this.memory);

        this.emitEnded = false;
        this.markForDestroy = false;
        this.prewarmed = false;
    }

    private applyMaterialSettings(
        material: any,
        overrides: {
            blendMode?: number;
            transparent?: boolean;
            depthTest?: boolean;
            depthWrite?: boolean;
            alphaTest?: number;
            texture?: Texture | null;
            layerMask?: number;
        } = {}
    ) {
        if (!this.rendererSettings) {
            return;
        }

        const resolvedTexture =
            overrides.texture !== undefined
                ? overrides.texture
                : (material?.albedoTexture ??
                    material?.diffuseTexture ??
                    material?.emissiveTexture ??
                    material?.opacityTexture ??
                    material?.baseTexture ??
                    this.rendererSettings.texture ??
                    null);
        const resolvedBlendMode =
            overrides.blendMode ??
            (typeof material?.alphaMode === 'number' ? material.alphaMode : this.rendererSettings.materialBlendMode);
        const resolvedTransparent =
            overrides.transparent ??
            (typeof material?.needAlphaBlending === 'function'
                ? material.needAlphaBlending()
                : typeof material?.alpha === 'number'
                    ? material.alpha < 1
                    : this.rendererSettings.materialTransparent);
        const resolvedDepthTest =
            overrides.depthTest ??
            (typeof material?.disableDepthTest === 'boolean'
                ? !material.disableDepthTest
                : this.rendererSettings.materialDepthTest);
        const resolvedDepthWrite =
            overrides.depthWrite ??
            (typeof material?.disableDepthWrite === 'boolean'
                ? !material.disableDepthWrite
                : typeof material?.forceDepthWrite === 'boolean'
                    ? material.forceDepthWrite
                    : this.rendererSettings.materialDepthWrite);
        const resolvedAlphaTest =
            overrides.alphaTest ??
            (typeof material?.alphaCutOff === 'number'
                ? material.alphaCutOff
                : typeof material?.alphaCutOffValue === 'number'
                    ? material.alphaCutOffValue
                    : this.rendererSettings.materialAlphaTest);

        this.rendererSettings.texture = resolvedTexture;
        this.rendererSettings.materialBlendMode = resolvedBlendMode;
        this.rendererSettings.materialTransparent = resolvedTransparent;
        this.rendererSettings.materialDepthTest = resolvedDepthTest;
        this.rendererSettings.materialDepthWrite = resolvedDepthWrite;
        this.rendererSettings.materialAlphaTest = resolvedAlphaTest;
        if (overrides.layerMask !== undefined) {
            this.rendererSettings.layerMask = overrides.layerMask;
        }
        this.neededToUpdateRender = true;
    }

    pause() { this.paused = true; }
    play() { this.paused = false; }
    stop() { this.restart(); this.pause(); }

    private spawn(count: number, emissionState: EmissionState, matrix: Matrix4) {
        tempQ.setFromRotationMatrix(matrix);
        const translation = tempV;
        const scale = tempV2;
        matrix.decompose(translation, tempQ, scale);

        for (let i = 0; i < count; i++) {
            emissionState.burstParticleIndex = i;
            this.particleNum++;
            while (this.particles.length < this.particleNum) {
                if (this.rendererSettings.renderMode === RenderMode.Trail) {
                    this.particles.push(new TrailParticle());
                } else {
                    this.particles.push(new SpriteParticle());
                }
            }
            const particle = this.particles[this.particleNum - 1];
            particle.reset();
            particle.speedModifier = 1;
            this.startColor.startGen(particle.memory);
            this.startColor.genColor(particle.memory, particle.startColor, this.emissionState.time);
            particle.color.copy(particle.startColor);
            this.startSpeed.startGen(particle.memory);
            particle.startSpeed = this.startSpeed.genValue(particle.memory, emissionState.time / this.duration);
            this.startLife.startGen(particle.memory);
            particle.life = this.startLife.genValue(particle.memory, emissionState.time / this.duration);
            particle.age = 0;
            this.startSize.startGen(particle.memory);
            if (this.startSize.type === 'vec3function') {
                (this.startSize as Vector3Generator).genValue(particle.memory, particle.startSize, emissionState.time / this.duration);
            } else {
                const size = (this.startSize as FunctionValueGenerator).genValue(particle.memory, emissionState.time / this.duration);
                particle.startSize.set(size, size, size);
            }
            this.startTileIndex.startGen(particle.memory);
            particle.uvTile = this.startTileIndex.genValue(particle.memory);
            particle.size.copy(particle.startSize);

            if (
                this.rendererSettings.renderMode === RenderMode.Mesh ||
                this.rendererSettings.renderMode === RenderMode.BillBoard ||
                this.rendererSettings.renderMode === RenderMode.VerticalBillBoard ||
                this.rendererSettings.renderMode === RenderMode.HorizontalBillBoard ||
                this.rendererSettings.renderMode === RenderMode.StretchedBillBoard
            ) {
                const sprite = particle as SpriteParticle;
                this.startRotation.startGen(particle.memory);
                if (this.rendererSettings.renderMode === RenderMode.Mesh) {
                    if (!(sprite.rotation instanceof Quaternion)) {
                        sprite.rotation = new Quaternion();
                    }
                    if (this.startRotation.type === 'rotation') {
                        this.startRotation.genValue(particle.memory, sprite.rotation as Quaternion, 1, emissionState.time / this.duration);
                    } else {
                        (sprite.rotation as Quaternion).setFromAxisAngle(UP, this.startRotation.genValue(sprite.memory, emissionState.time / this.duration));
                    }
                } else {
                    if (this.startRotation.type === 'rotation') {
                        sprite.rotation = 0;
                    } else {
                        sprite.rotation = this.startRotation.genValue(sprite.memory, emissionState.time / this.duration);
                    }
                }
            } else if (this.rendererSettings.renderMode === RenderMode.Trail) {
                const trail = particle as TrailParticle;
                (this.rendererEmitterSettings as TrailSettings).startLength.startGen(trail.memory);
                trail.length = (this.rendererEmitterSettings as TrailSettings).startLength.genValue(trail.memory, emissionState.time / this.duration);
            }

            this.emitterShape.initialize(particle, emissionState);

            if (this.rendererSettings.renderMode === RenderMode.Trail && (this.rendererEmitterSettings as TrailSettings).followLocalOrigin) {
                const trail = particle as TrailParticle;
                trail.localPosition = new Vector3().copy(trail.position);
            }

            if (this.worldSpace) {
                particle.position.applyMatrix4(matrix);
                particle.startSize.multiply(scale).abs();
                particle.size.copy(particle.startSize);
                particle.velocity.multiply(scale).applyMatrix3(this.normalMatrix);
                if (particle.rotation && particle.rotation instanceof Quaternion) {
                    particle.rotation.multiplyQuaternions(tempQ, particle.rotation);
                }
            } else {
                if (this.onlyUsedByOther) {
                    particle.parentMatrix = matrix;
                }
            }

            for (let j = 0; j < this.behaviors.length; j++) {
                this.behaviors[j].initialize(particle, this);
            }
        }
    }

    endEmit() {
        this.emitEnded = true;
        if (this.autoDestroy) {
            this.markForDestroy = true;
        }
        this.fire({type: 'emitEnd', particleSystem: this});
    }

    dispose() {
        if (this._renderer) this._renderer.deleteSystem(this);
        this.emitter.dispose();
        this.fire({type: 'destroy', particleSystem: this});
    }

    restart() {
        this.memory.length = 0;
        this.paused = false;
        this.particleNum = 0;
        this.emissionState.isBursting = false;
        this.emissionState.burstIndex = 0;
        this.emissionState.burstWaveIndex = 0;
        this.emissionState.time = 0;
        this.emissionState.waitEmiting = 0;
        this.behaviors.forEach((behavior) => behavior.reset());
        this.emitEnded = false;
        this.markForDestroy = false;
        this.prewarmed = false;
        this.emissionBursts.forEach((burst) => burst.count.startGen(this.memory));
        this.emissionOverDistance.startGen(this.memory);
    }

    private firstTimeUpdate = true;

    /** @internal */
    update(delta: number) {
        if (this.paused) return;

        if (this.firstTimeUpdate) {
            this.firstTimeUpdate = false;
            this.emitter.computeWorldMatrix(true);
        }

        if (this.emitEnded && this.particleNum === 0) {
            if (this.markForDestroy) this.dispose();
            return;
        }

        if (this.looping && this.prewarm && !this.prewarmed) {
            this.prewarmed = true;
            for (let i = 0; i < this.duration * PREWARM_FPS; i++) {
                this.update(1.0 / PREWARM_FPS);
            }
        }

        if (delta > 0.1) {
            delta = 0.1;
        }

        if (this.neededToUpdateRender) {
            if (this._renderer) this._renderer.updateSystem(this);
            this.neededToUpdateRender = false;
        }

        if (!this.onlyUsedByOther) {
            this.emit(delta, this.emissionState, this.emitter.matrixWorld);
        }

        this.emitterShape.update(this, delta);
        for (let j = 0; j < this.behaviors.length; j++) {
            this.behaviors[j].frameUpdate(delta);
            for (let i = 0; i < this.particleNum; i++) {
                if (!this.particles[i].died) {
                    this.behaviors[j].update(this.particles[i], delta);
                }
            }
        }

        for (let i = 0; i < this.particleNum; i++) {
            if (
                (this.rendererEmitterSettings as TrailSettings).followLocalOrigin &&
                (this.particles[i] as TrailParticle).localPosition
            ) {
                this.particles[i].position.copy((this.particles[i] as TrailParticle).localPosition!);
                if (this.particles[i].parentMatrix) {
                    this.particles[i].position.applyMatrix4(this.particles[i].parentMatrix!);
                } else {
                    this.particles[i].position.applyMatrix4(this.emitter.matrixWorld);
                }
            } else {
                this.particles[i].position.addScaledVector(this.particles[i].velocity, delta * this.particles[i].speedModifier);
            }
            this.particles[i].age += delta;
        }

        if (this.rendererSettings.renderMode === RenderMode.Trail) {
            for (let i = 0; i < this.particleNum; i++) {
                (this.particles[i] as TrailParticle).update();
            }
        }

        for (let i = 0; i < this.particleNum; i++) {
            const particle = this.particles[i];
            if (particle.died && (!(particle instanceof TrailParticle) || particle.previous.length === 0)) {
                this.particles[i] = this.particles[this.particleNum - 1];
                this.particles[this.particleNum - 1] = particle;
                this.particleNum--;
                i--;
                this.fire({type: 'particleDied', particleSystem: this, particle: particle});
            }
        }
    }

    emit(delta: number, emissionState: EmissionState, emitterMatrix: Matrix4) {
        if (emissionState.time > this.duration) {
            if (this.looping) {
                emissionState.time -= this.duration;
                emissionState.burstIndex = 0;
                this.behaviors.forEach((behavior) => behavior.reset());
            } else {
                if (!this.emitEnded && !this.onlyUsedByOther) {
                    this.endEmit();
                }
            }
        }

        this.normalMatrix.getNormalMatrix(emitterMatrix);

        const totalSpawn = Math.ceil(emissionState.waitEmiting);
        this.spawn(totalSpawn, emissionState, emitterMatrix);
        emissionState.waitEmiting -= totalSpawn;

        while (
            emissionState.burstIndex < this.emissionBursts.length &&
            this.emissionBursts[emissionState.burstIndex].time <= emissionState.time
        ) {
            if (Math.random() < this.emissionBursts[emissionState.burstIndex].probability) {
                const count = this.emissionBursts[emissionState.burstIndex].count.genValue(this.memory, this.time);
                emissionState.isBursting = true;
                emissionState.burstParticleCount = count;
                this.spawn(count, emissionState, emitterMatrix);
                emissionState.isBursting = false;
            }
            emissionState.burstIndex++;
        }

        if (!this.emitEnded) {
            emissionState.waitEmiting += delta * this.emissionOverTime.genValue(this.memory, emissionState.time / this.duration);

            if (emissionState.previousWorldPos != undefined) {
                this.temp.set(emitterMatrix.elements[12], emitterMatrix.elements[13], emitterMatrix.elements[14]);
                emissionState.travelDistance += emissionState.previousWorldPos.distanceTo(this.temp);
                const emitPerMeter = this.emissionOverDistance.genValue(this.memory, emissionState.time / this.duration);
                if (emissionState.travelDistance * emitPerMeter > 0) {
                    const count = Math.floor(emissionState.travelDistance * emitPerMeter);
                    emissionState.travelDistance -= count / emitPerMeter;
                    emissionState.waitEmiting += count;
                }
            }
        }
        if (emissionState.previousWorldPos === undefined) emissionState.previousWorldPos = new Vector3();
        emissionState.previousWorldPos.set(emitterMatrix.elements[12], emitterMatrix.elements[13], emitterMatrix.elements[14]);
        emissionState.time += delta;
    }

    toJSON(metaData?: BabylonMetaData | string, _options: SerializationOptions = {}): ParticleSystemJSONParameters {
        const isRootObject = metaData === undefined || typeof metaData === 'string';
        const meta: BabylonMetaData = isRootObject
            ? {
                geometries: {},
                materials: {},
                textures: {},
                images: {},
                shapes: {},
                skeletons: {},
                animations: {},
                nodes: {},
            }
            : metaData;

        const geometryUUID = this.ensureGeometryMeta(meta);
        const materialUUID = this.ensureMaterialMeta(meta);
        const rendererEmitterSettingsJSON = this.toRendererSettingsJSON();

        return {
            version: '3.0',
            autoDestroy: this.autoDestroy,
            looping: this.looping,
            prewarm: this.prewarm,
            duration: this.duration,
            shape: this.emitterShape.toJSON(),
            startLife: this.startLife.toJSON(),
            startSpeed: this.startSpeed.toJSON(),
            startRotation: this.startRotation.toJSON(),
            startSize: this.startSize.toJSON(),
            startColor: this.startColor.toJSON(),
            emissionOverTime: this.emissionOverTime.toJSON(),
            emissionOverDistance: this.emissionOverDistance.toJSON(),
            emissionBursts: this.emissionBursts.map((burst) => ({
                time: burst.time,
                count: burst.count.toJSON(),
                probability: burst.probability,
                interval: burst.interval,
                cycle: burst.cycle,
            })),
            onlyUsedByOther: this.onlyUsedByOther,
            instancingGeometry: geometryUUID,
            renderMode: this.renderMode,
            renderOrder: this.renderOrder,
            rendererEmitterSettings: rendererEmitterSettingsJSON,
            material: materialUUID,
            layers: this.rendererSettings.layerMask,
            startTileIndex: this.startTileIndex.toJSON(),
            uTileCount: this.rendererSettings.uTileCount,
            vTileCount: this.rendererSettings.vTileCount,
            blendTiles: this.rendererSettings.blendTiles,
            softParticles: this.rendererSettings.softParticles,
            softFarFade: this.rendererSettings.softFarFade,
            softNearFade: this.rendererSettings.softNearFade,
            blending: this.rendererSettings.materialBlendMode,
            transparent: this.rendererSettings.materialTransparent,
            depthTest: this.rendererSettings.materialDepthTest,
            depthWrite: this.rendererSettings.materialDepthWrite,
            alphaTest: this.rendererSettings.materialAlphaTest,
            behaviors: this.behaviors.map((b) => b.toJSON()),
            worldSpace: this.worldSpace,
        };
    }

    static fromJSON(
        json: ParticleSystemJSONParameters,
        meta: BabylonMetaData,
        dependencies: {[uuid: string]: Behavior} = {},
        scene?: Scene
    ): ParticleSystem {
        const shape = EmitterFromJSON(json.shape, meta as any);
        let rendererEmitterSettings: RendererEmitterSettings;
        if (json.renderMode === RenderMode.Trail) {
            const trailSettings = json.rendererEmitterSettings as TrailSettings;
            rendererEmitterSettings = {
                startLength:
                    trailSettings?.startLength !== undefined
                        ? ValueGeneratorFromJSON(trailSettings.startLength)
                        : new ConstantValue(30),
                followLocalOrigin: trailSettings?.followLocalOrigin ?? false,
            };
        } else if (json.renderMode === RenderMode.StretchedBillBoard) {
            rendererEmitterSettings = {...(json.rendererEmitterSettings ?? {})};
            if (json.speedFactor !== undefined) {
                (rendererEmitterSettings as StretchedBillBoardSettings).speedFactor = json.speedFactor;
            }
        } else {
            rendererEmitterSettings = {};
        }

        const materialMeta = json.material ? meta.materials?.[json.material] : undefined;
        const materialTextureRef = materialMeta?.texture ?? json.texture;
        const texture =
            typeof materialTextureRef === 'string'
                ? meta.textures?.[materialTextureRef] ?? null
                : materialTextureRef ?? null;
        const resolvedGeometryEntry =
            typeof json.instancingGeometry === 'string'
                ? meta.geometries?.[json.instancingGeometry]
                : json.instancingGeometry;
        const resolvedGeometry = ParticleSystem.resolveGeometryData(resolvedGeometryEntry);

        const ps = new ParticleSystem({
            scene,
            autoDestroy: json.autoDestroy,
            looping: json.looping,
            prewarm: json.prewarm,
            duration: json.duration,
            shape,
            startLife: ValueGeneratorFromJSON(json.startLife),
            startSpeed: ValueGeneratorFromJSON(json.startSpeed),
            startRotation: GeneratorFromJSON(json.startRotation) as RotationGenerator | ValueGenerator | FunctionValueGenerator,
            startSize: GeneratorFromJSON(json.startSize) as Vector3Generator | ValueGenerator | FunctionValueGenerator,
            startColor: ColorGeneratorFromJSON(json.startColor) as ColorGenerator,
            emissionOverTime: ValueGeneratorFromJSON(json.emissionOverTime),
            emissionOverDistance: ValueGeneratorFromJSON(json.emissionOverDistance),
            emissionBursts: json.emissionBursts?.map((burst: any) => ({
                time: burst.time,
                count: typeof burst.count === 'number' ? new ConstantValue(burst.count) : ValueGeneratorFromJSON(burst.count),
                probability: burst.probability ?? 1,
                interval: burst.interval ?? 0.1,
                cycle: burst.cycle ?? burst.cycleCount ?? 1,
            })),
            onlyUsedByOther: json.onlyUsedByOther,
            instancingGeometry: resolvedGeometry.positions,
            instancingIndices: resolvedGeometry.indices,
            instancingUVs: resolvedGeometry.uvs,
            instancingNormals: resolvedGeometry.normals,
            renderMode: json.renderMode,
            rendererEmitterSettings,
            renderOrder: json.renderOrder,
            texture,
            material: materialMeta?.sourceMaterial,
            blendMode: materialMeta?.alphaMode ?? json.blending ?? Constants.ALPHA_ADD,
            transparent: materialMeta?.transparent ?? json.transparent ?? true,
            depthTest: materialMeta?.depthTest ?? json.depthTest ?? true,
            depthWrite: materialMeta?.depthWrite ?? json.depthWrite ?? false,
            alphaTest: materialMeta?.alphaTest ?? json.alphaTest ?? 0,
            startTileIndex:
                typeof json.startTileIndex === 'number'
                    ? new ConstantValue(json.startTileIndex)
                    : (ValueGeneratorFromJSON(json.startTileIndex) as ValueGenerator),
            uTileCount: json.uTileCount,
            vTileCount: json.vTileCount,
            blendTiles: json.blendTiles,
            softParticles: json.softParticles,
            softFarFade: json.softFarFade,
            softNearFade: json.softNearFade,
            behaviors: [],
            worldSpace: json.worldSpace,
            layerMask: json.layers,
        });
        ps.behaviors = (json.behaviors ?? [])
            .map((behaviorJson) => {
                const behavior = BehaviorFromJSON(behaviorJson, ps);
                if (behavior && behavior.type === 'EmitSubParticleSystem') {
                    dependencies[(behaviorJson as any).subParticleSystem] = behavior;
                }
                return behavior;
            })
            .filter((behavior) => behavior !== null) as Behavior[];
        return ps;
    }

    private static nextSerializationId(prefix: string): string {
        ParticleSystem.serializationCounter += 1;
        return `${prefix}_${ParticleSystem.serializationCounter}`;
    }

    private static createFallbackNormals(positions: Float32Array): Float32Array {
        const normals = new Float32Array(positions.length);
        for (let i = 0; i < normals.length; i += 3) {
            normals[i] = 0;
            normals[i + 1] = 0;
            normals[i + 2] = 1;
        }
        return normals;
    }

    private toRendererSettingsJSON(): RendererEmitterSettings {
        if (this.renderMode === RenderMode.Trail) {
            return {
                startLength: (this.rendererEmitterSettings as TrailSettings).startLength.toJSON(),
                followLocalOrigin: (this.rendererEmitterSettings as TrailSettings).followLocalOrigin,
            };
        }
        if (this.renderMode === RenderMode.StretchedBillBoard) {
            return {
                speedFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor,
                lengthFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor,
            };
        }
        return {};
    }

    private ensureGeometryMeta(meta: BabylonMetaData): string {
        const geometryUUID = ParticleSystem.nextSerializationId('quarks_geometry');
        meta.geometries[geometryUUID] = {
            uuid: geometryUUID,
            type: 'QuarksGeometry',
            positions: Array.from(this.rendererSettings.instancingGeometry),
            indices: Array.from(this.rendererSettings.instancingIndices),
            uvs: this.rendererSettings.instancingUVs ? Array.from(this.rendererSettings.instancingUVs) : undefined,
            normals: this.rendererSettings.instancingNormals ? Array.from(this.rendererSettings.instancingNormals) : undefined,
        };
        return geometryUUID;
    }

    private ensureMaterialMeta(meta: BabylonMetaData): string {
        const texture = this.rendererSettings.texture;
        let textureUUID: string | undefined;
        if (texture) {
            textureUUID = ParticleSystem.nextSerializationId('quarks_texture');
            meta.textures[textureUUID] = texture;
        }

        const materialUUID = ParticleSystem.nextSerializationId('quarks_material');
        meta.materials[materialUUID] = {
            uuid: materialUUID,
            type: 'QuarksMaterial',
            transparent: this.rendererSettings.materialTransparent,
            alphaMode: this.rendererSettings.materialBlendMode,
            depthTest: this.rendererSettings.materialDepthTest,
            depthWrite: this.rendererSettings.materialDepthWrite,
            alphaTest: this.rendererSettings.materialAlphaTest,
            texture: textureUUID,
            sourceMaterial: this.materialRef ?? undefined,
        };
        return materialUUID;
    }

    private static resolveGeometryData(entry: any): {
        positions: Float32Array;
        indices: Uint32Array | Uint16Array;
        uvs?: Float32Array;
        normals?: Float32Array;
    } {
        if (entry?.positions && entry?.indices) {
            return {
                positions: entry.positions instanceof Float32Array ? entry.positions : new Float32Array(entry.positions),
                indices:
                    entry.indices instanceof Uint16Array || entry.indices instanceof Uint32Array
                        ? entry.indices
                        : new Uint32Array(entry.indices),
                uvs: entry.uvs
                    ? entry.uvs instanceof Float32Array
                        ? entry.uvs
                        : new Float32Array(entry.uvs)
                    : undefined,
                normals: entry.normals
                    ? entry.normals instanceof Float32Array
                        ? entry.normals
                        : new Float32Array(entry.normals)
                    : undefined,
            };
        }

        const data = entry?.data ?? entry;
        if (data?.attributes?.position?.array && data?.index?.array) {
            const indexType = data.index.type === 'Uint16Array' ? Uint16Array : Uint32Array;
            return {
                positions: new Float32Array(data.attributes.position.array),
                indices: new indexType(data.index.array),
                uvs: data.attributes.uv?.array ? new Float32Array(data.attributes.uv.array) : undefined,
                normals: data.attributes.normal?.array ? new Float32Array(data.attributes.normal.array) : undefined,
            };
        }

        return {
            positions: DEFAULT_POSITIONS,
            indices: DEFAULT_INDICES,
            uvs: DEFAULT_UVS,
        };
    }

    addBehavior(behavior: Behavior) {
        this.behaviors.push(behavior);
    }

    getRendererSettings(): VFXBatchSettings {
        return this.rendererSettings;
    }

    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    removeAllEventListeners(event: ParticleSystemEventType): void {
        if (this.listeners[event]) this.listeners[event] = [];
    }

    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        if (this.listeners[event]) {
            const index = this.listeners[event].indexOf(callback);
            if (index !== -1) this.listeners[event].splice(index, 1);
        }
    }

    private fire(event: ParticleSystemEvent) {
        if (this.listeners[event.type]) {
            this.listeners[event.type].forEach((callback) => callback(event));
        }
    }

    clone(): ParticleSystem {
        const newBehaviors: Array<Behavior> = this.behaviors.map((b) => b.clone());
        let rendererEmitterSettings: RendererEmitterSettings;

        if (this.renderMode === RenderMode.Trail) {
            rendererEmitterSettings = {
                startLength: (this.rendererEmitterSettings as TrailSettings).startLength.clone(),
                followLocalOrigin: (this.rendererEmitterSettings as TrailSettings).followLocalOrigin,
            };
        } else if (this.renderMode === RenderMode.StretchedBillBoard) {
            rendererEmitterSettings = {
                lengthFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor,
                speedFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor,
            };
        } else {
            rendererEmitterSettings = {};
        }

        return new ParticleSystem({
            autoDestroy: this.autoDestroy,
            looping: this.looping,
            prewarm: this.prewarm,
            duration: this.duration,
            shape: this.emitterShape.clone(),
            startLife: this.startLife.clone(),
            startSpeed: this.startSpeed.clone(),
            startRotation: this.startRotation.clone(),
            startSize: this.startSize.clone(),
            startColor: this.startColor.clone(),
            emissionOverTime: this.emissionOverTime.clone(),
            emissionOverDistance: this.emissionOverDistance.clone(),
            emissionBursts: this.emissionBursts.map((b) => ({...b})),
            onlyUsedByOther: this.onlyUsedByOther,
            instancingGeometry: this.rendererSettings.instancingGeometry,
            instancingIndices: this.rendererSettings.instancingIndices,
            instancingUVs: this.rendererSettings.instancingUVs,
            instancingNormals: this.rendererSettings.instancingNormals,
            renderMode: this.renderMode,
            renderOrder: this.renderOrder,
            rendererEmitterSettings,
            material: this.materialRef,
            texture: this.rendererSettings.texture,
            startTileIndex: this.startTileIndex,
            uTileCount: this.rendererSettings.uTileCount,
            vTileCount: this.rendererSettings.vTileCount,
            blendTiles: this.rendererSettings.blendTiles,
            softParticles: this.rendererSettings.softParticles,
            softFarFade: this.rendererSettings.softFarFade,
            softNearFade: this.rendererSettings.softNearFade,
            behaviors: newBehaviors,
            worldSpace: this.worldSpace,
            blendMode: this.rendererSettings.materialBlendMode,
            transparent: this.rendererSettings.materialTransparent,
            depthTest: this.rendererSettings.materialDepthTest,
            depthWrite: this.rendererSettings.materialDepthWrite,
            alphaTest: this.rendererSettings.materialAlphaTest,
            layerMask: this.rendererSettings.layerMask,
            scene: this.emitter.getScene(),
        });
    }
}
