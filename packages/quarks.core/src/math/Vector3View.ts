import {Vector3} from './Vector3';

/**
 * Scratch storage the accessors fall back to while the base `Vector3`
 * constructor runs, before the instance owns a `data` binding. Living on the
 * prototype, it absorbs those writes without needing a guard on every
 * component write.
 */
const UNBOUND = new Float32Array(3);

/**
 * A `Vector3` whose components live in a shared `Float32Array` at a fixed
 * offset rather than in three own properties.
 *
 * Every `Vector3` method routes through `x` / `y` / `z`, so replacing those
 * with accessors inherits the whole API unchanged — including `clone()`, which
 * still returns a detached plain `Vector3`.
 *
 * The accessors are installed on the prototype below rather than written as
 * `get x()` in the class body, because TypeScript forbids overriding an
 * inherited property with an accessor (TS2611). Runtime behaviour is the same:
 * one shared property descriptor for every instance.
 */
export class Vector3View extends Vector3 {
    declare data: Float32Array;
    declare offset: number;
    declare x: number;
    declare y: number;
    declare z: number;

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

const prototype = Vector3View.prototype as unknown as {data: Float32Array; offset: number};
prototype.data = UNBOUND;
prototype.offset = 0;

Object.defineProperties(Vector3View.prototype, {
    x: {
        get(this: Vector3View) {
            return this.data[this.offset];
        },
        set(this: Vector3View, value: number) {
            this.data[this.offset] = value;
        },
    },
    y: {
        get(this: Vector3View) {
            return this.data[this.offset + 1];
        },
        set(this: Vector3View, value: number) {
            this.data[this.offset + 1] = value;
        },
    },
    z: {
        get(this: Vector3View) {
            return this.data[this.offset + 2];
        },
        set(this: Vector3View, value: number) {
            this.data[this.offset + 2] = value;
        },
    },
});
