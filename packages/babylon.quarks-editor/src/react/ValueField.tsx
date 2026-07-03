import React from 'react';
import {ScalarGenerator, ScalarValueState, buildScalar, readScalar} from '../core/values';
import {CurveEditor} from './CurveEditor';
import {NumberField, Row, SelectField} from './fields';

/**
 * Unity-like value field: Constant | Random Between Two Constants | Curve,
 * bound to a quarks value generator.
 */
export function ValueField(props: {
    label: string;
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
            <Row label={props.label}>
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
                    <div style={{display: 'flex', gap: 6}}>
                        <NumberField value={state.min} min={props.min} onChange={(min) => commit({min})} />
                        <NumberField value={state.max} min={props.min} onChange={(max) => commit({max})} />
                    </div>
                </Row>
            )}
            {state.mode === 'curve' && (
                <div style={{marginTop: 6}}>
                    <CurveEditor curve={state.curve} maxValue={props.curveMax} onChange={(curve) => commit({curve})} />
                </div>
            )}
        </>
    );
}
