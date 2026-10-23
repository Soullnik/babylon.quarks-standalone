import {ParticleStore, SpriteParticle, TurbulenceField, Vector3} from '../../src';

const field = (seed?: number) =>
    new TurbulenceField(new Vector3(2, 2, 2), 2, new Vector3(1, 1, 1), new Vector3(0.5, 0.5, 0.5), seed);

function push(behavior: TurbulenceField, position: Vector3, bulk = false): Vector3 {
    const store = new ParticleStore(1);
    const particle = new SpriteParticle(store, 0);
    particle.life = 2;
    particle.age = 1;
    particle.position.copy(position);
    behavior.frameUpdate(1 / 60);
    if (bulk) {
        behavior.updateAll([particle], 1, 1);
    } else {
        behavior.update(particle, 1);
    }
    return particle.velocity.clone();
}

describe('TurbulenceField', () => {
    const at = new Vector3(0.7, -1.3, 2.1);

    it('gives the same field for the same settings on every run', () => {
        const a = push(field(), at);
        const b = push(field(), at);
        expect(b).toEqual(a);
        expect(a.lengthSq()).toBeGreaterThan(0);
    });

    it('gives a different field for a different seed', () => {
        expect(push(field(1), at)).not.toEqual(push(field(2), at));
    });

    it('clones to an identical field', () => {
        const original = field(5);
        expect(push(original.clone() as TurbulenceField, at)).toEqual(push(original, at));
    });

    it('survives toJSON and fromJSON with the same field, and writes the seed only when set', () => {
        const original = field(5);
        expect(original.toJSON().seed).toBe(5);
        expect(field().toJSON()).not.toHaveProperty('seed');
        const loaded = TurbulenceField.fromJSON(JSON.parse(JSON.stringify(original.toJSON()))) as TurbulenceField;
        expect(push(loaded, at)).toEqual(push(original, at));
    });

    it('pushes the same way through update and updateAll', () => {
        const a = push(field(3), at);
        const b = push(field(3), at, true);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.y).toBeCloseTo(a.y, 6);
        expect(b.z).toBeCloseTo(a.z, 6);
    });

    it('rewinds its drift on reset, so a restart replays the same swirl', () => {
        const behavior = field();
        const start = behavior.timeOffset.clone();
        for (let i = 0; i < 10; i++) {
            behavior.frameUpdate(0.1);
        }
        expect(behavior.timeOffset).not.toEqual(start);
        behavior.reset();
        expect(behavior.timeOffset).toEqual(start);
    });

    it('samples a zero scale at 0 along that axis instead of producing NaN', () => {
        const flat = () => new TurbulenceField(new Vector3(0, 1, 1), 1, new Vector3(1, 1, 1), new Vector3(1, 1, 1));
        for (const bulk of [false, true]) {
            const velocity = push(flat(), new Vector3(5, 0.5, 0.5), bulk);
            expect(Number.isFinite(velocity.x)).toBe(true);
            expect(Number.isFinite(velocity.y)).toBe(true);
            expect(Number.isFinite(velocity.z)).toBe(true);
            // No variation along X: the push is the same wherever the particle is on X.
            expect(push(flat(), new Vector3(-5, 0.5, 0.5), bulk)).toEqual(velocity);
        }
    });
});
