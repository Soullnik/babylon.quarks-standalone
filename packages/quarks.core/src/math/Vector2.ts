import {random} from '../util/random';
import * as MathUtils from './MathUtils';
import {Matrix3} from './Matrix3';

/**
 * A two-component vector (a three.js `Vector2` port), used for 2D quantities such as texture
 * coordinates and sizes.
 */
class Vector2 {
    /** The x component. */
    x: number;
    /** The y component. */
    y: number;
    // Set once on the prototype (see bottom of file), as on Vector3.
    /** Marks the object as a {@link Vector2}; true on every instance (set on the prototype). */
    declare readonly isVector2: boolean;

    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /** Alias of {@link Vector2.x}, for sizes. */
    get width() {
        return this.x;
    }

    /** Alias of {@link Vector2.x}, for sizes. */
    set width(value) {
        this.x = value;
    }

    /** Alias of {@link Vector2.y}, for sizes. */
    get height() {
        return this.y;
    }

    /** Alias of {@link Vector2.y}, for sizes. */
    set height(value) {
        this.y = value;
    }

    /**
     * Sets the components to (x, y).
     * @returns This vector.
     */
    set(x: number, y: number) {
        this.x = x;
        this.y = y;

        return this;
    }

    /**
     * Sets every component to `scalar`.
     * @returns This vector.
     */
    setScalar(scalar: number) {
        this.x = scalar;
        this.y = scalar;

        return this;
    }

    /**
     * Sets the x component.
     * @returns This vector.
     */
    setX(x: number) {
        this.x = x;

        return this;
    }

    /**
     * Sets the y component.
     * @returns This vector.
     */
    setY(y: number) {
        this.y = y;

        return this;
    }

    /**
     * Sets the component at `index` (0 for x … 1 for y); throws for any other index.
     * @returns This vector.
     */
    setComponent(index: number, value: number) {
        switch (index) {
            case 0:
                this.x = value;
                break;
            case 1:
                this.y = value;
                break;
            default:
                throw new Error('index is out of range: ' + index);
        }

        return this;
    }

    /** The component at `index` (0 for x … 1 for y); throws for any other index. */
    getComponent(index: number) {
        switch (index) {
            case 0:
                return this.x;
            case 1:
                return this.y;
            default:
                throw new Error('index is out of range: ' + index);
        }
    }

    /** A new vector with the same components. */
    clone() {
        return new Vector2(this.x, this.y);
    }

    /**
     * Copies the components of `v` into this vector.
     * @returns This vector.
     */
    copy(v: Vector2) {
        this.x = v.x;
        this.y = v.y;

        return this;
    }

    /**
     * Adds `v` to this vector.
     * @returns This vector.
     */
    add(v: Vector2) {
        this.x += v.x;
        this.y += v.y;

        return this;
    }

    /**
     * Adds `s` to every component.
     * @returns This vector.
     */
    addScalar(s: number) {
        this.x += s;
        this.y += s;

        return this;
    }

    /**
     * Sets this vector to `a + b`.
     * @returns This vector.
     */
    addVectors(a: Vector2, b: Vector2) {
        this.x = a.x + b.x;
        this.y = a.y + b.y;

        return this;
    }

    /**
     * Adds `v` multiplied by `s` to this vector.
     * @returns This vector.
     */
    addScaledVector(v: Vector2, s: number) {
        this.x += v.x * s;
        this.y += v.y * s;

        return this;
    }

    /**
     * Subtracts `v` from this vector.
     * @returns This vector.
     */
    sub(v: Vector2) {
        this.x -= v.x;
        this.y -= v.y;

        return this;
    }

    /**
     * Subtracts `s` from every component.
     * @returns This vector.
     */
    subScalar(s: number) {
        this.x -= s;
        this.y -= s;

        return this;
    }

    /**
     * Sets this vector to `a - b`.
     * @returns This vector.
     */
    subVectors(a: Vector2, b: Vector2) {
        this.x = a.x - b.x;
        this.y = a.y - b.y;

        return this;
    }

    /**
     * Multiplies this vector by `v` component-wise.
     * @returns This vector.
     */
    multiply(v: Vector2) {
        this.x *= v.x;
        this.y *= v.y;

        return this;
    }

    /**
     * Multiplies every component by `scalar`.
     * @returns This vector.
     */
    multiplyScalar(scalar: number) {
        this.x *= scalar;
        this.y *= scalar;

        return this;
    }

    /**
     * Divides this vector by `v` component-wise.
     * @returns This vector.
     */
    divide(v: Vector2) {
        this.x /= v.x;
        this.y /= v.y;

        return this;
    }

    /**
     * Divides every component by `scalar`.
     * @returns This vector.
     */
    divideScalar(scalar: number) {
        return this.multiplyScalar(1 / scalar);
    }

    /**
     * Multiplies this vector, as a point with an implicit third component of 1, by `m`.
     * @returns This vector.
     */
    applyMatrix3(m: Matrix3) {
        const x = this.x,
            y = this.y;
        const e = m.elements;

        this.x = e[0] * x + e[3] * y + e[6];
        this.y = e[1] * x + e[4] * y + e[7];

        return this;
    }

    /**
     * Sets each component to the smaller of it and the matching component of `v`.
     * @returns This vector.
     */
    min(v: Vector2) {
        this.x = Math.min(this.x, v.x);
        this.y = Math.min(this.y, v.y);

        return this;
    }

    /**
     * Sets each component to the larger of it and the matching component of `v`.
     * @returns This vector.
     */
    max(v: Vector2) {
        this.x = Math.max(this.x, v.x);
        this.y = Math.max(this.y, v.y);

        return this;
    }

    /**
     * Clamps each component between the matching components of `min` and `max`; `min` must not
     * exceed `max`.
     * @returns This vector.
     */
    clamp(min: Vector2, max: Vector2) {
        // assumes min < max, componentwise

        this.x = Math.max(min.x, Math.min(max.x, this.x));
        this.y = Math.max(min.y, Math.min(max.y, this.y));

        return this;
    }

    /**
     * Clamps each component between `minVal` and `maxVal`.
     * @returns This vector.
     */
    clampScalar(minVal: number, maxVal: number) {
        this.x = Math.max(minVal, Math.min(maxVal, this.x));
        this.y = Math.max(minVal, Math.min(maxVal, this.y));

        return this;
    }

    /**
     * Scales this vector so that its length lies between `min` and `max`, keeping its direction.
     * @returns This vector.
     */
    clampLength(min: number, max: number) {
        const length = this.length();

        return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
    }

    /**
     * Rounds each component down.
     * @returns This vector.
     */
    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);

        return this;
    }

    /**
     * Rounds each component up.
     * @returns This vector.
     */
    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);

        return this;
    }

    /**
     * Rounds each component to the nearest integer.
     * @returns This vector.
     */
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);

        return this;
    }

    /**
     * Rounds each component toward zero.
     * @returns This vector.
     */
    roundToZero() {
        this.x = Math.trunc(this.x);
        this.y = Math.trunc(this.y);

        return this;
    }

    /**
     * Negates every component.
     * @returns This vector.
     */
    negate() {
        this.x = -this.x;
        this.y = -this.y;

        return this;
    }

    /** The dot product of this vector and `v`. */
    dot(v: Vector2) {
        return this.x * v.x + this.y * v.y;
    }

    /** The 2D cross product (the z of the 3D cross product) of this vector and `v`. */
    cross(v: Vector2) {
        return this.x * v.y - this.y * v.x;
    }

    /** The squared Euclidean length; cheaper than {@link Vector2.length} for comparisons. */
    lengthSq() {
        return this.x * this.x + this.y * this.y;
    }

    /** The Euclidean length. */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /** The Manhattan length: the sum of the absolute components. */
    manhattanLength() {
        return Math.abs(this.x) + Math.abs(this.y);
    }

    /**
     * Scales this vector to length 1; a zero vector stays zero.
     * @returns This vector.
     */
    normalize() {
        return this.divideScalar(this.length() || 1);
    }

    /** The angle of this vector from the positive x axis, in radians in [0, 2π). */
    angle() {
        // computes the angle in radians with respect to the positive x-axis

        const angle = Math.atan2(-this.y, -this.x) + Math.PI;

        return angle;
    }

    /** The angle to `v` in radians, in [0, π]; π/2 when either vector is zero. */
    angleTo(v: Vector2) {
        const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());

        if (denominator === 0) return Math.PI / 2;

        const theta = this.dot(v) / denominator;

        // clamp, to handle numerical problems

        return Math.acos(MathUtils.clamp(theta, -1, 1));
    }

    /** The Euclidean distance to `v`. */
    distanceTo(v: Vector2) {
        return Math.sqrt(this.distanceToSquared(v));
    }

    /** The squared Euclidean distance to `v`. */
    distanceToSquared(v: Vector2) {
        const dx = this.x - v.x,
            dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    /** The Manhattan distance to `v`. */
    manhattanDistanceTo(v: Vector2) {
        return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
    }

    /**
     * Scales this vector to `length`, keeping its direction.
     * @returns This vector.
     */
    setLength(length: number) {
        return this.normalize().multiplyScalar(length);
    }

    /**
     * Moves this vector toward `v` by `alpha` (0 keeps it, 1 reaches `v`).
     * @returns This vector.
     */
    lerp(v: Vector2, alpha: number) {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;

        return this;
    }

    /**
     * Sets this vector to the linear interpolation from `v1` to `v2` by `alpha`.
     * @returns This vector.
     */
    lerpVectors(v1: Vector2, v2: Vector2, alpha: number) {
        this.x = v1.x + (v2.x - v1.x) * alpha;
        this.y = v1.y + (v2.y - v1.y) * alpha;

        return this;
    }

    /** Whether every component equals the matching component of `v` exactly. */
    equals(v: Vector2) {
        return v.x === this.x && v.y === this.y;
    }

    /**
     * Reads the 2 components from `array` starting at `offset`.
     * @returns This vector.
     */
    fromArray(array: number[], offset = 0) {
        this.x = array[offset];
        this.y = array[offset + 1];

        return this;
    }

    /**
     * Writes the 2 components into `array` starting at `offset`.
     * @returns The array, a new one when none is given.
     */
    toArray(array: number[] = [], offset = 0) {
        array[offset] = this.x;
        array[offset + 1] = this.y;

        return array;
    }

    /*fromBufferAttribute(attribute, index: number) {
        this.x = attribute.getX(index);
        this.y = attribute.getY(index);

        return this;
    }*/

    /**
     * Rotates this point by `angle` radians around `center`.
     * @returns This vector.
     */
    rotateAround(center: Vector2, angle: number) {
        const c = Math.cos(angle),
            s = Math.sin(angle);

        const x = this.x - center.x;
        const y = this.y - center.y;

        this.x = x * c - y * s + center.x;
        this.y = x * s + y * c + center.y;

        return this;
    }

    /**
     * Sets each component to a random number in [0, 1), from the library's random source.
     * @returns This vector.
     */
    random() {
        this.x = random();
        this.y = random();

        return this;
    }

    /** Iterates over the components in order (x, y). */
    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
    }
}

Object.defineProperty(Vector2.prototype, 'isVector2', {value: true});

export {Vector2};
