/** @jest-environment jsdom */
import {Bezier, ConstantValue, PiecewiseBezier, type ValueGenerator} from 'babylon.quarks';
import {ValueField} from '../../src/react/ValueField';
import {controlsOf, mount, type Mounted, rowOf, type} from './dom';

describe('ValueField without curves', () => {
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('shows a curve it was loaded with as a constant, and an edit replaces it', () => {
        const curve = new PiecewiseBezier([[new Bezier(0.4, 0.5, 0.6, 0.7), 0]]);
        const onChange = jest.fn<void, [ValueGenerator]>();
        mounted = mount(<ValueField label="Angle" curve={false} generator={curve} onChange={onChange} />);

        const [select] = controlsOf(rowOf(mounted.container, 'Angle')) as [HTMLSelectElement];
        expect(select.value).toBe('constant');
        expect(Array.from(select.options).map((o) => o.value)).toEqual(['constant', 'random']);
        expect(mounted.container.querySelector('canvas')).toBeNull();

        const number = mounted.container.querySelector('input')!;
        expect(Number(number.value)).toBeCloseTo(0.4);
        type(number, '0.25');
        expect(onChange).toHaveBeenCalledTimes(1);
        const edited = onChange.mock.calls[0][0];
        expect(edited).toBeInstanceOf(ConstantValue);
        expect((edited as ConstantValue).value).toBe(0.25);
    });
});
