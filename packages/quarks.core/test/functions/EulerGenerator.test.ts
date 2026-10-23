import {ConstantValue, EulerGenerator, Quaternion} from '../../src';

describe('EulerGenerator', () => {
    it('keeps its Euler as euler, and the misspelt eular as the same object', () => {
        const generator = new EulerGenerator(new ConstantValue(0), new ConstantValue(0), new ConstantValue(1), 'ZYX');
        expect(generator.euler.order).toBe('ZYX');
        expect(generator.eular).toBe(generator.euler);
        const q = generator.genValue([], new Quaternion(), 0.5, 0);
        expect(q.z).toBeCloseTo(Math.sin(0.25), 6);
        expect(generator.toJSON().eulerOrder).toBe('ZYX');
        const copy = generator.clone();
        expect(copy).toBeInstanceOf(EulerGenerator);
        expect((copy as EulerGenerator).euler.order).toBe('ZYX');
    });
});
