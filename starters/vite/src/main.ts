import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Engine} from '@babylonjs/core/Engines/engine';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {
    BatchedRenderer,
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
} from 'babylon.quarks';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);

const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1.25, 6, new Vector3(0, 1.2, 0), scene);
camera.attachControl(canvas, true);

/** A soft round spot, drawn here so the starter needs no image files. */
function softSpot(): DynamicTexture {
    const texture = new DynamicTexture('spot', 64, scene, true);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    texture.update();
    texture.hasAlpha = true;
    return texture;
}

// One renderer per scene: it batches every system added to it into few draw calls.
const renderer = new BatchedRenderer('particles', scene);

// A flame: particles rise from a narrow cone, grow and fade from yellow through orange to red.
const flame = new ParticleSystem({
    scene,
    duration: 1,
    looping: true,
    startLife: new IntervalValue(0.8, 1.4),
    startSpeed: new IntervalValue(1.5, 2.5),
    startSize: new IntervalValue(0.6, 1.0),
    startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(60),
    shape: new ConeEmitter({radius: 0.3, angle: 0.2}),
    renderMode: RenderMode.BillBoard,
    texture: softSpot(),
    blendMode: Constants.ALPHA_ADD,
    transparent: true,
});
flame.addBehavior(
    new ColorOverLife(
        new Gradient(
            [
                [new Color3(1, 0.9, 0.4), 0],
                [new Color3(1, 0.45, 0.1), 0.5],
                [new Color3(0.6, 0.1, 0.05), 1],
            ],
            [
                [0, 0],
                [1, 0.15],
                [0, 1],
            ]
        )
    )
);
flame.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.6, 1, 0.9, 0.3), 0]])));
// Cones emit along their local Z; turn this one to emit upwards.
flame.emitter.rotation.x = -Math.PI / 2;
renderer.addSystem(flame);

// Advance the simulation every frame, in seconds.
scene.onBeforeRenderObservable.add(() => renderer.update(engine.getDeltaTime() / 1000));

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
