import {JSONToValue, ValueToJSON} from '../util/JSONUtil';
import {FunctionJSON} from './FunctionJSON';

/** A value object a {@link ContinuousLinearFunction} can interpolate: a vector or a colour. */
export interface ObjectValueType<T> {
    /**
     * Copies `value` into this object.
     * @returns This object.
     */
    copy(value: T): ObjectValueType<T>;
    /**
     * Moves this object toward `value` by `pos`.
     * @returns This object.
     */
    lerp(value: T, pos: number): ObjectValueType<T>;
    /** A copy. */
    clone(): ObjectValueType<T>;
}

/**
 * A piecewise linear function over [0, 1] through keys: the alpha or colour keys of a {@link
 * Gradient}. Before the first key it holds the first value, after the last the last.
 */
export class ContinuousLinearFunction<T extends ObjectValueType<T> | number> {
    /** The keys as `[value, position]`, sorted by position. */
    keys: Array<[T, number]>;
    /** Always `'function'`. */
    type: 'function';
    /** What the values are, for the JSON. */
    subType: 'Number' | 'Vector3' | 'Vector4' | 'Color';
    // default linear bezier
    /**
     * @param keys - The keys as `[value, position]`, sorted by position.
     * @param subType - What the values are.
     */
    constructor(keys: Array<[T, number]>, subType: 'Number' | 'Vector3' | 'Vector4' | 'Color') {
        this.subType = subType;
        this.type = 'function';
        this.keys = keys;
    }

    /**
     * The key whose span holds `t`: -1 before the first key, the last key from its position on
     * (so a `t` past 1 holds the final value, as the sampled table does).
     */
    findKey(t: number): number {
        const keys = this.keys;
        const last = keys.length - 1;
        if (last < 0 || t < keys[0][1]) {
            return -1;
        }
        if (t >= keys[last][1]) {
            return last;
        }
        // One- and two-key gradients are by far the most common case; resolve
        // them without running the search.
        if (last === 1) {
            return 0;
        }
        let left = 0,
            right = last;
        while (left + 1 < right) {
            const mid = (left + right) >> 1;
            if (t < keys[mid][1]) right = mid - 1;
            else if (t > this.getEndX(mid)) left = mid + 1;
            else return mid;
        }
        for (let i = left; i <= right; i++) {
            if (t >= keys[i][1] && t <= this.getEndX(i)) return i;
        }
        return -1;
    }

    /** The position of key `index`. */
    getStartX(index: number) {
        return this.keys[index][1];
    }

    /** The position of the key after `index`, or 1 for the last. */
    getEndX(index: number) {
        if (index + 1 < this.keys.length) return this.keys[index + 1][1];
        return 1;
    }

    /** The value at `t`: a number, or written into the object `value` and returned. */
    genValue(value: T, t: number): T {
        const keys = this.keys;
        const index = this.findKey(t);
        const last = keys.length - 1;
        if (this.subType === 'Number') {
            if (index === -1) {
                return keys[0][0];
            } else if (index >= last) {
                return keys[last][0];
            }
            const startX = keys[index][1];
            const a = keys[index][0] as number;
            // Neighbouring keys may sit at the same position; an empty span would
            // divide to NaN, so hold the first key's value instead.
            const span = keys[index + 1][1] - startX;
            return (((keys[index + 1][0] as number) - a) * (span > 0 ? (t - startX) / span : 0) + a) as T;
        } else {
            if (index === -1) {
                return (value as ObjectValueType<T>).copy(keys[0][0]) as T;
            }
            if (index >= last) {
                return (value as ObjectValueType<T>).copy(keys[last][0]) as T;
            }
            const startX = keys[index][1];
            const span = keys[index + 1][1] - startX;
            return (value as ObjectValueType<T>)
                .copy(keys[index][0])
                .lerp(keys[index + 1][0], span > 0 ? (t - startX) / span : 0) as T;
        }
    }

    /** The JSON form, `{type: 'CLinearFunction', subType, keys: [{value, pos}]}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'CLinearFunction',
            subType: this.subType,
            keys: this.keys.map(([color, pos]) => ({value: ValueToJSON(color, this.subType), pos: pos})),
        };
    }

    /** Reads {@link ContinuousLinearFunction.toJSON} output. */
    static fromJSON(json: FunctionJSON): ContinuousLinearFunction<any> {
        return new ContinuousLinearFunction(
            json.keys.map((pair: any) => [JSONToValue(pair.value, json.subType), pair.pos]),
            json.subType
        );
    }

    /** A copy with its own keys. */
    clone(): ContinuousLinearFunction<any> {
        if (this.subType === 'Number') {
            return new ContinuousLinearFunction(
                this.keys.map(([value, pos]) => [value, pos]),
                this.subType
            );
        } else {
            return new ContinuousLinearFunction(
                this.keys.map(([value, pos]) => [(value as ObjectValueType<T>).clone() as T, pos]),
                this.subType
            );
        }
    }
}
