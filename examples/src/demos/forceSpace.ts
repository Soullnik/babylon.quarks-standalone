import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantValue,
    ForceOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    RandomColor,
    RenderMode,
} from 'babylon.quarks';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** The floor, where each nozzle is pivoted. */
const FLOOR = -3.5;
/** The length of a nozzle; its emitter sits at the tip. */
const NOZZLE = 1.3;

/** A nozzle standing on a ball joint, pivoted at the floor: the node to tip, and its tip. */
function createNozzle(scene: Scene, name: string, x: number, material: StandardMaterial) {
    const mount = new TransformNode(`${name}Mount`, scene);
    mount.position.set(x, FLOOR, 0);
    const joint = MeshBuilder.CreateSphere(`${name}Joint`, {diameter: 0.6, segments: 16}, scene);
    const barrel = MeshBuilder.CreateCylinder(
        `${name}Barrel`,
        {height: NOZZLE, diameterTop: 0.42, diameterBottom: 0.26, tessellation: 20},
        scene
    );
    barrel.position.y = NOZZLE / 2;
    const nozzle = Mesh.MergeMeshes([joint, barrel], true)!;
    nozzle.name = name;
    nozzle.material = material;
    nozzle.isPickable = false;
    nozzle.parent = mount;
    const tip = new TransformNode(`${name}Tip`, scene);
    tip.parent = mount;
    tip.position.y = NOZZLE;
    // The cone emits along its +z: turned to point up the nozzle.
    tip.rotation.x = -Math.PI / 2;
    return {mount, tip};
}

/**
 * The `space` of a force (Unity's Space on Force over Lifetime). Two nozzles tip from side to
 * side, both simulating in world space:
 * - left, a fountain pulled by a `'world'` gravity: whichever way the nozzle leans, its sparks
 *   fall straight down;
 * - right, a jet pushed by a `'local'` thrust along the nozzle's own axis: the push turns with the
 *   nozzle, so the sparks already in flight bend round to its new direction, as a hose's spray does.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 2.5, 16));
    camera.setTarget(new BVector3(0, -0.3, 0));
    addGround(scene, FLOOR);
    addLabel(scene, 'World force: gravity', new BVector3(-5, 4.3, 0));
    addLabel(scene, 'Local force: thrust', new BVector3(5, 4.3, 0));
    const texture = baseTexture(scene, 'streak');
    const metal = new StandardMaterial('nozzle', scene);
    metal.diffuseColor = new Color3(0.32, 0.34, 0.4);
    metal.specularColor = new Color3(0.5, 0.5, 0.55);
    metal.specularPower = 40;

    const make = (name: string, x: number, tint: Color4, speed: IntervalValue, life: number) => {
        const {mount, tip} = createNozzle(scene, name, x, metal);
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(life),
            startSpeed: speed,
            startSize: new IntervalValue(0.12, 0.22),
            startColor: new RandomColor(tint, new Color4(1, 1, 1, 1)),
            worldSpace: true,
            emissionOverTime: new ConstantValue(200),
            shape: new ConeEmitter({radius: 0.15, angle: 0.12}),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.07, lengthFactor: 1},
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        });
        system.addBehavior(
            new ColorOverLife(
                new Gradient(
                    [
                        [new Color3(1, 1, 1), 0],
                        [new Color3(1, 1, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0, 1],
                    ]
                )
            )
        );
        system.emitter.parent = tip;
        add(system);
        return {system, mount};
    };

    // Gravity is a world force (the default): down stays down.
    const gravity = make('gravityNozzle', -5, new Color4(1, 0.8, 0.3, 1), new IntervalValue(7, 8.5), 1.6);
    gravity.system.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(12)));

    // A thrust along the nozzle's own axis (the emitter's +z): it turns as the nozzle leans.
    const thrust = make('thrustNozzle', 5, new Color4(0.4, 0.8, 1, 1), new IntervalValue(1.5, 2.5), 1.25);
    thrust.system.addBehavior(
        new ForceOverLife(new ConstantValue(0), new ConstantValue(0), new ConstantValue(5), 'local')
    );

    // Tips both nozzles from side to side.
    let time = 0;
    return {
        update(delta) {
            time += delta;
            for (const {mount} of [gravity, thrust]) {
                mount.rotation.z = Math.sin(time * 0.8) * 0.6;
            }
        },
    };
}
