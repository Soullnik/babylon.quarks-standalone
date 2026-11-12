import type {ValueGeneratorJSON} from '../functions/FunctionJSON';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Quaternion} from '../math';
import {Particle} from '../Particle';
import {Z_VEC3} from '../util/MathUtil';
import {Behavior, BehaviorJSON} from './Behavior';
import {stepEndLife} from './stepAge';

/** The JSON of a rotation over life: a {@link RotationOverLife}. */
export interface RotationOverLifeJSON extends BehaviorJSON {
    /** The angular velocity. */
    angularVelocity: ValueGeneratorJSON;
}

/**
 * Apply rotation to particles over their life.
 *
 * A billboard (rotation is an angle) turns in its own plane. A mesh particle
 * (rotation is a quaternion) turns about its {@link Particle.rotationAxis},
 * its local Z unless the system gave it another — the axis a number
 * `startRotation` turns a mesh about, and what Unity's Rotation over Lifetime
 * without separate axes does to mesh particles. For a turn about all three
 * axes, use {@link Rotation3DOverLife}.
 */
export class RotationOverLife implements Behavior {
    type = 'RotationOverLife';
    /** Scratch for a mesh particle's rotation step; also read by the fused pass. */
    tempQuat = new Quaternion();

    /** @param angularVelocity - Turn rate in radians per second over the particle's life. */
    constructor(public angularVelocity: ValueGenerator | FunctionValueGenerator) {}

    initialize(particle: Particle): void {
        if (typeof particle.rotation === 'number') {
            (this.angularVelocity as ValueGenerator).startGen(particle.memory);
        } else if (particle.rotation instanceof Quaternion) {
            (this.angularVelocity as ValueGenerator).startGen(particle.memory);
            if (!(particle.angularVelocity instanceof Quaternion)) {
                particle.angularVelocity = new Quaternion();
            }
        }
    }

    update(particle: Particle, delta: number): void {
        if (typeof particle.rotation === 'number') {
            const rate = (this.angularVelocity as FunctionValueGenerator).genValue(
                particle.memory,
                stepEndLife(particle, delta)
            );
            (particle.rotation as number) += delta * rate;
            // Kept for the renderer, which draws between steps and has no other
            // way to know how fast this particle is turning.
            particle.angularVelocity = rate;
        } else if (particle.rotation instanceof Quaternion) {
            const rate = (this.angularVelocity as FunctionValueGenerator).genValue(
                particle.memory,
                stepEndLife(particle, delta)
            );
            this.turn(particle, particle.rotation, rate * delta);
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.angularVelocity as FunctionValueGenerator;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const rotation = particle.rotation;
            if (typeof rotation === 'number') {
                const rate = generator.genValue(particle.memory, stepEndLife(particle, delta));
                particle.rotation = rotation + delta * rate;
                particle.angularVelocity = rate;
            } else if (rotation instanceof Quaternion) {
                const rate = generator.genValue(particle.memory, stepEndLife(particle, delta));
                this.turn(particle, rotation, rate * delta);
            }
        }
    }

    /**
     * Turns a mesh particle by `angle` about its {@link Particle.rotationAxis} (its own Z when it
     * has none), keeping the step for the renderer to draw a fraction of between simulation steps.
     */
    turn(particle: Particle, rotation: Quaternion, angle: number): void {
        const step = this.tempQuat.setFromAxisAngle(particle.rotationAxis ?? Z_VEC3, angle);
        rotation.multiply(step);
        const kept = particle.angularVelocity;
        if (kept instanceof Quaternion) {
            kept.copy(step);
        }
    }

    /**
     * The same call as {@link RotationOverLife.turn}: it turns about the particle's
     * {@link Particle.rotationAxis}. Kept so callers written against the old name still compile.
     */
    turnAboutZ(particle: Particle, rotation: Quaternion, angle: number): void {
        this.turn(particle, rotation, angle);
    }

    toJSON(): RotationOverLifeJSON {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
        };
    }

    /**
     * Reads {@link RotationOverLife.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: RotationOverLifeJSON): Behavior {
        return new RotationOverLife(ValueGeneratorFromJSON(json.angularVelocity) as FunctionValueGenerator);
    }

    frameUpdate(delta: number): void {
        this.angularVelocity.refreshTable?.();
    }

    clone(): Behavior {
        return new RotationOverLife(this.angularVelocity.clone());
    }
    reset(): void {}
}
