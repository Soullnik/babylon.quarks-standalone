import {Euler, Matrix3, Matrix4, Quaternion, Vector2, Vector3, Vector4} from '../../src';
import {setRandomSource} from '../../src/util/random';

const close = (actual: {toArray(): number[]}, expected: number[], digits = 6) =>
    actual.toArray().forEach((value, i) => expect(value).toBeCloseTo(expected[i], digits));

/**
 * The methods every vector class shares, checked against the same arithmetic per component, so
 * Vector2, Vector3 and Vector4 are held to one contract.
 */
describe.each([
    ['Vector2', 2, (...c: number[]) => new Vector2(c[0], c[1])],
    ['Vector3', 3, (...c: number[]) => new Vector3(c[0], c[1], c[2])],
    ['Vector4', 4, (...c: number[]) => new Vector4(c[0], c[1], c[2], c[3])],
] as const)('%s', (_name, n, make) => {
    type V = Vector2 & Vector3 & Vector4;
    const v = (...c: number[]) => make(...c) as unknown as V;
    const a = [1, -2, 3, -4].slice(0, n);
    const b = [0.5, 4, -1.5, 2].slice(0, n);

    it('sets, reads and copies components', () => {
        const x = v(...a);
        expect(x.toArray()).toEqual(a);
        expect([...x]).toEqual(a);
        for (let i = 0; i < n; i++) expect(x.getComponent(i)).toBe(a[i]);
        x.setScalar(7);
        expect(x.toArray()).toEqual(Array(n).fill(7));
        for (let i = 0; i < n; i++) x.setComponent(i, i + 1);
        expect(x.toArray()).toEqual([1, 2, 3, 4].slice(0, n));
        expect(() => x.setComponent(n, 0)).toThrow();
        expect(() => x.getComponent(n)).toThrow();
        x.setX(9).setY(8);
        expect(x.x).toBe(9);
        expect(x.y).toBe(8);
        const y = x.clone();
        expect(y).not.toBe(x);
        expect(y.equals(x)).toBe(true);
        expect(
            v(...b)
                .copy(x)
                .equals(x)
        ).toBe(true);
        expect(
            v()
                .fromArray([0, ...a], 1)
                .toArray()
        ).toEqual(a);
        expect(x.toArray([0], 1).slice(1)).toEqual(y.toArray());
    });

    it('adds, subtracts, multiplies and divides per component', () => {
        expect(
            v(...a)
                .add(v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => x + b[i]));
        expect(
            v(...a)
                .addScalar(2)
                .toArray()
        ).toEqual(a.map((x) => x + 2));
        expect(
            v()
                .addVectors(v(...a), v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => x + b[i]));
        expect(
            v(...a)
                .addScaledVector(v(...b), 2)
                .toArray()
        ).toEqual(a.map((x, i) => x + 2 * b[i]));
        expect(
            v(...a)
                .sub(v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => x - b[i]));
        expect(
            v(...a)
                .subScalar(2)
                .toArray()
        ).toEqual(a.map((x) => x - 2));
        expect(
            v()
                .subVectors(v(...a), v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => x - b[i]));
        expect(
            v(...a)
                .multiply(v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => x * b[i]));
        expect(
            v(...a)
                .multiplyScalar(3)
                .toArray()
        ).toEqual(a.map((x) => x * 3));
        expect(
            v(...a)
                .divideScalar(2)
                .toArray()
        ).toEqual(a.map((x) => x / 2));
        if (n !== 4) {
            expect(
                v(...a)
                    .divide(v(...b))
                    .toArray()
            ).toEqual(a.map((x, i) => x / b[i]));
        }
        expect(
            v(...a)
                .negate()
                .toArray()
        ).toEqual(a.map((x) => -x));
    });

    it('takes per-component minima, maxima and clamps', () => {
        expect(
            v(...a)
                .min(v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => Math.min(x, b[i])));
        expect(
            v(...a)
                .max(v(...b))
                .toArray()
        ).toEqual(a.map((x, i) => Math.max(x, b[i])));
        const lo = v(...Array(n).fill(-1));
        const hi = v(...Array(n).fill(2));
        expect(
            v(...a)
                .clamp(lo, hi)
                .toArray()
        ).toEqual(a.map((x) => Math.min(2, Math.max(-1, x))));
        expect(
            v(...a)
                .clampScalar(-1, 2)
                .toArray()
        ).toEqual(a.map((x) => Math.min(2, Math.max(-1, x))));
    });

    it('rounds per component', () => {
        const c = [1.5, -1.5, 2.4, -2.6].slice(0, n);
        expect(
            v(...c)
                .floor()
                .toArray()
        ).toEqual(c.map(Math.floor));
        expect(
            v(...c)
                .ceil()
                .toArray()
        ).toEqual(c.map(Math.ceil));
        expect(
            v(...c)
                .round()
                .toArray()
        ).toEqual(c.map(Math.round));
        expect(
            v(...c)
                .roundToZero()
                .toArray()
        ).toEqual(c.map(Math.trunc));
    });

    it('measures lengths and dot products', () => {
        const dot = a.reduce((s, x, i) => s + x * b[i], 0);
        const lengthSq = a.reduce((s, x) => s + x * x, 0);
        expect(v(...a).dot(v(...b))).toBe(dot);
        expect(v(...a).lengthSq()).toBe(lengthSq);
        expect(v(...a).length()).toBeCloseTo(Math.sqrt(lengthSq));
        expect(v(...a).manhattanLength()).toBe(a.reduce((s, x) => s + Math.abs(x), 0));
        expect(
            v(...a)
                .normalize()
                .length()
        ).toBeCloseTo(1);
        expect(v(0, 0, 0, 0).normalize().toArray()).toEqual(Array(n).fill(0));
        expect(
            v(...a)
                .setLength(5)
                .length()
        ).toBeCloseTo(5);
        expect(
            v(...a)
                .clampLength(0, 1)
                .length()
        ).toBeCloseTo(1);
        expect(
            v(...a)
                .clampLength(10, 20)
                .length()
        ).toBeCloseTo(10);
        const short = v(...a)
            .normalize()
            .multiplyScalar(0.5);
        close(short.clone().clampLength(0, 1), short.toArray());
    });

    it('interpolates', () => {
        expect(
            v(...a)
                .lerp(v(...b), 0.25)
                .toArray()
        ).toEqual(a.map((x, i) => x + (b[i] - x) * 0.25));
        expect(
            v()
                .lerpVectors(v(...a), v(...b), 0.75)
                .toArray()
        ).toEqual(a.map((x, i) => x + (b[i] - x) * 0.75));
    });

    it('draws random components in [0, 1) from the library random source', () => {
        const values = [0.25, 0.5, 0.75, 0.125];
        let i = 0;
        const previous = setRandomSource(() => values[i++ % values.length]);
        try {
            expect(v().random().toArray()).toEqual(values.slice(0, n));
        } finally {
            setRandomSource(previous ?? null);
        }
    });
});

describe('Vector2', () => {
    it('aliases width and height, and reads as a 2D vector', () => {
        const v = new Vector2(3, 4);
        expect([v.width, v.height]).toEqual([3, 4]);
        v.width = 5;
        v.height = 6;
        expect([v.x, v.y]).toEqual([5, 6]);
        expect(v.isVector2).toBe(true);
    });

    it('measures angles, cross products and distances', () => {
        expect(new Vector2(0, 1).angle()).toBeCloseTo(Math.PI / 2);
        expect(new Vector2(0, -1).angle()).toBeCloseTo((3 * Math.PI) / 2);
        expect(new Vector2(1, 0).angleTo(new Vector2(0, 2))).toBeCloseTo(Math.PI / 2);
        expect(new Vector2().angleTo(new Vector2(1, 0))).toBeCloseTo(Math.PI / 2);
        expect(new Vector2(1, 0).cross(new Vector2(0, 1))).toBe(1);
        expect(new Vector2(1, 1).distanceTo(new Vector2(4, 5))).toBe(5);
        expect(new Vector2(1, 1).distanceToSquared(new Vector2(4, 5))).toBe(25);
        expect(new Vector2(1, 1).manhattanDistanceTo(new Vector2(4, 5))).toBe(7);
    });

    it('rotates around a centre and applies a 3×3 matrix as a point', () => {
        close(new Vector2(2, 1).rotateAround(new Vector2(1, 1), Math.PI / 2), [1, 2]);
        close(new Vector2(1, 2).applyMatrix3(new Matrix3().makeTranslation(3, 4)), [4, 6]);
    });
});

describe('Vector3', () => {
    it('reads as a 3D vector', () => {
        expect(new Vector3().isVector3).toBe(true);
    });

    it('crosses, projects and reflects', () => {
        close(new Vector3(1, 0, 0).cross(new Vector3(0, 1, 0)), [0, 0, 1]);
        close(new Vector3().crossVectors(new Vector3(0, 1, 0), new Vector3(0, 0, 1)), [1, 0, 0]);
        close(new Vector3(2, 3, 4).projectOnVector(new Vector3(0, 5, 0)), [0, 3, 0]);
        close(new Vector3(2, 3, 4).projectOnVector(new Vector3()), [0, 0, 0]);
        close(new Vector3(2, 3, 4).projectOnPlane(new Vector3(0, 1, 0)), [2, 0, 4]);
        close(new Vector3(1, -1, 0).reflect(new Vector3(0, 1, 0)), [1, 1, 0]);
    });

    it('measures angles and distances', () => {
        expect(new Vector3(1, 0, 0).angleTo(new Vector3(0, 0, 3))).toBeCloseTo(Math.PI / 2);
        expect(new Vector3(1, 0, 0).angleTo(new Vector3(-1, 0, 0))).toBeCloseTo(Math.PI);
        expect(new Vector3().angleTo(new Vector3(1, 0, 0))).toBeCloseTo(Math.PI / 2);
        expect(new Vector3(1, 2, 3).distanceTo(new Vector3(1, 6, 6))).toBe(5);
        expect(new Vector3(1, 2, 3).distanceToSquared(new Vector3(1, 6, 6))).toBe(25);
        expect(new Vector3(1, 2, 3).manhattanDistanceTo(new Vector3(0, 0, 0))).toBe(6);
        close(new Vector3(-1, 2, -3).abs(), [1, 2, 3]);
    });

    it('rotates by Euler angles, axis and angle, quaternions and matrices alike', () => {
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
        close(new Vector3(1, 0, 0).applyQuaternion(q), [0, 1, 0]);
        close(new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 0, 1), Math.PI / 2), [0, 1, 0]);
        close(new Vector3(1, 0, 0).applyEuler(new Euler(0, 0, Math.PI / 2)), [0, 1, 0]);
        const m3 = new Matrix3().setFromMatrix4(new Matrix4().makeRotationZ(Math.PI / 2));
        close(new Vector3(1, 0, 0).applyMatrix3(m3), [0, 1, 0]);
        close(new Vector3(2, 0, 0).applyNormalMatrix(m3), [0, 1, 0]);
    });

    it('transforms points with the perspective divide and directions without translation', () => {
        const m = new Matrix4().makeTranslation(1, 2, 3);
        close(new Vector3(1, 1, 1).applyMatrix4(m), [2, 3, 4]);
        close(new Vector3(0, 0, 2).transformDirection(m), [0, 0, 1]);
        const perspective = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 10);
        const p = new Vector3(0.5, 0.5, -1).applyMatrix4(perspective);
        close(p, [0.5, 0.5, -1]);
    });

    it('reads positions, scales and columns out of matrices', () => {
        const m = new Matrix4().compose(
            new Vector3(1, 2, 3),
            new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5),
            new Vector3(2, 3, 4)
        );
        close(new Vector3().setFromMatrixPosition(m), [1, 2, 3]);
        close(new Vector3().setFromMatrixScale(m), [2, 3, 4]);
        expect(new Vector3().setFromMatrixColumn(m, 1).length()).toBeCloseTo(3);
        close(new Vector3().setFromMatrix3Column(new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9), 2), [3, 6, 9]);
        close(new Vector3().setFromEuler(new Euler(0.1, 0.2, 0.3)), [0.1, 0.2, 0.3]);
    });

    it('sets itself from spherical and cylindrical coordinates', () => {
        close(new Vector3().setFromSphericalCoords(2, 0, 0), [0, 2, 0]);
        close(new Vector3().setFromSphericalCoords(2, Math.PI / 2, 0), [0, 0, 2]);
        close(new Vector3().setFromSphericalCoords(2, Math.PI / 2, Math.PI / 2), [2, 0, 0]);
        close(new Vector3().setFromCylindricalCoords(2, Math.PI / 2, 5), [2, 5, 0]);
    });

    it('draws a unit direction at random', () => {
        for (let i = 0; i < 20; i++) {
            expect(new Vector3().randomDirection().length()).toBeCloseTo(1);
        }
    });
});

describe('Vector4', () => {
    it('aliases width and height to z and w, and defaults w to 1', () => {
        const v = new Vector4(1, 2, 3, 4);
        expect([v.width, v.height]).toEqual([3, 4]);
        v.width = 5;
        v.height = 6;
        expect([v.z, v.w]).toEqual([5, 6]);
        expect(new Vector4().w).toBe(1);
        expect(v.isVector4).toBe(true);
        v.setZ(7).setW(8);
        expect([v.z, v.w]).toEqual([7, 8]);
    });

    it('multiplies by a 4×4 matrix without a divide', () => {
        close(new Vector4(1, 1, 1, 1).applyMatrix4(new Matrix4().makeTranslation(1, 2, 3)), [2, 3, 4, 1]);
        close(new Vector4(1, 1, 1, 0).applyMatrix4(new Matrix4().makeTranslation(1, 2, 3)), [1, 1, 1, 0]);
    });

    it('reads an axis and angle out of quaternions and rotation matrices', () => {
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.2);
        close(new Vector4().setAxisAngleFromQuaternion(q), [0, 1, 0, 1.2]);
        close(new Vector4().setAxisAngleFromQuaternion(new Quaternion()), [1, 0, 0, 0]);
        const m = new Matrix4().makeRotationAxis(new Vector3(0, 0, 1), 0.7);
        close(new Vector4().setAxisAngleFromRotationMatrix(m), [0, 0, 1, 0.7]);
        close(new Vector4().setAxisAngleFromRotationMatrix(new Matrix4()), [1, 0, 0, 0]);
        const half = new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI);
        close(new Vector4().setAxisAngleFromRotationMatrix(half), [1, 0, 0, Math.PI]);
    });
});
