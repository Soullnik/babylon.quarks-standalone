import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ApplyForce,
    AxisAngleGenerator,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    EulerGenerator,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    RandomColor,
    RenderMode,
    Rotation3DOverLife,
    type RotationIntegration,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {geometryOf, spike} from '../shared/geometry';
import {addCaption} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, kenneyTexture, rampTexture} from '../shared/textures';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext, DemoRun} from '../types';

const FLOOR = -2.6;

/**
 * What mesh particles add to sprites, one topic at a time (picked in the panel), each labelled in
 * the scene.
 *
 * - Vertex colours: shards bursting out, solid; then with the mesh's own vertex colours
 *   (`instancingColors`), bright at the base and fading out to the tip, as a glTF `COLOR_0`
 *   would draw them.
 * - Textured spikes: ice and blood spikes bursting out of the ground in a ring, standing, then
 *   sinking back, as a game's stakes: a faceted mesh with streaks and cracks running up it, coloured
 *   by a ramp (`gradientMap`), its edges lit (`rim`), kept upright by `renderAlignment: 'world'`.
 * - Rotation axis: triangular plates rising in a column and spun by a number rotation. About the
 *   mesh's own Z (`'z'`) they tumble, edge on now and then; about an axis picked from the direction
 *   they are emitted in (`'emission'`), here their own normal, they spin flat, facing the camera.
 * - 3D rotation: leaves tilted back at birth and spun about y. `'turn'` spins each about its own
 *   tilted axis; `'angles'` adds to its Euler angles, so it keeps its tilt and pirouettes about the
 *   vertical, as Unity's Rotation over Lifetime with Separate Axes does.
 * - World alignment: leaves from an emitter turning like a wheel. Measured in the simulation's
 *   (the emitter's) axes they turn with it; in the world's (`renderAlignment: 'world'`) they stay
 *   upright.
 */
export function init({scene, camera, add, controls}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    const leaf = baseTexture(scene, 'leaf');

    const system = (parent: TransformNode, parameters: Omit<ParticleSystemParameters, 'scene'>) => {
        const ps = new ParticleSystem({scene, ...parameters});
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };
    const quad = geometryOf(MeshBuilder.CreatePlane('quad', {size: 1}, scene));
    const ticks: ((delta: number) => void)[] = [];
    const topics: Topic[] = [];

    topics.push({
        name: 'Textured spikes',
        build(group) {
            // Spikes as a game's ice or blood stakes: a faceted mesh with streaks and cracks running
            // up it (a texture), coloured by a ramp (gradientMap), its edges lit (rim), bursting out
            // of the ground in a ring, standing, then sinking back. renderAlignment 'world' keeps
            // them upright although the ring is laid flat by turning the emitter.
            const veins = kenneyTexture(scene, 'veins', true);
            const kinds = [
                {
                    x: -3.4,
                    title: 'Ice',
                    ramp: rampTexture(scene, 'ice', [
                        [0, '#1d4f94', 1],
                        [0.35, '#4aa6f0', 1],
                        [0.7, '#bff0ff', 1],
                        [1, '#ffffff', 1],
                    ]),
                    rim: [0.55, 0.85, 1] as [number, number, number],
                    debris: [new Color4(0.7, 0.9, 1, 1), new Color4(1, 1, 1, 1)],
                },
                {
                    x: 3.4,
                    title: 'Blood',
                    ramp: rampTexture(scene, 'blood', [
                        [0, '#2a0006', 1],
                        [0.35, '#8a0c18', 1],
                        [0.7, '#e0243a', 1],
                        [1, '#ffb0b0', 1],
                    ]),
                    rim: [1, 0.3, 0.3] as [number, number, number],
                    debris: [new Color4(0.45, 0.01, 0.03, 1), new Color4(0.8, 0.06, 0.08, 1)],
                },
            ];
            const once = (count: number) => [
                {time: 0, count: new ConstantValue(count), cycle: 1, interval: 0, probability: 1},
            ];
            for (const kind of kinds) {
                const spikes = system(group, {
                    duration: 2,
                    looping: true,
                    startLife: new IntervalValue(1.8, 2.1),
                    startSpeed: new ConstantValue(0),
                    startSize: new IntervalValue(1.1, 2.1),
                    startRotation: new EulerGenerator(
                        new IntervalValue(-0.35, 0.35),
                        new IntervalValue(0, Math.PI * 2),
                        new IntervalValue(-0.35, 0.35),
                        'YXZ'
                    ),
                    startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
                    emissionOverTime: new ConstantValue(0),
                    emissionBursts: once(9),
                    shape: new DonutEmitter({radius: 1, donutRadius: 0.35, thickness: 1, arc: Math.PI * 2}),
                    renderMode: RenderMode.Mesh,
                    renderAlignment: 'world',
                    ...spike(0.16),
                    texture: veins,
                    gradientMap: {ramp: kind.ramp, channel: 'r'},
                    rim: {color: kind.rim, power: 2, strength: 1, mode: 'add'},
                    lighting: 'fixed',
                    transparent: false,
                    renderFace: 'front',
                    blendMode: Constants.ALPHA_DISABLE,
                });
                spikes.emitter.position.set(kind.x, FLOOR, 0);
                spikes.emitter.rotation.x = -Math.PI / 2; // the donut lies in its xy plane: lay it flat
                spikes.addBehavior(
                    new SizeOverLife(
                        curve([
                            [0, 0],
                            [0.08, 1.08],
                            [0.14, 1],
                            [0.8, 1],
                            [1, 0],
                        ])
                    )
                );
                // Shards or drops thrown up as they burst out, falling back.
                const debris = system(group, {
                    duration: 2,
                    looping: true,
                    startLife: new IntervalValue(0.6, 1),
                    startSpeed: new IntervalValue(2.5, 4.5),
                    startSize: new IntervalValue(0.08, 0.16),
                    startColor: new RandomColor(kind.debris[0], kind.debris[1]),
                    emissionOverTime: new ConstantValue(0),
                    emissionBursts: once(30),
                    shape: new ConeEmitter({radius: 1.1, angle: 0.5, thickness: 0.4}),
                    texture: baseTexture(scene, 'spark'),
                    renderMode: RenderMode.StretchedBillBoard,
                    rendererEmitterSettings: {speedFactor: 0.06, lengthFactor: 1},
                    transparent: true,
                    blendMode: kind.title === 'Ice' ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE,
                });
                debris.emitter.position.set(kind.x, FLOOR + 0.1, 0);
                debris.emitter.rotation.x = -Math.PI / 2;
                debris.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(9)));
                addCaption(scene, group, kind.x, kind.title, 'texture + gradientMap + rim');
            }
        },
    });

    topics.push({
        name: 'Vertex colours',
        build(group) {
            // A six-sided shard, its tip along +Z, a unit long.
            const shardMesh = MeshBuilder.CreateCylinder(
                'shard',
                {diameterTop: 0, diameterBottom: 0.3, height: 1, tessellation: 6},
                scene
            );
            shardMesh.rotation.x = Math.PI / 2;
            shardMesh.bakeCurrentTransformIntoVertices();
            const positions = shardMesh.getVerticesData(VertexBuffer.PositionKind)!;
            const shard = geometryOf(shardMesh);
            // White-hot and opaque at the base, cooling to blue and gone at the tip.
            const colors = new Float32Array((positions.length / 3) * 4);
            for (let i = 0; i < positions.length / 3; i++) {
                const t = positions[i * 3 + 2] + 0.5;
                colors.set([1 - 0.6 * t, 1 - 0.25 * t, 1, 1 - t], i * 4);
            }
            [false, true].forEach((colored, index) => {
                const x = index === 0 ? -3.4 : 3.4;
                const ps = system(group, {
                    duration: 1.5,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(1.2, 1.5),
                    startSpeed: new IntervalValue(0.6, 1),
                    startSize: new IntervalValue(1.4, 1.9),
                    startColor: new ConstantColor(new Color4(0.35, 0.65, 1, 1)),
                    emissionOverTime: new ConstantValue(14),
                    shape: new SphereEmitter({radius: 0.3, thickness: 1}),
                    renderMode: RenderMode.Mesh,
                    ...shard,
                    ...(colored ? {instancingColors: colors} : {}),
                    alignToDirection: true,
                    lighting: 'unlit',
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                ps.emitter.position.set(x, 0.2, 0);
                ps.addBehavior(
                    new SizeOverLife(
                        curve([
                            [0, 0.3],
                            [0.25, 1],
                            [1, 0.6],
                        ])
                    )
                );
                addCaption(
                    scene,
                    group,
                    x,
                    colored ? 'Fading along the mesh' : 'Solid',
                    colored ? 'instancingColors: base → tip' : 'no vertex colours'
                );
            });
        },
    });

    // A triangular plate in the mesh's XZ plane.
    const plate = geometryOf(MeshBuilder.CreateCylinder('plate', {diameter: 1, height: 0.08, tessellation: 3}, scene));
    topics.push({
        name: 'Rotation axis',
        build(group) {
            (['z', 'emission'] as const).forEach((axis, index) => {
                const x = index === 0 ? -3.4 : 3.4;
                const ps = system(group, {
                    duration: 3,
                    looping: true,
                    prewarm: true,
                    startLife: new ConstantValue(3),
                    startSpeed: new IntervalValue(1.2, 1.6),
                    startSize: new IntervalValue(0.6, 0.75),
                    startRotation: new IntervalValue(0, Math.PI * 2),
                    rotationAxis: axis,
                    startColor: new RandomColor(new Color4(1, 0.7, 0.3, 1), new Color4(0.45, 0.8, 1, 1)),
                    emissionOverTime: new ConstantValue(3.2),
                    // Sent straight along the cone's axis from next to it: 'emission' then
                    // turns every plate about Y, its own normal.
                    shape: new ConeEmitter({radius: 0.05, angle: 0}),
                    renderMode: RenderMode.Mesh,
                    ...plate,
                    lighting: 'fixed',
                    transparent: false,
                });
                ps.emitter.position.set(x, FLOOR + 0.4, 0);
                ps.emitter.rotation.x = -Math.PI / 2; // the cone emits along +z; aim it up
                ps.addBehavior(new RotationOverLife(new ConstantValue(2.5)));
                addCaption(
                    scene,
                    group,
                    x,
                    axis === 'z' ? "About the mesh's Z" : 'About an axis from its direction',
                    `rotationAxis: '${axis}'`
                );
            });
        },
    });

    const leaves = (parameters: Partial<ParticleSystemParameters>): Omit<ParticleSystemParameters, 'scene'> => ({
        duration: 4,
        looping: true,
        prewarm: true,
        startLife: new ConstantValue(4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(1, 1.2),
        startColor: new RandomColor(new Color4(0.95, 0.42, 0.12, 1), new Color4(0.8, 0.78, 0.22, 1)),
        emissionOverTime: new ConstantValue(2.5),
        shape: new SphereEmitter({radius: 1.4, thickness: 1}),
        texture: leaf,
        renderMode: RenderMode.Mesh,
        ...quad,
        lighting: 'unlit',
        transparent: false,
        alphaTest: 0.5,
        ...parameters,
    });

    topics.push({
        name: '3D rotation',
        build(group) {
            (['turn', 'angles'] as RotationIntegration[]).forEach((integration, index) => {
                const x = index === 0 ? -3.4 : 3.4;
                const ps = system(
                    group,
                    leaves({startRotation: new AxisAngleGenerator({x: 1, y: 0, z: 0}, new ConstantValue(0.75))})
                );
                ps.emitter.position.set(x, 0.3, 0);
                ps.addBehavior(
                    new Rotation3DOverLife(
                        new EulerGenerator(new ConstantValue(0), new ConstantValue(2.4), new ConstantValue(0), 'YXZ'),
                        {integration}
                    )
                );
                addCaption(
                    scene,
                    group,
                    x,
                    integration === 'turn' ? 'About its own tilted axis' : 'Keeps its tilt, turns about y',
                    `integration: '${integration}'`
                );
            });
        },
    });

    topics.push({
        name: 'World alignment',
        build(group) {
            const wheels = (['simulation', 'world'] as const).map((alignment, index) => {
                const x = index === 0 ? -3.4 : 3.4;
                const ps = system(group, leaves({renderAlignment: alignment, emissionOverTime: new ConstantValue(4)}));
                ps.emitter.position.set(x, 0.3, 0);
                addCaption(
                    scene,
                    group,
                    x,
                    alignment === 'world' ? 'Upright in the world' : 'Turning with the emitter',
                    `renderAlignment: '${alignment}'`
                );
                return ps;
            });
            // Both emitters turn like a wheel facing the camera.
            ticks.push((delta) => {
                for (const ps of wheels) {
                    ps.emitter.rotation.z += delta * 0.9;
                }
            });
        },
    });

    showTopics(scene, controls, topics);

    return {
        update(delta) {
            for (const tick of ticks) {
                tick(delta);
            }
        },
    };
}
