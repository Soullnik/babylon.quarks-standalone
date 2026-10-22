import {Constants} from '@babylonjs/core/Engines/constants';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BatchedRenderer, EmitSubParticleSystem} from 'babylon.quarks';
import {EffectBinding} from '../src/core/binding';
import {createChildSystem, removeSystems, unlinkSubEmitterReferences} from '../src/core/systems';
import {makeSystem, useScene} from './helpers';

describe('child systems', () => {
    const scene = useScene();

    it('makes a looping child under the parent emitter that shares its texture and blending', () => {
        const texture = new Texture(null, scene.get());
        const parent = makeSystem(scene.get(), {texture, blendMode: Constants.ALPHA_COMBINE, duration: 3});
        const child = createChildSystem(parent);
        expect(child.emitter.parent).toBe(parent.emitter);
        expect(child.emitter.name).toBe('child-system');
        expect(child.texture).toBe(texture);
        expect(child.blending).toBe(Constants.ALPHA_COMBINE);
        expect(child.duration).toBe(3);
        expect(child.looping).toBe(true);
        expect(child.onlyUsedByOther).toBe(false);
        expect(child.emissionBursts).toHaveLength(0);
    });

    it('makes a one-shot sub-emitter target that bursts once and is only used by others', () => {
        const parent = makeSystem(scene.get());
        const group = new TransformNode('group', scene.get());
        const child = createChildSystem(parent, {oneShot: true, name: 'spark', parentNode: group});
        expect(child.emitter.parent).toBe(group);
        expect(child.emitter.name).toBe('spark');
        expect(child.looping).toBe(false);
        expect(child.onlyUsedByOther).toBe(true);
        expect(child.emissionBursts).toHaveLength(1);
        expect(child.texture).toBeNull();
    });
});

describe('removing systems', () => {
    const scene = useScene();

    it('strips sub-emitter behaviors that point at a removed system', () => {
        const main = makeSystem(scene.get());
        const target = makeSystem(scene.get());
        const other = makeSystem(scene.get());
        main.addBehavior(new EmitSubParticleSystem(main, false, target.emitter));
        main.addBehavior(new EmitSubParticleSystem(main, false, other.emitter));
        unlinkSubEmitterReferences([main], [target]);
        expect(main.behaviors).toHaveLength(1);
        expect((main.behaviors[0] as EmitSubParticleSystem).subParticleSystem).toBe(other.emitter);
    });

    it('disposes removable targets, unlinks them and selects the main system', () => {
        const renderer = new BatchedRenderer('r', scene.get());
        const main = makeSystem(scene.get());
        const sub = makeSystem(scene.get());
        const stranger = makeSystem(scene.get());
        main.addBehavior(new EmitSubParticleSystem(main, false, sub.emitter));
        renderer.addSystem(main);
        renderer.addSystem(sub);
        const binding = new EffectBinding(main, [sub]);
        const selected: unknown[] = [];
        removeSystems(binding, [sub, stranger], (s) => selected.push(s));
        expect(binding.subSystems).toHaveLength(0);
        expect(main.behaviors).toHaveLength(0);
        expect(sub.isDisposed).toBe(true);
        expect(stranger.isDisposed).toBe(false);
        expect(renderer.systemToBatchIndex.has(sub)).toBe(false);
        expect(selected).toEqual([main]);
    });

    it('promotes another top-level system when the main one is removed', () => {
        const main = makeSystem(scene.get());
        const oneShot = makeSystem(scene.get());
        oneShot.onlyUsedByOther = true;
        const next = makeSystem(scene.get());
        const binding = new EffectBinding(main, [oneShot, next]);
        const selected: unknown[] = [];
        removeSystems(binding, [main], (s) => selected.push(s));
        expect(binding.system).toBe(next);
        expect(binding.subSystems).toEqual([oneShot]);
        expect(main.isDisposed).toBe(true);
        expect(selected).toEqual([next]);
    });

    it('does nothing for targets that are not part of the effect', () => {
        const main = makeSystem(scene.get());
        const binding = new EffectBinding(main);
        const selected: unknown[] = [];
        removeSystems(binding, [makeSystem(scene.get())], (s) => selected.push(s));
        expect(selected).toHaveLength(0);
        expect(binding.system).toBe(main);
    });
});
