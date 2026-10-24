import type {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    RenderMode,
    Vector4,
} from 'babylon.quarks';
import {DEFAULT_GRADIENT_STOPS, buildGradient} from './colors.js';
import {uniqueEntryName, type SceneEntry} from './sceneEntries.js';

export interface CreateSceneDefaultOptions {
    resolveTexture?: (url: string, scene: Scene) => Texture | null | undefined;
    textureUrl?: string;
}

/** Creates a simple cone burst preset for new editor effects. */
export function createDefaultEffect(
    scene: Scene,
    resolveTexture?: (url: string, scene: Scene) => Texture | null | undefined,
    textureUrl?: string
): ParticleSystem {
    const system = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        startLife: new IntervalValue(1.2, 1.8),
        startSpeed: new IntervalValue(3, 5),
        startSize: new IntervalValue(0.25, 0.5),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(80),
        shape: new ConeEmitter({radius: 0.3, angle: 0.25}),
        renderMode: RenderMode.BillBoard,
        texture: textureUrl && resolveTexture ? resolveTexture(textureUrl, scene) : undefined,
        transparent: true,
        blendMode: 1,
    });
    // The editor previews over and over; the stop action is saved, not applied.
    system.ignoreStopAction = true;
    system.addBehavior(new ColorOverLife(buildGradient(DEFAULT_GRADIENT_STOPS)));
    system.emitter.rotation.x = -Math.PI / 2;
    return system;
}

/** Creates a preset effect as a new scene entry (systems not registered with the renderer yet). */
export function createSceneDefaultEntry(
    scene: Scene,
    existing: SceneEntry[],
    options: CreateSceneDefaultOptions = {}
): SceneEntry {
    const name = uniqueEntryName(existing.length === 0 ? 'Effect' : 'New Effect', existing);
    const system = createDefaultEffect(scene, options.resolveTexture, options.textureUrl);
    system.pause();

    const root = new TransformNode(name, scene);
    system.emitter.parent = root;

    return {name, path: `_created/${name}.json`, assetId: null, root, systems: [system]};
}
