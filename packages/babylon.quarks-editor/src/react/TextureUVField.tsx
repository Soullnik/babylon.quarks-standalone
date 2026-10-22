import type {TextureUV, UVChannel} from 'babylon.quarks';
import {NumberField, Row, SelectField} from './fields.js';

/** A `[u, v]` pair of number inputs. */
function PairField(props: {value: [number, number]; step: number; onChange: (next: [number, number]) => void}) {
    return (
        <div style={{display: 'flex', gap: 6}}>
            {[0, 1].map((i) => (
                <NumberField
                    key={i}
                    value={props.value[i]}
                    step={props.step}
                    onChange={(v) => {
                        const next: [number, number] = [props.value[0], props.value[1]];
                        next[i] = v;
                        props.onChange(next);
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Rows for how a texture is laid over the particle (`TextureUV`): its UV channel, then
 * tiling and offset as Unity's material Tiling / Offset, then a scroll as Unreal's Panner.
 * One field for the map, the erosion mask and the distortion noise alike.
 */
export function TextureUVField(props: {
    /** The complete layout as the system holds it. */
    value: TextureUV;
    /** Called with the whole layout, one field changed. */
    onChange: (next: TextureUV) => void;
    /** Prefix of each row's label, so several layouts in one module stay apart. Default none. */
    labelPrefix?: string;
}) {
    const prefix = props.labelPrefix ?? '';
    const patch = (fields: Partial<TextureUV>) => props.onChange({...props.value, ...fields});
    return (
        <>
            <Row label={`${prefix}UV channel`} hintKey="UV channel">
                <SelectField<UVChannel>
                    value={props.value.channel}
                    options={[
                        {value: 0, label: 'UV0 (sprite / mesh UV)'},
                        {value: 1, label: 'UV1 (mesh second set, along a trail)'},
                    ]}
                    onChange={(channel) => patch({channel})}
                />
            </Row>
            <Row label={`${prefix}Tiling`} hintKey="Tiling">
                <PairField value={props.value.tiling} step={0.5} onChange={(tiling) => patch({tiling})} />
            </Row>
            <Row label={`${prefix}Offset`} hintKey="Offset">
                <PairField value={props.value.offset} step={0.05} onChange={(offset) => patch({offset})} />
            </Row>
            <Row label={`${prefix}Scroll`} hintKey="Scroll">
                <PairField value={props.value.scroll} step={0.05} onChange={(scroll) => patch({scroll})} />
            </Row>
        </>
    );
}
