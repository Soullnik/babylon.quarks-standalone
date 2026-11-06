import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    Gradient,
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
    WidthOverLength,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** Colour over life from white through `mid` to `end`, alpha in by 10 % and out from `out`. */
function warmth(mid: Color3, end: Color3, out = 0.6): Gradient {
    return new Gradient(
        [
            [new Color3(1, 1, 1), 0],
            [mid, 0.4],
            [end, 1],
        ],
        [
            [0, 0],
            [1, 0.1],
            [1, out],
            [0, 1],
        ]
    );
}

/**
 * Every render mode, each on its own labelled pad doing what it is for: billboards facing the
 * camera (smoke), stretched billboards laid along their motion (sparks), horizontal ones flat on
 * the ground (ripples), vertical ones upright but turning to the camera (flames), mesh particles
 * lit by the renderer's light (crystals), trails (ribbons spiralling up) and a beam (a bolt between two
 * points).
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 7.5, 14.5));
    camera.setTarget(new BVector3(0, 0.6, -0.4));
    addGround(scene);
    const padMaterial = new StandardMaterial('pad', scene);
    padMaterial.diffuseColor = new Color3(0.24, 0.25, 0.3);
    padMaterial.specularColor = Color3.Black();

    const pads = [
        'BillBoard',
        'StretchedBillBoard',
        'HorizontalBillBoard',
        'VerticalBillBoard',
        'Mesh',
        'Trail',
        'Beam',
    ];
    const spots = pads.map((name, i) => {
        const row = i < 4 ? 0 : 1;
        const x = row === 0 ? (i - 1.5) * 4.2 : (i - 4 - 1) * 4.2;
        const z = row === 0 ? -3.2 : 3;
        const pad = MeshBuilder.CreateDisc(`pad:${name}`, {radius: 1.4, tessellation: 48}, scene);
        pad.rotation.x = Math.PI / 2;
        pad.position.set(x, 0.01, z);
        pad.material = padMaterial;
        addLabel(scene, `RenderMode.${name}`, new BVector3(x, 0.3, z + 1.75), {height: 0.34});
        const spot = new TransformNode(name, scene);
        spot.position.set(x, 0, z);
        return spot;
    });
    const system = (spot: number, name: string, parameters: Partial<ParticleSystemParameters>) => {
        const ps = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            ...parameters,
        } as ParticleSystemParameters);
        ps.emitter.name = name;
        ps.emitter.parent = spots[spot];
        add(ps);
        return ps;
    };
    const up = (ps: ParticleSystem, y = 0.1) => {
        // Cones emit along their +z; turn it up.
        ps.emitter.rotation.x = -Math.PI / 2;
        ps.emitter.position.y = y;
        return ps;
    };

    // Billboards: smoke puffs rising, each facing the camera.
    const smoke = up(
        system(0, 'Smoke', {
            startLife: new IntervalValue(1.4, 2),
            startSpeed: new IntervalValue(0.5, 0.9),
            startSize: new IntervalValue(1, 1.6),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new RandomColor(new Color4(0.6, 0.62, 0.68, 0.9), new Color4(0.8, 0.82, 0.86, 1)),
            emissionOverTime: new ConstantValue(7),
            shape: new ConeEmitter({radius: 0.4, angle: 0.2}),
            texture: baseTexture(scene, 'smoke_puff'),
            ...sheetOf('smoke_puff'),
            blendMode: Constants.ALPHA_COMBINE,
        })
    );
    smoke.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 15.99],
            ])
        )
    );
    smoke.addBehavior(new RotationOverLife(new IntervalValue(-0.6, 0.6)));

    // Stretched billboards: sparks in a fountain, each laid along its motion.
    const sparks = up(
        system(1, 'Sparks', {
            startLife: new IntervalValue(0.6, 1),
            startSpeed: new IntervalValue(4, 6.5),
            startSize: new IntervalValue(0.1, 0.18),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(60),
            shape: new ConeEmitter({radius: 0.1, angle: 0.35}),
            texture: baseTexture(scene, 'streak'),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.08, lengthFactor: 1},
        })
    );
    sparks.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(9)));
    sparks.addBehavior(new ColorOverLife(warmth(new Color3(1, 0.7, 0.3), new Color3(1, 0.25, 0.05))));

    // Horizontal billboards: ripples spreading flat on the ground.
    const ripples = system(2, 'Ripples', {
        startLife: new ConstantValue(1.6),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(2.6),
        startColor: new ConstantColor(new Color4(0.45, 0.85, 1, 1)),
        emissionOverTime: new ConstantValue(1.6),
        shape: new PointEmitter(),
        texture: baseTexture(scene, 'ring'),
        renderMode: RenderMode.HorizontalBillBoard,
    });
    ripples.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.1],
                [1, 1],
            ])
        )
    );
    ripples.addBehavior(new ColorOverLife(fade(0.05, 0.3)));
    ripples.emitter.position.y = 0.04;

    // Vertical billboards: flames standing upright, turning round to face the camera.
    const flames = system(3, 'Flames', {
        startLife: new IntervalValue(0.7, 0.9),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(1.1, 1.5),
        startColor: new RandomColor(new Color4(1, 0.5, 0.15, 1), new Color4(1, 0.75, 0.3, 1)),
        emissionOverTime: new ConstantValue(6),
        shape: new SphereEmitter({radius: 0.25, thickness: 1}),
        texture: baseTexture(scene, 'fire'),
        ...sheetOf('fire'),
        renderMode: RenderMode.VerticalBillBoard,
    });
    flames.addBehavior(
        new FrameOverLife(new ConstantValue(0), {fps: 20, frameCount: 16, startFrame: new IntervalValue(0, 16)})
    );
    flames.addBehavior(new ColorOverLife(fade(0.15, 0.7)));
    flames.emitter.position.y = 0.65;

    // Mesh particles: faceted crystals tumbling up, lit by the scene's light.
    const gem = MeshBuilder.CreateIcoSphere('gem', {radius: 0.5, subdivisions: 1, flat: true}, scene);
    gem.scaling.y = 1.6;
    gem.bakeCurrentTransformIntoVertices();
    gem.isVisible = false;
    gem.setEnabled(false);
    const crystals = up(
        system(4, 'Crystals', {
            startLife: new IntervalValue(1.6, 2.2),
            startSpeed: new IntervalValue(0.8, 1.4),
            startSize: new IntervalValue(0.35, 0.6),
            startRotation: new RandomQuatGenerator(),
            startColor: new RandomColor(new Color4(0.55, 0.85, 1, 1), new Color4(0.85, 0.6, 1, 1)),
            emissionOverTime: new ConstantValue(5),
            shape: new ConeEmitter({radius: 0.6, angle: 0.25}),
            transparent: false,
            blendMode: Constants.ALPHA_DISABLE,
            renderMode: RenderMode.Mesh,
            lighting: 'fixed',
            instancingGeometry: new Float32Array(gem.getVerticesData(VertexBuffer.PositionKind)!),
            instancingNormals: new Float32Array(gem.getVerticesData(VertexBuffer.NormalKind)!),
            instancingUVs: new Float32Array(gem.getVerticesData(VertexBuffer.UVKind)!),
            instancingIndices: new Uint32Array(gem.getIndices()!),
        })
    );
    crystals.addBehavior(new Rotation3DOverLife(new RandomQuatGenerator()));
    crystals.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0],
                [0.15, 1],
                [0.85, 1],
                [1, 0],
            ])
        )
    );

    // Trails: ribbons shot up from a ring and turned round the pad's axis, each drawing a helix.
    const ribbons = up(
        system(5, 'Ribbons', {
            startLife: new IntervalValue(1, 1.3),
            startSpeed: new IntervalValue(2, 2.6),
            startSize: new IntervalValue(0.12, 0.18),
            startColor: new RandomColor(new Color4(0.6, 1, 0.7, 1), new Color4(0.3, 0.8, 1, 1)),
            emissionOverTime: new ConstantValue(6),
            shape: new ConeEmitter({radius: 0.9, angle: 0, thickness: 0}),
            texture: baseTexture(scene, 'streak'),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false},
        })
    );
    ribbons.addBehavior(new OrbitOverLife(new ConstantValue(3.5), new BVector3(0, 0, 1)));
    ribbons.addBehavior(
        new WidthOverLength(
            curve([
                [0, 1],
                [1, 0],
            ])
        )
    );
    ribbons.addBehavior(new ColorOverLife(fade(0.1, 0.6)));

    // Beam: a bolt from the pad to a point above it that wanders, flickering through the sheet.
    const target = new TransformNode('Beam end', scene);
    target.parent = spots[6];
    const beam = system(6, 'Bolt', {
        startLife: new ConstantValue(1e6),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.9),
        startColor: new ConstantColor(new Color4(0.6, 0.8, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        looping: false,
        shape: new PointEmitter(),
        texture: baseTexture(scene, 'bolts'),
        ...sheetOf('bolts'),
        renderMode: RenderMode.Beam,
    });
    beam.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 18, frameCount: 8, random: true}));
    beam.emitter.position.y = 0.1;
    beam.beamEnd = target;

    let time = 0;
    return {
        update(delta) {
            time += delta;
            target.position.set(
                Math.sin(time * 1.3) * 0.9,
                2.6 + Math.sin(time * 2.1) * 0.3,
                Math.cos(time * 0.9) * 0.6
            );
        },
    };
}
