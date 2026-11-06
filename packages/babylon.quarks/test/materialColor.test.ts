import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {validMaterialColor, validMaterialColorScale, WHITE_MATERIAL_COLOR} from '../src/system/normalize';
import {RenderMode} from '../src/VFXBatch';
import {emptyMeta} from './internals';

/**
 * The material colour (Unity's material Color and Tint Color) and its scale: part of the effect,
 * a live parameter of the batch, multiplied in the vertex shader (see colorSpace.test.ts).
 */
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

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        startLife: new ConstantValue(1),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        shape: new PointEmitter(),
        ...parameters,
    });
}

/** The material colour uniforms a batch's material holds. */
function written(material: ShaderMaterial): {color: number[]; scale: number} {
    const record = material as unknown as {
        _vectors4: Record<string, {x: number; y: number; z: number; w: number}>;
        _floats: Record<string, number>;
    };
    const v = record._vectors4['materialColor'];
    return {color: [v.x, v.y, v.z, v.w], scale: record._floats['materialColorScale']};
}

describe('material colour', () => {
    it('is white with a scale of 1 by default, and left out of the effect JSON then', () => {
        const ps = system();
        expect(ps.materialColor).toEqual({r: 1, g: 1, b: 1, a: 1});
        expect(ps.materialColorScale).toBe(1);
        const json = ps.toJSON(emptyMeta());
        expect(json).not.toHaveProperty('materialColor');
        expect(json).not.toHaveProperty('materialColorScale');
    });

    it('round-trips through the effect JSON and clone, and the value set is copied', () => {
        const color = new Color4(0.5, 0.25, 1, 0.75);
        const ps = system({materialColor: color, materialColorScale: 2});
        color.r = 0;
        expect(ps.materialColor).toEqual({r: 0.5, g: 0.25, b: 1, a: 0.75});
        const json = ps.toJSON(emptyMeta());
        expect(json.materialColor).toEqual([0.5, 0.25, 1, 0.75]);
        expect(json.materialColorScale).toBe(2);
        const read = ParticleSystem.fromJSON(JSON.parse(JSON.stringify(json)), emptyMeta(), scene);
        expect(read.materialColor).toEqual({r: 0.5, g: 0.25, b: 1, a: 0.75});
        expect(read.materialColorScale).toBe(2);
        const copy = ps.clone();
        expect(copy.materialColor).toEqual(ps.materialColor);
        expect(copy.materialColorScale).toBe(2);
        // The getter hands out a copy: editing it does not reach the system.
        ps.materialColor.g = 0;
        expect(ps.materialColor.g).toBe(0.25);
    });

    it('keeps every channel and the scale a finite number of at least 0', () => {
        expect(validMaterialColor(undefined)).toBe(WHITE_MATERIAL_COLOR);
        expect(validMaterialColor([1, 1, 1, 1])).toBe(WHITE_MATERIAL_COLOR);
        expect(validMaterialColor({r: 1, g: 1, b: 1, a: 1})).toBe(WHITE_MATERIAL_COLOR);
        expect(validMaterialColor([2, NaN, -1])).toEqual([2, 1, 1, 1]);
        expect(validMaterialColor({r: 0.5, g: 'x', b: Infinity, a: 0})).toEqual([0.5, 1, 1, 0]);
        expect(validMaterialColorScale(-1)).toBe(1);
        expect(validMaterialColorScale(NaN)).toBe(1);
        expect(validMaterialColorScale(0)).toBe(0);
        const ps = system();
        ps.materialColorScale = -3;
        expect(ps.materialColorScale).toBe(1);
    });

    it.each([RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail])(
        "is written to the batch's material, and splits batches but not shaders (mode %s)",
        (renderMode) => {
            const renderer = new BatchedRenderer('material colour', scene);
            const plain = system({renderMode});
            const doubled = system({
                renderMode,
                materialColor: {r: 0.5, g: 0.5, b: 0.5, a: 0.5},
                materialColorScale: 2,
            });
            renderer.addSystem(plain);
            renderer.addSystem(doubled);
            expect(renderer.batches).toHaveLength(2);
            const [a, b] = renderer.batches.map((batch) => batch.mesh.material as ShaderMaterial);
            expect(written(a)).toEqual({color: [1, 1, 1, 1], scale: 1});
            expect(written(b)).toEqual({color: [0.5, 0.5, 0.5, 0.5], scale: 2});
            expect(a.options.defines).toEqual(b.options.defines);

            // A system alone in its batch takes a new colour in place, on the same material.
            doubled.materialColor = {r: 1, g: 0, b: 0, a: 1};
            renderer.update(1 / 60);
            const batch = renderer.batches.find((candidate) => candidate.mesh.material === b);
            expect(batch).toBeDefined();
            expect(written(b).color).toEqual([1, 0, 0, 1]);
            for (const disposable of [renderer, plain, doubled]) disposable.dispose();
        }
    );
});
