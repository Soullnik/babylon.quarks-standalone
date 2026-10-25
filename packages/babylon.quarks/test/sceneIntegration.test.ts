import {Ray} from '@babylonjs/core/Culling/ray';
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplySequences,
    BehaviorFromJSON,
    BehaviorTypes,
    ConstantValue,
    IntervalValue,
    PointEmitter,
    TextureSequencer,
    Vector3,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/**
 * The settings a host reaches for to fit particles into its scene: where they
 * draw relative to everything else, which cameras see them, whether the
 * scene's fog reaches them, and how fast they run.
 */
describe('scene integration', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        engine.dispose();
    });

    function makeSystem(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(60),
            startLife: new ConstantValue(1),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: null,
            ...parameters,
        });
    }

    it('puts the render order, rendering group and layer mask on the batch mesh', () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = makeSystem({renderOrder: 7, renderingGroupId: 2, layerMask: 0x10});
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const mesh = renderer.batches[0].mesh;
        expect(mesh.alphaIndex).toBe(7);
        expect(mesh.renderingGroupId).toBe(2);
        expect(mesh.layerMask).toBe(0x10);
        // The shaders fog themselves; Babylon's mesh-level fog must stay out of the way.
        expect(mesh.applyFog).toBe(false);
        renderer.dispose();
    });

    it('keeps every batch mesh out of picking, collisions and scene serialization', () => {
        const renderer = new BatchedRenderer('r', scene);
        const modes = [
            RenderMode.BillBoard,
            RenderMode.StretchedBillBoard,
            RenderMode.Mesh,
            RenderMode.Trail,
            RenderMode.Beam,
        ];
        for (const renderMode of modes) {
            renderer.addSystem(makeSystem({renderMode}));
        }
        expect(renderer.batches.length).toBe(modes.length);
        for (const batch of renderer.batches) {
            expect(batch.mesh.isPickable).toBe(false);
            expect(batch.mesh.checkCollisions).toBe(false);
            expect(batch.mesh.doNotSerialize).toBe(true);
        }
        // A ray through the batches' base quad at the origin hits none of them.
        const hit = scene.pickWithRay(new Ray(new BVector3(0, 0, -5), new BVector3(0, 0, 1), 100));
        expect(renderer.batches.map((batch) => batch.mesh)).not.toContain(hit?.pickedMesh);
        renderer.dispose();
    });

    it('batches systems with different rendering groups apart', () => {
        const renderer = new BatchedRenderer('r', scene);
        renderer.addSystem(makeSystem({renderingGroupId: 0}));
        renderer.addSystem(makeSystem({renderingGroupId: 1}));
        renderer.addSystem(makeSystem({renderingGroupId: 1}));
        expect(renderer.batches).toHaveLength(2);
        renderer.dispose();
    });

    it('compiles fog into every render mode by default, toward black for additive blending', () => {
        const renderer = new BatchedRenderer('r', scene);
        const defines = (mode: RenderMode, blendMode: number): string[] => {
            const system = makeSystem({renderMode: mode, blendMode});
            renderer.addSystem(system);
            const batch = renderer.batches[renderer.batches.length - 1];
            const material = batch.mesh.material as ShaderMaterial;
            return material.options.defines;
        };
        expect(defines(RenderMode.BillBoard, Constants.ALPHA_ADD)).toEqual(
            expect.arrayContaining(['FOG', 'FOG_ADDITIVE'])
        );
        expect(defines(RenderMode.BillBoard, Constants.ALPHA_COMBINE)).toEqual(expect.arrayContaining(['FOG']));
        expect(defines(RenderMode.BillBoard, Constants.ALPHA_COMBINE)).not.toContain('FOG_ADDITIVE');
        expect(defines(RenderMode.Mesh, Constants.ALPHA_COMBINE)).toContain('FOG');
        expect(defines(RenderMode.StretchedBillBoard, Constants.ALPHA_COMBINE)).toContain('FOG');
        expect(defines(RenderMode.Trail, Constants.ALPHA_COMBINE)).toContain('FOG');
        renderer.dispose();
    });

    it('leaves fog out of a system that opts out, and batches it apart', () => {
        const renderer = new BatchedRenderer('r', scene);
        renderer.addSystem(makeSystem({applyFog: false}));
        renderer.addSystem(makeSystem());
        expect(renderer.batches).toHaveLength(2);
        const unfogged = renderer.batches[0].mesh.material as ShaderMaterial;
        expect(unfogged.options.defines).not.toContain('FOG');
        renderer.dispose();
    });

    it('scales the simulated time by the playback speed', () => {
        const half = makeSystem({
            playbackSpeed: 0.5,
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            emissionOverTime: new ConstantValue(0),
        });
        const full = makeSystem({
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            emissionOverTime: new ConstantValue(0),
        });
        for (let i = 0; i < 24; i++) {
            half.update(1 / 60);
            full.update(1 / 60);
        }
        expect(full.particles[0].age).toBeCloseTo(24 / 60, 6);
        expect(half.particles[0].age).toBeCloseTo(12 / 60, 6);
    });

    it('round-trips rendering group, fog and playback speed through JSON only when set', () => {
        const defaults = makeSystem().toJSON();
        expect(defaults.renderingGroupId).toBeUndefined();
        expect(defaults.applyFog).toBeUndefined();
        expect(defaults.playbackSpeed).toBeUndefined();

        const json = makeSystem({renderingGroupId: 3, applyFog: false, playbackSpeed: 2}).toJSON();
        expect(json.renderingGroupId).toBe(3);
        expect(json.applyFog).toBe(false);
        expect(json.playbackSpeed).toBe(2);

        const loaded = ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, scene);
        expect(loaded.renderingGroupId).toBe(3);
        expect(loaded.applyFog).toBe(false);
        expect(loaded.playbackSpeed).toBe(2);

        const cloned = loaded.clone();
        expect(cloned.renderingGroupId).toBe(3);
        expect(cloned.applyFog).toBe(false);
        expect(cloned.playbackSpeed).toBe(2);
    });

    it('serialises ApplySequences like any other behavior', () => {
        expect(BehaviorTypes.ApplySequences).toBeDefined();
        const behavior = new ApplySequences(0.01);
        const sequencer = new TextureSequencer(0.1, 0.1, new Vector3(1, 2, 3));
        behavior.appendSequencer(new IntervalValue(0, 1), sequencer);
        const json = behavior.toJSON();
        const loaded = BehaviorFromJSON(json, makeSystem()) as ApplySequences;
        expect(loaded).toBeInstanceOf(ApplySequences);
        expect(loaded.delay).toBe(0.01);
        expect(loaded.sequencers).toHaveLength(1);
    });
});
