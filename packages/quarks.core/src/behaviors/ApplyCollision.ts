import type {Vector3Like} from '../Like';
import {Particle} from '../Particle';
import {Vector3} from '../math';
import {Behavior, BehaviorJSON} from './Behavior';

/**
 * What {@link ApplyCollision} asks about the world: whether a particle at
 * `position` has hit something, and if so which way the surface faces.
 */
export interface PhysicsResolver {
    /**
     * Tests `position`, in the simulation space of the system asking. Returns
     * true when it is inside or on a collider, with the surface's unit normal
     * written to `normal`; false otherwise, leaving `normal` alone. Both are `{x, y, z}`: read
     * the position's components and write the normal's.
     */
    resolve(position: Vector3Like, normal: Vector3Like): boolean;
}

let physicsResolver: PhysicsResolver | undefined;

/**
 * Registers the resolver every {@link ApplyCollision} without one of its own
 * uses, from the next step on; `undefined` unregisters it. The host owns the
 * colliders, so quarks.core registers nothing itself.
 */
export function setPhysicsResolver(resolver: PhysicsResolver | undefined): void {
    physicsResolver = resolver;
}

/** The resolver registered with {@link setPhysicsResolver}, or undefined when there is none. */
export function getPhysicsResolver(): PhysicsResolver | undefined {
    return physicsResolver;
}

/** The JSON of a collision with the ground plane: a {@link ApplyCollision}. */
export interface ApplyCollisionJSON extends BehaviorJSON {
    /** The share of speed kept on a bounce; 1 when absent. */
    bounce?: number;
}

/**
 * Bounce particles off the host's colliders (Unity's Collision module in its
 * World mode, with a host-provided world).
 *
 * Every step each particle's position is handed to a {@link PhysicsResolver}:
 * the behavior's own when it was given one, otherwise whatever is registered
 * with {@link setPhysicsResolver} at that moment, so a resolver registered
 * after the effect loaded still takes effect. A hit reflects the velocity
 * about the surface normal and scales it by `bounce`. Without any resolver
 * the behavior does nothing, so a collision-bearing effect loads and plays
 * anywhere. Only `bounce` is saved; the resolver belongs to the host. Applies
 * in every render mode.
 */
export class ApplyCollision implements Behavior {
    type = 'ApplyCollision';
    /**
     * Scratch value.
     * @internal
     */
    tempV = new Vector3();

    constructor(
        /**
         * The resolver this behavior asks, or undefined to ask the one
         * registered with {@link setPhysicsResolver} when a particle is tested.
         */
        public resolver: PhysicsResolver | undefined,
        /** How much speed a particle keeps after a hit: 1 bounces back at full speed, 0 stops it. */
        public bounce: number
    ) {}

    initialize(particle: Particle): void {}

    update(particle: Particle, delta: number): void {
        const resolver = this.resolver ?? physicsResolver;
        if (resolver !== undefined && resolver.resolve(particle.position, this.tempV)) {
            particle.velocity.reflect(this.tempV).multiplyScalar(this.bounce);
        }
    }

    frameUpdate(delta: number): void {}

    toJSON(): ApplyCollisionJSON {
        return {
            type: this.type,
            bounce: this.bounce,
        };
    }

    /**
     * Reads {@link ApplyCollision.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: ApplyCollisionJSON): Behavior {
        // A file without a bounce keeps the full speed, as a Unity collision does by default.
        return new ApplyCollision(undefined, typeof json.bounce === 'number' ? json.bounce : 1);
    }

    clone(): Behavior {
        return new ApplyCollision(this.resolver, this.bounce);
    }

    reset(): void {}
}
