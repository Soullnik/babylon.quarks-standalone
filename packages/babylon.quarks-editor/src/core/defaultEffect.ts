import type {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
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
import {DEFAULT_GRADIENT_STOPS, buildGradient} from './colors';
import type {GalleryEntry} from './loadEffectGallery';

export interface CreateGalleryDefaultOptions {
    resolveTexture?: (url: string, scene: Scene) => unknown;
    textureUrl?: string;
}

/** Creates a simple cone burst preset for new editor effects. */
export function createDefaultEffect(
    scene: Scene,
    resolveTexture?: (url: string, scene: Scene) => unknown,
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
        texture: (textureUrl && resolveTexture ? resolveTexture(textureUrl, scene) : undefined) as never,
        transparent: true,
        blendMode: 1,
    });
    system.addBehavior(new ColorOverLife(buildGradient(DEFAULT_GRADIENT_STOPS)));
    system.emitter.rotation.x = -Math.PI / 2;
    return system;
}

/** Adds a blank preset effect to the hidden gallery catalog (not in the renderer yet). */
export function createGalleryDefaultEntry(
    scene: Scene,
    catalogRoot: TransformNode,
    existing: GalleryEntry[],
    options: CreateGalleryDefaultOptions = {}
): GalleryEntry {
    const takenNames = new Set(existing.map((entry) => entry.name));
    const takenPaths = new Set(existing.map((entry) => entry.path));

    let name = existing.length === 0 ? 'Effect' : 'New Effect';
    let suffix = 2;
    while (takenNames.has(name) || takenPaths.has(`_created/${name}.json`)) {
        name = `New Effect ${suffix}`;
        suffix++;
    }

    const path = `_created/${name}.json`;
    const system = createDefaultEffect(scene, options.resolveTexture, options.textureUrl);
    system.pause();

    const root = new TransformNode(name, scene);
    system.emitter.parent = root;
    root.parent = catalogRoot;
    root.setEnabled(false);

    return {name, path, root, systems: [system], inScene: false};
}
