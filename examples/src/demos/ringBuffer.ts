import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3, Vector2} from '@babylonjs/core/Maths/math.vector';
import {
    Bezier,
    ConstantColor,
    ConstantValue,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    SizeOverLife,
} from 'babylon.quarks';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/**
 * Ring Buffer Mode (Unity's option of the same name). Both emitters circle and leave 60 dots
 * behind in world space, as many as `maxParticles` allows. The left one pauses each dot at the end
 * of its life until a new dot replaces it, the oldest first, so the trail of footprints never
 * fades. The right one loops each dot over the middle of its life, so its dots keep pulsing until
 * they are replaced.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 10, 16));
    addGround(scene, -0.4);
    addLabel(scene, 'Pause until replaced', new BVector3(-5, 0.2, 6.6));
    addLabel(scene, 'Loop until replaced', new BVector3(5, 0.2, 6.6));
    const texture = baseTexture(scene, 'glow');

    const make = (x: number, tint: Color4, mode: 'pauseUntilReplaced' | 'loopUntilReplaced') => {
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
        });
        // Grows over its life and shrinks back: a looping dot pulses, a paused one holds its end size.
        system.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.3, 1.6, 1.6, 0.6), 0]])));
        system.emitter.position.set(x, 0, 0);
        add(system);
        return system;
    };

    const paused = make(-5, new Color4(1, 0.7, 0.3, 1), 'pauseUntilReplaced');
    const looping = make(5, new Color4(0.4, 0.8, 1, 1), 'loopUntilReplaced');

    // Moves both emitters around their circles.
    let time = 0;
    return {
        update(delta) {
            time += delta;
            const x = Math.cos(time * 1.3) * 3.5;
            const z = Math.sin(time * 1.3) * 3.5;
            paused.emitter.position.set(-5 + x, 0, z);
            looping.emitter.position.set(5 + x, 0, z);
        },
    };
}
