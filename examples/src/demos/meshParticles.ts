import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    AxisAngleGenerator,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
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
import {geometryOf} from '../shared/geometry';
import {addCaption} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
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
