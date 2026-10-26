import {BehaviorTypes, EmitterShapes, IParticleSystem, JsonMetaData, Matrix4, readFormat, ShapeJSON} from '../src';

/**
 * The `params` of each registered behavior and shape is what an editor shows and edits, so it
 * must name real fields, and every field the JSON holds must be editable through it. A field
 * added to a class and its JSON but not to `params` would be saved and loaded, but no editor
 * could change it. The same holds for a settings field the JSON leaves out: each own field of
 * a default instance is a param, editor-owned, or run-time state listed below.
 */

/** Fields the JSON holds that an editor edits through its own UI rather than `params`. */
const OWN_UI: {[type: string]: string[]} = {
    // A list of image-sampled sequences, built from pictures rather than typed in.
    ApplySequences: ['sequencers'],
};

/**
 * Own fields that hold run-time state rather than settings, by type. Fields named as private
 * (a leading or trailing `_`) and scratch values (`temp…`) are left out by name.
 */
const STATE: {[type: string]: string[]} = {
    Noise: ['duration', 'scrollOffset', 'scrollMemory', 'remapTable', 'remapOf'],
    TurbulenceField: ['timeOffset', 'initialOffset', 'generator'],
    FrameOverLife: ['salt'],
    OrbitOverLife: ['rotation'],
    ChangeEmitDirection: ['memory'],
    ApplySequences: ['time', 'index', 'pCount', 'states'],
    EmitSubParticleSystem: ['subEmissions', 'spareEmissions'],
    ApplyCollision: ['resolver'],
    circle: ['currentValue', 'memory'],
    cone: ['currentValue', 'memory'],
    edge: ['currentValue', 'memory'],
    donut: ['currentValue', 'memory'],
    sphere: ['currentValue', 'memory'],
    hemisphere: ['currentValue', 'memory'],
    rectangle: ['currentValue', 'memory'],
    grid: ['nextCell'],
};

/** The instance's own settings fields that `params` does not name. */
function unlisted(type: string, instance: object, params: string[]): string[] {
    const fields = instance as Record<string, unknown>;
    return Object.keys(fields).filter(
        (key) =>
            typeof fields[key] !== 'function' &&
            key !== 'type' &&
            !params.includes(key) &&
            !OWN_UI[type]?.includes(key) &&
            !STATE[type]?.includes(key) &&
            !key.startsWith('_') &&
            !key.endsWith('_') &&
            !/temp/i.test(key)
    );
}

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
        expect(unlisted(type, behavior, params)).toEqual([]);
    });

    it.each(Object.keys(EmitterShapes))('shape %s: params name its fields and cover its JSON', (type) => {
        const plugin = EmitterShapes[type];
        const shape = quietly(() => plugin.loadJSON({type} as ShapeJSON, {} as JsonMetaData));
        const fields = shape as unknown as Record<string, unknown>;
        const params = plugin.params.map(([name]) => name);
        expect(params.filter((name) => !(name in fields))).toEqual([]);
        const written = Object.keys(shape.toJSON()).filter((key) => key !== 'type');
        expect(written.filter((key) => !params.includes(key) && !OWN_UI[type]?.includes(key))).toEqual([]);
        expect(unlisted(type, shape, params)).toEqual([]);
    });
});
