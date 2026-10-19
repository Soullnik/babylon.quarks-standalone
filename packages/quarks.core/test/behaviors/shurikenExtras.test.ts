import {
    ApplySequences,
    Bezier,
    ConstantValue,
    createSeededRandom,
    EmissionState,
    EmitSubParticleSystem,
    IParticleSystem,
    Matrix4,
    Noise,
    PiecewiseBezier,
    setRandomSource,
    SpriteParticle,
    subEmitterInheritMask,
    SubParticleEmitMode,
    Vector3,
    VelocityOverLife,
} from '../../src';

const emissionState = (): EmissionState => ({
    isBursting: false,
    burstParticleIndex: 0,
    burstParticleCount: 0,
    burstIndex: 0,
    burstWaveIndex: 0,
    time: 0,
    waitEmiting: 0,
    travelDistance: 0,
});

/** A local-space system whose emitter sits at the origin, enough for behaviors that read it. */
function localSystem(): IParticleSystem {
    return {
        worldSpace: false,
        emitter: {matrixWorld: new Matrix4()},
        emissionState: emissionState(),
        duration: 1,
    } as unknown as IParticleSystem;
}

function particleAt(x: number, y: number, z: number): SpriteParticle {
    const p = new SpriteParticle();
    p.position.set(x, y, z);
    p.life = 1;
    p.age = 0;
    return p;
}

describe('VelocityOverLife radial and orbital offset', () => {
    it('moves particles away from the orbit centre at the radial speed', () => {
        const behavior = new VelocityOverLife();
        behavior.radial = new ConstantValue(2);
        behavior.orbitalOffset.set(1, 0, 0);
        const p = particleAt(3, 0, 0);
        behavior.initialize(p, localSystem());
        behavior.frameUpdate(0.5);
        behavior.update(p, 0.5);
        // Centre at x = 1, the particle 2 away along +x, moved 2 * 0.5.
        expect(p.position.x).toBeCloseTo(4, 6);
        expect(p.position.y).toBeCloseTo(0, 6);
    });

    it('orbits around the offset centre, not the emitter', () => {
        const behavior = new VelocityOverLife();
        behavior.orbitalY = new ConstantValue(Math.PI);
        behavior.orbitalOffset.set(1, 0, 0);
        const p = particleAt(2, 0, 0);
        behavior.initialize(p, localSystem());
        behavior.frameUpdate(1);
        behavior.update(p, 1);
        // Half a turn about Y around (1, 0, 0) takes (2, 0, 0) to (0, 0, 0).
        expect(p.position.x).toBeCloseTo(0, 5);
        expect(p.position.z).toBeCloseTo(0, 5);
    });

    it('round-trips radial and the offset through JSON and clone', () => {
        const behavior = new VelocityOverLife();
        behavior.radial = new ConstantValue(1.5);
        behavior.orbitalOffset.set(1, 2, 3);
        const json = behavior.toJSON();
        expect(json.orbitalOffset).toEqual([1, 2, 3]);
        const loaded = VelocityOverLife.fromJSON(json) as VelocityOverLife;
        expect((loaded.radial as ConstantValue).value).toBe(1.5);
        expect(loaded.orbitalOffset.toArray()).toEqual([1, 2, 3]);
        const cloned = behavior.clone() as VelocityOverLife;
        expect(cloned.orbitalOffset).not.toBe(behavior.orbitalOffset);
        expect(cloned.orbitalOffset.toArray()).toEqual([1, 2, 3]);
        // Older JSON without the fields loads with none.
        delete json.radial;
        delete json.orbitalOffset;
        const old = VelocityOverLife.fromJSON(json) as VelocityOverLife;
        expect((old.radial as ConstantValue).value).toBe(0);
        expect(old.orbitalOffset.toArray()).toEqual([0, 0, 0]);
    });
});

describe('Noise scroll speed and remap', () => {
    afterEach(() => {
        setRandomSource(null);
    });

    /** Where a still particle ends up after `frames`; the same generators are picked every time. */
    function displacement(noise: Noise, frames: number): Vector3 {
        setRandomSource(createSeededRandom(7));
        const p = particleAt(0, 0, 0);
        noise.initialize(p);
        for (let i = 0; i < frames; i++) {
            noise.frameUpdate(1 / 60);
            noise.update(p, 1 / 60);
        }
        return p.position.clone();
    }

    it('moves the field with the scroll speed, and reset() brings it back', () => {
        const still = new Noise(new ConstantValue(1), new ConstantValue(1));
        const scrolled = new Noise(
            new ConstantValue(1),
            new ConstantValue(1),
            undefined,
            undefined,
            new ConstantValue(3)
        );
        const a = displacement(still, 10);
        const b = displacement(scrolled, 10);
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)).toBeGreaterThan(0.01);
        // The scroll has gone on; the same frames again land elsewhere until a reset.
        const bAgain = displacement(scrolled, 10);
        expect(bAgain.x).not.toBeCloseTo(b.x, 4);
        scrolled.reset();
        expect(displacement(scrolled, 10).x).toBeCloseTo(b.x, 6);
        // Without scrolling the field stands still from run to run.
        expect(displacement(still, 10).x).toBeCloseTo(a.x, 6);
    });

    it('passes the raw noise through the remap curve', () => {
        // A flat remap: whatever the noise, the displacement is the constant times the amount.
        const flat = new PiecewiseBezier([[new Bezier(0.25, 0.25, 0.25, 0.25), 0]]);
        const noise = new Noise(
            new ConstantValue(1),
            new ConstantValue(2),
            undefined,
            undefined,
            new ConstantValue(0),
            flat
        );
        const d = displacement(noise, 1);
        expect(d.x).toBeCloseTo(0.5, 5);
        expect(d.y).toBeCloseTo(0.5, 5);
        expect(d.z).toBeCloseTo(0.5, 5);
    });

    it('round-trips scroll speed and remap through JSON and clone', () => {
        const remap = new PiecewiseBezier([[new Bezier(-1, -1 / 3, 1 / 3, 1), 0]]);
        const noise = new Noise(
            new ConstantValue(1),
            new ConstantValue(1),
            undefined,
            undefined,
            new ConstantValue(2),
            remap
        );
        const json = noise.toJSON();
        expect(json.remap).toBeDefined();
        const loaded = Noise.fromJSON(json) as Noise;
        expect((loaded.scrollSpeed as ConstantValue).value).toBe(2);
        expect(loaded.remap).toBeInstanceOf(PiecewiseBezier);
        const cloned = noise.clone() as Noise;
        expect(cloned.remap).toBeInstanceOf(PiecewiseBezier);
        expect(cloned.remap).not.toBe(remap);
        const plain = Noise.fromJSON(new Noise(new ConstantValue(1), new ConstantValue(1)).toJSON()) as Noise;
        expect(plain.remap).toBeUndefined();
        expect((plain.scrollSpeed as ConstantValue).value).toBe(0);
    });
});

describe('ApplySequences without sequences', () => {
    it('leaves particles alone until a sequence is appended', () => {
        const behavior = new ApplySequences(0.01);
        const p = particleAt(1, 2, 3);
        behavior.initialize(p);
        behavior.frameUpdate(1 / 60);
        expect(() => behavior.update(p, 1 / 60)).not.toThrow();
        expect(p.position.toArray()).toEqual([1, 2, 3]);
    });
});

describe('EmitSubParticleSystem inherit', () => {
    it('hands the inherited properties to the sub emission as a mask', () => {
        expect(subEmitterInheritMask(['color', 'lifetime'])).toBe(1 | 8);
        const emitted: EmissionState[] = [];
        const target = {
            system: {
                duration: 1,
                emit: (_delta: number, state: EmissionState) => emitted.push({...state}),
            },
        };
        const parent = localSystem();
        const behavior = new EmitSubParticleSystem(parent, false, target as never, SubParticleEmitMode.Birth, 1, [
            'size',
            'rotation',
        ]);
        const p = particleAt(0, 0, 0);
        behavior.update(p, 1 / 60);
        behavior.frameUpdate(1 / 60);
        expect(emitted).toHaveLength(1);
        expect(emitted[0].inherit).toBe(2 | 4);
        expect(emitted[0].particle).toBe(p);
    });

    it('serialises inherit only when set and drops unknown names', () => {
        const parent = localSystem();
        const none = new EmitSubParticleSystem(parent, false, undefined, SubParticleEmitMode.Death, 1);
        expect(none.toJSON().inherit).toBeUndefined();
        const some = new EmitSubParticleSystem(parent, false, undefined, SubParticleEmitMode.Death, 1, ['color']);
        const json = some.toJSON();
        expect(json.inherit).toEqual(['color']);
        json.inherit = ['color', 'mass'];
        const loaded = EmitSubParticleSystem.fromJSON(json, parent) as EmitSubParticleSystem;
        expect(loaded.inherit).toEqual(['color']);
        expect((some.clone() as EmitSubParticleSystem).inherit).toEqual(['color']);
    });
});
