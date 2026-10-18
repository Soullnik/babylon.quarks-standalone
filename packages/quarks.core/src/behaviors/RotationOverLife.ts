import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Quaternion} from '../math';
import {Z_VEC3} from '../util/MathUtil';
import {Behavior} from './Behavior';

/**
 * Apply rotation to particles over their life.
 *
 * A billboard (rotation is an angle) turns in its own plane. A mesh particle
 * (rotation is a quaternion) turns about its local Z axis — the axis a
 * number `startRotation` turns a mesh about, and what Unity's Rotation over
 * Lifetime without separate axes does to mesh particles. For any other axis,
 * or a turn about all three, use {@link Rotation3DOverLife}.
 */
export class RotationOverLife implements Behavior {
    type = 'RotationOverLife';
    /** Scratch for a mesh particle's rotation step; also read by the fused pass. */
    tempQuat = new Quaternion();

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
                particle.age / particle.life
            );
            (particle.rotation as number) += delta * rate;
            // Kept for the renderer, which draws between steps and has no other
            // way to know how fast this particle is turning.
            particle.angularVelocity = rate;
        } else if (particle.rotation instanceof Quaternion) {
            const rate = (this.angularVelocity as FunctionValueGenerator).genValue(
                particle.memory,
                particle.age / particle.life
            );
            this.turnAboutZ(particle, particle.rotation, rate * delta);
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
                const rate = generator.genValue(particle.memory, particle.age / particle.life);
                particle.rotation = rotation + delta * rate;
                particle.angularVelocity = rate;
            } else if (rotation instanceof Quaternion) {
                const rate = generator.genValue(particle.memory, particle.age / particle.life);
                this.turnAboutZ(particle, rotation, rate * delta);
            }
        }
    }

    /**
     * Turns a mesh particle by `angle` about its own Z axis, keeping the step
     * for the renderer to draw a fraction of between simulation steps.
     */
    turnAboutZ(particle: Particle, rotation: Quaternion, angle: number): void {
        const step = this.tempQuat.setFromAxisAngle(Z_VEC3, angle);
        rotation.multiply(step);
        const kept = particle.angularVelocity;
        if (kept instanceof Quaternion) {
            kept.copy(step);
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
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
