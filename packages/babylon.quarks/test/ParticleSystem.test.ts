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
} from 'quarks.core';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
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
});
