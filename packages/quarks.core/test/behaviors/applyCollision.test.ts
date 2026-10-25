import {ApplyCollision, getPhysicsResolver, PhysicsResolver, setPhysicsResolver, SpriteParticle} from '../../src';

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

    it('reflects the velocity about the surface normal and keeps `bounce` of the speed', () => {
        const particle = falling(-0.1);
        new ApplyCollision(floor, 0.5).update(particle, 1 / 60);
        expect(particle.velocity.x).toBeCloseTo(0.5, 6);
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
});
