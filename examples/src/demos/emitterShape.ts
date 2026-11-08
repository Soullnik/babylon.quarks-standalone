import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    BoxEmitFrom,
    BoxEmitter,
    CircleEmitter,
    ColorOverLife,
    ConeEmitFrom,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    EdgeEmitter,
    EmitterMode,
    type EmitterShape,
    Gradient,
    GridEmitter,
    GridSampling,
    HemisphereEmitter,
    IntervalValue,
    ParticleSystem,
    PointEmitter,
    RectangleEmitter,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {addLabel} from '../shared/labels';
import {baseTexture} from '../shared/textures';
import type {DemoContext} from '../types';

/** Shapes with an arc mode: where on the arc each particle starts. */
type ArcShape = EmitterShape & {mode: EmitterMode};

const MODES = {
    Random: EmitterMode.Random,
    Loop: EmitterMode.Loop,
    'Ping-pong': EmitterMode.PingPong,
    Burst: EmitterMode.Burst,
} as const;

/**
 * Every emitter shape on its own pad, labelled, each throwing the same warm sparks up so only
 * where they start differs. The emitters are turned so their +z, the way cones, circles and
 * rectangles emit, points up. The panel's arc mode switches where the shapes with an arc (sphere,
 * circle, edge, rectangle) start their particles: anywhere, sweeping round, back and forth, or
 * spread evenly over a burst.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 9, 12.5));
    camera.setTarget(new BVector3(0, 0, 0.6));
    const spark = baseTexture(scene, 'spark');

    const ground = MeshBuilder.CreateGround('ground', {width: 60, height: 60}, scene);
    const groundMaterial = new StandardMaterial('ground', scene);
    groundMaterial.diffuseColor = new Color3(0.16, 0.17, 0.21);
    groundMaterial.specularColor = Color3.Black();
    ground.material = groundMaterial;
    // Each pad is a faint ring marked on the floor, so the shape's sparks are what read.
    const padMaterial = new StandardMaterial('pad', scene);
    padMaterial.diffuseColor = Color3.Black();
    padMaterial.specularColor = Color3.Black();
    padMaterial.emissiveColor = new Color3(0.3, 0.33, 0.42);
    padMaterial.disableLighting = true;

    const warm = new Gradient(
        [
            [new Color3(1, 0.95, 0.8), 0],
            [new Color3(1, 0.6, 0.2), 0.5],
            [new Color3(0.9, 0.2, 0.05), 1],
        ],
        [
            [0, 0],
            [1, 0.1],
            [1, 0.5],
            [0, 1],
        ]
    );

    const shapes: [string, EmitterShape, number?][] = [
        ['Point', new PointEmitter()],
        ['Sphere', new SphereEmitter({radius: 0.8, thickness: 0.2})],
        ['Hemisphere', new HemisphereEmitter({radius: 0.8, thickness: 0.2})],
        ['Box (edges)', new BoxEmitter({width: 1.4, height: 1.4, depth: 0.6, emitFrom: BoxEmitFrom.Edge})],
        ['Cone', new ConeEmitter({radius: 0.5, angle: Math.PI / 6, thickness: 1})],
        [
            'Cone (volume)',
            new ConeEmitter({radius: 0.5, angle: Math.PI / 6, length: 1.5, emitFrom: ConeEmitFrom.Volume}),
        ],
        ['Circle', new CircleEmitter({radius: 0.8, thickness: 0.1})],
        ['Donut', new DonutEmitter({radius: 0.8, donutRadius: 0.2})],
        ['Edge', new EdgeEmitter({radius: 0.9})],
        ['Rectangle', new RectangleEmitter({width: 1.4, height: 1.4, thickness: 0.1})],
        ['Grid', new GridEmitter({width: 1.4, height: 1.4, column: 8, row: 8})],
        [
            'Grid in turn',
            new GridEmitter({width: 1.4, height: 1.4, column: 8, row: 8, sampling: GridSampling.Sequential}),
            64,
        ],
    ];
    const arcShapes: ArcShape[] = [];
    shapes.forEach(([name, shape, rate], i) => {
        const x = ((i % 4) - 1.5) * 4;
        const z = (Math.floor(i / 4) - 1) * 3.6;
        const pad = MeshBuilder.CreateTorus(`pad:${name}`, {diameter: 2.6, thickness: 0.04, tessellation: 64}, scene);
        pad.position.set(x, 0.01, z);
        pad.isPickable = false;
        pad.material = padMaterial;
        addLabel(scene, name, new BVector3(x, 0.35, z + 1.55), {height: 0.36});

        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new IntervalValue(0.6, 0.9),
            startSpeed: new IntervalValue(0.3, 0.6),
            startSize: new IntervalValue(0.18, 0.28),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(rate ?? 260),
            shape,
            texture: spark,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        });
        system.emitter.name = name;
        system.addBehavior(new ColorOverLife(warm));
        system.addBehavior(
            new SizeOverLife(
                curve([
                    [0, 1],
                    [1, 0.4],
                ])
            )
        );
        // +z, the way the shapes emit, up; the edge and the box stand as they are.
        system.emitter.rotation.x = name === 'Edge' ? 0 : -Math.PI / 2;
        system.emitter.position.set(x, name === 'Edge' || name.startsWith('Box') ? 0.8 : 0.15, z);
        add(system);
        if ('mode' in shape && name !== 'Donut') {
            arcShapes.push(shape as ArcShape);
        }
    });

    controls.choice('Arc mode', Object.keys(MODES) as (keyof typeof MODES)[], 'Random', (mode) => {
        for (const shape of arcShapes) {
            shape.mode = MODES[mode];
        }
    });
}
