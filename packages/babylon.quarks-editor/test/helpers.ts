import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, ParticleSystem, ParticleSystemParameters, PointEmitter, RenderMode} from 'babylon.quarks';

/** A NullEngine scene per test, disposed after it. */
export function useScene(): {get(): Scene} {
    let engine: NullEngine;
    let scene: Scene;
    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });
    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });
    return {get: () => scene};
}

/** Restarts, plays and steps a system through `seconds` in small fixed steps. */
export function advance(system: ParticleSystem, seconds: number, step = 0.05): void {
    system.restart();
    system.play();
    for (let t = 0; t < seconds - 1e-9; t += step) {
        system.update(Math.min(step, seconds - t));
    }
}

/** A small looping billboard system with no texture. */
export function makeSystem(scene: Scene, parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        emissionOverTime: new ConstantValue(10),
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
        texture: null,
        ...parameters,
    });
}
