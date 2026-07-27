import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';

/**
 * Picking the shader language a batch compiles in, and putting the source where
 * the engine will look for it.
 *
 * WebGPU speaks WGSL. Handing it GLSL is not an error — Babylon transpiles —
 * but the transpilers are two WASM modules it downloads from cdn.babylonjs.com
 * the first time a GLSL shader is compiled. That is a third-party request on
 * first draw, a hard failure under a Content-Security-Policy that does not list
 * the CDN or with no network at all, and a GLSL to SPIR-V to WGSL round trip
 * before the first particle appears. Shipping the WGSL means none of that
 * happens.
 *
 * The two languages live in separate stores keyed by the same name, so a scene
 * that somehow ran both would not collide.
 */
export interface ShaderSources {
    /** GLSL source, used on every WebGL engine. */
    glsl: string;
    /** WGSL source, used on WebGPU. */
    wgsl: string;
}

/** The language `engine` wants: WGSL on WebGPU, GLSL everywhere else. */
export function shaderLanguageFor(engine: AbstractEngine): ShaderLanguage {
    return engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
}

/**
 * Registers a vertex/fragment pair under `name` in the store for `language`,
 * and returns that language so the caller can pass it to the material.
 *
 * Registration is by name rather than per material instance: the sources only
 * depend on the render mode, so a fresh name per rebuild would grow the store
 * without bound and defeat Babylon's compiled-effect cache.
 */
export function registerShaders(
    name: string,
    vertex: ShaderSources,
    fragment: ShaderSources,
    language: ShaderLanguage
): void {
    if (language === ShaderLanguage.WGSL) {
        ShaderStore.ShadersStoreWGSL[name + 'VertexShader'] = vertex.wgsl;
        ShaderStore.ShadersStoreWGSL[name + 'FragmentShader'] = fragment.wgsl;
        return;
    }
    Effect.ShadersStore[name + 'VertexShader'] = vertex.glsl;
    Effect.ShadersStore[name + 'FragmentShader'] = fragment.glsl;
}
