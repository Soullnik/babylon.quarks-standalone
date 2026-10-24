/** @jest-environment jsdom */
import {Bezier, ConstantValue, PiecewiseBezier, RandomBetweenCurves, type ValueGenerator} from 'babylon.quarks';
import type {ScalarGenerator} from '../../src/core/values';
import {LifeCurveField} from '../../src/react/LifeCurveField';
import {ValueField} from '../../src/react/ValueField';
import {click, controlsOf, mount, type Mounted, pick, rowOf, type} from './dom';

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

describe('ValueField with curves', () => {
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('offers Random Between Two Curves, and shows one curve editor per bound', () => {
        const curve = new PiecewiseBezier([[new Bezier(0.4, 0.5, 0.6, 0.7), 0]]);
        const onChange = jest.fn<void, [ScalarGenerator]>();
        mounted = mount(<ValueField label="Size" generator={curve} onChange={onChange} />);
        const [select] = controlsOf(rowOf(mounted.container, 'Size')) as [HTMLSelectElement];
        expect(Array.from(select.options).map((o) => o.value)).toEqual(['constant', 'random', 'curve', 'curves']);
        pick(select, 'curves');
        const edited = onChange.mock.calls[0][0] as RandomBetweenCurves;
        expect(edited).toBeInstanceOf(RandomBetweenCurves);
        expect(edited.curve1.toJSON()).toEqual(curve.toJSON());

        mounted.unmount();
        mounted = mount(<ValueField label="Size" generator={edited} onChange={onChange} />);
        const [shown] = controlsOf(rowOf(mounted.container, 'Size')) as [HTMLSelectElement];
        expect(shown.value).toBe('curves');
        expect(mounted.container.querySelectorAll('svg[width]')).toHaveLength(2);
    });

    it('shows two curves as a constant where curves are not taken', () => {
        const curves = new RandomBetweenCurves(
            new PiecewiseBezier([[new Bezier(0.4, 0.5, 0.6, 0.7), 0]]),
            new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]])
        );
        mounted = mount(<ValueField label="Angle" curve={false} generator={curves} onChange={() => {}} />);
        const [select] = controlsOf(rowOf(mounted.container, 'Angle')) as [HTMLSelectElement];
        expect(select.value).toBe('constant');
        expect(Array.from(select.options).map((o) => o.value)).toEqual(['constant', 'random']);
    });
});

const twoSegments = () =>
    new PiecewiseBezier([
        [new Bezier(0, 0.2, 0.4, 0.5), 0],
        [new Bezier(0.5, 0.7, 0.9, 1), 0.5],
    ]);

describe('switching between one curve and two', () => {
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('keeps every segment from Curve to Random between two curves and back', () => {
        const curve = twoSegments();
        const onChange = jest.fn<void, [ScalarGenerator]>();
        mounted = mount(<ValueField label="Size" generator={curve} onChange={onChange} />);
        pick(controlsOf(rowOf(mounted.container, 'Size'))[0], 'curves');
        const two = onChange.mock.calls[0][0] as RandomBetweenCurves;
        expect(two.curve1.toJSON()).toEqual(curve.toJSON());
        expect(two.curve2.toJSON()).toEqual(curve.toJSON());

        mounted.unmount();
        const upper = new RandomBetweenCurves(twoSegments(), new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]]));
        mounted = mount(<ValueField label="Size" generator={upper} onChange={onChange} />);
        pick(controlsOf(rowOf(mounted.container, 'Size'))[0], 'curve');
        expect((onChange.mock.calls[1][0] as PiecewiseBezier).toJSON()).toEqual(curve.toJSON());
    });
});

describe('LifeCurveField', () => {
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('shows both bounds of two curves and switches between one curve and two', () => {
        const onChange = jest.fn<void, [PiecewiseBezier | RandomBetweenCurves]>();
        const two = new RandomBetweenCurves(twoSegments(), new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]]));
        mounted = mount(<LifeCurveField generator={two} onChange={onChange} />);
        expect(mounted.container.querySelectorAll('svg[width]')).toHaveLength(2);
        const [toggle] = controlsOf(rowOf(mounted.container, 'Two curves')) as [HTMLInputElement];
        expect(toggle.checked).toBe(true);
        click(toggle);
        const one = onChange.mock.calls[0][0];
        expect(one).toBeInstanceOf(PiecewiseBezier);
        expect(one.toJSON()).toEqual(twoSegments().toJSON());

        mounted.unmount();
        mounted = mount(<LifeCurveField generator={one} onChange={onChange} />);
        expect(mounted.container.querySelectorAll('svg[width]')).toHaveLength(1);
        click(controlsOf(rowOf(mounted.container, 'Two curves'))[0]);
        const again = onChange.mock.calls[1][0] as RandomBetweenCurves;
        expect(again).toBeInstanceOf(RandomBetweenCurves);
        expect(again.curve2.toJSON()).toEqual(twoSegments().toJSON());
    });
});
