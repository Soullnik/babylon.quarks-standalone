import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {AlphaState} from '@babylonjs/core/States/alphaCullingState';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {blendCategory, shaderProgram, ShaderSettings} from '../src/shaderProgram';
import {RenderMode} from '../src/VFXBatch';

/** Every Babylon alpha mode, `ALPHA_DISABLE` (0) to `ALPHA_REPLACE_COLOR` (21). */
const MODES = Array.from({length: 22}, (_, i) => i);
/** Modes whose result alpha cannot keep the frame: constant colours, a second source, a replace. */
const OUTSIDE_COVERAGE = new Set<number>([
    Constants.ALPHA_DISABLE,
    Constants.ALPHA_INTERPOLATE,
    Constants.ALPHA_DUAL_SRC0_ADD_SRC1xDST,
    Constants.ALPHA_REPLACE_COLOR,
]);

type RGB = [number, number, number];

/** The fragment's colour after the blend resolve the mode's defines select. */
function resolve(mode: number, rgb: RGB, a: number): RGB {
    const {output} = blendCategory({materialTransparent: true, materialBlendMode: mode});
    if (output === 'premultiply') return rgb.map((c) => c * a) as RGB;
    if (output === 'multiply') return rgb.map((c) => 1 + (c - 1) * a) as RGB;
    return rgb;
}

/** What the GPU writes for `src` over `dst` with Babylon's blend state for `mode`, rgb only. */
function blend(mode: number, src: RGB, srcA: number, dst: RGB, dstA: number): RGB {
    const state = new AlphaState(false);
    state.setAlphaMode(mode, 0);
    const params = (state as unknown as {_blendFunctionParameters: number[]})._blendFunctionParameters;
    const equation = (state as unknown as {_blendEquationParameters: number[]})._blendEquationParameters[0];
    const factor = (gl: number, i: number): number => {
        switch (gl) {
            case 0:
                return 0;
            case 1:
                return 1;
            case 768:
                return src[i];
            case 769:
                return 1 - src[i];
            case 770:
                return srcA;
            case 771:
                return 1 - srcA;
            case 772:
                return dstA;
            case 773:
                return 1 - dstA;
            case 774:
                return dst[i];
            case 775:
                return 1 - dst[i];
        }
        throw new Error(`blend factor ${gl} of mode ${mode}`);
    };
    return src.map((s, i) => {
        if (equation === 32775) return Math.min(s, dst[i]);
        if (equation === 32776) return Math.max(s, dst[i]);
        return s * factor(params[0], i) + dst[i] * factor(params[1], i);
    }) as RGB;
}

describe('blendCategory', () => {
    const colour: RGB = [0.9, 0.4, 0.2];
    const frame: RGB = [0.3, 0.5, 0.7];

    it.each(MODES.filter((m) => !OUTSIDE_COVERAGE.has(m)))(
        'mode %i leaves the frame as it was at alpha 0 and draws as the mode does at alpha 1',
        (mode) => {
            const empty = blend(mode, resolve(mode, colour, 0), 0, frame, 1);
            empty.forEach((c, i) => expect(c).toBeCloseTo(frame[i], 6));
            const full = blend(mode, resolve(mode, colour, 1), 1, frame, 1);
            const unresolved = blend(mode, colour, 1, frame, 1);
            full.forEach((c, i) => expect(c).toBeCloseTo(unresolved[i], 6));
        }
    );

    it('fades linearly with alpha in every mode whose equation is linear in the colour', () => {
        const nonlinear = new Set<number>([Constants.ALPHA_MAXIMIZED, Constants.ALPHA_MIN, Constants.ALPHA_MAX]);
        for (const mode of MODES.filter((m) => !OUTSIDE_COVERAGE.has(m) && !nonlinear.has(m))) {
            const full = blend(mode, resolve(mode, colour, 1), 1, frame, 1);
            const half = blend(mode, resolve(mode, colour, 0.5), 0.5, frame, 1);
            half.forEach((c, i) => expect(c).toBeCloseTo((frame[i] + full[i]) / 2, 6));
        }
    });

    it('sorts the modes Unity sorts its particle modes by', () => {
        const of = (mode: number, materialTransparent = true) =>
            blendCategory({materialTransparent, materialBlendMode: mode});
        expect(of(Constants.ALPHA_COMBINE)).toEqual({output: 'straight', fogTarget: 'color'});
        expect(of(Constants.ALPHA_ADD)).toEqual({output: 'straight', fogTarget: 'black'});
        expect(of(Constants.ALPHA_ONEONE)).toEqual({output: 'premultiply', fogTarget: 'black'});
        expect(of(Constants.ALPHA_SCREENMODE)).toEqual({output: 'premultiply', fogTarget: 'black'});
        expect(of(Constants.ALPHA_SUBTRACT)).toEqual({output: 'premultiply', fogTarget: 'black'});
        expect(of(Constants.ALPHA_PREMULTIPLIED)).toEqual({output: 'premultiply', fogTarget: 'color'});
        expect(of(Constants.ALPHA_SRC_DSTONEMINUSSRCALPHA)).toEqual({output: 'premultiply', fogTarget: 'color'});
        expect(of(Constants.ALPHA_MULTIPLY)).toEqual({output: 'multiply', fogTarget: 'white'});
        expect(of(Constants.ALPHA_MIN)).toEqual({output: 'multiply', fogTarget: 'white'});
        expect(of(Constants.ALPHA_MAX)).toEqual({output: 'premultiply', fogTarget: 'black'});
        expect(of(Constants.ALPHA_ONEONE, false)).toEqual({output: 'straight', fogTarget: 'color'});
        expect(of(Constants.ALPHA_DISABLE)).toEqual({output: 'straight', fogTarget: 'color'});
        expect(of(Constants.ALPHA_REPLACE_COLOR)).toEqual({output: 'straight', fogTarget: 'color'});
        expect(of(Constants.ALPHA_DUAL_SRC0_ADD_SRC1xDST)).toEqual({output: 'straight', fogTarget: 'color'});
        expect(of(99)).toEqual({output: 'straight', fogTarget: 'color'});
    });
});

describe('blend defines', () => {
    const settings = (materialBlendMode: number, applyFog: boolean, materialTransparent = true): ShaderSettings => ({
        renderMode: RenderMode.BillBoard,
        texture: null,
        reflectionAtlas: null,
        uTileCount: 1,
        vTileCount: 1,
        blendTiles: false,
        softParticles: false,
        materialAlphaTest: 0,
        materialTransparent,
        materialBlendMode,
        applyFog,
        pivot: undefined,
        minParticleSize: 0,
        maxParticleSize: Infinity,
        lighting: undefined,
        rim: undefined,
        mapUV: undefined,
        uvDistortion: undefined,
        gradientMap: undefined,
        erosion: undefined,
    });
    const context = {depth: null, envAtlasReady: false, meshUV2: false};
    const defines = (mode: number, fog: boolean, transparent = true) =>
        shaderProgram(settings(mode, fog, transparent), context).defines;

    it('compile the resolve and the fog each mode takes, and nothing for straight blending', () => {
        expect(defines(Constants.ALPHA_COMBINE, false)).toEqual([]);
        expect(defines(Constants.ALPHA_COMBINE, true)).toEqual(['FOG']);
        expect(defines(Constants.ALPHA_ADD, true)).toEqual(['FOG', 'FOG_ADDITIVE']);
        expect(defines(Constants.ALPHA_ONEONE, false)).toEqual(['BLEND_PREMULTIPLY']);
        expect(defines(Constants.ALPHA_ONEONE, true)).toEqual(['BLEND_PREMULTIPLY', 'FOG', 'FOG_ADDITIVE']);
        expect(defines(Constants.ALPHA_PREMULTIPLIED, true)).toEqual(['BLEND_PREMULTIPLY', 'FOG']);
        expect(defines(Constants.ALPHA_MULTIPLY, true)).toEqual(['BLEND_MULTIPLY', 'FOG', 'FOG_MULTIPLY']);
        expect(defines(Constants.ALPHA_ONEONE, true, false)).toEqual(['FOG']);
    });

    it('resolve after fog and the soft fade, which fades alpha only, in every fragment shader', () => {
        const programs = [RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail].map((renderMode) =>
            shaderProgram({...settings(Constants.ALPHA_ONEONE, true), renderMode}, context)
        );
        for (const {fragment} of programs) {
            for (const source of [fragment.glsl, fragment.wgsl]) {
                const main = source.slice(source.search(/void main\(\)|fn main\(/));
                const fog = main.indexOf('#ifdef FOG');
                const soft = main.indexOf('#ifdef SOFT_PARTICLES');
                const resolve = main.indexOf('#if defined(BLEND_PREMULTIPLY)');
                expect(fog).toBeGreaterThan(-1);
                expect(soft).toBeGreaterThan(fog);
                expect(resolve).toBeGreaterThan(soft);
                expect(main.slice(soft, resolve)).toMatch(/\.a \*= clamp\(/);
                expect(main.slice(resolve)).toMatch(/BLEND_MULTIPLY/);
            }
        }
    });
});

describe('a batch', () => {
    it('compiles the resolve of its blend mode and batches modes apart', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const renderer = new BatchedRenderer('r', scene);
        const system = (blendMode: number) =>
            new ParticleSystem({
                duration: 1,
                looping: true,
                startLife: new ConstantValue(1),
                startSpeed: new ConstantValue(1),
                startSize: new ConstantValue(1),
                startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
                emissionOverTime: new ConstantValue(1),
                shape: new PointEmitter(),
                blendMode,
            });
        renderer.addSystem(system(Constants.ALPHA_ONEONE));
        renderer.addSystem(system(Constants.ALPHA_MULTIPLY));
        renderer.addSystem(system(Constants.ALPHA_COMBINE));
        const defines = renderer.batches.map((b) => (b.mesh.material as ShaderMaterial).options.defines);
        expect(defines).toHaveLength(3);
        expect(defines[0]).toEqual(expect.arrayContaining(['BLEND_PREMULTIPLY', 'FOG', 'FOG_ADDITIVE']));
        expect(defines[1]).toEqual(expect.arrayContaining(['BLEND_MULTIPLY', 'FOG', 'FOG_MULTIPLY']));
        expect(defines[2]).not.toEqual(expect.arrayContaining(['BLEND_PREMULTIPLY']));
        expect(defines[2]).not.toContain('BLEND_MULTIPLY');
        renderer.dispose();
        scene.dispose();
        engine.dispose();
    });
});
