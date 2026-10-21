/**
 * How effect files are read when a part is unknown or missing: the part warns and takes its
 * default, and no raw TypeError escapes, so one bad behavior or curve costs only itself.
 */
import {
    BehaviorFromJSON,
    BehaviorTypes,
    ColorGeneratorFromJSON,
    ConstantColor,
    ConstantValue,
    EmitterFromJSON,
    EmitterShapes,
    GeneratorFromJSON,
    loadPlugin,
    Noise,
    Plugins,
    PointEmitter,
    RandomQuatGenerator,
    RotationGeneratorFromJSON,
    unloadPlugin,
    ValueGeneratorFromJSON,
    Vector3,
    Vector3Function,
    Vector3GeneratorFromJSON,
} from '../src';

const system = {} as never;
let warn: jest.SpyInstance;

beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    warn.mockRestore();
});

describe('reading an unknown or missing part', () => {
    test.each([
        ['value', ValueGeneratorFromJSON, ConstantValue],
        ['colour', ColorGeneratorFromJSON, ConstantColor],
        ['rotation', RotationGeneratorFromJSON, RandomQuatGenerator],
        ['vector', Vector3GeneratorFromJSON, Vector3Function],
        ['any', GeneratorFromJSON, ConstantValue],
    ] as Array<[string, (json: never) => unknown, new (...args: never[]) => unknown]>)(
        'a %s generator warns and gives its default',
        (_kind, read, fallback) => {
            for (const json of [{type: 'Bogus'}, undefined]) {
                expect(read(json as never)).toBeInstanceOf(fallback);
            }
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Bogus"'));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('nothing'));
        }
    );

    test('a shape warns and gives a point emitter', () => {
        expect(EmitterFromJSON({type: 'bogus'} as never, {} as never)).toBeInstanceOf(PointEmitter);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"bogus"'));
    });

    test('a behavior warns and is skipped', () => {
        expect(BehaviorFromJSON({type: 'Bogus'}, system)).toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Bogus"'));
    });

    test.each(Object.keys(BehaviorTypes))('%s reads from its type alone', (type) => {
        expect(() => BehaviorFromJSON({type}, system)).not.toThrow();
    });

    test.each(Object.keys(BehaviorTypes))('%s reads with no NaN where a number is missing', (type) => {
        const behavior = BehaviorFromJSON({type}, system) as unknown as Record<string, unknown>;
        // Underscored fields are per-frame caches, NaN until the first frame by design.
        for (const [key, value] of Object.entries(behavior)) {
            if (typeof value === 'number' && !key.startsWith('_')) {
                expect([key, value]).not.toEqual([key, NaN]);
            }
        }
    });

    test('Noise written before the amounts existed takes the constructor defaults', () => {
        const noise = BehaviorFromJSON(
            {type: 'Noise', frequency: {type: 'ConstantValue', value: 1}, power: {type: 'ConstantValue', value: 1}},
            system
        ) as Noise;
        expect(noise.positionAmount.toJSON()).toEqual(new ConstantValue(1).toJSON());
        expect(noise.rotationAmount.toJSON()).toEqual(new ConstantValue(0).toJSON());
        expect(warn).not.toHaveBeenCalled();
    });

    test('ApplyForce and TurbulenceField read their vectors with defaults', () => {
        const force = BehaviorFromJSON({type: 'ApplyForce', magnitude: {type: 'ConstantValue', value: 1}}, system);
        expect((force as unknown as {direction: Vector3}).direction).toEqual(new Vector3(0, 0, 0));
        const turbulence = BehaviorFromJSON({type: 'TurbulenceField', scale: [2, 2]}, system) as unknown as {
            scale: Vector3;
            velocityMultiplier: Vector3;
        };
        expect(turbulence.scale).toEqual(new Vector3(2, 2, 1));
        expect(turbulence.velocityMultiplier).toEqual(new Vector3(1, 1, 1));
    });
});

describe('plugins', () => {
    const shape = {type: 'test_shape', params: [], constructor: PointEmitter, loadJSON: () => new PointEmitter()};
    const behavior = {
        type: 'TestBehavior',
        params: [],
        constructor: Object as never,
        loadJSON: () => ({type: 'TestBehavior'}) as never,
    };

    test('load once, and unload what they registered', () => {
        const initialize = jest.fn();
        const plugin = {id: 'test', initialize, emitterShapes: [shape], behaviors: [behavior]};
        loadPlugin(plugin);
        loadPlugin(plugin);
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(Plugins).toContain(plugin);
        expect(EmitterShapes.test_shape).toBe(shape);
        expect(BehaviorTypes.TestBehavior).toBe(behavior);

        unloadPlugin('test');
        expect(Plugins).not.toContain(plugin);
        expect(EmitterShapes.test_shape).toBeUndefined();
        expect(BehaviorTypes.TestBehavior).toBeUndefined();
        // Loadable again after an unload.
        loadPlugin(plugin);
        expect(initialize).toHaveBeenCalledTimes(2);
        unloadPlugin('test');
    });

    test('leave the types another plugin registered first', () => {
        const first = {id: 'first', initialize: () => {}, emitterShapes: [shape], behaviors: []};
        const other = {...shape, loadJSON: () => new PointEmitter()};
        const second = {id: 'second', initialize: () => {}, emitterShapes: [other], behaviors: []};
        loadPlugin(first);
        loadPlugin(second);
        expect(EmitterShapes.test_shape).toBe(shape);
        unloadPlugin('second');
        expect(EmitterShapes.test_shape).toBe(shape);
        unloadPlugin('first');
        expect(EmitterShapes.test_shape).toBeUndefined();
        unloadPlugin('never loaded');
    });
});
