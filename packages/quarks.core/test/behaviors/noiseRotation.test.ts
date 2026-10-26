import {
    ConstantValue,
    createSeededRandom,
    Noise,
    ParticleStore,
    Quaternion,
    SpriteParticle,
    TrailParticle,
    withRandomSource,
} from '../../src';

/** The angle, in radians, of the turn that takes the identity to `q`. */
const angleOf = (q: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(q.w)));

/** Largest turn a mesh particle receives over a second of noise at `rotationAmount`. */
function largestTurn(rotationAmount: number, bulk: boolean): number {
    const store = new ParticleStore(1);
    const particle = new SpriteParticle(store, 0);
    particle.life = 10;
    particle.rotation = new Quaternion();
    const noise = new Noise(
        new ConstantValue(1),
        new ConstantValue(1),
        new ConstantValue(0),
        new ConstantValue(rotationAmount)
    );
    withRandomSource(createSeededRandom(11), () => noise.initialize(particle));
    let largest = 0;
    for (let i = 0; i < 60; i++) {
        particle.age = i / 60;
        noise.frameUpdate(1 / 60);
        if (bulk) {
            noise.updateAll([particle], 1, 1 / 60);
        } else {
            noise.update(particle, 1 / 60);
        }
        // The turn applied last step is removed before this one is added, so the
        // rotation is this step's noise turn alone.
        largest = Math.max(largest, angleOf(particle.rotation as Quaternion));
    }
    return largest;
}

describe.each([false, true])('Noise rotation on mesh particles (updateAll: %s)', (bulk) => {
    it('turns further for a larger rotationAmount, and never past π × amount', () => {
        const small = largestTurn(0.01, bulk);
        const half = largestTurn(0.5, bulk);
        const full = largestTurn(1, bulk);
        expect(small).toBeGreaterThan(0);
        expect(small).toBeLessThan(0.01 * Math.PI + 1e-6);
        expect(half).toBeGreaterThan(small);
        expect(half).toBeLessThan(0.5 * Math.PI + 1e-6);
        expect(full).toBeGreaterThan(half);
        expect(full).toBeLessThan(Math.PI + 1e-6);
    });

    it('turns a mesh particle by the same angle a billboard would', () => {
        // Same seed, so the same generators: the billboard angle after a step is
        // W noise × π × amount, which is what the mesh particle's turn must be.
        const makeNoise = () =>
            new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(0), new ConstantValue(0.4));
        const store = new ParticleStore(2);
        const sprite = new SpriteParticle(store, 0);
        sprite.life = 10;
        sprite.age = 0.5;
        sprite.rotation = 0;
        const mesh = new SpriteParticle(store, 1);
        mesh.life = 10;
        mesh.age = 0.5;
        mesh.rotation = new Quaternion();
        const spriteNoise = makeNoise();
        const meshNoise = makeNoise();
        withRandomSource(createSeededRandom(3), () => spriteNoise.initialize(sprite));
        withRandomSource(createSeededRandom(3), () => meshNoise.initialize(mesh));
        spriteNoise.frameUpdate(1 / 60);
        meshNoise.frameUpdate(1 / 60);
        if (bulk) {
            spriteNoise.updateAll([sprite], 1, 1 / 60);
            meshNoise.updateAll([mesh], 1, 1 / 60);
        } else {
            spriteNoise.update(sprite, 1 / 60);
            meshNoise.update(mesh, 1 / 60);
        }
        expect(angleOf(mesh.rotation as Quaternion)).toBeCloseTo(Math.abs(sprite.rotation as number), 5);
    });

    it('leaves a particle with no rotation, as a trail head, unturned, and still moves it', () => {
        const store = new ParticleStore(1);
        const trail = new TrailParticle(store, 0);
        trail.life = 10;
        const noise = new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(1), new ConstantValue(1));
        withRandomSource(createSeededRandom(5), () => noise.initialize(trail));
        for (let i = 1; i <= 10; i++) {
            trail.age = i / 60;
            noise.frameUpdate(1 / 60);
            if (bulk) {
                noise.updateAll([trail], 1, 1 / 60);
            } else {
                noise.update(trail, 1 / 60);
            }
        }
        expect(trail.position.length()).toBeGreaterThan(0);
        expect(Number.isFinite(trail.position.x)).toBe(true);
    });
});
