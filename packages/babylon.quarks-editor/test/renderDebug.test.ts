import {BatchedRenderer} from 'babylon.quarks';
import {isRenderDebugEnabled, logRenderMismatch} from '../src/core/renderDebug';
import {makeSystem, useScene} from './helpers';

describe('render debug', () => {
    const scene = useScene();
    const store = new Map<string, string>();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    beforeEach(() => {
        store.clear();
        warn.mockClear();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {getItem: (key: string) => store.get(key) ?? null},
        });
    });

    afterAll(() => {
        delete (globalThis as {localStorage?: unknown}).localStorage;
        warn.mockRestore();
    });

    it('is off unless the flag is set, and off when storage throws', () => {
        expect(isRenderDebugEnabled()).toBe(false);
        store.set('quarksDebugRender', '1');
        expect(isRenderDebugEnabled()).toBe(true);
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get: () => {
                throw new Error('blocked');
            },
        });
        expect(isRenderDebugEnabled()).toBe(false);
    });

    it('warns once per distinct mismatch, and not when counts agree', () => {
        const renderer = new BatchedRenderer('r', scene.get());
        const system = makeSystem(scene.get());
        renderer.addSystem(system);
        logRenderMismatch(renderer, 5);
        expect(warn).not.toHaveBeenCalled();
        store.set('quarksDebugRender', '1');
        logRenderMismatch(renderer, 0);
        expect(warn).not.toHaveBeenCalled();
        logRenderMismatch(renderer, 5);
        logRenderMismatch(renderer, 5);
        expect(warn).toHaveBeenCalledTimes(1);
        logRenderMismatch(renderer, 6);
        expect(warn).toHaveBeenCalledTimes(2);
        renderer.update(1 / 60);
        logRenderMismatch(renderer, system.particleNum);
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
