import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Quaternion, Vector2, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    AxisAngleGenerator,
    ColorRange,
    ConstantColor,
    ConstantValue,
    Gradient,
    GravityForce,
    OrbitOverLife,
    PointEmitter,
    RandomColor,
    ShapeTransform,
    TextureSequencer,
    TurbulenceField,
    VelocityOverLife,
} from '../src';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/**
 * The public API takes Babylon's math (or any `{x, y, z}` / `{r, g, b, a}`) and copies it: the
 * caller keeps their own object, and later edits to it do not reach the effect.
 */
describe('structural math inputs', () => {
    const xyz = (v: {x: number; y: number; z: number}) => [v.x, v.y, v.z];
    const rgba = (c: {r: number; g: number; b: number; a: number}) => [c.r, c.g, c.b, c.a];

    it('copies a Babylon Vector3 into every vector setting, through the constructor and the setter', () => {
        const cases: Array<[object, (o: never) => {x: number; y: number; z: number}, string]> = [
            [new ApplyForce(new Vector3(1, 2, 3), new ConstantValue(1)), (o: ApplyForce) => o.direction, 'direction'],
            [new GravityForce(new Vector3(1, 2, 3), 1), (o: GravityForce) => o.center, 'center'],
            [
                new AxisAngleGenerator(new Vector3(1, 2, 3), new ConstantValue(0)),
                (o: AxisAngleGenerator) => o.axis,
                'axis',
            ],
            [new OrbitOverLife(new ConstantValue(1), new Vector3(1, 2, 3)), (o: OrbitOverLife) => o.axis, 'axis'],
            [new TextureSequencer(1, 1, new Vector3(1, 2, 3)), (o: TextureSequencer) => o.position, 'position'],
            [new ShapeTransform(new Vector3(1, 2, 3)), (o: ShapeTransform) => o.position, 'position'],
            [
                new TurbulenceField(new Vector3(1, 2, 3), 1, new Vector3(1, 2, 3), new Vector3(1, 2, 3)),
                (o: TurbulenceField) => o.scale,
                'scale',
            ],
        ];
        for (const [object, read, key] of cases) {
            expect(xyz(read(object as never))).toEqual([1, 2, 3]);
            const input = new Vector3(4, 5, 6);
            (object as Record<string, unknown>)[key] = input;
            input.x = 99;
            expect(xyz(read(object as never))).toEqual([4, 5, 6]);
            // The value read back can be edited in place.
            read(object as never).y = 7;
            expect(read(object as never).y).toBe(7);
        }
        const velocity = new VelocityOverLife();
        velocity.orbitalOffset = new Vector3(1, 0, 0);
        expect(xyz(velocity.orbitalOffset)).toEqual([1, 0, 0]);
    });

    it('takes a Babylon Quaternion and plain literals', () => {
        const q = Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2);
        const transform = new ShapeTransform({x: 1, y: 0, z: 0}, q, {x: 2, y: 2, z: 2});
        q.x = 5;
        expect(transform.rotation.y).toBeCloseTo(Math.SQRT1_2, 6);
        expect(transform.rotation.x).toBe(0);
        transform.rotation = Quaternion.Identity();
        expect(transform.isIdentity()).toBe(false);
        transform.position = {x: 0, y: 0, z: 0};
        transform.scale = new Vector3(1, 1, 1);
        expect(transform.isIdentity()).toBe(true);
    });

    it('copies colours given as Babylon Color4 and reads them as r, g, b, a', () => {
        const input = new Color4(1, 0.5, 0.25, 0.75);
        const constant = new ConstantColor(input);
        const range = new ColorRange(input, {r: 0, g: 0, b: 0, a: 1});
        const random = new RandomColor(input, input);
        input.r = 0;
        expect(rgba(constant.color)).toEqual([1, 0.5, 0.25, 0.75]);
        expect(rgba(range.a)).toEqual([1, 0.5, 0.25, 0.75]);
        expect(rgba(random.b)).toEqual([1, 0.5, 0.25, 0.75]);
        constant.color = new Color4(0, 1, 0, 1);
        expect(rgba(constant.color)).toEqual([0, 1, 0, 1]);
        // The internal colour's r/g/b/a are its x/y/z/w: what generators write is what users read.
        const out = constant.genColor([], constant.color.clone());
        expect([out.x, out.y, out.z, out.w]).toEqual([0, 1, 0, 1]);
        const {r, g, b, a} = constant.color;
        const copy = new Color4(r, g, b, a);
        expect(copy.asArray()).toEqual([0, 1, 0, 1]);
    });

    it('builds a gradient from Color3 keys and evaluates it like Unity', () => {
        const gradient = new Gradient(
            [
                [new Color3(1, 0, 0), 0],
                [new Color3(0, 0, 1), 1],
            ],
            [
                [1, 0],
                [0, 1],
            ]
        );
        const middle = gradient.evaluate(0.5);
        expect(rgba(middle)).toEqual([0.5, 0, 0.5, 0.5]);
        expect(Object.keys(middle).sort()).toEqual(['a', 'b', 'g', 'r']);
        const target = new Color4();
        expect(gradient.evaluate(1, target)).toBe(target);
        expect(target.asArray()).toEqual([0, 0, 1, 0]);
    });

    describe('on a particle system', () => {
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

        const create = (overrides: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
            new ParticleSystem({
                scene,
                startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
                shape: new PointEmitter(),
                ...overrides,
            });

        it('copies tint, pivot, flip, the loop range and the trail side axis', () => {
            const tint = new Color4(1, 0.5, 0.25, 1);
            const pivot = new Vector3(0, 1, 0);
            const flip = new Vector2(0.5, 0);
            const loop = new Vector2(0.8, 0.2);
            const side = new Vector3(0, 0, 1);
            const ps = create({
                pivot,
                flip,
                ringBufferLoopRange: loop,
                renderMode: RenderMode.Trail,
                rendererEmitterSettings: {sideAxis: side},
            });
            ps.tint = tint;
            for (const v of [tint]) v.r = 9;
            pivot.y = 9;
            flip.x = 9;
            loop.x = 9;
            side.z = 9;
            expect(rgba(ps.tint!)).toEqual([1, 0.5, 0.25, 1]);
            expect(xyz(ps.pivot!)).toEqual([0, 1, 0]);
            expect(ps.flip).toEqual({x: 0.5, y: 0});
            // Clamped and put in order as it is set.
            expect(ps.ringBufferLoopRange).toEqual({x: 0.2, y: 0.8});
            expect(xyz((ps.rendererEmitterSettings as {sideAxis: Vector3}).sideAxis)).toEqual([0, 0, 1]);

            ps.ringBufferLoopRange = new Vector2(-1, 0.5);
            expect(ps.ringBufferLoopRange).toEqual({x: 0, y: 0.5});
            ps.flip = new Vector2(0, 0);
            expect(ps.flip).toBeUndefined();

            const copy = ps.clone();
            expect(copy.tint).toEqual(ps.tint);
            expect(copy.tint).not.toBe(ps.tint);
            ps.tint!.a = 0;
            expect(copy.tint!.a).toBe(1);
            copy.dispose();
            ps.dispose();
        });

        it('fills a Babylon Vector3 with the world bounds and the beam end', () => {
            const ps = create({renderMode: RenderMode.Beam});
            ps.beamEnd = new Vector3(1, 2, 3);
            const out = new Vector3();
            expect(ps.getBeamEnd(out)).toBe(true);
            expect(out.asArray()).toEqual([1, 2, 3]);
            ps.dispose();
        });
    });
});
