import React from 'react';
import {ScalarGenerator, ScalarValueState, buildCurve, buildScalar, readPieces, readScalar} from '../core/values.js';
import {CurveEditor} from './CurveEditor.js';
import {NumberField, Row, SelectField} from './fields.js';

/**
 * Unity-like value field: Constant | Random Between Two Constants | Curve,
 * bound to a quarks value generator.
 */
const captionStyle: React.CSSProperties = {fontSize: 10.5, opacity: 0.6, flex: 'none'};

export function ValueField(props: {
    label: string;
    hint?: string;
    hintKey?: string;
    generator: ScalarGenerator | undefined;
    onChange: (generator: ScalarGenerator) => void;
    min?: number;
    curveMax?: number;
}) {
    const state = readScalar(props.generator);

    const commit = (patch: Partial<ScalarValueState>) => {
        props.onChange(buildScalar({...state, ...patch}));
    };

    return (
        <>
            <Row label={props.label} hint={props.hint} hintKey={props.hintKey}>
                <SelectField
                    value={state.mode}
                    options={[
                        {value: 'constant', label: 'Constant'},
                        {value: 'random', label: 'Random between two'},
                        {value: 'curve', label: 'Curve'},
                    ]}
                    onChange={(mode) => commit({mode})}
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
                        onChange={(pieces) => props.onChange(buildCurve(pieces))}
                    />
                </div>
            )}
        </>
    );
}
