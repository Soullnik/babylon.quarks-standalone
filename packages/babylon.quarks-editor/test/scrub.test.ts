import {BatchedRenderer, ConstantValue} from 'babylon.quarks';
import {EffectBinding} from '../src/core/binding';
import {pauseFocus, playFocus, scrubFocusTo, scrubFocusToSettled, scrubTo} from '../src/core/scrub';
import {makeSystem, useScene} from './helpers';

describe('scrubbing', () => {
    const scene = useScene();

    function setup() {
        const renderer = new BatchedRenderer('r', scene.get());
        const main = makeSystem(scene.get(), {duration: 20});
        const sub = makeSystem(scene.get(), {duration: 20});
        renderer.addSystem(main);
        renderer.addSystem(sub);
        return {renderer, binding: new EffectBinding(main, [sub]), main, sub};
    }

    it('plays and pauses every system of the focused effect', () => {
        const {binding, main, sub} = setup();
        pauseFocus(binding);
        expect([main.paused, sub.paused]).toEqual([true, true]);
        playFocus(binding);
        expect([main.paused, sub.paused]).toEqual([false, false]);
    });

    it('scrubs the focused systems to a time without advancing the renderer', () => {
        const {renderer, binding, main, sub} = setup();
        const bystander = makeSystem(scene.get());
        renderer.addSystem(bystander);
        scrubFocusTo(binding, renderer, 1.25);
        expect(main.emissionState.time).toBeCloseTo(1.25, 2);
        expect(sub.emissionState.time).toBeCloseTo(1.25, 2);
        expect(bystander.emissionState.time).toBe(0);
        expect(main.particleNum).toBeGreaterThan(0);
        scrubFocusTo(binding, renderer, 0);
        expect(main.emissionState.time).toBe(0);
        expect(main.particleNum).toBe(0);
    });

    it('takes wider steps for a far scrub', () => {
        const {renderer, binding, main} = setup();
        scrubFocusTo(binding, renderer, 12);
        expect(main.emissionState.time).toBeCloseTo(12, 1);
    });

    it('settles a one-shot past the scrub time until its particles die', () => {
        const renderer = new BatchedRenderer('r', scene.get());
        const burst = makeSystem(scene.get(), {
            looping: false,
            duration: 1,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(5), cycle: 1, interval: 0, probability: 1}],
            startLife: new ConstantValue(0.5),
        });
        renderer.addSystem(burst);
        const binding = new EffectBinding(burst);
        scrubFocusTo(binding, renderer, 0.2);
        expect(burst.particleNum).toBe(5);
        scrubFocusToSettled(binding, renderer, 0.2);
        expect(burst.particleNum).toBe(0);
        // Nothing alive: settling returns at once.
        scrubFocusToSettled(binding, renderer, 0);
        expect(burst.particleNum).toBe(0);
    });

    it('replays the whole renderer up to a time', () => {
        const {renderer, binding, main} = setup();
        const bystander = makeSystem(scene.get(), {duration: 20});
        renderer.addSystem(bystander);
        scrubTo(binding, renderer, 0.5);
        expect(main.emissionState.time).toBeCloseTo(0.5, 2);
        expect(bystander.emissionState.time).toBeCloseTo(0.5, 2);
        scrubTo(binding, renderer, 9);
        expect(main.emissionState.time).toBeCloseTo(9, 1);
        scrubTo(binding, renderer, 0);
        expect(main.emissionState.time).toBe(0);
    });
});
