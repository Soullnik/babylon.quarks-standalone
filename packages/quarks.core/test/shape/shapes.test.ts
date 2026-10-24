import {
    BoxEmitter,
    CircleEmitter,
    ConeEmitFrom,
    ConeEmitter,
    ConstantValue,
    createSeededRandom,
    DonutEmitter,
    EdgeEmitter,
    EmissionState,
    EmitterFromJSON,
    EmitterMode,
    EmitterShape,
    EmitterShapes,
    GridEmitter,
    GridSampling,
    HemisphereEmitter,
    PointEmitter,
    RectangleEmitter,
    ShapeJSON,
    ShapeTransform,
    SphereEmitter,
    SpriteParticle,
    Vector3,
    withRandomSource,
} from '../../src';

const emissionState = (): EmissionState => ({
    isBursting: false,
    burstParticleIndex: 0,
    burstParticleCount: 0,
    burstIndex: 0,
    burstWaveIndex: 0,
    time: 0,
    waitEmiting: 0,
    travelDistance: 0,
});

const SPEED = 3;

/** Positions and velocities of `count` particles from `shape`, with a seeded random source. */
function sample(shape: EmitterShape, count = 4000) {
    return withRandomSource(createSeededRandom(1), () => {
        const out: Array<{p: Vector3; v: Vector3}> = [];
        for (let i = 0; i < count; i++) {
            const particle = new SpriteParticle();
            particle.startSpeed = SPEED;
            shape.initialize(particle, emissionState());
            out.push({p: particle.position.clone(), v: particle.velocity.clone()});
        }
        return out;
    });
}

const fraction = <T>(items: T[], test: (item: T) => boolean) => items.filter(test).length / items.length;
const radial = (p: Vector3) => Math.hypot(p.x, p.y);

describe('thickness fills evenly', () => {
    it('spreads a full sphere and hemisphere evenly over their volume', () => {
        for (const shape of [new SphereEmitter({radius: 2}), new HemisphereEmitter({radius: 2})]) {
            const points = sample(shape);
            for (const {p} of points) expect(p.length()).toBeLessThanOrEqual(2 + 1e-6);
            // An eighth of a ball's volume lies within half its radius.
            expect(fraction(points, ({p}) => p.length() < 1)).toBeCloseTo(0.125, 1);
        }
    });

    it('spreads a sphere shell evenly over the shell', () => {
        const points = sample(new SphereEmitter({radius: 1, thickness: 0.5}));
        for (const {p} of points) {
            expect(p.length()).toBeGreaterThanOrEqual(0.5 - 1e-6);
            expect(p.length()).toBeLessThanOrEqual(1 + 1e-6);
        }
        // (0.75³ − 0.5³) / (1 − 0.5³) of the shell lies within 0.75 of the centre.
        expect(fraction(points, ({p}) => p.length() < 0.75)).toBeCloseTo((0.421875 - 0.125) / 0.875, 1);
    });

    it('spreads a full circle and cone base evenly over their area', () => {
        for (const shape of [new CircleEmitter({radius: 2}), new ConeEmitter({radius: 2})]) {
            const points = sample(shape);
            for (const {p} of points) expect(radial(p)).toBeLessThanOrEqual(2 + 1e-6);
            expect(fraction(points, ({p}) => radial(p) < 1)).toBeCloseTo(0.25, 1);
        }
    });

    it('fills a full rectangle, each edge in proportion to its length, evenly over its band', () => {
        const points = sample(new RectangleEmitter({width: 4, height: 2}));
        for (const {p} of points) {
            expect(Math.abs(p.x)).toBeLessThanOrEqual(2 + 1e-6);
            expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-6);
        }
        // A quarter of the rectangle's area lies in its copy at half size.
        expect(fraction(points, ({p}) => Math.abs(p.x) < 1 && Math.abs(p.y) < 0.5)).toBeCloseTo(0.25, 1); // The bands of the long edges, the triangles above and below the diagonals, get 4 + 4 of
        // the 12 units of outline.
        expect(fraction(points, ({p}) => Math.abs(p.y) / 1 > Math.abs(p.x) / 2)).toBeCloseTo(8 / 12, 1);
    });

    it('spreads a donut tube evenly over its cross-section', () => {
        const points = sample(new DonutEmitter({radius: 5, donutRadius: 1}));
        const tube = ({p}: {p: Vector3}) => Math.hypot(radial(p) - 5, p.z);
        for (const point of points) expect(tube(point)).toBeLessThanOrEqual(1 + 1e-6);
        expect(fraction(points, (point) => tube(point) < 0.5)).toBeCloseTo(0.25, 1);
    });

    it('keeps every point on the surface at thickness 0', () => {
        for (const {p} of sample(new SphereEmitter({radius: 2, thickness: 0}), 200)) {
            expect(p.length()).toBeCloseTo(2, 5);
        }
        for (const {p} of sample(new CircleEmitter({radius: 2, thickness: 0}), 200)) {
            expect(radial(p)).toBeCloseTo(2, 5);
        }
        for (const {p} of sample(new RectangleEmitter({width: 4, height: 2, thickness: 0}), 200)) {
            expect(Math.abs(Math.abs(p.x) - 2) < 1e-6 || Math.abs(Math.abs(p.y) - 1) < 1e-6).toBe(true);
        }
    });
});

describe('out-of-range inputs', () => {
    it('clamps thickness to [0, 1] and reads a negative size as 0', () => {
        for (const {p} of sample(new SphereEmitter({radius: 1, thickness: 2}), 500)) {
            expect(p.length()).toBeLessThanOrEqual(1 + 1e-6);
        }
        for (const {p} of sample(new CircleEmitter({radius: 1, thickness: -1}), 200)) {
            expect(radial(p)).toBeCloseTo(1, 5);
        }
        for (const {p, v} of sample(new SphereEmitter({radius: -1}), 200)) {
            expect(p.length()).toBe(0);
            expect(v.length()).toBeCloseTo(SPEED, 5);
        }
    });

    it('reads a NaN thickness as 1 and an infinite grid count as 1', () => {
        for (const {p} of sample(new SphereEmitter({radius: 1, thickness: NaN}), 200)) {
            expect(p.length()).toBeLessThanOrEqual(1 + 1e-6);
        }
        for (const {p} of sample(new GridEmitter({width: 2, height: 2, column: Infinity, row: NaN}), 20)) {
            expect([p.x, p.y]).toEqual([0, 0]);
        }
    });

    it('clamps the cone angle to [0, π/2]', () => {
        const wide = sample(new ConeEmitter({radius: 1, thickness: 0, angle: Math.PI}), 200);
        for (const {v} of wide) expect(v.z).toBeGreaterThanOrEqual(-1e-6);
    });

    it('clamps box thickness to 1', () => {
        const box = new BoxEmitter({width: 2, height: 2, depth: 2, boxThickness: [5, 5, 5]});
        box.emitFrom = 1;
        for (const {p} of sample(box, 500)) {
            for (const c of [p.x, p.y, p.z]) expect(Math.abs(c)).toBeLessThanOrEqual(1 + 1e-6);
        }
    });
});

describe('velocity', () => {
    const shapes: Array<[string, EmitterShape]> = [
        ['sphere', new SphereEmitter()],
        ['hemisphere', new HemisphereEmitter()],
        ['circle', new CircleEmitter()],
        ['cone', new ConeEmitter()],
        ['donut', new DonutEmitter()],
        ['rectangle', new RectangleEmitter()],
        ['grid', new GridEmitter()],
        ['edge', new EdgeEmitter()],
        ['point', new PointEmitter()],
        ['box', new BoxEmitter()],
        ['a donut with no tube', new DonutEmitter({radius: 2, donutRadius: 0})],
        ['a donut on its centre line', new DonutEmitter({radius: 2, thickness: 0.5, donutRadius: 0})],
        ['a rectangle with no size', new RectangleEmitter({width: 0, height: 0})],
        ['a rectangle with no width', new RectangleEmitter({width: 0, height: 2})],
    ];

    it.each(shapes)('%s starts every particle at its start speed', (_, shape) => {
        for (const {v} of sample(shape, 300)) expect(v.length()).toBeCloseTo(SPEED, 5);
    });

    it('heads a donut with no tube straight out from its centre line', () => {
        for (const {p, v} of sample(new DonutEmitter({radius: 2, donutRadius: 0}), 200)) {
            expect(radial(p)).toBeCloseTo(2, 5);
            // The direction is in the plane through z and the point on the centre line.
            expect(p.x * v.y - p.y * v.x).toBeCloseTo(0, 5);
        }
    });
});

describe('RectangleEmitter', () => {
    it('runs the outline counter-clockwise from the bottom left corner', () => {
        const shape = new RectangleEmitter({width: 4, height: 2, thickness: 0, mode: EmitterMode.Loop});
        const at = (u: number) => {
            (shape as unknown as {currentValue: number}).currentValue = u;
            const particle = new SpriteParticle();
            particle.startSpeed = 1;
            shape.initialize(particle, emissionState());
            return [particle.position.x, particle.position.y];
        };
        // The perimeter is 12: the bottom edge is 4 long, the right 2, the top 4, the left 2.
        expect(at(0)).toEqual([-2, -1]);
        expect(at(2 / 12)).toEqual([0, -1]);
        expect(at(5 / 12)).toEqual([2, 0]);
        expect(at(8 / 12)).toEqual([0, 1]);
        expect(at(11 / 12)).toEqual([-2, 0]);
    });

    it('does not advance the sweep in Random mode', () => {
        const shape = new RectangleEmitter();
        const system = {emissionState: {time: 0}, duration: 1} as never;
        shape.update(system, 1);
        expect((shape as unknown as {currentValue: number}).currentValue).toBe(0);
        const circle = new CircleEmitter();
        circle.update(system, 1);
        expect((circle as unknown as {currentValue: number}).currentValue).toBe(0);
    });
});

describe('GridEmitter', () => {
    it('emits from cell centres, symmetric about the origin', () => {
        const points = sample(new GridEmitter({width: 2, height: 2, column: 2, row: 2}), 400);
        const distinct = new Set(points.map(({p}) => `${p.x},${p.y},${p.z}`));
        expect([...distinct].sort()).toEqual(['-0.5,-0.5,0', '-0.5,0.5,0', '0.5,-0.5,0', '0.5,0.5,0']);
    });

    it('reads a count below 1 or a fraction as a whole number of at least 1', () => {
        for (const {p} of sample(new GridEmitter({width: 2, height: 2, column: 0, row: 1.7}), 50)) {
            expect(p.x).toBe(0);
            expect(p.y).toBe(0);
        }
    });
});

describe('ConeEmitter', () => {
    const tilt = (v: Vector3) => Math.atan2(Math.hypot(v.x, v.y), v.z);

    it('tilts a particle by atan(r · tan(angle)) at the fraction r of the radius, as Unity', () => {
        const angle = Math.PI / 3;
        for (const {p, v} of sample(new ConeEmitter({radius: 2, angle}), 500)) {
            const r = radial(p) / 2;
            expect(tilt(v)).toBeCloseTo(Math.atan(r * Math.tan(angle)), 6);
            expect(v.length()).toBeCloseTo(SPEED, 6);
            // Heads away from the axis, in the plane through it and its start point.
            if (r > 1e-3) expect((p.x * v.y - p.y * v.x) / (radial(p) * SPEED)).toBeCloseTo(0, 6);
        }
    });

    it('heads the rim out at the full angle', () => {
        for (const {v} of sample(new ConeEmitter({radius: 1, thickness: 0, angle: 0.5}), 50)) {
            expect(tilt(v)).toBeCloseTo(0.5, 6);
        }
    });

    it('sprays a cone of no radius from its apex through the whole angle, as Unity', () => {
        const points = sample(new ConeEmitter({radius: 0, angle: 0.5}), 500);
        for (const {p, v} of points) {
            expect(p.length()).toBe(0);
            expect(tilt(v)).toBeLessThanOrEqual(0.5 + 1e-9);
        }
        expect(Math.max(...points.map(({v}) => tilt(v)))).toBeGreaterThan(0.45);
    });

    it('opens to a flat disc at π/2, the centre still along z', () => {
        for (const {p, v} of sample(new ConeEmitter({radius: 1, angle: Math.PI / 2}), 200)) {
            if (radial(p) > 1e-3) expect(v.z).toBeCloseTo(0, 6);
        }
    });

    it('emits from the base unless told to fill the volume, and ignores the length there', () => {
        expect(new ConeEmitter().emitFrom).toBe(ConeEmitFrom.Base);
        expect(new ConeEmitter().length).toBe(5);
        for (const {p} of sample(new ConeEmitter({length: 4}), 100)) expect(p.z).toBe(0);
    });

    it('fills the volume along the side lines, from the base out to its length', () => {
        const radius = 1;
        const angle = Math.PI / 4;
        const length = 2;
        const points = sample(new ConeEmitter({radius, angle, length, emitFrom: ConeEmitFrom.Volume}));
        for (const {p, v} of points) {
            expect(p.z).toBeGreaterThanOrEqual(0);
            expect(p.z).toBeLessThanOrEqual(length + 1e-9);
            // Inside the cone's frustum, which widens by tan(angle) per unit of height.
            expect(radial(p)).toBeLessThanOrEqual(radius + p.z * Math.tan(angle) + 1e-9);
            // On its own side line: back at the base the point is where the velocity started.
            const back = p.z / v.z;
            const base = Math.hypot(p.x - v.x * back, p.y - v.y * back);
            expect(base).toBeLessThanOrEqual(radius + 1e-9);
            expect(tilt(v)).toBeCloseTo(Math.atan((base / radius) * Math.tan(angle)), 6);
        }
        // Heights are spread evenly along the length.
        expect(fraction(points, ({p}) => p.z < length / 2)).toBeCloseTo(0.5, 1);
    });

    it('keeps a near-flat volume continuous, following side lines past 89° as if at 89°', () => {
        const reach = (angle: number) => {
            const shape = new ConeEmitter({radius: 1, thickness: 0, angle, length: 1, emitFrom: 1});
            return Math.max(...sample(shape, 400).map(({p}) => radial(p)));
        };
        const cap = 1 + 1 / Math.cos((89 * Math.PI) / 180);
        for (const angle of [Math.PI / 2 - 1e-5, Math.PI / 2 - 1e-9, Math.PI / 2]) {
            expect(reach(angle)).toBeLessThanOrEqual(cap + 1e-6);
            expect(reach(angle)).toBeGreaterThan(cap * 0.95);
        }
        // Below 89° the cone keeps Unity's own geometry.
        expect(reach(Math.PI / 4)).toBeCloseTo(2, 1);
    });

    it('reads a negative or non-finite length as 0', () => {
        for (const length of [-3, NaN, Infinity]) {
            const shape = new ConeEmitter({length, emitFrom: ConeEmitFrom.Volume});
            for (const {p} of sample(shape, 50)) {
                expect(p.z).toBe(0);
                expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            }
        }
    });

    it('fills the volume in the shape transform, which scales the length too', () => {
        const transform = new ShapeTransform();
        transform.scale.set(1, 1, 3);
        const shape = new ConeEmitter({radius: 1, angle: 0, length: 2, emitFrom: ConeEmitFrom.Volume, transform});
        const points = sample(shape, 400);
        for (const {p} of points) expect(p.z).toBeLessThanOrEqual(6 + 1e-9);
        expect(Math.max(...points.map(({p}) => p.z))).toBeGreaterThan(5.5);
    });
});

describe('GridEmitter sampling', () => {
    const cells = (shape: GridEmitter, count: number) => sample(shape, count).map(({p}) => `${p.x},${p.y}`);

    it('picks cells at random by default', () => {
        expect(new GridEmitter().sampling).toBe(GridSampling.Random);
    });

    it('visits every cell in turn, row by row from -x, -y, then starts over', () => {
        const shape = new GridEmitter({width: 2, height: 2, column: 2, row: 2, sampling: GridSampling.Sequential});
        expect(cells(shape, 6)).toEqual(['-0.5,-0.5', '0.5,-0.5', '-0.5,0.5', '0.5,0.5', '-0.5,-0.5', '0.5,-0.5']);
    });

    it('puts one particle in every cell for a burst of row × column', () => {
        const shape = new GridEmitter({width: 3, height: 4, column: 3, row: 4, sampling: GridSampling.Sequential});
        expect(new Set(cells(shape, 12)).size).toBe(12);
    });

    it('starts over at the first cell on reset, and a clone at its own first cell', () => {
        const shape = new GridEmitter({width: 2, height: 2, column: 2, row: 2, sampling: GridSampling.Sequential});
        cells(shape, 3);
        const copy = shape.clone() as GridEmitter;
        shape.reset();
        expect(cells(shape, 1)).toEqual(['-0.5,-0.5']);
        expect(cells(copy, 1)).toEqual(['-0.5,-0.5']);
    });

    it('keeps its place when the grid shrinks under it', () => {
        const shape = new GridEmitter({width: 2, height: 2, column: 2, row: 2, sampling: GridSampling.Sequential});
        cells(shape, 3);
        shape.column = 1;
        shape.row = 1;
        expect(cells(shape, 2)).toEqual(['0,0', '0,0']);
    });
});

describe('the shape registry', () => {
    const nonDefault: Record<string, ShapeJSON> = {
        box: {type: 'box', width: 2, height: 3, depth: 4, emitFrom: 1, boxThickness: [0.1, 0.2, 0.3]},
        circle: {type: 'circle', radius: 2, arc: 1, thickness: 0.5, mode: 1, spread: 0.25},
        cone: {
            type: 'cone',
            radius: 2,
            arc: 1,
            thickness: 0.5,
            angle: 0.4,
            emitFrom: 1,
            length: 3,
            mode: 2,
            spread: 0.25,
        },
        donut: {type: 'donut', radius: 2, arc: 1, thickness: 0.5, donutRadius: 0.3, mode: 3, spread: 0.25},
        edge: {type: 'edge', radius: 2, mode: 1, spread: 0.25},
        point: {type: 'point'},
        sphere: {type: 'sphere', radius: 2, arc: 1, thickness: 0.5, mode: 1, spread: 0.25},
        hemisphere: {type: 'hemisphere', radius: 2, arc: 1, thickness: 0.5, mode: 1, spread: 0.25},
        grid: {type: 'grid', width: 2, height: 3, column: 4, row: 5, sampling: 1},
        rectangle: {type: 'rectangle', width: 2, height: 3, thickness: 0.5, mode: 1, spread: 0.25},
    };
    const transform = new ShapeTransform();
    transform.position.set(1, 2, 3);

    it.each(Object.keys(EmitterShapes))('%s lists only fields its class has and its JSON writes', (type) => {
        const plugin = EmitterShapes[type];
        const shape = plugin.loadJSON({...nonDefault[type], transform: transform.toJSON()}, {} as never);
        const json = shape.toJSON() as unknown as Record<string, unknown>;
        for (const [name] of plugin.params) {
            expect(name in shape || (shape as unknown as Record<string, unknown>)[name] !== undefined).toBe(true);
            expect(json[name]).toBeDefined();
        }
    });

    it.each(Object.keys(nonDefault))('%s round-trips every field through its JSON', (type) => {
        const json = {...nonDefault[type], transform: transform.toJSON()};
        const shape = EmitterFromJSON(json, {} as never);
        const written = shape.toJSON() as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(json)) expect(written[key]).toEqual(value);
        expect(EmitterFromJSON(shape.toJSON(), {} as never).toJSON()).toEqual(shape.toJSON());
        expect(shape.clone().toJSON()).toEqual(shape.toJSON());
    });

    it('gives a clone its own speed generator', () => {
        const shape = new SphereEmitter({speed: new ConstantValue(2)});
        const copy = shape.clone() as SphereEmitter;
        (copy.speed as ConstantValue).value = 5;
        expect((shape.speed as ConstantValue).value).toBe(2);
    });
});
