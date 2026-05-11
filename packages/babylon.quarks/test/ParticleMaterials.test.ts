import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ParticleMeshPhysicsMaterial, ParticleMeshStandardMaterial} from '../src';

describe('ParticleMaterials', () => {
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

    it('creates ParticleMeshStandardMaterial with parameter overrides', () => {
        const material = new ParticleMeshStandardMaterial('standard', scene, {alpha: 0.5});
        expect(material.isParticleMeshStandardMaterial).toBe(true);
        expect(material.alpha).toBeCloseTo(0.5);
    });

    it('creates ParticleMeshPhysicsMaterial with parameter overrides', () => {
        const material = new ParticleMeshPhysicsMaterial('physics', scene, {metallic: 0.75});
        expect(material.isParticleMeshPhysicsMaterial).toBe(true);
        expect(material.metallic).toBeCloseTo(0.75);
    });
});
