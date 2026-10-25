import {Vector3, Vector4} from '../math';
import {JSONToNumber, JSONToVector3, JSONToVector4, ValueToJSON} from '../util/JSONUtil';
import type {ContinuousLinearFunctionJSON} from './FunctionJSON';

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

/** The {@link ContinuousLinearSubType} values of type `T` are written as. */
export type ContinuousLinearSubTypeOf<T> = T extends number
    ? 'Number'
    : T extends Vector4
      ? 'Vector4'
      : 'Vector3' | 'Color';

/**
 * A piecewise linear function over [0, 1] through keys: the alpha or colour keys of a {@link
 * Gradient}. Before the first key it holds the first value, after the last the last.
 *
 * Build number keys directly. Vector and colour keys hold quarks' internal math: build a
 * gradient's colour keys through the {@link Gradient} constructor, which takes `Color3Like`, and
 * read or edit existing keys in place.
 */
export class ContinuousLinearFunction<T extends number | Vector3 | Vector4> {
    /** The keys as `[value, position]`, sorted by position. */
    keys: Array<[T, number]>;
    /** Always `'function'`. */
    type: 'function';
    /** What the values are, for the JSON. */
    subType: ContinuousLinearSubTypeOf<T>;
    // default linear bezier
    /**
     * @param keys - The keys as `[value, position]`, sorted by position.
     * @param subType - What the values are.
     */
    constructor(keys: Array<[T, number]>, subType: ContinuousLinearSubTypeOf<T>) {
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
    toJSON(): ContinuousLinearFunctionJSON<ContinuousLinearSubTypeOf<T>> {
        return {
            type: 'CLinearFunction',
            subType: this.subType,
            keys: this.keys.map(([color, pos]) => ({value: ValueToJSON(color, this.subType), pos: pos})),
        };
    }

    /** Reads {@link ContinuousLinearFunction.toJSON} output; its `subType` decides the values' type. */
    static fromJSON(json: ContinuousLinearFunctionJSON<'Number'>): ContinuousLinearFunction<number>;
    static fromJSON(json: ContinuousLinearFunctionJSON<'Vector3' | 'Color'>): ContinuousLinearFunction<Vector3>;
    static fromJSON(json: ContinuousLinearFunctionJSON<'Vector4'>): ContinuousLinearFunction<Vector4>;
    static fromJSON(
        json: ContinuousLinearFunctionJSON
    ): ContinuousLinearFunction<number> | ContinuousLinearFunction<Vector3> | ContinuousLinearFunction<Vector4>;
    static fromJSON(
        json: ContinuousLinearFunctionJSON
    ): ContinuousLinearFunction<number> | ContinuousLinearFunction<Vector3> | ContinuousLinearFunction<Vector4> {
        switch (json.subType) {
            case 'Number':
                return new ContinuousLinearFunction<number>(
                    json.keys.map((key) => [JSONToNumber(key.value), key.pos]),
                    json.subType
                );
            case 'Vector4':
                return new ContinuousLinearFunction<Vector4>(
                    json.keys.map((key) => [JSONToVector4(key.value), key.pos]),
                    json.subType
                );
            default:
                return new ContinuousLinearFunction<Vector3>(
                    json.keys.map((key) => [JSONToVector3(key.value), key.pos]),
                    json.subType
                );
        }
    }

    /** A copy with its own keys. */
    clone(): ContinuousLinearFunction<T> {
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
