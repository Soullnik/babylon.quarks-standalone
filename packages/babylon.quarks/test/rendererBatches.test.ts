import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, PointEmitter} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {RenderMode, VFXBatch} from '../src/VFXBatch';

const STEP = 1 / 60;
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
        texture: null,
        ...parameters,
    });
}

function capacity(batch: VFXBatch): number {
    return (batch as unknown as {maxParticles: number}).maxParticles;
}

describe('render face', () => {
    function cullState(face: 'both' | 'front' | 'back', renderMode = RenderMode.Mesh) {
        const renderer = new BatchedRenderer('faces', scene);
        const ps = system({renderMode, renderFace: face});
        renderer.addSystem(ps);
        renderer.update(STEP);
        const material = renderer.batches[0].mesh.material!;
        return {backFaceCulling: material.backFaceCulling, cullBackFaces: material.cullBackFaces};
    }

    it('culls the faces a mesh particle does not draw', () => {
        expect(cullState('both').backFaceCulling).toBe(false);
        expect(cullState('front')).toEqual({backFaceCulling: true, cullBackFaces: true});
        expect(cullState('back')).toEqual({backFaceCulling: true, cullBackFaces: false});
    });

    it('leaves flat render modes two-sided and in one batch whatever the setting', () => {
        expect(cullState('front', RenderMode.BillBoard).backFaceCulling).toBe(false);
        expect(cullState('back', RenderMode.Trail).backFaceCulling).toBe(false);
        const renderer = new BatchedRenderer('flat', scene);
        renderer.addSystem(system({renderFace: 'front'}));
        renderer.addSystem(system());
        renderer.update(STEP);
        expect(renderer.batches).toHaveLength(1);
    });

    it('normalises an unknown face to both, and moves a mesh system to a matching batch when set', () => {
        const ps = system({renderMode: RenderMode.Mesh, renderFace: 'sideways' as never});
        expect(ps.renderFace).toBe('both');
        const renderer = new BatchedRenderer('switch', scene);
        renderer.addSystem(ps);
        renderer.update(STEP);
        ps.renderFace = 'front';
        renderer.update(STEP);
        expect(renderer.batches[renderer.systemToBatchIndex.get(ps)!].mesh.material!.backFaceCulling).toBe(true);
        expect(ps.toJSON().renderFace).toBe('front');
        ps.renderFace = 'both';
        expect(ps.toJSON()).not.toHaveProperty('renderFace');
    });
});

describe('batch meshes and buffers', () => {
    it('creates no placeholder mesh a batch throws away', () => {
        const renderer = new BatchedRenderer('meshes', scene);
        renderer.addSystem(system());
        renderer.addSystem(system({renderMode: RenderMode.Trail}));
        renderer.update(STEP);
        const names = scene.meshes.map((mesh) => mesh.name);
        expect(names).not.toContain('vfxBatch');
        expect(names.filter((name) => name === 'spriteBatch' || name === 'trailBatch')).toHaveLength(2);
    });

    it('halves buffers a burst grew once the batch has used under a quarter of them for a while', () => {
        const renderer = new BatchedRenderer('shrink', scene);
        const ps = system({
            looping: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(5000), cycle: 1, interval: 0, probability: 1}],
            startLife: new ConstantValue(0.1),
        });
        renderer.addSystem(ps);
        renderer.update(STEP);
        const batch = renderer.batches[0];
        expect(capacity(batch)).toBeGreaterThanOrEqual(5000);
        const grown = capacity(batch);
        for (let i = 0; i < VFXBatch.SHRINK_AFTER_FILLS + 10; i++) renderer.update(STEP);
        expect(capacity(batch)).toBe(grown / 2);
        for (let i = 0; i < VFXBatch.SHRINK_AFTER_FILLS * 6; i++) renderer.update(STEP);
        // Never below where it started.
        expect(capacity(batch)).toBe(1000);
    });

    it('keeps buffers a steady load uses', () => {
        const renderer = new BatchedRenderer('steady', scene);
        renderer.addSystem(
            system({emissionOverTime: new ConstantValue(1500), startLife: new ConstantValue(1), maxParticles: 1500})
        );
        for (let i = 0; i < 90; i++) renderer.update(STEP);
        const batch = renderer.batches[0];
        const steady = capacity(batch);
        for (let i = 0; i < VFXBatch.SHRINK_AFTER_FILLS + 10; i++) renderer.update(STEP);
        expect(capacity(batch)).toBe(steady);
    });

    it('shrinks trail buffers too', () => {
        const renderer = new BatchedRenderer('trail', scene);
        const ps = system({
            renderMode: RenderMode.Trail,
            looping: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(2000), cycle: 1, interval: 0, probability: 1}],
            startLife: new ConstantValue(0.1),
        });
        renderer.addSystem(ps);
        for (let i = 0; i < 3; i++) renderer.update(STEP);
        const batch = renderer.batches[0];
        const grown = capacity(batch);
        expect(grown).toBeGreaterThan(1024);
        for (let i = 0; i < VFXBatch.SHRINK_AFTER_FILLS * 8; i++) renderer.update(STEP);
        expect(capacity(batch)).toBe(1024);
    });

    it('exposes the batches and their index read-only', () => {
        const renderer = new BatchedRenderer('readonly', scene);
        const ps = system();
        renderer.addSystem(ps);
        expect(renderer.systemToBatchIndex.get(ps)).toBe(0);
        expect(renderer.batches).toHaveLength(1);
    });
});
