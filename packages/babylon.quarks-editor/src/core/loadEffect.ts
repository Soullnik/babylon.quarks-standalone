import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Node} from '@babylonjs/core/node';
import type {Scene} from '@babylonjs/core/scene';
import type {BatchedRenderer, ParticleSystem} from 'babylon.quarks';
import {ParticleEmitter, QuarksLoader, QuarksUtil} from 'babylon.quarks';

export interface LoadedEffect {
    root: TransformNode;
    systems: ParticleSystem[];
    /** Whether the effect file named the root node; when false its name is a stand-in the host may replace. */
    rootNameAuthored: boolean;
}

export interface LoadEffectOptions {
    /** Registers systems with the batched renderer (default true). */
    registerRenderer?: boolean;
    /** Restarts and unpauses after load (default matches registerRenderer). */
    autoplay?: boolean;
}

/**
 * Which nodes carry a name the effect file gave them. Starts from what the loader recorded
 * (QuarksLoader.hasAuthoredName) and follows names moved onto a collapsed child, so that name
 * keeps counting as authored. An unnamed node still has *a* name — its JSON type or a
 * constructor default — and this is what tells the two apart, rather than comparing against
 * those stand-ins.
 */
class AuthoredNames {
    private readonly moved = new WeakSet<TransformNode>();

    has(node: TransformNode): boolean {
        return this.moved.has(node) || QuarksLoader.hasAuthoredName(node);
    }

    add(node: TransformNode): void {
        this.moved.add(node);
    }
}

function groupChildren(node: TransformNode): TransformNode[] {
    return node.getChildren().filter((c): c is TransformNode => c instanceof TransformNode);
}

/** Reparents `only` onto `parent`, transferring the outgoing node's name if the file named the
 * wrapper but not `only`, then disposes the now-empty wrapper. World transform is preserved via
 * `setParent`. */
function collapseInto(wrapper: TransformNode, only: TransformNode, parent: Node | null, authored: AuthoredNames): void {
    if (!authored.has(only) && authored.has(wrapper)) {
        only.name = wrapper.name;
        authored.add(only);
    }
    only.setParent(parent);
    wrapper.dispose(true, false);
}

function flattenRedundantGroups(node: TransformNode, authored: AuthoredNames): void {
    for (const child of node.getChildren()) {
        if (child instanceof TransformNode) {
            flattenRedundantGroups(child, authored);
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
    collapseInto(node, only, node.parent, authored);
}

function promoteIfSingleChildRoot(root: TransformNode, authored: AuthoredNames): TransformNode {
    let current = root;
    while (!(current instanceof ParticleEmitter)) {
        const children = groupChildren(current);
        if (children.length !== 1) {
            break;
        }
        const only = children[0];
        const parent = current.parent;
        collapseInto(current, only, parent, authored);
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
): LoadedEffect {
    const registerRenderer = options.registerRenderer ?? true;
    const autoplay = options.autoplay ?? registerRenderer;

    const loader = new QuarksLoader(scene, {baseUrl});
    const authored = new AuthoredNames();
    let root = loader.parse(json as never, baseUrl);
    flattenRedundantGroups(root, authored);
    root = promoteIfSingleChildRoot(root, authored);

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

    return {root, systems, rootNameAuthored: authored.has(root)};
}

/** Parses a Quarks JSON export, registers all systems with the renderer and starts playback. */
export function loadEffectFromJson(scene: Scene, renderer: BatchedRenderer, json: unknown, baseUrl = ''): LoadedEffect {
    return parseEffectFromJson(scene, renderer, json, {registerRenderer: true, autoplay: true}, baseUrl);
}
