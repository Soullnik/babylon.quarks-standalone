import {random} from '../util/random';
import {Matrix4} from './Matrix4';
import {Quaternion} from './Quaternion';

/**
 * A four-component vector (a three.js `Vector4` port): colours (r, g, b, a in x, y, z, w) and
 * homogeneous coordinates. Methods that change it return it, so calls chain.
 */
class Vector4 {
    /** The x component. */
    x: number;
    /** The y component. */
    y: number;
    /** The z component. */
    z: number;
    /** The w component. */
    w: number;
    // Prototype-level marker (assigned once at the bottom of this file) so the
    // constructor only writes the four components.
    /** Marks the object as a {@link Vector4}; true on every instance (set on the prototype). */
    declare readonly isVector4: boolean;

    constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    /** Alias of {@link Vector4.x}, so a colour kept in this vector reads as `{r, g, b, a}`. */
    get r(): number {
        return this.x;
    }

    set r(value: number) {
        this.x = value;
    }

    /** Alias of {@link Vector4.y}, so a colour kept in this vector reads as `{r, g, b, a}`. */
    get g(): number {
        return this.y;
    }

    set g(value: number) {
        this.y = value;
    }

    /** Alias of {@link Vector4.z}, so a colour kept in this vector reads as `{r, g, b, a}`. */
    get b(): number {
        return this.z;
    }

    set b(value: number) {
        this.z = value;
    }

    /** Alias of {@link Vector4.w}, so a colour kept in this vector reads as `{r, g, b, a}`. */
    get a(): number {
        return this.w;
    }

    set a(value: number) {
        this.w = value;
    }

    /** Alias of {@link Vector4.z}, for rectangles. */
    get width() {
        return this.z;
    }

    /** Alias of {@link Vector4.z}, for rectangles. */
    set width(value) {
        this.z = value;
    }

    /** Alias of {@link Vector4.w}, for rectangles. */
    get height() {
        return this.w;
    }

    /** Alias of {@link Vector4.w}, for rectangles. */
    set height(value) {
        this.w = value;
    }

    /**
     * Sets the components to (x, y, z, w).
     * @returns This vector.
     */
    set(x: number, y: number, z: number, w: number): Vector4 {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;

        return this;
    }

    /**
     * Sets every component to `scalar`.
     * @returns This vector.
     */
    setScalar(scalar: number): Vector4 {
        this.x = scalar;
        this.y = scalar;
        this.z = scalar;
        this.w = scalar;

        return this;
    }

    /**
     * Sets the x component.
     * @returns This vector.
     */
    setX(x: number): Vector4 {
        this.x = x;

        return this;
    }

    /**
     * Sets the y component.
     * @returns This vector.
     */
    setY(y: number): Vector4 {
        this.y = y;

        return this;
    }

    /**
     * Sets the z component.
     * @returns This vector.
     */
    setZ(z: number): Vector4 {
        this.z = z;

        return this;
    }

    /**
     * Sets the w component.
     * @returns This vector.
     */
    setW(w: number): Vector4 {
        this.w = w;

        return this;
    }

    /**
     * Sets the component at `index` (0 for x … 3 for w); throws for any other index.
     * @returns This vector.
     */
    setComponent(index: number, value: number): Vector4 {
        switch (index) {
            case 0:
                this.x = value;
                break;
            case 1:
                this.y = value;
                break;
            case 2:
                this.z = value;
                break;
            case 3:
                this.w = value;
                break;
            default:
                throw new Error('index is out of range: ' + index);
        }

        return this;
    }

    /** The component at `index` (0 for x … 3 for w); throws for any other index. */
    getComponent(index: number): number {
        switch (index) {
            case 0:
                return this.x;
            case 1:
                return this.y;
            case 2:
                return this.z;
            case 3:
                return this.w;
            default:
                throw new Error('index is out of range: ' + index);
        }
    }

    /** A new vector with the same components. */
    clone(): Vector4 {
        return new Vector4(this.x, this.y, this.z, this.w);
    }

    /**
     * Copies the components of `v` into this vector.
     * @returns This vector.
     */
    copy(v: Vector4): Vector4 {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        this.w = v.w;

        return this;
    }

    /**
     * Adds `v` to this vector.
     * @returns This vector.
     */
    add(v: Vector4): Vector4 {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        this.w += v.w;

        return this;
    }

    /**
     * Adds `s` to every component.
     * @returns This vector.
     */
    addScalar(scalar: number): Vector4 {
        this.x += scalar;
        this.y += scalar;
        this.z += scalar;
        this.w += scalar;

        return this;
    }

    /**
     * Sets this vector to `a + b`.
     * @returns This vector.
     */
    addVectors(a: Vector4, b: Vector4): Vector4 {
        this.x = a.x + b.x;
        this.y = a.y + b.y;
        this.z = a.z + b.z;
        this.w = a.w + b.w;

        return this;
    }

    /**
     * Adds `v` multiplied by `s` to this vector.
     * @returns This vector.
     */
    addScaledVector(v: Vector4, s: number): Vector4 {
        this.x += v.x * s;
        this.y += v.y * s;
        this.z += v.z * s;
        this.w += v.w * s;

        return this;
    }
    /**
     * Subtracts `v` from this vector.
     * @returns This vector.
     */
    sub(v: Vector4): Vector4 {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        this.w -= v.w;

        return this;
    }

    /**
     * Subtracts `s` from every component.
     * @returns This vector.
     */
    subScalar(scalar: number): Vector4 {
        this.x -= scalar;
        this.y -= scalar;
        this.z -= scalar;
        this.w -= scalar;

        return this;
    }

    /**
     * Sets this vector to `a - b`.
     * @returns This vector.
     */
    subVectors(a: Vector4, b: Vector4): Vector4 {
        this.x = a.x - b.x;
        this.y = a.y - b.y;
        this.z = a.z - b.z;
        this.w = a.w - b.w;

        return this;
    }

    /**
     * Multiplies this vector by `v` component-wise.
     * @returns This vector.
     */
    multiply(v: Vector4): Vector4 {
        this.x *= v.x;
        this.y *= v.y;
        this.z *= v.z;
        this.w *= v.w;

        return this;
    }

    /**
     * Multiplies every component by `scalar`.
     * @returns This vector.
     */
    multiplyScalar(scalar: number): Vector4 {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        this.w *= scalar;

        return this;
    }

    /**
     * Multiplies this vector by `m`.
     * @returns This vector.
     */
    applyMatrix4(m: Matrix4) {
        const x = this.x,
            y = this.y,
            z = this.z,
            w = this.w;
        const e = m.elements;

        this.x = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
        this.y = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
        this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
        this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;

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
     * Sets x, y, z to the rotation axis and w to the angle in radians of the normalized quaternion
     * `q`.
     * @returns This vector.
     */
    setAxisAngleFromQuaternion(q: Quaternion) {
        // http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/index.htm

        // q is assumed to be normalized

        this.w = 2 * Math.acos(q.w);

        const s = Math.sqrt(1 - q.w * q.w);

        if (s < 0.0001) {
            this.x = 1;
            this.y = 0;
            this.z = 0;
        } else {
            this.x = q.x / s;
            this.y = q.y / s;
            this.z = q.z / s;
        }

        return this;
    }

    /**
     * Sets x, y, z to the rotation axis and w to the angle in radians of the pure rotation in the upper
     * 3×3 of `m`.
     * @returns This vector.
     */
    setAxisAngleFromRotationMatrix(m: Matrix4) {
        // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToAngle/index.htm

        // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

        let angle, x, y, z; // variables for result
        const epsilon = 0.01, // margin to allow for rounding errors
            epsilon2 = 0.1, // margin to distinguish between 0 and 180 degrees
            te = m.elements,
            m11 = te[0],
            m12 = te[4],
            m13 = te[8],
            m21 = te[1],
            m22 = te[5],
            m23 = te[9],
            m31 = te[2],
            m32 = te[6],
            m33 = te[10];

        if (Math.abs(m12 - m21) < epsilon && Math.abs(m13 - m31) < epsilon && Math.abs(m23 - m32) < epsilon) {
            // singularity found
            // first check for identity matrix which must have +1 for all terms
            // in leading diagonal and zero in other terms

            if (
                Math.abs(m12 + m21) < epsilon2 &&
                Math.abs(m13 + m31) < epsilon2 &&
                Math.abs(m23 + m32) < epsilon2 &&
                Math.abs(m11 + m22 + m33 - 3) < epsilon2
            ) {
                // this singularity is identity matrix so angle = 0

                this.set(1, 0, 0, 0);

                return this; // zero angle, arbitrary axis
            }

            // otherwise this singularity is angle = 180

            angle = Math.PI;

            const xx = (m11 + 1) / 2;
            const yy = (m22 + 1) / 2;
            const zz = (m33 + 1) / 2;
            const xy = (m12 + m21) / 4;
            const xz = (m13 + m31) / 4;
            const yz = (m23 + m32) / 4;

            if (xx > yy && xx > zz) {
                // m11 is the largest diagonal term

                if (xx < epsilon) {
                    x = 0;
                    y = 0.707106781;
                    z = 0.707106781;
                } else {
                    x = Math.sqrt(xx);
                    y = xy / x;
                    z = xz / x;
                }
            } else if (yy > zz) {
                // m22 is the largest diagonal term

                if (yy < epsilon) {
                    x = 0.707106781;
                    y = 0;
                    z = 0.707106781;
                } else {
                    y = Math.sqrt(yy);
                    x = xy / y;
                    z = yz / y;
                }
            } else {
                // m33 is the largest diagonal term so base result on this

                if (zz < epsilon) {
                    x = 0.707106781;
                    y = 0.707106781;
                    z = 0;
                } else {
                    z = Math.sqrt(zz);
                    x = xz / z;
                    y = yz / z;
                }
            }

            this.set(x, y, z, angle);

            return this; // return 180 deg rotation
        }

        // as we have reached here there are no singularities so we can handle normally

        let s = Math.sqrt((m32 - m23) * (m32 - m23) + (m13 - m31) * (m13 - m31) + (m21 - m12) * (m21 - m12)); // used to normalize

        if (Math.abs(s) < 0.001) s = 1;

        // prevent divide by zero, should not happen if matrix is orthogonal and should be
        // caught by singularity test above, but I've left it in just in case

        this.x = (m32 - m23) / s;
        this.y = (m13 - m31) / s;
        this.z = (m21 - m12) / s;
        this.w = Math.acos((m11 + m22 + m33 - 1) / 2);

        return this;
    }

    /**
     * Sets each component to the smaller of it and the matching component of `v`.
     * @returns This vector.
     */
    min(v: Vector4) {
        this.x = Math.min(this.x, v.x);
        this.y = Math.min(this.y, v.y);
        this.z = Math.min(this.z, v.z);
        this.w = Math.min(this.w, v.w);

        return this;
    }

    /**
     * Sets each component to the larger of it and the matching component of `v`.
     * @returns This vector.
     */
    max(v: Vector4) {
        this.x = Math.max(this.x, v.x);
        this.y = Math.max(this.y, v.y);
        this.z = Math.max(this.z, v.z);
        this.w = Math.max(this.w, v.w);

        return this;
    }

    /**
     * Clamps each component between the matching components of `min` and `max`; `min` must not
     * exceed `max`.
     * @returns This vector.
     */
    clamp(min: Vector4, max: Vector4) {
        // assumes min < max, componentwise

        this.x = Math.max(min.x, Math.min(max.x, this.x));
        this.y = Math.max(min.y, Math.min(max.y, this.y));
        this.z = Math.max(min.z, Math.min(max.z, this.z));
        this.w = Math.max(min.w, Math.min(max.w, this.w));

        return this;
    }

    /**
     * Clamps each component between `minVal` and `maxVal`.
     * @returns This vector.
     */
    clampScalar(minVal: number, maxVal: number) {
        this.x = Math.max(minVal, Math.min(maxVal, this.x));
        this.y = Math.max(minVal, Math.min(maxVal, this.y));
        this.z = Math.max(minVal, Math.min(maxVal, this.z));
        this.w = Math.max(minVal, Math.min(maxVal, this.w));

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
        this.z = Math.floor(this.z);
        this.w = Math.floor(this.w);

        return this;
    }

    /**
     * Rounds each component up.
     * @returns This vector.
     */
    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        this.z = Math.ceil(this.z);
        this.w = Math.ceil(this.w);

        return this;
    }

    /**
     * Rounds each component to the nearest integer.
     * @returns This vector.
     */
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        this.z = Math.round(this.z);
        this.w = Math.round(this.w);

        return this;
    }

    /**
     * Rounds each component toward zero.
     * @returns This vector.
     */
    roundToZero() {
        this.x = Math.trunc(this.x);
        this.y = Math.trunc(this.y);
        this.z = Math.trunc(this.z);
        this.w = Math.trunc(this.w);

        return this;
    }

    /**
     * Negates every component.
     * @returns This vector.
     */
    negate() {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        this.w = -this.w;

        return this;
    }

    /** The dot product of this vector and `v`. */
    dot(v: Vector4) {
        return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    }

    /** The squared Euclidean length; cheaper than {@link Vector4.length} for comparisons. */
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    }

    /** The Euclidean length. */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    }

    /** The Manhattan length: the sum of the absolute components. */
    manhattanLength() {
        return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
    }

    /**
     * Scales this vector to length 1; a zero vector stays zero.
     * @returns This vector.
     */
    normalize() {
        return this.divideScalar(this.length() || 1);
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
    lerp(v: Vector4, alpha: number) {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;
        this.z += (v.z - this.z) * alpha;
        this.w += (v.w - this.w) * alpha;

        return this;
    }

    /**
     * Sets this vector to the linear interpolation from `v1` to `v2` by `alpha`.
     * @returns This vector.
     */
    lerpVectors(v1: Vector4, v2: Vector4, alpha: number) {
        this.x = v1.x + (v2.x - v1.x) * alpha;
        this.y = v1.y + (v2.y - v1.y) * alpha;
        this.z = v1.z + (v2.z - v1.z) * alpha;
        this.w = v1.w + (v2.w - v1.w) * alpha;

        return this;
    }

    /** Whether every component equals the matching component of `v` exactly. */
    equals(v: Vector4) {
        return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
    }

    /**
     * Reads the 4 components from `array` starting at `offset`.
     * @returns This vector.
     */
    fromArray(array: number[], offset = 0) {
        this.x = array[offset];
        this.y = array[offset + 1];
        this.z = array[offset + 2];
        this.w = array[offset + 3];

        return this;
    }

    /**
     * Writes the 4 components into `array` starting at `offset`.
     * @returns The array, a new one when none is given.
     */
    toArray(array: number[] = [], offset = 0) {
        array[offset] = this.x;
        array[offset + 1] = this.y;
        array[offset + 2] = this.z;
        array[offset + 3] = this.w;

        return array;
    }

    /*
    fromBufferAttribute(attribute, index) {
        this.x = attribute.getX(index);
        this.y = attribute.getY(index);
        this.z = attribute.getZ(index);
        this.w = attribute.getW(index);

        return this;
    }*/

    /**
     * Sets each component to a random number in [0, 1), from the library's random source.
     * @returns This vector.
     */
    random() {
        this.x = random();
        this.y = random();
        this.z = random();
        this.w = random();

        return this;
    }

    /** Iterates over the components in order (x, y, z, w). */
    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
        yield this.z;
        yield this.w;
    }
}

Object.defineProperty(Vector4.prototype, 'isVector4', {value: true});

export {Vector4};
