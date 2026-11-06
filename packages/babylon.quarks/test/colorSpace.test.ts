import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {linearTexture, shaderProgram, ShaderSettings} from '../src/shaderProgram';
import {
    colorSpaceDeclarationGLSL,
    colorSpaceDeclarationWGSL,
    particleColorVertexDeclarationGLSL,
    particleColorVertexDeclarationWGSL,
} from '../src/shaders/chunks/colorSpace';
import {fogFragmentDeclarationWGSL, fogFragmentGLSL} from '../src/shaders/chunks/fog';
import {
    surfaceColorGLSL,
    surfaceColorWGSL,
    surfaceFragmentDeclarationGLSL,
    surfaceFragmentDeclarationWGSL,
} from '../src/shaders/chunks/surface';
import {shaderVariants} from '../src/shaderVariants';
import {normalizeErosion, normalizeGradientMap, normalizeMeshRim, RenderMode} from '../src/VFXBatch';

/**
 * Under the scene's image processing the shaders work in linear space, every colour brought there
 * on its own as it comes in, as Unity's Linear colour space does: the particle colour in the vertex
 * shader, each texel as it is sampled, each uniform colour where it is read.
 */
const GAMMA_TEXTURE = {} as BaseTexture;
const LINEAR_TEXTURE = {gammaSpace: false} as BaseTexture;

function settings(overrides: Partial<ShaderSettings>): ShaderSettings {
    return {
        renderMode: RenderMode.BillBoard,
        texture: GAMMA_TEXTURE,
        reflectionAtlas: null,
        uTileCount: 1,
        vTileCount: 1,
        blendTiles: false,
        softParticles: false,
        materialAlphaTest: 0,
        materialTransparent: true,
        materialBlendMode: Constants.ALPHA_COMBINE,
        applyFog: false,
        applyImageProcessing: true,
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

const program = (overrides: Partial<ShaderSettings>) =>
    shaderProgram(settings(overrides), {depth: null, envAtlasReady: true, meshUV2: false});

const RENDER_MODES = [
    RenderMode.BillBoard,
    RenderMode.StretchedBillBoard,
    RenderMode.Beam,
    RenderMode.Mesh,
    RenderMode.Trail,
];

/** The part of a shader source after its entry point. */
const mainOf = (source: string) => source.slice(source.search(/void main\(\)|fn main\(/));

describe('colour space', () => {
    it('works in linear space under image processing and in gamma space without it', () => {
        for (const declaration of [colorSpaceDeclarationGLSL, colorSpaceDeclarationWGSL]) {
            expect(declaration).toContain('#include<helperFunctions>');
            const [linear, gamma] = declaration.split('#else');
            expect(linear).toContain('#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)');
            // Babylon's conversions, which follow the engine's useExactSrgbConversions.
            expect(linear).toMatch(
                /quarksFromGamma\(color: vec3f\) -> vec3f \{ return toLinearSpaceVec3\(color\)|quarksFromGamma\(vec3 color\) \{ return toLinearSpace\(color\)/
            );
            expect(linear).toMatch(/quarksFromLinear\([^)]*\)[^{]*\{ return color; \}/);
            expect(gamma).toMatch(/quarksFromGamma\([^)]*\)[^{]*\{ return color; \}/);
            expect(gamma).toMatch(/quarksFromLinear\([^)]*\)[^{]*\{ return toGammaSpace(Vec3)?\(color\)/);
        }
    });

    it.each(RENDER_MODES)(
        'brings the particle colour, times the material colour, into the working space in the vertex shader (mode %s)',
        (mode) => {
            const {vertex, fragment, uniforms} = program({renderMode: mode});
            expect(vertex.glsl).toContain('vColor = quarksParticleColor(color);');
            expect(vertex.wgsl).toContain('vertexOutputs.vColor = quarksParticleColor(vertexInputs.color);');
            expect(uniforms).toEqual(expect.arrayContaining(['materialColor', 'materialColorScale']));
            for (const source of [fragment.glsl, fragment.wgsl]) {
                // Nothing is linearised as a whole any more: the colour is in the working space.
                expect(mainOf(source)).not.toMatch(/toLinearSpace/);
            }
        }
    );

    it('multiplies by the material colour once both are in the working space, then by its scale', () => {
        // Each colour comes into the working space on its own before they multiply, and the scale
        // multiplies after: a scale of 2 doubles the colour in linear space, as Unity's legacy
        // particle shaders double their tint, where a colour of 2 in gamma space would grow by
        // its power curve. Alpha is never converted.
        expect(particleColorVertexDeclarationGLSL).toContain(
            'return vec4(quarksFromGamma(color.rgb) * quarksFromGamma(materialColor.rgb), color.a * materialColor.a) * materialColorScale;'
        );
        expect(particleColorVertexDeclarationWGSL).toContain(
            'return vec4f(quarksFromGamma(color.rgb) * quarksFromGamma(uniforms.materialColor.rgb), color.a * uniforms.materialColor.a) * uniforms.materialColorScale;'
        );
    });

    it("reads a map's texels by the map's colour space", () => {
        expect(linearTexture(GAMMA_TEXTURE)).toBe(false);
        expect(linearTexture({gammaSpace: true})).toBe(false);
        expect(linearTexture(LINEAR_TEXTURE)).toBe(true);
        expect(linearTexture(null)).toBe(false);
        for (const mode of RENDER_MODES) {
            expect(program({renderMode: mode}).defines).not.toContain('MAP_LINEAR');
            expect(program({renderMode: mode, texture: LINEAR_TEXTURE}).defines).toContain('MAP_LINEAR');
        }
        // A mesh without a texture samples a white placeholder, the same in either space.
        expect(program({renderMode: RenderMode.Mesh, texture: null}).defines).not.toContain('MAP_LINEAR');

        for (const [declaration, surface] of [
            [surfaceFragmentDeclarationGLSL, surfaceColorGLSL(true)],
            [surfaceFragmentDeclarationWGSL, surfaceColorWGSL(true)],
        ]) {
            // Each sample, the second tile's too, comes into the working space before it is mixed.
            expect(surface).toContain('texColor = quarksSampleMap(mapUV);');
            expect(surface).toContain('texColor2 = quarksSampleMap(mapUV2);');
            const sampler = declaration.slice(declaration.indexOf('quarksSampleMap'));
            expect(sampler).toMatch(/!defined\(GRADIENT_MAP\) && defined\(MAP_LINEAR\)[\s\S]*quarksFromLinear/);
            expect(sampler).toMatch(/#elif !defined\(GRADIENT_MAP\)[\s\S]*quarksFromGamma/);
        }
    });

    it("reads a gradient map's ramp by the ramp's colour space, and its key as stored", () => {
        const gradient = (ramp: BaseTexture) => program({gradientMap: normalizeGradientMap({ramp})});
        expect(gradient(GAMMA_TEXTURE).defines).not.toContain('GRADIENT_MAP_LINEAR');
        expect(gradient(LINEAR_TEXTURE).defines).toContain('GRADIENT_MAP_LINEAR');
        for (const surface of [surfaceColorGLSL(true), surfaceColorWGSL(true)]) {
            const ramp = surface.slice(surface.indexOf('#ifdef GRADIENT_MAP'));
            expect(ramp).toMatch(
                /#ifdef GRADIENT_MAP_LINEAR[\s\S]*quarksFromLinear\(ramp\.rgb\)[\s\S]*#else[\s\S]*quarksFromGamma\(ramp\.rgb\)/
            );
        }
    });

    it('brings the fog, light, reflection, rim and erosion edge colours into the working space', () => {
        expect(fogFragmentGLSL('baseColor.rgb')).toContain('mix(quarksFromGamma(vFogColor), baseColor.rgb, fogFactor)');
        expect(fogFragmentDeclarationWGSL).toContain('mix(quarksFromGamma(uniforms.vFogColor), rgb, fogFactor)');
        expect(surfaceFragmentDeclarationGLSL).toContain('quarksFromGamma(erosionEdgeColor) * edge');
        expect(surfaceFragmentDeclarationWGSL).toContain('quarksFromGamma(uniforms.erosionEdgeColor) * edge');

        const mesh = program({
            renderMode: RenderMode.Mesh,
            lighting: 'fixed',
            reflectionAtlas: GAMMA_TEXTURE,
            rim: normalizeMeshRim({mode: 'add'}),
            erosion: normalizeErosion({edgeWidth: 0.1}),
        });
        for (const source of [mesh.fragment.glsl, mesh.fragment.wgsl]) {
            const main = mainOf(source);
            expect(main).toMatch(
                /quarksFromGamma\((uniforms\.)?ambientColor\) \+ quarksFromGamma\((uniforms\.)?lightColor\)/
            );
            expect(main).toContain('quarksFromGamma(sampleEnvAtlas(reflectionCoords))');
            expect(main).toMatch(/color \+= quarksFromGamma\((uniforms\.)?rimColor\)/);
            expect(main).toMatch(/mix\(color, quarksFromGamma\((uniforms\.)?rimColor\)/);
        }
    });

    it.each(RENDER_MODES)('keeps the faintest fringe, which a doubled tint lifts into view (mode %s)', (mode) => {
        // A texel of alpha 2/255 under Unity's doubled tint adds about 33/255 once encoded: cut at
        // 0.01 it left a hard outline around a glow. Only what draws nothing is discarded.
        const {fragment} = program({renderMode: mode});
        for (const source of [fragment.glsl, fragment.wgsl]) {
            expect(source).not.toMatch(/baseColor\.a < 0\.01/);
            expect(source).toMatch(/if \(baseColor\.a <= 0\.0\) (\{ )?discard;/);
        }
    });

    it('is among the variants the shader check compiles, with and without image processing', () => {
        const linear = shaderVariants().filter((v) => v.program.defines.includes('MAP_LINEAR'));
        expect(linear.some((v) => v.program.defines.includes('IMAGEPROCESSINGPOSTPROCESS'))).toBe(true);
        expect(linear.some((v) => !v.program.defines.some((d) => d.startsWith('IMAGEPROCESSING')))).toBe(true);
        expect(shaderVariants().some((v) => v.program.defines.includes('GRADIENT_MAP_LINEAR'))).toBe(true);
    });
});
