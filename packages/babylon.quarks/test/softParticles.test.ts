import {Camera} from '@babylonjs/core/Cameras/camera';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Vector4 as BVector4, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import meshVertGLSL from '../src/shaders/local_particle_physics_vert.glsl';
import meshVertWGSL from '../src/shaders/local_particle_physics_vert.wgsl';
import particleFragGLSL from '../src/shaders/particle_frag.glsl';
import particleFragWGSL from '../src/shaders/particle_frag.wgsl';
import physicsFragGLSL from '../src/shaders/particle_physics_frag.glsl';
import physicsFragWGSL from '../src/shaders/particle_physics_frag.wgsl';
import particleVertGLSL from '../src/shaders/particle_vert.glsl';
import particleVertWGSL from '../src/shaders/particle_vert.wgsl';
import stretchedVertGLSL from '../src/shaders/stretched_bb_particle_vert.glsl';
import stretchedVertWGSL from '../src/shaders/stretched_bb_particle_vert.wgsl';
import trailFragGLSL from '../src/shaders/trail_frag.glsl';
import trailFragWGSL from '../src/shaders/trail_frag.wgsl';
import trailVertGLSL from '../src/shaders/trail_vert.glsl';
import trailVertWGSL from '../src/shaders/trail_vert.wgsl';
import {decodeSoftDepth, depthBinding, SoftDepthEncoding, softDepthParams} from '../src/softDepth';
import {RenderMode} from '../src/VFXBatch';
import {forceSet} from './internals';

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

/**
 * What Babylon's DepthRenderer writes for a point at view-space z, by its own formulas
 * (`depth.vertex` and `depth.fragment`, `DepthRenderer` binding `depthValues`).
 */
function babylonDepth(camera: Camera, encoding: SoftDepthEncoding, viewZ: number): number {
    if (encoding === 'viewZ') {
        return viewZ;
    }
    const reverse = engine.useReverseDepthBuffer;
    const halfZ = engine.isNDCHalfZRange;
    const m = camera.getProjectionMatrix(true).m;
    const clipZ = viewZ * m[10] + m[14];
    const clipW = viewZ * m[11] + m[15];
    if (encoding === 'nonLinear') {
        const ndc = clipZ / clipW;
        return halfZ ? ndc : (ndc + 1) / 2;
    }
    let minZ: number;
    let maxZ: number;
    if (camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
        minZ = !reverse && halfZ ? 0 : 1;
        maxZ = reverse && halfZ ? 0 : 1;
    } else {
        minZ = reverse && halfZ ? camera.minZ : halfZ ? 0 : camera.minZ;
        maxZ = reverse && halfZ ? 0 : camera.maxZ;
    }
    return ((reverse ? -clipZ : clipZ) + minZ) / (minZ + maxZ);
}

interface Setup {
    encoding: SoftDepthEncoding;
    ortho: boolean;
    halfZ: boolean;
    reverse: boolean;
    rightHanded: boolean;
    maxZ: number;
}

const setups: Setup[] = [];
for (const encoding of ['linear', 'nonLinear', 'viewZ'] as SoftDepthEncoding[]) {
    for (const ortho of [false, true]) {
        for (const halfZ of [false, true]) {
            for (const reverse of [false, true]) {
                for (const rightHanded of [false, true]) {
                    for (const maxZ of [200, 0]) {
                        // An infinite far plane has no linear metric (Babylon divides by it), and an
                        // orthographic camera always has a far plane.
                        if (maxZ === 0 && (ortho || encoding === 'linear')) continue;
                        // Babylon builds a reverse depth buffer only on a half NDC range.
                        if (reverse && !halfZ) continue;
                        setups.push({encoding, ortho, halfZ, reverse, rightHanded, maxZ});
                    }
                }
            }
        }
    }
}

describe('the soft-particle depth decode', () => {
    test.each(setups.map((setup) => [JSON.stringify(setup), setup] as const))(
        'gives back the view depth Babylon wrote, %s',
        (_name, {encoding, ortho, halfZ, reverse, rightHanded, maxZ}) => {
            forceSet(engine, 'isNDCHalfZRange', halfZ);
            engine.useReverseDepthBuffer = reverse;
            scene.useRightHandedSystem = rightHanded;
            const camera = new FreeCamera('camera', new Vector3(0, 0, 0), scene);
            camera.minZ = 0.5;
            camera.maxZ = maxZ;
            if (ortho) {
                camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
                camera.orthoLeft = -10;
                camera.orthoRight = 10;
                camera.orthoTop = 10;
                camera.orthoBottom = -10;
            }
            const params = softDepthParams(camera, encoding, new BVector4());
            const forward = rightHanded ? -1 : 1;
            for (const depth of [0.5, 1, 16, 120, 199]) {
                const sample = babylonDepth(camera, encoding, forward * depth);
                expect(decodeSoftDepth(sample, params)).toBeCloseTo(depth, depth > 100 ? 2 : 4);
            }
        }
    );

    test('reads nothing drawn as infinitely far, so a particle in front of the sky stays', () => {
        const camera = new FreeCamera('camera', new Vector3(0, 0, 0), scene);
        camera.maxZ = 0;
        // A view-Z depth renderer clears to 0.
        expect(decodeSoftDepth(0, softDepthParams(camera, 'viewZ', new BVector4()))).toBeGreaterThan(1e20);
        // An infinite far plane puts the cleared depth buffer at infinity.
        expect(decodeSoftDepth(1, softDepthParams(camera, 'nonLinear', new BVector4()))).toBeGreaterThan(1e20);
    });

    test('with a reverse depth buffer, a depth renderer cleared to 0 reads as far', () => {
        forceSet(engine, 'isNDCHalfZRange', true);
        engine.useReverseDepthBuffer = true;
        const camera = new FreeCamera('camera', new Vector3(0, 0, 0), scene);
        camera.minZ = 0.5;
        camera.maxZ = 0;
        expect(decodeSoftDepth(0, softDepthParams(camera, 'nonLinear', new BVector4()))).toBeGreaterThan(1e20);
        camera.maxZ = 200;
        expect(decodeSoftDepth(0, softDepthParams(camera, 'nonLinear', new BVector4()))).toBeCloseTo(200, 2);
    });

    test('the shaders decode with the same formula, in both languages', () => {
        for (const source of [particleFragGLSL, physicsFragGLSL]) {
            expect(source).toContain('float denominator = projParams.z * d + projParams.w;');
            expect(source).toContain('abs((projParams.x * d + projParams.y) / denominator)');
        }
        for (const source of [particleFragWGSL, physicsFragWGSL]) {
            expect(source).toContain('let denominator = uniforms.projParams.z * d + uniforms.projParams.w;');
            expect(source).toContain('abs((uniforms.projParams.x * d + uniforms.projParams.y) / denominator)');
        }
    });
});

/**
 * The top-level feature blocks of a shader's main(), in order: what the two languages must agree
 * on. Blocks nested in them may be split differently between main() and a helper.
 */
function featureBlocks(source: string): string[] {
    const main = source.slice(source.search(/void main\(|fn main\(/));
    const blocks: string[] = [];
    let depth = 0;
    for (const [, directive, rest] of main.matchAll(/#(ifdef|ifndef|if|elif|else|endif)\b([^\n]*)/g)) {
        if (directive === 'endif') {
            depth--;
        } else if (directive === 'ifdef' || directive === 'ifndef' || directive === 'if') {
            if (depth === 0) blocks.push(rest.trim());
            depth++;
        }
    }
    return blocks;
}

/** The last blocks of every fragment main(): the soft fade, image processing, the blend resolve. */
const AFTER_FOG = [
    'SOFT_PARTICLES',
    'defined(IMAGEPROCESSINGPOSTPROCESS) && !defined(BLEND_MULTIPLY)',
    'defined(BLEND_PREMULTIPLY)',
    'defined(IMAGEPROCESSINGPOSTPROCESS) && defined(BLEND_MULTIPLY)',
];

describe('GLSL and WGSL apply the fragment features in the same order', () => {
    test.each([
        ['particle_frag', particleFragGLSL, particleFragWGSL],
        ['particle_physics_frag', physicsFragGLSL, physicsFragWGSL],
        ['trail_frag', trailFragGLSL, trailFragWGSL],
    ])('%s', (_name, glsl, wgsl) => {
        expect(featureBlocks(glsl)).toEqual(featureBlocks(wgsl));
        // The soft fade runs after fog, and only the scene's image processing and the blend
        // resolve after it.
        const blocks = featureBlocks(glsl);
        expect(blocks.slice(-4)).toEqual(AFTER_FOG);
        expect(blocks.lastIndexOf('FOG')).toBeLessThan(blocks.lastIndexOf('SOFT_PARTICLES'));
    });
});

describe('GLSL and WGSL lay the vertex out through the same feature blocks', () => {
    test.each([
        ['particle_vert', particleVertGLSL, particleVertWGSL],
        ['stretched_bb_particle_vert', stretchedVertGLSL, stretchedVertWGSL],
        ['local_particle_physics_vert', meshVertGLSL, meshVertWGSL],
        ['trail_vert', trailVertGLSL, trailVertWGSL],
    ])('%s', (_name, glsl, wgsl) => {
        expect(featureBlocks(glsl)).toEqual(featureBlocks(wgsl));
    });
});

function softSystem(overrides: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        softParticles: true,
        ...overrides,
    });
}

const materialOf = (renderer: BatchedRenderer) => renderer.batches[0].mesh.material as ShaderMaterial;
const definesOf = (renderer: BatchedRenderer) => materialOf(renderer).options.defines!;
const depthTextureOf = (renderer: BatchedRenderer) => materialOf(renderer)['_textures'].depthTexture;

describe('soft particles and the depth texture', () => {
    test('draw hard until there is a depth texture, and soft once it is set', () => {
        const renderer = new BatchedRenderer('soft', scene);
        renderer.addSystem(softSystem());
        expect(definesOf(renderer)).not.toContain('SOFT_PARTICLES');

        const depth = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        renderer.setDepthTexture(depth);
        expect(definesOf(renderer)).toContain('SOFT_PARTICLES');
        expect(depthTextureOf(renderer)).toBe(depth);
        expect(renderer.depthTexture).toBe(depth);
        expect(renderer.depthEncoding).toBe('linear');

        // Another texture of the same kind is swapped in without a rebuild.
        const material = materialOf(renderer);
        const other = RawTexture.CreateLuminanceTexture(new Uint8Array([100]), 1, 1, scene);
        renderer.setDepthTexture(other);
        expect(materialOf(renderer)).toBe(material);
        expect(depthTextureOf(renderer)).toBe(other);

        renderer.setDepthTexture(null);
        expect(definesOf(renderer)).not.toContain('SOFT_PARTICLES');
        expect(renderer.depthTexture).toBeNull();
        expect(renderer.depthEncoding).toBeNull();
        renderer.dispose();
    });

    test('a batch made after the depth texture is set gets it, and keeps it across a rebuild', () => {
        const depth = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        const renderer = new BatchedRenderer('soft', scene);
        renderer.depthTexture = depth;
        renderer.addSystem(softSystem({renderMode: RenderMode.Mesh}));
        expect(definesOf(renderer)).toContain('SOFT_PARTICLES');
        expect(depthTextureOf(renderer)).toBe(depth);
        renderer.batches[0].rebuildMaterial();
        expect(depthTextureOf(renderer)).toBe(depth);
        renderer.dispose();
    });

    test('a trail draws soft once there is a depth texture, and fades before the blend resolve in both languages', () => {
        const renderer = new BatchedRenderer('trail', scene);
        renderer.addSystem(
            softSystem({
                renderMode: RenderMode.Trail,
                rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
            })
        );
        const material = materialOf(renderer);
        expect(definesOf(renderer)).not.toContain('SOFT_PARTICLES');
        const depth = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        renderer.setDepthTexture(depth);
        expect(materialOf(renderer)).not.toBe(material);
        // The old material goes with the rebuild.
        expect(scene.materials).not.toContain(material);
        expect(definesOf(renderer)).toContain('SOFT_PARTICLES');
        expect(depthTextureOf(renderer)).toBe(depth);
        expect(featureBlocks(trailFragGLSL)).toEqual(featureBlocks(trailFragWGSL));
        const blocks = featureBlocks(trailFragGLSL);
        expect(blocks.slice(-4)).toEqual(AFTER_FOG);
        for (const source of [trailVertGLSL, trailVertWGSL]) {
            expect(source).toContain('#ifdef SOFT_PARTICLES');
            expect(source).toContain('abs(point.z)');
        }
        renderer.dispose();
    });

    test('a batch given a bare texture reads it as linear and unpacked', () => {
        const renderer = new BatchedRenderer('bare', scene);
        renderer.addSystem(softSystem());
        const depth = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        renderer.batches[0].applyDepthTexture(depth);
        expect(definesOf(renderer)).toContain('SOFT_PARTICLES');
        expect(definesOf(renderer)).not.toContain('SOFT_DEPTH_PACKED');
        expect(depthTextureOf(renderer)).toBe(depth);
        renderer.dispose();
    });

    test('a system without soft particles never compiles them', () => {
        const renderer = new BatchedRenderer('hard', scene);
        renderer.setDepthTexture(RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene));
        renderer.addSystem(softSystem({softParticles: false}));
        expect(definesOf(renderer)).not.toContain('SOFT_PARTICLES');
        expect(depthTextureOf(renderer)).toBeUndefined();
        renderer.dispose();
    });

    /**
     * A DepthRenderer as far as quarks reads one. The real one compiles its shaders on
     * construction, which needs a GPU; the field names are its constructor's.
     */
    function depthRenderer(options: {nonLinear?: boolean; viewZ?: boolean; packed?: boolean} = {}) {
        const map = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        return {
            getDepthMap: () => map,
            isPacked: options.packed ?? false,
            _storeNonLinearDepth: options.nonLinear ?? false,
            _storeCameraSpaceZ: options.viewZ ?? false,
        };
    }

    test('reads the encoding and packing off a DepthRenderer', () => {
        const cases: Array<[ReturnType<typeof depthRenderer>, SoftDepthEncoding, boolean]> = [
            [depthRenderer(), 'linear', false],
            [depthRenderer({nonLinear: true}), 'nonLinear', false],
            // View Z wins over non-linear, as in DepthRenderer.
            [depthRenderer({nonLinear: true, viewZ: true}), 'viewZ', false],
            [depthRenderer({packed: true}), 'linear', true],
        ];
        for (const [renderer, encoding, packed] of cases) {
            expect(depthBinding(renderer)).toEqual({texture: renderer.getDepthMap(), encoding, packed});
        }
        // Options win over what is read off the renderer.
        expect(depthBinding(depthRenderer(), {encoding: 'nonLinear', packed: true})).toMatchObject({
            encoding: 'nonLinear',
            packed: true,
        });
        // Packing keeps only the fraction, so a packed view Z is refused.
        expect(() => depthBinding(depthRenderer({viewZ: true, packed: true}))).toThrow(/packed view-Z/);
    });

    test('a packed depth compiles the unpack, and switching packing rebuilds', () => {
        const packed = depthRenderer({packed: true});
        const renderer = new BatchedRenderer('packed', scene);
        renderer.addSystem(softSystem());
        renderer.setDepthTexture(packed as never);
        expect(definesOf(renderer)).toEqual(expect.arrayContaining(['SOFT_PARTICLES', 'SOFT_DEPTH_PACKED']));
        expect(depthTextureOf(renderer)).toBe(packed.getDepthMap());
        renderer.setDepthTexture(packed.getDepthMap(), {packed: false});
        expect(definesOf(renderer)).not.toContain('SOFT_DEPTH_PACKED');
        for (const source of [particleFragGLSL, particleFragWGSL, physicsFragGLSL, physicsFragWGSL]) {
            expect(source).toContain('#ifdef SOFT_DEPTH_PACKED');
        }
        renderer.dispose();
    });

    test('measures the particle depth along the view axis in both handednesses', () => {
        // Particle and scene depth must share a sign for the fade to mean anything.
        for (const source of [particleFragGLSL, physicsFragGLSL, particleFragWGSL, physicsFragWGSL]) {
            expect(source).toContain('(sceneDepth - ');
        }
    });
});
