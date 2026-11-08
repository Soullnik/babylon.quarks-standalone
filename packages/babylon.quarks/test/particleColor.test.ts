import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import type {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {ShaderSettings, shaderProgram} from '../src/shaderProgram';
import {particleColorVertexDeclarationGLSL, particleColorVertexDeclarationWGSL} from '../src/shaders/chunks/colorSpace';
import {shaderVariants} from '../src/shaderVariants';
import {RenderMode} from '../src/VFXBatch';

/**
 * `particleColor` off: a particle drawn in the texture times the material colour alone, as Unity's
 * mesh shaders draw one. Measured in Unity 6 (a mesh particle, a white texture of alpha 0.8, lit
 * head-on): Legacy Diffuse, Specular, Bumped Diffuse, VertexLit, their Transparent and Cutout
 * variants, Mobile/Diffuse, Unlit/* and Standard draw a particle tinted (1, 0.5, 0.25) or faded to
 * alpha 0.4 exactly as a white one (ratio 1.000 in every channel; the cutout ones clip it at
 * 0.8 × material alpha, not 0.32); the particle and sprite shaders take the tint (0.216, 0.051,
 * the linear 0.5 and 0.25) and the fade (0.400).
 */
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

function settings(overrides: Partial<ShaderSettings>): ShaderSettings {
    return {
        renderMode: RenderMode.BillBoard,
        texture: null,
        reflectionAtlas: null,
        uTileCount: 1,
        vTileCount: 1,
        blendTiles: false,
        softParticles: false,
        materialAlphaTest: 0,
        materialTransparent: true,
        materialBlendMode: Constants.ALPHA_COMBINE,
        applyFog: false,
        applyImageProcessing: false,
        pivot: undefined,
        minParticleSize: 0,
        maxParticleSize: Infinity,
        lighting: undefined,
        rim: undefined,
        mapUV: undefined,
        uvDistortion: undefined,
        gradientMap: undefined,
        erosion: undefined,
        ...overrides,
    };
}

const defines = (overrides: Partial<ShaderSettings>) =>
    shaderProgram(settings(overrides), {depth: null, envAtlasReady: false, meshUV2: false}).defines;

function system(overrides: Partial<ParticleSystemParameters> = {}) {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 0.5, 0.25, 0.4)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        renderMode: RenderMode.Mesh,
        instancingGeometry: new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0]),
        ...overrides,
    });
}

describe('particleColor', () => {
    it.each([RenderMode.BillBoard, RenderMode.StretchedBillBoard, RenderMode.Mesh, RenderMode.Trail, RenderMode.Beam])(
        'off, compiles every render mode without the particle colour (render mode %s)',
        (renderMode) => {
            expect(defines({renderMode, particleColor: false})).toContain('NO_PARTICLE_COLOR');
            expect(defines({renderMode, particleColor: true})).not.toContain('NO_PARTICLE_COLOR');
            expect(defines({renderMode})).not.toContain('NO_PARTICLE_COLOR');
        }
    );

    it.each([
        ['GLSL', particleColorVertexDeclarationGLSL, /#ifdef NO_PARTICLE_COLOR\s*color = vec4\(1\.0\);\s*#endif/],
        ['WGSL', particleColorVertexDeclarationWGSL, /#ifdef NO_PARTICLE_COLOR\s*let color = vec4f\(1\.0\);/],
    ])('off, leaves the colour and alpha to the material colour (%s)', (_name, chunk, off) => {
        // The particle colour every vertex shader takes in, before the material colour multiplies it.
        expect(chunk).toMatch(off);
        expect(chunk.indexOf('NO_PARTICLE_COLOR')).toBeLessThan(chunk.indexOf('materialColor.rgb), color.a'));
    });

    it('defaults on, is saved only when off, and reads back', () => {
        const on = system();
        expect(on.particleColor).toBe(true);
        expect(on.toJSON({geometries: {}, materials: {}, textures: {}})).not.toHaveProperty('particleColor');
        const off = system({particleColor: false});
        const json = off.toJSON({geometries: {}, materials: {}, textures: {}});
        expect(json.particleColor).toBe(false);
        expect(off.clone().particleColor).toBe(false);
        on.particleColor = false;
        expect(on.particleColor).toBe(false);
    });

    it('splits batches, drops the mesh vertex colours with it, and compiles the define', () => {
        const renderer = new BatchedRenderer('r', scene);
        const colors = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
        const on = system({instancingColors: colors});
        const off = system({instancingColors: colors, particleColor: false});
        renderer.addSystem(on);
        renderer.addSystem(off);
        const batchOf = (s: ParticleSystem) => renderer.batches[renderer.systemToBatchIndex.get(s)!];
        expect(batchOf(on)).not.toBe(batchOf(off));
        expect(batchOf(on).settings.instancingColors).toBe(colors);
        expect(batchOf(off).settings.instancingColors).toBeUndefined();
        const definesOf = (s: ParticleSystem) =>
            (batchOf(s).mesh.material as ShaderMaterial).options.defines as string[];
        expect(definesOf(off)).toContain('NO_PARTICLE_COLOR');
        expect(definesOf(off)).not.toContain('MESH_COLOR');
        expect(definesOf(on)).not.toContain('NO_PARTICLE_COLOR');
        expect(definesOf(on)).toContain('MESH_COLOR');
        renderer.dispose();
    });

    it('loads from an effect file', () => {
        const root = new QuarksLoader(scene).parse({
            object: {
                uuid: 'root',
                type: 'ParticleEmitter',
                ps: {
                    version: '3.0',
                    shape: {type: 'point'},
                    startLife: {type: 'ConstantValue', value: 1},
                    particleColor: false,
                },
            },
        });
        const ps = (root as unknown as {system: ParticleSystem}).system;
        expect(ps.particleColor).toBe(false);
        QuarksLoader.disposeEffect(root);
    });

    it('has a shader variant without the particle colour, for the shader validation', () => {
        expect(shaderVariants().some((variant) => variant.program.defines.includes('NO_PARTICLE_COLOR'))).toBe(true);
    });
});
