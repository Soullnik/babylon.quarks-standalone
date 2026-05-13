import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {SpriteParticle} from 'quarks.core';
import {MeshSurfaceEmitter} from '../src/MeshSurfaceEmitter';

describe('MeshSurfaceEmitter', () => {
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

    it('samples positions on box mesh surface bounds', () => {
        const box = MeshBuilder.CreateBox('box', {size: 2}, scene);
        const emitter = new MeshSurfaceEmitter(box);
        const particle = new SpriteParticle();
        particle.startSpeed = 1;

        for (let i = 0; i < 40; i++) {
            emitter.initialize(particle);
            expect(particle.position.x).toBeLessThanOrEqual(1.01);
            expect(particle.position.y).toBeLessThanOrEqual(1.01);
            expect(particle.position.z).toBeLessThanOrEqual(1.01);
            expect(particle.position.x).toBeGreaterThanOrEqual(-1.01);
            expect(particle.position.y).toBeGreaterThanOrEqual(-1.01);
            expect(particle.position.z).toBeGreaterThanOrEqual(-1.01);
            expect(particle.velocity.length()).toBeGreaterThan(0.9);
        }
    });

    it('supports JSON round-trip reference id', () => {
        const emitter = MeshSurfaceEmitter.fromJSON({type: 'mesh_surface', mesh: 'mesh-ref-id'});
        const json = emitter.toJSON();
        expect(json.type).toBe('mesh_surface');
        expect(json.mesh).toBe('mesh-ref-id');
    });

    it('falls back when mesh has no position or index data', () => {
        const emptyMesh = new Mesh('empty-surface', scene);
        const emitter = new MeshSurfaceEmitter(emptyMesh);
        const particle = new SpriteParticle();
        particle.startSpeed = 2;
        emitter.initialize(particle);
        expect(particle.position.x).toBe(0);
        expect(particle.velocity.z).toBeGreaterThan(0);
    });

    it('exposes mesh assignment and clone preserves references', () => {
        const box = MeshBuilder.CreateBox('clone-box', {size: 1}, scene);
        const emitter = new MeshSurfaceEmitter(box);
        expect(emitter.mesh).toBe(box);
        const copy = emitter.clone() as MeshSurfaceEmitter;
        expect(copy.mesh).toBe(box);
    });

    it('serializes mesh surface emitter with live mesh unique id', () => {
        const box = MeshBuilder.CreateBox('json-box', {size: 1}, scene);
        const emitter = new MeshSurfaceEmitter(box);
        const json = emitter.toJSON();
        expect(json.mesh).toBe(String((box as any).uniqueId));
    });

    it('mesh setter returns early when clearing mesh reference', () => {
        const box = MeshBuilder.CreateBox('ms-clear', {size: 1}, scene);
        const emitter = new MeshSurfaceEmitter(box);
        emitter.mesh = undefined;
        expect(emitter.mesh).toBeUndefined();
    });
});
