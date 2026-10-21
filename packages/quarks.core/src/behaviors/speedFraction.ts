import {IntervalValue} from '../functions';
import {Particle} from '../Particle';

/**
 * Where a particle's current speed (its velocity's length times its speed modifier, as Unity's
 * by-speed modules read it) falls in `range`, clamped to 0..1. An empty range is a step at `a`.
 */
export function speedFraction(particle: Particle, range: IntervalValue): number {
    const speed = particle.velocity.length() * particle.speedModifier;
    const span = range.b - range.a;
    if (span === 0) {
        return speed >= range.a ? 1 : 0;
    }
    const t = (speed - range.a) / span;
    return t < 0 ? 0 : t > 1 ? 1 : t;
}
