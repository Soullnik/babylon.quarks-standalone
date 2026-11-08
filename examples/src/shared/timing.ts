import type {ParticleSystem} from 'babylon.quarks';

/**
 * Calls `fire` now and then every `period` seconds of the demo's time, as one-shot effects are
 * replayed in the gallery. Returns the function to call from the demo's `update`.
 */
export function every(period: number, fire: () => void): (delta: number) => void {
    let elapsed = 0;
    fire();
    return (delta) => {
        elapsed += delta;
        if (elapsed >= period) {
            elapsed %= period;
            fire();
        }
    };
}

/** Starts the systems over from their first frame. */
export function replay(systems: readonly ParticleSystem[]): void {
    for (const system of systems) {
        system.restart();
        system.play();
    }
}
