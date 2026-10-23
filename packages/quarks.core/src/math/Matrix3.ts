import {Matrix4} from './Matrix4';
import {Vector2} from './Vector2';
import {Vector3} from './Vector3';

/**
 * A 3×3 matrix (a three.js `Matrix3` port), stored column-major in {@link Matrix3.elements}:
 * rotations, normal matrices and 2D (UV) transforms. Methods that change it return it, so calls
 * chain.
 */
class Matrix3 {
    /** The nine entries in column-major order. */
    elements: number[];
    /** Marks the object as a {@link Matrix3}; true on every instance (set on the prototype). */
    declare readonly isMatrix3: boolean;
    constructor(
        n11?: number,
        n12?: number,
        n13?: number,
        n21?: number,
        n22?: number,
        n23?: number,
        n31?: number,
        n32?: number,
        n33?: number
    ) {
        this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];

        if (n11 !== undefined) {
            this.set(n11, n12!, n13!, n21!, n22!, n23!, n31!, n32!, n33!);
        }
    }

    /**
     * Sets the entries, given in row-major order (n11 n12 n13 is the first row).
     * @returns This matrix.
     */
    set(
        n11: number,
        n12: number,
        n13: number,
        n21: number,
        n22: number,
        n23: number,
        n31: number,
        n32: number,
        n33: number
    ) {
        const te = this.elements;

        te[0] = n11;
        te[1] = n21;
        te[2] = n31;
        te[3] = n12;
        te[4] = n22;
        te[5] = n32;
        te[6] = n13;
        te[7] = n23;
        te[8] = n33;

        return this;
    }

    /**
     * Sets this matrix to the identity.
     * @returns This matrix.
     */
    identity() {
        this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);

        return this;
    }

    /**
     * Copies the entries of `m`.
     * @returns This matrix.
     */
    copy(m: Matrix3) {
        const te = this.elements;
        const me = m.elements;

        te[0] = me[0];
        te[1] = me[1];
        te[2] = me[2];
        te[3] = me[3];
        te[4] = me[4];
        te[5] = me[5];
        te[6] = me[6];
        te[7] = me[7];
        te[8] = me[8];

        return this;
    }

    /**
     * Writes the three columns of this matrix into `xAxis`, `yAxis` and `zAxis`.
     * @returns This matrix.
     */
    extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3) {
        xAxis.setFromMatrix3Column(this, 0);
        yAxis.setFromMatrix3Column(this, 1);
        zAxis.setFromMatrix3Column(this, 2);

        return this;
    }

    /**
     * Sets this matrix to the upper 3×3 of `m`.
     * @returns This matrix.
     */
    setFromMatrix4(m: Matrix4) {
        const me = m.elements;

        this.set(me[0], me[4], me[8], me[1], me[5], me[9], me[2], me[6], me[10]);

        return this;
    }

    /**
     * Sets this matrix to `this × m`.
     * @returns This matrix.
     */
    multiply(m: Matrix3) {
        return this.multiplyMatrices(this, m);
    }

    /**
     * Sets this matrix to `m × this`.
     * @returns This matrix.
     */
    premultiply(m: Matrix3) {
        return this.multiplyMatrices(m, this);
    }

    /**
     * Sets this matrix to `a × b`.
     * @returns This matrix.
     */
    multiplyMatrices(a: Matrix3, b: Matrix3) {
        const ae = a.elements;
        const be = b.elements;
        const te = this.elements;

        const a11 = ae[0],
            a12 = ae[3],
            a13 = ae[6];
        const a21 = ae[1],
            a22 = ae[4],
            a23 = ae[7];
        const a31 = ae[2],
            a32 = ae[5],
            a33 = ae[8];

        const b11 = be[0],
            b12 = be[3],
            b13 = be[6];
        const b21 = be[1],
            b22 = be[4],
            b23 = be[7];
        const b31 = be[2],
            b32 = be[5],
            b33 = be[8];

        te[0] = a11 * b11 + a12 * b21 + a13 * b31;
        te[3] = a11 * b12 + a12 * b22 + a13 * b32;
        te[6] = a11 * b13 + a12 * b23 + a13 * b33;

        te[1] = a21 * b11 + a22 * b21 + a23 * b31;
        te[4] = a21 * b12 + a22 * b22 + a23 * b32;
        te[7] = a21 * b13 + a22 * b23 + a23 * b33;

        te[2] = a31 * b11 + a32 * b21 + a33 * b31;
        te[5] = a31 * b12 + a32 * b22 + a33 * b32;
        te[8] = a31 * b13 + a32 * b23 + a33 * b33;

        return this;
    }

    /**
     * Multiplies every entry by `s`.
     * @returns This matrix.
     */
    multiplyScalar(s: number) {
        const te = this.elements;

        te[0] *= s;
        te[3] *= s;
        te[6] *= s;
        te[1] *= s;
        te[4] *= s;
        te[7] *= s;
        te[2] *= s;
        te[5] *= s;
        te[8] *= s;

        return this;
    }

    /** The determinant. */
    determinant() {
        const te = this.elements;

        const a = te[0],
            b = te[1],
            c = te[2],
            d = te[3],
            e = te[4],
            f = te[5],
            g = te[6],
            h = te[7],
            i = te[8];

        return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
    }

    /**
     * Inverts this matrix; a singular matrix becomes all zeros.
     * @returns This matrix.
     */
    invert() {
        const te = this.elements,
            n11 = te[0],
            n21 = te[1],
            n31 = te[2],
            n12 = te[3],
            n22 = te[4],
            n32 = te[5],
            n13 = te[6],
            n23 = te[7],
            n33 = te[8],
            t11 = n33 * n22 - n32 * n23,
            t12 = n32 * n13 - n33 * n12,
            t13 = n23 * n12 - n22 * n13,
            det = n11 * t11 + n21 * t12 + n31 * t13;

        if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);

        const detInv = 1 / det;

        te[0] = t11 * detInv;
        te[1] = (n31 * n23 - n33 * n21) * detInv;
        te[2] = (n32 * n21 - n31 * n22) * detInv;

        te[3] = t12 * detInv;
        te[4] = (n33 * n11 - n31 * n13) * detInv;
        te[5] = (n31 * n12 - n32 * n11) * detInv;

        te[6] = t13 * detInv;
        te[7] = (n21 * n13 - n23 * n11) * detInv;
        te[8] = (n22 * n11 - n21 * n12) * detInv;

        return this;
    }

    /**
     * Transposes this matrix.
     * @returns This matrix.
     */
    transpose() {
        let tmp;
        const m = this.elements;

        tmp = m[1];
        m[1] = m[3];
        m[3] = tmp;
        tmp = m[2];
        m[2] = m[6];
        m[6] = tmp;
        tmp = m[5];
        m[5] = m[7];
        m[7] = tmp;

        return this;
    }

    /**
     * Sets this matrix to the normal matrix of `matrix4`: the inverse transpose of its upper 3×3.
     * @returns This matrix.
     */
    getNormalMatrix(matrix4: Matrix4) {
        return this.setFromMatrix4(matrix4).invert().transpose();
    }

    /**
     * Writes the transpose of this matrix into `r`, leaving this matrix as it is.
     * @returns This matrix.
     */
    transposeIntoArray(r: number[]) {
        const m = this.elements;

        r[0] = m[0];
        r[1] = m[3];
        r[2] = m[6];
        r[3] = m[1];
        r[4] = m[4];
        r[5] = m[7];
        r[6] = m[2];
        r[7] = m[5];
        r[8] = m[8];

        return this;
    }

    /**
     * Sets this matrix to a UV transform: offset (`tx`, `ty`), repeat (`sx`, `sy`) and `rotation`
     * in radians about the centre (`cx`, `cy`).
     * @returns This matrix.
     */
    setUvTransform(tx: number, ty: number, sx: number, sy: number, rotation: number, cx: number, cy: number) {
        const c = Math.cos(rotation);
        const s = Math.sin(rotation);

        this.set(
            sx * c,
            sx * s,
            -sx * (c * cx + s * cy) + cx + tx,
            -sy * s,
            sy * c,
            -sy * (-s * cx + c * cy) + cy + ty,
            0,
            0,
            1
        );

        return this;
    }

    //

    /**
     * Scales this 2D transform by (`sx`, `sy`), applied after it.
     * @returns This matrix.
     */
    scale(sx: number, sy: number) {
        this.premultiply(_m3.makeScale(sx, sy));

        return this;
    }

    /**
     * Rotates this 2D transform clockwise by `theta` radians, applied after it.
     * @returns This matrix.
     */
    rotate(theta: number) {
        this.premultiply(_m3.makeRotation(-theta));

        return this;
    }

    /**
     * Translates this 2D transform by (`tx`, `ty`), applied after it.
     * @returns This matrix.
     */
    translate(tx: number, ty: number) {
        this.premultiply(_m3.makeTranslation(tx, ty));

        return this;
    }

    // for 2D Transforms

    /**
     * Sets this matrix to a 2D translation by (`x`, `y`), or by a {@link Vector2} given as `x`.
     * @returns This matrix.
     */
    makeTranslation(x: number | Vector2, y: number) {
        if (typeof x === 'number') {
            this.set(1, 0, x, 0, 1, y, 0, 0, 1);
        } else {
            this.set(1, 0, x.x, 0, 1, x.y, 0, 0, 1);
        }

        return this;
    }

    /**
     * Sets this matrix to a counterclockwise 2D rotation by `theta` radians.
     * @returns This matrix.
     */
    makeRotation(theta: number) {
        // counterclockwise

        const c = Math.cos(theta);
        const s = Math.sin(theta);

        this.set(c, -s, 0, s, c, 0, 0, 0, 1);

        return this;
    }

    /**
     * Sets this matrix to a 2D scale by (`x`, `y`).
     * @returns This matrix.
     */
    makeScale(x: number, y: number) {
        this.set(x, 0, 0, 0, y, 0, 0, 0, 1);

        return this;
    }

    //

    /** Whether every entry equals the matching entry of `matrix` exactly. */
    equals(matrix: Matrix3) {
        const te = this.elements;
        const me = matrix.elements;

        for (let i = 0; i < 9; i++) {
            if (te[i] !== me[i]) return false;
        }

        return true;
    }

    /**
     * Reads the nine entries, column-major, from `array` starting at `offset`.
     * @returns This matrix.
     */
    fromArray(array: number[], offset = 0) {
        for (let i = 0; i < 9; i++) {
            this.elements[i] = array[i + offset];
        }

        return this;
    }

    /**
     * Writes the nine entries, column-major, into `array` starting at `offset`.
     * @returns The array, a new one when none is given.
     */
    toArray(array: number[] = [], offset = 0) {
        const te = this.elements;

        array[offset] = te[0];
        array[offset + 1] = te[1];
        array[offset + 2] = te[2];

        array[offset + 3] = te[3];
        array[offset + 4] = te[4];
        array[offset + 5] = te[5];

        array[offset + 6] = te[6];
        array[offset + 7] = te[7];
        array[offset + 8] = te[8];

        return array;
    }

    /** A new matrix with the same entries. */
    clone() {
        return new Matrix3().fromArray(this.elements);
    }
}

Object.defineProperty(Matrix3.prototype, 'isMatrix3', {value: true});

const _m3 = /*@__PURE__*/ new Matrix3();

export {Matrix3};
