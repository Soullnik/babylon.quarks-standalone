import {EmissionState, IEmitter, IParticleSystem} from '../IParticleSystem';
import {Matrix4, Quaternion, Vector3} from '../math';
import {Particle, SpriteParticle} from '../Particle';
import {ONE_VEC3, Z_VEC3} from '../util/MathUtil';
import {random} from '../util/random';
import {Behavior} from './Behavior';

/** Below this, a speed counts as zero and a direction's X and Y as lying along Z. */
const BASIS_EPSILON = 1e-6;

export enum SubParticleEmitMode {
    Death,
    Birth,
    Frame,
}

interface SubEmissionState extends EmissionState {
    matrix: Matrix4;
    particle: undefined | Particle;
    /** The parent's {@link Particle.serial} when the emission started. */
    serial: number | undefined;
    /**
     * A still copy of a dying parent, for a Death emission: the parent's own object is reused for
     * the next particle, but the emission stays where it died and inherits what it was.
     */
    ghost?: SpriteParticle;
}

/** A parent particle property sub emitted particles can take over (Unity's sub emitter Inherit). */
export type SubEmitterInheritance = 'color' | 'size' | 'rotation' | 'lifetime';

/** Bits of `EmissionState.inherit`, one per {@link SubEmitterInheritance}. */
export const SubEmitterInheritMask = {
    color: 1,
    size: 2,
    rotation: 4,
    lifetime: 8,
} as const;

/** The mask for a list of inherited properties. */
export function subEmitterInheritMask(inherit: ReadonlyArray<SubEmitterInheritance>): number {
    let mask = 0;
    for (const property of inherit) {
        mask |= SubEmitterInheritMask[property] ?? 0;
    }
    return mask;
}

/**
 * Emit a sub particle system from particles.
 */
export class EmitSubParticleSystem implements Behavior {
    type = 'EmitSubParticleSystem';

    //private matrix_ = new Matrix4();
    private q_ = new Quaternion();
    private v_ = new Vector3();
    private v2_ = new Vector3();
    private v3_ = new Vector3();

    private subEmissions = new Array<SubEmissionState>();
    /** Finished emission states, kept for reuse: a burst of deaths would otherwise allocate one plus a matrix each. */
    private spareEmissions = new Array<SubEmissionState>();

    constructor(
        public particleSystem: IParticleSystem,
        public useVelocityAsBasis: boolean,
        public subParticleSystem: IEmitter | undefined,
        public mode: SubParticleEmitMode = SubParticleEmitMode.Frame,
        public emitProbability: number = 1,
        /**
         * Which of the parent particle's properties the sub particles start
         * from: its current colour and size multiply theirs, its rotation adds
         * to theirs, and its remaining lifetime fraction scales theirs. A Death
         * sub emitter ignores lifetime, since the parent has none left; Unity
         * would give its particles no life at all.
         */
        public inherit: SubEmitterInheritance[] = []
    ) {
        const target = this.target;
        if (target) {
            (target as any).onlyUsedByOther = true;
        }
    }

    initialize(particle: Particle): void {
        /*particle.emissionState = {
            burstIndex: 0,
            burstWaveIndex: 0,
            time: 0,
            waitEmiting: 0,
            matrix: new Matrix4(),
        } as EmissionState;*/
    }

    update(particle: Particle, delta: number): void {
        if (this.mode === SubParticleEmitMode.Frame) {
            this.emit(particle, delta);
        } else if (this.mode === SubParticleEmitMode.Birth && particle.age === 0) {
            this.emit(particle, delta);
        } else if (this.mode === SubParticleEmitMode.Death && particle.age + delta >= particle.life) {
            this.emit(particle, delta);
        }
    }

    /**
     * The system to emit into, or undefined when `subParticleSystem` does not
     * hold a resolved emitter — unset, or a uuid string a loader could not
     * link — or when that system was disposed. Every use goes through here,
     * so a bad value is skipped rather than thrown on.
     */
    private get target(): IParticleSystem | undefined {
        const sub = this.subParticleSystem as unknown;
        if (sub === null || typeof sub !== 'object') {
            return undefined;
        }
        const system = (sub as IEmitter).system as IParticleSystem | undefined;
        return system?.isDisposed ? undefined : system;
    }

    private emit(particle: Particle, delta: number) {
        if (!this.target) return;
        if (random() > this.emitProbability) {
            return;
        }
        const spare = this.spareEmissions.pop();
        const state: SubEmissionState =
            spare !== undefined
                ? spare
                : {
                      burstParticleCount: 0,
                      burstParticleIndex: 0,
                      isBursting: false,
                      burstIndex: 0,
                      burstWaveIndex: 0,
                      time: 0,
                      waitEmiting: 0,
                      matrix: new Matrix4(),
                      travelDistance: 0,
                      particle: undefined,
                      serial: undefined,
                      previousWorldPos: undefined,
                  };
        state.burstParticleCount = 0;
        state.burstParticleIndex = 0;
        state.isBursting = false;
        state.burstIndex = 0;
        state.burstWaveIndex = 0;
        state.time = 0;
        state.waitEmiting = 0;
        state.travelDistance = 0;
        if (this.mode === SubParticleEmitMode.Death) {
            state.particle = EmitSubParticleSystem.copyInto((state.ghost ??= new SpriteParticle()), particle);
            state.serial = undefined;
        } else {
            state.particle = particle;
            state.serial = particle.serial;
        }
        state.inherit = subEmitterInheritMask(this.inherit);
        if (this.mode === SubParticleEmitMode.Death) {
            // A dying parent has no life left to hand on.
            state.inherit &= ~SubEmitterInheritMask.lifetime;
        }
        state.previousWorldPos = undefined;
        this.setMatrixFromParticle(state.matrix, particle);
        this.subEmissions.push(state);
        //(this.subParticleSystem.system as ParticleSystem).emit(delta, particle.emissionState, m);
    }

    frameUpdate(delta: number): void {
        const target = this.target;
        if (!target) {
            this.clearEmissions();
            return;
        }
        for (let i = 0; i < this.subEmissions.length; i++) {
            if (this.subEmissions[i].time >= target.duration) {
                const finished = this.subEmissions[i];
                finished.particle = undefined;
                // Local-space particles of the child share this matrix so that they follow the
                // parent; the ones that outlive the emission keep it where the parent last was,
                // and the next emission gets a matrix of its own.
                finished.matrix = new Matrix4();
                this.spareEmissions.push(finished);
                this.subEmissions[i] = this.subEmissions[this.subEmissions.length - 1];
                this.subEmissions.length = this.subEmissions.length - 1;
                i--;
            } else {
                const subEmissionState = this.subEmissions[i];
                const parent = subEmissionState.particle;
                if (parent !== undefined && parent === subEmissionState.ghost) {
                    // A Death emission stays where its parent died.
                } else if (
                    parent !== undefined &&
                    parent.age < parent.life &&
                    parent.serial === subEmissionState.serial
                ) {
                    this.setMatrixFromParticle(subEmissionState.matrix, parent);
                } else {
                    // The parent died, and its object may already hold a newborn.
                    subEmissionState.particle = undefined;
                }
                target.emit(delta, subEmissionState, subEmissionState.matrix);
            }
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            // An unresolved uuid is written back as it was read.
            subParticleSystem:
                typeof this.subParticleSystem === 'string'
                    ? this.subParticleSystem
                    : this.subParticleSystem
                      ? this.subParticleSystem.uuid
                      : '',
            useVelocityAsBasis: this.useVelocityAsBasis,
            mode: this.mode,
            emitProbability: this.emitProbability,
            ...(this.inherit.length > 0 ? {inherit: this.inherit.slice()} : {}),
        };
    }

    static fromJSON(json: any, particleSystem: IParticleSystem): Behavior {
        return new EmitSubParticleSystem(
            particleSystem,
            json.useVelocityAsBasis,
            json.subParticleSystem,
            json.mode,
            json.emitProbability,
            EmitSubParticleSystem.validInherit(json.inherit)
        );
    }

    clone(): Behavior {
        return new EmitSubParticleSystem(
            this.particleSystem,
            this.useVelocityAsBasis,
            this.subParticleSystem,
            this.mode,
            this.emitProbability,
            this.inherit.slice()
        );
    }
    reset(): void {}

    /**
     * Drops the emissions still running, as when the parent system restarts or stops: a Death
     * emission would otherwise keep emitting where a particle of the last play died.
     */
    clearEmissions(): void {
        for (const state of this.subEmissions) {
            state.particle = undefined;
            this.spareEmissions.push(state);
        }
        this.subEmissions.length = 0;
    }

    /** Copies what a sub emission reads from its parent: where it is, how it moves and what it inherits. */
    private static copyInto(ghost: SpriteParticle, particle: Particle): SpriteParticle {
        ghost.position.copy(particle.position);
        ghost.velocity.copy(particle.velocity);
        ghost.color.copy(particle.color);
        ghost.size.copy(particle.size);
        ghost.rotation = particle.rotation ?? 0;
        ghost.age = particle.age;
        ghost.life = particle.life;
        return ghost;
    }

    private static validInherit(value: unknown): SubEmitterInheritance[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return value.filter((v): v is SubEmitterInheritance => v in SubEmitterInheritMask);
    }

    private setMatrixFromParticle(m: Matrix4, particle: Particle) {
        let rotation;
        if (particle.rotation === undefined || this.useVelocityAsBasis) {
            // An orthonormal basis whose Z is the direction of travel: the sub emitter turns with the
            // parent but keeps its own size, whatever the parent's speed.
            const position = particle.position;
            const dir = this.v3_.copy(particle.velocity);
            const speed = dir.length();
            const x = this.v_;
            const y = this.v2_;
            if (speed < BASIS_EPSILON) {
                x.set(1, 0, 0);
                y.set(0, 1, 0);
                dir.set(0, 0, 1);
            } else {
                dir.divideScalar(speed);
                if (Math.abs(dir.x) < BASIS_EPSILON && Math.abs(dir.y) < BASIS_EPSILON) {
                    // Along Z, where Z × dir vanishes: no turn forwards, a half turn about X backwards.
                    const sign = dir.z > 0 ? 1 : -1;
                    x.set(1, 0, 0);
                    y.set(0, sign, 0);
                    dir.set(0, 0, sign);
                } else {
                    x.copy(Z_VEC3).cross(dir).normalize();
                    y.copy(dir).cross(x);
                }
            }
            m.set(x.x, y.x, dir.x, position.x, x.y, y.y, dir.y, position.y, x.z, y.z, dir.z, position.z, 0, 0, 0, 1);
        } else {
            if (particle.rotation instanceof Quaternion) {
                rotation = particle.rotation;
            } else {
                this.q_.setFromAxisAngle(Z_VEC3, particle.rotation);
                rotation = this.q_;
            }
            m.compose(particle.position, rotation, ONE_VEC3);
        }
        if (!this.particleSystem.worldSpace) {
            m.multiplyMatrices(this.particleSystem.emitter.matrixWorld, m);
        }
    }
}
