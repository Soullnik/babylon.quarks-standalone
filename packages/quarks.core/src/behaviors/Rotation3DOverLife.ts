import {RotationGenerator, RotationGeneratorFromJSON} from '../functions';
import type {RotationGeneratorJSON} from '../functions/FunctionJSON';
import {Quaternion} from '../math';
import {Particle, SpriteParticle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';

/** The JSON of a 3D rotation over life: a {@link Rotation3DOverLife}. */
export interface Rotation3DOverLifeJSON extends BehaviorJSON {
    /** The angular velocity. */
    angularVelocity: RotationGeneratorJSON;
}

/**
 * Apply rotation to particles over their life.
 */
export class Rotation3DOverLife implements Behavior {
    type = 'Rotation3DOverLife';
    /** Scratch for the frame's rotation step; also read by the fused pass. */
    tempQuat = new Quaternion();

    /**
     * @param angularVelocity - The turn per second over the particle's life, as a rotation
     *   generator.
     */
    constructor(public angularVelocity: RotationGenerator) {}

    initialize(particle: Particle): void {
        if (particle.rotation instanceof Quaternion) {
            (particle as SpriteParticle).angularVelocity = new Quaternion();
            (this.angularVelocity as RotationGenerator).startGen(particle.memory);
        }
    }

    update(particle: Particle, delta: number): void {
        if (particle.rotation instanceof Quaternion) {
            (this.angularVelocity as RotationGenerator).genValue(
                particle.memory,
                this.tempQuat,
                delta,
                particle.age / particle.life
            );
            ((particle as SpriteParticle).rotation as Quaternion).multiply(this.tempQuat);
            // This step's turn, kept for the renderer to draw a fraction of when
            // the frame falls between steps.
            const step = (particle as SpriteParticle).angularVelocity;
            if (step instanceof Quaternion) {
                step.copy(this.tempQuat);
            }
        }
    }
    toJSON(): Rotation3DOverLifeJSON {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
        };
    }

    /**
     * Reads {@link Rotation3DOverLife.toJSON} output; a field the JSON leaves out takes its
     * default.
     */
    static fromJSON(json: Rotation3DOverLifeJSON): Behavior {
        return new Rotation3DOverLife(RotationGeneratorFromJSON(json.angularVelocity));
    }

    frameUpdate(delta: number): void {}

    clone(): Behavior {
        return new Rotation3DOverLife(this.angularVelocity.clone());
    }

    reset(): void {}
}
