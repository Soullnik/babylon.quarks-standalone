import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ApplyForce,
    ColorOverLength,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    type CullingMode,
    Gradient,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RenderMode,
    VelocityOverLife,
} from 'babylon.quarks';
import {addCaption, addStatus} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext, DemoRun} from '../types';

const FLOOR = -2.6;
/** Every camera's default layer mask, which Babylon gives cameras and meshes. */
const ALL_LAYERS = 0x0fffffff;
/** Seconds of each cycle the row of clocks spends on screen, then off it. */
const ON_SCREEN = 2.5;
const OFF_SCREEN = 1.5;

/**
 * What a system does when no camera sees it, and which cameras draw it, one topic at a time
 * (picked in the panel), each labelled in the scene.
 *
 * - Culling mode: three clocks, a comet each going round its face at one turn every few seconds,
 *   its own time under it, and a white mark on each face where a comet that never stopped is.
 *   Every few seconds the comets are moved off screen for a moment (the faces stay). `'always'`
 *   keeps simulating, so it comes back on its mark; `'pause'` freezes off screen, so it comes back
 *   behind its mark, a little further each time; `'pauseAndCatchUp'` freezes too, then runs the
 *   time it missed when it is seen again, and comes back on its mark.
 * - Layers: two fountains on camera layers 1 and 2 (`system.layers.mask`). The panel sets which
 *   layers the camera draws (`camera.layerMask`), as a second camera (a minimap, a portrait) would
 *   draw only its own.
 */
export function init({scene, camera, add, controls}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    const glow = baseTexture(scene, 'glow');
    const spark = baseTexture(scene, 'spark');

    const system = (parent: TransformNode, parameters: Omit<ParticleSystemParameters, 'scene'>) => {
        const ps = new ParticleSystem({scene, ...parameters});
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };
    const ticks: ((delta: number) => void)[] = [];
    const topics: Topic[] = [];

    topics.push({
        name: 'Culling mode',
        build(group) {
            // The clocks hang on a row the demo moves off screen and back.
            const row = new TransformNode('row', scene);
            row.parent = group;
            const modes: {mode: CullingMode; color: Color3}[] = [
                {mode: 'always', color: new Color3(1, 0.75, 0.35)},
                {mode: 'pause', color: new Color3(0.45, 0.85, 1)},
                {mode: 'pauseAndCatchUp', color: new Color3(0.7, 1, 0.45)},
            ];
            const radius = 1.3;
            const faceMaterial = new StandardMaterial('face', scene);
            faceMaterial.emissiveColor = new Color3(0.35, 0.38, 0.48);
            faceMaterial.disableLighting = true;
            const markerMaterial = new StandardMaterial('marker', scene);
            markerMaterial.emissiveColor = new Color3(1, 1, 1);
            markerMaterial.disableLighting = true;
            markerMaterial.alpha = 0.85;
            const clocks = modes.map(({mode, color}, index) => {
                const x = (index - 1) * 4.4;
                // One comet that lives as long as the demo, going round a point beside where it is
                // born: a trail of its last positions behind it.
                const comet = system(row, {
                    duration: 1e4,
                    looping: false,
                    cullingMode: mode,
                    startLife: new ConstantValue(1e4),
                    startSpeed: new ConstantValue(0),
                    startSize: new ConstantValue(0.5),
                    startColor: new ConstantColor(new Color4(color.r, color.g, color.b, 1)),
                    emissionOverTime: new ConstantValue(0),
                    emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
                    shape: new PointEmitter(),
                    renderMode: RenderMode.Trail,
                    rendererEmitterSettings: {startLength: new ConstantValue(40)},
                    texture: glow,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                comet.emitter.position.set(x - radius, 0.4, 0);
                comet.addBehavior(
                    new VelocityOverLife(
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        // Slow enough that what 'pause' misses off screen is a part of a turn.
                        new ConstantValue(1.1),
                        'local',
                        new ConstantValue(0),
                        {x: radius, y: 0, z: 0}
                    )
                );
                comet.addBehavior(
                    new ColorOverLength(
                        new Gradient(
                            [
                                [new Color3(1, 1, 1), 0],
                                [color, 1],
                            ],
                            [
                                [1, 0],
                                [0, 1],
                            ]
                        )
                    )
                );
                addCaption(
                    scene,
                    group,
                    x,
                    mode === 'pauseAndCatchUp' ? 'Pauses, catches up' : mode === 'pause' ? 'Pauses' : 'Always runs',
                    `cullingMode: '${mode}'`
                );
                const status = addStatus(scene, row, new BVector3(x, -1.9, 0.5));
                // The clock's face, which stays on screen: the comet's round, and a marker where a
                // comet that never stopped is (the 'always' one's place, which keeps simulating).
                const face = MeshBuilder.CreateTorus(
                    `face ${mode}`,
                    {diameter: radius * 2, thickness: 0.03, tessellation: 64},
                    scene
                );
                face.rotation.x = Math.PI / 2;
                face.position.set(x, 0.4, 0);
                face.material = faceMaterial;
                face.parent = group;
                // A ring, so the comet's head shows through it when it is on its mark.
                const marker = MeshBuilder.CreateTorus(
                    `marker ${mode}`,
                    {diameter: 0.55, thickness: 0.07, tessellation: 32},
                    scene
                );
                marker.rotation.x = Math.PI / 2;
                marker.material = markerMaterial;
                marker.parent = group;
                return {comet, status, marker, x};
            });
            const clock = addStatus(scene, group, new BVector3(0, -2.5, 3.5));
            addStatus(scene, group, new BVector3(0, 2.4, 0))('white ring: where a comet that never stopped is');
            const reference = clocks[0].comet;
            let time = 0;
            ticks.push((delta) => {
                time += delta;
                const away = time % (ON_SCREEN + OFF_SCREEN) >= ON_SCREEN;
                row.position.x = away ? 30 : 0;
                // The 'always' comet keeps simulating off screen: its place is every clock's mark.
                const head = reference.particleNum > 0 ? reference.particles[0].position : undefined;
                for (const {comet, status, marker, x} of clocks) {
                    status(`its time: ${comet.time.toFixed(1)} s`);
                    if (head) marker.position.set(x - radius + head.x, 0.4 + head.y, head.z);
                }
                clock(
                    away
                        ? `the comets are off screen, culled · demo time ${time.toFixed(1)} s`
                        : `back on screen: on its mark, or behind it? · demo time ${time.toFixed(1)} s`
                );
            });
        },
    });

    topics.push({
        name: 'Layers',
        build(group) {
            [1, 2].forEach((layer, index) => {
                const x = index === 0 ? -3.4 : 3.4;
                const fountain = system(group, {
                    duration: 2,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(1.4, 1.7),
                    startSpeed: new IntervalValue(5, 6),
                    startSize: new IntervalValue(0.26, 0.36),
                    startColor: new ConstantColor(
                        layer === 1 ? new Color4(1, 0.7, 0.35, 1) : new Color4(0.45, 0.8, 1, 1)
                    ),
                    emissionOverTime: new ConstantValue(40),
                    shape: new ConeEmitter({radius: 0.1, angle: 0.25}),
                    texture: spark,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                fountain.layers.mask = layer;
                fountain.emitter.position.set(x, FLOOR + 0.1, 0);
                fountain.emitter.rotation.x = -Math.PI / 2; // the cone emits along +z; aim it up
                fountain.addBehavior(new ApplyForce({x: 0, y: -1, z: 0}, new ConstantValue(7)));
                addCaption(scene, group, x, `On layer ${layer}`, `layers.mask = ${layer}`);
            });
        },
    });

    showTopics(scene, controls, topics);

    const cameraMask = camera.layerMask;
    const masks = {'All layers': ALL_LAYERS, 'Layer 1': 1, 'Layer 2': 2} as const;
    controls.choice('Camera layers', Object.keys(masks) as (keyof typeof masks)[], 'All layers', (choice) => {
        // The labels and the floor stay on the default mask, which takes in both layers.
        camera.layerMask = masks[choice];
    });

    return {
        update(delta) {
            for (const tick of ticks) {
                tick(delta);
            }
        },
        dispose() {
            camera.layerMask = cameraMask;
        },
    };
}
