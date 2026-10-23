/**
 * The serialisation contract every behavior, emitter shape and value generator keeps:
 *
 * - `fromJSON(toJSON())`, after a trip through `JSON.stringify`, rebuilds the same object, so no
 *   setting is lost on save and load;
 * - `clone()` rebuilds the same object and shares nothing mutable with the original, so editing
 *   or simulating a copy cannot change the source.
 *
 * "The same object" is compared on the instance's whole state, not only on what `toJSON` writes:
 * a setting that `toJSON` forgets shows up as a difference. Every registered behavior and shape
 * needs an entry with non-default values below, so a new type cannot skip the contract.
 */
import {
    ApplyCollision,
    ApplyForce,
    ApplySequences,
    AxisAngleGenerator,
    Behavior,
    BehaviorFromJSON,
    BehaviorToJSON,
    BehaviorTypes,
    Bezier,
    BoxEmitter,
    ChangeEmitDirection,
    CircleEmitter,
    ColorBySpeed,
    ColorGeneratorFromJSON,
    ColorOverLife,
    ColorRange,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    EdgeEmitter,
    EmitterFromJSON,
    EmitterMode,
    EmitterShape,
    EmitterShapes,
    EmitterToJSON,
    EulerGenerator,
    ForceOverLife,
    FrameOverLife,
    GeneratorFromJSON,
    Gradient,
    GravityForce,
    GridEmitter,
    HemisphereEmitter,
    InheritVelocity,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    PiecewiseBezier,
    PointEmitter,
    Quaternion,
    RandomColor,
    RandomColorBetweenGradient,
    RandomQuatGenerator,
    readFormat,
    RectangleEmitter,
    Rotation3DOverLife,
    RotationBySpeed,
    RotationOverLife,
    ShapeTransform,
    SizeBySpeed,
    SizeOverLife,
    SpeedOverLife,
    SphereEmitter,
    TextureSequencer,
    TurbulenceField,
    Vector2,
    Vector3,
    Vector3Function,
    Vector4,
    VelocityOverLife,
    WidthOverLength,
} from '../src';

/** Per-frame scratch any class may keep, and per-particle generator memory: not settings. */
const SCRATCH_FIELDS = new Set(['temp', 'temp2', 'temp3', 'tempQ', 'memory']);

/**
 * Runtime state particular to one class, left out of the comparison for that class only, so a
 * setting with the same name elsewhere (a shape transform's `rotation`) is still compared.
 * `resolver` is the host's collision resolver, which a file does not carry. TurbulenceField's
 * generator and offsets are derived from its `seed`, so they are compared like any setting.
 */
const RUNTIME_FIELDS: Record<string, string[]> = {
    OrbitOverLife: ['rotation'],
    FrameOverLife: ['indexCount'],
    ApplyCollision: ['resolver'],
};

const isRuntime = (owner: object, key: string) =>
    SCRATCH_FIELDS.has(key) || (RUNTIME_FIELDS[owner.constructor?.name] ?? []).includes(key);

/** The instance's settings as plain data: class names, own fields and values, cycles cut. */
function state(value: unknown, seen = new Set<object>()): unknown {
    if (value === null || typeof value !== 'object') {
        return typeof value === 'function' ? undefined : value;
    }
    if (seen.has(value)) {
        return '[cycle]';
    }
    seen.add(value);
    if (ArrayBuffer.isView(value)) {
        return Array.from(value as unknown as ArrayLike<number>);
    }
    if (Array.isArray(value)) {
        return value.map((item) => state(item, seen));
    }
    const out: Record<string, unknown> = {$class: value.constructor?.name};
    for (const key of Object.keys(value).sort()) {
        if (!isRuntime(value, key) && !key.startsWith('_')) {
            out[key] = state((value as Record<string, unknown>)[key], seen);
        }
    }
    return out;
}

/** Every mutable object reachable from `value` (vectors, arrays, generators, ...). */
function reachable(value: unknown, out = new Set<object>()): Set<object> {
    if (value === null || typeof value !== 'object' || out.has(value)) {
        return out;
    }
    if (Object.isFrozen(value)) {
        return out;
    }
    out.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (!isRuntime(value, key)) {
            reachable(child, out);
        }
    }
    return out;
}

function sharedObjects(a: unknown, b: unknown): string[] {
    const fromA = reachable(a);
    return [...reachable(b)].filter((object) => fromA.has(object)).map((object) => object.constructor?.name ?? '?');
}

const viaJSON = <T>(json: T): T => JSON.parse(JSON.stringify(json));

const curve = () =>
    new PiecewiseBezier([
        [new Bezier(0.1, 0.4, 0.7, 0.9), 0],
        [new Bezier(0.9, 0.6, 0.3, 0.2), 0.5],
    ]);
const gradient = () =>
    new Gradient(
        [
            [new Vector3(0.1, 0.2, 0.3), 0],
            [new Vector3(0.9, 0.8, 0.7), 1],
        ],
        [
            [0.2, 0],
            [0.8, 1],
        ]
    );

const behaviors: Record<string, () => Behavior> = {
    ApplyForce: () => new ApplyForce(new Vector3(1, 2, 3), new IntervalValue(2, 4), 'local'),
    Noise: () =>
        new Noise(
            new ConstantValue(2),
            curve(),
            new ConstantValue(0.5),
            new ConstantValue(0.25),
            new ConstantValue(3),
            curve()
        ),
    TurbulenceField: () =>
        new TurbulenceField(new Vector3(2, 3, 4), 3, new Vector3(1, 2, 3), new Vector3(0.1, 0.2, 0.3), 7),
    GravityForce: () => new GravityForce(new Vector3(1, 2, 3), 4),
    ColorOverLife: () => new ColorOverLife(gradient()),
    RotationOverLife: () => new RotationOverLife(curve()),
    Rotation3DOverLife: () => new Rotation3DOverLife(new AxisAngleGenerator(new Vector3(0, 0, 1), curve())),
    SizeOverLife: () => new SizeOverLife(new Vector3Function(curve(), new ConstantValue(2), new IntervalValue(1, 3))),
    ColorBySpeed: () => new ColorBySpeed(gradient(), new IntervalValue(1, 5)),
    RotationBySpeed: () => new RotationBySpeed(curve(), new IntervalValue(1, 5)),
    SizeBySpeed: () => new SizeBySpeed(curve(), new IntervalValue(1, 5)),
    SpeedOverLife: () => new SpeedOverLife(curve()),
    FrameOverLife: () =>
        new FrameOverLife(new IntervalValue(1, 4), {fps: 12, frameCount: 8, startFrame: new ConstantValue(2)} as never),
    ForceOverLife: () => new ForceOverLife(curve(), new ConstantValue(2), new IntervalValue(-1, 1), 'local'),
    VelocityOverLife: () =>
        new VelocityOverLife(
            curve(),
            new ConstantValue(1),
            new ConstantValue(2),
            new ConstantValue(3),
            new IntervalValue(1, 2),
            curve(),
            'world',
            new ConstantValue(4),
            new Vector3(1, 2, 3)
        ),
    InheritVelocity: () => new InheritVelocity(curve(), 'current'),
    OrbitOverLife: () => new OrbitOverLife(curve(), new Vector3(1, 0, 0), 'world'),
    WidthOverLength: () => new WidthOverLength(curve(), true),
    ChangeEmitDirection: () => new ChangeEmitDirection(new IntervalValue(0.1, 0.5)),
    ApplySequences: () => {
        const sequencer = new TextureSequencer(0.5, 0.25, new Vector3(1, 2, 3));
        sequencer.locations = [new Vector2(1, 2), new Vector2(3, 4)];
        const behavior = new ApplySequences(0.2);
        behavior.appendSequencer(new IntervalValue(0, 1), sequencer);
        return behavior;
    },
    LimitSpeedOverLife: () => new LimitSpeedOverLife(curve(), 0.5),
    ApplyCollision: () => new ApplyCollision({resolve: () => false} as never, 0.6),
};

/** Fields a behavior writes that an editor edits through code, not as a plain parameter. */
const EDITED_IN_CODE: Record<string, string[]> = {
    ApplySequences: ['sequencers'],
};

/** Behaviors that need a particle system to load; covered by the babylon.quarks contract test. */
const NEEDS_SYSTEM = new Set(['EmitSubParticleSystem']);

const shapes: Record<string, () => EmitterShape> = {
    box: () => new BoxEmitter({width: 2, height: 3, depth: 4, emitFrom: 1, boxThickness: [0.1, 0.2, 0.3]}),
    circle: () =>
        new CircleEmitter({radius: 2, arc: 3, thickness: 0.5, mode: EmitterMode.Loop, spread: 0.25, speed: curve()}),
    cone: () =>
        new ConeEmitter({
            radius: 2,
            arc: 3,
            thickness: 0.5,
            angle: 0.4,
            mode: EmitterMode.PingPong,
            spread: 0.25,
            speed: curve(),
        }),
    donut: () =>
        new DonutEmitter({
            radius: 2,
            arc: 3,
            thickness: 0.5,
            donutRadius: 0.3,
            mode: EmitterMode.Burst,
            spread: 0.25,
            speed: curve(),
        }),
    edge: () => new EdgeEmitter({radius: 2, mode: EmitterMode.Loop, spread: 0.25, speed: curve()}),
    point: () => new PointEmitter(),
    sphere: () =>
        new SphereEmitter({
            radius: 2,
            arc: 3,
            thickness: 0.5,
            mode: EmitterMode.Loop,
            spread: 0.25,
            speed: curve(),
        }),
    hemisphere: () =>
        new HemisphereEmitter({
            radius: 2,
            arc: 3,
            thickness: 0.5,
            mode: EmitterMode.Loop,
            spread: 0.25,
            speed: curve(),
        }),
    grid: () => new GridEmitter({width: 2, height: 3, row: 4, column: 5}),
    rectangle: () =>
        new RectangleEmitter({
            width: 2,
            height: 3,
            thickness: 0.5,
            mode: EmitterMode.Loop,
            spread: 0.25,
            speed: curve(),
        }),
};

/** Shapes placed off the emitter's origin with a shape transform, as Unity's Shape module allows. */
const transformed = (shape: EmitterShape): EmitterShape => {
    (shape as unknown as {transform?: ShapeTransform}).transform = new ShapeTransform(
        new Vector3(1, 2, 3),
        new Quaternion(0.1, 0.2, 0.3, 0.9).normalize(),
        new Vector3(2, 3, 4)
    );
    return shape;
};

const generators: Record<string, () => {toJSON(): unknown; clone(): unknown}> = {
    ConstantValue: () => new ConstantValue(3),
    IntervalValue: () => new IntervalValue(1, 4),
    PiecewiseBezier: curve,
    AxisAngle: () => new AxisAngleGenerator(new Vector3(0, 1, 0), curve()),
    Euler: () => new EulerGenerator(curve(), new ConstantValue(1), new IntervalValue(0, 2)),
    RandomQuat: () => new RandomQuatGenerator(),
    Vector3Function: () => new Vector3Function(curve(), new ConstantValue(1), new IntervalValue(0, 2)),
};

const colorGenerators: Record<string, () => {toJSON(): unknown; clone(): unknown}> = {
    ConstantColor: () => new ConstantColor(new Vector4(0.1, 0.2, 0.3, 0.4)),
    ColorRange: () => new ColorRange(new Vector4(0.1, 0.2, 0.3, 0.4), new Vector4(0.5, 0.6, 0.7, 0.8)),
    RandomColor: () => new RandomColor(new Vector4(0.1, 0.2, 0.3, 0.4), new Vector4(0.5, 0.6, 0.7, 0.8)),
    Gradient: gradient,
    RandomColorBetweenGradient: () => new RandomColorBetweenGradient(gradient(), gradient()),
};

const system = {} as never;

describe('serialisation contract', () => {
    it('has an entry for every registered behavior and shape', () => {
        expect(
            Object.keys(BehaviorTypes)
                .filter((type) => !NEEDS_SYSTEM.has(type))
                .sort()
        ).toEqual(Object.keys(behaviors).sort());
        expect(Object.keys(EmitterShapes).sort()).toEqual(Object.keys(shapes).sort());
    });

    it.each(Object.keys(BehaviorTypes))('%s lists only fields its behavior has in BehaviorTypes params', (type) => {
        const behavior = readFormat({onWarning: () => {}}, () => BehaviorFromJSON({type}, system)) as unknown as object;
        for (const [name] of BehaviorTypes[type].params) expect([name, name in behavior]).toEqual([name, true]);
    });

    describe.each(Object.entries(behaviors))('behavior %s', (_type, make) => {
        it('survives toJSON and fromJSON', () => {
            const original = make();
            const loaded = BehaviorFromJSON(viaJSON(original.toJSON()), system)!;
            expect(state(loaded)).toEqual(state(original));
            expect(viaJSON(loaded.toJSON())).toEqual(viaJSON(original.toJSON()));
        });

        it('clones to an equal, independent copy', () => {
            const original = make();
            const copy = original.clone();
            expect(state(copy)).toEqual(state(original));
            expect(sharedObjects(original, copy)).toEqual([]);
        });

        it('writes to a file only the fields that differ from their defaults, and reads back the same', () => {
            const original = make();
            const file = viaJSON(BehaviorToJSON(original, system));
            const loaded = BehaviorFromJSON(file, system)!;
            expect(viaJSON(loaded.toJSON())).toEqual(viaJSON(original.toJSON()));
            const warnings: string[] = [];
            const defaults = readFormat({onWarning: (m) => warnings.push(m)}, () =>
                BehaviorFromJSON({type: file.type}, system)
            )!;
            const defaultJSON = viaJSON(defaults.toJSON());
            for (const key of Object.keys(file).filter((k) => k !== 'type')) {
                expect([key, file[key]]).not.toEqual([key, defaultJSON[key]]);
            }
            // A behavior that needs a field (a curve) warns read from its type alone, and keeps it.
            if (warnings.length === 0) expect(BehaviorToJSON(defaults, system)).toEqual({type: file.type});
        });

        it('lists every field it writes in BehaviorTypes params, so an editor shows it', () => {
            const json = make().toJSON();
            const params = BehaviorTypes[json.type].params.map(([name]) => name);
            const written = Object.keys(json).filter(
                (key) => key !== 'type' && !(EDITED_IN_CODE[json.type] ?? []).includes(key)
            );
            expect(params).toEqual(expect.arrayContaining(written));
        });
    });

    describe.each(Object.entries(shapes))('shape %s', (_type, make) => {
        it('survives toJSON and fromJSON, shape transform included', () => {
            const original = transformed(make());
            const loaded = EmitterFromJSON(viaJSON(original.toJSON()), {} as never);
            expect(state(loaded)).toEqual(state(original));
        });

        it('writes to a file only the fields that differ from their defaults, and reads back the same', () => {
            const original = transformed(make());
            const file = viaJSON(EmitterToJSON(original, {} as never));
            expect(state(EmitterFromJSON(file, {} as never))).toEqual(state(original));
            const defaults = EmitterFromJSON({type: file.type}, {} as never);
            const defaultJSON = viaJSON(defaults.toJSON()) as unknown as Record<string, unknown>;
            for (const [key, value] of Object.entries(file).filter(([k]) => k !== 'type')) {
                expect([key, value]).not.toEqual([key, defaultJSON[key]]);
            }
            expect(EmitterToJSON(defaults, {} as never)).toEqual({type: file.type});
        });

        it('clones to an equal, independent copy', () => {
            const original = transformed(make());
            const copy = original.clone();
            expect(state(copy)).toEqual(state(original));
            expect(sharedObjects(original, copy)).toEqual([]);
        });
    });

    describe.each(Object.entries(generators))('value generator %s', (_type, make) => {
        it('survives toJSON and fromJSON', () => {
            const original = make();
            expect(state(GeneratorFromJSON(viaJSON(original.toJSON()) as never))).toEqual(state(original));
        });

        it('clones to an equal, independent copy', () => {
            const original = make();
            const copy = original.clone();
            expect(state(copy)).toEqual(state(original));
            expect(sharedObjects(original, copy)).toEqual([]);
        });
    });

    describe.each(Object.entries(colorGenerators))('color generator %s', (_type, make) => {
        it('survives toJSON and fromJSON', () => {
            const original = make();
            expect(state(ColorGeneratorFromJSON(viaJSON(original.toJSON()) as never))).toEqual(state(original));
        });

        it('clones to an equal, independent copy', () => {
            const original = make();
            const copy = original.clone();
            expect(state(copy)).toEqual(state(original));
            expect(sharedObjects(original, copy)).toEqual([]);
        });
    });
});

describe('files written before 0.28', () => {
    it('loads a texture sequencer that has no type and an object position', () => {
        const behavior = BehaviorFromJSON(
            {
                type: 'ApplySequences',
                delay: 0.2,
                sequencers: [
                    {
                        range: {type: 'IntervalValue', a: 0, b: 1},
                        sequencer: {scaleX: 0.5, scaleY: 0.25, position: {x: 1, y: 2, z: 3}, locations: [{x: 1, y: 2}]},
                    },
                ],
            },
            system
        ) as ApplySequences;
        const sequencer = behavior.sequencers[0][1] as TextureSequencer;
        expect(sequencer).toBeInstanceOf(TextureSequencer);
        expect(sequencer.position).toEqual(new Vector3(1, 2, 3));
        expect(sequencer.locations).toEqual([new Vector2(1, 2)]);
        const position = new Vector3();
        sequencer.transform(position, 0);
        expect(position).toEqual(new Vector3(1.5, 2.5, 3));
    });
});
