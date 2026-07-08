import type {BatchedRenderer} from 'babylon.quarks';
import type {EffectBinding} from './binding';

const WIDE_STEP_THRESHOLD = 8;

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
