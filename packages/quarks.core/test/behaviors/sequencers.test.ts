/** Sequencers that have nothing to say: an empty one leaves the particle, an unknown one is skipped. */
import {ApplySequences, BehaviorFromJSON, IntervalValue, SpriteParticle, TextureSequencer, Vector3} from '../../src';

let warn: jest.SpyInstance;
beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    warn.mockRestore();
});

describe('TextureSequencer', () => {
    test('with no locations leaves the position as it is', () => {
        const position = new Vector3(1, 2, 3);
        new TextureSequencer(2, 2).transform(position, 5);
        expect([position.x, position.y, position.z]).toEqual([1, 2, 3]);
    });

    test('a system with an empty sequencer runs its particles without throwing', () => {
        const behavior = new ApplySequences(0);
        behavior.appendSequencer(new IntervalValue(0, 1), new TextureSequencer());
        const p = new SpriteParticle();
        p.life = 2;
        behavior.initialize(p);
        behavior.frameUpdate(0.5);
        expect(() => behavior.update(p, 0.5)).not.toThrow();
    });
});

describe('ApplySequences.fromJSON', () => {
    test('skips a sequencer of an unknown type with a warning and keeps the rest', () => {
        // An unknown sequencer type and a missing sequencer, as a hand-edited file may hold them.
        const json = JSON.parse(
            JSON.stringify({
                type: 'ApplySequences',
                delay: 0.1,
                sequencers: [
                    {range: {type: 'IntervalValue', a: 0, b: 1}, sequencer: {type: 'Bogus'}},
                    {
                        range: {type: 'IntervalValue', a: 1, b: 2},
                        sequencer: {
                            type: 'TextureSequencer',
                            scaleX: 1,
                            scaleY: 1,
                            position: [0, 0, 0],
                            locations: [{x: 1, y: 2}],
                        },
                    },
                    {range: {type: 'IntervalValue', a: 2, b: 3}},
                ],
            })
        );
        const behavior = BehaviorFromJSON(json, {} as never) as ApplySequences;
        expect(behavior.sequencers).toHaveLength(1);
        expect(behavior.sequencers[0][1]).toBeInstanceOf(TextureSequencer);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Bogus"'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Missing sequencer'));
    });
});

describe('ApplySequences moves', () => {
    /** A sequencer that sends every particle to one point. */
    const to = (x: number): TextureSequencer =>
        ({
            transform: (position: Vector3) => position.set(x, 0, 0),
            toJSON: () => ({}),
            clone: () => to(x),
        }) as unknown as TextureSequencer;

    function run(behavior: ApplySequences, particles: SpriteParticle[], until: number): void {
        const step = 0.05;
        for (let t = 0; t < until; t += step) {
            behavior.frameUpdate(step);
            particles.forEach((p) => behavior.update(p, step));
        }
    }

    test('ease in and out along the way, and end on the point', () => {
        const behavior = new ApplySequences(0);
        behavior.appendSequencer(new IntervalValue(0, 1), to(10));
        const p = new SpriteParticle();
        behavior.initialize(p);
        run(behavior, [p], 0.25);
        // Smoothstep at a quarter of the way is 0.15625, behind a straight ramp's 0.25.
        expect(p.position.x).toBeLessThan(2.5);
        run(behavior, [p], 1);
        expect(p.position.x).toBeCloseTo(10);
    });

    test('a particle delayed past the next sequence moves to that sequence’s point', () => {
        const behavior = new ApplySequences(0.8);
        behavior.appendSequencer(new IntervalValue(0, 1), to(10));
        behavior.appendSequencer(new IntervalValue(1, 2), to(-10));
        const first = new SpriteParticle();
        const late = new SpriteParticle();
        behavior.initialize(first);
        behavior.initialize(late);
        run(behavior, [first, late], 3.2);
        expect(first.position.x).toBeCloseTo(-10);
        expect(late.position.x).toBeCloseTo(-10);
    });

    test('reset starts the sequences and the emission order over', () => {
        const behavior = new ApplySequences(0);
        behavior.appendSequencer(new IntervalValue(0, 1), to(10));
        behavior.initialize(new SpriteParticle());
        behavior.frameUpdate(0.5);
        behavior.reset();
        expect([behavior.time, behavior.index, behavior.pCount]).toEqual([0, 0, 0]);
    });
});
