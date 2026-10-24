import type {ValueGenerator} from 'babylon.quarks';
import {RandomBetweenCurves} from 'babylon.quarks';
import React from 'react';
import {
    AnyGenerator,
    ScalarGenerator,
    ScalarValueState,
    buildCurve,
    buildScalar,
    readPieces,
    readScalar,
    withCurves,
} from '../core/values.js';
import {CurveEditor} from './CurveEditor.js';
import {NumberField, Row, SelectField} from './fields.js';

const captionStyle: React.CSSProperties = {fontSize: 10.5, opacity: 0.6, flex: 'none'};

/** Props every {@link ValueField} takes. */
export interface ValueFieldBaseProps {
    /** The row's label. */
    label: string;
    /** Tooltip text of the label. */
    hint?: string;
    /** Key into the inspector hints, used when `hint` is not given. */
    hintKey?: string;
    /** The generator shown; one that is not a scalar reads as the constant 1. */
    generator: AnyGenerator | undefined;
    /** Smallest value the number fields accept. */
    min?: number;
    /** Top of the curve editor's value range. */
    curveMax?: number;
}

/** A value field for a setting that takes a curve over the particle's life. */
export interface CurveValueFieldProps extends ValueFieldBaseProps {
    /** Offers Curve beside Constant and Random (the default). */
    curve?: true;
    /** Receives the edited generator. */
    onChange: (generator: ScalarGenerator) => void;
}

/** A value field for a setting sampled once, without a curve: Constant or Random. */
export interface ConstantValueFieldProps extends ValueFieldBaseProps {
    /** Hides Curve: the setting takes no curve. */
    curve: false;
    /** Receives the edited generator. */
    onChange: (generator: ValueGenerator) => void;
}

function isValueGenerator(generator: ScalarGenerator): generator is ValueGenerator {
    return generator.type === 'value';
}

/**
 * Unity-like value field: Constant | Random Between Two Constants | Curve | Random Between Two
 * Curves, bound to a quarks value generator. With `curve={false}` it offers only the first two,
 * for settings sampled once.
 */
export function ValueField(props: CurveValueFieldProps | ConstantValueFieldProps): React.ReactElement {
    const read = readScalar(props.generator);
    // A setting without curves shows a curve it was loaded with as a constant, so an edit replaces it.
    const curved = read.mode === 'curve' || read.mode === 'curves';
    const state: ScalarValueState = props.curve === false && curved ? {...read, mode: 'constant'} : read;

    const emit = (generator: ScalarGenerator) => {
        if (props.curve !== false) {
            props.onChange(generator);
        } else if (isValueGenerator(generator)) {
            props.onChange(generator);
        }
    };
    const commit = (patch: Partial<ScalarValueState>) => emit(buildScalar({...state, ...patch}));

    return (
        <>
            <Row label={props.label} hint={props.hint} hintKey={props.hintKey}>
                <SelectField
                    value={state.mode}
                    options={[
                        {value: 'constant', label: 'Constant'},
                        {value: 'random', label: 'Random between two'},
                        ...(props.curve !== false
                            ? [
                                  {value: 'curve' as const, label: 'Curve'},
                                  {value: 'curves' as const, label: 'Random between two curves'},
                              ]
                            : []),
                    ]}
                    onChange={(mode) =>
                        // Between one curve and two, every segment is kept; other switches start afresh.
                        (mode === 'curve' || mode === 'curves') && curved
                            ? emit(withCurves(props.generator, mode))
                            : commit({mode})
                    }
                />
            </Row>
            {state.mode === 'constant' && (
                <Row label="">
                    <NumberField value={state.value} min={props.min} onChange={(value) => commit({value})} />
                </Row>
            )}
            {state.mode === 'random' && (
                <Row label="">
                    <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                        <span style={captionStyle}>min</span>
                        <NumberField value={state.min} min={props.min} onChange={(min) => commit({min})} />
                        <span style={captionStyle}>max</span>
                        <NumberField value={state.max} min={props.min} onChange={(max) => commit({max})} />
                    </div>
                </Row>
            )}
            {state.mode === 'curve' && (
                <div style={{marginTop: 6}}>
                    <CurveEditor
                        pieces={readPieces(props.generator)}
                        maxValue={props.curveMax}
                        onChange={(pieces) => emit(buildCurve(pieces))}
                    />
                </div>
            )}
            {state.mode === 'curves' && (
                <>
                    {(['lower', 'upper'] as const).map((bound, index) => (
                        <div key={bound} style={{marginTop: 6}}>
                            <span style={captionStyle}>{bound}</span>
                            <CurveEditor
                                pieces={readPieces(props.generator, index === 1)}
                                maxValue={props.curveMax}
                                onChange={(pieces) =>
                                    emit(
                                        index === 0
                                            ? new RandomBetweenCurves(
                                                  buildCurve(pieces),
                                                  buildCurve(readPieces(props.generator, true))
                                              )
                                            : new RandomBetweenCurves(
                                                  buildCurve(readPieces(props.generator)),
                                                  buildCurve(pieces)
                                              )
                                    )
                                }
                            />
                        </div>
                    ))}
                </>
            )}
        </>
    );
}
