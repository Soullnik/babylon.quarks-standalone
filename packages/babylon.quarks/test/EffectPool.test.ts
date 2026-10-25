import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {
    ConstantValue,
    createSeededRandom,
    EmitSubParticleSystem,
    getRandomSource,
    IntervalValue,
    PointEmitter,
    setRandomSource,
    SphereEmitter,
    SubParticleEmitMode,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {EffectPool} from '../src/EffectPool';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksUtil} from '../src/QuarksUtil';
import {RenderMode} from '../src/VFXBatch';

describe('seeded systems, instantiate and the effect pool', () => {
    let engine: NullEngine;
    let scene: Scene;
    const STEP = 1 / 60;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        setRandomSource(null);
        engine.dispose();
    });

    function makeSystem(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            looping: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(5), cycle: 1, interval: 0, probability: 1}],
            startLife: new IntervalValue(0.2, 0.4),
            startSpeed: new IntervalValue(1, 3),
            startSize: new IntervalValue(0.1, 0.3),
            shape: new SphereEmitter({radius: 1}),
            renderMode: RenderMode.BillBoard,
            texture: null,
            ...parameters,
        });
    }

    /** Positions, sizes and ages of a system's particles after `frames` updates. */
    function snapshot(system: ParticleSystem, frames: number): number[] {
        for (let i = 0; i < frames; i++) {
            system.update(STEP);
        }
        const out: number[] = [];
        for (let i = 0; i < system.particleNum; i++) {
            const p = system.particles[i];
            out.push(p.position.x, p.position.y, p.position.z, p.size.x, p.age, p.life);
        }
        return out;
    }

    it('plays identically under the same seed and differently under another', () => {
        const a = snapshot(makeSystem({seed: 11}), 6);
        const b = snapshot(makeSystem({seed: 11}), 6);
        const c = snapshot(makeSystem({seed: 12}), 6);
        expect(a.length).toBeGreaterThan(0);
        expect(b).toEqual(a);
        expect(c).not.toEqual(a);
    });

    it('replays the same effect after a restart and leaves the global source alone', () => {
        const system = makeSystem({seed: 5, looping: false});
        const first = snapshot(system, 6);
        system.restart();
        expect(snapshot(system, 6)).toEqual(first);

        const marker = () => 0.5;
        setRandomSource(marker);
        system.restart();
        system.update(STEP);
        expect(getRandomSource()).toBe(marker);
    });

    it('makes unseeded systems reproducible through the global source', () => {
        setRandomSource(createSeededRandom(99));
        const a = snapshot(makeSystem(), 6);
        setRandomSource(createSeededRandom(99));
        const b = snapshot(makeSystem(), 6);
        expect(b).toEqual(a);
    });

    it('round-trips the seed through JSON only when set', () => {
        expect(makeSystem().toJSON().seed).toBeUndefined();
        const json = makeSystem({seed: 3}).toJSON();
        expect(json.seed).toBe(3);
        const loaded = ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, {}, scene);
        expect(loaded.seed).toBe(3);
        expect(loaded.clone().seed).toBe(3);
    });

    /** A root with a parent system that emits into a sub system on death. */
    function makeEffect(): {root: TransformNode; parent: ParticleSystem; sub: ParticleSystem} {
        const root = new TransformNode('effect', scene);
        const sub = makeSystem({
            onlyUsedByOther: true,
            shape: new PointEmitter(),
            emissionBursts: [{time: 0, count: new ConstantValue(2), cycle: 1, interval: 0, probability: 1}],
        });
        const parent = makeSystem({shape: new PointEmitter()});
        parent.addBehavior(new EmitSubParticleSystem(parent, false, sub.emitter, SubParticleEmitMode.Death, 1));
        parent.emitter.parent = root;
        sub.emitter.parent = root;
        return {root, parent, sub};
    }

    it('instantiate copies the tree and points sub emitters at the copies', () => {
        const {root, parent, sub} = makeEffect();
        parent.emitter.position.set(1, 2, 3);
        const copy = QuarksUtil.instantiate(root, 'copy');
        expect(copy.name).toBe('copy');
        const emitters = copy.getChildren().filter((n) => n instanceof ParticleEmitter) as ParticleEmitter[];
        expect(emitters).toHaveLength(2);
        expect(emitters.map((e) => e.system)).not.toContain(parent);
        expect(emitters.map((e) => e.system)).not.toContain(sub);
        const copiedParent = emitters.find((e) => !(e.system as ParticleSystem).onlyUsedByOther)!;
        const copiedSub = emitters.find((e) => (e.system as ParticleSystem).onlyUsedByOther)!;
        expect(copiedParent.position.asArray()).toEqual([1, 2, 3]);
        const behavior = (copiedParent.system as ParticleSystem).behaviors[0] as EmitSubParticleSystem;
        expect(behavior.subParticleSystem).toBe(copiedSub);
        expect(behavior.particleSystem).toBe(copiedParent.system);

        // The copy plays on its own: the original stays untouched.
        for (let i = 0; i < 40; i++) {
            (copiedParent.system as ParticleSystem).update(STEP);
            (copiedSub.system as ParticleSystem).update(STEP);
        }
        expect(parent.particleNum).toBe(0);
        expect(sub.particleNum).toBe(0);
    });

    it('isEffectFinished counts a looping system as finished once its emission ended and died out', () => {
        const root = new TransformNode('fx', scene);
        const system = makeSystem({looping: true, emissionOverTime: new ConstantValue(30), emissionBursts: []});
        system.emitter.parent = root;
        for (let i = 0; i < 10; i++) system.update(STEP);
        expect(QuarksUtil.isEffectFinished(root)).toBe(false);
        QuarksUtil.endEmit(root);
        expect(QuarksUtil.isEffectFinished(root)).toBe(false);
        for (let i = 0; i < 60; i++) system.update(STEP);
        expect(system.particleNum).toBe(0);
        expect(QuarksUtil.isEffectFinished(root)).toBe(true);
    });

    it('acquires, plays, auto-releases and reuses copies', () => {
        const renderer = new BatchedRenderer('r', scene);
        const {root} = makeEffect();
        root.setEnabled(false);
        const pool = new EffectPool(root, {renderer, prewarm: 2});
        expect(pool.idleCount).toBe(2);
        expect(renderer.batches.length).toBeGreaterThan(0);

        const anchor = new TransformNode('anchor', scene);
        const copy = pool.acquire(new BVector3(4, 0, 0), anchor)!;
        expect(copy).not.toBeNull();
        expect(copy.parent).toBe(anchor);
        expect(copy.position.x).toBe(4);
        expect(copy.isEnabled()).toBe(true);
        expect(pool.activeCount).toBe(1);
        expect(pool.idleCount).toBe(1);

        renderer.update(STEP);
        const systems: ParticleSystem[] = [];
        QuarksUtil.runOnAllParticleEmitters(copy, (e) => systems.push(e.system as ParticleSystem));
        expect(systems.some((s) => s.particleNum > 0)).toBe(true);

        // Parent particles live up to 0.4 s, then the sub particles another 0.4 s.
        for (let i = 0; i < 70; i++) renderer.update(STEP);
        expect(pool.activeCount).toBe(0);
        expect(pool.idleCount).toBe(2);
        expect(copy.isEnabled()).toBe(false);
        expect(copy.parent).toBeNull();

        // The same copy comes back and plays again from the start.
        const again = pool.acquire();
        expect(again).toBe(copy);
        renderer.update(STEP);
        expect(systems.some((s) => s.particleNum > 0)).toBe(true);
        pool.dispose();
        renderer.dispose();
    });

    it.each(['destroy', 'disable'] as const)('replays copies whose systems have stop action %s', (stopAction) => {
        const renderer = new BatchedRenderer('r', scene);
        const root = new TransformNode('fx', scene);
        const system = makeSystem({looping: false, stopAction});
        system.emitter.parent = root;
        const pool = new EffectPool(root, {renderer, maxSize: 1});
        for (let round = 0; round < 2; round++) {
            const copy = pool.acquire()!;
            expect(copy).not.toBeNull();
            let systemOfCopy: ParticleSystem | undefined;
            QuarksUtil.runOnAllParticleEmitters(copy, (e) => (systemOfCopy = e.system as ParticleSystem));
            // The pool keeps the authored stop action and skips it.
            expect(systemOfCopy!.stopAction).toBe(stopAction);
            for (let i = 0; i < 120; i++) renderer.update(STEP);
            expect(pool.activeCount).toBe(0);
            expect(copy.isDisposed()).toBe(false);
            expect(systemOfCopy!.emitter.isEnabled(false)).toBe(true);
        }
    });

    it('stops a looping copy gracefully, releases on demand, and respects maxSize', () => {
        const renderer = new BatchedRenderer('r', scene);
        const root = new TransformNode('fx', scene);
        const system = makeSystem({looping: true, emissionOverTime: new ConstantValue(30), emissionBursts: []});
        system.emitter.parent = root;
        const pool = new EffectPool(root, {renderer, maxSize: 1});

        const copy = pool.acquire()!;
        expect(pool.acquire()).toBeNull();
        for (let i = 0; i < 20; i++) renderer.update(STEP);
        expect(pool.activeCount).toBe(1);
        pool.stop(copy);
        // Still playing out its particles.
        renderer.update(STEP);
        expect(pool.activeCount).toBe(1);
        for (let i = 0; i < 60; i++) renderer.update(STEP);
        expect(pool.activeCount).toBe(0);
        expect(pool.idleCount).toBe(1);

        const next = pool.acquire()!;
        expect(next).toBe(copy);
        for (let i = 0; i < 5; i++) renderer.update(STEP);
        pool.release(next);
        expect(pool.activeCount).toBe(0);
        expect(next.isEnabled()).toBe(false);
        let live = 0;
        QuarksUtil.runOnAllParticleEmitters(next, (e) => (live += e.system.particleNum));
        expect(live).toBe(0);

        pool.dispose();
        expect(pool.acquire()).toBeNull();
        renderer.dispose();
    });
});
