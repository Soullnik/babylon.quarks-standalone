import {Vector3, getPhysicsResolver, setPhysicsResolver} from 'babylon.quarks';

/**
 * A horizontal ground plane collider for hosts/demos that opt in via ensureGroundResolver /
 * setPhysicsResolver. The editor never registers this automatically.
 *
 * `resolve` returns true and fills the surface normal when the point is at or below the plane,
 * which is exactly what ApplyCollision.update reflects the velocity against.
 */
export class GroundPlaneResolver {
    constructor(public y = 0) {}

    resolve(position: Vector3, normal: Vector3): boolean {
        if (position.y <= this.y) {
            normal.set(0, 1, 0);
            return true;
        }
        return false;
    }
}

/**
 * Opt-in helper for hosts/demos that want a simple floor collider.
 * The editor does not call this — like Unity, collision needs an explicit host-provided resolver.
 * Idempotent: an already-registered resolver is left untouched and returned.
 */
export function ensureGroundResolver(): GroundPlaneResolver {
    const existing = getPhysicsResolver();
    if (existing instanceof GroundPlaneResolver) {
        return existing;
    }
    if (existing) {
        // A host registered its own resolver; don't clobber it, but we can't tweak its floor.
        return existing as GroundPlaneResolver;
    }
    const resolver = new GroundPlaneResolver(0);
    setPhysicsResolver(resolver);
    return resolver;
}
