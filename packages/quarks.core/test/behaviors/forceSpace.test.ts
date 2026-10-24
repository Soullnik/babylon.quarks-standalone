import {
    ApplyForce,
    Behavior,
    BehaviorSpace,
    ConstantValue,
    EmitterFrame,
    ForceOverLife,
    IParticleSystem,
    Matrix4,
    OrbitOverLife,
    ParticleStore,
    Quaternion,
    SpriteParticle,
    Vector3,
} from '../../src';

/**
 * The space forces and orbits are authored in (Unity's Space on Force over
 * Lifetime), converted into the space the system simulates in. The emitter is
 * turned a quarter turn about Y and doubled in size, so a local X points along
 * world -Z at twice the length, and placed off the origin.
 */
const HALF_PI = Math.PI / 2;
const matrixWorld = new Matrix4().compose(
    new Vector3(10, 0, 0),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), HALF_PI),
    new Vector3(2, 2, 2)
);

function makeSystem(worldSpace: boolean, motionScale?: number): IParticleSystem {
    return {worldSpace, emitter: {matrixWorld}, motionScale} as unknown as IParticleSystem;
}

function makeParticle(store?: ParticleStore, index = 0): SpriteParticle {
    const particle = store === undefined ? new SpriteParticle() : new SpriteParticle(store, index);
    particle.life = 2;
    particle.age = 1;
    return particle;
}

/** Runs one step of `delta` for `particle` through update(), or through updateAll() when asked. */
function step(behavior: Behavior, system: IParticleSystem, particle: SpriteParticle, delta: number, bulk: boolean) {
    behavior.initialize(particle, system);
    behavior.frameUpdate(delta);
    if (bulk && behavior.updateAll !== undefined) {
        behavior.updateAll([particle], 1, delta);
    } else {
        behavior.update(particle, delta);
    }
}

describe('EmitterFrame', () => {
    it('is the identity before its first refresh and converts points and directions after', () => {
        const frame = new EmitterFrame();
        const space: BehaviorSpace = 'world';
        expect(frame.toSimulation(new Vector3(1, 2, 3), space, false)).toEqual(new Vector3(1, 2, 3));
        frame.refresh(makeSystem(false));
        // World +X seen from the emitter: a quarter turn back, then half the length.
        close(frame.toSimulation(new Vector3(1, 0, 0), 'world', false), 0, 0, 0.5);
        close(frame.pointToSimulation(new Vector3(10, 0, 0), 'world', false), 0, 0, 0);
        close(frame.pointToSimulation(new Vector3(0, 0, 0), 'local', true), 10, 0, 0);
    });
});

const close = (vector: Vector3, x: number, y: number, z: number) => {
    expect(vector.x).toBeCloseTo(x, 5);
    expect(vector.y).toBeCloseTo(y, 5);
    expect(vector.z).toBeCloseTo(z, 5);
};

describe.each([false, true])('force space (updateAll: %s)', (bulk) => {
    describe('ApplyForce', () => {
        it('applies a world force as is in a world-space system', () => {
            const particle = makeParticle();
            step(new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(3)), makeSystem(true), particle, 0.5, bulk);
            close(particle.velocity, 1.5, 0, 0);
        });

        it('scales a world force by motionScale in a world-space system', () => {
            const particle = makeParticle();
            step(new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(3)), makeSystem(true, 2), particle, 0.5, bulk);
            close(particle.velocity, 3, 0, 0);
        });

        it('turns a world force into the emitter axes in a local-space system', () => {
            // World +X is local +Z after the inverse quarter turn, at half the length.
            const particle = makeParticle();
            step(new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(2)), makeSystem(false), particle, 1, bulk);
            close(particle.velocity, 0, 0, 1);
        });

        it('applies a local force as is in a local-space system, without motionScale', () => {
            const particle = makeParticle();
            const behavior = new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(2), 'local');
            step(behavior, makeSystem(false, 2), particle, 1, bulk);
            close(particle.velocity, 2, 0, 0);
        });

        it('turns a local force with the emitter in a world-space system', () => {
            // Local +X is world -Z after the quarter turn, doubled by the scale.
            const particle = makeParticle();
            const behavior = new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(2), 'local');
            step(behavior, makeSystem(true), particle, 1, bulk);
            close(particle.velocity, 0, 0, -4);
        });

        it('follows a direction changed after construction', () => {
            const particle = makeParticle();
            const behavior = new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(1));
            behavior.direction.set(0, 1, 0);
            step(behavior, makeSystem(true), particle, 1, bulk);
            close(particle.velocity, 0, 1, 0);
        });

        it('treats an unknown system as world space', () => {
            const particle = makeParticle();
            const behavior = new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(1));
            behavior.frameUpdate(1);
            if (bulk) {
                behavior.updateAll([particle], 1, 1);
            } else {
                behavior.update(particle, 1);
            }
            close(particle.velocity, 0, -1, 0);
        });
    });

    describe('ForceOverLife', () => {
        const force = (space?: 'local' | 'world') =>
            new ForceOverLife(new ConstantValue(1), new ConstantValue(0), new ConstantValue(0), space);

        it('applies a world force with motionScale in a world-space system', () => {
            const particle = makeParticle();
            step(force(), makeSystem(true, 3), particle, 1, bulk);
            close(particle.velocity, 3, 0, 0);
        });

        it('turns a world force into the emitter axes in a local-space system', () => {
            const particle = makeParticle();
            step(force(), makeSystem(false), particle, 1, bulk);
            close(particle.velocity, 0, 0, 0.5);
        });

        it('applies a local force as is in a local-space system', () => {
            const particle = makeParticle();
            step(force('local'), makeSystem(false, 3), particle, 1, bulk);
            close(particle.velocity, 1, 0, 0);
        });

        it('turns a local force with the emitter in a world-space system', () => {
            const particle = makeParticle();
            step(force('local'), makeSystem(true), particle, 1, bulk);
            close(particle.velocity, 0, 0, -2);
        });

        it('applies the same world force before any particle was initialized', () => {
            // update, updateAll and the fused pass used to disagree here.
            const particle = makeParticle();
            const behavior = force();
            behavior.frameUpdate(1);
            if (bulk) {
                behavior.updateAll([particle], 1, 1);
            } else {
                behavior.update(particle, 1);
            }
            close(particle.velocity, 1, 0, 0);
        });
    });

    describe('OrbitOverLife', () => {
        it('turns by the same angle whatever the length of the axis', () => {
            const particle = makeParticle();
            particle.position.set(1, 0, 0);
            step(
                new OrbitOverLife(new ConstantValue(Math.PI), new Vector3(0, 2, 0)),
                makeSystem(false),
                particle,
                1,
                bulk
            );
            close(particle.position, -1, 0, 0);
        });

        it('keeps the distance from the axis in a local-space system', () => {
            const particle = makeParticle();
            particle.position.set(1, 3, 0);
            step(
                new OrbitOverLife(new ConstantValue(HALF_PI), new Vector3(0, 1, 0)),
                makeSystem(false),
                particle,
                1,
                bulk
            );
            close(particle.position, 0, 3, -1);
        });

        it('orbits around the emitter, about its turned axis, in a world-space system', () => {
            // Emitter at x = 10; its local Y is still world Y. A particle one unit
            // to the right of the emitter swings a half turn to one unit to the left.
            const particle = makeParticle();
            particle.position.set(11, 0, 0);
            step(
                new OrbitOverLife(new ConstantValue(Math.PI), new Vector3(0, 1, 0)),
                makeSystem(true),
                particle,
                1,
                bulk
            );
            close(particle.position, 9, 0, 0);
        });

        it('turns a local axis with the emitter in a world-space system', () => {
            // Local X is world -Z after the quarter turn: a half turn about world -Z
            // through the emitter flips a particle above the emitter to below it.
            const particle = makeParticle();
            particle.position.set(10, 1, 0);
            step(
                new OrbitOverLife(new ConstantValue(Math.PI), new Vector3(1, 0, 0)),
                makeSystem(true),
                particle,
                1,
                bulk
            );
            close(particle.position, 10, -1, 0);
        });

        it("orbits the world origin about a world axis with space 'world' in a world-space system", () => {
            // The emitter at x = 10 does not matter: the pivot is the world origin.
            const particle = makeParticle();
            particle.position.set(1, 0, 0);
            const behavior = new OrbitOverLife(new ConstantValue(Math.PI), new Vector3(0, 1, 0), 'world');
            step(behavior, makeSystem(true), particle, 1, bulk);
            close(particle.position, -1, 0, 0);
        });

        it("orbits the world origin, seen from the emitter, with space 'world' in a local-space system", () => {
            // The world origin is 10 units behind the emitter along world -X, which after the
            // inverse quarter turn and the halved scale is local (0, 0, -5). A particle at local
            // (0, 0, -4), one unit from the pivot, swings a half turn about world Y (local Y) to
            // local (0, 0, -6).
            const particle = makeParticle();
            particle.position.set(0, 0, -4);
            const behavior = new OrbitOverLife(new ConstantValue(Math.PI), new Vector3(0, 1, 0), 'world');
            step(behavior, makeSystem(false), particle, 1, bulk);
            close(particle.position, 0, 0, -6);
        });

        it('leaves particles alone for a zero axis', () => {
            const particle = makeParticle();
            particle.position.set(1, 2, 3);
            step(new OrbitOverLife(new ConstantValue(1), new Vector3(0, 0, 0)), makeSystem(false), particle, 1, bulk);
            close(particle.position, 1, 2, 3);
        });
    });
});

describe('force space JSON', () => {
    it('writes space only when it is not the default', () => {
        expect(new OrbitOverLife(new ConstantValue(1)).toJSON()).not.toHaveProperty('space');
        expect(
            (
                OrbitOverLife.fromJSON(
                    new OrbitOverLife(new ConstantValue(1), undefined, 'world').toJSON()
                ) as OrbitOverLife
            ).space
        ).toBe('world');
        expect(new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8)).toJSON()).not.toHaveProperty('space');
        expect(new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8), 'local').toJSON().space).toBe('local');
        const over = new ForceOverLife(new ConstantValue(1), new ConstantValue(0), new ConstantValue(0));
        expect(over.toJSON()).not.toHaveProperty('space');
        expect((ForceOverLife.fromJSON({...over.toJSON(), space: 'local'}) as ForceOverLife).space).toBe('local');
        expect(
            (
                ApplyForce.fromJSON(
                    // A space this version does not know, as a file could hold.
                    JSON.parse(
                        '{"type": "ApplyForce", "direction": [0, 1, 0], "magnitude": {"type": "ConstantValue", "value": 1}, "space": "up"}'
                    )
                ) as ApplyForce
            ).space
        ).toBe('world');
    });
});

describe('EmitterFrame of a flattened emitter', () => {
    it.each([
        ['one axis', new Vector3(2, 0, 1)],
        ['two axes', new Vector3(0, 0, 3)],
        ['every axis', new Vector3(0, 0, 0)],
    ])('keeps a finite rotation with %s scaled to 0', (_name, scale) => {
        const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), HALF_PI);
        const flattened = new Matrix4().compose(new Vector3(1, 2, 3), turn, scale);
        const frame = new EmitterFrame();
        frame.refresh({worldSpace: true, emitter: {matrixWorld: flattened}} as unknown as IParticleSystem);
        for (const value of [frame.quaternion.x, frame.quaternion.y, frame.quaternion.z, frame.quaternion.w]) {
            expect(Number.isFinite(value)).toBe(true);
        }
        const local = frame.toSimulation(new Vector3(0, 0, 1), 'local', true);
        expect(Number.isFinite(local.z)).toBe(true);
        if (scale.z !== 0) {
            // The axis that remains keeps its direction.
            close(local, 0, 0, scale.z);
        }
        if (scale.x !== 0) {
            close(frame.toSimulation(new Vector3(1, 0, 0), 'local', true), 0, scale.x, 0);
        }
    });
});
