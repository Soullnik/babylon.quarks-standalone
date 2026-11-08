import {
    Bezier,
    ColorOverLife,
    FrameOverLife,
    Gradient,
    ParticleStore,
    PiecewiseBezier,
    planBehaviorFusion,
    SizeOverLife,
    SpriteParticle,
    stepEndAge,
    stepEndLife,
} from '../../src';

function particle(store: ParticleStore, row: number, age: number, life: number): SpriteParticle {
    const p = new SpriteParticle(store, row);
    p.age = age;
    p.life = life;
    p.startSize.set(1, 1, 1);
    p.startColor.set(1, 1, 1, 1);
    return p;
}

describe('stepEndAge', () => {
    it('is the age at the end of the step, at most the life', () => {
        const store = new ParticleStore(1);
        const p = particle(store, 0, 0.5, 2);
        expect(stepEndAge(p, 0.25)).toBeCloseTo(0.75);
        expect(stepEndLife(p, 0.25)).toBeCloseTo(0.375);
        expect(stepEndAge(p, 4)).toBe(2);
        expect(stepEndLife(p, 4)).toBe(1);
    });
});

describe('over-life curves read at the end of the step', () => {
    // A linear flipbook of 60 frames, a linear shrink and a linear fade over a 1 s life.
    const behaviors = () => [
        new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 20, 40, 60), 0]])),
        new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 2 / 3, 1 / 3, 0), 0]])),
        new ColorOverLife(
            new Gradient(undefined, [
                [1, 0],
                [0, 1],
            ])
        ),
    ];

    it('in the behaviors own passes and the fused pass alike', () => {
        const own = behaviors();
        const fused = behaviors();
        const ownStore = new ParticleStore(1);
        const fusedStore = new ParticleStore(1);
        const a = particle(ownStore, 0, 0.25, 1);
        const b = particle(fusedStore, 0, 0.25, 1);
        for (const behavior of own) behavior.initialize(a);
        for (const behavior of fused) behavior.initialize(b);
        b.memory = a.memory.slice();
        for (const behavior of own) behavior.update(a, 0.25);
        const steps = planBehaviorFusion(fused);
        for (const step of steps) {
            expect(step.run).toBeDefined();
            step.run!(fused, [b], 1, 0.25, fusedStore);
        }
        for (const p of [a, b]) {
            // Read at age 0.5, the age the step ends at, not at 0.25 where it starts.
            expect(p.uvTile).toBeCloseTo(30, 4);
            expect(p.size.x).toBeCloseTo(0.5, 5);
            expect(p.color.w).toBeCloseTo(0.5, 5);
        }
    });

    it('reads the end of the curve on a step that runs past the life', () => {
        const store = new ParticleStore(1);
        const p = particle(store, 0, 0.9, 1);
        const [, size] = behaviors();
        size.initialize(p);
        size.update(p, 0.5);
        expect(p.size.x).toBeCloseTo(0, 5);
    });
});
