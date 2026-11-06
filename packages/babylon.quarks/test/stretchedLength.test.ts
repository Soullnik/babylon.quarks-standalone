import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConeEmitter, ConstantColor, ConstantValue, PointEmitter, Vector3, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {default as glsl} from '../src/shaders/stretched_bb_particle_vert.glsl';
import {default as wgsl} from '../src/shaders/stretched_bb_particle_vert.wgsl';
import type {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

/**
 * A stretched billboard as Unity draws it, measured with BakeMesh in Unity 6: from the particle
 * back along its velocity, size × Length Scale + speed × Speed Scale long (the speed's part is not
 * scaled by the size), as wide as the size; ahead of it for negative factors; nothing at all for a
 * particle that does not move. Sparks of size 0.017, speed 2, Speed Scale −0.14
 * were drawn 0.005 long, dots, instead of 0.28.
 */
describe('stretched billboard length', () => {
    it.each([
        ['GLSL', glsl],
        ['WGSL', wgsl],
    ])('scales only the length factor by the size, and lays the quad along the streak (%s)', (_name, source) => {
        // The velocity arrives scaled by the speed factor; the size scales the length factor alone.
        expect(source).toMatch(/streak = viewVelocity \+ vdir \* lengthFactor \* avgSize;/);
        expect(source).not.toMatch(/\(viewVelocity \+ vdir \* lengthFactor\) \* avgSize/);
        // The quad spans the streak from the particle, its side square to it.
        expect(source).toMatch(/\((?:\w+\.)?position\.x \+ 0\.5\) \* streak/);
        expect(source).toMatch(/sideRaw = cross\(mvPosition\.xyz, axis\)/);
        // A motionless particle collapses, as Unity draws nothing of it; a beam keeps its width.
        expect(source).toMatch(/#ifndef BEAM\s*if \(vlength <= 1e-9\) \{\s*avgSize = 0\.0;/);
    });

    /**
     * Measured in Unity 6 (a probe): a particle moving at 0.5, size 0.7, for each Speed
     * Scale and Length Scale; where the streak's tail end lies along the particle's way (behind it
     * when negative), and whether the quad is turned round (its V running the other way).
     */
    it.each([
        [0, 2, -1.4, false],
        [0, -1.6, 1.12, true],
        [1, 0, -0.5, false],
        [-1, 0, 0.5, true],
        [1, 1.6, -1.62, false],
        [-1, -1.6, 1.62, true],
        [-1, 1.6, -0.62, false],
        [1, -1.6, 0.62, true],
    ])(
        'ends the streak where Unity does, Speed Scale %d and Length Scale %d',
        (speedFactor, lengthFactor, tail, turned) => {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            const ps = new ParticleSystem({
                scene,
                worldSpace: true,
                startLife: new ConstantValue(5),
                startSpeed: new ConstantValue(0.5),
                startSize: new ConstantValue(0.7),
                startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
                shape: new ConeEmitter({radius: 0, angle: 0}),
                renderMode: RenderMode.StretchedBillBoard,
                rendererEmitterSettings: {speedFactor, lengthFactor},
            });
            const renderer = new BatchedRenderer('stretch', scene);
            renderer.addSystem(ps);
            renderer.update(1 / 60);
            const batch = renderer.batches[0] as SpriteBatch;
            const v = batch['velocityBuffer'] as Float32Array;
            const size = (batch['sizeBuffer'] as Float32Array)[0];
            // The shader's streak along the way the particle moves, +z here (the camera's turn aside).
            const velocity = new Vector3(v[0], v[1], v[2]);
            const vdir = velocity.clone().normalize();
            const streak = velocity.clone().addScaledVector(vdir, v[3] * size);
            expect(-streak.z).toBeCloseTo(tail, 3);
            // The quad's axis runs along the streak; it is turned round when it points against the way.
            expect(streak.z < 0).toBe(turned);
            renderer.dispose();
            scene.dispose();
            engine.dispose();
        }
    );

    it('pads the culling bounds by the speed part unscaled by the size', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const ps = new ParticleSystem({
            scene,
            worldSpace: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(2),
            startSize: new ConstantValue(0.02),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            shape: new PointEmitter(),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: -0.14, lengthFactor: 0},
        });
        ps.update(1 / 60);
        ps.update(1 / 60);
        const min = new Vector3();
        const max = new Vector3();
        expect(ps.getWorldBounds(min, max)).toBe(true);
        // The streak reaches 2 × 0.14 = 0.28 past the particle, whichever way.
        expect(max.z - min.z).toBeGreaterThan(2 * 0.28);
        scene.dispose();
        engine.dispose();
    });
});
