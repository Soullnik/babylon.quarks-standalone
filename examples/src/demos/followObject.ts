import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    IntervalValue,
    ParticleSystem,
    PointEmitter,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, kenneySheet, kenneyTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** Half-width and half-depth of the figure-eight both orbs fly along. */
const PATH = {x: 14, z: 7};

/** Colour over life: `tint` dimming toward `tail`, fading out at the end. */
function cooling(tint: Color3, tail: Color3) {
    return new Gradient(
        [
            [new Color3(1, 1, 1), 0],
            [tint, 0.08],
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
 * - a world-space wake of coloured smoke, which stays where it was emitted. It is emitted either at
 *   a fixed rate in time or per unit of distance the orb travels, depending on `byDistance`. The
 *   puffs are alpha-blended, so where they bunch up the wake grows dense, not white.
 */
function createOrb(
    scene: Scene,
    texture: Texture,
    puffs: Texture,
    name: string,
    color: Color3,
    tail: Color3,
    byDistance: boolean,
    add: (system: ParticleSystem) => void
): Mesh {
    const orb = MeshBuilder.CreateSphere(name, {diameter: 0.7}, scene);
    const mat = new StandardMaterial(`${name}Mat`, scene);
    mat.disableLighting = true;
    mat.emissiveColor = color;
    orb.material = mat;
    orb.position.y = 1;
    const tint = color.clone();

    const halo = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1 + 1 / 60),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(3.6),
        startColor: new ConstantColor(new Color4(color.r, color.g, color.b, 0.45)),
        // Local space: the halo is carried along by its parent.
        worldSpace: false,
        emissionOverTime: new ConstantValue(1),
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    halo.emitter.parent = orb;
    add(halo);

    const wake = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(1.4, 1.8),
        startSpeed: new IntervalValue(0, 0.4),
        startSize: new IntervalValue(0.9, 1.4),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(1, 1, 1, 0.85)),
        // World space: emitted particles stay behind as the orb moves on.
        worldSpace: true,
        // The same average rate either way: about 30 puffs a second at the orb's mean speed.
        emissionOverTime: new ConstantValue(byDistance ? 0 : 30),
        emissionOverDistance: new ConstantValue(byDistance ? 3 : 0),
        shape: new SphereEmitter({radius: 0.15, thickness: 1, arc: Math.PI * 2}),
        texture: puffs,
        ...kenneySheet('puffs'),
        startTileIndex: new IntervalValue(0, 25),
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    wake.addBehavior(new ColorOverLife(cooling(tint, tail)));
    wake.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.5],
                [0.25, 1],
                [1, 1.5],
            ])
        )
    );
    wake.addBehavior(new RotationOverLife(new IntervalValue(-0.7, 0.7)));
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
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 15, 21));
    camera.setTarget(new BVector3(0, 0, 0));
    const texture = baseTexture(scene, 'glow');
    const puffs = kenneyTexture(scene, 'puffs');
    addGround(scene, 0, new Color3(0.13, 0.14, 0.18));

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
        puffs,
        'followByTime',
        new Color3(0.35, 0.85, 1),
        new Color3(0.1, 0.25, 0.9),
        false,
        add
    );
    const byDistance = createOrb(
        scene,
        texture,
        puffs,
        'followByDistance',
        new Color3(1, 0.6, 0.2),
        new Color3(0.9, 0.15, 0.05),
        true,
        add
    );

    // Each orb names its emission, its label riding along above it.
    addLabel(scene, 'Emission over time', new BVector3(0, 1.4, 0), {height: 0.9}).parent = byTime;
    addLabel(scene, 'Emission over distance', new BVector3(0, 1.4, 0), {height: 0.9}).parent = byDistance;

    const orbs = [byTime, byDistance];
    let phase = 0;
    let time = 0;
    place(orbs, phase);
    return {
        update(delta) {
            time += delta;
            // Angular speed swings between a crawl and a dash, so the two emission modes diverge.
            phase += delta * (0.75 + 0.6 * Math.sin(time * 0.8));
            place(orbs, phase);
        },
    };
}

/** Puts the orbs on the figure-eight, a quarter turn apart so they never meet. */
function place(orbs: Mesh[], phase: number) {
    orbs.forEach((orb, i) => {
        const theta = phase + (i * Math.PI) / 2;
        orb.position.x = PATH.x * Math.sin(theta);
        orb.position.z = PATH.z * Math.sin(2 * theta);
    });
}
