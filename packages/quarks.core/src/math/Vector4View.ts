import {Vector4} from './Vector4';

/** See Vector3View: absorbs the base constructor's writes before binding. */
const UNBOUND = new Float32Array(4);

/**
 * A `Vector4` backed by a shared `Float32Array` at a fixed offset. Replacing
 * the four component accessors inherits every `Vector4` method as-is; they are
 * installed on the prototype because TypeScript forbids overriding an
 * inherited property with an accessor in the class body (TS2611).
 */
export class Vector4View extends Vector4 {
    declare data: Float32Array;
    declare offset: number;
    declare x: number;
    declare y: number;
    declare z: number;
    declare w: number;

    constructor(data: Float32Array, offset: number) {
        super();
        this.data = data;
        this.offset = offset;
    }

    /** Points the view at a new backing array and row offset. */
    bind(data: Float32Array, offset: number): void {
        this.data = data;
        this.offset = offset;
    }
}

const prototype = Vector4View.prototype as unknown as {data: Float32Array; offset: number};
prototype.data = UNBOUND;
prototype.offset = 0;

Object.defineProperties(Vector4View.prototype, {
    x: {
        get(this: Vector4View) {
            return this.data[this.offset];
        },
        set(this: Vector4View, value: number) {
            this.data[this.offset] = value;
        },
    },
    y: {
        get(this: Vector4View) {
            return this.data[this.offset + 1];
        },
        set(this: Vector4View, value: number) {
            this.data[this.offset + 1] = value;
        },
    },
    z: {
        get(this: Vector4View) {
            return this.data[this.offset + 2];
        },
        set(this: Vector4View, value: number) {
            this.data[this.offset + 2] = value;
        },
    },
    w: {
        get(this: Vector4View) {
            return this.data[this.offset + 3];
        },
        set(this: Vector4View, value: number) {
            this.data[this.offset + 3] = value;
        },
    },
});
