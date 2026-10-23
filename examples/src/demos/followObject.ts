import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector3,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/** 10×10 `texture1.png`, counted from the top left. */
const TILE = {glow: 1};

/** Half-width and half-depth of the figure-eight both orbs fly along. */
const PATH = {x: 14, z: 7};

/** Colour over life: `tint` dimming toward `tail`, fading out at the end. */
function cooling(tint: Vector3, tail: Vector3) {
    return new Gradient(
        [
            [new Vector3(1, 1, 1), 0],
            [tint, 0.15],
            [tail, 1],
        ],
        [
            [1, 0],
            [0.6, 0.5],
            [0, 1],
        ]
    );
}

/**
 * One glowing orb with two systems parented to it:
 * - a halo in local space, which moves with the orb;
 * - a world-space wake, which stays where it was emitted. It is emitted either at a fixed rate in
 *   time or per unit of distance the orb travels, depending on `byDistance`.
 */
function createOrb(
    scene: Scene,
    texture: Texture,
    name: string,
    color: Color3,
    tail: Vector3,
    byDistance: boolean,
    add: (system: ParticleSystem) => void
): Mesh {
    const orb = MeshBuilder.CreateSphere(name, {diameter: 0.7}, scene);
    const mat = new StandardMaterial(`${name}Mat`, scene);
    mat.disableLighting = true;
    mat.emissiveColor = color;
    orb.material = mat;
    orb.position.y = 1;
    const tint = new Vector3(color.r, color.g, color.b);

    const halo = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1 + 1 / 60),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(3.6),
        startColor: new ConstantColor(new Vector4(color.r, color.g, color.b, 0.55)),
        // Local space: the halo is carried along by its parent.
        worldSpace: false,
        emissionOverTime: new ConstantValue(1),
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.glow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    halo.emitter.parent = orb;
    add(halo);

    const wake = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(2.6, 3.2),
        startSpeed: new IntervalValue(0, 0.6),
        startSize: new IntervalValue(1.4, 2),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 0.75)),
        // World space: emitted particles stay behind as the orb moves on.
        worldSpace: true,
        // The same average rate either way: about 80 particles a second at the orb's mean speed.
        emissionOverTime: new ConstantValue(byDistance ? 0 : 80),
        emissionOverDistance: new ConstantValue(byDistance ? 8 : 0),
        shape: new SphereEmitter({radius: 0.15, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.glow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    wake.addBehavior(new ColorOverLife(cooling(tint, tail)));
    wake.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0), 0]])));
    wake.emitter.parent = orb;
    add(wake);
    return orb;
}

/**
 * Emitters parented to moving objects. Two orbs fly the same figure-eight, speeding up and slowing
 * down. Both leave a world-space wake behind a local-space halo, at the same average rate:
 * - cyan emits over time, so its wake thins out to dots where it is fast and bunches up where it
 *   is slow;
 * - orange emits over distance (`emissionOverDistance`), so its wake stays evenly spaced at any
 *   speed. That is what a rocket exhaust, a footstep trail or a tyre mark wants.
 */
export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 15, 21));
    camera.setTarget(new BVector3(0, 0, 0));
    const texture = createSharedTexture(scene);
    const add = (system: ParticleSystem) => {
        batchRenderer.addSystem(system);
        systems.push(system);
    };

    const ground = MeshBuilder.CreateDisc('followGround', {radius: 40, tessellation: 64}, scene);
    ground.rotation.x = Math.PI / 2;
    const groundMat = new StandardMaterial('followGroundMat', scene);
    groundMat.diffuseColor = new Color3(0.05, 0.055, 0.075);
    groundMat.specularColor = Color3.Black();
    ground.material = groundMat;

    // The route, faintly drawn at the orbs' height.
    const route = MeshBuilder.CreateLines(
        'followRoute',
        {
            points: Array.from({length: 129}, (_, i) => {
                const theta = (i / 128) * Math.PI * 2;
                return new BVector3(PATH.x * Math.sin(theta), 1, PATH.z * Math.sin(2 * theta));
            }),
        },
        scene
    );
    route.color = new Color3(0.18, 0.2, 0.28);

    const byTime = createOrb(
        scene,
        texture,
        'followByTime',
        new Color3(0.35, 0.85, 1),
        new Vector3(0.1, 0.25, 0.9),
        false,
        add
    );
    const byDistance = createOrb(
        scene,
        texture,
        'followByDistance',
        new Color3(1, 0.6, 0.2),
        new Vector3(0.9, 0.15, 0.05),
        true,
        add
    );

    demoState.followObject = {phase: 0, time: 0, orbs: [byTime, byDistance]};
    place(demoState.followObject.orbs, 0);
}

/** Puts the orbs on the figure-eight, a quarter turn apart so they never meet. */
function place(orbs: Mesh[], phase: number) {
    orbs.forEach((orb, i) => {
        const theta = phase + (i * Math.PI) / 2;
        orb.position.x = PATH.x * Math.sin(theta);
        orb.position.z = PATH.z * Math.sin(2 * theta);
    });
}

export function update({demoState}: DemoContext, delta: number) {
    const state = demoState.followObject;
    if (!state) {
        return;
    }
    state.time += delta;
    // Angular speed swings between a crawl and a dash, so the two emission modes diverge.
    state.phase += delta * (0.75 + 0.6 * Math.sin(state.time * 0.8));
    place(state.orbs, state.phase);
}
