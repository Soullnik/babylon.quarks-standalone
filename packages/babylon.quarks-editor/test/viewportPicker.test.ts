import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {isEditorSceneNode} from '../src/core/editorScene';
import {SceneEntry} from '../src/core/sceneEntries';
import {GalleryViewportPicker} from '../src/core/viewportPicker';
import {useScene} from './helpers';

describe('viewport picker', () => {
    const scene = useScene();

    const entry = (name: string): SceneEntry => ({
        name,
        path: `${name}.json`,
        assetId: null,
        root: new TransformNode(name, scene.get()),
        systems: [],
    });
    const handles = () => scene.get().meshes.filter((m) => m.name.startsWith('viewport-pick-root-'));

    it('keeps one invisible pick handle per visible entry root, rebuilt per sync key', () => {
        const picker = new GalleryViewportPicker(scene.get());
        const a = entry('a');
        const b = entry('b');
        b.root.setEnabled(false);
        const c = entry('c');
        c.root.dispose();

        picker.sync([a, b, c], null, 'v1');
        expect(handles().map((m) => m.parent)).toEqual([a.root]);
        const [handle] = handles();
        expect(handle.visibility).toBe(0);
        expect(handle.isPickable).toBe(true);
        expect(isEditorSceneNode(handle)).toBe(true);
        expect(handle.metadata).toMatchObject({quarksEditorPick: true, effectRoot: a.root});

        // Same key: nothing is rebuilt.
        picker.sync([a, b], null, 'v1');
        expect(handles()[0]).toBe(handle);

        // New key: handles are rebuilt; the solo root is used only when there are no entries.
        const solo = new TransformNode('solo', scene.get());
        picker.sync([], solo, 'v2');
        expect(handles().map((m) => m.parent)).toEqual([solo]);
        picker.sync([], null, 'v3');
        expect(handles()).toEqual([]);

        picker.dispose();
        expect(scene.get().getTransformNodeByName('gallery-hover-root')).toBeNull();
    });

    it('shows the hover ring under the hovered root and drops it when the root goes away', () => {
        const picker = new GalleryViewportPicker(scene.get());
        const anchor = scene.get().getTransformNodeByName('gallery-hover-root')!;
        const a = entry('a');
        a.root.position.x = 4;

        picker.setHover(a.root);
        expect(anchor.isEnabled()).toBe(true);
        expect(anchor.position.x).toBe(4);
        a.root.position.x = 6;
        a.root.computeWorldMatrix(true);
        picker.follow();
        expect(anchor.position.x).toBe(6);

        // A sync keeps the hover while the root lives, and clears it once it is disposed.
        picker.sync([a], null, 'v1');
        expect(anchor.isEnabled()).toBe(true);
        a.root.dispose();
        picker.sync([], null, 'v2');
        expect(anchor.isEnabled()).toBe(false);

        picker.setHover(null);
        expect(anchor.isEnabled()).toBe(false);
        picker.setHover(a.root);
        expect(anchor.isEnabled()).toBe(false);
        picker.dispose();
    });

    it('cannot pick without a canvas', () => {
        const picker = new GalleryViewportPicker(scene.get());
        expect(picker.pick(1, 1)).toBeNull();
        picker.dispose();
    });
});
