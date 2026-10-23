import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import type {BabylonMetaData} from '../src/ParticleSystem';
import {ParticleSystem} from '../src/ParticleSystem';
import {resolveGeometryData} from '../src/system/geometry';

describe('what a system reads from its material', () => {
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

    it('takes the first slot that holds a 2D texture', () => {
        const cube = new BaseTexture(scene);
        const diffuse = new Texture(null, scene);
        const system = new ParticleSystem({scene, material: {albedoTexture: cube, diffuseTexture: diffuse}});
        expect(system.texture).toBe(diffuse);
        system.dispose();
    });

    it('resolves a reflection atlas uuid in a material entry', () => {
        const atlas = new Texture(null, scene);
        const meta: BabylonMetaData = {textures: {}, materials: {}, geometries: {}};
        const json = new ParticleSystem({scene}).toJSON(meta);
        const material = meta.materials[json.material!];
        material.reflectionAtlas = 'atlas';
        meta.textures.atlas = atlas;
        const loaded = ParticleSystem.fromJSON(json, meta, {}, scene);
        expect(loaded.material?.reflectionAtlas).toBe(atlas);
        loaded.dispose();
    });
});

describe('resolveGeometryData', () => {
    it('reads the data of a three.js BufferGeometry given on its own', () => {
        const geometry = resolveGeometryData({
            attributes: {position: {array: [0, 0, 0, 1, 0, 0, 0, 1, 0]}, uv1: {array: [0, 0, 1, 0, 0, 1]}},
            index: {type: 'Uint16Array', array: [0, 1, 2]},
        });
        expect(Array.from(geometry.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        expect(geometry.indices).toBeInstanceOf(Uint16Array);
        expect(Array.from(geometry.uvs2!)).toEqual([0, 0, 1, 0, 0, 1]);
    });

    it('gives the default quad for a geometry it cannot read', () => {
        expect(resolveGeometryData({uuid: 'g', type: 'PlaneGeometry'}).positions).toHaveLength(12);
    });
});
