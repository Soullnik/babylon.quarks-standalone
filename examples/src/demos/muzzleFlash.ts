import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3, Matrix} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    Bezier,
    ColorOverLife,
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
    SpeedOverLife,
} from 'babylon.quarks';
import {createColorOverLifeRange} from '../shared/common';
import {curve, fade} from '../shared/curves';
import {addGround} from '../shared/stage';
import {baseTexture, kenneySheet, kenneyTexture, sheetOf} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** Seconds in which every gun fires once. */
const FIRE_PERIOD = 1;
/** The systems of one gun: beam, flash, two muzzles, smoke and sparks. */
const SYSTEMS_PER_GUN = 6;
/** The height of the floor under the guns, whose muzzles are at 0. */
const FLOOR = -0.6;

/**
 * One gun on a post, its muzzle at the origin and its barrel along -x: a barrel with a brake at the
 * tip, a receiver, a grip and a post down to the floor, merged into one mesh of gunmetal.
 */
function createGun(scene: Scene): Mesh {
    const barrel = MeshBuilder.CreateCylinder('barrel', {height: 0.75, diameter: 0.09, tessellation: 12}, scene);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = -0.375;
    const brake = MeshBuilder.CreateCylinder('brake', {height: 0.14, diameter: 0.15, tessellation: 12}, scene);
    brake.rotation.z = Math.PI / 2;
    brake.position.x = -0.08;
    const receiver = MeshBuilder.CreateBox('receiver', {width: 0.5, height: 0.22, depth: 0.18}, scene);
    receiver.position.x = -0.95;
    const grip = MeshBuilder.CreateBox('grip', {width: 0.12, height: 0.3, depth: 0.14}, scene);
    grip.position.set(-1.05, -0.19, 0);
    grip.rotation.z = -0.3;
    const post = MeshBuilder.CreateCylinder('post', {height: -FLOOR - 0.12, diameter: 0.07, tessellation: 8}, scene);
    post.position.set(-0.85, (FLOOR - 0.12) / 2, 0);
    const foot = MeshBuilder.CreateCylinder('foot', {height: 0.05, diameter: 0.4, tessellation: 16}, scene);
    foot.position.set(-0.85, FLOOR + 0.025, 0);
    const gun = Mesh.MergeMeshes([barrel, brake, receiver, grip, post, foot], true, true)!;
    gun.name = 'gun';
    const material = new StandardMaterial('gunmetal', scene);
    material.diffuseColor = new Color3(0.2, 0.21, 0.24);
    material.specularColor = new Color3(0.45, 0.45, 0.5);
    material.specularPower = 48;
    gun.material = material;
    gun.isPickable = false;
    return gun;
}

export function init({scene, camera, add, systems}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(-6, 16, 20));
    camera.setTarget(new BVector3(-0.5, 0, -0.5));
    addGround(scene, FLOOR);
    const glow = baseTexture(scene, 'glow');
    const flashSheet = baseTexture(scene, 'flash');
    const puffs = kenneyTexture(scene, 'puffs');
    const streak = baseTexture(scene, 'streak');
    // The hundred guns: one mesh drawn a hundred times as thin instances, one draw call, as the
    // flashes are a handful of batches.
    const gun = createGun(scene);

    for (let i = 0; i < 100; i++) {
        const posX = Math.floor(i / 10) * 2 - 10;
        const posZ = (i % 10) * 2 - 10;
        const position = new BVector3(posX, 0, posZ);
        gun.thinInstanceAdd(Matrix.Translation(posX, 0, posZ), i === 99);

        // The glow and the flash stay small enough that, facing a camera above them, they end above
        // the floor: a card reaching through it would be cut along a hard line.
        const beam = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            startLife: new IntervalValue(0.1, 0.2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1.5),
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
            startSize: new IntervalValue(0.9, 1.5),
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

        // Gun smoke: a few dark puffs (each a random one of the sheet) blown out of the muzzle,
        // slowed by the air, swelling, turning and rising as they thin out.
        const smoke = new ParticleSystem({
            scene,
            duration: 2.5,
            looping: false,
            startLife: new IntervalValue(0.9, 1.4),
            startSpeed: new IntervalValue(1, 3.2),
            startSize: new IntervalValue(0.45, 0.8),
            startRotation: new IntervalValue(-Math.PI, Math.PI),
            startColor: new RandomColor(new Color4(0.3, 0.3, 0.32, 0.55), new Color4(0.48, 0.46, 0.45, 0.7)),
            worldSpace: true,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(4), cycle: 1, interval: 0.01, probability: 1}],
            shape: new ConeEmitter({angle: (14 * Math.PI) / 180, radius: 0.05, thickness: 1, arc: Math.PI * 2}),
            renderMode: RenderMode.BillBoard,
            texture: puffs,
            ...kenneySheet('puffs'),
            startTileIndex: new IntervalValue(0, 25),
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
            renderOrder: -2,
        });
        smoke.addBehavior(new ColorOverLife(fade(0.06, 0.3)));
        smoke.addBehavior(
            new SizeOverLife(
                curve([
                    [0, 0.5],
                    [0.3, 1.2],
                    [1, 1.9],
                ])
            )
        );
        smoke.addBehavior(
            new SpeedOverLife(
                curve([
                    [0, 1],
                    [0.25, 0.2],
                    [1, 0.05],
                ])
            )
        );
        smoke.addBehavior(new ApplyForce(new BVector3(0, 1, 0), new ConstantValue(0.9)));
        smoke.addBehavior(new RotationOverLife(new IntervalValue(-0.8, 0.8)));
        smoke.emitter.position = position.clone();
        smoke.emitter.rotation.y = Math.PI / 2;
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
