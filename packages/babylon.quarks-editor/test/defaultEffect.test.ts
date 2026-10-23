import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {ColorOverLife, RenderMode} from 'babylon.quarks';
import {createDefaultEffect, createSceneDefaultEntry} from '../src/core/defaultEffect';
import {useScene} from './helpers';

describe('default effect', () => {
    const scene = useScene();

    it('is a looping cone burst with a colour ramp, pointing up', () => {
        const system = createDefaultEffect(scene.get());
        expect(system.looping).toBe(true);
        expect(system.renderMode).toBe(RenderMode.BillBoard);
        expect(system.behaviors[0]).toBeInstanceOf(ColorOverLife);
        expect(system.texture).toBeNull();
        expect(system.emitter.rotation.x).toBeCloseTo(-Math.PI / 2);
    });

    it('resolves its texture through the host', () => {
        const resolved = {} as Texture;
        const resolveTexture = jest.fn((): Texture | null => resolved);
        const system = createDefaultEffect(scene.get(), resolveTexture, 'glow.png');
        expect(resolveTexture).toHaveBeenCalledWith('glow.png', scene.get());
        expect(system.texture).toBe(resolved);
        expect(createDefaultEffect(scene.get(), resolveTexture).texture).toBeNull();
    });

    it('makes a paused scene entry with a unique name under its own root', () => {
        const first = createSceneDefaultEntry(scene.get(), []);
        expect(first.name).toBe('Effect');
        expect(first.path).toBe('_created/Effect.json');
        expect(first.assetId).toBeNull();
        expect(first.systems[0].paused).toBe(true);
        expect(first.systems[0].emitter.parent).toBe(first.root);
        expect(first.root.name).toBe('Effect');
        const second = createSceneDefaultEntry(scene.get(), [first]);
        expect(second.name).toBe('New Effect');
        const third = createSceneDefaultEntry(scene.get(), [first, second]);
        expect(third.name).toBe('New Effect (2)');
    });
});
