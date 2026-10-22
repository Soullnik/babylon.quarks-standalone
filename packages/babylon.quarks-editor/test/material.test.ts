import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {applyRendererMaterial, getMaterialLabel} from '../src/core/material';
import {makeSystem, useScene} from './helpers';

describe('renderer material patch', () => {
    const scene = useScene();

    it('writes every field of the patch to the renderer settings', () => {
        const system = makeSystem(scene.get());
        const texture = new Texture(null, scene.get());
        const atlas = new Texture(null, scene.get());
        system.neededToUpdateRender = false;
        applyRendererMaterial(system, {
            blendMode: Constants.ALPHA_COMBINE,
            transparent: false,
            depthTest: false,
            depthWrite: true,
            alphaTest: 0.5,
            texture,
            reflectionAtlas: atlas,
            reflectionLevel: 0.3,
        });
        const settings = system.getRendererSettings();
        expect(system.blending).toBe(Constants.ALPHA_COMBINE);
        expect(settings.materialTransparent).toBe(false);
        expect(settings.materialDepthTest).toBe(false);
        expect(settings.materialDepthWrite).toBe(true);
        expect(settings.materialAlphaTest).toBe(0.5);
        expect(settings.texture).toBe(texture);
        expect(settings.reflectionAtlas).toBe(atlas);
        expect(settings.reflectionLevel).toBe(0.3);
        expect(system.neededToUpdateRender).toBe(true);
    });

    it('leaves fields out of the patch alone', () => {
        const system = makeSystem(scene.get(), {blendMode: Constants.ALPHA_ADD});
        applyRendererMaterial(system, {depthWrite: true});
        expect(system.blending).toBe(Constants.ALPHA_ADD);
        expect(system.getRendererSettings().materialDepthWrite).toBe(true);
        expect(system.getRendererSettings().materialTransparent).toBe(true);
    });

    it('keeps an imported material record in sync for export', () => {
        const system = makeSystem(scene.get());
        const record: Record<string, unknown> = {type: 'QuarksMaterial', name: 'glow'};
        system.material = record;
        const texture = new Texture(null, scene.get());
        applyRendererMaterial(system, {
            blendMode: 2,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            alphaTest: 0.1,
            texture,
            reflectionAtlas: null,
            reflectionLevel: 1,
        });
        expect(record).toMatchObject({
            alphaMode: 2,
            blending: 2,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            alphaTest: 0.1,
            texture,
            map: texture,
            reflectionAtlas: null,
            reflectionLevel: 1,
        });
    });

    it('does not write into a live Babylon material', () => {
        const system = makeSystem(scene.get());
        const material = new StandardMaterial('m', scene.get());
        system.material = material;
        applyRendererMaterial(system, {blendMode: 2});
        expect((material as unknown as {blending?: number}).blending).toBeUndefined();
        expect(system.blending).toBe(2);
    });
});

describe('material labels', () => {
    const scene = useScene();

    it('names records, live materials and nothing', () => {
        expect(getMaterialLabel(null)).toBeNull();
        expect(getMaterialLabel({type: 'QuarksMaterial', name: 'glow'})).toBe('glow (QuarksMaterial)');
        expect(getMaterialLabel({type: 'MeshBasicMaterial'})).toBe('MeshBasicMaterial');
        expect(getMaterialLabel({})).toBe('QuarksMaterial');
        expect(getMaterialLabel(new StandardMaterial('named', scene.get()))).toBe('named');
        const unnamed = new StandardMaterial('', scene.get());
        expect(getMaterialLabel(unnamed)).toBe('StandardMaterial');
        expect(getMaterialLabel({getClassName: () => 'X', name: ''} as never)).toBe('X');
        expect(getMaterialLabel(Object.assign(Object.create({getClassName: 1}), {}) as never)).toBe('Material');
    });
});
