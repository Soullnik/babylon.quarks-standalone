import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    type Behavior,
    ColorBySpeed,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    Gradient,
    GravityForce,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector3Function,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {band} from '../shared/geometry';
import {baseTexture, rampTexture} from '../shared/textures';
import type {DemoContext} from '../types';

/** The disk's tilt toward the camera, radians: seen almost edge-on, as a thin bright band. */
const DISK_TILT = 0.07;

/** One particle that stays: a part of the hole that never dies, drawn from the first frame. */
function standing(params: Partial<ParticleSystemParameters>): ParticleSystemParameters {
    return {
        duration: 1,
        looping: false,
        startLife: new ConstantValue(1e6),
        startSpeed: new ConstantValue(0),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        transparent: true,
        ...params,
    } as ParticleSystemParameters;
}

/** A size of `x` by `y` for a billboard. */
function size2(x: number, y: number): Vector3Function {
    return new Vector3Function(new ConstantValue(x), new ConstantValue(y), new ConstantValue(1));
}

/** Adds or takes out a behaviour, for a switch in the panel. */
function toggle(system: ParticleSystem, behavior: Behavior, on: boolean): void {
    const index = system.behaviors.indexOf(behavior);
    if (on && index < 0) system.addBehavior(behavior);
    if (!on && index >= 0) system.behaviors.splice(index, 1);
}

/**
 * A black hole seen almost edge-on. Its accretion disk is a flat ring mesh of glowing filaments
 * scrolling round it (`mapUV` scroll, coloured hot by a `gradientMap`), split in a far and a near
 * half so the shadow sits between them; the far side, bent by the hole's gravity over and under
 * the shadow, is a ring of filaments round it. Streaks of matter orbit in the disk and fall in
 * (`OrbitOverLife` and a `GravityForce`), stretched along their motion and heated from orange to
 * white as gravity speeds them up (`ColorBySpeed`). The side turning toward us is brighter. The
 * panel switches gravity and the colour by speed off and on.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 0.9, 19));
    camera.setTarget(BVector3.Zero());
    const glow = baseTexture(scene, 'glow');
    const disc = baseTexture(scene, 'disc');
    const streak = baseTexture(scene, 'streak');
    const halo = baseTexture(scene, 'ring_fibers');
    const ring = baseTexture(scene, 'ring');
    const glint = baseTexture(scene, 'glint');
    const fibers = baseTexture(scene, 'fibers', true);

    const sprite = (name: string, params: Partial<ParticleSystemParameters>) => {
        const system = new ParticleSystem(standing({scene, blendMode: Constants.ALPHA_ADD, ...params}));
        system.emitter.name = name;
        add(system);
        return system;
    };

    // The light of the disk scattered round the hole, and its glare along the disk.
    sprite('Glow', {
        startSize: new ConstantValue(20),
        startColor: new ConstantColor(new Color4(0.55, 0.28, 0.08, 0.5)),
        texture: glow,
        renderOrder: 0,
    });
    sprite('Glare', {
        startSize: size2(40, 1.6),
        startColor: new ConstantColor(new Color4(1, 0.6, 0.25, 0.45)),
        texture: glow,
        renderOrder: 4,
    });
    // The side of the disk turning toward us, brighter (Doppler beaming); +x is screen right.
    const beaming = sprite('Beaming', {
        startSize: size2(9, 2.4),
        startColor: new ConstantColor(new Color4(1, 0.7, 0.35, 0.45)),
        texture: glow,
        renderOrder: 4,
    });
    beaming.emitter.position.set(-4.5, 0, 0);

    // The disk: an outer ring and a hotter inner one, each a far half drawn before the shadow and
    // a near half after it (the camera looks from +z, so the near half is the +z one).
    const ramp = (name: string, hot: string) =>
        rampTexture(scene, name, [
            [0, '#3a0a00', 0],
            [0.35, '#c04a0c', 0.85],
            [0.7, '#ffb04a', 1],
            [1, hot, 1],
        ]);
    const rings = [
        {name: 'Disk', bottom: 0.17, top: 0.5, size: 26, ramp: ramp('disk', '#ffe6b0'), scroll: 0.03, tiling: 3},
        {
            name: 'Inner disk',
            bottom: 0.3,
            top: 0.5,
            size: 11,
            ramp: ramp('innerDisk', '#ffffff'),
            scroll: 0.08,
            tiling: 2,
        },
    ];
    for (const r of rings) {
        for (const [half, center, order] of [
            ['far', -90, 1],
            ['near', 90, 3],
        ] as const) {
            const disk = new ParticleSystem(
                standing({
                    scene,
                    renderMode: RenderMode.Mesh,
                    renderAlignment: 'local',
                    lighting: 'unlit',
                    ...band({
                        bottom: r.bottom,
                        top: r.top,
                        height: 0,
                        arc: 180,
                        center,
                        segments: 96,
                        rows: 4,
                        twist: 0.04,
                    }),
                    startSize: new ConstantValue(r.size),
                    texture: fibers,
                    blendMode: Constants.ALPHA_ADD,
                    // Whole repeats per half, so the halves meet without a seam.
                    mapUV: {tiling: [r.tiling, 1], scroll: [r.scroll, 0]},
                    gradientMap: {ramp: r.ramp, channel: 'r'},
                    renderOrder: order,
                })
            );
            disk.emitter.name = `${r.name} (${half})`;
            disk.emitter.rotation.x = DISK_TILT;
            add(disk);
        }
    }

    // The shadow, between the disk's halves.
    sprite('Shadow', {
        startSize: new ConstantValue(5.4),
        startColor: new ConstantColor(new Color4(0, 0, 0, 1)),
        texture: disc,
        blendMode: Constants.ALPHA_COMBINE,
        renderOrder: 2,
    });
    // The far side of the disk bent over and under the shadow, and the thin photon ring inside.
    sprite('Lensed disk', {
        startSize: new ConstantValue(8.4),
        startColor: new ConstantColor(new Color4(1, 0.72, 0.35, 0.9)),
        texture: halo,
        renderOrder: 2,
    });
    sprite('Photon ring', {
        startSize: new ConstantValue(5.9),
        startColor: new ConstantColor(new Color4(1, 0.88, 0.65, 0.9)),
        texture: ring,
        renderOrder: 2,
    });

    // Matter falling in: fine streaks that orbit in the disk and are pulled to the hole, laid
    // along their motion, heated by their speed. The donut emits in its xy plane; tipped flat it
    // lies in the disk.
    const heat = new Gradient(
        [
            [new Color3(0.85, 0.42, 0.1), 0],
            [new Color3(1, 0.66, 0.25), 0.35],
            [new Color3(1, 0.85, 0.5), 0.7],
            [new Color3(1, 1, 1), 1],
        ],
        [
            [0.9, 0],
            [1, 1],
        ]
    );
    const gravity = new GravityForce(new BVector3(0, 0, 0), 38);
    const colorBySpeed = new ColorBySpeed(heat, new IntervalValue(0.5, 4.5));
    const infall = new ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(2.5, 4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.06, 0.14),
        startColor: new ConstantColor(new Color4(1, 0.6, 0.25, 1)),
        emissionOverTime: new ConstantValue(110),
        shape: new DonutEmitter({radius: 8, donutRadius: 0.35, thickness: 1, arc: Math.PI * 2}),
        texture: streak,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.4, lengthFactor: 3},
        renderOrder: 3,
    });
    infall.emitter.name = 'Infall';
    infall.addBehavior(new OrbitOverLife(new IntervalValue(0.8, 1.3), new BVector3(0, 0, 1)));
    infall.addBehavior(gravity);
    infall.addBehavior(colorBySpeed);
    infall.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0],
                [0.15, 1],
                [0.85, 1],
                [1, 0],
            ])
        )
    );
    infall.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    add(infall);

    // A few faint stars twinkling round it.
    const stars = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(2, 4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.2, 0.5),
        startRotation: new IntervalValue(-0.3, 0.3),
        startColor: new RandomColor(new Color4(0.7, 0.8, 1, 0.8), new Color4(1, 0.95, 0.85, 1)),
        emissionOverTime: new ConstantValue(12),
        shape: new SphereEmitter({radius: 34, thickness: 0.4, arc: Math.PI * 2}),
        texture: glint,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderOrder: 0,
    });
    stars.emitter.name = 'Stars';
    stars.addBehavior(new ColorOverLife(fade(0.3, 0.6)));
    add(stars);

    controls.toggle('Gravity (GravityForce)', true, (on) => toggle(infall, gravity, on));
    controls.toggle('Colour by speed (ColorBySpeed)', true, (on) => toggle(infall, colorBySpeed, on));
}
