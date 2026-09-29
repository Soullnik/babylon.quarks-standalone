/**
 * Behaviour Unity effects rely on, as measured against Unity itself with
 * tools/unity-parity-capture + tools/unity-parity-compare: repeating bursts, the Shape
 * module's own transform, freeform stretching, material tint and linear vertex colour.
 */
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Quaternion as BQuaternion, Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConeEmitter, ConstantValue, Quaternion, SphereEmitter, VelocityOverLife} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import type {BurstParameters} from '../src/ParticleSystem';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import particleFragShader from '../src/shaders/particle_frag.glsl';
import particlePhysicsFragShader from '../src/shaders/particle_physics_frag.glsl';
import trailFragShader from '../src/shaders/trail_frag.glsl';
import {RenderMode} from '../src/VFXBatch';

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

const STEP = 1 / 60;

function burstSystem(bursts: BurstParameters[], extra: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(100),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: bursts,
        shape: new SphereEmitter(),
        ...extra,
    });
}

/** Runs the system's own emission for `seconds` of fixed steps, counting what it spawns. */
function emitFor(system: ParticleSystem, seconds: number): number {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
        system.emit(STEP, system.emissionState, system.emitter.matrixWorld);
    }
    return system.particleNum;
}

const burst = (time: number, cycle: number, interval: number, count = 1): BurstParameters => ({
    time,
    count: new ConstantValue(count),
    cycle,
    interval,
    probability: 1,
});

describe('repeating bursts', () => {
    it('fires every cycle of a burst, interval apart', () => {
        const system = burstSystem([burst(0, 20, 0.05)]);
        expect(emitFor(system, 0.5)).toBe(10);
        expect(emitFor(system, 0.5)).toBe(20);
        system.dispose();
    });

    it('starts over each loop', () => {
        const system = burstSystem([burst(0, 20, 0.05)]);
        expect(emitFor(system, 1.49)).toBe(30);
        system.dispose();
    });

    it('drops the cycles that would fall past the end of the loop', () => {
        const system = burstSystem([burst(0.8, 10, 0.1)]);
        expect(emitFor(system, 0.99)).toBe(2);
        system.dispose();
    });

    it('fires at most one wave per step, as Unity does', () => {
        // 100 waves 5 ms apart span half a second: one comes out per 1/60 s step.
        const system = burstSystem([burst(0, 100, 0.005)]);
        expect(emitFor(system, 0.5)).toBe(30);
        system.dispose();
    });

    it('still fires a single burst once per loop', () => {
        const system = burstSystem([burst(0.25, 1, 0.01, 5)]);
        expect(emitFor(system, 0.99)).toBe(5);
        expect(emitFor(system, 1)).toBe(10);
        system.dispose();
    });

    it('keeps a non-looping system pending while waves remain', () => {
        const system = burstSystem([burst(0, 4, 0.2)], {looping: false});
        emitFor(system, 0.3);
        expect(system.hasPendingEmission()).toBe(true);
        emitFor(system, 0.5);
        expect(system.particleNum).toBe(4);
        expect(system.hasPendingEmission()).toBe(false);
        system.dispose();
    });
});

/** Quaternion for a turn about X, as Unity's Quaternion.Euler(x, 0, 0). */
function aboutX(degrees: number): [number, number, number, number] {
    const h = (degrees * Math.PI) / 360;
    return [Math.sin(h), 0, 0, Math.cos(h)];
}

describe('shape transform', () => {
    it('turns the direction of emission with the shape', () => {
        const system = burstSystem([burst(0, 1, 0.01)], {
            startSpeed: new ConstantValue(2),
            shape: new ConeEmitter({radius: 0, angle: 0}),
            shapeTransform: {position: [0, 0, 0], rotation: aboutX(-90), scale: [1, 1, 1]},
        });
        emitFor(system, STEP);
        const v = system.particles[0].velocity;
        expect(v.x).toBeCloseTo(0);
        expect(v.y).toBeCloseTo(2);
        expect(v.z).toBeCloseTo(0);
        system.dispose();
    });

    it('offsets and stretches spawn positions', () => {
        const system = burstSystem([burst(0, 1, 0.01, 200)], {
            shape: new SphereEmitter({radius: 1, thickness: 0}),
            shapeTransform: {position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 3, 1]},
        });
        emitFor(system, STEP);
        let maxX = 0;
        let maxY = -Infinity;
        let minY = Infinity;
        for (let i = 0; i < system.particleNum; i++) {
            const p = system.particles[i].position;
            maxX = Math.max(maxX, Math.abs(p.x));
            maxY = Math.max(maxY, p.y);
            minY = Math.min(minY, p.y);
        }
        expect(maxX).toBeLessThanOrEqual(1 + 1e-6);
        expect(maxY).toBeGreaterThan(3);
        expect(maxY).toBeLessThanOrEqual(4 + 1e-6);
        expect(minY).toBeLessThan(-1);
        system.dispose();
    });

    it('keeps the speed the shape gave when the shape is stretched', () => {
        const system = burstSystem([burst(0, 1, 0.01, 50)], {
            startSpeed: new ConstantValue(3),
            shape: new SphereEmitter({radius: 1}),
            shapeTransform: {position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 4, 1]},
        });
        emitFor(system, STEP);
        for (let i = 0; i < system.particleNum; i++) {
            expect(system.particles[i].velocity.length()).toBeCloseTo(3);
        }
        system.dispose();
    });

    it('round-trips through JSON and clone', () => {
        const transform = {
            position: [0, -0.2, 0] as [number, number, number],
            rotation: aboutX(-90),
            scale: [1, 1.5, 1] as [number, number, number],
        };
        const system = burstSystem([burst(0, 1, 0.01)], {shapeTransform: transform});
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = system.toJSON(meta);
        expect(json.shapeTransform).toEqual(transform);
        const restored = ParticleSystem.fromJSON(json, meta, {}, scene);
        expect(restored.shapeTransform).toEqual(transform);
        expect(restored.clone().shapeTransform).toEqual(transform);
        const plain = burstSystem([burst(0, 1, 0.01)]);
        expect(plain.toJSON({textures: {}, materials: {}, geometries: {}} as any).shapeTransform).toBeUndefined();
        for (const s of [system, restored, plain]) s.dispose();
    });
});

describe('stretched billboards', () => {
    it('batches freeform stretching apart and draws it with its own shader path', () => {
        const renderer = new BatchedRenderer('freeform', scene);
        const make = (freeform: boolean) =>
            burstSystem([burst(0, 1, 0.01)], {
                renderMode: RenderMode.StretchedBillBoard,
                rendererEmitterSettings: {speedFactor: 0, lengthFactor: 2, ...(freeform ? {freeform: true} : {})},
            });
        const classic = make(false);
        const freeform = make(true);
        renderer.addSystem(classic);
        renderer.addSystem(freeform);
        expect(renderer.batches.length).toBe(2);
        const defines = renderer.batches.map((b) =>
            ((b.mesh.material as ShaderMaterial).options.defines as string[]).includes('FREEFORM_STRETCH')
        );
        expect(defines.sort()).toEqual([false, true]);
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        expect((freeform.toJSON(meta).rendererEmitterSettings as any).freeform).toBe(true);
        renderer.dispose();
        classic.dispose();
        freeform.dispose();
    });

    it('streaks along how a particle moves, not only its own velocity', () => {
        const renderer = new BatchedRenderer('moved', scene);
        const system = burstSystem([burst(0, 1, 0.01)], {
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 1, lengthFactor: 1},
            behaviors: [new VelocityOverLife(new ConstantValue(0), new ConstantValue(2), new ConstantValue(0))],
        });
        renderer.addSystem(system);
        for (let i = 0; i < 6; i++) renderer.update(STEP);
        const velocity = (renderer.batches[0] as any).velocityBuffer as Float32Array;
        expect(velocity[1]).toBeGreaterThan(0.5);
        expect(Math.abs(velocity[0])).toBeLessThan(1e-6);
        renderer.dispose();
        system.dispose();
    });
});

describe('material colour', () => {
    const effect = (material: Record<string, unknown>) => ({
        metadata: {version: 4.5, type: 'Object3D'},
        geometries: [],
        textures: [],
        images: [],
        materials: [
            {uuid: 'm', type: 'QuarksMaterial', transparent: true, alphaMode: Constants.ALPHA_ADD, ...material},
        ],
        object: {
            uuid: 'root',
            type: 'ParticleEmitter',
            name: 'fx',
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            ps: {
                version: '3.0',
                autoDestroy: false,
                looping: true,
                prewarm: false,
                duration: 1,
                shape: {type: 'point'},
                startLife: {type: 'ConstantValue', value: 1},
                startSpeed: {type: 'ConstantValue', value: 0},
                startRotation: {type: 'ConstantValue', value: 0},
                startSize: {type: 'ConstantValue', value: 1},
                startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                emissionOverTime: {type: 'ConstantValue', value: 10},
                emissionOverDistance: {type: 'ConstantValue', value: 0},
                onlyUsedByOther: false,
                rendererEmitterSettings: {},
                renderMode: 0,
                material: 'm',
                startTileIndex: 0,
                uTileCount: 1,
                vTileCount: 1,
                behaviors: [],
                worldSpace: false,
            },
        },
    });

    function load(material: Record<string, unknown>): ParticleSystem {
        const root = new QuarksLoader(scene).parse(effect(material), '');
        return (root as any).system as ParticleSystem;
    }

    it('reads a tint and linear vertex colour from the material and writes them back', () => {
        const system = load({tint: [4, 2, 1, 0.5], vertexColorSpace: 'linear'});
        expect(system.getRendererSettings().materialTint).toEqual([4, 2, 1, 0.5]);
        expect(system.getRendererSettings().vertexColorLinear).toBe(true);
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = system.toJSON(meta);
        expect(meta.materials[json.material!].tint).toEqual([4, 2, 1, 0.5]);
        expect(meta.materials[json.material!].vertexColorSpace).toBe('linear');
        system.dispose();
    });

    it('leaves an untinted gamma-space material as it was', () => {
        const system = load({});
        expect(system.getRendererSettings().materialTint).toEqual([1, 1, 1, 1]);
        expect(system.getRendererSettings().vertexColorLinear).toBe(false);
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = system.toJSON(meta);
        expect(meta.materials[json.material!].tint).toBeUndefined();
        expect(meta.materials[json.material!].vertexColorSpace).toBeUndefined();
        system.dispose();
    });

    function definesFor(system: ParticleSystem, renderer: BatchedRenderer): string[] {
        renderer.addSystem(system);
        return (renderer.batches[0].mesh.material as ShaderMaterial).options.defines as string[];
    }

    it('switches the shader to the tint and colour-space paths only when asked', () => {
        const plain = new BatchedRenderer('plain', scene);
        expect(definesFor(load({}), plain)).not.toEqual(expect.arrayContaining(['USE_TINT']));
        const tinted = new BatchedRenderer('tinted', scene);
        expect(definesFor(load({tint: [3, 3, 3, 1], vertexColorSpace: 'linear'}), tinted)).toEqual(
            expect.arrayContaining(['USE_TINT', 'LINEAR_VERTEX_COLOR'])
        );
        const premultiplied = new BatchedRenderer('premultiplied', scene);
        expect(definesFor(load({alphaMode: Constants.ALPHA_PREMULTIPLIED}), premultiplied)).toEqual(
            expect.arrayContaining(['PREMULTIPLY_VERTEX_ALPHA'])
        );
        for (const r of [plain, tinted, premultiplied]) r.dispose();
    });

    it('premultiplies by the particle alpha in the space the blending runs in', () => {
        // After the conversion to gamma, not before: premultiplied in linear and then encoded, a
        // particle fading in would add its colour at alpha^(1/2.2) and pop in over the one behind.
        for (const source of [particleFragShader, particlePhysicsFragShader, trailFragShader]) {
            const premultiply = source.indexOf('#ifdef PREMULTIPLY_VERTEX_ALPHA');
            expect(premultiply).toBeGreaterThan(source.indexOf('quarksToGamma(linearColor)'));
            // Premultiplied colour shows at nearly zero alpha: it is only dropped when it adds nothing.
            expect(source).toMatch(/PREMULTIPLY_VERTEX_ALPHA[\s\S]*baseColor\.a < 0\.01 && max\(/);
        }
    });

    it('takes the particle alpha twice in the covering alpha when the material says so', () => {
        const system = load({alphaMode: Constants.ALPHA_PREMULTIPLIED, vertexAlphaPower: 2});
        expect(system.getRendererSettings().vertexAlphaSquared).toBe(true);
        const renderer = new BatchedRenderer('squared', scene);
        expect(definesFor(system, renderer)).toEqual(
            expect.arrayContaining(['PREMULTIPLY_VERTEX_ALPHA', 'SQUARE_VERTEX_ALPHA'])
        );
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = system.toJSON(meta);
        expect(meta.materials[json.material!].vertexAlphaPower).toBe(2);
        renderer.dispose();
        system.dispose();

        const plain = load({alphaMode: Constants.ALPHA_PREMULTIPLIED});
        expect(plain.getRendererSettings().vertexAlphaSquared).toBe(false);
        plain.dispose();
    });

    it('outputs linear colour while the scene runs image processing as a post-process', () => {
        const renderer = new BatchedRenderer('linear', scene);
        const defines = () => (renderer.batches[0].mesh.material as ShaderMaterial).options.defines as string[];
        const system = load({});
        renderer.addSystem(system);
        expect(defines()).not.toContain('LINEAR_OUTPUT');
        scene.imageProcessingConfiguration.applyByPostProcess = true;
        expect(defines()).toContain('LINEAR_OUTPUT');
        scene.imageProcessingConfiguration.applyByPostProcess = false;
        expect(defines()).not.toContain('LINEAR_OUTPUT');
        renderer.dispose();
        system.dispose();
    });
});

describe('layers', () => {
    it('puts the batch on the systems layers, so a system on none is simulated but not drawn', () => {
        const renderer = new BatchedRenderer('layers', scene);
        const hidden = burstSystem([burst(0, 1, 0.01)], {layerMask: 0});
        const shown = burstSystem([burst(0, 1, 0.01)], {layerMask: 1});
        renderer.addSystem(hidden);
        renderer.addSystem(shown);
        expect(renderer.batches.map((b) => b.mesh.layerMask).sort()).toEqual([0, 1]);
        renderer.update(STEP);
        expect(hidden.particleNum).toBe(1);
        renderer.dispose();
        hidden.dispose();
        shown.dispose();
    });
});

describe('mesh alignment', () => {
    function meshSystem(alignment?: 'view' | 'world') {
        const system = new ParticleSystem({
            scene,
            renderMode: RenderMode.Mesh,
            rendererEmitterSettings: alignment ? {alignment} : {},
            startLife: new ConstantValue(10),
            startSpeed: new ConstantValue(0),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(0, 1, 0.01)],
            shape: new SphereEmitter(),
            worldSpace: false,
        });
        // Turn the emitter half a turn about Y.
        system.emitter.rotationQuaternion = BQuaternion.RotationAxis(BVector3.Up(), Math.PI);
        return system;
    }

    function drawnRotation(system: ParticleSystem, renderer: BatchedRenderer): number[] {
        renderer.addSystem(system);
        renderer.update(STEP);
        renderer.update(STEP);
        return Array.from(((renderer.batches[0] as any).rotationBuffer as Float32Array).subarray(0, 4));
    }

    it('lays a View-aligned mesh along the camera, ignoring the emitter’s rotation', () => {
        const renderer = new BatchedRenderer('mesh-view', scene);
        const system = meshSystem('view');
        const rotation = drawnRotation(system, renderer);
        // The particle's own rotation alone, not the emitter's half turn on top of it.
        const own = system.particles[0].rotation as Quaternion;
        expect(rotation.map((v) => +v.toFixed(5))).toEqual([own.x, own.y, own.z, own.w].map((v) => +v.toFixed(5)));
        expect((renderer.batches[0].mesh.material as ShaderMaterial).options.defines).toContain('MESH_ALIGN_VIEW');
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        expect(system.toJSON(meta).rendererEmitterSettings).toEqual({alignment: 'view'});
        expect((system.clone() as ParticleSystem).getRendererSettings().meshAlignment).toBe('view');
        renderer.dispose();
        system.dispose();
    });

    it('keeps following the emitter by default', () => {
        const renderer = new BatchedRenderer('mesh-local', scene);
        const system = meshSystem();
        const rotation = drawnRotation(system, renderer);
        const own = system.particles[0].rotation as Quaternion;
        const turned = new Quaternion(0, 1, 0, 0).multiply(own);
        const sign = Math.sign(rotation[3] * turned.w) || 1;
        expect(rotation.map((v) => +(v * sign).toFixed(4))).toEqual(
            [turned.x, turned.y, turned.z, turned.w].map((v) => +v.toFixed(4))
        );
        expect((renderer.batches[0].mesh.material as ShaderMaterial).options.defines).not.toContain('MESH_ALIGN_VIEW');
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        expect(system.toJSON(meta).rendererEmitterSettings).toEqual({});
        renderer.dispose();
        system.dispose();
    });

    it('reads the alignment from JSON', () => {
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = meshSystem('world').toJSON(meta);
        const loaded = ParticleSystem.fromJSON(json, meta, {}, scene);
        expect(loaded.getRendererSettings().meshAlignment).toBe('world');
        loaded.dispose();
    });
});
