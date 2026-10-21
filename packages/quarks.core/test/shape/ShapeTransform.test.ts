import {
    BoxEmitter,
    CircleEmitter,
    ConeEmitter,
    DonutEmitter,
    EdgeEmitter,
    EmissionState,
    EmitterFromJSON,
    EmitterShape,
    GridEmitter,
    HemisphereEmitter,
    PointEmitter,
    Quaternion,
    RectangleEmitter,
    ShapeTransform,
    SphereEmitter,
    SpriteParticle,
    Vector3,
} from '../../src';

const emissionState: EmissionState = {
    burstIndex: 0,
    burstWaveIndex: 0,
    burstParticleIndex: 0,
    burstParticleCount: 0,
    isBursting: false,
    time: 0,
    waitEmiting: 0,
    travelDistance: 0,
};

const spawn = (shape: EmitterShape, startSpeed = 1) => {
    const p = new SpriteParticle();
    p.startSpeed = startSpeed;
    shape.initialize(p, emissionState);
    return p;
};

/** Unity's `Quaternion.Euler(0, 90, 0)`. */
const yaw90 = () => new Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2);

describe('ShapeTransform', () => {
    test('places and turns a cone the way Unity does', () => {
        // Measured in Unity: a radius-1 rim cone with angle 0 and Shape
        // position (1,2,3), rotation (0,90,0), scale (2,1,1) spawns on
        // x = 1, y = 2 + sin, z = 3 - 2 cos, and every particle flies along +X.
        const shape = new ConeEmitter({
            radius: 1,
            angle: 0,
            thickness: 0,
            transform: new ShapeTransform(new Vector3(1, 2, 3), yaw90(), new Vector3(2, 1, 1)),
        });
        for (let i = 0; i < 20; i++) {
            const p = spawn(shape, 3);
            expect(p.position.x).toBeCloseTo(1, 5);
            const sin = p.position.y - 2;
            const cos = (3 - p.position.z) / 2;
            expect(sin * sin + cos * cos).toBeCloseTo(1, 5);
            expect(p.velocity.x).toBeCloseTo(3, 5);
            expect(p.velocity.y).toBeCloseTo(0, 5);
            expect(p.velocity.z).toBeCloseTo(0, 5);
        }
    });

    test('scale bends start directions but keeps the start speed', () => {
        // Unity: a 45 degree cone with scale (1,1,3) leaves at 0.949 along Z.
        const shape = new ConeEmitter({
            radius: 1,
            angle: Math.PI / 4,
            thickness: 0,
            transform: new ShapeTransform(undefined, undefined, new Vector3(1, 1, 3)),
        });
        for (let i = 0; i < 10; i++) {
            const p = spawn(shape, 2);
            expect(p.velocity.length()).toBeCloseTo(2, 5);
            expect(p.velocity.z / 2).toBeCloseTo(3 / Math.sqrt(10), 3);
            expect(p.position.z).toBeCloseTo(0, 5);
        }
    });

    test('leaves a still particle still', () => {
        const transform = new ShapeTransform(new Vector3(1, 0, 0), yaw90(), new Vector3(2, 2, 2));
        const p = new SpriteParticle();
        p.position.set(1, 0, 0);
        p.velocity.set(0, 0, 0);
        transform.apply(p);
        expect(p.velocity.length()).toBe(0);
        expect(p.position.x).toBeCloseTo(1, 5);
        expect(p.position.z).toBeCloseTo(-2, 5);
    });

    test('writes only the parts that differ from identity', () => {
        expect(new ShapeTransform().isIdentity()).toBe(true);
        expect(new ShapeTransform().toJSON()).toEqual({});
        expect(ShapeTransform.toShapeJSON(new ShapeTransform())).toEqual({});
        expect(ShapeTransform.toShapeJSON(undefined)).toEqual({});
        expect(new ShapeTransform(new Vector3(0, 1, 0)).toJSON()).toEqual({position: [0, 1, 0]});
        expect(new ShapeTransform(undefined, yaw90()).toJSON()).toEqual({
            rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
        });
        expect(new ShapeTransform(undefined, undefined, new Vector3(1, 2, 1)).toJSON()).toEqual({scale: [1, 2, 1]});
        expect(ShapeTransform.fromJSON(undefined)).toBeUndefined();
        expect(ShapeTransform.fromJSON({})!.isIdentity()).toBe(true);
    });

    test('clone is independent', () => {
        const a = new ShapeTransform(new Vector3(1, 2, 3), yaw90(), new Vector3(2, 2, 2));
        const b = a.clone();
        b.position.x = 9;
        b.rotation.set(0, 0, 0, 1);
        b.scale.y = 7;
        expect(a.toJSON()).toEqual({
            position: [1, 2, 3],
            rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
            scale: [2, 2, 2],
        });
    });

    const shapes: Array<[string, () => EmitterShape]> = [
        ['circle', () => new CircleEmitter({radius: 1})],
        ['cone', () => new ConeEmitter({radius: 1})],
        ['donut', () => new DonutEmitter({radius: 1, donutRadius: 0.2})],
        ['sphere', () => new SphereEmitter({radius: 1})],
        ['hemisphere', () => new HemisphereEmitter({radius: 1})],
        ['rectangle', () => new RectangleEmitter({width: 1, height: 1})],
        ['grid', () => new GridEmitter({width: 1, height: 1})],
        ['point', () => new PointEmitter()],
        ['box', () => new BoxEmitter({width: 1, height: 1, depth: 1})],
        ['edge', () => new EdgeEmitter({radius: 1})],
    ];

    test.each(shapes)('%s serializes without a transform unless it has one', (_name, make) => {
        const shape = make();
        expect(shape.transform).toBeUndefined();
        expect('transform' in shape.toJSON()).toBe(false);
        expect(EmitterFromJSON(shape.toJSON(), {textures: {}, geometries: {}}).transform).toBeUndefined();
    });

    test.each(shapes)('%s round-trips and applies its transform', (_name, make) => {
        const json = {...make().toJSON(), transform: {position: [0, 50, 0], scale: [0.5, 0.5, 0.5]}};
        const shape = EmitterFromJSON(json, {textures: {}, geometries: {}});
        expect(shape.transform).toBeInstanceOf(ShapeTransform);
        expect(shape.toJSON().transform).toEqual({position: [0, 50, 0], scale: [0.5, 0.5, 0.5]});

        const copy = shape.clone();
        expect(copy.transform).not.toBe(shape.transform);
        expect(copy.toJSON()).toEqual(shape.toJSON());

        for (const s of [shape, copy]) {
            const p = spawn(s);
            // Every built-in shape stays within a unit of its origin, halved by the scale.
            expect(Math.abs(p.position.y - 50)).toBeLessThanOrEqual(1);
            expect(p.position.length()).toBeGreaterThan(49);
        }
    });
});
