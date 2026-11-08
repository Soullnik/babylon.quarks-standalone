import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    type Behavior,
    Bezier,
    ColorBySpeed,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    EulerGenerator,
    Gradient,
    GravityForce,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    type ParticleSystemParameters,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
    RotationOverLife,
    SizeOverLife,
    SpeedOverLife,
    SphereEmitter,
    WidthOverLength,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {band, type BandShape, faceted, featheredEnds, type InstancingGeometry} from '../shared/geometry';
import {baseTexture, kenneySheet, kenneyTexture, rampTexture} from '../shared/textures';
import type {DemoContext} from '../types';

/**
 * How far above the disk's plane the camera looks from, radians: nearly edge-on, a little of the
 * disk's face showing. The disk lies flat in the world, so everything in its plane (the disk, its
 * glow, the streams falling in) lies in one plane however the camera goes round.
 */
const VIEW_PITCH = 0.18;
/** The camera's distance from the hole. */
const VIEW_DISTANCE = 19;
/** The shadow's radius; the photon ring hugs it and the lensed disk rises from it. */
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
 * One ribbon of the disk's gas: a band swept along a spiral round the hole, as a sword's slash is
 * a curved wall rather than a flat card. It winds in from `from` to `to` (radii) over `sweep`
 * radians, rising and falling `wave` above and below the disk's plane, and turns about its own
 * length as it goes, from lying flat (`turn` 0) toward standing as a wall (`turn` PI/2): seen from
 * any side some of it faces the camera and some of it is seen on edge, so the disk has a body.
 */
interface Ribbon {
    from: number;
    to: number;
    start: number;
    sweep: number;
    width: number;
    wave: number;
    waves: number;
    /** The turn about its length at the start and at the end, radians. */
    turn: readonly [number, number];
    /** Where along U its fibres start, and its colour and light. */
    phase: number;
    tint: readonly [number, number, number];
    alpha: number;
}

/**
 * Ribbons merged into one mesh. U runs along each ribbon (its length in units of `unit`, so the
 * fibres keep one size however long the ribbon), V across it. Vertex alpha is soft at both edges
 * and tapers at both ends; the colour is the ribbon's tint. `standing` stands the whole set up in
 * the mesh's XY plane (its -z half up), for the `'view'` alignment.
 */
function ribbons(
    list: readonly Ribbon[],
    options: {segments: number; rows?: number; unit: number; standing?: boolean}
): InstancingGeometry & {instancingColors: Float32Array} {
    const rows = options.rows ?? 4;
    const segments = options.segments;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const put = (x: number, y: number, z: number, into: number[]) => {
        if (options.standing) into.push(x, -z, y);
        else into.push(x, y, z);
    };
    for (const ribbon of list) {
        const first = positions.length / 3;
        let length = 0;
        let px = 0;
        let py = 0;
        let pz = 0;
        for (let k = 0; k <= segments; k++) {
            const t = k / segments;
            const angle = ribbon.start + ribbon.sweep * t;
            const radius = ribbon.from + (ribbon.to - ribbon.from) * t;
            const c = Math.cos(angle);
            const n = Math.sin(angle);
            const x = c * radius;
            const z = n * radius;
            const y = ribbon.wave * Math.sin(Math.PI * 2 * ribbon.waves * t + ribbon.phase * 6.283);
            if (k > 0) length += Math.hypot(x - px, y - py, z - pz);
            px = x;
            py = y;
            pz = z;
            // Across the ribbon: between outward (lying flat) and up (standing as a wall).
            const turn = ribbon.turn[0] + (ribbon.turn[1] - ribbon.turn[0]) * t;
            const ax = c * Math.cos(turn);
            const ay = Math.sin(turn);
            const az = n * Math.cos(turn);
            // Its face: across the ribbon turned a quarter about the length (the tangent, -n, 0, c).
            const fx = -c * Math.sin(turn);
            const fy = Math.cos(turn);
            const fz = -n * Math.sin(turn);
            const taper = Math.pow(Math.sin(Math.PI * t), 0.6);
            const width = ribbon.width * (0.35 + 0.65 * taper);
            for (let r = 0; r <= rows; r++) {
                const v = r / rows;
                const off = (v - 0.5) * width;
                put(x + ax * off, y + ay * off, z + az * off, positions);
                put(fx, fy, fz, normals);
                uvs.push(length / options.unit + ribbon.phase, v);
                const alpha = ribbon.alpha * Math.sin(Math.PI * v) * taper;
                colors.push(ribbon.tint[0], ribbon.tint[1], ribbon.tint[2], alpha);
            }
        }
        const row = rows + 1;
        for (let k = 0; k < segments; k++) {
            for (let r = 0; r < rows; r++) {
                const a = first + k * row + r;
                const b = a + row;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return {
        instancingGeometry: new Float32Array(positions),
        instancingNormals: new Float32Array(normals),
        instancingUVs: new Float32Array(uvs),
        instancingIndices: new Uint32Array(indices),
        instancingColors: new Float32Array(colors),
    };
}

/**
 * `count` ribbons winding in through the band of radii `[inner, outer]`, each starting at its own
 * place round the hole, sweeping 200 to 330 degrees, its width, wave and turn stepped by the golden
 * ratio, so they differ ribbon to ribbon without a random seed and the demo opens the same each time.
 */
function ribbonSet(
    count: number,
    inner: number,
    outer: number,
    look: {
        width: readonly [number, number];
        wave: number;
        /** The largest turn toward a wall, radians. */
        turn: number;
        tint: readonly [number, number, number];
        alpha: readonly [number, number];
    }
): Ribbon[] {
    const golden = 0.6180339887;
    const frac = (value: number) => value - Math.floor(value);
    return Array.from({length: count}, (_, i) => {
        const a = frac(i * golden);
        const b = frac(i * golden * 2.3 + 0.37);
        const c = frac(i * golden * 3.7 + 0.71);
        const d = frac(i * golden * 5.3 + 0.13);
        const span = outer - inner;
        const from = inner + span * (0.35 + 0.65 * a);
        const to = Math.max(inner, from - span * (0.25 + 0.4 * b));
        return {
            from,
            to,
            start: c * Math.PI * 2,
            sweep: (200 + 130 * d) * (Math.PI / 180),
            width: look.width[0] + (look.width[1] - look.width[0]) * b,
            wave: look.wave * (0.4 + 0.6 * c),
            waves: 1 + Math.floor(d * 3),
            turn: [look.turn * (a * 2 - 1), look.turn * (d * 2 - 1)],
            phase: c,
            tint: look.tint,
            alpha: look.alpha[0] + (look.alpha[1] - look.alpha[0]) * d,
        };
    });
}

/**
 * A black hole seen nearly edge-on, after the renderings of Gargantua. Its accretion disk is built
 * as a sword's slash is, from geometry rather than flat cards: some seventy ribbons of glowing gas,
 * each swept along a spiral winding in round the hole, rising and falling a little and turning
 * about its own length from lying flat to standing as a wall, a fibre texture scrolled along it
 * (`mapUV` scroll) and coloured from dark red to white-hot by a `gradientMap`. Seen from any side
 * some ribbons face the camera and some are on edge, so the disk has a body: edge-on it is a thick
 * band of light, not a line. A few long ribbons arc up out of the disk and back.
 *
 * The shadow is a black sphere that writes depth, so whatever passes behind it is hidden from any
 * side. The far side of the disk, bent by the hole's gravity, rises over the shadow and hangs under
 * it: sheaves of the same ribbons standing up facing the camera, thick above and thin below. A thin
 * photon ring hugs it. Streaks of matter fall in (`OrbitOverLife` and a `GravityForce`), heated
 * from orange to white as gravity speeds them up (`ColorBySpeed`), with long trails of light
 * orbiting in the disk and a faint dark haze over it. Faceted rocks fall in from space on every
 * side, faster and faster, heating as they go (`SpeedOverLife`, `ColorOverLife`). The panel
 * switches gravity and the colour by speed off and on.
 *
 * Its gas, streaks and stars are made from Kenney's CC0 particle packs.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(
        new BVector3(0, 0.2 + VIEW_DISTANCE * Math.sin(VIEW_PITCH), VIEW_DISTANCE * Math.cos(VIEW_PITCH))
    );
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

    const fibers = baseTexture(scene, 'fibers');
    /** A set of strands as one mesh system, its fibres scrolled round at `scroll` turns a second. */
    const strandSystem = (
        name: string,
        geometry: ReturnType<typeof ribbons>,
        params: {
            tiling: number;
            scroll: number;
            ramp: typeof diskRamp;
            order: number;
            facing?: boolean;
            /** Light past 1: overlapping strands add up and blow out to white where they are thick. */
            strength: number;
        }
    ) => {
        const system = new ParticleSystem(
            standing({
                scene,
                renderMode: RenderMode.Mesh,
                renderAlignment: params.facing ? 'view' : 'local',
                lighting: 'unlit',
                ...geometry,
                startSize: new ConstantValue(1),
                startColor: new ConstantColor(new Color4(params.strength, params.strength, params.strength, 1)),
                texture: fibers,
                blendMode: Constants.ALPHA_ADD,
                mapUV: {tiling: [params.tiling, 1], scroll: [params.scroll, 0]},
                gradientMap: {ramp: params.ramp, channel: 'r'},
                renderOrder: params.order,
            })
        );
        system.emitter.name = name;
        add(system);
        return system;
    };

    // The disk: ribbons of glowing gas winding in round the hole, white-hot near the shadow and
    // orange at the rim, each turning about its length and rising and falling a little, so from any
    // side some are seen flat and some on edge, crossing and parting (the way a sword's slash is a
    // curved wall rather than a card). The inner ones race round, the outer ones are slow.
    // Additive, so their order does not matter; the shadow's depth hides what is behind it.
    strandSystem(
        'Inner ribbons',
        ribbons(
            ribbonSet(22, SHADOW + 0.3, 5.6, {
                width: [0.5, 1.1],
                wave: 0.15,
                turn: 1.0,
                tint: [1, 0.86, 0.68],
                alpha: [0.5, 0.95],
            }),
            {segments: 140, unit: 6}
        ),
        {tiling: 1, scroll: 0.16, ramp: hotRamp, order: 3, strength: 1.35}
    );
    strandSystem(
        'Middle ribbons',
        ribbons(
            ribbonSet(26, 4.6, 9.4, {
                width: [0.8, 1.8],
                wave: 0.3,
                turn: 0.9,
                tint: [1, 0.8, 0.48],
                alpha: [0.45, 0.9],
            }),
            {segments: 160, unit: 9}
        ),
        {tiling: 1, scroll: 0.08, ramp: diskRamp, order: 3, strength: 1.15}
    );
    strandSystem(
        'Outer ribbons',
        ribbons(
            ribbonSet(20, 8.4, 13.5, {
                width: [1.2, 2.6],
                wave: 0.5,
                turn: 0.8,
                tint: [1, 0.6, 0.28],
                alpha: [0.3, 0.6],
            }),
            {segments: 180, unit: 12}
        ),
        {tiling: 1, scroll: 0.04, ramp: diskRamp, order: 3, strength: 1.1}
    );

    // Long ribbons thrown up out of the disk: each leaves the inner disk, arcs up and out over a
    // third of the way round and comes back down far out, as gas flung off the disk's surface.
    strandSystem(
        'Outflows',
        ribbons(
            ribbonSet(5, 4, 15, {
                width: [0.7, 1.6],
                wave: 1,
                turn: 0.7,
                tint: [1, 0.72, 0.36],
                alpha: [0.25, 0.5],
            }).map((ribbon) => ({
                ...ribbon,
                from: 4 + ribbon.phase * 2,
                to: 9 + ribbon.alpha * 3,
                sweep: (70 + 50 * ribbon.phase) * (Math.PI / 180),
                // Half a wave: up out of the disk and back down into it.
                waves: 0.5,
                phase: 0,
                wave: 1.2 + 1.6 * ribbon.alpha,
            })),
            {segments: 120, unit: 10}
        ),
        {tiling: 1, scroll: 0.06, ramp: diskRamp, order: 3, strength: 1.3}
    );

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

    // The far side of the disk bent over the shadow and under it: sheaves of ribbons standing up
    // facing the camera, as the bent light rings the shadow from wherever it is seen, a wide dense
    // one above and a thinner one below, turning about their length so each sheaf has a body.
    const arch = (ribbon: Ribbon, centre: number, sweep: number): Ribbon => ({
        ...ribbon,
        // Round the shadow, not into it: the arch keeps its radius, a little out at its ends.
        to: ribbon.from + 0.15,
        start: centre - sweep / 2 + (ribbon.phase - 0.5) * 0.35,
        sweep: sweep * (0.75 + 0.25 * ribbon.alpha),
        waves: 0.5,
    });
    strandSystem(
        'Lensed ribbons (over)',
        ribbons(
            ribbonSet(26, SHADOW + 0.05, SHADOW + 2.1, {
                width: [0.45, 1.2],
                wave: 0.25,
                turn: 1.3,
                tint: [1, 0.9, 0.72],
                alpha: [0.45, 1],
            }).map((ribbon) => arch(ribbon, Math.PI * 1.5, Math.PI * 0.95)),
            {segments: 110, unit: 5, standing: true}
        ),
        {tiling: 1, scroll: -0.1, ramp: hotRamp, order: 2, facing: true, strength: 2}
    );
    strandSystem(
        'Lensed ribbons (under)',
        ribbons(
            ribbonSet(12, SHADOW + 0.05, SHADOW + 1.2, {
                width: [0.3, 0.7],
                wave: 0.15,
                turn: 1.1,
                tint: [1, 0.78, 0.48],
                alpha: [0.4, 0.85],
            }).map((ribbon) => arch(ribbon, Math.PI * 0.5, Math.PI * 0.85)),
            {segments: 110, unit: 5, standing: true}
        ),
        {tiling: 1, scroll: 0.1, ramp: diskRamp, order: 2, facing: true, strength: 1.5}
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
    infall.emitter.rotation.x = -Math.PI / 2;
    add(infall);

    // Streams of light orbiting in the disk: long thin trails, each a few degrees out of the plane,
    // drifting in as they go round, so the disk moves as well as flows.
    const streams = new ParticleSystem({
        scene,
        duration: 6,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(3.5, 5.5),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.05, 0.12),
        startColor: new RandomColor(new Color4(1, 0.72, 0.38, 0.7), new Color4(1, 0.95, 0.85, 0.95)),
        emissionOverTime: new ConstantValue(9),
        shape: new DonutEmitter({radius: 7.5, donutRadius: 1.3, thickness: 1, arc: Math.PI * 2}),
        texture: glow,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(48), followLocalOrigin: false},
        renderOrder: 3,
    });
    streams.emitter.name = 'Streams';
    streams.addBehavior(new OrbitOverLife(new IntervalValue(0.35, 0.65), new BVector3(0, 0, 1)));
    streams.addBehavior(new GravityForce(new BVector3(0, 0, 0), 5));
    streams.addBehavior(new ColorOverLife(fade(0.15, 0.6)));
    streams.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0.05), 0]])));
    streams.emitter.rotation.x = -Math.PI / 2;
    add(streams);

    // A dark haze over the disk: large, faint smoke spread over the whole of it and drifting round
    // slowly, the dark twin a game sets beside every bright layer, so the light has depth to stand
    // against. Faint and overlapping, it reads as one veil, not as separate clouds.
    const haze = new ParticleSystem({
        scene,
        duration: 8,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(6, 9),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(6, 11),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(0.02, 0.01, 0.015, 0.12), new Color4(0.06, 0.025, 0.02, 0.22)),
        emissionOverTime: new ConstantValue(16),
        // Over the whole disk, from the shadow to the rim, and a little above and below it.
        shape: new DonutEmitter({radius: 8.5, donutRadius: 6, thickness: 1, arc: Math.PI * 2}),
        texture: kenneyTexture(scene, 'wisps'),
        ...kenneySheet('wisps'),
        startTileIndex: new IntervalValue(0, 4),
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        // After the whole bright disk, always. In one render order with the additive layers, the
        // haze and the disk would be sorted by distance, their order flipping as the haze drifts
        // round: the disk would be darkened one moment and lit over the haze the next, a flicker.
        renderOrder: 4,
    });
    haze.emitter.name = 'Dark haze';
    haze.addBehavior(new OrbitOverLife(new IntervalValue(0.12, 0.25), new BVector3(0, 0, 1)));
    haze.addBehavior(new RotationOverLife(new IntervalValue(-0.15, 0.15)));
    haze.addBehavior(new ColorOverLife(fade(0.3, 0.7)));
    haze.emitter.rotation.x = -Math.PI / 2;
    add(haze);

    // Rocks falling in from space: they come from every side, not from an orbit, as matter does near
    // a black hole (nothing orbits there for long). Each is born on a sphere round the hole heading
    // straight for it and falls in faster and faster (`SpeedOverLife`), its life set so that it
    // reaches the shadow as it ends; tumbling, it heats as it falls (`ColorOverLife`) and is drawn
    // down to nothing at the shadow's edge. Faceted stones, lit, opaque: the shadow's depth hides those
    // behind it.
    const rock = faceted(
        [
            [-0.5, 0],
            [-0.32, 0.38],
            [-0.05, 0.5],
            [0.22, 0.42],
            [0.5, 0],
        ],
        6
    );
    // How fast it falls over its life: the shape of the fall. Its area (1.075) and the life fix the
    // start speed: the rock covers the sphere's radius exactly in its life.
    const fall = curve([
        [0, 0.3],
        [0.5, 0.7],
        [0.8, 1.6],
        [1, 3.2],
    ]);
    const ROCK_SPHERE = 12;
    const ROCK_LIFE = 5;
    const debris = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new ConstantValue(ROCK_LIFE),
        // Negative: the sphere sends particles out, these go in.
        startSpeed: new ConstantValue(-ROCK_SPHERE / (ROCK_LIFE * 1.075)),
        startSize: new IntervalValue(0.3, 0.75),
        startRotation: new RandomQuatGenerator(),
        startColor: new RandomColor(new Color4(0.22, 0.16, 0.13, 1), new Color4(0.36, 0.26, 0.2, 1)),
        emissionOverTime: new ConstantValue(4),
        shape: new SphereEmitter({radius: ROCK_SPHERE, thickness: 0, arc: Math.PI * 2}),
        renderMode: RenderMode.Mesh,
        ...rock,
        lighting: 'fixed',
        transparent: false,
        blendMode: Constants.ALPHA_DISABLE,
    });
    debris.emitter.name = 'Debris';
    debris.addBehavior(new SpeedOverLife(fall));
    debris.addBehavior(
        new Rotation3DOverLife(
            new EulerGenerator(
                new IntervalValue(-1.6, 1.6),
                new IntervalValue(-1.2, 1.2),
                new IntervalValue(-1.6, 1.6),
                'YXZ'
            )
        )
    );
    // Heated as it falls: its own colour, then glowing orange near the end.
    debris.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 0.7],
                    [new Color3(3, 1.6, 0.6), 0.92],
                    [new Color3(4, 2.4, 1.2), 1],
                ],
                [
                    [1, 0],
                    [1, 1],
                ]
            )
        )
    );
    debris.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0],
                [0.06, 1],
                [0.84, 1],
                [0.95, 0.4],
                [1, 0],
            ])
        )
    );
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
