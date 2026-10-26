import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import type {Effect} from '@babylonjs/core/Materials/effect';
import {ImageProcessingConfiguration} from '@babylonjs/core/Materials/imageProcessingConfiguration';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {serializeEffect} from '../src/QuarksSerializer';
import {QuarksUtil} from '../src/QuarksUtil';
import {ShaderImageProcessing, shaderProgram} from '../src/shaderProgram';
import {PATCHES_IMAGE_PROCESSING_WGSL} from '../src/shaders/chunks/imageProcessing';
import {RenderMode} from '../src/VFXBatch';
import {emptyMeta, notifyBind, shaderOptions} from './internals';

/**
 * The scene's image processing on the particles, as Babylon's own particle systems and materials
 * take it: compiled from `scene.imageProcessingConfiguration`, bound on every draw, rebuilt when
 * the configuration changes what compiles, and switched off per system.
 */
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The scene's default material follows the configuration too. Some Babylon releases make it the
    // first time a batch's material is marked dirty, so it is made here, before observers are counted.
    expect(scene.defaultMaterial).toBeDefined();
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        ...parameters,
    });
}

function drawn(parameters: Partial<ParticleSystemParameters> = {}) {
    const renderer = new BatchedRenderer('ip', scene);
    const ps = system(parameters);
    renderer.addSystem(ps);
    renderer.update(1 / 60);
    const batch = () => renderer.batches[0];
    const material = () => batch().mesh.material as ShaderMaterial;
    const defines = () => shaderOptions(material()).defines as string[];
    const uniforms = () => shaderOptions(material()).uniforms;
    return {renderer, ps, batch, material, defines, uniforms};
}

/** An effect that takes any upload the bind observers make, as a stand-in for a compiled one. */
const anyEffect = (): Effect => {
    const effect: Effect = new Proxy({} as Effect, {get: () => () => effect});
    return effect;
};

const ACES: ShaderImageProcessing = {
    IMAGEPROCESSING: true,
    WHITEBALANCE: false,
    VIGNETTE: false,
    VIGNETTEBLENDMODEMULTIPLY: false,
    VIGNETTEBLENDMODEOPAQUE: false,
    TONEMAPPING: 2,
    CONTRAST: false,
    EXPOSURE: false,
    COLORCURVES: false,
    COLORGRADING: false,
    COLORGRADING3D: false,
    SAMPLER3DGREENDEPTH: false,
    SAMPLER3DBGRMAP: false,
    DITHER: false,
    IMAGEPROCESSINGPOSTPROCESS: false,
    SKIPFINALCOLORCLAMP: false,
};

const IP = /^(IMAGEPROCESSING|TONEMAPPING|CONTRAST|EXPOSURE|VIGNETTE|DITHER|COLORGRADING|COLORCURVES|WHITEBALANCE)/;

describe('image processing', () => {
    it('is applied by default, and a scene whose configuration does nothing compiles nothing in', () => {
        const ps = system();
        expect(ps.applyImageProcessing).toBe(true);
        const {renderer, defines} = drawn();
        expect(defines().filter((d) => IP.test(d))).toEqual([]);
        renderer.dispose();
        ps.dispose();
    });

    it("compiles the scene's effects in, and binds the configuration on every draw", () => {
        const config = scene.imageProcessingConfiguration;
        config.toneMappingEnabled = true;
        config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
        config.contrast = 1.5;
        const {renderer, material, defines, uniforms} = drawn();
        expect(defines()).toEqual(expect.arrayContaining(['IMAGEPROCESSING', 'TONEMAPPING 2', 'CONTRAST']));
        expect(defines()).not.toContain('IMAGEPROCESSINGPOSTPROCESS');
        expect(uniforms()).toContain('contrast');
        const effect = anyEffect();
        jest.spyOn(material(), 'getEffect').mockReturnValue(effect);
        const bind = jest.spyOn(config, 'bind').mockImplementation(() => undefined);
        notifyBind(material());
        expect(bind).toHaveBeenCalledTimes(1);
        expect(bind.mock.calls[0][0]).toBe(effect);
        renderer.dispose();
    });

    it('swaps the defines in place when the configuration changes what compiles, and only then', () => {
        const config = scene.imageProcessingConfiguration;
        const {renderer, batch, material, defines, uniforms} = drawn();
        const first = material();
        const baseline = [...defines()];
        const baseUniforms = [...uniforms()];
        const createEffect = jest.spyOn(engine, 'createEffect');
        config.toneMappingEnabled = true;
        expect(material()).toBe(first);
        expect(defines()).toEqual(expect.arrayContaining(['IMAGEPROCESSING', 'TONEMAPPING 1']));
        // The material reads its defines on the next readiness check and asks for that effect.
        first.isReady(batch().mesh);
        expect(createEffect).toHaveBeenCalled();
        const options = createEffect.mock.calls[createEffect.mock.calls.length - 1][1] as {defines: string};
        expect(options.defines.split('\n')).toContain('#define TONEMAPPING 1');
        // A new contrast value is a uniform; contrast going on is a define.
        config.contrast = 1.2;
        expect(defines()).toContain('CONTRAST');
        expect(uniforms()).toContain('contrast');
        const withContrast = [...defines()];
        config.contrast = 1.4;
        expect(defines()).toEqual(withContrast);
        config.isEnabled = false;
        expect(material()).toBe(first);
        expect(defines()).toEqual(baseline);
        expect(uniforms()).toEqual(baseUniforms);
        renderer.dispose();
    });

    it('keeps its material and observers when a post process flips on and off within a frame', () => {
        const config = scene.imageProcessingConfiguration;
        config.toneMappingEnabled = true;
        const {renderer, batch, material, defines, uniforms} = drawn();
        const first = material();
        const inMaterial = [...defines()];
        const inMaterialUniforms = [...uniforms()];
        const observers = config.onUpdateParameters.observers.length;
        const binds = first.onBindObservable.observers.length;
        for (let frame = 0; frame < 3; frame++) {
            // What a reflection probe rendering in linear space does around its render.
            config.applyByPostProcess = true;
            expect(defines()).toContain('IMAGEPROCESSINGPOSTPROCESS');
            expect(defines()).not.toContain('IMAGEPROCESSING');
            config.applyByPostProcess = false;
            expect(defines()).toEqual(inMaterial);
            expect(uniforms()).toEqual(inMaterialUniforms);
        }
        expect(material()).toBe(first);
        expect(config.onUpdateParameters.observers.length).toBe(observers);
        expect(first.onBindObservable.observers.length).toBe(binds);
        // A rebuild for another reason replaces the observer rather than adding one.
        batch().rebuildMaterial();
        batch().rebuildMaterial();
        expect(config.onUpdateParameters.observers.length).toBe(observers);
        expect(material().onBindObservable.observers.length).toBe(binds);
        renderer.dispose();
    });

    it('binds the values only while the material applies them', () => {
        const config = scene.imageProcessingConfiguration;
        const {renderer, material} = drawn();
        jest.spyOn(material(), 'getEffect').mockReturnValue(anyEffect());
        const bind = jest.spyOn(config, 'bind').mockImplementation(() => undefined);
        notifyBind(material());
        expect(bind).not.toHaveBeenCalled();
        config.exposure = 2;
        notifyBind(material());
        expect(bind).toHaveBeenCalledTimes(1);
        config.applyByPostProcess = true;
        notifyBind(material());
        expect(bind).toHaveBeenCalledTimes(1);
        renderer.dispose();
    });

    it('leaves the colour in linear space for a post process, and binds nothing itself', () => {
        const config = scene.imageProcessingConfiguration;
        config.toneMappingEnabled = true;
        config.applyByPostProcess = true;
        const {renderer, material, defines} = drawn();
        expect(defines()).toContain('IMAGEPROCESSINGPOSTPROCESS');
        expect(defines()).not.toContain('IMAGEPROCESSING');
        jest.spyOn(material(), 'getEffect').mockReturnValue(anyEffect());
        const bind = jest.spyOn(config, 'bind');
        notifyBind(material());
        expect(bind).not.toHaveBeenCalled();
        renderer.dispose();
    });

    it('compiles no in-material processing for a multiply particle, and linearises its factor for a post process', () => {
        const config = scene.imageProcessingConfiguration;
        config.toneMappingEnabled = true;
        const multiply = drawn({blendMode: Constants.ALPHA_MULTIPLY});
        expect(multiply.defines().filter((d) => IP.test(d))).toEqual([]);
        config.applyByPostProcess = true;
        expect(multiply.defines()).toContain('IMAGEPROCESSINGPOSTPROCESS');
        multiply.renderer.dispose();
    });

    it('applies in every render mode, trails included', () => {
        scene.imageProcessingConfiguration.exposure = 2;
        for (const renderMode of [
            RenderMode.BillBoard,
            RenderMode.StretchedBillBoard,
            RenderMode.Mesh,
            RenderMode.Beam,
            RenderMode.Trail,
        ]) {
            const {renderer, defines, uniforms} = drawn({renderMode});
            expect(defines()).toEqual(expect.arrayContaining(['IMAGEPROCESSING', 'EXPOSURE']));
            expect(uniforms()).toContain('exposureLinear');
            renderer.dispose();
        }
    });

    it('sets a colour grading texture on the material, so it is not drawn before the texture loads', () => {
        const config = scene.imageProcessingConfiguration;
        const lut = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
        config.colorGradingTexture = lut;
        config.colorGradingEnabled = true;
        const {renderer, material, defines} = drawn();
        expect(defines()).toContain('COLORGRADING');
        expect(shaderOptions(material()).samplers).toContain('txColorTransform');
        expect(material().getActiveTextures()).toContain(lut);
        renderer.dispose();
    });

    it('follows a swapped colour grading texture, and drops it when grading goes off', () => {
        const config = scene.imageProcessingConfiguration;
        const lut = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
        const other = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
        config.colorGradingTexture = lut;
        config.colorGradingEnabled = true;
        const {renderer, material} = drawn();
        config.colorGradingTexture = other;
        expect(material().getActiveTextures()).toContain(other);
        expect(material().getActiveTextures()).not.toContain(lut);
        config.colorGradingEnabled = false;
        expect(material().getActiveTextures()).not.toContain(other);
        expect(shaderOptions(material()).samplers).not.toContain('txColorTransform');
        renderer.dispose();
    });

    it('is switched off per system, which compiles and follows nothing, and batches apart', () => {
        const config = scene.imageProcessingConfiguration;
        config.toneMappingEnabled = true;
        const observers = config.onUpdateParameters.observers.length;
        const off = drawn({applyImageProcessing: false});
        expect(off.defines().filter((d) => IP.test(d))).toEqual([]);
        expect(config.onUpdateParameters.observers.length).toBe(observers);
        const on = system();
        off.renderer.addSystem(on);
        off.renderer.update(1 / 60);
        expect(off.renderer.batches).toHaveLength(2);
        const batchOf = (ps: ParticleSystem) => off.renderer.batches.find((b) => b.systems.has(ps));
        expect(batchOf(on)).not.toBe(batchOf(off.ps));
        off.ps.applyImageProcessing = true;
        off.renderer.update(1 / 60);
        expect(batchOf(on)).toBe(batchOf(off.ps));
        off.renderer.dispose();
    });

    it('stops following the configuration when its batch is disposed', () => {
        const config = scene.imageProcessingConfiguration;
        const observers = config.onUpdateParameters.observers.length;
        const {renderer} = drawn();
        expect(config.onUpdateParameters.observers.length).toBe(observers + 1);
        renderer.dispose();
        expect(config.onUpdateParameters.observers.length).toBe(observers);
    });

    it('is written only when off, and round-trips through fromJSON, clone and QuarksLoader', () => {
        expect(system().toJSON(emptyMeta())).not.toHaveProperty('applyImageProcessing');
        const ps = system({applyImageProcessing: false});
        const json = ps.toJSON(emptyMeta());
        expect(json.applyImageProcessing).toBe(false);
        expect(ParticleSystem.fromJSON(json, emptyMeta(), scene).applyImageProcessing).toBe(false);
        expect(ps.clone().applyImageProcessing).toBe(false);
        const loaded = new QuarksLoader(scene).parse(JSON.parse(JSON.stringify(serializeEffect(ps.emitter))));
        const read: ParticleSystem[] = [];
        QuarksUtil.runOnAllParticleEmitters(loaded, (e) => read.push(e.system as ParticleSystem));
        expect(read.map((s) => s.applyImageProcessing)).toEqual([false]);
    });

    it('runs on the straight colour before the blend resolve, and linearises a multiply factor after it', () => {
        const settings = drawn().batch().settings;
        for (const renderMode of [RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail]) {
            const program = shaderProgram(
                {...settings, renderMode},
                {depth: null, envAtlasReady: false, meshUV2: false, imageProcessing: null}
            );
            for (const source of [program.fragment.glsl, program.fragment.wgsl]) {
                expect(source).toMatch(/#include<(quarksI|i)mageProcessingFunctions>/);
                const main = source.slice(source.search(/void main\(\)|fn main\(/));
                const processing = main.indexOf('applyImageProcessing(');
                const resolve = main.indexOf('#if defined(BLEND_PREMULTIPLY)');
                const multiplyFactor = main.lastIndexOf(
                    'defined(IMAGEPROCESSINGPOSTPROCESS) && defined(BLEND_MULTIPLY)'
                );
                expect(processing).toBeGreaterThan(main.indexOf('#ifdef FOG'));
                expect(processing).toBeLessThan(resolve);
                expect(multiplyFactor).toBeGreaterThan(resolve);
            }
        }
    });

    it('compiles without an image processing context, as a program built before it existed', () => {
        const settings = drawn().batch().settings;
        const program = shaderProgram(settings, {depth: null, envAtlasReady: false, meshUV2: false});
        expect(program.defines.filter((d) => IP.test(d))).toEqual([]);
        const unset = shaderProgram(
            {...settings, applyImageProcessing: undefined as unknown as boolean},
            {depth: null, envAtlasReady: false, meshUV2: false, imageProcessing: ACES}
        );
        expect(unset.defines).toContain('IMAGEPROCESSING');
    });

    it("routes Babylon's WGSL 2D colour grading call through the polyfill", () => {
        expect(PATCHES_IMAGE_PROCESSING_WGSL).toBe(true);
        const include = ShaderStore.IncludesShadersStoreWGSL['quarksImageProcessingFunctions'];
        expect(include).toContain('quarksSampleTexture3D(txColorTransform');
        expect(include).not.toMatch(
            /textureSample\(txColorTransform,txColorTransformSampler,colorTransformInput,uniforms/
        );
    });
});
