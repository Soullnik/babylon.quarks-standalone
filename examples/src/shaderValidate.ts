/**
 * Compiles every shader program the library can produce (`shaderVariants()`),
 * in the language the page is asked for, on a real engine. Babylon does its own
 * shader processing and then hands the result to the browser's compiler, so
 * anything that reaches here has been validated by the same path a real frame
 * would take.
 *
 * `?lang=glsl` builds every variant on a WebGL2 engine, which compiles and links
 * each program itself: the result is final. `?lang=wgsl` builds them on a
 * WebGPU engine, which does not report compile errors, so the page hands the
 * WGSL Babylon produced to the Playwright runner, which compiles it in a page of
 * its own (see `scripts/validate-shaders.mjs`).
 *
 * Reports into window.__shaderSources for the runner to read.
 */
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {Engine} from '@babylonjs/core/Engines/engine';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';
import {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine';
import type {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';
import {Scene} from '@babylonjs/core/scene';
import {shaderVariants, type ShaderProgram} from 'babylon.quarks';

type Report = {
    name: string;
    vertex: string;
    fragment: string;
    /** Set when Babylon could not produce or (GLSL) compile the program. */
    error?: string;
    /** True when the engine compiled and linked the program itself, so no second pass is needed. */
    compiled: boolean;
};

const language = new URLSearchParams(location.search).get('lang') === 'glsl' ? 'glsl' : 'wgsl';
const canvas = document.getElementById('c') as HTMLCanvasElement;
let engine: AbstractEngine;
if (language === 'wgsl') {
    const webgpu = new WebGPUEngine(canvas);
    await webgpu.initAsync();
    engine = webgpu;
} else {
    engine = new Engine(canvas, false, {disableWebGL2Support: false});
}
// The shaders compile against a scene's engine state.
new Scene(engine);

type Case = {name: string; program: ShaderProgram};

// Self-test: deliberately invalid source. If this reports ok, the harness is not
// actually compiling anything and every other result is meaningless.
const broken: ShaderProgram = {
    ...shaderVariants()[0].program,
    name: 'quarksSelfTest',
    vertex: {
        glsl: 'attribute vec3 position;\nvoid main() { this is not glsl }',
        wgsl: '@vertex\nfn main(input: VertexInputs) -> FragmentInputs { this is not wgsl }',
    },
};
const cases: Case[] = [{name: 'SELF-TEST (must fail)', program: broken}, ...shaderVariants()];

const results: Report[] = [];
for (const [i, c] of cases.entries()) {
    const name = `probe${i}`;
    const store = language === 'wgsl' ? ShaderStore.ShadersStoreWGSL : ShaderStore.ShadersStore;
    store[name + 'VertexShader'] = c.program.vertex[language];
    store[name + 'FragmentShader'] = c.program.fragment[language];
    let failed = '';
    try {
        // createEffect rather than ShaderMaterial: the material only builds its
        // effect when something asks it to draw. On WebGPU a shader module is
        // created without throwing, so Babylon reports ready for source that
        // does not compile; the runner compiles the produced WGSL itself.
        const effect: Effect = engine.createEffect(
            {vertex: name, fragment: name},
            {
                attributes: c.program.attributes,
                uniformsNames: c.program.uniforms,
                samplers: c.program.samplers,
                defines: c.program.defines.map((d) => `#define ${d}`).join('\n'),
                shaderLanguage: language === 'wgsl' ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
                fallbacks: null,
                onCompiled: null,
                onError: (_effect, errors) => {
                    failed = errors || 'compile error';
                },
            },
            engine
        );

        const deadline = Date.now() + 20000;
        const done = () =>
            failed !== '' ||
            (language === 'wgsl' ? !!effect.vertexSourceCode : effect.isReady() || !!effect.getCompilationError());
        while (!done() && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, language === 'wgsl' ? 25 : 0));
        }
        const error = failed || effect.getCompilationError() || undefined;
        results.push({
            name: c.name,
            vertex: effect.vertexSourceCode,
            fragment: effect.fragmentSourceCode,
            error: error ?? (done() ? undefined : 'Babylon produced no source in time'),
            compiled: language === 'glsl',
        });
        if (language === 'glsl') {
            effect.dispose();
        }
    } catch (e) {
        results.push({name: c.name, vertex: '', fragment: '', error: String(e), compiled: language === 'glsl'});
    }
}

(window as unknown as {__shaderSources: {language: string; cases: Report[]}}).__shaderSources = {
    language,
    cases: results,
};
