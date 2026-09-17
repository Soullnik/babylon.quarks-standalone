import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Camera} from '@babylonjs/core/Cameras/camera';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3, Vector4} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {computeDepthDecodeParams, DepthTextureMode} from '../src/SoftParticleDepth';

/** Applies the decode the fragment shader performs on a depth sample. */
function decode(params: Vector4, sample: number): number {
    const value = params.x * sample + params.y;
    return params.z > 0.5 ? 1 / value : value;
}

/**
 * The sample Babylon's DepthRenderer stores for a point at `viewZ`, mirroring
 * depth.vertex.fx: vDepthMetric = (clipZ + depthValues.x) / depthValues.y.
 */
function storedLinearMetric(scene: Scene, camera: Camera, viewZ: number): number {
    const projection = scene.getProjectionMatrix().m;
    const clipZ = projection[10] * viewZ + projection[14];
    const minZ = camera.minZ;
    return (clipZ + minZ) / (minZ + camera.maxZ);
}

/** The sample stored with storeNonLinearDepth, i.e. gl_FragCoord.z. */
function storedNonLinearDepth(scene: Scene, viewZ: number): number {
    const projection = scene.getProjectionMatrix().m;
    const clipZ = projection[10] * viewZ + projection[14];
    return 0.5 * (clipZ / viewZ) + 0.5;
}

describe('computeDepthDecodeParams', () => {
    let engine: NullEngine;
    let scene: Scene;
    const params = new Vector4(0, 0, 0, 0);

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    const addCamera = (minZ = 1, maxZ = 100) => {
        const camera = new FreeCamera('cam', new Vector3(0, 0, -10), scene);
        camera.minZ = minZ;
        camera.maxZ = maxZ;
        scene.activeCamera = camera;
        scene.updateTransformMatrix();
        return camera;
    };

    it('decodes the default depth renderer metric back into world units', () => {
        const camera = addCamera();
        computeDepthDecodeParams(scene, DepthTextureMode.LinearDepthMetric, params);

        for (const viewZ of [1, 5, 10, 42, 100]) {
            expect(decode(params, storedLinearMetric(scene, camera, viewZ))).toBeCloseTo(viewZ, 3);
        }
    });

    it('decodes an empty depth map as the far plane, so nothing fades against the background', () => {
        const camera = addCamera();
        computeDepthDecodeParams(scene, DepthTextureMode.LinearDepthMetric, params);

        // DepthRenderer clears the map to 1.
        expect(decode(params, 1)).toBeCloseTo(camera.maxZ, 3);
    });

    it('decodes raw depth-buffer samples through the reciprocal form', () => {
        addCamera();
        computeDepthDecodeParams(scene, DepthTextureMode.NonLinearDepth, params);
        expect(params.z).toBe(1);

        for (const viewZ of [1, 5, 10, 42, 100]) {
            expect(decode(params, storedNonLinearDepth(scene, viewZ))).toBeCloseTo(viewZ, 3);
        }
    });

    it('passes camera-space Z through unchanged', () => {
        addCamera();
        computeDepthDecodeParams(scene, DepthTextureMode.CameraSpaceZ, params);
        expect(decode(params, 12.5)).toBeCloseTo(12.5, 6);
    });

    it('returns a positive distance in a right-handed scene', () => {
        scene.useRightHandedSystem = true;
        const camera = addCamera();
        computeDepthDecodeParams(scene, DepthTextureMode.LinearDepthMetric, params);

        // View-space Z runs negative in front of a right-handed camera.
        for (const distance of [5, 10, 42]) {
            expect(decode(params, storedLinearMetric(scene, camera, -distance))).toBeCloseTo(distance, 3);
        }
    });

    it('decodes an orthographic camera, whose metric is linear in clip space', () => {
        const camera = new ArcRotateCamera('ortho', 0, 1, 10, Vector3.Zero(), scene);
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        camera.orthoLeft = -5;
        camera.orthoRight = 5;
        camera.orthoTop = 5;
        camera.orthoBottom = -5;
        camera.minZ = 1;
        camera.maxZ = 100;
        scene.activeCamera = camera;
        scene.updateTransformMatrix();

        computeDepthDecodeParams(scene, DepthTextureMode.LinearDepthMetric, params);
        const projection = scene.getProjectionMatrix().m;
        for (const viewZ of [1, 20, 100]) {
            // An orthographic depth pass stores (clipZ + 1) / 2, since
            // DepthRenderer feeds it depthValues = (1, 2).
            const sample = (projection[10] * viewZ + projection[14] + 1) / 2;
            expect(decode(params, sample)).toBeCloseTo(viewZ, 3);
        }
    });

    it('reads as "nothing in the way" when the scene has no active camera', () => {
        scene.activeCamera = null;
        computeDepthDecodeParams(scene, DepthTextureMode.LinearDepthMetric, params);
        expect(decode(params, 0)).toBe(Number.MAX_VALUE);
        expect(decode(params, 1)).toBe(Number.MAX_VALUE);
    });
});
