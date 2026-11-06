import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {band} from '../shared/geometry';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, rampTexture, sheetOf} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** The ramps the gradient map can switch between: one greyscale fire sheet, four elements. */
const RAMPS = {
    Fire: [
        [0, '#3a0000', 0],
        [0.3, '#c02a00', 1],
        [0.6, '#ff9a20', 1],
        [0.85, '#fff07a', 1],
        [1, '#ffffff', 1],
    ],
    Ice: [
        [0, '#00103a', 0],
        [0.3, '#1050c0', 1],
        [0.6, '#40c0ff', 1],
        [0.85, '#c0f4ff', 1],
        [1, '#ffffff', 1],
    ],
    Poison: [
        [0, '#0a2000', 0],
        [0.3, '#2a8000', 1],
        [0.6, '#80e020', 1],
        [0.85, '#e0ff90', 1],
        [1, '#ffffff', 1],
    ],
    Arcane: [
        [0, '#1a0030', 0],
        [0.3, '#6a10c0', 1],
        [0.6, '#c050ff', 1],
        [0.85, '#f0c0ff', 1],
        [1, '#ffffff', 1],
    ],
} as const;

/**
 * Texture features, each on a labelled pad:
 *
 * - `mapUV` scroll: a band round a pillar whose filament tile scrolls along U; the band's UVs
 *   wind round (sheared), so the scroll reads as a spiral climbing up.
 * - `gradientMap`: one greyscale fire sheet coloured by a ramp; the panel switches the ramp, and
 *   the same flames burn as fire, ice, poison or arcane.
 * - `erosion`: smoke puffs eaten away through a noise mask as their alpha falls, a hot edge
 *   where they burn.
 * - A beam reaching out: a bolt laid between two points, and an erosion mask on UV channel 1,
 *   which runs once along the whole beam, reveals it from its start as its alpha rises, so it
 *   reaches out to the target and draws back.
 */
export function init({scene, camera, add, controls}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 5.5, 13));
    camera.setTarget(new BVector3(0, 1.4, 0));
    addGround(scene);
    const padMaterial = new StandardMaterial('pad', scene);
    padMaterial.diffuseColor = new Color3(0.24, 0.25, 0.3);
    padMaterial.specularColor = Color3.Black();
    const spots = ['mapUV scroll', 'gradientMap', 'erosion', 'Beam + mask on UV1'].map((name, i) => {
        const x = (i - 1.5) * 4.4;
        const pad = MeshBuilder.CreateDisc(`pad:${name}`, {radius: 1.5, tessellation: 48}, scene);
        pad.rotation.x = Math.PI / 2;
        pad.position.set(x, 0.01, 0);
        pad.material = padMaterial;
        addLabel(scene, name, new BVector3(x, 0.3, 1.9), {height: 0.36});
        const spot = new TransformNode(name, scene);
        spot.position.x = x;
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
    const standing = {
        startLife: new ConstantValue(1e6),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        looping: false,
        shape: new PointEmitter(),
    };

    // mapUV scroll: a spiral of filaments climbing a pillar.
    system(0, 'Energy pillar', {
        ...standing,
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Color4(0.45, 0.85, 1, 1)),
        renderMode: RenderMode.Mesh,
        renderAlignment: 'local',
        lighting: 'unlit',
        ...band({bottom: 0.75, top: 0.55, height: 3.4, segments: 48, rows: 8, twist: 0.6}),
        texture: baseTexture(scene, 'fibers', true),
        mapUV: {tiling: [2, 1], scroll: [-0.5, 0]},
    });
    system(0, 'Pillar glow', {
        ...standing,
        startSize: new ConstantValue(3.6),
        startColor: new ConstantColor(new Color4(0.2, 0.5, 1, 0.35)),
        texture: baseTexture(scene, 'glow'),
        renderMode: RenderMode.VerticalBillBoard,
    }).emitter.position.y = 1.6;

    // gradientMap: one greyscale fire sheet, its colour from a ramp the panel switches.
    const ramps = Object.fromEntries(
        Object.entries(RAMPS).map(([name, stops]) => [name, rampTexture(scene, `ramp:${name}`, stops)])
    ) as Record<keyof typeof RAMPS, ReturnType<typeof rampTexture>>;
    const flames = system(1, 'Flames', {
        startLife: new IntervalValue(0.7, 1),
        startSpeed: new IntervalValue(0.5, 0.9),
        startSize: new IntervalValue(1.4, 2),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(12),
        shape: new ConeEmitter({radius: 0.45, angle: 0.15}),
        texture: baseTexture(scene, 'fire'),
        ...sheetOf('fire'),
        gradientMap: {ramp: ramps.Fire, channel: 'r'},
    });
    flames.addBehavior(
        new FrameOverLife(new ConstantValue(0), {fps: 20, frameCount: 16, startFrame: new IntervalValue(0, 16)})
    );
    flames.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(0.7, 0.7, 0.7), 1],
                ],
                [
                    [0, 0],
                    [1, 0.15],
                    [1, 0.6],
                    [0, 1],
                ]
            )
        )
    );
    flames.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.7],
                [0.3, 1],
                [1, 0.6],
            ])
        )
    );
    flames.emitter.rotation.x = -Math.PI / 2;
    flames.emitter.position.y = 0.3;
    controls.choice('Gradient map', Object.keys(RAMPS) as (keyof typeof RAMPS)[], 'Fire', (name) => {
        flames.gradientMap = {ramp: ramps[name], channel: 'r'};
    });

    // erosion: smoke eaten away through a noise mask as its alpha falls, burning at the edge.
    const smoke = system(2, 'Burning smoke', {
        startLife: new IntervalValue(1.6, 2.2),
        startSpeed: new IntervalValue(0.4, 0.8),
        startSize: new IntervalValue(1.6, 2.2),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(0.32, 0.3, 0.36, 1), new Color4(0.42, 0.4, 0.46, 1)),
        emissionOverTime: new ConstantValue(4),
        shape: new SphereEmitter({radius: 0.4}),
        texture: baseTexture(scene, 'smoke_puff'),
        ...sheetOf('smoke_puff'),
        startTileIndex: new IntervalValue(4, 8),
        blendMode: Constants.ALPHA_COMBINE,
        erosion: {
            mask: baseTexture(scene, 'swirl', true),
            softness: 0.06,
            edgeWidth: 0.07,
            edgeColor: [1.6, 0.55, 0.1],
        },
    });
    smoke.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 1],
                ],
                [
                    [1, 0],
                    [1, 0.25],
                    [0, 1],
                ]
            )
        )
    );
    smoke.addBehavior(new RotationOverLife(new IntervalValue(-0.5, 0.5)));
    smoke.emitter.position.y = 1.4;

    // A beam reaching out to a moving point and drawing back, flickering through random bolts.
    const target = new TransformNode('Beam end', scene);
    target.parent = spots[3];
    const bolt = system(3, 'Bolt', {
        ...standing,
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Color4(0.65, 0.82, 1, 1)),
        renderMode: RenderMode.Beam,
        texture: baseTexture(scene, 'bolts'),
        ...sheetOf('bolts'),
        erosion: {
            mask: rampTexture(scene, 'reach', [
                [0, '#ffffff'],
                [1, '#000000'],
            ]),
            maskUV: {channel: 1},
            softness: 0.08,
        },
    });
    bolt.tint = new Color4(1, 1, 1, 1);
    bolt.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 16, frameCount: 8, random: true}));
    bolt.emitter.position.set(-0.9, 0.2, 0);
    bolt.beamEnd = target;

    let t = 0;
    return {
        update(delta) {
            t += delta;
            target.position.set(0.9 + Math.sin(t * 0.8) * 0.4, 2.8 + Math.sin(t * 1.3) * 0.3, Math.sin(t) * 0.5);
            bolt.tint!.a = Math.min(1, 0.55 + 0.6 * Math.sin(t * 1.7));
        },
    };
}
