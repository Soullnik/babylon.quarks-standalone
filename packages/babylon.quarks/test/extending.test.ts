import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Scene} from '@babylonjs/core/scene';
import type {Behavior, BehaviorJSON, EmitterShape, IParticleSystem, Particle, ShapeJSON} from '../src';
import {
    BatchedRenderer,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    loadPlugin,
    ParticleSystem,
    random,
    unloadPlugin,
} from '../src';
import {emptyMeta} from './internals';

// The examples of docs/EXTENDING.md, as written there.

/** Slows particles down in proportion to their speed: Unity's Limit Velocity "Drag". */
class Drag implements Behavior {
    type = 'Drag';

    constructor(public drag = 1) {}

    initialize(particle: Particle, system: IParticleSystem): void {}

    update(particle: Particle, delta: number): void {
        particle.velocity.multiplyScalar(Math.max(0, 1 - this.drag * delta));
    }

    frameUpdate(delta: number): void {}

    toJSON(): BehaviorJSON & {drag: number} {
        return {type: 'Drag', drag: this.drag};
    }

    clone(): Behavior {
        return new Drag(this.drag);
    }

    reset(): void {}
}

/** Emits along a line from `-length / 2` to `length / 2` on x, heading up: Niagara's Line shape. */
class LineEmitter implements EmitterShape {
    type = 'line';

    constructor(public length = 1) {}

    initialize(particle: Particle): void {
        particle.position.set((random() - 0.5) * this.length, 0, 0);
        particle.velocity.set(0, particle.startSpeed, 0);
    }

    update(system: IParticleSystem, delta: number): void {}

    toJSON(): ShapeJSON {
        return {type: 'line', length: this.length};
    }

    clone(): EmitterShape {
        return new LineEmitter(this.length);
    }
}

const plugin = {
    id: 'my-effects',
    initialize: () => {},
    behaviors: [
        {
            type: 'Drag',
            constructor: Drag,
            params: [['drag', ['number']]] as Array<[string, Array<'number'>]>,
            loadJSON: (json: BehaviorJSON) => new Drag((json as {drag?: number}).drag ?? 1),
        },
    ],
    emitterShapes: [
        {
            type: 'line',
            constructor: LineEmitter,
            params: [['length', ['number']]] as Array<[string, Array<'number'>]>,
            loadJSON: (json: ShapeJSON) => new LineEmitter((json as {length?: number}).length ?? 1),
        },
    ],
};

/** A subclass of a built-in with its own update: custom, so it runs its own code. */
class Fading extends ColorOverLife {
    update(particle: Particle, delta: number): void {
        super.update(particle, delta);
        particle.color.a *= 0.5;
    }
}

describe('extending quarks (docs/EXTENDING.md)', () => {
    let engine: NullEngine;
    let scene: Scene;
    beforeAll(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        loadPlugin(plugin);
    });
    afterAll(() => {
        unloadPlugin('my-effects');
        scene.dispose();
        engine.dispose();
    });

    const create = (drag: number, length: number) =>
        new ParticleSystem({
            scene,
            looping: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(10),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(100),
            shape: new LineEmitter(length),
            behaviors: [new Drag(drag)],
        });

    it('runs a custom behavior and shape in a renderer', () => {
        const renderer = new BatchedRenderer('extending', scene);
        const ps = create(2, 4);
        renderer.addSystem(ps);
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);
        expect(ps.particleNum).toBeGreaterThan(10);
        for (let i = 0; i < ps.particleNum; i++) {
            const p = ps.particles[i];
            expect(Math.abs(p.velocity.x)).toBe(0);
            // Drag only slows particles down from their start speed.
            expect(p.velocity.y).toBeGreaterThan(0);
            expect(p.velocity.y).toBeLessThan(10);
        }
        renderer.dispose();
        ps.dispose();
    });

    it('saves only non-default fields and reads them back through the plugin', () => {
        const ps = create(2, 4);
        const meta = emptyMeta();
        const json = ps.toJSON(meta);
        expect(json.shape).toEqual({type: 'line', length: 4});
        expect(json.behaviors).toEqual([{type: 'Drag', drag: 2}]);
        const defaults = create(1, 1).toJSON(emptyMeta());
        expect(defaults.shape).toEqual({type: 'line'});
        expect(defaults.behaviors).toEqual([{type: 'Drag'}]);

        const loaded = ParticleSystem.fromJSON(JSON.parse(JSON.stringify(json)), meta, scene);
        expect(loaded.emitterShape).toBeInstanceOf(LineEmitter);
        expect((loaded.emitterShape as LineEmitter).length).toBe(4);
        expect((loaded.behaviors[0] as Drag).drag).toBe(2);
        const copy = ps.clone();
        expect(copy.behaviors[0]).not.toBe(ps.behaviors[0]);
        expect((copy.behaviors[0] as Drag).drag).toBe(2);
        for (const s of [ps, loaded, copy]) s.dispose();
    });

    it("runs a built-in's subclass with its own update as written", () => {
        const renderer = new BatchedRenderer('extending-subclass', scene);
        const ps = create(0, 1);
        const white = new Gradient(
            [
                [{r: 1, g: 1, b: 1}, 0],
                [{r: 1, g: 1, b: 1}, 1],
            ],
            [
                [1, 0],
                [1, 1],
            ]
        );
        ps.behaviors = [new Fading(white)];
        renderer.addSystem(ps);
        for (let i = 0; i < 5; i++) renderer.update(1 / 60);
        expect(ps.particleNum).toBeGreaterThan(0);
        for (let i = 0; i < ps.particleNum; i++) {
            expect(ps.particles[i].color.a).toBeCloseTo(0.5, 6);
        }
        renderer.dispose();
        ps.dispose();
    });
});
