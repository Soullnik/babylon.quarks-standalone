import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ApplyForce,
    Bezier,
    ConstantColor,
    ConstantValue,
    EffectPool,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    QuarksUtil,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {createColorOverLifeGradient, createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/** Targets the hits land on, laid out in a ring. */
const TARGET_COUNT = 6;
const TARGET_RADIUS = 7;

/**
 * Builds the template of one hit: a flash, an expanding ring and a burst of
 * sparks under a parent node. The pool clones this node; it is never played
 * itself and stays disabled.
 */
function createHitTemplate({scene, batchRenderer}: DemoContext): TransformNode {
    const texture = createSharedTexture(scene);
    const root = new TransformNode('hit', scene);
    const burst = (count: number) => [
        {time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1},
    ];

    const flash = new ParticleSystem({
        scene,
        duration: 0.4,
        looping: false,
        startLife: new ConstantValue(0.25),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(5),
        startColor: new ConstantColor(new Color4(1, 0.95, 0.7, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: burst(1),
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    flash.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])));

    const ring = new ParticleSystem({
        scene,
        duration: 0.6,
        looping: false,
        startLife: new ConstantValue(0.5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(6),
        startColor: new ConstantColor(new Color4(1, 0.6, 0.2, 0.8)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: burst(1),
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    ring.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.2, 0.7, 0.9, 1), 0]])));
    ring.addBehavior(createColorOverLifeGradient(new Color4(1, 0.6, 0.2, 0.8), new Color4(1, 0.2, 0.1, 0)));

    const sparks = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.5, 0.9),
        startSpeed: new IntervalValue(8, 16),
        startSize: new IntervalValue(0.25, 0.45),
        startColor: new RandomColor(new Color4(1, 0.9, 0.5, 1), new Color4(1, 0.5, 0.1, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: burst(60),
        shape: new SphereEmitter({radius: 0.3, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.06, lengthFactor: 1},
        renderOrder: 3,
    });
    sparks.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(25)));
    sparks.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.5, 0), 0]])));

    for (const system of [flash, ring, sparks]) {
        system.emitter.parent = root;
    }
    QuarksUtil.addToBatchRenderer(root, batchRenderer);
    root.setEnabled(false);
    return root;
}

export function init(ctx: DemoContext) {
    const {scene, camera, demoState} = ctx;
    camera.setPosition(new BVector3(0, 10, 22));

    const targetMaterial = new StandardMaterial('target', scene);
    targetMaterial.diffuseColor = new Color3(0.25, 0.3, 0.45);
    targetMaterial.specularColor = Color3.Black();
    const targets: BVector3[] = [];
    for (let i = 0; i < TARGET_COUNT; i++) {
        const angle = (i / TARGET_COUNT) * Math.PI * 2;
        const position = new BVector3(Math.cos(angle) * TARGET_RADIUS, 1, Math.sin(angle) * TARGET_RADIUS);
        const target = MeshBuilder.CreateSphere(`target${i}`, {diameter: 1.4, segments: 12}, scene);
        target.position.copyFrom(position);
        target.material = targetMaterial;
        targets.push(position);
    }

    const template = createHitTemplate(ctx);
    // Four copies made up front, so no hit pays for cloning; eight at most, a cap
    // this cadence stays well under, so `acquire` never comes back empty here.
    const pool = new EffectPool(template, {renderer: ctx.batchRenderer, prewarm: 4, maxSize: 8});
    // The template's longest system decides how fast hits may follow each other
    // and still overlap by about half.
    const period = QuarksUtil.getDuration(template) / 2;
    demoState.pooledHits = {pool, targets, elapsed: period, period, index: 0};
}

export function update({demoState, systems}: DemoContext, delta: number) {
    const st = demoState.pooledHits;
    if (!st) {
        return;
    }
    st.elapsed += delta;
    if (st.elapsed < st.period) {
        return;
    }
    st.elapsed = 0;
    const position = st.targets[st.index % st.targets.length];
    st.index++;
    const copy = st.pool.acquire(position);
    if (!copy) {
        return; // every copy is busy: the pool is at its size, so this hit is skipped
    }
    // A heavier hit every third time: emission counts scale without touching the curves.
    const strength = st.index % 3 === 0 ? 2 : 1;
    QuarksUtil.runOnAllParticleEmitters(copy, (emitter) => {
        const system = emitter.system as ParticleSystem;
        system.emissionMultiplier = strength;
        // The copies are what plays, so they are what the viewer counts and exports.
        if (!systems.includes(system)) {
            systems.push(system);
        }
    });
}
