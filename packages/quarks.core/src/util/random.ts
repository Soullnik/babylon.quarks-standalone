/**
 * The one source of randomness for particle simulation.
 *
 * Every roll a particle system makes — spawn positions, interval values,
 * random colours and rotations, burst probability, noise offsets — goes
 * through {@link random}, so it can be replaced: with a seeded generator for
 * reproducible tests, replays and lock-step multiplayer, or with a system's own
 * generator while that system steps (see `ParticleSystem.seed`).
 *
 * UUIDs are deliberately not drawn from here; two effects loaded under the same
 * seed must still get distinct ids.
 */

/** A generator in the shape of `Math.random`: uniform in [0, 1). */
export type RandomSource = () => number;

let source: RandomSource = Math.random;

/** Uniform random number in [0, 1) from the current source. */
export function random(): number {
    return source();
}

/** The generator {@link random} currently draws from. */
export function getRandomSource(): RandomSource {
    return source;
}

/**
 * Replaces the generator every roll draws from; `null` restores `Math.random`.
 * Returns the previous source, so a caller can put it back.
 */
export function setRandomSource(next: RandomSource | null): RandomSource {
    const previous = source;
    source = next ?? Math.random;
    return previous;
}

/**
 * A small, fast seeded generator (mulberry32): the same seed always yields
 * the same sequence, on every platform. Good enough for visual randomness;
 * not for anything cryptographic.
 */
export function createSeededRandom(seed: number): RandomSource {
    let state = seed >>> 0 || 0x9e3779b9;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Runs `fn` with `generator` as the random source, restoring the previous one after. */
export function withRandomSource<T>(generator: RandomSource, fn: () => T): T {
    const previous = setRandomSource(generator);
    try {
        return fn();
    } finally {
        setRandomSource(previous);
    }
}
