import {IntervalValue, PiecewiseBezier, RandomBetweenCurves} from 'babylon.quarks';
import React from 'react';
import {AnyGenerator, buildCurve, CurvePiece, readPieces, withCurves} from '../core/values.js';
import {CurveEditor} from './CurveEditor.js';
import {CheckboxField, Row} from './fields.js';

const captionStyle: React.CSSProperties = {fontSize: 10.5, opacity: 0.6, flex: 'none'};

/** Props of a {@link LifeCurveField}. */
export interface LifeCurveFieldProps {
    /** The generator shown: one curve, two curves, or anything else, read as one curve. */
    generator: AnyGenerator | undefined;
    /** Top of the curve editors' value range. */
    maxValue?: number;
    /** Receives the edited curve or curves. */
    onChange: (generator: PiecewiseBezier | RandomBetweenCurves) => void;
}

/**
 * A setting that is a curve over the particle's life, or two with a "Two curves" switch (Unity's
 * Random Between Two Curves): each particle then follows its own curve between the lower and the
 * upper one. Every segment of both curves is kept through edits and switches.
 */
export function LifeCurveField(props: LifeCurveFieldProps): React.ReactElement {
    const {generator} = props;
    // A random range shows as two flat curves, and an edit turns it into them.
    const two = generator instanceof RandomBetweenCurves || generator instanceof IntervalValue;
    const edit = (pieces: CurvePiece[], upper: boolean) => {
        if (!two) {
            props.onChange(buildCurve(pieces));
            return;
        }
        const lower = upper ? buildCurve(readPieces(generator)) : buildCurve(pieces);
        const higher = upper ? buildCurve(pieces) : buildCurve(readPieces(generator, true));
        props.onChange(new RandomBetweenCurves(lower, higher));
    };
    return (
        <>
            <Row label="Two curves" hint="Random between two curves: each particle follows its own curve between them.">
                <CheckboxField
                    value={two}
                    onChange={(on) => props.onChange(withCurves(generator, on ? 'curves' : 'curve'))}
                />
            </Row>
            {(two ? (['lower', 'upper'] as const) : (['curve'] as const)).map((bound) => (
                <div key={bound} style={{marginTop: 6}}>
                    {two && <span style={captionStyle}>{bound}</span>}
                    <CurveEditor
                        pieces={readPieces(generator, bound === 'upper')}
                        maxValue={props.maxValue}
                        onChange={(pieces) => edit(pieces, bound === 'upper')}
                    />
                </div>
            ))}
        </>
    );
}
