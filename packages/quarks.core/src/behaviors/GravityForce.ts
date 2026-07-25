import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {Vector3} from '../math';

/**
 * Apply a gravity force to particles.
 * the gravity force is calculated as:
 * F = G * m1 * m2 / r^2
 */
export class GravityForce implements Behavior {
    type = 'GravityForce';
    temp: Vector3 = new Vector3();

    constructor(
        public center: Vector3,
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

    static fromJSON(json: any): Behavior {
        return new GravityForce(new Vector3(json.center[0], json.center[1], json.center[2]), json.magnitude);
    }

    clone(): Behavior {
        return new GravityForce(this.center.clone(), this.magnitude);
    }
    reset(): void {}
}
