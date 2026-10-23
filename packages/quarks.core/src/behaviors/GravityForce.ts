import {Particle} from '../Particle';
import {Vector3} from '../math';
import {readVector3} from '../util/JSONUtil';
import {Behavior} from './Behavior';

/**
 * Pull particles toward a point with an inverse-square force, F = magnitude / r²
 * (Niagara's Point Attraction Force).
 *
 * `center` is a point in the space the system simulates in: the emitter's own
 * space for a local-space system, the world for a world-space one. A particle
 * exactly on the centre is left alone rather than given an infinite pull.
 * Applies in every render mode.
 */
export class GravityForce implements Behavior {
    type = 'GravityForce';
    /**
     * Scratch value.
     * @internal
     */
    temp: Vector3 = new Vector3();

    constructor(
        /** The point pulled toward, in the simulation space. */
        public center: Vector3,
        /** Strength of the pull at distance 1, in units per second squared. */
        public magnitude: number
    ) {}

    initialize(particle: Particle): void {}

    update(particle: Particle, delta: number): void {
        const distanceSquared = particle.position.distanceToSquared(this.center);
        // A particle sitting exactly on the attractor used to divide by zero and
        // poison its velocity with NaN; leave it untouched instead.
        if (distanceSquared === 0) {
            return;
        }
        this.temp.copy(this.center).sub(particle.position).normalize();
        particle.velocity.addScaledVector(this.temp, (this.magnitude / distanceSquared) * delta);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        // The attractor is fixed, so its components and the scaled magnitude are
        // constants for the whole run.
        const cx = this.center.x;
        const cy = this.center.y;
        const cz = this.center.z;
        const magnitude = this.magnitude * delta;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const position = particle.position;
            const dx = cx - position.x;
            const dy = cy - position.y;
            const dz = cz - position.z;
            const distanceSquared = dx * dx + dy * dy + dz * dz;
            if (distanceSquared === 0) {
                continue;
            }
            // normalize then scale by magnitude / distance², folded into one factor
            const scale = magnitude / (distanceSquared * Math.sqrt(distanceSquared));
            const velocity = particle.velocity;
            velocity.x += dx * scale;
            velocity.y += dy * scale;
            velocity.z += dz * scale;
        }
    }

    frameUpdate(delta: number): void {}

    toJSON(): any {
        return {
            type: this.type,
            center: [this.center.x, this.center.y, this.center.z],
            magnitude: this.magnitude,
        };
    }

    /** Reads {@link GravityForce.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: any): Behavior {
        return new GravityForce(
            readVector3(json.center, new Vector3(0, 0, 0)),
            typeof json.magnitude === 'number' ? json.magnitude : 0
        );
    }

    clone(): Behavior {
        return new GravityForce(this.center.clone(), this.magnitude);
    }
    reset(): void {}
}
