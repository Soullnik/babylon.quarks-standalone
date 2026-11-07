import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ApplyForce,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EffectPool,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    QuarksUtil,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import {every} from '../shared/timing';
import type {DemoContext, DemoRun} from '../types';

/** Targets the hits land on, laid out in a ring. */
const TARGET_COUNT = 6;
const TARGET_RADIUS = 5;

/**
 * Builds the template of one hit, layered and staged as a game's hit is: two stacked star flashes
 * and a glow that pops, a ring, sparks laid along their flight and embers that fall, and a puff of
 * smoke left behind. The pool clones this node; it is never played itself and stays disabled.
 */
function createHitTemplate({scene, batchRenderer}: DemoContext): TransformNode {
    const root = new TransformNode('hit', scene);
    const burst = (count: number, time = 0) => [
        {time, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1},
    ];
    const layer = (name: string, parameters: Partial<ParticleSystemParameters>) => {
        const ps = new ParticleSystem({
            scene,
            duration: 0.6,
            looping: false,
            startSpeed: new ConstantValue(0),
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            ...parameters,
        } as ParticleSystemParameters);
        ps.emitter.name = name;
        ps.emitter.parent = root;
        return ps;
    };

    const flash = layer('Flash', {
        startLife: new IntervalValue(0.18, 0.26),
        startSize: new IntervalValue(2.6, 3.2),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 1, 1, 1), new Color4(1, 0.85, 0.55, 1)),
        emissionBursts: burst(2),
        texture: baseTexture(scene, 'flash'),
        ...sheetOf('flash'),
        renderOrder: 3,
    });
    flash.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 7.99],
            ])
        )
    );

    const glow = layer('Glow', {
        startLife: new ConstantValue(0.18),
        startSize: new ConstantValue(3.2),
        startColor: new ConstantColor(new Color4(1, 0.45, 0.15, 1)),
        emissionBursts: burst(1),
        texture: baseTexture(scene, 'glow'),
        renderOrder: 2,
    });
    glow.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.3],
                [0.25, 1],
                [1, 0.4],
            ])
        )
    );
    glow.addBehavior(new ColorOverLife(fade(0, 0.3)));

    const ring = layer('Ring', {
        startLife: new ConstantValue(0.35),
        startSize: new ConstantValue(3.4),
        startColor: new ConstantColor(new Color4(1, 0.7, 0.35, 1)),
        emissionBursts: burst(1, 0.03),
        texture: baseTexture(scene, 'ring'),
        renderOrder: 2,
    });
    ring.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.2],
                [0.4, 0.85],
                [1, 1],
            ])
        )
    );
    ring.addBehavior(new ColorOverLife(fade(0, 0.3)));

    const sparks = layer('Sparks', {
        duration: 1,
        startLife: new IntervalValue(0.25, 0.5),
        startSpeed: new IntervalValue(6, 12),
        startSize: new IntervalValue(0.12, 0.2),
        startColor: new RandomColor(new Color4(1, 0.95, 0.7, 1), new Color4(1, 0.6, 0.2, 1)),
        worldSpace: true,
        emissionBursts: burst(24),
        shape: new SphereEmitter({radius: 0.2, thickness: 1}),
        texture: baseTexture(scene, 'streak'),
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.05, lengthFactor: 1},
        renderOrder: 4,
    });
    sparks.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(18)));

    const embers = layer('Embers', {
        duration: 1,
        startLife: new IntervalValue(0.5, 0.8),
        startSpeed: new IntervalValue(2, 5),
        startSize: new IntervalValue(0.1, 0.18),
        startColor: new RandomColor(new Color4(1, 0.7, 0.3, 1), new Color4(1, 0.4, 0.1, 1)),
        worldSpace: true,
        emissionBursts: burst(10, 0.03),
        shape: new SphereEmitter({radius: 0.2, thickness: 1}),
        texture: baseTexture(scene, 'spark'),
        renderOrder: 4,
    });
    embers.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(8)));
    embers.addBehavior(new ColorOverLife(fade(0.05, 0.7)));

    const smoke = layer('Smoke', {
        duration: 1.2,
        startLife: new IntervalValue(0.7, 1),
        startSpeed: new IntervalValue(0.3, 0.7),
        startSize: new IntervalValue(1.2, 1.6),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(0.45, 0.42, 0.4, 0.6), new Color4(0.6, 0.56, 0.52, 0.7)),
        emissionBursts: burst(3, 0.08),
        shape: new SphereEmitter({radius: 0.3}),
        texture: baseTexture(scene, 'smoke_puff'),
        ...sheetOf('smoke_puff'),
        blendTiles: true,
        blendMode: Constants.ALPHA_COMBINE,
        renderOrder: 1,
    });
    smoke.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 15.99],
            ])
        )
    );

    QuarksUtil.addToBatchRenderer(root, batchRenderer);
    root.setEnabled(false);
    return root;
}

export function init(ctx: DemoContext): DemoRun {
    const {scene, camera, systems} = ctx;
    camera.setPosition(new BVector3(0, 8, 17));
    camera.setTarget(new BVector3(0, 0.8, 0));
    addGround(scene);

    // Dummies in a ring; each hit lands on a dummy's chest, on the side toward the camera.
    const targetMaterial = new StandardMaterial('target', scene);
    targetMaterial.diffuseColor = new Color3(0.36, 0.36, 0.42);
    targetMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    const targets: BVector3[] = [];
    for (let i = 0; i < TARGET_COUNT; i++) {
        const angle = (i / TARGET_COUNT) * Math.PI * 2;
        const x = Math.cos(angle) * TARGET_RADIUS;
        const z = Math.sin(angle) * TARGET_RADIUS;
        const dummy = MeshBuilder.CreateCapsule(`target${i}`, {height: 1.8, radius: 0.32}, scene);
        dummy.position.set(x, 0.9, z);
        dummy.material = targetMaterial;
        targets.push(new BVector3(x, 1.2, z + 0.5));
    }

    const template = createHitTemplate(ctx);
    // Four copies made up front, so no hit pays for cloning; eight at most, a cap
    // this cadence stays well under, so `acquire` never comes back empty here.
    const pool = new EffectPool(template, {renderer: ctx.batchRenderer, prewarm: 4, maxSize: 8});
    // The template's longest system decides how fast hits may follow each other: four overlap,
    // the smoke of one still rising as the next lands.
    const period = QuarksUtil.getDuration(template) / 4;
    let index = 0;
    const hit = () => {
        const position = targets[index % targets.length];
        index++;
        const copy = pool.acquire(position);
        if (!copy) {
            return; // every copy is busy: the pool is at its size, so this hit is skipped
        }
        // A heavier hit every third time: emission counts scale without touching the curves.
        const strength = index % 3 === 0 ? 2 : 1;
        QuarksUtil.runOnAllParticleEmitters(copy, (emitter) => {
            const system = emitter.system as ParticleSystem;
            system.emissionMultiplier = strength;
            // The copies are what plays, so they are what the viewer counts and exports.
            if (!systems.includes(system)) {
                systems.push(system);
            }
        });
    };
    return {update: every(period, hit)};
}
