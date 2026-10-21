import {ConstantValue, OrbitOverLife, Vector3} from '../../src';

describe('OrbitOverLife', () => {
    it('keeps its axis through clone()', () => {
        const behavior = new OrbitOverLife(new ConstantValue(2), new Vector3(1, 0, 0));
        const copy = behavior.clone() as OrbitOverLife;
        expect(copy.axis).toEqual(new Vector3(1, 0, 0));
        expect(copy.axis).not.toBe(behavior.axis);
        expect(copy.toJSON()).toEqual(behavior.toJSON());
    });

    it('keeps its axis through toJSON and fromJSON', () => {
        const behavior = new OrbitOverLife(new ConstantValue(2), new Vector3(0, 0, 1));
        expect((OrbitOverLife.fromJSON(behavior.toJSON()) as OrbitOverLife).axis).toEqual(new Vector3(0, 0, 1));
    });
});
