import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, IntervalValue, PointEmitter} from 'quarks.core';
import {BabylonMetaData, ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {SETTINGS, settingsFromJSON} from '../src/system/settingsSchema';
import type {ParticleSystemJSONParameters} from '../src/system/types';
import {RenderMode} from '../src/VFXBatch';

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

/**
 * Where each constructor parameter is written and copied. TypeScript makes this list name every
 * parameter, so a new one fails to compile here until it is placed: in the settings table, or in
 * the code that handles the document's meta, the render mode's settings, the shape or the behaviors.
 */
const HANDLED_BY: Record<keyof ParticleSystemParameters, 'table' | 'elsewhere'> = {
    stopAction: 'table',
    looping: 'table',
    prewarm: 'table',
    prewarmTime: 'table',
    duration: 'table',
    startDelay: 'table',
    shape: 'elsewhere',
    startLife: 'table',
    startSpeed: 'table',
    startRotation: 'table',
    startSize: 'table',
    startColor: 'table',
    emissionOverTime: 'table',
    emissionOverDistance: 'table',
    emissionBursts: 'table',
    maxParticles: 'table',
    ringBufferMode: 'table',
    ringBufferLoopRange: 'table',
    onlyUsedByOther: 'table',
    behaviors: 'elsewhere',
    instancingGeometry: 'elsewhere',
    instancingIndices: 'elsewhere',
    instancingUVs: 'elsewhere',
    instancingUVs2: 'elsewhere',
    instancingNormals: 'elsewhere',
    renderMode: 'table',
    rendererEmitterSettings: 'elsewhere',
    material: 'elsewhere',
    texture: 'elsewhere',
    startTileIndex: 'table',
    uTileCount: 'table',
    vTileCount: 'table',
    blendTiles: 'table',
    softParticles: 'table',
    softFarFade: 'table',
    softNearFade: 'table',
    renderOrder: 'table',
    worldSpace: 'table',
    blendMode: 'table',
    transparent: 'table',
    depthTest: 'table',
    depthWrite: 'table',
    alphaTest: 'table',
    layerMask: 'table',
    pivot: 'table',
    flip: 'table',
    lighting: 'elsewhere',
    rim: 'elsewhere',
    mapUV: 'elsewhere',
    gradientMap: 'elsewhere',
    erosion: 'elsewhere',
    uvDistortion: 'elsewhere',
    playbackSpeed: 'table',
    cullingMode: 'table',
    scalingMode: 'table',
    seed: 'table',
    sortMode: 'table',
    alignToDirection: 'table',
    minParticleSize: 'table',
    maxParticleSize: 'table',
    renderingGroupId: 'table',
    applyFog: 'table',
    applyImageProcessing: 'table',
    renderFace: 'table',
    scene: 'elsewhere',
};

describe('settings table', () => {
    it('holds every parameter placed in it, once', () => {
        const inTable = Object.entries(HANDLED_BY)
            .filter(([, where]) => where === 'table')
            .map(([key]) => key)
            .sort();
        const params = SETTINGS.map((setting) => setting.param);
        expect(new Set(params).size).toBe(params.length);
        expect([...params].sort()).toEqual(inTable);
    });

    it.each([RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail, RenderMode.StretchedBillBoard])(
        "agrees with the constructor's defaults (render mode %s)",
        (renderMode) => {
            const ps = new ParticleSystem({scene, renderMode});
            for (const setting of SETTINGS) {
                if (setting.param === 'renderMode') continue;
                expect([setting.param, setting.isDefault(setting.get(ps))]).toEqual([setting.param, true]);
            }
            ps.dispose();
        }
    );

    it('writes only what differs from the defaults, besides the shape and its references', () => {
        const ps = new ParticleSystem({scene});
        const json = ps.toJSON({geometries: {}, materials: {}, textures: {}});
        expect(Object.keys(json).sort()).toEqual(['instancingGeometry', 'material', 'shape']);
        ps.dispose();
    });

    it('reads a file that leaves every optional setting out as the defaults', () => {
        const ps = new ParticleSystem({scene, duration: 3, uTileCount: 4, worldSpace: true});
        const meta: BabylonMetaData = {geometries: {}, materials: {}, textures: {}};
        const json = ps.toJSON(meta);
        expect(json).not.toHaveProperty('looping');
        expect(json).toMatchObject({duration: 3, uTileCount: 4, worldSpace: true});
        const loaded = ParticleSystem.fromJSON(json, meta, scene);
        for (const setting of SETTINGS) {
            expect([setting.param, setting.toJSON(setting.get(loaded))]).toEqual([
                setting.param,
                setting.toJSON(setting.get(ps)),
            ]);
        }
        loaded.dispose();
        ps.dispose();
    });

    it('still reads a file that writes every setting, as earlier releases did', () => {
        const json = {
            version: '3.0',
            autoDestroy: false,
            looping: false,
            prewarm: false,
            duration: 2,
            shape: new PointEmitter().toJSON(),
            startLife: new IntervalValue(1, 2).toJSON(),
            startSpeed: new ConstantValue(3).toJSON(),
            startRotation: new ConstantValue(0).toJSON(),
            startSize: new ConstantValue(1).toJSON(),
            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
            emissionOverTime: new ConstantValue(10).toJSON(),
            emissionOverDistance: new ConstantValue(0).toJSON(),
            emissionBursts: [],
            onlyUsedByOther: false,
            renderMode: RenderMode.BillBoard,
            renderOrder: 0,
            rendererEmitterSettings: {},
            layers: 0x0fffffff,
            startTileIndex: 0,
            uTileCount: 2,
            vTileCount: 2,
            blendTiles: false,
            softParticles: false,
            softFarFade: 0,
            softNearFade: 0,
            blending: 1,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            alphaTest: 0,
            behaviors: [],
            worldSpace: false,
        };
        const loaded = ParticleSystem.fromJSON(json as never, {geometries: {}, materials: {}, textures: {}}, scene);
        expect(loaded.looping).toBe(false);
        expect(loaded.duration).toBe(2);
        expect(loaded.uTileCount).toBe(2);
        expect(loaded.startLife).toBeInstanceOf(IntervalValue);
        loaded.dispose();
    });

    it('reads malformed or older values the way earlier releases did', () => {
        const read = settingsFromJSON({
            version: '3.0',
            applyFog: null,
            alignToDirection: 'yes',
            cullingMode: 'bogus',
            sortMode: 5,
            scalingMode: 'hierarchy',
            looping: 0,
            worldSpace: 1,
            prewarm: 'true',
            duration: '2',
            maxParticles: null,
            seed: 0,
            layers: '1',
            startTileIndex: 3,
            startLife: 2,
            emissionBursts: [{time: 0, count: 2, cycleCount: 4}],
            pivot: [1, 0],
            flip: 'x',
        } as unknown as ParticleSystemJSONParameters);
        expect(read).toMatchObject({
            looping: false,
            worldSpace: true,
            seed: 0,
            scalingMode: 'hierarchy',
            alignToDirection: false,
            cullingMode: 'always',
            sortMode: 'none',
        });
        for (const absent of ['applyFog', 'prewarm', 'duration', 'maxParticles', 'layerMask', 'flip']) {
            expect([absent, absent in read]).toEqual([absent, false]);
        }
        expect(read.startTileIndex).toEqual(new ConstantValue(3));
        expect(read.startLife).toEqual(new ConstantValue(2));
        expect(read.emissionBursts).toEqual([
            {time: 0, count: new ConstantValue(2), probability: 1, interval: 0.1, cycle: 4},
        ]);
        expect(read.pivot).toMatchObject({x: 1, y: 0, z: 0});
        expect(settingsFromJSON({version: '3.0', emissionBursts: 'none'} as never)).not.toHaveProperty(
            'emissionBursts'
        );
    });

    it('copies every setting into a clone without sharing generators', () => {
        const ps = new ParticleSystem({
            scene,
            startLife: new IntervalValue(1, 2),
            emissionBursts: [{time: 0, count: new ConstantValue(3), cycle: 1, interval: 0, probability: 1}],
            seed: 9,
            maxParticles: 40,
        });
        const copy = ps.clone();
        for (const setting of SETTINGS) {
            const original = setting.get(ps);
            const copied = setting.get(copy);
            expect([setting.param, setting.toJSON(copied)]).toEqual([setting.param, setting.toJSON(original)]);
            if (original !== null && typeof original === 'object') {
                expect([setting.param, copied === original]).toEqual([setting.param, false]);
            }
        }
        expect(copy.emissionBursts[0].count).not.toBe(ps.emissionBursts[0].count);
        copy.dispose();
        ps.dispose();
    });
});
