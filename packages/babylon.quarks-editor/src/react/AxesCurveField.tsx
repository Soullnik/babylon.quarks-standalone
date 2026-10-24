import {PiecewiseBezier, RandomBetweenCurves, Vector3Function} from 'babylon.quarks';
import React from 'react';
import {AnyGenerator, withCurves} from '../core/values.js';
import {CheckboxField, Row} from './fields.js';
import {LifeCurveField} from './LifeCurveField.js';

const captionStyle: React.CSSProperties = {fontSize: 10.5, opacity: 0.6, marginTop: 6};

/** One curve or two, for one axis or for all of them. */
type AxisCurve = PiecewiseBezier | RandomBetweenCurves;

/** Props of an {@link AxesCurveField}. */
export interface AxesCurveFieldProps {
    /** The generator shown: one curve (or two) for every axis, or a `Vector3Function` per axis. */
    generator: AnyGenerator | undefined;
    /** Top of the curve editors' value range. */
    maxValue?: number;
    /** Receives the edited generator. */
    onChange: (generator: AxisCurve | Vector3Function) => void;
}

/** The curve or curves `generator` holds, as a fresh copy. */
function curveOf(generator: AnyGenerator | undefined): AxisCurve {
    return withCurves(generator, generator instanceof RandomBetweenCurves ? 'curves' : 'curve');
}

/**
 * A curve over life with Unity's Separate Axes switch: off, one curve (or two) for all axes; on, a
 * {@link Vector3Function} with its own for X, Y and Z. Switching on gives every axis the shared
 * curve; switching off keeps the X one.
 */
export function AxesCurveField(props: AxesCurveFieldProps): React.ReactElement {
    const {generator} = props;
    const axes = generator instanceof Vector3Function ? generator : undefined;
    const toggle = (on: boolean) =>
        props.onChange(
            on ? new Vector3Function(curveOf(generator), curveOf(generator), curveOf(generator)) : curveOf(axes?.x)
        );
    return (
        <>
            <Row label="Separate axes" hint="A curve for each of X, Y and Z, as Unity's Separate Axes.">
                <CheckboxField value={axes !== undefined} onChange={toggle} />
            </Row>
            {axes === undefined ? (
                <LifeCurveField generator={generator} maxValue={props.maxValue} onChange={props.onChange} />
            ) : (
                (['x', 'y', 'z'] as const).map((axis) => (
                    <div key={axis}>
                        <div style={captionStyle}>{axis.toUpperCase()}</div>
                        <LifeCurveField
                            generator={axes[axis]}
                            maxValue={props.maxValue}
                            onChange={(curve) =>
                                props.onChange(
                                    new Vector3Function(
                                        axis === 'x' ? curve : axes.x,
                                        axis === 'y' ? curve : axes.y,
                                        axis === 'z' ? curve : axes.z
                                    )
                                )
                            }
                        />
                    </div>
                ))
            )}
        </>
    );
}
