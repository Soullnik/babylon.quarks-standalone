import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    Bezier,
    ConstantColor,
    ConstantValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    SizeOverLife,
    Vector2,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/**
 * Ring Buffer Mode (Unity's option of the same name). Both emitters circle and leave 60 dots
 * behind in world space, as many as `maxParticles` allows. The left one pauses each dot at the end
 * of its life until a new dot replaces it, the oldest first, so the trail of footprints never
 * fades. The right one loops each dot over the middle of its life, so its dots keep pulsing until
 * they are replaced.
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 10, 18));
    const texture = createSharedTexture(scene);

    const make = (x: number, tint: Vector4, mode: 'pauseUntilReplaced' | 'loopUntilReplaced') => {
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(0.6),
            startColor: new ConstantColor(tint),
            worldSpace: true,
            emissionOverTime: new ConstantValue(20),
            maxParticles: 60,
            ringBufferMode: mode,
            ringBufferLoopRange: new Vector2(0.3, 0.7),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            startTileIndex: new ConstantValue(0),
            uTileCount: 10,
            vTileCount: 10,
        });
        // Grows over its life and shrinks back: a looping dot pulses, a paused one holds its end size.
        system.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.3, 1.6, 1.6, 0.6), 0]])));
        system.emitter.position.set(x, 0, 0);
        batchRenderer.addSystem(system);
        systems.push(system);
        return system;
    };

    make(-5, new Vector4(1, 0.7, 0.3, 1), 'pauseUntilReplaced');
    make(5, new Vector4(0.4, 0.8, 1, 1), 'loopUntilReplaced');
}

/** Moves both emitters around their circles. */
export function update({systems}: DemoContext) {
    const time = (performance.now() / 1000) % 1000;
    systems.forEach((system, i) => {
        const centre = i === 0 ? -5 : 5;
        system.emitter.position.set(centre + Math.cos(time * 1.3) * 3.5, 0, Math.sin(time * 1.3) * 3.5);
    });
}
