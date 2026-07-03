import {QuarksLoader, QuarksUtil} from 'babylon.quarks';
import type {BatchedRenderer, ParticleEmitter, ParticleSystem} from 'babylon.quarks';
import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';

/** Parses a Quarks JSON export, registers all systems with the renderer and starts playback. */
export function loadEffectFromJson(
    scene: Scene,
    renderer: BatchedRenderer,
    json: unknown,
    baseUrl = ''
): {root: TransformNode; systems: ParticleSystem[]} {
    const loader = new QuarksLoader(scene, {baseUrl});
    const root = loader.parse(json as never, baseUrl);
    const systems: ParticleSystem[] = [];
    QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
        const system = emitter.system as ParticleSystem;
        renderer.addSystem(system);
        systems.push(system);
    });
    QuarksUtil.restart(root);
    QuarksUtil.play(root);
    return {root, systems};
}
