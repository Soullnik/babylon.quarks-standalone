import {
    BoxEmitFrom,
    BoxEmitter,
    ColorOverLife,
    ConeEmitFrom,
    ConeEmitter,
    EmitterMode,
    GridEmitter,
    GridSampling,
    PointEmitter,
    SphereEmitter,
} from 'babylon.quarks';
import {
    buildColorOverLife,
    buildGradient,
    DEFAULT_GRADIENT_STOPS,
    findBehavior,
    hexToRgb,
    readGradientStops,
    rgbToHex,
    stopsToCssGradient,
    stopToCss,
} from '../src/core/colors';
import {
    createShape,
    DEFAULT_SHAPE_PARAMS,
    getShapeType,
    readShapeParams,
    SHAPE_PARAM_KEYS,
    SHAPE_TYPES,
    ShapeParams,
    ShapeType,
} from '../src/core/shapes';

describe('gradients and colours', () => {
    it('round-trips stops through a Gradient', () => {
        const stops = [
            {pos: 0, r: 1, g: 0.5, b: 0.25, a: 1},
            {pos: 0.5, r: 0, g: 1, b: 0, a: 0.5},
            {pos: 1, r: 0, g: 0, b: 1, a: 0},
        ];
        const read = readGradientStops(buildGradient([...stops].reverse()));
        expect(read).toHaveLength(3);
        for (let i = 0; i < stops.length; i++) {
            expect(read[i].pos).toBeCloseTo(stops[i].pos, 6);
            expect(read[i].r).toBeCloseTo(stops[i].r, 6);
            expect(read[i].g).toBeCloseTo(stops[i].g, 6);
            expect(read[i].b).toBeCloseTo(stops[i].b, 6);
            expect(read[i].a).toBeCloseTo(stops[i].a, 6);
        }
    });

    it('builds a ColorOverLife and finds it by type', () => {
        const behavior = buildColorOverLife(DEFAULT_GRADIENT_STOPS);
        expect(behavior).toBeInstanceOf(ColorOverLife);
        expect(findBehavior<ColorOverLife>([behavior], 'ColorOverLife')).toBe(behavior);
        expect(findBehavior([behavior], 'SizeOverLife')).toBeUndefined();
    });

    it('converts between hex and unit rgb, and writes css', () => {
        expect(hexToRgb('#ff8000')).toEqual({r: 1, g: 128 / 255, b: 0});
        expect(rgbToHex(1, 128 / 255, 0)).toBe('#ff8000');
        expect(rgbToHex(2, -1, 0.5)).toBe('#ff0080');
        expect(stopToCss({pos: 0, r: 1, g: 0, b: 0, a: 0.5})).toBe('rgba(255, 0, 0, 0.50)');
        expect(stopsToCssGradient(DEFAULT_GRADIENT_STOPS)).toMatch(
            /^linear-gradient\(90deg, rgba\(255, 217, 102, 1\.00\) 0\.0%, /
        );
    });
});

describe('shapes', () => {
    it('creates every listed shape type and reads its type back', () => {
        for (const {value} of SHAPE_TYPES) {
            if (value === 'mesh_surface') {
                continue;
            }
            const shape = createShape(value, DEFAULT_SHAPE_PARAMS);
            expect(getShapeType(shape)).toBe(value);
        }
        expect(getShapeType(new PointEmitter())).toBe('point');
    });

    it('round-trips the parameters each shape exposes', () => {
        const params = {
            ...DEFAULT_SHAPE_PARAMS,
            radius: 2,
            arc: Math.PI,
            thickness: 0.5,
            angle: 0.3,
            donutRadius: 0.4,
            width: 3,
            height: 4,
            column: 5,
            row: 6,
            depth: 2.5,
            emitFrom: BoxEmitFrom.Shell,
            speed: 3,
            mode: EmitterMode.Loop,
            spread: 0.25,
        };
        expect(readShapeParams(createShape('box', params)).emitFrom).toBe(BoxEmitFrom.Shell);
        expect(readShapeParams(createShape('edge', params)).mode).toBe(EmitterMode.Loop);
        for (const type of Object.keys(SHAPE_PARAM_KEYS) as ShapeType[]) {
            if (type === 'mesh_surface') {
                continue;
            }
            const read = readShapeParams(createShape(type, params));
            for (const key of SHAPE_PARAM_KEYS[type]) {
                expect(read[key]).toBeCloseTo(params[key] as number, 6);
            }
        }
    });

    it('keeps the emission mode and spread on the shapes that have them', () => {
        const cone = createShape('cone', {
            ...DEFAULT_SHAPE_PARAMS,
            mode: EmitterMode.PingPong,
            spread: 0.5,
        }) as ConeEmitter;
        expect(cone.mode).toBe(EmitterMode.PingPong);
        expect(cone.spread).toBe(0.5);
        const sphere = createShape('sphere', {...DEFAULT_SHAPE_PARAMS, radius: 7}) as SphereEmitter;
        expect(sphere.radius).toBe(7);
        const grid = createShape('grid', {...DEFAULT_SHAPE_PARAMS, column: 3, row: 2}) as GridEmitter;
        expect(grid.column).toBe(3);
        expect(grid.row).toBe(2);
    });

    it("keeps a cone's Emit from apart from a box's, and a grid's sampling", () => {
        const params: ShapeParams = {
            ...DEFAULT_SHAPE_PARAMS,
            emitFrom: BoxEmitFrom.Shell,
            coneEmitFrom: ConeEmitFrom.Volume,
            length: 3,
            sampling: GridSampling.Sequential,
        };
        const cone = createShape('cone', params) as ConeEmitter;
        expect([cone.emitFrom, cone.length]).toEqual([ConeEmitFrom.Volume, 3]);
        const box = createShape('box', params) as BoxEmitter;
        expect(box.emitFrom).toBe(BoxEmitFrom.Shell);
        expect(readShapeParams(cone)).toMatchObject({
            coneEmitFrom: ConeEmitFrom.Volume,
            emitFrom: DEFAULT_SHAPE_PARAMS.emitFrom,
            length: 3,
        });
        expect(readShapeParams(box)).toMatchObject({emitFrom: BoxEmitFrom.Shell, coneEmitFrom: ConeEmitFrom.Base});
        const grid = createShape('grid', params) as GridEmitter;
        expect(grid.sampling).toBe(GridSampling.Sequential);
        expect(readShapeParams(grid).sampling).toBe(GridSampling.Sequential);
    });
});
