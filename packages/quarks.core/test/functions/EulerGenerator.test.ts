import {ConstantValue, EulerGenerator, Quaternion} from '../../src';

describe('EulerGenerator', () => {
    it('keeps its Euler as euler, in the order it was given', () => {
        const generator = new EulerGenerator(new ConstantValue(0), new ConstantValue(0), new ConstantValue(1), 'ZYX');
        expect(generator.euler.order).toBe('ZYX');
        const q = generator.genValue([], new Quaternion(), 0.5, 0);
        expect(q.z).toBeCloseTo(Math.sin(0.25), 6);
        expect(generator.toJSON().eulerOrder).toBe('ZYX');
        const copy = generator.clone();
        expect(copy).toBeInstanceOf(EulerGenerator);
        expect((copy as EulerGenerator).euler.order).toBe('ZYX');
    });
});
