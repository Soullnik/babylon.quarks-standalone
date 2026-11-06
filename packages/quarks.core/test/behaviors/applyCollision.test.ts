import {
    ApplyCollision,
    getPhysicsResolver,
    IParticleSystem,
    Matrix4,
    PhysicsResolver,
    Quaternion,
    setPhysicsResolver,
    SpriteParticle,
    Vector3,
} from '../../src';

/** A floor at y = 0 facing up. */
const floor: PhysicsResolver = {
    resolve(position, normal) {
        if (position.y > 0) {
            return false;
        }
        normal.x = 0;
        normal.y = 1;
        normal.z = 0;
        return true;
    },
};

function falling(y: number): SpriteParticle {
    const particle = new SpriteParticle();
    particle.life = 2;
    particle.age = 1;
    particle.position.set(0, y, 0);
    particle.velocity.set(1, -4, 0);
    return particle;
}

describe('ApplyCollision', () => {
    afterEach(() => setPhysicsResolver(undefined));

    it('turns the speed into the surface back out, keeping `bounce` of it and the speed along it', () => {
        const particle = falling(-0.1);
        new ApplyCollision(floor, 0.5).update(particle, 1 / 60);
        expect(particle.velocity.x).toBeCloseTo(1, 6);
        expect(particle.velocity.y).toBeCloseTo(2, 6);
        expect(particle.velocity.z).toBeCloseTo(0, 6);
    });

    it('leaves a particle that hit nothing alone', () => {
        const particle = falling(3);
        new ApplyCollision(floor, 0.5).update(particle, 1 / 60);
        expect(particle.velocity.toArray()).toEqual([1, -4, 0]);
    });

    it('does nothing without a resolver, so a collision effect plays anywhere', () => {
        const particle = falling(-0.1);
        expect(getPhysicsResolver()).toBeUndefined();
        const behavior = ApplyCollision.fromJSON({type: 'ApplyCollision', bounce: 0.5});
        expect(() => behavior.update(particle, 1 / 60)).not.toThrow();
        expect(particle.velocity.toArray()).toEqual([1, -4, 0]);
    });

    it('asks the resolver registered after the effect was loaded', () => {
        const behavior = ApplyCollision.fromJSON({type: 'ApplyCollision', bounce: 1});
        setPhysicsResolver(floor);
        const particle = falling(-0.1);
        behavior.update(particle, 1 / 60);
        expect(particle.velocity.y).toBeCloseTo(4, 6);
        setPhysicsResolver(undefined);
        const second = falling(-0.1);
        behavior.update(second, 1 / 60);
        expect(second.velocity.y).toBe(-4);
    });

    it('prefers its own resolver over the registered one', () => {
        setPhysicsResolver({resolve: () => false});
        const particle = falling(-0.1);
        new ApplyCollision(floor, 1).update(particle, 1 / 60);
        expect(particle.velocity.y).toBeCloseTo(4, 6);
    });

    it('keeps the full speed when a file has no bounce', () => {
        expect((ApplyCollision.fromJSON({type: 'ApplyCollision'}) as ApplyCollision).bounce).toBe(1);
    });

    it('a hit loses `dampen` of the speed and `lifetimeLoss` of the lifetime', () => {
        const particle = falling(-0.1);
        new ApplyCollision(floor, 1, {dampen: 0.5, lifetimeLoss: 0.25}).update(particle, 1 / 60);
        expect(particle.velocity.x).toBeCloseTo(0.5, 6);
        expect(particle.velocity.y).toBeCloseTo(2, 6);
        expect(particle.age).toBeCloseTo(1.5, 6);
    });

    it('does not turn back a particle inside a collider that already moves out', () => {
        const particle = falling(-0.1);
        particle.velocity.set(1, 4, 0);
        new ApplyCollision(floor, 0.5).update(particle, 1 / 60);
        expect(particle.velocity.toArray()).toEqual([1, 4, 0]);
    });
});

/** A system that simulates in world space or not, its emitter placed by `matrix`. */
function systemAt(worldSpace: boolean, matrix = new Matrix4()): IParticleSystem {
    return {worldSpace, emitter: {matrixWorld: matrix}} as unknown as IParticleSystem;
}

/** Runs `steps` steps of a particle under gravity against `behavior`, integrating as a system does. */
function drop(behavior: ApplyCollision, system: IParticleSystem, particle: SpriteParticle, steps: number) {
    behavior.initialize(particle, system);
    for (let i = 0; i < steps; i++) {
        behavior.frameUpdate(1 / 30);
        particle.velocity.y -= 10 / 30;
        behavior.update(particle, 1 / 30);
        particle.position.addScaledVector(particle.velocity, 1 / 30);
    }
}

describe('ApplyCollision planes', () => {
    const ground = {position: new Vector3(0, 0, 0), normal: new Vector3(0, 2, 0)};

    it('keeps a falling particle on the plane, as a sphere of its size', () => {
        const behavior = new ApplyCollision(undefined, 0.5, {planes: [ground]});
        const particle = falling(1);
        particle.size.set(0.2, 0.2, 0.2);
        drop(behavior, systemAt(false), particle, 120);
        expect(particle.position.y).toBeGreaterThanOrEqual(0.1 - 1e-5);
        // It came to rest on the plane and kept sliding along it.
        expect(particle.position.y).toBeLessThan(0.2);
        expect(particle.velocity.x).toBeCloseTo(1, 6);
    });

    it('bounces back up with `bounce` of the speed into it', () => {
        const behavior = new ApplyCollision(undefined, 0.5, {planes: [ground], radiusScale: 0});
        const particle = falling(0.05);
        particle.velocity.set(0, -4, 0);
        behavior.initialize(particle, systemAt(false));
        behavior.frameUpdate(1 / 30);
        behavior.update(particle, 1 / 30);
        expect(particle.velocity.y).toBeCloseTo(2, 6);
    });

    it('takes the planes with the emitter in a world-space system', () => {
        // The emitter is raised by 2, turned upside down and scaled by 3: its local up is world down.
        const matrix = new Matrix4().compose(
            new Vector3(0, 2, 0),
            new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI),
            new Vector3(3, 3, 3)
        );
        // A local plane 1 below the emitter facing its local down: in the world, y = 5 facing up.
        const behavior = new ApplyCollision(undefined, 0, {
            planes: [{position: new Vector3(0, -1, 0), normal: new Vector3(0, -1, 0)}],
            radiusScale: 0,
        });
        const particle = falling(6);
        particle.velocity.set(0, -1, 0);
        drop(behavior, systemAt(true, matrix), particle, 90);
        expect(particle.position.y).toBeGreaterThanOrEqual(5 - 1e-5);
        expect(particle.position.y).toBeLessThan(5.1);
    });

    it('ignores the resolver when it has planes', () => {
        const behavior = new ApplyCollision(floor, 1, {
            planes: [{position: new Vector3(0, -10, 0), normal: new Vector3(0, 1, 0)}],
        });
        const particle = falling(-0.1);
        behavior.update(particle, 1 / 60);
        expect(particle.velocity.toArray()).toEqual([1, -4, 0]);
    });

    it('writes only the settings that differ from the defaults and reads them back', () => {
        expect(new ApplyCollision(undefined, 1).toJSON()).toEqual({type: 'ApplyCollision', bounce: 1});
        const behavior = new ApplyCollision(undefined, 0.5, {
            planes: [ground],
            dampen: 0.2,
            lifetimeLoss: 0.1,
            radiusScale: 0.01,
        });
        const json = behavior.toJSON();
        expect(json).toEqual({
            type: 'ApplyCollision',
            bounce: 0.5,
            planes: [{position: [0, 0, 0], normal: [0, 2, 0]}],
            dampen: 0.2,
            lifetimeLoss: 0.1,
            radiusScale: 0.01,
        });
        expect((ApplyCollision.fromJSON(json) as ApplyCollision).toJSON()).toEqual(json);
        expect((behavior.clone() as ApplyCollision).toJSON()).toEqual(json);
    });
});
