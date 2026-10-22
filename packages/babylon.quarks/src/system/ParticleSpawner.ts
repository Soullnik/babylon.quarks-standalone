import {
    EmissionState,
    FunctionValueGenerator,
    Matrix3,
    Matrix4,
    Particle,
    Quaternion,
    random,
    RotationGenerator,
    SpriteParticle,
    SubEmitterInheritMask,
    TrailParticle,
    TrailSettings,
    Vector3,
    Vector3Generator,
} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';
import {RenderMode} from '../VFXBatch';

/** Particle backed by a `ParticleStore` row, as a system always creates. */
type StoreBackedParticle = Particle & {storeIndex: number};

const UP = new Vector3(0, 0, 1);
const IDENTITY_QUATERNION = new Quaternion();
const tempQ = new Quaternion();
const tempV = new Vector3();
const tempV2 = new Vector3();

/**
 * Gives a system its newborn particles: grows the pool and the store they live in, rolls each
 * particle's start values on the system's generators, places it with the emitter shape and lets
 * the behaviors claim their slots. One per system; `EmissionController` decides how many to
 * spawn and when, this decides what each one starts as.
 */
export class ParticleSpawner {
    /**
     * The emitter matrix's normal matrix, for turning a world-space newborn's velocity. The
     * emission controller refreshes it before it spawns from a world-space system.
     */
    readonly normalMatrix = new Matrix3();

    constructor(private readonly system: ParticleSystem) {}

    /** Points every particle at the store's columns again, after any were replaced. */
    rebind(): void {
        const particles = this.system.particles;
        for (let i = 0; i < particles.length; i++) {
            (particles[i] as SpriteParticle | TrailParticle).rebind();
        }
    }

    /**
     * Appends one particle to the pool, giving it the next row of the store. Growing the store
     * replaces its arrays, so every particle already bound to it is re-pointed at the new ones.
     */
    private grow(isTrailMode: boolean): void {
        const system = this.system;
        const index = system.particles.length;
        if (system.store.ensureCapacity(index + 1)) {
            this.rebind();
        }
        system.particles.push(
            isTrailMode ? new TrailParticle(system.store, index) : new SpriteParticle(system.store, index)
        );
    }

    /**
     * Spawns `count` particles at `matrix` (the emitter's, or a parent particle's for a sub
     * emission), each rolled on the system's start generators at `emissionState`'s normalised
     * time. A full system (see `maxParticles`) spawns only what it has room for.
     */
    spawn(count: number, emissionState: EmissionState, matrix: Matrix4): void {
        const system = this.system;
        const translation = tempV;
        const scale = tempV2;
        // decompose writes tempQ, so no separate setFromRotationMatrix is needed.
        matrix.decompose(translation, tempQ, scale);
        const behaviors = system.behaviors;
        const behaviorCount = behaviors.length;
        const renderMode = system.rendererSettings.renderMode;
        const isTrailMode = renderMode === RenderMode.Trail;
        const isSpriteMode = !isTrailMode;
        const isMeshMode = renderMode === RenderMode.Mesh;
        const startRotation = system.startRotation;
        const startSize = system.startSize;
        const startRotationIsRotation = startRotation.type === 'rotation';
        const startSizeIsVector3 = startSize.type === 'vec3function';
        const timeRatio = emissionState.time / system.duration;
        const trailSettings = isTrailMode ? (system.rendererEmitterSettings as TrailSettings) : undefined;
        const followLocalOrigin = Boolean(trailSettings?.followLocalOrigin);
        const worldSpace = system.worldSpace;
        const hierarchy = system.scalingMode === 'hierarchy';
        const particles = system.particles;
        if (system.maxParticles !== undefined) {
            // Like Unity, a full system skips the particles it has no room for rather than queueing them.
            count = Math.min(count, Math.max(0, system.maxParticles - system.particleNum));
        }

        for (let i = 0; i < count; i++) {
            emissionState.burstParticleIndex = i;
            system.particleNum++;
            if (particles.length < system.particleNum) {
                this.grow(isTrailMode);
            }
            const particle = particles[system.particleNum - 1];
            particle.reset();
            particle.serial = (particle.serial ?? 0) + 1;
            particle.speedModifier = 1;
            // Parent EmitSub can refill an onlyUsedByOther system after it had
            // already finished empty; clear the flag so update does not treat it
            // as done while it has live particles again.
            system.finishedEventFired = false;
            system.startColor.startGen(particle.memory);
            system.startColor.genColor(particle.memory, particle.startColor, timeRatio);
            particle.color.copy(particle.startColor);
            system.startSpeed.startGen(particle.memory);
            particle.startSpeed = system.startSpeed.genValue(particle.memory, timeRatio);
            system.startLife.startGen(particle.memory);
            particle.life = system.startLife.genValue(particle.memory, timeRatio);
            particle.age = 0;
            startSize.startGen(particle.memory);
            if (startSizeIsVector3) {
                (startSize as Vector3Generator).genValue(particle.memory, particle.startSize, timeRatio);
            } else {
                const size = (startSize as FunctionValueGenerator).genValue(particle.memory, timeRatio);
                particle.startSize.set(size, size, size);
            }
            system.startTileIndex.startGen(particle.memory);
            particle.uvTile = system.startTileIndex.genValue(particle.memory);
            particle.size.copy(particle.startSize);

            if (isSpriteMode) {
                const sprite = particle as SpriteParticle;
                startRotation.startGen(particle.memory);
                if (isMeshMode) {
                    if (!(sprite.rotation instanceof Quaternion)) {
                        // Assigning a quaternion gives the particle a row in the
                        // store's quaternion column; the value is overwritten below.
                        sprite.rotation = IDENTITY_QUATERNION;
                    }
                    // A recycled particle can still carry the turn of whatever
                    // it was last time; the renderer would draw a fraction of it
                    // before any behavior has had a chance to say otherwise.
                    if (sprite.angularVelocity instanceof Quaternion) {
                        sprite.angularVelocity.set(0, 0, 0, 1);
                    }
                    if (startRotationIsRotation) {
                        (startRotation as RotationGenerator).genValue(
                            particle.memory,
                            sprite.rotation as Quaternion,
                            1,
                            timeRatio
                        );
                    } else {
                        (sprite.rotation as Quaternion).setFromAxisAngle(
                            UP,
                            (startRotation as FunctionValueGenerator).genValue(sprite.memory, timeRatio)
                        );
                    }
                } else {
                    if (startRotationIsRotation) {
                        sprite.rotation = 0;
                    } else {
                        sprite.rotation = (startRotation as FunctionValueGenerator).genValue(sprite.memory, timeRatio);
                    }
                    // Set until a turning behavior says otherwise, so the
                    // renderer never carries a recycled particle's old spin.
                    sprite.angularVelocity = 0;
                    const flip = system.flip;
                    sprite.flip = flip === undefined ? 0 : (random() < flip.x ? 1 : 0) | (random() < flip.y ? 2 : 0);
                }
            } else if (trailSettings) {
                const trail = particle as TrailParticle;
                trailSettings.startLength.startGen(trail.memory);
                trail.length = trailSettings.startLength.genValue(trail.memory, timeRatio);
                trail.ensureHistoryCapacity(Math.max(1, Math.ceil(trail.length)));
                trail.resetHistory();
            }

            system.emitterShape.initialize(particle, emissionState);

            if (system.alignToDirection && isSpriteMode) {
                alignParticleToDirection(particle as SpriteParticle, isMeshMode);
            }

            const parent = emissionState.particle;
            const inherit = emissionState.inherit;
            if (parent !== undefined && inherit !== undefined && inherit !== 0) {
                inheritFromParent(particle, parent, inherit, isSpriteMode);
            }

            if (isTrailMode && followLocalOrigin) {
                const trail = particle as TrailParticle;
                if (!trail.localPosition) {
                    trail.localPosition = new Vector3();
                }
                trail.localPosition.copy(trail.position);
            }

            if (worldSpace) {
                particle.position.applyMatrix4(matrix);
                particle.startSize.multiply(scale).abs();
                particle.size.copy(particle.startSize);
                if (hierarchy) {
                    // Scaled per axis by the emitter's world scale, then turned: the speed scales with it.
                    particle.velocity.multiply(system.hierarchyScale).applyQuaternion(tempQ);
                } else {
                    particle.velocity.multiply(scale).applyMatrix3(this.normalMatrix);
                }
                if (particle.rotation && particle.rotation instanceof Quaternion) {
                    particle.rotation.multiplyQuaternions(tempQ, particle.rotation);
                }
            } else {
                if (system.onlyUsedByOther) {
                    particle.parentMatrix = matrix;
                }
            }

            for (let j = 0; j < behaviorCount; j++) {
                behaviors[j].initialize(particle, system);
            }
            // Every generator has claimed its slot by now; give the compiled
            // behavior passes a column copy of the samples.
            system.store.recordMemory((particle as StoreBackedParticle).storeIndex, particle.memory);
        }
    }
}

/** Turns a newborn so that it faces the way its shape sent it; see `ParticleSystem.alignToDirection`. */
function alignParticleToDirection(sprite: SpriteParticle, isMeshMode: boolean): void {
    const velocity = sprite.velocity;
    const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    if (speedSq === 0) {
        return;
    }
    if (isMeshMode) {
        // +Z along the velocity, with the start rotation applied first.
        const rotation = sprite.rotation as Quaternion;
        tempV.copy(velocity).divideScalar(Math.sqrt(speedSq));
        tempQ.setFromUnitVectors(UP, tempV);
        rotation.multiplyQuaternions(tempQ, rotation);
    } else {
        // The quad's top (its +Y) toward the velocity in the emitter's XY plane.
        if (velocity.x !== 0 || velocity.y !== 0) {
            sprite.rotation = (sprite.rotation as number) + Math.atan2(-velocity.x, velocity.y);
        }
    }
}

/** Applies the parent particle's inherited properties to a sub emitted newborn; see `EmitSubParticleSystem.inherit`. */
function inheritFromParent(particle: Particle, parent: Particle, inherit: number, isSpriteMode: boolean): void {
    if (inherit & SubEmitterInheritMask.color) {
        particle.startColor.multiply(parent.color);
        particle.color.copy(particle.startColor);
    }
    if (inherit & SubEmitterInheritMask.size) {
        particle.startSize.multiply(parent.size);
        particle.size.copy(particle.startSize);
    }
    if (inherit & SubEmitterInheritMask.rotation && isSpriteMode) {
        const sprite = particle as SpriteParticle;
        const parentRotation = parent.rotation;
        if (typeof sprite.rotation === 'number') {
            if (typeof parentRotation === 'number') {
                sprite.rotation += parentRotation;
            }
        } else if (parentRotation instanceof Quaternion) {
            (sprite.rotation as Quaternion).multiplyQuaternions(parentRotation, sprite.rotation as Quaternion);
        }
    }
    if (inherit & SubEmitterInheritMask.lifetime && parent.life > 0) {
        particle.life *= Math.max(0, 1 - parent.age / parent.life);
    }
}
