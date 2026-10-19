import {EmissionState, IEmitter, IParticleSystem} from '../IParticleSystem';
import {Matrix4, Quaternion, Vector3} from '../math';
import {Particle} from '../Particle';
import {ONE_VEC3, Z_VEC3} from '../util/MathUtil';
import {random} from '../util/random';
import {Behavior} from './Behavior';

export enum SubParticleEmitMode {
    Death,
    Birth,
    Frame,
}

interface SubEmissionState extends EmissionState {
    matrix: Matrix4;
    particle: undefined | Particle;
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

    private subEmissions = new Array<SubEmissionState>();
    /** Finished emission states, kept for reuse: a burst of deaths would otherwise allocate one plus a matrix each. */
    private spareEmissions = new Array<SubEmissionState>();

    constructor(
        public particleSystem: IParticleSystem,
        public useVelocityAsBasis: boolean,
        public subParticleSystem: IEmitter | undefined,
        public mode: SubParticleEmitMode = SubParticleEmitMode.Frame,
        public emitProbability: number = 1
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
     * link. Every use goes through here, so a bad value is skipped rather
     * than thrown on.
     */
    private get target(): IParticleSystem | undefined {
        const sub = this.subParticleSystem as unknown;
        if (sub === null || typeof sub !== 'object') {
            return undefined;
        }
        return (sub as IEmitter).system as IParticleSystem | undefined;
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
        state.particle = particle;
        state.previousWorldPos = undefined;
        this.setMatrixFromParticle(state.matrix, particle);
        this.subEmissions.push(state);
        //(this.subParticleSystem.system as ParticleSystem).emit(delta, particle.emissionState, m);
    }

    frameUpdate(delta: number): void {
        const target = this.target;
        if (!target) {
            this.subEmissions.length = 0;
            return;
        }
        for (let i = 0; i < this.subEmissions.length; i++) {
            if (this.subEmissions[i].time >= target.duration) {
                const finished = this.subEmissions[i];
                finished.particle = undefined;
                this.spareEmissions.push(finished);
                this.subEmissions[i] = this.subEmissions[this.subEmissions.length - 1];
                this.subEmissions.length = this.subEmissions.length - 1;
                i--;
            } else {
                const subEmissionState = this.subEmissions[i];
                if (subEmissionState.particle && subEmissionState.particle!.age < subEmissionState.particle!.life) {
                    this.setMatrixFromParticle(subEmissionState.matrix, subEmissionState.particle!);
                } else {
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
        };
    }

    static fromJSON(json: any, particleSystem: IParticleSystem): Behavior {
        return new EmitSubParticleSystem(
            particleSystem,
            json.useVelocityAsBasis,
            json.subParticleSystem,
            json.mode,
            json.emitProbability
        );
    }

    clone(): Behavior {
        return new EmitSubParticleSystem(
            this.particleSystem,
            this.useVelocityAsBasis,
            this.subParticleSystem,
            this.mode,
            this.emitProbability
        );
    }
    reset(): void {}

    private setMatrixFromParticle(m: Matrix4, particle: Particle) {
        let rotation;
        if (particle.rotation === undefined || this.useVelocityAsBasis) {
            if (
                particle.velocity.x === 0 &&
                particle.velocity.y === 0 &&
                (particle.velocity.z === 1 || particle.velocity.z === 0)
            ) {
                m.set(
                    1,
                    0,
                    0,
                    particle.position.x,
                    0,
                    1,
                    0,
                    particle.position.y,
                    0,
                    0,
                    1,
                    particle.position.z,
                    0,
                    0,
                    0,
                    1
                );
            } else {
                this.v_.copy(Z_VEC3).cross(particle.velocity);
                this.v2_.copy(particle.velocity).cross(this.v_);
                const len = this.v_.length();
                const len2 = this.v2_.length();
                m.set(
                    this.v_.x / len,
                    this.v2_.x / len2,
                    particle.velocity.x,
                    particle.position.x,
                    this.v_.y / len,
                    this.v2_.y / len2,
                    particle.velocity.y,
                    particle.position.y,
                    this.v_.z / len,
                    this.v2_.z / len2,
                    particle.velocity.z,
                    particle.position.z,
                    0,
                    0,
                    0,
                    1
                );
            }
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
