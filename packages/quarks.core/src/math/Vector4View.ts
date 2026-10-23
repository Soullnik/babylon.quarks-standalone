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
    /** The array the components live in. */
    declare data: Float32Array;
    /** The index of the first component in {@link Vector4View.data}. */
    declare offset: number;
    /** The x component, read from and written to {@link Vector4View.data}. */
    declare x: number;
    /** The y component, read from and written to {@link Vector4View.data}. */
    declare y: number;
    /** The z component, read from and written to {@link Vector4View.data}. */
    declare z: number;
    /** The w component, read from and written to {@link Vector4View.data}. */
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
