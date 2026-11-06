import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BatchedRenderer, ParticleEmitter, serializeEffect} from 'babylon.quarks';
import {disposeLoadedEffect, loadEffectFromJson, parseEffectFromJson} from '../src/core/loadEffect';
import {makeSystem, useScene} from './helpers';

describe('loading an effect', () => {
    const scene = useScene();

    const emitterIn = (parent: TransformNode, name?: string) => {
        const system = makeSystem(scene.get());
        if (name) system.emitter.name = name;
        system.emitter.parent = parent;
        return system;
    };

    it('collapses wrapper groups, drops empty ones and promotes a lone emitter to the root', () => {
        const root = new TransformNode('fx', scene.get());
        const wrap = new TransformNode('wrap', scene.get());
        wrap.parent = root;
        wrap.position.x = 5;
        emitterIn(wrap);
        const empty = new TransformNode('empty', scene.get());
        empty.parent = root;
        const json = serializeEffect(root, {name: 'fx'});
        root.dispose();

        const renderer = new BatchedRenderer('r', scene.get());
        const loaded = loadEffectFromJson(scene.get(), renderer, json);
        expect(loaded.root).toBeInstanceOf(ParticleEmitter);
        // The emitter had no name of its own, so it took its wrapper's, and kept its place.
        expect(loaded.root.name).toBe('wrap');
        expect(loaded.root.getAbsolutePosition().x).toBe(5);
        expect(loaded.systems).toHaveLength(1);
        expect(loaded.systems[0].paused).toBe(false);
        expect(renderer.systemToBatchIndex.has(loaded.systems[0])).toBe(true);
        expect(scene.get().getTransformNodeByName('empty')).toBeNull();
    });

    it('keeps the textures of an effect whose wrapper root gave way to its emitter', () => {
        const root = new TransformNode('fx', scene.get());
        const pixel =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
        emitterIn(root, 'burst').texture = new Texture(pixel, scene.get());
        const json = serializeEffect(root, {name: 'fx'});
        root.dispose(false, true);

        const loaded = parseEffectFromJson(scene.get(), null, json, {registerRenderer: false});
        expect(loaded.root).toBeInstanceOf(ParticleEmitter);
        const texture = loaded.systems[0].texture!;
        expect(texture.getScene()).toBe(scene.get());
        disposeLoadedEffect(loaded.root, loaded.systems, new BatchedRenderer('r', scene.get()), false);
        expect(texture.getScene()).toBeNull();
    });

    it('keeps groups with several children and emitters that have children of their own', () => {
        const root = new TransformNode('fx', scene.get());
        const a = emitterIn(root, 'a');
        const wrap = new TransformNode('wrap', scene.get());
        wrap.parent = root;
        const parent = emitterIn(wrap, 'parent');
        emitterIn(parent.emitter, 'child');
        const json = serializeEffect(root, {name: 'fx'});

        const loaded = parseEffectFromJson(scene.get(), null, json, {registerRenderer: false});
        expect(loaded.root.name).toBe('fx');
        expect(loaded.root).not.toBeInstanceOf(ParticleEmitter);
        expect(loaded.systems.map((s) => s.emitter.name).sort()).toEqual(['a', 'child', 'parent']);
        expect(scene.get().getTransformNodeByName('wrap')).not.toBeNull();
        expect(loaded.systems.every((s) => s.paused)).toBe(true);
        // Previews replay: the stop action is kept for saving but not applied.
        expect(loaded.systems.every((s) => s.ignoreStopAction)).toBe(true);
        expect(a.emitter.name).toBe('a');
    });

    it('can register without playing, or play without registering', () => {
        const root = new TransformNode('fx', scene.get());
        emitterIn(root, 'one');
        emitterIn(root, 'two');
        const json = serializeEffect(root, {name: 'fx'});
        const renderer = new BatchedRenderer('r', scene.get());
        const paused = parseEffectFromJson(scene.get(), renderer, json, {autoplay: false});
        expect(paused.systems.every((s) => s.paused)).toBe(true);
        expect(paused.systems.every((s) => renderer.systemToBatchIndex.has(s))).toBe(true);
        const playing = parseEffectFromJson(scene.get(), renderer, json, {registerRenderer: false, autoplay: true});
        expect(playing.systems.every((s) => !s.paused)).toBe(true);
        expect(playing.systems.some((s) => renderer.systemToBatchIndex.has(s))).toBe(false);
    });

    it('disposes the systems and the group tree', () => {
        const root = new TransformNode('fx', scene.get());
        emitterIn(root, 'one');
        emitterIn(root, 'two');
        const json = serializeEffect(root, {name: 'fx'});
        const renderer = new BatchedRenderer('r', scene.get());
        const loaded = loadEffectFromJson(scene.get(), renderer, json);
        disposeLoadedEffect(loaded.root, loaded.systems, renderer);
        expect(loaded.systems.every((s) => s.isDisposed)).toBe(true);
        expect(loaded.root.isDisposed()).toBe(true);
        expect(renderer.batches.every((b) => b.systems.size === 0)).toBe(true);

        // A root that is itself an emitter goes with its system.
        const lone = loadEffectFromJson(
            scene.get(),
            renderer,
            serializeEffect(makeSystem(scene.get()).emitter, {name: 'x'})
        );
        expect(lone.root).toBeInstanceOf(ParticleEmitter);
        disposeLoadedEffect(lone.root, lone.systems, renderer, false);
        expect(lone.systems[0].isDisposed).toBe(true);
    });
});
