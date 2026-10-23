import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    Bezier,
    ColorBySpeed,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    Gradient,
    GravityForce,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector3,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/** 10×10 `texture1.png`, counted from the top left. */
const TILE = {dot: 0, glow: 1, ring: 4};

/** The disk's tilt toward the camera, in radians, so the swirl reads as a disk and not a line. */
const DISK_TILT = 0.16;

/**
 * Fade in over the first `fadeIn` of a particle's life and out over the last part from
 * `fadeOut`, at a constant tint.
 */
function fade(fadeIn: number, fadeOut: number) {
    return new Gradient(
        [
            [new Vector3(1, 1, 1), 0],
            [new Vector3(1, 1, 1), 1],
        ],
        [
            [0, 0],
            [1, fadeIn],
            [1, fadeOut],
            [0, 1],
        ]
    );
}

/** One steady sprite: one particle a second that lives a step longer, so the next overlaps it. */
function steadySprite(params: {size: number; color: Vector4; tile: number; blend: number; order: number}) {
    return {
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1 + 1 / 60),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(params.size),
        startColor: new ConstantColor(params.color),
        worldSpace: false,
        emissionOverTime: new ConstantValue(1),
        shape: new PointEmitter(),
        transparent: true,
        blendMode: params.blend,
        startTileIndex: new ConstantValue(params.tile),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: params.order,
    };
}

/**
 * A black hole: a dark shadow drawn with normal (alpha) blending in front of a glowing disk, a
 * photon ring, an accretion disk whose particles orbit and fall inward, coloured by their speed
 * (ColorBySpeed: they heat from red to white as gravity speeds them up), and two polar jets.
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 5.5, 24));
    const texture = createSharedTexture(scene);
    const add = (system: ParticleSystem) => {
        batchRenderer.addSystem(system);
        systems.push(system);
    };

    // Warm glow behind everything: the light of the disk scattered around the hole.
    add(
        new ParticleSystem({
            scene,
            texture,
            ...steadySprite({
                size: 26,
                color: new Vector4(0.55, 0.25, 0.08, 0.6),
                tile: TILE.glow,
                blend: Constants.ALPHA_ADD,
                order: 0,
            }),
        })
    );

    // Accretion disk: particles orbit the hole and fall in under gravity. The orbit is authored on
    // the emitter's z axis, which is the disk's normal once the emitter is tipped flat.
    const diskColor = new Gradient(
        [
            [new Vector3(0.55, 0.08, 0.02), 0],
            [new Vector3(1, 0.42, 0.08), 0.35],
            [new Vector3(1, 0.85, 0.5), 0.7],
            [new Vector3(1, 1, 1), 1],
        ],
        [
            [0.85, 0],
            [1, 1],
        ]
    );
    const disk = new ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(3, 5),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.4, 1.1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(520),
        shape: new DonutEmitter({radius: 8, donutRadius: 1.4, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.glow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    disk.addBehavior(new OrbitOverLife(new IntervalValue(0.9, 1.4), new Vector3(0, 0, 1)));
    disk.addBehavior(new GravityForce(new Vector3(0, 0, 0), 40));
    disk.addBehavior(new ColorBySpeed(diskColor, new IntervalValue(0.3, 3.5)));
    disk.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 1, 1, 0), 0]])));
    disk.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    add(disk);

    // The inner edge of the disk: hotter, faster and thinner, just outside the photon ring.
    const innerDisk = new ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(1.5, 2.5),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.25, 0.6),
        startColor: new RandomColor(new Vector4(1, 0.75, 0.4, 0.9), new Vector4(1, 0.95, 0.85, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(320),
        shape: new DonutEmitter({radius: 4.6, donutRadius: 0.7, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.glow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    innerDisk.addBehavior(new OrbitOverLife(new IntervalValue(2.2, 3), new Vector3(0, 0, 1)));
    innerDisk.addBehavior(new ColorOverLife(fade(0.15, 0.6)));
    innerDisk.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    add(innerDisk);

    // The shadow: a black disc in normal blending, drawn over the disk, hides the hole's middle.
    add(
        new ParticleSystem({
            scene,
            texture,
            ...steadySprite({
                size: 5.2,
                color: new Vector4(0, 0, 0, 1),
                tile: TILE.dot,
                blend: Constants.ALPHA_COMBINE,
                order: 2,
            }),
        })
    );

    // Photon ring: light bent all the way round the hole, a thin bright rim at the shadow's edge.
    add(
        new ParticleSystem({
            scene,
            texture,
            ...steadySprite({
                size: 6.2,
                color: new Vector4(1, 0.82, 0.55, 1),
                tile: TILE.ring,
                blend: Constants.ALPHA_ADD,
                order: 3,
            }),
        })
    );

    // Polar jets along the disk's normal: fast, narrow and blue-white, stretched by their speed.
    for (const side of [1, -1]) {
        const jet = new ParticleSystem({
            scene,
            duration: 2,
            looping: true,
            prewarm: true,
            startLife: new IntervalValue(0.8, 1.4),
            startSpeed: new IntervalValue(9, 14),
            startSize: new IntervalValue(0.08, 0.2),
            startColor: new RandomColor(new Vector4(0.5, 0.75, 1, 0.9), new Vector4(0.85, 0.9, 1, 1)),
            worldSpace: false,
            emissionOverTime: new ConstantValue(90),
            shape: new ConeEmitter({radius: 0.25, angle: 0.06, thickness: 1}),
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            startTileIndex: new ConstantValue(TILE.dot),
            uTileCount: 10,
            vTileCount: 10,
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.25},
            // The lower jet points away from the camera, so the shadow covers it.
            renderOrder: side > 0 ? 4 : 1,
        });
        jet.addBehavior(new ColorOverLife(fade(0.1, 0.5)));
        // The cone points along its local +z; tip it onto the disk's normal, up or down.
        jet.emitter.rotation.x = DISK_TILT + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        add(jet);
    }

    // A thin field of distant stars for depth.
    const stars = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(6, 10),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(0.05, 0.14),
        startColor: new RandomColor(new Vector4(0.7, 0.8, 1, 0.6), new Vector4(1, 0.95, 0.9, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(30),
        shape: new SphereEmitter({radius: 40, thickness: 0.3, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.dot),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    stars.addBehavior(new ColorOverLife(fade(0.2, 0.8)));
    add(stars);
}
