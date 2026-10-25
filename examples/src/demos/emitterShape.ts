import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    CircleEmitter,
    ConeEmitFrom,
    ConeEmitter,
    ConstantValue,
    DonutEmitter,
    EmitterMode,
    GridEmitter,
    GridSampling,
    HemisphereEmitter,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RectangleEmitter,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector4,
    type EmitterShape,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

function createLabel(scene: Scene, text: string, position: BVector3) {
    const plane = MeshBuilder.CreatePlane(`label-${text}`, {size: 1.6}, scene);
    plane.position = position;
    const texture = new DynamicTexture(`label-tex-${text}`, {width: 256, height: 64}, scene, false);
    texture.drawText(text, 16, 44, 'bold 36px Arial', 'white', 'transparent', true);
    const material = new StandardMaterial(`label-mat-${text}`, scene);
    material.diffuseTexture = texture;
    material.emissiveColor = new Color3(1, 1, 1);
    material.opacityTexture = texture;
    material.backFaceCulling = false;
    plane.material = material;
}

function createShapeSystem({
    scene,
    batchRenderer,
    systems,
    texture,
    shape,
    position,
    rate = 1000,
}: {
    scene: Scene;
    batchRenderer: DemoContext['batchRenderer'];
    systems: DemoContext['systems'];
    texture: Texture;
    shape: EmitterShape;
    position?: BVector3;
    /** Particles per second. */
    rate?: number;
}) {
    const ps = new ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        startLife: new IntervalValue(1, 1),
        startSpeed: new IntervalValue(1, 1),
        startSize: new IntervalValue(0.1, 0.1),
        startColor: new RandomColor(new Vector4(1, 0.91, 0.51, 1), new Vector4(1, 0.44, 0.16, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(rate),
        shape,
        renderMode: RenderMode.Mesh,
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderOrder: 1,
    });
    ps.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])));
    if (position) {
        ps.emitter.position = position;
    }
    batchRenderer.addSystem(ps);
    systems.push(ps);
}

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setTarget(new BVector3(2.5, 0, 0));
    camera.setPosition(new BVector3(2.5, 0, 24));
    const texture = createSharedTexture(scene);

    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new PointEmitter(),
        position: new BVector3(-5, -5, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new SphereEmitter({radius: 1, thickness: 0.2, arc: Math.PI * 2}),
        position: new BVector3(-5, 0, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new HemisphereEmitter({radius: 1, thickness: 0.2, arc: Math.PI * 2}),
        position: new BVector3(-5, 5, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new ConeEmitter({radius: 1, thickness: 1, arc: Math.PI * 2, angle: Math.PI / 4}),
        position: new BVector3(0, -5, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new CircleEmitter({radius: 1, arc: Math.PI * 2, thickness: 1}),
        position: new BVector3(0, 0, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new DonutEmitter({radius: 2, donutRadius: 0.2, arc: Math.PI * 2}),
        position: new BVector3(0, 5, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new RectangleEmitter({
            width: 2,
            height: 2,
            thickness: 0.2,
            mode: EmitterMode.Loop,
            spread: 0,
            speed: new ConstantValue(1),
        }),
        position: new BVector3(5, -5, 2),
    });
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new GridEmitter({width: 2, height: 2, column: 10, row: 10}),
        position: new BVector3(5, 0, 2),
    });

    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new ConeEmitter({radius: 0.5, angle: Math.PI / 6, length: 2, emitFrom: ConeEmitFrom.Volume}),
        position: new BVector3(10, -5, 2),
    });
    // In turn, cell by cell: a wave that sweeps the grid row by row.
    createShapeSystem({
        scene,
        batchRenderer,
        systems,
        texture,
        shape: new GridEmitter({width: 2, height: 2, column: 10, row: 10, sampling: GridSampling.Sequential}),
        position: new BVector3(10, 0, 2),
        rate: 60,
    });

    systems[2].emitter.rotation.x = -Math.PI / 2;

    createLabel(scene, 'Point', new BVector3(-5, -7, 2));
    createLabel(scene, 'Sphere', new BVector3(-5, -2, 2));
    createLabel(scene, 'Hemisphere', new BVector3(-5, 3, 2));
    createLabel(scene, 'Cone', new BVector3(0, -7, 2));
    createLabel(scene, 'Circle', new BVector3(0, -2, 2));
    createLabel(scene, 'Donut', new BVector3(0, 3, 2));
    createLabel(scene, 'Rectangle', new BVector3(5, -7, 2));
    createLabel(scene, 'Grid', new BVector3(5, -2, 2));
    createLabel(scene, 'Cone volume', new BVector3(10, -7, 2));
    createLabel(scene, 'Grid in turn', new BVector3(10, -2, 2));
}
