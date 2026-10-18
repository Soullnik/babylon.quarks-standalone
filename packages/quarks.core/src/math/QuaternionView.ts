import {Quaternion} from './Quaternion';

/** See Vector3View: absorbs the base constructor's writes before binding. */
const UNBOUND = new Float32Array(4);

/**
 * A `Quaternion` whose components live in a shared `Float32Array` at a fixed
 * offset. Every `Quaternion` method reads and writes `_x` .. `_w`, so replacing
 * those four with accessors inherits the whole API; they are installed on the
 * prototype because TypeScript forbids overriding an inherited property with
 * an accessor in the class body (TS2611).
 */
export class QuaternionView extends Quaternion {
    declare data: Float32Array;
    declare offset: number;
    declare _x: number;
    declare _y: number;
    declare _z: number;
    declare _w: number;

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

const prototype = QuaternionView.prototype as unknown as {data: Float32Array; offset: number};
prototype.data = UNBOUND;
prototype.offset = 0;

Object.defineProperties(QuaternionView.prototype, {
    _x: {
        get(this: QuaternionView) {
            return this.data[this.offset];
        },
        set(this: QuaternionView, value: number) {
            this.data[this.offset] = value;
        },
    },
    _y: {
        get(this: QuaternionView) {
            return this.data[this.offset + 1];
        },
        set(this: QuaternionView, value: number) {
            this.data[this.offset + 1] = value;
        },
    },
    _z: {
        get(this: QuaternionView) {
            return this.data[this.offset + 2];
        },
        set(this: QuaternionView, value: number) {
            this.data[this.offset + 2] = value;
        },
    },
    _w: {
        get(this: QuaternionView) {
            return this.data[this.offset + 3];
        },
        set(this: QuaternionView, value: number) {
            this.data[this.offset + 3] = value;
        },
    },
});
