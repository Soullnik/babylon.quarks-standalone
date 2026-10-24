import {
    ApplyForce,
    Behavior,
    BehaviorJSON,
    ColorOverLife,
    ConstantValue,
    Gradient,
    IParticleSystem,
    Particle,
    ParticleStore,
    planBehaviorFusion,
    runsUpdateAll,
    SpriteParticle,
    stockBehaviorType,
} from '../../src';

/** A custom behavior that happens to use a built-in's type string. */
class Impostor implements Behavior {
    type = 'ColorOverLife';
    updates = 0;
    initialize(particle: Particle, system: IParticleSystem): void {}
    update(particle: Particle, delta: number): void {
        this.updates++;
        particle.color.set(0, 1, 0, 1);
    }
    frameUpdate(delta: number): void {}
    toJSON(): BehaviorJSON {
        return {type: this.type};
    }
    clone(): Behavior {
        return new Impostor();
    }
    reset(): void {}
}

/** A subclass of a built-in with its own update. */
class Tinted extends ColorOverLife {
    update(particle: Particle, delta: number): void {
        super.update(particle, delta);
        particle.color.x = 0;
    }
}

/** A subclass of a built-in that keeps its update: it only adds a field. */
class Named extends ColorOverLife {
    label = 'named';
}

const gradient = () =>
    new Gradient(
        [
            [{r: 1, g: 0, b: 0}, 0],
            [{r: 1, g: 0, b: 0}, 1],
        ],
        [
            [1, 0],
            [1, 1],
        ]
    );

function pool(count: number): SpriteParticle[] {
    const store = new ParticleStore(count);
    const particles: SpriteParticle[] = [];
    for (let i = 0; i < count; i++) {
        const particle = new SpriteParticle(store, i);
        particle.life = 2;
        particle.age = 1;
        particle.startColor.set(1, 1, 1, 1);
        particle.color.set(1, 1, 1, 1);
        particles.push(particle);
    }
    return particles;
}

/** Runs `behaviors` one step as a renderer does with the plan. */
function step(behaviors: Behavior[], particles: SpriteParticle[]): void {
    for (const s of planBehaviorFusion(behaviors)) {
        if (s.run) {
            s.run(behaviors, particles, particles.length, 0.1);
        } else {
            for (const p of particles) s.behaviors[0].update(p, 0.1);
        }
    }
}

describe('stockBehaviorType', () => {
    it('names a built-in that runs its own update', () => {
        expect(stockBehaviorType(new ColorOverLife(gradient()))).toBe('ColorOverLife');
        expect(stockBehaviorType(new ApplyForce({x: 0, y: 1, z: 0}, new ConstantValue(1)))).toBe('ApplyForce');
        expect(stockBehaviorType(new Named(gradient()))).toBe('ColorOverLife');
    });

    it('treats a borrowed type string, an overriding subclass and a replaced update as custom', () => {
        expect(stockBehaviorType(new Impostor())).toBeUndefined();
        expect(stockBehaviorType(new Tinted(gradient()))).toBeUndefined();
        const patched = new ColorOverLife(gradient());
        patched.update = () => {};
        expect(stockBehaviorType(patched)).toBeUndefined();
        const unknown = new Impostor();
        unknown.type = 'toString';
        expect(stockBehaviorType(unknown)).toBeUndefined();
    });
});

describe('fusion by implementation', () => {
    it('runs a custom behavior with a built-in type string as its own code', () => {
        const impostor = new Impostor();
        const particles = pool(4);
        const steps = planBehaviorFusion([impostor]);
        expect(steps).toHaveLength(1);
        expect(steps[0].run).toBeUndefined();
        step([impostor], particles);
        expect(impostor.updates).toBe(4);
        expect([particles[0].color.x, particles[0].color.y]).toEqual([0, 1]);
    });

    it("runs a subclass's own update instead of the built-in's compiled code", () => {
        const particles = pool(3);
        const behaviors = [new Tinted(gradient())];
        expect(planBehaviorFusion(behaviors)[0].run).toBeUndefined();
        step(behaviors, particles);
        expect(particles.map((p) => p.color.x)).toEqual([0, 0, 0]);
    });

    it('still compiles a subclass that keeps the update', () => {
        const particles = pool(3);
        const behaviors = [new Named(gradient())];
        expect(planBehaviorFusion(behaviors)[0].run).toBeDefined();
        step(behaviors, particles);
        expect(particles.map((p) => [p.color.x, p.color.y])).toEqual([
            [1, 0],
            [1, 0],
            [1, 0],
        ]);
    });

    it('keeps the order around a custom behavior between built-ins', () => {
        const a = new ColorOverLife(gradient());
        const b = new Impostor();
        const c = new ApplyForce({x: 0, y: 1, z: 0}, new ConstantValue(1));
        const steps = planBehaviorFusion([a, b, c]);
        expect(steps.map((s) => [s.behaviors.length, s.run !== undefined])).toEqual([
            [1, true],
            [1, false],
            [1, true],
        ]);
    });

    it('does not share a compiled pass between a built-in and an impostor of its type', () => {
        // The pass cache is keyed by the run's shape: an impostor never gets the built-in's code.
        expect(planBehaviorFusion([new ColorOverLife(gradient())])[0].run).toBeDefined();
        expect(planBehaviorFusion([new Impostor()])[0].run).toBeUndefined();
    });
});

describe('runsUpdateAll', () => {
    /** Overrides both: its own updateAll is the one to run. */
    class Both extends ColorOverLife {
        update(particle: Particle, delta: number): void {}
        updateAll(particles: Array<Particle>, count: number, delta: number): void {}
    }

    it('calls updateAll only when it is defined no higher than update', () => {
        expect(runsUpdateAll(new ColorOverLife(gradient()))).toBe(true);
        expect(runsUpdateAll(new Named(gradient()))).toBe(true);
        expect(runsUpdateAll(new Both(gradient()))).toBe(true);
        // Overrides update only: the inherited updateAll would skip the override.
        expect(runsUpdateAll(new Tinted(gradient()))).toBe(false);
        expect(runsUpdateAll(new Impostor())).toBe(false);
        const patched = new ColorOverLife(gradient());
        patched.update = () => {};
        expect(runsUpdateAll(patched)).toBe(false);
    });
});
