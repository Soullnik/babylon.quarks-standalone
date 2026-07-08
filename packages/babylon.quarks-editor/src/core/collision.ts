import {Vector3, getPhysicsResolver, setPhysicsResolver} from 'babylon.quarks';

/**
 * A horizontal ground plane collider. quarks.core's ApplyCollision behavior delegates to a
 * host-provided `PhysicsResolver` (a global singleton) and ships no collider primitive of its
 * own, so the editor supplies this — the common "particles bounce off the floor" case.
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
 * Registers (once) a shared ground-plane resolver so ApplyCollision behaviors — whether added
 * in the inspector or deserialized from imported JSON — have something to collide against.
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
