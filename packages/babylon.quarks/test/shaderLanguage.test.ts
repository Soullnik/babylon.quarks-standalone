import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {registerShaders, shaderLanguageFor} from '../src/shaders/shaderLanguageSupport';
import {RenderMode} from '../src/VFXBatch';

import meshVertWgsl from '../src/shaders/local_particle_physics_vert.wgsl';
import particleFragWgsl from '../src/shaders/particle_frag.wgsl';
import particlePhysicsFragWgsl from '../src/shaders/particle_physics_frag.wgsl';
import particleVertGlsl from '../src/shaders/particle_vert.glsl';
import particleVertWgsl from '../src/shaders/particle_vert.wgsl';
import stretchedVertWgsl from '../src/shaders/stretched_bb_particle_vert.wgsl';
import trailFragWgsl from '../src/shaders/trail_frag.wgsl';
import trailVertWgsl from '../src/shaders/trail_vert.wgsl';

/**
 * WebGPU speaks WGSL. Handing it GLSL works, but only because Babylon downloads
 * two transpiler WASM modules from cdn.babylonjs.com on the first compile — a
 * third-party request on first draw and a hard failure offline or under a CSP
 * that does not list the CDN. Shipping WGSL is what keeps that from happening.
 *
 * These tests cannot run a GPU. Whether the WGSL is *correct* is checked by
 * examples/wgsl-validate.html, which puts every shader through Babylon's own
 * WGSL processor and a browser's shader compiler.
 */

const wgslShaders: Array<[string, string]> = [
    ['particle_vert', particleVertWgsl],
    ['particle_frag', particleFragWgsl],
    ['particle_physics_frag', particlePhysicsFragWgsl],
    ['stretched_bb_particle_vert', stretchedVertWgsl],
    ['local_particle_physics_vert', meshVertWgsl],
    ['trail_vert', trailVertWgsl],
    ['trail_frag', trailFragWgsl],
];

const fakeEngine = (isWebGPU: boolean) => ({isWebGPU}) as unknown as AbstractEngine;

describe('shader language selection', () => {
    it('asks for WGSL on WebGPU and GLSL everywhere else', () => {
        expect(shaderLanguageFor(fakeEngine(true))).toBe(ShaderLanguage.WGSL);
        expect(shaderLanguageFor(fakeEngine(false))).toBe(ShaderLanguage.GLSL);
    });

    it('puts each language in the store the engine reads', () => {
        const sources = {
            vertex: {glsl: 'GLSL VERTEX', wgsl: 'WGSL VERTEX'},
            fragment: {glsl: 'GLSL FRAGMENT', wgsl: 'WGSL FRAGMENT'},
        };
        registerShaders('storeTestA', sources.vertex, sources.fragment, ShaderLanguage.GLSL);
        expect(Effect.ShadersStore['storeTestAVertexShader']).toBe('GLSL VERTEX');
        expect(Effect.ShadersStore['storeTestAFragmentShader']).toBe('GLSL FRAGMENT');
        expect(ShaderStore.ShadersStoreWGSL['storeTestAVertexShader']).toBeUndefined();

        registerShaders('storeTestB', sources.vertex, sources.fragment, ShaderLanguage.WGSL);
        expect(ShaderStore.ShadersStoreWGSL['storeTestBVertexShader']).toBe('WGSL VERTEX');
        expect(ShaderStore.ShadersStoreWGSL['storeTestBFragmentShader']).toBe('WGSL FRAGMENT');
        expect(Effect.ShadersStore['storeTestBVertexShader']).toBeUndefined();
    });

    it('registers GLSL for a batch built on a non-WebGPU engine', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const renderer = new BatchedRenderer('language-test', scene);
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(10),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
        });
        renderer.addSystem(system);
        system.play();
        renderer.update(1 / 60);

        const name = `quarksParticle_${RenderMode.BillBoard}VertexShader`;
        expect(Effect.ShadersStore[name]).toBe(particleVertGlsl);
        expect(ShaderStore.ShadersStoreWGSL[name]).toBeUndefined();

        renderer.dispose();
        scene.dispose();
        engine.dispose();
    });
});

describe('the WGSL sources', () => {
    for (const [name, source] of wgslShaders) {
        describe(name, () => {
            it('declares a WGSL entry point', () => {
                expect(/@(vertex|fragment)\s/.test(source)).toBe(true);
                expect(source).toContain('fn main(');
            });

            it('carries no GLSL left over from the port', () => {
                // The failure this guards against is a GLSL shader edited and
                // pasted into the .wgsl file, which no test here could compile.
                expect(source).not.toMatch(/\battribute\s+(vec|float|mat)/);
                expect(source).not.toMatch(/\bvarying\s+(vec|float|mat)/);
                expect(source).not.toContain('gl_Position');
                expect(source).not.toContain('gl_FragColor');
                expect(source).not.toContain('texture2D(');
                expect(source).not.toContain('uniform sampler2D');
            });

            it('assigns no swizzles, which WGSL forbids', () => {
                // The single easiest GLSL habit to carry over, and the one that
                // silently produces source no browser will compile.
                expect(source).not.toMatch(/\.[xyzwrgba]{2,4}\s*(=|\+=|-=|\*=|\/=)[^=]/);
            });
        });
    }
});
