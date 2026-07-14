import type {BatchedRenderer, ParticleSystem} from 'babylon.quarks';
import type {EffectBinding} from './binding';

const WIDE_STEP_THRESHOLD = 8;

function bindingSystems(binding: EffectBinding): ParticleSystem[] {
    return [binding.system, ...binding.subSystems];
}

/**
 * Scrub only the focused effect's systems — does not advance other preview effects
 * via the shared BatchedRenderer.update loop.
 */
export function scrubFocusTo(binding: EffectBinding, time: number): void {
    const systems = bindingSystems(binding);
    for (const system of systems) {
        system.restart();
        system.play();
    }
    if (time <= 0) {
        return;
    }
    const fixedStep = time > WIDE_STEP_THRESHOLD ? 1 / 30 : 1 / 60;
    const steps = Math.floor(time / fixedStep);
    for (let i = 0; i < steps; i++) {
        for (const system of systems) {
            system.update(fixedStep);
        }
    }
    const remainder = time - steps * fixedStep;
    if (remainder > 0) {
        for (const system of systems) {
            system.update(remainder);
        }
    }
}

/**
 * Approximate timeline scrub: replays every system from t=0 up to `time` using the existing
 * simulation loop. Not frame-exact (spawn/burst randomization is unseeded), but reuses
 * `EffectBinding.restart()` and `BatchedRenderer.update()` verbatim — no new engine primitive.
 *
 * `ParticleSystem.update()` clamps its own `delta` to 0.1s per call, so a single big step
 * can't reach `time` directly; must step through in small increments instead.
 */
export function scrubTo(binding: EffectBinding, renderer: BatchedRenderer, time: number): void {
    binding.restart();
    if (time <= 0) {
        return;
    }
    const fixedStep = time > WIDE_STEP_THRESHOLD ? 1 / 30 : 1 / 60;
    const steps = Math.floor(time / fixedStep);
    for (let i = 0; i < steps; i++) {
        renderer.update(fixedStep);
    }
    const remainder = time - steps * fixedStep;
    if (remainder > 0) {
        renderer.update(remainder);
    }
}
