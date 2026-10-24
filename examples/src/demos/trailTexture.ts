import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, ParticleSystem, PointEmitter, RenderMode, TrailSettings} from 'babylon.quarks';
import type {DemoContext} from '../types';

/**
 * How a trail lays its texture along the ribbon and samples its path: Unity's TrailRenderer
 * texture modes, Min Vertex Distance and Time, and `clearTrails()` for a teleport.
 *
 * Five emitters run the same figure, each drawing one trail of the emitter's path
 * (`followLocalOrigin`, recorded in world space). Left to right:
 *
 * 1. `stretch` (the default): the band once along the ribbon, by distance.
 * 2. `distributePerSegment`: once along the ribbon, each step an equal share. The emitter slows
 *    down on the near side of its figure, so the band bunches up there where `stretch` keeps it even.
 * 3. `tile`, a band every two units (`textureScale: 0.5`): the bands stay put on the path as the
 *    trail grows, with a point fixed every 0.3 units (`minVertexDistance`) and kept for 1.2 s
 *    (`lifetime`), so the trail is a length of path, not a number of steps.
 * 4. `repeatPerSegment` with a point every unit: one band per segment.
 * 5. The teleport: the emitter jumps every 1.5 s; `pause()`, move, `play()`, `clearTrails()`
 *    leaves no ribbon across the jump.
 */

/** One soft band along U, a hard edge across V; wraps, so tiling runs seamlessly. */
function bandTexture(scene: Scene): DynamicTexture {
    const size = 256;
    const texture = new DynamicTexture('trailBands', {width: size, height: size}, scene, false);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        const edge = Math.min(1, (Math.min(y, size - 1 - y) / size) * 8);
        for (let x = 0; x < size; x++) {
            const band = 0.5 - 0.5 * Math.cos((x / size) * Math.PI * 2);
            const i = (y * size + x) * 4;
            image.data[i] = 255;
            image.data[i + 1] = Math.round(140 + 100 * band);
            image.data[i + 2] = Math.round(60 + 60 * (1 - band));
            image.data[i + 3] = Math.round(Math.pow(band, 1.5) * edge * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
    texture.update(false);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}

const LANES = 5;
const LANE_SPACING = 4.5;
const RADIUS = 1.8;

function laneX(lane: number): number {
    return (lane - (LANES - 1) / 2) * LANE_SPACING;
}

/** Where the lane's emitter is at `time`: a figure of eight that slows down on its near side. */
function figure(lane: number, time: number, out: BVector3): BVector3 {
    const t = time * 1.4 + lane * 0.7;
    const slow = t + 0.6 * Math.sin(t);
    out.set(
        laneX(lane) + RADIUS * Math.sin(slow),
        2 + 0.6 * Math.sin(2 * slow),
        RADIUS * Math.sin(slow) * Math.cos(slow)
    );
    return out;
}

export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 11, 34));
    camera.setTarget(new BVector3(0, 2, 0));
    const texture = bandTexture(scene);

    const ground = MeshBuilder.CreateGround('trailTextureGround', {width: 40, height: 20}, scene);
    const groundMat = new StandardMaterial('trailTextureGroundMat', scene);
    groundMat.diffuseColor = new Color3(0.07, 0.08, 0.11);
    groundMat.specularColor = Color3.Black();
    ground.material = groundMat;

    const lanes: Array<Partial<TrailSettings>> = [
        {},
        {textureMode: 'distributePerSegment'},
        {textureMode: 'tile', textureScale: 0.5, minVertexDistance: 0.3, lifetime: 1.2},
        {textureMode: 'repeatPerSegment', minVertexDistance: 1},
        {minVertexDistance: 0.1},
    ];
    const trails = lanes.map((settings, lane) => {
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            startLife: new ConstantValue(1e6),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(0.7),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0.01, probability: 1}],
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(120),
                followLocalOrigin: true,
                recordWorldSpace: true,
                tessellation: 2,
                ...settings,
            },
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
        });
        figure(lane, 0, system.emitter.position);
        batchRenderer.addSystem(system);
        systems.push(system);
        return system;
    });

    demoState.trailTexture = {elapsed: 0, trails, nextJump: 1.5};
}

export function update({demoState}: DemoContext, delta: number) {
    const state = demoState.trailTexture;
    if (!state) {
        return;
    }
    state.elapsed += delta;
    const {trails} = state;
    for (let lane = 0; lane < LANES - 1; lane++) {
        figure(lane, state.elapsed, trails[lane].emitter.position);
    }
    // The last lane teleports: a jump is a placement, not motion to draw a ribbon across.
    const jumper = trails[LANES - 1];
    if (state.elapsed >= state.nextJump) {
        state.nextJump += 1.5;
        jumper.pause();
        jumper.emitter.position.set(
            laneX(LANES - 1) + (Math.random() - 0.5) * 4,
            2 + Math.random() * 1.5,
            (Math.random() - 0.5) * 4
        );
        jumper.play();
        jumper.clearTrails();
    } else {
        // Between jumps it wanders a little, so each ribbon has a shape of its own.
        const t = state.elapsed * 3;
        jumper.emitter.position.x += Math.cos(t) * delta * 1.5;
        jumper.emitter.position.z += Math.sin(t * 1.3) * delta * 1.5;
    }
}
