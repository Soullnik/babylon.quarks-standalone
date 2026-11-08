import {
    Behavior,
    ConstantValue,
    IParticleSystem,
    Matrix4,
    OrbitOverLife,
    ParticleStore,
    planBehaviorFusion,
    SpriteParticle,
    Vector3,
    VelocityOverLife,
} from '../../src';

/**
 * The behaviors that move a position directly add the velocity of the move to the particle's
 * animatedVelocity, Unity's animated velocity, when its store keeps one; a stretched billboard is
 * drawn along the velocity plus it.
 */
const system = {worldSpace: false, emitter: {matrixWorld: new Matrix4()}} as unknown as IParticleSystem;
const DELTA = 1 / 30;
const COUNT = 6;

function pool(keep: boolean): SpriteParticle[] {
    const store = new ParticleStore(COUNT);
    if (keep) store.keepAnimatedVelocity();
    const particles: SpriteParticle[] = [];
    for (let i = 0; i < COUNT; i++) {
        const p = new SpriteParticle(store, i);
        p.life = 2;
        p.age = i * 0.1;
        p.position.set(1 + i * 0.3, -0.5 + i * 0.2, 0.25 * i);
        particles.push(p);
    }
    return particles;
}

/** One step as a system runs it: the behaviors' frame updates, then the fused or separate passes. */
function step(behaviors: Behavior[], particles: SpriteParticle[], fused: boolean): void {
    for (const p of particles) for (const b of behaviors) b.initialize(p, system);
    if (!fused) {
        for (const b of behaviors) {
            b.frameUpdate(DELTA);
            if (b.updateAll !== undefined) b.updateAll(particles, particles.length, DELTA);
            else for (const p of particles) b.update(p, DELTA);
        }
        return;
    }
    for (const s of planBehaviorFusion(behaviors)) {
        for (const b of s.behaviors) b.frameUpdate(DELTA);
        if (s.run !== undefined) s.run(behaviors, particles, particles.length, DELTA);
        else if (s.behaviors[0].updateAll !== undefined) s.behaviors[0].updateAll!(particles, particles.length, DELTA);
        else for (const p of particles) s.behaviors[0].update(p, DELTA);
    }
}

const velocityOverLife = (): Behavior =>
    new VelocityOverLife(
        new ConstantValue(0),
        new ConstantValue(2),
        new ConstantValue(0.5),
        new ConstantValue(0.6),
        new ConstantValue(0),
        new ConstantValue(0),
        'local',
        new ConstantValue(0.4)
    );

describe('animatedVelocity', () => {
    it('is kept only when the store keeps it', () => {
        expect(pool(false)[0].animatedVelocity).toBeUndefined();
        const kept = pool(true);
        expect(kept[0].animatedVelocity).toBeDefined();
        expect(kept[0].store.previousAnimatedVelocity.length).toBe(COUNT * 3);
        // A particle made before the store kept it gets its view on rebind.
        const late = pool(false);
        late[0].store.keepAnimatedVelocity();
        late[0].rebind();
        expect(late[0].animatedVelocity).toBeDefined();
    });

    it.each([
        ['separate', false],
        ['fused', true],
    ])('VelocityOverLife adds the velocity of its move, linear, radial and orbital (%s)', (_name, fused) => {
        const particles = pool(true);
        const start = particles.map((p) => p.position.clone());
        step([velocityOverLife()], particles, fused);
        for (let i = 0; i < COUNT; i++) {
            const p = particles[i];
            const moved = p.position
                .clone()
                .sub(start[i])
                .multiplyScalar(1 / DELTA);
            expect(p.animatedVelocity!.distanceTo(moved)).toBeLessThan(1e-3);
            // Mostly the linear (0, 2, 0.5), bent by the radial and orbital parts.
            expect(p.animatedVelocity!.y).toBeGreaterThan(1);
            // The velocity itself is left alone: the module moves the position, not the velocity.
            expect(p.velocity.length()).toBe(0);
        }
    });

    it('is the same on the fused and the separate path, and moves nothing when not kept', () => {
        const separate = pool(true);
        const fused = pool(true);
        step([velocityOverLife()], separate, false);
        step([velocityOverLife()], fused, true);
        for (let i = 0; i < COUNT; i++) {
            expect(fused[i].animatedVelocity!.distanceTo(separate[i].animatedVelocity!)).toBeLessThan(1e-4);
        }
        // Keeping it changes where nothing goes.
        const plain = pool(false);
        step([velocityOverLife()], plain, true);
        for (let i = 0; i < COUNT; i++) {
            expect(plain[i].position.distanceTo(fused[i].position)).toBeLessThan(1e-6);
        }
    });

    it.each([
        ['update', false],
        ['updateAll', true],
    ])('OrbitOverLife adds the velocity of its turn (%s)', (_name, all) => {
        const particles = pool(true);
        const orbit = new OrbitOverLife(new ConstantValue(3), new Vector3(0, 1, 0));
        const start = particles.map((p) => p.position.clone());
        for (const p of particles) orbit.initialize(p, system);
        orbit.frameUpdate(DELTA);
        if (all) orbit.updateAll(particles, particles.length, DELTA);
        else for (const p of particles) orbit.update(p, DELTA);
        for (let i = 0; i < COUNT; i++) {
            const p = particles[i];
            const radius = Math.hypot(start[i].x, start[i].z);
            // Square to the axis, about the radius times the turn rate.
            expect(p.animatedVelocity!.y).toBeCloseTo(0, 6);
            expect(p.animatedVelocity!.length()).toBeCloseTo(radius * 3, 2);
        }
    });
});
