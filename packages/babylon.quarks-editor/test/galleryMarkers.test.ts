import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {GalleryDropMarker} from '../src/core/galleryDropMarker';
import {GalleryHoverMarker, GallerySelectionMarker} from '../src/core/gallerySelectionMarker';
import {useScene} from './helpers';

describe('gallery drop marker', () => {
    const scene = useScene();

    const root = () => scene.get().getTransformNodeByName('gallery-drop-root')!;
    const material = () => scene.get().getMaterialByName('gallery-drop-fill-mat')!;

    it('starts hidden and sizes itself to the dropped footprint', () => {
        const marker = new GalleryDropMarker(scene.get());
        expect(root().isEnabled()).toBe(false);

        marker.show(new Vector3(2, 9, 3), 1);
        expect(root().isEnabled()).toBe(true);
        expect(root().position.asArray()).toEqual([2, 0.03, 3]);
        // One effect: a disc for one grid cell (span 4 → 4 * 0.25 + 4 * 0.175).
        expect(root().scaling.x).toBeCloseTo(1.7);
        expect(material().alpha).toBe(0.24);

        marker.show(new Vector3(0, 0, 0), 9);
        expect(root().scaling.x).toBeGreaterThan(1.7);
        expect(material().alpha).toBe(0.16);

        marker.hide();
        expect(root().isEnabled()).toBe(false);

        marker.dispose();
        expect(scene.get().getTransformNodeByName('gallery-drop-root')).toBeNull();
        expect(scene.get().getMaterialByName('gallery-drop-fill-mat')).toBeNull();
        expect(scene.get().getMeshByName('gallery-drop-fill')).toBeNull();
    });
});

describe('ground ring markers', () => {
    const scene = useScene();

    it('follows the tracked root on the ground plane until hidden or disposed', () => {
        const marker = new GallerySelectionMarker(scene.get());
        const anchor = scene.get().getTransformNodeByName('gallery-selection-root')!;
        expect(anchor.isEnabled()).toBe(false);

        const parent = new TransformNode('p', scene.get());
        parent.position.set(1, 0, 0);
        const fx = new TransformNode('fx', scene.get());
        fx.parent = parent;
        fx.position.set(1, 5, 2);

        marker.show(fx);
        expect(anchor.isEnabled()).toBe(true);
        expect(anchor.position.asArray()).toEqual([2, 0.03, 2]);

        fx.position.z = 7;
        fx.computeWorldMatrix(true);
        marker.follow();
        expect(anchor.position.z).toBe(7);

        marker.hide();
        fx.position.z = 8;
        fx.computeWorldMatrix(true);
        marker.follow();
        expect(anchor.position.z).toBe(7);
        expect(anchor.isEnabled()).toBe(false);

        marker.show(fx);
        fx.dispose();
        marker.follow();
        expect(anchor.position.z).toBe(8);

        marker.dispose();
        expect(scene.get().getTransformNodeByName('gallery-selection-root')).toBeNull();
        expect(scene.get().getMeshByName('gallery-selection-ring')).toBeNull();
    });

    it('builds the hover ring under its own name', () => {
        const marker = new GalleryHoverMarker(scene.get());
        expect(scene.get().getMeshByName('gallery-hover-ring')).not.toBeNull();
        marker.dispose();
    });
});
