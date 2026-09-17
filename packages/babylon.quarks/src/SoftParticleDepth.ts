import {Camera} from '@babylonjs/core/Cameras/camera';
import {Vector4 as BVector4} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';

/**
 * How the texture handed to `BatchedRenderer.setDepthTexture` encodes depth.
 * The three entries match the three things Babylon's `DepthRenderer` can write,
 * selected through `Scene.enableDepthRenderer(camera, storeNonLinearDepth, force32bitsFloat, samplingMode, storeCameraSpaceZ)`.
 */
export enum DepthTextureMode {
    /**
     * What `scene.enableDepthRenderer()` writes by default: a depth metric that
     * is linear in view-space Z, normalised to [0, 1] between the camera's near
     * and far planes. Background pixels read 1.
     */
    LinearDepthMetric = 0,
    /**
     * `storeCameraSpaceZ: true` — view-space Z in world units. The most precise
     * option, but the depth map clears to 0 rather than "infinitely far", so set
     * `depthRenderer.clearColor = new Color4(camera.maxZ, 0, 0, 1)` or particles
     * fade out against the background.
     */
    CameraSpaceZ = 1,
    /** `storeNonLinearDepth: true` — the raw depth-buffer value. */
    NonLinearDepth = 2,
}

/**
 * Coefficients that turn a depth sample into the distance from the camera plane
 * to the nearest opaque surface, in world units and always positive (the
 * fragment shader compares it against `abs(viewPosition.z)`):
 *
 *     distance = params.z > 0.5 ? 1.0 / (params.x * sample + params.y)
 *                               : params.x * sample + params.y
 *
 * Everything is read back from the camera's own projection matrix rather than
 * rebuilt from near/far, so the result holds for perspective and orthographic
 * cameras, for the [-1, 1] (WebGL) and [0, 1] (WebGPU) clip-space conventions,
 * for reverse depth buffers and for right-handed scenes.
 *
 * @param scene scene whose active camera renders the particles
 * @param mode how the depth texture encodes depth
 * @param result vector written in place and returned
 */
export function computeDepthDecodeParams(scene: Scene, mode: DepthTextureMode, result: BVector4): BVector4 {
    const camera = scene.activeCamera;
    if (!camera) {
        // No camera to decode against: leave every sample reading as "nothing in
        // the way", which keeps particles at full opacity instead of blacking
        // them out.
        return result.copyFromFloats(0, Number.MAX_VALUE, 0, 0);
    }
    // View-space Z grows away from the camera in a left-handed scene and towards
    // it in a right-handed one; the shader works with a positive distance.
    const sign = scene.useRightHandedSystem ? -1 : 1;
    if (mode === DepthTextureMode.CameraSpaceZ) {
        return result.copyFromFloats(sign, 0, 0, 0);
    }

    const engine = scene.getEngine();
    // The camera's own matrix rather than the scene's: it is computed on demand,
    // so a bind that happens before the scene has built a transform matrix still
    // decodes correctly instead of reading undefined.
    const projection = camera.getProjectionMatrix().m;
    // Clip-space Z of a view-space point is m10 * z + m14 (the x and y columns
    // are zero for every projection Babylon builds), and clip-space W is z for a
    // perspective camera, 1 for an orthographic one.
    const m10 = projection[10];
    const m14 = projection[14];
    const isOrthographic = camera.mode === Camera.ORTHOGRAPHIC_CAMERA;

    // Slope and offset of the stored sample as a function of view-space Z, or,
    // for a perspective camera writing raw depth-buffer values, of 1 / Z.
    let slope: number;
    let offset: number;

    if (mode === DepthTextureMode.NonLinearDepth) {
        // gl_FragCoord.z, i.e. clip Z / clip W mapped into [0, 1].
        const ndcScale = engine.isNDCHalfZRange ? 1 : 0.5;
        const ndcOffset = engine.isNDCHalfZRange ? 0 : 0.5;
        if (isOrthographic) {
            slope = ndcScale * m10;
            offset = ndcScale * m14 + ndcOffset;
        } else {
            // sample = (ndcScale * m10 + ndcOffset) + ndcScale * m14 / z, so the
            // shader inverts a linear function of 1 / z.
            const c = ndcScale * m10 + ndcOffset;
            const d = ndcScale * m14;
            if (d === 0) {
                return result.copyFromFloats(0, Number.MAX_VALUE, 0, 0);
            }
            return result.copyFromFloats((sign * 1) / d, (sign * -c) / d, 1, 0);
        }
    } else {
        // Babylon's linear metric: (±clipZ + depthValues.x) / depthValues.y, with
        // the two depth values picked exactly as DepthRenderer picks them.
        let minZ: number;
        let maxZ: number;
        if (isOrthographic) {
            minZ = !engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : 1;
            maxZ = engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : 1;
        } else {
            minZ =
                engine.useReverseDepthBuffer && engine.isNDCHalfZRange
                    ? camera.minZ
                    : engine.isNDCHalfZRange
                      ? 0
                      : camera.minZ;
            maxZ = engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : camera.maxZ;
        }
        const denominator = minZ + maxZ;
        const reversed = engine.useReverseDepthBuffer ? -1 : 1;
        if (denominator === 0) {
            return result.copyFromFloats(0, Number.MAX_VALUE, 0, 0);
        }
        slope = (reversed * m10) / denominator;
        offset = (reversed * m14 + minZ) / denominator;
    }

    if (slope === 0) {
        return result.copyFromFloats(0, Number.MAX_VALUE, 0, 0);
    }
    // sample = slope * z + offset  ->  z = (sample - offset) / slope
    return result.copyFromFloats(sign / slope, (-sign * offset) / slope, 0, 0);
}
