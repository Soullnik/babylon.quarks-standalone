import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Node} from '@babylonjs/core/node';
import type {Scene} from '@babylonjs/core/scene';
import type {BatchedRenderer, ParticleSystem} from 'babylon.quarks';
import {ParticleEmitter, QuarksLoader, QuarksUtil} from 'babylon.quarks';

/** `ParticleEmitter`'s constructor default (see babylon.quarks/src/ParticleEmitter.ts) — the
 * name every emitter gets when the source JSON didn't give it one of its own. */
const DEFAULT_EMITTER_NAME = 'particleEmitter';

export interface LoadEffectOptions {
    /** Registers systems with the batched renderer (default true). */
    registerRenderer?: boolean;
    /** Restarts and unpauses after load (default matches registerRenderer). */
    autoplay?: boolean;
}

function hasMeaningfulName(node: TransformNode): boolean {
    return !!node.name && node.name !== DEFAULT_EMITTER_NAME;
}

function groupChildren(node: TransformNode): TransformNode[] {
    return node.getChildren().filter((c): c is TransformNode => c instanceof TransformNode);
}

/** Reparents `only` onto `parent`, transferring the outgoing node's name if `only` doesn't
 * already have a meaningful one of its own, then disposes the now-empty wrapper. World
 * transform is preserved via `setParent`. */
function collapseInto(wrapper: TransformNode, only: TransformNode, parent: Node | null): void {
    if (!hasMeaningfulName(only) && hasMeaningfulName(wrapper)) {
        only.name = wrapper.name;
    }
    only.setParent(parent);
    wrapper.dispose(true, false);
}

function flattenRedundantGroups(node: TransformNode): void {
    for (const child of node.getChildren()) {
        if (child instanceof TransformNode) {
            flattenRedundantGroups(child);
        }
    }
    if (node instanceof ParticleEmitter || !node.parent) {
        return;
    }
    const children = groupChildren(node);
    if (children.length === 0) {
        node.dispose(true, false);
        return;
    }
    if (children.length !== 1) {
        return;
    }
    const only = children[0];
    if (only instanceof ParticleEmitter && only.getChildren().length > 0) {
        return;
    }
    collapseInto(node, only, node.parent);
}

function promoteIfSingleChildRoot(root: TransformNode): TransformNode {
    let current = root;
    while (!(current instanceof ParticleEmitter)) {
        const children = groupChildren(current);
        if (children.length !== 1) {
            break;
        }
        const only = children[0];
        const parent = current.parent;
        collapseInto(current, only, parent);
        current = only;
    }
    return current;
}

/** Disposes a loaded effect's systems and its remaining group tree. */
export function disposeLoadedEffect(
    root: TransformNode,
    systems: ParticleSystem[],
    renderer: BatchedRenderer,
    inRenderer = true
): void {
    for (const system of systems) {
        if (inRenderer) {
            renderer.deleteSystem(system);
        }
        system.dispose();
    }
    if (!systems.some((system) => system.emitter === root)) {
        root.dispose(false, true);
    }
}

/** Parses Quarks JSON into a live hierarchy without optional renderer registration / playback. */
export function parseEffectFromJson(
    scene: Scene,
    renderer: BatchedRenderer | null,
    json: unknown,
    options: LoadEffectOptions = {},
    baseUrl = ''
): {root: TransformNode; systems: ParticleSystem[]} {
    const registerRenderer = options.registerRenderer ?? true;
    const autoplay = options.autoplay ?? registerRenderer;

    const loader = new QuarksLoader(scene, {baseUrl});
    let root = loader.parse(json as never, baseUrl);
    flattenRedundantGroups(root);
    root = promoteIfSingleChildRoot(root);

    const systems: ParticleSystem[] = [];
    QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
        const system = emitter.system as ParticleSystem;
        if (registerRenderer && renderer) {
            renderer.addSystem(system);
        }
        systems.push(system);
    });

    QuarksUtil.restart(root);
    if (autoplay) {
        QuarksUtil.play(root);
    } else {
        for (const system of systems) {
            system.pause();
        }
    }

    return {root, systems};
}

/** Parses a Quarks JSON export, registers all systems with the renderer and starts playback. */
export function loadEffectFromJson(
    scene: Scene,
    renderer: BatchedRenderer,
    json: unknown,
    baseUrl = ''
): {root: TransformNode; systems: ParticleSystem[]} {
    return parseEffectFromJson(scene, renderer, json, {registerRenderer: true, autoplay: true}, baseUrl);
}
