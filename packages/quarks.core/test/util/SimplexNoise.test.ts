import {SimplexNoise} from '../../src/util/SimplexNoise';

describe('SimplexNoise', function () {
    test('noise at pos 0 = 0', function () {
        const noise = new SimplexNoise();
        expect(noise.noise2D(0, 0)).toBeCloseTo(0);
        expect(noise.noise3D(0, 0, 0)).toBeCloseTo(0);
        expect(noise.noise4D(0, 0, 0, 0)).toBeCloseTo(0);
    });

    test('the in-place samplers give what the returning ones do', function () {
        const noise = new SimplexNoise(3);
        const io = new Float64Array(6);
        for (const [x, y, z, w] of [
            [0.3, -1.7, 2.2, 0.9],
            [12.5, 4.25, -3, 7],
            [-0.01, 0.02, 0.5, -8],
        ]) {
            io.set([9, x, y], 0);
            noise.noise2DInPlace(io, 1);
            expect(io[1]).toBe(noise.noise2D(x, y));
            expect(io[0]).toBe(9);
            io.set([9, x, y, z, w], 0);
            noise.noise4DInPlace(io, 1);
            expect(io[1]).toBe(noise.noise4D(x, y, z, w));
            expect(io[0]).toBe(9);
        }
    });
});
