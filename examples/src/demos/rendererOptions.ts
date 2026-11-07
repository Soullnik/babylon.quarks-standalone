import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    BoxEmitter,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EulerGenerator,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {geometryOf, type InstancingGeometry, spike} from '../shared/geometry';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, kenneySheet, kenneyTexture, rampTexture, sheetOf} from '../shared/textures';
import type {DemoContext} from '../types';

/**
 * Renderer options, one at a time: the panel picks an option and the same effect stands twice,
 * the option off on the left and on on the right, each side labelled.
 *
 * - Sort mode: overlapping puffs of light and dark smoke drawn in emission order, then sorted back
 *   to front so the nearest is always on top.
 * - Align to direction: ice shards all pointing the emitter's +Z, then each turned along the way
 *   its cone sends it (Unity's Align To Direction).
 * - Screen size limits: sizes from a pinprick to a boulder, then held on screen between 2 % and
 *   6 % of the viewport's height (`minParticleSize`, `maxParticleSize`).
 * - Scaling mode: an emitter under a parent scaled 3×; in `'shape'` only the shape grows, in
 *   `'hierarchy'` the particles and their speed grow with it.
 * - Render face: leaves (flat cards) tumbling down; `'both'` draws a leaf from either side,
 *   `'front'` culls its back, so a leaf vanishes while it is turned away.
 * - Mesh render alignment: magic circles on flat quads from an emitter turned a quarter round;
 *   `'simulation'` turns them with it, edge-on, `'view'` lays them face to the camera.
 * - Billboard render alignment: rings from an emitter turned to lie on the ground; `'view'` faces
 *   them to the camera, `'local'` lays them in the emitter's plane, flat on the ground.
 * - Flip: tongues of one flame sheet curling the same way; with `flip` half are mirrored and curl
 *   the other way.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 3.5, 15));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, -3.2);
    const stars = kenneyTexture(scene, 'stars');
    const ring = baseTexture(scene, 'ring');
    const puffs = kenneyTexture(scene, 'puffs');
    const fire = baseTexture(scene, 'fire');
    // A random star of the sheet each.
    const star = {texture: stars, ...kenneySheet('stars'), startTileIndex: new IntervalValue(0, 3)};

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
                    startSize: new IntervalValue(1.8, 2.3),
                    startRotation: new IntervalValue(0, Math.PI * 2),
                    // Light and dark smoke, so which puff is drawn over which shows at a glance.
                    startColor: new RandomColor(new Color4(0.22, 0.24, 0.3, 1), new Color4(0.98, 0.8, 0.6, 1)),
                    emissionOverTime: new ConstantValue(5),
                    shape: new SphereEmitter({radius: 0.8, thickness: 1}),
                    texture: puffs,
                    ...kenneySheet('puffs'),
                    startTileIndex: new IntervalValue(0, 25),
                    transparent: true,
                    blendMode: Constants.ALPHA_COMBINE,
                    sortMode: side === 1 ? 'distance' : 'none',
                },
                parent
            ).addBehavior(new ColorOverLife(fade(0.1, 0.75))),
    });

    // Ice shards: the spike of Mesh Particles, centred and laid along +Z (the way a particle with
    // alignToDirection points), its veins coloured by an ice ramp, its edges lit.
    const shard = pointingZ(spike(0.2));
    const iceRamp = rampTexture(scene, 'ice', [
        [0, '#1d4f94', 1],
        [0.35, '#4aa6f0', 1],
        [0.7, '#bff0ff', 1],
        [1, '#ffffff', 1],
    ]);
    const veins = kenneyTexture(scene, 'veins', true);
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
                    startSize: new IntervalValue(0.9, 1.3),
                    startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
                    emissionOverTime: new ConstantValue(12),
                    shape: new ConeEmitter({radius: 0.3, angle: 1}),
                    transparent: false,
                    renderMode: RenderMode.Mesh,
                    ...shard,
                    texture: veins,
                    gradientMap: {ramp: iceRamp, channel: 'r'},
                    rim: {color: [0.55, 0.85, 1], power: 2, strength: 1, mode: 'add'},
                    lighting: 'fixed',
                    renderFace: 'front',
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
                    startRotation: new IntervalValue(0, Math.PI * 2),
                    startColor: new ConstantColor(new Color4(0.55, 0.85, 1, 0.6)),
                    emissionOverTime: new ConstantValue(10),
                    shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                    ...star,
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
                    startSize: new ConstantValue(0.3),
                    startRotation: new IntervalValue(0, Math.PI * 2),
                    startColor: new ConstantColor(new Color4(0.5, 1, 0.55, 1)),
                    worldSpace: true,
                    emissionOverTime: new ConstantValue(60),
                    shape: new ConeEmitter({radius: 0.3, angle: 0.3}),
                    ...star,
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

    const quadGeometry = geometryOf(MeshBuilder.CreatePlane('quad', {size: 1}, scene));
    const leaf = baseTexture(scene, 'leaf');
    options.push({
        name: 'Render face',
        off: "renderFace: 'both'",
        on: "renderFace: 'front'",
        build: (side, parent) => {
            // Leaves, each a flat card cut out of the leaf texture, tumbling as they drift down.
            const ps = system(
                {
                    scene,
                    duration: 3,
                    looping: true,
                    prewarm: true,
                    startLife: new ConstantValue(3.5),
                    startSpeed: new IntervalValue(1.2, 1.6),
                    startSize: new IntervalValue(1, 1.3),
                    startRotation: new RandomQuatGenerator(),
                    startColor: new RandomColor(new Color4(0.95, 0.42, 0.12, 1), new Color4(0.8, 0.78, 0.22, 1)),
                    emissionOverTime: new ConstantValue(4),
                    shape: new BoxEmitter({width: 2.6, height: 0.4, depth: 1.5}),
                    texture: leaf,
                    renderMode: RenderMode.Mesh,
                    ...quadGeometry,
                    lighting: 'unlit',
                    transparent: false,
                    alphaTest: 0.5,
                    renderFace: side === 1 ? 'front' : 'both',
                },
                parent
            );
            ps.emitter.position.y = 2.2;
            ps.emitter.rotation.x = Math.PI / 2; // the box emits along its +z: send them down
            ps.addBehavior(
                new Rotation3DOverLife(
                    new EulerGenerator(
                        new IntervalValue(-2, 2),
                        new IntervalValue(-1.5, 1.5),
                        new IntervalValue(-2, 2),
                        'YXZ'
                    )
                )
            );
            ps.addBehavior(new ColorOverLife(fade(0.1, 0.85)));
        },
    });

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
                    startSize: new IntervalValue(1.8, 2.4),
                    // An angle about the mesh's Z: a spin in the quad's own plane.
                    startRotation: new IntervalValue(0, Math.PI * 2),
                    startColor: new RandomColor(new Color4(1, 0.75, 0.3, 1), new Color4(0.75, 0.45, 1, 1)),
                    emissionOverTime: new ConstantValue(3),
                    shape: new SphereEmitter({radius: 1, thickness: 1}),
                    texture: kenneyTexture(scene, 'sigil'),
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    renderMode: RenderMode.Mesh,
                    lighting: 'unlit',
                    ...quadGeometry,
                    renderAlignment: side === 1 ? 'view' : 'simulation',
                },
                parent
            );
            ps.emitter.rotation.y = Math.PI / 2;
            ps.emitter.position.y = 0.4;
            ps.addBehavior(new ColorOverLife(fade(0.15, 0.7)));
            ps.addBehavior(new RotationOverLife(new ConstantValue(0.8)));
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

    options.push({
        name: 'Flip',
        off: 'flip: none',
        on: 'flip: (0.5, 0)',
        build: (side, parent) => {
            // Tongues of one flame sheet, whose tip curls one way; flipped, half curl the other.
            const ps = system(
                {
                    scene,
                    duration: 1,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(0.8, 1.1),
                    startSpeed: new ConstantValue(0),
                    startSize: new IntervalValue(3, 3.6),
                    startColor: new ConstantColor(new Color4(0.9, 0.5, 0.22, 1)),
                    emissionOverTime: new ConstantValue(5),
                    shape: new BoxEmitter({width: 3, height: 0.1, depth: 0.6}),
                    texture: fire,
                    ...sheetOf('fire'),
                    blendTiles: true,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    ...(side === 1 ? {flip: {x: 0.5, y: 0}} : {}),
                },
                parent
            );
            ps.emitter.position.y = -0.5;
            ps.addBehavior(
                new FrameOverLife(
                    curve([
                        [0, 0],
                        [1, 15.99],
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
    // One option at a time, on the viewer's bar of topic tabs as every multi-topic demo.
    controls.topics(
        options.map((option) => option.name),
        options[0].name,
        show
    );
}

/**
 * `geometry` (standing along +y from its base at 0, a unit tall) centred on its middle and laid
 * along +z: the way a mesh particle points once `alignToDirection` turns it along its flight.
 */
function pointingZ(geometry: InstancingGeometry): InstancingGeometry {
    const turn = (xyz: Float32Array, shift: number) => {
        const out = new Float32Array(xyz.length);
        for (let i = 0; i < xyz.length; i += 3) {
            out[i] = xyz[i];
            out[i + 1] = -xyz[i + 2];
            out[i + 2] = xyz[i + 1] - shift;
        }
        return out;
    };
    return {
        ...geometry,
        instancingGeometry: turn(geometry.instancingGeometry, 0.5),
        instancingNormals: turn(geometry.instancingNormals, 0),
    };
}
