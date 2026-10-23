import {random} from '../util/random';
import {Euler} from './Euler';
import * as MathUtils from './MathUtils';
import {Matrix3} from './Matrix3';
import {Matrix4} from './Matrix4';
import {Quaternion} from './Quaternion';

/**
 * A three-component vector (a three.js `Vector3` port): positions, velocities, directions and
 * scales throughout the simulation. Methods that change it return it, so calls chain.
 */
class Vector3 {
    /** The x component. */
    x: number;
    /** The y component. */
    y: number;
    /** The z component. */
    z: number;
    // Set once on the prototype (see bottom of file) instead of per instance:
    // vectors are allocated in hot loops, so the constructor stays minimal.
    /** Marks the object as a {@link Vector3}; true on every instance (set on the prototype). */
    declare readonly isVector3: boolean;
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Sets the components to (x, y, z).
     * @returns This vector.
     */
    set(x: number, y: number, z: number) {
        if (z === undefined) z = this.z; // sprite.scale.set(x,y)

        this.x = x;
        this.y = y;
        this.z = z;

        return this;
    }

    /**
     * Sets every component to `scalar`.
     * @returns This vector.
     */
    setScalar(scalar: number) {
        this.x = scalar;
        this.y = scalar;
        this.z = scalar;

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
     * Sets the z component.
     * @returns This vector.
     */
    setZ(z: number) {
        this.z = z;

        return this;
    }

    /**
     * Sets the component at `index` (0 for x … 2 for z); throws for any other index.
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
            case 2:
                this.z = value;
                break;
            default:
                throw new Error('index is out of range: ' + index);
        }

        return this;
    }

    /** The component at `index` (0 for x … 2 for z); throws for any other index. */
    getComponent(index: number) {
        switch (index) {
            case 0:
                return this.x;
            case 1:
                return this.y;
            case 2:
                return this.z;
            default:
                throw new Error('index is out of range: ' + index);
        }
    }

    /** A new vector with the same components. */
    clone() {
        return new Vector3(this.x, this.y, this.z);
    }

    /**
     * Copies the components of `v` into this vector.
     * @returns This vector.
     */
    copy(v: Vector3) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;

        return this;
    }

    /**
     * Adds `v` to this vector.
     * @returns This vector.
     */
    add(v: Vector3) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;

        return this;
    }

    /**
     * Adds `s` to every component.
     * @returns This vector.
     */
    addScalar(s: number) {
        this.x += s;
        this.y += s;
        this.z += s;

        return this;
    }

    /**
     * Sets this vector to `a + b`.
     * @returns This vector.
     */
    addVectors(a: Vector3, b: Vector3) {
        this.x = a.x + b.x;
        this.y = a.y + b.y;
        this.z = a.z + b.z;

        return this;
    }

    /**
     * Adds `v` multiplied by `s` to this vector.
     * @returns This vector.
     */
    addScaledVector(v: Vector3, s: number) {
        this.x += v.x * s;
        this.y += v.y * s;
        this.z += v.z * s;

        return this;
    }

    /**
     * Subtracts `v` from this vector.
     * @returns This vector.
     */
    sub(v: Vector3) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;

        return this;
    }

    /**
     * Subtracts `s` from every component.
     * @returns This vector.
     */
    subScalar(s: number) {
        this.x -= s;
        this.y -= s;
        this.z -= s;

        return this;
    }

    /**
     * Sets this vector to `a - b`.
     * @returns This vector.
     */
    subVectors(a: Vector3, b: Vector3) {
        this.x = a.x - b.x;
        this.y = a.y - b.y;
        this.z = a.z - b.z;

        return this;
    }

    /**
     * Multiplies this vector by `v` component-wise.
     * @returns This vector.
     */
    multiply(v: Vector3) {
        this.x *= v.x;
        this.y *= v.y;
        this.z *= v.z;

        return this;
    }

    /**
     * Multiplies every component by `scalar`.
     * @returns This vector.
     */
    multiplyScalar(scalar: number) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;

        return this;
    }

    /**
     * Sets this vector to the component-wise product of `a` and `b`.
     * @returns This vector.
     */
    multiplyVectors(a: Vector3, b: Vector3) {
        this.x = a.x * b.x;
        this.y = a.y * b.y;
        this.z = a.z * b.z;

        return this;
    }

    /**
     * Rotates this vector by the Euler angles `euler`.
     * @returns This vector.
     */
    applyEuler(euler: Euler) {
        return this.applyQuaternion(_quaternion.setFromEuler(euler));
    }

    /**
     * Rotates this vector by `angle` radians around the normalized `axis`.
     * @returns This vector.
     */
    applyAxisAngle(axis: Vector3, angle: number) {
        return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle));
    }

    /**
     * Multiplies this vector by the 3×3 matrix `m`.
     * @returns This vector.
     */
    applyMatrix3(m: Matrix3) {
        const x = this.x,
            y = this.y,
            z = this.z;
        const e = m.elements;

        this.x = e[0] * x + e[3] * y + e[6] * z;
        this.y = e[1] * x + e[4] * y + e[7] * z;
        this.z = e[2] * x + e[5] * y + e[8] * z;

        return this;
    }

    /**
     * Transforms this normal by the normal matrix `m` and normalizes it.
     * @returns This vector.
     */
    applyNormalMatrix(m: Matrix3) {
        return this.applyMatrix3(m).normalize();
    }

    /**
     * Transforms this point by the 4×4 matrix `m`, with the perspective divide.
     * @returns This vector.
     */
    applyMatrix4(m: Matrix4) {
        const x = this.x,
            y = this.y,
            z = this.z;
        const e = m.elements;

        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

        this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
        this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
        this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;

        return this;
    }

    /**
     * Rotates this vector by the quaternion `q`.
     * @returns This vector.
     */
    applyQuaternion(q: Quaternion) {
        // quaternion q is assumed to have unit length

        const vx = this.x,
            vy = this.y,
            vz = this.z;
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w;

        // t = 2 * cross( q.xyz, v );
        const tx = 2 * (qy * vz - qz * vy);
        const ty = 2 * (qz * vx - qx * vz);
        const tz = 2 * (qx * vy - qy * vx);

        // v + q.w * t + cross( q.xyz, t );
        this.x = vx + qw * tx + qy * tz - qz * ty;
        this.y = vy + qw * ty + qz * tx - qx * tz;
        this.z = vz + qw * tz + qx * ty - qy * tx;

        return this;
    }

    /*project(camera: Camera) {
        return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    }

    unproject(camera: Camera) {
        return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
    }*/

    /**
     * Transforms this direction by the upper 3×3 of `m` and normalizes it.
     * @returns This vector.
     */
    transformDirection(m: Matrix4) {
        // input: ../math.Matrix4 affine matrix
        // vector interpreted as a direction

        const x = this.x,
            y = this.y,
            z = this.z;
        const e = m.elements;

        this.x = e[0] * x + e[4] * y + e[8] * z;
        this.y = e[1] * x + e[5] * y + e[9] * z;
        this.z = e[2] * x + e[6] * y + e[10] * z;

        return this.normalize();
    }

    /**
     * Divides this vector by `v` component-wise.
     * @returns This vector.
     */
    divide(v: Vector3) {
        this.x /= v.x;
        this.y /= v.y;
        this.z /= v.z;

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
     * Sets each component to the smaller of it and the matching component of `v`.
     * @returns This vector.
     */
    min(v: Vector3) {
        this.x = Math.min(this.x, v.x);
        this.y = Math.min(this.y, v.y);
        this.z = Math.min(this.z, v.z);

        return this;
    }

    /**
     * Sets each component to the larger of it and the matching component of `v`.
     * @returns This vector.
     */
    max(v: Vector3) {
        this.x = Math.max(this.x, v.x);
        this.y = Math.max(this.y, v.y);
        this.z = Math.max(this.z, v.z);

        return this;
    }

    /**
     * Clamps each component between the matching components of `min` and `max`; `min` must not
     * exceed `max`.
     * @returns This vector.
     */
    clamp(min: Vector3, max: Vector3) {
        // assumes min < max, componentwise

        this.x = Math.max(min.x, Math.min(max.x, this.x));
        this.y = Math.max(min.y, Math.min(max.y, this.y));
        this.z = Math.max(min.z, Math.min(max.z, this.z));

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

        return this;
    }

    /** The dot product of this vector and `v`. */
    dot(v: Vector3) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    // TODO lengthSquared?

    /** The squared Euclidean length; cheaper than {@link Vector3.length} for comparisons. */
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /** The Euclidean length. */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /** The Manhattan length: the sum of the absolute components. */
    manhattanLength() {
        return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
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
    lerp(v: Vector3, alpha: number) {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;
        this.z += (v.z - this.z) * alpha;

        return this;
    }

    /**
     * Sets this vector to the linear interpolation from `v1` to `v2` by `alpha`.
     * @returns This vector.
     */
    lerpVectors(v1: Vector3, v2: Vector3, alpha: number) {
        this.x = v1.x + (v2.x - v1.x) * alpha;
        this.y = v1.y + (v2.y - v1.y) * alpha;
        this.z = v1.z + (v2.z - v1.z) * alpha;

        return this;
    }

    /**
     * Sets this vector to its cross product with `v`.
     * @returns This vector.
     */
    cross(v: Vector3) {
        return this.crossVectors(this, v);
    }

    /**
     * Sets this vector to the cross product `a × b`.
     * @returns This vector.
     */
    crossVectors(a: Vector3, b: Vector3) {
        const ax = a.x,
            ay = a.y,
            az = a.z;
        const bx = b.x,
            by = b.y,
            bz = b.z;

        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;

        return this;
    }

    /**
     * Projects this vector onto `v`; a zero `v` gives zero.
     * @returns This vector.
     */
    projectOnVector(v: Vector3) {
        const denominator = v.lengthSq();

        if (denominator === 0) return this.set(0, 0, 0);

        const scalar = v.dot(this) / denominator;

        return this.copy(v).multiplyScalar(scalar);
    }

    /**
     * Projects this vector onto the plane through the origin with the normalized `planeNormal`.
     * @returns This vector.
     */
    projectOnPlane(planeNormal: Vector3) {
        _vector.copy(this).projectOnVector(planeNormal);

        return this.sub(_vector);
    }

    /**
     * Reflects this vector off the plane with the normalized `normal`.
     * @returns This vector.
     */
    reflect(normal: Vector3) {
        // reflect incident vector off plane orthogonal to normal
        // normal is assumed to have unit length

        return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)));
    }

    /** The angle to `v` in radians, in [0, π]; π/2 when either vector is zero. */
    angleTo(v: Vector3) {
        const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());

        if (denominator === 0) return Math.PI / 2;

        const theta = this.dot(v) / denominator;

        // clamp, to handle numerical problems

        return Math.acos(MathUtils.clamp(theta, -1, 1));
    }

    /** The Euclidean distance to `v`. */
    distanceTo(v: Vector3) {
        return Math.sqrt(this.distanceToSquared(v));
    }

    /** The squared Euclidean distance to `v`. */
    distanceToSquared(v: Vector3) {
        const dx = this.x - v.x,
            dy = this.y - v.y,
            dz = this.z - v.z;

        return dx * dx + dy * dy + dz * dz;
    }

    /** The Manhattan distance to `v`. */
    manhattanDistanceTo(v: Vector3) {
        return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
    }

    /*setFromSpherical(s) {
        return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
    }*/

    /**
     * Sets this vector from spherical coordinates: `radius`, polar angle `phi` from +y, azimuth
     * `theta` around y from +z.
     * @returns This vector.
     */
    setFromSphericalCoords(radius: number, phi: number, theta: number) {
        const sinPhiRadius = Math.sin(phi) * radius;

        this.x = sinPhiRadius * Math.sin(theta);
        this.y = Math.cos(phi) * radius;
        this.z = sinPhiRadius * Math.cos(theta);

        return this;
    }

    /*setFromCylindrical(c) {
        return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
    }*/

    /**
     * Sets this vector from cylindrical coordinates: `radius`, angle `theta` around y from +z,
     * height `y`.
     * @returns This vector.
     */
    setFromCylindricalCoords(radius: number, theta: number, y: number) {
        this.x = radius * Math.sin(theta);
        this.y = y;
        this.z = radius * Math.cos(theta);

        return this;
    }

    /**
     * Sets this vector to the translation of `m`.
     * @returns This vector.
     */
    setFromMatrixPosition(m: Matrix4) {
        const e = m.elements;

        this.x = e[12];
        this.y = e[13];
        this.z = e[14];

        return this;
    }

    /**
     * Sets this vector to the scale of `m`: the lengths of its first three columns.
     * @returns This vector.
     */
    setFromMatrixScale(m: Matrix4) {
        const sx = this.setFromMatrixColumn(m, 0).length();
        const sy = this.setFromMatrixColumn(m, 1).length();
        const sz = this.setFromMatrixColumn(m, 2).length();

        this.x = sx;
        this.y = sy;
        this.z = sz;

        return this;
    }

    /**
     * Sets this vector to the first three entries of column `index` of `m`.
     * @returns This vector.
     */
    setFromMatrixColumn(m: Matrix4, index: number) {
        return this.fromArray(m.elements, index * 4);
    }

    /**
     * Sets this vector to column `index` of `m`.
     * @returns This vector.
     */
    setFromMatrix3Column(m: Matrix3, index: number) {
        return this.fromArray(m.elements, index * 3);
    }

    /**
     * Sets this vector to the x, y and z angles of `e`.
     * @returns This vector.
     */
    setFromEuler(e: Euler) {
        this.x = e._x;
        this.y = e._y;
        this.z = e._z;

        return this;
    }

    /*setFromColor(c) {
        this.x = c.r;
        this.y = c.g;
        this.z = c.b;

        return this;
    }*/

    /** Whether every component equals the matching component of `v` exactly. */
    equals(v: Vector3) {
        return v.x === this.x && v.y === this.y && v.z === this.z;
    }

    /**
     * Reads the 3 components from `array` starting at `offset`.
     * @returns This vector.
     */
    fromArray(array: number[], offset = 0) {
        this.x = array[offset];
        this.y = array[offset + 1];
        this.z = array[offset + 2];

        return this;
    }

    /**
     * Writes the 3 components into `array` starting at `offset`.
     * @returns The array, a new one when none is given.
     */
    toArray(array: number[] = [], offset = 0) {
        array[offset] = this.x;
        array[offset + 1] = this.y;
        array[offset + 2] = this.z;

        return array;
    }

    /*fromBufferAttribute(attribute, index) {
        this.x = attribute.getX(index);
        this.y = attribute.getY(index);
        this.z = attribute.getZ(index);

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

        return this;
    }

    /**
     * Sets this vector to a uniformly random unit direction.
     * @returns This vector.
     */
    randomDirection() {
        // https://mathworld.wolfram.com/SpherePointPicking.html

        const theta = random() * Math.PI * 2;
        const u = random() * 2 - 1;
        const c = Math.sqrt(1 - u * u);

        this.x = c * Math.cos(theta);
        this.y = u;
        this.z = c * Math.sin(theta);

        return this;
    }

    /**
     * Sets each component to its absolute value.
     * @returns This vector.
     */
    abs() {
        this.x = Math.abs(this.x);
        this.y = Math.abs(this.y);
        this.z = Math.abs(this.z);
        return this;
    }

    /** Iterates over the components in order (x, y, z). */
    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
        yield this.z;
    }
}

Object.defineProperty(Vector3.prototype, 'isVector3', {value: true});

const _vector = /*@__PURE__*/ new Vector3();
const _quaternion = /*@__PURE__*/ new Quaternion();

export {Vector3};
