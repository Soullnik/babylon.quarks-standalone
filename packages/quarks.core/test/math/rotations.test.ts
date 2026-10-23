import {Euler, EulerOrder, Matrix4, Quaternion, QuaternionView, Vector3} from '../../src';
import {setRandomSource} from '../../src/util/random';

const close = (actual: {toArray(): unknown[]}, expected: number[], digits = 6) =>
    expected.forEach((value, i) => expect(actual.toArray()[i] as number).toBeCloseTo(value, digits));
/** Whether two quaternions are the same rotation (q and -q are). */
const sameRotation = (a: Quaternion, b: Quaternion) => expect(Math.abs(a.dot(b))).toBeCloseTo(1, 6);

const ORDERS: EulerOrder[] = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'];

describe('Quaternion', () => {
    it('defaults to the identity and reads its components through accessors', () => {
        const q = new Quaternion();
        expect(q.toArray()).toEqual([0, 0, 0, 1]);
        expect([...q]).toEqual([0, 0, 0, 1]);
        expect(q.isQuaternion).toBe(true);
        q.x = 1;
        q.y = 2;
        q.z = 3;
        q.w = 4;
        expect([q.x, q.y, q.z, q.w]).toEqual([1, 2, 3, 4]);
        expect(q.toJSON()).toEqual([1, 2, 3, 4]);
        expect(q.clone().equals(q)).toBe(true);
        expect(new Quaternion().copy(q).equals(q)).toBe(true);
        expect(new Quaternion().fromArray([9, 1, 2, 3, 4], 1).equals(q)).toBe(true);
        expect(q.toArray([0], 1)).toEqual([0, 1, 2, 3, 4]);
        expect(q.identity().toArray()).toEqual([0, 0, 0, 1]);
    });

    it('calls its change listener on every change', () => {
        const q = new Quaternion();
        const listener = jest.fn();
        q._onChange(listener);
        q.x = 1;
        q.set(0, 0, 0, 1);
        q.setFromAxisAngle(new Vector3(0, 1, 0), 1);
        q.normalize();
        expect(listener).toHaveBeenCalledTimes(4);
    });

    it('normalizes, and turns zero into the identity', () => {
        expect(new Quaternion(0, 0, 3, 4).normalize().length()).toBeCloseTo(1);
        expect(new Quaternion(0, 0, 0, 0).normalize().toArray()).toEqual([0, 0, 0, 1]);
        expect(new Quaternion(1, 2, 2, 4).lengthSq()).toBe(25);
    });

    it('inverts a rotation by its conjugate', () => {
        const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.8);
        const v = new Vector3(0, 1, 0).applyQuaternion(q).applyQuaternion(q.clone().invert());
        close(v, [0, 1, 0]);
        close(q.clone().conjugate(), [-q.x, -q.y, -q.z, q.w]);
    });

    it('agrees with the matrix and Euler forms of the same rotation in every order', () => {
        for (const order of ORDERS) {
            const euler = new Euler(0.3, -0.7, 1.1, order);
            const q = new Quaternion().setFromEuler(euler);
            const m = new Matrix4().makeRotationFromEuler(euler);
            sameRotation(new Quaternion().setFromRotationMatrix(m), q);
            const back = new Euler().setFromQuaternion(q, order);
            close(back, [0.3, -0.7, 1.1]);
            expect(back.order).toBe(order);
        }
    });

    it('reads every branch of a rotation matrix', () => {
        for (const [axis, angle] of [
            [new Vector3(1, 0, 0), Math.PI * 0.9],
            [new Vector3(0, 1, 0), Math.PI * 0.9],
            [new Vector3(0, 0, 1), Math.PI * 0.9],
            [new Vector3(1, 1, 1).normalize(), 0.4],
        ] as const) {
            const expected = new Quaternion().setFromAxisAngle(axis, angle);
            sameRotation(new Quaternion().setFromRotationMatrix(new Matrix4().makeRotationAxis(axis, angle)), expected);
        }
    });

    it('turns one unit vector into another along the shortest arc, opposite ones included', () => {
        const from = new Vector3(1, 0, 0);
        for (const to of [new Vector3(0, 1, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(1, 0, 0)]) {
            const q = new Quaternion().setFromUnitVectors(from, to);
            close(from.clone().applyQuaternion(q), to.toArray());
        }
        const back = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, 0, -1));
        close(new Vector3(0, 0, 1).applyQuaternion(back), [0, 0, -1]);
    });

    it('measures angles, rotates toward a target and slerps along the shorter arc', () => {
        const a = new Quaternion();
        const b = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1);
        expect(a.angleTo(b)).toBeCloseTo(1);
        expect(a.clone().rotateTowards(b, 0.25).angleTo(b)).toBeCloseTo(0.75);
        expect(a.clone().rotateTowards(b, 5).angleTo(b)).toBeCloseTo(0);
        expect(b.clone().rotateTowards(b, 1).equals(b)).toBe(true);
        expect(a.clone().slerp(b, 0.5).angleTo(b)).toBeCloseTo(0.5);
        expect(a.clone().slerp(b, 0).equals(a)).toBe(true);
        expect(a.clone().slerp(b, 1).equals(b)).toBe(true);
        const negated = new Quaternion(-b.x, -b.y, -b.z, -b.w);
        expect(a.clone().slerp(negated, 0.5).angleTo(b)).toBeCloseTo(0.5);
        expect(new Quaternion().slerpQuaternions(a, b, 0.25).angleTo(a)).toBeCloseTo(0.25);
        const nearly = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1e-9);
        expect(a.clone().slerp(nearly, 0.5).length()).toBeCloseTo(1);
    });

    it('multiplies in the order its names say', () => {
        const x = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
        const z = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
        const v = new Vector3(0, 1, 0);
        // x.multiply(z): z first, then x.
        close(
            v.clone().applyQuaternion(x.clone().multiply(z)),
            v.clone().applyQuaternion(z).applyQuaternion(x).toArray()
        );
        close(
            v.clone().applyQuaternion(x.clone().premultiply(z)),
            v.clone().applyQuaternion(x).applyQuaternion(z).toArray()
        );
        sameRotation(new Quaternion().multiplyQuaternions(x, z), x.clone().multiply(z));
    });

    it('works on flat arrays without allocating', () => {
        const a = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
        const b = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.3);
        const src0 = a.toArray();
        const src1 = b.toArray();
        const dst: number[] = [0, 0, 0, 0, 0];
        Quaternion.multiplyQuaternionsFlat(dst, 1, src0, 0, src1, 0);
        close(new Quaternion().fromArray(dst, 1), a.clone().multiply(b).toArray());
        for (const t of [0, 0.3, 1]) {
            Quaternion.slerpFlat(dst, 0, src0, 0, src1, 0, t);
            sameRotation(new Quaternion().fromArray(dst), a.clone().slerp(b, t));
        }
        const negated = b.toArray().map((value) => -value);
        Quaternion.slerpFlat(dst, 0, src0, 0, negated, 0, 0.5);
        sameRotation(new Quaternion().fromArray(dst), a.clone().slerp(b, 0.5));
    });

    it('draws a unit rotation from the library random source', () => {
        const previous = setRandomSource(() => 0.3);
        try {
            expect(new Quaternion().random().length()).toBeCloseTo(1);
        } finally {
            setRandomSource(previous ?? null);
        }
    });

    it('warns on an Euler order it cannot convert and keeps its value', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const q = new Quaternion(0, 0, 0, 1);
            q.setFromEuler(new Euler(1, 2, 3, 'XYX'));
            expect(q.toArray()).toEqual([0, 0, 0, 1]);
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('QuaternionView', () => {
    it('reads and writes its components in a shared array', () => {
        const data = new Float32Array(8);
        const view = new QuaternionView(data, 4);
        view.set(0.5, 0.5, 0.5, 0.5);
        expect(Array.from(data.slice(4))).toEqual([0.5, 0.5, 0.5, 0.5]);
        expect(view.length()).toBeCloseTo(1);
        data[4] = 0;
        expect(view.x).toBe(0);
        view.bind(data, 0);
        expect(view.toArray()).toEqual([0, 0, 0, 0]);
    });
});

describe('Euler', () => {
    it('stores angles and an order, and reads them back', () => {
        const e = new Euler(1, 2, 3, 'ZYX');
        expect([...e]).toEqual([1, 2, 3, 'ZYX']);
        expect(e.toArray()).toEqual([1, 2, 3, 'ZYX']);
        expect(e.isEuler).toBe(true);
        expect(new Euler().order).toBe(Euler.DEFAULT_ORDER);
        expect(e.clone().equals(e)).toBe(true);
        expect(new Euler().copy(e).equals(e)).toBe(true);
        expect(new Euler().fromArray([1, 2, 3]).order).toBe('XYZ');
        expect(new Euler().fromArray([1, 2, 3, 'YXZ']).equals(new Euler(1, 2, 3, 'YXZ'))).toBe(true);
        e.x = 4;
        e.y = 5;
        e.z = 6;
        e.order = 'XZY';
        expect(e.toArray()).toEqual([4, 5, 6, 'XZY']);
        expect(new Euler().setFromVector3(new Vector3(1, 2, 3), 'YZX').toArray()).toEqual([1, 2, 3, 'YZX']);
    });

    it('calls its change listener on every change', () => {
        const e = new Euler();
        const listener = jest.fn();
        e._onChange(listener);
        e.x = 1;
        e.order = 'YXZ';
        e.set(1, 2, 3);
        e.copy(new Euler());
        e.fromArray([1, 2, 3]);
        expect(listener).toHaveBeenCalledTimes(5);
    });

    it('reads a rotation matrix in every order, gimbal lock included', () => {
        for (const order of ORDERS) {
            const e = new Euler(0.2, 0.4, -0.6, order);
            const m = new Matrix4().makeRotationFromEuler(e);
            close(new Euler().setFromRotationMatrix(m, order), [0.2, 0.4, -0.6]);
            // At ±90° on the middle axis only the sum of the other two is known; the matrix must match.
            for (const middle of [Math.PI / 2, -Math.PI / 2]) {
                const locked = new Euler(...middleAngles(order, middle, 0.3), order);
                const lockedMatrix = new Matrix4().makeRotationFromEuler(locked);
                const read = new Euler().setFromRotationMatrix(lockedMatrix, order);
                const readMatrix = new Matrix4().makeRotationFromEuler(read);
                readMatrix.elements.forEach((value, i) => expect(value).toBeCloseTo(lockedMatrix.elements[i], 6));
            }
        }
    });

    it('re-expresses a rotation in another order', () => {
        const e = new Euler(0.1, 0.2, 0.3, 'XYZ');
        const q = new Quaternion().setFromEuler(e);
        const reordered = e.clone().reorder('ZXY');
        expect(reordered.order).toBe('ZXY');
        sameRotation(new Quaternion().setFromEuler(reordered), q);
    });

    it('warns on an order it cannot read from a matrix', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            new Euler().setFromRotationMatrix(new Matrix4(), 'XYX');
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

/** Angles for `order` with the middle rotation at `middle` and the others at `other`. */
function middleAngles(order: EulerOrder, middle: number, other: number): [number, number, number] {
    const angles: [number, number, number] = [other, other, other];
    angles['XYZ'.indexOf(order[1])] = middle;
    return angles;
}

describe('Euler from a rotation matrix in an unknown order', () => {
    it('warns and keeps the angles', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const e = new Euler(0.1, 0.2, 0.3, 'XYZ');
        e.setFromRotationMatrix(new Matrix4().makeRotationX(1), 'XYX' as EulerOrder);
        expect(warn).toHaveBeenCalledTimes(1);
        expect([e.x, e.y, e.z]).toEqual([0.1, 0.2, 0.3]);
        warn.mockRestore();
    });
});
