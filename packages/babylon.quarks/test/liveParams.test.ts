import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter} from 'quarks.core';
import {BatchedRenderer, VFXBatchSettings} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';
import {notifyBind} from './internals';

/**
 * A live parameter (see `liveParamsEqual`) changed on a system alone in its batch is written into
 * the batch's material in place. The material must then hold exactly the uniforms a material
 * built with the new settings holds: a live parameter the in-place path forgot to write would
 * leave the old value on screen.
 */

/** The uniform tables a ShaderMaterial keeps the values it was given in. */
const UNIFORM_TABLES = [
    '_floats',
    '_ints',
    '_vectors2',
    '_vectors3',
    '_vectors4',
    '_colors3',
    '_colors4',
    '_floatsArrays',
];

/** The uniforms after the material is bound for a draw, which is when the per-frame ones are written. */
function uniforms(material: ShaderMaterial): Record<string, unknown> {
    notifyBind(material);
    const out: Record<string, unknown> = {};
    const record = material as unknown as Record<string, Record<string, unknown>>;
    for (const table of UNIFORM_TABLES) {
        for (const [name, value] of Object.entries(record[table] ?? {})) {
            out[`${table}.${name}`] = JSON.parse(JSON.stringify(value));
        }
    }
    return out;
}

describe('live parameters written in place', () => {
    let engine: NullEngine;
    let scene: Scene;
    let textures: Record<string, Texture>;
    beforeAll(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        textures = {
            mask: new Texture(null, scene),
            ramp: new Texture(null, scene),
            noise: new Texture(null, scene),
            depth: new Texture(null, scene),
        };
    });
    afterAll(() => {
        scene.dispose();
        engine.dispose();
    });

    const uv = () => ({
        channel: 0 as const,
        tiling: [1, 1] as [number, number],
        offset: [0, 0] as [number, number],
        scroll: [0, 0] as [number, number],
    });

    /** Every live parameter in use, so that each one has a uniform to write. */
    function system(renderMode: RenderMode): ParticleSystem {
        const ps = new ParticleSystem({
            scene,
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            startLife: new ConstantValue(1),
            shape: new PointEmitter(),
            renderMode,
            softParticles: true,
            softNearFade: 0.1,
            softFarFade: 1,
        });
        ps.alphaTest = 0.5;
        if (renderMode !== RenderMode.Mesh) {
            ps.pivot = {x: 0.5, y: 0, z: 0};
            ps.minParticleSize = 0.01;
            ps.maxParticleSize = 0.5;
        } else {
            ps.rim = {color: [1, 1, 1], power: 2, strength: 1, mode: 'add'};
        }
        ps.mapUV = {tiling: [2, 2]};
        ps.uvDistortion = {map: textures.noise, mapUV: uv(), strength: 0.1};
        ps.gradientMap = {ramp: textures.ramp, channel: 'r'};
        ps.erosion = {mask: textures.mask, maskUV: uv(), softness: 0.1, edgeWidth: 0.1, edgeColor: [1, 0.5, 0]};
        return ps;
    }

    // The reflection level needs a loaded env atlas; batchKey.test.ts checks it is written in place.
    const changes: Array<[string, RenderMode, (s: VFXBatchSettings) => void]> = [
        ['softNearFade', RenderMode.BillBoard, (s) => (s.softNearFade = 0.2)],
        ['softFarFade', RenderMode.BillBoard, (s) => (s.softFarFade = 2)],
        ['materialAlphaTest', RenderMode.BillBoard, (s) => (s.materialAlphaTest = 0.25)],
        ['pivot', RenderMode.BillBoard, (s) => (s.pivot = {x: 0, y: 0.5, z: 0})],
        ['minParticleSize', RenderMode.BillBoard, (s) => (s.minParticleSize = 0.02)],
        ['maxParticleSize', RenderMode.BillBoard, (s) => (s.maxParticleSize = 0.25)],
        ['rim', RenderMode.Mesh, (s) => (s.rim = {color: [0, 1, 0], power: 3, strength: 0.5, mode: 'add'})],
        ['mapUV', RenderMode.BillBoard, (s) => (s.mapUV = {...uv(), tiling: [3, 1], scroll: [0.5, 0]})],
        ['uvDistortion.strength', RenderMode.BillBoard, (s) => (s.uvDistortion = {...s.uvDistortion!, strength: 0.3})],
        [
            'uvDistortion.mapUV',
            RenderMode.BillBoard,
            (s) => (s.uvDistortion = {...s.uvDistortion!, mapUV: {...uv(), offset: [0.5, 0]}}),
        ],
        ['gradientMap.channel', RenderMode.BillBoard, (s) => (s.gradientMap = {...s.gradientMap!, channel: 'a'})],
        ['erosion.softness', RenderMode.BillBoard, (s) => (s.erosion = {...s.erosion!, softness: 0.3})],
        ['erosion.edgeWidth', RenderMode.BillBoard, (s) => (s.erosion = {...s.erosion!, edgeWidth: 0.2})],
        ['erosion.edgeColor', RenderMode.BillBoard, (s) => (s.erosion = {...s.erosion!, edgeColor: [0, 0, 1]})],
        [
            'erosion.maskUV',
            RenderMode.BillBoard,
            (s) => (s.erosion = {...s.erosion!, maskUV: {...uv(), tiling: [2, 1]}}),
        ],
    ];

    it.each(changes)('%s: in place, as a fresh material would hold it', (_name, renderMode, change) => {
        const live = new BatchedRenderer('live', scene);
        live.setDepthTexture(textures.depth);
        const a = system(renderMode);
        live.addSystem(a);
        const material = live.batches[0].mesh.material as ShaderMaterial;
        const before = uniforms(material);
        change(a.getRendererSettings());
        live.updateSystem(a);
        expect(live.batches).toHaveLength(1);
        expect(live.batches[0].mesh.material).toBe(material);
        const after = uniforms(material);
        expect(after).not.toEqual(before);

        const fresh = new BatchedRenderer('fresh', scene);
        fresh.setDepthTexture(textures.depth);
        const b = system(renderMode);
        change(b.getRendererSettings());
        fresh.addSystem(b);
        expect(after).toEqual(uniforms(fresh.batches[0].mesh.material as ShaderMaterial));

        for (const disposable of [live, fresh, a, b]) disposable.dispose();
    });
});
