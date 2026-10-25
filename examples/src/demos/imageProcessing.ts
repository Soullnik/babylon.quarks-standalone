import {Constants} from '@babylonjs/core/Engines/constants';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {ImageProcessingConfiguration} from '@babylonjs/core/Materials/imageProcessingConfiguration';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    Bezier,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    Gradient,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    RenderMode,
    SizeOverLife,
    Vector3,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/**
 * The scene's image processing on the particles. The scene tone maps (ACES), raises the exposure
 * and the contrast and darkens the corners with a vignette, as a game's look would. The two
 * flames are the same effect: the left one takes the scene's image processing, as the spheres
 * beside it do, so its bright core rolls off like theirs; the right one has
 * `applyImageProcessing: false` and reaches the frame as authored, flat and out of place beside
 * the graded spheres.
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setTarget(new BVector3(0, 1.5, 0));
    camera.setPosition(new BVector3(0, 2.5, 9));
    scene.clearColor = new Color4(0.22, 0.24, 0.3, 1);
    const config = scene.imageProcessingConfiguration;
    config.toneMappingEnabled = true;
    config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    config.exposure = 1.6;
    config.contrast = 1.4;
    config.vignetteEnabled = true;
    config.vignetteWeight = 2.5;
    config.vignetteColor = new Color4(0, 0, 0, 0);
    new HemisphericLight('light', new BVector3(0.3, 1, 0.2), scene);
    const texture = createSharedTexture(scene);

    const flame = (x: number, applyImageProcessing: boolean) => {
        const sphere = MeshBuilder.CreateSphere(`sphere-${x}`, {diameter: 1.2}, scene);
        const material = new StandardMaterial(`sphere-${x}`, scene);
        material.diffuseColor = new Color3(1, 0.55, 0.25);
        sphere.material = material;
        sphere.position.set(x + (x < 0 ? -1.6 : 1.6), 0.6, -0.5);

        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new IntervalValue(0.8, 1.2),
            startSpeed: new IntervalValue(2, 3),
            startSize: new IntervalValue(1, 1.6),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            worldSpace: true,
            emissionOverTime: new ConstantValue(60),
            shape: new ConeEmitter({radius: 0.4, angle: 0.15}),
            renderMode: RenderMode.BillBoard,
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            startTileIndex: new ConstantValue(0),
            uTileCount: 10,
            vTileCount: 10,
            applyImageProcessing,
        });
        system.addBehavior(
            new ColorOverLife(
                new Gradient(
                    [
                        [new Vector3(1, 0.95, 0.7), 0],
                        [new Vector3(1, 0.45, 0.1), 0.4],
                        [new Vector3(0.6, 0.1, 0.02), 1],
                    ],
                    [
                        [1, 0],
                        [0.9, 0.5],
                        [0, 1],
                    ]
                )
            )
        );
        system.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.6, 1, 0.9, 0.3), 0]])));
        system.emitter.rotation.x = -Math.PI / 2;
        system.emitter.position.set(x, 0, 0);
        batchRenderer.addSystem(system);
        systems.push(system);
    };

    flame(-3, true);
    flame(3, false);
}
