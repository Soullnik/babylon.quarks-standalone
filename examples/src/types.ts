import type {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import type {BatchedRenderer, ParticleSystem} from 'babylon.quarks';

/**
 * Controls a demo puts next to its description in the viewer: switches that turn a setting on and
 * off, choices between a few values, buttons that fire something. The landing page's stage has no
 * panel, so there the calls do nothing and the demo runs with its initial values.
 */
export interface DemoControls {
    toggle(label: string, value: boolean, onChange: (value: boolean) => void): void;
    choice<T extends string>(label: string, options: readonly T[], value: T, onChange: (value: T) => void): void;
    /**
     * The demo's topics, one shown at a time: the viewer draws them as a bar of tabs over the
     * scene, switched by click, digit or arrow keys. `onChange` gets the name picked.
     */
    topics(names: readonly string[], value: string, onChange: (name: string) => void): void;
    button(label: string, onClick: () => void): void;
}

/** What the host (the viewer, or the landing page's stage) gives a demo to build in. */
export interface DemoContext {
    scene: Scene;
    camera: ArcRotateCamera;
    batchRenderer: BatchedRenderer;
    /** Every system the demo runs: the host counts their particles and opens them in the editor. */
    systems: ParticleSystem[];
    controls: DemoControls;
    /** Adds a system to the batch renderer and to `systems`, and returns it. */
    add(system: ParticleSystem): ParticleSystem;
    /** Adds every system under an effect's root, as {@link DemoContext.add} does for one. */
    addEffect(root: TransformNode): TransformNode;
}

/**
 * A running demo. The host calls `update` once a frame with the frame's time in seconds, before it
 * updates the batch renderer, and `dispose` when it leaves the demo, before it disposes the scene.
 * All of a demo's state lives in its own closure, so opening it again starts it fresh.
 */
export interface DemoRun {
    update?(delta: number): void;
    dispose?(): void;
}

export interface DemoModule {
    init(ctx: DemoContext): DemoRun | void | Promise<DemoRun | void>;
}

/**
 * The gallery's two halves. A showcase is a finished effect as a game would ship it; a feature
 * demo shows one part of the library, labelled in the scene, with switches to compare.
 */
export type DemoSection = 'showcase' | 'features';

export interface DemoManifestEntry {
    /** The page's hash, `babylonDemo.html#<key>`; kept stable, since links point at it. */
    key: string;
    name: string;
    /** The file in `src/demos/`, without `.ts`. */
    module: string;
    section: DemoSection;
    /** The group the gallery and the viewer's picker list the demo under. */
    category: string;
    /** Shown in the viewer's panel and on the gallery card: what to look at. */
    description: string;
    tags: string[];
    /** Seconds of simulated time the preview is taken at, the moment that shows the effect best. */
    captureAt: number;
}

export interface DemoDefinition extends DemoManifestEntry {
    sourcePath: string;
    load(): Promise<DemoModule>;
}
