import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
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
});
