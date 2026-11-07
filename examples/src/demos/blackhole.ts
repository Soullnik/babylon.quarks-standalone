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
    EulerGenerator,
    FrameOverLife,
    Gradient,
    GravityForce,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
    Vector3Function,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {band, type BandShape, crystal, featheredEnds} from '../shared/geometry';
import {baseTexture, kenneySheet, kenneyTexture, rampTexture} from '../shared/textures';
import type {DemoContext} from '../types';

/** The disk's tilt toward the camera, radians: seen nearly edge-on, a little of its face showing. */
const DISK_TILT = 0.12;
/** The shadow's radius; the photon ring hugs it and the lensed disk rises from it. */
/**
 * Each half of the disk runs 10 degrees past the quarter on either side and fades in over those
 * 20 degrees, so where the far and the near half meet they crossfade instead of butting together.
 */
const OVERLAP_ARC = 200;
const OVERLAP_FEATHER = 20 / OVERLAP_ARC;
const SHADOW = 2.75;

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
 * A black hole seen nearly edge-on, after the renderings of Gargantua. Its accretion disk is
 * turbulent gas streaming round it: flat ring meshes with a gas texture scrolled round them
 * (`mapUV` scroll), wound into spiral arms (U sheared by V) and coloured from dark red to white-hot
 * at the inner edge by a `gradientMap`, each split in a far and a near half so the shadow sits
 * between them. The far side of the disk, bent by the hole's gravity, rises over the shadow and
 * hangs under it: rings of the same gas standing up round it, thick above and thin below, flowing
 * round. A thin photon ring hugs the shadow. Streaks of matter fall in (`OrbitOverLife` and a `GravityForce`), heated from orange to white as gravity
 * speeds them up (`ColorBySpeed`). The panel switches gravity and the colour by speed off and on.
 *
 * Its gas, streaks and stars are made from Kenney's CC0 particle packs.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 1.4, 19));
    camera.setTarget(new BVector3(0, 0.2, 0));
    const glow = baseTexture(scene, 'glow');
    const disc = baseTexture(scene, 'disc');
    const gas = kenneyTexture(scene, 'gas', true);
    const traces = kenneyTexture(scene, 'traces');
    const stars = kenneyTexture(scene, 'stars');

    const sprite = (name: string, params: Partial<ParticleSystemParameters>) => {
        const system = new ParticleSystem(standing({scene, blendMode: Constants.ALPHA_ADD, ...params}));
        system.emitter.name = name;
        add(system);
        return system;
    };

    // Gas coloured by its brightness: dark red where it thins out, white-hot where it is densest.
    const ramp = (name: string, hot: string) =>
        rampTexture(scene, name, [
            [0, '#1a0400', 0],
            [0.12, '#8a2a06', 0.8],
            [0.32, '#e8701a', 1],
            [0.6, '#ffc060', 1],
            [1, hot, 1],
        ]);
    const diskRamp = ramp('disk', '#fff1d0');
    const hotRamp = ramp('hot', '#ffffff');

    /** A ring of gas: `shape` laid out by `band`, the gas scrolled round it. */
    const gasRing = (
        name: string,
        shape: BandShape,
        params: {
            size?: number;
            tiling: number;
            across?: number;
            scroll: number;
            ramp: typeof diskRamp;
            order: number;
            /** The share of the way round over which the band fades in at each end. */
            feather?: number;
        }
    ) => {
        const ring = new ParticleSystem(
            standing({
                scene,
                renderMode: RenderMode.Mesh,
                renderAlignment: 'local',
                lighting: 'unlit',
                ...band(shape),
                ...(params.feather
                    ? {instancingColors: featheredEnds(shape.segments ?? 48, shape.rows ?? 1, params.feather)}
                    : {}),
                startSize: new ConstantValue(params.size ?? 1),
                texture: gas,
                blendMode: Constants.ALPHA_ADD,
                // `across` < 1 spreads the gas's inner, brightest part over the whole width.
                mapUV: {tiling: [params.tiling, params.across ?? 1], scroll: [params.scroll, 0]},
                gradientMap: {ramp: params.ramp, channel: 'r'},
                renderOrder: params.order,
            })
        );
        ring.emitter.name = name;
        add(ring);
        return ring;
    };

    // The light of the disk scattered round the hole, and its glare along the disk.
    sprite('Glow', {
        startSize: new ConstantValue(22),
        startColor: new ConstantColor(new Color4(0.5, 0.22, 0.06, 0.45)),
        texture: glow,
        renderOrder: 0,
    });
    sprite('Glare', {
        startSize: size2(44, 2.2),
        startColor: new ConstantColor(new Color4(1, 0.55, 0.2, 0.4)),
        texture: glow,
        renderOrder: 4,
    });
    // The side of the disk turning toward us, brighter (Doppler beaming); +x is screen right.
    sprite('Beaming', {
        startSize: size2(10, 2.6),
        startColor: new ConstantColor(new Color4(1, 0.7, 0.35, 0.4)),
        texture: glow,
        renderOrder: 4,
    }).emitter.position.set(-4.8, 0, 0);

    // The disk: a wide outer ring and a hotter, faster inner one, each a far half drawn before the
    // shadow and a near half after it (the camera looks from +z, so the near half is the +z one).
    for (const [half, center, order] of [
        ['far', -90, 1],
        ['near', 90, 3],
    ] as const) {
        const outer = gasRing(
            `Disk (${half})`,
            {bottom: 0.2, top: 0.5, height: 0, arc: OVERLAP_ARC, center, segments: 128, rows: 8, twist: 0.35},
            {size: 26, tiling: 2, scroll: 0.025, ramp: diskRamp, order, feather: OVERLAP_FEATHER}
        );
        const inner = gasRing(
            `Inner disk (${half})`,
            {
                bottom: SHADOW / 10 + 0.02,
                top: 0.55,
                height: 0,
                arc: OVERLAP_ARC,
                center,
                segments: 128,
                rows: 8,
                twist: 0.25,
            },
            {size: 10, tiling: 2, scroll: 0.07, ramp: hotRamp, order, feather: OVERLAP_FEATHER}
        );
        outer.emitter.rotation.x = DISK_TILT;
        inner.emitter.rotation.x = DISK_TILT;
    }

    // The shadow, between the disk's halves.
    sprite('Shadow', {
        startSize: new ConstantValue(SHADOW * 2),
        startColor: new ConstantColor(new Color4(0, 0, 0, 1)),
        texture: disc,
        blendMode: Constants.ALPHA_COMBINE,
        renderOrder: 2,
    });

    // The far side of the disk bent over the shadow and under it: rings of gas standing up facing
    // the camera (the band lies flat; turned a quarter round x, its -z half is the top), thick above
    // and thin below, flowing round. The inner edge, nearest the shadow, is the brightest.
    const lensed = [
        gasRing(
            'Lensed disk (over)',
            {bottom: SHADOW + 0.1, top: SHADOW + 1.7, height: 0, arc: 180, center: -90, segments: 96, rows: 6},
            {tiling: 1, across: 0.45, scroll: -0.05, ramp: hotRamp, order: 2, feather: 0.22}
        ),
        gasRing(
            'Lensed disk (under)',
            {bottom: SHADOW + 0.12, top: SHADOW + 1.1, height: 0, arc: 180, center: 90, segments: 96, rows: 4},
            {tiling: 1, across: 0.6, scroll: 0.05, ramp: diskRamp, order: 2, feather: 0.28}
        ),
        // The photon ring: light that went round the hole, a thin bright line hugging the shadow.
        gasRing(
            'Photon ring',
            {bottom: SHADOW - 0.02, top: SHADOW + 0.3, height: 0, segments: 128, rows: 2},
            {tiling: 4, scroll: 0.2, ramp: hotRamp, order: 2}
        ),
    ];
    for (const ring of lensed) {
        ring.emitter.rotation.x = Math.PI / 2;
    }

    // Matter falling in: wavering streaks that orbit in the disk and are pulled to the hole, laid
    // along their motion, heated by their speed.
    const heat = new Gradient(
        [
            [new Color3(0.85, 0.38, 0.08), 0],
            [new Color3(1, 0.62, 0.22), 0.35],
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
        startColor: new ConstantColor(new Color4(1, 0.6, 0.25, 0.6)),
        emissionOverTime: new ConstantValue(30),
        shape: new DonutEmitter({radius: 8, donutRadius: 0.4, thickness: 1, arc: Math.PI * 2}),
        texture: traces,
        ...kenneySheet('traces'),
        startTileIndex: new IntervalValue(0, 4),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.45, lengthFactor: 3},
        // Behind the shadow: what falls in on the far side must not cross it.
        renderOrder: 1,
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

    // Whips of fire round the hole, as a game's portals whip flame round their rim: big cards each
    // playing an arc that sweeps out round them and breaks up (a 3x3 sheet over a short life),
    // turned at random, a stream of them; in the screen's plane round the shadow, and laid in the
    // disk.
    const arcs = kenneyTexture(scene, 'arcs');
    const whips = (name: string, params: Partial<ParticleSystemParameters>) => {
        const whip = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            prewarm: true,
            startLife: new IntervalValue(0.8, 1.15),
            startSpeed: new ConstantValue(0),
            startRotation: new IntervalValue(0, Math.PI * 2),
            shape: new PointEmitter(),
            texture: arcs,
            ...kenneySheet('arcs'),
            blendTiles: true,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            ...params,
        } as ParticleSystemParameters);
        whip.emitter.name = name;
        whip.addBehavior(
            new FrameOverLife(
                curve([
                    [0, 0],
                    [1, 8.99],
                ])
            )
        );
        whip.addBehavior(new RotationOverLife(new IntervalValue(-1.2, -0.6)));
        add(whip);
        return whip;
    };
    whips('Whips round the shadow', {
        startSize: new IntervalValue(8.6, 10.4),
        startColor: new RandomColor(new Color4(1, 0.7, 0.35, 1), new Color4(1, 0.92, 0.7, 1)),
        emissionOverTime: new ConstantValue(6),
        renderOrder: 2,
    });
    whips('Whips in the disk', {
        startSize: new IntervalValue(13, 19),
        startColor: new RandomColor(new Color4(1, 0.55, 0.2, 1), new Color4(1, 0.8, 0.5, 1)),
        emissionOverTime: new ConstantValue(5),
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 1,
    });

    // Dark wisps drawn into the hole across the glowing disk: smoke as dark as the shadow, the dark
    // twin a game sets beside every bright layer, so the light has something to stand against.
    const darkWisps = new ParticleSystem({
        scene,
        duration: 3,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(2.2, 3.2),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(1.1, 2),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(0.03, 0.015, 0.02, 0.6), new Color4(0.08, 0.03, 0.02, 0.75)),
        emissionOverTime: new ConstantValue(10),
        // Born over the bright inner disk, where a dark wisp has light to stand against.
        shape: new DonutEmitter({radius: 5.5, donutRadius: 1.6, thickness: 1, arc: Math.PI * 2}),
        texture: kenneyTexture(scene, 'wisps'),
        ...kenneySheet('wisps'),
        startTileIndex: new IntervalValue(0, 4),
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        renderOrder: 3,
    });
    darkWisps.emitter.name = 'Dark wisps';
    darkWisps.addBehavior(new OrbitOverLife(new IntervalValue(0.45, 0.75), new BVector3(0, 0, 1)));
    darkWisps.addBehavior(new GravityForce(new BVector3(0, 0, 0), 10));
    darkWisps.addBehavior(new RotationOverLife(new IntervalValue(-0.8, 0.8)));
    darkWisps.addBehavior(new ColorOverLife(fade(0.2, 0.6)));
    darkWisps.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    add(darkWisps);

    // Debris falling in: dark rocks, lit, their edges glowing with the disk's light, tumbling on
    // their orbits down into the hole. Opaque, they write depth: the shadow hides those behind it.
    const debris = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(3, 4.5),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.35, 0.8),
        startRotation: new RandomQuatGenerator(),
        startColor: new RandomColor(new Color4(0.22, 0.17, 0.16, 1), new Color4(0.35, 0.26, 0.22, 1)),
        emissionOverTime: new ConstantValue(4),
        shape: new DonutEmitter({radius: 9, donutRadius: 1.5, thickness: 1, arc: Math.PI * 2}),
        renderMode: RenderMode.Mesh,
        ...crystal(0.3),
        rim: {color: [1, 0.55, 0.2], power: 2.2, strength: 1, mode: 'add'},
        lighting: 'fixed',
        transparent: false,
        renderFace: 'front',
        blendMode: Constants.ALPHA_DISABLE,
    });
    debris.emitter.name = 'Debris';
    debris.addBehavior(new OrbitOverLife(new IntervalValue(0.35, 0.6), new BVector3(0, 0, 1)));
    debris.addBehavior(new GravityForce(new BVector3(0, 0, 0), 14));
    debris.addBehavior(
        new Rotation3DOverLife(
            new EulerGenerator(new IntervalValue(-1, 1), new IntervalValue(-1, 1), new IntervalValue(-1, 1), 'YXZ')
        )
    );
    debris.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0],
                [0.1, 1],
                [0.85, 1],
                [1, 0],
            ])
        )
    );
    debris.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    add(debris);

    // Glints flickering on the photon ring, where the light is bent tightest.
    const ringGlints = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(0.35, 0.7),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.35, 0.8),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 0.85, 0.6, 1), new Color4(1, 1, 0.95, 1)),
        emissionOverTime: new ConstantValue(9),
        // The donut lies in its xy plane: facing the camera, round the shadow.
        shape: new DonutEmitter({radius: SHADOW + 0.15, donutRadius: 0.12, thickness: 1, arc: Math.PI * 2}),
        texture: kenneyTexture(scene, 'stars'),
        ...kenneySheet('stars'),
        startTileIndex: new IntervalValue(0, 3),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderOrder: 3,
    });
    ringGlints.emitter.name = 'Ring glints';
    ringGlints.addBehavior(new ColorOverLife(fade(0.3, 0.6)));
    ringGlints.addBehavior(new RotationOverLife(new IntervalValue(-2, 2)));
    add(ringGlints);

    // Stars twinkling far round it.
    const starfield = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(2, 4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.3, 0.9),
        startRotation: new IntervalValue(-0.2, 0.2),
        startColor: new RandomColor(new Color4(0.65, 0.78, 1, 0.8), new Color4(1, 0.92, 0.82, 1)),
        emissionOverTime: new ConstantValue(14),
        shape: new SphereEmitter({radius: 34, thickness: 0.4, arc: Math.PI * 2}),
        texture: stars,
        ...kenneySheet('stars'),
        startTileIndex: new IntervalValue(0, 4),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderOrder: 0,
    });
    starfield.emitter.name = 'Stars';
    starfield.addBehavior(new ColorOverLife(fade(0.3, 0.6)));
    add(starfield);

    controls.toggle('Gravity (GravityForce)', true, (on) => toggle(infall, gravity, on));
    controls.toggle('Colour by speed (ColorBySpeed)', true, (on) => toggle(infall, colorBySpeed, on));
}
