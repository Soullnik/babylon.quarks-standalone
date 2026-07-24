import {FunctionJSON} from './FunctionJSON';
import {JSONToValue, ValueToJSON} from '../util/JSONUtil';

interface ObjectValueType<T> {
    copy(value: T): ObjectValueType<T>;
    lerp(value: T, pos: number): ObjectValueType<T>;
    clone(): ObjectValueType<T>;
}

export class ContinuousLinearFunction<T extends ObjectValueType<T> | number> {
    keys: Array<[T, number]>;
    type: 'function';
    subType: 'Number' | 'Vector3' | 'Vector4' | 'Color';
    // default linear bezier
    constructor(keys: Array<[T, number]>, subType: 'Number' | 'Vector3' | 'Vector4' | 'Color') {
        this.subType = subType;
        this.type = 'function';
        this.keys = keys;
    }

    findKey(t: number): number {
        const keys = this.keys;
        const last = keys.length - 1;
        // One- and two-key gradients are by far the most common case; resolve
        // them without running the search.
        if (last <= 0) {
            return last === 0 && t >= keys[0][1] && t <= 1 ? 0 : -1;
        }
        if (last === 1) {
            if (t < keys[0][1] || t > 1) return -1;
            return t <= keys[1][1] ? 0 : 1;
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

    getStartX(index: number) {
        return this.keys[index][1];
    }

    getEndX(index: number) {
        if (index + 1 < this.keys.length) return this.keys[index + 1][1];
        return 1;
    }

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
            return ((((keys[index + 1][0] as number) - a) * (t - startX)) / (keys[index + 1][1] - startX) + a) as T;
        } else {
            if (index === -1) {
                return (value as ObjectValueType<T>).copy(keys[0][0]) as T;
            }
            if (index >= last) {
                return (value as ObjectValueType<T>).copy(keys[last][0]) as T;
            }
            const startX = keys[index][1];
            return (value as ObjectValueType<T>)
                .copy(keys[index][0])
                .lerp(keys[index + 1][0], (t - startX) / (keys[index + 1][1] - startX)) as T;
        }
    }

    toJSON(): FunctionJSON {
        const subType = this.keys[0][0].constructor.name;
        return {
            type: 'CLinearFunction',
            subType: this.subType,
            keys: this.keys.map(([color, pos]) => ({value: ValueToJSON(color, this.subType), pos: pos})),
        };
    }

    static fromJSON(json: FunctionJSON): ContinuousLinearFunction<any> {
        return new ContinuousLinearFunction(
            json.keys.map((pair: any) => [JSONToValue(pair.value, json.subType), pair.pos]),
            json.subType
        );
    }

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
