import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Material} from '@babylonjs/core/Materials/material';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import type {ParticleMaterialSource} from '../src/system/materialResolve';
import {RenderMode} from '../src/VFXBatch';
import {shaderOptions} from './internals';

describe('material state', () => {
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

    const makeSystem = (parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
        new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(5),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            shape: new PointEmitter(),
            ...parameters,
        });

    const materialOf = (parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]>): Material => {
        const renderer = new BatchedRenderer('depth-test', scene);
        renderer.addSystem(makeSystem(parameters));
        renderer.update(1 / 60);
        return renderer.batches[0].mesh.material!;
    };

    const modes: Array<[string, RenderMode]> = [
        ['billboard', RenderMode.BillBoard],
        ['stretched billboard', RenderMode.StretchedBillBoard],
        ['mesh', RenderMode.Mesh],
        ['trail', RenderMode.Trail],
        ['beam', RenderMode.Beam],
    ];

    it.each(modes)('draws a %s over everything with depthTest: false', (_name, renderMode) => {
        expect(materialOf({renderMode, depthTest: false}).depthFunction).toBe(Constants.ALWAYS);
    });

    it.each(modes)('keeps the engine depth function for a %s by default', (_name, renderMode) => {
        expect(materialOf({renderMode}).depthFunction).toBe(0);
    });

    it('restores depthTest: false from JSON onto the material', () => {
        const json = makeSystem({renderMode: RenderMode.BillBoard, depthTest: false}).toJSON();
        const loaded = ParticleSystem.fromJSON(json, {textures: {}, materials: {}} as never, {}, scene);
        const renderer = new BatchedRenderer('depth-test-json', scene);
        renderer.addSystem(loaded);
        renderer.update(1 / 60);
        expect(renderer.batches[0].mesh.material!.depthFunction).toBe(Constants.ALWAYS);
    });

    describe('env atlas that loads after the batch is built', () => {
        const pendingAtlasSystem = () => {
            const atlas = new Texture('data:pending-atlas', scene, {noMipmap: true});
            const ready = jest.spyOn(atlas, 'isReady').mockReturnValue(false);
            const material: StandardMaterial & ParticleMaterialSource = new StandardMaterial('pending-env', scene);
            material.reflectionAtlas = atlas;
            const system = makeSystem({
                renderMode: RenderMode.Mesh,
                material,
                transparent: true,
                blendMode: Constants.ALPHA_COMBINE,
            });
            const renderer = new BatchedRenderer('pending-env', scene);
            renderer.addSystem(system);
            renderer.update(1 / 60);
            const load = () => {
                ready.mockReturnValue(true);
                atlas.onLoadObservable.notifyObservers(atlas);
            };
            return {renderer, load};
        };

        it('replaces the material and disposes the one it replaced', () => {
            const {renderer, load} = pendingAtlasSystem();
            const batch = renderer.batches[0];
            const before = batch.mesh.material!;
            const materialCount = scene.materials.length;

            load();

            const after = batch.mesh.material!;
            expect(after).not.toBe(before);
            expect(shaderOptions(after).defines).toContain('USE_ENVMAP_ATLAS');
            expect(scene.materials).not.toContain(before);
            expect(scene.materials.length).toBe(materialCount);
        });

        it('builds nothing when the batch was disposed before the atlas loaded', () => {
            const {renderer, load} = pendingAtlasSystem();
            renderer.dispose();
            const materialCount = scene.materials.length;

            load();

            expect(scene.materials.length).toBe(materialCount);
        });
    });
});
