import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    cancelGalleryCameraFocus,
    fitGalleryView,
    focusGalleryEntry,
    galleryColumnCount,
    galleryGridPosition,
    gallerySpan,
} from '../src/core/galleryLayout';
import {useScene} from './helpers';

describe('gallery grid', () => {
    it('lays items out on a centred square grid', () => {
        expect([0, 1, 2, 4, 5, 9, 10].map(galleryColumnCount)).toEqual([1, 1, 2, 2, 3, 3, 4]);
        expect(galleryGridPosition(0, 1)).toEqual({x: 0, z: 0});
        expect(galleryGridPosition(0, 4)).toEqual({x: -2, z: -2});
        expect(galleryGridPosition(3, 4)).toEqual({x: 2, z: 2});
        expect(galleryGridPosition(2, 3, 2)).toEqual({x: -1, z: 1});
        expect(gallerySpan(1)).toBe(4);
        expect(gallerySpan(4)).toBe(4);
        expect(gallerySpan(9, 2)).toBe(4);
        expect(gallerySpan(3)).toBe(4);
    });
});

describe('gallery camera', () => {
    let restore: (() => void) | null = null;
    afterEach(() => {
        restore?.();
        restore = null;
    });
    const scene = useScene();

    it('frames the grid and scales the ground to it', () => {
        const camera = new ArcRotateCamera('c', 0, 1.5, 5, Vector3.Zero(), scene.get());
        const ground = MeshBuilder.CreateGround('g', {width: 100, height: 100}, scene.get());
        fitGalleryView(camera, ground, 4);
        expect(camera.radius).toBe(12);
        expect(camera.beta).toBe(1.1);
        expect(camera.target.y).toBe(1.4);
        expect(ground.scaling.x).toBe(1);
        fitGalleryView(camera, ground, 100);
        expect(camera.radius).toBeCloseTo(36 * 0.85);
        expect(ground.scaling.z).toBe(1);
        fitGalleryView(camera, ground, 900);
        expect(ground.scaling.z).toBeCloseTo(1.32);
    });

    it('eases the camera onto an entry over animation frames', () => {
        const frames: FrameRequestCallback[] = [];
        let now = 0;
        const raf = jest.fn((cb: FrameRequestCallback) => {
            frames.push(cb);
            return frames.length;
        });
        const cancel = jest.fn();
        const animationGlobals = {
            requestAnimationFrame: (globalThis as {requestAnimationFrame?: unknown}).requestAnimationFrame,
            cancelAnimationFrame: (globalThis as {cancelAnimationFrame?: unknown}).cancelAnimationFrame,
        };
        Object.assign(globalThis, {requestAnimationFrame: raf, cancelAnimationFrame: cancel});
        restore = () => {
            Object.assign(globalThis, animationGlobals);
            (performance.now as jest.Mock).mockRestore();
        };
        jest.spyOn(performance, 'now').mockImplementation(() => now);

        const camera = new ArcRotateCamera('c', 0, 1, 20, Vector3.Zero(), scene.get());
        const entry = new TransformNode('e', scene.get());
        entry.position.set(10, 0, 0);
        focusGalleryEntry(camera, entry, 100);
        expect(raf).toHaveBeenCalledTimes(1);
        now = 50;
        frames.shift()!(now);
        expect(camera.target.x).toBeGreaterThan(0);
        expect(camera.target.x).toBeLessThan(10);
        expect(camera.radius).toBeLessThan(20);
        now = 100;
        frames.shift()!(now);
        expect(camera.target.x).toBeCloseTo(10);
        expect(camera.target.y).toBeCloseTo(1.4);
        expect(camera.radius).toBeCloseTo(12);
        expect(frames).toHaveLength(0);

        // A short hop keeps the radius; starting again cancels the frame in flight.
        const near = new TransformNode('n', scene.get());
        near.position.set(11, 0, 0);
        focusGalleryEntry(camera, near, 100);
        focusGalleryEntry(camera, near, 100);
        expect(cancel).toHaveBeenCalledTimes(1);
        now = 200;
        frames.pop()!(now);
        expect(camera.radius).toBeCloseTo(12);
        cancelGalleryCameraFocus();
        cancelGalleryCameraFocus();
        expect(cancel).toHaveBeenCalledTimes(1);
    });
});
