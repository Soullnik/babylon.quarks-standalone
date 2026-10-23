/** @jest-environment jsdom */
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {serializeEffect} from 'babylon.quarks';
import {act, StrictMode} from 'react';
import type {EffectEditorHostHandle} from '../../src/core/editorSession';
import type {ProjectStore, StoredAsset, StoredScene} from '../../src/core/projectStore';
import {EffectEditorHost, QuarksEffectEditor} from '../../src/react/EffectEditorHost';
import {makeSystem} from '../helpers';
import {click, mount, Mounted, type} from './dom';

// jsdom has no WebGL: the host draws through a NullEngine whose render loop is driven by hand.
const engines: NullEngine[] = [];
function createEngine(): NullEngine {
    const engine = new NullEngine();
    engine.runRenderLoop = (fn: () => void) => {
        loops.push(fn);
    };
    engines.push(engine);
    return engine;
}
const loops: Array<() => void> = [];

class NoResizeObserver {
    observe(): void {}
    disconnect(): void {}
}
(globalThis as {ResizeObserver?: unknown}).ResizeObserver = NoResizeObserver;

function byTitle(title: string | RegExp): HTMLElement {
    const all = Array.from(document.body.querySelectorAll<HTMLElement>('[title]'));
    const found = all.find((el) => (typeof title === 'string' ? el.title === title : title.test(el.title)));
    if (!found) throw new Error(`no element titled ${title}`);
    return found;
}

/** The last button reading `text`: a dialog's, when one is open. */
function buttonText(text: string): HTMLButtonElement {
    const found = Array.from(document.body.querySelectorAll('button'))
        .reverse()
        .find((b) => b.textContent?.trim() === text);
    if (!found) {
        const present = Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent?.trim());
        throw new Error(`no button "${text}"; buttons: ${present.filter(Boolean).join(' | ')}`);
    }
    return found;
}

function hasText(text: string): boolean {
    return document.body.textContent?.includes(text) ?? false;
}

function key(init: KeyboardEventInit, target: EventTarget = window): void {
    act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, ...init}));
    });
}

function contextMenu(element: Element): void {
    act(() => {
        element.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 5, clientY: 5}));
    });
}

function submitPrompt(value: string): void {
    const input = document.body.querySelector<HTMLInputElement>('div[style*="position: fixed"] input')!;
    type(input, value);
    key({key: 'Enter'}, input);
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

/** A one-system effect's JSON, named `name`. */
function effectJsonFor(name: string): Record<string, unknown> {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode(name, scene);
    const system = makeSystem(scene);
    system.emitter.name = name;
    system.emitter.parent = root;
    const json = serializeEffect(root, {name}) as unknown as Record<string, unknown>;
    scene.dispose();
    engine.dispose();
    return json;
}

function memoryStore(scene: StoredScene | null = null) {
    const saved = {scene, assets: [] as StoredAsset[]};
    const store = {
        loadAssets: jest.fn(async () => saved.assets),
        loadScene: jest.fn(async () => saved.scene),
        putAssets: jest.fn(async (_id: string, put: StoredAsset[]) => {
            saved.assets = [...saved.assets.filter((a) => !put.some((p) => p.path === a.path)), ...put];
        }),
        deleteAssets: jest.fn(async () => {}),
        saveScene: jest.fn(async (_id: string, next: StoredScene) => {
            saved.scene = next;
        }),
    };
    return {store: store as unknown as ProjectStore, mocks: store, saved};
}

describe('EffectEditorHost', () => {
    let mounted: Mounted | null = null;
    let consoleError: jest.SpyInstance;
    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.clear();
    });
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
        consoleError.mockRestore();
    });

    it('opens a default effect and hands the embedder a handle', () => {
        const handles: EffectEditorHostHandle[] = [];
        mounted = mount(
            <EffectEditorHost createEngine={createEngine} title="Editor" onReady={(h) => handles.push(h)} />
        );
        expect(hasText('Scene · 1')).toBe(true);
        expect(handles.length).toBeGreaterThan(0);
        expect(hasText(handles[handles.length - 1].binding.root.name)).toBe(true);
        expect(hasText('Select an effect in the Scene to see its timeline.')).toBe(false);
        expect(byTitle('Undo (Ctrl+Z)')).toHaveProperty('disabled', true);
    });

    it('drives the drawer, the timeline dock, the gizmo and the transport from the keyboard and toolbars', () => {
        mounted = mount(<EffectEditorHost createEngine={createEngine} />);
        const drawer = () => document.body.querySelector('div[aria-hidden]')!;
        expect(drawer().getAttribute('aria-hidden')).toBe('true');
        key({code: 'Space', key: ' ', ctrlKey: true});
        expect(drawer().getAttribute('aria-hidden')).toBe('false');
        key({key: 'Escape'});
        expect(drawer().getAttribute('aria-hidden')).toBe('true');
        click(byTitle('Assets (Ctrl+Space)'));
        click(byTitle('Pin — keep it docked above the timeline'));
        key({key: 'Escape'});
        expect(drawer().getAttribute('aria-hidden')).toBe('false');
        click(byTitle('Assets (Ctrl+Space)'));
        expect(drawer().getAttribute('aria-hidden')).toBe('true');
        click(byTitle('Assets (Ctrl+Space)'));
        click(byTitle('Close (Esc)'));
        expect(drawer().getAttribute('aria-hidden')).toBe('true');

        click(byTitle('Collapse timeline'));
        click(byTitle('Expand timeline'));
        for (const title of ['Move the stage node (position)', 'Rotate the stage node', 'Scale the stage node']) {
            click(byTitle(title));
        }
        click(byTitle('Select (hide stage gizmo)'));
        click(byTitle('Show emitter shape wireframes'));
        click(byTitle('Show emitter shape wireframes'));

        // Space pauses the stage, and again plays it.
        key({code: 'Space', key: ' '});
        key({code: 'Space', key: ' '});
        // Typing in a field is not a shortcut.
        const input = document.createElement('input');
        document.body.appendChild(input);
        key({code: 'Space', key: ' '}, input);
        key({key: 'z', ctrlKey: true}, input);
        key({key: 'Delete'}, input);
        input.remove();
        expect(hasText('Scene · 1')).toBe(true);
    });

    it('renames, edits with undo and redo, exports and deletes the focused effect', () => {
        const saves: string[] = [];
        const createObjectURL = jest.fn(() => 'blob:x');
        Object.assign(URL, {createObjectURL, revokeObjectURL: jest.fn()});
        const clickLink = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        let handle: EffectEditorHostHandle | null = null;
        mounted = mount(
            <EffectEditorHost
                createEngine={createEngine}
                onSave={(json) => saves.push(json)}
                onReady={(h) => (handle = h)}
            />
        );

        click(byTitle('Rename effect'));
        submitPrompt('Comet');
        expect(handle!.binding.root.name).toBe('Comet');
        expect(hasText('Comet')).toBe(true);
        expect(byTitle('Undo (Ctrl+Z)')).toHaveProperty('disabled', false);
        const life = () => handle!.binding.system.duration;
        const before = life();
        act(() => handle!.binding.apply((system) => (system.duration = 9)));
        key({key: 'z', ctrlKey: true});
        expect(life()).toBe(before);
        key({key: 'z', ctrlKey: true, shiftKey: true});
        expect(life()).toBe(9);
        click(byTitle('Undo (Ctrl+Z)'));
        click(byTitle('Redo (Ctrl+Shift+Z)'));

        click(buttonText('Export'));
        expect(createObjectURL).toHaveBeenCalled();
        expect(clickLink).toHaveBeenCalled();
        click(buttonText('Save'));
        expect(JSON.parse(saves[0]).object).toBeDefined();
        clickLink.mockRestore();

        click(byTitle('Rename effect'));
        key({key: 'Escape'}, document.body.querySelector('div[style*="position: fixed"] input')!);
        key({key: 'Delete'});
        expect(hasText('No effect selected.')).toBe(true);
        expect(hasText('Select an effect in the Scene to see its timeline.')).toBe(true);
    });

    it('saves a project scene, guards unsaved changes and asks before leaving', async () => {
        const {store, mocks} = memoryStore();
        const exits: number[] = [];
        mounted = mount(
            <EffectEditorHost
                createEngine={createEngine}
                project={{store, id: 'p', name: 'My project'}}
                onExitProject={() => exits.push(1)}
            />
        );
        expect(hasText('Opening My project…')).toBe(true);
        await settle();
        expect(hasText('Opening My project…')).toBe(false);
        expect(hasText('My project *')).toBe(false);

        click(byTitle(/Solo — hide every other effect/));
        expect(hasText('My project *')).toBe(true);
        const unload = new Event('beforeunload', {cancelable: true});
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);

        key({key: 's', ctrlKey: true});
        await settle();
        expect(mocks.saveScene).toHaveBeenCalledTimes(1);
        expect(hasText('Scene saved')).toBe(true);
        click(buttonText('OK'));
        expect(hasText('My project *')).toBe(false);

        click(byTitle('Back to projects'));
        expect(exits).toEqual([1]);

        click(byTitle(/Exit solo/));
        click(byTitle('Back to projects'));
        expect(hasText('Save changes to the scene?')).toBe(true);
        click(buttonText('Cancel'));
        click(byTitle('Back to projects'));
        click(buttonText("Don't save"));
        expect(exits).toEqual([1, 1]);

        click(byTitle(/Solo — hide every other effect/));
        click(byTitle('Back to projects'));
        click(buttonText('Save'));
        await settle();
        expect(mocks.saveScene).toHaveBeenCalledTimes(2);
        expect(hasText('Scene saved · assets unchanged')).toBe(true);
        expect(exits).toHaveLength(3);
    });

    it('saves an effect as an asset and edits it as a prefab', async () => {
        const {store} = memoryStore();
        mounted = mount(<EffectEditorHost createEngine={createEngine} project={{store, id: 'p', name: 'P'}} />);
        await settle();

        const row = byTitle(/Ctrl\+click toggles visibility/);
        contextMenu(row);
        click(buttonText('Save as new asset…'));
        submitPrompt('fx/Rocket');
        expect(hasText('Saved as asset “fx/Rocket”')).toBe(true);

        act(() => {
            byTitle(/^fx — 1 effect/).dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
        });
        const card = byTitle(/^fx\/Rocket\.json\n/);
        act(() => {
            card.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
        });
        expect(hasText('The scene is set aside while you edit this asset')).toBe(true);
        expect(byTitle('Back to the scene')).toBeDefined();

        // Ctrl+S on a prefab asks how to save it.
        key({key: 's', ctrlKey: true});
        expect(hasText('Overwrite prefab “Rocket”?')).toBe(true);
        expect(hasText('The 1 “Rocket” effect(s) already in the scene will not change.')).toBe(true);
        click(buttonText('Overwrite'));
        expect(hasText('Prefab “Rocket” saved · scene unchanged')).toBe(true);

        click(byTitle('Overwrite the prefab asset (Ctrl+S)'));
        click(buttonText('Save as new…'));
        submitPrompt('fx/Rocket big');
        expect(hasText('Saved as new prefab “fx/Rocket big”')).toBe(true);

        // Unsaved edits ask before leaving.
        click(byTitle('Rename effect'));
        submitPrompt('Edited');
        click(buttonText('← Scene'));
        expect(hasText('Save changes to prefab “Rocket big”?')).toBe(true);
        click(buttonText('Cancel'));
        click(byTitle('Back to the scene'));
        click(buttonText('Save'));
        expect(hasText('The scene is set aside while you edit this asset')).toBe(false);
        expect(hasText('Scene · 1')).toBe(true);

        act(() => {
            byTitle(/^fx\/Rocket\.json\n/).dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
        });
        click(byTitle('Rename effect'));
        submitPrompt('Edited again');
        act(() => {
            byTitle(/^fx\/Rocket big\.json\n/).dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
        });
        expect(hasText('Before opening “Rocket big”.')).toBe(true);
        click(buttonText("Don't save"));
        expect(hasText('Rocket big')).toBe(true);
        click(byTitle('Rename effect'));
        submitPrompt('Third');
        act(() => {
            byTitle(/^fx\/Rocket\.json\n/).dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
        });
        click(buttonText('Save'));
        click(byTitle('Rename effect'));
        submitPrompt('Fourth');
        click(byTitle('Back to the scene'));
        click(buttonText("Don't save"));
        expect(hasText('Scene · 1')).toBe(true);
    });

    it('reports an import with no effect files', () => {
        mounted = mount(<EffectEditorHost createEngine={createEngine} />);
        click(byTitle('Assets (Ctrl+Space)'));
        const input = document.body.querySelector<HTMLInputElement>('input[type=file]')!;
        act(() => {
            Object.defineProperty(input, 'files', {value: [new File(['x'], 'a.png')], configurable: true});
            input.dispatchEvent(new Event('change', {bubbles: true}));
        });
        expect(hasText('No .json files found among 1 file(s)')).toBe(true);
        click(buttonText('OK'));
    });

    it('mounts and unmounts through QuarksEffectEditor.Show', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        let shown: {dispose(): void} | null = null;
        act(() => {
            shown = QuarksEffectEditor.Show({hostElement: host, createEngine});
        });
        expect(host.textContent).toContain('Scene · 1');
        act(() => shown!.dispose());
        expect(host.textContent).toBe('');
        host.remove();
        expect(engines.length).toBeGreaterThan(0);
    });
});

describe('EffectEditorHost lifecycle', () => {
    let consoleError: jest.SpyInstance;
    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => consoleError.mockRestore());
    beforeEach(() => {
        engines.length = 0;
        loops.length = 0;
    });

    it('draws frames into the FPS readout and frees the engine and listeners on unmount', () => {
        const removed = jest.spyOn(window, 'removeEventListener');
        let scene: Scene | null = null;
        const mounted = mount(<EffectEditorHost createEngine={createEngine} onReady={(h) => (scene = h.scene)} />);
        expect(engines).toHaveLength(1);
        const dispose = jest.spyOn(engines[0], 'dispose');
        // The frame's stats are under test, not its drawing: jsdom cannot load shaders.
        scene!.render = () => {};
        act(() => loops[loops.length - 1]());
        expect(hasText('— FPS')).toBe(false);
        expect(document.body.textContent).toMatch(/\d+ FPS/);
        expect(document.body.textContent).toMatch(/\d+ particles/);

        mounted.unmount();
        expect(dispose).toHaveBeenCalled();
        expect(removed.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['dragend', 'keydown']));
        removed.mockRestore();
    });

    it('takes an engine from a promise, and drops one that resolves after unmount', async () => {
        let resolveLate!: (engine: NullEngine) => void;
        const late = mount(
            <EffectEditorHost createEngine={() => new Promise<NullEngine>((resolve) => (resolveLate = resolve))} />
        );
        late.unmount();
        const orphan = createEngine();
        const orphanDispose = jest.spyOn(orphan, 'dispose');
        await act(async () => resolveLate(orphan));
        expect(orphanDispose).toHaveBeenCalled();

        const mounted = mount(<EffectEditorHost createEngine={async () => createEngine()} />);
        expect(hasText('Scene · 1')).toBe(false);
        await settle();
        expect(hasText('Scene · 1')).toBe(true);
        mounted.unmount();
    });

    it('reports an engine that could not be created', async () => {
        const mounted = mount(<EffectEditorHost createEngine={() => Promise.reject(new Error('no WebGPU'))} />);
        await settle();
        expect(hasText('no WebGPU')).toBe(true);
        mounted.unmount();
    });

    it('survives a StrictMode double mount with a project, showing the live session', async () => {
        const {store} = memoryStore({
            savedAt: 1,
            entries: [
                {
                    name: 'Saved',
                    assetPath: null,
                    json: effectJsonFor('Saved'),
                    visible: true,
                },
            ],
        });
        const handles: EffectEditorHostHandle[] = [];
        const mounted = mount(
            <StrictMode>
                <EffectEditorHost
                    createEngine={createEngine}
                    project={{id: 'p', name: 'Demo', store}}
                    onReady={(h) => handles.push(h)}
                />
            </StrictMode>
        );
        await settle();
        expect(engines).toHaveLength(2);
        expect(engines[0].isDisposed).toBe(true);
        expect(engines[1].isDisposed).toBe(false);
        expect(hasText('Scene · 1')).toBe(true);
        // Every handle the embedder got is from the live session.
        expect(handles.length).toBeGreaterThan(0);
        expect(handles.every((h) => h.scene.getEngine() === engines[1])).toBe(true);
        mounted.unmount();
        expect(engines[1].isDisposed).toBe(true);
    });
});
