import {Constants} from '@babylonjs/core/Engines/constants';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, ParticleSystem, PointEmitter, RenderMode, TrailSettings} from 'babylon.quarks';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import type {DemoContext, DemoRun} from '../types';

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

/**
 * A chevron along U over a faint band of light, white-hot in the stroke and orange round it, soft at the
 * ribbon's edges across V; wraps along U, so tiling runs seamlessly. A pattern on purpose: the
 * chevrons show how each mode lays the texture along the trail (one stretched, or one per tile,
 * or one per segment).
 */
function chevronTexture(scene: Scene): DynamicTexture {
    const size = 256;
    const texture = new DynamicTexture('trailChevrons', {width: size, height: size}, scene, false);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const image = ctx.createImageData(size, size);
    const smooth = (t: number) => {
        const c = Math.min(1, Math.max(0, t));
        return c * c * (3 - 2 * c);
    };
    for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size;
        const across = Math.abs(v - 0.5) * 2;
        const edge = smooth((1 - across) / 0.25);
        // The chevron's centre line: its point at the middle of the ribbon, its arms swept back.
        const centre = 0.62 - 0.4 * across;
        for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size;
            let d = Math.abs(u - centre);
            d = Math.min(d, 1 - d);
            const stroke = smooth(1 - d / 0.1) * edge;
            const core = stroke * stroke;
            const i = (y * size + x) * 4;
            image.data[i] = 255;
            image.data[i + 1] = Math.round(140 + 105 * core);
            image.data[i + 2] = Math.round(50 + 180 * core);
            image.data[i + 3] = Math.round(Math.max(stroke, 0.1 * edge) * 255);
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
const RADIUS = 2;

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

export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 5.5, 17));
    camera.setTarget(new BVector3(0, 2, 0));
    const texture = chevronTexture(scene);
    addGround(scene);
    const names = ['stretch', 'distributePerSegment', 'tile', 'repeatPerSegment', 'clearTrails() on a jump'];
    names.forEach((name, lane) => addLabel(scene, name, new BVector3(laneX(lane), 0.25, 0), {height: 0.46}));

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
            startSize: new ConstantValue(0.8),
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
            blendMode: Constants.ALPHA_ADD,
        });
        figure(lane, 0, system.emitter.position);
        add(system);
        return system;
    });

    let elapsed = 0;
    let nextJump = 1.5;
    return {
        update(delta) {
            elapsed += delta;
            for (let lane = 0; lane < LANES - 1; lane++) {
                figure(lane, elapsed, trails[lane].emitter.position);
            }
            // The last lane teleports: a jump is a placement, not motion to draw a ribbon across.
            const jumper = trails[LANES - 1];
            if (elapsed >= nextJump) {
                nextJump += 1.5;
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
                const t = elapsed * 3;
                jumper.emitter.position.x += Math.cos(t) * delta * 1.5;
                jumper.emitter.position.z += Math.sin(t * 1.3) * delta * 1.5;
            }
        },
    };
}
