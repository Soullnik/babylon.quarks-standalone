import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    Gradient,
    GravityForce,
    IntervalValue,
    PiecewiseBezier,
    PointEmitter,
    SizeOverLife,
    SphereEmitter,
    Vector3,
    Vector4,
} from 'quarks.core';
import {ParticleSystem, ParticleSystemParameters} from '../../src/ParticleSystem';
import {RenderMode} from '../../src/VFXBatch';
import {encodeSystem, EncodedSystem, EncodeResult} from '../../src/gpu/encodeSystem';
import {
    computeParamsLayout,
    PARAMS_HEAD_FLOATS,
    writeParamFields,
} from '../../src/gpu/generators/GeneratorEncoder';

// tsconfig has strict: false, where truthiness checks don't narrow
// discriminated unions — use explicit helpers instead.
function expectEncoded(result: EncodeResult): EncodedSystem {
    if (result.ok === false) {
        throw new Error(`encode failed: ${result.reasons.join('; ')}`);
    }
    return result.encoded;
}

function expectRejected(result: EncodeResult): string[] {
    if (result.ok === true) {
        throw new Error('expected encoding to be rejected');
    }
    return result.reasons;
}

describe('GPU codegen', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeAll(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterAll(() => {
        scene.dispose();
        engine.dispose();
    });

    const createSystem = (overrides: Partial<ParticleSystemParameters> = {}) =>
        new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new IntervalValue(2, 4),
            startSpeed: new ConstantValue(3),
            startSize: new IntervalValue(0.5, 1.5),
            startColor: new ConstantColor(new Vector4(1, 0.5, 0.25, 1)),
            emissionOverTime: new ConstantValue(100),
            shape: new ConeEmitter({radius: 0.4, angle: Math.PI / 8}),
            renderMode: RenderMode.BillBoard,
            behaviors: [
                new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8)),
                new GravityForce(new Vector3(0, 5, 0), 2),
                new SizeOverLife(new PiecewiseBezier()),
                new ColorOverLife(new Gradient()),
            ],
            ...overrides,
        });

    it('assembles spawn/update/reset kernels for a fountain system (snapshot)', () => {
        const encoded = expectEncoded(encodeSystem(createSystem(), 1024));
        expect(encoded.kernels.spawn).toMatchSnapshot('spawn');
        expect(encoded.kernels.update).toMatchSnapshot('update');
        expect(encoded.kernels.reset).toMatchSnapshot('reset');
    });

    it('produces a stable signature and shares it across identical systems', () => {
        const a = expectEncoded(encodeSystem(createSystem(), 1024));
        const b = expectEncoded(encodeSystem(createSystem(), 1024));
        expect(a.signature).toBe(b.signature);
        expect(a.signature).toContain('shape:cone');
        expect(a.signature).toContain('b:ApplyForce');
    });

    it('changes the signature when behaviors change', () => {
        const a = expectEncoded(encodeSystem(createSystem(), 1024));
        const b = expectEncoded(encodeSystem(createSystem({behaviors: []}), 1024));
        expect(a.signature).not.toBe(b.signature);
    });

    it('tracks curve atlas usage per kernel', () => {
        // curves only in behaviors (SizeOverLife/ColorOverLife) -> update only
        const withCurves = expectEncoded(encodeSystem(createSystem(), 256));
        expect(withCurves.kernels.updateUsesCurves).toBe(true);
        expect(withCurves.kernels.spawnUsesCurves).toBe(false);
        expect(withCurves.kernels.update).toContain('curveAtlas');

        // curve in a start generator -> spawn kernel samples the atlas
        const curveStartSize = expectEncoded(
            encodeSystem(createSystem({startSize: new PiecewiseBezier(), behaviors: []}), 256)
        );
        expect(curveStartSize.kernels.spawnUsesCurves).toBe(true);
        expect(curveStartSize.kernels.updateUsesCurves).toBe(false);

        const withoutCurves = expectEncoded(encodeSystem(createSystem({behaviors: []}), 256));
        expect(withoutCurves.kernels.spawnUsesCurves).toBe(false);
        expect(withoutCurves.kernels.updateUsesCurves).toBe(false);
        expect(withoutCurves.kernels.update).not.toContain('curveAtlas');
    });

    it('supports point and sphere emitters', () => {
        for (const shape of [new PointEmitter(), new SphereEmitter({radius: 2})]) {
            expectEncoded(encodeSystem(createSystem({shape}), 256));
        }
    });

    it('reports unsupported configurations instead of throwing', () => {
        const reasons = expectRejected(encodeSystem(createSystem({shape: new SphereEmitter({mode: 1})}), 256));
        expect(reasons.join('\n')).toContain('emitter mode');
    });

    it('writes generator params at std430-compatible offsets', () => {
        const encoded = expectEncoded(encodeSystem(createSystem(), 256));
        const layout = computeParamsLayout(encoded.fields);

        for (let i = 0; i < encoded.fields.length; i++) {
            const field = encoded.fields[i];
            const align = field.wgslType === 'vec4f' ? 4 : field.wgslType === 'vec2f' ? 2 : 1;
            expect(layout.offsets[i] % align).toBe(0);
            expect(layout.offsets[i]).toBeGreaterThanOrEqual(PARAMS_HEAD_FLOATS);
        }
        expect(layout.totalFloats % 4).toBe(0);

        const floats = new Float32Array(layout.totalFloats);
        writeParamFields(encoded.fields, layout, floats);
        // ApplyForce field: direction (0,-1,0) + magnitude 9.8
        const applyForceIndex = encoded.fields.findIndex((f) => f.name.includes('applyForce'));
        const o = layout.offsets[applyForceIndex];
        expect(floats[o]).toBe(0);
        expect(floats[o + 1]).toBe(-1);
        expect(floats[o + 2]).toBe(0);
        expect(floats[o + 3]).toBeCloseTo(9.8, 5);
    });
});
