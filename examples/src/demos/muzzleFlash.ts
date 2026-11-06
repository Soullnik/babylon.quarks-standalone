import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    Bezier,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
} from 'babylon.quarks';
import {createColorOverLifeRange} from '../shared/common';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** Seconds in which every gun fires once. */
const FIRE_PERIOD = 1;
/** The systems of one gun: beam, flash, two muzzles, smoke and sparks. */
const SYSTEMS_PER_GUN = 6;

export function init({scene, camera, add, systems}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(-4, 12, 14));
    camera.setTarget(new BVector3(0, 0, -1));
    addGround(scene, -0.6);
    const glow = baseTexture(scene, 'glow');
    const flashSheet = baseTexture(scene, 'flash');
    const smokeSheet = baseTexture(scene, 'smoke_puff');
    const streak = baseTexture(scene, 'streak');

    for (let i = 0; i < 100; i++) {
        const posX = Math.floor(i / 10) * 2 - 10;
        const posZ = (i % 10) * 2 - 10;
        const position = new BVector3(posX, 0, posZ);

        const beam = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            startLife: new IntervalValue(0.1, 0.2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(2.6),
            startColor: new ConstantColor(new Color4(1, 0.58, 0.17, 1)),
            worldSpace: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0.01, probability: 1}],
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: glow,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            renderOrder: 0,
        });
        beam.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.95, 0.75, 0), 0]])));
        beam.emitter.position = position.clone();
        add(beam);

        const flash = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            startLife: new IntervalValue(0.1, 0.2),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(1, 2.5),
            startRotation: new IntervalValue(-Math.PI, Math.PI),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            worldSpace: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(2), cycle: 1, interval: 0.01, probability: 1}],
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: flashSheet,
            ...sheetOf('flash'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            renderOrder: 2,
        });
        flash.addBehavior(createColorOverLifeRange(new Color4(1, 0.95, 0.82, 1), new Color4(1, 0.38, 0.12, 1)));
        flash.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 2.66, 5.33, 7.99), 0]])));
        flash.emitter.position = position.clone();
        add(flash);

        const muzzleConfig = {
            scene,
            duration: 1,
            looping: false,
            startLife: new IntervalValue(0.1, 0.2),
            // A card laid along the barrel whatever the camera: stretched along a speed of almost
            // nothing, backwards, so it reaches ahead of the muzzle (the cone aims along +z).
            startSpeed: new ConstantValue(-0.01),
            startSize: new IntervalValue(0.8, 1.4),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            worldSpace: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0.01, probability: 1}],
            shape: new ConeEmitter({radius: 0, angle: 0}),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0, lengthFactor: 2.2},
            texture: flashSheet,
            ...sheetOf('flash'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            renderOrder: 2,
        };

        const muzzle1 = new ParticleSystem(muzzleConfig);
        muzzle1.addBehavior(
            createColorOverLifeRange(new Color4(1, 0.3882312, 0.125, 1), new Color4(1, 0.826827, 0.3014706, 1))
        );
        muzzle1.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.95, 0.75, 0), 0]])));
        muzzle1.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 2.66, 5.33, 7.99), 0]])));
        muzzle1.emitter.position = position.clone();
        muzzle1.emitter.rotation.y = Math.PI / 2; // the barrel points along +x
        add(muzzle1);

        const muzzle2 = new ParticleSystem(muzzleConfig);
        muzzle2.addBehavior(
            createColorOverLifeRange(new Color4(1, 0.3882312, 0.125, 1), new Color4(1, 0.826827, 0.3014706, 1))
        );
        muzzle2.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.95, 0.75, 0), 0]])));
        muzzle2.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 2.66, 5.33, 7.99), 0]])));
        muzzle2.emitter.position = position.clone();
        muzzle2.emitter.position.x += 0.2;
        muzzle2.emitter.rotation.y = Math.PI / 2;
        add(muzzle2);

        const smoke = new ParticleSystem({
            scene,
            duration: 2.5,
            looping: false,
            startLife: new IntervalValue(0.6, 0.8),
            startSpeed: new IntervalValue(0.1, 3),
            startSize: new IntervalValue(0.75, 1.5),
            startRotation: new IntervalValue(-Math.PI, Math.PI),
            startColor: new RandomColor(new Color4(0.6323, 0.6323, 0.6323, 0.31), new Color4(1, 1, 1, 0.54)),
            worldSpace: true,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(5), cycle: 1, interval: 0.01, probability: 1}],
            shape: new ConeEmitter({angle: (20 * Math.PI) / 180, radius: 0.3, thickness: 1, arc: Math.PI * 2}),
            renderMode: RenderMode.BillBoard,
            texture: smokeSheet,
            ...sheetOf('smoke_puff'),
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
            renderOrder: -2,
        });
        smoke.addBehavior(createColorOverLifeRange(new Color4(1, 1, 1, 1), new Color4(1, 1, 1, 0)));
        smoke.addBehavior(new RotationOverLife(new IntervalValue(-Math.PI / 4, Math.PI / 4)));
        smoke.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 5.33, 10.66, 15.99), 0]])));
        smoke.emitter.position = position.clone();
        add(smoke);

        const particles = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            startLife: new IntervalValue(0.2, 0.6),
            startSpeed: new IntervalValue(1, 15),
            startSize: new IntervalValue(0.06, 0.12),
            startColor: new RandomColor(new Color4(1, 0.91, 0.51, 1), new Color4(1, 0.44, 0.16, 1)),
            worldSpace: true,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(8), cycle: 1, interval: 0.01, probability: 1}],
            shape: new ConeEmitter({angle: (20 * Math.PI) / 180, radius: 0.3, thickness: 1, arc: Math.PI * 2}),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.05, lengthFactor: 1},
            texture: streak,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            renderOrder: 1,
        });
        particles.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.95, 0.75, 0), 0]])));
        particles.emitter.position = position;
        particles.emitter.rotation.y = Math.PI / 2;
        add(particles);
    }

    // The hundred guns fire in waves: within each second every gun fires once, in grid order.
    const groups = systems.length / SYSTEMS_PER_GUN;
    let time = 0;
    let fired = 0;
    return {
        update(delta) {
            while (fired < groups && Math.floor((time / FIRE_PERIOD) * groups) >= fired) {
                for (let s = fired * SYSTEMS_PER_GUN; s < (fired + 1) * SYSTEMS_PER_GUN; s++) {
                    systems[s].restart();
                    systems[s].play();
                }
                fired++;
            }
            time += delta;
            if (time > FIRE_PERIOD) {
                time = 0;
                fired = 0;
            }
        },
    };
}
