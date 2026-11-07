import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import type {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    BoxEmitter,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EulerGenerator,
    FrameOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
    SizeOverLife,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {geometryOf} from '../shared/geometry';
import {addCaption} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext, DemoRun} from '../types';

const FLOOR = -2.6;

/** A smoothstep of `t`, clamped to 0…1. */
function smooth(t: number): number {
    const c = Math.min(Math.max(t, 0), 1);
    return c * c * (3 - 2 * c);
}

/**
 * A premultiplied map, computed: a ball of dark smoke whose rim is lit from inside, in a halo of
 * orange light. The smoke has alpha and covers what is behind it; the light has none and only adds.
 * Its colour is already multiplied by its alpha, and carries light where the alpha is 0, which is
 * what `premultipliedMap` tells the shader.
 */
function emberTexture(scene: Scene): RawTexture {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const x = ((i + 0.5) / size) * 2 - 1;
            const y = ((j + 0.5) / size) * 2 - 1;
            const r = Math.hypot(x, y);
            const angle = Math.atan2(y, x);
            const edge =
                0.48 +
                0.035 * Math.sin(3 * angle + 0.7) +
                0.025 * Math.sin(7 * angle + 2.1) +
                0.012 * Math.sin(13 * angle + 0.3);
            const body = smooth((edge - r) / 0.1);
            const rim = Math.exp(-(((r - edge + 0.04) / 0.07) ** 2));
            const halo = 1.3 * Math.max(0, 1 - r) ** 1.6 * (1 - body);
            // Smoke, times its own alpha, then the light on top of it.
            const red = 0.07 * body + 1.0 * rim + 1.0 * halo;
            const green = 0.06 * body + 0.62 * rim + 0.42 * halo;
            const blue = 0.07 * body + 0.25 * rim + 0.12 * halo;
            const k = (j * size + i) * 4;
            data[k] = Math.round(Math.min(red, 1) * 255);
            data[k + 1] = Math.round(Math.min(green, 1) * 255);
            data[k + 2] = Math.round(Math.min(blue, 1) * 255);
            data[k + 3] = Math.round(body * 255);
        }
    }
    const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = 'ember (premultiplied)';
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}

/** An unlit flat colour for the scene's props: the blend modes' backdrop, the soft particles' pillars. */
function flat(scene: Scene, name: string, color: Color3, lit = false): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    if (lit) {
        material.diffuseColor = color;
    } else {
        material.emissiveColor = color;
        material.disableLighting = true;
    }
    return material;
}

/**
 * How particles are blended into the frame and coloured by their material, one topic at a time
 * (picked in the panel), each labelled in the scene.
 *
 * - Blend modes: the same smoke in five modes over a backdrop light above and dark below. Alpha
 *   blending covers, additive and screen add light (only on the dark), multiply darkens (only on
 *   the light), and premultiplied blending draws one map that does both: smoke that covers, and a
 *   glow round it that adds.
 * - Material colour: the same flame with the material's colour (`materialColor`), brightened in
 *   linear space (`materialColorScale`), and with the particle's own colour left out
 *   (`particleColor: false`): a white flame, its fade gone.
 * - Alpha test: tumbling leaves blown toward the camera, green when they set off and red by the
 *   time they are near. Blended and unsorted on the left, they are drawn in the order they were
 *   born (or nearly, as dead ones' places are reused), so green ones behind are drawn over red
 *   ones in front; cut out by an alpha test and writing depth (`depthWrite`, off by default even
 *   for an opaque system) on the right, the red ones stay in front.
 * - Soft particles: mist among pillars, hard where it cuts the floor and the pillars on the left,
 *   fading out before them on the right (`softParticles`, read from the scene's depth).
 * - Sorting fudge: a glow nearer the camera than the smoke round it. By distance the glow draws
 *   last, over the smoke; a fudge sorts it behind, so the smoke stays over it.
 */
export function init({scene, camera, batchRenderer, add, controls}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    // Soft particles read the scene's depth: a depth renderer's texture, handed to the renderer.
    batchRenderer.setDepthTexture(scene.enableDepthRenderer(camera));

    const smoke = baseTexture(scene, 'smoke_puff');
    const fire = baseTexture(scene, 'fire');
    const glow = baseTexture(scene, 'glow');
    const leaf = baseTexture(scene, 'leaf');

    const system = (parent: TransformNode, parameters: Omit<ParticleSystemParameters, 'scene'>) => {
        const ps = new ParticleSystem({scene, ...parameters});
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };
    const toUp = (ps: ParticleSystem) => {
        ps.emitter.rotation.x = -Math.PI / 2; // cones emit along +z; aim them up
        return ps;
    };

    const topics: Topic[] = [];

    topics.push({
        name: 'Blend modes',
        build(group) {
            // A backdrop light above and dark below: each mode shows on both.
            const backdrop = (y: number, height: number, color: Color3) => {
                const plane = MeshBuilder.CreatePlane('backdrop', {width: 19.5, height}, scene);
                plane.position.set(0, y, -1.4);
                plane.material = flat(scene, 'backdrop', color);
                plane.isPickable = false;
                plane.parent = group;
            };
            backdrop(1.4, 2.4, new Color3(0.74, 0.74, 0.76));
            backdrop(-1.2, 2.8, new Color3(0.04, 0.045, 0.06));

            const ember = emberTexture(scene);
            const modes: {title: string; code: string; blendMode: number; premultiplied?: boolean}[] = [
                {title: 'Alpha blend', code: 'ALPHA_COMBINE', blendMode: Constants.ALPHA_COMBINE},
                {title: 'Additive', code: 'ALPHA_ADD', blendMode: Constants.ALPHA_ADD},
                {title: 'Screen', code: 'ALPHA_SCREENMODE', blendMode: Constants.ALPHA_SCREENMODE},
                {title: 'Multiply', code: 'ALPHA_MULTIPLY', blendMode: Constants.ALPHA_MULTIPLY},
                {
                    title: 'Premultiplied',
                    code: 'premultipliedMap: true',
                    blendMode: Constants.ALPHA_PREMULTIPLIED,
                    premultiplied: true,
                },
            ];
            modes.forEach((mode, index) => {
                const x = (index - 2) * 3.3;
                const puffs = toUp(
                    system(group, {
                        duration: 3,
                        looping: true,
                        prewarm: true,
                        startLife: new IntervalValue(2.6, 3.2),
                        startSpeed: new IntervalValue(1.2, 1.5),
                        // The ember fills its square more than a puff's frames do: drawn smaller.
                        startSize: mode.premultiplied ? new IntervalValue(1.3, 1.6) : new IntervalValue(1.9, 2.4),
                        startRotation: new IntervalValue(0, Math.PI * 2),
                        startColor: new ConstantColor(
                            mode.premultiplied ? new Color4(1, 1, 1, 1) : new Color4(1, 0.58, 0.28, 1)
                        ),
                        emissionOverTime: new ConstantValue(4.5),
                        shape: new ConeEmitter({radius: 0.3, angle: 0.12}),
                        ...(mode.premultiplied
                            ? {texture: ember, premultipliedMap: true}
                            : {texture: smoke, ...sheetOf('smoke_puff')}),
                        transparent: true,
                        blendMode: mode.blendMode,
                    })
                );
                puffs.emitter.position.set(x, -2.2, 0);
                if (!mode.premultiplied) {
                    puffs.addBehavior(
                        new FrameOverLife(
                            curve([
                                [0, 0],
                                [1, 15.99],
                            ])
                        )
                    );
                }
                puffs.addBehavior(
                    new SizeOverLife(
                        curve([
                            [0, 0.6],
                            [1, 1.25],
                        ])
                    )
                );
                puffs.addBehavior(new ColorOverLife(fade(0.12, 0.7)));
                addCaption(scene, group, x, mode.title, mode.code);
            });
        },
    });

    topics.push({
        name: 'Material colour',
        build(group) {
            const columns: {title: string; code: string; options: Partial<ParticleSystemParameters>}[] = [
                {title: 'Default', code: 'materialColor: white', options: {}},
                {
                    title: 'Tinted',
                    code: 'materialColor: (0.5, 1, 0.35)',
                    options: {materialColor: new Color4(0.5, 1, 0.35, 1)},
                },
                {title: 'Brighter', code: 'materialColorScale: 2.5', options: {materialColorScale: 2.5}},
                {title: 'No particle colour', code: 'particleColor: false', options: {particleColor: false}},
            ];
            columns.forEach((column, index) => {
                const x = (index - 1.5) * 3.6;
                const flame = toUp(
                    system(group, {
                        duration: 1,
                        looping: true,
                        prewarm: true,
                        startLife: new IntervalValue(0.9, 1.2),
                        startSpeed: new IntervalValue(1.6, 2.1),
                        startSize: new IntervalValue(1.9, 2.4),
                        startRotation: new IntervalValue(-0.25, 0.25),
                        startColor: new ConstantColor(new Color4(1, 0.82, 0.55, 1)),
                        emissionOverTime: new ConstantValue(16),
                        shape: new ConeEmitter({radius: 0.35, angle: 0.1}),
                        texture: fire,
                        ...sheetOf('fire'),
                        transparent: true,
                        blendMode: Constants.ALPHA_ADD,
                        ...column.options,
                    })
                );
                flame.emitter.position.set(x, -2.3, 0);
                flame.addBehavior(
                    new FrameOverLife(
                        curve([
                            [0, 0],
                            [1, 15.99],
                        ])
                    )
                );
                flame.addBehavior(
                    new SizeOverLife(
                        curve([
                            [0, 0.7],
                            [0.3, 1],
                            [1, 0.45],
                        ])
                    )
                );
                // White-hot at the base, orange, then a dull red as it fades: the particle's colour.
                flame.addBehavior(
                    new ColorOverLife(
                        new Gradient(
                            [
                                [new Color3(1, 1, 0.9), 0],
                                [new Color3(1, 0.6, 0.2), 0.45],
                                [new Color3(0.8, 0.2, 0.1), 1],
                            ],
                            [
                                [0, 0],
                                [1, 0.12],
                                [0.8, 0.6],
                                [0, 1],
                            ]
                        )
                    )
                );
                addCaption(scene, group, x, column.title, column.code);
            });
        },
    });

    const quad = geometryOf(MeshBuilder.CreatePlane('leafQuad', {size: 1}, scene));
    topics.push({
        name: 'Alpha test',
        build(group) {
            const sides: {title: string; code: string; options: Partial<ParticleSystemParameters>}[] = [
                {
                    title: 'Blended: drawn in emission order',
                    code: 'transparent: true',
                    options: {transparent: true, blendMode: Constants.ALPHA_COMBINE},
                },
                {
                    title: 'Cut out: depth written',
                    code: 'transparent: false, alphaTest: 0.5, depthWrite: true',
                    // Depth is written only when asked, opaque or not.
                    options: {transparent: false, alphaTest: 0.5, depthWrite: true},
                },
            ];
            sides.forEach((side, index) => {
                const x = index === 0 ? -3.6 : 3.6;
                const leaves = system(group, {
                    duration: 4,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(3.6, 4.4),
                    // The box emits along +z, here at the camera: the older a leaf, the nearer.
                    startSpeed: new IntervalValue(1.8, 2.1),
                    startSize: new IntervalValue(0.8, 1.1),
                    startRotation: new RandomQuatGenerator(),
                    startColor: new RandomColor(new Color4(1, 1, 1, 1), new Color4(0.85, 0.85, 0.85, 1)),
                    emissionOverTime: new ConstantValue(18),
                    shape: new BoxEmitter({width: 2.6, height: 1.8, depth: 0.2}),
                    texture: leaf,
                    renderMode: RenderMode.Mesh,
                    ...quad,
                    ...side.options,
                });
                // A wall of leaves behind the stage, blowing straight at the camera: near and far
                // leaves lie over each other on screen, so the order they are drawn in shows.
                leaves.emitter.position.set(x * 1.28, 0.3, -3.5);
                leaves.emitter.lookAt(camera.position);
                leaves.addBehavior(
                    new Rotation3DOverLife(
                        new EulerGenerator(
                            new IntervalValue(-2.5, 2.5),
                            new IntervalValue(-2, 2),
                            new IntervalValue(-2.5, 2.5)
                        )
                    )
                );
                // Green far off, turning red halfway, so near over far reads at a glance; opaque
                // throughout, as a cutout cannot fade.
                leaves.addBehavior(
                    new ColorOverLife(
                        new Gradient(
                            [
                                [new Color3(0.4, 0.85, 0.25), 0],
                                [new Color3(0.4, 0.85, 0.25), 0.35],
                                [new Color3(1, 0.3, 0.08), 0.5],
                            ],
                            [
                                [1, 0],
                                [1, 1],
                            ]
                        )
                    )
                );
                // Leaves shrink away at the end: a cutout cannot fade.
                leaves.addBehavior(
                    new SizeOverLife(
                        curve([
                            [0, 1],
                            [0.85, 1],
                            [1, 0],
                        ])
                    )
                );
                addCaption(scene, group, x, side.title, side.code);
            });
        },
    });

    topics.push({
        name: 'Soft particles',
        build(group) {
            const stone = flat(scene, 'pillar', new Color3(0.36, 0.38, 0.45), true);
            [false, true].forEach((soft, index) => {
                const x = index === 0 ? -3.6 : 3.6;
                for (const [px, pz] of [
                    [-1, -0.4],
                    [0.8, 0.5],
                    [0.1, -1.3],
                ]) {
                    const pillar = MeshBuilder.CreateBox('pillar', {width: 0.5, height: 4, depth: 0.5}, scene);
                    pillar.position.set(x + px, FLOOR + 2, pz);
                    pillar.material = stone;
                    pillar.isPickable = false;
                    pillar.parent = group;
                }
                const mist = system(group, {
                    duration: 5,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(4.5, 5.5),
                    startSpeed: new ConstantValue(0),
                    startSize: new IntervalValue(2.6, 3.4),
                    startColor: new ConstantColor(new Color4(0.72, 0.8, 0.95, 0.3)),
                    emissionOverTime: new ConstantValue(10),
                    shape: new BoxEmitter({width: 3.4, height: 0.4, depth: 2.6}),
                    texture: glow,
                    transparent: true,
                    blendMode: Constants.ALPHA_COMBINE,
                    softParticles: soft,
                    softFarFade: 0.9,
                });
                mist.emitter.position.set(x, FLOOR + 0.3, 0);
                mist.addBehavior(new ApplyForce(new BVector3(1, 0, 0), new ConstantValue(0.08)));
                mist.addBehavior(new ColorOverLife(fade(0.25, 0.7)));
                addCaption(
                    scene,
                    group,
                    x,
                    soft ? 'Fades before the scene' : 'Cut by the floor and pillars',
                    `softParticles: ${soft}`
                );
            });
        },
    });

    topics.push({
        name: 'Sorting fudge',
        build(group) {
            [0, 3].forEach((fudge, index) => {
                const x = index === 0 ? -3.6 : 3.6;
                const column = toUp(
                    system(group, {
                        duration: 3,
                        looping: true,
                        prewarm: true,
                        startLife: new IntervalValue(2.6, 3.2),
                        startSpeed: new IntervalValue(1, 1.3),
                        startSize: new IntervalValue(2.1, 2.7),
                        startRotation: new IntervalValue(0, Math.PI * 2),
                        startColor: new ConstantColor(new Color4(0.22, 0.22, 0.26, 0.92)),
                        emissionOverTime: new ConstantValue(5),
                        shape: new ConeEmitter({radius: 0.4, angle: 0.15}),
                        texture: smoke,
                        ...sheetOf('smoke_puff'),
                        transparent: true,
                        blendMode: Constants.ALPHA_COMBINE,
                    })
                );
                column.emitter.position.set(x, -2.2, 0);
                column.addBehavior(
                    new FrameOverLife(
                        curve([
                            [0, 0],
                            [1, 15.99],
                        ])
                    )
                );
                column.addBehavior(
                    new SizeOverLife(
                        curve([
                            [0, 0.7],
                            [1, 1.3],
                        ])
                    )
                );
                column.addBehavior(new ColorOverLife(fade(0.15, 0.65)));

                // A glow a little in front of the column: nearer the camera than the smoke's centre.
                const light = system(group, {
                    duration: 1,
                    looping: true,
                    prewarm: true,
                    startLife: new ConstantValue(1),
                    startSpeed: new ConstantValue(0),
                    startSize: new ConstantValue(3.4),
                    startColor: new ConstantColor(new Color4(1, 0.62, 0.25, 0.9)),
                    emissionOverTime: new ConstantValue(3),
                    shape: new ConeEmitter({radius: 0.01, angle: 0}),
                    texture: glow,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    sortingFudge: fudge,
                });
                light.emitter.position.set(x, -0.2, 1.2);
                light.addBehavior(new ColorOverLife(fade(0.3, 0.7)));
                addCaption(
                    scene,
                    group,
                    x,
                    fudge === 0 ? 'By distance: the glow over the smoke' : 'Fudged: the smoke over the glow',
                    `glow sortingFudge: ${fudge}`
                );
            });
        },
    });

    showTopics(scene, controls, topics);

    return {
        dispose() {
            batchRenderer.setDepthTexture(null);
            scene.disableDepthRenderer(camera);
        },
    };
}
