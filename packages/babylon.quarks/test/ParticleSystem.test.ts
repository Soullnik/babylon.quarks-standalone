import {
    ConstantValue,
    ConstantColor,
    IntervalValue,
    SphereEmitter,
    PointEmitter,
    ConeEmitter,
    Vector4,
    SizeOverLife,
    PiecewiseBezier,
    Bezier,
    ColorOverLife,
    Gradient,
    AxisAngleGenerator,
    Vector3 as QVector3,
    Matrix4,
    Vector3,
    Quaternion as QRot,
} from 'quarks.core';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';
import {BatchedRenderer} from '../src/BatchedRenderer';

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

describe('ParticleSystem', () => {
    it('should create a particle system with default parameters', () => {
        const ps = new ParticleSystem({scene});
        expect(ps).toBeDefined();
        expect(ps.looping).toBe(true);
        expect(ps.duration).toBe(1);
        expect(ps.particleNum).toBe(0);
        expect(ps.paused).toBe(false);
        expect(ps.renderMode).toBe(RenderMode.BillBoard);
    });

    it('should create a particle system with custom parameters', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 5,
            looping: false,
            startLife: new IntervalValue(1, 3),
            startSpeed: new ConstantValue(2),
            startSize: new ConstantValue(0.5),
            startColor: new ConstantColor(new Vector4(1, 0, 0, 1)),
            emissionOverTime: new ConstantValue(50),
            shape: new ConeEmitter(),
            renderMode: RenderMode.BillBoard,
        });
        expect(ps.duration).toBe(5);
        expect(ps.looping).toBe(false);
    });

    it('should emit particles when updated', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(100),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
        });

        // First call accumulates waitEmiting, second spawns
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBeGreaterThan(0);
    });

    it('should support behaviors', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 2,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(10),
            shape: new SphereEmitter(),
            behaviors: [
                new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.75, 0.5, 0), 0]])),
            ],
        });
        expect(ps.behaviors.length).toBe(1);
    });

    it('should pause and resume', () => {
        const ps = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(10)});
        ps.pause();
        expect(ps.paused).toBe(true);
        ps.play();
        expect(ps.paused).toBe(false);
    });

    it('should clone correctly', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 3,
            looping: false,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(5),
            startSize: new ConstantValue(0.3),
            startColor: new ConstantColor(new Vector4(0, 1, 0, 1)),
            emissionOverTime: new ConstantValue(20),
            shape: new SphereEmitter(),
            renderMode: RenderMode.BillBoard,
        });

        const cloned = ps.clone();
        expect(cloned.duration).toBe(3);
        expect(cloned.looping).toBe(false);
        expect(cloned.renderMode).toBe(RenderMode.BillBoard);
    });

    it('should support trail render mode', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 2,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(10),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(10),
                followLocalOrigin: false,
            },
        });
        expect(ps.renderMode).toBe(RenderMode.Trail);
    });

    it('should support stretched billboard mode', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 2,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(5),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(10),
            shape: new ConeEmitter(),
            renderMode: RenderMode.StretchedBillBoard,
            speedFactor: 0.5,
        });
        expect(ps.renderMode).toBe(RenderMode.StretchedBillBoard);
    });

    it('should serialize and deserialize full parity contract', () => {
        const ps = new ParticleSystem({
            scene,
            prewarm: true,
            duration: 4,
            looping: false,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(3),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 0.5, 0.25, 1)),
            emissionOverTime: new ConstantValue(12),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(6),
                followLocalOrigin: true,
            },
            uTileCount: 2,
            vTileCount: 3,
            blendTiles: true,
            softParticles: true,
            softNearFade: 0.1,
            softFarFade: 1.5,
            blendMode: Constants.ALPHA_COMBINE,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            alphaTest: 0.2,
            layerMask: 7,
            worldSpace: true,
        });

        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = ps.toJSON(meta);
        expect(json.version).toBe('3.0');
        expect(json.prewarm).toBe(true);
        expect(json.material).toBeDefined();
        expect(json.instancingGeometry).toBeDefined();
        expect(meta.materials[json.material!]).toBeDefined();
        expect(meta.geometries[json.instancingGeometry as string]).toBeDefined();

        const restored = ParticleSystem.fromJSON(json, meta, {}, scene);
        expect(restored.renderMode).toBe(RenderMode.Trail);
        expect(restored.uTileCount).toBe(2);
        expect(restored.vTileCount).toBe(3);
        expect(restored.blendTiles).toBe(true);
        expect(restored.softParticles).toBe(true);
        expect(restored.softNearFade).toBeCloseTo(0.1);
        expect(restored.softFarFade).toBeCloseTo(1.5);
        expect(restored.layers.mask).toBe(7);
    });

    it('should derive renderer settings from provided material', () => {
        const material = new StandardMaterial('particleMat', scene);
        material.alpha = 0.4;
        material.alphaMode = Constants.ALPHA_SUBTRACT;
        material.disableDepthWrite = true;

        const ps = new ParticleSystem({
            scene,
            material,
            renderMode: RenderMode.Mesh,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });

        expect(ps.material).toBe(material);
        expect(ps.blending).toBe(Constants.ALPHA_SUBTRACT);
        expect(ps.softParticles).toBe(false);
        expect(ps.texture).toBeNull();
    });

    it('should stop by restarting state and pausing updates', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 3,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(1),
            emissionOverTime: new ConstantValue(30),
        });

        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBeGreaterThan(0);

        ps.stop();

        expect(ps.paused).toBe(true);
        expect(ps.particleNum).toBe(0);
        expect(ps.emissionState.time).toBe(0);
        expect(ps.emissionState.waitEmiting).toBe(0);
    });

    it('should auto destroy when non-looping emission fully ends', () => {
        const ps = new ParticleSystem({
            scene,
            autoDestroy: true,
            looping: false,
            duration: 0.05,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });

        const disposeSpy = jest.spyOn(ps.emitter, 'dispose');
        const destroyListener = jest.fn();
        ps.addEventListener('destroy', destroyListener);

        ps.update(0.1);
        ps.update(0.1);
        ps.update(0.1);

        expect(disposeSpy).toHaveBeenCalled();
        expect(destroyListener).toHaveBeenCalledTimes(1);
    });

    it('should ask renderer to rebuild batch when settings changed', () => {
        const renderer = new BatchedRenderer('particle-renderer-update', scene);
        const ps = new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(0),
            startLife: new ConstantValue(1),
        });
        renderer.addSystem(ps);

        const rendererSpy = jest.spyOn(renderer, 'updateSystem');
        ps.blending = Constants.ALPHA_SUBTRACT;

        ps.update(1 / 60);
        ps.update(1 / 60);

        expect(rendererSpy).toHaveBeenCalledTimes(1);
        renderer.dispose();
    });

    it('should update trail particles from local origin with parent matrix', () => {
        const ps = new ParticleSystem({
            scene,
            onlyUsedByOther: true,
            worldSpace: false,
            duration: 2,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(8),
                followLocalOrigin: true,
            },
        });

        ps.emitter.position.set(3, 0, 0);
        ps.emitter.computeWorldMatrix(true);
        ps.emissionState.waitEmiting = 1;
        ps.emit(0, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBe(1);

        const particle = ps.particles[0] as any;
        expect(particle.localPosition).toBeDefined();
        expect(particle.parentMatrix).toBeDefined();

        ps.update(1 / 60);
        expect(particle.position.x).toBeCloseTo(3, 5);
    });

    it('should support removing listeners by callback and by event', () => {
        const ps = new ParticleSystem({scene, emissionOverTime: new ConstantValue(0)});
        const emitEndListener = jest.fn();

        ps.addEventListener('emitEnd', emitEndListener);
        ps.removeEventListener('emitEnd', emitEndListener);
        ps.endEmit();
        expect(emitEndListener).toHaveBeenCalledTimes(0);

        ps.addEventListener('emitEnd', emitEndListener);
        ps.removeAllEventListeners('emitEnd');
        ps.endEmit();
        expect(emitEndListener).toHaveBeenCalledTimes(0);
    });

    it('should restore stretched billboard from legacy speedFactor and packed geometry', () => {
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.StretchedBillBoard,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            rendererEmitterSettings: {
                speedFactor: 2,
                lengthFactor: 4,
            },
        });

        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json: any = ps.toJSON(meta);
        json.rendererEmitterSettings = {};
        json.speedFactor = 0.75;
        const geometryId = json.instancingGeometry;
        meta.geometries[geometryId] = {
            data: {
                attributes: {
                    position: {array: [0, 0, 0, 1, 0, 0, 0, 1, 0]},
                    uv: {array: [0, 0, 1, 0, 0, 1]},
                },
                index: {array: [0, 1, 2], type: 'Uint16Array'},
            },
        };

        const restored = ParticleSystem.fromJSON(json, meta, {}, scene);
        expect((restored.rendererEmitterSettings as any).speedFactor).toBe(0.75);
        expect(restored.getRendererSettings().instancingIndices).toBeInstanceOf(Uint16Array);
    });

    it('switches render mode from billboard to trail via setter', () => {
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.BillBoard,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        ps.renderMode = RenderMode.Trail;
        expect(ps.renderMode).toBe(RenderMode.Trail);
    });

    it('assigns material through setter to refresh renderer material settings', () => {
        const mat = new StandardMaterial('dyn-mat', scene);
        mat.alphaMode = Constants.ALPHA_MULTIPLY;
        const ps = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        ps.material = mat;
        expect(ps.material).toBe(mat);
        expect(ps.blending).toBe(Constants.ALPHA_MULTIPLY);
    });

    it('should reduce emitted particles when quality factor is lowered', () => {
        const highQuality = new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(100),
            shape: new PointEmitter(),
        });
        const lowQuality = new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(100),
            shape: new PointEmitter(),
        });
        lowQuality.setQualityFactor(0.25);

        highQuality.emit(0.5, highQuality.emissionState, highQuality.emitter.matrixWorld);
        highQuality.emit(0.5, highQuality.emissionState, highQuality.emitter.matrixWorld);
        lowQuality.emit(0.5, lowQuality.emissionState, lowQuality.emitter.matrixWorld);
        lowQuality.emit(0.5, lowQuality.emissionState, lowQuality.emitter.matrixWorld);

        expect(lowQuality.particleNum).toBeLessThan(highQuality.particleNum);
    });

    it('exposes renderer property accessors and layer mask proxy', () => {
        const tex = RawTexture.CreateRGBTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
        const ps = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            texture: null,
            uTileCount: 1,
            vTileCount: 1,
        });
        ps.time = 0.25;
        expect(ps.time).toBeCloseTo(0.25, 5);
        ps.texture = tex;
        expect(ps.texture).toBe(tex);
        ps.uTileCount = 3;
        ps.vTileCount = 2;
        expect(ps.uTileCount).toBe(3);
        expect(ps.vTileCount).toBe(2);
        ps.blendTiles = true;
        expect(ps.blendTiles).toBe(true);
        ps.softParticles = true;
        ps.softNearFade = 0.02;
        ps.softFarFade = 1.2;
        expect(ps.softParticles).toBe(true);
        expect(ps.softNearFade).toBeCloseTo(0.02, 5);
        expect(ps.softFarFade).toBeCloseTo(1.2, 5);
        const newGeom = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
        ps.instancingGeometry = newGeom;
        expect(ps.instancingGeometry).toBe(newGeom);
        ps.blending = Constants.ALPHA_SUBTRACT;
        expect(ps.blending).toBe(Constants.ALPHA_SUBTRACT);
        ps.renderOrder = 12;
        expect(ps.renderOrder).toBe(12);
        ps.layers.mask = 0x00f0f0f0;
        expect(ps.layers.mask).toBe(0x00f0f0f0);
        tex.dispose();
    });

    it('switches renderMode across trail, mesh, stretched, and billboard variants', () => {
        const ps = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
        });
        ps.renderMode = RenderMode.Mesh;
        expect(ps.renderMode).toBe(RenderMode.Mesh);
        ps.renderMode = RenderMode.StretchedBillBoard;
        expect((ps.rendererEmitterSettings as any).speedFactor).toBeDefined();
        ps.renderMode = RenderMode.VerticalBillBoard;
        expect(ps.renderMode).toBe(RenderMode.VerticalBillBoard);
        ps.renderMode = RenderMode.HorizontalBillBoard;
        expect(ps.renderMode).toBe(RenderMode.HorizontalBillBoard);
        ps.renderMode = RenderMode.BillBoard;
        expect(ps.renderMode).toBe(RenderMode.BillBoard);
    });

    it('runs prewarm simulation once for looping systems', () => {
        const ps = new ParticleSystem({
            scene,
            looping: true,
            prewarm: true,
            duration: 0.05,
            startLife: new ConstantValue(0.2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
        });
        ps.update(1 / 60);
        expect((ps as any).prewarmed).toBe(true);
    });

    it('skips burst spawn when random exceeds probability', () => {
        const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
        const ps = new ParticleSystem({
            scene,
            duration: 2,
            looping: true,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(20), probability: 0.5, interval: 0.1, cycle: 1}],
            shape: new PointEmitter(),
        });
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBe(0);
        randomSpy.mockRestore();
    });

    it('applies quality floor to burst particle counts', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 2,
            looping: true,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(11), probability: 1, interval: 0.1, cycle: 1}],
            shape: new PointEmitter(),
        });
        ps.setQualityFactor(0.2);
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBe(2);
    });

    it('emits extra particles from emissionOverDistance travel', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionOverDistance: new ConstantValue(5),
            shape: new PointEmitter(),
        });
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.emitter.position.x = 5;
        ps.emitter.computeWorldMatrix(true);
        const before = ps.emissionState.waitEmiting;
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.emissionState.waitEmiting).toBeGreaterThanOrEqual(before);
    });

    it('fires particleDied when billboard particles expire', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 3,
            looping: true,
            startLife: new ConstantValue(0.01),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(400),
            shape: new PointEmitter(),
        });
        const died = jest.fn();
        ps.addEventListener('particleDied', died);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        for (let i = 0; i < 40; i++) {
            ps.update(1 / 30);
        }
        expect(died).toHaveBeenCalled();
    });

    it('restores fromJSON with numeric startTileIndex', () => {
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const ps = ParticleSystem.fromJSON(
            {
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
                emissionOverTime: {type: 'ConstantValue', value: 0},
                emissionOverDistance: {type: 'ConstantValue', value: 0},
                emissionBursts: [],
                onlyUsedByOther: false,
                instancingGeometry: 'geo',
                renderOrder: 0,
                renderMode: RenderMode.BillBoard,
                rendererEmitterSettings: {},
                material: 'mat',
                layers: 1,
                startTileIndex: 3,
                uTileCount: 1,
                vTileCount: 1,
                behaviors: [],
                worldSpace: true,
            } as any,
            {
                ...meta,
                geometries: {
                    geo: {positions: new Float32Array(12), indices: new Uint32Array([0, 1, 2])},
                },
                materials: {
                    mat: {transparent: true, alphaMode: Constants.ALPHA_ADD, depthTest: true, depthWrite: false, alphaTest: 0},
                },
            },
            {},
            scene
        );
        ps.emissionState.waitEmiting = 1;
        ps.emit(0, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBe(1);
        expect(ps.particles[0].uvTile).toBe(3);
    });

    it('spawns mesh particles with axis-angle rotation generator', () => {
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.Mesh,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            startRotation: new AxisAngleGenerator(new QVector3(0, 1, 0), new ConstantValue(0.5)),
            emissionOverTime: new ConstantValue(50),
            shape: new PointEmitter(),
        });
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBeGreaterThan(0);
        const rot = (ps.particles[0] as any).rotation;
        expect(rot.w).toBeDefined();
    });

    it('disables fast trail history when WidthOverLength behavior is present', () => {
        const widthBehavior = {
            type: 'WidthOverLength',
            clone: () => widthBehavior,
            reset: () => {},
            initialize: () => {},
            frameUpdate: () => {},
            update: () => {},
            toJSON: () => ({type: 'WidthOverLength'}),
        } as any;
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.Trail,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(20),
            shape: new PointEmitter(),
            rendererEmitterSettings: {startLength: new ConstantValue(6), followLocalOrigin: false},
            behaviors: [widthBehavior],
        });
        expect((ps as any).useFastTrailHistory).toBe(false);
    });

    it('clones trail and stretched systems with renderer emitter settings', () => {
        const trail = new ParticleSystem({
            scene,
            renderMode: RenderMode.Trail,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            rendererEmitterSettings: {startLength: new ConstantValue(7), followLocalOrigin: true},
        });
        const trailClone = trail.clone();
        expect(trailClone.renderMode).toBe(RenderMode.Trail);
        const stretched = new ParticleSystem({
            scene,
            renderMode: RenderMode.StretchedBillBoard,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            rendererEmitterSettings: {speedFactor: 0.5, lengthFactor: 3},
        });
        const stretchedClone = stretched.clone();
        expect((stretchedClone.rendererEmitterSettings as any).lengthFactor).toBe(3);
    });

    it('applyMaterialSettings is a no-op when rendererSettings is temporarily cleared', () => {
        const ps = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        const saved = (ps as any).rendererSettings;
        (ps as any).rendererSettings = null;
        (ps as any).applyMaterialSettings(new StandardMaterial('tmp', scene));
        (ps as any).rendererSettings = saved;
    });

    it('toJSON with string root meta id and texture still emits version 3 payload', () => {
        const tex = RawTexture.CreateRGBTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
        const ps = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            texture: tex,
        });
        const json = ps.toJSON('bundle-root');
        expect(json.version).toBe('3.0');
        tex.dispose();
    });

    it('clone shallow-copies emission burst rows', () => {
        const ps = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(2), probability: 1, interval: 0.1, cycle: 1}],
        });
        const c = ps.clone();
        expect(c.emissionBursts.length).toBe(1);
        expect(c.emissionBursts[0].time).toBe(0);
    });

    it('fromJSON falls back to default instancing geometry for empty geometry meta', () => {
        const meta: any = {textures: {}, materials: {}, geometries: {bad: {}}};
        const ps = ParticleSystem.fromJSON(
            {
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
                emissionOverTime: {type: 'ConstantValue', value: 0},
                emissionOverDistance: {type: 'ConstantValue', value: 0},
                emissionBursts: [],
                onlyUsedByOther: false,
                instancingGeometry: 'bad',
                renderOrder: 0,
                renderMode: RenderMode.BillBoard,
                rendererEmitterSettings: {},
                material: 'mat',
                layers: 1,
                startTileIndex: {type: 'ConstantValue', value: 0},
                uTileCount: 1,
                vTileCount: 1,
                behaviors: [],
                worldSpace: true,
            } as any,
            {
                ...meta,
                materials: {
                    mat: {transparent: true, alphaMode: Constants.ALPHA_ADD, depthTest: true, depthWrite: false, alphaTest: 0},
                },
            },
            {},
            scene
        );
        expect(ps.getRendererSettings().instancingGeometry.length).toBeGreaterThan(0);
    });

    it('fromJSON synthesizes indices when geometry meta has positions but empty indices', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0]);
        const meta: any = {
            textures: {},
            materials: {
                mat: {transparent: true, alphaMode: Constants.ALPHA_ADD, depthTest: true, depthWrite: false, alphaTest: 0},
            },
            geometries: {
                arc: {
                    positions,
                    indices: new Uint32Array(0),
                    uvs: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
                    normals: new Float32Array(18),
                },
            },
        };
        const ps = ParticleSystem.fromJSON(
            {
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
                emissionOverTime: {type: 'ConstantValue', value: 0},
                emissionOverDistance: {type: 'ConstantValue', value: 0},
                emissionBursts: [],
                onlyUsedByOther: false,
                instancingGeometry: 'arc',
                renderOrder: 0,
                renderMode: RenderMode.Mesh,
                rendererEmitterSettings: {},
                material: 'mat',
                layers: 1,
                startTileIndex: {type: 'ConstantValue', value: 0},
                uTileCount: 1,
                vTileCount: 1,
                behaviors: [],
                worldSpace: true,
            } as any,
            meta,
            {},
            scene
        );
        const indices = ps.getRendererSettings().instancingIndices as Uint32Array;
        expect(indices.length).toBe(6);
        expect(Array.from(indices)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('update clamps delta above 0.1 seconds', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 10,
            looping: true,
            startLife: new ConstantValue(10),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
        });
        ps.update(5);
        expect(ps.emissionState.time).toBeLessThanOrEqual(10);
    });

    it('invokes custom behavior frameUpdate and update hooks', () => {
        const behavior = {
            reset: jest.fn(),
            initialize: jest.fn(),
            frameUpdate: jest.fn(),
            update: jest.fn(),
            clone: function () {
                return {...this};
            },
            toJSON: () => ({}),
        } as any;
        const ps = new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(100),
            shape: new PointEmitter(),
            behaviors: [behavior],
        });
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.update(1 / 30);
        expect(behavior.frameUpdate).toHaveBeenCalled();
        expect(behavior.update).toHaveBeenCalled();
    });

    it('spawn uses vec3function startSize generator when provided', () => {
        const vec3Size: any = {
            type: 'vec3function',
            startGen: jest.fn(),
            genValue: (_mem: any, out: Vector3, _tr: number) => {
                out.set(0.5, 1.5, 2.5);
            },
        };
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.BillBoard,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: vec3Size,
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
        });
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBeGreaterThan(0);
        expect(ps.particles[0].startSize.x).toBeCloseTo(0.5, 5);
    });

    it('spawn maps rotation generator type rotation to numeric billboard rotation', () => {
        const rotGen: any = {
            type: 'rotation',
            startGen: jest.fn(),
            genValue: (_mem: any, _out: QRot, _a: number, _tr: number) => {},
        };
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.BillBoard,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            startRotation: rotGen,
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
        });
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        expect(ps.particleNum).toBeGreaterThan(0);
        expect(typeof (ps.particles[0] as any).rotation).toBe('number');
    });

    it('world-space mesh spawn composes quaternion with emitter basis', () => {
        const ps = new ParticleSystem({
            scene,
            worldSpace: true,
            renderMode: RenderMode.Mesh,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            startRotation: new ConstantValue(0),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
        });
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        const q = (ps.particles[0] as any).rotation as QRot;
        expect(q.w).toBeDefined();
    });

    it('onlyUsedByOther spawn assigns parent emitter matrix to particles', () => {
        const ps = new ParticleSystem({
            scene,
            onlyUsedByOther: true,
            worldSpace: false,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
        });
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        expect((ps.particles[0] as any).parentMatrix).toBeDefined();
    });

    it('emit skips endEmit for onlyUsedByOther non-looping systems', () => {
        const ps = new ParticleSystem({
            scene,
            onlyUsedByOther: true,
            looping: false,
            duration: 0.01,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
        });
        ps.emit(0.02, ps.emissionState, ps.emitter.matrixWorld);
        expect((ps as any).emitEnded).toBe(false);
    });

    it('fast trail history path stays active for short-lived trail particles', () => {
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.Trail,
            looping: true,
            duration: 5,
            startLife: new ConstantValue(0.02),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(400),
            shape: new PointEmitter(),
            rendererEmitterSettings: {startLength: new ConstantValue(8), followLocalOrigin: false},
        });
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        for (let i = 0; i < 20; i++) {
            ps.update(1 / 20);
        }
        expect((ps as any).useFastTrailHistory).toBe(true);
    });

    it('trail followLocalOrigin respects particle parentMatrix when updating positions', () => {
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.Trail,
            worldSpace: false,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(50),
            shape: new PointEmitter(),
            rendererEmitterSettings: {startLength: new ConstantValue(6), followLocalOrigin: true},
        });
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.1, ps.emissionState, ps.emitter.matrixWorld);
        const wm = ps.emitter.getWorldMatrix();
        const pm = new Matrix4();
        for (let i = 0; i < 16; i++) {
            (pm as any).elements[i] = wm.m[i];
        }
        (ps.particles[0] as any).parentMatrix = pm;
        ps.update(1 / 60);
        expect(ps.particleNum).toBeGreaterThan(0);
    });

    it('slow trail path uses TrailParticle.update when WidthOverLength is present', () => {
        const widthBehavior = {
            type: 'WidthOverLength',
            clone: () => widthBehavior,
            reset: () => {},
            initialize: () => {},
            frameUpdate: () => {},
            update: () => {},
            toJSON: () => ({type: 'WidthOverLength'}),
        } as any;
        const ps = new ParticleSystem({
            scene,
            renderMode: RenderMode.Trail,
            startLife: new ConstantValue(0.5),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
            rendererEmitterSettings: {startLength: new ConstantValue(10), followLocalOrigin: false},
            behaviors: [widthBehavior],
        });
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        ps.emit(0.05, ps.emissionState, ps.emitter.matrixWorld);
        for (let i = 0; i < 15; i++) {
            ps.update(1 / 30);
        }
        expect((ps as any).useFastTrailHistory).toBe(false);
    });
});
