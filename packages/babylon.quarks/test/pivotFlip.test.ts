import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    PointEmitter,
    ShapeTransform,
    SpriteParticle,
    Vector2,
    Vector3,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

describe('billboard pivot and flip', () => {
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

    const createSystem = (overrides: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
        new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(2),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(600),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            ...overrides,
        });

    const roundTrip = (ps: ParticleSystem) => {
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = ps.toJSON(meta);
        return {json, restored: ParticleSystem.fromJSON(json, meta, {}, scene)};
    };

    it('is off by default and stays out of the JSON', () => {
        const ps = createSystem();
        expect(ps.pivot).toBeUndefined();
        expect(ps.flip).toBeUndefined();
        const {json, restored} = roundTrip(ps);
        expect('pivot' in json).toBe(false);
        expect('flip' in json).toBe(false);
        expect(restored.pivot).toBeUndefined();
        expect(restored.flip).toBeUndefined();
        ps.dispose();
        restored.dispose();
    });

    it('treats a zero pivot or flip as none', () => {
        const ps = createSystem({pivot: new Vector3(0, 0, 0), flip: new Vector2(0, 0)});
        expect(ps.pivot).toBeUndefined();
        expect(ps.flip).toBeUndefined();
        ps.pivot = new Vector3(0, 1, 0);
        expect(ps.pivot!.y).toBe(1);
        ps.pivot = new Vector3();
        expect(ps.pivot).toBeUndefined();
        ps.dispose();
    });

    it('round-trips through toJSON, fromJSON and clone', () => {
        const ps = createSystem({pivot: new Vector3(0.5, -0.25, 0.1), flip: new Vector2(0.3, 1)});
        const {json, restored} = roundTrip(ps);
        expect(json.pivot).toEqual([0.5, -0.25, 0.1]);
        expect(json.flip).toEqual([0.3, 1]);
        expect(restored.pivot!.toArray()).toEqual([0.5, -0.25, 0.1]);
        expect([restored.flip!.x, restored.flip!.y]).toEqual([0.3, 1]);

        const copy = ps.clone();
        expect(copy.pivot!.toArray()).toEqual([0.5, -0.25, 0.1]);
        expect([copy.flip!.x, copy.flip!.y]).toEqual([0.3, 1]);
        expect(copy.pivot).not.toBe(ps.pivot);
        expect(copy.flip).not.toBe(ps.flip);
        for (const s of [ps, restored, copy]) s.dispose();
    });

    it('round-trips a shape transform as part of the system', () => {
        const ps = createSystem({
            shape: new ConeEmitter({transform: new ShapeTransform(new Vector3(0, 1, 0))}),
        });
        const {json, restored} = roundTrip(ps);
        expect(json.shape.transform).toEqual({position: [0, 1, 0]});
        expect(restored.emitterShape.transform!.position.toArray()).toEqual([0, 1, 0]);
        expect(ps.clone().emitterShape.transform!.position.y).toBe(1);
        ps.dispose();
        restored.dispose();
    });

    const material = (renderer: BatchedRenderer, i = 0) => renderer.batches[i].mesh.material as ShaderMaterial;

    it('compiles PIVOT into billboard batches and sets the uniform', () => {
        for (const renderMode of [
            RenderMode.BillBoard,
            RenderMode.StretchedBillBoard,
            RenderMode.VerticalBillBoard,
            RenderMode.HorizontalBillBoard,
        ]) {
            const renderer = new BatchedRenderer('pivot', scene);
            const ps = createSystem({renderMode, pivot: new Vector3(0.5, 0.25, 1)});
            renderer.addSystem(ps);
            const mat = material(renderer);
            expect(mat.options.defines).toContain('PIVOT');
            expect(mat.options.uniforms).toContain('pivot');
            const pivot = (mat as any)._vectors3.pivot;
            expect([pivot.x, pivot.y, pivot.z]).toEqual([0.5, 0.25, 1]);
            renderer.dispose();
            ps.dispose();
        }
    });

    it('leaves PIVOT out without a pivot and for mesh batches', () => {
        for (const [renderMode, pivot] of [
            [RenderMode.BillBoard, undefined],
            [RenderMode.StretchedBillBoard, undefined],
            [RenderMode.Mesh, new Vector3(1, 0, 0)],
        ] as const) {
            const renderer = new BatchedRenderer('no-pivot', scene);
            const ps = createSystem({renderMode, pivot});
            renderer.addSystem(ps);
            expect(material(renderer).options.defines).not.toContain('PIVOT');
            renderer.dispose();
            ps.dispose();
        }
    });

    it('batches systems with different pivots apart', () => {
        const renderer = new BatchedRenderer('pivot-batches', scene);
        const a = createSystem({pivot: new Vector3(0.5, 0, 0)});
        const b = createSystem({pivot: new Vector3(0.5, 0, 0)});
        const c = createSystem({pivot: new Vector3(0, 0.5, 0)});
        const d = createSystem();
        for (const s of [a, b, c, d]) renderer.addSystem(s);
        expect(renderer.batches.length).toBe(3);
        expect(renderer.systemToBatchIndex.get(a)).toBe(renderer.systemToBatchIndex.get(b));
        renderer.dispose();
        for (const s of [a, b, c, d]) s.dispose();
    });

    const sizesAfterFrames = (ps: ParticleSystem) => {
        const renderer = new BatchedRenderer('flip', scene);
        renderer.addSystem(ps);
        for (let i = 0; i < 10; i++) renderer.update(1 / 60);
        const sizes = Array.from((renderer.batches[0] as any).sizeBuffer as Float32Array).slice(0, ps.particleNum * 3);
        renderer.dispose();
        return sizes;
    };

    it('mirrors flipped particles by negating their size', () => {
        for (const [flip, signX, signY] of [
            [undefined, 1, 1],
            [new Vector2(1, 0), -1, 1],
            [new Vector2(0, 1), 1, -1],
            [new Vector2(1, 1), -1, -1],
        ] as const) {
            for (const [worldSpace, renderMode] of [
                [false, RenderMode.BillBoard],
                [true, RenderMode.BillBoard],
                [false, RenderMode.StretchedBillBoard],
            ] as const) {
                const ps = createSystem({flip, worldSpace, renderMode});
                const sizes = sizesAfterFrames(ps);
                expect(ps.particleNum).toBeGreaterThan(5);
                for (let i = 0; i < ps.particleNum; i++) {
                    expect(sizes[i * 3]).toBeCloseTo(2 * signX, 5);
                    expect(sizes[i * 3 + 1]).toBeCloseTo(2 * signY, 5);
                    expect(sizes[i * 3 + 2]).toBeCloseTo(2, 5);
                }
                ps.dispose();
            }
        }
    });

    it('flips about the given fraction of particles', () => {
        const ps = createSystem({flip: new Vector2(0.5, 0)});
        const renderer = new BatchedRenderer('flip-fraction', scene);
        renderer.addSystem(ps);
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);
        let flipped = 0;
        for (let i = 0; i < ps.particleNum; i++) {
            const bits = (ps.particles[i] as SpriteParticle).flip;
            expect(bits & 2).toBe(0);
            flipped += bits & 1;
        }
        expect(ps.particleNum).toBeGreaterThan(200);
        expect(flipped / ps.particleNum).toBeGreaterThan(0.35);
        expect(flipped / ps.particleNum).toBeLessThan(0.65);
        renderer.dispose();
        ps.dispose();
    });

    it('does not flip meshes', () => {
        const ps = createSystem({renderMode: RenderMode.Mesh, flip: new Vector2(1, 1)});
        const sizes = sizesAfterFrames(ps);
        expect(ps.particleNum).toBeGreaterThan(0);
        expect(sizes.every((v) => v >= 0)).toBe(true);
        ps.dispose();
    });

    it('is a SpriteBatch for every billboard mode', () => {
        const renderer = new BatchedRenderer('kind', scene);
        const ps = createSystem({pivot: new Vector3(1, 0, 0)});
        renderer.addSystem(ps);
        expect(renderer.batches[0]).toBeInstanceOf(SpriteBatch);
        renderer.dispose();
        ps.dispose();
    });
});
