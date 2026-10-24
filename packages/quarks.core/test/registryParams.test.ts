import {BehaviorTypes, EmitterShapes, IParticleSystem, JsonMetaData, Matrix4, readFormat, ShapeJSON} from '../src';

/**
 * The `params` of each registered behavior and shape is what an editor shows and edits, so it
 * must name real fields, and every field the JSON holds must be editable through it. A field
 * added to a class and its JSON but not to `params` would be saved and loaded, but no editor
 * could change it.
 */

/** Fields the JSON holds that an editor edits through its own UI rather than `params`. */
const OWN_UI: {[type: string]: string[]} = {
    // A list of image-sampled sequences, built from pictures rather than typed in.
    ApplySequences: ['sequencers'],
};

const system = {worldSpace: false, emitter: {matrixWorld: new Matrix4()}} as unknown as IParticleSystem;
const quietly = <T>(read: () => T): T => readFormat({onWarning: () => {}}, read);

describe('registered params', () => {
    it.each(Object.keys(BehaviorTypes))('behavior %s: params name its fields and cover its JSON', (type) => {
        const plugin = BehaviorTypes[type];
        const behavior = quietly(() => plugin.loadJSON({type}, system));
        const fields = behavior as unknown as Record<string, unknown>;
        const params = plugin.params.map(([name]) => name);
        expect(params.filter((name) => !(name in fields))).toEqual([]);
        const written = Object.keys(behavior.toJSON()).filter((key) => key !== 'type');
        expect(written.filter((key) => !params.includes(key) && !OWN_UI[type]?.includes(key))).toEqual([]);
    });

    it.each(Object.keys(EmitterShapes))('shape %s: params name its fields and cover its JSON', (type) => {
        const plugin = EmitterShapes[type];
        const shape = quietly(() => plugin.loadJSON({type} as ShapeJSON, {} as JsonMetaData));
        const fields = shape as unknown as Record<string, unknown>;
        const params = plugin.params.map(([name]) => name);
        expect(params.filter((name) => !(name in fields))).toEqual([]);
        const written = Object.keys(shape.toJSON()).filter((key) => key !== 'type');
        expect(written.filter((key) => !params.includes(key) && !OWN_UI[type]?.includes(key))).toEqual([]);
    });
});
