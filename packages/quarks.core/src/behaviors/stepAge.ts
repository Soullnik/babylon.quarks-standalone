import {Particle} from '../Particle';

/**
 * The age `particle` reaches at the end of a step of `delta` seconds, at most its life: the age it
 * is drawn at. A behavior runs before the host ages and moves the particle, so it evaluates its
 * over-life curves here rather than at `particle.age`; Unity does the same, ageing a particle
 * before its modules evaluate. Evaluated at the start of the step, every curve showed one step
 * late, where the particle was drawn one step on: a fast flipbook a frame behind its motion.
 */
export function stepEndAge(particle: Particle, delta: number): number {
    const age = particle.age + delta;
    const life = particle.life;
    return age < life ? age : life;
}

/** {@link stepEndAge} as a fraction of the particle's life, 0 to 1: where its over-life curves are read. */
export function stepEndLife(particle: Particle, delta: number): number {
    return stepEndAge(particle, delta) / particle.life;
}
