import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {geometryOf} from '../shared/geometry';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext} from '../types';

/**
 * Renderer options, one at a time: the panel picks an option and the same effect stands twice,
 * the option off on the left and on on the right, each side labelled.
 *
 * - Sort mode: overlapping alpha-blended discs drawn in emission order, then sorted back to front
 *   so the nearest is always on top.
 * - Align to direction: mesh darts all pointing the emitter's +Z, then each turned along the way
 *   its cone sends it (Unity's Align To Direction).
 * - Screen size limits: sizes from a pinprick to a boulder, then held on screen between 2 % and
 *   6 % of the viewport's height (`minParticleSize`, `maxParticleSize`).
 * - Scaling mode: an emitter under a parent scaled 3×; in `'shape'` only the shape grows, in
 *   `'hierarchy'` the particles and their speed grow with it.
 * - Render face: open bowls tumbling; `'both'` shows their inside through the opening, `'front'`
 *   culls the back faces and the inside disappears.
 * - Mesh render alignment: flat quads from an emitter turned a quarter round; `'simulation'` turns
 *   them with it, edge-on, `'view'` lays them face to the camera.
 * - Billboard render alignment: rings from an emitter turned to lie on the ground; `'view'` faces
 *   them to the camera, `'local'` lays them in the emitter's plane, flat on the ground.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 3.5, 15));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, -3.2);
    const glow = baseTexture(scene, 'glow');
    const spark = baseTexture(scene, 'spark');
    const ring = baseTexture(scene, 'ring');
    const disc = baseTexture(scene, 'disc');

    const options: {name: string; off: string; on: string; build: (side: 0 | 1, parent: TransformNode) => void}[] = [];
    const system = (parameters: ParticleSystemParameters, parent: TransformNode) => {
        const ps = new ParticleSystem(parameters);
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };

    options.push({
        name: 'Sort mode',
        off: "sortMode: 'none'",
        on: "sortMode: 'distance'",
        build: (side, parent) =>
            system(
                {
                    scene,
                    duration: 3,
                    looping: true,
                    startLife: new ConstantValue(3),
                    startSpeed: new IntervalValue(0.3, 0.6),
                    startSize: new ConstantValue(1.8),
                    startColor: new RandomColor(new Color4(1, 0.35, 0.2, 1), new Color4(0.25, 0.55, 1, 1)),
                    emissionOverTime: new ConstantValue(4),
                    shape: new SphereEmitter({radius: 0.8, thickness: 1}),
                    texture: disc,
                    transparent: true,
                    blendMode: Constants.ALPHA_COMBINE,
                    sortMode: side === 1 ? 'distance' : 'none',
                },
                parent
            ),
    });

    const dart = MeshBuilder.CreateCylinder(
        'dart',
        {diameterTop: 0, diameterBottom: 0.35, height: 1, tessellation: 6},
        scene
    );
    dart.rotation.x = Math.PI / 2; // the cone points +Y; turn its tip to +Z
    dart.bakeCurrentTransformIntoVertices();
    const dartGeometry = geometryOf(dart);
    options.push({
        name: 'Align to direction',
        off: 'alignToDirection: false',
        on: 'alignToDirection: true',
        build: (side, parent) => {
            const ps = system(
                {
                    scene,
                    duration: 2,
                    looping: true,
                    startLife: new ConstantValue(1.4),
                    startSpeed: new ConstantValue(4),
                    startSize: new ConstantValue(1),
                    startColor: new ConstantColor(new Color4(1, 0.8, 0.35, 1)),
                    emissionOverTime: new ConstantValue(12),
                    shape: new ConeEmitter({radius: 0.3, angle: 1}),
                    transparent: false,
                    renderMode: RenderMode.Mesh,
                    ...dartGeometry,
                    alignToDirection: side === 1,
                },
                parent
            );
            ps.emitter.rotation.x = -Math.PI / 2; // the cone emits along +Z; aim it up
            ps.emitter.position.y = -2.8;
        },
    });

    options.push({
        name: 'Screen size limits',
        off: 'no limits',
        on: 'minParticleSize, maxParticleSize',
        build: (side, parent) =>
            system(
                {
                    scene,
                    duration: 2,
                    looping: true,
                    startLife: new ConstantValue(1.8),
                    startSpeed: new IntervalValue(0.5, 1.5),
                    startSize: new IntervalValue(0.05, 3),
                    startColor: new ConstantColor(new Color4(0.6, 0.9, 1, 0.8)),
                    emissionOverTime: new ConstantValue(10),
                    shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                    texture: spark,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    ...(side === 1 ? {minParticleSize: 0.02, maxParticleSize: 0.06} : {}),
                },
                parent
            ),
    });

    options.push({
        name: 'Scaling mode',
        off: "scalingMode: 'shape'",
        on: "scalingMode: 'hierarchy'",
        build: (side, parent) => {
            // The same fountain under a parent scaled 3×, simulated in world space.
            const scaled = new TransformNode('scaled', scene);
            scaled.parent = parent;
            scaled.position.y = -3;
            scaled.scaling.setAll(3);
            scaled.rotation.x = -Math.PI / 2;
            const ps = system(
                {
                    scene,
                    duration: 2,
                    looping: true,
                    startLife: new ConstantValue(1.2),
                    startSpeed: new ConstantValue(2),
                    startSize: new ConstantValue(0.25),
                    startColor: new ConstantColor(new Color4(0.5, 1, 0.55, 1)),
                    worldSpace: true,
                    emissionOverTime: new ConstantValue(60),
                    shape: new ConeEmitter({radius: 0.3, angle: 0.3}),
                    texture: spark,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    scalingMode: side === 1 ? 'hierarchy' : 'shape',
                },
                scaled
            );
            ps.addBehavior(
                new SizeOverLife(
                    curve([
                        [0, 1],
                        [0.6, 0.8],
                        [1, 0],
                    ])
                )
            );
        },
    });

    const bowlGeometry = geometryOf(MeshBuilder.CreateSphere('bowl', {diameter: 1, segments: 12, slice: 0.5}, scene));
    options.push({
        name: 'Render face',
        off: "renderFace: 'both'",
        on: "renderFace: 'front'",
        build: (side, parent) =>
            system(
                {
                    scene,
                    duration: 2,
                    looping: true,
                    startLife: new ConstantValue(3),
                    startSpeed: new ConstantValue(0.4),
                    startSize: new ConstantValue(1.3),
                    startRotation: new RandomQuatGenerator(),
                    startColor: new RandomColor(new Color4(1, 0.6, 0.3, 1), new Color4(0.4, 0.8, 1, 1)),
                    emissionOverTime: new ConstantValue(3),
                    shape: new SphereEmitter({radius: 1, thickness: 1}),
                    transparent: false,
                    renderMode: RenderMode.Mesh,
                    ...bowlGeometry,
                    renderFace: side === 1 ? 'front' : 'both',
                },
                parent
            ),
    });

    const quadGeometry = geometryOf(MeshBuilder.CreatePlane('quad', {size: 1}, scene));
    options.push({
        name: 'Mesh render alignment',
        off: "renderAlignment: 'simulation'",
        on: "renderAlignment: 'view'",
        build: (side, parent) => {
            const ps = system(
                {
                    scene,
                    duration: 2,
                    looping: true,
                    startLife: new ConstantValue(3),
                    startSpeed: new IntervalValue(0.3, 0.6),
                    startSize: new ConstantValue(2.2),
                    // An angle about the mesh's Z: a spin in the quad's own plane.
                    startRotation: new IntervalValue(0, Math.PI * 2),
                    startColor: new RandomColor(new Color4(1, 0.8, 0.3, 1), new Color4(1, 0.4, 0.7, 1)),
                    emissionOverTime: new ConstantValue(4),
                    shape: new SphereEmitter({radius: 1, thickness: 1}),
                    texture: glow,
                    transparent: true,
                    blendMode: Constants.ALPHA_COMBINE,
                    renderMode: RenderMode.Mesh,
                    lighting: 'unlit',
                    ...quadGeometry,
                    renderAlignment: side === 1 ? 'view' : 'simulation',
                },
                parent
            );
            ps.emitter.rotation.y = Math.PI / 2;
        },
    });

    options.push({
        name: 'Billboard render alignment',
        off: "renderAlignment: 'view'",
        on: "renderAlignment: 'local'",
        build: (side, parent) => {
            // Rings spreading from an emitter whose XY plane is the ground.
            const ps = system(
                {
                    scene,
                    duration: 2,
                    looping: true,
                    startLife: new ConstantValue(2),
                    startSpeed: new ConstantValue(0),
                    startSize: new ConstantValue(1.2),
                    startColor: new RandomColor(new Color4(0.4, 1, 0.8, 1), new Color4(0.3, 0.6, 1, 1)),
                    emissionOverTime: new ConstantValue(3),
                    shape: new SphereEmitter({radius: 0.01, thickness: 1}),
                    texture: ring,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    renderAlignment: side === 1 ? 'local' : 'view',
                },
                parent
            );
            ps.emitter.rotation.x = Math.PI / 2;
            ps.emitter.position.y = -3;
            ps.addBehavior(
                new SizeOverLife(
                    curve([
                        [0, 1],
                        [1, 5],
                    ])
                )
            );
        },
    });

    // Each option's pair under one node, the left one off and the right one on, labelled.
    const groups = options.map((option) => {
        const group = new TransformNode(option.name, scene);
        for (const side of [0, 1] as const) {
            const holder = new TransformNode(`${option.name} ${side ? 'on' : 'off'}`, scene);
            holder.parent = group;
            holder.position.x = side ? 3.4 : -3.4;
            option.build(side, holder);
            addLabel(scene, side ? option.on : option.off, new BVector3(side ? 3.4 : -3.4, 3.2, 0), {
                height: 0.42,
            }).parent = group;
        }
        return group;
    });
    const show = (name: string) => {
        for (const group of groups) {
            group.setEnabled(group.name === name);
        }
    };
    show(options[0].name);
    controls.choice(
        'Option',
        options.map((option) => option.name),
        options[0].name,
        show
    );
}
