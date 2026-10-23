import {clamp} from './MathUtils';
import {Matrix4} from './Matrix4';
import {Quaternion} from './Quaternion';
import {Vector3} from './Vector3';

const _matrix = /*@__PURE__*/ new Matrix4();
const _quaternion = /*@__PURE__*/ new Quaternion();

/**
 * The axis order an {@link Euler} applies its rotations in (intrinsic, as three.js): the six
 * Tait–Bryan orders, which every conversion supports, and the six proper Euler orders, which only
 * round-trip as data.
 */
export type EulerOrder = 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY' | 'XYX' | 'YZY' | 'ZXZ' | 'XZX' | 'YXY' | 'ZYZ';

/**
 * A rotation as three angles in radians about x, y and z, applied in {@link Euler.order} (a
 * three.js `Euler` port).
 */
class Euler {
    /**
     * Backing field; read and write through the accessor so change listeners run.
     * @internal
     */
    _x: number;
    /**
     * Backing field; read and write through the accessor so change listeners run.
     * @internal
     */
    _y: number;
    /**
     * Backing field; read and write through the accessor so change listeners run.
     * @internal
     */
    _z: number;
    /**
     * Backing field; read and write through the accessor so change listeners run.
     * @internal
     */
    _order: EulerOrder;
    /** Marks the object as an {@link Euler}; true on every instance (set on the prototype). */
    declare readonly isEuler: boolean;
    /** The order a new Euler takes when none is given: `'XYZ'`. */
    static DEFAULT_ORDER: EulerOrder = 'XYZ';

    constructor(x = 0, y = 0, z = 0, order: EulerOrder = Euler.DEFAULT_ORDER) {
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = order;
    }

    /** The angle about x, in radians. */
    get x() {
        return this._x;
    }

    /** The angle about x, in radians. */
    set x(value) {
        this._x = value;
        this._onChangeCallback();
    }

    /** The angle about y, in radians. */
    get y() {
        return this._y;
    }

    /** The angle about y, in radians. */
    set y(value) {
        this._y = value;
        this._onChangeCallback();
    }

    /** The angle about z, in radians. */
    get z() {
        return this._z;
    }

    /** The angle about z, in radians. */
    set z(value) {
        this._z = value;
        this._onChangeCallback();
    }

    /** The order the rotations apply in. */
    get order() {
        return this._order;
    }

    /** The order the rotations apply in. */
    set order(value) {
        this._order = value;
        this._onChangeCallback();
    }

    /**
     * Sets the three angles and, optionally, the order.
     * @returns This Euler.
     */
    set(x: number, y: number, z: number, order = this._order) {
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = order;

        this._onChangeCallback();

        return this;
    }

    /** A new Euler with the same angles and order. */
    clone() {
        return new Euler(this._x, this._y, this._z, this._order);
    }

    /**
     * Copies the angles and order of `euler`.
     * @returns This Euler.
     */
    copy(euler: Euler) {
        this._x = euler._x;
        this._y = euler._y;
        this._z = euler._z;
        this._order = euler._order;

        this._onChangeCallback();

        return this;
    }

    /**
     * Sets the angles to the rotation in the upper 3×3 of `m` (a pure rotation) in `order`; another
     * order than the six Tait–Bryan ones logs a warning. `update` false skips the change listener.
     * @returns This Euler.
     */
    setFromRotationMatrix(m: Matrix4, order = this._order, update = true) {
        // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

        const te = m.elements;
        const m11 = te[0],
            m12 = te[4],
            m13 = te[8];
        const m21 = te[1],
            m22 = te[5],
            m23 = te[9];
        const m31 = te[2],
            m32 = te[6],
            m33 = te[10];

        switch (order) {
            case 'XYZ':
                this._y = Math.asin(clamp(m13, -1, 1));

                if (Math.abs(m13) < 0.9999999) {
                    this._x = Math.atan2(-m23, m33);
                    this._z = Math.atan2(-m12, m11);
                } else {
                    this._x = Math.atan2(m32, m22);
                    this._z = 0;
                }

                break;

            case 'YXZ':
                this._x = Math.asin(-clamp(m23, -1, 1));

                if (Math.abs(m23) < 0.9999999) {
                    this._y = Math.atan2(m13, m33);
                    this._z = Math.atan2(m21, m22);
                } else {
                    this._y = Math.atan2(-m31, m11);
                    this._z = 0;
                }

                break;

            case 'ZXY':
                this._x = Math.asin(clamp(m32, -1, 1));

                if (Math.abs(m32) < 0.9999999) {
                    this._y = Math.atan2(-m31, m33);
                    this._z = Math.atan2(-m12, m22);
                } else {
                    this._y = 0;
                    this._z = Math.atan2(m21, m11);
                }

                break;

            case 'ZYX':
                this._y = Math.asin(-clamp(m31, -1, 1));

                if (Math.abs(m31) < 0.9999999) {
                    this._x = Math.atan2(m32, m33);
                    this._z = Math.atan2(m21, m11);
                } else {
                    this._x = 0;
                    this._z = Math.atan2(-m12, m22);
                }

                break;

            case 'YZX':
                this._z = Math.asin(clamp(m21, -1, 1));

                if (Math.abs(m21) < 0.9999999) {
                    this._x = Math.atan2(-m23, m22);
                    this._y = Math.atan2(-m31, m11);
                } else {
                    this._x = 0;
                    this._y = Math.atan2(m13, m33);
                }

                break;

            case 'XZY':
                this._z = Math.asin(-clamp(m12, -1, 1));

                if (Math.abs(m12) < 0.9999999) {
                    this._x = Math.atan2(m32, m22);
                    this._y = Math.atan2(m13, m11);
                } else {
                    this._x = Math.atan2(-m23, m33);
                    this._y = 0;
                }

                break;

            default:
                console.warn('../math.Euler: .setFromRotationMatrix() encountered an unknown order: ' + order);
        }

        this._order = order;

        if (update === true) this._onChangeCallback();

        return this;
    }

    /**
     * Sets the angles to the rotation of the unit quaternion `q`, in `order`.
     * @returns This Euler.
     */
    setFromQuaternion(q: Quaternion, order: EulerOrder, update?: boolean) {
        _matrix.makeRotationFromQuaternion(q);

        return this.setFromRotationMatrix(_matrix, order, update);
    }

    /**
     * Sets the angles to the x, y and z of `v`, with `order`.
     * @returns This Euler.
     */
    setFromVector3(v: Vector3, order = this._order) {
        return this.set(v.x, v.y, v.z, order);
    }

    /**
     * Re-expresses the same rotation in `newOrder`. Loses information near gimbal lock, as any
     * Euler conversion does.
     * @returns This Euler.
     */
    reorder(newOrder: EulerOrder) {
        // WARNING: this discards revolution information -bhouston

        _quaternion.setFromEuler(this);

        return this.setFromQuaternion(_quaternion, newOrder);
    }

    /** Whether the angles and the order equal those of `euler` exactly. */
    equals(euler: Euler) {
        return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
    }

    /**
     * Reads x, y, z and, when present, the order from `array[0..3]`.
     * @returns This Euler.
     */
    fromArray(array: any[]) {
        this._x = array[0];
        this._y = array[1];
        this._z = array[2];
        if (array[3] !== undefined) this._order = array[3];

        this._onChangeCallback();

        return this;
    }

    /**
     * Writes x, y, z and the order into `array` starting at `offset`.
     * @returns The array, a new one when none is given.
     */
    toArray(array: any[] = [], offset = 0) {
        array[offset] = this._x;
        array[offset + 1] = this._y;
        array[offset + 2] = this._z;
        array[offset + 3] = this._order;

        return array;
    }

    /**
     * Sets the listener called when an angle or the order changes.
     * @internal
     */
    _onChange(callback: (euler?: Euler) => void) {
        this._onChangeCallback = callback;

        return this;
    }

    /**
     * The change listener; does nothing until `_onChange` sets one.
     * @internal
     */
    _onChangeCallback(euler?: Euler) {}

    /** Iterates over x, y, z and the order. */
    *[Symbol.iterator]() {
        yield this._x;
        yield this._y;
        yield this._z;
        yield this._order;
    }
}

(Euler.prototype as any).isEuler = true;

export {Euler};
