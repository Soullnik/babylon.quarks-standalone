import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    PointEmitter,
    SubParticleEmitMode,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

function emitterJSON(uuid: string, behaviors: unknown[]) {
    return {
        uuid,
        name: uuid,
        type: 'ParticleEmitter',
        ps: {
            version: '3.0',
            autoDestroy: false,
            looping: true,
            prewarm: false,
            duration: 1,
            shape: {type: 'point'},
            startLife: {type: 'ConstantValue', value: 0.1},
            startSpeed: {type: 'ConstantValue', value: 0},
            startRotation: {type: 'ConstantValue', value: 0},
            startSize: {type: 'ConstantValue', value: 1},
            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
            emissionOverTime: {type: 'ConstantValue', value: 20},
            emissionOverDistance: {type: 'ConstantValue', value: 0},
            emissionBursts: [],
            onlyUsedByOther: false,
            renderOrder: 0,
            renderMode: 0,
            rendererEmitterSettings: {},
            layers: 1,
            startTileIndex: {type: 'ConstantValue', value: 0},
            uTileCount: 1,
            vTileCount: 1,
            behaviors,
            worldSpace: true,
        },
    };
}

const subEmitterBehavior = (target: string) => ({
    type: 'EmitSubParticleSystem',
    useVelocityAsBasis: false,
    subParticleSystem: target,
    mode: SubParticleEmitMode.Death,
    emitProbability: 1,
});

describe('dangling sub emitter', () => {
    it('is skipped, not thrown on, when the behavior holds an unresolved uuid', () => {
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(0.1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(20),
            emissionOverDistance: new ConstantValue(0),
            emissionBursts: [],
            shape: new PointEmitter(),
        });
        // What QuarksLoader used to leave when the uuid names no node in the file.
        system.addBehavior(
            new EmitSubParticleSystem(system, false, 'no-such-uuid' as never, SubParticleEmitMode.Death, 1)
        );
        system.play();
        expect(() => {
            for (let t = 0; t < 0.5; t += 1 / 60) system.update(1 / 60);
        }).not.toThrow();
        expect(system.particleNum).toBeGreaterThan(0);
    });

    it('is unlinked by the loader with one warning naming the emitter and the uuid', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const loader = new QuarksLoader(scene);
            const root = loader.parse({
                object: {
                    uuid: 'root',
                    type: 'Group',
                    children: [emitterJSON('parent', [subEmitterBehavior('missing-target')])],
                },
            });
            const parent = root.getChildren()[0] as ParticleEmitter;
            const behavior = (parent.system as ParticleSystem).behaviors[0] as EmitSubParticleSystem;
            expect(behavior.subParticleSystem).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain('parent');
            expect(String(warn.mock.calls[0][0])).toContain('missing-target');

            const renderer = new BatchedRenderer('dangling', scene);
            renderer.addSystem(parent.system);
            expect(() => {
                for (let i = 0; i < 30; i++) renderer.update(1 / 60);
            }).not.toThrow();
            renderer.dispose();
        } finally {
            warn.mockRestore();
        }
    });

    it('does not link a target node that is not a particle emitter', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const loader = new QuarksLoader(scene);
            const root = loader.parse({
                object: {
                    uuid: 'root',
                    type: 'Group',
                    children: [
                        emitterJSON('parent', [subEmitterBehavior('group')]),
                        {uuid: 'group', type: 'Group', children: []},
                    ],
                },
            });
            const parent = root.getChildren().find((c) => c instanceof ParticleEmitter) as ParticleEmitter;
            const behavior = (parent.system as ParticleSystem).behaviors[0] as EmitSubParticleSystem;
            expect(behavior.subParticleSystem).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain('not a particle emitter');
        } finally {
            warn.mockRestore();
        }
    });

    it('keeps the uuid of an unresolved target when serialised', () => {
        const system = new ParticleSystem({scene});
        const behavior = new EmitSubParticleSystem(system, false, 'kept-uuid' as never, SubParticleEmitMode.Birth, 1);
        expect(behavior.toJSON().subParticleSystem).toBe('kept-uuid');
    });
});
