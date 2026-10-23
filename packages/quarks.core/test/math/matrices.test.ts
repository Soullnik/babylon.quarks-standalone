import {
    Euler,
    Matrix3,
    Matrix4,
    Quaternion,
    Vector2,
    Vector3,
    WebGLCoordinateSystem,
    WebGPUCoordinateSystem,
} from '../../src';

const close = (actual: number[], expected: number[], digits = 6) =>
    expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('Matrix3', () => {
    const m = () => new Matrix3().set(2, 0, 1, 1, 3, 0, 0, 1, 4);

    it('stores row-major input column-major, and copies', () => {
        expect(new Matrix3().elements).toEqual(IDENTITY3);
        expect(new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9).elements).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
        expect(m().isMatrix3).toBe(true);
        expect(m().clone().equals(m())).toBe(true);
        expect(new Matrix3().copy(m()).equals(m())).toBe(true);
        expect(new Matrix3().fromArray([0, ...m().elements], 1).equals(m())).toBe(true);
        expect(m().toArray([0], 1).slice(1)).toEqual(m().elements);
        expect(m().identity().elements).toEqual(IDENTITY3);
        expect(m().equals(new Matrix3())).toBe(false);
    });

    it('multiplies, inverts and transposes', () => {
        const a = m();
        expect(a.determinant()).toBe(25);
        close(a.clone().multiply(a.clone().invert()).elements, IDENTITY3);
        close(a.clone().invert().premultiply(a).elements, IDENTITY3);
        expect(new Matrix3().set(1, 2, 3, 2, 4, 6, 0, 0, 1).invert().elements).toEqual(Array(9).fill(0));
        expect(a.clone().transpose().transpose().equals(a)).toBe(true);
        const r: number[] = [];
        a.transposeIntoArray(r);
        expect(r).toEqual(a.clone().transpose().elements);
        expect(a.clone().multiplyScalar(2).elements).toEqual(a.elements.map((x) => x * 2));
        const b = new Matrix3().set(0, 1, 0, 1, 0, 0, 0, 0, 1);
        expect(new Matrix3().multiplyMatrices(a, b).equals(a.clone().multiply(b))).toBe(true);
    });

    it('takes the upper 3×3 and the normal matrix of a 4×4', () => {
        const m4 = new Matrix4().makeScale(2, 4, 8).setPosition(5, 6, 7);
        expect(new Matrix3().setFromMatrix4(m4).elements).toEqual([2, 0, 0, 0, 4, 0, 0, 0, 8]);
        close(new Matrix3().getNormalMatrix(m4).elements, [0.5, 0, 0, 0, 0.25, 0, 0, 0, 0.125]);
        const x = new Vector3();
        const y = new Vector3();
        const z = new Vector3();
        m().extractBasis(x, y, z);
        expect([x.toArray(), y.toArray(), z.toArray()]).toEqual([
            [2, 1, 0],
            [0, 3, 1],
            [1, 0, 4],
        ]);
    });

    it('builds and composes 2D transforms', () => {
        const point = (matrix: Matrix3, x: number, y: number) => new Vector2(x, y).applyMatrix3(matrix).toArray();
        close(point(new Matrix3().makeTranslation(3, 4), 1, 1), [4, 5]);
        close(point(new Matrix3().makeTranslation(new Vector2(3, 4), 0), 1, 1), [4, 5]);
        close(point(new Matrix3().makeRotation(Math.PI / 2), 1, 0), [0, 1]);
        close(point(new Matrix3().makeScale(2, 3), 1, 1), [2, 3]);
        close(point(new Matrix3().translate(1, 0).scale(2, 2), 1, 0), [4, 0]);
        close(point(new Matrix3().rotate(Math.PI / 2), 1, 0), [0, -1]);
        // A UV transform: repeat 2, offset 0.25, no rotation.
        close(point(new Matrix3().setUvTransform(0.25, 0, 2, 2, 0, 0, 0), 0.5, 0.5), [1.25, 1]);
        close(point(new Matrix3().setUvTransform(0, 0, 1, 1, Math.PI, 0.5, 0.5), 0, 0), [1, 1]);
    });
});

describe('Matrix4', () => {
    const trs = () =>
        new Matrix4().compose(
            new Vector3(1, 2, 3),
            new Quaternion().setFromEuler(new Euler(0.3, -0.4, 0.5)),
            new Vector3(2, 3, 4)
        );

    it('stores row-major input column-major, and copies', () => {
        expect(new Matrix4().elements).toEqual(IDENTITY4);
        const m = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
        expect(m.elements.slice(0, 4)).toEqual([1, 5, 9, 13]);
        expect(m.isMatrix4).toBe(true);
        expect(m.clone().equals(m)).toBe(true);
        expect(new Matrix4().copy(m).equals(m)).toBe(true);
        expect(new Matrix4().fromArray([0, ...m.elements], 1).equals(m)).toBe(true);
        expect(m.toArray([0], 1).slice(1)).toEqual(m.elements);
        expect(m.clone().transpose().elements.slice(0, 4)).toEqual([1, 2, 3, 4]);
        expect(m.clone().identity().elements).toEqual(IDENTITY4);
        expect(m.clone().multiplyScalar(2).elements).toEqual(m.elements.map((x) => x * 2));
    });

    it('composes and decomposes a transform', () => {
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        trs().decompose(position, quaternion, scale);
        close(position.toArray(), [1, 2, 3]);
        close(scale.toArray(), [2, 3, 4]);
        expect(Math.abs(quaternion.dot(new Quaternion().setFromEuler(new Euler(0.3, -0.4, 0.5))))).toBeCloseTo(1);
        // A mirrored matrix decomposes with a negative x scale.
        new Matrix4().makeScale(-1, 1, 1).decompose(position, quaternion, scale);
        close(scale.toArray(), [-1, 1, 1]);
        expect(trs().getMaxScaleOnAxis()).toBeCloseTo(4);
    });

    it('inverts, and zeroes a singular matrix', () => {
        const m = trs();
        close(m.clone().multiply(m.clone().invert()).elements, IDENTITY4);
        close(m.clone().invert().premultiply(m).elements, IDENTITY4);
        expect(new Matrix4().makeScale(0, 1, 1).invert().elements).toEqual(Array(16).fill(0));
        expect(m.determinant()).toBeCloseTo(24);
        expect(new Matrix4().multiplyMatrices(m, m).equals(m.clone().multiply(m))).toBe(true);
    });

    it('copies, sets and reads positions, bases and rotations', () => {
        const m = trs();
        close(new Matrix4().copyPosition(m).elements.slice(12), [1, 2, 3, 1]);
        close(new Matrix4().setPosition(new Vector3(4, 5, 6)).elements.slice(12), [4, 5, 6, 1]);
        close(new Matrix4().setPosition(4, 5, 6).elements.slice(12), [4, 5, 6, 1]);
        const rotation = new Matrix4().extractRotation(m);
        expect(
            new Vector3()
                .setFromMatrixScale(rotation)
                .toArray()
                .map((v) => +v.toFixed(6))
        ).toEqual([1, 1, 1]);
        close(rotation.elements.slice(12), [0, 0, 0, 1]);
        const x = new Vector3();
        const y = new Vector3();
        const z = new Vector3();
        rotation.extractBasis(x, y, z);
        close(new Matrix4().makeBasis(x, y, z).elements, rotation.elements);
        close(new Matrix4().setFromMatrix3(new Matrix3().setFromMatrix4(rotation)).elements, rotation.elements);
        close(
            new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromRotationMatrix(rotation)).elements,
            rotation.elements
        );
        close(new Matrix4().scale(new Vector3(2, 3, 4)).elements, [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]);
    });

    it('builds translations, rotations, scales and shears', () => {
        const point = (matrix: Matrix4, x: number, y: number, z: number) =>
            new Vector3(x, y, z).applyMatrix4(matrix).toArray();
        close(point(new Matrix4().makeTranslation(1, 2, 3), 0, 0, 0), [1, 2, 3]);
        close(point(new Matrix4().makeTranslation(new Vector3(1, 2, 3)), 0, 0, 0), [1, 2, 3]);
        close(point(new Matrix4().makeRotationX(Math.PI / 2), 0, 1, 0), [0, 0, 1]);
        close(point(new Matrix4().makeRotationY(Math.PI / 2), 0, 0, 1), [1, 0, 0]);
        close(point(new Matrix4().makeRotationZ(Math.PI / 2), 1, 0, 0), [0, 1, 0]);
        close(point(new Matrix4().makeRotationAxis(new Vector3(0, 0, 1), Math.PI / 2), 1, 0, 0), [0, 1, 0]);
        close(point(new Matrix4().makeScale(2, 3, 4), 1, 1, 1), [2, 3, 4]);
        // xy: how much x adds to y.
        close(point(new Matrix4().makeShear(1, 0, 0, 0, 0, 0), 1, 0, 0), [1, 1, 0]);
        close(point(new Matrix4().makeShear(0, 0, 0, 0, 0, 2), 0, 0, 1), [0, 2, 1]);
    });

    it('agrees with the quaternion form of an Euler rotation in every order', () => {
        for (const order of ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'] as const) {
            const euler = new Euler(0.5, -0.3, 0.8, order);
            const fromEuler = new Matrix4().makeRotationFromEuler(euler);
            const fromQuaternion = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(euler));
            close(fromEuler.elements, fromQuaternion.elements);
        }
    });

    it('points its z axis from the target to the eye', () => {
        const m = new Matrix4().lookAt(new Vector3(0, 0, 5), new Vector3(), new Vector3(0, 1, 0));
        close(new Vector3().setFromMatrixColumn(m, 2).toArray(), [0, 0, 1]);
        const same = new Matrix4().lookAt(new Vector3(), new Vector3(), new Vector3(0, 1, 0));
        close(new Vector3().setFromMatrixColumn(same, 2).toArray(), [0, 0, 1]);
        const up = new Matrix4().lookAt(new Vector3(0, 5, 0), new Vector3(), new Vector3(0, 1, 0));
        expect(new Vector3().setFromMatrixColumn(up, 0).length()).toBeCloseTo(1);
    });

    it('builds projections for WebGL and WebGPU clip space', () => {
        const near = new Vector3(0, 0, -1);
        const far = new Vector3(0, 0, -10);
        const gl = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 10, WebGLCoordinateSystem);
        expect(near.clone().applyMatrix4(gl).z).toBeCloseTo(-1);
        expect(far.clone().applyMatrix4(gl).z).toBeCloseTo(1);
        const gpu = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 10, WebGPUCoordinateSystem);
        expect(near.clone().applyMatrix4(gpu).z).toBeCloseTo(0);
        expect(far.clone().applyMatrix4(gpu).z).toBeCloseTo(1);
        const ortho = new Matrix4().makeOrthographic(-2, 2, 2, -2, 1, 10);
        expect(near.clone().applyMatrix4(ortho).z).toBeCloseTo(-1);
        close(new Vector3(2, 2, -1).applyMatrix4(ortho).toArray(), [1, 1, -1]);
        const orthoGpu = new Matrix4().makeOrthographic(-2, 2, 2, -2, 1, 10, WebGPUCoordinateSystem);
        expect(far.clone().applyMatrix4(orthoGpu).z).toBeCloseTo(1);
        expect(() => new Matrix4().makePerspective(-1, 1, 1, -1, 1, 10, 0)).toThrow();
        expect(() => new Matrix4().makeOrthographic(-1, 1, 1, -1, 1, 10, 0)).toThrow();
    });
});

describe('a singular matrix', () => {
    it('inverts to all zeros', () => {
        const m3 = new Matrix3().set(1, 2, 3, 2, 4, 6, 0, 1, 1);
        expect(m3.invert().elements).toEqual(new Array(9).fill(0));
        const m4 = new Matrix4().makeScale(1, 0, 1);
        expect(m4.invert().elements).toEqual(new Array(16).fill(0));
    });
});
