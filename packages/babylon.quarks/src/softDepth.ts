import {Camera} from '@babylonjs/core/Cameras/camera';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {Vector4} from '@babylonjs/core/Maths/math.vector';

/**
 * What a soft-particle depth texture stores per pixel, so the shaders can turn it back into the
 * distance from the camera. These are the three outputs of Babylon's `DepthRenderer`:
 *
 * - `'linear'`: Babylon's default depth metric, `scene.enableDepthRenderer()`. Linear in view
 *   depth between the camera's near and far planes.
 * - `'nonLinear'`: the depth buffer value, `enableDepthRenderer(camera, true)`. This is what
 *   Unity's `_CameraDepthTexture` holds and what `LinearEyeDepth` undoes.
 * - `'viewZ'`: the view-space Z itself, `enableDepthRenderer(camera, false, true, sampling, true)`.
 *   Exact at any range and with an infinite far plane (`camera.maxZ = 0`), which the other two
 *   cannot represent; this is the closest match to Unreal's SceneDepth.
 *
 * Perspective and orthographic cameras, both NDC depth ranges (WebGL, WebGPU) and a reverse
 * depth buffer are all handled, from the camera drawing the particles. With a reverse depth buffer
 * and `'nonLinear'`, clear the depth renderer to 0 (`depthRenderer.clearColor.r = 0`): it clears
 * to 1 by default, which a reverse buffer reads as the near plane, so empty sky would fade every
 * particle in front of it. A packed `'viewZ'` cannot be decoded.
 */
export type SoftDepthEncoding = 'linear' | 'nonLinear' | 'viewZ';

/** How a depth texture given to {@link BatchedRenderer.setDepthTexture} is read. */
export interface DepthTextureOptions {
    /** What the texture stores. Defaults to the encoding of the `DepthRenderer` given, else `'linear'`. */
    encoding?: SoftDepthEncoding;
    /**
     * The depth is packed into the four 8-bit channels, as a `DepthRenderer` of type
     * `UNSIGNED_BYTE` writes it. Defaults to the `DepthRenderer`'s `isPacked`, else false.
     */
    packed?: boolean;
}

/** The depth texture a batch's soft particles read, and how. */
export interface DepthBinding {
    texture: BaseTexture;
    encoding: SoftDepthEncoding;
    packed: boolean;
}

/** The parts of a Babylon `DepthRenderer` read here, without importing it and its side effects. */
interface DepthRendererLike {
    getDepthMap(): BaseTexture;
    readonly isPacked: boolean;
}

/** True for a Babylon `DepthRenderer`, as opposed to a texture. */
export function isDepthRenderer(value: unknown): value is DepthRendererLike {
    return typeof (value as DepthRendererLike | null)?.getDepthMap === 'function';
}

/** The binding for a depth texture or `DepthRenderer`, with its encoding read off the renderer. */
export function depthBinding(depth: BaseTexture | DepthRendererLike, options: DepthTextureOptions = {}): DepthBinding {
    const binding = readBinding(depth, options);
    if (binding.packed && binding.encoding === 'viewZ') {
        // Packing keeps only the fraction of the value, which loses a view Z past 1 unit.
        throw new Error('[babylon.quarks] A packed view-Z depth cannot be decoded; use a float depth texture');
    }
    return binding;
}

function readBinding(depth: BaseTexture | DepthRendererLike, options: DepthTextureOptions): DepthBinding {
    if (isDepthRenderer(depth)) {
        // DepthRenderer keeps its encoding private; these are its constructor's own fields.
        const stored = depth as unknown as {_storeCameraSpaceZ?: boolean; _storeNonLinearDepth?: boolean};
        const detected: SoftDepthEncoding = stored._storeCameraSpaceZ
            ? 'viewZ'
            : stored._storeNonLinearDepth
              ? 'nonLinear'
              : 'linear';
        return {
            texture: depth.getDepthMap(),
            encoding: options.encoding ?? detected,
            packed: options.packed ?? depth.isPacked,
        };
    }
    return {texture: depth, encoding: options.encoding ?? 'linear', packed: options.packed ?? false};
}

/**
 * Writes the four coefficients the soft-particle shaders decode a depth sample `d` with:
 * view depth = |(x·d + y) / (z·d + w)|. Each encoding is a ratio of linear terms in `d` for
 * every projection Babylon builds, so one formula covers them all.
 *
 * @param camera - The camera the particles are drawn for, normally the one the depth was drawn for.
 * @param encoding - What the depth texture stores.
 * @param out - Receives the coefficients.
 */
export function softDepthParams(camera: Camera, encoding: SoftDepthEncoding, out: Vector4): Vector4 {
    if (encoding === 'viewZ') {
        return out.set(1, 0, 0, 1);
    }
    const engine = camera.getEngine();
    const reverse = engine.useReverseDepthBuffer;
    const halfZ = engine.isNDCHalfZRange;
    // A view-space point (0, 0, z) projects to clip z = z·m10 + m14, clip w = z·m11 + m15.
    const m = camera.getProjectionMatrix().m;
    const m10 = m[10];
    const m11 = m[11];
    const m14 = m[14];
    const m15 = m[15];
    if (encoding === 'linear') {
        // Babylon's depth metric, (±clip z + depthValues.x) / depthValues.y, solved for z.
        const ortho = camera.mode === Camera.ORTHOGRAPHIC_CAMERA;
        let near: number;
        let far: number;
        if (ortho) {
            near = !reverse && halfZ ? 0 : 1;
            far = reverse && halfZ ? 0 : 1;
        } else {
            near = reverse && halfZ ? camera.minZ : halfZ ? 0 : camera.minZ;
            far = reverse && halfZ ? 0 : camera.maxZ;
        }
        const sign = reverse ? -1 : 1;
        const span = near + far;
        return out.set((sign * span) / m10, (-sign * near - m14) / m10, 0, 1);
    }
    // The depth buffer value: NDC z = d on a half range, 2d - 1 on a full one; then
    // z = (m14 - ndc·m15) / (ndc·m11 - m10).
    const scale = halfZ ? 1 : 2;
    const offset = halfZ ? 0 : -1;
    return out.set(-scale * m15, m14 - offset * m15, scale * m11, offset * m11 - m10);
}

/**
 * The view depth the shaders read off a depth sample, for the coefficients of
 * {@link softDepthParams}. Nothing there (a `'viewZ'` sample of 0, or a sample at an infinite far
 * plane) reads as infinitely far, so the particle does not fade.
 */
export function decodeSoftDepth(sample: number, params: Vector4): number {
    const denominator = params.z * sample + params.w;
    const depth = Math.abs(denominator) > 1e-8 ? Math.abs((params.x * sample + params.y) / denominator) : 0;
    return depth > 0 ? depth : 1e30;
}
