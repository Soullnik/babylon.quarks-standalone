import {BehaviorFromJSON, BehaviorToJSON, ConstantValue, RotationOverLife} from '../../src';
import {jsonEqual, warnFormat, withoutDefaults} from '../../src/util/JSONUtil';

describe('jsonEqual', () => {
    it.each([
        [{a: 1, b: [1, 2]}, {b: [1, 2], a: 1}, true],
        [{a: 1, b: undefined}, {a: 1}, true],
        [NaN, NaN, true],
        [[], {}, false],
        [[1, 2], [1, 2, 3], false],
        [{a: {b: 1}}, {a: {b: 2}}, false],
        [null, {}, false],
        [0, '0', false],
    ])('%j and %j: %s', (a, b, equal) => {
        expect(jsonEqual(a, b)).toBe(equal);
    });
});

describe('withoutDefaults', () => {
    const defaults = {type: 'T', a: 1, b: 2};
    /** A reader that fills missing fields from `defaults`. */
    const fill = (json: Record<string, unknown>) => ({...defaults, ...json});

    it('leaves out the fields at their defaults and keeps the type', () => {
        expect(withoutDefaults({type: 'T', a: 1, b: 3}, fill)).toEqual({type: 'T', b: 3});
        expect(withoutDefaults({type: 'T', a: 1, b: 2}, fill)).toEqual({type: 'T'});
    });

    it('keeps every field when the smaller JSON reads back differently', () => {
        const full = {type: 'T', a: 1, b: 3};
        expect(withoutDefaults(full, (json) => ({...json, a: 'a' in json ? json.a : 0}))).toBe(full);
    });

    it('keeps every field when reading the smaller JSON warns', () => {
        const full = {type: 'T', a: 1, b: 3};
        const read = (json: Record<string, unknown>) => {
            if (!('a' in json)) warnFormat('Missing a');
            return fill(json);
        };
        // Reading the type alone warns too; its fallbacks still say which fields are default.
        expect(withoutDefaults(full, read)).toBe(full);
    });

    it('keeps every field when the reader throws', () => {
        const full = {type: 'T', a: 1};
        expect(
            withoutDefaults(full, () => {
                throw new Error('no');
            })
        ).toBe(full);
    });

    it('passes a JSON without a type through', () => {
        const json = {a: 1} as {a: number; type?: string};
        expect(withoutDefaults(json, fill)).toBe(json);
    });

    it('keeps a behavior whole when a curve it needs equals the fallback a missing one reads as', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        // A missing angularVelocity reads as ConstantValue(0) with a warning.
        const behavior = new RotationOverLife(new ConstantValue(0));
        expect(BehaviorToJSON(behavior, {} as never)).toEqual(behavior.toJSON());
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
        expect(BehaviorFromJSON(BehaviorToJSON(behavior, {} as never), {} as never)).toBeInstanceOf(RotationOverLife);
    });
});
