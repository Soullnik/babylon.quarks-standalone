import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {ShaderSettings, shaderProgram} from '../src/shaderProgram';
import {blendFragmentGLSL, blendFragmentWGSL} from '../src/shaders/chunks/blend';
import {surfaceColorGLSL, surfaceColorWGSL} from '../src/shaders/chunks/surface';
import {shaderVariants} from '../src/shaderVariants';
import {RenderMode} from '../src/VFXBatch';

const TEXTURE = {} as BaseTexture;

function settings(overrides: Partial<ShaderSettings>): ShaderSettings {
    return {
        renderMode: RenderMode.BillBoard,
        texture: TEXTURE,
        reflectionAtlas: null,
        uTileCount: 1,
        vTileCount: 1,
        blendTiles: false,
        softParticles: false,
        materialAlphaTest: 0,
        materialTransparent: true,
        materialBlendMode: Constants.ALPHA_PREMULTIPLIED,
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

describe('premultiplied map', () => {
    it('compiles in with premultiplied blending and a texture only', () => {
        expect(defines({premultipliedMap: true})).toContain('MAP_PREMULTIPLIED');
        expect(defines({premultipliedMap: false})).not.toContain('MAP_PREMULTIPLIED');
        expect(defines({premultipliedMap: true, texture: null})).not.toContain('MAP_PREMULTIPLIED');
        for (const mode of [Constants.ALPHA_COMBINE, Constants.ALPHA_ADD, Constants.ALPHA_MULTIPLY]) {
            expect(defines({premultipliedMap: true, materialBlendMode: mode})).not.toContain('MAP_PREMULTIPLIED');
        }
    });

    it.each([
        ['GLSL', surfaceColorGLSL(true), blendFragmentGLSL('baseColor')],
        ['WGSL', surfaceColorWGSL(true), blendFragmentWGSL('baseColor')],
    ])("leaves the map's alpha out of the coverage and puts it on the output alpha (%s)", (_name, surface, blend) => {
        // The map's alpha is kept aside and the texel counts as fully covering...
        const kept = surface.indexOf('quarksMapAlpha = texColor.a;');
        expect(kept).toBeGreaterThan(-1);
        expect(surface.indexOf('texColor.a = 1.0;', kept)).toBeGreaterThan(kept);
        expect(surface.indexOf('baseColor *= texColor;', kept)).toBeGreaterThan(kept);
        // ...so the resolve multiplies the colour by the vertex alpha and fades, and only then
        // does the map's alpha go onto the alpha, where it lets the frame through.
        const colour = blend.search(/rgb \* baseColor\.a|rgb \*= baseColor\.a/);
        const alpha = blend.indexOf('baseColor.a *= quarksMapAlpha;');
        expect(colour).toBeGreaterThan(-1);
        expect(alpha).toBeGreaterThan(colour);
    });

    it('is among the variants the shader check compiles', () => {
        expect(shaderVariants().some((v) => v.program.defines.includes('MAP_PREMULTIPLIED'))).toBe(true);
    });
});
