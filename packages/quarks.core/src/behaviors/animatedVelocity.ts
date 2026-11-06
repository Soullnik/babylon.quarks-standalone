import type {Particle} from '../Particle';

/**
 * Adds the velocity of a direct move, from (`startX`, `startY`, `startZ`) to where the particle is
 * now over `delta` seconds, to its `animatedVelocity` when it keeps one (see
 * {@link Particle.animatedVelocity}). For the behaviors that move a position directly.
 */
export function addAnimatedVelocity(
    particle: Particle,
    startX: number,
    startY: number,
    startZ: number,
    delta: number
): void {
    const animated = particle.animatedVelocity;
    if (animated === undefined || delta <= 0) {
        return;
    }
    const position = particle.position;
    animated.x += (position.x - startX) / delta;
    animated.y += (position.y - startY) / delta;
    animated.z += (position.z - startZ) / delta;
}
