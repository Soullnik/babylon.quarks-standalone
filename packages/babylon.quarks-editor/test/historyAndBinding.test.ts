import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, ParticleSystem, PointEmitter, QuarksLoader, RenderMode, SizeOverLife} from 'babylon.quarks';
import {EffectBinding} from '../src/core/binding';
import {EffectHistory} from '../src/core/history';
import {formatBytes} from '../src/core/projectStore';
import {buildScalar} from '../src/core/values';

describe('effect binding and history', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        jest.useRealTimers();
        engine.dispose();
    });

    function makeSystem(): ParticleSystem {
        return new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(10),
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: null,
        });
    }

    it('notifies subscribers and bumps the revision on every change', () => {
        const binding = new EffectBinding(makeSystem());
        const seen: number[] = [];
        const unsubscribe = binding.subscribe(() => seen.push(binding.getRevision()));
        binding.apply((s) => (s.duration = 3));
        binding.markChanged();
        expect(seen).toEqual([1, 2]);
        expect(binding.system.duration).toBe(3);
        unsubscribe();
        binding.apply((s) => (s.duration = 4));
        expect(seen).toEqual([1, 2]);
    });

    it('keeps sub systems and can promote one to main', () => {
        const main = makeSystem();
        const sub = makeSystem();
        const binding = new EffectBinding(main, [sub]);
        expect(binding.subSystems).toEqual([sub]);
        binding.promoteToMain(sub);
        expect(binding.system).toBe(sub);
        expect(binding.subSystems).toEqual([main]);
        binding.promoteToMain(makeSystem());
        expect(binding.system).toBe(sub);
        binding.removeSubSystem(main);
        expect(binding.subSystems).toEqual([]);
    });

    it('exports JSON the loader reads back with the same settings', () => {
        const system = makeSystem();
        system.duration = 2.5;
        system.addBehavior(
            new SizeOverLife(buildScalar({mode: 'curve', value: 0, min: 0, max: 0, curve: [1, 0.8, 0.3, 0]}))
        );
        const binding = new EffectBinding(system);
        const json = JSON.parse(binding.exportJSON('fx'));
        const root = new QuarksLoader(scene).parse(json);
        const loaded = (root.getChildren(undefined, false).find((n) => 'system' in n) ?? root) as unknown as {
            system: ParticleSystem;
        };
        expect(loaded.system.duration).toBe(2.5);
        expect(loaded.system.behaviors.map((b) => b.type)).toEqual(['SizeOverLife']);
    });

    it('captures snapshots, coalesces bursts, and walks undo and redo', () => {
        jest.useFakeTimers();
        jest.setSystemTime(1000);
        const system = makeSystem();
        const binding = new EffectBinding(system);
        const history = new EffectHistory();
        history.attach(binding);
        expect(history.canUndo).toBe(false);
        expect(history.undo()).toBeNull();

        binding.apply((s) => (s.duration = 2));
        jest.setSystemTime(1100);
        binding.apply((s) => (s.duration = 3)); // same burst: no new snapshot
        expect(history.saveStacks().undo).toHaveLength(1);
        jest.setSystemTime(2000);
        binding.apply((s) => (s.duration = 4));
        expect(history.saveStacks().undo).toHaveLength(2);
        expect(history.canRedo).toBe(false);

        const previous = history.undo() as {duration?: number; emitters?: unknown};
        expect(history.canRedo).toBe(true);
        expect(JSON.stringify(previous)).toContain('"duration":3');
        const next = history.redo();
        expect(JSON.stringify(next)).toContain('"duration":4');
        expect(history.canRedo).toBe(false);

        const stacks = history.saveStacks();
        history.clear();
        expect(history.canUndo).toBe(false);
        history.restoreStacks(stacks);
        expect(history.canUndo).toBe(true);
        history.restoreStacks(undefined);
        expect(history.canUndo).toBe(false);
    });

    it('drops the oldest snapshot past the depth limit', () => {
        jest.useFakeTimers();
        const binding = new EffectBinding(makeSystem());
        const history = new EffectHistory();
        history.attach(binding);
        for (let i = 0; i < 60; i++) {
            jest.setSystemTime(10000 + i * 1000);
            binding.apply((s) => (s.duration = i));
        }
        expect(history.saveStacks().undo).toHaveLength(50);
    });
});

describe('project store helpers', () => {
    it('formats byte counts', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
        expect(formatBytes(null)).toBe('—');
    });
});
