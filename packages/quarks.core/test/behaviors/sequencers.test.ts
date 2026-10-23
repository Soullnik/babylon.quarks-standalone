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
