import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    PiecewiseBezier,
    PointEmitter,
    SizeOverLife,
    Vector4,
} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

describe('over-life curves of a system', () => {
    it('show the age the particle is drawn at, as Unity does', () => {
        const ps = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0, cycle: 1}],
            shape: new PointEmitter(),
            worldSpace: true,
            behaviors: [
                new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 20, 40, 60), 0]])),
                new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 2 / 3, 1 / 3, 0), 0]])),
            ],
        });
        ps.play();
        for (let i = 0; i < 30; i++) ps.update(1 / 60);
        const p = ps.particles[0];
        // Thirty steps of 1/60: the particle is half a second old, drawn there, and its curves
        // read there too. They lagged a step behind (frame 29, size 31/60) before.
        expect(p.age).toBeCloseTo(0.5, 6);
        expect(p.uvTile).toBeCloseTo(30, 3);
        expect(p.size.x).toBeCloseTo(0.5, 4);
    });
});
