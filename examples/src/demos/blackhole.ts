import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    type Behavior,
    ColorBySpeed,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    FrameOverLife,
    Gradient,
    GravityForce,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {band, type BandShape, featheredEnds} from '../shared/geometry';
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

/** Turns xyz triples a quarter round x in place, z into y: a band laid in XZ stands in XY, its -z half up. */
function standUp(xyz: Float32Array): void {
    for (let i = 0; i < xyz.length; i += 3) {
        const y = xyz[i + 1];
        xyz[i + 1] = -xyz[i + 2];
        xyz[i + 2] = y;
    }
}

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
 * at the inner edge by a `gradientMap`, and a glow lying in the disk's plane. The shadow is a black
 * sphere that writes depth, so whatever passes behind it is hidden from any side. The far side of the disk, bent by the hole's gravity, rises over the shadow and
 * hangs under it: rings of the same gas standing up round it, thick above and thin below, flowing
 * round. A thin photon ring hugs the shadow. Streaks of matter fall in (`OrbitOverLife` and a `GravityForce`), heated from orange to white as gravity
 * speeds them up (`ColorBySpeed`). The panel switches gravity and the colour by speed off and on.
 *
 * Its gas, streaks, stars, whips and rocks are made from Kenney's CC0 particle packs.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 1.4, 19));
    camera.setTarget(new BVector3(0, 0.2, 0));
    const glow = baseTexture(scene, 'glow');
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
            /**
             * Stood up facing the camera: the band turned into the mesh's XY plane (its -z half up)
             * and drawn with the 'view' alignment, so it rings the shadow however the camera turns.
             */
            facing?: boolean;
        }
    ) => {
        const geometry = band(shape);
        if (params.facing) {
            standUp(geometry.instancingGeometry);
            standUp(geometry.instancingNormals);
        }
        const ring = new ParticleSystem(
            standing({
                scene,
                renderMode: RenderMode.Mesh,
                renderAlignment: params.facing ? 'view' : 'local',
                lighting: 'unlit',
                ...geometry,
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
    // The disk's light scattered in its own plane: a glow lying flat in the disk, so it turns with
    // the disk however the camera goes round (a card facing the camera would stay a level band on
    // the screen while the disk tips into an ellipse). Drawn before the shadow.
    sprite('Disk glow', {
        startSize: new ConstantValue(30),
        startColor: new ConstantColor(new Color4(1, 0.5, 0.18, 0.45)),
        texture: glow,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 1,
    });

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

    // The shadow: a black sphere, opaque, so it writes depth. Seen from anywhere it is a black
    // disc, and whatever is behind it (the disk's far side, the glow in its plane, wisps, rocks) is
    // hidden by the depth test while what passes in front of it stays in front, however the camera
    // turns: no light comes out of the hole.
    const shadow = MeshBuilder.CreateSphere('Shadow', {diameter: SHADOW * 2, segments: 48}, scene);
    const shadowMaterial = new StandardMaterial('shadow', scene);
    shadowMaterial.diffuseColor = Color3.Black();
    shadowMaterial.specularColor = Color3.Black();
    shadowMaterial.emissiveColor = Color3.Black();
    shadowMaterial.disableLighting = true;
    shadow.material = shadowMaterial;
    shadow.isPickable = false;

    // The far side of the disk bent over the shadow and under it: rings of gas standing up facing
    // the camera, as the bent light rings the shadow from wherever it is seen, thick above and thin
    // below, flowing round. The inner edge, nearest the shadow, is the brightest.
    gasRing(
        'Lensed disk (over)',
        {bottom: SHADOW + 0.1, top: SHADOW + 1.7, height: 0, arc: 180, center: -90, segments: 96, rows: 6},
        {tiling: 1, across: 0.45, scroll: -0.05, ramp: hotRamp, order: 2, feather: 0.22, facing: true}
    );
    gasRing(
        'Lensed disk (under)',
        {bottom: SHADOW + 0.12, top: SHADOW + 1.1, height: 0, arc: 180, center: 90, segments: 96, rows: 4},
        {tiling: 1, across: 0.6, scroll: 0.05, ramp: diskRamp, order: 2, feather: 0.28, facing: true}
    );
    // The photon ring: light that went round the hole, a thin bright line hugging the shadow.
    gasRing(
        'Photon ring',
        {bottom: SHADOW - 0.02, top: SHADOW + 0.3, height: 0, segments: 128, rows: 2},
        {tiling: 4, scroll: 0.2, ramp: hotRamp, order: 2, facing: true}
    );

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

    // Rocks falling in, as a game's debris is drawn: painted rocks on cards (each a random one of
    // the sheet), turning, swirled round on their orbits and pulled down into the hole. Cut out and
    // opaque, they write depth: the shadow hides those that pass behind it.
    const debris = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(3, 4.5),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.45, 1.1),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(0.42, 0.33, 0.28, 1), new Color4(0.62, 0.48, 0.38, 1)),
        emissionOverTime: new ConstantValue(4.5),
        shape: new DonutEmitter({radius: 9, donutRadius: 1.5, thickness: 1, arc: Math.PI * 2}),
        texture: kenneyTexture(scene, 'rocks'),
        ...kenneySheet('rocks'),
        startTileIndex: new IntervalValue(0, 8),
        transparent: false,
        alphaTest: 0.5,
        blendMode: Constants.ALPHA_DISABLE,
    });
    debris.emitter.name = 'Debris';
    debris.addBehavior(new OrbitOverLife(new IntervalValue(0.35, 0.6), new BVector3(0, 0, 1)));
    debris.addBehavior(new GravityForce(new BVector3(0, 0, 0), 14));
    debris.addBehavior(new RotationOverLife(new IntervalValue(-1.6, 1.6)));
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
