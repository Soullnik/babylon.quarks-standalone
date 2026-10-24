import {
    BehaviorFromJSON,
    ConstantValue,
    IParticleSystem,
    LimitSpeedOverLife,
    LimitSpeedOverLifeJSON,
    Matrix4,
    Quaternion,
    readFormat,
    SpriteParticle,
    Vector3,
    Vector3Function,
} from '../../src';

/**
 * Limit Velocity over Lifetime with Separate Axes: each component of the velocity, measured
 * along the axes of the behavior's space, is limited by its own curve. The emitter is turned a
 * quarter turn about Y and doubled, so local X points along world -Z at twice the length.
 */
const matrixWorld = new Matrix4().compose(
    new Vector3(10, 0, 0),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    new Vector3(2, 2, 2)
);
const STEP = 1 / 60;
/** At dampen 1, one 60 Hz step removes a third of the excess. */
const THIRD = 1 / 3;

function makeSystem(worldSpace: boolean, motionScale?: number): IParticleSystem {
    return {worldSpace, emitter: {matrixWorld}, motionScale} as unknown as IParticleSystem;
}

const axes = (x: number, y: number, z: number) =>
    new Vector3Function(new ConstantValue(x), new ConstantValue(y), new ConstantValue(z));

function run(behavior: LimitSpeedOverLife, system: IParticleSystem, velocity: Vector3, bulk: boolean): Vector3 {
    const particle = new SpriteParticle();
    particle.life = 1;
    particle.age = 0.5;
    particle.velocity.copy(velocity);
    behavior.initialize(particle, system);
    behavior.frameUpdate(STEP);
    if (bulk) {
        behavior.updateAll([particle], 1, STEP);
    } else {
        behavior.update(particle, STEP);
    }
    return particle.velocity;
}

const close = (vector: Vector3, x: number, y: number, z: number) => {
    expect(vector.x).toBeCloseTo(x, 5);
    expect(vector.y).toBeCloseTo(y, 5);
    expect(vector.z).toBeCloseTo(z, 5);
};

describe.each([false, true])('LimitSpeedOverLife separate axes (updateAll: %s)', (bulk) => {
    it('limits each axis on its own and keeps its sign', () => {
        const v = run(new LimitSpeedOverLife(axes(2, 3, 4), 1), makeSystem(false), new Vector3(5, -6, 1), bulk);
        close(v, 5 - 3 * THIRD, -6 + 3 * THIRD, 1);
    });

    it('reads a limit below 0 as 0', () => {
        const v = run(new LimitSpeedOverLife(axes(-1, 0, 0), 1), makeSystem(false), new Vector3(3, -3, 0), bulk);
        close(v, 3 - 3 * THIRD, -3 + 3 * THIRD, 0);
    });

    it('measures local axes through the emitter in a world-space system', () => {
        // World -Z is local +X at half the length: 10 world is 5 local, 4 over the limit of 1.
        // A third of that (in local units) comes off, twice as long in world units.
        const v = run(new LimitSpeedOverLife(axes(1, 100, 100), 1), makeSystem(true), new Vector3(0, 0, -10), bulk);
        close(v, 0, 0, -10 + 8 * THIRD);
    });

    it('measures world axes through the emitter in a local-space system', () => {
        // Local +X is world -Z at twice the length: 3 local is 6 world, 4 over the limit of 2.
        const behavior = new LimitSpeedOverLife(axes(100, 100, 2), 1, 'world');
        const v = run(behavior, makeSystem(false), new Vector3(3, 0, 0), bulk);
        close(v, 3 - 2 * THIRD, 0, 0);
    });

    it('scales world limits by the motion scale of a world-space system', () => {
        const behavior = new LimitSpeedOverLife(axes(2, 100, 100), 1, 'world');
        const v = run(behavior, makeSystem(true, 2), new Vector3(7, 0, 0), bulk);
        close(v, 7 - 3 * THIRD, 0, 0);
    });

    it('leaves a particle within every limit alone', () => {
        const v = run(new LimitSpeedOverLife(axes(2, 2, 2), 1), makeSystem(true), new Vector3(0.5, -0.5, 0), bulk);
        close(v, 0.5, -0.5, 0);
    });
});

describe('LimitSpeedOverLife separate axes JSON', () => {
    it('writes the space only when it is not local, and reads it back', () => {
        const local = new LimitSpeedOverLife(axes(1, 2, 3), 0.5);
        expect(local.toJSON()).not.toHaveProperty('space');
        const world = new LimitSpeedOverLife(axes(1, 2, 3), 0.5, 'world');
        const json = world.toJSON();
        expect(json.space).toBe('world');
        expect((json.speed as {type: string}).type).toBe('Vector3Function');
        const read = BehaviorFromJSON(json, undefined as never) as LimitSpeedOverLife;
        expect(read.space).toBe('world');
        expect(read.speed).toBeInstanceOf(Vector3Function);
        expect(read.toJSON()).toEqual(json);
    });

    it('warns and reads 0 for a speed that is a rotation', () => {
        const warnings: string[] = [];
        const json = {type: 'LimitSpeedOverLife', speed: {type: 'Euler', angleX: {type: 'ConstantValue', value: 1}}};
        const read = readFormat({onWarning: (message) => warnings.push(message)}, () =>
            LimitSpeedOverLife.fromJSON(json as never)
        ) as LimitSpeedOverLife;
        expect(read.speed).toBeInstanceOf(ConstantValue);
        expect((read.speed as ConstantValue).value).toBe(0);
        expect(warnings).toHaveLength(1);
    });

    it('reads an unknown space as local', () => {
        const json = {...new LimitSpeedOverLife(axes(1, 2, 3), 0.5).toJSON(), space: 'up'} as unknown;
        expect((LimitSpeedOverLife.fromJSON(json as LimitSpeedOverLifeJSON) as LimitSpeedOverLife).space).toBe('local');
    });

    it('clones the axes and the space', () => {
        const behavior = new LimitSpeedOverLife(axes(1, 2, 3), 0.5, 'world');
        const copy = behavior.clone() as LimitSpeedOverLife;
        expect(copy.space).toBe('world');
        expect(copy.speed).not.toBe(behavior.speed);
        expect(copy.toJSON()).toEqual(behavior.toJSON());
    });
});

describe('LimitSpeedOverLife separate axes under a flattened emitter', () => {
    it('keeps limiting the axes that remain when one axis of the emitter is scaled to 0', () => {
        const flattened = new Matrix4().compose(
            new Vector3(0, 0, 0),
            new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
            new Vector3(1, 0, 1)
        );
        const system = {worldSpace: true, emitter: {matrixWorld: flattened}} as unknown as IParticleSystem;
        // Local X is world +Y after the quarter turn about Z; its limit of 1 still applies.
        const v = run(new LimitSpeedOverLife(axes(1, 1, 100), 1), system, new Vector3(0, 10, 0), false);
        expect(Number.isFinite(v.y)).toBe(true);
        expect(v.y).toBeCloseTo(10 - 9 * THIRD, 4);
    });
});
