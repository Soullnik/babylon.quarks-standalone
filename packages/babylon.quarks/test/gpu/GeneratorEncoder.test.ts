import {ConstantValue, Gradient, IntervalValue, PiecewiseBezier, Vector3, Vector4} from 'quarks.core';
import {
    bakeGradient,
    bakeValueCurve,
    CURVE_RESOLUTION,
    GpuSystemEncoder,
} from '../../src/gpu/generators/GeneratorEncoder';

describe('GeneratorEncoder', () => {
    it('bakes value curves that match CPU sampling at texel centers', () => {
        const curve = new PiecewiseBezier();
        const baked = bakeValueCurve(curve);
        expect(baked).toHaveLength(CURVE_RESOLUTION * 4);
        for (const texel of [0, 32, 64, 96, CURVE_RESOLUTION - 1]) {
            const t = texel / (CURVE_RESOLUTION - 1);
            expect(baked[texel * 4]).toBeCloseTo(curve.genValue([], t), 5);
        }
    });

    it('bakes gradients that match CPU sampling at texel centers', () => {
        const gradient = new Gradient(
            [
                [new Vector3(1, 0, 0), 0],
                [new Vector3(0, 0, 1), 1],
            ],
            [
                [1, 0],
                [0, 1],
            ]
        );
        const baked = bakeGradient(gradient);
        const color = new Vector4();
        for (const texel of [0, 64, CURVE_RESOLUTION - 1]) {
            const t = texel / (CURVE_RESOLUTION - 1);
            gradient.genColor([], color, t);
            expect(baked[texel * 4]).toBeCloseTo(color.x, 5);
            expect(baked[texel * 4 + 1]).toBeCloseTo(color.y, 5);
            expect(baked[texel * 4 + 2]).toBeCloseTo(color.z, 5);
            expect(baked[texel * 4 + 3]).toBeCloseTo(color.w, 5);
        }
    });

    it('never bakes NaN, even for degenerate key layouts', () => {
        // quarks.core's default Gradient has both color keys at position 0 and
        // genColor(0) returns NaN on the CPU too — the atlas must stay finite.
        const baked = bakeGradient(new Gradient());
        for (let i = 0; i < baked.length; i++) {
            expect(Number.isFinite(baked[i])).toBe(true);
        }
    });

    it('encodes constants as live-updatable uniform fields', () => {
        const enc = new GpuSystemEncoder();
        const gen = new ConstantValue(2);
        const expr = enc.encodeValue(gen, 'test', 'tLife');
        expect(expr).toMatch(/^params\.g0_test$/);

        const floats = new Float32Array(4);
        enc.fields[0].write(floats, 0);
        expect(floats[0]).toBe(2);
        gen.value = 7; // editor tweak: next frame's write picks it up, no recompile
        enc.fields[0].write(floats, 0);
        expect(floats[0]).toBe(7);
    });

    it('encodes intervals with a per-particle random', () => {
        const enc = new GpuSystemEncoder();
        const expr = enc.encodeValue(new IntervalValue(1, 3), 'life', 'tLife');
        expect(expr).toContain('mix(');
        expect(expr).toContain('prand(seed, 0u)');

        // second stochastic generator claims a distinct random id
        const expr2 = enc.encodeValue(new IntervalValue(0, 1), 'size', 'tLife');
        expect(expr2).toContain('prand(seed, 1u)');
    });

    it('rejects unknown generators', () => {
        const enc = new GpuSystemEncoder();
        expect(() => enc.encodeValue({type: 'value'} as never, 'x', 't')).toThrow(/unsupported value generator/);
        expect(GpuSystemEncoder.canEncodeValue({type: 'value'} as never)).toBe(false);
        expect(GpuSystemEncoder.canEncodeValue(new ConstantValue(1))).toBe(true);
    });
});
